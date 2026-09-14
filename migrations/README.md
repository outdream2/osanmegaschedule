# DB Migrations · 폴더 안내

> 2026-09-14 · 3개 폴더 · 총 99개 SQL 파일 · 프로젝트 히스토리 상 여러 위치에 축적됨

## 폴더 구조

| 폴더 | 파일 수 | 용도 | 최신 파일 |
|---|---:|---|---|
| **`migrations/`** (여기) | 44 | 활성 · 현재·미래 마이그레이션 (2026-08 이후 표준) | `20260914_*.sql` |
| **`supabase/migrations/`** | 44 | 초기 · 2026-07~09 스키마 · Supabase CLI 호환 | `20260903_*.sql` |
| **`sql/`** | 11 | 2026-08 임시 (일회성 데이터 patch·롤백 실험) · 신규 저장 X | `2026-08-30*.sql` |

## 신규 마이그레이션 위치 (원칙)

**모든 신규 SQL · `migrations/` 폴더** · 파일명 `YYYYMMDD_<describe>.sql` 형식.

- 예: `migrations/20260915_add_products_col.sql`
- `supabase/migrations/` · 신규 저장 X (Supabase CLI 통합 재검토 후 재활성 예정)
- `sql/` · 신규 저장 X (deprecated)

## 실행 방법

### Supabase SQL Editor (권장 · 프로덕션)

1. Supabase 대시보드 · SQL Editor
2. 파일 내용 복사 · 실행
3. 완료 후 · `docs/TEST_LIST_YYYY-MM-DD_session.md` 에 실행 기록

### 로컬 개발 (직접 실행 옵션)

```bash
# Supabase CLI (선택)
supabase db push
```

## 파괴적 SQL · 주의 (대원칙)

- `DROP TABLE` · `TRUNCATE` · `DELETE WITHOUT WHERE` 등 · **반드시 사용자 사전 확인**
- 실행 전 · 백업 필수
- 최근 예:
  - `migrations/20260904_drop_real_map.sql` · products.real_map DROP (2026-09-04 · 사용자 승인 완료)
  - `migrations/drop_unused_derived_tables_2026-08-29.sql` · 미사용 파생 테이블 DROP

## 실행 이력 · 사용자 완료 확인 (최근)

| 파일 | 실행일 | 확인 |
|---|:---:|:---:|
| `migrations/20260914_credit_cards_limit_cashback.sql` | 대기 | 사용자 실행 필요 |
| `migrations/20260914_inventory_checks_rename_store_stocks.sql` | 대기 | 사용자 실행 필요 |
| `migrations/20260914_add_inventory_checks_store_stock_2.sql` | 대기 | 사용자 실행 필요 |
| `migrations/20260910_vendors_company_name_unique.sql` | 완료 | 2026-09-10 |
| `migrations/20260910_seasonal_events.sql` | 완료 | 2026-09-10 |
| `migrations/20260908_add_inventory_checks_shelf_positions.sql` | 완료 | 2026-09-08 |
| `migrations/20260904_drop_real_map.sql` | 완료 | 2026-09-08 |

## 향후 계획

- Phase 1 · `migrations/` 활성 유지 · `supabase/migrations/` · `sql/` 접근 read-only
- Phase 2 · Supabase CLI 재통합 · 자동 실행 파이프라인 (사용자 승인 후)
- Phase 3 · 통합 · 3 폴더 → 1 폴더 이관 (히스토리 보존)
