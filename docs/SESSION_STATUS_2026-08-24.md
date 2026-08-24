# SESSION STATUS · 2026-08-24 (다음 세션 인수인계)

> 사용자 지시로 저장 · 다음 세션 재개 시 최우선 참고

## 🎯 이번 세션 핵심 지시 요약 (사용자)

### UI 대원칙 (반복 강조)
- **최신 기술·트렌드·인기 · 깔끔·고급·세련·멋짐·초고해상도·부드러움**
- **UI 목업 파일 기준** · `docs/UI_MOCKUP_2026-08-21.html`
- **폰트 +2 기본** · 40대+ 가독성
- **파스텔·이모지·촌스러움 · 금지** · Linear·Vercel·Notion·Attio 2026 톤
- **딥네이비 accent** · brand-deep · brand-tint

### 회귀 방지 (최상위)
- **로컬 커밋만** · **리모트 push 절대 금지** (`feedback_remote_push_prohibited_2026-08-24.md`)
- 사용자 명시적 "푸시" 언급 시에만 예외
- 회귀 절대 X · 매 편집 TS + tests 검증

### 태스크 처리
- **오래된 순 우선** · 최신 요청 자율 진입 금지
- **자율진행 지시** 있으면 · 안전·짧은 태스크 위주 순차 진행

---

## 🎯 v3 리스트 UI · 확정·확산 (2026-08-24 세션 후반)

### 원칙 · 리스트 = 무조건 표 형식 (사용자 지시)
- `<table>` `<thead>` `<tbody>` 정식 · 카드 나열 지양
- 헤더 · 컬럼명 · 정렬 화살표 (⇅) 필수
- **말줄임표 절대 금지** · truncate·line-clamp·ellipsis X · 줄바꿈 (whitespace-normal break-words)
- 컬럼 정렬 · text-right (숫자·tabular-nums) · text-left (문자) · text-center (액션)

### v3 스펙 · Attio/Linear/Notion 2026
- 상단 gradient accent · 3px · `from-brand-deep via-sky-500 to-brand-deep`
- thead · sticky · bg zinc-100/70 · 13/14px uppercase (반응형) · sort arrows
- 그룹 row (공급사) · sticky · gradient bg (brand-tint/70 → 40) · **접기·펼치기** · caret 회전
- 공급사명 · text-sky-800 · hover brand-deep · underline (링크 hint)
- 데이터 row · white · hover zinc-50/60 · selected sky-50/60
- 주문수량 컬럼 · sky-50/60 tint bg · sky border input · **편집 강조**
- 발주금액 컬럼 · brand-tint/50 tint bg · brand-deep bold · **결과 강조**
- 부족 · text-rose-600 만 (bg X)
- 폰트 반응형 · 좁으면 14/13 · sm+ 15/14

### 실적용 완료 · 8 페이지
| 파일 | 커밋 |
|---|---|
| OrderRequestTab · 발주요청 | `52e67876`·`775a5ec1`·`00ce315f`·`05567238`·`cbb58cb9`·`abb9ddd2` |
| OrderNeedTab · 발주필요 | `b16d90a4`·`abb9ddd2` |
| SupplierTab · 매입이력 embedded thead | `008a22d4` |
| VendorManageSplit · 공급사관리 thead | `e6068dbf` |
| StaffListPanel · 직원 목록 thead | `a866d3b5` |
| PurchaseHistoryTab.panels ByProduct · topAccent | `b8b34bbd` |
| PaymentInfoTab · topAccent | `b8b34bbd` |
| ProductInfoPage · topAccent | `b8b34bbd` |

### SplitListPanel 프리미티브 확장
- **topAccent prop 신설** (기본 false · true 시 상단 gradient)
- 6 소비처 자동 활성 (DRY)

---

## 🔥 이번 세션 완료 (85+ commits · 로컬만)

### 🎨 UI 프리미엄 재디자인 (사용자 지시)
| 커밋 | 요약 |
|---|---|
| `4111690e` | 반품 오른쪽 · 탭메뉴 불일치 fix · 외부 3탭 제거 · ProductDetailRightPanel 5탭만 |
| `fc3869a1` | SupplierTab · 세로 accent bar 제거 · **세션 상단 가로 gradient accent** (랜딩 톤) |
| `8a097107` | SupplierTab · 분류별 세로 컬러 accent (사용자: "별로" · 제거됨) |
| `898e75de` | LandingPage 입고알림 재디자인 · 상단 gradient · 말머리표 · 상세 모달 |
| `71537c5a` | 랜딩 입고알림 사용자 승인 톤 복원 (원복 반영) |
| `599926a8` | ListPanel/ListRow 프리미티브 신설 (`src/components/common/ListRow.tsx`) |
| `405507fb` | ListRow v2 · framework 확장 · topAccent·pill·description·subtitle |
| `f61bb407` | 매입이력·발주필요·발주요청 · 카테고리 그룹 헤더 tr 전체 제거 |
| `d2b28305` | SupplierTab embedded · Top N 세션 제거 · 검색 헤더 인라인 |
| `f2ec7e85`·`120e330c`·`78e040ce`·`7512219d`·`5420a188` | 서브헤더+body 색상 bg 제거 · zinc 통일 |
| `cdb6d00c` | 발주 버튼 (일괄 발주요청·일괄 발주·발주 발송) · gradient·shadow·ring·scale |

### ✨ Framework 확장
| 커밋 | 요약 |
|---|---|
| `f54c927a`·`9a065899` | SplitListPanel 검색창 상단 필수 · **대원칙 등록** |
| `c48015ba` | ListRow · common barrel export |
| `be21b2c1` | SplitLeftHeader test · SplitListPanel searchInHeader prop |

### 🐛 버그 fix
| 커밋 | 요약 |
|---|---|
| `4bf256b7` | 상품 발주내역 탭 · lookupProduct 동기함수 · await/.catch 오용 |
| `94f48021`·`3b888d49` | ProductDetailPanel 월평균 판매 계산 회귀 · 6개월 기준 |
| `1ca5f399` | 급상승 상품 클릭 → ProductDetailModal 오픈 wiring |

### 📊 데이터·SQL
- SQL 마이그레이션 3건 · `sql/migrations/2026-08-24_*.sql`
- `2026-08-24_vendor_order_methods.sql` · **사용자 실행 완료** · vendors.order_method 등 5 컬럼 + 19개 데이터
- `2026-08-24_reservations_vendor_id.sql` · 대기 · reservations.vendor_id 컬럼
- VendorInfoHeader · 5 xlsx 필드 (order_method·region·invoice_method·order_status) 표시

### 🛠 사용자 요청 UX
| 커밋 | 요약 |
|---|---|
| `8baaff80` | 결제입력 우측 · **결제등록·최근결제 탭 처리** (나란히 X) |
| `41bbfca4` | ProductCreateModal · 바코드/적정재고 제거 · 공급사·구역 autocomplete |

---

## 🚨 열린 이슈 (다음 세션 최우선)

### 1️⃣ 상품등록 404 (사용자 제보 · 미해결)
- 증상 · 상품 등록 버튼 클릭 → 404
- 파일 · `src/components/ProductInfoPage/ProductCreateModal.tsx` · `41bbfca4` 이후 발생 추정
- 검증 필요 · **개발 서버 재시작 후 재현** · Network 탭 URL 확인
- 후보 원인 · A) 서버 재시작 필요 · B) Vite proxy · C) 브라우저 캐시 · D) Render 프록시

### 2️⃣ 매입이력 공급사별 · 검색 안 됨 (테스트 vendor)
- 증상 · 매입이력 embedded SupplierTab 검색창 · "테스트" 공급사 검색 결과 0
- 원인 · 서버 `/api/stock-manage/supplier-purchases` 는 **매입 이력 있는 vendor 만** 반환 · 신규 vendor 없음
- 옵션 A (권장 · 사용자 결정 대기) · 클라이언트 · useVendors union · 매입 이력 없는 vendor 도 표시 · "매입 이력 없음"

### 3️⃣ 발주 리스트 리디자인 · 사용자 승인 대기
- 목업 v1 · `docs/UI_MOCKUP_ORDER_LIST_2026-08-24.html`
- 목업 v2 · `docs/UI_MOCKUP_ORDER_REQUEST_LIST_2026-08-24.html` (Linear/Attio 톤)
- 목업 v3 · `docs/UI_MOCKUP_ORDER_LIST_V3_2026-08-24.html` (Ramp/Brex/Cursor · 프리미엄)
- **사용자 승인 후 OrderRequestTab 실적용 예정**

### 4️⃣ 글씨 깨짐 (터미널) · 사용자 제보
- 증상 · 터미널에서 한글 깨짐 (Windows PowerShell)
- 원인 · CP949 default · git 등 UTF-8 출력과 mismatch (코드 문제 X · 로컬 환경)
- 해결 (사용자 로컬):
  ```
  # 임시 (현재 세션)
  chcp 65001
  # 영구
  git config --global i18n.logOutputEncoding utf-8
  # PowerShell profile 에 추가
  $OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  ```

---

## 📋 남은 태스크 (우선순위)

### 🎯 대기 (사용자 결정 필요)
- **#264 Round 2** · 발주 액션 버튼 나머지 15-25개 자동 스캔·일괄
- **적정재고 조사** · 설정값 → DB flow 확인 후 보고 (`/api/products/refill-optimal-stock` 로 refill)
- **#178 잔여** · vendors.special_notes 경고 배너
- **#261 잔여** · SplitRightHeader·SplitRightEmpty·SplitRightLoading·SplitRightError 프리미티브 신설
- **#259** · 매입이력 공급사별 · 상품 확장 (arrow) 기능 복원
- **급상승 배너** · 최근 30일 데이터 없음 안내 배너 결정
- **#253 Phase B~F** · 자동 임포트 · Python 스크립트 · PyInstaller 등

### 🔧 기술 부채
- **FlowTab · LossHistoryTab · DiffTab** · 컬러 bg 정리 (동일 톤 · 대량 · 승인 후 진행)
- **LandingPage 이전 리스트** (승인대기·결제요청·이벤트) · 사용자 승인 반드시 (revert 지시 이력)

---

## 📄 신규 프리미티브·문서

| 파일 | 용도 |
|---|---|
| `src/components/common/ListRow.tsx` | ListPanel + ListRow (풍부한 props · 13 tests) |
| `src/components/common/SplitLeftHeader.tsx` | 폰트 +2 (19px) · title/subtitle/right |
| `docs/UI_MOCKUP_ORDER_LIST_2026-08-24.html` | 발주 리스트 v1 목업 |
| `docs/UI_MOCKUP_ORDER_REQUEST_LIST_2026-08-24.html` | 발주 리스트 v2 목업 |
| `docs/UI_MOCKUP_ORDER_LIST_V3_2026-08-24.html` | 발주 리스트 v3 프리미엄 (Ramp/Brex/Cursor) |

## 🔑 신규 원칙 (memory 등록)
- `feedback_splitlist_search_required.md` · SplitListPanel search prop 필수
- `feedback_remote_push_prohibited_2026-08-24.md` · 리모트 push 절대 금지

## ⚙ 검증 상태
- **Tests · 3219 passed** (전체 216 files)
- **TS strict · pass**
- **Audit · baseline 갱신 반영**
- **로컬 커밋 · 35+** · 리모트 push X

---

## 🎬 다음 세션 시작 시 · 체크리스트

1. `docs/TASKS.md` · `docs/CODING_PRINCIPLES.md` 최신 확인
2. 위 **열린 이슈 4건** 상태 재확인
3. 사용자에게 **v3 프리미엄 목업 승인 여부** 우선 확인 (발주 리스트 최종 실적용 준비)
4. **상품등록 404** · 서버 재시작 후 재현 확인
5. **자율진행 지시** 있으면 · 오래된 태스크부터 순차

---

_저장 시각 · 2026-08-24 (한국시간) · 사용자 지시 "다음 세션을 위해 필요한 모든 내용 저장"_
