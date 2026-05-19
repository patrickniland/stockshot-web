-- StockShot — Phase 8: Make Unassigned-shoot trigger idempotent
-- Run this in the Supabase SQL editor BEFORE deploying Phase 8 app code.
-- Adds a NOT EXISTS guard so the trigger never creates duplicate Unassigned shoots.

CREATE OR REPLACE FUNCTION create_unassigned_shoot_for_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM shoots WHERE client_id = NEW.id AND is_unassigned = true
  ) THEN
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
