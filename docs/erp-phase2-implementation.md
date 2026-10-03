# ERP Sync · Phase 2 Implementation · DRY-RUN Preview 완성

**작성일**: 2026-10-03 저녁
**상태**: 구현 완료 · **DB WRITE 0** · 실제 Initial Build 실행 금지 · Phase 3 사용자 승인 후 활성화 예정

---

## 1. 완료 범위

- `src/shared/erp/erpSyncWhitelist.ts` · ERP_IDENTITY / ERP_OWNED / ERP_DERIVED / PROTECTED 명시 whitelist (products + purchase_details)
  - `current_stock ← NowStock` 포함 (ERP_OWNED · nullOverwrite=true)
  - PROTECTED 방어 유틸 `assertNoProtectedField()`
- `src/shared/erp/erpLocationTransform.ts` · 벽/매대 변환 pure function + 전각→반각 정규화 + REVIEW 분리
- `src/shared/erp/erpProductMapper.ts` · `buildErpProductPayload()` · explicit whitelist payload builder (spread 금지)
- `src/shared/erp/erpBuyMapper.ts` · `buildBuyRowFromErp()` · (BmCode + ROWNUM) unique key · PCode→Barcode 변환
- `apps/sync-agent/src/main/iregenSoap.ts` · Retry 정책 `1s/2s/포기 → 30s/60s/120s/abort`
- `server/routes/admin/initialBuildPreview.ts` · DRY-RUN engine + Preview API (`GET /api/admin/initial-build/preview`)
  - 실행 endpoint 는 명시 lock (`POST /api/admin/initial-build/execute` → `HTTP 423`)
- `src/components/AdminInitialBuildPage/AdminInitialBuildPage.tsx` · Preview UI (sideNav `admin-initial-build` · 관리자 lv9)
- `server/utils/initialBuildBackup.ts` · Backup/Rollback scaffold + FK audit SQL (실행 금지)
- `supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql` · migration SQL 파일 (자동 실행 X · 사용자 승인 후 수동)
- 44 unit tests 추가 (`src/shared/erp/*.test.ts`) · 전부 통과

## 2. 명시적 금지 (Phase 2 유지)

- `products` · `purchase_details` · `stock_history` · `inventory_checks` · `vendors` · 어떤 테이블에도 DB WRITE 없음
- Scheduler 구현 없음
- `TRUNCATE` · `UPSERT` · `INSERT` · `UPDATE` · `DELETE` 실제 실행 없음
- Migration SQL 자동 실행 없음 (파일만 작성)
- Remote push 없음
- 기존 XLSX importer 수정 없음

## 3. DRY-RUN 흐름

```
Admin UI (관리자 lv9) → "ERP 초기 구축" 메뉴
       ↓
GET /api/admin/initial-build/preview
       ↓
Snapshot 로드 (data/snapshots/product-list-*.json + buy-status-*.json)
       ↓
Supabase READ (products / purchase_details)
       ↓
Mapper 적용 (whitelist payload · PROTECTED 체크)
       ↓
분류:
  Product: MATCHED / NEW / DB_ONLY / CONFLICT
  Field: SAME / CHANGE / DB_EMPTY_ERP_HAS / ERP_EMPTY_DB_HAS / BOTH_EMPTY
  Location: Auto / Keep / Review (뷰티 · 냉장고 · 뒤앞)
  Price: Match / DB-empty / Different (USER DECISION)
  Purchase: Mapped / Unmapped / Migration status
  Protected: 변경 수 = 0 (방어)
       ↓
Preview JSON 반환 → Admin UI 렌더링
```

## 4. 실행 흐름 (Phase 3 예정 · 아직 금지)

```
사용자 USER DECISIONS 완료
    (Location Review · Price Review · GO-LIVE 날짜)
       ↓
사용자 "Initial Build 실행" 명시 승인
       ↓
Phase 3 활성화:
  1. Backup (Supabase RPC 로 CREATE TABLE AS)
  2. Products UPSERT (whitelist payload)
  3. Purchase UPSERT (bm_code + row_num unique)
  4. Inventory UPDATE (current_stock ← NowStock)
  5. Verify
  6. GO_LIVE_INITIALIZED_AT 기록
```

## 5. 다음 단계 (사용자 승인 전 금지)

- [ ] Migration `future_phase2_erp_sync_bm_code_row_num.sql` 수동 실행 (Supabase SQL Editor)
- [ ] FK audit 수동 쿼리 실행 결과 리뷰
- [ ] USER DECISIONS 수집 (Location Review · Price Review)
- [ ] Phase 3 Runner 구현 (`server/utils/initialBuildRunner.ts`)
- [ ] Phase 3 명시 사용자 승인 후 실행
