
const supabase = require('../config/supabase');

const {
  getBusinessOwnerId,
  checkPermission,
} = require('../utils/businessAccess');


// ======================================
// GET DASHBOARD
// ======================================

const getDashboard = async (req, res) => {
  const startTime = Date.now();

  try {
    // ======================================
    // JWT USER
    // ======================================

    const user_id = req.user.id;

    // ======================================
    // CHECK TRANSACTION VIEW PERMISSION
    // ======================================

    const transactionPermission =
      await checkPermission(
        user_id,
        'can_view_transactions'
      );

    const canViewTransactions =
      transactionPermission.allowed;

    // ======================================
    // GET BUSINESS OWNER
    // ======================================

    const businessOwnerId =
      await getBusinessOwnerId(user_id);

    console.log(
      `👤 Dashboard User: ${user_id} → Business Owner: ${businessOwnerId}`
    );

    // ======================================
    // GET BUSINESS TRANSACTIONS
    // ======================================

    let transactions = [];

    if (canViewTransactions) {
      const queryStart = Date.now();

      const {
        data,
        error,
      } = await supabase
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

      const queryTime =
        Date.now() - queryStart;

      console.log(
        `🟢 Dashboard Supabase Query: ${queryTime}ms`
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

      transactions = data || [];
    }

    // ======================================
    // CUSTOMER RECEIVABLE
    // ======================================

    let totalCredit = 0;
    let totalCustomerPayment = 0;

    // ======================================
    // SUPPLIER PAYABLE
    // ======================================

    let totalPurchase = 0;
    let totalSupplierPayment = 0;

    transactions.forEach((transaction) => {
      const amount =
        Number(transaction.amount);

      // Customer credit
      if (transaction.type === 'credit') {
        totalCredit += amount;
      }

      // Customer payment
      if (
        transaction.type === 'payment' &&
        transaction.customer_id
      ) {
        totalCustomerPayment += amount;
      }

      // Supplier purchase
      if (transaction.type === 'purchase') {
        totalPurchase += amount;
      }

      // Supplier payment
      if (
        transaction.type === 'payment' &&
        transaction.supplier_id
      ) {
        totalSupplierPayment += amount;
      }
    });

    const totalReceivable =
      totalCredit -
      totalCustomerPayment;

    const totalPayable =
      totalPurchase -
      totalSupplierPayment;

    // ======================================
    // TODAY'S TRANSACTIONS
    // ======================================

    const today = new Date();

    const startOfDay =
      new Date(today);

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay =
      new Date(today);

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    const todayTransactions =
      transactions.filter(
        (transaction) => {
          const transactionDate =
            new Date(
              transaction.created_at
            );

          return (
            transactionDate >=
              startOfDay &&
            transactionDate <=
              endOfDay
          );
        }
      );

    // ======================================
    // RECENT TRANSACTIONS
    // ======================================

    const recentTransactions =
      transactions.slice(0, 10);

    // ======================================
    // RESPONSE
    // ======================================

    console.log(
      `⏱️ Dashboard Controller Total: ${
        Date.now() - startTime
      }ms`
    );

    return res.json({
      success: true,

      // ======================================
      // SUMMARY
      // ======================================

      summary: {
        total_receivable:
          canViewTransactions
            ? totalReceivable
            : 0,

        total_payable:
          canViewTransactions
            ? totalPayable
            : 0,
      },

      // ======================================
      // TODAY
      // ======================================

      today: {
        total_transactions:
          canViewTransactions
            ? todayTransactions.length
            : 0,

        transactions:
          canViewTransactions
            ? todayTransactions
            : [],
      },

      // ======================================
      // RECENT
      // ======================================

      recent_transactions:
        canViewTransactions
          ? recentTransactions
          : [],
    });

  } catch (error) {
    console.error(
      'Dashboard Error:',
      error
    );

    console.log(
      `❌ Dashboard Failed: ${
        Date.now() - startTime
      }ms`
    );

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// EXPORT
// ======================================

module.exports = {
  getDashboard,
};