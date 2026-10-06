-- 2026-10-06 · PHASE 1 · FK constraints · schedule 영역 정합성
--
-- 적용 전 전제:
--   scripts/schedule-orphan-audit-2026-10-06.mjs 를 먼저 실행하여 orphan=0 확인 필수.
--
-- 포함 테이블:
--   [SAFE]    schedules.employeeId         → employees.id   ON DELETE RESTRICT
--   [BLOCKED] leave_requests.employee_id   → employees.id   (2026-10-06 audit 결과 · orphan 2건 존재 · 적용 금지)
--   [SAFE]    employee_contracts.employee_id → employees.id ON DELETE RESTRICT
--   [SAFE]    resignation_requests.employee_id → employees.id ON DELETE RESTRICT
--
-- 정책:
--   · ON DELETE CASCADE 절대 금지 (사용자 지시) · 역사적 데이터 보존.
--   · ON DELETE RESTRICT 로 삭제 시도 자체를 DB 레벨에서 차단 (서버 레이어 409 와 중복 안전장치).
--
-- 롤백:
--   ALTER TABLE schedules DROP CONSTRAINT fk_schedules_employee;
--   ALTER TABLE employee_contracts DROP CONSTRAINT fk_employee_contracts_employee;
--   ALTER TABLE resignation_requests DROP CONSTRAINT fk_resignation_requests_employee;

BEGIN;

-- [1] schedules.employeeId → employees.id
--   audit: schedules.total=3279 · orphan=0 → 안전
ALTER TABLE schedules
  ADD CONSTRAINT fk_schedules_employee
  FOREIGN KEY ("employeeId") REFERENCES employees(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- [2] employee_contracts.employee_id → employees.id
--   audit: employee_contracts.total=0 · orphan=0 → 안전 (현재 비어있지만 FK 선반영)
ALTER TABLE employee_contracts
  ADD CONSTRAINT fk_employee_contracts_employee
  FOREIGN KEY (employee_id) REFERENCES employees(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- [3] resignation_requests.employee_id → employees.id
--   audit: resignation_requests.total=0 · orphan=0 → 안전
ALTER TABLE resignation_requests
  ADD CONSTRAINT fk_resignation_requests_employee
  FOREIGN KEY (employee_id) REFERENCES employees(id)
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

-- [4] leave_requests.employee_id → employees.id
--   audit (2026-10-06 재확인): leave_requests.total=14 · orphan=2 (employee_id=999, employee_id=3)
--   PHASE 1.5 forensic (scripts/schedule-orphan-forensic-2026-10-06.mjs):
--     · 30277299-9ff9-4bfb-844d-75ac96b5f81b · employee_id=999 · 이름 "테스트" (mojibake) · 다른 활동 0건 · B 테스트 데이터 가능성 높음 (판별 불가 E 보류)
--     · 297371b0-c0fb-4706-b783-7a42414c299c · employee_id=3 · 이름 "박부장" · 다른 활동 0건 · E 판별 불가 (현재 employees.id=3 미존재)
--   → FK 추가 시 오류 발생 (orphan rows violate FK) · 적용 금지
--   → 사용자 승인 후 수동 orphan 처리 (삭제 or 유효 employee 로 재배정) 후 아래 블록 주석 해제하여 적용.
--   → 이름 유사도/fuzzy matching 금지. 명확한 증거 없는 자동 복원·재배정 금지.
--
-- ALTER TABLE leave_requests
--   ADD CONSTRAINT fk_leave_requests_employee
--   FOREIGN KEY (employee_id) REFERENCES employees(id)
--   ON DELETE RESTRICT
--   ON UPDATE RESTRICT;

COMMIT;

-- 검증 쿼리 (적용 후):
--   SELECT conname, conrelid::regclass, confrelid::regclass, confdeltype
--     FROM pg_constraint
--    WHERE conname LIKE 'fk_%_employee';
