-- 2026-09-03 v6 · 거래처 승인 flow 최종 · 사용자 결정 · registered 로 default
--
-- 4-state
--   registered · 등록됨 (default · vendor 신규 등록 시)
--   requested  · 승인 요청됨 (vendor · 정보 채우고 [승인 요청] 클릭)
--   approved   · 승인됨 (관리자 처리)
--   rejected   · 거절됨 (관리자 처리)
--
-- 하위호환 · 기존 'pending' 값 · 시스템에 남아있어도 안전 (조회 조건은 requested 로 이관)

-- Step 1 · ENUM 값 추가 (기존 pending·approved·rejected 유지 · 신규 registered·requested 추가)
ALTER TYPE vendor_approval_status ADD VALUE IF NOT EXISTS 'registered';
ALTER TYPE vendor_approval_status ADD VALUE IF NOT EXISTS 'requested';

-- Step 2 · DEFAULT 를 registered 로 (NOT NULL 유지)
ALTER TABLE vendors ALTER COLUMN approval_status SET DEFAULT 'registered';

-- Step 3 · 모든 vendor · registered 로 강제 리셋 (사용자 지시 · 전체)
UPDATE vendors
   SET approval_status = 'registered',
       approved_at = NULL,
       approved_by = NULL,
       approval_requested_at = NULL;

-- Step 4 · 하위호환 · 기존 pending 값이 있다면 requested 로 migrate (안전)
UPDATE vendors SET approval_status = 'requested' WHERE approval_status = 'pending';

-- 인덱스 · pending 대신 requested 사용
DROP INDEX IF EXISTS idx_vendors_approval_status_pending;
CREATE INDEX IF NOT EXISTS idx_vendors_approval_status_requested
  ON vendors (approval_status)
  WHERE approval_status = 'requested';

-- 검증
SELECT approval_status::text AS status, COUNT(*) AS count
  FROM vendors
 GROUP BY approval_status
 ORDER BY count DESC;
-- 기대 · registered 전체 (사용자 지시 · 강제 리셋)

-- 컬럼 상태 확인
SELECT column_name, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'vendors' AND column_name = 'approval_status';
-- 기대 · column_default='registered'::vendor_approval_status · is_nullable=NO
