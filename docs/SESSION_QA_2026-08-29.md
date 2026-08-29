# QA 세션 보고서 · 2026-08-29

> 대상: 2026-08-28~29 완료 태스크 전수 테스트  
> 커밋: bcdd444e

## 1. 자동 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **3342 / 3342 PASS** (227 파일) |
| `audit-framework.cjs` | 위반 4건 · 99% 클린 (모두 medium · 이전 세션 알려진 건) |
| `audit-server.cjs` | 위반 131건 · high 40 (기존 baseline · 신규 없음) |

## 2. 회귀 점검 결과

### ✅ 정상 확인 항목
| 항목 | 파일 | 결과 |
|---|---|---|
| z-index · EmployeeNameCell z-20 vs 헤더 z-50 | ScheduleGrid.tsx:122,156 · EmployeeNameCell.tsx:68 | 정상 (헤더>데이터 의도적 계층) |
| sale_active_only 판정 3개 API 통일 | stock-check / products-by-category / products-search | 정상 · `value !== false` 규칙 일치 |
| getPublicProductMap hidden 필터 | productCache.ts + products-map route | 정상 |
| TTL 30초 · productMapCache | server/productCache.ts:17 | 정상 |
| pending-counts · location vs real_map fix | requests.ts:28-46 | 정상 · locZone·real 둘 다 있을 때만 비교 |
| vendor 로그인 · manager_phone 매칭 | auth.ts:62-63 | 정상 · `.or(manager_phone.eq...,phone.eq...)` |
| BottomNav 모바일 gate | BottomNav.tsx:48 | 정상 · `mobileVisible()` 필터 적용 |
| ProductBasicInfoPanel 3 사용처 props 정합 | ScanPage · DisplayPage · ProductInfoPage | 정상 · product_code·supplier·location 모두 전달 |
| 승인요청 UI · vendor 로그인 게이트 | VendorDetailModal.tsx:46,376,679 | 정상 · `isVendorLogin` 조건부 |
| dead 컬럼 28개 upsert 필터 | products.ts:396-412 | 정상 |
| framework audit 위반 신규 없음 | docs/FRAMEWORK_AUDIT.md | 정상 (기존 4건 유지 · 신규 0) |

## 3. 즉시 수정한 버그

### 🟢 LOW · saleSetting 루프 내 반복 조회
- **파일**: `server/routes/stock/stockManage.ts` L1492
- **문제**: `while(true)` 페이지 루프 안에서 매 1000건마다 `app_settings` DB 조회
- **수정**: 루프 진입 전 1회 조회로 이동
- **커밋**: `bcdd444e`

## 4. 미수정 (사용자 판단 불필요 · 기존 baseline)

| 항목 | 이유 |
|---|---|
| SERVER_AUDIT 131건 (high 40) | 기존 baseline · 이번 세션 신규 아님 |
| FRAMEWORK_AUDIT 4건 medium | 기존 baseline · SaleStatusFilter raw-card는 false positive (segmented control) |

## 5. 결론

- **CRITICAL / HIGH**: 0건
- **MEDIUM**: 0건  
- **LOW**: 1건 수정 완료 (saleSetting 루프 반복 조회)
- **배포 가능 상태**: YES · TS 0 · tests 3342 all pass
