-- migrations/20260921_drive_links.sql
-- 2026-09-21 · #327 · Google Drive 파일 업로드 · 링크 저장 (스펙 ②) + Supabase 폴백 (⑤)
--
-- 목적:
--   employee_contracts 에 · Drive 링크 (drive_file_url) 및 로컬 폴백 링크 (local_pdf_url) 분리 저장
--   기존 pdf_url · 최우선 사용 URL (drive > local > supabase) 유지 (하위 호환)
--   drive_file_url · Drive 성공 시에만 값 (검색·감사 용도)
--   local_pdf_url · Drive 실패 시 Supabase Storage 또는 로컬 fallback URL (관리자 알림 · 재업로드 유도)
--
-- 회귀 방지:
--   IF NOT EXISTS · 파괴적 SQL X · 원본 pdf_url 컬럼 보존
--   기존 code path (pdf_url 만 참조) 100% 동작 유지
--
-- 실행:
--   Supabase 대시보드 · SQL Editor · 아래 전체 실행

ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS drive_file_url TEXT;

ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS local_pdf_url TEXT;

-- Drive 링크 부분 인덱스 · 감사·재업로드 조회용
CREATE INDEX IF NOT EXISTS idx_employee_contracts_drive
  ON employee_contracts(drive_file_url)
  WHERE drive_file_url IS NOT NULL;

-- 폴백 대상 조회 인덱스 · 관리자 대시보드 · "Drive 실패 · 로컬만 있는 계약" 리스트
CREATE INDEX IF NOT EXISTS idx_employee_contracts_local_only
  ON employee_contracts(local_pdf_url)
  WHERE drive_file_url IS NULL AND local_pdf_url IS NOT NULL;

-- 확인 쿼리 (관리자 참고 · 실행 X)
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employee_contracts' AND column_name IN ('drive_file_url', 'local_pdf_url');
