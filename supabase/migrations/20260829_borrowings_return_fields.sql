-- 2026-08-29 · #130 A안 · 차용등록 재설계 Phase 1
-- 목적: 반환 시 서명·행위자·시각·비고 별도 저장 (감사 이력 완비)
-- 원칙: 기존 컬럼 유지 · ADD IF NOT EXISTS · 회귀 0
-- 실행: Supabase SQL Editor 에서 수동 실행

ALTER TABLE public.borrowings
  ADD COLUMN IF NOT EXISTS return_signature_url TEXT,
  ADD COLUMN IF NOT EXISTS returned_by          TEXT,
  ADD COLUMN IF NOT EXISTS returned_by_id       BIGINT,
  ADD COLUMN IF NOT EXISTS returned_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_note          TEXT;

CREATE INDEX IF NOT EXISTS idx_borrowings_returned_at
  ON public.borrowings (returned_at DESC);

NOTIFY pgrst, 'reload schema';

-- 검증 쿼리:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'borrowings' AND column_name LIKE '%return%';
