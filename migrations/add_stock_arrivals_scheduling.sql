-- 입고 알림 예약 발송 지원
ALTER TABLE stock_arrivals
  ADD COLUMN IF NOT EXISTS scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS broadcast_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- 기존 즉시 발송 데이터는 이미 전송됐으므로 sent 처리
UPDATE stock_arrivals SET broadcast_sent = TRUE WHERE scheduled_at IS NULL;
