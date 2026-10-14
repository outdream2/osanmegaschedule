-- 2026-10-12 · 사용자 지시 · "연차" → "휴가" 전수 교체 (DB 마이그레이션)
--   · 코드 LEAVE_TYPES 변경 완료 (휴가 · 반차 · 오전반차 · 오후반차 · 월차 · 병가 · 특별휴가)
--   · 기존 DB leave_type = '연차' row 를 '휴가' 로 UPDATE
--
-- 영향 테이블: leave_requests
--   · leave_type TEXT 컬럼 · 값 '연차' → '휴가' 치환
--
-- 안전 체크 (실행 전 확인):
--   1. 백업 완료 여부 (Supabase project > Database > Backups)
--   2. 대상 row 수 사전 조회:
--      SELECT COUNT(*) FROM leave_requests WHERE leave_type = '연차';
--   3. staging 환경 테스트 후 production 반영
--
-- 롤백 SQL (필요 시):
--   UPDATE leave_requests SET leave_type = '연차' WHERE leave_type = '휴가';
--   (단 · 신규 '휴가' 신청과 섞이면 구분 불가 · 복구 전 2026-10-12 00:00 이전 데이터만 롤백 권장)

-- ────────────────────────────────────────────────────────────
-- 1. 사전 조회 (실행 전 수동 확인)
-- ────────────────────────────────────────────────────────────
-- SELECT leave_type, COUNT(*) FROM leave_requests GROUP BY leave_type ORDER BY leave_type;
-- SELECT COUNT(*) AS 영향_row_수 FROM leave_requests WHERE leave_type = '연차';

-- ────────────────────────────────────────────────────────────
-- 2. 실제 UPDATE · leave_requests
-- ────────────────────────────────────────────────────────────
UPDATE leave_requests
SET leave_type = '휴가'
WHERE leave_type = '연차';

-- ────────────────────────────────────────────────────────────
-- 3. 검증 쿼리 (실행 후 수동 확인)
-- ────────────────────────────────────────────────────────────
-- SELECT leave_type, COUNT(*) FROM leave_requests GROUP BY leave_type ORDER BY leave_type;
--   · 기대 결과 · '연차' 0건 · '휴가' = 이전 '연차' count

-- 참고: schedules 테이블 안 '연차' type 은 **ScheduleCell/SchedulePage 자동생성** 로직 미사용 (사용자 수동 설정만)
--   · 필요 시 추가 UPDATE: UPDATE schedules SET type = '휴가' WHERE type = '연차';
--   · 단, 스케줄 color 매핑 (useSettings · scheduleColorScheme) 재확인 필요
