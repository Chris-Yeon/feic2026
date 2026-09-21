# FEIC 2026 — Event Registration & Payment Paywall Integration

This project integrates **Supabase** (PostgreSQL Database) and **Paystack** (Payment Gateway) for the **Faculty of Engineering International Conference (FEIC 2026)** at the University of Lagos.

---

## 📁 Project Structure & Adaptation

Your project has been structured so you can run the full Node.js/Express backend while seamlessly serving both the comprehensive FEIC 2026 conference site and dedicated registration endpoints:

```text
C:\Users\USER\.gemini\antigravity\scratch\feic2026\
├── server.js               # Node.js + Express backend (Supabase client & Paystack API/webhook)
├── package.json            # Backend dependencies (@supabase/supabase-js, express, cors, dotenv)
├── .env.example            # Environment variable template with documentation
├── .env                    # Your private credentials (NEVER commit to git!)
├── .gitignore              # Ignores .env and node_modules/
├── schema.sql              # Supabase table creation script
├── index.html              # Main conference site with integrated registration & Paystack paywall
├── feic2019.html           # Past conference archive page
├── public/
│   └── register.html       # Standalone registration & payment form
└── README.md               # Complete setup, testing, and deployment guide
```

---

## 1. Supabase Setup & Database Tables

### Step 1.1: Create a Free Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **"New Project"**, name it `FEIC 2026`, choose a strong database password and select a region near your users (e.g. Europe/West or US).

### Step 1.2: Run the SQL Schema
1. In your Supabase project dashboard, navigate to the **SQL Editor** (icon on the left sidebar: `>_`).
2. Click **"New Query"**.
3. Copy and paste the following SQL (also available in `schema.sql`) and click **Run**:

```sql
-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    affiliation TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'registered', -- 'registered' (unpaid) or 'paid'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NGN',
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,                     -- 'success', 'failed', etc.
    paystack_id BIGINT,
    paid_at TIMESTAMPTZ,
    channel TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON public.payments(registration_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
```

---

## 2. Environment Variables & Security Rules

Create your local `.env` file by copying the template:

```bash
cp .env.example .env
```

Fill in your actual credentials:

```env
PORT=3000
APP_URL=http://localhost:3000

# Supabase Credentials (Supabase Dashboard -> Project Settings -> API)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Paystack Credentials (Paystack Dashboard -> Settings -> API Keys & Webhooks)
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 🔒 Which Keys Go Where? (Security Rules)

| Key | Location | Allowed in Frontend? | Purpose |
|---|---|:---:|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `.env` (Backend Only) | ❌ **NEVER** | Bypasses RLS to insert/update rows from the server. Exposing this grants full administrative control over your database! |
| `PAYSTACK_SECRET_KEY` | `.env` (Backend Only) | ❌ **NEVER** | Used by `server.js` to initialize transactions and verify HMAC-SHA512 webhook signatures. |
| `SUPABASE_URL` | `.env` (Backend Only) | ⚠️ Backend | Your database API endpoint URL. |
| `PAYSTACK_PUBLIC_KEY` | Frontend / `.env` | ✅ **SAFE** | Used by browser client JS (`PaystackPop.setup`) to render the payment popup. |

---

## 3. How the Endpoints Work

### `POST /api/register`
- Inserts a new registrant into `public.registrations` with status `'registered'`.
- Returns `{ success: true, registration: { id, name, email, ... } }`.

### `POST /api/paystack/init`
- Receives `registration_id`, `email`, `amount`, and `currency`.
- Calls Paystack's `https://api.paystack.co/transaction/initialize`.
- Passes `metadata: { registration_id }` so Paystack attaches your database registration ID to the transaction.
- Returns `{ success: true, authorization_url, access_code, reference }`.

### `POST /api/paystack/webhook` (The Source of Truth)
- Reads the raw request body and verifies `x-paystack-signature` using HMAC-SHA512 with `PAYSTACK_SECRET_KEY`.
- Rejects invalid requests with `401 Unauthorized`.
- On `charge.success`:
  1. Inserts the transaction record into `public.payments`.
  2. Updates the registrant's status in `public.registrations` to `'paid'`.
- **Note:** The frontend callback is only for user feedback; only the verified webhook marks someone as `'paid'`.

---

## 4. How to Test the Entire Flow Locally

### Step 4.1: Install Node.js Dependencies
If Node.js is installed on your computer:
```bash
npm install
npm start
```
The server will start at `http://localhost:3000`.

### Step 4.2: Expose Your Local Server with ngrok
Because Paystack needs to send webhook HTTP POST requests to your machine, you must expose your local port 3000 to the internet:

1. Download or install ngrok (from [https://ngrok.com](https://ngrok.com)):
   ```bash
   ngrok http 3000
   ```
2. ngrok will display a public HTTPS forwarding address, for example:
   `https://a1b2-34-56-78-90.ngrok-free.app`

### Step 4.3: Set the Webhook URL in Paystack Dashboard
1. Log in to your [Paystack Dashboard](https://dashboard.paystack.com).
2. Go to **Settings** (gear icon at the bottom left) $\rightarrow$ **API Keys & Webhooks**.
3. Under **Webhook URL** (for Test Mode):
   Enter:
   ```text
   https://YOUR-NGROK-SUBDOMAIN.ngrok-free.app/api/paystack/webhook
   ```
4. Click **Save Changes**.

### Step 4.4: Perform a Test Registration & Payment
1. Open your browser to `http://localhost:3000` (or `http://localhost:3000/register`).
2. Click **Pay Now** on any tier (e.g. National Student $\enclose{horizontalstrike}{\text{N}}30,000$).
3. Fill in your name, email, and institution in the modal.
4. When the Paystack popup appears, click the **"Success"** test payment button (in Test Mode, Paystack lets you simulate a successful card or transfer payment without real money).
5. Look at your `server.js` terminal:
   ```text
   [Paystack Webhook] Received verified event: charge.success (FEIC2026-...)
   [Paystack Webhook] Payment record saved for ref: FEIC2026-...
   [Paystack Webhook] Registration xxxxxxxx-xxxx-xxxx-xxxx marked as 'paid'.
   ```

---

## 5. How to View Registrants & Payments in Supabase

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click on the **Table Editor** (the spreadsheet/table icon on the left navigation bar).
3. Select the **`registrations`** table:
   - You will see each registrant's `id`, `name`, `email`, `phone`, `affiliation`, `category`, and `status`.
   - Before payment, `status` shows `registered`.
   - As soon as the Paystack webhook triggers, it updates to `paid`!
4. Select the **`payments`** table:
   - You will see the matching payment row with `amount`, `currency`, `reference`, `paystack_id`, `channel`, and `paid_at`.
   - The `registration_id` column links directly to the registrant.
