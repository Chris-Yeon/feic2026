const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================================================================
// 1. Supabase Initialization (Backend Only)
// ==============================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '\x1b[33m⚠️ Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.\n' +
    'Please copy .env.example to .env and configure your credentials.\x1b[0m'
  );
}

const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// ==============================================================================
// 2. Middlewares
// ==============================================================================
// Capture raw request body for Paystack HMAC-SHA512 webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static frontend files (index.html, feic2019.html, assets, public folder)
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Optional route alias for register page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// ==============================================================================
// 3. API Routes
// ==============================================================================

/**
 * GET /api/config
 * Returns public configuration safe for the browser (e.g. Paystack Public Key).
 * NEVER expose secret keys or service_role keys here!
 */
app.get('/api/config', (req, res) => {
  res.json({
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || ''
  });
});

/**
 * POST /api/register
 * Creates a new registration record in Supabase with default status 'registered' (unpaid).
 */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, affiliation, category } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required fields.'
      });
    }

    const { data, error } = await supabase
      .from('registrations')
      .insert([
        {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone ? phone.trim() : null,
          affiliation: affiliation ? affiliation.trim() : null,
          category: category || 'Standard Delegate',
          status: 'registered' // default status until verified webhook confirmation
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase registration error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create registration record in database.',
        error: error.message
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Registration created successfully.',
      registration: data
    });
  } catch (err) {
    console.error('Unexpected error in /api/register:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

/**
 * POST /api/paystack/init
 * Calls Paystack API to initialize a transaction with registration metadata.
 */
app.post('/api/paystack/init', async (req, res) => {
  try {
    const { registration_id, email, amount, currency } = req.body;

    if (!registration_id || !email || !amount) {
      return res.status(400).json({
        success: false,
        message: 'registration_id, email, and amount are required.'
      });
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Server error: PAYSTACK_SECRET_KEY is not configured.'
      });
    }

    // Verify registration exists in database
    const { data: reg, error: regError } = await supabase
      .from('registrations')
      .select('id, name, email, status')
      .eq('id', registration_id)
      .single();

    if (regError || !reg) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found for the provided ID.'
      });
    }

    // Paystack expects amount in lowest currency unit (kobo for NGN, cents for USD)
    const amountInSubunits = Math.round(Number(amount) * 100);
    const selectedCurrency = currency || 'NGN';
    const callbackUrl = `${process.env.APP_URL || `http://localhost:${PORT}`}/?payment_status=check&reg_id=${registration_id}`;

    // Payload sent to Paystack
    const paystackPayload = {
      email: email.trim().toLowerCase(),
      amount: amountInSubunits,
      currency: selectedCurrency,
      callback_url: callbackUrl,
      metadata: {
        registration_id: registration_id,
        registrant_name: reg.name,
        custom_fields: [
          {
            display_name: 'Registration ID',
            variable_name: 'registration_id',
            value: registration_id
          },
          {
            display_name: 'Registrant Name',
            variable_name: 'registrant_name',
            value: reg.name
          }
        ]
      }
    };

    // Call Paystack Transaction Initialize API
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paystackPayload)
    });

    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      console.error('Paystack initialization error:', paystackData);
      return res.status(paystackResponse.status || 400).json({
        success: false,
        message: paystackData.message || 'Failed to initialize Paystack transaction.'
      });
    }

    // Returns authorization_url, access_code, and reference
    return res.json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference: paystackData.data.reference
    });
  } catch (err) {
    console.error('Unexpected error in /api/paystack/init:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during payment initialization.'
    });
  }
});

/**
 * POST /api/paystack/webhook
 * Receives webhook events from Paystack.
 * SECURITY:
 * 1. Verifies HMAC-SHA512 signature using x-paystack-signature header and PAYSTACK_SECRET_KEY.
 * 2. ONLY marks registration as 'paid' upon a verified 'charge.success' event.
 */
app.post('/api/paystack/webhook', async (req, res) => {
  try {
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      console.error('Webhook error: PAYSTACK_SECRET_KEY missing.');
      return res.status(500).send('Server misconfiguration: Secret key missing.');
    }

    // 1. Verify Paystack Signature
    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      console.warn('Webhook rejected: Missing x-paystack-signature header.');
      return res.status(400).send('Missing signature header.');
    }

    // Calculate expected hash using raw request buffer
    const rawBodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedHash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(rawBodyBuffer)
      .digest('hex');

    if (signature !== expectedHash) {
      console.warn('Webhook rejected: Invalid signature mismatch.');
      return res.status(401).send('Invalid webhook signature.');
    }

    // 2. Process Event
    const event = req.body;
    console.log(`[Paystack Webhook] Received verified event: ${event.event} (${event.data?.reference})`);

    if (event.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;
      const amountInBaseCurrency = Number(data.amount) / 100;
      const currency = data.currency;
      const status = data.status; // 'success'
      const paystackId = data.id;
      const paidAt = data.paid_at || new Date().toISOString();
      const channel = data.channel || 'card';

      // Retrieve registration_id from metadata
      const registrationId = data.metadata?.registration_id;

      if (!registrationId) {
        console.warn(`[Paystack Webhook] charge.success event missing metadata.registration_id for ref ${reference}`);
        // Still acknowledge webhook receipt to Paystack
        return res.status(200).send('Webhook received, but missing registration_id metadata.');
      }

      // Check if payment reference already recorded (prevent duplicates)
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('reference', reference)
        .maybeSingle();

      if (!existingPayment) {
        // A. Insert into payments table
        const { error: paymentInsertError } = await supabase
          .from('payments')
          .insert([
            {
              registration_id: registrationId,
              amount: amountInBaseCurrency,
              currency: currency,
              reference: reference,
              status: status,
              paystack_id: paystackId,
              paid_at: paidAt,
              channel: channel
            }
          ]);

        if (paymentInsertError) {
          console.error('[Paystack Webhook] Error inserting payment record:', paymentInsertError);
        } else {
          console.log(`[Paystack Webhook] Payment record saved for ref: ${reference}`);
        }
      }

      // B. Update registration status to 'paid'
      const { error: regUpdateError } = await supabase
        .from('registrations')
        .update({ status: 'paid' })
        .eq('id', registrationId);

      if (regUpdateError) {
        console.error('[Paystack Webhook] Error updating registration status to paid:', regUpdateError);
      } else {
        console.log(`[Paystack Webhook] Registration ${registrationId} marked as 'paid'.`);
      }
    }

    // Always respond with 200 OK to Paystack
    return res.status(200).send('Webhook processed successfully.');
  } catch (err) {
    console.error('Error handling Paystack webhook:', err);
    return res.status(500).send('Internal server error.');
  }
});

/**
 * GET /api/registration-status/:id
 * Allows frontend to query registration payment status (e.g. for polling after inline payment)
 */
app.get('/api/registration-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('registrations')
      .select('id, name, email, status, created_at')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }

    return res.json({ success: true, registration: data });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

/**
 * Health Check Endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'FEIC 2026 Registration & Paystack Payment Service'
  });
});

// ==============================================================================
// 4. Start Server
// ==============================================================================
app.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`🚀 FEIC 2026 Registration Server running at http://localhost:${PORT}`);
  console.log(`📄 Main Conference Page: http://localhost:${PORT}/index.html`);
  console.log(`📝 Standalone Register Page: http://localhost:${PORT}/register`);
  console.log(`🔗 Paystack Webhook Endpoint: http://localhost:${PORT}/api/paystack/webhook`);
  console.log(`========================================================\n`);
});
