-- 20260910_vendors_company_name_unique.sql
-- #41 · vendors 테이블 · company_name UNIQUE 제약 추가
-- 2026-09-10 · 사용자 지시
--
-- ⚠️ 실행 순서:
--   1) Step 1 (SELECT) · 중복 존재 확인
--   2) Step 2 (DELETE) · 중복 있으면 · 사용자 검토 후 실행 (BACKUP 필수)
--   3) Step 3 (ALTER TABLE) · UNIQUE 제약 추가

-- ═══════════════════════════════════════════════════════════
-- Step 1 · 중복 검사 (먼저 실행 · 결과 확인)
-- ═══════════════════════════════════════════════════════════
SELECT company_name, COUNT(*) AS cnt
FROM vendors
WHERE company_name IS NOT NULL
GROUP BY company_name
HAVING COUNT(*) > 1
ORDER BY cnt DESC, company_name;

-- ═══════════════════════════════════════════════════════════
-- Step 2 · 중복 정리 (Step 1 결과 검토 후 · 필요할 때만 실행)
--   · id 값이 가장 작은 row (가장 오래된) 유지 · 나머지 삭제
--   · 실행 전 · vendors 테이블 백업 필수
--   · 삭제될 row 를 · 먼저 SELECT 로 미리보기 (아래 주석 해제)
-- ═══════════════════════════════════════════════════════════

-- Step 2a · 삭제 대상 미리보기 (필수 · 먼저 확인)
-- SELECT v.id, v.company_name, v.created_at
-- FROM vendors v
-- WHERE EXISTS (
--   SELECT 1 FROM vendors v2
--   WHERE v2.company_name = v.company_name
--     AND v2.id < v.id
-- )
-- ORDER BY v.company_name, v.id;

-- Step 2b · 실제 삭제 (Step 2a 검토 후 · 안전 확인 시)
-- DELETE FROM vendors v
-- WHERE EXISTS (
--   SELECT 1 FROM vendors v2
--   WHERE v2.company_name = v.company_name
--     AND v2.id < v.id
-- );

-- ═══════════════════════════════════════════════════════════
-- Step 3 · UNIQUE 제약 추가 (Step 1 이 0건 · 또는 Step 2 후)
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE vendors
-- ADD CONSTRAINT vendors_company_name_unique UNIQUE (company_name);

-- ═══════════════════════════════════════════════════════════
-- 검증 · 제약 추가 후 · 성공 확인
-- ═══════════════════════════════════════════════════════════
-- SELECT conname, contype
-- FROM pg_constraint
-- WHERE conrelid = 'vendors'::regclass
--   AND conname = 'vendors_company_name_unique';
