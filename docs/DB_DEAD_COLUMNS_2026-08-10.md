# DB Dead Column 감사 (2026-08-10)

**대상**: 프로젝트 전체 Supabase PostgreSQL 스키마
**목적**: 사용되지 않는 (dead) 컬럼 · 테이블 검출 · 정리 준비

---

## ✅ 안전 삭제 가능 (참조 0건)

| 테이블 | 컬럼/객체 | 추가 시점 | 이유 |
|---|---|---|---|
| `ocr_supplier_aliases` | `canonical` | 2026-07-18 `audit-fix.sql` | SELECT 시 항상 `alias, supplier_name` 만 지정 · canonical 한 번도 읽지 않음 |
| `zone_assignments` | `dow` | 2026-07-18 `audit-fix.sql` | 실제 dow 로직은 `zone_dow_templates` 테이블(별도)에서 처리 · zone_assignments 에는 dead |
| `stock_reconciliation_sessions` | 테이블 전체 | 2026-07-18 `audit-fix.sql` | server/src 전체 참조 0 · 서버 라우터 미생성 |
| `stock_reconciliation_items` | 테이블 전체 | 2026-07-18 `audit-fix.sql` | server/src 전체 참조 0 · session FK 의존 |
| `ocr_confirmed_items` | `invoice_date_new` | 2026-08-03 `db_improvements_top3.sql` | TEXT→DATE 이관용 중간 컬럼 · RENAME 완료 후 잔존 가능성 (코드 참조 0 확인됨) |

## ⚠️ 검토 필요 (참조 있으나 상태 불명확)

| 테이블 | 컬럼 | 참조 위치 | 확인 필요 사항 |
|---|---|---|---|
| `resignation_requests` | `signature_data_url` | `server/routes/staff/resignations.ts` · `ResignationApprovalPage.tsx` · `ResignationWriterPage.tsx` | migration comment에 "deprecated 2026-08-03 · Storage 이관 완료 후 DROP 예정" · 클라이언트가 여전히 직접 읽어 `<img src=...>` 표시 · `signature_url`(Storage URL) 로 완전 전환되었는지 확인 필요 |
| `inventory_checks` | `warehouse_stock` | server 다수 · src 다수 | `warehouse1_stock` 신규 컬럼과 병존 · 레거시 fallback 코드로 광범위 참조 · 아직 active · 전환 완료 후 DROP |

## 📊 요약

- **총 dead: 5건** (컬럼 3 · 테이블 2)
- **저장 절감**: stock_reconciliation 두 테이블이 0행이라면 절감 미미 · 주 효과는 **스키마 간결화**

## 🎯 삭제 우선순위

1. **stock_reconciliation_sessions / items 테이블** · 참조 완전 0 · 가장 안전
2. **ocr_supplier_aliases.canonical**
3. **zone_assignments.dow**
4. **ocr_confirmed_items.invoice_date_new** · DB에 실제 존재 여부 먼저 확인

## 📋 다음 단계

1. Supabase 대시보드 · `information_schema.columns` 확인:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name='ocr_confirmed_items' AND column_name='invoice_date_new';
   ```
2. 존재하면 단독 마이그레이션 실행:
   ```sql
   ALTER TABLE ocr_confirmed_items DROP COLUMN invoice_date_new;
   ```
3. `stock_reconciliation_*` 테이블 · DROP 여부 · 사용자 확인 후:
   ```sql
   DROP TABLE IF EXISTS stock_reconciliation_items;
   DROP TABLE IF EXISTS stock_reconciliation_sessions;
   ```
4. `resignation_requests.signature_data_url` · Storage 이관 검증 후 DROP
5. `inventory_checks.warehouse_stock` · fallback 코드 제거 후 DROP
