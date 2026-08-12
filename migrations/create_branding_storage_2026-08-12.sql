-- 2026-08-12 · 프레임워크 준비 · Supabase Storage 'branding' 버킷 신설
-- 실행 방법: Supabase Dashboard → SQL Editor → 아래 SQL 복사·붙여넣기 → Run
--
-- 용도:
--   · 로고·favicon·도장 이미지·카카오QR 등 · 브랜딩 자산 저장
--   · 관리자가 BrandingSettingsPage 에서 업로드 · public URL 반환
--   · brand_identity / contact_info / stamps_map (app_settings key) 에 URL 저장
--
-- 정책:
--   · 읽기: 누구나 (public read · 로고는 로그인 전 랜딩에도 노출)
--   · 쓰기: 인증된 사용자 중 · level ≥ 2 (매니저 이상 · 관리자 UI 접근 계정)
--   · 삭제: 인증된 사용자 중 · level ≥ 9 (최고관리자만)

-- 1) 버킷 생성 (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  524288,  -- 512KB 파일 상한 (로고·아이콘·도장은 대부분 100KB 이하)
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) 읽기 정책 · 누구나 SELECT
DROP POLICY IF EXISTS "branding_read_public" ON storage.objects;
CREATE POLICY "branding_read_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding');

-- 3) 업로드 정책 · 인증 필요
--   (level 체크는 서버 API 에서 별도 검증 · 여기선 익명 방지만)
DROP POLICY IF EXISTS "branding_insert_auth" ON storage.objects;
CREATE POLICY "branding_insert_auth" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND auth.role() = 'authenticated');

-- 4) 업데이트 정책 · 인증 필요
DROP POLICY IF EXISTS "branding_update_auth" ON storage.objects;
CREATE POLICY "branding_update_auth" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'branding' AND auth.role() = 'authenticated');

-- 5) 삭제 정책 · 인증 필요
DROP POLICY IF EXISTS "branding_delete_auth" ON storage.objects;
CREATE POLICY "branding_delete_auth" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'branding' AND auth.role() = 'authenticated');

-- 확인:
--   SELECT * FROM storage.buckets WHERE id = 'branding';
--   SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE 'branding_%';
