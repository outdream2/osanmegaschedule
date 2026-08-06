# 메뉴 구조 · 공통 자산 카탈로그 · 오산 메가타운 약국

**프로젝트**: megatown-staff-scheduler
**생성**: 2026-08-05 (초판) · **확장**: 2026-08-06 (공통 자산 통합)
**출처**: 코드 실측 (LandingPage · 각 페이지 컴포넌트 · TAB 정의 · src/styles · src/components/common · src/hooks · migrations · server/routes)
**용도**: 새 페이지·기능 추가 시 **먼저 참고**해야 할 단일 소스 · 다른 참조 문서 만들지 말고 이 파일 하나에 통합

---

## 목차 (TOC)

### Part I — 메뉴 · 페이지 구조
1. [메인 메뉴 (LandingPage · 12개)](#1-메인-메뉴-landingpage--12개)
2. [재고관리 (DisplayPage) · 하위 탭 6개](#2-재고관리-displaypage--하위-탭-6개)
3. [경영관리 (BusinessManagePage) · 하위 탭 5개](#3-경영관리-businessmanagepage--하위-탭-5개)
4. [요청메뉴 (RequestsPage) · 하위 탭 최대 5개](#4-요청메뉴-requestspage--하위-탭-최대-5개)
5. [약사전용 (PharmacistPage) · 하위 탭 4개](#5-약사전용-pharmacistpage--하위-탭-4개)
6. [스케줄 · 스캔 · 실재고확인](#6-스케줄--스캔--실재고확인)
7. [관리자 전용 기능](#7-관리자-전용-기능)
8. [페이지 서브탭 요약 · 색상 코드](#8-페이지--하위-탭-요약--색상-코드)

### Part II — 공통 자산 카탈로그
9.  [디자인 토큰 (`src/styles/tokens.ts`)](#9-디자인-토큰-srcstylestokensts)
10. [공통 컴포넌트 (`src/components/common/`)](#10-공통-컴포넌트-srccomponentscommon)
11. [공통 훅 (`src/hooks/`)](#11-공통-훅-srchooks)
12. [데이터 fetch 표준 패턴](#12-데이터-fetch-표준-패턴)
13. [권한 · 세션](#13-권한--세션)
14. [알림 시스템 (DB · 웹푸시)](#14-알림-시스템-db--웹푸시)
15. [localStorage 규약](#15-localstorage-규약)
16. [서버 API 규칙](#16-서버-api-규칙)
17. [DB 마이그레이션 · 인덱스](#17-db-마이그레이션--인덱스)
18. [새 페이지 추가 체크리스트 (10항목)](#18-새-페이지-추가-체크리스트-10항목)
19. [성능 최적화 요약](#19-성능-최적화-요약)
20. [개발 환경 · 빌드 · 테스트](#20-개발-환경--빌드--테스트)

---
---

# Part I — 메뉴 · 페이지 구조

## 1. 메인 메뉴 (LandingPage · 12개)

| # | 라벨 | onNavigate 대상 | 파일 | 주 기능 |
|---|------|---------------|------|--------|
| 1 | **재고관리** | `display` | `DisplayPage.tsx` | 발주·매입·결제·통계·입고알림·매장구역도 · 재고 관리 전반 |
| 2 | **경영관리** | `business-manage` | `BusinessManagePage.tsx` | 직원·연차·사직서·서류 · HR 관리 |
| 3 | **요청메뉴** | `requests` | `RequestsPage.tsx` | 진열요청·발주요청·구역불일치·실재고차이·점심불참 통합 |
| 4 | **권한관리** | `permissions` | `PermissionsPage.tsx` | 직원별 · 페이지별 접근 권한 · 관리자 전용 |
| 5 | **약사전용** | `pharmacist` | `PharmacistPage.tsx` | 교육자료·복약지도·동영상·문서 · 약사 대상 |
| 6 | **스케줄표** | `schedule` | `SchedulePage.tsx` | 월간 근무 스케줄 · 구역/점심/휴게 배정 |
| 7 | **실재고확인** | `scan` | `ScanPage.tsx` | 바코드 스캔 · 실재고 입력 · 진열요청 진입점 |
| 8 | **상품입고** | `productarrival` | `ProductArrivalPage.tsx` | 바코드 스캔 · 상품 입고 알림·기록 |
| 9 | **연차신청** | `leave` | `LeavePage/LeavePage.tsx` | 직원 · 연차 신청·조회 |
| 10 | **점심신청** | `lunch` | `LunchPage/LunchPage.tsx` | 오늘 점심 참석 여부 |
| 11 | **게시판** | `board` | `BoardPage.tsx` | 공지·자유 게시판 |
| 12 | **당직 예약** | `reservation` | `ReservationPage.tsx` | 당직·특별 근무 예약 |

**추가 페이지** (직접 진입 · 메뉴 외):
- `mypage` · 내 정보 (프로필·비밀번호)
- `stockcheck` · 재고 확인 (읽기 전용 조회)
- `stockarrivals` · 상품입고 이력
- `ocr` · 거래명세서 OCR (매입관리 서브탭 안에서 진입)
- `zone-labels` · 구역 라벨 편집 (관리자)
- `hr-forms` · 각종 양식 (경영관리 서브탭 안에서 진입)

---

## 2. 재고관리 (DisplayPage) · 하위 탭 6개

| # | 서브탭 | 컴포넌트 | 주 기능 |
|---|--------|---------|--------|
| 1 | **발주** | `OrderManagePage.tsx` (initialTopTab="purchase-order") | 발주 요청 목록 · 발주 필요 상품 · 발주 승인 |
| 2 | **매입** | `OrderManagePage.tsx` (initialTopTab="purchase") | **매입이력 · 상품별 집계 · 매입 추이** (3서브탭) |
| 3 | **결제** | `OrderManagePage.tsx` (initialTopTab="payment") | 공급사 결제 정보 · 잔고 · 납부 |
| 4 | **통계** | `OrderManagePage.tsx` (initialTopTab="statistics") | 카테고리별 판매 · 상품 매출 분석 (CategoryTab) |
| 5 | **입고알림** | `StockArrivalPage.tsx` (embedded) | 입고 예정 상품 · 알림 관리 |
| 6 | **매장구역도** | `StoreZoneMap.tsx` · 구역 카드 | 매장 구역 시각화 · 카테고리 배치 확인 |

**매입 서브탭 (내부 3탭 · `PurchaseSubTabs.tsx`)**:
- **매입이력** (ledger) · 선택 기간 매입 원장 (rows) · 정렬·필터
- **상품별 집계** (product) · groupBy 상품명 · 총매입액·수량 랭킹
- **매입 추이** (trend) · 3종 파이차트 (카테고리별·상품별 Top10·월별)

**매입이력 뷰 전환 (`PurchaseHistoryTab.tsx`)**:
- **공급사별** (by-vendor) · 좌측 공급사 리스트 · 우측 원장·집계·추이
- **상품별** (by-product) · 좌측 상품 리스트 (기간필터) · 우측 상품 상세 or 파이차트 3종

---

## 3. 경영관리 (BusinessManagePage) · 하위 탭 5개

| # | 서브탭 | 컴포넌트 | 주 기능 |
|---|--------|---------|--------|
| 1 | **직원관리** | `StaffManagePage.tsx` | 직원 CRUD · 계약 · 근속 · 인사평가 · 근로계약서 연동 |
| 2 | **승인대기** | `ApprovalCenterPage.tsx` | 연차·사직서 승인 통합 (내부 2탭) |
| 3 | **점심불참** | `LunchPage/LunchPage.tsx` (embedded) | 오늘 점심 불참자 관리 |
| 4 | **각종양식** | `HrFormsPage.tsx` (embedded) | HR 양식 (근로계약서·사직서·급여명세서 등) 템플릿 CRUD |
| 5 | **서류작성** | `DocumentWriterPage.tsx` (embedded) | 근로계약서·사직서 작성 (내부 3탭) |

**승인대기 서브 (2탭)**:
- **연차승인** (leave) · 대기중 연차 신청 승인/반려
- **사직서승인** (resignation) · 대기중 사직서 승인/반려 · 배지 카운트

**서류작성 서브 (3탭)**:
- **근로계약서 작성** (contract) · `ContractWriterPage` · 세전월급 자동 · 서명 · PDF 저장
- **사직서 작성** (resignation) · `ResignationWriterPage` · 서명 · 승인 흐름
- **설정** (settings) · `ContractSettingsPage` · 각 호 CMS (임금단서·근로시간·휴일·징계·기타·개인정보 · 서버 저장 · T-C)

---

## 4. 요청메뉴 (RequestsPage) · 하위 탭 최대 5개

| # | 서브탭 | 조건 | 주 기능 |
|---|--------|-----|--------|
| 1 | **진열요청 / 내가 받은 요청** | 항상 | 상품별 진열요청 리스트 · 표 형태 · 창고준비→진열완료 3단계 워크플로우 |
| 2 | **구역불일치** | 관리자만 | products.real_map ≠ products.spec 상품 리스트 |
| 3 | **실재고차이** | 관리자만 | 실재고 입력 후 · 시스템 재고와 차이 |
| 4 | **점심불참** | 관리자만 | 오늘 점심 불참자 (경영관리 점심불참과 동일 소스) |
| 5 | **발주요청** | (표시 로직 · orderReqs 있을 때) | 진행중 발주 요청 |

**진열요청 표 컬럼** (사용자 확정 · 2026-08-05):
- 상품명 · 진열구역 · 담당자 · **창고준비** (버튼) · **진열완료** (버튼) · 날짜
- 창고담당 [준비완료] → 진열담당 [완료] → 관리자 알림

---

## 5. 약사전용 (PharmacistPage) · 하위 탭 4개

| # | 서브탭 | key | 주 기능 |
|---|--------|-----|--------|
| 1 | **교육자료** | education | 카테고리별 교육 자료 (PDF·이미지·문서) |
| 2 | **복약지도** | reference | 복약 상담 자료·안내문 |
| 3 | **동영상 강의** | video | 동영상 자료 링크·목록 |
| 4 | **각종 문서** | docs | 약사 대상 기타 문서 |

**공통**: 좌측 카테고리 트리 + 우측 항목 리스트 · PDF 뷰어 모달

---

## 6. 스케줄 · 스캔 · 실재고확인

이들은 서브탭이 없거나 · 단일 UI · 기능별 섹션으로 구성.

### 실재고확인 (ScanPage)
- 좌: 바코드 스캐너 + 마지막 스캔 상품
- 우: 스캔 상품 테이블 (창고1·창고2·매장1·매장2·매장3 5열)
- 스캔 즉시 · **상품정보 모달 팝업** (T-SCAN-1)
  - 창고1/2 + 매장1/2/3 5칸 인라인 편집
  - 매장 슬롯별 [진열요청] 버튼 (구역별 담당자 자동 매칭)

### 스케줄표 (SchedulePage)
- 월간 캘린더 · 직원별 색상 · 구역 배정 · 점심 배정 · 휴게시간
- 드래그앤드롭 · 임의 배치 · 다중 요일 적용
- 약사팀 자동 구성 (약사1 + 물류2)

### 상품입고 (ProductArrivalPage)
- 바코드 스캔 · 입고 상품 등록
- 입고 이력 확인
- 상품별 · 공급사별 필터

---

## 7. 관리자 전용 기능

- **long-press 드래그 재정렬** (관리자 level ≥ 8)
  - 서브탭 순서 · 사용자별 localStorage 저장
  - `useSortableTabs` 훅 · 적용 페이지: DisplayPage · BusinessManagePage · DocumentWriter · ApprovalCenter · PharmacistPage
- **강제 완료** (진열요청 등) · pending 에서도 완료 처리 가능
- **삭제** · vendor · post · comment 등

---

## 8. 페이지 · 하위 탭 요약 · 색상 코드

### 서브탭 총계

| 메인 메뉴 | 서브탭 수 | 내부 서브탭 |
|---------|---------|----------|
| 재고관리 (DisplayPage) | 6 | 매입 → 3서브탭 |
| 경영관리 (BusinessManagePage) | 5 | 승인대기 2 · 서류작성 3 |
| 요청메뉴 (RequestsPage) | 최대 5 | - |
| 약사전용 (PharmacistPage) | 4 | 각 탭 · 좌측 카테고리 트리 |
| 매입관리 세부 (OrderManagePage) | 4 (top) | 매입 → 서브 3 · byVendor/byProduct 뷰 |

**총 서브탭 수** (내부 포함): 약 30+ 서브탭

### 색상 코드 (탭별 아이덴티티)

- **재고관리**: violet (스캔) · sky (발주) · amber (매입) · teal (결제) · indigo (통계) · orange (입고알림) · violet (매장구역도)
- **경영관리**: emerald (직원관리) · teal (승인대기) · orange (점심불참) · amber (각종양식) · indigo (서류작성)
- **약사전용**: sky (교육자료) · emerald (복약지도) · violet (동영상) · amber (문서)
- **요청메뉴**: rose · amber · indigo (탭별)
- **매입 서브**: emerald (매입이력) · sky (상품별) · violet (매입추이)

### 관련 파일

- 메인 메뉴: `src/components/LandingPage/LandingPage.tsx`
- App 라우팅: `src/App.tsx`
- 공통 탭 컴포넌트: `src/components/common/TabBar.tsx`
- 드래그 재정렬 훅: `src/hooks/useSortableTabs.ts`
- 세션·권한: `src/hooks/useAuth.ts` · `src/types.ts` (AuthSession)

---
---

# Part II — 공통 자산 카탈로그

**목적**: 새 페이지·기능 추가 시 · 먼저 참고해야 할 재사용 가능 자산 목록.
**원칙**: 새로 만들기 전에 이 카탈로그부터 검색 · 3곳 이상 반복되면 공용화.

---

## 9. 디자인 토큰 (`src/styles/tokens.ts`)

**목적**: 전체 UI 통일 · 타이포·색상·className 상수. 하드코딩 금지 · 반드시 토큰 사용.

### 9-1. 타이포그래피 스케일 · TEXT (5단계)

| 키 | 용도 | 클래스 |
|---|------|-------|
| `TEXT.hero` | 페이지 타이틀 · AppNavHeader 제목 · 모달 제목 등 최상위 | `text-[16px] sm:text-[17px] font-black tracking-tight` |
| `TEXT.body` | 본문 · 리스트 항목 · 카드 내 주요 텍스트 | `text-[13px] sm:text-[13.5px] font-medium` |
| `TEXT.caption` | 서브 텍스트 · 힌트 · 보조 레이블 | `text-[11px] sm:text-[11.5px] font-semibold` |
| `TEXT.micro` | 컬럼 헤더 · 메타 라벨 · 배지 · UPPERCASE 축약 | `text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider` |
| `TEXT.num` | 숫자 전용 (색상 별도 지정) · tabular-nums 정렬 | `tabular-nums font-black` |

**주의**: `index.css` 전역 오버라이드로 `text-[Npx]` 는 +5px 상향 렌더 (예: `text-[13px]` → 18px).

### 9-2. 색상 팔레트 · COLOR (역할 기반 · 6팔레트)

| 역할 | 팔레트 | 대표색 |
|------|-------|-------|
| `COLOR.primary` | indigo 계열 (`50/100/500/600/text/border/ring`) | 대표 강조·서명·저장 |
| `COLOR.success` | emerald 계열 | 완료·승인 |
| `COLOR.warning` | amber 계열 | 대기·주의 |
| `COLOR.danger` | rose 계열 | 삭제·오류·거절 |
| `COLOR.info` | sky 계열 | 정보·조회·준비 |
| `COLOR.neutral` | slate 계열 | 일반·비활성 |

각 팔레트마다 `50 / 100 / 500 / 600 / text / border / ring` 7종 제공.

### 9-3. 상태 색상 · STATUS_COLOR (8상태 · StatusBadge 연동)

| StatusKey | 라벨 | bg | text | border |
|-----------|------|----|----|--------|
| `pending` | 대기 | amber-50 | amber-700 | amber-200 |
| `prepared` | 준비 | sky-50 | sky-700 | sky-200 |
| `done` | 완료 | emerald-50 | emerald-700 | emerald-200 |
| `success` | 성공 | emerald-50 | emerald-700 | emerald-200 |
| `warning` | 경고 | amber-50 | amber-700 | amber-200 |
| `danger` | 오류 | rose-50 | rose-700 | rose-200 |
| `info` | 정보 | sky-50 | sky-700 | sky-200 |
| `neutral` | 일반 | slate-50 | slate-600 | slate-200 |

`STATUS_LABEL` 로 한국어 라벨 매핑 제공.

### 9-4. 공통 className 상수

| 상수 | 용도 |
|-----|-----|
| `CARD_BASE` | bg-white + 테두리 + 그림자 (index.css `.card-panel` 와 동일) |
| `CARD_HOVER` | 카드 hover 인터랙션 (클릭 가능한 카드에만 추가) |
| `TOOLBAR_BASE` | 툴바 컨테이너 · 검색·필터 버튼 행 (인라인 형태) |
| `INPUT_BASE` | 폼 input 기본 (index.css `.input-field` + focus ring 강화) |
| `BUTTON_PRIMARY` | 프라이머리 버튼 · indigo→emerald 그라디언트 |
| `BUTTON_SECONDARY` | 보조 버튼 · outline · 흰 배경 |
| `BUTTON_DANGER` | 위험 버튼 · rose-500 · 삭제·취소 등 |
| `MODAL_BACKDROP` | 모달 backdrop · 모바일 하단 시트 + 데스크탑 센터 |
| `MODAL_CONTENT` | 모달 카드 본체 · sm:max-w-lg · max-h-[90vh] |
| `PAGE_WRAPPER` | 페이지 최상위 컨테이너 · max-w-[1360px] |
| `KPI_GRID` | 상단 KPI 그리드 · 2/3/4/5 칸 반응형 |
| `SECTION_TITLE` | 섹션 제목 (카드 안 · 필터 섹션 위) |
| `DIVIDER` | 구분선 · border-t border-slate-100 |

### 9-5. 반응형 breakpoint 규칙

| 브레이크포인트 | 최소폭 | 규칙 |
|-------------|-------|-----|
| default | < 640px | 모바일 · 세로 스택 · 5칸 grid 강제 |
| sm | ≥ 640px | 큰 모바일 · 좌우 여백 여유 |
| md | ≥ 768px | 태블릿 · 2컬럼 레이아웃 · 우측 정보 모달로 |
| lg | ≥ 1024px | 데스크탑 · 좌우 분할 · 우측 사이드 패널 (SplitPanel 표시) |
| xl | ≥ 1280px | 와이드 · 3컬럼 가능 |

### 9-6. 사용법 예시

```tsx
import { TEXT, BUTTON_PRIMARY, CARD_BASE } from "@/styles/tokens";

<h1 className={TEXT.hero}>페이지 타이틀</h1>
<div className={CARD_BASE}>카드 내용</div>
<button className={BUTTON_PRIMARY}>저장</button>
```

---

## 10. 공통 컴포넌트 (`src/components/common/`)

**실측 목록** (`src/components/common/` · 22개):

### 10-1. 레이아웃 · 페이지 골격

| 컴포넌트 | 용도 |
|---------|-----|
| `PageHeader` | 페이지 타이틀 + 서브타이틀 + 아이콘 + 우측 액션 슬롯 · AppNavHeader 와 별개 · 페이지 내부 상단 헤더 |
| `Toolbar` | 검색·필터 버튼 행 · 카드 상단 액션 툴바 |
| `TabBar` | 서브탭 공용 · useSortableTabs 와 조합 시 관리자 드래그 재정렬 지원 |
| `SplitPanel` | 좌측 리스트 + 우측 상세 (md 이상) · 모바일에서는 모달로 자동 전환 |
| `Modal` | 공용 모달 wrapper · MODAL_BACKDROP + MODAL_CONTENT 사용 |

### 10-2. 상태 표시

| 컴포넌트 | 용도 |
|---------|-----|
| `EmptyState` | 데이터 없음 · 안내 문구 + 아이콘 + 액션 버튼 |
| `LoadingState` | 로딩 스피너 + 메시지 |
| `ListLoading` | 리스트 스켈레톤 · 여러 줄 회색 바 |
| `StatusBadge` | 상태 뱃지 · StatusKey 8종 (pending/prepared/done/success/warning/danger/info/neutral) |
| `KpiCard` | 대형 지표 카드 · KPI_GRID 안에서 사용 |

### 10-3. 폼 · 검색 · 정렬

| 컴포넌트 | 용도 |
|---------|-----|
| `SearchBar` | 검색 input + 초기화 버튼 |
| `SearchFilterChips` | 활성 필터 칩 나열 · 클릭으로 제거 |
| `SortableHeader` | 정렬 가능한 컬럼 헤더 · asc/desc 아이콘 · useSortableTable 훅과 조합 |
| `FilterBar` | 카드 형태 필터바 (TOOLBAR_BASE 와 다른 세로형) |
| `FieldLabel` | 폼 필드 라벨 · required 별표 · description |
| `SeasonButtons` | 봄·여름·가을·겨울 4버튼 · useSeasonRanges 훅과 연동 |

### 10-4. 도메인 특화

| 컴포넌트 | 용도 |
|---------|-----|
| `StoreZoneMap` | 매장 5구역 (창고1/2·매장1/2/3) 시각화 · 카테고리 배치 |
| `PurchaseHistoryList` | 매입이력 리스트 (공급사별/상품별) · 페이지네이션 |
| `PurchaseHistoryModal` | 매입이력 상세 모달 · 상품별 매입 상세 |
| `ProductDetailPanel` | 상품 상세 우측 패널 · 재고·매입·판매 통합 |
| `ProductClassFilter` | 상품 분류 (일반/의약외품/의약품) 필터 |
| `VendorCategoryBadge` | 공급사 카테고리 색상 뱃지 |
| `hangulSearch.ts` | 한글 초성·자모 검색 유틸 (컴포넌트 X · 유틸이지만 common 폴더 안) |

### 10-5. 사용 원칙

1. **먼저 검색**: 새 UI 만들기 전 · `src/components/common/` 부터 확인
2. **3곳 이상 반복 시 공용화**: 특정 페이지 전용이면 그 페이지 폴더 안에 유지
3. **props 최소화**: 옵셔널 props 남발 지양 · 필요할 때만 확장
4. **토큰 사용 필수**: 하드코딩된 `text-[N]` · `bg-*` 대신 `TEXT` / `COLOR` / `CARD_BASE` 등 사용

---

## 11. 공통 훅 (`src/hooks/`)

**실측 목록** (`src/hooks/` · 10개):

### 11-1. 인증 · 세션

| 훅 | 용도 · 반환 |
|----|-----------|
| `useAuth` | 로그인 세션 관리 · idle 8h · absolute 24h · rememberMe 예외 · `{ session, login, logout, ... }` · 매 30초 tick · warning 3분전 |

**세션 스토리지 키**: `megatown_auth_session` · localStorage.

### 11-2. 데이터 (캐시 + 이벤트 구독)

| 훅 | 용도 |
|----|-----|
| `useVendors` | 공급사 목록 · 모듈 레벨 캐시 (5분 TTL) + in-flight dedup · CustomEvent `vendors-changed` 구독 |
| `useSettings` | 앱 설정 (positions·employmentTypes·workplaces·scheduleTypes·wageRates·employeeWageOverrides) · localStorage + 서버 |
| `useSeasonRanges` | 계절 → 월 매핑 (spring/summer/autumn/winter) · 앱 시작 시 1회 fetch · 모듈 캐시 + localStorage |

### 11-3. UX · UI 상태

| 훅 | 용도 |
|----|-----|
| `useSortableTable` | 테이블 정렬 · asc/desc · toggleSort · 23파일 중복 통합용 |
| `useSortableTabs` | 관리자 (level ≥ 8) 만 · long-press 500ms → 드래그 · localStorage 순서 저장 · CustomEvent 발행 |
| `useLedgerHighlight` | 특정 id 잠깐 하이라이트 (기본 3초) · 매입원장 등 · 재사용 가능 UX 훅 |

### 11-4. 알림 · 검색

| 훅 | 용도 |
|----|-----|
| `usePushSubscription` | 웹푸시 자동 구독 (로그인 직후) · 브라우저 지원 확인 · 권한 요청 · endpoint 저장 · silent fail |
| `useProductInfoSearch` | 상품 정보 검색 유틸 |
| `useHiddenManager` | 숨김 관리자 모달 관련 (특정 관리 기능 잠금해제) |

### 11-5. 훅 사용 원칙

1. **훅 이름 = 파일명**: `useVendors.ts` → `useVendors()`
2. **모듈 레벨 캐시 패턴**: 다중 페이지에서 동일 데이터 · TTL + in-flight dedup + listener Set
3. **CustomEvent 통합**: fetch 후 `window.dispatchEvent(new CustomEvent("X-changed"))` · 훅 내부에서 구독
4. **초기값을 useState 에 전달**: 캐시가 있으면 즉시 표시 (`useState(_cache?.vendors ?? [])`)

---

## 12. 데이터 fetch 표준 패턴

### 12-1. 공용 훅 우선

| 종류 | 권장 훅 | 대체 |
|------|--------|-----|
| 공급사 | `useVendors()` | `fetch("/api/vendors")` 직접 호출 지양 |
| 앱 설정 | `useSettings()` | localStorage `app_settings` |
| 계절 | `useSeasonRanges()` | 하드코딩 금지 |

### 12-2. 페이지네이션 응답 형식

```json
{
  "rows": [...],
  "has_more": true
}
```

- 서버 라우트: `?limit=50&offset=0` · 반환 시 `has_more` 필수
- 무한스크롤 · 페이지 이동 모두 지원

### 12-3. CustomEvent 실시간 구독

| 이벤트 | 발행 시점 |
|--------|---------|
| `vendors-changed` | 공급사 CRUD 후 |
| `inventory-checks-updated` | 실재고 입력 저장 후 |
| `supplier-payment-added` | 공급사 결제 저장 후 |
| `tabs-reordered-{storageKey}` | useSortableTabs · 관리자 재정렬 후 |

구독 예시:
```tsx
useEffect(() => {
  const handler = () => refetch();
  window.addEventListener("vendors-changed", handler);
  return () => window.removeEventListener("vendors-changed", handler);
}, [refetch]);
```

### 12-4. 30초 폴링 패턴

**적용 지점**: `RequestsPage` · 탭별 카운트 배지 (진열요청·구역불일치·실재고차이·점심불참).

```tsx
useEffect(() => {
  const tick = () => fetchCounts();
  tick();
  const id = setInterval(tick, 30_000);
  return () => clearInterval(id);
}, []);
```

**언제 사용**: 배지 카운트 등 실시간성 있지만 웹푸시가 부담될 때. 데이터 자체 실시간은 CustomEvent 사용.

---

## 13. 권한 · 세션

### 13-1. AuthSession 타입 (`src/types.ts`)

```ts
export interface AuthSession {
  role: AuthRole;              // 'superadmin' | 'admin' | 'manager' | 'employee' | 'vendor'
  employeeId?: number;
  employeeName?: string;
  employeeRank?: string;
  level?: number;              // 0-9
  loginAt?: number;            // Unix ms · absolute timeout 기준
  lastActiveAt?: number;       // Unix ms · idle timeout 기준
  rememberMe?: boolean;        // true 면 idle/absolute skip
}
```

### 13-2. Level 체계 (0-9)

| level | 역할 | 접근 권한 |
|-------|-----|---------|
| 0 | 차단 | 모든 접근 X |
| 1 | 직원 (기본) | 스캔·연차·점심·게시판 |
| 2 | manager (매니저·물류팀장 등) | + 진열요청 · 매입관리 |
| 8 | admin (대표) | + 승인·삭제·관리자 기능 · long-press 재정렬 |
| 9 | superadmin (최고관리자) | 모든 권한 · 시스템 설정 |

### 13-3. position 기반 (스케줄·구역 배정)

- **약사**: 약국 담당 · 스케줄 자동 편성 시 우선 배치
- **캐셔**: 매장 계산대
- **진열**: 매장 진열 담당 · 진열요청 수신
- **물류**: 창고 담당 · 창고준비 담당
- **알바**: 시급 정직원과 별도 · 시급 default `DEFAULT_STAFF_WAGE`
- **기타**: 특수 케이스

### 13-4. 세션 타임아웃

| 종류 | 기본값 | 처리 |
|------|-------|-----|
| idle | 8h | 마우스·키·터치·스크롤·휠 미발생 8h |
| absolute | 24h | loginAt 부터 24h |
| rememberMe | 무제한 | 명시적 로그아웃까지 유지 |
| warning | 만료 3분전 | SessionTimeoutWarning 모달 |
| tick | 30초 | 백그라운드 만료 검사 |

### 13-5. 서버 인증 (`server/middleware/requireAuth.ts` · T3)

| 함수 | 용도 |
|------|-----|
| `requireAuth(req, res, next)` | JWT 검증 · 미로그인 시 401 · `/api/` 로 시작하는 요청만 |
| `authorize(minLevel)(req, res, next)` | 최소 level 체크 · 부족 시 403 |
| `issueToken(res, payload, rememberMe)` | 로그인 성공 후 JWT 발급 (24h · rememberMe 30d) · httpOnly 쿠키 `mt_auth` |
| `clearToken(res)` | 로그아웃 시 쿠키 제거 |

**JWT 전달 방식**:
1. httpOnly 쿠키 `mt_auth` (웹 브라우저 · 기본)
2. `Authorization: Bearer <token>` 헤더 (API 클라이언트 호환)

**환경변수**: `JWT_SECRET` 필수 · Render 배포 시 설정.

---

## 14. 알림 시스템 (DB · 웹푸시)

### 14-1. DB 알림 (`notifications` 테이블)

- **마이그레이션**: `migrations/add_notifications.sql`
- **UI**: `NotificationBell.tsx` (헤더) · `NotificationToggle.tsx` (설정)
- **읽음/안읽음** 상태 관리 · 배지 카운트

### 14-2. 웹푸시 (web-push VAPID)

- **패키지**: `web-push@^3.6.7`
- **서비스 워커**: `public/sw.js`
- **자동 구독**: `usePushSubscription()` 훅 · 로그인 직후 자동 (silent fail)
- **저장**: `employees.push_subscription` (jsonb · Supabase)
- **1회 시도 제한**: localStorage `megatown_push_subscribed_auto` (employeeId 목록)

### 14-3. 발송 지점

| 이벤트 | 수신자 | 발송 API |
|--------|-------|---------|
| 진열요청 생성 | 진열 담당 (구역별) | `POST /api/requests` 내부 |
| 창고준비 완료 | 진열 담당 | `PATCH /api/requests/:id` |
| 진열완료 | 관리자 | `PATCH /api/requests/:id` |
| 매입 이슈 (실재고 차이 등) | 관리자 | `server/routes/purchase.ts` |
| 연차·사직서 신청 | 관리자 | `server/routes/leave.ts` · `resignations.ts` |
| 승인·반려 결과 | 신청자 | 승인 라우트 내부 |

### 14-4. 웹푸시 vs DB 알림

| 유형 | 즉시성 | 오프라인 | 히스토리 |
|------|-------|--------|--------|
| 웹푸시 | 즉시 | 브라우저가 큐잉 | X |
| DB 알림 | 다음 폴링/새로고침 | 항상 저장 | O |

**권장**: 중요 이벤트는 **둘 다** 발송.

---

## 15. localStorage 규약

### 15-1. Prefix 규칙

- **모든 키**: `megatown_` prefix 시작
- **로그아웃 시**: `useAuth.logout()` 이 `megatown_*` 전부 삭제

### 15-2. 주요 키 목록

| 키 | 용도 |
|----|-----|
| `megatown_auth_session` | 로그인 세션 (AuthSession JSON) |
| `megatown_push_subscribed_auto` | 자동 웹푸시 구독 완료 employeeId 배열 |
| `megatown_season_ranges` | 계절→월 매핑 캐시 |
| `megatown_tabOrder.{storageKey}` | 관리자 드래그 재정렬한 서브탭 순서 |
| `app_settings` | 앱 설정 (positions·wageRates 등) · 서버 fallback |

**예외**: `app_settings` 는 legacy · 새 키는 반드시 `megatown_` prefix.

### 15-3. 사용 원칙

1. **읽기**: try/catch 필수 · JSON.parse 실패 대비
2. **쓰기**: 크기 5MB 제한 인지 · 대용량은 IndexedDB
3. **삭제**: 로그아웃 시 자동 · 개별 삭제 필요 시 `clearAllMegatownKeys()` 참조

---

## 16. 서버 API 규칙

### 16-1. 라우트 구조 (`server/routes/` · 35개)

```
auth · board · contractClauses · employeeContracts · hrForms
inventorySales · invoiceImages · leave · lunch · mismatches
notifications · ocr · ocrConfirmed · ocrDeletedRows
pharmacistMenuItems · productArrivals · products · purchase
purchaseHistory · requests · reservations · resignations
returnRequests · schedules · settings · staff · stockArrivals
stockManage · stockReconciliation · supplierBalanceConfig
supplierPayments · vat · vendors · zoneAssignments · zoneLabels
```

### 16-2. 응답 형식 표준

| 성공 | 형식 |
|------|-----|
| 리스트 (페이지네이션) | `{ rows: [...], has_more: boolean }` |
| CRUD 결과 | `{ ok: true, id?: number }` |
| 단일 객체 | `{ ...객체_필드 }` 또는 `{ data: {...} }` |

| 에러 | 형식 |
|------|-----|
| 표준 | `{ error: "메시지", code: "ERROR_CODE" }` |
| 401 | `{ error: "인증이 필요합니다. 다시 로그인해주세요.", code: "UNAUTHORIZED" }` |
| 403 | `{ error: "권한이 부족합니다.", code: "FORBIDDEN" }` |

### 16-3. 인증 (T3 · 2026-08-05)

- 모든 `/api/*` 는 `requireAuth` 통과 (공개: `/api/auth/*` · `/api/products.json`)
- 관리자 전용은 `authorize(8)` 미들웨어 추가
- JWT · httpOnly 쿠키 `mt_auth` · `Authorization: Bearer` 지원

### 16-4. Rate limit · 캐싱

- **캐싱**: `productCache.ts` 같은 서버 사이드 캐시
- **압축**: `compression` 미들웨어 활성
- **정적 자원**: express.static · Vite 빌드 산출물

---

## 17. DB 마이그레이션 · 인덱스

### 17-1. 마이그레이션 목록 (`migrations/*.sql` · 실측 19개)

| 파일 | 역할 |
|------|-----|
| `add_employee_level.sql` | employees.level 컬럼 추가 (0-9) |
| `add_notifications.sql` | notifications 테이블 |
| `add_stock_arrivals_scheduling.sql` | 입고 예정일·알림 시각 |
| `audit-fix.sql` | 감사 로그 수정 |
| `create_contract_clauses_2026-08-05.sql` | 근로계약서 각 호 CMS (T-C) |
| `create_employee_contracts.sql` | 직원 근로계약서 |
| `create_leave_requests.sql` | 연차 신청 |
| `create_ocr_supplier_aliases.sql` | OCR 공급사 별칭 |
| `create_request_tables.sql` | 진열요청·구역불일치 등 |
| `create_resignation_requests.sql` | 사직서 |
| `create_stock_arrivals.sql` | 상품 입고 이력 |
| `create_vendors.sql` | 공급사 |
| `create_zone_labels_2026-08-05.sql` | 구역 라벨 편집 (T-Z) |
| `db_improvements_top3.sql` | DB 개선 Top 3 |
| `db_top4_signature_storage.sql` | 서명 이미지 Storage |
| `db_top5_status_check.sql` | 상태 체크 제약 |
| `perf_indexes_2026-08-05.sql` | **성능 인덱스 Block A** |
| `rpc_only_2026-08-05.sql` | `get_inventory_latest` RPC 등 |
| `vat_integration.sql` | 부가세 통합 |

### 17-2. 완료된 실행 (2026-08-05)

- `create_zone_labels_2026-08-05.sql` — zone_labels 테이블
- `create_contract_clauses_2026-08-05.sql` — contract_clauses 테이블
- `rpc_only_2026-08-05.sql` — `get_inventory_latest()` RPC
- `perf_indexes_2026-08-05.sql` — 인덱스 Block A (조회 성능 개선)

### 17-3. 파생컬럼 사용 금지 원칙

**MEMORY 우선순위**: 파생컬럼(계산된 값을 저장한 컬럼)은 **사용자 허락 후** 만 · 원칙은 있는 테이블에서 조회.

- 예: `total_amount = quantity * unit_price` 저장 X → SELECT 시 계산
- 정합성 · 유지보수 이점 · 성능 이슈 시에만 예외 (인덱스로 대체 우선)

---

## 18. 새 페이지 추가 체크리스트 (10항목)

새 페이지·기능 만들 때 · 아래 10개 항목 순서대로 확인.

- [ ] **1. 토큰 사용**: `TEXT`, `COLOR`, `CARD_BASE`, `BUTTON_PRIMARY` 등 하드코딩 지양
- [ ] **2. 공통 컴포넌트 재사용**: `PageHeader`, `Toolbar`, `TabBar`, `SplitPanel`, `EmptyState` 등 먼저 검색
- [ ] **3. 공용 훅 채택**: `useVendors`, `useAuth`, `useSettings`, `useSortableTable` 등 우선
- [ ] **4. 권한 확인**: 최소 level 지정 · `authorize(N)` 서버 · UI 에서도 `session.level >= N` 체크
- [ ] **5. 알림 발송**: 중요 이벤트는 DB 알림 + 웹푸시 둘 다
- [ ] **6. localStorage 규약**: `megatown_` prefix · 로그아웃 시 자동 삭제
- [ ] **7. 데이터 fetch 패턴**: 페이지네이션 `{ rows, has_more }` · CustomEvent 구독
- [ ] **8. 반응형**: default (모바일) → md (태블릿) → lg (데스크탑) · SplitPanel 자동
- [ ] **9. 관리자 재정렬**: 서브탭이 있으면 `useSortableTabs(userLevel, tabs, storageKey)`
- [ ] **10. 테스트 · 빌드**: TS 통과 (`npm run lint`) + build 성공 · vitest 필요 시 추가

**공통 부분 3곳 이상 반복 시**: `src/components/common/` 또는 `src/hooks/` 로 이동 (회귀 없이).

---

## 19. 성능 최적화 요약

### 19-1. DB 인덱스 (Block A · perf_indexes_2026-08-05.sql)

- 매입원장 · 상품 조회 · 재고 스냅샷 등 조회 hot path
- EXPLAIN 결과 개선 시 이곳에 추가

### 19-2. 캐시 (프론트)

| 종류 | 전략 |
|------|-----|
| useVendors | 모듈 캐시 5분 TTL + in-flight dedup |
| useSeasonRanges | 앱 시작 1회 + localStorage |
| useSettings | localStorage + 서버 반영 |
| productCache (서버) | server/productCache.ts |

### 19-3. 페이지네이션 · 무한스크롤

- 대량 데이터는 `?limit=50&offset=N` · `has_more` 필드
- 매입이력·상품 리스트 등 적용

### 19-4. N+1 제거

- Supabase JOIN 활용 · `.select("*, vendors(*)")` 등
- 서버 라우트에서 필요한 필드만 · 프론트에서 다시 fetch 지양

### 19-5. 이미지 · 번들 크기

- Vite compression plugin 활성
- 큰 이미지는 sharp 로 리사이즈 후 저장
- Render 배포용 빌드 메모리 제한: `NODE_OPTIONS=--max-old-space-size=400`

---

## 20. 개발 환경 · 빌드 · 테스트

### 20-1. 스택

| 계층 | 도구 · 버전 |
|------|----------|
| 프론트 | React 19.0.1 · Vite 6.2.3 · TypeScript 5.8 · Tailwind CSS 4.1 |
| 백엔드 | Express 4.21 · Node ≥ 20 · tsx (dev) · esbuild (prod bundle) |
| DB · Auth | Supabase (`@supabase/supabase-js` 2.108) · bcryptjs · jsonwebtoken |
| UI | Phosphor Icons + Lucide · Recharts (차트) · react-signature-canvas |
| 스캔 · OCR | @zxing · @ericblade/quagga2 · @undecaf/zbar-wasm · ppu-paddle-ocr · onnxruntime-node · @google/genai |
| 알림 | web-push (VAPID) |
| 테스트 | Vitest 4.1 |
| 배포 | Render (예정) · cross-env NODE_OPTIONS 메모리 제한 |

### 20-2. 스크립트 (`package.json`)

| 명령 | 용도 |
|------|-----|
| `npm run dev` | tsx server.ts · 개발 서버 |
| `npm run build` | vite build + esbuild server.ts → dist/server.cjs |
| `npm run build:render` | Render 배포용 (400MB 메모리 제한) |
| `npm run start` | node dist/server.cjs · 프로덕션 실행 |
| `npm run lint` | tsc --noEmit · 타입 체크 |
| `npm run test` | vitest run |
| `npm run test:watch` | vitest 감시 모드 |

### 20-3. 편집 후 필수 검증

**MEMORY 원칙**: 매 편집 후 `npm run lint` + `npm run build` 통과 확인 · 회귀 절대 금지.

```powershell
npm run lint        # TS 통과
npm run build       # 빌드 성공
npm run test        # (필요 시) 테스트
```

3개 모두 통과 → 로컬 커밋 자동 (사용자 확인 없이 · MEMORY `feedback_auto_commit`) · **remote push 는 절대 안 함**.

### 20-4. 환경변수 (필수)

| 변수 | 용도 |
|------|-----|
| `JWT_SECRET` | JWT 서명 시크릿 · 필수 (T3) |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서버 접근 |
| `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` | 클라이언트 (필요 시) |
| `VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_EMAIL` | 웹푸시 |
| `GOOGLE_APPLICATION_CREDENTIALS` · Gemini · Cloudinary · 등 | 개별 서비스 |

`.env` 는 gitignore · Render 대시보드에서 별도 설정.

---

## 부록 — 참고 문서 (프로젝트 내)

- `docs/TASKS.md` — 현재 진행중·대기 작업 목록
- `docs/PAYROLL_ALGORITHM.md` — 인건비 계산 알고리즘
- `docs/AGENT_PRINCIPLES.md` — 에이전트 위임 원칙
- `docs/db_top6_uuid_migration_plan.md` — DB UUID 전환 계획
- `docs/supabase_functions_and_tables.sql` — Supabase RPC · 테이블 스냅샷

**중요**: 프로젝트 전체 정리는 **오직 이 파일** (`docs/MENU_STRUCTURE.md`) 하나에 통합. 별도 정리 파일 생성 금지 (사용자 명시 요구 · 2026-08-06).

---

_이 문서는 코드 실측 기준 · 메뉴·자산 추가·변경 시 함께 업데이트 필요._
_마지막 확장: 2026-08-06 (research-strategist · Part II 공통 자산 카탈로그 통합)_
