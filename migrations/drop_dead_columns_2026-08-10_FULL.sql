-- drop_dead_columns_2026-08-10_FULL.sql
-- 2026-08-10 · 전수 감사 결과 · 참조 0건 확인된 항목만 DROP
-- 근거: docs/DB_DEAD_COLUMNS_2026-08-10_FULL.md
--
-- 실행: Supabase SQL Editor 에 붙여넣기 · Run
-- 안전: IF EXISTS · 중복 실행 무해 (idempotent)
-- 이전 SQL 중복 없음: drop_dead_columns_2026-08-10.sql 과 대상 동일 · 병합본

-- ============================================================
-- 1. 컬럼 DROP (참조 0건 확인)
-- ============================================================

-- ocr_supplier_aliases.canonical
--   audit-fix.sql 에서 추가 · SELECT/INSERT 참조 0건 확인
ALTER TABLE ocr_supplier_aliases DROP COLUMN IF EXISTS canonical;

-- zone_assignments.dow
--   audit-fix.sql 에서 추가 · dow 로직은 zone_dow_templates 전담 · 참조 0건
ALTER TABLE zone_assignments DROP COLUMN IF EXISTS dow;

-- ocr_confirmed_items.invoice_date_new
--   db_improvements_top3.sql 의 TEXT→DATE 이관 중간 컬럼
--   RENAME 완료(→ invoice_date) 후 잔존 · 참조 0건
ALTER TABLE ocr_confirmed_items DROP COLUMN IF EXISTS invoice_date_new;

-- ============================================================
-- 2. 테이블 DROP (참조 0건 · 라우터 미생성)
-- ============================================================

-- stock_reconciliation_items (sessions FK 의존 → 먼저 DROP)
DROP TABLE IF EXISTS stock_reconciliation_items CASCADE;

-- stock_reconciliation_sessions
DROP TABLE IF EXISTS stock_reconciliation_sessions CASCADE;

-- ============================================================
-- 확인 쿼리 (실행 후 수동 검증)
-- ============================================================
-- SELECT column_name
--   FROM information_schema.columns
--  WHERE table_name IN ('ocr_supplier_aliases','zone_assignments','ocr_confirmed_items')
--  ORDER BY table_name, column_name;
--
-- SELECT table_name
--   FROM information_schema.tables
--  WHERE table_name LIKE 'stock_reconciliation%';
-- (위 쿼리 결과가 0행이면 정상)

-- ============================================================
-- 별도 처리 필요 (이 파일에서 제외 · 사용자 확인 후)
-- ============================================================
-- resignation_requests.signature_data_url
--   → Supabase Storage 이관 100% 완료 후 별도 마이그레이션
--   → 현재 코드(ResignationApprovalPage.tsx) 에서 여전히 <img src={r.signature_data_url}> 표시 중
--
-- inventory_checks.warehouse_stock
--   → warehouse1_stock 으로 코드 전환 완료 후 별도 마이그레이션
--   → 현재 server/routes/display/requests.ts:729 fallback 미러 로직 잔존
