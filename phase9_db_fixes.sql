-- StockShot — Phase 9: DB constraint + type fixes
-- Run this in the Supabase SQL editor.
-- Fixes the 409 errors caused by stale CHECK constraint and look_order type mismatch.

-- ── STEP 1: Diagnostic — read this output before/after ────────────────────────

-- Show current constraints on stock_items
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'stock_items'::regclass
ORDER BY conname;

-- Show current constraints on shoots
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'shoots'::regclass
ORDER BY conname;

-- Show look_order column type
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'shoots' AND column_name = 'look_order';

-- Show RLS status on both tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('shoots', 'stock_items');

-- Show existing RLS policies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('shoots', 'stock_items')
ORDER BY tablename, policyname;


-- ── STEP 2: Fix custody_location CHECK constraint ─────────────────────────────
-- The app sends 'at_client' but the DB only allows old values.

-- Drop old constraint (if it exists)
ALTER TABLE stock_items DROP CONSTRAINT IF EXISTS stock_items_custody_location_check;

-- Add new constraint with current app values
ALTER TABLE stock_items
  ADD CONSTRAINT stock_items_custody_location_check
  CHECK (custody_location IN ('at_client', 'in_transit', 'at_studio'));

-- Also update the DEFAULT to match
ALTER TABLE stock_items ALTER COLUMN custody_location SET DEFAULT 'at_client';

-- Migrate any existing rows that still use old location values
UPDATE stock_items SET custody_location = 'at_client'
WHERE custody_location IN ('with_client', 'dispatched_to_client');


-- ── STEP 3: Fix look_order column type ────────────────────────────────────────
-- Phase 1 trigger used integer[] but backfill used jsonb — inconsistent.
-- Normalise to jsonb so the JS client can write plain arrays without casting issues.

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT udt_name INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'shoots' AND column_name = 'look_order';

  IF col_type = '_int4' OR col_type = '_int2' OR col_type = '_int8' THEN
    -- Convert integer[] → jsonb
    EXECUTE 'ALTER TABLE shoots ALTER COLUMN look_order TYPE jsonb USING to_jsonb(look_order)';
    RAISE NOTICE 'look_order converted from % to jsonb', col_type;
  ELSE
    RAISE NOTICE 'look_order is already %, no conversion needed', col_type;
  END IF;
END $$;

-- Ensure default is a valid empty jsonb array
ALTER TABLE shoots ALTER COLUMN look_order SET DEFAULT '[]'::jsonb;

-- Patch any NULLs
UPDATE shoots SET look_order = '[]'::jsonb WHERE look_order IS NULL;


-- ── STEP 4: Ensure shoots.id has a unique index (required for ON CONFLICT) ─────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'shoots' AND indexname = 'shoots_pkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'shoots' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%id%'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS shoots_id_unique ON shoots(id);
    RAISE NOTICE 'Created unique index on shoots.id';
  ELSE
    RAISE NOTICE 'shoots.id already has a unique/primary key index';
  END IF;
END $$;


-- ── STEP 5: Re-run diagnostic to confirm fixes ────────────────────────────────

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'stock_items'::regclass
ORDER BY conname;

SELECT column_name, data_type, udt_name, column_default
FROM information_schema.columns
WHERE table_name = 'shoots' AND column_name = 'look_order';
