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
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured on server');
  }

  if (!user || !user.id) {
    throw new Error('User ID is missing while generating JWT');
  }

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

    // ======================================
    // VALIDATION
    // ======================================

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required',
      });
    }

    const cleanMobile = mobile.toString().trim();

    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10 digit mobile number',
      });
    }

    // ======================================
    // GENERATE 6 DIGIT OTP
    // ======================================

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // ======================================
    // STORE OTP
    // ======================================

    otpStore.set(cleanMobile, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // ======================================
    // DEVELOPMENT LOG
    // ======================================

    console.log('================================');
    console.log('OTP GENERATED');
    console.log(`Mobile: ${cleanMobile}`);
    console.log(`OTP: ${otp}`);
    console.log('Expires: 5 minutes');
    console.log('================================');

    // ======================================
    // RESPONSE
    // ======================================

    return res.json({
      success: true,
      message: 'OTP generated successfully',

      // DEVELOPMENT ONLY
      otp,
    });

  } catch (error) {
    console.error('================================');
    console.error('SEND OTP ERROR');
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);
    console.error('================================');

    return res.status(500).json({
      success: false,
      message: error?.message || 'Server error',
    });
  }
};


// ======================================
// VERIFY OTP
// ======================================

const verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    // ======================================
    // VALIDATION
    // ======================================

    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required',
      });
    }

    const cleanMobile = mobile.toString().trim();
    const cleanOtp = otp.toString().trim();

    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 10 digit mobile number',
      });
    }

    if (!/^[0-9]{6}$/.test(cleanOtp)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 6 digit OTP',
      });
    }

    // ======================================
    // GET STORED OTP
    // ======================================

    const storedOtp = otpStore.get(cleanMobile);

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
      otpStore.delete(cleanMobile);

      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // ======================================
    // CHECK OTP
    // ======================================

    if (storedOtp.otp !== cleanOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    // ======================================
    // OTP VERIFIED
    // ======================================

    otpStore.delete(cleanMobile);

    console.log('================================');
    console.log('OTP VERIFIED');
    console.log(`Mobile: ${cleanMobile}`);
    console.log('================================');


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
      .eq('mobile', cleanMobile)
      .maybeSingle();

    if (userError) {
      console.error('================================');
      console.error('EXISTING USER CHECK ERROR');
      console.error('Message:', userError.message);
      console.error('Details:', userError.details);
      console.error('Hint:', userError.hint);
      console.error('Code:', userError.code);
      console.error('================================');

      return res.status(500).json({
        success: false,
        message: userError.message || 'Unable to check user',
      });
    }


    // ======================================
    // EXISTING USER
    // ======================================

    if (existingUser) {

      console.log('Existing user found:', existingUser.id);


      // ======================================
      // CHECK PENDING EMPLOYEE INVITE
      // ======================================

      const {
        data: pendingInvite,
        error: inviteError,
      } = await supabase
        .from('employee_invites')
        .select('*')
        .eq('employee_mobile', cleanMobile)
        .eq('status', 'pending')
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (inviteError) {
        console.error('================================');
        console.error('EMPLOYEE INVITE CHECK ERROR');
        console.error('Message:', inviteError.message);
        console.error('Details:', inviteError.details);
        console.error('Hint:', inviteError.hint);
        console.error('Code:', inviteError.code);
        console.error('================================');

        return res.status(500).json({
          success: false,
          message:
            inviteError.message ||
            'Unable to check employee invitation',
        });
      }


      // ======================================
      // PENDING INVITE FOUND
      // ======================================

      if (pendingInvite) {

        console.log(
          'Pending employee invite found:',
          pendingInvite.id
        );


        // ======================================
        // PREVENT OWNER BECOMING EMPLOYEE
        // ======================================

        if (
          pendingInvite.owner_id ===
          existingUser.id
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Owner cannot be added as employee',
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
          .eq(
            'owner_id',
            pendingInvite.owner_id
          )
          .eq(
            'employee_id',
            existingUser.id
          )
          .maybeSingle();

        if (memberCheckError) {
          console.error('================================');
          console.error(
            'EMPLOYEE MEMBERSHIP CHECK ERROR'
          );
          console.error(
            'Message:',
            memberCheckError.message
          );
          console.error(
            'Details:',
            memberCheckError.details
          );
          console.error(
            'Hint:',
            memberCheckError.hint
          );
          console.error(
            'Code:',
            memberCheckError.code
          );
          console.error('================================');

          return res.status(500).json({
            success: false,
            message:
              memberCheckError.message ||
              'Unable to check employee membership',
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
                owner_id:
                  pendingInvite.owner_id,

                employee_id:
                  existingUser.id,

                role: 'employee',

                access_level:
                  pendingInvite.access_level ||
                  'custom',

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
            console.error('================================');
            console.error(
              'EMPLOYEE MEMBERSHIP CREATE ERROR'
            );
            console.error(
              'Message:',
              memberCreateError.message
            );
            console.error(
              'Details:',
              memberCreateError.details
            );
            console.error(
              'Hint:',
              memberCreateError.hint
            );
            console.error(
              'Code:',
              memberCreateError.code
            );
            console.error('================================');

            return res.status(500).json({
              success: false,
              message:
                memberCreateError.message ||
                'Unable to create employee membership',
            });
          }

        } else if (
          existingMember.status !== 'active'
        ) {

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
                pendingInvite.access_level ||
                'custom',

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
            .eq(
              'id',
              existingMember.id
            );

          if (reactivateError) {
            console.error('================================');
            console.error(
              'EMPLOYEE REACTIVATION ERROR'
            );
            console.error(
              'Message:',
              reactivateError.message
            );
            console.error(
              'Details:',
              reactivateError.details
            );
            console.error(
              'Hint:',
              reactivateError.hint
            );
            console.error(
              'Code:',
              reactivateError.code
            );
            console.error('================================');

            return res.status(500).json({
              success: false,
              message:
                reactivateError.message ||
                'Unable to reactivate employee',
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
          .eq(
            'id',
            pendingInvite.id
          );

        if (inviteUpdateError) {
          console.error('================================');
          console.error(
            'EMPLOYEE INVITE UPDATE ERROR'
          );
          console.error(
            'Message:',
            inviteUpdateError.message
          );
          console.error(
            'Details:',
            inviteUpdateError.details
          );
          console.error(
            'Hint:',
            inviteUpdateError.hint
          );
          console.error(
            'Code:',
            inviteUpdateError.code
          );
          console.error('================================');

          return res.status(500).json({
            success: false,
            message:
              inviteUpdateError.message ||
              'Unable to update employee invitation',
          });
        }


        // ======================================
        // GENERATE JWT
        // ======================================

        const token =
          generateToken(existingUser);


        console.log(
          'Employee JWT generated successfully'
        );


        // ======================================
        // EMPLOYEE LOGIN RESPONSE
        // ======================================

        return res.json({
          success: true,

          message:
            'Employee login successful',

          isNewUser: false,

          isEmployee: true,

          token,

          user: existingUser,

          business: {
            owner_id:
              pendingInvite.owner_id,

            role: 'employee',

            access_level:
              pendingInvite.access_level ||
              'custom',
          },
        });
      }


      // ======================================
      // NORMAL USER LOGIN
      // ======================================

      const token =
        generateToken(existingUser);


      console.log(
        'Normal user JWT generated successfully'
      );


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

    console.log(
      'No existing user found. Creating new user.'
    );


    const {
      data: newUser,
      error: createError,
    } = await supabase
      .from('users')
      .insert([
        {
          mobile: cleanMobile,
          name: 'User',
        },
      ])
      .select(
        'id, name, mobile, business_name, business_type, city, created_at'
      )
      .single();

    if (createError) {
      console.error('================================');
      console.error('CREATE USER ERROR');
      console.error('Message:', createError.message);
      console.error('Details:', createError.details);
      console.error('Hint:', createError.hint);
      console.error('Code:', createError.code);
      console.error('================================');

      return res.status(500).json({
        success: false,
        message:
          createError.message ||
          'Unable to create user',
      });
    }


    console.log(
      'New user created:',
      newUser.id
    );


    // ======================================
    // CHECK PENDING EMPLOYEE INVITE
    // ======================================

    const {
      data: pendingInvite,
      error: inviteError,
    } = await supabase
      .from('employee_invites')
      .select('*')
      .eq(
        'employee_mobile',
        cleanMobile
      )
      .eq(
        'status',
        'pending'
      )
      .order('created_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error('================================');
      console.error(
        'NEW EMPLOYEE INVITE CHECK ERROR'
      );
      console.error(
        'Message:',
        inviteError.message
      );
      console.error(
        'Details:',
        inviteError.details
      );
      console.error(
        'Hint:',
        inviteError.hint
      );
      console.error(
        'Code:',
        inviteError.code
      );
      console.error('================================');

      return res.status(500).json({
        success: false,
        message:
          inviteError.message ||
          'Unable to check employee invitation',
      });
    }


    // ======================================
    // NEW USER IS EMPLOYEE
    // ======================================

    if (pendingInvite) {

      console.log(
        'New user has pending employee invite'
      );


      const {
        error: memberCreateError,
      } = await supabase
        .from('business_members')
        .insert([
          {
            owner_id:
              pendingInvite.owner_id,

            employee_id:
              newUser.id,

            role: 'employee',

            access_level:
              pendingInvite.access_level ||
              'custom',

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
        console.error('================================');
        console.error(
          'NEW EMPLOYEE MEMBERSHIP ERROR'
        );
        console.error(
          'Message:',
          memberCreateError.message
        );
        console.error(
          'Details:',
          memberCreateError.details
        );
        console.error(
          'Hint:',
          memberCreateError.hint
        );
        console.error(
          'Code:',
          memberCreateError.code
        );
        console.error('================================');

        return res.status(500).json({
          success: false,
          message:
            memberCreateError.message ||
            'Unable to create employee membership',
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
        .eq(
          'id',
          pendingInvite.id
        );

      if (inviteUpdateError) {
        console.error('================================');
        console.error(
          'NEW EMPLOYEE INVITE UPDATE ERROR'
        );
        console.error(
          'Message:',
          inviteUpdateError.message
        );
        console.error(
          'Details:',
          inviteUpdateError.details
        );
        console.error(
          'Hint:',
          inviteUpdateError.hint
        );
        console.error(
          'Code:',
          inviteUpdateError.code
        );
        console.error('================================');

        return res.status(500).json({
          success: false,
          message:
            inviteUpdateError.message ||
            'Unable to update employee invitation',
        });
      }


      // ======================================
      // GENERATE JWT
      // ======================================

      const token =
        generateToken(newUser);


      console.log(
        'New employee JWT generated successfully'
      );


      // ======================================
      // NEW EMPLOYEE LOGIN RESPONSE
      // ======================================

      return res.status(201).json({
        success: true,

        message:
          'Employee account created successfully',

        isNewUser: true,

        isEmployee: true,

        token,

        user: newUser,

        business: {
          owner_id:
            pendingInvite.owner_id,

          role: 'employee',

          access_level:
            pendingInvite.access_level ||
            'custom',
        },
      });
    }


    // ======================================
    // NORMAL NEW USER
    // ======================================

    const token =
      generateToken(newUser);


    console.log(
      'New user JWT generated successfully'
    );


    return res.status(201).json({
      success: true,

      message:
        'Account created successfully',

      isNewUser: true,

      isEmployee: false,

      token,

      user: newUser,
    });

  } catch (error) {

    // ======================================
    // FULL ERROR LOG
    // ======================================

    console.error('================================');
    console.error('VERIFY OTP ERROR');
    console.error('Message:', error?.message);
    console.error('Name:', error?.name);
    console.error('Stack:', error?.stack);
    console.error('Full Error:', error);
    console.error('================================');

    return res.status(500).json({
      success: false,

      // TEMPORARY DEBUG MESSAGE
      message:
        error?.message ||
        'Server error',
    });
  }
};


// ======================================
// LOGOUT
// ======================================

const logout = async (req, res) => {
  try {

    // ======================================
    // CHECK JWT
    // ======================================

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }


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
        message:
          userError.message ||
          'Unable to verify user',
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

    console.error('================================');
    console.error('LOGOUT ERROR');
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);
    console.error('================================');

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        'Server error',
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
    // CHECK JWT
    // ======================================

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }


    // ======================================
    // GET USER ID FROM JWT
    // ======================================

    const user_id = req.user.id;


    // ======================================
    // VALIDATION
    // ======================================

    if (
      !business_name ||
      !business_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Business name is required',
      });
    }

    if (
      !business_type ||
      !business_type.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Business type is required',
      });
    }

    if (
      !owner_name ||
      !owner_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Owner name is required',
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
        message:
          userError.message ||
          'Unable to check user',
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

        business_name:
          business_name.trim(),

        business_type:
          business_type.trim(),

        city:
          city
            ? city.trim()
            : null,
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
        message:
          updateError.message ||
          'Unable to update business',
      });
    }


    // ======================================
    // SUCCESS
    // ======================================

    return res.json({
      success: true,

      message:
        'Business setup completed successfully',

      user: updatedUser,
    });

  } catch (error) {

    console.error('================================');
    console.error('BUSINESS SETUP ERROR');
    console.error('Message:', error?.message);
    console.error('Stack:', error?.stack);
    console.error('================================');

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        'Server error',
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