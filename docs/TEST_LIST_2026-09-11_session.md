# 테스트 리스트 · 2026-09-11 자율 세션

사용자 자리 비운 3-4시간 자율 작업 · 매 태스크 · 테스트 방법 안내.

> **필수 · 시작 전** · 서버 재시작 (Ctrl+C · npm run dev) · 백엔드 fix 배포

## 🎯 핵심 · 우선 테스트

이 세션 · **가장 중요한 회귀 위험:**

1. **#127 · 결제입력 · supplier-ledger 통합** · 5→3 endpoint · 광범위 영향
   - 결제입력 페이지 · 광동제약·테스트 공급사 · 매입/결제/잔고 · 정확한지
   - 우측 매입내역·결제내역 탭 · 데이터 표시
   
2. **#116 · KST off-by-one + 스케쥴 반영** · 연차 처리 전체
   - 연차 승인 · 스케쥴표 · 즉시 반영 · 정확한 날짜
   - 승인/반려/삭제 · 모든 flow

3. **#131 · 연차승인 UI** · 완전 UI 재작성
   - 기존 승인/반려/취소 flow · 정상 동작
   - 새 디자인 · 문제 없이 표시

**나머지 · #75·#94·#100·#109·#78·#126·#130** · 격리 · 회귀 위험 낮음


---

# 🆕 2026-09-14 (자율 세션) · 잔여 정리 + 캐시 대청소 + 보안 fix + 테스트 정리

**세션 요약 (아래 항목 · 순서대로 배치 테스트 권장)**

| # | 카테고리 | 커밋 |
|---|---|---|
| 1 | 🛡️ **보안 · /uploads auth + ErrorBoundary NODE_ENV** | `953218e2` |
| 2 | 🗄️ **캐시 제거 · 10개** (실시간 정확성) | `616ae50b` · `e66e9e96` · `595dab85` · `5591db51` · `747088f7` |
| 3 | 🔗 **#63 공급사 무결성** · 결제·상품입고 validation | `62e3830e` |
| 4 | 🔄 **#61 상품 등록·수정** · 실재고 자동 동기 | `1889b95d` |
| 5 | 🎯 **프레임워크** · InventoryEditPanel · alert→useToast | `c8614c26` |
| 5-1 | 🎯 **프레임워크** · OrderSettingsPage + StoreZoneMap · Card 프리미티브 | `083dd828` |
| 6 | 🧪 **테스트 19개 정리** · CI 클린 (3355/3355) | `c190ad86` |
| 7 | 📄 **TASKS.md v5 재확인** · 12건 완료 마킹 | `a96c3051` |
| 8 | 📄 **메타·문서** · package.json + README + Migrations README | `990acf9f` · `1c9a2050` |
| 9 | 🎯 **프레임워크** · inventoryChecksApi 프리미티브 · 11 파일 통합 | `af71c14a` |
| 10 | 🎯 **프레임워크** · orderRequestsApi 프리미티브 · 7 곳 통합 | `23ddc1dc` |
| 11 | 🎯 **프레임워크** · stockArrivalsApi 프리미티브 · 5 곳 + 타입 통합 | `72ae0f3a` |
| — | 🎯 **프레임워크** · permissionsApi 프리미티브 · 6 곳 통합 | `4684d4f0` |
| 12 | 🐛 **버그 fix** · 세션 알림 UI + optimal_stock 컬럼 + 30일 하드코딩 | `f0b2ec59` · `cf9ec40a` · `ffd4d157` |
| 13 | 🐛 **재리포트 fix** · optimal_stock 잔재 + ProductInfoPage 우측 패널 리디자인 | `e3e78622` |
| 14 | 🎨 **UI 폴리시** · ProductInfoPage 나머지 3 섹션 (기본·상세·기타) | `edc1a603` |
| 15 | 🎯 **프레임워크** · settingsApi 프리미티브 · 6 곳 (KV settings) | `93497b21` |
| 16 | 🎨 **UI 폴리시** · ProductInfoPage 좌측 리스트 · 우측 통일 | `350f66ab` |
| 17 | 🐛 **라벨 정정** · 상품입고 개 단위 + 실재고확인 구역/ERP → 규격/현재고 | `72286c28` · `5dfdf6f0` |
| 18 | 🎨 **ProductInfoPage 상세 재구성** · Hero + 3 섹션 · 반응형 · 컬러 tint pill · 반복 iteration | `5e3994d4` · `02d63bdf` |
| 19 | 🎯 **프레임워크** · employeeApi.listEmployees + creditCardsApi (6 곳) | `af092502` · `49ee512d` |
| 20 | 🧪 **API 테스트** · 6 신규 프리미티브 · 38 tests (3355→3393) | `cedcabea` |
| 21 | 🎯 **프레임워크** · leaveApi 프리미티브 · 4 파일 8 곳 통합 + 8 tests | `52ddf180` |
| 22 | 🎯 **프레임워크** · resignationsApi 프리미티브 · 4 파일 6 곳 통합 + 7 tests | `6d4732ed` |
| 23 | 🎯 **프레임워크** · productsApi 신규 (10 함수) + 4 파일 부분 마이그레이션 + 16 tests | `ca5ef818` · `1de0f4a9` · `55b80433` |

**필수 · 서버 재시작** (Ctrl+C · npm run dev) · 백엔드 fix 반영

---

## 🛡️ [1] 보안 · /uploads auth 강화 + ErrorBoundary NODE_ENV ✅
**커밋** · `953218e2`

### 배경
- **/uploads 정적 파일** · requireAuth 이전 마운트 · URL만 알면 인증 없이 다운로드 가능
- 계약서·사직서·HR 자료 · **개인정보** · 유출 위험 (개인정보보호법 대상)
- ErrorBoundary · 프로덕션에서도 stack trace 상시 노출 · 내부 경로·라이브러리 힌트 유출

### 해결
- `/uploads/*` · requireAuth 아래로 이동 · 로그인 필수
- `/uploads/contracts/*` · `/uploads/resignations/*` · `/uploads/hr-forms/*` · admin (level>=8) 만
- ErrorBoundary · `import.meta.env.DEV` 조건 · DEV 에서만 stack · 프로덕션 · "발생 시각"만

### 테스트 절차
1. **로그아웃 상태** · 브라우저 · `http://localhost:XXXX/uploads/contracts/test.pdf` 직접 접근
2. **기대값** · 로그인 페이지 리다이렉트 or 401 응답 (이전 · 파일 다운로드 됨)
3. **일반 직원 로그인** (level < 8) · 같은 URL 접근 · 403 응답
4. **관리자 로그인** (level >= 8) · 같은 URL 접근 · 정상 다운로드
5. **일반 사용자** · 게시판 첨부 (/uploads/board/*) · 정상 접근 가능

### ErrorBoundary 테스트
1. **개발 서버** (npm run dev) · 강제 에러 발생 · stack trace + componentStack 표시 (기존 유지)
2. **프로덕션 빌드** (npm run build && preview) · 강제 에러 · **발생 시각만** 표시 · stack 없음
3. 홈으로 · 새로고침 · 다시 시도 버튼 · 정상 동작

### 회귀 확인
- StaffContractSection · 관리자 계약서 조회 · 정상 동작
- BoardPage · 첨부 다운로드 · 정상 동작

---

## 🗄️ [2] 캐시 제거 · 10개 · 실시간 정확성 ✅
**커밋** · `616ae50b` · `e66e9e96` · `595dab85` · `5591db51` · `747088f7`

### 배경
- 사용자 대원칙 · "캐시 절대 X · 실시간 정확성 우선"
- 이전 · 발주·매출·잔고·매입·판매 · 5-10min TTL · 매입/결제 후 stale · 오판 유발
- 정적 마스터도 편집 후 5min stale · UX 저해

### 제거 캐시 (10)
| 캐시 | 이전 TTL | 영향 |
|---|:---:|---|
| saleActiveOnlyCache | 5s | 무의미 · 실시간 KV 조회 |
| lowStockCache | 2min | 발주필요 리스트 · 매입 후 즉시 반영 |
| ocrAggCache | 5min | 매입 집계 · 발주 판단 근거 |
| salesTrendCache | 5min | 판매 트렌드 차트 |
| topSalesCache | 10min | Top 판매 대시보드 |
| vendorCache (잔고맵) | 5min | 잔고 · 매입/결제 후 즉시 |
| vendorValidation | 60s | vendor 등록 즉시 · SUPPLIER_NOT_FOUND false-positive 해소 |
| seasonCache | 5min | 계절 편집 · 즉시 반영 |
| storageLocationsCache | 5min | 매장·창고 마스터 편집 즉시 |
| referenceValues cache | 5min | 직급·부서 등 편집 즉시 |

### 테스트 절차
**A. 발주필요 실시간** (lowStockCache 제거)
1. **매장 > 발주 > 발주필요** 진입 · 부족 상품 확인
2. **매장 > 상품입고** · 부족 상품 · 매입 검수 완료
3. **매장 > 발주 > 발주필요** 새로 진입 · **즉시** 부족량 반영 확인 (이전 · 2min stale)

**B. 잔고맵 실시간** (vendorCache 제거)
1. **매입 > 공급사관리** · 공급사 잔고 확인
2. **매입 > 결제 > 결제입력** · 결제 등록
3. **매입 > 공급사관리** 새로 진입 · **즉시** 잔고 반영 확인 (이전 · 5min stale)

**C. vendor 등록 즉시 사용** (vendorValidation 제거)
1. **매입 > 공급사관리** · 신규 공급사 등록 (예: "테스트공급사X")
2. **즉시** · **매입 > 결제 > 결제입력** · supplier_name="테스트공급사X" 로 결제 시도
3. 정상 저장 확인 (이전 · 60s 대기 or SUPPLIER_NOT_FOUND false-positive)

**D. 시스템설정 마스터 즉시 반영**
- 계절 편집 · 발주필요 판매추천 배너 즉시 반영
- 매장·창고 편집 · 진열위치 표시 즉시 반영
- 직급·부서 편집 · 드롭다운 즉시 반영

**E. 서버 콘솔** · "[SETUP REQUIRED] real_map" 경고 사라짐 확인

### 유지된 캐시 (11)
- 보안: `_consumedSsoJtis` (JWT 재사용 방지)
- 성능: `productMapCache` (30s · 6000+ 상품)
- OCR: 5개 (synonymMap·supplierAlias·vendorNames·vendorBizNumMap·productToSuppliers)
- 기타: `_recentRawTextCache` (OCR working buffer)

---

## 🔗 [3] #63 · 공급사 무결성 · 결제·상품입고 · vendors 유효성 검증 ✅
**커밋** · `62e3830e`

### 배경
- 기존: POST/PATCH `/api/products` · 진열요청 · 공급사 유효성 검증 완료
- 잔여: `/api/supplier-payments` (결제) · `/api/product-arrivals` (상품입고) · validation 없음
- 위험: vendors 마스터에 없는 공급사명 · 저장 통과 · 잔고·매입·결제 KPI 오염

### 해결
- **`server/routes/purchase/supplierPayments/payments.ts`** POST · supplier_name · vendors 존재 검증 · 미등록 시 400 SUPPLIER_NOT_FOUND
- **`server/routes/stock/productArrivals.ts`** POST · items 배열 supplier 전체 · IN 조회로 일괄 검증 · 하나라도 미등록 시 400 (부분 저장 방지)
- 빈 값 (null/공백) · 허용 · 매장 자체 검수 flow 지원

### 테스트 절차
1. **매입 > 결제 > 결제입력** 진입
2. 결제 등록 · 공급사 이름 · vendors 미등록 값 (예: "테스트없음") · 저장 시도
3. 400 응답 · "공급사 미등록 · 공급사 관리에서 먼저 등록해주세요" toast 확인
4. **상품입고** 페이지 · 상품 스캔 · 검수 완료 시
5. 공급사 · vendors 미등록 이름으로 시도 · 400 응답 확인
6. 등록된 공급사 (예: 광동제약) 로 저장 · 정상 작동 확인

### 예상 결과
- 무결성 · vendors 마스터에 없는 공급사 · 저장 차단
- 기존 저장 flow (등록된 공급사) · 완전 무영향

---

## 🔄 [4] #61 · 상품 등록·수정 후 · 실재고 테이블 자동 동기 ✅
**커밋** · `1889b95d`

### 배경
- `ProductCreateModal` · 상품 등록/수정 후 · `saveShelfPositions()` (PATCH `/api/products/:code/shelf-positions`) 호출
- 성공 후 · `products-map-updated` 이벤트만 dispatch · `inventory-checks-updated` 미발행
- 결과 · **실재고 테이블** (RealStockTablePage · L202 리스너) · 자동 갱신 X · 새로고침 필요

### 해결
- `saveShelfPositions()` PATCH 성공 시 · `inventory-checks-updated` CustomEvent dispatch
- 기존 `products-map-updated` 와 병행 · 두 이벤트로 다른 컴포넌트도 커버

### 테스트 절차
1. **매장진열 > 실재고테이블** 페이지 진입 (열어둠)
2. 별도 탭 · **상품정보** 진입 · 임의 상품 · [수정] 클릭
3. 상세구역 (3자리) 값 변경 (예: "332" → "555") · 저장
4. **실재고테이블** 탭 · 새로고침 없이 · 자동 갱신되어 상세구역 새 값 반영 확인
5. 신규 상품 등록도 동일 · 매장1 default 로 자동 반영

### 예상 결과
- 상품 등록/수정 → 실재고 테이블 · 즉시 자동 갱신
- 사용자 새로고침 불필요

---

## 🎯 [19] 프레임워크 · employeeApi.listEmployees + creditCardsApi 프리미티브 ✅
**커밋** · `af092502` (employeeApi.listEmployees) · `49ee512d` (creditCardsApi)

### 배경
- employeeApi.ts 이미 존재 · listEmployees() 함수만 누락 (2 곳 직접 호출)
- creditCards · 6 곳 산발 · 프리미티브 없음
- 프레임워크 대원칙 · 3곳 이상 = 즉시 추출

### 해결

**employeeApi.listEmployees() 추가:**
- src/lib/employeeApi.ts · 신규 export
- Migrated 2 곳 (BoardPage @멘션 · AssigneeEditor 담당자 자동완성)

**creditCardsApi 신규:**
- src/lib/creditCardsApi.ts
- listCreditCards({ active? }) · listCreditCardSummary() · createCreditCard() · updateCreditCard() · deleteCreditCard()
- Migrated 3 파일 · 6 call sites (CardHistoryPage · CardRegisterPage · PaymentEntryForm)

### 테스트 절차
1. **경영 > 게시판** · @멘션 · 직원 목록 · 정상 표시
2. **매장진열 > 실재고 테이블 등** · 담당자 지정 · 자동완성 · 정상
3. **매입 > 결제 > 결제카드등록** · 리스트/등록/수정/삭제 · 정상
4. **매입 > 결제 > 카드별결제내역** · 카드별 요약 · 정상
5. **매입 > 결제 > 결제입력** · 카드 선택 · active 필터 정상

### 회귀 확인
- 이전과 동일 동작 · 프리미티브 wrap만 · 3355/3355 tests 통과

---

## 🎨 [18] ProductInfoPage 우측 상세정보 · 완전 재구성 (실시간 반복 피드백) ✅
**커밋** · `5e3994d4` · `02d63bdf` (+ 여러 iteration)

### 배경 (사용자 실시간 피드백 · 10+ 라운드)
- "내용도 분류도 별로인데 이쁘지도 않고"
- "상품정보 페이지니까 가격·공급사가 재고보다 먼저"
- "한눈에 들어오게 텍스트 형식으로"
- "판매가·현재고 hero 만 예쁘고 나머지 잘 안보임"
- "라벨과 데이터 컬러 엑센트로 구분"
- "라벨 크기 +2"
- "반응형 · 넓은 화면 2-3개 · 좁으면 1개"
- "진열위치 값 · 현재고 값처럼 크게"
- "판매중 옆 분류 제거"
- "말줄임표 금지"

### 해결 · 최종 구조

**Hero (Sticky):**
- 상품명 (24px extrabold) · 코드 (mono chip) · 판매중 pill

**Section 1 · 가격 정보 (brand-deep accent bar):**
- 판매가 [22px extrabold brand-deep] · 매입가 [20px amber] · 이익율 [20px semantic]
- 반응형 grid · 1/sm:2/lg:3 컬럼

**Section 2 · 공급사·기본 정보 (sky accent bar):**
- 공급사 [상세보기 chip] · 분류 · 규격 · 단위 · 브랜드 · 제조사 · 최근매입
- 모든 라벨 · sky tint pill · 15px bold

**Section 3 · 재고·진열위치 (emerald accent bar):**
- 현재고 [22px emerald + 부족/충분 배지] · 적정재고 [20px + N일 기준]
- 창고 [20px cyan + 창고1·2 breakdown] · 매장 [20px indigo]
- 진열위치 [20px extrabold rose + shelf badges]

### 디자인 원칙 · 최종
- Hero + 3 섹션 · accent bar (컬러 dot + border-b-2)
- 라벨: 컬러 tint pill (15px · rounded-md · px-2.5 py-1)
- 값: 대형 dark text (20-22px · tracking-tight · leading-none)
- 반응형: grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-3
- 편집 모드: EditField · input 자연스러운 통합

### 테스트 절차
1. **매장 > 상품 > 상품정보** · 상품 선택 · 우측 상세 확인
2. 3개 섹션 · 각 accent bar 컬러 · 시각 구분 명확
3. 라벨 컬러 pill · 값 큰 텍스트 · 헷갈림 없음
4. 반응형 · 화면 좁혀서 1-col → 넓혀서 3-col 확인
5. 편집 · 저장 · 취소 · 정상 동작

### 회귀 확인
- 편집·저장 · 이전과 동일
- vendor 모달 · 정상 open
- TS 통과

---

## 🐛 [17] 사용자 리포트 · 현재고 라벨링 통일 (상품입고·실재고확인) ✅
**커밋** · `72286c28` (상품입고 개 추가) · `5dfdf6f0` (실재고확인 라벨 정정)

### 배경 (사용자 실시간 리포트 · 원문)
- "상품입고와 실재고확인페이지에서 현재고 숫자옆에 현재고라고 표시할 것"
- "혀재고 *개로 표시"
- "10은 현재고 인데 왼쪽은 구역이라고 표시되는거 같고 오른쪽은 ERP라고만 써있어"
- "데이터 찾아보고 제대로 라벨링해"
- "이미있다면 겹치는 데이터가 있을꺼야 그건 삭제해 숫자만 표시되는 현재고는 제거해"

### 발견된 이슈 (3건)
1. **상품입고** · lastScannedProduct 카드 · `현재고 10` (개 없음)
2. **실재고확인 · 왼쪽 스캔 리스트** · `구역 10` (라벨 오류 · 실제 값은 spec = 규격)
3. **실재고확인 · 오른쪽 검수 카드** · `ERP 10` (혼란 라벨 · 실제 값은 current_stock)

### 해결

**A. ProductArrivalPage.tsx · lastScannedProduct 카드 (L688):**
```
Before: <span>현재고</span> <span>10</span>
After:  <span>현재고</span> <span>10</span> <span>개</span>
```

**B. ScanPage.panels.tsx · 왼쪽 스캔 리스트 (L146):**
- 이전 · "구역 10" 표시 (spec 값 · 라벨 오류)
- 신규 · "규격 10" (정확한 라벨)
- 추가 · "현재고 N개" 신규 표시 · amber tint · 실재고 입력 참고용

**C. StockRowCard.tsx · 오른쪽 검수 카드:**
- L360 · 대형 배지 · "ERP 10" → "현재고 10" · amber tint (기존 zinc 회색 → amber 강조)
- L119 · 헬퍼 텍스트 · "ERP {spec}" → "지정 {spec}" (위치 지정임을 명확화)

### 테스트 절차
1. **매장 > 상품입고** · 바코드 스캔
   - 우측 lastScannedProduct 카드 · **`현재고 10개`** 표시 (개 단위 있음)
2. **매장 > 실재고확인** · 바코드 스캔
   - 왼쪽 스캔 리스트 항목 · **`규격 {spec} · 현재고 N개 · 공급사 X`** 형식
   - "구역" 라벨 없음 (spec 값에 "구역" 라벨 오류 해소)
3. **오른쪽 검수 카드** · 3-way 비교 미니카드
   - **`현재고 10 vs 실재고 - · 임박`** (amber tint · ERP 라벨 없음)
   - 창고2·매장1 상세 · 위치 표시 · **`지정 XX`** (이전 "ERP XX")

### 회귀 확인
- 스캔·저장·이력 flow 정상
- 저장된 실재고 값 · 정상 표시 · 라벨만 변경
- 17/17 tests 통과 · TS 통과

---

## 🎨 [16] ProductInfoPage 좌측 리스트 행 · 우측과 톤 통일 ✅
**커밋** · `350f66ab`

### 배경
- [13]·[14] 에서 우측 패널 완전 폴리시 · 좌측 리스트만 남음 · 톤 불일치

### 해결
- 상품명 · text-[16px] → text-[15px] bold tracking-tight (우측 값 크기와 통일)
- 코드·공급사 · text-[17px] → text-[12px] (secondary · 라벨 통일)
- 코드 · font-mono tabular-nums (bar-code 스타일)
- 공급사 · font-medium · 구분자 · text-zinc-300 (노이즈 감소)

### 테스트 절차
1. **매장 > 상품 > 상품정보** · 좌측 리스트
2. 상품명 (bold · 15px) · 코드·공급사 (secondary · 12px)
3. 활성 행 · brand-tint 배경 · brand-deep 강조
4. 우측 패널 · 라벨·값 크기 · 좌측 리스트와 동일 톤

### 회귀 확인
- 선택·검색·삭제·페이지 전환 · 정상
- 21/21 tests 통과

---

## 🎯 [15] 프레임워크 · settingsApi 프리미티브 · 6 call sites (KV settings) ✅
**커밋** · `93497b21`

### 배경
- `/api/settings` · 6 곳 (POST 4 · GET 2) · 매우 단순 · { key, value } 패턴
- 프레임워크 대원칙 · 3곳 이상 = 즉시 추출

### 해결
- **신규:** `src/lib/settingsApi.ts`
  - `getSetting<T>(key)` · GET · KV 값 조회 (encodeURIComponent 자동)
  - `saveSetting<T>(key, value)` · POST · KV 값 저장
- **6 파일 마이그레이션** · KV wrap 통합

### 테스트 절차
1. **시스템설정 > 통계설정** · 계절 편집 · 저장 (useSettings)
2. **경영관리 > 권한** · 사이드바 활성/비활성 토글 (PermissionsPage)
3. **경영관리 > 스케줄** · 월 확정/해제 (SchedulePage)
4. **경영관리 > 점심** · 휴게 배정 저장 (LunchPage · break_timeline)
5. **랜딩 > 데이터 업로드** · 상품 import log 조회 (UploadDataModal)
6. **적정재고 계산 일수** 편집 (useKvSetting)
- 모두 정상 저장·조회 확인

### 회귀 확인
- KV 값 저장·조회 · 이전과 동일 동작
- TS 통과 · 3355/3355 tests 통과

---

## 🎨 [14] ProductInfoPage 우측 패널 · 나머지 3 섹션 폴리시 ✅
**커밋** · `edc1a603`

### 배경
[13] 에서 헤더 + 가격재고 그리드 폴리시 완료 · 나머지 3 섹션 (기본정보·상세진열위치·기타) 추가 진행

### 해결
**DField·EditField 헬퍼 통일:**
- 라벨 · text-[18px] uppercase tracking-wider → text-[12px] font-semibold text-ink-soft
- 값 · text-[16px] font-semibold text-ink

**기본 정보:**
- 상품명 · 19px → 17px bold tracking-tight
- 공급사 · 18px → 15px semibold
- [상세보기] 버튼 · h-6 outlined → h-5 minimal "상세" chip

**상세 진열위치:**
- 안내 텍스트 · 13px → 12px · 축약
- 위치 추가 버튼 · font-semibold + h-6 (통일)

**기타:**
- DField 재사용 · 자동 통일

### 테스트 절차
1. **매장 > 상품 > 상품정보** · 상품 선택 · 우측 패널
2. 4개 섹션 (가격재고 · 기본정보 · 상세진열위치 · 기타) 모두 확인
3. 라벨 · uppercase 없이 · 자연스러운 한글 · text-ink-soft
4. 값 · 크기·색상 통일 · 시인성 우수
5. [상세보기] → [상세] · 미니 chip · vendor 모달 정상 open

### 회귀 확인
- 편집 모드 · EditField · input 정상 표시
- 저장·수정 flow · 정상
- 21/21 tests 통과

---

## 🐛 [13] 사용자 재리포트 · 2건 fix ✅
**커밋** · `e3e78622`

### 배경 (사용자 재리포트)
1. `⚠ column order_requests.optimal_stock does not exist` 계속 발생 · 이전 fix (cf9ec40a) 불완전
2. 상품정보 오른쪽 상품상세정보 UI · 시인성 좋고 예쁘게 최신 트렌드

### 해결
**A. order_requests.optimal_stock 잔재 SELECT 제거:**
- `server/routes/stock/productArrivals.ts:432` · GET /api/product-arrivals/compare/orders
- SELECT 목록에서 optimal_stock 제거 · 응답 매핑에 미사용
- 전수조사 · 다른 order_requests SELECT · 없음 확인

**B. ProductInfoPage 우측 패널 · Linear/Vercel 톤 리디자인:**
- 헤더 · uppercase 제거 · 라벨 축소 (16px→12px)
- 아이콘 · gradient → solid tint · 절제
- 카드 (가격·재고 그리드) · gradient·hover translate 제거 · flat 스타일
- 텍스트 사이즈 통일 · 판매가/현재고 20px primary · 나머지 17-18px secondary
- 단위 (원·개·%) 별도 span · 시각 구분
- raw-card-wrapper 4건 → Card 프리미티브 (framework audit 통과)

### 테스트 절차
**A. 발주요청 목록 (optimal_stock 완전 해소)**
1. **매입 > 발주 > 발주요청** 정상 로드 확인
2. **매장 > 상품입고 > 매입 이력 비교** (product-arrivals/compare/orders) · 정상 로드
3. 서버 로그 · `column order_requests.optimal_stock does not exist` 에러 · **완전 사라짐**

**B. 상품정보 우측 패널 리디자인**
1. **매장 > 상품 > 상품정보** · 임의 상품 선택 · 우측 패널
2. 헤더 · 라벨 uppercase 없이 자연스러운 한글
3. 가격·재고 그리드 · 8개 카드 · flat 스타일 · 통일된 padding
4. 판매가·현재고 · primary 강조 (brand-tint · sky-50 배경)
5. 매입가·이익율 · secondary · 흰 배경 · line 테두리
6. 창고1·2 (cyan tint) · 매장 (indigo tint) · 색상 구분
7. 텍스트 크기 · 통일 · 시인성 우수

### 회귀 확인
- 발주요청·발주필요·발주이력·매입비교 · 모두 정상
- 상품정보 · 편집·저장·수정 모달 · 정상 동작
- Framework audit · 위반 12 → 12 (증가 없음)
- TS 통과

---

## 🐛 [12] 사용자 리포트 · 3건 fix ✅
**커밋** · `f0b2ec59` (session-warning UI) · `cf9ec40a` (optimal_stock 컬럼) · `ffd4d157` (30일 하드코딩)

### 배경 (사용자 실시간 리포트 · 3건)
1. 세션 만료 메시지 · 글씨 너무 큼 · 최신 트렌드 미반영
2. 발주요청 목록 페이지 · `⚠ column order_requests.optimal_stock does not exist`
3. 상품정보 · 통계설정 적정재고 연동 안됨 · 30일 고정 표시

### 해결
**A. SessionTimeoutWarning 리디자인:**
- 다크 배경 → glassmorphism (bg-white/95 + backdrop-blur-md)
- 텍스트 축소 (sm→11px · lg→15px) · Linear/Vercel 톤
- rose/amber accent · 3-layer shadow · active:scale-[0.98]
- 13/13 tests 통과

**B. order_requests.optimal_stock 컬럼 미존재 fix:**
- `server/lib/optimalStock.ts` · syncOrderRequestsOptimalStock · no-op 전환
- 2026-09-09 원칙 · products.optimal_stock 단일 소스 · 스냅샷 DROP · 이 함수만 잔재
- GET · products JOIN 으로 이미 최신값 표시 (display/requests.ts:503-517)

**C. 적정재고 30일 하드코딩 fix:**
- `ProductInfoPage.tsx:L385` · "적정재고 (30일)" → "적정재고 ({optimalStockDays}일)"
- `useOptimalStockPeriod` 훅 사용 · 통계설정 KV 실시간 반영

### 테스트 절차
**A. 세션 만료 경고 (30분 후 자동)**
1. 로그인 후 · 아무 조작 없이 · 세션 만료 임박 시 · 우측 하단 알림
2. 이전 · 다크 배경 · 큰 글씨 · 신규 · 흰 배경 · 작은 글씨 · 라운드 카드
3. urgent (60초 이하) · rose 테두리 · 일반 · line 테두리

**B. 발주요청 목록 페이지**
1. **매입 > 발주 > 발주요청** 페이지 진입
2. 이전 · `⚠ column order_requests.optimal_stock does not exist` 에러
3. 신규 · 정상 로드 · optimal_stock · products JOIN 값 표시
4. **매장 > 발주 > 발주필요** · [발주 요청] 클릭 · 정상 저장

**C. 상품정보 · 적정재고 일수**
1. **시스템설정 > 통계설정 > 적정재고 계산 일수** · 45일로 변경
2. **매장 > 상품 > 상품정보** · 임의 상품 · 우측 패널
3. "적정재고 ({N}일)" · 45일 표시 (이전 · 30일 고정)

### 회귀 확인
- 발주요청·발주필요 · 정상 저장·조회
- 상품정보 · 적정재고 값·일수 · 정확 표시
- 세션 만료 · 계속사용·로그아웃 · 정상 동작

---

## 🎯 [11] 프레임워크 · stockArrivalsApi 프리미티브 추출 · 5 call sites + 타입 통합 ✅
**커밋** · `72ae0f3a`

### 배경
- `/api/stock-arrivals` · 5 곳 산발 (GET·POST·PATCH·DELETE)
- `StockArrival` 타입 · 2 파일 개별 정의 (중복)

### 해결
- **신규:** `src/lib/stockArrivalsApi.ts`
  - `listStockArrivals()` · GET 리스트
  - `createStockArrival(payload)` · POST (send_now·scheduled_at·초안)
  - `patchStockArrival(id, payload)` · PATCH
  - `deleteStockArrival(id, employeeId)` · DELETE
  - `StockArrival` · `CreateStockArrivalPayload` · `PatchStockArrivalPayload` 통합 타입
- **2 파일 마이그레이션**

### 테스트 절차
**A. 랜딩 페이지 · 입고 알림 리스트 (StockArrivalList)**
1. **랜딩 페이지** · 입고 알림 카드 · 리스트 정상 로드 · 최신순 정렬
2. 항목 클릭 · 상세 모달 정상

**B. 입고 알림 관리 (StockArrivalPage · 관리자)**
1. **경영관리 > 입고 알림** 페이지
2. 저장 · 즉시 발송 · 예약 발송 · 각각 정상 동작
3. 인라인 편집 · 저장 · 정상
4. 삭제 · confirm · 정상

### 회귀 확인
- 랜딩 · 관리 페이지 · 이전과 동일 동작
- 타입 · 통합 후에도 필드 접근 정상
- TS 통과 · 3355/3355 tests 통과

---

## 🎯 [10] 프레임워크 · orderRequestsApi 프리미티브 추출 · 7 call sites 통합 ✅
**커밋** · `23ddc1dc`

### 배경
- `/api/order-requests` · 7 곳 산발 (POST 5 · GET 2)
- 프레임워크 대원칙 · 단일 endpoint · 즉시 추출

### 해결
- **신규:** `src/lib/orderRequestsApi.ts`
  - `listOrderRequests()` · GET 리스트
  - `createOrderRequest(payload)` · POST 등록 (requested_at 자동 세팅)
  - `bulkSendOrderRequests(payload)` · POST bulk-send (SolAPI 카톡·SMTP)
  - `CreateOrderRequestPayload` · `OrderRequestRow` 타입
- **4 파일 마이그레이션**
- **1 파일 skip** (useOrderModal.ts · bulk-send 복잡 payload · 별도 확장 필요)

### 테스트 절차
**A. 발주필요 → 발주요청 (OrderManagePage)**
1. **매장 > 발주 > 발주필요** · 부족 상품 · [발주 요청] 클릭
2. 발주요청 리스트 · 즉시 반영 · toast

**B. 발주요청 일괄 요청 (OrderManagePage)**
1. 여러 상품 체크 · 일괄 발주 요청 · 각각 정상 저장

**C. 승인요청 · 발주요청 (RequestsPage)**
1. **승인요청** · 발주요청 탭 · 리스트 정상 로드
2. 실재고 리스트에서 · 발주 요청 · 정상 동작

**D. 상품 스캔 · 발주 요청 (ProductInfoCard)**
1. **바코드 스캔** · 상품 · 우측 카드 · [발주 요청] 클릭
2. 정상 저장 · 이미 요청됨 배지

### 회귀 확인
- 모든 발주 요청 flow · 이전과 동일 동작
- requested_at 자동 세팅 (이전 · 각 caller 에서 new Date().toISOString() 수동 세팅)
- TS 통과 · 3355/3355 tests 통과

---

## 🎯 [9] 프레임워크 · inventoryChecksApi 프리미티브 추출 · 11 call sites 통합 ✅
**커밋** · `af71c14a`

### 배경
- `/api/inventory-checks` · 11 파일에서 산발 호출 · 프레임워크 대원칙 위반
- `/api/inventory-checks/bulk` · 2 파일 산발
- borrowingsApi.ts · employeeApi.ts 패턴 존재 · 확장 필요

### 해결
- **신규:** `src/lib/inventoryChecksApi.ts`
  - `saveInventoryCheck(payload)` · POST 단건
  - `saveBulkInventoryChecks(payload)` · POST bulk (ScanPage 대량 저장)
  - `listInventoryChecks({ product_code? })` · GET 리스트 (필터 옵션)
  - `InventoryCheckPayload` · `InventoryCheckRow` · `BulkInventoryCheckPayload` 타입
- **11 파일 마이그레이션** (모두 `api.post/get` → 프리미티브 호출)

### 테스트 절차
**A. 실재고 편집 (InventoryEditModal)**
1. **매장진열 > 실재고테이블** · 상품 선택 · 편집 모달
2. w1·w2·s1·s2·s3 값 조정 · 저장 · toast · 새로고침 없이 반영

**B. 실재고 테이블 (RealStockTablePage)**
1. **매장진열 > 실재고테이블** · 셀 클릭 · 수정 · 저장
2. inventory-checks-updated 이벤트 · 리스트 자동 반영

**C. 상품정보 편집 (ProductInfoPage)**
1. **상품정보** · 상품 선택 · [수정] · 상세구역 (shelf) 변경 · 저장
2. 정상 저장 · #61 fix 와 함께 · 실재고 테이블 자동 동기

**D. 스캔 대량 저장 (ScanPage)**
1. **바코드 스캔** · 여러 상품 스캔 · 대량 저장 (bulk)
2. j.saved 카운트 · 정상 표시 · downgraded 배너

**E. 상품 스캔 시 이력 자동 로드 (ScanPage)**
1. 상품 스캔 · addQty 자동 채움 (직전 저장값)

**F. 유통기한 저장 (ExpiryDateModal)**
1. **바코드 스캔** · 상품 · 유통기한 모달 · 날짜 저장/해제
2. inventory_checks.expiry_date + products.expiry_date 저장

**G. 진열 승인요청 · 실재고 조회 (RequestsPage)**
1. **승인요청** · 실재고 탭 · 리스트 로드 정상

**H. 반품필요 리스트 (ReturnListPanel)**
1. **매입 > 발주 > 반품필요** · 실재고 컬럼 정상 표시

**I. 재고 재조정 (StockReconciliationTab)**
1. **매장진열 > 재고 재조정** · inventory-checks 최신 로드

### 회귀 확인
- 모든 페이지 · 이전과 동일 동작 · payload/response shape 무변경
- TS 검증 통과 · 3355/3355 tests 통과
- 응답 shape · 서버 · 로컬 타입 (RequestsPage.InventoryCheck 등) · cast 로 호환

---

## 📄 [8] 메타·문서 정리 · package.json + README + Migrations README ✅
**커밋** · `990acf9f` (package·README) · `1c9a2050` (migrations README)

### 배경
- 리뷰 지적 · package.json name "react-example" · README "React 18" · clean rm -rf (Windows)
- migrations/ · supabase/migrations/ · sql/ · 99개 SQL 파일 분산 · 온보딩 혼란

### 해결
**package.json:**
- `name` · "react-example" → "megatown-staff-scheduler"
- `clean` 스크립트 · `rm -rf` → `node fs.rmSync` (Windows 호환)

**README.md:**
- L52 · "React 18" → "React 19" (실제 의존성 · package.json)

**migrations/README.md (신규):**
- 3 폴더 (migrations/·supabase/migrations/·sql/) 용도 명시
- 신규 마이그레이션 표준 위치 (migrations/)
- 파괴적 SQL 주의 (대원칙)
- 최근 실행 이력 · 대기 3건

### 테스트 절차
1. **Windows PowerShell** · `npm run clean` 실행 · 이전 rm -rf 에러 없이 정상 동작
2. **README.md** · L52 · "React 19" 확인
3. **migrations/README.md** · 폴더 · 실행 안내 · 시각 확인

### 회귀 확인
- 없음 (문서·스크립트만 · 코드 무변경)

---

## 🎯 [5-1] 프레임워크 · OrderSettingsPage + StoreZoneMap · raw-card-wrapper → Card ✅
**커밋** · `083dd828`

### 배경
- framework audit · raw-card-wrapper · 3건 위반
- 대원칙 · Card 프리미티브 재사용 필수

### 해결
- OrderSettingsPage.tsx L137·L226 · `<section>` → `<Card as="section" variant="sm" padding="none" clip rounded="2xl">`
- StoreZoneMap.tsx L513 · 카운터존 카드 · `<Card variant="raw-sm" padding="sm" rounded="2xl">`
- gradient accent bar (커스텀 색상) · Card 안 div 로 유지 (시각 동일)
- framework audit · 위반 12 → 9

### 테스트 절차
1. **설정 > 발주설정** 페이지 진입
2. SMTP 이메일 설정 카드 · **시각 확인** · 그라디언트 상단 액센트 (brand-deep→brand→sky) 유지
3. 테스트 발송 카드 · 그라디언트 (emerald→teal) 유지
4. shadow · rounded-2xl · border · 이전과 동일
5. **매장진열 > 판매현황** or **매장구역도** · 카운터존 45~50 카드 · 시각 동일

### 회귀 확인
- OrderSettingsPage · SMTP 저장·테스트 발송 · 정상 동작
- StoreZoneMap · 카운터존 6 셀 (45~50) · event/normal 색상 구분 유지

---

## 🎯 [5] 프레임워크 · InventoryEditPanel · alert → useToast ✅
**커밋** · `c8614c26`

### 배경
- framework audit · `src/components/common/InventoryEditPanel.tsx:373` · `alert()` 사용
- 프레임워크 대원칙 위반 (useToast 표준)

### 해결
- `useToast` import + `showError` 호출
- 매장 zone 상세위치 3자리 검증 실패 시 · toast 로 알림 (이전 · alert 팝업)

### 테스트 절차
1. **매장진열 > 실재고테이블** · 상품 선택 · 편집 모달
2. 매장1·2·3 zone · **상세위치 미입력** or 3자리 미만 상태에서 저장 시도
3. **기대값** · 오른쪽 상단 · toast · "매장N 위치는 상세위치가 필수입니다 (3자리 · 예 332)"
4. 이전 · 브라우저 alert() 팝업 · 신규 · 앱 내부 toast

### 회귀 확인
- 정상 3자리 입력 시 · 저장 정상 동작
- 창고 zone (w1·w2) · 상세위치 없어도 저장 정상

---

## 🧪 [6] 테스트 정리 · 19개 실패 → 0 ✅
**커밋** · `c190ad86`

### 배경
- npm test · 19개 실패 · 3358개 중 (CI 신뢰도 저하)
- 사용자 리뷰 지적 · "의도 변경 vs 실제 버그 분류"

### 해결
- 19개 모두 · **의도적 UI 변경** · 코드 정상 · 테스트만 낡음
- 10개 test 파일 갱신 · 최신 UI · 최신 스펙 반영

### 갱신 항목
- useOptimalStockPeriod: MAX 90→120 · KV 100 이제 유효 (200 으로 test 갱신)
- useSaleStatusFilter: localStorage 사용 X (2026-09-10) · 재로드 default 복귀
- productMatch: barcode 필드 제거 · product_code 통합
- CategoryChips: sm h-9→h-7 · md h-10→h-8 (compact)
- ErrorBoundary: "오류가 발생했습니다" + 3 buttons (홈으로 추가)
- ProductDetailHero: barcode 제거 · product_code 자체가 바코드
- ScanPage.panels: "N개" 형식 폐기 · 창고/매장/합 배지
- SupplierFilterBar: Top N 옵션 UI 폐기
- storeMapLayout: L-shape → 14×8 grid · cols [1,2,3,4]
- ProductInfoPage: "코드" label → "#PC001" prefix 헤더

### 테스트 절차
1. **터미널** · `npm test -- --run` 실행
2. **기대값** · Test Files 227 passed · Tests 3355 passed · **실패 0**

---

## 📄 [7] TASKS.md v5 재확인 · 12건 완료 마킹 ✅
**커밋** · `a96c3051`

### 배경
- v5 (2026-09-02) PENDING 11개 · 이미 완료됐지만 TASKS.md 미갱신 (stale)
- v13 T-DISPLAY-1 · 이미 완료 (2026-09-09) but 마킹 없음

### 해결
- 커밋 대조로 완료 확인:
  - #60 (CopyMonthModal) · #62 (7192c2cb) · #70 (top-14 grep 0) · #72 (116d7146)
  - #73 (프리미티브 fit) · #75 (SplitPanel 반응형) · #78 (dc323581) · #79 (UUID fix)
  - #80 (b58a6295) · #63·#64 (0d9b7f8f·58ea6aef)
  - T-DISPLAY-1 (2026-09-09 표 재구성 · 요청횟수 컬럼)

### 테스트 절차
- 문서 정리 · **기능 테스트 불필요**
- `docs/TASKS.md` 열어서 · v5 섹션 · "✅ 재확인 완료" 표 · 시각 확인

---

# 📚 이전 세션 테스트 (2026-09-11 ~ 09-13)

---

# 🆕 2026-09-13 ~ 2026-09-14 세션 · #132 ~ #141

## #141 · 결제 대시보드 · 차용 이력 표시 (있을 때) ✅
**커밋** · `a25b7828`

### 배경
사용자 지시 · "결제대시보드에 차용이력이 있으면 보여줘"

### 해결
- PaymentDashboardPage · listBorrowings({ days, limit: 20 }) 조회
- 차용 있을 때만 섹션 표시 (없으면 렌더 X)
- 카드 리스트 · direction 배지 (대여 sky · 차용 amber)
- 상품·공급사·수량·금액 · 상태 배지 · 마감일

### 테스트 절차
1. **매입 > 결제 > 대시보드** 진입
2. 차용 이력 있는 경우 · "차용 이력" 섹션 표시
3. 각 항목 · 대여/차용 · 상태 · 마감일 확인
4. 차용 없으면 · 섹션 자체 미표시

---

## #140 · 결제 대시보드 · 기간 필터 ✅
**커밋** · `a25b7828`

### 배경
사용자 지시 · "결제대시보드에도 기간필터 추가해"

### 해결
- 서버 · GET /api/supplier-balances-map · ?start=&end= 지원
  · purchase_details · purchase_date · gte/lte
  · supplier_payments · payment_date · gte/lte
- 클라 · PeriodSelector · [전체, 10일, 1M, 2M, 3M, 6M, 12M]
- 기간 뱃지 · 활성 range 표시

### 테스트 절차
1. **매입 > 결제 > 대시보드** 진입
2. 상단 우측 · PeriodSelector · 기간 변경
3. 매입/결제/잔고 · 기간별 반영
4. 미지급/선지급 Top 10 · 기간 반영

---

## #129 · 카드별 결제내역 · 차월·한도·캐시백 통합 뷰 ✅
**커밋** · `615ce17b` (+ migration 파일)

### 배경
카드별 결제 · 차월 예정 · 한도 · 캐시백 통합 뷰 필요

### 해결
- Migration · `migrations/20260914_credit_cards_limit_cashback.sql` (사용자가 Supabase 실행)
  · ADD COLUMN IF NOT EXISTS · credit_limit BIGINT · cashback_rate NUMERIC(5,2)
- 서버 · summary 응답 · remainingLimit · currentCashback · totalCashback
- CardHistoryPage · 캐시백 % 배지 · 잔여 한도 배지 (rose/amber/sky)
- 상세 아코디언 · 한도·캐시백 요율·이번달 예상·누적 캐시백
- CardRegisterPage · 카드 한도 (원) · 캐시백 요율 (%) 입력 필드

### 테스트 절차
1. **Supabase SQL Editor** · `migrations/20260914_credit_cards_limit_cashback.sql` 실행
2. **매입 > 결제 > 결제카드등록** · 카드 · 한도·캐시백율 입력·저장
3. **매입 > 결제 > 카드별결제내역** · 카드 요약 · 캐시백 배지 표시
4. 카드 클릭 · 상세 아코디언 · 한도·캐시백 KPI 표시
5. 한도 90%↑ · rose 배지 · 70%↑ amber · 미만 sky

---

## #87 · 발주필요 · 스코어 기반 자동 추천 (Top 5) ✅
**커밋** · `bf0199ad`

### 배경
발주필요 리스트 · 우선순위 자동 추천 · 발주 결정 지원

### 해결
- 신규 `src/lib/orderPriorityScore.ts` · computePriorityScore()
  · shortage (재고 부족율) · urgency (소진 임박) · velocity (판매 활발)
  · eventBoost (이벤트 상품 +30) · seasonBoost (계절 상품 +15)
- SalesRecommendationPanel · "우선 발주 추천" Top 5 섹션
  · rank 배지 (1위 rose · 2위 amber · 3위 emerald · 나머지 zinc)
  · 스코어 · 재고 · 적정 · D-day · 사유
  · [발주] 버튼 · onRequestProduct 콜백
- OrderNeedTab · /api/events/today 상품 → event/seasonal 셋 · 스코어 계산

### 테스트 절차
1. **매입 > 발주 > 발주필요** 진입
2. 우측 패널 · "우선 발주 추천" 섹션 표시
3. Top 5 · 순위 배지 · 스코어 · 사유 (재고 부족 · 소진 임박 · 이벤트 등)
4. [발주] 클릭 · 발주 필요 리스트에 추가
5. 이미 요청됨 상품 · 자동 제외

---

## #86 · 발주필요 판매추천 · 오늘 날짜 기준 계절 배너 ✅
**커밋** · `c65e7310`

### 배경
발주필요 판매추천 · 오늘 계절·명절·수험생·공휴일 자동 반영

### 해결
- SalesRecommendationPanel · 상단 · "오늘은 [계절] 시즌" 배너
- GET /api/events/today · current_season 필드 매핑
- 통계설정 등록 이벤트 · 자동 반영 (events + event_products)

### 테스트 절차
1. **매입 > 발주 > 발주필요** 진입
2. 우측 판매정보 패널 상단 · "오늘은 [봄/여름/가을/겨울] 시즌" 배너
3. 오늘 날짜 · 요일 함께 표시

---

## #85 · 발주필요 우측 · 이벤트 상품 확장 + [발주 추가] ✅
**커밋** · `84c38bc5`

### 배경
발주필요 우측 판매정보 · 이벤트 상품 참고 · 매장에서 발주 결정

### 해결
- SalesRecommendationPanel · 이벤트 배너 클릭 · accordion 확장
- 확장 시 · 매핑 상품 카드 리스트 · 재고·적정·부족·공급사
- [발주] 버튼 · onRequestProduct 콜백 · 발주 필요 리스트 즉시 추가
- 이미 요청됨/판매중지 · 배지로만 표시 · 버튼 disabled

### 테스트 절차
1. **매입 > 발주 > 발주필요** 진입
2. 우측 · "진행중·임박 이벤트" 리스트
3. 각 이벤트 · 클릭 · 상품 리스트 확장
4. 상품별 [발주] 클릭 · 왼쪽 리스트에 추가
5. 요청됨 상품 · "요청됨" 배지 · 버튼 없음

---



## #84 · 상품상세정보 페이지 · 최신 트렌드 UI 개선 ✅
**커밋** · `0f9ab325` (ProductInfoPage.tsx UI 폴리시 · #139 커밋에 포함)

### 배경
- 상품상세정보 페이지 · 헤더·KPI 카드 · Linear/Vercel/Notion 톤 적용
- 파스텔·촌스러움 지양 · 초고해상도·부드러움

### 해결
- **헤더** · 아이콘 배경 · `bg-emerald-500` → `bg-gradient-to-br from-brand-tint to-emerald-50` · ring 라인 · 절제된 톤
- **KPI 카드** · Linear 스타일 hover 인터랙션:
  - `hover:shadow-md`, `hover:-translate-y-0.5`, `transition-all duration-200`
  - **판매가** · brand-tint gradient primary · 22px 강조
  - **현재고** · sky-50 gradient primary · 22px 강조
  - **이익율** · semantic 테두리색 (30% emerald · 15% amber · 미만 rose)
  - **창고1·2** · cyan-100 테두리 · 창고 그룹 시각적 구분
  - **매장** · indigo-100 테두리 · 매장 그룹 시각적 구분
  - **나머지** · line/70 · 미묘한 hover shadow

### 테스트 절차
1. **상품정보** 페이지 진입 · 좌측 상품 선택
2. 상세 뷰 · **헤더 아이콘** · 부드러운 gradient · 튀지 않음
3. **가격·재고** 섹션 4-col grid:
   - 판매가·현재고 카드 · **primary** · gradient 배경 · 큰 숫자 (22px)
   - 이익율 · 30%↑ emerald 테두리 · 15%↑ amber · 미만 rose
   - 창고1·2 · cyan · 매장 · indigo · 시각 구분
4. **hover** · 각 카드 · shadow up · 살짝 위로 (translate-y-0.5)
5. 파스텔·이모지·촌스러움 · **없음** · Linear/Vercel 톤

### 예상 결과
- 시각적 계층 · 뚜렷 · primary 강조
- hover 인터랙션 · 부드러움
- 창고·매장 · 색상으로 그룹 구분

### 사용자 피드백 필요
사용자 · 브라우저 확인 후 · 추가 개선 방향 안내 (기본정보·상세진열위치·기타 섹션도 폴리시 필요 시)

---

## #139 · 실재고 테이블 · 매장1·2·3 zone·상세구역 표시 fix ✅
**커밋** · `0f9ab325` (코드 통일 · 21 파일) · `2a2ce530` · `b82650e4` · `dffa04f8` (마이그레이션·스크립트)
**커밋** · `2a2ce530` · `b82650e4` · `dffa04f8` (마이그레이션·확인 스크립트) · 코드 통일 진행 중

### 배경
- 실재고 테이블 페이지 · 매장1·2·3 zone·상세구역 표시 안 됨
- DB · `store_stock` / `store_stock_2` 구 명명 · warehouse1_stock 규칙 불일치

### 해결 ✅
- ✅ DB 마이그레이션 · `store_stock` → `store1_stock` · `store_stock_2` → `store2_stock` (사용자 SQL 완료)
- ✅ Migration files · `20260914_inventory_checks_rename_store_stocks.sql` · `20260914_add_inventory_checks_store_stock_2.sql`
- ✅ `store2_zone` · `store3_zone` 컬럼 확인 (이미 존재)
- ✅ **Agent a57a3123 완료** · 21 파일 자동 fix · TS Exit 0
  - 서버 5 파일 · 신규 필드 SELECT + legacy alias 응답 유지 (하위 호환)
  - 공유 스키마 · 신규+legacy 병행 지원
  - 클라이언트 13+ 파일 · write 경로 신규 필드로 통일
  - 회귀 리스크 낮음 · legacy alias 응답 유지로 미변경 클라이언트도 정상

### 테스트 절차
1. **실재고 테이블** (매장진열 > 실재고테이블) 진입
2. 매장1·매장2·매장3 zone 컬럼 · 정상 표시
3. 상세구역 · 옆 컬럼 정상 표시 (위치 뱃지 · 3자리 코드)
4. 창고1·창고2 · 마찬가지로 표시
5. **입고 페이지** (상품입고 > 등록된 입고상품) 진입
6. 매장 추가 → 구역 선택 · DB 즉시 저장 · 새로고침해도 유지
7. 서버 콘솔 · `store_stock` 참조 에러 X · 캐시 clear

### 예상 결과
- 매장1·2·3 zone · 상세구역 모두 표시
- store_stock 컬럼 에러 X · warehouseN_stock 규칙 통일
- Agent 완료 후 · TS 검증 통과

---

## #138 · 상품입고 카드 · 색상 톤 통일 + 수치 옆 설명 라벨 ✅
**커밋** · `aafa920e`

### 배경
- 상품입고 카드 · 재고·예상·검수 · 색상 파편 (여러 톤 혼재)
- 수치 옆 설명 없음 · 사용자 혼란 (10 10 9 +1)

### 해결
- **색상 톤 통일:**
  - 재고 = amber (황색)
  - 예상 = sky (하늘)
  - 검수 = violet/rose (제비꽃/장미)
  - 창고 zone = cyan
  - 매장 상세 = indigo
- **라벨 추가:** 수치 옆 "재고" · "예상" · "검수" 표기 (사용자 지시 · 명확)

### 테스트 절차
1. **상품입고** 페이지 진입
2. 상품 스캔 · 등록된 입고 상품 리스트
3. 각 카드 · 수치 옆 라벨 · "10 재고" · "10 예상" 등 명확
4. 색상 톤 · amber·sky·violet 통일 · 파스텔·중복 X
5. 매장1·2·3 zone · cyan/indigo · 시각적으로 구분

### 예상 결과
- 사용자 · "10 10 9 +1" 혼란 없음
- 라벨 · 명확 · 톤 · 통일

---

## #137 · 상품입고 · 왼쪽·오른쪽 현재고 일치 + 매입 후 즉시 갱신 ✅
**커밋** · `5694072a`

### 배경
- 왼쪽 리스트 상품 카드 현재고 · 오른쪽 상세 패널 현재고 · 값 다름
- 매입 완료 후 · 같은 페이지에서 즉시 갱신 안 됨 · 새로고침 필요

### 해결
- **왼쪽 = 오른쪽 · SSOT 통일** · products 마스터 소스 사용
- **즉시 갱신:** 매입 완료 → `products-map-updated` 이벤트 dispatch → 리스너 → setItems 리렌더

### 테스트 절차
1. **상품입고** 페이지
2. 왼쪽 리스트 상품 카드 현재고 · 오른쪽 상세 패널 현재고 · **같은 값**
3. **매입 완료** 버튼 클릭 · products.current_stock 증가
4. 같은 페이지 · 왼쪽·오른쪽 · **즉시 반영** (새로고침 없이)
5. 다른 페이지 (실재고테이블) 이동 · DB에서 최신 조회 · 반영

### 예상 결과
- 왼쪽·오른쪽 값 일치
- 매입 후 즉시 UI 갱신 · 새로고침 불필요
- 대원칙 · "같은 페이지 즉시 · 다른 페이지 DB 조회 · 문제 없음"

---

## #135 · 매입 후 · 실재고 테이블 자동 반영 ✅
**커밋** · `3ff92ab1`

### 배경
- 상품 매입 후 · 실재고 테이블 페이지 이동 · 데이터 반영 안 됨
- DB에는 저장됐는데 UI 미갱신

### 해결
- 이벤트 리스너·dispatch 강화
- `product-mutated` · `inventory-checks-updated` 이벤트 발행
- 실재고 테이블 페이지 · 이벤트 수신 · 재조회

### 테스트 절차
1. **상품입고** · 상품 매입 완료
2. **실재고 테이블** 페이지 이동
3. 매입한 상품 · 즉시 반영 · 자동 데이터 로드
4. 창고·매장 zone·재고 · 정확 표시

### 예상 결과
- 매입 → 실재고 테이블 · 자동 반영
- 새로고침 없이 · 자동 데이터 로드

---

## #134 · 등록된 입고상품 · 매장 추가 슬롯 · 구역 선택 UI fix ✅
**커밋** · `99b7d47b` · `414a7424`

### 배경
- 등록된 입고상품 · 매장 추가 · 매장2·매장3 구역 선택 UI 활성화 안 됨
- 저장 안 됨 · zone 값 유실

### 해결
- 매장 슬롯별 · 독립적 zone 상태 (store2Zone · store3Zone)
- POST `/api/inventory-checks` · store2_zone / store3_zone DB 저장
- 각 슬롯 · 독립 관리 · 매장1 변경해도 매장2·3 영향 X

### 테스트 절차
1. **상품입고** > **등록된 입고상품**
2. 상품 카드 · "매장 추가" 클릭 · 매장2 슬롯 등장
3. 매장2 zone 선택 · DB 즉시 저장 · 페이지 새로고침 · 유지
4. 매장1 zone 변경 · 매장2·3 값 · **변경 없음** (독립)
5. 매장3 추가 · 마찬가지 검증

### 예상 결과
- 각 매장 슬롯 · zone 독립
- DB 즉시 저장 · 새로고침 유지
- 매장1 변경 시 · 매장2·3 값 유지

---

## #133 · 상품 신규 등록·수정 모달 · 상세구역 직접 지정 ✅
**커밋** · `bb3c2647`

### 배경
- 상품 신규 등록·수정 모달 · 상세구역 (shelf_positions) 직접 지정 불가
- 자동 배정만 가능 · 수동 편집 필요

### 해결
- ProductCreateModal · ShelfPositionInput 프리미티브 통합
- 3-stepper (층·칸·순서 각 1자리 · "332" 형식)
- 매장 필수 · 창고 선택

### 테스트 절차
1. **상품정보** > **[신규 등록]** 또는 **[수정]**
2. 배치구역 섹션 · 진열구역 + 상세구역 나란히
3. 상세구역 · 매장1·2·3 · 창고1·2 각 3-stepper 편집
4. 저장 · inventory_checks.shelf_positions JSONB 반영
5. 상품정보 페이지 · 뱃지 표시 · `매장1:332 · 창고1:105`

### 예상 결과
- 상세구역 · 직접 편집 가능
- 매장 필수 · 창고 선택
- JSONB 저장 · 뱃지 표시

---

## #132 · 입고상품 · 예상 현재고 · 라벨·배지 정렬 ✅
**커밋** · `ddfbf5a0` · `7b412c6a`

### 배경
- 입고상품 카드 · 예상 현재고 라벨·배지 정렬 뒤죽박죽
- 사용자 지시 · 나란히 정돈 · 팬시하게 UI

### 해결
- 라벨·배지 · flex 나란히 배치
- 팬시한 UI · 색상·간격·크기 통일

### 테스트 절차
1. **상품입고** 페이지
2. 입고상품 카드 · 예상 현재고 · 라벨·배지 나란히
3. 시각적으로 · 팬시하고 명확

### 예상 결과
- 라벨·배지 정렬 정돈
- 팬시한 UI

---


**커밋** · eed237b6 · 8e6a2ea2

### 배경
이전 · 5개 endpoint (order-history + purchase-details + supplier-balances-map + supplier-payments + top-sales) · 값 미스매치 (광동제약 · 매입 0원 vs 잔고 188M).

### 해결
매입/결제/잔고 · **하나의 endpoint** (`/api/supplier-ledger`) · 정합성 100%.

### 테스트 절차
1. **결제입력 페이지** 진입
2. **광동제약** 선택 · 상단 KPI 카드:
   - 총 매입 (전체) · N원 · 발주 M건 · 결제 K원
   - 잔고 · 상태 라벨 (미지급 sky / 선지급 rose / 완납 emerald)
3. **테스트 공급사** 선택 · 다음 값 확인:
   - 총 매입 · **57,500원**
   - 총 결제 · **2,775,000원**
   - 잔고 · **-2,717,500원** · **선지급 (붉은색)**
4. **우측 매입내역 탭** · 상품명/수량/단가/금액 정상 표시
5. **우측 결제내역 탭** · 결제일/금액/방법/메모 정상 표시
6. **우측 발주내역 탭** · 발주 이력 (order-history · 유지)
7. **우측 판매내역 탭** · 판매 이력 (top-sales · 유지)

### 예상 결과
- 미스매치 X · 상단 KPI = 우측 매입/결제 리스트 합계 = 잔고 정확
- 캐시 X · 결제 등록 후 · 즉시 반영

---

## #116 · 연차 스케쥴 · KST off-by-one + 에러 삼킴 제거 ✅
**커밋** · 8e6a2ea2 (KST fix) · 5f1b68bc (에러 삼킴 제거)

### 배경
- `.toISOString().slice(0, 10)` UTC 변환 · KST 하루 밀림
- `.catch(() => null)` · schedules INSERT 실패 시 · 조용히 무시 · 사용자 알림 없음

### 해결
- `src/lib/kstDate.ts` + `server/lib/kstDate.ts` 신규 헬퍼 (`getKstYmd`, `nextKstYmd`, `compareYmd`)
- leave.ts · 문자열 기반 while loop · Date 변환 X
- `.catch(() => null)` 제거 · try/catch + 자세한 로그 · 실패 시 500 반환

### 테스트 절차

**A · 연차신청 폼 기본값 (LeavePage)**
1. 오전 9시 이전 · 연차신청 페이지 열기 (KST 새벽)
2. 시작일/종료일 · 오늘 KST 날짜로 정확히 표시
3. → 이전 · 전날 표시 · 지금 · 오늘 표시

**B · 연차 승인 (관리자)**
1. 승인요청 페이지 · 연차 신청 승인
2. 서버 콘솔에 로그 · `[LEAVE APPROVE] emp=X type=월차 dates=[YYYY-MM-DD] · N건 스케쥴 반영`
3. 스케쥴표 (일일) · 해당 날짜 · 해당 직원 · 연차(월차) 표시
4. 하루 밀림 X · 신청한 그 날짜 정확히

**C · 실패 시 (기대)**
1. schedules INSERT 실패 시 · 클라이언트 · 500 에러 · 명확한 메시지
2. 서버 콘솔 · `[LEAVE APPROVE FAILED] ... <에러>` 자세히

### DB 확인 (선택)
```
node scripts/check-leave-schedule-sync.mjs
```
최근 승인 연차 vs schedules 매칭 확인.

---

## #131 · 연차승인 페이지 · UI 리디자인 ✅
**커밋** · 8fd95ac4

### 배경
기존 · 낡은 grid-cols-2 탭 · border-l-2 색색 · 촌스러움. Linear/Vercel/Notion 2026 톤 미달.

### 해결
- **TabBar 프리미티브** · level=2 · 프레임워크 통일
- **이니셜 아바타** · status tone (amber/emerald/rose) · ring-1
- **이름 + 연차 유형 chip** · 브랜드 톤
- **기간** · CalendarDays + tabular-nums
- **사유** · MessageSquareText 인용문
- **메모** · StickyNote (indigo)
- **검토하기** · Linear-톤 zinc-900 (green-50 촌스러움 제거)
- **승인/반려** · emerald-600 / rose-600 · 명확 대비

### 테스트 절차
1. **관리자 로그인** · 승인요청 페이지 (요청목록) · 연차승인 탭
2. **탭 확인** · TabBar · 승인 대기 (amber badge · pulse) · 전체 목록
3. **리스트 아이템 각각:**
   - 이니셜 아바타 · 이름 첫 글자 · 배경색 · 상태에 맞음
   - 이름 (17px bold · 진함)
   - 연차 유형 chip (brand-tint · rounded-full)
   - 기간 · 아이콘 + 날짜 · 단일 · 구간 자동 표시
   - 사유 · 인용문 스타일 · 있으면
   - 메모 · indigo · 있으면
   - 신청일 · 하단 · 12px muted
   - 상태 pill · 오른쪽 상단
4. **검토하기 클릭 (pending 만):**
   - 인라인 확장 · 메모 입력 + 승인/반려 버튼
   - 승인 · emerald · 반려 · rose · 취소
5. **hover** · 카드 · 살짝 border 진해짐 · shadow 미세 (Linear-톤)

### 예상 결과
- 촌스러움 X · Linear/Vercel/Notion 2026 톤
- 프레임워크 통일 (TabBar · Card · StatusPill · 아이콘)
- 40대+ 가독성 · 폰트 계층 명확 (17/14/13/12)

### 회귀 체크
- 승인 · 반려 · 취소 · 검토하기 · 모두 동작 (기능 100% 유지 · className 만 변경)

---

## #130 · 연차이력 · 삭제 기능 (관리자) ✅
**커밋** · b33640b5

### 배경
연차이력 · 승인·반려된 것 · 삭제 불가. 관리자도 · 잘못 승인·반려한 이력 · 삭제 못 함.

### 해결
- 서버 · 관리자 (isAdmin) · pending 조건 skip · 승인/반려 이력도 삭제 가능
- **승인된 연차 삭제 시** · schedules 테이블 · 대응 항목 자동 제거 (월차·오전반차·오후반차)
- 클라 · 관리자 뷰 (approval) · 각 리스트 아이템 · Trash2 버튼 (rose hover)

### 테스트 절차
1. **관리자 로그인** · 승인요청 · 연차승인 탭
2. **대기 중 연차** · Trash2 클릭 · confirm dialog · "대기 중 연차이력을 삭제할까요?" → 예 → 삭제 성공 toast
3. **승인된 연차** · Trash2 클릭 · confirm dialog · "**승인된 연차의 스케쥴도 함께 제거됩니다.**" 안내 → 예 → 삭제 + 스케쥴표 반영 사라짐
4. **반려된 연차** · Trash2 클릭 · confirm dialog · "반려된 연차이력을 삭제할까요?" → 예 → 삭제

### 예상 결과
- 관리자 · 모든 상태 이력 삭제 가능
- 승인 이력 삭제 시 · 서버 로그 · `[LEAVE DELETE] emp=X · start~end · schedules 정리`
- 스케쥴표 · 삭제한 연차 · 사라짐

### 회귀 체크
- 일반 직원 · 자기 pending 만 삭제 가능 (기존 유지)
- 승인·반려 이력 · 일반 직원 · 삭제 불가 (기존 유지)

---

## #75 · 진열요청 · 담당자 지정 flow ✅
**커밋** · fa312aef

### 배경
진열요청 리스트 · 담당자 미지정 상품 · [+ 지정] 버튼만 있고 · 클릭 시 아무 동작 안 함 (부모 콜백 미구현).

### 해결
- 신규 · `AssignStaffModal.tsx` · 재직 직원 리스트 · 검색 + 클릭 지정
- 부모 · `RequestsPage.tsx` · 상태 관리 · 모달 mount · 지정 후 리스트 갱신

### 테스트 절차
1. **진열요청 페이지** · 담당자 없는 요청 확인
2. **[+ 지정] 버튼** 클릭 · **AssignStaffModal** 오픈
3. **모달 상단 · 담당자 지정 · zone_label 표시**
4. **검색창** · 이름·직급·직군 검색 · 필터 정상 작동
5. **직원 리스트** · 이니셜 아바타 · 이름 · rank · position 표시
6. **직원 클릭** · 지정 처리 중 · Spinner 표시 · 완료 후 · toast "N님 지정 완료" · 모달 닫힘
7. **리스트 즉시 갱신** · 해당 요청 · 담당자 표시됨
8. **재직 필터** · 퇴사자 (retire_date 있음) · 리스트 X
9. **level 필터** · level < 1 · 리스트 X

### 예상 결과
- 진열요청 · 담당자 명확히 지정 가능
- 지정 후 · 즉시 화면 반영 (캐시 X · loadDisplayReqs)

### 회귀 체크
- 이미 담당자 있는 요청 · [+ 지정] 버튼 · 표시 X (조건부 렌더)
- 다른 진열요청 flow (준비완료 · 진열완료 · 삭제) · 정상 동작

---

## #126 · 캐시 제거 · 나머지 endpoint (Agent 병렬) ✅
**커밋** · b33640b5 (23파일 포함)

### 배경
대원칙 · 중요 데이터 · 캐시 X · 즉시 업데이트. supplier-ledger·order-history·display-requests 는 이미 완료. 나머지 endpoint 다수 캐시 헤더 없음.

### 해결
Agent 위임 · 아래 endpoint 그룹 · Cache-Control no-store 헤더 추가:
- `server/routes/purchase/*` (purchase.ts · purchaseHistory.ts · supplierPayments/*)
- `server/routes/stock/stockManage/*` (lowStock · periodCoverage · productHistory · stockRaw · topProducts · trending 등)
- `server/routes/daily/leave.ts` (leave-stats · leave-requests · leave-balance)

### 테스트 절차
1. **네트워크 탭 열기** (F12 · Network)
2. **결제입력** · **매입이력** · **재고관리** · **연차** 페이지 방문
3. **응답 헤더** · `Cache-Control: no-store, no-cache, must-revalidate` 확인
4. **데이터 변경 후** · 새로고침 없이도 · 재요청 시 최신 데이터 반영

### 예상 결과
- 브라우저 캐시 X · 항상 최신 DB 값
- 조회 성능 미세 감소 (수용 · 정확성 우선)

---

## #100 · 반품필요 · 필터 표기 fix ✅
**커밋** · f48c3129

### 배경
1M판매·3M판매 필터 · 로직 `<=` (이하) · **표기 ↑ (이상)** · 오표기.

### 해결
1M판매·3M판매 · 화살표 `↑` → `↓` (이하 · 정확 표기)

### 테스트 절차
1. **매입 > 반품필요** 탭
2. 필터 확인 · 매입주기 `↑` 유지 · 1M판매 `↓` · 3M판매 `↓`
3. 값 조정 · 필터링 · 이하 값만 리스트에 나옴

---

## #94 · 매장구역도 · 셀 클릭 팝업 · 화면 가운데 ✅
**커밋** · e19020e7

### 배경
Radix Popover · 셀 옆 표시 · 스크롤 · 화면 밖 튀어나갈 가능성.

### 해결
- `position: fixed` + `top/left: 50%` + `translate(-50%,-50%)` · 화면 가운데
- `!important` (Tailwind !) · Radix inline style override
- 그림자 강화 · modal-like 존재감

### 테스트 절차
1. **매장구역도** 페이지
2. **셀 클릭** → 팝업 · **화면 가운데** 표시
3. 스크롤 상태에서도 · 항상 가운데
4. 반응형 · maxWidth 90vw

---

## #109 · 기간 필터 · 통일 프리셋 신규 ✅
**커밋** · eb7c9710

### 배경
페이지마다 기간 옵션 다름 (1M/3M/6M/12M · 10일/1M/2M/3M · 등).

### 해결
신규 프리셋 · `PERIOD_UNIFIED_DAYS_PRESET` · 10일·1M·2M·3M·6M·12M (일 단위 · 10/30/60/90/180/365)

### 테스트 절차
개발자 확인 · `src/components/common/PeriodSelector.tsx` · 신규 export
- **사용처 이관** · 다음 세션 · 각 페이지 별로 순차 적용 (사용자 확인 후)

---

## #126 · 캐시 제거 · 40+ endpoint (Agent 병렬) ✅ 상세
**커밋** · b33640b5

### 캐시 헤더 추가 완료 목록
- `server/routes/display/requests.ts` (2)
- `server/routes/stock/products.ts` (8)
- `server/routes/purchase/purchaseHistory.ts` (1)
- `server/routes/purchase/purchase.ts` (4)
- `server/routes/purchase/supplierPayments/*.ts` (11)
- `server/routes/stock/stockManage/*.ts` (12)
- `server/routes/daily/leave.ts` (4)
- `server/routes/schedule/schedules.ts` (1)

### 특이사항
- vendors.ts / products-map / inventory-latest · **기존 캐시 헤더 (max-age)를 no-store로 교체** · 정합성 개선
- 순수 헤더 추가 · 응답 스키마·로직·파라미터 무변경

---

## 이번 세션 완료 요약

| # | 태스크 | 커밋 |
|---|-------|------|
| #125 | 결제입력 · 총 매입 소스 통일 | eed237b6 |
| #127 | 결제입력 · supplier-ledger SSOT 통합 | 8e6a2ea2 |
| #116 | KST off-by-one + 에러 삼킴 제거 | 8e6a2ea2·5f1b68bc |
| #131 | 연차승인 UI 리디자인 | 8fd95ac4 |
| #130 | 연차이력 삭제 (관리자) | b33640b5 |
| #126 | 캐시 제거 40+ endpoint | b33640b5 |
| #75  | 진열요청 담당자 지정 flow | fa312aef |
| #100 | 반품필요 · ↑↓ 표기 fix | f48c3129 |
| #94  | 매장구역도 팝업 가운데 | e19020e7 |
| #109 | 기간 필터 통일 프리셋 | eb7c9710 |
| #78  | SplitPanel · 5:5 근사값 제거 · 프리미티브 통일 | 1baba68b |
| #97  | 파괴 버튼 · confirm 6건 추가 · 실수 방지 | 2ee9b822 |
| #104 | 연차신청 (apply) · 리스트 UI · Linear 톤 통일 | 3c0010d0 |
| #102 | ProductSearchInput · 결과 팝오버 재디자인 | 9d8e7d6d |
| #98  | 차용계약 · 반응형 좌우 패널 접기 | 8218fee0 |
| #121 | 진열요청 담당자 자동 매칭 (이미 서버 완료 확인) | (확인만) |
| #93  | 관리자 대시보드 (LandingPage · 이미 구현 확인) | (확인만) |
| #115 | 발주 관련 · 잔여 캐시 헤더 3건 추가 | c6882101 |
| #81  | 상품정보 · 진열위치 색깔 강조 (창고=cyan · 매장=violet) | 3a967f28 |
| #91  | ExpiryBadge · 상품명 옆 배치 (프리미티브 확산) | 85668f03 |
| #92  | 유통기한 임박 리스트 · 해제 토글 + confirm | 8009442e |
| #77  | 서류작성 UI (이미 TabBar level=3 통일 확인) | (확인만) |
| #95  | 매장구역도 탭 재구성 (이미 TabBar 매장·창고1·창고2 확인) | (확인만) |
| #99·#103·#120 | 탭메뉴 통일 (이미 TabBar level=2/3 · 왼쪽 정렬 확인) | (확인만) |
| #90  | 유통기한 3경로 등록·해제 UI (스캔·매입·상품등록 이미 구현) | (확인만) |
| #117 | 발주이력 · [매입확인] 버튼 · status='matched' | 5e6e6982 |
| #105 | 상품입고 · 현재고 카드 시각 강조 · 창고·매장 배지 | ab42d806 |
| #80  | 페이지 보이기/숨기기 · usePagePermissions 감사 (이미 광범위 적용) | (확인만) |
| #76  | 진열요청 담당자 매핑 · AssignStaffModal 이미 존재 | (확인만) |
| #88·#89 | 통계설정 · 탭메뉴로 변경 · TabBar level=2 통일 | e266f97c |
| #111 | 공급사 저장 · 서버 로그 강화 · 재현 시 원인 추적 | fea5a149 |
| #112 | 공급사 정보수정 · 발주이력 컴팩트 섹션 통합 | d3d7cea5 |
| #55·#53 | 발주필요 · 판매추천 · 임박 이벤트 배너 통합 | bc097349 |
| #52·#54 | 이벤트 관리 UI 신규 · 통계설정 3번째 탭 | 5434854d |
| #83 | 상품등록 모달 · 참조 상품 섹션 제거 | 7dcbacbe |
| #108 | 사이드바 알림 스위치 (NotificationToggle) 제거 | 810838f8 |
| #82 | 상품등록 모달 · 배치구역 2분리 · shelf_positions JSONB | f9acf35b |
| **#72·#73** | **재고자산·판매액 SSOT 감사 · vat·salesTrend 파생 통일** | **5ae4339a** |
| #118 | 결제 대시보드 페이지 신규 | d706ce39 |
| #101 | 차용계약 PDF 프리뷰·다운로드 | cae5d072 |
| **#73** | **supplierPurchases 판매액 SSOT 재감사 fix** | **cae5d072** |

**총 · 44태스크 완료 · 50커밋 (자율 세션)**

---

## 진행 보류 (사용자 명확 정보 필요)

- **#82** · 상품정보 수정 모달 · 배치구역 2분리 · 상세구역 편집 모달 (상세구역 데이터 필드·UX 상세 필요)
- **#77** · 요청목록 · 서류작성 UI 통일 · ERROR/BASICLAYOUT 이미지 참고 (이미지 필요)
- **#105** · 상품입고 · 현재고 카드 · 창고·매장 옆 시각 강조 (창고별 별도 필드·강조 방식 상세 필요)
- **#103·#120** · 탭메뉴 왼쪽 정렬 (어느 페이지·현재 어떤 정렬인지 상세 필요)

---

## #78 · SplitPanel · 5:5 근사값 제거 ✅
**커밋** · 1baba68b

### 배경
프리미티브 SplitPanel · 자동 5:5 (innerWidth * 0.5) 계산 있음. 4개 페이지 · 개별로 유사 계산식 하드코딩.

### 해결
- ZoneEditPanel · VendorManageSplit · PurchaseHistoryTab.panels · ReturnListPanel
- 5:5 근사 계산식 (`window.innerWidth * 0.5`) 제거 · 프리미티브 자동 계산 사용
- 사이드바 스타일 (288·320·360·420 · 좁은 사이드) 은 유지

### 테스트 절차
1. **매장구역도 · 편집** · SplitPanel 5:5 유지
2. **공급사 관리** · 5:5
3. **매입이력 공급사별** · 5:5
4. **반품필요** · 5:5
5. **드래그** · 조정 후 · 다시 5:5 (자동)

### 회귀 체크
- storage 저장 값 · 유지 (storageKey 그대로)
- 각 페이지 · UI 정상 · 조정 가능

---

## #97 · 파괴 버튼 · confirm 6건 추가 ✅
**커밋** · 2ee9b822 (Agent 조사 · task adbcea2f 리포트 기반)

### 배경
Agent 조사 · 파괴적 작업 · confirm 없음 · 실수 위험 6건 발견.

### 해결 · confirm 추가한 파일
1. **LeavePage.tsx** · `handleCancel` (직원측 연차 신청 취소)
2. **NotificationBell.tsx** · `deleteAll` (알림 전체 삭제)
3. **DisplayPage/DisplayRequestPanel.tsx** · `handleDelete` (진열요청 삭제)
4. **SettingsModal/SettingsModal.tsx** · `removePosition·removeWorkplace·removeScheduleType·removeRank(unused)`
5. **DisplayPage/ZoneGroupPanel.tsx** · `deleteGroup`
6. **OcrPage/SynonymsTab.tsx** · `deleteProductSynonym·deleteSupplierAlias`

### 테스트 절차
1. **연차신청** · 내 신청 · 취소 → confirm dialog
2. **알림 벨** · 모두 삭제 → confirm dialog
3. **진열관리** · 진열요청 삭제 → confirm dialog
4. **설정 모달** · 직군·직급·근무지·스케줄유형 삭제 → confirm dialog
5. **매장구역도** · 그룹 삭제 → confirm dialog
6. **OCR 동의어** · 동의어·별칭 삭제 → confirm dialog

### 예상 결과
- 각 파괴 버튼 · confirm dialog 표시
- 취소 시 · 삭제 X
- 대상 이름 표시 (예: `직급 "부장"을 삭제할까요?`)

### 회귀 체크
- 다른 파괴 작업 (30+ 케이스) · 기존 confirm 유지
- 로컬 편집 (ReturnRequestModal, ScanPage removeRow) · 세션 상태만 · confirm 없음 (위험도 낮음)

---

## #104 · 연차신청 (apply) · 내 신청 내역 · Linear 톤 통일 ✅
**커밋** · 3c0010d0

### 배경
approval mode(#131)는 재작성 완료 · apply mode 리스트는 여전히 · border-l-2 색색 · 19px 폰트 · 촌스러움.

### 해결
- 리스트 카드 · rounded-xl · hover shadow · approval mode와 동일 톤
- 유형 chip · brand-tint · rounded-full
- 사유 · MessageSquareText · 관리자 메모 · StickyNote
- 폰트 계층 · 16/13/12 (기존 19px 대부분 제거)
- 취소 버튼 · Linear-톤 · rose hover

### 테스트 절차
1. **일반 직원 로그인** · 연차신청 페이지
2. **잔여 연차 배너** · 유지 (변경 없음)
3. **연차 신청** 폼 · 유지 (변경 없음)
4. **내 신청 내역 리스트:**
   - approval mode와 동일 스타일 · Linear/Vercel 톤
   - 날짜 (16px bold) · 유형 chip
   - 상태 pill 오른쪽 상단
   - 사유·메모 아이콘 인용문
5. **신청 취소 (pending만)** · confirm dialog + 취소 버튼

---

## #102 · ProductSearchInput · 결과 팝오버 재디자인 ✅
**커밋** · 9d8e7d6d

### 배경
`ProductSearchInput` · 결과 리스트 · divide-y 촌스러움 · Package 아이콘만.

### 해결
- 팝오버 · 그림자 강화 · rounded-xl · 세련
- 이니셜 아이콘 · 상품명 첫 글자 · rounded-lg 8x8
- 활성 상태 · bg-brand-tint · 이니셜 bg-brand-deep white
- 코드/공급사 · tabular-nums · 색상 계층
- 최대 높이 · 180 → 240px

### 테스트 절차
1. **차용계약** or **입고등록** or **발주필요** · 상품 검색창 사용
2. 검색 · 결과 리스트 팝오버 표시:
   - 그림자 · rounded-xl · 세련
   - 각 아이템 · 이니셜 아이콘 + 상품명 + 코드/공급사
   - 선택 시 · brand-tint 배경 강조
3. 빈 상태 · Package 아이콘 + 텍스트

---

## #98 · 차용계약 페이지 · 반응형 좌우 패널 접기 ✅
**커밋** · 8218fee0

### 배경
3-column 레이아웃 · 좌측 리스트 + 중앙 등록 + 우측 상세. 계약등록 (중앙) 확장 필요 시 · 좌·우 접기 불가.

### 해결
- 좌·우 패널 · 각각 collapse 상태
- 접힘 시 · 세로 icon rail (56px · List/FileText 아이콘 + 텍스트)
- 클릭으로 · 펼치기·접기
- 계약등록 (중앙) · 접힘 상태에 따라 자동 확장

### 테스트 절차
1. **차용계약 페이지** · lg (데스크탑) 이상
2. **좌측 리스트** · 우상단 · ChevronLeft 접기 버튼
3. **접기 클릭** · 리스트 · 56px icon rail로 축소 · 중앙 확장
4. **icon rail 클릭** · 다시 펼침
5. **우측 상세** · 우상단 · ChevronRight 접기 버튼 · 동일 동작
6. **둘 다 접기** · 계약등록 (중앙) · 최대 폭
7. **모바일 (lg 미만)** · 기존 세로 스택 유지 (변경 없음)

---

## #121 · 진열요청 담당자 자동 매칭 (확인만) ✅

### 배경
서버 (`server/routes/display/requests.ts:177-188`) · 이미 zone_assignments 기반 자동 매칭 구현.

### 확인 결과
```typescript
// 담당자 자동 매칭 · zone_assignments · assignedStaffId 미지정 시
if (zoneId && (!assignedStaffId || Number.isNaN(assignedStaffId))) {
  // zone_assignments 조회 · employee_id 자동 지정
}
```

### 테스트 절차
1. **진열요청 생성** · zone_id 만 지정 · assigned_staff_id 미지정
2. **자동으로** · 해당 구역의 zone_assignments 기반 · 담당자 자동 배정
3. 리스트에 표시

---

## #93 · 관리자 대시보드 (확인만) ✅

### 확인 결과
`src/components/LandingPage/LandingPage.tsx` · 이미 구현됨:
- `isSuperAdmin` · `isManagerRole` · `isAdmin` 구분
- 관리자 · TodayStatusPanel · 오늘 요약 표시
- 관리자만 접근 가능한 링크·기능 gated
- roleLabel · "최고관리자" / "관리자" / "직원"

### 별도 신규 페이지 필요 여부
- 현재 · LandingPage 자체가 · 역할별 랜딩 (관리자·직원·공급사)
- **신규 페이지 불필요** · 필요 시 · LandingPage 확장 (KPI 추가·차트 등)
- 사용자 · 별도 대시보드 원할 경우 · 스펙 확정 후 진행

---

## 추가 완료 태스크 (2026-09-13 자율 이어서)

### #115 · 발주 관련 캐시 잔여 3건 ✅ · 커밋 c6882101
- `/api/order-requests` · `/api/order-history` · `/api/product-arrivals/compare/orders` · Cache-Control no-store 추가
- 대원칙 · 발주부분 캐시 X · 즉시 업데이트 · 완료

### #81 · 진열위치 색깔 강조 ✅ · 커밋 3a967f28
- ProductBasicInfoPanel · 창고=cyan / 매장=violet · Warehouse·Store 아이콘
- 테스트: 상품 상세 열기 · 진열위치 · 색깔 pill · 창고/매장 구분

### #91 · ExpiryBadge 확산 ✅ · 커밋 85668f03
- ProductBasicInfoPanel · 상품명 옆 · 유통기한 임박 배지 자동 표시
- 테스트: 유통기한 있는 상품 조회 · 상품명 옆 · D-N 배지

### #92 · 유통기한 임박 · 해제 토글 ✅ · 커밋 8009442e
- ExpiryImminentTab · 각 행 우측 · X 해제 버튼
- confirm dialog · 상품명·유통기한 안내
- PATCH · expiry_date=null · 리스트에서 즉시 제거
- 테스트: 매입 > 유통기한 임박 · X 클릭 · confirm → 해제

### #77·#95·#99·#103·#120·#90 · 이미 구현 확인만
- 서류작성 (`DocumentWriterPage`) · TabBar level=3 이미 통일
- 매장구역도 (`DisplayPage`) · 매장·창고1·창고2 · 3개 탭 이미 구현
- 탭메뉴 · TabBar 프리미티브 · level=2/3 · 왼쪽 정렬 · 이미 통일
- 유통기한 3경로 (스캔·매입·상품등록) · ExpiryDateModal 이미 통합

---

## #117 · 발주이력 · [매입확인] 버튼 ✅
**커밋** · 5e6e6982

### 배경
발주 완료 · 이력 표시 · 하지만 매입(입고)과 매칭 확인 상태 · 별도 관리 없음. 매입 완료된 발주 · 시각적 구분 필요.

### 해결
- **서버** · `PATCH /api/order-history/:orderNumber/match` 신규 endpoint
  - `order_requests` · order_number 그룹 · status='ordered' → 'matched' 일괄 업데이트
  - authorize(2) · 매입확인 권한
- **GET /api/order-history** · `status IN ('ordered', 'matched')` · 확장 · 매칭 후에도 이력 유지
- **클라** · `OrderHistoryTab` · 헤더 우측
  - `status === "matched"` · `StatusPill emerald "매입확인 완료"` 배지
  - 그 외 · `[매입확인]` 버튼 · emerald bg · CheckCircle2 아이콘

### 테스트 절차
1. **매입 > 발주이력** 페이지
2. 발주 이력 헤더 · PDF 버튼 옆 · **[매입확인]** 초록 버튼
3. **[매입확인] 클릭** · confirm dialog:
   - `발주 #XXX · 공급사 · N종 · Q개 · 매입확인 완료 처리할까요?`
4. **확인** · 서버 로그 · `[ORDER MATCH] order_number=XXX · N건 · status='matched'`
5. **UI 즉시 업데이트** · 버튼 사라짐 · **"매입확인 완료" pill** (emerald)
6. 새로고침 · 상태 유지

### 회귀 체크
- 기존 발주 이력 · status=ordered · 정상 표시
- 발주 · status=matched · 이력에 표시됨 (사라짐 X)
- PDF 다운 · 정상

### DB 스키마
- `order_requests.status` · 기존 CHECK 없음 (text) · 'matched' 값 · 안전하게 추가 가능
- 마이그레이션 · 별도 필요 없음

---

## #88·#89 · 통계설정 · 탭메뉴로 변경 ✅
**커밋** · e266f97c

### 배경
`SeasonSettingsPage` · 2섹션 (계절 정의 + 재고·판매 필터) · 세로 스택 · 스크롤 필요.

### 해결
- **TabBar level=2** 프리미티브 · 2개 탭
- **계절 정의** · Snowflake 아이콘 · sky 컬러
- **재고·판매 필터** · Package 아이콘 · emerald 컬러
- `localStorage.'statsSettings.tab'` · 활성 탭 유지

### 테스트 절차
1. **경영 > 통계설정** 페이지 진입
2. 상단 · **TabBar** (계절 정의 · 재고·판매 필터)
3. **탭 클릭** · 콘텐츠 즉시 전환 · 스크롤 필요 없음
4. **페이지 재방문** · 마지막 활성 탭 유지 (localStorage)

### 예상 결과
- 프레임워크 통일 · 다른 페이지와 동일한 TabBar UX
- 스크롤 최소화 · 각 섹션 · 한 화면에 표시

---

## #111 · 공급사 저장 · 서버 로그 강화 ✅
**커밋** · fea5a149

### 배경
공급사 정보 저장 실패 시 · 클라이언트에 원인 표시 미흡 · 재현 어려움.

### 해결
- **fallback trigger 로그** · `[VENDOR PATCH · fallback trigger]` · error·keys
- **최종 실패 로그** · `[VENDOR PATCH FAILED]` · error·attempted_keys 전체
- 클라 에러 메시지 · `공급사 저장 실패: <원인>` · 명확

### 테스트 절차
1. 공급사 정보 저장 · 정상 케이스 · 로그 없음 (성공)
2. 저장 실패 시 · 서버 콘솔 · `[VENDOR PATCH · fallback trigger]` 로그 확인
3. 클라 · 명확한 에러 메시지 표시

---

## #112 · 공급사 발주이력 · info 뷰 하단 섹션 ✅
**커밋** · d3d7cea5

### 배경
공급사 상세 모달 · 정보 뷰 · 발주이력 별도 확인 어려움 (매입·결제만 표시).

### 해결
- 신규 · `VendorOrderHistorySection.tsx` · info 뷰 하단 · 컴팩트 섹션
- `/api/order-history?supplier=X&days=365` · 최근 1년 발주 이력
- 최근 5건 · [더 보기] · 전체 확장
- 각 발주 · #번호 · 발주일 · 상품수 · 금액 · 상태 (발주완료/매입확인)

### 테스트 절차
1. **공급사 관리** · 공급사 클릭 · 상세 모달
2. **정보 뷰 하단** · 발주이력 섹션
3. **최근 발주 5건** 표시 · 상태 배지 (sky 발주완료 / emerald 매입확인)
4. **더 보기** · 전체 (최대 1년) 확장/접기
5. **새로고침 (RefreshCw)** · 데이터 재조회

---

## #55·#53 · 발주필요 · 임박 이벤트 배너 ✅
**커밋** · bc097349

### 배경
`event_products`·`events` 백엔드 완료 (`/api/events/today`) · UI에서 활용 안 됨.

### 해결
- `SalesRecommendationPanel` · 우측 판매 추천 패널 · product 미선택 시 · 상단 이벤트 배너
- **GET /api/events/today** · 진행중 + 임박 (30일 이내) 이벤트 표시
- type별 색상 (봄·여름·가을·겨울·명절·수험생·custom)
- 진행중 · rose pulse pill · 임박 · amber D-N pill
- 매핑 상품수 (`product_count`) 표시

### 테스트 절차
1. **매입 > 발주필요** 페이지
2. 우측 판매 추천 패널 · 상품 미선택 상태
3. **상단** · 진행중·임박 이벤트 리스트
4. 각 이벤트 · type 배지 · 이름 · 기간 · 상태 pill
5. 이벤트 없는 시기 · 안내만 표시

### 사전 조건 (DB)
- `events` 테이블에 · recurring=true 계절 (spring/summer/fall/winter) 등록
- 또는 · start_date/end_date 있는 custom 이벤트

---

## #52·#54 · 이벤트 관리 UI ✅
**커밋** · 5434854d

### 배경
`events`·`event_products` 백엔드 완료 · 관리 UI 없음.

### 해결
- 신규 · `EventsSection.tsx` · 통계설정 3번째 탭
- 이벤트 CRUD (name·type·start·end·recurring)
- type 색상 · 봄=pink · 여름=sky · 가을=amber · 겨울=indigo · 명절=rose · 수험생=emerald · custom=violet
- 매년 반복 · emerald "매년" pill
- 삭제 confirm · event_products CASCADE 안내

### 테스트 절차
1. **경영 > 통계설정 > 이벤트 관리** 탭 (3번째)
2. **신규 이벤트** 버튼 · 폼 표시
3. 이름·유형·시작일·종료일·매년 반복 · 등록
4. 리스트 · 색상 배지 · 매년 pill 확인
5. **편집** · Pencil 아이콘 · 폼에 값 채워짐
6. **삭제** · Trash2 · confirm dialog · CASCADE 안내
7. **/api/events/today** · 오늘 활성 이벤트 · #55 발주필요 배너에 자동 반영

### 활용
- 등록한 이벤트 · **발주필요 우측 판매 추천** 상단 배너에 자동 표시 (#55)
- 매년 반복 (spring/summer 등) · 계절 자동 적용

### 사전 조건
- 관리자 (level ≥ 9) 만 편집 가능

---

## #83 · ProductCreateModal · 참조 상품 섹션 제거 ✅
**커밋** · 7dcbacbe

### 배경
"동일 분류 참조 상품" 섹션 · 분류 2자리 이상 자동 노출 · 화면 복잡도 증가 · 자동 반영으로 인한 값 오채움 위험.

### 해결
- refList·refLoading state 제거
- useEffect (products-by-category 조회) 제거
- applyRefProduct 함수 · RefProduct 타입 · Section UI 완전 삭제

### 테스트 절차
1. **상품정보** · 신규 등록 or 수정 모달 · 열기
2. 분류코드 · 2자리 이상 입력
3. **참조 상품 섹션 · 표시 X** (이전 · 자동 노출) · 확인
4. 폼 · 가격 · 기타 섹션까지 · 스크롤 없이 표시

---

## #108 · 사이드바 알림 스위치 (NotificationToggle) 제거 ✅
**커밋** · 810838f8

### 배경
사이드바 하단 · 알림 온오프 스위치 · 실사용 빈도 낮음 · UI 복잡도.

### 해결
- `src/components/NotificationToggle.tsx` · 파일 완전 삭제
- SideNav L546 · AppNavHeader L379 · 제거
- **NotificationBell (알림 목록) 은 유지**

### 테스트 절차
1. **사이드바 하단** · 알림 스위치 없음 (NotificationBell 벨 아이콘만)
2. **PC 헤더** · 알림 스위치 없음
3. 브라우저 푸시 알림 · 필요 시 · 브라우저 사이트 설정에서 관리

---

## #82 · 상품정보 모달 · 배치구역 2분리 ✅
**커밋** · f9acf35b

### 배경
배치구역 · md:col-span-2 · ZoneCategoryPicker 하나만 (진열구역). 상세구역 표시·편집 없음.

### 해결
- 배치구역 · 2컬럼 나란히
  - **좌 · 진열구역** · ZoneCategoryPicker (form.location)
  - **우 · 상세구역** · shelf_positions JSONB 배지 (읽기 전용)
- 편집은 · 실재고 입력·스캔 페이지 (기존 대원칙 · products.shelf_positions X · inventory_checks 통합)

### 테스트 절차
1. **상품정보** · 상품 수정 모달 · 열기
2. **배치구역** · 진열구역 (좌) + 상세구역 (우) 나란히
3. **상세구역 · shelf_positions** 있는 상품 · 배지 표시 (창고/매장별)
4. 신규 등록 or 미등록 상품 · "실재고 입력에서 저장" 안내
5. 편집 · **실재고 입력 · 스캔** 페이지에서 · 저장 (기존 flow 유지)

---

## #72·#73 · 재고자산·판매액 SSOT 감사 ✅
**커밋** · 5ae4339a (Agent 조사 task a50f9b66 기반)

### 배경
확정된 대원칙:
- **재고자산 = 매입액 − 판매원가** (COGS)
- **실제잔고 = 매입액 − 결제액**
- **판매액 = SUM(sale_qty × sale_price)** · stock_history.total_amount 원본 X

### 감사 결과 (Agent · 30+ 파일)

**✅ SSOT 준수 (6건):**
- `balance.ts` · 재고자산·잔고 공식 확정 (`stock_asset = purchase - cogs` · `balance = purchase - payment`)
- `topSales.ts` · `salesTrend.ts` supplier/product · 판매액 파생 계산
- `DashboardCharts.tsx` · `VendorListEditor.tsx` · `PaymentInputPage.tsx` · API 응답 기반

**⚠️ FIX 완료 (2건):**
1. **HIGH · `server/routes/purchase/vat.ts:363-390`**
   - `/api/vat/monthly-summary` 매출 계산
   - 이전 · `stock_history.total_amount` 직접 합산 (원본 · 정확도 저하 위험)
   - fix · `sale_qty × sale_price` 파생 계산
2. **MEDIUM · `server/routes/stock/stockManage/salesTrend.ts:262-303`**
   - `/api/sales-trend/overview` 전체 판매액
   - 이전 · `total_amount` 직접 합산
   - fix · `sale_qty × sale_price` 파생 (supplier·product endpoint 와 동일)

### 테스트 절차
1. **부가세 준비** 페이지 · 매월 매출 데이터 정상 표시
2. **판매대시보드** · 전체 overview · 매출액 정확 (sale_price 변동 반영)
3. **광동제약·테스트 공급사** · 재고자산·잔고 SSOT 값 확인
4. 서버 재시작 후 · 캐시 없음 · 즉시 반영

### 회귀 체크
- 기존 supplier/product endpoint · 파생 계산 유지
- balance.ts SSOT · 이미 통일 · 변경 없음
- 각 페이지 · TS 검증 통과

---

## #118 · 결제 대시보드 페이지 신규 ✅
**커밋** · d706ce39

### 배경
결제 메뉴 · 6개 서브탭 · 첫 진입 시 · 종합 KPI 없음.

### 해결
- 신규 · `PaymentDashboardPage.tsx`
- 상단 KPI 4개 · 총 매입·총 결제·총 잔고·총 재고자산
- 상태 카운트 · 미지급·선지급·완납
- 미지급 Top 10 (sky) · 선지급 Top 10 (rose)
- SSOT · `/api/supplier-balances-map`

### 테스트 절차
1. **매입 > 결제** 메뉴 진입
2. 첫 탭 · **대시보드** (LayoutDashboard 아이콘)
3. KPI 카드 · 총 매입/결제/잔고/재고자산 확인
4. 미지급/선지급 공급사 Top 10 리스트 표시
5. **결제입력** 탭으로 이동 · 개별 공급사 결제 진행

---

## #101 · 차용계약 PDF 프리뷰·다운로드 ✅
**커밋** · cae5d072

### 배경
BorrowingPage · PDF 저장 기능 없음. 계약서 · 인쇄·이메일 어려움.

### 해결
- 신규 · `BorrowingPdfPreview.tsx` · A4 세로 · 오프스크린 렌더 컴포넌트
  - 대여자 (甲) · 차용자 (乙) · 상품 내역 · 반환·정산 조건 · 특약 · 일반 조항 · 서명란
  - lend/borrow 방향에 따라 · 자동 매핑
- `BorrowingDetailPanel` · `handleDownloadPdf` · html2canvas + jsPDF
- 파일명 · `차용계약서_YYYYMMDD_상품명_계약번호.pdf`
- 근로계약서 usePdfActions 패턴 재사용

### 테스트 절차
1. **매입 > 차용입력** · 계약 선택 · 우측 상세 패널
2. 하단 액션 · **[PDF]** 버튼 (FileDown 아이콘)
3. 클릭 · PDF 다운로드 · 파일명 확인
4. PDF 내용 · 대여자·차용자·상품·기간·서명란 완비
5. lend/borrow 방향 다른 계약 · 甲·乙 매핑 확인

---

## #73 · supplierPurchases 판매액 SSOT 재감사 fix ✅
**커밋** · cae5d072 (Agent 심층 감사 · task af64fe66 기반)

### 배경
사용자 재강조 · **판매액 = 판매수량 × 판매가**. Agent 심층 감사 결과 · 1건 · `supplierPurchases.ts:105` · `total_amount` 원본 직접 사용.

### 해결
- 이전 · `cur.totalStockAmount += stock_history.total_amount` (xlsx 원본 · 정확도 저하)
- fix · `products.sale_price` 사전 map · `cur.totalStockAmount += sale_qty × sale_price`
- SSOT 준수 · 대원칙 100% 커버 (7개 endpoint · 정상 · 이번 1건 fix 완료)

### 감사 최종 결과
- **SSOT 준수 · 100%** (topSales·salesTrend·vat·snapshotSummary·supplier-balances·supplierPurchases · 모두 파생 계산)
- 잘못된 직접 사용 · 0건

---

## 다음 세션 추천 우선순위

1. 사용자 · 위 테스트 리스트 확인 · 회귀 있으면 즉시 fix
2. #82·#77·#105 · 사용자 정보 확인 후 진행
3. #78 · SplitPanel 5:5 통일 · 시간 큼
4. #93 · 관리자 대시보드 · 신규 페이지
5. #101 · 차용계약 PDF 프리뷰 · 큰 태스크

---

# 📚 이전 완료 태스크 · 재확인용 (2026-09-14 정리)

> TASKS.md v14 PENDING 정리 시 · 커밋 대조로 완료 확인 · 회귀 재점검용
> 각 항목 · 이미 커밋 완료 · 사용자 시각 재확인 권장

## #20 · 상품 모달 · 창고·매장 수평 배치 ✅
**커밋** · `bb3c2647` (#133 신규 등록·수정 모달 · 상세구역)

### 확인 절차
1. **상품정보** > 상품 선택 > [신규 등록] 또는 [수정] 버튼
2. `ProductCreateModal` · 배치구역 섹션 · **진열구역 (좌) + 상세구역 (우) 수평 grid**
3. ProductCreateModal.tsx L505·509·523·529 · 2-column grid layout 확인

---

## #36 · 유통기한 임박 리스트 · SSOT ✅
**커밋** · `d4a2d823` + `a698b4fe` (후속)

### 확인 절차
1. **매입 > 유통기한 임박** 페이지
2. 실재고 검수 시 저장된 유통기한 (`inventory_checks.expiry_date`) SSOT 기준 리스트 표시
3. `products.expiry_date` (임포트 위험) · 사용 중단 확인

---

## #44 · 매장구역도 저장 오류 fix ✅
**커밋** · `f64ffbd7`

### 확인 절차
1. **매장관리 > 매장구역도** 진입
2. 구역 편집 · 저장
3. zones POST 500 (ON CONFLICT 중복) · zone-groups PUT 400 · 재발 X 확인

---

## #47 · 결제-차용 · 약국 사업장 정보 자동 채움 ✅
**커밋** · `9f4f80c0`·`935a5957`·`b58a6295`

### 확인 절차
1. **매입 > 결제 > 차용계약** 진입
2. 약국 (자기) 선택 · 시스템설정 회사(사업장) 정보 · 자동 채움 확인
3. 회사명·주소 등 · 수정 불가 (readonly) 확인 · `useCompanyInfo` 연동
4. BorrowingPage.tsx L103 · BorrowingDetailPanel.tsx L97 · 훅 사용 확인

---

## #48 · 상품검색 · 최근 검색어 3개 표시 ✅
**커밋** · `a0025044`

### 확인 절차
1. **상품 검색창** (모든 페이지 · ProductSearchInput 사용처) 진입
2. focus + empty 시 · "최근 검색어" 섹션 · 최대 3개 노출
3. 검색어 선택 시 · onSelect 실행 + 최근 검색어 저장
4. ProductSearchInput.tsx L22·60·127·189 로직 확인

---

## #50 · 승인요청 페이지 · UI 통일 ✅
**커밋** · `84078012`·`afe7f6f5`·`0b29dedd`·`7dec1c36`

### 확인 절차
1. **승인요청** 페이지 진입
2. 탭 스타일 · **매입이력 서브탭** 과 완전 동일 · TabBar level=3
3. 5개 탭 (진열·점심·연차·거래처·사직서) · gap-4 · main 안 배치 확인
4. DocumentWriterPage · 근로계약서·사직서·설정 탭도 TabBar level=3 통일

---

## #64 · 상품정보 편집 모달 · 공급사 수정 · PATCH 연동 ✅
**커밋** · `33628f2f`·`49c93f99`·`89fd973c`

### 확인 절차
1. **상품정보** > 상품 선택 > [수정] 버튼 → `ProductCreateModal` edit mode 열림
2. 공급사 · vendors 자동완성 드롭다운 · 유효성 자동 반영
3. onMouseDown + preventDefault · outside-click 이전 값 세팅 · 정상 동작
4. initialProduct 편집 시 · 입력값·드롭다운 선택값 · 리셋 X

---

## #68 · 공급사별 결제내역 · 검색창 통일 ✅
**커밋** · `033890ed`

### 확인 절차
1. **매입 > 결제 > 공급사별 결제내역** 진입
2. 검색창 · SearchBar 프리미티브 스타일 · 통일 확인
3. 프리미티브 기반 · 검색·클리어·placeholder 표준 동작

---

## #70 · 결제 관련 페이지 · Spinner 통일 ✅
**커밋** · `a698b4fe` + 이후 각 페이지 개별 반영

### 확인 절차
5개 페이지 · 로딩 시 Spinner 표시 확인:
- CardRegisterPage.tsx L168 · "로딩 중..."
- PaymentInputPage.tsx L547 · "공급사 데이터 로딩 중..."
- BorrowingPage.tsx L435 · "차용 데이터 로딩 중..."
- CardHistoryPage.tsx L103 · "카드별 결제 현황 로딩 중..."
- PaymentDashboardPage.tsx L205·237 · "로딩..."

---

# 🎯 잔여 PENDING · v14 (2026-09-14 정리 후)

- **#39** · 발주필요 리스트 페이지 전수조사 · 🟡 P2 · **스펙 확인 필요** (구체 이슈 명시 X)
- **#56** · 매장 구역 X 버튼 권한 · 🟢 P4 LATER (맨 뒤 우선순위)

---

## [24] 재고자산 공식 통일 · 매입액−판매원가 (2026-09-14)
**커밋** · `1104bc7a`

### 확인 절차
1. **매입 > 결제 > 공급사별 결제내역** 진입
2. 공급사 선택 · 우측 상단 KPI 카드 확인
3. **총 재고자산** 카드 · subtitle "매입액 − 판매원가" 표시
4. 값 · `SUM(purchase_cost) − SUM(cogs_amount)` (기간 필터 반영)
5. 아래 월별 표 · "재고자산 (매입액−판매원가)" 라벨 · 힌트 표시
6. 월별 표 합계 열 · KPI 값과 동일 여부 확인 (통일)

### 기대값
- KPI · 월별 표 · 값 정확히 동일 · 대원칙 부합
- 이전 `SUM(current_stock × purchase_price)` (ERP 스냅샷) 값과 다를 수 있음 · 정상 (원칙 통일)

---

## [25] 결제 대시보드 개선 · 기본 1개월 + 스크롤 + 카드 대시보드 + spinner (2026-09-14)
**커밋** · `404394cc`

### 확인 절차
1. **매입 > 결제** 첫 진입 · PaymentDashboardPage
2. 기간 필터 · **1개월 기본 선택** 확인 (이전 전체)
3. 미지급/선지급 Top 10 · **max-h 220px 스크롤** · 5개 정도 보이고 나머지 스크롤
4. **카드별 결제 · 한도 · 다음달 예정** 섹션 신규 (카드 등록되어 있으면)
   - 이번달·다음달 결제액·결제일 · 한도 대비 사용율 progress bar
   - sky<60% · amber<90% · rose≥90% 색상 톤
5. 기간 변경 시 · 이전 데이터 사라지고 · Spinner 표시 (잔상 방지)
6. 차용 이력 있으면 · 아래 표시 (기존)

### 기대값
- 초기 로딩 · 최근 30일 데이터 정확 표시
- 카드 대시보드 · 카드사별 상세 (issuer · alias · last4 · 이번달 · 다음달 · 잔여한도)
- 스크롤 · Top 10 이 카드 전체 높이를 뚫지 않음

---

## [26] 발주필요 우측 · 유통기한 임박 상품 섹션 신규 (2026-09-14)
**커밋** · `b766c827`

### 확인 절차
1. **매입 > 발주 > 발주필요** 진입 · 상품 미선택 상태
2. 우측 판넬 (SalesRecommendationPanel) 확인
3. 계절 배너 아래 · 이벤트 아래 · **유통기한 임박** 섹션 표시
4. 조건 · D-60 이내 · 판매중지·숨김 제외 · 최대 10건
5. 정렬 · D-day 짧은 순 (가장 임박 상단)
6. 배지 · D+xx (만료) rose · D-14 amber · 그 외 zinc
7. [발주] 버튼 · 클릭 시 · 발주 요청 리스트 추가 · 요청됨 배지로 변경

### 기대값
- 유통기한 임박 상품이 발주필요 페이지에서 바로 보이고 · 즉시 발주 요청 가능
- 이전 · 별도 ExpiryImminentTab 만 있어서 · 발주 flow 분리

---

## [27] 발주필요 우측 · 이벤트 추가 UI · 날짜 필터 (2026-09-14)
**커밋** · `00fcfd11`

### 확인 절차
1. **매입 > 발주 > 발주필요** 진입 · 상품 미선택 상태
2. 우측 판넬 · 진행중 이벤트 리스트 아래 · **[+ 이벤트 추가]** 버튼 확인
3. 오늘 이벤트 없으면 · 버튼 단독 표시
4. 버튼 클릭 → 이벤트 선택 패널 open (GET /api/events 로드)
5. **날짜 필터** input · 특정 날짜 선택 → 해당 날짜 걸치는 이벤트만 필터
6. 각 이벤트 · [추가] 버튼 · 클릭 시 상품 로드 → 위 리스트 병합 (accordion 확장 가능)
7. 원본 오늘 이벤트 · [진행중] 배지 · 제거 불가
8. 수동 추가된 이벤트 · [× 제거] 버튼 · 클릭 시 리스트에서 제거
9. [×] (닫기) 버튼 · 선택 패널 접힘

### 기대값
- 오늘 이벤트 없어도 · 특정 이벤트 (겨울철·명절 등) 미리 준비 발주 가능
- 날짜 기준 향후 이벤트 미리보기 · 발주 사전 준비
- 원본과 수동 추가 명확히 구분 (진행중 배지 vs 제거 버튼)

---

## [33] T-MENU-BOTTOMNAV · BottomNav 하단 4탭 · perms.hidden 필터 (2026-09-15)
**커밋** · (이 커밋)

### 배경
- 이전 · BottomNav 하단 4탭 (landing·schedule·requests·board) · `usePageVisibility` 만 반영
- 사이드바 · 이미 `filterGroupsForSession` 로 perms.hidden 반영
- 부조화 · 사이드바에서 숨김 처리한 페이지가 · 모바일 하단 탭에는 여전히 노출

### Fix
- BottomNav.tsx · `permAllowed(pageKey)` 헬퍼 신설
- 하단 4탭 filter · `mobileVisible(t.key) && permAllowed(t.key)` (두 조건 AND)
- admin lockout 방지 · 하단 4탭 (landing·schedule·requests·board) 에 해당 없음 (안전)

### 확인 절차
1. **관리자 로그인** · 설정 > 권한 조정 > 페이지 표시
2. 예 · "board" (게시판) · **hidden 체크**
3. 저장
4. **모바일 (Chrome DevTools 반응형)** · 하단 탭 · 게시판 사라짐 확인
5. 사이드바 (PC) · 이미 사라짐 (이전과 동일)
6. hidden 해제 · 하단 탭 다시 나타남 확인

### 기대값
- 하단 4탭 · perms.hidden 즉시 반영 (사이드바와 정합)
- usePageVisibility (모바일 가시성) 도 · 병행 유효 · 두 조건 AND
- 이전 · admin 이 hidden 처리해도 하단 탭 안 사라짐 (버그) · 이후 · 사이드바와 동일하게 사라짐

### 회귀 확인
- 사이드바 · 이전과 동일 동작
- 하단 "더보기" 시트 · 이미 filterGroupsForSession 사용 · 이전과 동일
- BottomNav tests · 14/14 통과

### 관련 원칙
- 대원칙 · 사이드바 ↔ 하단 탭 정합 · single source (sideNavGroups)
- admin lockout 방지 · permissions/business-manage/account (해당 안 됨)

---

## [32] DB 정합성 · DELETE /api/products · 회계 이력 차단 + orphan cleanup (2026-09-15)
**커밋** · `8a987279`

### 배경
- DB 정합성 절대 유지 대원칙 (2026-09-15 등재)
- 이전 · DELETE · products 만 삭제 · 참조 테이블 orphan 방치
- 실무 표준 (Odoo·SAP·NetSuite) · 이력 있으면 삭제 X · Soft delete 안내

### 서버 변경
- **GET /api/products/:code/references** (신규) · 참조 count · UI pre-check 용
- **DELETE /api/products/:code** · 확장
  - 회계 이력 (purchase_details·stock_history·product_arrivals·loss_tracking) 참조 시 · 400 PRODUCT_HAS_HISTORY
  - 비-critical 참조 (inventory_checks·order_requests·order_dispatches·ocr_confirmed_items·request_display) · 서버 사이드 명시 삭제

### 시나리오 1 · 참조 없는 상품 (신규 등록 · 이력 없음)
1. **매장 > 매입 > 상품정보** 진입
2. 신규 등록한 상품 (이력 없음) · [삭제] 클릭
3. Confirm · "이 상품과 참조 데이터를 삭제합니다"
4. 확인 · 삭제 완료
5. Supabase · products·inventory_checks·기타 · 모두 사라짐

### 시나리오 2 · 회계 이력 있는 상품 (매입·판매·입고 이력)
1. 매입 이력 있는 상품 (예: 기존 상품) · [삭제] 클릭
2. **삭제 차단** · toast · "삭제 불가 · 매입 이력 N건 · 판매 이력 M건 · 이력 보존 필요 · [판매중지] or [숨김] 처리를 사용해주세요"
3. Confirm dialog · 열리지 않음 (pre-check 통과 X)
4. Supabase · products·이력 · 모두 유지 (정합성 보존)

### 시나리오 3 · 비-critical 참조만 있는 상품
1. 상품 · inventory_checks·order_requests 만 있고 · 매입 이력 없음
2. [삭제] 클릭 · Confirm · "함께 정리됨: 실재고 1건 · 발주 요청 2건"
3. 확인 · 삭제 완료 · orphan 정리 · 서버 로그 확인

### 서버 로그 확인
- `[products DELETE] inventory_checks orphan 정리 · N건 · CODE`
- `[products DELETE] 삭제 완료 · CODE · cleanup={...}`
- 차단 시 · 400 응답 · error.code=PRODUCT_HAS_HISTORY

### 기대값
- 회계·감사 이력 · 100% 보존 (매입·판매·입고·손실)
- Orphan row · 자동 정리 (재고·발주 등)
- 사용자 실수 방어 · Soft delete (hidden=true) 대안 명시 안내
- KPI 오염 방지 (매입액·판매액·재고자산·잔고 정확성)

### 회귀 확인
- 기존 삭제 flow · 참조 없는 상품 · 이전과 동일 (성공)
- 참조 있는 상품 · 이전에는 orphan 방치 · 이후 · 차단 or 정리
- ProductInfoPage tests · 21/21 통과

---

## [31] #61 B안 · 지정위치 표시 정합성 + 상품↔실재고 자동 연동 (2026-09-15)
**커밋** · `a75958da`

### 배경
- 사용자 원칙 · 지정 위치 = 상품등록 시 진열구역 (`products.location`)
- 진열위치 → 창고1/2/매장1 자동 결정
- **상품테이블 ↔ 실재고테이블 자동 연동 필수**

### 버그 fix (Step 1 · 표시)
- 이전 · StockRowCard "지정 10" · `products.spec` (규격 컬럼) 잘못 사용 · 인덱스 오프셋 mismatch
- 이후 · "지정 XX" 표시 완전 제거 · 진열구역+상세구역 두 소스만 유지

### Gap fix (Step 3 · 정합성 자동 동기)

#### 시나리오 1 · 상품 신규 등록
1. **매장 > 매입 > 상품정보** 진입 · **[+ 상품 등록]**
2. 새 상품 입력 · 진열위치 (예: "매장 3-1" or "24" · 창고1) 지정 · 저장
3. 서버 로그 · `[products POST] inventory_checks 자동 생성 · CODE · shelf_positions={...}`
4. **실재고 페이지 (ScanPage)** · 해당 상품 검색 · 자동 배정된 슬롯 표시
   - 매장 위치 → 매장1 슬롯 활성
   - "24" (창고1 코드) → 창고1 슬롯 활성
   - "33" 등 → 창고2 슬롯 활성
5. Supabase · `inventory_checks` 테이블 · 신규 row · shelf_positions JSONB 확인

#### 시나리오 2 · 진열위치 변경
1. 기존 상품 · [수정] · **진열위치 변경** (예: "매장 3-1" → "24" · 창고1로 이동)
2. 서버 로그 · `[products PATCH] inventory_checks shelf_positions 재배정 · CODE · {...}`
3. 실재고 페이지 · 슬롯 자동 재배정 확인
4. 기존 상세위치 (3자리 · 예 "332") · **보존** 확인 (사라지지 않음)
5. 새 슬롯 · null · 사용자 편집 대기 상태

#### 시나리오 3 · inventory_checks 미존재 상품 · location 편집
1. 기존 · products 만 있고 inventory_checks 없는 상품 (2026-09-15 이전 등록분)
2. 진열위치 편집
3. 서버 로그 · `[products PATCH] inventory_checks 신규 생성 (location 변경 계기) · CODE`
4. 정합성 자동 복구 확인

### 기대값
- 상품 등록 즉시 · 실재고 페이지에 자동 반영 (별도 저장 X)
- 진열위치 변경 · 슬롯 자동 재배정 · 상세위치 보존
- ERP `spec` 오염 표시 완전 제거
- best-effort · inventory_checks 실패 시에도 상품 등록·수정 자체는 성공

### 회귀 확인
- 매장 슬롯 · 진열구역 편집 (ZoneInline) · 이전과 동일 동작
- 창고 슬롯 · warehouse zone 편집 · 이전과 동일
- 상세구역 shelf_positions · 이전과 동일 (별도 표시 · 편집 유지)
- ScanPage tests · 52/52 통과

---

## [30] T-SP-BULK · POST bulk shelf_positions 병합 지원 (2026-09-15)
**커밋** · `b86a4b20`

### 확인 절차 (서버 재시작 필요)
1. **실재고입력 (ScanPage)** 진입 · 여러 상품 스캔
2. 각 행 · 상세위치 3자리 입력 (예 "332" · 층·칸·순서) · 창고1/2·매장1/2/3 별
3. **[전체저장]** 클릭 · bulk POST · shelf_positions 병합 저장
4. Supabase · `inventory_checks.shelf_positions` JSONB · 병합 확인 (기존 값 유지 + 신규 추가)

### 시나리오 확인
- ✅ 정상 병합 · 200 OK · `{ ok: true, saved: N, failed: 0, errors: [] }`
- ✅ 매장 필수 위반 · store1 빈값 저장 · 해당 item · errors 배열 · "매장 위치(store1)는 상세위치가 필수..." · 나머지 정상
- ✅ 3자리 아닌 값 · "3-2" 저장 · errors · "상세위치(store1=3-2)는 3자리 (층·칸·순서) 여야 합니다"
- ✅ (display_location, key, value) 중복 · errors · "이 위치는 이미 사용 중 · 1A-332 (store1) · 기존 상품 · ..."
- ✅ BC · shelf_positions 없이 저장 · 이전과 동일 동작 (downgraded=false · errors=[])

### 기대값
- 단건/일괄 POST · 공용 helper (mergeShelfPositions·checkShelfPositionConflicts) · SSOT
- Cache-Control · no-store · 재고 대원칙 준수
- 회귀 위험 · low · 기존 ScanPage bulk (52 tests) 통과
- 신규 22 tests · 통과

### 관련 원칙
- 대원칙 · DB 정합성 · UNIQUE 이중 방어 (bulk pre-check + 기존 shelf-conflict endpoint)
- 대원칙 · 공통 기능 = 단일 helper · 단건/일괄 통일
- 대원칙 · 매장 필수 · store1/store2/store3 (required_detail=true)

---

## [29] #39 Phase A+B · 요청 진행중 접힘 카드 + 지연 tier 뱃지 (2026-09-15)
**커밋** · `2277a8a2`

### 확인 절차
1. **매장 > 매입 > 발주 > 발주필요** 진입
2. 상단 · **[요청 진행중 N건]** 접힘 카드 확인 (요청됨 상품 있을 때만)
3. 카드 헤더 · 사키 배지 (N건) · 지연 있으면 rose "지연 M" 배지 함께
4. 카드 클릭 (헤더) · 펼침 · 상위 5건 preview
   - 각 행 · 상품명 · 공급사 · 수량 · N일전 뱃지 (색상 tier)
5. 카드 우측 [발주요청 →] 버튼 · 클릭 시 · 발주요청 탭 자동 전환
6. 발주필요 리스트 · 요청됨 상품 · 리스트에서 사라짐 (이동 · 업계 표준)
7. 검색 or 조건적용 OFF · allProductsMap · 요청됨 상품 노출 · ✓ 요청됨 emerald · N일전 tier 뱃지 확인

### 지연 tier 색상
- 오늘·1일 전·2일 전 · **amber** (정상 진행)
- 3일 전·4일 전·5일 전 · **orange** (도착 임박)
- 6일 전+ · **rose** · "⚠ N일 전 (지연)" (관리자 주의)

### 기대값
- 발주필요 = 요청 안 한 것만 · 명확한 액션 리스트 (업계 100% 표준)
- 상단 CollapseCard · "이미 요청?" 즉시 확인 · 중복 방지
- 지연 3일+ 상품 · rose 뱃지 · 시각 강조
- 재고 시각 노이즈 최소 · 필요 시 펼침 (defaultOpen=false)

### 회귀 없음
- 기존 발주필요 flow 100% 유지
- 검색·조건적용 OFF 시 요청됨 노출 · 기존 동작
- OrderNeedTable · N일전 뱃지 · 색상만 tier 강화
- OrderManagePage tests 23/23 통과

---

## [28] 탭바 · 전체폭 정렬 fix · 초광폭 모니터 밀림 해소 (2026-09-15)
**커밋** · (예정)

### 확인 절차
1. 넓은 모니터 (뷰포트 폭 ≥ 1400px · 특히 1920px·2560px 이상) 접속
2. **매장 > 매입 > 발주** 진입 · 상단 탭바 (발주·매입·결제/세금·통계) 확인
3. 이너 서브탭 (발주필요·발주요청·발주이력) 확인
4. 페이지 콘텐츠 (표·리스트) 좌측 · 탭 [발주] 좌측 · **동일 x 좌표** 여부 확인
5. 이전 · 탭이 오른쪽으로 밀려 · 페이지 콘텐츠 좌측과 어긋남 (뷰포트 - 1360px 만큼 벌어짐)
6. 이후 · 탭도 페이지와 동일하게 왼쪽부터 · 좌우 여백 통일
7. **작은 뷰포트** (1280px·1366px) · 회귀 확인 · 탭 정상 표시 · 랩핑 확인
8. **문서형 페이지** (승인요청·문서작성) · maxWidth={1400} 명시 · 이전과 동일 (개별 정책 존중)

### 기대값
- 뷰포트 ≥ 1400px · 탭바 왼쪽 x = 페이지 콘텐츠 왼쪽 x (16px · px-4 padding)
- 하얀 띠 (탭바 외부 배경·border) · 전체폭 유지 (변화 없음)
- 명시 maxWidth 전달 페이지 (ApprovalCenterPage · DocumentWriterPage) · 이전과 동일
- StaffDetailPanel · DiffTab (`maxWidth="100%"`) · 이전과 동일
- 전체 15 TabBar 테스트 통과

### 관련 원칙
- 대원칙 · 반응형 초광폭 활용 · 콘텐츠 극대화 (Attio/Linear 2026)
- 대원칙 · 회귀 X · 하얀 띠·문서형 페이지 명시 전달 유지

---

## 진행 중 태스크 (완료 시 추가)
