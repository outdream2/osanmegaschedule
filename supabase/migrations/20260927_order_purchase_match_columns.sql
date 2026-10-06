-- 2026-09-27 · order_requests match tracking columns
--
-- Context:
--   Originally committed in server/routes/purchase/orderPurchaseMatch.ts (commit ee15ad2b)
--   but the matching migration file was never added to the repo. The server emits a
--   MIGRATION_REQUIRED guard until these columns exist.
--
--   This file restores the missing migration so the schema is reproducible on
--   a fresh database. Backdated to 2026-09-27 to match the original feature commit.
--
-- Scope:
--   Five nullable columns on public.order_requests + two CHECK constraints
--   enforcing the value domains that the application layer already assumes.
--
-- Columns:
--   match_status   - user match decision - NULL/matched/exception/unmatched
--   matched_at     - decision timestamp
--   matched_by     - decider employee_id
--   exception_type - qty_short/qty_over/price_diff/no_purchase (when exception)
--   exception_note - why it was marked exception (distinct from resolution_note)
--
-- Separation:
--   match_status is set by the user based on the auto_status computed server-side.
--   exception_note explains WHY. resolution_note (separate migration 20261006)
--   explains HOW it was handled.

BEGIN;

ALTER TABLE public.order_requests
  ADD COLUMN IF NOT EXISTS match_status   TEXT NULL,
  ADD COLUMN IF NOT EXISTS matched_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS matched_by     INT NULL,
  ADD COLUMN IF NOT EXISTS exception_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS exception_note TEXT NULL;

ALTER TABLE public.order_requests
  DROP CONSTRAINT IF EXISTS order_requests_match_status_check;

ALTER TABLE public.order_requests
  ADD CONSTRAINT order_requests_match_status_check
  CHECK (
    match_status IS NULL
    OR match_status IN ('matched', 'exception', 'unmatched')
  );

ALTER TABLE public.order_requests
  DROP CONSTRAINT IF EXISTS order_requests_exception_type_check;

ALTER TABLE public.order_requests
  ADD CONSTRAINT order_requests_exception_type_check
  CHECK (
    exception_type IS NULL
    OR exception_type IN ('qty_short', 'qty_over', 'price_diff', 'no_purchase')
  );

COMMENT ON COLUMN public.order_requests.match_status IS
  'User-set match result - NULL = undecided - matched/exception/unmatched - independent from auto_status (server-computed)';

COMMENT ON COLUMN public.order_requests.matched_at IS
  'Timestamp of user match decision';

COMMENT ON COLUMN public.order_requests.matched_by IS
  'User employee_id who made the match decision';

COMMENT ON COLUMN public.order_requests.exception_type IS
  'Exception type when match_status = exception - qty_short/qty_over/price_diff/no_purchase';

COMMENT ON COLUMN public.order_requests.exception_note IS
  'Free-text note explaining why marked as exception - distinct from resolution_note';

COMMIT;

-- Verification (run separately):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'order_requests'
--      AND column_name IN ('match_status','matched_at','matched_by','exception_type','exception_note');
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.order_requests'::regclass
--      AND conname IN ('order_requests_match_status_check','order_requests_exception_type_check');
