-- 2026-10-06 · order purchase resolution workflow
--
-- Purpose:
--   Separate match_status (automatic matching result + user override)
--   from resolution_status (business resolution of exceptions).
--
--   Example: quantity shortage (match_status=exception, exception_type=qty_short)
--     -> staff marks resolved after confirming "supplier out of stock, no restock"
--        (resolution_status=resolved)
--
-- Principles:
--   - resolved is NOT the same as matched (match_status is preserved)
--   - no backfill of existing rows (NULL means open)
--   - exception_note (why it is an exception) and resolution_note (how it was handled) are separate
--
-- Impact:
--   - adds 4 nullable columns + 1 CHECK constraint
--   - no changes to existing columns
--   - all existing rows start as resolution_status = NULL (= open)
--   - no impact on existing matching flow

BEGIN;

ALTER TABLE public.order_requests
  ADD COLUMN IF NOT EXISTS resolution_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS resolved_by       INT NULL,
  ADD COLUMN IF NOT EXISTS resolution_note   TEXT NULL;

-- CHECK constraint: allow only NULL (open) or 'resolved'
-- DROP first for idempotent re-run safety.
ALTER TABLE public.order_requests
  DROP CONSTRAINT IF EXISTS order_requests_resolution_status_check;

ALTER TABLE public.order_requests
  ADD CONSTRAINT order_requests_resolution_status_check
  CHECK (
    resolution_status IS NULL
    OR resolution_status = 'resolved'
  );

COMMENT ON COLUMN public.order_requests.resolution_status IS
  'Business resolution status - NULL = open - resolved = processed - independent from match_status';

COMMENT ON COLUMN public.order_requests.resolved_at IS
  'Resolution timestamp - must not be overwritten by ERP sync';

COMMENT ON COLUMN public.order_requests.resolved_by IS
  'Resolver employee_id';

COMMENT ON COLUMN public.order_requests.resolution_note IS
  'Resolution free-text note - distinct from exception_note';

COMMIT;

-- Verification query (run separately after COMMIT):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'order_requests'
--      AND column_name IN ('resolution_status','resolved_at','resolved_by','resolution_note');
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.order_requests'::regclass
--      AND conname = 'order_requests_resolution_status_check';
