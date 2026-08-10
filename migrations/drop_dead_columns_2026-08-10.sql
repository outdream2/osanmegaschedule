-- 2026-08-10 · Dead column/table 정리
--   `docs/DB_DEAD_COLUMNS_2026-08-10.md` 감사 결과 기반
--   참조 0건 확인된 컬럼·테이블 안전 삭제
--
-- 실행: Supabase SQL Editor 에 붙여넣기 · 순서대로
-- 안전: IF EXISTS · 중복 실행 무해
-- 회귀 위험: 없음 (참조 0 확인)
--
-- 실행 전 · 백업 권장:
--   pg_dump 또는 Supabase 대시보드 Database → Backups → 수동 백업

-- ============================================================
-- 1. 안전 삭제 · 참조 0건 (dead column)
-- ============================================================

-- 1-A. ocr_supplier_aliases.canonical · SELECT 시 미사용
ALTER TABLE ocr_supplier_aliases DROP COLUMN IF EXISTS canonical;

-- 1-B. zone_assignments.dow · dow 로직은 zone_dow_templates 에서
ALTER TABLE zone_assignments DROP COLUMN IF EXISTS dow;

-- 1-C. ocr_confirmed_items.invoice_date_new · TEXT→DATE 이관 중간 컬럼 · RENAME 완료 후 잔존
ALTER TABLE ocr_confirmed_items DROP COLUMN IF EXISTS invoice_date_new;

-- ============================================================
-- 2. 안전 삭제 · 테이블 전체 (라우터 미생성 · 참조 0)
-- ============================================================

-- 2-A. stock_reconciliation_items · session FK 의존
DROP TABLE IF EXISTS stock_reconciliation_items CASCADE;

-- 2-B. stock_reconciliation_sessions
DROP TABLE IF EXISTS stock_reconciliation_sessions CASCADE;

-- ============================================================
-- 확인 쿼리 (실행 후 수동 검증)
-- ============================================================
-- 컬럼 존재 여부 확인:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('ocr_supplier_aliases', 'zone_assignments', 'ocr_confirmed_items')
--     ORDER BY table_name, column_name;
--
-- 테이블 존재 여부 확인:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name LIKE 'stock_reconciliation%';

-- ============================================================
-- 별도 처리 · 검토 필요 (이 마이그레이션에서 제외)
-- ============================================================
-- resignation_requests.signature_data_url · Storage 이관 완료 확인 후 별도 마이그레이션
-- inventory_checks.warehouse_stock · warehouse1_stock 완전 전환 후 별도 마이그레이션
