-- 2026-09-08 · inventory_checks · 상세 진열위치 JSONB 컬럼 추가
--   · 진열장 안 3자리 위치 (층·칸·순서 · 예 "332" = 3층 3칸 2번째)
--   · JSONB · 매장 무제한 확장 (매장4·5 추가 시 스키마 변경 불필요)
--   · 예 · {"store1":"332","store2":"212","warehouse1":"105"}
--   · 매장 저장 시 상세위치 필수 (서버 validation)
--   · 창고 상세위치 선택
ALTER TABLE inventory_checks
  ADD COLUMN IF NOT EXISTS shelf_positions JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN inventory_checks.shelf_positions IS
  '위치별 상세 진열위치 · JSON key=location code (store1·warehouse1 등) · value=3자리 (층·칸·순서)';
