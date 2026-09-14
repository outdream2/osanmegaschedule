-- 2026-09-14 · #129 · 카드별 결제내역 · 한도·캐시백 컬럼 추가
--   · 사용자 지시 · 카드별 결제내역 · 차월 예정·한도·캐시백 통합 뷰
--
-- 파괴 X · ADD COLUMN IF NOT EXISTS · 안전
-- 실행 방법 · Supabase 콘솔 → SQL Editor → 아래 SQL 붙여넣기 → RUN

-- 1) credit_limit · 카드 한도 (원 단위) · null 허용
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS credit_limit BIGINT;

-- 2) cashback_rate · 캐시백율 (0.5 = 0.5%, 1.0 = 1%) · null 허용
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS cashback_rate NUMERIC(5, 2);

-- 3) 검증 (실행 후 아래 SELECT 로 확인)
-- SELECT id, issuer, alias, credit_limit, cashback_rate FROM credit_cards LIMIT 3;
