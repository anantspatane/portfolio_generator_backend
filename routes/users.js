// routes/users.js
const express = require('express');
const { admin } = require('../config/firebase');
const router = express.Router();

const db = admin.firestore();
const usersCollection = db.collection('users');

// GET /api/users/profile - Get current user's profile
router.get('/profile', async (req, res) => {
  try {
    const userDoc = await usersCollection.doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      // Create profile from Auth data
      const userRecord = await admin.auth().getUser(req.user.uid);
      const initialProfile = {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName || 'Anonymous User',
        photoURL: userRecord.photoURL || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await usersCollection.doc(req.user.uid).set(initialProfile);
      return res.json(initialProfile);
    }

    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile' });
  }
});

// PUT /api/users/profile - Update user profile
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.uid;
    const { displayName, photoURL } = req.body;

    // Update Firebase Auth
    const authUpdatePayload = {};
    if (displayName) authUpdatePayload.displayName = displayName;
    if (photoURL) authUpdatePayload.photoURL = photoURL;

    if (Object.keys(authUpdatePayload).length > 0) {
      await admin.auth().updateUser(userId, authUpdatePayload);
    }

    // Update Firestore
    const firestoreUpdatePayload = {
      email: req.user.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (displayName) firestoreUpdatePayload.displayName = displayName;
    if (photoURL) firestoreUpdatePayload.photoURL = photoURL;

    await usersCollection.doc(userId).set(firestoreUpdatePayload, { merge: true });

    res.json({ message: 'Profile updated successfully', profile: firestoreUpdatePayload });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
});

module.exports = router;