-- StockShot — Phase 1: Custody Model Migration
-- Run this in the Supabase SQL editor.
-- Safe to re-run: uses IF EXISTS / IF NOT EXISTS guards.

-- ── 1.1  Wipe existing data ───────────────────────────────────────────────────

TRUNCATE stock_items CASCADE;
TRUNCATE shoots CASCADE;
-- Organisations, org_members, and clients are preserved.


-- ── 1.2  Modify stock_items ───────────────────────────────────────────────────

-- Remove old status columns
ALTER TABLE stock_items DROP COLUMN IF EXISTS status;
ALTER TABLE stock_items DROP COLUMN IF EXISTS received_at;
ALTER TABLE stock_items DROP COLUMN IF EXISTS dispatched_at;
ALTER TABLE stock_items DROP COLUMN IF EXISTS dispatched_to;

-- Add custody columns
ALTER TABLE stock_items
  ADD COLUMN IF NOT EXISTS custody_location    text        NOT NULL DEFAULT 'with_client',
  ADD COLUMN IF NOT EXISTS custody_history     jsonb       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_scanned_at     timestamptz          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_scanned_by     text                 DEFAULT NULL;

-- Constrain custody_location to valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_items_custody_location_check'
  ) THEN
    ALTER TABLE stock_items
      ADD CONSTRAINT stock_items_custody_location_check
      CHECK (custody_location IN ('with_client', 'in_transit', 'at_studio', 'dispatched_to_client'));
  END IF;
END $$;


-- ── 1.3  Modify shoots ────────────────────────────────────────────────────────

ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS is_unassigned boolean NOT NULL DEFAULT false;


-- ── 1.4  Auto-create Unassigned shoot per client (trigger) ────────────────────

CREATE OR REPLACE FUNCTION create_unassigned_shoot_for_client()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO shoots (id, name, client_id, org_id, is_unassigned, drops, look_order, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    NEW.name || ' — Unassigned',
    NEW.id,
    NEW.org_id,
    true,
    '[]'::jsonb,
    ARRAY[]::integer[],
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_unassigned_shoot ON clients;
CREATE TRIGGER trigger_create_unassigned_shoot
  AFTER INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION create_unassigned_shoot_for_client();

-- Backfill: create Unassigned shoot for any existing clients that don't have one
INSERT INTO shoots (id, name, client_id, org_id, is_unassigned, drops, look_order, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.name || ' — Unassigned',
  c.id,
  c.org_id,
  true,
  '[]'::jsonb,
  '[]'::jsonb,
  NOW(),
  NOW()
FROM clients c
WHERE NOT EXISTS (
  SELECT 1 FROM shoots s
  WHERE s.client_id = c.id AND s.is_unassigned = true
);
