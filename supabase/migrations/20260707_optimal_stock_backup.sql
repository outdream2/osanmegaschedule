-- 적정재고 백업 컬럼 + RPC 함수
-- 목적:
--   1. ERP 엑셀 임포트 시 optimal_stock 이 wipe 되는 것을 방어
--   2. 인라인 편집으로 optimal_stock 이 변동되면 backup 컬럼에 자동 저장
--   3. 임포트 완료 후 backup → optimal_stock 복원 (RPC 호출)
--
-- 주의: products.optimal_stock 은 xlsx 임포트로 인해 text 타입임.
--       backup 컬럼도 text 로 통일해 캐스팅 없이 seed/restore 가능하도록.

-- (1) 백업 컬럼: text 로 유지 (기존에 numeric 으로 잘못 생성돼 있으면 자동 변환)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS optimal_stock_backup text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'products'
       AND column_name = 'optimal_stock_backup'
       AND data_type NOT IN ('text')
  ) THEN
    ALTER TABLE products
      ALTER COLUMN optimal_stock_backup TYPE text
      USING optimal_stock_backup::text;
  END IF;
END $$;

-- (2) 최초 1회 seed: 기존 optimal_stock 값을 backup 컬럼으로 복사
--     (backup 이 null 인 행만, 기존 값이 있는 경우)
UPDATE products
   SET optimal_stock_backup = optimal_stock
 WHERE optimal_stock_backup IS NULL
   AND optimal_stock IS NOT NULL;

-- (3) 임포트 후 backup → main 복원용 RPC
CREATE OR REPLACE FUNCTION restore_optimal_stock_from_backup()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE products
     SET optimal_stock = optimal_stock_backup
   WHERE optimal_stock_backup IS NOT NULL
     AND (optimal_stock IS DISTINCT FROM optimal_stock_backup);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
