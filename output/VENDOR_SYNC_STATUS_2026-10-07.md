# VENDOR ERP SYNC · 현재 상태 리포트 (2026-10-07)

## 1. 전체 작업 요약

### 완료
| 단계 | 상태 | 완료일 |
|---|---|---|
| Stage A migration SQL 작성 | ✅ 완료 | 2026-10-06 |
| Stage A migration 실행 (Supabase SQL Editor · 사용자 수동) | ✅ 완료 | 2026-10-07 |
| vendorSyncService.ts 재작성 (ct_code 3단계 매칭) | ✅ 완료 | 2026-10-06 |
| ERP merge CLI (`scripts/vendor-sync-execute-2026-10-06.mjs`) | ✅ 완료 | 2026-10-06 |
| Fresh dry-run 숫자 검증 | ✅ 완료 | 2026-10-07 |
| **--apply 실행** (INSERT 11 + UPDATE 95) | ✅ 완료 | 2026-10-07 |
| 코리아헬스 병합 (id=131 유지 · id=64 삭제 · ct_code=1034 매핑) | ✅ 완료 | 2026-10-07 |

### 보류
| 단계 | 상태 | 비고 |
|---|---|---|
| Stage A' refactor (60+ 파일 legacy → canonical rename) | 보류 | 사용자 결정 영역 · 큰 refactor |
| Stage B legacy column DROP | 보류 | production 검증 후 별도 작업 |
| 코드 commit 원 저장소 반영 | 보류 | 사용자가 cherry-pick/merge 결정 |

---

## 2. 현재 DB 상태 (2026-10-07 기준)

```
vendors total                 = 166
ct_code populated             = 107
ct_code distinct              = 107
ct_code NULL (WEB-only)       =  59
중복 그룹 (normalized name)   =   0  ← 코리아헬스 해소 완료
중복 그룹 (bizno)             =   2  ← 수동 교정 영역 (별개 회사 · 입력 오류)
```

### ERP 108 재분류
```
매칭 완료 (EXACT_CODE)        = 107
AMBIGUOUS                     =   1  (CtCode 1091 · ERP 쪽 중복 등록 미매핑)
NEW                           =   0
합계                          = 108  ✅
```

---

## 3. ⚠️ 남은 수동 교정 영역 (사용자/업무 담당자 처리)

### A. bizno 공유 그룹 2건 · 데이터 입력 오류 의심 · 분리 유지

| 그룹 | vendor | ct_code | bizno | 참조 (products/purchases) | 조치 |
|---|---|---|---|---|---|
| **엘앤바이오랩 group** | id=151 "(주)엘앤바이오랩" | null | 5848801771 | 0 / 0 | 사업자번호 교정 필요 |
| | id=126 "앤바이오" | null | 5848801771 | 0 / 0 | (실제 사업자번호 확인) |
| **경방신약/광동제약 group** | id=31 "광동제약" | 1002 | 1318151063 | **80 / 534** | ⚠️ 참조 매우 많음 · bizno 교정만 가능 · 병합 금지 |
| | id=48 "경방신약" | 1019 | 1318151063 | **44 / 94** | ⚠️ ERP 가 별개 vendor 로 등록 |

**사용자 실제 사업자번호 확인 후 UPDATE 필요**:
- 광동제약 실제 bizno = ?
- 경방신약 실제 bizno = ?

### B. ERP 쪽 중복 등록

| ERP CtCode | 이름 | 상태 | 조치 |
|---|---|---|---|
| 1034 | 코리아헬스 | DB id=131 매핑 완료 | - |
| **1091** | **코리아헬스** | 미매핑 (중복) | ERP 담당자가 1091 삭제/통합 결정 |

---

## 4. 🔍 Fuzzy 조사 결과 (90% similarity · DB 내부)

**결과 1 pair** (false positive 1건):

| sim | A | B | 판정 |
|---|---|---|---|
| 90% | id=83 "신일제약(vat 미포함)" (ct_code=1052) | id=44 "신신제약(vat미포함)" (ct_code=1015) | **분리 유지** · ERP 가 다른 CtCode 로 등록 · 다른 회사 |

→ 90% fuzzy 는 false positive 리스크 입증 (한 글자 "신일" vs "신신"). 분리 유지가 올바름.

---

## 5. 📋 코리아헬스 병합 상세 (완료)

### Before
```
id=131 · "코리아헬스"      · ct_code=null · bizno=null · note="0111" · 참조 0
id=64  · "코리아헬스(주)"  · ct_code=null · bizno=null · note="0036" · 참조 0
ERP CtCode 1034 · "코리아헬스"
ERP CtCode 1091 · "코리아헬스" (중복)
```

### 실행 SQL
```sql
BEGIN;
UPDATE vendors SET ct_code = '1034' WHERE id = 131 AND ct_code IS NULL;
DELETE FROM vendors WHERE id = 64;
COMMIT;
```

### After
```
id=131 · "코리아헬스" · ct_code=1034 · note="0111"  (유지)
id=64  · 삭제 (note "0036" 소실)
```

### 적용 규칙 (사용자 지시 정립)
- 공급사명 (주)/주식회사 등 **법인 표기 제외하고 동일**
- **사업자번호 다르면 다른 공급사** (bizno 비교)
- bizno 둘 다 null 이면 → **병합 OK**
- ERP CtCode 기준으로 canonical 매핑

---

## 6. 🧰 보유 조사 자원 (anomaly 조사 대기)

### 데이터 소스
- **ERP sample**: `D:/antigravity_projects/megatown-staff-scheduler/tmp/output/vendor-response-full.json` (108 rows · 74 cols)
- **Supabase**: live connection · 166 vendors + products/purchase_details 참조 테이블
- **공유 normalize helper** (법인표기 제거 + lowercase + punctuation 제거)
- **Levenshtein similarity** (조정 가능)

### 조사 가능 anomaly 유형
| 코드 | 패턴 | 설명 |
|---|---|---|
| A | ct_code 있는데 corp_name_view 가 ERP CorpNameView 와 다름 | sync 중 이름 불일치 |
| B | ERP 에 있는 vendor 가 WEB 쪽 WEB-only 분류 (ct_code null) | 매칭 실패 vendor |
| C | WEB 유사 이름 2+ 있는데 ERP 는 1 vendor | WEB 중복 등록 |
| D | ERP CorpBizNo 유효 vendor 가 WEB bizno 와 다름 | 사업자번호 불일치 |
| E | ERP 응답 중복 CtCode (같은 이름 2 CtCode) | ERP 쪽 중복 (예: 코리아헬스 1091) |
| F | WEB 참조 있는데 ERP 매칭 vendor 없음 | 고아 참조 |
| G | ERP 신규 INSERT vendor 의 note/approval_status default 확인 | 신규 vendor 품질 |
| H | 기타 사용자 지정 패턴 | - |

---

## 7. 📂 생성된 파일 (worktree 안)

### 수정/신규 파일 (코드)
- `supabase/migrations/2026-10-06_vendor_canonicalization_stage_a.sql` (Migration SQL)
- `src/shared/erp/erpVendorMapper.ts` (normalize helper + mapper)
- `src/shared/schemas/vendors.ts` (Zod schema 확장)
- `src/shared/dtos/vendors.ts` (DTO 확장)
- `apps/sync-agent/src/main/vendorSyncService.ts` (sync service 재작성)
- 그 외 ERP sync 지원 파일 (datasetTypes · ipc · scheduler · UI 등)

### 조사/실행 스크립트
- `scripts/vendor-audit-2026-10-06.mjs` (초기 전수조사)
- `scripts/vendor-sync-dryrun-2026-10-06.mjs` (dry-run)
- `scripts/vendor-sync-execute-2026-10-06.mjs` (실제 merge CLI)

### 리포트
- `output/vendor-audit-2026-10-06.json` (초기 전수조사 결과)
- `output/null-safety-audit-2026-10-06.md` (null audit · 별도 작업)
- `output/null-runtime-audit-2026-10-06.md` (null runtime · 별도 작업)
- **`output/VENDOR_SYNC_STATUS_2026-10-07.md`** (이 파일)

---

## 8. 🧾 Git State

```
clean worktree  = D:\antigravity_projects\megatown-staff-scheduler\.claude\worktrees\agent-a6b82312ea11f9b13
clean branch    = worktree-agent-a6b82312ea11f9b13

commits (worktree):
  d4017430  feat: canonicalize vendors to ERP schema (Stage A · superseded by below)
  (이후 코리아헬스 병합 등 SQL 실행 · DB 직접 반영 · code commit 없음)

superseded (원 저장소 history 보존 · touch X):
  b5d04a11  (baseline mutation 포함 · 미사용 · null fix 와 혼재)
  9f80939f  fix: harden nullable runtime boundaries (null fix clean · 별도 작업)
  bbbfd7ef  fix: harden salesStatsRouter null narrowing (별도 작업)

push = NO (전부 로컬)
```

---

## 9. 다음 단계 (사용자 결정 대기)

1. **ERP ↔ Supabase anomaly 조사** · 사용자 지정 패턴 알려주시면 즉시 조사
2. **bizno 교정 수동 작업** · 광동제약/경방신약/엘앤바이오랩 실제 사업자번호 확인
3. **ERP 쪽 CtCode 1091 처리** · ERP 담당자 결정
4. **Stage A' refactor** · 60+ 파일 legacy → canonical rename 결정
5. **원 저장소 반영** · worktree commit 들 cherry-pick 결정

끝.
