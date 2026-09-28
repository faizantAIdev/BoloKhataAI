
const supabase = require('../config/supabase');

const {
  getBusinessOwnerId,
  requirePermission,
} = require('../utils/businessAccess');


// ======================================
// GET ALL TRANSACTIONS
// ======================================

const getTransactions = async (req, res) => {
  try {
    // JWT authenticated user
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_view_transactions'
    );

    // Employee → Owner ID
    const businessOwnerId = await getBusinessOwnerId(user_id);

    console.log(
      `👤 User: ${user_id} → Business Owner: ${businessOwnerId}`
    );

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customers (
          id,
          name,
          mobile
        ),
        suppliers (
          id,
          name,
          mobile
        )
      `)
      .eq('user_id', businessOwnerId)
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error('Supabase Error:', error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    res.json({
      success: true,
      transactions: data,
    });

  } catch (error) {
    console.error('Get Transactions Error:', error);

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to view transactions',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// CREATE TRANSACTION
// ======================================

const createTransaction = async (req, res) => {
  try {
    const {
      customer_id,
      supplier_id,
      type,
      amount,
      description,
    } = req.body;

    // ======================================
    // JWT USER
    // ======================================

    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_create_transactions'
    );

    // Employee → Owner ID
    const businessOwnerId = await getBusinessOwnerId(user_id);

    // ======================================
    // ALLOWED TYPES
    // ======================================

    const allowedTypes = [
      'credit',
      'payment',
      'purchase',
      'income',
      'expense',
    ];

    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid transaction type. Use credit, payment, purchase, income or expense',
      });
    }

    // ======================================
    // AMOUNT
    // ======================================

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    // ======================================
    // CREDIT → CUSTOMER REQUIRED
    // ======================================

    if (type === 'credit') {
      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: 'customer_id is required for credit',
        });
      }
    }

    // ======================================
    // PAYMENT → CUSTOMER OR SUPPLIER
    // ======================================

    if (type === 'payment') {
      if (!customer_id && !supplier_id) {
        return res.status(400).json({
          success: false,
          message:
            'customer_id or supplier_id is required for payment',
        });
      }

      if (customer_id && supplier_id) {
        return res.status(400).json({
          success: false,
          message:
            'Use either customer_id or supplier_id for payment, not both',
        });
      }
    }

    // ======================================
    // PURCHASE → SUPPLIER REQUIRED
    // ======================================

    if (type === 'purchase') {
      if (!supplier_id) {
        return res.status(400).json({
          success: false,
          message: 'supplier_id is required for purchase',
        });
      }
    }

    // ======================================
    // VERIFY CUSTOMER BELONGS TO BUSINESS
    // ======================================

    if (customer_id) {
      const {
        data: customer,
        error: customerError,
      } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customer_id)
        .eq('user_id', businessOwnerId)
        .maybeSingle();

      if (customerError) {
        return res.status(500).json({
          success: false,
          message: customerError.message,
        });
      }

      if (!customer) {
        return res.status(404).json({
          success: false,
          message:
            'Customer not found in this business',
        });
      }
    }

    // ======================================
    // VERIFY SUPPLIER BELONGS TO BUSINESS
    // ======================================

    if (supplier_id) {
      const {
        data: supplier,
        error: supplierError,
      } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', supplier_id)
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
          message:
            'Supplier not found in this business',
        });
      }
    }

    // ======================================
    // CREATE TRANSACTION
    // ======================================

    const { data, error } = await supabase
      .from('transactions')
      .insert([
        {
          // NEVER trust user_id from frontend
          // Always use authenticated business owner
          user_id: businessOwnerId,

          customer_id: customer_id || null,
          supplier_id: supplier_id || null,
          type,
          amount: Number(amount),
          description: description || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase Error:', error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      transaction: data,
    });

  } catch (error) {
    console.error(
      'Create Transaction Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to create transactions',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// GET SINGLE TRANSACTION
// ======================================

const getTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT user
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_view_transactions'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customers (
          id,
          name,
          mobile
        ),
        suppliers (
          id,
          name,
          mobile
        )
      `)
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      transaction: data,
    });

  } catch (error) {
    console.error(
      'Get Transaction Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to view transactions',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// UPDATE TRANSACTION
// ======================================

const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      type,
      amount,
      description,
      customer_id,
      supplier_id,
    } = req.body;

    // ======================================
    // JWT USER
    // ======================================

    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_create_transactions'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    // ======================================
    // ALLOWED TYPES
    // ======================================

    const allowedTypes = [
      'credit',
      'payment',
      'purchase',
      'income',
      'expense',
    ];

    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type',
      });
    }

    // ======================================
    // AMOUNT
    // ======================================

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0',
      });
    }

    // ======================================
    // CREDIT
    // ======================================

    if (type === 'credit' && !customer_id) {
      return res.status(400).json({
        success: false,
        message:
          'customer_id is required for credit',
      });
    }

    // ======================================
    // PAYMENT
    // ======================================

    if (type === 'payment') {
      if (!customer_id && !supplier_id) {
        return res.status(400).json({
          success: false,
          message:
            'customer_id or supplier_id is required for payment',
        });
      }

      if (customer_id && supplier_id) {
        return res.status(400).json({
          success: false,
          message:
            'Use either customer_id or supplier_id for payment, not both',
        });
      }
    }

    // ======================================
    // PURCHASE
    // ======================================

    if (type === 'purchase' && !supplier_id) {
      return res.status(400).json({
        success: false,
        message:
          'supplier_id is required for purchase',
      });
    }

    // ======================================
    // VERIFY CUSTOMER
    // ======================================

    if (customer_id) {
      const {
        data: customer,
        error: customerError,
      } = await supabase
        .from('customers')
        .select('id')
        .eq('id', customer_id)
        .eq('user_id', businessOwnerId)
        .maybeSingle();

      if (customerError) {
        return res.status(500).json({
          success: false,
          message: customerError.message,
        });
      }

      if (!customer) {
        return res.status(404).json({
          success: false,
          message:
            'Customer not found in this business',
        });
      }
    }

    // ======================================
    // VERIFY SUPPLIER
    // ======================================

    if (supplier_id) {
      const {
        data: supplier,
        error: supplierError,
      } = await supabase
        .from('suppliers')
        .select('id')
        .eq('id', supplier_id)
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
          message:
            'Supplier not found in this business',
        });
      }
    }

    // ======================================
    // UPDATE
    // ======================================

    const { data, error } = await supabase
      .from('transactions')
      .update({
        customer_id: customer_id || null,
        supplier_id: supplier_id || null,
        type,
        amount: Number(amount),
        description: description || null,
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
        message: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      message:
        'Transaction updated successfully',
      transaction: data,
    });

  } catch (error) {
    console.error(
      'Update Transaction Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to update transactions',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// DELETE TRANSACTION
// ======================================

const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT user
    const user_id = req.user.id;

    await requirePermission(
      user_id,
      'can_delete_transactions'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    // ======================================
    // VERIFY TRANSACTION
    // ======================================

    const {
      data: transaction,
      error: transactionError,
    } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .maybeSingle();

    if (transactionError) {
      return res.status(500).json({
        success: false,
        message:
          transactionError.message,
      });
    }

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    // ======================================
    // DELETE
    // ======================================

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', businessOwnerId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    res.json({
      success: true,
      message:
        'Transaction deleted successfully',
    });

  } catch (error) {
    console.error(
      'Delete Transaction Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to delete transactions',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// EXPORT
// ======================================

module.exports = {
  getTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
};
