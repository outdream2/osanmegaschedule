# AUDIT_2026-08-29_SESSION_END

> 감사 일시: 2026-08-29  
> 대상: 51+ 커밋 (신규 프리미티브 4개 · 상품 검색 통일 14 페이지 · 계약 만료 배지 · SSO · SectionCard 확산)  
> 결과: **빌드 정상 · TS 에러 0 (수정 후)** · 배포 가능

---

## 요약 (300자)

이번 세션은 대규모 UI 프리미티브 도입(SectionCard·GradientAccent·ActionBar·ProductDetailHero·SignaturePad)과 `matchesProductQuery` 14페이지 통일, SSO 신설, #182 계약 만료 배지 등 광범위한 변경을 포함합니다. 감사 결과 **P0 1건**(SplitRightHeader GradientAccent import 누락 · 런타임 크래시), **P1 1건**(wage_pay_day 타입 불일치 · 저장 시 데이터 손실), **P2 2건**, **P3 2건**이 발견되었으며 P0·P1은 즉시 수정 완료하였습니다. SSO 5분 만료·URL 정리 로직은 정상이나 토큰 재사용 방지(nonce/blacklist) 메커니즘이 없어 P2로 기록합니다. 전체 회귀 없음 확인.

---

## 버그 상세 표

| # | 심각도 | 상태 | 파일 · 라인 | 설명 | 재현 | 수정 |
|---|--------|------|------------|------|------|------|
| 1 | **P0** | ✅ 수정완료 | `src/components/common/SplitRightHeader.tsx:64` | `GradientAccent` import 없이 JSX 에서 직접 참조 → TS 에러·런타임 크래시 | SplitRightHeader 포함 페이지 열기 | `import { GradientAccent } from "./GradientAccent"` 추가 |
| 2 | **P1** | ✅ 수정완료 | `server/controllers/scheduleController.ts:245` `server/services/scheduleService.ts:273` | `wage_pay_day`("매월 10일" 등 text) 를 `normalizeNum()`으로 파싱 → NaN → null 저장 · DB는 text 컬럼 | 지급일 입력 후 저장 | controller: `normalizeStr(wage_pay_day)` · service 타입: `string \| null` |
| 3 | **P2** | 미수정(설계) | `server/routes/auth/auth.ts:128` | SSO 토큰 재사용 방지 없음 · 5분 내 동일 토큰으로 여러 번 `/api/auth/sso-consume` 성공 가능 | 같은 URL을 두 브라우저에 붙여넣기 | nonce(jti) + in-memory Set or Redis 블랙리스트로 one-time 보장 필요 · 현재 5분 만료 + URL 정리로 실질 위험 낮음 |
| 4 | **P2** | 미수정(설계) | `src/components/OrderManagePage/VendorDetailTabs.tsx:359,370` | `matchesProductQuery(s as any, ...)` · `ProductStatRow` / raw row 타입이 `ProductMatchable` 미충족 · `as any` 우회 → 타입 안전 미보장 | 공급사 탭 상품 검색 | `ProductStatRow` 에 `ProductMatchable` 호환 필드 명시 or 리터럴 객체로 전달 |
| 5 | **P3** | 미수정(설계) | `src/components/common/ActionBar.tsx` `src/components/common/ProductDetailHero.tsx` | 두 프리미티브가 테스트 파일에서만 사용 · 실제 페이지 사용처 0 · 빌드 포함되나 tree-shaking 가능 | - | 실제 페이지 확산 시까지 보류 · 추후 사용처 연결 필요 |
| 6 | **P3** | 미수정(설계) | `server/routes/auth/auth.ts:128` | `/api/auth/sso-consume` · `validateBody` 없음 · `req.body.token` 직접 접근 · 빈 body 전달 시 빈 문자열 처리됨 (badRequest 로 안전 처리) · 엄밀한 프레임워크 준수는 미흡 | curl -X POST /api/auth/sso-consume (no body) | `validateBody(z.object({ token: z.string().min(1) }))` 추가 |

---

## 영역별 검증 결과

### 1. matchesProductQuery 통일 (14페이지)
- 모든 14개 파일에서 `import { matchesProductQuery } from "../../lib/productMatch"` 정상 확인
- `productMatch.ts`: query 빈 문자열 → true(전체 통과) · OR 조건 · 초성+부분일치 · 정확
- `VendorStockModal`: `name→product_name, code→product_code` 인라인 매핑으로 올바르게 전달
- `OrderHistoryTab`: `items` 배열 순회 후 `.some(it => matchesProductQuery(it, ...))` 정상
- `ReturnListPanel`: `as any` 캐스팅이지만 `product_name·product_code·supplier` 실제로 존재 · 동작 정상
- `StockReconciliationTab`: 자체 `matchesProductQuery` 사용 · import 확인됨

### 2. 신규 프리미티브 무결성
- `SectionCard`: 단독 정상 · StaffManagePage 내부 동명 컴포넌트와 충돌 없음 (import 경로 분리)
- `GradientAccent`: ProductDetailHero · SplitRightHeader(수정 후) 모두 정상 import
- `ActionBar`: 테스트만 · 실제 사용처 없음(P3)
- `ProductDetailHero`: 테스트만 · 실제 사용처 없음(P3) · `saleStatusTone` 함수 정확
- `SignaturePad`: BorrowingPage 에서 정상 import · canvas touch/mouse 이벤트 정상

### 3. SignaturePad 이관 회귀
- BorrowingPage 인라인 → `common/SignaturePad` 이관 완료
- 인터페이스: `value: string, onChange: (dataUrl: string) => void` · 기존 호출부 호환
- `useEffect([value])`: value 변경 시 캔버스 재렌더 · 외부 초기화(서버 데이터 복원) 지원
- ContractWriterPage/ResignationWriterPage의 `react-signature-canvas` 미영향(별도 import)

### 4. #182 계약 만료 배지 날짜 계산
- `StaffListRow`: `new Date(emp.contract_end.slice(0,10) + "T00:00:00")` · 로컬 자정 기준
- `StaffConditionsSection`: `new Date(end + "T00:00:00")` · 동일 패턴
- `Math.round(diff / 86400_000)` · days < 0 = 경과, days = 0 = 오늘, days ≤ 30 = D-N · 정확
- **데이터 공급**: `StaffManagePage`가 `/api/schedules?year=&month=` → `scheduleService.getMonthlySchedule()` → `select("*")` → `contract_end` 포함됨 · 정상

### 5. JWT SSO (#174)
- `sso-token`: `authorize(1)` · 로그인 필수 · 5분 만료 (`expiresIn: "5m"`) · `typ: "sso"` 구분 · 정상
- `sso-consume`: typ 검증 (`decoded.typ !== "sso"` 거부) · URL 쿼리 즉시 삭제 · 정상
- App.tsx: `useEffect([], [])` 마운트 1회만 · `window.history.replaceState` URL 정리 · 정상
- **미흡**: 토큰 재사용 방지 없음(P2 · 실질 위험: 5분 + 수동 URL 전달 필요 → 낮음)

### 6. DTO 이중 정의 필드 손실 위험
- `shared/dtos/employees.ts` ↔ `src/types.ts` ↔ `StaffManagePage/types.ts` 3종 비교
- **shared/dtos**: `rank, primary_focus, primary_focus_percent` 있음 · contract_end 없음(계약서 테이블 분리)
- **types.ts**: `rank(optional), contract_end 없음(계약서 테이블)` · primary_focus 있음
- **StaffManagePage/types.ts**: 가장 확장된 버전 · `contract_end·contract_type` 있음
- `updateEmployee` controller: `wage_pay_day: normalizeNum` → `normalizeStr` 수정 완료
- `primary_focus`/`primary_focus_percent`: controller에 미포함 → 저장 불가 (별도 태스크로 추적 필요, P2)

### 7. SettingsModal 루프 위험
- `useEffect` 2개: (1) click-outside · `[open]` 의존 · 정상 (2) Escape 키 · `[onClose]` 의존
- `setPositions` 등 상태 초기화: `useState(() => [...settings.positions])` 패턴 아닌 직접 spread
- `settings` 변경 시 useState는 re-init 안 됨 (의도적 draft 패턴) · 루프 없음

---

## 빌드 검증

| 검증 | 결과 |
|------|------|
| `npx tsc --noEmit` (수정 전) | ❌ SplitRightHeader GradientAccent 1건 |
| `npx tsc --noEmit` (수정 후) | ✅ 에러 0 |
| `npx vite build --mode production` | ✅ 성공 · Brotli 압축 완료 |

---

## 수정 완료 목록

1. **P0** `SplitRightHeader.tsx:17` — `import { GradientAccent } from "./GradientAccent"` 추가
2. **P1** `scheduleController.ts:245` — `normalizeNum(wage_pay_day)` → `normalizeStr(wage_pay_day)`
3. **P1** `scheduleService.ts:273` — `wage_pay_day?: number | null` → `wage_pay_day?: string | null`

---

## 미수정 · 사용자 확인 필요

| 항목 | 우선순위 | 권고 |
|------|----------|------|
| SSO 토큰 재사용 방지 | P2 | in-memory Set 블랙리스트 (서버 재시작 초기화 · 5분 TTL) 또는 Redis nonce |
| `primary_focus/percent` 저장 누락 | P2 | `updateEmployee` controller에 두 필드 추가 필요 |
| `sso-consume` validateBody 누락 | P3 | Zod 스키마 추가 · 프레임워크 준수 |
| ActionBar · ProductDetailHero 미사용 | P3 | 실제 페이지 확산 후 자동 해결 |
