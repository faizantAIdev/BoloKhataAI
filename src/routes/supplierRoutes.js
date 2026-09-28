const express = require('express');

const {
  getSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierLedger,
} = require('../controllers/supplierController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();


// ======================================
// GET ALL SUPPLIERS
// ======================================

router.get(
  '/',
  authMiddleware,
  getSuppliers
);


// ======================================
// GET SUPPLIER LEDGER
// ======================================

router.get(
  '/:id/transactions',
  authMiddleware,
  getSupplierLedger
);


// ======================================
// CREATE SUPPLIER
// ======================================

router.post(
  '/',
  authMiddleware,
  createSupplier
);


// ======================================
// GET SINGLE SUPPLIER
// ======================================

router.get(
  '/:id',
  authMiddleware,
  getSupplier
);


// ======================================
// UPDATE SUPPLIER
// ======================================

router.put(
  '/:id',
  authMiddleware,
  updateSupplier
);


// ======================================
// DELETE SUPPLIER
// ======================================

router.delete(
  '/:id',
  authMiddleware,
  deleteSupplier
);


module.exports = router;