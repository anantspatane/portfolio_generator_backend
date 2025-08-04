// routes/portfolios.js
const express = require('express');
const { admin } = require('../config/firebase');
const router = express.Router();

const db = admin.firestore();
const portfoliosCollection = db.collection('portfolios');
const usersCollection = db.collection('users');

// GET /api/portfolios - Get all portfolios with owner details
router.get('/', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { myPortfolios, skill, role, featured } = req.query;
    let query = portfoliosCollection;

    // Filter by current user if requested
    if (myPortfolios === 'true') {
      query = query.where('userId', '==', userId);
    }

    // Filter by featured portfolios
    if (featured === 'true') {
      query = query.where('featured', '==', true);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
      return res.json([]);
    }

    const portfolios = [];
    const userIds = new Set();

    // Collect all portfolio data and unique user IDs
    snapshot.forEach(doc => {
      const portfolioData = doc.data();
      portfolios.push({
        id: doc.id,
        ...portfolioData
      });
      userIds.add(portfolioData.userId);
    });

    // Fetch user details for all portfolio owners
    const userPromises = Array.from(userIds).map(async (uid) => {
      try {
        const userDoc = await usersCollection.doc(uid).get();
        if (userDoc.exists) {
          return { uid, ...userDoc.data() };
        }
        const userRecord = await admin.auth().getUser(uid);
        return {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || 'Anonymous User',
          phone: userRecord.phoneNumber || null,
          photoURL: userRecord.photoURL || null
        };
      } catch (error) {
        console.error(`Error fetching user ${uid}:`, error);
        return {
          uid,
          email: 'Unknown',
          displayName: 'Unknown User',
          phone: null,
          photoURL: null
        };
      }
    });

    const users = await Promise.all(userPromises);
    const userMap = users.reduce((acc, user) => {
      acc[user.uid] = user;
      return acc;
    }, {});

    // Combine portfolios with owner details and apply filters
    let portfoliosWithOwners = portfolios.map(portfolio => ({
      ...portfolio,
      owner: {
        uid: portfolio.userId,
        email: userMap[portfolio.userId]?.email || 'Unknown',
        displayName: userMap[portfolio.userId]?.displayName || 'Unknown User',
        phone: userMap[portfolio.userId]?.phone || null,
        photoURL: userMap[portfolio.userId]?.photoURL || null
      },
      isOwnPortfolio: portfolio.userId === userId
    }));

    // Apply skill filter
    if (skill) {
      portfoliosWithOwners = portfoliosWithOwners.filter(portfolio => 
        portfolio.skills && portfolio.skills.some(s => 
          s.toLowerCase().includes(skill.toLowerCase())
        )
      );
    }

    // Apply role filter
    if (role) {
      portfoliosWithOwners = portfoliosWithOwners.filter(portfolio => 
        portfolio.heroSection && portfolio.heroSection.title && 
        portfolio.heroSection.title.toLowerCase().includes(role.toLowerCase())
      );
    }

    res.json(portfoliosWithOwners);
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    res.status(500).json({ 
      message: 'Failed to fetch portfolios',
      error: error.message 
    });
  }
});

// GET /api/portfolios/my - Get current user's portfolio
router.get('/my', async (req, res) => {
  try {
    const userId = req.user.uid;
    
    const snapshot = await portfoliosCollection
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ 
        message: 'No portfolio found',
        hasPortfolio: false 
      });
    }

    const doc = snapshot.docs[0];
    const portfolio = { id: doc.id, ...doc.data() };

    // Get owner details
    let owner;
    try {
      const userDoc = await usersCollection.doc(portfolio.userId).get();
      if (userDoc.exists) {
        owner = userDoc.data();
      } else {
        const userRecord = await admin.auth().getUser(portfolio.userId);
        owner = {
          email: userRecord.email,
          displayName: userRecord.displayName || 'Anonymous User',
          phone: userRecord.phoneNumber || null,
          photoURL: userRecord.photoURL || null
        };
      }
    } catch (error) {
      owner = {
        email: req.user.email,
        displayName: 'Anonymous User',
        phone: null,
        photoURL: null
      };
    }

    const portfolioWithOwner = {
      ...portfolio,
      owner: {
        uid: portfolio.userId,
        ...owner
      },
      isOwnPortfolio: true,
      hasPortfolio: true
    };

    res.json(portfolioWithOwner);
  } catch (error) {
    console.error('Error fetching user portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to fetch portfolio',
      error: error.message 
    });
  }
});

// POST /api/portfolios - Create a new portfolio (only if user doesn't have one)
router.post('/', async (req, res) => {
  try {
    const userId = req.user.uid;
    const userEmail = req.user.email;
    const portfolioData = req.body;

    // Check if user already has a portfolio
    const existingPortfolio = await portfoliosCollection
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!existingPortfolio.empty) {
      return res.status(409).json({
        message: 'You already have a portfolio. You can only create one portfolio per account.',
        hasPortfolio: true
      });
    }

    // Validate required fields
    const requiredFields = ['templateId', 'heroSection', 'aboutMe'];
    const missingFields = requiredFields.filter(field => !portfolioData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields',
        missingFields
      });
    }

    // Get or create user profile
    let userProfile;
    try {
      const userDoc = await usersCollection.doc(userId).get();
      if (userDoc.exists) {
        userProfile = userDoc.data();
      } else {
        const userRecord = await admin.auth().getUser(userId);
        userProfile = {
          email: userRecord.email,
          displayName: userRecord.displayName || portfolioData.heroSection?.name || 'Anonymous User',
          phone: userRecord.phoneNumber || null,
          photoURL: userRecord.photoURL || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await usersCollection.doc(userId).set(userProfile);
      }
    } catch (error) {
      console.error('Error handling user profile:', error);
      userProfile = {
        email: userEmail,
        displayName: portfolioData.heroSection?.name || 'Anonymous User',
        phone: null,
        photoURL: null
      };
    }

    // Add user ID, timestamps, and default values
    const newPortfolio = {
      ...portfolioData,
      userId,
      slug: `${portfolioData.heroSection.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      featured: false,
      views: 0,
      status: 'published', // draft, published
      seoTitle: portfolioData.heroSection.name,
      seoDescription: portfolioData.heroSection.tagline,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await portfoliosCollection.add(newPortfolio);

    // Get the created document to return it with owner details
    const createdDoc = await docRef.get();
    const createdPortfolio = {
      id: createdDoc.id,
      ...createdDoc.data(),
      owner: {
        uid: userId,
        email: userProfile.email,
        displayName: userProfile.displayName,
        phone: userProfile.phone,
        photoURL: userProfile.photoURL
      },
      isOwnPortfolio: true,
      hasPortfolio: true
    };

    res.status(201).json(createdPortfolio);
  } catch (error) {
    console.error('Error creating portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to create portfolio',
      error: error.message 
    });
  }
});

// GET /api/portfolios/:id - Get a specific portfolio with owner details
router.get('/:id', async (req, res) => {
  try {
    const portfolioId = req.params.id;
    const userId = req.user.uid;

    const doc = await portfoliosCollection.doc(portfolioId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const portfolio = { id: doc.id, ...doc.data() };

    // Increment view count if it's not the owner viewing
    if (portfolio.userId !== userId) {
      await portfoliosCollection.doc(portfolioId).update({
        views: admin.firestore.FieldValue.increment(1)
      });
      portfolio.views = (portfolio.views || 0) + 1;
    }

    // Get owner details
    let owner;
    try {
      const userDoc = await usersCollection.doc(portfolio.userId).get();
      if (userDoc.exists) {
        owner = userDoc.data();
      } else {
        const userRecord = await admin.auth().getUser(portfolio.userId);
        owner = {
          email: userRecord.email,
          displayName: userRecord.displayName || 'Anonymous User',
          phone: userRecord.phoneNumber || null,
          photoURL: userRecord.photoURL || null
        };
      }
    } catch (error) {
      owner = {
        email: 'Unknown',
        displayName: 'Unknown User',
        phone: null,
        photoURL: null
      };
    }

    const portfolioWithOwner = {
      ...portfolio,
      owner: {
        uid: portfolio.userId,
        ...owner
      },
      isOwnPortfolio: portfolio.userId === userId
    };

    res.json(portfolioWithOwner);
  } catch (error) {
    console.error('Error fetching portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to fetch portfolio',
      error: error.message 
    });
  }
});

// PUT /api/portfolios/:id - Update a portfolio (only owner can update)
router.put('/:id', async (req, res) => {
  try {
    const portfolioId = req.params.id;
    const userId = req.user.uid;
    const updateData = req.body;

    // Check if the portfolio exists and belongs to the user
    const doc = await portfoliosCollection.doc(portfolioId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const portfolio = doc.data();
    
    if (portfolio.userId !== userId) {
      return res.status(403).json({ 
        message: 'Access denied - You can only update your own portfolio' 
      });
    }

    // Update the portfolio
    const updatedData = {
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Update slug if name changed
    if (updateData.heroSection?.name && updateData.heroSection.name !== portfolio.heroSection?.name) {
      updatedData.slug = `${updateData.heroSection.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    }

    await portfoliosCollection.doc(portfolioId).update(updatedData);

    // Get the updated document with owner details
    const updatedDoc = await portfoliosCollection.doc(portfolioId).get();
    const userDoc = await usersCollection.doc(userId).get();
    const userProfile = userDoc.exists ? userDoc.data() : {};

    const updatedPortfolio = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      owner: {
        uid: userId,
        email: userProfile.email || req.user.email,
        displayName: userProfile.displayName || 'Anonymous User',
        phone: userProfile.phone || null,
        photoURL: userProfile.photoURL || null
      },
      isOwnPortfolio: true
    };

    res.json(updatedPortfolio);
  } catch (error) {
    console.error('Error updating portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to update portfolio',
      error: error.message 
    });
  }
});

// DELETE /api/portfolios/:id - Delete a portfolio (only owner can delete)
router.delete('/:id', async (req, res) => {
  try {
    const portfolioId = req.params.id;
    const userId = req.user.uid;

    // Check if the portfolio exists and belongs to the user
    const doc = await portfoliosCollection.doc(portfolioId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

    const portfolio = doc.data();
    
    if (portfolio.userId !== userId) {
      return res.status(403).json({ 
        message: 'Access denied - You can only delete your own portfolio' 
      });
    }

    // TODO: Delete associated images from Cloudinary
    // This would require tracking image public IDs in the portfolio data

    // Delete the portfolio
    await portfoliosCollection.doc(portfolioId).delete();

    res.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to delete portfolio',
      error: error.message 
    });
  }
});

module.exports = router;