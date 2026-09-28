const express = require('express');

const {
  getCustomers,
  createCustomer,
  getCustomer,
  deleteCustomer,
  updateCustomer,
  getCustomerLedger,
} = require('../controllers/customerController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();


// GET all customers
router.get(
  '/',
  authMiddleware,
  getCustomers
);


// CREATE customer
router.post(
  '/',
  authMiddleware,
  createCustomer
);


// GET single customer
router.get(
  '/:id',
  authMiddleware,
  getCustomer
);


// DELETE customer
router.delete(
  '/:id',
  authMiddleware,
  deleteCustomer
);


// UPDATE customer
router.put(
  '/:id',
  authMiddleware,
  updateCustomer
);


// GET customer ledger
router.get(
  '/:id/transactions',
  authMiddleware,
  getCustomerLedger
);


module.exports = router;