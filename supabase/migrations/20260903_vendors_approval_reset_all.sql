-- 2026-09-03 · 거래처 승인 flow fix (v2 · NOT NULL 제거 추가)
--   · 사용자 리포트 · "전부 approved네 안돼" + "default값이 승인됨이 되면 안되지"
--   · "관리자에게 승인요청을 하고. 관리자가 승인을 하면. 승인되어야지"
--
-- 원인
--   · migrations/20260823_vendor_approval_flow.sql:18 · NOT NULL DEFAULT 'approved'
--   · 신규 vendor INSERT · 자동 'approved' · 승인 요청 flow 완전 우회
--
-- 정상 flow
--   1. Vendor 등록 (또는 OCR 자동생성) · approval_status = NULL
--   2. Vendor 로그인 · 공급사 정보 5필드 채움 (email·사업자번호·팀장 이름·팀장 연락처·긴급 연락처)
--   3. Vendor · [승인 요청] 클릭 · approval_status = 'pending'
--   4. 관리자 · RequestsPage 거래처승인 탭 · 승인 → approval_status = 'approved' · approved_at = NOW()
--
-- Fix 3-step (실행 순서 중요)

-- Step 1 · NOT NULL 제거 (NULL 허용 필수 · 다음 UPDATE 를 위해)
ALTER TABLE vendors
  ALTER COLUMN approval_status DROP NOT NULL;

-- Step 2 · DEFAULT 제거 (신규 INSERT 자동 승인 방지)
ALTER TABLE vendors
  ALTER COLUMN approval_status DROP DEFAULT;

-- Step 3 · 실제 승인 이력 없는 vendor · approval_status NULL 리셋
--   · 관리자가 실제 승인 (approved_at 존재) 한 것만 유지
UPDATE vendors
   SET approval_status = NULL,
       approved_at = NULL,
       approved_by = NULL,
       approval_requested_at = NULL
 WHERE approved_at IS NULL;

-- 검증
SELECT
  COALESCE(approval_status::text, '(NULL · 승인 요청 필요)') AS status,
  COUNT(*) AS count
FROM vendors
GROUP BY approval_status
ORDER BY count DESC;
-- 기대 · 대부분 (NULL) · 실제 승인된 소수만 approved

-- 컬럼 상태 확인
SELECT column_name, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'vendors' AND column_name = 'approval_status';
-- 기대 · column_default=NULL · is_nullable=YES
