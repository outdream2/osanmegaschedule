-- 2026-09-09 · inventory_checks · product_code UNIQUE 제약 · 사용자 지시
--   · 실재고 · 상품별 하나 row 만 (마스터) · 이력 아닌 최신 상태
--   · 기존 중복 (예전 실재고 저장 로직으로 축적) · 최신 하나만 남기고 삭제
--
-- ⚠️ 파괴적 · 실행 전 백업 권장
-- 실행 순서 · 1 → 2 → 3 (Preview → DELETE → UNIQUE)

-- 1) Preview · 삭제 대상 개수 확인 (실행만 · 삭제 X)
-- WITH ranked AS (
--   SELECT id, product_code,
--          ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY checked_at DESC) AS rn
--   FROM inventory_checks
-- )
-- SELECT COUNT(*) AS to_delete FROM ranked WHERE rn > 1;

-- 2) 중복 정리 · 각 상품별 · 최신 checked_at row 1개만 유지
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY product_code ORDER BY checked_at DESC) AS rn
  FROM inventory_checks
)
DELETE FROM inventory_checks
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) UNIQUE 제약 · 앞으로 DB 레벨 중복 원천 차단
ALTER TABLE inventory_checks
  ADD CONSTRAINT inventory_checks_product_code_uniq UNIQUE (product_code);
