# DATA_INTEGRITY_TEST_2026-09-01

> 생성: 2026-09-01 · Phase 1 정합성 감사

## 요약

| 도메인 | Zod Schema | 응답 DTO | DB SELECT | 판정 |
|---|:---:|:---:|:---:|:---:|
| products | ✓ (real_map 포함) | ✓ | ✓ | PASS |
| employees | ✓ (camelCase) | ✓ (6 필드 2026-08-29 추가) | ✓ | PASS |
| vendors | ✓ (5 신규 필드) | LOW · 7 필드 DTO 미반영 | ✓ (route SELECT 일치) | WARN |
| schedules | ✓ | N/A (server only) | ✓ | PASS |
| reservations | ✓ | ✓ | ✓ | PASS |
| borrowings | N/A (inline) | N/A | SELECT_COLS 선언형 ✓ | PASS |
| employeeContracts | ✓ | ✓ | ✓ | PASS |

## 상세 결과

### products
- `CreateProductSchema` · `real_map` 포함 · 명명 규칙 준수
- `src/shared/dtos/products.ts` Product 인터페이스 · `real_map: string | null` 정의 ✓
- 서버 SELECT · `real_map` 포함 ✓
- `resetProductCache` 모든 쓰기 경로 (5 호출) ✓

### employees
- `CreateEmployeeSchema` · `BaseEmployeeShape` camelCase 규칙 준수
- `Employee` DTO · 2026-08-29 추가 6 필드 (resident_number · push_subscription · break_time_minutes · break_apply_paid · primary_focus · primary_focus_percent) 포함 ✓
- 스키마에 없는 DTO 전용 필드 (resident_number 등) → 응답 전용 · 정상

### vendors (WARN · LOW)
- `CreateVendorSchema` · 5 신규 필드 (order_method · region · invoice_method · order_status · special_notes · approval_status) 정의 ✓
- `src/shared/dtos/vendors.ts` Vendor 인터페이스 · 위 7개 필드 미반영
- **영향 없음**: 서버는 `as any` 캐스팅 · 클라이언트는 `useVendors.ts` (`[key: string]: unknown`) 사용
- **권장**: DTO 업데이트 (문서/타입 안전성)

### 캐시 정합성
| 캐시 | TTL | 무효화 |
|---|---|---|
| server/productCache.ts | 30초 | resetProductCache 5곳 (모든 쓰기) |
| server/productCache.ts (saleActive) | 5초 | invalidateSaleActiveOnlyCache |
| src/lib/productsCache.ts (클라) | 60초 | 자동 만료 |
| src/hooks/useVendors.ts | 5분 | vendors-changed 이벤트 |

### FK · orphan 위험
- `borrowings` 테이블 · `authorize(1)` GET / `authorize(5)` POST ✓ (2026-08-29 fix)
- `employee_contracts` · CASCADE 정책 조사 완료 (2026-08-29 Phase C) · 안전 판정 ✓
- `reservations` · `vendor_id BIGINT` FK (2026-08-31 마이그레이션) ✓

## 결론

CRITICAL/HIGH/MEDIUM 없음. LOW 1건 (vendors DTO 문서갭 · 런타임 영향 없음).
