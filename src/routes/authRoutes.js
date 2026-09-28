const express = require('express');

const {
  sendOtp,
  verifyOtp,
  logout,
  setupBusiness,
} = require('../controllers/authController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ======================================
// PUBLIC AUTH ROUTES
// ======================================

router.post('/send-otp', sendOtp);

router.post('/verify-otp', verifyOtp);


// ======================================
// PROTECTED ROUTES
// JWT REQUIRED
// ======================================

router.post(
  '/logout',
  authMiddleware,
  logout
);

router.put(
  '/business-setup',
  authMiddleware,
  setupBusiness
);

module.exports = router;