# 데이터 정합성 검토 리포트 · 2026-09-01

**리뷰 범위:** 전체 페이지·DB 연동·API·UI 정합성 5축 검토  
**기준 커밋:** `006e6354` (이전 감사) → 현재 HEAD

---

## 요약

| 심각도 | 건수 | 상태 |
|--------|------|------|
| CRITICAL | 0 | — |
| HIGH | 1 | 수정 완료 |
| MEDIUM | 1 | 수정 완료 |
| LOW | 1 | 이전 감사에서 수정 완료 |

**최종 등급: A-** (TS 재실행 권장)

---

## 수정 완료 버그

### BUG #1 · HIGH · parseRouter.ts GeminiResult 타입 불일치
**위치:** `server/routes/ocr/parseRouter.ts` lines 117-119  
**원인:** `callGeminiTextParse`가 반환하는 `GeminiResult` 성공 브랜치는 `{ ok: true; text: string }` 구조인데, 코드가 `result.headers`·`result.rows`·`result.meta`에 직접 접근 → TS2339 × 4 + TS2307 × 1  
**수정:**
- `result.ok` 가드 추가
- `JSON.parse(result.text)` 후 `parsed.headers`·`parsed.rows`·`parsed.meta` 접근
- `!result.ok` 분기에서 `result.error`·`result.quota` 로 키 로테이션 처리

### BUG #2 · MEDIUM · pending-counts · 발주요청 카운트 과다
**위치:** `server/routes/display/requests.ts` line 36  
**원인:** `order_requests` 카운트에 status 필터 없음 → 이미 발주완료된(`status='ordered'`) 행까지 포함  
**DB 상태값:** `requested`(대기) · `ordered`(발주완료) · `cancelled`  
**수정:** `.eq("status", "requested")` 추가  
**영향:** 랜딩 페이지 "발주 요청" 배지 숫자가 실제 대기 건수로 정정됨

---

## 정합성 축별 결과

### 축 1 · 페이지 데이터 ↔ DB 정확성
| 도메인 | 판정 |
|--------|------|
| products (real_map·location·sale_status) | PASS |
| employees (resident_number·break_time 등 6필드) | PASS |
| vendors (note·order_method·region 등 7필드) | PASS (LOW fix 적용) |
| order_requests 상태 흐름 | PASS (MEDIUM fix 적용) |
| inventory_checks (warehouse1_stock) | PASS |
| zone_defs (DB 마이그레이션 완료) | PASS |

### 축 2 · DB·API·UI 3중 필드 매핑
| 레이어 | 결과 |
|--------|------|
| Zod 스키마 → DB 컬럼 | real_map ✓ · warehouse1_stock ✓ · sale_status ✓ |
| API 응답 → 클라이언트 DTO | Vendor 7필드 ✓ · Employee 필드 ✓ |
| GeminiResult 타입 → parseRouter | HIGH 수정으로 해소 |

### 축 3 · 캐시·스탤 리스크
| 캐시 | 무효화 경로 | 판정 |
|------|-------------|------|
| server productCache (TTL 30s) | products.ts 5곳 + settings.ts 1곳 resetProductCache() | PASS |
| client productsCache (TTL 60s) | product-mutated 이벤트 | PASS |
| pending-counts (무캐시) | 매 요청마다 실시간 쿼리 | PASS |

### 축 4 · 페르소나별 페이지 접근
| 엔드포인트 | 권한 | 판정 |
|------------|------|------|
| GET /api/borrowings | authorize(1) | PASS |
| POST /api/borrowings | authorize(5) | PASS |
| POST /api/ocr/parse-gemini | authorize(5) | PASS |
| /products.json | 공개 (requireAuth 이전 마운트) | PASS (의도적) |

### 축 5 · 시나리오 정합성
| 시나리오 | 결과 |
|----------|------|
| 발주요청 생성 → 배지 증가 | status='requested' (DB default) → 카운트 반영 ✓ |
| 발주완료(bulk-send) → 배지 감소 | status='ordered' → .eq("requested") 필터 제외 ✓ |
| Gemini 파싱 성공 → 표 표시 | JSON.parse(result.text) → headers/rows/meta ✓ |
| Gemini quota 초과 → 키 로테이션 | result.quota===true → continue 다음 키 ✓ |

---

## 미수정 항목 (사용자 확인 필요)

1. **GET /api/order-requests status 필터 없음** (LOW)  
   전체 이력 조회용으로 의도적일 수 있음. 발주완료 row 재요청 시 status가 'requested'로 재설정되지 않음. 재발주 UI 흐름 확인 필요.

---

## 후속 권장 사항

- `npx tsc --noEmit` 재실행으로 HIGH 수정 후 TS 에러 0 확인
- `npx vitest run` 으로 3391 테스트 유지 확인
- 로컬 커밋: 두 수정 파일 (`requests.ts` + `parseRouter.ts`)
