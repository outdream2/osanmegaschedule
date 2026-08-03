-- migrations/create_employee_contracts.sql
-- 2026-08-03 · #202 · 근로계약서 승인 · DB 저장 (PDF)
--
-- 사용:
--   1) Supabase 대시보드 → SQL Editor → 아래 전체 실행
--   2) Storage 버킷 "contracts" 를 대시보드에서 수동 생성 (Public 권장 · 다운로드 UX 단순)
--      · Private 이면 서버에서 signed URL 발급 로직 추가 필요
--
-- 목적:
--   - 근로계약서 작성 완료 · 승인 시 PDF 파일을 Supabase Storage 에 업로드
--   - 이력을 employee_contracts 에 저장
--   - employees.contract_file_url 을 최신 PDF URL 로 자동 갱신 (StaffManagePage [보기] 버튼용)

CREATE TABLE IF NOT EXISTS employee_contracts (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   INT NOT NULL,
  employee_name TEXT NOT NULL,
  contract_type TEXT,
  start_date    DATE,
  end_date      DATE,
  pdf_url       TEXT NOT NULL,
  pdf_size      INT,
  storage_path  TEXT,
  storage       TEXT,                 -- "supabase" | "local"
  approved_by   TEXT,                 -- 승인자 이름 (감사용)
  approved_by_id INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ec_employee ON employee_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_ec_created  ON employee_contracts(created_at DESC);
