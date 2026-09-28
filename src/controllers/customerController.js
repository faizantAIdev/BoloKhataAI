const supabase = require('../config/supabase');

const {
  getBusinessOwnerId,
  requirePermission,
} = require('../utils/businessAccess');


// ======================================
// GET ALL CUSTOMERS
// ======================================

const getCustomers = async (req, res) => {
  const startTime = Date.now();

  try {
    // JWT se authenticated user ID
    const user_id = req.user.id;

    // Check view permission
    await requirePermission(
      user_id,
      'can_view_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    console.log(
      `👤 User: ${user_id} → Business Owner: ${businessOwnerId}`
    );

    const queryStart = Date.now();

    const { data, error } = await supabase
      .from('customers')
      .select(
        'id, user_id, name, mobile, created_at'
      )
      .eq('user_id', businessOwnerId)
      .order('created_at', {
        ascending: false,
      });

    const queryTime = Date.now() - queryStart;

    console.log(
      `🟢 Customers Supabase Query: ${queryTime}ms`
    );

    if (error) {
      console.error('Supabase Error:', error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    console.log(
      `⏱️ Customers Controller Total: ${
        Date.now() - startTime
      }ms`
    );

    return res.json({
      success: true,
      customers: data,
    });

  } catch (error) {
    console.error(
      'Get Customers Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to view customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// CREATE CUSTOMER
// ======================================

const createCustomer = async (req, res) => {
  try {
    const {
      name,
      mobile,
    } = req.body;

    // JWT se user ID
    const user_id = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required',
      });
    }

    // Check manage permission
    await requirePermission(
      user_id,
      'can_manage_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const { data, error } = await supabase
      .from('customers')
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
        'Customer created successfully',
      customer: data,
    });

  } catch (error) {
    console.error(
      'Create Customer Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to manage customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// GET SINGLE CUSTOMER
// ======================================

const getCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT se user ID
    const user_id = req.user.id;

    // Check view permission
    await requirePermission(
      user_id,
      'can_view_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const {
      data,
      error,
    } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    return res.json({
      success: true,
      customer: data,
    });

  } catch (error) {
    console.error(
      'Get Customer Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to view customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// DELETE CUSTOMER
// ======================================

const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // JWT se user ID
    const user_id = req.user.id;

    // Check manage permission
    await requirePermission(
      user_id,
      'can_manage_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const {
      data: customer,
      error: customerError,
    } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
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
        message: 'Customer not found',
      });
    }

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('user_id', businessOwnerId);

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }

    return res.json({
      success: true,
      message:
        'Customer deleted successfully',
    });

  } catch (error) {
    console.error(
      'Delete Customer Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to manage customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// UPDATE CUSTOMER
// ======================================

const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      mobile,
    } = req.body;

    // JWT se user ID
    const user_id = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required',
      });
    }

    // Check manage permission
    await requirePermission(
      user_id,
      'can_manage_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    const {
      data,
      error,
    } = await supabase
      .from('customers')
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
        message: 'Customer not found',
      });
    }

    return res.json({
      success: true,
      message:
        'Customer updated successfully',
      customer: data,
    });

  } catch (error) {
    console.error(
      'Update Customer Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to manage customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// GET CUSTOMER LEDGER
// ======================================

const getCustomerLedger = async (req, res) => {
  const startTime = Date.now();

  try {
    const { id } = req.params;

    // JWT se user ID
    const user_id = req.user.id;

    // Check view permission
    await requirePermission(
      user_id,
      'can_view_customers'
    );

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    // ======================================
    // GET CUSTOMER
    // ======================================

    const customerStart = Date.now();

    const {
      data: customer,
      error: customerError,
    } = await supabase
      .from('customers')
      .select(
        'id, user_id, name, mobile'
      )
      .eq('id', id)
      .eq('user_id', businessOwnerId)
      .single();

    console.log(
      `🟢 Customer Info Query: ${
        Date.now() - customerStart
      }ms`
    );

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    // ======================================
    // GET TRANSACTIONS
    // ======================================

    const transactionStart = Date.now();

    const {
      data: transactions,
      error: transactionError,
    } = await supabase
      .from('transactions')
      .select('*')
      .eq('customer_id', id)
      .order('created_at', {
        ascending: false,
      });

    console.log(
      `🟢 Customer Transactions Query: ${
        Date.now() - transactionStart
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
    // CALCULATE BALANCE
    // ======================================

    let totalCredit = 0;
    let totalPayment = 0;

    transactions.forEach((transaction) => {
      const amount = Number(
        transaction.amount
      );

      if (transaction.type === 'credit') {
        totalCredit += amount;
      }

      if (transaction.type === 'payment') {
        totalPayment += amount;
      }
    });

    const balance =
      totalCredit - totalPayment;

    console.log(
      `⏱️ Customer Ledger Total: ${
        Date.now() - startTime
      }ms`
    );

    return res.json({
      success: true,

      customer: {
        id: customer.id,
        name: customer.name,
        mobile: customer.mobile,
      },

      summary: {
        total_credit: totalCredit,
        total_payment: totalPayment,
        balance,
      },

      transactions,
    });

  } catch (error) {
    console.error(
      'Get Customer Ledger Error:',
      error
    );

    if (error.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message:
          'You do not have permission to view customers',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


module.exports = {
  getCustomers,
  createCustomer,
  getCustomer,
  deleteCustomer,
  updateCustomer,
  getCustomerLedger,
};