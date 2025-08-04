// routes/public-portfolios.js
const express = require('express');
const { admin } = require('../config/firebase');
const router = express.Router();

const db = admin.firestore();
const portfoliosCollection = db.collection('portfolios');
const usersCollection = db.collection('users');

// GET /api/public/portfolios - Get all portfolios (no auth required)
router.get('/', async (req, res) => {
  try {
    const { skill, role } = req.query;
    
    const snapshot = await portfoliosCollection.orderBy('createdAt', 'desc').get();
    
    if (snapshot.empty) {
      return res.json([]);
    }

    const portfolios = [];
    const userIds = new Set();

    snapshot.forEach(doc => {
      const portfolioData = doc.data();
      portfolios.push({
        id: doc.id,
        ...portfolioData
      });
      userIds.add(portfolioData.userId);
    });

    // Fetch user details
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
          photoURL: userRecord.photoURL || null
        };
      } catch (error) {
        return {
          uid,
          email: 'Unknown',
          displayName: 'Unknown User',
          photoURL: null
        };
      }
    });

    const users = await Promise.all(userPromises);
    const userMap = users.reduce((acc, user) => {
      acc[user.uid] = user;
      return acc;
    }, {});

    // Combine portfolios with owner details
    let portfoliosWithOwners = portfolios.map(portfolio => ({
      ...portfolio,
      owner: {
        uid: portfolio.userId,
        email: userMap[portfolio.userId]?.email || 'Unknown',
        displayName: userMap[portfolio.userId]?.displayName || 'Unknown User',
        photoURL: userMap[portfolio.userId]?.photoURL || null
      }
    }));

    // Apply filters
    if (skill) {
      portfoliosWithOwners = portfoliosWithOwners.filter(portfolio => 
        portfolio.skills && portfolio.skills.some(s => 
          s.toLowerCase().includes(skill.toLowerCase())
        )
      );
    }

    if (role) {
      portfoliosWithOwners = portfoliosWithOwners.filter(portfolio => 
        portfolio.heroSection && portfolio.heroSection.title && 
        portfolio.heroSection.title.toLowerCase().includes(role.toLowerCase())
      );
    }

    res.json(portfoliosWithOwners);
  } catch (error) {
    console.error('Error fetching public portfolios:', error);
    res.status(500).json({ 
      message: 'Failed to fetch portfolios',
      error: error.message 
    });
  }
});

// GET /api/public/portfolios/:id - Get a specific portfolio (no auth required)
router.get('/:id', async (req, res) => {
  try {
    const portfolioId = req.params.id;

    const doc = await portfoliosCollection.doc(portfolioId).get();
    
    if (!doc.exists) {
      return res.status(404).json({ message: 'Portfolio not found' });
    }

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
          photoURL: userRecord.photoURL || null
        };
      }
    } catch (error) {
      owner = {
        email: 'Unknown',
        displayName: 'Unknown User',
        photoURL: null
      };
    }

    const portfolioWithOwner = {
      ...portfolio,
      owner: {
        uid: portfolio.userId,
        ...owner
      }
    };

    res.json(portfolioWithOwner);
  } catch (error) {
    console.error('Error fetching public portfolio:', error);
    res.status(500).json({ 
      message: 'Failed to fetch portfolio',
      error: error.message 
    });
  }
});

module.exports = router;
