-- 2026-08-29 · #200 · 미사용 파생 테이블 제거 (Tier A · 안전 · 0회 사용)
--   · 사용자 대원칙 · 기존 임포트 테이블 우선 · 파생 아주 꼭 필요치 않으면 X · 미사용 제거
--   · Explore agent 조사 (2026-08-29) · 서버·클라 코드 grep count 0회
--   · Supabase 대시보드 SQL Editor 에서 실행 · 실행 전 · 스냅샷 백업 권장

-- ────────────────────────────────────────────────────────────────
-- 1. stock_reconciliation_sessions + stock_reconciliation_items
--    · 정의 위치: migrations/audit-fix.sql:14-47
--    · 근거: 코드 미사용 · 폐기됨
-- ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS stock_reconciliation_items CASCADE;
DROP TABLE IF EXISTS stock_reconciliation_sessions CASCADE;

-- ────────────────────────────────────────────────────────────────
-- 2. order_dispatches
--    · 정의 위치: migrations/audit-fix.sql:62
--    · 근거: 컬럼 구조 미확정 (주석: "dispatch 구조 미확정" L66-67) · 실제 데이터 없음
-- ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS order_dispatches CASCADE;

-- ────────────────────────────────────────────────────────────────
-- 3. supplier_payment_allocations
--    · 정의 위치: docs/supabase_functions_and_tables.sql
--    · 근거: 생성 정의만 · 실제 코드 미사용
-- ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS supplier_payment_allocations CASCADE;

-- ────────────────────────────────────────────────────────────────
-- 실행 후 확인
--   · Supabase 대시보드 · Table Editor · 위 4개 테이블 · 사라졌는지 확인
--   · 서버 재시작 후 · 오류 로그 없는지 확인 (사실 코드에서 사용 안 함 · 안전)
-- ────────────────────────────────────────────────────────────────

-- 보류 (Tier B · 사용자 승인 후 별도 실행)
--   · zone_mismatches (4회 사용 · 매번 동기화 가능 · 검토 필요)
--   · ocr_deleted_rows (3회 · 감사 추적 · 비즈니스 요구 확인 필요)
--   · hr_forms (2회 · 계약서 이력)

-- 보류 (Tier C · 유지 필수)
--   · anon_push_subscriptions · stock_arrivals (알림 기능 필수)
