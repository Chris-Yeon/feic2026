-- ==============================================================================
-- FEIC 2026 SUPABASE DATABASE SCHEMA
-- Instructions: Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Enable pgcrypto / uuid extension for automatic UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Registrations Table
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    affiliation TEXT,
    category TEXT,
    receipt_path TEXT,
    fee_amount NUMERIC(12, 2),
    fee_currency TEXT,
    status TEXT NOT NULL DEFAULT 'registered', -- 'registered' (unpaid) or 'paid'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add receipt and fee columns to existing registrations tables as well.
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS affiliation TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS receipt_path TEXT;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2);
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS fee_currency TEXT;

-- 3. Create Payments Table
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

-- 4. Create Indexes for High Performance
CREATE INDEX IF NOT EXISTS idx_registrations_email ON public.registrations(email);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON public.registrations(status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_registration_id ON public.payments(registration_id);

-- 5. Row Level Security (RLS)
-- It is best practice to enable RLS.
-- Since the backend uses SUPABASE_SERVICE_ROLE_KEY, it automatically bypasses RLS
-- while preventing any unauthorized anonymous/client queries from tampering with data.
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- If you want authenticated admins or service roles to read, default service_role has full access.
