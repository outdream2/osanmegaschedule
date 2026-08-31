-- ═══════════════════════════════════════════════════════════════════
-- reservations 테이블 신규 CREATE · 방문예약 기능 정상화
-- 작성일: 2026-08-31
-- 사용자 승인: A안 선택 · vendor_id BIGINT (vendors.id 타입 일치)
--
-- 원인:
--   · reservations 테이블 CREATE 마이그레이션 · 어떤 파일에도 존재하지 않음
--   · 20260824_reservations_vendor_id.sql · ALTER 뿐 · 테이블 없어 실행 불가
--   · GET/POST /api/reservations 매 호출 500 (PGRST205)
--
-- 실행: Supabase Dashboard > SQL Editor
-- idempotent · IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reservations (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date         TEXT        NOT NULL,                -- 'YYYY-MM-DD'
  time         TEXT        NOT NULL,                -- 'HH:MM' 등
  company      TEXT        NOT NULL,
  contact_name TEXT        NOT NULL,
  phone        TEXT        NOT NULL,
  purpose      TEXT        NOT NULL,
  note         TEXT        NOT NULL DEFAULT '',
  vendor_id    BIGINT      NULL,                    -- vendors.id (BIGINT) · nullable · 일반 예약 NULL
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 조회 인덱스 · date 기준 필터가 기본 (GET /api/reservations?date=...)
CREATE INDEX IF NOT EXISTS idx_reservations_date
  ON reservations (date);

-- 조회 인덱스 · vendor_id (공급사 예약 조회)
CREATE INDEX IF NOT EXISTS idx_reservations_vendor_id
  ON reservations (vendor_id)
  WHERE vendor_id IS NOT NULL;

-- 코멘트
COMMENT ON TABLE  reservations              IS '거래처 방문 예약 · GET·POST /api/reservations';
COMMENT ON COLUMN reservations.date         IS 'YYYY-MM-DD';
COMMENT ON COLUMN reservations.time         IS '방문 시각 · HH:MM';
COMMENT ON COLUMN reservations.vendor_id    IS 'vendors.id (BIGINT) 참조 · nullable · 일반 예약은 NULL';
COMMENT ON COLUMN reservations.purpose      IS '방문 목적';

-- ═══════════════════════════════════════════════════════════════════
-- 확인 SQL (실행 후)
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'reservations'
--  ORDER BY ordinal_position;
--
-- SELECT * FROM reservations LIMIT 5;

-- ═══════════════════════════════════════════════════════════════════
-- 참고
-- ═══════════════════════════════════════════════════════════════════
-- · 20260824_reservations_vendor_id.sql (UUID 컬럼 ALTER) · 실행 금지 · 이 파일이 대체
-- · 서버 코드 · vendorId: number 유지 · Zod z.number() · DTO 무변경
-- · FK 활성화 (선택) · 아래 주석 해제 후 실행:
-- ALTER TABLE reservations
--   ADD CONSTRAINT reservations_vendor_id_fkey
--   FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
