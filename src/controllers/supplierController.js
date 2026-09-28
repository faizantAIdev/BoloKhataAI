const supabase = require('../config/supabase');

const {
  getBusinessOwnerId,
  requirePermission,
} = require('../utils/businessAccess');


// ======================================
// GET ALL SUPPLIERS
// ======================================

const getSuppliers = async (req, res) => {
  const startTime = Date.now();

  try {
    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_view_suppliers'
    );

    // Employee → Owner ID
    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    console.log(
      `👤 User: ${user_id} → Business Owner: ${businessOwnerId}`
    );

    const queryStart = Date.now();

    const { data, error } = await supabase
      .from('suppliers')
      .select(
        'id, user_id, name, mobile, created_at'
      )
      .eq('user_id', businessOwnerId)
      .order('created_at', {
        ascending: false,
      });

    const queryTime = Date.now() - queryStart;

    console.log(
      `🟢 Suppliers Supabase Query: ${queryTime}ms`
    );

    if (error) {
      console.error(
        'Supabase Error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    console.log(
      `⏱️ Suppliers Controller Total: ${
        Date.now() - startTime
      }ms`
    );

    return res.json({
      success: true,
      suppliers: data,
    });

  } catch (error) {
    console.error(
      'Get Suppliers Error:',
      error
    );

    console.log(
      `❌ Suppliers Controller Failed: ${
        Date.now() - startTime
      }ms`
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to view suppliers'
          : 'Server error',
    });
  }
};


// ======================================
// CREATE SUPPLIER
// ======================================

const createSupplier = async (req, res) => {
  try {
    const {
      name,
      mobile,
    } = req.body;

    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_manage_suppliers'
    );

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required',
      });
    }

    // Employee → Owner ID
    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const { data, error } = await supabase
      .from('suppliers')
      .insert([
        {
          user_id: businessOwnerId,
          name: name.trim(),
          mobile: mobile || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(
        'Supabase Error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message:
        'Supplier created successfully',
      supplier: data,
    });

  } catch (error) {
    console.error(
      'Create Supplier Error:',
      error
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to manage suppliers'
          : 'Server error',
    });
  }
};


// ======================================
// GET SINGLE SUPPLIER
// ======================================

const getSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_view_suppliers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const {
      data,
      error,
    } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    return res.json({
      success: true,
      supplier: data,
    });

  } catch (error) {
    console.error(
      'Get Supplier Error:',
      error
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to view suppliers'
          : 'Server error',
    });
  }
};


// ======================================
// UPDATE SUPPLIER
// ======================================

const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      mobile,
    } = req.body;

    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_manage_suppliers'
    );

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required',
      });
    }

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const {
      data,
      error,
    } = await supabase
      .from('suppliers')
      .update({
        name: name.trim(),
        mobile: mobile || null,
      })
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .select()
      .single();

    if (error || !data) {
      console.error(
        'Supabase Error:',
        error
      );

      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    return res.json({
      success: true,
      message:
        'Supplier updated successfully',
      supplier: data,
    });

  } catch (error) {
    console.error(
      'Update Supplier Error:',
      error
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to manage suppliers'
          : 'Server error',
    });
  }
};


// ======================================
// DELETE SUPPLIER
// ======================================

const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_manage_suppliers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    // Check supplier belongs to business
    const {
      data: supplier,
      error: supplierError,
    } = await supabase
      .from('suppliers')
      .select('id')
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .maybeSingle();

    if (supplierError) {
      return res.status(500).json({
        success: false,
        message: supplierError.message,
      });
    }

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      .eq('user_id', businessOwnerId);

    if (error) {
      console.error(
        'Supabase Error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message:
        'Supplier deleted successfully',
    });

  } catch (error) {
    console.error(
      'Delete Supplier Error:',
      error
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to manage suppliers'
          : 'Server error',
    });
  }
};


// ======================================
// GET SUPPLIER LEDGER
// ======================================

const getSupplierLedger = async (req, res) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;

    // JWT se authenticated user ID
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_view_suppliers'
    );

    // Employee → Owner ID
    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    console.log(
      `👤 User: ${user_id} → Business Owner: ${businessOwnerId}`
    );

    // ======================================
    // 1. SUPPLIER INFO
    // ======================================

    const supplierQueryStart = Date.now();

    const {
      data: supplier,
      error: supplierError,
    } = await supabase
      .from('suppliers')
      .select(
        'id, user_id, name, mobile'
      )
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .single();

    console.log(
      `🟢 Supplier Info Query: ${
        Date.now() - supplierQueryStart
      }ms`
    );

    if (supplierError || !supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found',
      });
    }

    // ======================================
    // 2. TRANSACTIONS
    // ======================================

    const transactionQueryStart = Date.now();

    const {
      data: transactions,
      error: transactionError,
    } = await supabase
      .from('transactions')
      .select('*')
      .eq('supplier_id', id)
      .order('created_at', {
        ascending: false,
      });

    console.log(
      `🟢 Supplier Transactions Query: ${
        Date.now() - transactionQueryStart
      }ms`
    );

    if (transactionError) {
      console.error(
        'Supabase Error:',
        transactionError
      );

      return res.status(500).json({
        success: false,
        message: transactionError.message,
      });
    }

    // ======================================
    // 3. CALCULATE BALANCE
    // ======================================

    let totalPurchase = 0;
    let totalPayment = 0;

    transactions.forEach((transaction) => {
      const amount = Number(
        transaction.amount
      );

      if (transaction.type === 'purchase') {
        totalPurchase += amount;
      }

      if (transaction.type === 'payment') {
        totalPayment += amount;
      }
    });

    const balance =
      totalPurchase - totalPayment;

    // ======================================
    // 4. TOTAL TIME
    // ======================================

    console.log(
      `⏱️ Supplier Controller Total: ${
        Date.now() - startTime
      }ms`
    );

    return res.json({
      success: true,

      supplier: {
        id: supplier.id,
        name: supplier.name,
        mobile: supplier.mobile,
      },

      summary: {
        total_purchase: totalPurchase,
        total_payment: totalPayment,
        balance,
      },

      transactions,
    });

  } catch (error) {
    console.error(
      'Get Supplier Ledger Error:',
      error
    );

    console.log(
      `❌ Supplier Controller Failed: ${
        Date.now() - startTime
      }ms`
    );

    return res.status(
      error.statusCode || 500
    ).json({
      success: false,
      message:
        error.statusCode === 403
          ? 'You do not have permission to view suppliers'
          : 'Server error',
    });
  }
};


module.exports = {
  getSuppliers,
  createSupplier,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  getSupplierLedger,
};