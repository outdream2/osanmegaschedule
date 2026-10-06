-- 2026-10-06 · 사용자 지시 · 매입 단가변동 관리 · review workflow
--   · identity = purchase_details.id (NOT (bm_code,row_num) · legacy xlsx 66% NULL 이므로)
--   · AUTO 판정 (PRICE_INCREASE/DECREASE) 과 MANUAL status (PENDING/CONFIRMED_CHANGE/
--     NEEDS_CHECK/RESOLVED) 완전 분리 · 자동 결과 수정 금지
--   · stale detection: review 당시 snapshot 과 현재 variance 가 다르면 effective = PENDING
--     (section 15 사용자 지시 · 사용자 처리 완료 후 ERP CHANGED 로 가격 재갱신 시 안전장치)

CREATE TABLE IF NOT EXISTS purchase_price_reviews (
  purchase_detail_id BIGINT PRIMARY KEY
    REFERENCES purchase_details(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED_CHANGE', 'NEEDS_CHECK', 'RESOLVED')),
  note TEXT NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  -- stale detection snapshot (사용자 섹션 15)
  --   review 당시 어떤 variance 를 사람이 봤는지 audit · price authority 아님
  reviewed_previous_purchase_detail_id BIGINT NULL,
  reviewed_previous_price NUMERIC NULL,
  reviewed_current_price NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_review_status ON purchase_price_reviews(status);
CREATE INDEX IF NOT EXISTS idx_price_review_reviewed_at ON purchase_price_reviews(reviewed_at DESC)
  WHERE reviewed_at IS NOT NULL;
