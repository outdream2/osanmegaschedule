# Incremental Sync 공통 모듈 + UI 재구성 계획 · 2026-10-04

READ ONLY · 조사·설계 전용. 코드/DB/UI 변경 없음. 로컬 commit·remote push 없음.
스케줄러 실제 구현 없음 (UI 자리만 제안). SOAP·decoder·pagination 등 기존 로직은 전부 재사용 (재작성 금지).

작업 ID: #108 (PLAN-SYNC-UI)

---

## 0. 요약 (TL;DR)

사용자가 2가지 지시를 동시에 보냄:

- **A. Incremental Sync 아키텍처** — ERP 전체 조회 → Local Baseline 과 Diff → NEW/CHANGED 만 Supabase 와 비교 → 실제 WRITE → read-back → Local Baseline atomic replace. 두 모드 (INCREMENTAL CHECK / FULL VERIFICATION).
- **B. UI 재구성** — 상단 "ERP → Supabase 동기화" 하나로 통합. 하단 "Iregen ERP 직접 조회" **UI**는 제거/흡수하되 **SOAP 호출·decoder·pagination·validation·snapshot 저장 로직은 그대로 재사용**. Dataset 카드 하나에서 [ERP 새로 조회] [ERP 데이터 보기] [변경 내용 보기] [Supabase 동기화] + 조회기간. 긴 이력은 좌측 메뉴 "로그" 로 분리. 개발자 badge (READY/REVIEW/BLOCKED/NOT_CONFIGURED/SYNCED), 기술명, DRY-RUN 라벨 제거. 스케줄러 자리만.

**Phase 수: 7** · **수정 예정 파일 수: 15 (수정 10 · 신규 5 · 삭제 0 · deprecate 2)** · 산출: 이 markdown 한 개.

---

## 1. 현재 구현 조사 (파일:line)

> 핵심 결론:
> - **SOAP 조회 / decoder / pagination / validation** 전부 `iregenSoap.ts` 하나에 집중되어 있음 (1,373 lines). 재사용 가능.
> - **Snapshot 영속** candidate+last-synced 2-tier · gzip JSON · atomic rename · `snapshotStore.ts` 완비.
> - **Local Diff / Supabase Diff / Read-back** 각각 pure function 으로 이미 분리됨 (`src/shared/erp/*`).
> - 지금 orchestrator 의 `applyProductSync` 는 Phase 3 전 lock 되어 있고, 실제 WRITE 는 `productSyncService.applyProductSync` 가 전담.
> - **하단 직접조회 경로와 상단 orchestrator 경로가 서로 다른 함수를 통해 같은 snapshot 에 저장** 중 (현 상태 재확인 완료).

### 1.1 ERP SOAP 호출 (apps/sync-agent/src/main/iregenSoap.ts · 1,373 lines)

| 함수 | line | pagination | 날짜 opts | validation |
|------|------|-----------|-----------|-----------|
| `queryProductList(opts)` | 834–1046 | Yes · PageIdx 1..N · metadata-driven 병렬 · concurrency 1~10 · retry 30/60/120s | 없음 | PCode 중복/empty · `countMatch` · failedPages |
| `queryInventoryStatus(opts)` | 589–611 | No (PageIdx=0/PageSize=0 · ERP 가 전체 반환) | startDate/endDate | 없음 (orchestrator 측에서 PCode 간이검증) |
| `queryBuyStatus(opts)` | 1149–1186 | No (PageIdx=0/PageSize=0) | DevStartDate/DevEndDate | 없음 (orchestrator 측에서 BmCode+ROWNUM 간이검증) |
| `querySaleStatus(opts)` | 1338–1373 | No | StartDate/EndDate | 없음 |
| `queryInventoryStatusRaw()` | 537–587 | — | 없음 (Fiddler sample 치환만) | 진단 전용 · snapshot 저장 X |
| `fetchProductPageWithRetry` | 777–832 | 공용 retry 엔진 | — | — |

- 공통: SOAP 호출 → base64 → C# decoder (`decodeResponseToResult`) → DataSet JSON → primary table rows + metadata tables.
- 공통 broadcast: `erp:product-progress` (ProductList pagination 전용 · `broadcastProductProgress` line 15–29).
- Dataset-level broadcast 는 iregenSoap 가 하지 않음 (orchestrator 가 담당).

**중복 포인트**: 각 함수 모두 자체 config/CorpDbNm/endpoint resolve 를 반복함 (line 537–549 vs 589–598 vs 834–855 vs 1149–1170 vs 1338–1358). Phase 2 공통 모듈화 후보.

### 1.2 Snapshot 영속 (apps/sync-agent/src/main/snapshotStore.ts · 239 lines)

- 경로: `{userData}/erp-cache/{slug}/candidate.json.gz | last-synced.json.gz | metadata.json`
- `saveCandidate` 117 — ERP Fetch 성공 즉시 atomic 저장 (candidate 만 · lastSynced 유지)
- `loadCandidateMeta / loadLastSyncedMeta` 149 / 153
- `loadCandidateFull<T> / loadLastSyncedFull<T>` 157 / 162
- `getMetadata / updateCandidateValidation / updateSyncStatus / recordSyncAttempt` 171 / 175 / 189 / 195
- `promoteCandidateToLastSynced(dataset)` 208 — copyFileSync+rename · atomic replace · sync 성공 후 호출
- `clearLastSynced` 232 — first-run 시뮬레이션
- SLUG 매핑 24–29 — 4 Dataset 모두 등록됨

**Baseline 교체 보장**: `promoteCandidateToLastSynced` 가 copy→rename 으로 atomic. 중간 실패 시 기존 last-synced 보존.

### 1.3 History 저장 (apps/sync-agent/src/main/)

- `syncHistoryStore.ts` 1–76 — Supabase 반영 이력 · 최대 50건 · dataset 별 `sync-history.json` · `appendSyncHistory` / `getRecentSyncHistory`.
- `fetchHistoryStore.ts` 1–71 — ERP 조회 이력 · 최대 50건 · dataset 별 `fetch-history.json` · `appendFetchHistory` / `getRecentFetchHistory`.
- 두 파일 **구조 거의 동일** · common store 추출 후보.

### 1.4 Orchestrator (apps/sync-agent/src/main/erpSyncOrchestrator.ts · 544 lines)

- `enqueueFetch(dataset, opts)` 164 — fire-and-forget · 상단 UI 가 사용 (현재).
- `enqueueFetchAwait(dataset, opts)` 198 — Promise 로 await 가능 · Scheduler/통합 workflow 용 (사용자 지시 line 194–196 주석에 명시).
- `runProductFetch` 235 — `queryProductList({ pageSize: 50, concurrency: 1 })` + validation + hash + `saveCandidate`.
- `runInventoryFetch` 275 · `runBuyFetch` 322 · `runSaleFetch` 373 — 동일 패턴 · 각 Dataset 간이 validation.
- `buildProductDiff()` 412–485 — candidate 로드 → mappingVersion check → `diffProductsLocal` → Supabase 전체 READ → `diffProductsVsSupabase`. **이것이 사용자 흐름의 "Local Diff + Supabase 비교" 기반**.
- `applyProductSync` 518–535 — **lock 상태** (실제 WRITE 는 `productSyncService.applyProductSync` 가 수행).
- `promoteOnVerifiedSuccess` 538 — read-back 통과 후 호출용.
- `computeReadiness` 83 — Phase 와 Dataset 종류로 READY/REVIEW/BLOCKED/NOT_CONFIGURED 산출. INVENTORY/BUY/SALE 전부 NOT_CONFIGURED or BLOCKED.

### 1.5 Product Sync Service (apps/sync-agent/src/main/productSyncService.ts · 345 lines)

- `runProductSyncCheck()` 54–132 — local candidate (`loadCandidateFull`) + Supabase fresh fetch → `computeProductSyncCheck` → SAME/CHANGED/NEW/REVIEW/ERROR 분류 (상품명 완전일치 로 REVIEW 추출). **ERP 재호출 없음**.
- `applyProductSync({ allowWrite })` 174–345 — Supabase 전수 READ (WEB-owned 포함) → whitelist 비교 → UPDATE batch (`PAR=10`) → read-back (`in` 쿼리 chunk 100) → identity/WEB-owned 보호 검증 → `appendSyncHistory` 기록. **실제 WRITE 는 여기만**. `promoteCandidateToLastSynced` 는 호출 **안 함** (현 상태 bug/gap · 아래 Phase 2 에서 재배선 필요).
- 비교 규칙: `NUMERIC_FIELDS` (current_stock/purchase_price/sale_price) · `TIMESTAMP_FIELDS` (erp_registered_at/erp_modified_at) · 나머지 string trim.
- 1-DB-call batch size: `.range(from, from+999)` pagination.

### 1.6 IPC (apps/sync-agent/src/main/ipc.ts · 425 lines)

| IPC name | line | 처리 함수 | snapshot 저장? | fetch history? |
|----------|------|-----------|---------------|----------------|
| `erp:inventoryStatus` | 218 | `queryInventoryStatus` + `persistQueryResult("INVENTORY_STATUS")` | **Yes** | **Yes** |
| `erp:inventoryStatusRaw` | 227 | `queryInventoryStatusRaw` | 아니오 (진단) | 아니오 |
| `erp:productList` | 234 | `queryProductList` + `persistQueryResult("PRODUCT_LIST")` | **Yes** | **Yes** |
| `erp:buyStatus` | 243 | `queryBuyStatus` + `persistQueryResult("BUY_STATUS")` | **Yes** | **Yes** |
| `erp:saleStatus` | 252 | `querySaleStatus` + `persistQueryResult("SALE_STATUS")` | **Yes** | **Yes** |
| `erpSync:getAllDatasets` | 303 | `getAllDatasetStates` + `getSupabaseStatus` + `getQueueStatus` | — | — |
| `erpSync:fetchDataset` | 315 | `enqueueFetch` (fire-and-forget) | 간접 (orchestrator) | 아니오 (orchestrator 에서 history append 안 함) |
| `erpSync:fetchSelected` | 320 | 반복 `enqueueFetch` | 간접 | 아니오 |
| `erpSync:revalidate` | 327 | `revalidate` | — | — |
| `erpSync:getRows` | 332 | `loadRows` (candidate 상위 N) | — | — |
| `erpSync:productDiff` | 340 | `buildProductDiff` (Local+Supabase Diff) | — | — |
| `erpSync:syncSelected` | 377 | **lock** · 항상 dryRun 반환 | — | — |
| `productSync:runCheck` | 383 | `runProductSyncCheck` | — | — |
| `productSync:applyWrite` | 392 | `applyProductSync({ allowWrite })` | — | — (sync-history 는 service 내부에서) |
| `productSync:getHistory` | 402 | `getRecentSyncHistory("PRODUCT_LIST")` | — | — |
| `erp:getFetchHistory` | 408 | `getRecentFetchHistory(dataset)` | — | — |

**중요한 발견**:
- **상단 `erpSync:fetchDataset` 는 fetch-history 를 기록하지 않음** (orchestrator.ts 내 어떤 run*Fetch 도 `appendFetchHistory` 호출 안 함). 하단 `erp:xxx` 만 `persistQueryResult` 통해 history 를 append 한다.
- 두 경로 **모두** 결국 `saveCandidate` 는 호출 → **candidate snapshot 은 공유**. 그러나 **candidate validation 내용은 다를 수 있음** (상단은 orchestrator 가 `validateErpSnapshot` 포함, 하단 `persistQueryResult` 는 validation 없이 raw 저장 ipc.ts line 55–66).
- Diff 생성에는 상단만 사용 (`buildProductDiff`, `runProductSyncCheck`).

### 1.7 공통 모듈 (src/shared/erp/)

- `datasetHash.ts` 1–141 — `datasetHash<T>` generic · `productIdentity/productFingerprint/productFingerprintHash/datasetHashProducts` · `buyIdentity/buyFingerprint/datasetHashBuys`. **Product identity = BarCode** (문자열 trim). **Buy identity = `BmCode|ROWNUM`** (사용자 명시 확정 금지 전제).
- `erpLocalDiff.ts` 1–141 — `diffProductsLocal(candidate, lastSynced)` SAME/NEW/CHANGED/MISSING · `diffBuysLocal` (immutable 가정 · CHANGED 분류 없음). **first-run (lastSynced=null) 전부 NEW 로 분류** · DELETE 분류 없음.
- `erpSupabaseDiff.ts` 1–115 — `diffProductsVsSupabase(candidateSubset, dbIndex)` · DB_MISSING_WOULD_INSERT / DB_DIFFERENT_WOULD_UPDATE / DB_SAME_SKIP · DELETE 영구 금지 · 호출 전 호출부가 NEW+CHANGED 로 필터.
- `erpReadBack.ts` 1–111 — `verifyReadBack(writes, fetcher)` · fetcher 는 호출부가 inject (service-role 유지) · VERIFIED_SUCCESS / PARTIAL_FAILED / FAILED.
- `erpSyncWhitelist.ts` 1–145 — `ERP_IDENTITY` / `ERP_OWNED_PRODUCT_FIELDS` (14 field) / `ERP_OWNED_PURCHASE_FIELDS` / `PROTECTED_PRODUCT_FIELDS` / `assertNoProtectedField` / `isErpEmpty`.
- `erpProductMapper.ts` 1–208 — `buildErpProductPayload(erp, db?)` · nullOverwrite 규칙 · PROTECTED assert · identity exclude · UPDATE/INSERT payload.
- `erpBuyMapper.ts` 1–127 — `buildBuyRowFromErp(erp)` · PCode→BarCode 로컬 변환 **없음** (사용자 지시: resolver 추후).
- `timestampCompare.ts` 1–62 — `normalizeTimestampForComparison` (UTC epoch) · `timestampsEqual`. 포맷 차이 무시 · WRITE/READ instant 비교. **상단 Phase 2 fetchComplete 비교에서 필수**.
- `productSyncCheck.ts` 1–200 — `computeProductSyncCheck` pure · SAME/CHANGED/NEW/ERROR_IDENTITY_CONFLICT/SKIPPED_MISSING_PCODE · **pcode primary · BarCode 는 2차 충돌 검사**. ERP OWNED 14 field 기계 비교.

### 1.8 UI (apps/sync-agent/src/renderer/src/)

- `screens/Dashboard.tsx` 1–55 — 3-view 토글 (`sync | query | both`) · 상·하단을 두 섹션으로 분리. 사용자 지시: 하나로 통합.
- `screens/ErpSyncSection.tsx` 1–786 — 상단 메인. 4 DatasetCard 반응형 (md:2열 xl:4열). PRODUCT_LIST 카드에만 "동기화 확인 / 변경 내용 보기 / Supabase 반영 / 동기화 이력" workflow. [내용 보기] inline `SnapshotTable` (672–746). ReadinessBadge/PhaseBadge/DRY-RUN 배지 노출. 선택 CheckBox + 하단 선택액션 bar.
- `screens/ErpSection.tsx` 1–430 — 하단 4-탭 (products/inventory/buy/sale) · 탭별 `ErpQueryView` + `conditionsSlot` (기간/concurrency) + `FetchHistoryPanel` (dataset 별 fetch-history 테이블).
- `components/ErpQueryView.tsx` 1–489 — 공통 조회뷰 · chip · pagination · 검색 · row 상세 modal. `queryFn` prop 받아서 `window.api.erpXxx` 호출. `conditionsSlot` 으로 날짜 UI 주입.
- `components/SectionBoundary.tsx` — 섹션 간 isolation (하나 에러 나도 다른 섹션 안 깨짐).
- `screens/Logs.tsx` 1–30+ — 현재 폴더 상태 + 재시도 큐 (파일 import 관련) 전용. **좌측 메뉴에 이미 "로그" 탭 존재**. 여기에 "ERP 조회 이력 · Supabase 동기화 이력" 서브탭 추가 가능.
- `screens/ErpQueryPanel.tsx` 1–451 — (사용되지 않음? App.tsx 체크 필요. 이미 ErpSection 으로 치환됨)

### 1.9 Preload (apps/sync-agent/src/preload/index.ts · 232 lines)

노출 API 리스트:
- Direct query: `erpInventoryQuery` 80 · `erpInventoryQueryRaw` 92 · `erpProductList` 104 · `erpBuyStatus` 116 · `erpSaleStatus` 128
- Sync service: `productSyncRunCheck` 140 · `productSyncApplyWrite` 142 · `productSyncGetHistory` 144 · `erpGetFetchHistory` 146
- Orchestrator: `erpSyncGetAllDatasets` 170 · `erpSyncGetDatasetState` 171 · `erpSyncFetchDataset` 173 · `erpSyncFetchSelected` 175 · `erpSyncRevalidate` 177 · `erpSyncGetRows` 179 · `erpSyncSyncSelected` 184
- Broadcast: `onErpDatasetProgress` 188 · `onErpProductProgress` 197

**모두 preload 노출됨 · 새 API 추가 없이 재배선 가능**.

---

## 2. 두 UI 실행경로 상세 비교

| 항목 | 상단 (ErpSyncSection → fetchDataset) | 하단 (ErpSection → erp:productList 등) |
|------|---------------------------------------|------------------------------------------|
| 진입점 | `erpSyncFetchDataset({ dataset })` → `erpSync:fetchDataset` IPC | `erpProductList({ pageSize, concurrency })` → `erp:productList` IPC |
| Queue 통과 | **Yes** (`erpQueue.enqueue` · concurrency=1 전역) | **No** (ipc handler 직접 호출 → `queryProductList` 즉시 실행) |
| Fire-and-forget | **Yes** (fire · fetchDataset 즉시 반환, orchestrator phase broadcast) | **No** (await · 결과 rows 반환) |
| Pagination 로직 | 같음 — `queryProductList({ pageSize: 50, concurrency: 1 })` (orchestrator line 239 하드코딩) | 같음 — `queryProductList({ pageSize: 50, concurrency: selected })` (user 선택 1/3/5) |
| Validation | **Yes** — `validateErpSnapshot` (REVIEW/ERROR 분류 포함) | **No** — raw rows 그대로 저장 (ipc.persistQueryResult) |
| Snapshot 저장 경로 | 같음 — `candidate.json.gz` (`saveCandidate` 호출 ipc 와 orchestrator 둘 다) | 같음 |
| Snapshot validation 포함 여부 | **Yes** (vSum) | **No** (saveCandidate 호출 시 `validation` 생략) → metadata.candidate.validation 이 **마지막 저장자가 승리** · 하단 조회가 상단 validation 을 **덮어씀** (현재 subtle issue) |
| Fetch history | **No** (orchestrator 가 `appendFetchHistory` 호출 안 함) | **Yes** (ipc.persistQueryResult 가 append) |
| UI 진행률 broadcast | `erp:dataset-progress` (phase 전환) + `erp:product-progress` (page 단위) | **`erp:product-progress` 만** (dataset-progress 는 orchestrator 전용) |
| ERP concurrency 선택 | 하드코딩 1 | 사용자 1/3/5 선택 |
| 기간 입력 (Inventory/Buy/Sale) | fetchDataset args 로 받긴 하지만 ErpSyncSection UI 에 **입력 UI 없음** (현 상태 default today) | 있음 (`invStart`/`invEnd` 등 ErpSection state) |

**차이 요약**:
1. **Queue** — 상단만 global concurrency=1 보장. 하단은 사용자 button 연타 가능.
2. **Validation** — 상단만 수행 (중요한 분기).
3. **FetchHistory** — 하단만 저장 (상단은 누락 · gap).
4. **Dataset Progress Broadcast** — 상단만 phase 전환 broadcast · UI card 상태 전환이 이걸로 동작.
5. **기간 입력 UI** — 하단에만 있음.
6. **snapshot validation 필드 overwrite** — 하단이 상단 valid 결과를 overwrite 하는 미묘한 bug (ipc.ts persistQueryResult line 55–66 에서 `validation` 미지정 → saveCandidate 기본값 undefined 로 metadata 바뀜).

**이 플랜의 재배선 원칙**:
- 하나의 "완전한 ERP fetch" 함수를 공통으로 추출 (`fetchCompleteDataset`) 하고 **두 경로 모두 그 함수를 통과**하도록 변경 → queue, validation, history 모두 동일.
- UI 상단 [ERP 새로 조회] 버튼은 **같은 IPC** (`erp:productList`, `erp:buyStatus`, …) 를 호출하되, 그 IPC 내부가 `enqueueFetchAwait` → `fetchCompleteDataset` → broadcast 를 수행하도록 변경 (Phase 1 공통 모듈화 결과).

---

## 3. Incremental Sync 공통 모듈 설계

> 사용자 지시의 10 함수를 **인터페이스 중심** 으로 설계. Dataset 별 차이는 adapter 로 분리. SOAP/decoder/pagination/validation 함수는 그대로 재사용 — 이 모듈은 그 위를 orchestrate 하는 **얇은 layer**.

### 3.1 Adapter 패턴 (Dataset 공통 추상화)

파일 신규: `apps/sync-agent/src/main/sync/datasetAdapter.ts` (제안)

```ts
export interface DatasetAdapter<ErpRow, DbRow, PayloadRow> {
  readonly dataset: DatasetKey;
  readonly label: string;
  readonly supabaseTable: string | null;   // null = NOT_CONFIGURED

  // Fetch
  readonly fetchFromErp: (opts: FetchOpts) => Promise<ErpInventoryResult>;    // 기존 queryXxx wrap
  readonly supportsDateRange: boolean;

  // Identity + fingerprint
  readonly identityOf: (row: ErpRow) => string | null;    // null = skip (empty identity row)
  readonly fingerprintOf: (row: ErpRow) => Record<string, unknown>;

  // Validation (REVIEW/ERROR 분류)
  readonly validate: (rows: readonly ErpRow[]) => ValidationSummary;

  // Payload builder (identity + whitelist 적용)
  readonly buildPayload: (erp: ErpRow, db: DbRow | null) => {
    payload: PayloadRow;
    changedFields: string[];
  };

  // Supabase side
  readonly fetchDbRows: (sb: SupabaseClient, identities: string[]) =>
    Promise<ReadonlyMap<string, DbRow>>;
  readonly fetchAllDbRows: (sb: SupabaseClient) => Promise<DbRow[]>;        // full-verification 전용
  readonly dbIdentityOf: (row: DbRow) => string | null;
  readonly writeRow: (sb: SupabaseClient, payload: PayloadRow, identity: string) =>
    Promise<{ ok: boolean; error?: string }>;
  readonly readBackField: ReadonlyArray<string>;   // read-back 비교 필드 집합
}

export const PRODUCT_ADAPTER: DatasetAdapter<ErpProductRow, DbProductRow, Record<string, unknown>>;
// 이후 INVENTORY/BUY/SALE adapter 는 identity 실측 확정 후 추가 (Phase 3)
```

### 3.2 공통 함수 (사용자 명세 10개)

파일 신규: `apps/sync-agent/src/main/sync/incrementalSync.ts` (제안)

```ts
// 1. 전체 ERP 수집 (pagination 끝까지 · validation 끝까지)
export async function fetchCompleteDataset<T>(
  adapter: DatasetAdapter<T, any, any>,
  opts: FetchOpts,
): Promise<FetchCompleteResult<T>>;
// - 내부: adapter.fetchFromErp → ok 확인 → adapter.validate → ValidationSummary
// - 실패 시 throw (candidate 저장 안 함)
// - 성공 시 saveCandidate + appendFetchHistory (상·하단 공통)
// - broadcastDatasetProgress (phase 전환 broadcast)

// 2. Validation (adapter.validate wrap · identity 중복 · 필수 · schema)
export function validateDataset<T>(adapter: DatasetAdapter<T, any, any>, rows: T[]): ValidationSummary;

// 3. Local baseline 로드 (snapshotStore.loadLastSyncedFull wrap)
export function loadLocalBaseline<T>(dataset: DatasetKey): T[] | null;

// 4. Local Diff (identity 기준 · fingerprint hash 비교)
export function compareLocalDataset<T>(
  oldBaseline: readonly T[] | null,
  newDataset: readonly T[],
  adapter: DatasetAdapter<T, any, any>,
): LocalDiffSummary;
// MISSING 분류는 유지 · 자동 DELETE 변환 금지 (호출부가 결정)

// 5. Supabase 에서 변경 후보만 조회
export async function fetchChangedRowsFromSupabase<T, D>(
  sb: SupabaseClient,
  adapter: DatasetAdapter<T, D, any>,
  identities: readonly string[],
): Promise<ReadonlyMap<string, D>>;

// 6. ERP vs DB 최종 비교 (whitelist · timestamp normalize · null-overwrite 적용)
export function compareWithSupabase<T, D, P>(
  erpRows: readonly T[],
  dbMap: ReadonlyMap<string, D>,
  adapter: DatasetAdapter<T, D, P>,
): SupabaseDiffSummary<P>;

// 7. 실제 Supabase WRITE (identity + WEB-owned protect)
export async function applyChanges<T, D, P>(
  sb: SupabaseClient,
  adapter: DatasetAdapter<T, D, P>,
  changes: SupabaseDiffEntry<P>[],
  opts: { allowWrite: boolean; concurrency?: number },
): Promise<ApplyResult>;

// 8. Read-back (10 field 전수)
export async function readBack<T, D, P>(
  sb: SupabaseClient,
  adapter: DatasetAdapter<T, D, P>,
  changes: ReadonlyArray<{ identity: string; payload: P }>,
): Promise<ReadBackReport>;

// 9. Baseline 교체 (atomic rename · snapshotStore.promoteCandidateToLastSynced wrap)
export function promoteLocalBaseline(dataset: DatasetKey, newBaseline: NewBaselineRef): SnapshotMeta | null;

// 10. Full verification (전체 ERP vs 전체 Supabase · Baseline 무시)
export async function fullVerification<T, D, P>(
  sb: SupabaseClient,
  adapter: DatasetAdapter<T, D, P>,
  opts: FetchOpts,
): Promise<FullVerificationReport>;
// - fetchCompleteDataset
// - adapter.fetchAllDbRows
// - compareWithSupabase (전체)
// - WRITE 는 하지 않음 · Review 전용 리포트
```

### 3.3 두 모드 흐름

**INCREMENTAL CHECK (default)**:
```
fetchCompleteDataset              // ERP 전수조회 · candidate 저장 (Baseline 교체 X)
  → compareLocalDataset           // 1차 필터 · SAME/NEW/CHANGED/MISSING
  → NEW + CHANGED identities 만 추출
  → fetchChangedRowsFromSupabase  // 최소 쿼리
  → compareWithSupabase           // DB_MISSING_INSERT / DB_DIFFERENT_UPDATE / DB_SAME_SKIP
  → applyChanges                  // 사용자 승인 후 WRITE
  → readBack                      // 10 field 전수 비교
  → VERIFIED_SUCCESS → promoteLocalBaseline (atomic replace)
  → PARTIAL_FAILED  → candidate 유지 · Baseline 교체 X
```

**FULL VERIFICATION**:
```
fetchCompleteDataset
  → fullVerification               // 전체 ERP ↔ 전체 Supabase (Baseline 무시 · 1차 필터 skip)
  → 리포트만 · WRITE X
  → Baseline 교체 X
```

### 3.4 핵심 규칙 반영 체크

| 사용자 규칙 | 반영 지점 |
|-------------|-----------|
| Local Diff ≠ DB Write Decision · Local Diff 는 1차 필터 | `applyChanges` 는 `SupabaseDiffEntry` 를 받음 — 즉 **Supabase 비교 후** 의 결정만 수용. Local Diff 결과를 직접 받지 않음. |
| MISSING 자동 DELETE 금지 | `SupabaseDiffAction` 에 DELETE 자체 없음 (현재 유지) · `applyChanges` 가 MISSING 분기 미처리 → ignore (호출부 결정) |
| Local Baseline = 마지막 정상 처리 완료 ERP dataset | `loadLocalBaseline` → `loadLastSyncedFull`, `promoteLocalBaseline` → `promoteCandidateToLastSynced` 재사용 |
| Supabase sync 성공 후에만 Baseline 교체 | `promoteLocalBaseline` 호출은 `readBack` VERIFIED_SUCCESS 분기 안에서만 |
| Timestamp normalize 비교 | `compareWithSupabase` 내부에서 adapter 가 TIMESTAMP_FIELDS 지정 · `timestampsEqual` 적용 (현재 서비스 재사용) |
| Dataset identity 임의 생성 금지 | Product = PCode 확정 (whitelist 반영) · Inventory/Buy/Sale 는 adapter 등록을 **Phase 3 실측 확정 후** 로 미룸 |
| Buy BmCode+ROWNUM identity 확정 전제 금지 | Buy adapter 는 Phase 3 전까지 등록 X · UI 는 "식별 미확정" badge 유지 |

### 3.5 두 UI 경로 공통화

Phase 1 공통 모듈이 생기면 **IPC handler 재배선**:
- `erp:productList` (ipc.ts line 234) 내부가 `queryProductList` 직접 호출 → **`fetchCompleteDataset(PRODUCT_ADAPTER)` 호출** 로 교체. 결과는 지금과 동일한 shape 유지 (하단 UI 재사용 가능).
- `erpSync:fetchDataset` 는 **동일 IPC 를 재발행** (Queue 를 통과하되 내부는 같은 공통 함수). 즉 두 경로가 **같은 공통 함수** 를 통과.
- 결과:
  - 상단 [ERP 새로 조회] 클릭 → `erp:productList` (사용자 지시의 "현재 검증 완료된 하단 직접조회 로직을 그대로 호출") 수행.
  - **단**, queue/validation/history 는 공통 함수 안에서 처리되므로 두 경로 모두 완전 동일.

---

## 4. UI 재구성 상세

### 4.1 재사용 유지

| 컴포넌트 | 파일 | 재사용 방식 |
|----------|------|-------------|
| `SnapshotTable` | ErpSyncSection.tsx 672–746 | 상단 카드 안 "ERP 데이터 보기" 모달 바디로 이동. 그대로 재사용. |
| `FetchHistoryPanel` | ErpSection.tsx 316–396 | 좌측 메뉴 "로그 → ERP 조회 이력" 서브탭에서 재사용 (dataset filter 추가). |
| `ProductProgressBar` | ErpSection.tsx 399–428 | DatasetCard 안 "ERP 조회 진행률" 바로 이동 (현재는 inflight bar 간이 버전만 있음). |
| `ErpQueryView` 내부 로직 중 pagination/검색/row modal | components/ErpQueryView.tsx | **"ERP 데이터 보기" modal** 안에서 재사용 가능. 하지만 modal 안으로 들어오면 조회버튼/conditionsSlot 은 제거 필요 → **동일 컴포넌트 재사용 어려움** · 신규 `DatasetRowsModal` 작성이 깨끗 (ErpQueryView 분해 X · 공존). |
| Sync Workflow (동기화 확인/변경 내용 보기/반영/이력) | ErpSyncSection.tsx 486–647 | **그대로 유지** · PRODUCT_LIST 에 이미 완성. INVENTORY/BUY/SALE 는 Phase 3 adapter 완성 후 동일 패턴 복제. |
| `SyncHistoryEntry` 테이블 (486–614 블럭) | ErpSyncSection.tsx | 카드 아래 "최근 반영 요약 1줄" 만 남기고, 상세 테이블 (max-h-200 overflow block 576–611) 은 **좌측 "로그 → Supabase 동기화 이력"** 로 이동. |
| `ReadinessBadge` / `PhaseBadge` | 752–777 | **ReadinessBadge 는 제거** (사용자 지시 · 개발자 badge). `PhaseBadge` 는 조회 중 phase 표시용으로 유지하되, label 을 사용자 친화 ("대기 / 조회 중 / 변환 / 검증 / 완료 / 실패") 수준으로 단순화. |

### 4.2 제거/숨김

| 대상 | 파일:line | 처리 |
|------|-----------|------|
| 상단 하단 토글 뷰 | Dashboard.tsx 11–30 | **View toggle 삭제** · 메인은 ErpSyncSection 하나. "직접 조회" 는 각 카드 안 [ERP 새로 조회] 로 흡수. |
| 하단 ErpSection UI 전체 | screens/ErpSection.tsx | 화면에서 **제거** · 단 파일은 아카이브 보존 (Phase 1~Phase 4 하단 로직 재사용 reference). |
| ErpQueryView UI | components/ErpQueryView.tsx | 직접 UI 는 **사용 중단**. 내부 함수/row-modal 로직은 Phase 4 에서 `DatasetRowsModal` 로 발췌. |
| 선택 CheckBox + "선택 데이터 ERP에서 가져오기" bar | ErpSyncSection.tsx 260–279 | **제거** · 각 카드 안 [ERP 새로 조회] 로 통합. |
| "선택 데이터 Supabase 동기화 (잠김)" | ErpSyncSection.tsx 271–278 | **제거**. |
| "DRY-RUN ONLY · 실제 WRITE 비활성" badge | ErpSyncSection.tsx 224–226 | **제거** (사용자 지시 · 개발자 라벨). |
| `ReadinessBadge` (READY/REVIEW/BLOCKED/NOT_CONFIGURED/SYNCED) | ErpSyncSection.tsx 363, 752–762 | **제거** (사용자 지시 · 개발자 badge). |
| 기술명 "SvcProductBiz · 42 col 등" | ErpSection.tsx 32–37 TABS[].sub · ErpSyncSection.tsx 361 DATASET_API | **제거** (사용자 지시). |
| 상단 설명 "4개 데이터 세트 … 수집 → 변환 → 검증 → 비교 → 승인 → 반영" | ErpSyncSection.tsx 217 | **교체** → "ERP 데이터를 조회하고 변경된 내용만 Supabase 에 동기화합니다". |

### 4.3 상단 [ERP 새로 조회] 가 하단 로직을 호출하는 재배선

**현재** (상단 fetchDataset):
```
erpSyncFetchDataset({ dataset }) → erpSync:fetchDataset
  → enqueueFetch → run<Dataset>Fetch → query<Dataset> + validate + saveCandidate
```

**현재** (하단 direct):
```
erpProductList({ pageSize, concurrency }) → erp:productList
  → queryProductList + persistQueryResult (saveCandidate + appendFetchHistory)
```

**플랜 (Phase 1 완성 후)**:
```
상단 [ERP 새로 조회] 클릭
  → window.api.erpProductList({ dataset, startDate?, endDate? })        // 상·하단 통일
  → erp:productList IPC
  → erpQueue.enqueue(dataset)        // Queue 통과 보장
  → fetchCompleteDataset(adapter, opts)
      - adapter.fetchFromErp (= queryProductList) · 그대로 재사용
      - adapter.validate · 공통 수행
      - saveCandidate (validation 포함)
      - appendFetchHistory
      - broadcastDatasetProgress (phase 전환)
      - broadcastProductProgress (page 단위 · ProductList 만)
  → 결과 반환
```

핵심: **상단 UI 가 호출하는 IPC = 하단에 이미 있던 IPC** (사용자 지시 "현재 검증 완료된 하단 직접조회 로직을 그대로 호출"). SOAP 로직은 1라인도 재작성하지 않음.

### 4.4 각 카드 state 구조 (상단 DatasetCard · 재구성 후)

```ts
interface DatasetCardState {
  // Metadata (from erpSyncGetAllDatasets)
  dataset: DatasetKey;
  label: string;                     // 사용자 라벨 (상품정보 · 현재고 / 재고 입출고 현황 / 매입내역 / 판매내역)
  erpLastFetchedAt: string | null;   // candidate.completedAt
  erpRowCount: number | null;
  erpValidation: { normal, review, error } | null;

  // Date range (Inventory/Buy/Sale 만)
  dateRange?: { from: string; to: string };

  // In-progress
  fetchPhase: FetchPhase;            // IDLE/QUEUED/REQUESTING/DECODING/VALIDATING/READY/FAILED
  pageProgress?: { page: number; totalPages?: number; rowsAccum: number };

  // Local Diff 결과 (ERP 전수조회 완료 후 compareLocalDataset)
  localDiff: {
    same: number; new_: number; changed: number; missing: number;
  } | null;

  // Supabase 비교 결과 (compareWithSupabase 후)
  supabaseDiff: {
    wouldInsert: number; wouldUpdate: number; skipSame: number;
    changes: Array<{ identity: string; name: string; action: 'INSERT'|'UPDATE'; fieldDiffs: FieldDiff[] }>;
  } | null;

  // Last Supabase sync
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncSummary: { updatedRows, updatedCells, failed, readbackMismatch, webModified, identityModified } | null;

  // UI 상태 (local)
  checking: boolean;         // 동기화 확인 중
  applying: boolean;         // Supabase 반영 중
  showChanges: boolean;      // 변경 내용 modal
  showRows: boolean;         // ERP 데이터 보기 modal
}
```

### 4.5 각 카드 레이아웃 (최종)

```
┌─ Dataset Card ────────────────────────────────────────┐
│ 📦 상품정보 · 현재고                                     │
│                                                        │
│ ERP 최근 조회   2026-10-04 12:34                        │
│ 조회 건수       4,007                                  │
│ 상태            대기                                   │
│                                                        │
│ ── 기간 (Inventory/Buy/Sale 만) ─────────────         │
│  [시작일] ~ [종료일]                                   │
│ ────────────────────────────────────────────         │
│                                                        │
│ Local Diff      SAME 3,850 / NEW 100 / CHANGED 50     │
│                  / MISSING 7                           │
│ Supabase 비교   INSERT 100 / UPDATE 48 / SKIP 2       │
│ 마지막 반영     2026-10-04 11:20 · 성공 (49 rows)      │
│                                                        │
│ [ERP 새로 조회] [ERP 데이터 보기]                       │
│ [변경 내용 보기] [Supabase 동기화]                     │
└────────────────────────────────────────────────────────┘
```

### 4.6 변경 내용 모달 구조

| 컬럼 | 소스 |
|------|------|
| Identity | adapter.identityOf(erpRow) |
| 상품명/라벨 | adapter.fingerprintOf 안 name field |
| 변경 field | FieldDiff[].field |
| 이전 Local Baseline | lastSynced row 의 field 값 |
| 새 ERP | candidate row 의 field 값 |
| 현재 Supabase | compareWithSupabase 가 반환한 dbRow 의 field 값 |

이것은 사용자 지시의 "identity · 변경 field · 이전 Local · 새 ERP · 현재 Supabase" 구조.

### 4.7 긴 이력 → 좌측 메뉴 "로그"

현재 좌측 "로그" 탭 (App.tsx line 124 `tab === "logs"` → `<Logs />`) 는 파일 import 전용. 아래 서브탭을 추가:

```
좌측 "로그" 탭
├── 파일 임포트 로그 (현재 로직 유지)
├── ERP 조회 이력 (신규 서브탭)
│    └── FetchHistoryPanel 재사용 · dataset filter dropdown
└── Supabase 동기화 이력 (신규 서브탭)
     └── SyncHistoryTable (ErpSyncSection 안 inline 테이블 576–611 를 추출)
```

### 4.8 자동 Scheduler UI 자리 (구현 X · 자리만)

```
┌─ 자동 동기화 ───────────────────────────────────────┐
│  [OFF 토글]  주기: 매일 02:00 · 다음 실행: --        │
│  마지막 실행: 아직 없음                              │
│  대상 Dataset: ☐ Product_List ☐ Buy_Status ...       │
└──────────────────────────────────────────────────────┘
```

ErpSyncSection 하단 (현재 "선택 액션 bar" 자리) 에 placeholder 로 유지 · 토글/저장은 **Phase 7 미구현**.

---

## 5. 수정 예정 파일 리스트 + 영향 범위

| # | 파일 | 처리 | Phase | 영향 |
|---|------|------|-------|------|
| 1 | `apps/sync-agent/src/main/sync/datasetAdapter.ts` | **신규** | 1 | 공통 adapter interface + Product adapter |
| 2 | `apps/sync-agent/src/main/sync/incrementalSync.ts` | **신규** | 1 | 10 공통 함수 (fetchCompleteDataset 등) |
| 3 | `apps/sync-agent/src/main/sync/historyStore.ts` | **신규** (옵션) | 1 | fetchHistoryStore + syncHistoryStore 공통 추출 |
| 4 | `apps/sync-agent/src/main/iregenSoap.ts` | **보존** | — | 재사용만 (수정 X) |
| 5 | `apps/sync-agent/src/main/snapshotStore.ts` | **보존** | — | 재사용만 |
| 6 | `apps/sync-agent/src/main/erpSyncOrchestrator.ts` | **수정** | 2 | run*Fetch 가 incrementalSync.fetchCompleteDataset 호출 하도록 재배선. buildProductDiff → compareLocalDataset + compareWithSupabase 조합으로 재구현. applyProductSync lock 유지. |
| 7 | `apps/sync-agent/src/main/productSyncService.ts` | **수정** | 2 | applyProductSync 가 incrementalSync.applyChanges + readBack + **promoteLocalBaseline(VERIFIED_SUCCESS 때만)** 호출. 현재 누락된 Baseline 교체 재배선. |
| 8 | `apps/sync-agent/src/main/ipc.ts` | **수정** | 2 | `erp:productList` 등 하단 IPC 가 incrementalSync 를 통과하도록 재배선 (queue+validation+history 공통). `erpSync:fetchDataset` 는 같은 IPC 로 흡수 or shim 유지. `erpSync:productDiff` 를 `erpSync:productCheck` (Local+Supabase 합산) 로 교체. Full-verification IPC 추가 (`erpSync:fullVerify`). |
| 9 | `apps/sync-agent/src/preload/index.ts` | **수정** | 2 | 신규 full-verify API 노출. 기존 API shape 변경 없음. |
| 10 | `apps/sync-agent/src/renderer/src/screens/ErpSyncSection.tsx` | **수정** (대폭) | 4 | DatasetCard 재구성 · ReadinessBadge/DRY-RUN/선택CheckBox/하단bar 제거 · 각 카드 안 날짜·버튼4개 재배치 · 변경내용 modal 신규 · 긴 이력 블록 삭제 (Logs 로 이동) · Scheduler 자리 placeholder. |
| 11 | `apps/sync-agent/src/renderer/src/screens/ErpSection.tsx` | **deprecate** | 4 | Dashboard 에서 참조 제거. 파일은 reference 로 유지하되 export 는 unused. |
| 12 | `apps/sync-agent/src/renderer/src/components/ErpQueryView.tsx` | **deprecate** | 4 | 사용 X. (상단 "ERP 데이터 보기" modal 은 신규 `DatasetRowsModal` 로 작성 or SnapshotTable 재사용.) |
| 13 | `apps/sync-agent/src/renderer/src/screens/Dashboard.tsx` | **수정** | 4 | View toggle 삭제 · ErpSyncSection 하나만. |
| 14 | `apps/sync-agent/src/renderer/src/screens/Logs.tsx` | **수정** | 5 | 서브탭 2개 추가 (ERP 조회 이력 · Supabase 동기화 이력). |
| 15 | `apps/sync-agent/src/renderer/src/components/DatasetRowsModal.tsx` | **신규** | 4 | 카드 [ERP 데이터 보기] 모달 바디 (SnapshotTable 를 모달 안에 wrap · pagination/검색 포함) |

**합계**: 수정 10 · 신규 5 · 삭제 0 · deprecate 2 (파일 보존).

영향받지 않는 파일 (명시 재확인):
- `iregenSoap.ts` (SOAP 로직) — 수정 없음.
- `src/shared/erp/*` 공통 모듈 — 수정 없음 (이미 pure function 으로 완성).
- `snapshotStore.ts` · `fetchHistoryStore.ts` · `syncHistoryStore.ts` — 수정 없음 (incrementalSync 가 wrap).
- `erpQueue.ts` — 수정 없음 (그대로 재사용).

---

## 6. 최종 화면 Component Tree

```
App
├── Login (현상 유지)
└── Dashboard (수정 · view toggle 제거)
    ├── 메인: ErpSyncSection (상단에 "ERP → Supabase 동기화" 영역 하나만)
    │   ├── Header
    │   │   ├── Title "ERP → Supabase 동기화"
    │   │   └── Subtitle "ERP 데이터를 조회하고 변경된 내용만 Supabase 에 동기화합니다"
    │   ├── Grid (md:2 xl:4)
    │   │   ├── DatasetCard · Product_List
    │   │   │   ├── 조회 상태 · 조회건수 · 최근 조회
    │   │   │   ├── Local Diff 결과
    │   │   │   ├── Supabase 비교 결과
    │   │   │   ├── 마지막 반영 1줄 요약
    │   │   │   ├── Actions: [ERP 새로 조회] [ERP 데이터 보기]
    │   │   │   │           [변경 내용 보기] [Supabase 동기화]
    │   │   │   ├── (modal) DatasetRowsModal · ERP 데이터 보기
    │   │   │   └── (modal) ChangesModal · 변경 내용 보기
    │   │   ├── DatasetCard · Inventory_Status (조회기간 inline)
    │   │   ├── DatasetCard · Buy_Status (조회기간 inline)
    │   │   └── DatasetCard · Sale_Status (조회기간 inline)
    │   └── (Phase 7 placeholder) 자동 Scheduler 자리
    ├── 설정 (현상 유지)
    └── 좌측 "로그" 탭 (서브탭 추가)
        ├── 파일 임포트 로그 (현상 유지)
        ├── ERP 조회 이력 (신규 · FetchHistoryPanel · dataset filter)
        └── Supabase 동기화 이력 (신규 · SyncHistoryTable · dataset filter)
```

---

## 7. 구현 순서 (단계별 체크리스트)

### Phase 1 · 공통 모듈 (SOAP 재사용)
- [ ] 신규 `apps/sync-agent/src/main/sync/datasetAdapter.ts` · `DatasetAdapter` interface
- [ ] 신규 `apps/sync-agent/src/main/sync/incrementalSync.ts` · 10 함수 (fetchCompleteDataset / validateDataset / loadLocalBaseline / compareLocalDataset / fetchChangedRowsFromSupabase / compareWithSupabase / applyChanges / readBack / promoteLocalBaseline / fullVerification)
- [ ] (옵션) 신규 `apps/sync-agent/src/main/sync/historyStore.ts` · fetch/sync history 공통 추출
- [ ] 단위 테스트 (vitest) · pure 함수부 커버

### Phase 2 · Product adapter · 기존 서비스 흡수
- [ ] `PRODUCT_ADAPTER` 정의 (identity=BarCode · fingerprint=existing · validate=existing · buildPayload=existing)
- [ ] `erpSyncOrchestrator.ts` runProductFetch 를 fetchCompleteDataset 로 교체
- [ ] `productSyncService.ts` applyProductSync 가 applyChanges+readBack+promoteLocalBaseline 사용. **VERIFIED_SUCCESS 때 Baseline atomic replace 추가** (현재 gap).
- [ ] `ipc.ts` `erp:productList` 가 fetchCompleteDataset 를 통과하도록 재배선 (상·하단 통일)
- [ ] `erpSync:fetchDataset` 는 **같은 IPC 호출 shim** (하위호환) · 내부 Queue 통과 보장
- [ ] `erpSync:productCheck` (신규) · Local+Supabase+History 통합 반환
- [ ] `erpSync:fullVerify` (신규) · fullVerification 노출
- [ ] 기존 `erpSync:productDiff` 는 deprecated · UI 는 신 IPC 로 전환

### Phase 3 · Inventory/Buy/Sale adapter (identity 실측 확정 후)
- [ ] Buy identity 확정 (BmCode+ROWNUM 확실 테스트 데이터로 검증) · 사용자 승인 전까지 **adapter 등록 보류**
- [ ] Inventory identity 확정 · PCode 유일성 실측
- [ ] Sale 는 DB 테이블 미정의 → ERP 조회만 · WRITE adapter 미등록
- [ ] 각 adapter 등록 → 자동으로 상단 카드 workflow 활성화

### Phase 4 · UI 통합
- [ ] `Dashboard.tsx` view toggle 제거 · `ErpSyncSection` 단독
- [ ] `ErpSyncSection.tsx` DatasetCard 재구성 · ReadinessBadge/DRY-RUN/선택CheckBox/하단bar 제거
- [ ] 날짜 입력 Inventory/Buy/Sale 카드에 inline 추가
- [ ] `DatasetRowsModal` 신규 (ERP 데이터 보기)
- [ ] `ChangesModal` 신규 (변경 내용 보기 · identity+field+Local+ERP+Supabase 5열)
- [ ] 긴 history 블록 (현재 ErpSyncSection line 553–614) 삭제 → 요약 1줄만 유지
- [ ] `ErpSection.tsx` / `ErpQueryView.tsx` 더 이상 import 되지 않도록 참조 제거

### Phase 5 · 로그 화면 분리
- [ ] `Logs.tsx` 서브탭 2개 추가 (ERP 조회 이력 · Supabase 동기화 이력)
- [ ] FetchHistoryPanel + dataset filter dropdown
- [ ] SyncHistoryTable 추출 + dataset filter

### Phase 6 · Full Verification 모드
- [ ] 각 Card 에 "전체 검증" 보조 버튼 (사용자 승인 후 활성화) · UI 는 Phase 4 와 동시에 skeleton 가능

### Phase 7 · Scheduler UI 자리
- [ ] ErpSyncSection 하단 placeholder (ON/OFF · 주기 · 최근/다음 실행 · 마지막 결과) · 실제 로직 **구현 X**

---

## 8. 열린 질문 / 사용자 결정 대기

1. **View toggle 삭제 확정?** — Dashboard.tsx `view === "both"` 를 완전히 제거하는지, 아니면 "직접 조회" 를 debug 전용 숨김 토글로 남기는지.
2. **ErpSection.tsx 파일 자체 삭제 vs 아카이브 보존** — reference 보존 선호 (지금은 **보존** 가정).
3. **Buy identity 확정 테스트 데이터** — 사용자 ERP 매입 trans 2건 이상 (같은 BmCode 로 2 ROWNUM 있는 샘플) 샘플링 승인 필요.
4. **Full Verification 트리거 위치** — DatasetCard 안 보조 버튼 (제안) vs 좌측 메뉴 신규 "검증" 탭.
5. **Scheduler Dataset 선택 범위** — Product_List 만 자동? 또는 전체 선택?
6. **Promote 시점 선택** — Phase 2 재배선 시 `promoteLocalBaseline` 호출 조건을 "VERIFIED_SUCCESS AND failed=0 AND identityModified=0 AND webModified=0" 로 할지, 더 엄격하게 "readbackMismatch=0 포함" 으로 할지 (제안: 엄격 쪽).

---

## 9. 금지 사항 재확인

| 항목 | 상태 |
|------|------|
| Supabase WRITE/INSERT/UPDATE/DELETE | 0 (이 문서 작성 중) |
| DB schema CREATE/ALTER/DROP | 0 |
| Scheduler 실제 구현 | 0 (UI placeholder 만) |
| UI 수정 | 0 (계획만) |
| 코드 재작성 (iregenSoap/decoder/pagination) | 0 (전부 재사용) |
| 로컬 commit · remote push | 0 |

이 markdown 하나가 유일한 산출물.
