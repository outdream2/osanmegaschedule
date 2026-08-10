-- 2026-08-10 · 발주요청 → 발주완료 라이프사이클 통합
--   기존 order_requests 테이블 확장 (A안)
--   status 로 발주요청 (requested) · 발주완료 (ordered) · 취소 (cancelled) 구분
--   같은 order_number 를 공유하는 라인들 = 하나의 발주서
--
-- 실행: Supabase SQL Editor 에 붙여넣기 후 Run
-- 안전: ADD COLUMN IF NOT EXISTS · 중복 실행 무해
-- 회귀: 기존 컬럼·인덱스 미변경 · 기존 라우터 정상 동작

ALTER TABLE order_requests
  ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS order_number     TEXT,
  ADD COLUMN IF NOT EXISTS order_qty        INTEGER,
  ADD COLUMN IF NOT EXISTS unit_price       INTEGER,
  ADD COLUMN IF NOT EXISTS supplier         TEXT,
  ADD COLUMN IF NOT EXISTS supplier_contact TEXT,
  ADD COLUMN IF NOT EXISTS supplier_email   TEXT,
  ADD COLUMN IF NOT EXISTS supplier_phone   TEXT,
  ADD COLUMN IF NOT EXISTS order_date       DATE,
  ADD COLUMN IF NOT EXISTS desired_arrival  DATE,
  ADD COLUMN IF NOT EXISTS memo             TEXT,
  ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ;

-- 조회 인덱스
-- 1) 발주서 번호로 그룹 조회 (같은 발주서 라인들 모으기)
CREATE INDEX IF NOT EXISTS order_requests_order_number_idx
  ON order_requests (order_number)
  WHERE order_number IS NOT NULL;

-- 2) 발주이력 탭 · 발주완료만 · 최신순
CREATE INDEX IF NOT EXISTS order_requests_status_sent_at_idx
  ON order_requests (status, sent_at DESC NULLS LAST);

-- 3) 공급사별 발주완료 조회
CREATE INDEX IF NOT EXISTS order_requests_supplier_sent_at_idx
  ON order_requests (supplier, sent_at DESC NULLS LAST)
  WHERE status = 'ordered';

-- 기존 row · status 채우기 (하위 호환)
--   기존 요청 · 발주 정보 없음 → 'requested' 로 세팅
UPDATE order_requests
   SET status = 'requested'
 WHERE status IS NULL;

-- 상태 값 정의:
--   'requested' · 발주요청 (기본 · 좌측 발주요청 리스트에 노출)
--   'ordered'   · 발주완료 (발주이력 탭 · 우측에 노출)
--   'cancelled' · 취소 (숨김)
--
-- 발주 완료 처리 (서버):
--   UPDATE order_requests
--      SET status='ordered', order_number=..., order_qty=..., unit_price=...,
--          supplier=..., supplier_contact=..., supplier_email=..., supplier_phone=...,
--          order_date=..., desired_arrival=..., memo=..., sent_at=NOW()
--    WHERE id IN (선택된 요청 ids);
