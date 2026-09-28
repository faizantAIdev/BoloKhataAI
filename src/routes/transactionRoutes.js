const express = require('express');

const {
  getTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} = require('../controllers/transactionController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();


// ======================================
// GET ALL TRANSACTIONS
// ======================================

router.get(
  '/',
  authMiddleware,
  getTransactions
);


// ======================================
// CREATE TRANSACTION
// ======================================

router.post(
  '/',
  authMiddleware,
  createTransaction
);


// ======================================
// GET SINGLE TRANSACTION
// ======================================

router.get(
  '/:id',
  authMiddleware,
  getTransaction
);


// ======================================
// UPDATE TRANSACTION
// ======================================

router.put(
  '/:id',
  authMiddleware,
  updateTransaction
);


// ======================================
// DELETE TRANSACTION
// ======================================

router.delete(
  '/:id',
  authMiddleware,
  deleteTransaction
);


module.exports = router;