-- stock_history 에 시작재고일 컬럼 추가
-- 목적: 임포트 UI 에서 사용자가 명시적으로 입력한 시작재고일을 저장
--       (기존에는 snapshot_date=종료재고일 + period_type=초/중/하순만 저장)
--
-- 이 컬럼은 nullable · 구 DB 도 그대로 동작 (서버는 컬럼 미존재 시 자동 fallback)

ALTER TABLE public.stock_history
  ADD COLUMN IF NOT EXISTS period_start_date DATE;

-- 조회용 인덱스 (범위 aggregation 시 사용)
CREATE INDEX IF NOT EXISTS stock_history_period_start_idx
  ON public.stock_history (period_start_date DESC);

NOTIFY pgrst, 'reload schema';
