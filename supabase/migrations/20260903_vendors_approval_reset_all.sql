-- 2026-09-03 · 거래처 승인 flow fix · 사용자 리포트 · "전부 approved네 안돼"
--
-- 원인 · vendor INSERT 시 approval_status 명시 안 함 · DB default 'approved'
--   or · 이전 migration seed 로 자동 승인 → 승인 요청 flow 완전 우회
-- 증상 · vendor 정보 다 채워도 [승인 요청] 버튼 안 보임
--
-- Fix 3-step
--   1. 실제 승인 이력 없는 vendor · approval_status NULL 리셋
--   2. 컬럼 default 제거 · 신규 vendor 자동 승인 방지
--   3. 서버 코드 · vendors.insert 시 approval_status: null 명시 (별도 커밋)

-- Step 1 · approved 지만 승인 이력(approved_at) 없는 vendor · 리셋
--   · 실제 관리자 승인한 vendor 는 유지 (approved_at IS NOT NULL)
UPDATE vendors
   SET approval_status = NULL,
       approved_at = NULL,
       approved_by = NULL
 WHERE approved_at IS NULL;

-- Step 2 · 컬럼 default 제거 (있을 경우)
--   · 신규 INSERT · approval_status 명시 안 하면 · NULL 로 저장
--   · Vendor 가 정보 채운 후 · [승인 요청] 버튼 클릭 · pending 전환
--   · 관리자 · RequestsPage 거래처승인 탭 · 승인/거절
ALTER TABLE vendors
  ALTER COLUMN approval_status DROP DEFAULT;

-- 검증
SELECT
  COALESCE(approval_status, '(NULL)') AS status,
  COUNT(*) AS count
FROM vendors
GROUP BY approval_status
ORDER BY count DESC;
-- 기대 · 대부분 (NULL) · 실제 승인된 소수만 approved

-- 이후 vendor flow
--   1. vendor 로그인 · 담당자 폰 · 비밀번호
--   2. 공급사 정보 모달 · 5필드 입력 (email·사업자번호·팀장 이름·팀장 연락처·긴급 연락처)
--   3. [승인 요청] 버튼 활성 · 클릭 · pending 전환
--   4. 관리자 · RequestsPage 거래처승인 탭 · 승인 → approved
--   5. vendor · 공급사 재고확인 등 승인 후 기능 활성
