-- ═══════════════════════════════════════════════════════════════════
-- 2026-09-02 · #69 · 카드 결제 관리 · credit_cards 테이블 신규
--   · 사용자 지시 · 매장>결제>결제카드등록 & 카드별 결제내역 신규 탭용
--   · 결제일 · 활성여부 · 카드사·별칭·뒷4자리 등록
--   · supplier_payments.card_id FK · optional · 카드 매핑 (기존 결제는 null 유지)
--   · 실행 · Supabase SQL Editor · idempotent (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- 1. credit_cards · 등록된 카드 마스터
CREATE TABLE IF NOT EXISTS credit_cards (
  id           SERIAL PRIMARY KEY,
  issuer       TEXT NOT NULL,             -- 카드사 (BC · 국민 · 삼성 · 현대 · 신한 · 롯데 · 하나 · 우리 · 농협 · 씨티 · 기타)
  alias        TEXT NULL,                 -- 별칭 (예: '법인 삼성 SDI', '개인 국민 체크')
  last4        VARCHAR(4) NULL,           -- 뒷 4자리
  billing_day  INT NOT NULL DEFAULT 15    -- 결제일 (1-31)
    CHECK (billing_day BETWEEN 1 AND 31),
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_active
  ON credit_cards (active) WHERE active = TRUE;

COMMENT ON TABLE  credit_cards IS '카드 결제 관리 · 등록된 카드 마스터';
COMMENT ON COLUMN credit_cards.issuer      IS '카드사 (BC · 국민 · 삼성 · 현대 · 신한 · 롯데 · 하나 · 우리 · 농협 · 씨티 · 기타)';
COMMENT ON COLUMN credit_cards.alias       IS '별칭 · 사용자 지정 (예: 법인 삼성 SDI)';
COMMENT ON COLUMN credit_cards.last4       IS '카드 번호 뒷 4자리 (마스킹용 · 조회 시 XXXX-XXXX-XXXX-1234 형태)';
COMMENT ON COLUMN credit_cards.billing_day IS '결제일 (1-31) · 다음달 결제 예정액 계산 기준';

-- 2. supplier_payments.card_id · optional FK (기존 결제 호환 · nullable)
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS card_id INT NULL
    REFERENCES credit_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_card_id
  ON supplier_payments (card_id) WHERE card_id IS NOT NULL;

COMMENT ON COLUMN supplier_payments.card_id IS
  '결제 카드 FK · credit_cards.id · 결제방법=card 시 · nullable (구버전 결제 호환)';

-- ═══════════════════════════════════════════════════════════════════
-- 검증
--   SELECT * FROM credit_cards ORDER BY id;
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'credit_cards' ORDER BY ordinal_position;
-- ═══════════════════════════════════════════════════════════════════
