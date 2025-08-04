// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Initialize Firebase first
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();

// Import routes and middleware AFTER Firebase initialization
const portfolioRoutes = require('./routes/portfolios');
const ratingRoutes = require('./routes/ratings');
const userRoutes = require('./routes/users');
const publicPortfolioRoutes = require('./routes/public-portfolios');
const authMiddleware = require('./middleware/auth');
const { upload, uploadToCloudinary } = require('./config/cloudinary');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cloudinary image upload endpoint
app.post('/api/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: `portfolio-app/users/${req.user.uid}`,
      public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
    });

    res.json({
      message: 'File uploaded successfully',
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ 
      message: 'File upload failed', 
      error: error.message 
    });
  }
});

// Multiple file upload endpoint
app.post('/api/upload/multiple', authMiddleware, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Upload all files to Cloudinary
    const uploadPromises = req.files.map(file => 
      uploadToCloudinary(file.buffer, {
        folder: `portfolio-app/users/${req.user.uid}`,
        public_id: `${Date.now()}-${Math.round(Math.random() * 1E9)}`
      })
    );

    const results = await Promise.all(uploadPromises);

    res.json({
      message: 'Files uploaded successfully',
      files: results.map(result => ({
        url: result.url,
        publicId: result.publicId,
        width: result.width,
        height: result.height
      }))
    });
  } catch (error) {
    console.error('Multiple file upload error:', error);
    res.status(500).json({ 
      message: 'File upload failed', 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Portfolio Server is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/portfolios', authMiddleware, portfolioRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/public/portfolios', publicPortfolioRoutes);
app.use('/api/public/ratings', ratingRoutes);
app.use('/api/ratings', authMiddleware, ratingRoutes);

// Analytics endpoint for portfolio stats
app.get('/api/analytics/stats', authMiddleware, async (req, res) => {
  try {
    const { admin } = require('./config/firebase');
    const db = admin.firestore();
    
    // Get total portfolios count
    const portfoliosSnapshot = await db.collection('portfolios').get();
    const totalPortfolios = portfoliosSnapshot.size;
    
    // Get user's portfolio stats
    const userPortfolioSnapshot = await db.collection('portfolios')
      .where('userId', '==', req.user.uid)
      .get();
    
    let userStats = {
      hasPortfolio: false,
      views: 0,
      createdAt: null
    };
    
    if (!userPortfolioSnapshot.empty) {
      const userPortfolio = userPortfolioSnapshot.docs[0].data();
      userStats = {
        hasPortfolio: true,
        views: userPortfolio.views || 0,
        createdAt: userPortfolio.createdAt
      };
    }
    
    res.json({
      totalPortfolios,
      userStats
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch analytics',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      message: 'File too large. Maximum size is 10MB.' 
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ 
      message: 'Too many files. Maximum is 10 files per upload.' 
    });
  }
  
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'production' ? {} : err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Portfolio Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
});

module.exports = app;