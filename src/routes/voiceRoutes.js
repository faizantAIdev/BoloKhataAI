
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

const {
  parseVoiceText,
  clarifyVoiceTransaction,
} = require('./services/voiceParser');

const {
  findCustomerByName,
} = require('./services/customerMatcher');

const {
  findSupplierByName,
} = require('./services/supplierMatcher');

const supabase = require('../config/supabase');

const {
  getBusinessOwnerId,
  requirePermission,
} = require('../utils/businessAccess');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();


// =====================================================
// GROQ
// =====================================================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


// =====================================================
// AUDIO UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(
  __dirname,
  '../tmp'
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}


// =====================================================
// MULTER STORAGE
// =====================================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const originalExtension =
      path.extname(
        file.originalname || ''
      );

    const extension =
      originalExtension || '.m4a';

    const uniqueName =
      `voice-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}${extension}`;

    cb(
      null,
      uniqueName
    );
  },

});


// =====================================================
// MULTER
// =====================================================

const upload = multer({

  storage,

  limits: {
    fileSize:
      25 * 1024 * 1024,
  },

  fileFilter: (
    req,
    file,
    cb
  ) => {

    console.log(
      '🎵 Uploaded audio:',
      {
        originalname:
          file.originalname,

        mimetype:
          file.mimetype,
      }
    );

    cb(
      null,
      true
    );

  },

});


// =====================================================
// NORMALIZE WHISPER TRANSCRIPT
// =====================================================

async function normalizeVoiceTranscript(
  text,
  businessOwnerId
) {

  if (
    !text ||
    !text.trim()
  ) {
    return text;
  }

  try {

    // ==============================================
    // GET EXISTING CUSTOMER NAMES
    // ==============================================

    const {
      data: customers,
      error: customerError,
    } = await supabase
      .from('customers')
      .select('name')
      .eq(
        'user_id',
        businessOwnerId
      );

    if (customerError) {

      console.error(
        '⚠️ Customer names fetch failed:',
        customerError.message
      );

    }


    // ==============================================
    // GET EXISTING SUPPLIER NAMES
    // ==============================================

    const {
      data: suppliers,
      error: supplierError,
    } = await supabase
      .from('suppliers')
      .select('name')
      .eq(
        'user_id',
        businessOwnerId
      );

    if (supplierError) {

      console.error(
        '⚠️ Supplier names fetch failed:',
        supplierError.message
      );

    }


    // ==============================================
    // BUILD NAME LIST
    // ==============================================

    const customerNames =
      Array.isArray(customers)
        ? customers
            .map(
              item => item?.name
            )
            .filter(Boolean)
        : [];

    const supplierNames =
      Array.isArray(suppliers)
        ? suppliers
            .map(
              item => item?.name
            )
            .filter(Boolean)
        : [];


    // ==============================================
    // LIMIT CONTEXT SIZE
    // ==============================================

    const uniqueCustomerNames =
      [
        ...new Set(
          customerNames
        ),
      ]
        .slice(0, 200);

    const uniqueSupplierNames =
      [
        ...new Set(
          supplierNames
        ),
      ]
        .slice(0, 200);


    console.log(
      '🔤 Normalizing transcript...'
    );

    console.log(
      '👤 Customer names available:',
      uniqueCustomerNames.length
    );

    console.log(
      '🏪 Supplier names available:',
      uniqueSupplierNames.length
    );


    // ==============================================
    // GROQ NORMALIZER
    // ==============================================

    const response =
      await groq.chat.completions.create({

        model:
          'openai/gpt-oss-20b',

        temperature:
          0,

        messages: [

          {
            role:
              'system',

            content: `
You are a transcription normalizer for an Indian
business accounting application called Voice Khata.

Your job is ONLY to normalize the speech transcript
into natural Roman Hindi / Hinglish.

DO NOT change the meaning.

DO NOT translate the complete sentence into English.

DO NOT add information.

DO NOT remove information.

DO NOT change the transaction intent.

DO NOT change the amount.

DO NOT change names.

--------------------------------------------------
SCRIPT NORMALIZATION
--------------------------------------------------

If the transcript is written in:

- Devanagari Hindi
- Urdu / Arabic Hindi
- Roman Hindi
- Hinglish

convert it into easy-to-read Roman Hindi / Hinglish.

Example:

جگنیس نے دو سو کا مال باقی لے گیا

should become:

Jignesh ne do sau ka maal baaki le gaya

Another example:

पारस से पचास हजार का माल बाकी आया

should become:

Paras se pachaas hazaar ka maal baaki aaya

Another example:

राहुल ने 500 रुपये दिए

should become:

Rahul ne 500 rupaye diye

--------------------------------------------------
NAME HANDLING
--------------------------------------------------

The following are existing names in this user's
Voice Khata account.

CUSTOMERS:
${uniqueCustomerNames.join(', ') || 'None'}

SUPPLIERS:
${uniqueSupplierNames.join(', ') || 'None'}

If a spoken/transcribed name appears similar to
one of these names, preserve the existing database
name exactly.

For example, if the database contains:

Jignesh

and Whisper gives:

جگنیس

normalize it to:

Jignesh

If the database contains:

Paras Traders

and Whisper gives a similar native-script version,
use:

Paras Traders

Do NOT invent a new name when an existing name
matches.

--------------------------------------------------
IMPORTANT WORDS
--------------------------------------------------

Preserve common Indian business words such as:

se
ne
ko
ka
ke
ki
maal
baaki
udhaar
aaya
gaya
liya
diya
lena
dena
rupaye
rupees
hazaar
lakh
jama
payment
receive
credit
balance

--------------------------------------------------
NUMBERS
--------------------------------------------------

Preserve amounts accurately.

Examples:

दो सौ
→ do sau

पाँच हजार
→ paanch hazaar

पचास हजार
→ pachaas hazaar

एक लाख
→ ek lakh

Do NOT change 50000 into another amount.

--------------------------------------------------
OUTPUT
--------------------------------------------------

Return ONLY the normalized transcript.

No JSON.

No explanation.

No quotes.

No markdown.

No labels.
`,
          },

          {
            role:
              'user',

            content:
              text,
          },

        ],

      });


    const normalized =
      response
        ?.choices?.[0]
        ?.message
        ?.content
        ?.trim();


    if (!normalized) {

      console.log(
        '⚠️ Normalizer returned empty text.'
      );

      return text;

    }

    return normalized;

  } catch (error) {

    console.error(
      '⚠️ Transcript normalization failed:',
      error?.message ||
        error
    );

    return text;

  }

}


// =====================================================
// POST /api/voice/transcribe
// JWT PROTECTED
// =====================================================

router.post(
  '/transcribe',
  authMiddleware,
  upload.single('audio'),

  async (req, res) => {

    let filePath = null;

    try {

      // ======================================
      // JWT USER
      // ======================================

      const user_id =
        req.user.id;

      const {
        language,
      } = req.body;


      // ======================================
      // LOG
      // ======================================

      console.log('');

      console.log(
        '===================================='
      );

      console.log(
        '🎤 VOICE TRANSCRIPTION'
      );

      console.log(
        '===================================='
      );

      console.log(
        'User ID:',
        user_id
      );

      console.log(
        'Language:',
        language
      );


      // ======================================
      // VOICE PERMISSION
      // ======================================

      await requirePermission(
        user_id,
        'can_use_voice'
      );


      // ======================================
      // AUDIO CHECK
      // ======================================

      if (!req.file) {

        return res.status(400).json({

          success: false,

          message:
            'Audio file is required',

        });

      }


      // ======================================
      // FILE PATH
      // ======================================

      filePath =
        req.file.path;


      console.log(
        '📁 Original file:',
        req.file.originalname
      );

      console.log(
        '📁 Saved file:',
        req.file.filename
      );

      console.log(
        '📁 MIME type:',
        req.file.mimetype
      );

      console.log(
        '📁 Size:',
        req.file.size
      );

      console.log(
        '📁 File path:',
        filePath
      );


      // ======================================
      // FILE EXISTS CHECK
      // ======================================

      if (
        !fs.existsSync(
          filePath
        )
      ) {

        return res.status(500).json({

          success: false,

          message:
            'Uploaded audio file was not found',

        });

      }


      // ======================================
      // BUSINESS OWNER
      // ======================================

      const businessOwnerId =
        await getBusinessOwnerId(
          user_id
        );


      console.log(
        '🏢 Business Owner ID:',
        businessOwnerId
      );


      // ======================================
      // LANGUAGE
      // ======================================

      let sttLanguage = null;

      if (language) {

        const selectedLanguage =
          String(
            language
          ).toLowerCase();


        if (
          selectedLanguage === 'hi-in' ||
          selectedLanguage === 'hi'
        ) {

          sttLanguage =
            'hi';

        }

        else if (
          selectedLanguage === 'en-in' ||
          selectedLanguage === 'en'
        ) {

          sttLanguage =
            null;

        }

        else {

          sttLanguage =
            selectedLanguage
              .split('-')[0];

        }

      }


      console.log(
        '🌐 STT Language:',
        sttLanguage ||
          'auto-detect'
      );


      // ======================================
      // GROQ WHISPER
      // ======================================

      console.log(
        '🎙️ Sending audio to Groq Whisper...'
      );


      const transcription =
        await groq.audio.transcriptions.create({

          file:
            fs.createReadStream(
              filePath
            ),

          model:
            'whisper-large-v3',

          response_format:
            'json',

          ...(sttLanguage
            ? {
                language:
                  sttLanguage,
              }
            : {}),

          temperature:
            0,

          prompt:

            'Indian business transaction voice input. ' +

            'Understand Hindi, Hinglish, Roman Hindi, ' +
            'Gujarati, Marathi, Bengali, Tamil, Telugu, ' +
            'Kannada, Malayalam and Indian English. ' +

            'Users may speak in mixed Hindi and English. ' +

            'Do not translate spoken Hindi into English. ' +

            'Preserve the spoken words and meaning as closely ' +
            'as possible. ' +

            'Preserve customer names, supplier names, ' +
            'shop names and business names accurately. ' +

            'Examples include NK Traders, Paras Medical, ' +
            'Rahul, Suresh, Ramesh, Rakesh Traders, ' +
            'New Star Medical and Khan General Store. ' +

            'Preserve numbers and Indian currency amounts accurately. ' +

            'Common phrases include rupaye, rupees, hazaar, lakh, ' +
            'dena hai, lena hai, maal liya, payment diya, ' +
            'payment mila, baaki, udhaar, jama, receive and credit.',

        });


      // ======================================
      // RAW WHISPER TEXT
      // ======================================

      const rawText =
        transcription?.text
          ?.trim() || '';


      console.log('');

      console.log(
        '📝 RAW WHISPER TRANSCRIPT:'
      );

      console.log(
        rawText
      );


      // ======================================
      // EMPTY TRANSCRIPTION
      // ======================================

      if (!rawText) {

        return res.status(400).json({

          success: false,

          message:
            'Could not understand the audio',

        });

      }


      // ======================================
      // NORMALIZE TRANSCRIPT
      // ======================================

      const text =
        await normalizeVoiceTranscript(
          rawText,
          businessOwnerId
        );


      console.log('');

      console.log(
        '🔤 NORMALIZED TRANSCRIPT:'
      );

      console.log(
        text
      );


      // ======================================
      // RESPONSE
      // ======================================

      return res.json({

        success: true,

        text,

        language:
          sttLanguage || null,

        raw_text:
          rawText,

      });

    } catch (error) {

      console.error('');

      console.error(
        '===================================='
      );

      console.error(
        '❌ VOICE TRANSCRIPTION ERROR'
      );

      console.error(
        '===================================='
      );

      console.error(
        error
      );


      // ======================================
      // JWT ERROR
      // ======================================

      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError'
      ) {

        return res.status(401).json({

          success: false,

          message:
            'Authentication failed',

        });

      }


      // ======================================
      // PERMISSION ERROR
      // ======================================

      if (
        error.statusCode === 403
      ) {

        return res.status(403).json({

          success: false,

          message:
            'You do not have permission to use voice',

        });

      }


      return res.status(500).json({

        success: false,

        message:
          'Failed to transcribe voice input',

        error:
          error?.message ||
          'Unknown transcription error',

      });

    } finally {

      // ======================================
      // DELETE TEMP AUDIO
      // ======================================

      if (filePath) {

        try {

          if (
            fs.existsSync(
              filePath
            )
          ) {

            fs.unlinkSync(
              filePath
            );

            console.log(
              '🗑️ Temporary audio deleted'
            );

          }

        } catch (
          deleteError
        ) {

          console.error(
            '⚠️ Failed to delete temporary audio:',
            deleteError.message
          );

        }

      }

    }

  }
);


// =====================================================
// POST /api/voice/parse
// JWT PROTECTED
// =====================================================

router.post(
  '/parse',
  authMiddleware,

  async (req, res) => {

    try {

      const {
        text,
      } = req.body;

      // ======================================
      // JWT USER
      // ======================================

      const user_id =
        req.user.id;


      // ======================================
      // VALIDATION
      // ======================================

      if (!text) {

        return res.status(400).json({

          success: false,

          message:
            'text is required',

        });

      }


      // ======================================
      // VOICE PERMISSION
      // ======================================

      await requirePermission(
        user_id,
        'can_use_voice'
      );


      // ======================================
      // BUSINESS OWNER
      // ======================================

      const businessOwnerId =
        await getBusinessOwnerId(
          user_id
        );


      console.log(
        '🎤 Voice Parse'
      );

      console.log(
        'User ID:',
        user_id
      );

      console.log(
        'Business Owner ID:',
        businessOwnerId
      );


      // ======================================
      // AI PARSER
      // ======================================

      const parsed =
        await parseVoiceText(
          text
        );


      console.log(
        '🤖 Parsed:',
        parsed
      );


      // ======================================
      // CLARIFICATION REQUIRED
      // ======================================

      if (
        parsed.needs_clarification
      ) {

        return res.json({

          success: true,

          needs_clarification:
            true,

          question:
            parsed.clarification_question,

          transaction:
            parsed,

        });

      }


      // ======================================
      // VALIDATION
      // ======================================

      if (
        !parsed.account_type
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Account type could not be detected',

        });

      }


      if (
        !parsed.intent
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Transaction intent could not be detected',

        });

      }


      if (
        !parsed.person_name
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Person name could not be detected',

        });

      }


      if (
        parsed.amount === null ||
        parsed.amount === undefined ||
        Number(parsed.amount) <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Valid amount could not be detected',

        });

      }


      // ======================================
      // SUPPLIER
      // ======================================

      if (
        parsed.account_type ===
        'supplier'
      ) {

        const match =
          await findSupplierByName(
            businessOwnerId,
            parsed.person_name
          );


        console.log(
          '🏪 Supplier Match:',
          match
        );


        return res.json({

          success: true,

          needs_clarification:
            false,

          transaction: {

            ...parsed,

            user_id:
              businessOwnerId,

          },

          match,

        });

      }


      // ======================================
      // CUSTOMER
      // ======================================

      if (
        parsed.account_type ===
        'customer'
      ) {

        const match =
          await findCustomerByName(
            businessOwnerId,
            parsed.person_name
          );


        console.log(
          '👤 Customer Match:',
          match
        );


        return res.json({

          success: true,

          needs_clarification:
            false,

          transaction: {

            ...parsed,

            user_id:
              businessOwnerId,

          },

          match,

        });

      }


      // ======================================
      // INVALID ACCOUNT
      // ======================================

      return res.status(400).json({

        success: false,

        message:
          'Invalid account type',

      });


    } catch (error) {

      console.error(
        '❌ Voice Parse Error:',
        error
      );


      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError'
      ) {

        return res.status(401).json({

          success: false,

          message:
            'Authentication failed',

        });

      }


      if (
        error.statusCode === 403
      ) {

        return res.status(403).json({

          success: false,

          message:
            'You do not have permission to use voice',

        });

      }


      return res.status(500).json({

        success: false,

        message:
          'Failed to parse voice input',

        error:
          error.message,

      });

    }

  }
);


// =====================================================
// POST /api/voice/confirm
// JWT PROTECTED
// =====================================================

router.post(
  '/confirm',
  authMiddleware,

  async (req, res) => {

    try {

      const {
        account_type,
        customer_id,
        customer_name,
        supplier_id,
        supplier_name,
        intent,
        amount,
        note,
        mobile,
      } = req.body;


      // ======================================
      // JWT USER
      // ======================================

      const user_id =
        req.user.id;


      // ======================================
      // VOICE PERMISSION
      // ======================================

      await requirePermission(
        user_id,
        'can_use_voice'
      );


      // ======================================
      // TRANSACTION PERMISSION
      // ======================================

      await requirePermission(
        user_id,
        'can_create_transactions'
      );


      // ======================================
      // ACCOUNT TYPE
      // ======================================

      if (!account_type) {

        return res.status(400).json({

          success: false,

          message:
            'account_type is required',

        });

      }


      // ======================================
      // INTENT
      // ======================================

      if (!intent) {

        return res.status(400).json({

          success: false,

          message:
            'intent is required',

        });

      }


      // ======================================
      // AMOUNT
      // ======================================

      if (
        amount === undefined ||
        amount === null ||
        Number(amount) <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Valid amount is required',

        });

      }


      // ======================================
      // BUSINESS OWNER
      // ======================================

      const businessOwnerId =
        await getBusinessOwnerId(
          user_id
        );


      console.log(
        '✅ Voice Confirm'
      );

      console.log(
        'User ID:',
        user_id
      );

      console.log(
        'Business Owner ID:',
        businessOwnerId
      );


      // =================================================
      // CUSTOMER
      // =================================================

      if (
        account_type ===
        'customer'
      ) {

        let customer = null;


        // ======================================
        // FIND CUSTOMER BY ID
        // ======================================

        if (customer_id) {

          const {
            data,
            error,
          } = await supabase

            .from('customers')

            .select(
              'id, user_id, name, mobile'
            )

            .eq(
              'id',
              customer_id
            )

            .eq(
              'user_id',
              businessOwnerId
            )

            .single();


          if (
            error &&
            error.code !==
              'PGRST116'
          ) {

            throw error;

          }


          customer =
            data;

        }


        // ======================================
        // FIND CUSTOMER BY NAME
        // ======================================

        if (
          !customer &&
          customer_name
        ) {

          const match =
            await findCustomerByName(
              businessOwnerId,
              customer_name
            );


          if (
            match &&
            match.customer
          ) {

            customer =
              match.customer;

          } else if (
            match &&
            match.id
          ) {

            customer =
              match;

          }

        }


        // ======================================
        // CREATE CUSTOMER
        // ======================================

        if (!customer) {

          if (!customer_name) {

            return res.status(400).json({

              success: false,

              message:
                'customer_name is required',

            });

          }


          const {
            data,
            error,
          } = await supabase

            .from('customers')

            .insert([
              {

                user_id:
                  businessOwnerId,

                name:
                  customer_name,

                mobile:
                  mobile ||
                  null,

              },
            ])

            .select(
              'id, user_id, name, mobile'
            )

            .single();


          if (error) {
            throw error;
          }


          customer =
            data;


          console.log(
            '👤 New Customer Created:',
            customer.id
          );

        }


        // ======================================
        // TRANSACTION TYPE
        // ======================================

        let transactionType;


        if (
          intent ===
          'credit_given'
        ) {

          transactionType =
            'credit';

        } else if (
          intent ===
          'payment_received'
        ) {

          transactionType =
            'payment';

        } else {

          return res.status(400).json({

            success: false,

            message:
              'Invalid customer transaction intent',

          });

        }


        // ======================================
        // INSERT TRANSACTION
        // ======================================

        const {
          data: transaction,
          error:
            transactionError,
        } = await supabase

          .from('transactions')

          .insert([
            {

              user_id:
                businessOwnerId,

              customer_id:
                customer.id,

              type:
                transactionType,

              amount:
                Number(amount),

              description:
                note ||
                null,

            },
          ])

          .select()

          .single();


        if (
          transactionError
        ) {

          throw transactionError;

        }


        console.log(
          '💰 Customer Transaction Created:',
          transaction.id
        );


        return res.json({

          success: true,

          message:
            'Customer transaction created successfully',

          transaction,

          customer,

        });

      }


      // =================================================
      // SUPPLIER
      // =================================================

      if (
        account_type ===
        'supplier'
      ) {

        let supplier = null;


        // ======================================
        // FIND SUPPLIER BY ID
        // ======================================

        if (supplier_id) {

          const {
            data,
            error,
          } = await supabase

            .from('suppliers')

            .select(
              'id, user_id, name, mobile'
            )

            .eq(
              'id',
              supplier_id
            )

            .eq(
              'user_id',
              businessOwnerId
            )

            .single();


          if (
            error &&
            error.code !==
              'PGRST116'
          ) {

            throw error;

          }


          supplier =
            data;

        }


        // ======================================
        // FIND SUPPLIER BY NAME
        // ======================================

        if (
          !supplier &&
          supplier_name
        ) {

          const match =
            await findSupplierByName(
              businessOwnerId,
              supplier_name
            );


          if (
            match &&
            match.supplier
          ) {

            supplier =
              match.supplier;

          } else if (
            match &&
            match.id
          ) {

            supplier =
              match;

          }

        }


        // ======================================
        // CREATE SUPPLIER
        // ======================================

        if (!supplier) {

          if (!supplier_name) {

            return res.status(400).json({

              success: false,

              message:
                'supplier_name is required',

            });

          }


          const {
            data,
            error,
          } = await supabase

            .from('suppliers')

            .insert([
              {

                user_id:
                  businessOwnerId,

                name:
                  supplier_name,

                mobile:
                  mobile ||
                  null,

              },
            ])

            .select(
              'id, user_id, name, mobile'
            )

            .single();


          if (error) {
            throw error;
          }


          supplier =
            data;


          console.log(
            '🏪 New Supplier Created:',
            supplier.id
          );

        }


        // ======================================
        // TRANSACTION TYPE
        // ======================================

        let transactionType;


        if (
          intent ===
          'purchase_from_supplier'
        ) {

          transactionType =
            'purchase';

        } else if (
          intent ===
          'payment_to_supplier'
        ) {

          transactionType =
            'payment';

        } else {

          return res.status(400).json({

            success: false,

            message:
              'Invalid supplier transaction intent',

          });

        }


        // ======================================
        // INSERT TRANSACTION
        // ======================================

        const {
          data: transaction,
          error:
            transactionError,
        } = await supabase

          .from('transactions')

          .insert([
            {

              user_id:
                businessOwnerId,

              supplier_id:
                supplier.id,

              type:
                transactionType,

              amount:
                Number(amount),

              description:
                note ||
                null,

            },
          ])

          .select()

          .single();


        if (
          transactionError
        ) {

          throw transactionError;

        }


        console.log(
          '💰 Supplier Transaction Created:',
          transaction.id
        );


        return res.json({

          success: true,

          message:
            'Supplier transaction created successfully',

          transaction,

          supplier,

        });

      }


      // ======================================
      // INVALID ACCOUNT
      // ======================================

      return res.status(400).json({

        success: false,

        message:
          'Invalid account type',

      });


    } catch (error) {

      console.error(
        '❌ Voice Confirm Error:',
        error
      );


      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError'
      ) {

        return res.status(401).json({

          success: false,

          message:
            'Authentication failed',

        });

      }


      if (
        error.statusCode === 403
      ) {

        return res.status(403).json({

          success: false,

          message:
            'You do not have permission to use voice transactions',

        });

      }


      return res.status(500).json({

        success: false,

        message:
          'Failed to confirm voice transaction',

        error:
          error.message,

      });

    }

  }
);


// =====================================================
// POST /api/voice/clarify
// JWT PROTECTED
// =====================================================

router.post(
  '/clarify',
  authMiddleware,

  async (req, res) => {

    try {

      const {
        original_text,
        question,
        answer,
      } = req.body;


      // ======================================
      // JWT USER
      // ======================================

      const user_id =
        req.user.id;


      // ======================================
      // VOICE PERMISSION
      // ======================================

      await requirePermission(
        user_id,
        'can_use_voice'
      );


      // ======================================
      // REQUIRED FIELDS
      // ======================================

      if (
        !original_text ||
        !question ||
        !answer
      ) {

        return res.status(400).json({

          success: false,

          message:
            'original_text, question and answer are required',

        });

      }


      // ======================================
      // BUSINESS OWNER
      // ======================================

      const businessOwnerId =
        await getBusinessOwnerId(
          user_id
        );


      console.log(
        '🎤 Voice Clarify'
      );

      console.log(
        'User ID:',
        user_id
      );

      console.log(
        'Business Owner ID:',
        businessOwnerId
      );


      // ======================================
      // AI CLARIFICATION
      // ======================================

      const clarified =
        await clarifyVoiceTransaction({

          originalText:
            original_text,

          question:
            question,

          answer:
            answer,

        });


      console.log(
        '🤖 Clarified:',
        clarified
      );


      // ======================================
      // MORE CLARIFICATION
      // ======================================

      if (
        clarified.needs_clarification
      ) {

        return res.json({

          success: true,

          needs_clarification:
            true,

          question:
            clarified.clarification_question,

          transaction:
            clarified,

        });

      }


      // ======================================
      // VALIDATION
      // ======================================

      if (
        !clarified.account_type
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Account type could not be detected',

        });

      }


      if (
        !clarified.intent
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Transaction intent could not be detected',

        });

      }


      if (
        !clarified.person_name
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Person name could not be detected',

        });

      }


      if (
        clarified.amount ===
          null ||
        clarified.amount ===
          undefined ||
        Number(
          clarified.amount
        ) <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            'Valid amount could not be detected',

        });

      }


      // ======================================
      // SUPPLIER MATCH
      // ======================================

      if (
        clarified.account_type ===
        'supplier'
      ) {

        const match =
          await findSupplierByName(
            businessOwnerId,
            clarified.person_name
          );


        console.log(
          '🏪 Supplier Match:',
          match
        );


        return res.json({

          success: true,

          needs_clarification:
            false,

          transaction: {

            ...clarified,

            user_id:
              businessOwnerId,

          },

          match,

        });

      }


      // ======================================
      // CUSTOMER MATCH
      // ======================================

      if (
        clarified.account_type ===
        'customer'
      ) {

        const match =
          await findCustomerByName(
            businessOwnerId,
            clarified.person_name
          );


        console.log(
          '👤 Customer Match:',
          match
        );


        return res.json({

          success: true,

          needs_clarification:
            false,

          transaction: {

            ...clarified,

            user_id:
              businessOwnerId,

          },

          match,

        });

      }


      // ======================================
      // INVALID ACCOUNT
      // ======================================

      return res.status(400).json({

        success: false,

        message:
          'Invalid account type',

      });

    } catch (error) {

      console.error(
        '❌ Voice Clarify Error:',
        error
      );


      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError'
      ) {

        return res.status(401).json({

          success: false,

          message:
            'Authentication failed',

        });

      }


      if (
        error.statusCode === 403
      ) {

        return res.status(403).json({

          success: false,

          message:
            'You do not have permission to use voice',

        });

      }


      return res.status(500).json({

        success: false,

        message:
          'Failed to clarify voice transaction',

        error:
          error.message,

      });

    }

  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports = router;
