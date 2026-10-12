# SCHEDULE PHASE 2 COMPLETE — Settings Framework
# 2026-10-07

PHASE 2 전체 종료. P0-1 ~ P0-5 모두 해결 · DB · code · test 모두 verify PASS.

---

## [FINAL STATE]

- **PHASE 2 SAFE CODE COMPLETE = YES** (51321ab6)
- **PHASE 2 P0-5 CODE COMPLETE = YES** (043298d0)
- **PHASE 2 P0-5 DB APPLIED = YES** (Supabase SQL Editor 수동 적용 완료)
- **PHASE 2 COMPLETE = YES** 🎉

---

## [DB FRESH VERIFY] 2026-10-07

| metric | value | expected |
|---|---|---|
| rpc_installed | 1 | 1 ✓ |
| rpc_args | `p_key text, p_patches jsonb` | 정확 ✓ |
| rpc_returns | `jsonb` | 정확 ✓ |
| smoke_result_type | `object` | 정상 동작 ✓ |
| all_settings_updated_at | 2026-09-16 07:37:38.482+00 | 변경 없음 (READ-ONLY smoke) ✓ |

---

## [COMMITS] (push=NO · 다음 commit stack 그대로)

| hash | subject |
|---|---|
| `719610a6` | fix(settings): require canonical DB settings for business logic |
| `984a5899` | fix(schedule): remove hardcoded wage fallbacks |
| `6f1d45bb` | fix(schedule): unify non-working schedule semantics |
| `5747cbaf` | fix(settings): enforce settings API authorization and correct table typo |
| `51321ab6` | docs(settings): P0-5 whole JSON lost update proposal |
| `043298d0` | fix(settings): atomic jsonb_set via RPC for lost-update prevention |

---

## [P0 FINDINGS CLOSED]

| # | 문제 | 해결 |
|---|---|---|
| **P0-1** | DB fetch 실패 → localStorage/DEFAULT fallback 로 business 계산 지속 | `useSettings.status` + `isReady` · business 계산은 `status==="ready"` 때만 |
| **P0-2** | `defaultWageForPosition()` 하드코드 35000/40000/10030/12000 fallback | `src/lib/wageResolver.ts` SSOT · `{status, wage, source}` · 미설정 시 "시급 미설정" |
| **P0-3** | 대표/임원 → "기타" 자동 흡수 | `positionToCategoryV2` · 실제 "기타" vs UNMAPPED(미분류) 분리 · console.warn observability |
| **P0-4** | OFF_TYPES 하드코드 7곳 분산 + "지정휴무" workDays 과대계산 bug | `src/shared/schedule/offTypes.ts` 공유 helper 통일 · "지정휴무" 포함 수정 |
| **P0-5** | whole-object `all_settings` POST lost update race | `settings_patch_jsonb` atomic RPC · path-level patch · DB 레벨 lost update 방지 |

---

## [추가 수정]

- `borrowings.ts:144` `supabase.from("settings")` 오타 → `"app_settings"` 수정
- `GET /api/settings?key=all_settings` + `order_email_smtp` 인증 필수 처리 (wageRates 익명 노출 방지)
- `DayTimelineModal/types.ts` SKIP_TYPES 에 "결근" 추가 (결근자 노출 bug 수정)

---

## [MIGRATION 적용 완료]

- `migrations/schedule_phase_2_p0_5_settings_patch_rpc_2026-10-07.sql` → Supabase 적용 완료

---

## [VALIDATION]

- `npx tsc --noEmit` PASS
- `npm run build` PASS
- `npx vitest run` Phase 2 범위 **413/413 PASS** (41 files)
- framework-audit **526 vs baseline 527** · 신규 증가 없음
- pre-commit hooks 전부 통과 (skip 0)

---

## [GUARD-RAIL COMPLIANCE]

- NO push · NO baseline update · NO stash · NO --no-verify · NO CASCADE
- 다른 agent WIP touch 0 (`apps/sync-agent/**`, stock/purchase/vendor routes, Display/Landing/Order/Reservation/Scan/Stock pages, erp mapper, vendor scripts/migrations)
- 선택적 `git add` 사용 (논리별 분리 commit)
- STOP 조건 (taxonomy schema migration · scheduleTypes identity migration · bulk settings data rewrite · DB shape split · all_settings → multi-key migration · ambiguous mapping) 전부 미실행

---

## [KNOWN DEFERRED]

- **leave_requests employee_id FK** = DEFERRED (PHASE 1 KNOWN LEGACY · 박부장 orphan)
- **scheduleTypes stable code migration** = DEFERRED (label-as-identity 유지 · 후속 Phase proposal)
- **cross-tab realtime settings sync** = BACKLOG (same-tab/page-navigation stale 없음은 보장)
- **settings change history (audit log)** = BACKLOG (optimistic concurrency 와 함께 upgrade 시점에 설계)

---

## [NEXT · PHASE 3 범위]

사용자 지시 대기. 후보 (리포트들에서 식별된 영역):
- UX modernization (Main Grid · Daily View · Employee Quick View · responsive adaptive)
- Confirm/Publish workflow 강화 (change indicator · after-confirm modification)
- Leave conflict / overlap / coverage warning
- Multi-cell edit · copy/paste · bulk shift update
- NULL / runtime hardening (`EmployeeCalendarModal` cancel-safe · `employee.position` undefined guard 등)
- Performance (employees SELECT * narrowing · N+1 제거)
- Security / RLS audit · settings read authorization 세분화

PHASE 3 지시 범위 (READ-ONLY audit 선행 여부 · 어느 영역부터) 사용자 결정 대기.

---

## PHASE 2 참조 리포트

- `output/schedule-phase-2-settings-audit-2026-10-06.md` (1,144줄 · audit)
- `output/schedule-phase-2-implementation-report-2026-10-07.md` (212줄 · P0-1~4 safe fix)
- `output/schedule-phase-2-p0-5-implementation-2026-10-07.md` (P0-5 code implementation)
- 본 문서 — PHASE 2 COMPLETE 최종 선언
