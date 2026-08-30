-- 2026-08-31 · #9/#130 차용등록 재설계 · Phase A
--   · docs/BORROWING_REDESIGN_2026-08-30.md 기준
--   · 사용자 승인 후 실행
--   · 안전 · 기존 borrowings 원본 무손상 · 확장만
--
-- 실행 · Supabase SQL editor 또는 supabase db push
-- 롤백 · 하단 주석 참조

BEGIN;

-- ═══════════════════════════════════════════════════════
-- 1) borrowing_parties (당사자 · 재사용 마스터)
--    · party_type · self (약국 직원) · vendor (등록 공급사) · external (외부 개인·기타)
--    · vendor_id/employee_id · 각각 FK · 자동 링크
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.borrowing_parties (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  party_type    TEXT NOT NULL CHECK (party_type IN ('self','vendor','external')),
  vendor_id     BIGINT REFERENCES vendors(id),
  employee_id   BIGINT REFERENCES employees(id),
  name          TEXT NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  memo          TEXT
);
CREATE INDEX IF NOT EXISTS idx_borrowing_parties_type   ON public.borrowing_parties(party_type);
CREATE INDEX IF NOT EXISTS idx_borrowing_parties_vendor ON public.borrowing_parties(vendor_id);
CREATE INDEX IF NOT EXISTS idx_borrowing_parties_emp    ON public.borrowing_parties(employee_id);

-- ═══════════════════════════════════════════════════════
-- 2) borrowing_signatures (서명·도장 감사 이력)
--    · role · lender · borrower · lender_return · borrower_return · witness
--    · IP·시각·intent_text · ESIGN/eIDAS 감사 증적
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.borrowing_signatures (
  id             BIGSERIAL PRIMARY KEY,
  borrowing_id   BIGINT NOT NULL REFERENCES borrowings(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('lender','borrower','lender_return','borrower_return','witness')),
  signer_name    TEXT NOT NULL,
  signer_id      BIGINT,
  party_id       BIGINT REFERENCES borrowing_parties(id),
  signature_url  TEXT NOT NULL,
  stamp_url      TEXT,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address     INET,
  user_agent     TEXT,
  intent_text    TEXT
);
CREATE INDEX IF NOT EXISTS idx_borrowing_sig_borrowing ON public.borrowing_signatures(borrowing_id);
CREATE INDEX IF NOT EXISTS idx_borrowing_sig_role      ON public.borrowing_signatures(role);

-- ═══════════════════════════════════════════════════════
-- 3) borrowings 확장 컬럼 (당사자 링크 + 계약번호 + 알림 이력)
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.borrowings
  ADD COLUMN IF NOT EXISTS lender_party_id     BIGINT REFERENCES borrowing_parties(id),
  ADD COLUMN IF NOT EXISTS borrower_party_id   BIGINT REFERENCES borrowing_parties(id),
  ADD COLUMN IF NOT EXISTS contract_no         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════
-- 4) v_borrowings_full 조회 view · JOIN 최소화
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_borrowings_full AS
SELECT
  b.*,
  lp.name          AS lender_name,
  lp.contact_name  AS lender_contact,
  lp.contact_phone AS lender_phone,
  bp.name          AS borrower_name,
  bp.contact_name  AS borrower_contact,
  bp.contact_phone AS borrower_phone,
  (SELECT jsonb_agg(row_to_json(s.*)) FROM borrowing_signatures s WHERE s.borrowing_id = b.id) AS signatures
FROM borrowings b
LEFT JOIN borrowing_parties lp ON lp.id = b.lender_party_id
LEFT JOIN borrowing_parties bp ON bp.id = b.borrower_party_id;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════
-- 롤백 (신규 테이블 · 컬럼만 제거 · 원본 borrowings 무손상)
-- ═══════════════════════════════════════════════════════
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_borrowings_full;
-- ALTER TABLE public.borrowings
--   DROP COLUMN IF EXISTS lender_party_id,
--   DROP COLUMN IF EXISTS borrower_party_id,
--   DROP COLUMN IF EXISTS contract_no,
--   DROP COLUMN IF EXISTS overdue_notified_at;
-- DROP TABLE IF EXISTS public.borrowing_signatures;
-- DROP TABLE IF EXISTS public.borrowing_parties;
-- COMMIT;
