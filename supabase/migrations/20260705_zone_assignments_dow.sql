-- Add day-of-week mask to zone_assignments so DisplayPage can support
-- "요일별 다중선택 담당구역" (매장관리 요일별 다중선택).
--
-- dow_map semantics:
--   NULL              → 모든 요일 적용 (기본, 하위호환)
--   { "*":     mask } → 단일 배정 시: 마스크만 적용
--   { "이름1": maskA, "이름2": maskB } → 다중 배정(36/42 등) 시 이름별 마스크
--
-- 마스크 비트 (Date.getDay() 기준):
--   0b0000001 = 1   → 일요일
--   0b0000010 = 2   → 월요일
--   0b0000100 = 4   → 화요일
--   0b0001000 = 8   → 수요일
--   0b0010000 = 16  → 목요일
--   0b0100000 = 32  → 금요일
--   0b1000000 = 64  → 토요일
--   0b1111111 = 127 → 모든 요일

ALTER TABLE zone_assignments
  ADD COLUMN IF NOT EXISTS dow_map JSONB DEFAULT NULL;

COMMENT ON COLUMN zone_assignments.dow_map IS
  'DOW mask. NULL = 모든 요일. {"*":mask} 또는 {"이름":mask,...}';
