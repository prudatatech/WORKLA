-- Add unique constraints to allow upserts to work correctly in the Provider App
-- This fixes the issue specifically where document uploads succeed but DB records are not created.

-- 1. Ensure provider_documents has a unique constraint on (provider_id, document_type)
-- First, clean up any duplicates if they exist (keep the latest)
DELETE FROM public.provider_documents a
USING public.provider_documents b
WHERE a.id < b.id
  AND a.provider_id = b.provider_id
  AND a.document_type = b.document_type;

ALTER TABLE public.provider_documents
ADD CONSTRAINT provider_documents_provider_type_unique UNIQUE (provider_id, document_type);

-- 2. Ensure provider_bank_accounts has a unique constraint on provider_id
-- First, clean up any duplicates if they exist (keep the latest)
DELETE FROM public.provider_bank_accounts a
USING public.provider_bank_accounts b
WHERE a.id < b.id
  AND a.provider_id = b.provider_id;

ALTER TABLE public.provider_bank_accounts
ADD CONSTRAINT provider_bank_accounts_provider_id_unique UNIQUE (provider_id);
