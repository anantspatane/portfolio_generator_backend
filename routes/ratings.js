// routes/ratings.js - Updated with separate public and protected routes
const express = require('express');
const { admin } = require('../config/firebase');
const router = express.Router();

const db = admin.firestore();
const ratingsCollection = db.collection('ratings');
const portfoliosCollection = db.collection('portfolios');

// Middleware to check if route is public or protected
const isPublicRoute = (req) => {
  return req.originalUrl.includes('/api/public/ratings');
};

// POST /api/ratings - Add or update a rating (PROTECTED)
router.post('/', async (req, res) => {
  // This route is only accessible via /api/ratings (protected)
  if (isPublicRoute(req)) {
    return res.status(404).json({ message: 'Route not found' });
  }

  try {
    const userId = req.user.uid;
    const { portfolioId, rating, review } = req.body;

    // Validation
    if (!portfolioId || !rating) {
      return res.status(400).json({ message: 'Portfolio ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    // Check if portfolio exists
    const portfolioDoc = await portfoliosCollection.doc(portfolioId).get();
    if (!portfolioDoc.exists) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const portfolio = portfolioDoc.data();

    // Prevent users from rating their own portfolio
    if (portfolio.userId === userId) {
      return res.status(403).json({ message: 'Cannot rate your own portfolio' });
    }

    // Check if user has already rated this portfolio
    const existingRatingQuery = await ratingsCollection
      .where('portfolioId', '==', portfolioId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    let ratingDoc;
    let isUpdate = false;

    if (!existingRatingQuery.empty) {
      // Update existing rating
      ratingDoc = existingRatingQuery.docs[0];
      isUpdate = true;
      
      await ratingDoc.ref.update({
        rating,
        review: review || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Create new rating
      const newRating = {
        portfolioId,
        userId,
        rating,
        review: review || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      ratingDoc = await ratingsCollection.add(newRating);
    }

    // Update portfolio rating statistics
    await updatePortfolioRatingStats(portfolioId);

    // Get the created/updated rating with user info
    const updatedRatingDoc = isUpdate ? ratingDoc : await ratingDoc.get();
    const ratingData = updatedRatingDoc.data();

    // Get user info
    const userDoc = await db.collection('users').doc(userId).get();
    let userInfo = {};
    if (userDoc.exists) {
      const userData = userDoc.data();
      userInfo = {
        displayName: userData.displayName,
        photoURL: userData.photoURL
      };
    } else {
      try {
        const userRecord = await admin.auth().getUser(userId);
        userInfo = {
          displayName: userRecord.displayName || 'Anonymous User',
          photoURL: userRecord.photoURL
        };
      } catch (error) {
        userInfo = {
          displayName: 'Anonymous User',
          photoURL: null
        };
      }
    }

    const responseRating = {
      id: updatedRatingDoc.id,
      ...ratingData,
      user: userInfo
    };

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? 'Rating updated successfully' : 'Rating added successfully',
      rating: responseRating
    });

  } catch (error) {
    console.error('Error adding/updating rating:', error);
    res.status(500).json({ 
      message: 'Failed to add/update rating',
      error: error.message 
    });
  }
});

// GET /api/ratings/portfolio/:portfolioId - Get all ratings for a portfolio (PUBLIC & PROTECTED)
router.get('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // OPTION 1: Simple query without ordering (then sort in memory)
    let query = ratingsCollection.where('portfolioId', '==', portfolioId);

    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        ratings: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRatings: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    const allRatings = [];
    const userIds = new Set();

    snapshot.forEach(doc => {
      const ratingData = doc.data();
      allRatings.push({
        id: doc.id,
        ...ratingData,
        // Convert Firestore timestamp to JavaScript Date for sorting
        createdAtMs: ratingData.createdAt?.toMillis() || 0
      });
      userIds.add(ratingData.userId);
    });

    // Sort in memory
    allRatings.sort((a, b) => {
      if (sortBy === 'createdAt') {
        return sortOrder === 'desc' ? b.createdAtMs - a.createdAtMs : a.createdAtMs - b.createdAtMs;
      } else if (sortBy === 'rating') {
        return sortOrder === 'desc' ? b.rating - a.rating : a.rating - b.rating;
      }
      return 0;
    });

    // Get user information for all raters
    const userPromises = Array.from(userIds).map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return {
            uid,
            displayName: userData.displayName,
            photoURL: userData.photoURL
          };
        }
        
        const userRecord = await admin.auth().getUser(uid);
        return {
          uid,
          displayName: userRecord.displayName || 'Anonymous User',
          photoURL: userRecord.photoURL
        };
      } catch (error) {
        return {
          uid,
          displayName: 'Anonymous User',
          photoURL: null
        };
      }
    });

    const users = await Promise.all(userPromises);
    const userMap = users.reduce((acc, user) => {
      acc[user.uid] = user;
      return acc;
    }, {});

    // Add user info to ratings and remove the temporary createdAtMs field
    const ratingsWithUsers = allRatings.map(rating => {
      const { createdAtMs, ...cleanRating } = rating;
      return {
        ...cleanRating,
        user: {
          displayName: userMap[rating.userId]?.displayName || 'Anonymous User',
          photoURL: userMap[rating.userId]?.photoURL || null
        }
      };
    });

    // Apply pagination
    const offset = (pageNum - 1) * limitNum;
    const paginatedRatings = ratingsWithUsers.slice(offset, offset + limitNum);

    res.json({
      ratings: paginatedRatings,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(allRatings.length / limitNum),
        totalRatings: allRatings.length,
        hasNext: offset + limitNum < allRatings.length,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error fetching portfolio ratings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch ratings',
      error: error.message 
    });
  }
});

// ALTERNATIVE APPROACH: Use limit on the query and paginate differently
router.get('/portfolio/:portfolioId/alternative', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // For this approach, we'll need to create a simple index only on portfolioId
    // This avoids the composite index requirement but limits our sorting capabilities
    
    let query = ratingsCollection
      .where('portfolioId', '==', portfolioId)
      .limit(limitNum * pageNum); // Get all items up to current page

    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return res.json({
        ratings: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRatings: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    // Get total count for pagination
    const countSnapshot = await ratingsCollection
      .where('portfolioId', '==', portfolioId)
      .get();
    
    const totalRatings = countSnapshot.size;

    const allRatings = [];
    const userIds = new Set();

    snapshot.forEach(doc => {
      const ratingData = doc.data();
      allRatings.push({
        id: doc.id,
        ...ratingData,
        createdAtMs: ratingData.createdAt?.toMillis() || 0
      });
      userIds.add(ratingData.userId);
    });

    // Sort and paginate
    allRatings.sort((a, b) => {
      if (sortBy === 'createdAt') {
        return sortOrder === 'desc' ? b.createdAtMs - a.createdAtMs : a.createdAtMs - b.createdAtMs;
      } else if (sortBy === 'rating') {
        return sortOrder === 'desc' ? b.rating - a.rating : a.rating - b.rating;
      }
      return 0;
    });

    const offset = (pageNum - 1) * limitNum;
    const pageRatings = allRatings.slice(offset, offset + limitNum);

    // Get user information
    const userPromises = Array.from(userIds).map(async (uid) => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return { uid, displayName: userData.displayName, photoURL: userData.photoURL };
        }
        
        const userRecord = await admin.auth().getUser(uid);
        return {
          uid,
          displayName: userRecord.displayName || 'Anonymous User',
          photoURL: userRecord.photoURL
        };
      } catch (error) {
        return { uid, displayName: 'Anonymous User', photoURL: null };
      }
    });

    const users = await Promise.all(userPromises);
    const userMap = users.reduce((acc, user) => {
      acc[user.uid] = user;
      return acc;
    }, {});

    // Final ratings with user info
    const finalRatings = pageRatings.map(rating => {
      const { createdAtMs, ...cleanRating } = rating;
      return {
        ...cleanRating,
        user: {
          displayName: userMap[rating.userId]?.displayName || 'Anonymous User',
          photoURL: userMap[rating.userId]?.photoURL || null
        }
      };
    });

    res.json({
      ratings: finalRatings,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRatings / limitNum),
        totalRatings,
        hasNext: offset + limitNum < totalRatings,
        hasPrev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Error fetching portfolio ratings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch ratings',
      error: error.message 
    });
  }
});

// GET /api/ratings/my/:portfolioId - Get current user's rating for a portfolio (PROTECTED)
router.get('/my/:portfolioId', async (req, res) => {
  // This route is only accessible via /api/ratings (protected)
  if (isPublicRoute(req)) {
    return res.status(404).json({ message: 'Route not found' });
  }

  try {
    const userId = req.user.uid;
    const { portfolioId } = req.params;

    const snapshot = await ratingsCollection
      .where('portfolioId', '==', portfolioId)
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json({ hasRated: false, rating: null });
    }

    const doc = snapshot.docs[0];
    const rating = { id: doc.id, ...doc.data() };

    res.json({ hasRated: true, rating });

  } catch (error) {
    console.error('Error fetching user rating:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user rating',
      error: error.message 
    });
  }
});

// DELETE /api/ratings/:id - Delete a rating (PROTECTED)
router.delete('/:id', async (req, res) => {
  // This route is only accessible via /api/ratings (protected)
  if (isPublicRoute(req)) {
    return res.status(404).json({ message: 'Route not found' });
  }

  try {
    const userId = req.user.uid;
    const { id } = req.params;

    const doc = await ratingsCollection.doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Rating not found' });
    }

    const rating = doc.data();
    
    if (rating.userId !== userId) {
      return res.status(403).json({ 
        message: 'Access denied - You can only delete your own ratings' 
      });
    }

    await ratingsCollection.doc(id).delete();

    // Update portfolio rating statistics
    await updatePortfolioRatingStats(rating.portfolioId);

    res.json({ message: 'Rating deleted successfully' });

  } catch (error) {
    console.error('Error deleting rating:', error);
    res.status(500).json({ 
      message: 'Failed to delete rating',
      error: error.message 
    });
  }
});

// Helper function to update portfolio rating statistics
async function updatePortfolioRatingStats(portfolioId) {
  try {
    const ratingsSnapshot = await ratingsCollection
      .where('portfolioId', '==', portfolioId)
      .get();

    if (ratingsSnapshot.empty) {
      // No ratings, reset stats
      await portfoliosCollection.doc(portfolioId).update({
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0
        }
      });
      return;
    }

    let totalRating = 0;
    let totalRatings = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    ratingsSnapshot.forEach(doc => {
      const rating = doc.data().rating;
      totalRating += rating;
      totalRatings++;
      distribution[rating]++;
    });

    const averageRating = totalRating / totalRatings;

    await portfoliosCollection.doc(portfolioId).update({
      averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
      totalRatings,
      ratingDistribution: distribution,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

  } catch (error) {
    console.error('Error updating portfolio rating stats:', error);
    throw error;
  }
}

module.exports = router;