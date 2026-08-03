-- =============================================================
-- migrations/db_top4_signature_storage.sql
-- 생성일: 2026-08-03
-- 용도: Priority 4 · signature_data_url → Supabase Storage 이관
--
-- 변경 내용:
--   1. resignation_requests 에 signature_url TEXT 컬럼 추가
--      (Storage 오브젝트 퍼블릭 URL 저장용)
--   2. 기존 signature_data_url 은 deprecated 유지 (하위 호환)
--      → 추후 데이터 마이그레이션 완료 후 별도 태스크에서 DROP
--
-- 실행: Supabase SQL Editor 에 붙여넣고 Run
-- 멱등성: IF NOT EXISTS · 재실행 안전
-- 롤백: 하단 ROLLBACK 블록 참조
--
-- Supabase Storage 버킷 설정 (대시보드에서 1회 수동 작업):
--   버킷 이름  : resignation-signatures
--   접근 방식  : Public (서명 이미지 단순 URL 접근 · 비밀 정보 없음)
--   파일 크기  : 2MB 이하 권장 (PNG 기준)
--   허용 MIME : image/png, image/jpeg, image/webp
-- =============================================================

-- 1. signature_url 컬럼 추가 (멱등)
ALTER TABLE resignation_requests
  ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- 2. 기존 signature_data_url 컬럼 · 소형 코멘트 추가 (메타 문서화)
--    COMMENT 는 재실행 안전 (OR REPLACE 불필요)
COMMENT ON COLUMN resignation_requests.signature_data_url
  IS 'deprecated 2026-08-03 · Supabase Storage 이관 완료 후 DROP 예정 · 신규 레코드는 signature_url 사용';

COMMENT ON COLUMN resignation_requests.signature_url
  IS 'Supabase Storage 퍼블릭 URL · 버킷: resignation-signatures · 없으면 NULL';

-- 3. 인덱스 불필요 (URL 필터 조회 없음)

-- =============================================================
-- ROLLBACK (실행 전 신규 레코드가 없을 때만 안전)
-- ALTER TABLE resignation_requests DROP COLUMN IF EXISTS signature_url;
-- =============================================================
