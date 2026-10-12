# PHASE 2 · P0-5 OPTION A Implementation
# 2026-10-07

> Settings whole-JSON lost update 방지 · DB atomic jsonb_set RPC · OPTION A 코드 완료.
> 선행 참조: `output/schedule-phase-2-settings-audit-2026-10-06.md` (Section 29.5),
>           `output/schedule-phase-2-implementation-report-2026-10-07.md`,
>           `migrations/schedule_phase_2_p0_5_proposal_2026-10-07.sql`
> 상태: CODE COMPLETE = YES · DB APPLIED = NO (사용자 수동 적용 대기)

---

## [MIGRATION]

- file = `D:\antigravity_projects\megatown-staff-scheduler\migrations\schedule_phase_2_p0_5_settings_patch_rpc_2026-10-07.sql`
- line count = 80
- status = READY (사용자 수동 apply 대기)
- 함수 signature:
  `CREATE OR REPLACE FUNCTION public.settings_patch_jsonb(p_key text, p_patches jsonb) RETURNS jsonb LANGUAGE plpgsql`

SQL preview (핵심 로직 발췌):

```sql
-- 빈 배열이면 현재 값 그대로 반환 (영향 없음 · smoke test 안전)
IF jsonb_array_length(p_patches) = 0 THEN
  SELECT value INTO final_value FROM public.app_settings WHERE key = p_key;
  RETURN COALESCE(final_value, '{}'::jsonb);
END IF;

-- row 없으면 bootstrap: 빈 {} 로 INSERT 후 patch 순차 적용
INSERT INTO public.app_settings (key, value, updated_at)
VALUES (p_key, '{}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 각 patch 를 순차 적용 (단일 트랜잭션 · atomic)
FOR patch IN SELECT * FROM jsonb_array_elements(p_patches)
LOOP
  -- path 를 text[] 로 변환
  SELECT array_agg(elem #>> '{}' ORDER BY ord)
    INTO path_arr
    FROM jsonb_array_elements(patch->'path') WITH ORDINALITY AS t(elem, ord);
  -- jsonb_set · create_missing=true
  UPDATE public.app_settings
     SET value = jsonb_set(COALESCE(value, '{}'::jsonb), path_arr, patch->'value', true),
         updated_at = now()
   WHERE key = p_key;
END LOOP;
```

Semantics
- 서로 다른 top-level path 동시 쓰기 → 둘 다 반영 (DB atomic · jsonb_set path-level)
- 같은 path 동시 쓰기 → last-write-wins (명시적 trade-off · 사용자 승인됨)
- row 없음 → bootstrap INSERT 후 patch 적용
- 빈 patches → READ-ONLY (SELECT only)
- 빈 path · null patch value → RAISE EXCEPTION (유효성)

## [SERVER]

- new route = `POST /api/settings/patch` (file: `server/routes/settings/settings.ts`)
- auth = `authorize(9)` (관리자) · 기존 `POST /api/settings` 와 동일 권한
- caller = `supabase.rpc("settings_patch_jsonb", { p_key, p_patches })`
- validation = `SettingsPatchRequestSchema` (src/shared/schemas/settings.ts)
  - `key`: string(1~200)
  - `patches`: array(1~50) of `{ path: string[](1~10, each 1~100), value: unknown }`
- response = `{ ok: true, value: <최종 jsonb> }`
- 캐시 무효화 정책은 기존 POST /api/settings 와 동일 (stats.sale_active_only 처리)
- 기존 `POST /api/settings` (whole-object upsert) 는 **유지** (하위 호환 · 명시적 전체 치환 필요한 경우)

## [CLIENT]

- updated hook = `src/hooks/useSettings.ts`
- new helper = `src/lib/settingsApi.ts::patchSettings(key, patches): Promise<T|null>`
- import 변경 = `saveSetting` → `patchSettings` (useSettings 내부 전용)
- 분해 로직 (`partialToPatches`):
  - `update({ wageRates: {...}, visitorReservation: {...} })` →
    `patches: [{ path:["wageRates"], value:{...} }, { path:["visitorReservation"], value:{...} }]`
  - undefined 값은 patch 에 포함 X · 명시적 null 은 포함
- pending partial 누적 로직 추가 (`pendingPartial.current`)
  - debounce flush 전까지 누적 · flush 성공 시 clear · 실패 시 복구
  - 다른 top-level key 만 모은 patch · 같은 key 는 last-write-wins
- `saveNow()` · pending 비어있으면 네트워크 호출 skip (이전 whole-snapshot 보냄)
- `settings-updated` 이벤트 dispatch 정책 유지 (same-tab 즉시 동기화)
- 기존 `saveSetting(key, value)` (whole-object) · 다른 호출 사이트는 그대로 유지 (storage_locations·season_ranges 등 whole-object 저장 route 와 하위 호환)

## [TEST]

- new file = `server/routes/settings/settings.patch.test.ts` (271 lines) · 16 tests PASS
  - **A. 다른 top-level path 동시 patch · lost update 없음** (2)
  - **B. 같은 top-level path · last-write-wins** (2)
  - **C. row 없음 · INSERT bootstrap · patch 반영** (2)
  - **D. 중첩 path · 정확히 반영** (2)
  - **E. 빈 patches · READ-ONLY smoke call** (2)
  - **F. 유효성 검사** (1)
  - **partialToPatches · 클라이언트 분해** (5)
- updated = `src/hooks/useSettings.test.ts` · +4 tests PASS
  - update → debounce flush → POST /api/settings/patch
  - 연속 update · 다른 key · 패치에 둘 다 포함
  - saveNow · pending 즉시 flush
  - pending 비어있으면 POST 호출 X
- 전체 useSettings.test.ts 20 tests PASS · 전체 Phase 2 범위 413 tests PASS

- concurrency scenarios = 4개 (A, B, C, D) · 전부 PASS
- edge cases = 3개 (E 2건, F 1건) · 전부 PASS

## [VALIDATION]

- TS = **PASS** (`npx tsc --noEmit` · 0 errors)
- BUILD = **PASS** (`npm run build` · brotli + server bundle 생성 완료 · 사전 존재 import.meta cjs warning 외 정상)
- TEST = **36/36 PASS** (settings.patch.test.ts 16 + useSettings.test.ts 20)
- 전체 Phase 2 범위 **413/413 PASS** (41 test files)
- 프레임워크 audit = **PASS** (526 위반 · baseline 527 · 신규 증가 없음)

## [COMMIT]

- hash = `043298d0`
- subject = `fix(settings): atomic jsonb_set via RPC for lost-update prevention`
- scope = 8 files · +609 / -12
  - 신규 (3): migration SQL (80 lines), verify SQL (28 lines), settings.patch.test.ts (271 lines)
  - 수정 (5): settings.ts (+26), useSettings.ts (+60/-5), useSettings.test.ts (+73), settingsApi.ts (+27/-1), schemas/settings.ts (+16)

## [DB APPLICATION PENDING]

사용자 수동 적용 안내 (PHASE 1 패턴):

1. **Supabase SQL Editor** 접속
2. `D:\antigravity_projects\megatown-staff-scheduler\migrations\schedule_phase_2_p0_5_settings_patch_rpc_2026-10-07.sql` 전체 복사 → 실행
3. `D:\antigravity_projects\megatown-staff-scheduler\scripts\schedule-phase-2-p0-5-verify.sql` 실행 (READ-ONLY smoke)
   - 함수 존재 · signature 확인
   - 빈 patches smoke call → 현재 all_settings value 반환 · 변경 없음
4. 결과 agent 에 공유 → agent 가 fresh verify + concurrency test 실행 → PHASE 2 COMPLETE 선언

## [PHASE 2 STATE]

- PHASE 2 SAFE CODE COMPLETE = **YES** (P0-1 ~ P0-4 · commit 51321ab6 선행)
- PHASE 2 P0-5 CODE COMPLETE = **YES** (commit 043298d0 · 이번 세션)
- PHASE 2 P0-5 DB APPLIED = **NO** (사용자 수동 적용 대기)
- PHASE 2 COMPLETE = **PENDING** (DB apply 후 YES)

## [COMPLIANCE]

- 다른 agent WIP 보존 ✓ (touch 금지 영역 전부 미변경):
  - `apps/sync-agent/**` 미변경
  - `server/routes/stock/**` · `server/routes/purchase/**` · `server/routes/vendor/**` 미변경
  - `src/components/{Display,Landing,Order,Reservation,Scan,Stock}Page/**` 미변경
  - `src/shared/erp/**` 미변경
  - `scripts/vendor-*` · `supabase/migrations/2026-10-06_vendor_*` 미변경
- git stash 사용 없음 ✓
- `--no-verify` 사용 없음 ✓ · pre-commit hook 통과
- baseline update 없음 ✓
- CASCADE 작업 없음 ✓
- push 실행 없음 ✓
- 선택적 `git add` 로 P0-5 관련 파일만 스테이징 ✓
- production DB 직접 apply = NO (agent 환경에 DDL 수단 없음 · 사용자 수동 apply)

---

### 끝.

PHASE 2 P0-5 CODE COMPLETE = YES · DB APPLIED PENDING
NO push · NO baseline update · NO stash · NO --no-verify · NO WIP touch · NO CASCADE · NO production DB apply
