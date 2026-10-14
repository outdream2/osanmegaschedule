-- 2026-10-12 · 사용자 지시 "같은 데이터는 덮어써야지 · 이런 일 없도록"
-- purchase_details · business key UNIQUE constraint 추가
--
-- 배경:
--   · ERP 자동 sync (apps/sync-agent/src/main/buySyncService.ts) 가 매일 돌면서
--     같은 매입 건 (purchase_date, product_code, quantity, unit_price, amount) 을
--     반복 INSERT · 중복 row 수백 건 누적
--   · 기존 identity constraint 는 (bm_code, row_num) · ERP 가 매 sync 마다
--     다른 bm_code/row_num 할당 → 중복 방지 실패
--
-- 조치:
--   1. 중복 row 먼저 삭제 (scripts/dedupe-purchase-details-2026-10-12.mjs --write 선 실행 필수)
--   2. 이 migration · business key UNIQUE constraint 추가
--   3. 이후 UPSERT onConflict 가 작동 · 같은 매입 재sync 시 skip
--
-- 선 조건:
--   DELETE FROM purchase_details · 중복 완료 상태여야 UNIQUE 추가 성공
--   중복 상태로 ADD CONSTRAINT 시 즉시 실패 (23505)

-- business key UNIQUE constraint
ALTER TABLE purchase_details
  ADD CONSTRAINT purchase_details_business_key_uniq
  UNIQUE (purchase_date, product_code, quantity, unit_price, amount);

-- 2026-10-12 · 추가 안전장치 · index on business key (UNIQUE 자동 생성되지만 명시)
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_details_business_key
--   ON purchase_details (purchase_date, product_code, quantity, unit_price, amount);
