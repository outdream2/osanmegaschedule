-- ===================================================================
-- T-C: contract_clauses 테이블 생성 (2026-08-05)
--
-- 목적: 근로계약서 각 호(조항) 내용을 localStorage 대신 서버 저장
-- 대상: 임금단서, 근로시간, 휴일, 징계, 기타, 개인정보 6종
--
-- 실행: Supabase 대시보드 -> SQL Editor -> 붙여넣기 -> Run
-- 안전: CREATE TABLE IF NOT EXISTS (중복 실행 무해)
-- ===================================================================

CREATE TABLE IF NOT EXISTS contract_clauses (
  clause_key   TEXT PRIMARY KEY,
  content      JSONB NOT NULL,
  updated_by   INT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  contract_clauses IS '근로계약서 각 호 CMS (임금단서/근로시간/휴일/징계/기타/개인정보)';
COMMENT ON COLUMN contract_clauses.clause_key IS 'wageClauses / workTimeClauses / holidayClauses / disciplineClauses / etcClauses / privacyClauses';
COMMENT ON COLUMN contract_clauses.content    IS '각 조항 배열 (문자열 배열)';

CREATE INDEX IF NOT EXISTS idx_contract_clauses_updated
  ON contract_clauses(updated_at DESC);

-- 검증: SELECT * FROM contract_clauses;
