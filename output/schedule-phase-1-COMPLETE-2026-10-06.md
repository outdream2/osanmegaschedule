# SCHEDULE PHASE 1 COMPLETE — Final Closeout
# 2026-10-06

Supabase SQL Editor 수동 적용 (경로 B) → fresh verify PASS → PHASE 1 완전 종료.

---

## [DB FRESH VERIFY] (2026-10-06 · 12/12 PASS)

| ord | metric | value | expected | status |
|---|---|---|---|---|
| 1 | orphan_999_remaining | 0 | 0 | ✓ |
| 2 | orphan_bak_preserved | 1 | 1 | ✓ |
| 3 | source_leave_id_column | YES | YES | ✓ |
| 4 | source_leave_id_index | YES | YES | ✓ |
| 5 | approve_leave_request_rpc | YES | YES | ✓ |
| 6 | safe_backfill_rows | 3 | 3 | ✓ |
| 7 | remaining_null_leave_schedules | 5 | 5 | ✓ |
| 8 | dangling_source_leave_id | 0 | 0 | ✓ |
| 9 | fk_schedules_employee | YES | YES | ✓ |
| 10 | fk_employee_contracts_employee | YES | YES | ✓ |
| 11 | fk_resignation_requests_employee | YES | YES | ✓ |
| 12 | fk_schedules_source_leave | YES | YES | ✓ |

---

## [REGRESSION TEST] (vitest · 2026-10-06)

```
server/routes/daily/leave.phase1_5.test.ts  — 13 tests ✓
server/routes/daily/leave.phase1.test.ts    —  8 tests ✓
server/routes/schedule/schedules.test.ts    — 16 tests ✓

Total: 37 passed · 0 failed · Duration 331ms
```

- `npx tsc --noEmit` schedule/leave 영역 clean

---

## [KNOWN LEGACY ISSUE] · leave_requests employee FK DEFERRED

- row = `297371b0-c0fb-4706-b783-7a42414c299c` · `employee_id=3` · name snapshot `"박부장"`
- 다른 활동 0건 · 현재 `employees.id=3` 미존재
- action = **PRESERVE** (유사도 매칭 금지 · 수정 금지 · 삭제 금지)
- `leave_requests.employee_id → employees.id` FK = **BLOCKED_BY_HISTORICAL_ORPHAN**
- 향후 직원 원장/과거 자료로 실제 ID 확인 시 exact backfill 가능

---

## [APPLIED CHANGES]

### DB (Supabase SQL Editor 수동 적용 완료)
1. `DELETE FROM leave_requests WHERE id='30277299-...' AND employee_id=999` — 1 row 삭제
2. `ALTER TABLE schedules ADD COLUMN source_leave_id uuid NULL`
3. `CREATE INDEX idx_schedules_source_leave_id ON schedules(source_leave_id) WHERE source_leave_id IS NOT NULL`
4. `CREATE OR REPLACE FUNCTION approve_leave_request(...) RETURNS jsonb` — atomic PL/pgSQL RPC
5. `ALTER TABLE schedules ADD CONSTRAINT fk_schedules_employee FOREIGN KEY ("employeeId") REFERENCES employees(id) ON DELETE RESTRICT`
6. `ALTER TABLE employee_contracts ADD CONSTRAINT fk_employee_contracts_employee ... RESTRICT`
7. `ALTER TABLE resignation_requests ADD CONSTRAINT fk_resignation_requests_employee ... RESTRICT`
8. SAFE 3건 UPDATE (source_leave_id backfill · ambiguous 1 + unmapped 4 는 NULL 유지)
9. `ALTER TABLE schedules ADD CONSTRAINT fk_schedules_source_leave FOREIGN KEY (source_leave_id) REFERENCES leave_requests(id) ON DELETE RESTRICT`

### Code (local commit `7edac73b` · PHASE 1.5)
- `server/lib/scheduleLock.ts` — 공유 lock guard
- `server/routes/daily/leave.ts` — RPC canonical caller + legacy fallback 격리
- `server/routes/schedule/schedules.ts` — copy lock + guard 통일
- `server/services/scheduleService.ts` + `server/controllers/scheduleController.ts` — employee delete 409
- `src/components/StaffManagePage/StaffManagePage.tsx` + `src/lib/employeeApi.ts` — `EmployeeDeleteError` 명확 메시지
- Tests: 37/37 PASS

### Deploy 선후 관계
- DB migration **이미 적용 완료**
- 코드 commit `7edac73b` **아직 push 안 됨** (push=NO · 사용자 명시 승인 필요 · 메모리 원칙)

---

## [최종 상태]

- **PHASE 1 CODE COMPLETE = YES**
- **PHASE 1 DB COMPLETE = YES**
- **PHASE 1 COMPLETE = YES** 🎉

---

## [NEXT · PHASE 2 SETTINGS FRAMEWORK]

PHASE 1 종료 후 사용자 지시대로 **PHASE 2 (설정 프레임워크)** 로 진입 가능.

범위 추정 (사용자 지시 대기):
- `app_settings` KV 구조 재검토
- `useSettings` 훅 정비 · scheduleTypes · wageRates · positions · ranks · employeeWageOverrides · weekendMultiplier
- role taxonomy 정리 ("기타" 중복 원인 · `POSITION_TO_CATEGORY` + `settings.positions` 일치화)
- settings 변경 전파 패턴
- 설정 변경 이력
- 권한 scope

PHASE 2 시작 시 PHASE 0/1 참조 리포트:
- `output/schedule-architecture-audit-2026-10-06.md`
- `output/schedule-dataflow-and-integrations-2026-10-06.md`
- `output/schedule-phase-1-report-2026-10-06.md`
- `output/schedule-phase-1_5-report-2026-10-06.md`
- `output/schedule-phase-1-db-closeout-2026-10-06.md`
- `output/schedule-phase-1-COMPLETE-2026-10-06.md` (본 문서)
