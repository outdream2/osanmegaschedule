# 전체 프로젝트 종합 리뷰 · 2026-09-01

> 범위: 785 TS/TSX 파일 · 41 서버 라우트 파일 · 3391 테스트 · docs/ 70+ 문서
> 방법: 정적 분석 · 기존 감사 문서 교차검증 · 실제 코드 grep 확인
> 코드 수정 없음 (리뷰 전용)

---

## A. 데이터 정합성

### 현황
- products 3-way 필드 (location / display_location / real_map): 충돌 0건 확인 · 값 있을 때 100% 일치
- zone_defs 54행: location 100% · assignee 31% (17건 이관 완료)
- vendors 156행: 접두어 정규화 미완료 45건 (28.8%)

### 보완점 TOP 3
1. **real_map 47파일 · #13 미완료** (P1): location으로의 전환이 110곳에서 진행 중단 상태. 3-way fallback 로직이 14+ 서버 파일에 산재. 충돌 0 확인됐으므로 안전하게 진행 가능하나 방치 시 향후 신규 데이터에서 불일치 발생 위험.
2. **purchase_details 12,933행 vs orders 정합성 미검증** (P1): 매입-발주 3-way 일치 검증이 #10 태스크 중 유일하게 남은 조사 항목.
3. **employees."retireDate" snake_case 혼재** (P2): `server/routes/schedule/schedules.ts:186`에서 `retire_date`(snake) 직접 참조. 실제 컬럼명은 `"retireDate"`(quoted camelCase). 런타임 "column does not exist" 가능성. `resignations.ts`는 이미 올바른 `"retireDate"`로 UPDATE 중.

### 우선순위
- P0: (없음 · 기존 P0 이슈 대부분 해결)
- P1: purchase_details 정합성 검증 (#10) · real_map → location 완전 이관 (#13)
- P2: schedules.ts retire_date 오타 수정 (1줄 · 즉시 가능)

---

## B. 프레임워크 준수

### 현황
- 프론트 audit-framework: 755파일 중 1건 위반 (99.9% 준수) — BarcodeScanner.tsx L422 alert (iOS 보호 대상 · 별도 판단)
- 서버 audit-server: 246라우트 중 115 위반 (53% 준수) — high 20건 · medium 95건
- 인라인 Loader2/animate-spin: 4곳 잔존 (CategoryTab · OrderRequestTab · ZoneCategoryContent · LossHistoryTab)
- GradientAccent 미확산: 프리미티브 신설됐으나 36건 인라인 잔존
- ActionBar 미채택: 67건 sticky-bottom 인라인 잔존

### 보완점 TOP 3
1. **서버 no-validate-body 89건** (P1): requests.ts 9건·ocr.ts 13건·settings.ts 8건 등 주요 write endpoint에 Zod 스키마 없음. 잘못된 body가 DB까지 도달 가능.
2. **stockManage.ts 2332라인 · ocr.ts 1767라인** (P1): 서버 최대 파일. 두 파일 합산 4099라인. 도메인 책임 분리 미완료로 수정 시 사이드이펙트 위험.
3. **타입 안전성: as any 150파일 343건 (프론트) · 64파일 174건 (서버)** (P2): 특히 `server/routes/display/requests.ts` 31건으로 최다. Supabase 응답 타입 미명시.

### 우선순위
- P1: 서버 validateBody 확산 (requests.ts 우선) · stockManage/ocr.ts 도메인 분리
- P2: Loader2 인라인 4곳 → Spinner 교체 · GradientAccent/ActionBar 확산

---

## C. API 구조

### 현황
- 프론트 raw fetch: 실질 0건 (인프라 예외 8건은 정당)
- HttpError 통일: 이번 세션 37건 추가 완료 (`throw new Error` → 0)
- authorize 추가: 이번 세션 15건 추가 (OCR 13 · settings 2)
- 보안 S1~S4 High 4건: 이번 세션 모두 패치 완료 (auth.ts IDOR · vendors.ts · hrForms.ts · schedules.ts)

### 보완점 TOP 3
1. **display/requests.ts 단일 파일 과부하** (P1): 서버 기준 as any 31건 최다 · no-validate-body 9건 최다 · resignations 테이블 오타도 이 파일. 복잡도 집중으로 버그 발생 고위험.
2. **SSO 토큰 일회성 소비 미구현 (S5)** (P2): 5분 내 동일 SSO 토큰 재사용 시 복수 세션 발급 가능. SECURITY_AUDIT S5 항목. 인메모리 Set + jti 검증으로 해결 가능.
3. **Helmet 비활성화 (S11)** (P2): iOS Safari 이슈로 주석 처리 중. X-Frame-Options·X-Content-Type-Options 없음. CSP 없이 XSS 헤더 방어 부재. 서버.ts에 3줄로 부분 적용 가능.

### 우선순위
- P1: requests.ts 정리 (오타 수정 + validateBody + as any 감소)
- P2: SSO jti 재사용 방지 · Helmet 부분 적용

---

## D. UI·UX

### 현황
- 프리미티브 채택률: Card(137파일) · Spinner(133파일) · SearchBar(14+파일) · SplitListPanel(5파일)
- 목업 파일: 14개 UI 목업 HTML · 폰트 +2 완료 (커밋 55127cdb)
- 사이드 메뉴 선택 강화: Linear/Vercel/Attio 톤 완료 (커밋 2e29db26)

### 보완점 TOP 3
1. **DisplayPage C1 · 매장구역도 셀 라벨 오표시** (P0): 2026-08-30 zone_defs 스키마 변경 후 셀 라벨이 "진열대 1A" 대신 "중앙상비약존"으로 표시. `DisplayStoreMap.tsx:207-208`에서 `rawB?.zone`(대분류) 대신 `rawB?.location` 사용 필요. 모든 사용자에게 즉시 영향.
2. **SchedulePage W1 · PharmacistPage W2 · 구역 정의 구버전 사용** (P1): 두 페이지가 DB zone_defs 훅 대신 정적 ZONE_DEFS 상수 import. 사용자가 구역도 편집해도 이 두 페이지에 반영 안 됨.
3. **#46/#48 · 직원 상세정보·각종양식 목업 미적용** (P1): StaffDetailPanel(560라인)과 HrFormsPage(779라인)에 목업 디자인 헤더만 적용, 내부 레이아웃 미완료. 별도 세션 8-16h 필요.

### 우선순위
- P0: DisplayStoreMap.tsx 셀 라벨 1줄 수정 (즉시 · 회귀 위험)
- P1: SchedulePage/PharmacistPage useZoneDefs 훅 교체 · #46/#48 목업 완전 적용

---

## E. 보안

### 현황
- RLS 전체 활성화 완료 (SQL 2026-08-30c)
- 프론트 Supabase 직접 접근: ImageUploadField Storage만 (DB 테이블 0건) · 안전
- authorize 커버리지: 36파일 중 35파일 · clientErrors.ts 1파일 의도적 미적용
- S1~S4 High 4건: 모두 패치 완료

### 보완점 TOP 3
1. **S5 SSO 토큰 one-time 미구현** (P1): 위 C 항목과 동일 · 실제 악용 시 세션 복제.
2. **S7 vendor 비밀번호 timing-safe 비교 미구현** (P2): `vendorPassword.ts:48` 문자열 직접 비교. `crypto.timingSafeEqual` 교체 필요. 구조상 위험도는 낮으나 보안 원칙 위반.
3. **S8 bcrypt rounds=10 (권고 12+)** (P2): `auth.ts:97,213`. 로그인/비밀번호 변경 빈도 낮아 성능 영향 미미. 상수 1건 변경으로 해결.

### 우선순위
- P1: SSO jti 재사용 방지
- P2: timingSafeEqual · bcrypt rounds 12 상향

---

## F. 성능

### 현황
- 대형 파일: stockManage.ts(2332L) · ocr.ts(1767L) · 프론트는 모두 800라인 미만으로 이전 세션 분리 완료
- 번들: Vite 빌드 정상 · `--max-old-space-size=400` Render 메모리 제한

### 보완점 TOP 3
1. **stockManage.ts 2332라인 단일 파일** (P1): 서버 최대 파일. stockReceiving / stockInventory / stockLoss 등으로 도메인 분리 필요. 현재 변경 시 사이드이펙트 위험 높음.
2. **productsCache.ts TTL 관리** (P2): 서버 메모리 캐시 사용. Render 인스턴스 재시작 시 캐시 소실. TTL 만료 + 재빌드 로직 검증 필요.
3. **N+1 위험 · display/requests.ts** (P2): 복잡한 pending count 집계 시 다수 개별 쿼리. Supabase RPC 또는 단일 집계 쿼리로 최적화 여지.

### 우선순위
- P1: stockManage.ts 도메인 분리 계획 수립 (#16)
- P2: productsCache TTL 검증 · requests.ts 집계 쿼리 최적화

---

## G. 사용자 경험

### 현황
- 테스트: 3390 통과 / 3391 (1건 실패)
- LoadingState · EmptyState · Spinner 프리미티브 확산 완료 (133+ 파일)
- SessionTimeoutWarning 프리미티브 · 401 즉시 이동 완료

### 보완점 TOP 3
1. **테스트 1건 실패 · stockPeriodUtils.test.ts:122** (P0): `fillPeriodsWithRows` 함수에서 현재 월 기간을 찾지 못하는 버그. `generatePeriods`가 로컬 시간 기반(`new Date()`)으로 `start`를 생성하는데, 테스트는 UTC 기반(`new Date().toISOString().slice(0,10)`)으로 `period_start_date`를 생성해 날짜 경계에서 불일치. 테스트 환경 UTC vs 로컬 시간 어긋남 문제.
2. **#30 · 판매 상품현황 데이터 미확인** (P1): 태스크 스펙 자체가 불명확. SalesTrendPage 내 어느 탭인지, 신규 탭 요구인지 사용자 확인 필요.
3. **반품 페이지 #37 · ReturnListPanel SplitListPanel 미완료** (P1): 넓이 통일만 완료. 700라인 SplitListPanel 완전 이관 미진행.

### 우선순위
- P0: stockPeriodUtils 테스트 실패 수정 (generatePeriods UTC 통일)
- P1: #30 스펙 확인 후 진행 · #37 SplitListPanel 이관

---

## H. 유지보수

### 현황
- docs/ 70+ 문서 · 세션 핸드오프·감사·태스크 이력 체계적 관리
- CODING_PRINCIPLES.md · FRAMEWORK.md · TASKS_HANDBOOK.md 원칙 문서 완비
- audit-framework.cjs · audit-server.cjs 자동 감사 도구 존재

### 보완점 TOP 3
1. **audit-server CI 미필수화** (P1): high 0건 달성 후에도 CI에 `npm run audit:server`가 없어 회귀 탐지 불가. GitHub Actions 또는 pre-push 훅 추가 필요.
2. **#19 · 상품 조회 endpoint 불일치 원인 미파악** (P1): `docs/PRODUCT_ENDPOINT_COMPARISON.md` 작성 계획만 있고 실제 조사 미완료. #28 상품입고/실재고 endpoint 통합(#28)이 이 조사에 의존.
3. **대형 pending 태스크 누적** (P2): #9(차용재설계 8-24h) · #13(real_map 6-10h) · #16(API재구성 12-20h) · #28(스캔통합 8-12h) 총 34-66h 규모 태스크가 미시작. 우선순위 재정렬 필요.

### 우선순위
- P1: audit-server CI 필수화 · #19 endpoint 불일치 조사
- P2: 대형 태스크 분기별 스프린트 계획

---

## 종합 우선순위 요약

| 우선순위 | 항목 | 소요 | 영역 |
|:-:|---|---|---|
| **P0** | DisplayStoreMap 셀 라벨 회귀 수정 | 30분 | D |
| **P0** | stockPeriodUtils 테스트 실패 · UTC 통일 | 30분 | G |
| **P1** | schedules.ts retire_date 오타 수정 | 5분 | A |
| **P1** | requests.ts 오타·validateBody·as any 정리 | 3-4h | C |
| **P1** | SchedulePage/PharmacistPage useZoneDefs 교체 | 2h | D |
| **P1** | SSO jti 재사용 방지 (S5) | 2h | E |
| **P1** | purchase_details 정합성 검증 (#10) | 4h | A |
| **P1** | audit-server CI 필수화 | 1h | H |
| **P2** | real_map → location 이관 (#13 · 47파일) | 6-10h | A |
| **P2** | stockManage.ts 도메인 분리 (#16) | 별도 세션 | F |
| **P2** | bcrypt rounds 12 · timingSafeEqual | 30분 | E |
| **P2** | GradientAccent/ActionBar 확산 · Loader2 4곳 | 3h | B |

## 즉시 fix vs 사용자 결정 분류

**즉시 수정 가능 (코드 1-5줄)**
- DisplayStoreMap.tsx:207-208 · zone 라벨 → location 사용
- schedules.ts:186 · retire_date → "retireDate"
- stockPeriodUtils.tsx · generatePeriods UTC 통일

**사용자 결정 필요**
- #9 차용등록 Phase A · SQL 실행 승인 필요
- #30 판매 상품현황 · 스펙 재확인
- stockManage.ts 분리 · 별도 세션 승인

**장기 개선**
- API 프레임워크 재구성 (#16)
- real_map → location 전면 이관 (#13)
- 대형 UI 목업 적용 (#46 직원 상세 · #48 각종양식)

---

**작성**: 2026-09-01 · 전체 프로젝트 종합 리뷰 (정적 분석 · 코드 수정 없음)
**참고**: PROJECT_HEALTH_AUDIT_2026-08-30 · SECURITY_AUDIT_2026-08-29 · FRAMEWORK_COMPLIANCE_AUDIT_2026-08-30 · DATA_INTEGRITY_CHECK_2026-08-31
