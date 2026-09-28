const supabase = require('../config/supabase');
const jwt = require('jsonwebtoken');

// ======================================
// TEMPORARY OTP STORAGE
// ======================================

const otpStore = new Map();


// ======================================
// JWT TOKEN GENERATOR
// ======================================

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};


// ======================================
// SEND OTP
// ======================================

const sendOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
      });
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10 digit mobile number',
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Store OTP
    otpStore.set(mobile, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Development only
    console.log('================================');
    console.log(`OTP for ${mobile}: ${otp}`);
    console.log('================================');

    return res.json({
      success: true,
      message: 'OTP generated successfully',

      // DEVELOPMENT ONLY
      otp,
    });

  } catch (error) {
    console.error('Send OTP Error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// VERIFY OTP
// ======================================

const verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required',
      });
    }

    // ======================================
    // GET STORED OTP
    // ======================================

    const storedOtp = otpStore.get(mobile);

    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired',
      });
    }

    // ======================================
    // CHECK EXPIRY
    // ======================================

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(mobile);

      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // ======================================
    // CHECK OTP
    // ======================================

    if (storedOtp.otp !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // OTP verified
    otpStore.delete(mobile);


    // ======================================
    // CHECK EXISTING USER
    // ======================================

    const {
      data: existingUser,
      error: userError,
    } = await supabase
      .from('users')
      .select(
        'id, name, mobile, business_name, business_type, city, created_at'
      )
      .eq('mobile', mobile)
      .maybeSingle();

    if (userError) {
      console.error(
        'Existing User Check Error:',
        userError
      );

      return res.status(500).json({
        success: false,
        message: userError.message,
      });
    }


    // ======================================
    // EXISTING USER
    // ======================================

    if (existingUser) {

      // ======================================
      // CHECK PENDING EMPLOYEE INVITE
      // ======================================

      const {
        data: pendingInvite,
        error: inviteError,
      } = await supabase
        .from('employee_invites')
        .select('*')
        .eq('employee_mobile', mobile)
        .eq('status', 'pending')
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (inviteError) {
        console.error(
          'Employee Invite Check Error:',
          inviteError
        );

        return res.status(500).json({
          success: false,
          message: inviteError.message,
        });
      }


      // ======================================
      // PENDING INVITE FOUND
      // ======================================

      if (pendingInvite) {

        // ======================================
        // PREVENT OWNER BECOMING EMPLOYEE
        // ======================================

        if (pendingInvite.owner_id === existingUser.id) {
          return res.status(400).json({
            success: false,
            message: 'Owner cannot be added as employee',
          });
        }


        // ======================================
        // CHECK EXISTING MEMBERSHIP
        // ======================================

        const {
          data: existingMember,
          error: memberCheckError,
        } = await supabase
          .from('business_members')
          .select('id, status')
          .eq('owner_id', pendingInvite.owner_id)
          .eq('employee_id', existingUser.id)
          .maybeSingle();

        if (memberCheckError) {
          console.error(
            'Employee Membership Check Error:',
            memberCheckError
          );

          return res.status(500).json({
            success: false,
            message: memberCheckError.message,
          });
        }


        // ======================================
        // CREATE MEMBERSHIP
        // ======================================

        if (!existingMember) {

          const {
            error: memberCreateError,
          } = await supabase
            .from('business_members')
            .insert([
              {
                owner_id: pendingInvite.owner_id,
                employee_id: existingUser.id,

                role: 'employee',

                access_level:
                  pendingInvite.access_level || 'custom',

                can_view_customers:
                  pendingInvite.can_view_customers,

                can_manage_customers:
                  pendingInvite.can_manage_customers,

                can_view_suppliers:
                  pendingInvite.can_view_suppliers,

                can_manage_suppliers:
                  pendingInvite.can_manage_suppliers,

                can_create_transactions:
                  pendingInvite.can_create_transactions,

                can_view_transactions:
                  pendingInvite.can_view_transactions,

                can_delete_transactions:
                  pendingInvite.can_delete_transactions,

                can_view_reports:
                  pendingInvite.can_view_reports,

                can_use_voice:
                  pendingInvite.can_use_voice,

                status: 'active',
              },
            ]);

          if (memberCreateError) {
            console.error(
              'Employee Membership Create Error:',
              memberCreateError
            );

            return res.status(500).json({
              success: false,
              message: memberCreateError.message,
            });
          }

        } else if (existingMember.status !== 'active') {

          // ======================================
          // RE-ACTIVATE OLD EMPLOYEE
          // ======================================

          const {
            error: reactivateError,
          } = await supabase
            .from('business_members')
            .update({
              status: 'active',

              access_level:
                pendingInvite.access_level || 'custom',

              can_view_customers:
                pendingInvite.can_view_customers,

              can_manage_customers:
                pendingInvite.can_manage_customers,

              can_view_suppliers:
                pendingInvite.can_view_suppliers,

              can_manage_suppliers:
                pendingInvite.can_manage_suppliers,

              can_create_transactions:
                pendingInvite.can_create_transactions,

              can_view_transactions:
                pendingInvite.can_view_transactions,

              can_delete_transactions:
                pendingInvite.can_delete_transactions,

              can_view_reports:
                pendingInvite.can_view_reports,

              can_use_voice:
                pendingInvite.can_use_voice,
            })
            .eq('id', existingMember.id);

          if (reactivateError) {
            console.error(
              'Employee Reactivation Error:',
              reactivateError
            );

            return res.status(500).json({
              success: false,
              message: reactivateError.message,
            });
          }
        }


        // ======================================
        // MARK INVITE AS ACCEPTED
        // ======================================

        const {
          error: inviteUpdateError,
        } = await supabase
          .from('employee_invites')
          .update({
            status: 'accepted',
          })
          .eq('id', pendingInvite.id);

        if (inviteUpdateError) {
          console.error(
            'Employee Invite Update Error:',
            inviteUpdateError
          );

          return res.status(500).json({
            success: false,
            message: inviteUpdateError.message,
          });
        }


        // ======================================
        // GENERATE JWT
        // ======================================

        const token = generateToken(existingUser);


        // ======================================
        // EMPLOYEE LOGIN RESPONSE
        // ======================================

        return res.json({
          success: true,
          message: 'Employee login successful',

          isNewUser: false,
          isEmployee: true,

          token,

          user: existingUser,

          business: {
            owner_id: pendingInvite.owner_id,

            role: 'employee',

            access_level:
              pendingInvite.access_level || 'custom',
          },
        });
      }


      // ======================================
      // NORMAL USER LOGIN
      // ======================================

      const token = generateToken(existingUser);

      return res.json({
        success: true,
        message: 'Login successful',

        isNewUser: false,
        isEmployee: false,

        token,

        user: existingUser,
      });
    }


    // ======================================
    // NEW USER
    // ======================================

    const {
      data: newUser,
      error: createError,
    } = await supabase
      .from('users')
      .insert([
        {
          mobile,
          name: 'User',
        },
      ])
      .select(
        'id, name, mobile, business_name, business_type, city, created_at'
      )
      .single();

    if (createError) {
      console.error(
        'Create User Error:',
        createError
      );

      return res.status(500).json({
        success: false,
        message: createError.message,
      });
    }


    // ======================================
    // CHECK PENDING EMPLOYEE INVITE
    // ======================================

    const {
      data: pendingInvite,
      error: inviteError,
    } = await supabase
      .from('employee_invites')
      .select('*')
      .eq('employee_mobile', mobile)
      .eq('status', 'pending')
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error(
        'New Employee Invite Check Error:',
        inviteError
      );

      return res.status(500).json({
        success: false,
        message: inviteError.message,
      });
    }


    // ======================================
    // NEW USER IS EMPLOYEE
    // ======================================

    if (pendingInvite) {

      const {
        error: memberCreateError,
      } = await supabase
        .from('business_members')
        .insert([
          {
            owner_id: pendingInvite.owner_id,
            employee_id: newUser.id,

            role: 'employee',

            access_level:
              pendingInvite.access_level || 'custom',

            can_view_customers:
              pendingInvite.can_view_customers,

            can_manage_customers:
              pendingInvite.can_manage_customers,

            can_view_suppliers:
              pendingInvite.can_view_suppliers,

            can_manage_suppliers:
              pendingInvite.can_manage_suppliers,

            can_create_transactions:
              pendingInvite.can_create_transactions,

            can_view_transactions:
              pendingInvite.can_view_transactions,

            can_delete_transactions:
              pendingInvite.can_delete_transactions,

            can_view_reports:
              pendingInvite.can_view_reports,

            can_use_voice:
              pendingInvite.can_use_voice,

            status: 'active',
          },
        ]);

      if (memberCreateError) {
        console.error(
          'New Employee Membership Error:',
          memberCreateError
        );

        return res.status(500).json({
          success: false,
          message: memberCreateError.message,
        });
      }


      // ======================================
      // MARK INVITE ACCEPTED
      // ======================================

      const {
        error: inviteUpdateError,
      } = await supabase
        .from('employee_invites')
        .update({
          status: 'accepted',
        })
        .eq('id', pendingInvite.id);

      if (inviteUpdateError) {
        console.error(
          'New Employee Invite Update Error:',
          inviteUpdateError
        );

        return res.status(500).json({
          success: false,
          message: inviteUpdateError.message,
        });
      }


      // ======================================
      // GENERATE JWT
      // ======================================

      const token = generateToken(newUser);


      // ======================================
      // NEW EMPLOYEE LOGIN RESPONSE
      // ======================================

      return res.status(201).json({
        success: true,
        message: 'Employee account created successfully',

        isNewUser: true,
        isEmployee: true,

        token,

        user: newUser,

        business: {
          owner_id: pendingInvite.owner_id,

          role: 'employee',

          access_level:
            pendingInvite.access_level || 'custom',
        },
      });
    }


    // ======================================
    // NORMAL NEW USER
    // ======================================

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',

      isNewUser: true,
      isEmployee: false,

      token,

      user: newUser,
    });

  } catch (error) {
    console.error(
      'Verify OTP Error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// LOGOUT
// ======================================

const logout = async (req, res) => {
  try {

    // ======================================
    // GET USER ID FROM JWT
    // ======================================

    const user_id = req.user.id;


    // ======================================
    // CHECK USER EXISTS
    // ======================================

    const {
      data: user,
      error: userError,
    } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .maybeSingle();

    if (userError) {
      console.error(
        'Logout User Check Error:',
        userError
      );

      return res.status(500).json({
        success: false,
        message: userError.message,
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }


    // ======================================
    // LOGOUT SUCCESS
    // ======================================

    return res.json({
      success: true,
      message: 'Logout successful',
    });

  } catch (error) {
    console.error(
      'Logout Error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// SETUP BUSINESS
// ======================================

const setupBusiness = async (req, res) => {
  try {

    const {
      business_name,
      business_type,
      owner_name,
      city,
    } = req.body;


    // ======================================
    // GET USER ID FROM JWT
    // ======================================

    const user_id = req.user.id;


    // ======================================
    // VALIDATION
    // ======================================

    if (!business_name || !business_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Business name is required',
      });
    }

    if (!business_type || !business_type.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Business type is required',
      });
    }

    if (!owner_name || !owner_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Owner name is required',
      });
    }


    // ======================================
    // CHECK USER
    // ======================================

    const {
      data: existingUser,
      error: userError,
    } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .maybeSingle();

    if (userError) {
      console.error(
        'Business Setup User Check Error:',
        userError
      );

      return res.status(500).json({
        success: false,
        message: userError.message,
      });
    }

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }


    // ======================================
    // UPDATE BUSINESS DETAILS
    // ======================================

    const {
      data: updatedUser,
      error: updateError,
    } = await supabase
      .from('users')
      .update({
        name: owner_name.trim(),
        business_name: business_name.trim(),
        business_type: business_type.trim(),
        city: city ? city.trim() : null,
      })
      .eq('id', user_id)
      .select(
        'id, name, mobile, business_name, business_type, city, created_at'
      )
      .single();

    if (updateError) {
      console.error(
        'Business Setup Update Error:',
        updateError
      );

      return res.status(500).json({
        success: false,
        message: updateError.message,
      });
    }


    // ======================================
    // SUCCESS
    // ======================================

    return res.json({
      success: true,
      message: 'Business setup completed successfully',
      user: updatedUser,
    });

  } catch (error) {
    console.error(
      'Business Setup Error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};


// ======================================
// EXPORTS
// ======================================

module.exports = {
  sendOtp,
  verifyOtp,
  logout,
  setupBusiness,
};