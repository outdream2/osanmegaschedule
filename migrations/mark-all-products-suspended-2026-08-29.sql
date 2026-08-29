-- 2026-08-29 · 사용자 지시 · A안 · 신규 임포트 전 · 기존 상품 전체 · sale_status='판매중지' 마킹
--   · 이후 · 새 엑셀 임포트 (기존 UI 사용) · upsert · 엑셀에 있는 code 만 · sale_status='판매중' 로 갱신
--   · 엑셀에 없는 code · 판매중지 유지 → 랜딩 재고확인 · 미노출
--
-- 안전성:
--   · sale_status 컬럼만 변경 · 다른 컬럼·참조 데이터 (매입·재고·발주 등) · 절대 유지
--   · TRUNCATE X · DELETE X · CASCADE X · 데이터 손실 없음
--   · 롤백 · updated_at 조회로 언제 변경됐는지 확인 가능
--
-- 실행: Supabase 대시보드 · SQL Editor

-- ────────────────────────────────────────────────────────────────
-- Step 1 · 사전 카운트 (참고용)
-- ────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE sale_status = '판매중') AS active_before,
  COUNT(*) FILTER (WHERE sale_status = '판매중지') AS suspended_before
FROM products;

-- ────────────────────────────────────────────────────────────────
-- Step 2 · 전체 · 판매중지 마킹
--   · 이미 판매중지 아닌 행만 UPDATE (변경 최소화)
--   · 2026-08-29 fix · products 테이블 · updated_at 컬럼 없음 확인 · sale_status 만 UPDATE
-- ────────────────────────────────────────────────────────────────
UPDATE products
SET sale_status = '판매중지'
WHERE sale_status IS DISTINCT FROM '판매중지';

-- ────────────────────────────────────────────────────────────────
-- Step 3 · 사후 카운트 (검증)
-- ────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE sale_status = '판매중') AS active_after,
  COUNT(*) FILTER (WHERE sale_status = '판매중지') AS suspended_after
FROM products;

-- ────────────────────────────────────────────────────────────────
-- 다음 단계 · 사용자 액션
-- ────────────────────────────────────────────────────────────────
-- 1. 관리자 로그인 후 · 랜딩 페이지 · [데이터 업로드] 메뉴 클릭
-- 2. 새 상품 xlsx 파일 선택 · 업로드
-- 3. 서버 · /api/upload-products · upsert (onConflict=product_code)
--    · 엑셀에 있는 code · sale_status 등 · 엑셀 값으로 갱신 (판매중 or 엑셀 값)
--    · 엑셀에 없는 code (예: 중복 페리비타 광동제약) · 판매중지 유지
-- 4. 랜딩 · 재고확인 · '페리비타' 검색 · 1건만 표시 확인
