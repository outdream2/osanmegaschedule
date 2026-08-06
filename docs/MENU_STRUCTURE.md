# 프로젝트 정리 · 메가타운 약국 스케줄러 (megatown-staff-scheduler)

> **이 파일은 프로젝트 전체 참조 문서입니다.**
> **모든 시스템 구현 에이전트·개발자는 이 파일을 먼저 읽고 시작해야 합니다.**
> **기능·구조·API 변경 시 · 반드시 이 파일에 반영 (변경 날짜 · YYYY-MM-DD)**
>
> **관리 원칙**:
>  - 새 페이지·기능·컴포넌트 추가 시 즉시 관련 섹션 업데이트 (CHANGELOG 최상단 누적)
>  - 파일 위치·컴포넌트명·API endpoint 변경 시 · 관련 표만 편집 · 전체 재작성 금지
>  - 이 문서는 "실측 기반" · 코드가 진실 · 문서가 코드보다 앞서지 않음
>  - 다른 참조 문서 만들지 말고 이 파일 하나에 통합 (사용자 명시 요구 · 2026-08-06)

**프로젝트**: megatown-staff-scheduler
**최종 업데이트**: 2026-08-06
**생성**: 2026-08-05 (초판) · **확장**: 2026-08-06 (공통 자산 통합 · 백엔드/DB/RPC 심화)
**출처**: 코드 실측 (LandingPage · 각 페이지 컴포넌트 · TAB 정의 · src/styles · src/components/common · src/hooks · migrations · server/routes)
**용도**: 새 페이지·기능 추가 시 · 새 세션 진입 시 · 다른 에이전트 위임 시 · **먼저 참고**해야 할 단일 소스

---

## 목차 (TOC)

### Part I — 메뉴 · 페이지 구조 (심층 · 액션·API·워크플로우·모달)
1. [메인 메뉴 (LandingPage · 12개)](#1-메인-메뉴-landingpage--12개)
2. [재고관리 (DisplayPage) · 하위 탭 6개](#2-재고관리-displaypage--하위-탭-6개)
3. [경영관리 (BusinessManagePage) · 하위 탭 5개](#3-경영관리-businessmanagepage--하위-탭-5개)
4. [요청메뉴 (RequestsPage) · 하위 탭 최대 5개](#4-요청메뉴-requestspage--하위-탭-최대-5개)
5. [약사전용 (PharmacistPage) · 하위 탭 4개](#5-약사전용-pharmacistpage--하위-탭-4개)
6. [개별 페이지 (스캔·스케줄·연차·점심·게시판·당직예약·기타)](#6-개별-페이지-스캔스케줄연차점심게시판당직예약기타)
7. [관리자 전용 · 권한 체계](#7-관리자-전용--권한-체계)
8. [페이지 서브탭 요약 · 색상 코드](#8-페이지--하위-탭-요약--색상-코드)
8-A. [데이터 흐름 & 커스텀 이벤트 카탈로그](#8-a-데이터-흐름--커스텀-이벤트-카탈로그)
8-B. [모달·팝업 카탈로그](#8-b-모달팝업-카탈로그)
8-C. [워크플로우 다이어그램 (5종)](#8-c-워크플로우-다이어그램-5종)
8-D. [API 엔드포인트 요약 (34 라우트 파일 · 228건)](#8-d-api-엔드포인트-요약-34-라우트-파일--228건)

### Part II — 공통 자산 · UI (6-B)
9.  [디자인 토큰 (`src/styles/tokens.ts`)](#9-디자인-토큰-srcstylestokensts)
10. [공통 컴포넌트 (`src/components/common/`)](#10-공통-컴포넌트-srccomponentscommon)
11. [공통 훅 (`src/hooks/`)](#11-공통-훅-srchooks)
12. [데이터 fetch 표준 패턴](#12-데이터-fetch-표준-패턴)
13. [권한 · 세션](#13-권한--세션)
14. [알림 시스템 (DB · 웹푸시)](#14-알림-시스템-db--웹푸시)
15. [localStorage 규약](#15-localstorage-규약)

### Part III — 백엔드 · DB · 인프라 (6-A 구조 + 6-C 백엔드)
16. [서버 API 규칙](#16-서버-api-규칙)
17. [DB 마이그레이션 · 인덱스](#17-db-마이그레이션--인덱스)
18. [새 페이지 추가 체크리스트 (10항목)](#18-새-페이지-추가-체크리스트-10항목)
19. [성능 최적화 요약](#19-성능-최적화-요약)
20. [개발 환경 · 빌드 · 테스트](#20-개발-환경--빌드--테스트)
21. [DB 스키마 · 테이블별 상세 (필드·역할·연결 페이지)](#21-db-스키마--테이블별-상세)
22. [Supabase RPC · 서버 함수](#22-supabase-rpc--서버-함수)
23. [백엔드 아키텍처 상세 (6-A 구조 + 6-C 백엔드)](#23-백엔드-아키텍처-상세)
24. [OCR 파이프라인 · 11 stages 상세](#24-ocr-파이프라인--11-stages-상세)
25. [프로젝트 명명 규칙 · import · 파일 규약](#25-프로젝트-명명-규칙--import--파일-규약)

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

**실측 목록** (`src/components/common/` · 31개 · 2026-08-06 갱신):

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
| `ResizableHeader` | 컬럼 폭 조정 헤더 · useColumnResize 훅과 조합 (2026-08-06 신규) |
| `FilterBar` | 카드 형태 필터바 (TOOLBAR_BASE 와 다른 세로형) |
| `FieldLabel` | 폼 필드 라벨 · required 별표 · description |
| `SeasonButtons` | 봄·여름·가을·겨울 4버튼 · useSeasonRanges 훅과 연동 |

### 10-4. 도메인 특화

| 컴포넌트 | 용도 |
|---------|-----|
| `StoreZoneMap` | 매장 5구역 (창고1/2·매장1/2/3) 시각화 · 카테고리 배치 |
| `PurchaseHistoryList` | 매입이력 리스트 (공급사별/상품별) · 페이지네이션 · 컬럼 리사이저 |
| `PurchaseHistoryModal` | 매입이력 상세 모달 · 상품별 매입 상세 |
| `ProductDetailPanel` | 상품 상세 우측 패널 · 재고·매입·판매 통합 |
| `ProductClassFilter` | 상품 분류 (일반/의약외품/의약품) 필터 |
| `VendorCategoryBadge` | 공급사 카테고리 색상 뱃지 |
| `VendorInfoHeader` | 공급사 정보 헤더 공통 (2026-08-06 신규) |
| `VendorInfoModal` | 공급사 상세 모달 공통 (2026-08-06 신규 · useVendorInfoModal 훅 동봉) |
| `InventoryEditModal` | 실재고 입력 공통 · 누적 UX · zone별 저장 (2026-08-06 신규 · fabd95f) |
| `InventoryEditPanel` | 실재고 입력 패널 (2026-08-06 신규) |
| `hangulSearch.ts` | 한글 초성·자모 검색 유틸 (컴포넌트 X · 유틸이지만 common 폴더 안) |

### 10-6. 상호작용 · 다이얼로그 (2026-08-06 신규)

| 컴포넌트 | 용도 |
|---------|-----|
| `ConfirmDialog` | window.confirm 대체 · Promise-based · useConfirm 훅과 조합 (T-SLIM D · 6a2f45f) |
| `BreakModal` | 휴게시간 입력 모달 (기존) |
| `SessionTimeoutWarning` | 세션 만료 경고 (기존 · useAuth 연동) |

### 10-5. 사용 원칙

1. **먼저 검색**: 새 UI 만들기 전 · `src/components/common/` 부터 확인
2. **3곳 이상 반복 시 공용화**: 특정 페이지 전용이면 그 페이지 폴더 안에 유지
3. **props 최소화**: 옵셔널 props 남발 지양 · 필요할 때만 확장
4. **토큰 사용 필수**: 하드코딩된 `text-[N]` · `bg-*` 대신 `TEXT` / `COLOR` / `CARD_BASE` 등 사용

---

## 11. 공통 훅 (`src/hooks/`)

**실측 목록** (`src/hooks/` · 14개 · 2026-08-06 갱신):

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
| `useKvSetting` | settings 테이블 KV 훅 · VAT·계약서 이관용 (2026-08-06 신규 · e036766) |
| `useFetch` | 공용 GET 훅 · 미래용 신규 도입 (2026-08-06 신규) |

### 11-3. UX · UI 상태

| 훅 | 용도 |
|----|-----|
| `useSortableTable` | 테이블 정렬 · asc/desc · toggleSort · 23+ 파일 중복 통합용 · 2026-08-06 세션 7 파일 확대 |
| `useSortableTabs` | 관리자 (level ≥ 8) 만 · long-press 500ms → 드래그 · localStorage 순서 저장 · CustomEvent 발행 |
| `useColumnResize` | 리스트 컬럼 폭 조정 · localStorage 저장 (2026-08-06 신규 · T-UI-컬럼리사이저 · 6a3dcd2) |
| `useLedgerHighlight` | 특정 id 잠깐 하이라이트 (기본 3초) · 매입원장 등 · 재사용 가능 UX 훅 |
| `useConfirm` | Promise-based 확인 dialog · window.confirm 대체 (2026-08-06 신규 · T-SLIM D · 6a2f45f) |

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

### 16-1. 라우트 구조 (`server/routes/` · 도메인 그룹 재구성 · 2026-08-06 갱신)

**Phase 2 재구성 완료** — 도메인 그룹 서브폴더 · 진행중 (`d56aff4`~`f1c1dbc`):
```
server/routes/
├─ auth/         · auth.ts
├─ board/        · board.ts · notifications.ts · pharmacistMenuItems.ts
├─ daily/        · leave.ts · lunch.ts · reservations.ts
├─ schedule/     · schedules.ts
├─ settings/     · settings.ts
├─ staff/        · staff.ts · contractClauses.ts · employeeContracts.ts · hrForms.ts · resignations.ts
└─ 루트          · invoiceImages · lossTracking · mismatches · ocr · ocrConfirmed · ocrDeletedRows
                · productArrivals · products · purchase · purchaseHistory · requests
                · returnRequests · stockArrivals · stockManage · supplierBalanceConfig
                · supplierPayments · vat · vendors · zoneAssignments · zoneLabels
```

**신규 라우터** (2026-08-06):
- `lossTracking.ts` · 손실추적 이력 (T-LOSS-HISTORY · `859c37f`)

**삭제됨** (dead code · `03ec97b`): `inventorySales.ts` · `stockReconciliation.ts` (mount 안 됨)

**신규 엔드포인트** (2026-08-06):
- `GET /api/supplier-payments/latest-per-supplier` · 최근결제일·결제액 (`a6c8e8d`)
- `GET /api/vapid-public-key` · 웹푸시 구독용 (T-VAPID-Route · `f9ba80e`)

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

### 17-1. 마이그레이션 목록 (`migrations/*.sql` · 실측 21개 · 2026-08-06 갱신)

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
| `loss_tracking_daily.sql` | **손실 이력 테이블** (2026-08-06 신규 · T-LOSS-HISTORY) |
| `perf_indexes_2026-08-05.sql` | 성능 인덱스 Block A |
| `perf_indexes_2026-08-06.sql` | **성능 인덱스 · 4개 추가** (2026-08-06 신규 · T-DB-Audit · `c0b9af5`) |
| `rpc_only_2026-08-05.sql` | `get_inventory_latest` RPC 등 |
| `vat_integration.sql` | 부가세 통합 |

### 17-2. 완료된 실행

**2026-08-05**:
- `create_zone_labels_2026-08-05.sql` — zone_labels 테이블
- `create_contract_clauses_2026-08-05.sql` — contract_clauses 테이블
- `rpc_only_2026-08-05.sql` — `get_inventory_latest()` RPC
- `perf_indexes_2026-08-05.sql` — 인덱스 Block A (조회 성능 개선)

**2026-08-06**:
- `perf_indexes_2026-08-06.sql` — 인덱스 4개 (T-DB-Audit)
- `loss_tracking_daily.sql` — 손실 스냅샷 테이블 (T-LOSS-HISTORY)
- **T-DB-Migrate-LocalStorage** (`e036766`) · localStorage → settings 테이블 4건
  - `vat_expenses` · `vat_taxfree_sales` · `vat_prepare_state` · `contract_writer_settings`

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

---

## 21. DB 스키마 · 테이블별 상세

**Supabase Postgres · service role key 사용 · RLS off** (서버가 모든 권한 제어)
**클라이언트**: `src/supabase/client.ts` (서버·브라우저 공용)
**참조 SQL**: `docs/supabase_functions_and_tables.sql` · `migrations/*.sql`

### 21-1. 인사 · 조직 · 인증

| 테이블 | 역할 | 주요 컬럼 | 관련 페이지·컴포넌트 | 마이그레이션 |
|-------|-----|---------|--------------------|-----------|
| `employees` | 직원 마스터 | id, name, position (약사/캐셔/진열/물류/알바/기타), rank (대표/부장/팀장/과장/사원), employment_type, hire_date, retire_date, workplace (매장/창고), gender, phone (login ID), password_hash, level (0-9), address, annual_leave_days, break_time_minutes (기본 60), break_apply_paid, primary_focus (매장/창고), primary_focus_percent (기본 70), contract_file_url, resume_url, push_subscription (JSONB) | StaffManagePage · SchedulePage · ContractWriter · MyPage · LeavePage | `migrations/add_employee_level.sql` |
| `schedules` | 근무 스케줄 | id, employee_id, date (YYYY-MM-DD), type (오픈/마감/휴무/월차/지정휴무/오전반차/오후반차), working_hours, actual_hours, memo | SchedulePage | (초기 스키마) |
| `zone_assignments` | 요일별 구역 배정 | dow (0-6), zone_id, employee_id | SchedulePage · DayTimelineModal | (초기) |
| `zone_labels` | 구역 번호 매핑 | zone_id (PK), number (1-60), sub_label, updated_at | ZoneLabelsEditor · StoreZoneMap · ScanPage | `create_zone_labels_2026-08-05.sql` |
| `zone_groups` | 구역 그룹 (매장/창고 구분) | id, name, zone_ids (JSONB) | SchedulePage | (초기) |
| `blocked_slots` | 근무 차단 슬롯 | date, employee_id, reason | SchedulePage | (초기) |
| `zones` | 구역 마스터 | id, name, spec | SchedulePage · ScanPage | (초기) |

### 21-2. 상품 · 재고 · 매입

| 테이블 | 역할 | 주요 컬럼 | 관련 페이지 |
|-------|-----|---------|---------|
| `products` | 상품 마스터 (ERP xlsx 임포트) | product_code (PK), product_name, supplier, spec, **real_map** (실제배정구역 · JS: `realMap`), sale_price, purchase_price, current_stock, optimal_stock, min_order, hidden | Scan · Display · Stock · Order · OCR |
| `stock_history` | 재고 스냅샷 (일별 · 초/중/하순) | product_code, snapshot_date, opening_stock, purchase_qty, sale_qty, disposal_qty, closing_stock, total_amount, product_name, supplier_name, spec | StockManagePage · SalesTrend · get_stock_flow RPC |
| `purchase_details` | ERP 매입 세부 (거래명세서 확정) | product_code, purchase_date, quantity, amount, total, supplier | PurchaseHistory · Order · get_stock_flow RPC |
| `inventory_checks` | 실재고 스캔 | product_code, warehouse_stock, warehouse_stock_2, store_stock, store_stock_2, store_stock_3, checked_at, checked_by | Scan · Requests(실재고차이) |
| `product_arrivals` | 상품입고 헤더 | arrival_date, checked_by, checked_by_id, total_items, total_qty, match_count, mismatch_count, expiring_count, final_decision (all_match/has_mismatch), supplier_summary, note | ProductArrivalPage |
| `product_arrival_items` | 상품입고 아이템 | arrival_id (FK CASCADE), product_code, product_name, supplier, qty, status (pending/match/mismatch/expiring) | ProductArrivalPage |
| `return_requests` | 반품 요청 | product_code, product_name, supplier, qty, current_stock, purchase_price, reason, requested_by, requested_by_id, status (pending/sent/done/cancelled) | Order · ReturnListPanel |
| `stock_reconciliation` | 재고 정산 세션 | id, period_start, period_end, status, created_by | StockReconciliationTab |
| `stock_reconciliation_items` | 재고 정산 아이템 | reconciliation_id, product_code, adjustment_qty, reason, confirmed | StockReconciliationTab |

**중요 컬럼명 매핑** (project_product_columns 규칙 준수):
- 실제배정구역: DB `real_map` ↔ JS `realMap` (product.real_map)

### 21-3. 발주 · 진열 요청

| 테이블 | 역할 | 주요 컬럼 |
|-------|-----|---------|
| `order_requests` | 발주 요청 | product_code, qty, requested_by, requested_at, status (pending/sent/done), supplier |
| `display_requests` | 진열 요청 (3단계 워크플로우) | product_code, product_name, zone, requester_id, assignee_id, status (pending/prepared/done), created_at, prepared_at, completed_at, prepared_by, completed_by |
| `zone_mismatches` | 구역 불일치 캐시 | product_code, real_map, spec, updated_at (products 원본에서 파생) |

### 21-4. 공급사 · 결제 · 정산

| 테이블 | 역할 | 주요 컬럼 |
|-------|-----|---------|
| `vendors` | 공급사 마스터 | id, company_name, biz_num, phone, contact_name, category (위탁/선결제/회전/기타), password_hash (로그인용) |
| `supplier_balances` | 잔고 스냅샷 (OCR 확정 시) | id, supplier, amount, snapshot_type, saved_at |
| `supplier_payments` | 결제 원장 (2026-07-31) | supplier_name, payment_date, amount, method (transfer/cash/card/check/offset/etc), memo, created_by, created_by_id |
| `supplier_payment_allocations` | 결제→매입건 배분 M:N | payment_id, ocr_confirmed_item_id, allocated_amount |
| `supplier_balance_configs` | 공급사별 잔고 설정 | name (PK), opening_balance, opening_date, note |
| `ocr_confirmed_items` | OCR 확정 매입 아이템 | supplier, product_name, quantity, amount, purchase_date, saved_at |

**잔액 계산**: `SUM(ocr_confirmed_items.amount) - SUM(supplier_payments.amount)` (allocations 로 세부 배분)

### 21-5. OCR 부가

| 테이블 | 역할 |
|-------|-----|
| `ocr_synonyms` | 상품명 동의어 학습 (오인식 → 정정) |
| `ocr_supplier_aliases` | 공급사 별칭 (아톰팜=아톰파마 등) |
| `ocr_templates` | 공급사별 컬럼 매핑 템플릿 |
| `ocr_deleted_rows` | OCR 삭제 이력 (되돌리기용) |
| `invoice_images` | 원본 거래명세서 이미지 (Cloudinary URL) |

**중요 컨텍스트**: 코스트팜은 **수신처** (약국 체인) · OCR 에서 공급처로 나오면 오인식 (project_ocr_context)

### 21-6. HR · 계약 · 사직 · 연차

| 테이블 | 역할 | 컬럼 요약 |
|-------|-----|----------|
| `leave_requests` | 연차 신청 | employee_id, start_date, end_date, days, reason, status (pending/approved/rejected), approved_by, approved_at |
| `resignation_requests` | 사직서 | employee_id, resign_date, reason (13사유 카탈로그), signature (base64), status, approved_by |
| `lunch_requests` | 점심 불참 | employee_id, date, attended (bool), reason |
| `employee_contracts` | 근로계약서 저장 | employee_id, contract_data (JSONB), signature, pdf_url (Google Drive), signed_at |
| `contract_clauses` | 계약서 조항 CMS (2026-08-05) | key (PK), title, content (긴 텍스트), order_index, updated_at |
| `hr_forms` | HR 양식 템플릿 | id, title, category, file_url (Cloudinary/Drive), uploaded_by, created_at |

**정본**: `project_contract_full_text_2026-08-04` (8항목·13사유·5조항) · **원본 참조**: `src/images/근로계약서1,2.jpg` (고용노동부 표준보다 우선)

### 21-7. 게시판 · 커뮤니티 · 약사

| 테이블 | 역할 |
|-------|-----|
| `board_posts` | 게시글 (title, body, category, author, author_id, created_at) |
| `board_post_images` | 첨부 이미지 (Cloudinary URL) |
| `board_post_comments` | 댓글 (accepted 플래그 · 채택 기능) |
| `board_post_reactions` | 이모지 반응 |
| `pharmacist_menu_items` | 약사 자료 (title, category, url, thumbnail, uploaded_by) |

### 21-8. 알림 · 설정 · 이력

| 테이블 | 역할 |
|-------|-----|
| `notifications` | 인앱 알림 (employee_id, title, body, type: info/success/warning/alert, read, created_at) |
| `settings` | 앱 전역 설정 (key/value JSONB · `wageRates`, `seasonRanges`, `defaultScheduleTypes`, `employeeWageOverrides` 등) |
| `permissions` | 페이지별 read/write 최소 level |
| `product_import_log` · `stock_import_log` · `ocr_import_log` | 각 임포트 이력 (진단용) |
| `reservations` | 당직·특별 근무 예약 |

### 21-9. 완료된 인덱스 (성능)

**핵심 인덱스** (실측 · migrations 및 `supabase_functions_and_tables.sql`):
- `idx_ocr_confirmed_saved_supplier` ON `ocr_confirmed_items(saved_at DESC, supplier)` → suppliers/top-products 50~70% 단축
- `idx_inventory_checks_code_date` ON `inventory_checks(product_code, checked_at DESC)` → inventory-latest 최신값
- `idx_stock_history_snapshot_date` · `idx_stock_history_product_code` · `idx_stock_history_snapshot_product` (복합)
- `idx_purchase_details_product_code` · `idx_purchase_details_purchase_date` (DESC)
- `idx_products_product_code` · `idx_products_hidden` (partial · hidden IS TRUE 만)
- `idx_product_arrivals_date` · `idx_product_arrival_items_arrival` · `idx_product_arrival_items_code`
- `idx_return_requests_*` (created, supplier, status, code)
- `idx_vendors_category` · `idx_zone_labels_number`
- `idx_sup_pay_supplier_date` · `idx_sup_pay_date` · `idx_alloc_payment` · `idx_alloc_invoice`

---

## 22. Supabase RPC · 서버 함수

**호출 방식**: `supabase.rpc('function_name', { p_from: ..., p_to: ... })`
**정의 파일**: `docs/supabase_functions_and_tables.sql` (Section 2)

### 22-1. `get_stock_flow(p_from date, p_to date)`

**용도**: 재고관리 상품현황 · 단일 SQL 조인으로 60~100 API → **1 RPC** 통합
**성능**: 기존 10~30초 → **<500ms** (수십배 향상)
**언어**: PL/pgSQL (v1) · SQL STABLE (v2 · 하위 호환용)
**호출 위치**: `server/routes/stockManage.ts` · SupplierTab · FlowTab

**반환 컬럼** (23필드):

| 컬럼 | 타입 | 설명 |
|-----|-----|-----|
| product_code | text | 상품 코드 |
| product_name · supplier · spec | text | 상품·공급사·규격 |
| opening_stock · purchase_qty · sale_qty · disposal_qty · closing_stock | int | 재고 흐름 |
| total_amount | numeric | 총 금액 |
| optimal_stock · sale_price · purchase_price · current_stock · min_order | numeric/int | 상품 정보 |
| last_purchase_date · first_purchase_date | text | 매입 기간 |
| purchase_count · purchase_total_qty · purchase_total_amount | int/numeric | 매입 집계 |
| **sale_qty_month** | int | (확장 2026-07-30) 최근 30일 판매량 합산 |
| **sale_amount_month** | numeric | (확장) 최근 30일 판매액 합산 |
| **last_purchase_qty** | int | (확장) 최근 매입일의 매입 수량 |

**필터**: `p.hidden IS NOT TRUE` AND (기간 내 판매/매입 이력 있거나 현재고 > 0)

**CTE 구조**:
- `sh_agg` — stock_history 기간 집계 (text→numeric 안전 캐스팅)
- `sh_month` — 최근 30일 판매량+판매액
- `pd_agg` — purchase_details 매입 이력 집계
- `pd_last` — DISTINCT ON · 각 상품 최근 매입일의 수량

### 22-2. `get_inventory_latest()` (rpc_only_2026-08-05.sql)

**용도**: 각 product_code · 가장 최근 inventory_check 스냅샷 반환
**대체 구현**: `server/routes/products.ts` `GET /api/inventory-latest` (in-code SQL fallback)

### 22-3. 향후 RPC 후보

- `get_supplier_ledger(supplier, from, to)` · 결제·매입 통합 원장 (현재 `server/routes/supplierPayments.ts` SQL 로직)
- `get_purchase_summary_by_period(from, to, groupBy)` · 매입 집계 (현재 `server/routes/purchase.ts`)

---

## 23. 백엔드 아키텍처 상세

### 23-1. 디렉토리 (6-A 구조)

```
megatown-staff-scheduler/
├── server.ts                     # Entry point (Express + Vite middleware · 193 lines)
├── package.json                  # Node 20+ · dev: tsx · build: vite + esbuild
├── vite.config.ts · vitest.config.ts · tsconfig.json
├── render.yaml                   # Render 배포 설정
├── docs/                         # 이 문서 · TASKS · PAYROLL · AGENT_PRINCIPLES · SQL
├── migrations/                   # 19개 DDL SQL 파일 (수동 apply)
├── scripts/                      # 진단·마이그레이션 스크립트 (mjs · ts · py)
├── public/                       # sw.js · products.json · YOLO 모델 (best.onnx · ppocr)
├── prisma/                       # (미사용 · 정리 후보)
├── uploads/                      # multer 업로드 임시
├── logs/                         # 서버 로그 (14일 자동 정리)
├── src/                          # React 프론트엔드 (118 tsx · 74 ts)
│   ├── App.tsx                   # Page 라우팅 (History API · react-router 없음)
│   ├── main.tsx · index.css
│   ├── types.ts                  # AuthSession · Employee · Schedule · PagePermissions
│   ├── components/               # 페이지·서브·공통
│   │   ├── common/               # 22개 공통 컴포넌트 (섹션 10 참조)
│   │   ├── shared/               # 도메인 재사용 (HiddenManagerModal 등)
│   │   ├── LandingPage/          # 2428 lines · God Component
│   │   ├── SchedulePage/ · DisplayPage/ · OrderManagePage/ (3224 lines)
│   │   ├── OcrPage/RawOcrTable/  # 5268 lines · God Component · 훅 20+ 분리
│   │   ├── ContractWriterPage/   # 2680+ lines · God Component
│   │   ├── StaffManagePage/      # 2773 lines
│   │   ├── ScanPage/ · ScanPage.tsx (1392 lines)
│   │   └── AppNavHeader.tsx · AppFooter.tsx · BottomNav.tsx
│   ├── hooks/                    # 10 훅 (섹션 11 참조)
│   ├── lib/                      # 유틸
│   │   ├── format.ts             # fmtWon · fmtDate 통합
│   │   ├── productsCache.ts      # 상품 맵 캐시
│   │   ├── cloudinaryUpload.ts · ocrRowFilter.ts · stockPeriodUtils.tsx
│   │   └── payroll/              # 인건비 계산 6파일 + index.ts barrel
│   ├── services/                 # 직접 Supabase 호출 (예외 2건)
│   │   ├── scheduleService.ts    # 스케줄 CRUD · 프론트 번들 혼입 문제 · 리팩 예정
│   │   └── notificationsService.ts
│   ├── controllers/              # scheduleController (서버 실행 · 프론트 번들 혼입)
│   ├── styles/tokens.ts          # 디자인 토큰 (섹션 9 참조)
│   ├── constants/                # zoneLabels · storeMapLayout · displayZones
│   ├── utils/                    # productClassify · vendorNameNormalize
│   ├── supabase/client.ts        # Supabase 클라이언트 (service role key)
│   └── keys/                     # Google OAuth JSON (실측 커밋됨 · 검토 필요)
└── server/                       # Express 백엔드
    ├── config/ocrConfig.ts       # OCR 엔진 설정
    ├── middleware/requireAuth.ts # JWT 인증 (T3 · 원복 상태)
    ├── models/                   # (미사용 · 정리 대상)
    ├── routes/                   # 36 라우터 파일 · 228+ endpoints (섹션 8-D 참조)
    ├── ocr/                      # OCR 파이프라인 (섹션 24 참조)
    │   ├── gemini.ts             # ★ 수정 금지 (feedback_gemini_untouchable)
    │   ├── mistral.ts · ppuPaddle.ts · slanetTable.ts · tableLayout.ts
    │   └── pipeline/stages/      # 01~11 stages
    ├── utils/                    # logsCleanup · sanitize
    ├── googleDrive.ts            # 계약서 PDF Drive 업로드 (Service Account)
    ├── productCache.ts           # in-memory 상품 맵 · /products.json 응답
    └── xlsx.ts                   # 공통 xlsx 파서
```

### 23-2. server.ts 부팅 순서

1. `dotenv/config` · 환경변수 로드
2. Supabase `products.real_map` 컬럼 존재 확인 (경고만)
3. VAPID 키 있으면 `webpush.setVapidDetails()`
4. `compression()` · `express.json()` 2계층 (10MB 기본 · 100MB 대용량 경로)
5. `cookieParser()` · `express.static("uploads")`
6. Public 라우터: `authRouter` · `notificationsRouter` · `pharmacistMenuItemsRouter`
7. 인증 미들웨어 (**T3 원복 상태** · 사내 사용 문제 · Render 직전 재도입)
8. 나머지 라우터 등록 (36개)
9. `/products.json` 동적 엔드포인트 (in-memory 캐시)
10. Vite dev middleware (개발) OR `express.static("dist")` + SPA fallback (프로덕션)
11. `cleanupStaleLogs()` · 14일 초과 로그 삭제
12. `httpServer.listen(PORT)` · 기본 3000

### 23-3. 미들웨어 카탈로그 (`server/middleware/`)

| 미들웨어 | 상태 | 역할 | 파일 |
|--------|-----|-----|-----|
| `requireAuth(req, res, next)` | **원복** (T3-defer) | `/api/` 접두어만 인증 · SPA·정적자원 skip · 미인증 401 | `requireAuth.ts` |
| `authorize(minLevel)` | 원복 | 최소 level 확인 · 부족 시 403 | `requireAuth.ts` |
| `issueToken(res, payload, rememberMe)` | 활성 (auth.ts) | JWT 발급 · httpOnly 쿠키 `mt_auth` · HS256 · 24h/30d | `requireAuth.ts` |
| `clearToken(res)` | 활성 (auth.ts) | 로그아웃 쿠키 제거 | `requireAuth.ts` |
| `cookieParser` | 활성 | 쿠키 파싱 | (npm 패키지) |
| `compression()` | 활성 | gzip 압축 | (npm 패키지) |

**Body parser 상세** (2026-08-05 T37 · DoS 방어):
- 일반 API: `express.json({ limit: "10mb" })`
- 대용량 경로 (100MB) · LARGE_BODY_PATHS 배열 우선 등록:
  `/api/ocr`, `/api/invoice-images`, `/api/hr-forms`, `/api/resignations`, `/api/board`, `/api/pharmacist-menu-items`, `/api/employee-contracts`, `/api/schedules`
- xlsx raw: `express.raw({ type: "application/octet-stream" })` · products 100MB · stock 50MB · vendors 20MB
- `req._body` 플래그로 재파싱 자동 skip (앞선 parser 가 실행되면 뒤 parser 는 no-op)

### 23-4. 서비스 레이어 (`src/services/` · 6-C)

| 파일 | 역할 | 이슈 |
|-----|-----|-----|
| `scheduleService.ts` | 스케줄 CRUD 직접 Supabase 호출 | **프론트 번들 혼입 문제** (T-arch #6 · 리팩 예정) |
| `notificationsService.ts` | 알림 CRUD 직접 Supabase 호출 | notifications 테이블 전용 |

**원칙**: 프론트는 원칙적으로 `fetch()` → Express BFF 경유 · 위 2건은 예외.

### 23-5. 유틸 (`server/utils/`)

| 파일 | 역할 |
|-----|-----|
| `logsCleanup.ts` | `cleanupStaleLogs()` · 14일 초과 로그 파일 삭제 · 부팅 시 1회 |
| `sanitize.ts` | 입력 sanitize (HTML tag 제거 등) |

### 23-6. 캐시 계층

| 대상 | 위치 | TTL | 무효화 |
|-----|-----|----|------|
| 상품 맵 | `server/productCache.ts` | 10분 | 상품 편집 시 flush |
| 저재고 | `/api/stock-manage/low-stock` | 2분 | products-hidden-changed 이벤트 |
| 공급사 (프론트) | `useVendors` 훅 | 5분 | vendors-changed 이벤트 |
| 상품 (프론트) | `src/lib/productsCache.ts` | 세션 | 페이지 진입 시 prefetch |
| 세션 (JWT) | httpOnly 쿠키 | 24h/30d | logout · 만료 |

### 23-7. 외부 서비스 연동

| 서비스 | 용도 | SDK · 파일 |
|-------|-----|----------|
| **Supabase** | Postgres DB · Storage | `@supabase/supabase-js@2.108` · `src/supabase/client.ts` |
| **Google Drive** | 계약서·이력서 PDF 저장 | `googleapis@174` · `server/googleDrive.ts` · Service Account (`src/keys/*.json`) |
| **Cloudinary** | 게시판·양식·서명 이미지 | `cloudinary@2.10` · `src/lib/cloudinaryUpload.ts` |
| **Google Gemini** | OCR 기본 엔진 (★수정 금지) | `@google/genai@2.4` · `server/ocr/gemini.ts` |
| **Mistral (Pixtral)** | OCR 대체 | HTTP · `server/ocr/mistral.ts` |
| **web-push** | 웹푸시 알림 | `web-push@3.6` · `public/sw.js` |
| **ONNX Runtime** | 테이블 구조 인식 (실험) | `onnxruntime-node@1.27` · `sku110k-yolo11-n640.onnx`, `best.onnx`, `ppocr/` |

### 23-8. 통신 표준 (6-A)

- 원칙: 프론트 `fetch()` → Express BFF → Supabase (직접 Supabase 접근 최소화)
- 표준 응답: `{ ok: true, data: ... }` / 리스트 `{ rows: [...], has_more: bool }` / 에러 `{ error: "...", code: "UNAUTHORIZED"|"FORBIDDEN" }`
- 에러 status: 400 (잘못된 요청) · 401 (미인증) · 403 (권한 부족) · 404 (없음) · 500 (서버)

### 23-9. 로깅 규칙

- 서버 부팅: `[Server] ...`, `[SETUP REQUIRED] ...`
- 미들웨어: `[requireAuth 401] ${req.method} ${req.originalUrl} · cookie=... · authHeader=... · secretSet=...`
- OCR: `[OCR ${stage}] ...`
- 로그 파일: `logs/*.log` · 부팅 시 14일 초과 자동 정리 (`cleanupStaleLogs()`)

### 23-10. 상태 관리 (프론트 · 6-A)

- Redux/Zustand 등 미사용 · `useState` + `useEffect` + `useCallback` 순수 React
- 전역 이벤트: `window.dispatchEvent(new CustomEvent(...))` (섹션 8-A 참조)
- 세션: `useAuth()` 훅 + localStorage (`megatown_auth_session`)
- 상품 캐시: `src/lib/productsCache.ts` (prefetch + Map)
- 서버 캐시: `server/productCache.ts` (in-memory · 10분 TTL)

---

## 24. OCR 파이프라인 · 11 stages 상세

**엔진 파일** (`server/ocr/`):
- `gemini.ts` — Google Gemini 2.0 Flash (기본) · **★수정 금지** (feedback_gemini_untouchable)
- `mistral.ts` — Pixtral (대체)
- `ppuPaddle.ts` — PPU-Paddle OCR (한국어)
- `slanetTable.ts` — SLANet 테이블 구조 인식 (ONNX)
- `tableLayout.ts` · `tableStructure.ts` — 테이블 후처리

**파이프라인 11 stages** (`server/ocr/pipeline/stages/`):

| # | 파일 | 역할 |
|---|-----|-----|
| 01 | `01-preprocess.ts` | 이미지 전처리 (sharp · 리사이즈 · 대비 조정) |
| 02 | `02-ocr-engine.ts` | OCR 엔진 호출 (Gemini/Mistral 선택) |
| 03 | `03-vendor-match.ts` | 공급사 자동 매칭 (aliases + fuzzy) |
| 04 | `04-template.ts` | 공급사별 컬럼 매핑 템플릿 적용 |
| 05 | `05-normalize.ts` | 데이터 정규화 (숫자·날짜·상품명) |
| 06 | `06-math-fill.ts` | 수량·단가·금액 상호 추론 |
| 07 | `07-filter.ts` | 노이즈 행 제거 |
| 08 | `08-verify.ts` | 검증 (총액·합계 일치) |
| 09 | `09-totals.ts` | 총계 산출 |
| 10 | `10-fallback.ts` · `10b-rearrange.ts` | 실패 시 재배치 |
| 11 | `11-learn.ts` | 학습 데이터 저장 (synonyms · aliases · templates) |

**부가 파일**:
- `preprocess.ts` · `parse.ts` · `match.ts` · `schema.ts` · `barcode.ts`
- `invoice-vocab.ts` — 거래명세서 도메인 어휘
- `excludedSuppliers.ts` — 오인식 잘 되는 공급사 제외 (예: 코스트팜)
- `metadataKV.ts` · `fieldMatchLog.ts` — 매칭 로그

**검증 실패 엔진** (feedback_ocr_failed_engines · 재시도 금지):
- multilingual-purejs-ocr 등

**중요 컨텍스트** (project_ocr_context): 코스트팜은 수신처(약국 체인) · OCR 에서 공급처로 나오면 오인식

---

## 25. 프로젝트 명명 규칙 · import · 파일 규약

### 25-1. 파일 명명 규칙

| 종류 | 규칙 | 예 |
|------|-----|----|
| 페이지 컴포넌트 | PascalCase · `XxxPage.tsx` · 폴더 단위 (index.ts export) | `DisplayPage/DisplayPage.tsx` |
| 훅 | `useXxx.ts` · camelCase | `useVendors.ts` |
| 유틸 | camelCase · `xxxUtils.ts` 지양 (동사·명사 명확) | `format.ts`, `vendorNameNormalize.ts` |
| 서버 라우터 | camelCase · `xxx.ts` (routes 폴더) | `purchaseHistory.ts` |
| SQL 마이그레이션 | `create_xxx.sql` · `add_xxx.sql` · `perf_xxx.sql` + `_YYYY-MM-DD.sql` 접미 | `create_zone_labels_2026-08-05.sql` |
| 문서 | UPPER_CASE.md · `docs/` | `MENU_STRUCTURE.md`, `TASKS.md` |

### 25-2. import 규칙

- alias 미설정 (`@/...` 없음) · 상대경로 `../` 사용
- 배럴 export: `src/lib/payroll/index.ts` · `src/components/DisplayPage/index.ts` 등
- type import 명시: `import type { AuthSession } from "../types";`
- 서버 imports: `import { supabase } from "../../src/supabase/client";` (server/routes 에서 접근)

### 25-3. 커밋 메시지

- Conventional (`feat` · `fix` · `refactor` · `docs` · `style` · `perf` · `test` · `chore`)
- 한국어 본문 허용
- 예: `refactor(contract-settings): 시급 UI를 settings.wageRates 로 통일 (즉시 서버 저장)`
- Co-authored 태그: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

### 25-4. 절대 수정 금지 파일 (사용자 명시)

- **iOS 바코드 스캐너**: `src/components/BarcodeScanner/` · 특히 `zbar.ts`, `hooks/`, `imageProcessing.ts` (feedback_ios_untouchable)
- **Gemini OCR**: `server/ocr/gemini.ts` (feedback_gemini_untouchable · ONNX 쪽만 수정 가능)

### 25-5. 파생컬럼 사용 금지 (feedback_no_derived_columns)

- 계산된 값을 저장한 컬럼 = 파생컬럼 = **사용자 허락 후에만**
- 원칙: 있는 테이블에서 조회 · 계산은 서버/클라이언트 로직
- 예: `total_amount = quantity * unit_price` 저장 X → SELECT 시 계산 (또는 인덱스로 대체)

### 25-6. 회귀 방지 워크플로우

**필수 검증 (매 편집 후)**:
```powershell
npm run lint        # tsc --noEmit · TS 통과
npm run build       # vite build + esbuild · 빌드 성공
npm run test        # vitest (필요 시)
```

3개 통과 → 로컬 자동 커밋 (사용자 확인 없이 · feedback_auto_commit)
**Remote push 는 절대 안 함** (사용자 명시 승인 시에만 · feedback_git_push)

---

## 부록 — 참고 문서 (프로젝트 내)

- `docs/TASKS.md` — 현재 진행중·대기 작업 목록 (**세션 시작 시 필독**)
- `docs/PAYROLL_ALGORITHM.md` — 인건비 계산 알고리즘 (payroll/ 정본)
- `docs/AGENT_PRINCIPLES.md` — 에이전트 위임 원칙
- `docs/db_top6_uuid_migration_plan.md` — DB UUID 전환 계획
- `docs/supabase_functions_and_tables.sql` — Supabase RPC · 테이블 스냅샷 (인덱스·get_stock_flow 등)

**중요**: 프로젝트 전체 정리는 **오직 이 파일** (`docs/MENU_STRUCTURE.md`) 하나에 통합. 별도 정리 파일 생성 금지 (사용자 명시 요구 · 2026-08-06).

---

## CHANGELOG · 변경 이력

### 2026-08-06 (6차 · 대규모 세션 · 100+ 커밋 · 구조 재정비 · UI/공통화/보안/Dead code)

**요약**: 이번 세션은 로컬 커밋 100건 이상 · 세션 전체 통합 정리. UI/UX 다듬기 → 공통 자산 확장 (7종) → 보안·타입 강화 → 서버·프론트 폴더 재구성 → dead code 대량 삭제 → localStorage → DB 이관.

#### UI/UX (사용자 요청 반영)
- **발주요청** · 공급사 분류 필터 추가 (`25dce84`)
- **손실추적** · 서브탭 (현황/이력) · 날짜별 스냅샷·이력·집계 (`859c37f`) · 구역·단가·판매가 컬럼 (`fe08712`, `b18419b`)
- **반품필요** · 판매 통합 · 이름 정제 (`058e92d`) · VAT 배지 → 텍스트 (`258e845`)
- **부가세** · 자동 감지 · 이름 힌트 · 요약 텍스트화 (`cc4ccae`)
- **매입추이** · 3-metric 탭 + 원형 차트 재구성 (`7d88c03`)
- **품절임박 ERP 기준** · 서브탭 배지·정렬 정리 (`92ec007`)
- **결제 탭** · 최근결제일·결제액 컬럼 (`a6c8e8d`) · 기간 내 결제 컬럼 제거 (`b0e5c52`)
- **랜딩 페이지 파스텔 톤 통일** (`ed93328` · mobile-ui-designer)
- **실재고 입력** · 누적 (add) UX · zone별 저장 (`4113741`)
- **CATEGORY rename**: 60일회전 → 60회전 · 90일회전 → 90회전 (`44459b6`)

#### 공통화 (Part II 자산 확장)
- 신규 컴포넌트 5종 · `VendorInfoHeader` · `VendorInfoModal` · `InventoryEditModal` · `InventoryEditPanel` · `ConfirmDialog`
- 신규 훅 4종 · `useConfirm` · `useKvSetting` · `useFetch` · `useColumnResize`
- 실재고 입력창 · InventoryEditModal 공통화 (`fabd95f`) · 발주요청 상세 모달 교체
- **컬럼 리사이저** · PurchaseHistoryList (T-UI-컬럼리사이저 · `6a3dcd2`) · 전 프로젝트 원칙
- **fmtWon·fmtDate** 유틸 통합 · 8 파일 (T-SLIM A Phase 2 · `8a5675b`)
- **useSortableTable** 확대 · ScanPage · StockArrivalPage · StockCheckPage · PurchaseHistoryList · HrFormsPage · SalesTrendPage LossTrackerTab · 7 파일 (`4d6b703`~`1750b15`)
- **window.confirm** → useConfirm 통합 · 10 파일 (T-SLIM D · `6a2f45f`, `6e6690e`)
- **CSS Phase 2** · 디자인 토큰 통일 · SupplierTab · SalesTrendPage · BusinessManagePage · RequestsPage · BoardPage · StaffManagePage (`8fdf697`~`481d6d5`)

#### 보안·타입
- **password_hash 응답 노출 제거** (security-architect · `71a58e4`)
- **T-SLIM · as any 정리** · server 6 파일 (`9673da1`) · frontend hooks/lib/common (`7a08a33`)
- **T26 · `select('*')` → 명시 컬럼** · Group1/2/3 (`34a9a3f`~`3b78425`)
- **응답 shape 표준화** · 6 라우터 · T-SLIM E (`3d3de7f`)

#### 아키텍처 재구성
- **`server/ocr/` 재구성** · 기능별 서브폴더 (engines · tables · parsing · logging · rules · pipeline) · barrel re-export 하위 호환 (`3e7c150` · T-OCR-Restructure)
- **`server/routes/` 재구성 Phase 2** · 도메인 그룹 서브폴더 · auth · board · daily · schedule · settings · staff (`d56aff4`~`f1c1dbc`)
- **T-Restructure Phase 1** · shim 삭제 · service·utils 통합 (`d9864df`)
- **scheduleService** · src → server 이동 · 프론트 번들 분리 (`3cd7aff`)
- 샘플 xlsx 파일 · src/ → data/samples/ 이동 (`a709c8b`)

#### 신규 서버 라우터·엔드포인트
- `server/routes/lossTracking.ts` · 손실추적 이력 (T-LOSS-HISTORY)
- `GET /api/supplier-payments/latest-per-supplier` · 최근결제일·결제액 (`a6c8e8d`)
- `GET /api/vapid-public-key` · 웹푸시 구독용 (T-VAPID-Route · `f9ba80e`)

#### DB 마이그레이션 · 이관
- `migrations/perf_indexes_2026-08-06.sql` · 성능 인덱스 4개 (T-DB-Audit · `c0b9af5`)
- `migrations/loss_tracking_daily.sql` · 손실 이력 테이블
- **T-DB-Migrate-LocalStorage** · localStorage → settings 테이블 4건 (`e036766`)
  - `vat_expenses` · `vat_taxfree_sales` · `vat_prepare_state` · `contract_writer_settings`

#### Dead code 삭제 (레포 슬림화)
- `server/ocr/barcode.ts` · `barcodeService.ts` · 미사용 (`ed149cb`)
- `server/routes/stockReconciliation.ts` · `inventorySales.ts` · mount 안 됨 (`03ec97b`)
- `src/components/OcrPage/{ItemsTable · MetaAccordion}.tsx` · `src/components/DayTimelineModal/DragBar.tsx` · `src/constants/index.ts` · `src/images/{사직서·cetegory·제품존수평윙·map·근로계약서1·근로계약서2}` · `public/products.json` · `prisma/` · `.vercel/` · `assets/.aistudio` (`f09b191`, `46f7fd7`)
- **scripts/ 49개** 일회성 스크립트 일괄 삭제 (`18e1118`, `c9ff8e3`)

### 2026-08-06 (5차 · Supabase cap audit 완료 · 잔여 라우터 마이그레이션)

- **fix · 잔여 라우터 3곳 마이그레이션** (커밋 `82ff368`)
  - purchaseHistory.ts · /api/purchase-history · fetchAllWithRange
  - stockManage.ts · /api/stock-manage/stock-history · limit 최대 20000 케이스
  - stockManage.ts · dbCol 정렬 경로 · fetchLimit
  - inventorySales.ts · balance 2000 (deprecated 안전 조치)
- **safe (변경 X · 이미 ≤ 1000)**: productArrivals · products · stockReconciliation · stockManage 잔여

- **diag · supplier-purchase-summary** (커밋 `1eddbb9`)
  - `[supplier-purchase-summary] supplier_name NULL 스킵 30개` 진단 강화
  - 실패 supplier_code · product_code · 로그 출력 (사용자 조치 가이드)

### 2026-08-06 (4차 · Supabase cap 우회 확장 + fetchAllWithRange 유틸)

- **feat · server/utils/supabaseFetchAll.ts** 공통 유틸 신규 (커밋 `8b739b5`)
  - `fetchAllWithRange<T>(queryFactory, maxRows, pageSize)` · 페이지 loop 로 1000행 캡 우회
  - 모든 서버 라우터에서 재사용 가능

- **fix · stockManage.ts · 3곳 마이그레이션**
  - `/api/stock-manage/suppliers` · .limit(50000) → fetchAllWithRange (공급사 집계 · 재고관리 핵심)
  - `/api/stock-manage/top-products` · .limit(50000) → fetchAllWithRange
  - `/api/stock-manage/product-history` · .limit(5000) → fetchAllWithRange

- **남은 audit** (향후):
  - inventorySales.ts (deprecated) · purchaseHistory.ts · productArrivals.ts · products.ts · stockReconciliation.ts
  - 사용 빈도 별 우선순위

### 2026-08-06 (3차 · Supabase cap 우회 · 사용자 제보 픽스)

- **fix · Supabase 1000행 cap 우회** (커밋 `7b3f843`)
  - `server/routes/purchase.ts` · GET `/api/purchase-details`
  - 원인: Supabase REST API 기본 `max_rows: 1000` · `.limit(5000)` 지정해도 서버가 1000 캡핑
  - 증상: 매입이력 조회 · 5000행 요청해도 최신 1000행만 반환 · 기간 필터 무관하게 최근 데이터만 보임
  - 해결: `.limit(N)` → `range(0, PAGE-1)` + PAGE=1000 loop · effectiveLimit 까지 반복 fetch
  - 임포트 이력 정상 (20 배치 · 5개월치 16,655행 · coverage endpoint 확인)
  - 다른 라우터 · 같은 패턴 있을 수 있음 (향후 audit)

### 2026-08-06 (2차 · research-strategist 최종 통합)

- **MENU_STRUCTURE.md 전체 통합 최종화** · Part III 백엔드/DB/RPC 상세 5개 섹션 추가 (섹션 21~25)
  - 섹션 21 · DB 스키마 · 테이블별 상세 (인사·상품·발주·공급사·OCR·HR·게시판·알림 9영역)
  - 섹션 22 · Supabase RPC (`get_stock_flow` 23필드 반환 · `get_inventory_latest`)
  - 섹션 23 · 백엔드 아키텍처 상세 (디렉토리 · server.ts 부팅 순서 · 미들웨어 · 서비스 레이어 · 캐시 · 외부 서비스 8종)
  - 섹션 24 · OCR 파이프라인 11 stages 상세 (엔진 파일 · stages · 부가 · 검증 실패 목록)
  - 섹션 25 · 명명 규칙 · import · 파일 규약 · 절대 수정 금지 · 회귀 방지 워크플로우
- 파일 최상단 **핵심 원칙 강조** (모든 에이전트·개발자 필독 · 변경 시 이 파일 즉시 반영)
- 목차 · Part I/II/III 3분할 (메뉴 · UI · 백엔드/DB)
- 사용자 확정 요구 반영 (6-A 구조 · 6-B UI · 6-C 백엔드 통합 · SQL/RPC 정리)

### 2026-08-06 (1차)

- **T-TEST-매입이력-반응형** (커밋 `11e8f92`)
  - `PurchaseHistoryTab` by-vendor 뷰 · SplitPanel leftClassName
  - 모바일 max-h `60vh` → `calc(100vh-160px)` 확대
  - 원인: SupplierTab 필터바 wrap 시 · 리스트 영역 압축되어 안 보임
  - 파일: `src/components/OrderManagePage/PurchaseHistoryTab.tsx:888`

- **project-registrar 에이전트 신규** · 문서 관리 전담 (`.claude/agents/project-registrar.md`)
- **TASKS.md 원칙 확장** · 세션 시작 시 두 파일 read · 테스트·수정 워크플로우 4단계
- **MENU_STRUCTURE.md 전체 확장** (커밋 `d642156`) · Part I 메뉴 + Part II 공통 자산 12항목 · 630줄

### 2026-08-05

- **초판 MENU_STRUCTURE.md** (커밋 `8e0b59c`) · 180줄 · 메인 12 + 서브 30+
- 대량 세션 · T-C 근로계약서 CMS · T-PERF-1a/b 페이지네이션 · T25 useVendors · T-CSS Phase 1/2 (재고관리) · T-SLIM 통합 · 진열요청 3단계 토글 등

---

# Part IV — 페이지별 심층 액션·API·워크플로우·모달 (2026-08-06 확장 · research-strategist)

Part I 이 서브탭·기능 요약이라면 · Part IV 는 **"어떤 버튼을 누르면 어떤 API 가 호출되고 어떤 상태가 바뀌는지"** 를 실무 관점으로 정리합니다. 코드 실측 (RequestsPage · DisplayPage · OrderManagePage · BusinessManagePage · ContractWriterPage 등) 기준.

## IV-1. 재고관리 · 서브탭 액션 → API 매핑

발주·매입·결제·통계는 **하나의 OrderManagePage 인스턴스** 가 `initialTopTab` prop 만 바꿔 재사용 (`OrderManagePage.tsx` L190-196 useEffect) · re-mount 없음 · 데이터 캐시 유지 · 서브탭 이동 즉시.

**발주 (purchase-order · 3탭)** — `purchaseOrderDefaultTabs` L1203

| key · 색 | 라벨 · 아이콘 | 액션 → API |
|---------|--------------|-----------|
| `order` (sky) | 발주요청 · ShoppingCart | **[발주 전송]** → `POST /api/order-requests/bulk-send` |
| `need` (rose) | 발주필요 · ClipboardList | **[발주요청 등록]** → `POST /api/order-requests` · 중복 시 dupOrderModal |
| `critical` (amber) | 품절임박 · AlertTriangle | 실재고 (창고+매장) 임계치 이하 · 2026-08-04 신규 |

로드: `GET /api/order-requests` · `GET /api/stock-manage/low-stock` · `GET /api/inventory-checks`

**매입 (purchase · 6탭)** — `purchaseDefaultTabs` L1208 · 첫 진입 시 재정렬된 첫 탭 리셋 (L1249)

| key · 색 | 컴포넌트 · 주 액션 |
|---------|-------------------|
| `purchase-history` (sky) | `PurchaseHistoryTab` · 뷰 by-vendor/by-product · 매입 조회 |
| `return` (rose) | `ReturnListPanel` · 배지 (`dispatchEvent("return-need-count")`) |
| `receipt` (violet) | goods_receipts · **[OCR]** · **[확정]** → `PATCH /api/goods-receipts/:id/confirm` |
| `scan` (amber) | `ScanPage` (embedded) |
| `productarrival` (teal) | `ProductArrivalPage` (embedded) · 검수 |
| `reconciliation` (emerald) | `StockReconciliationTab` · 시스템 vs 실재고 |

매입이력 세부 (Phase A/B/C · #191): 좌 vendor (`SupplierTab` embedded) or product (`ProductRowCard`) · 우 KPI 4카드 (`VendorHeaderPanel`) + 매입원장/상품별/추이 3탭 (`PurchaseSubTabs`) + 3파이차트 (`CategoryPieChart` · `TopProductsPieChart` · `MonthlyPieChart`) · 계절 필터 (`SeasonButtons` · `useSeasonRanges` · MyPage 편집)

**결제 (payment · 3탭)** — `paymentDefaultTabs` L1216

- `vendor` (teal) · `PaymentInfoTab` · 잔고 자동 · 저장 시 `dispatchEvent("supplier-payment-added")`
- `payment-input` (amber) · 수기 결제 (계좌·현금·카드)
- `vat-prepare` (rose) · `VatPreparePage` 3탭 (매출·매입·신고서)
  - 매출: `GET /api/vat/summary?period=Y-1H|2H|Q1..Q4` · stock_history 자동
  - 매입: `GET /api/vat/vendor-breakdown` · `/api/vat/vendor-detail` · `vat_included` flag
  - 신고서: Phase 3 예정

**통계 (statistics · 5탭)** — `statDefaultTabs` L1221

`trending` (indigo · `/api/stock-manage/top-sales?months=&sort=&dir=`) · `category` (amber · ZONE_DEFS 기반) · `flow` (sky · `/api/stock-manage/raw` · [숨김]) · `supplier` (emerald · `/api/sales-trend/supplier`) · `diff` (rose · 시스템/실재고 차이)

**입고알림 (stock-arrivals)** — `StockArrivalPage.tsx`

**[웹푸시 방송]** → `POST /api/stock-arrivals/:id/broadcast` · **[예약발송]** `scheduled_at` 서버 크론 · **[수정]** `PATCH` · **[삭제]** `DELETE` · **[익명 구독]** `POST /api/anon-push-subscribe` · VAPID `GET /api/vapid-public-key`

**매장구역도 (store)** — 45개 구역 (aisle 1-8 A/B · 22 · 40 A/B/C · 벽면)

**[구역 라벨 편집]** (관리자) → lazy `page="zone-labels"` → `POST /api/zone-labels` → `dispatchEvent("zone-labels-changed")` → 매장구역도·통계·약사교육자료 즉시 재빌드

로드: `GET /api/zones` · `/api/zone-groups` · `/api/products-map` · `/api/inventory-latest`

## IV-2. 경영관리 · 서브탭 액션 → API

승인대기 배지: 60초 폴링 + `approval-count-updated` 이벤트 (`showApprovalBadge = level ≥ 2`)

**직원관리 (`StaffManagePage.tsx`)**

- **[직원 CRUD]** → `POST/PATCH/DELETE /api/employees(/:id)`
- **[이력서 업/삭]** → `POST/DELETE /api/employees/:id/resume` (multipart)
- **[스케줄 수정]** → `PATCH /api/schedules`
- **[근로계약서 작성]** → `dispatchEvent("staff-write-contract", { detail: { employeeId }})` → 서류작성 자동 진입 + 직원 자동선택

**승인대기 (approval-center · 2탭)** — `ApprovalCenterPage.tsx`

`leave` (teal · leaveCount) · `resignation` (rose · resignCount) · 카운트 병렬 `GET /api/leave-requests/pending-count` + `/api/resignations/pending-count`

**[연차 승인/반려]** → `PATCH /api/leave-requests/:id { status: "approved"|"denied" }` · **[사직서 승인]** → `PATCH /api/resignations/:id` (서명 필수) · `dispatchEvent("approval-count-updated")` · 부모(`BusinessManagePage`) `onCountsChange` 콜백

**점심불참 (lunch)** — `isAdmin = level ≥ 2`

로드: `GET /api/lunch-requests?date=` + `/api/lunch-attendance?date=` (병렬) · `/api/schedules` · `/api/settings?key=break_timeline_YYYY-MM-DD`

**[관리자 저장]** `POST /api/lunch-requests` · **[취소]** `DELETE /api/lunch-requests?employee_id=&date=` · **[휴게시각]** `POST /api/settings`

**각종양식 (hr-forms · `HrFormsPage.tsx`)** — 4카테고리 · `isManager = level ≥ 2`

**[업로드]** → `POST /api/hr-forms` (multipart · 10MB · 드래그&드롭) · **[삭제]** `DELETE /api/hr-forms/:id?editor_level=` · **[다운로드]** `GET file_url` (모든 인증자)

**서류작성 (document-writer · 3탭)** — `DocumentWriterPage.tsx` · lazy · 관리자 재정렬 (`tabOrder.documentWriter`)

`contract` (emerald · `ContractWriterPage`):
- 세전월급 자동 (시급 × 근무시간) · 서명 캔버스 · PDF
- **[저장]** → `POST /api/employee-contracts { employeeId, formData }`
- **[스캔 업로드]** → `POST /api/employee-contracts/upload` (multipart)
- 시급: `settings.wageRates` (직군별 주중/주말)

`resignation` (rose · `ResignationWriterPage`):
- 13사유 · 5조항 · 서명 · 관리자 승인
- **[저장]** → `POST /api/resignations` · `dispatchEvent("approval-count-updated")` (배지 즉시)

`settings` (indigo · `ContractSettingsPage`):
- 직군별 시급 · `settings.wageRates` 서버 저장 (모든 관리자 공유)
- 6 CMS 카테고리 (임금단서·근로시간·휴일·징계·기타·개인정보) — `contract_clauses`
- **[저장]** → `POST /api/contract-clauses` (T-C) · 로드 `GET /api/contract-clauses` · 실패 시 localStorage `contractClauses:v1` fallback + 1회 자동 마이그레이션

## IV-3. 요청메뉴 · 진열요청 3단계 워크플로우 (T-SCAN-1)

**탭 배지 카운트**: `GET /api/requests/pending-counts` · **30초 폴링** · 변화 시 현재 탭 재로드 · `inventory-checks-updated` 이벤트 시 inventory + order + products 재로드

**진열요청 표 컬럼** (사용자 확정 · 2026-08-05): 체크 · 상품명 · 진열구역 · 담당자 · **창고준비** · **진열완료** · 날짜

**상태 흐름**:
```
pending  (amber border-l)
   ↓ [창고준비] · 창고담당 or 관리자 · PATCH /prepare
prepared (sky border-l)
   ↓ [진열완료] · 진열담당 or 관리자 · PATCH /complete
done     (emerald border-l · opacity-60)
```

**권한 판별** (RequestsPage L155-161 · position/employeeRank):
- `isWarehouseStaff` (position "창고"|"물류" or rank "창고") → **[창고준비]** 표시
- `isDisplayStaff` (position "진열"|"매장" or rank "진열") → **[진열완료]** 표시
- `isAdminLevel8` (level ≥ 8) → 양쪽 · 되돌리기 · 강제 완료

**액션 & API**:
- **[창고준비]** → `PATCH /api/display-requests/:id/prepare { prepared_by, prepared_by_name }` · 토글 (`reverted` 응답 시 pending으로)
- **[진열완료]** → `PATCH /api/display-requests/:id/complete { completed_by, completed_by_name }` · 토글 (`revertedStatus` 응답으로 prepared/pending 되돌림)
- **[알림전송]** (관리자만) → 담당자별 그룹핑 · `POST /api/notifications { employee_id, title, body, type: "alert" }`
- **[선택/전체 삭제]** → `DELETE /api/display-requests/:id`
- 상품명: `note`에서 "진열 요청" suffix 제거 → fallback: `category` → `zone_label`

**다른 4탭 요약**:
- `mismatch`: `products.real_map ≠ products.spec` · `/api/zone-mismatches`
- `inventory`: `GET /api/inventory-checks` · 로그 모달 (`invLogOpen`) · **[발주요청]** 바로 등록
- `lunch`: `/api/lunch-requests?date=` (경영관리와 동일)
- `order`: 발주 탭과 데이터 공유 · 중복 감지 모달 (`dupOrderModal`)

## IV-4. 약사전용 · PharmacistPage · 4탭 (lazy)

관리자 재정렬 (`tabOrder.pharmacist`) · 교육 카테고리: `ZONE_DEFS` 기반 자동 (`buildEducationCategories()`) + 사용자 정의 (`app_settings.education_custom_categories`)

**교육탭 UI**: 좌측 트리 (폴더 펼침/접힘 · `toggleCat` · `expandedCats`) · 나머지 3탭은 stacked

**액션 & API** (관리자 level ≥ 8 · `PharmacistMenuSettingsPage.tsx`):
- **[자료 업로드]** → `POST /api/pharmacist-menu-items` · 20MB 제한
- **[수정]** → `PATCH /api/pharmacist-menu-items/:id`
- **[삭제]** → `DELETE /api/pharmacist-menu-items/:id?editor_level=`
- **[순서 변경]** → 2개 항목 order_index swap (2회 PATCH)
- **[PDF 뷰어]** (`PdfViewerModal.tsx`) · 우클릭·복사·드래그·키보드 전방위 차단 · 워터마크
- 좌우 split: `megatown_pharm_leftw` (240-560px 리사이즈)
- `zone-labels-changed` 이벤트 → 교육 카테고리 재빌드

## IV-5. 개별 페이지 액션 요약

**실재고확인 (ScanPage.tsx · T-SCAN-1)** — 좌 스캐너 · 우 5분리 테이블 (창고1·창고2·매장1·매장2·매장3)

스캔 즉시 → **상품정보 모달** (`ProductInfoCard.tsx`) 자동 팝업
- 5칸 인라인 편집 · 매장 슬롯별 **[진열요청]** · 담당자 자동 매칭
- **[숨김/보임]** 토글 → `dispatchEvent("products-hidden-changed")`
- 저장 시 → `dispatchEvent("inventory-checks-updated")`
- `parseRealMap("8A/냉/2B")` → 매장1/2/3 자동 분할

**[전체 저장]** `POST /api/inventory-checks/bulk` · **[진열요청]** `POST /api/display-requests` · 이력 `GET /api/inventory-checks?product_code=`

**스케줄표 (SchedulePage/SchedulePage.tsx)** — `isAdmin (level ≥ 2)` · Ctrl+Z undo · 인건비 표시

**[셀 편집]** `PATCH /api/schedules { employeeId, date, type, workingHours }` · **[직원 편집]** (`EmployeeFormModal.tsx`) `POST/PATCH /api/employees` · **[휴게시각]** (`BreakModal.tsx`) `POST /api/settings` · **[일일 타임라인]** (`DayTimelineModal.tsx`) 롱프레스

로드: `GET /api/schedules?year=&month=` · `GET /api/employee-contracts`

**상품입고 (ProductArrivalPage.tsx)** — 상태: pending · match · mismatch + expiring (독립)

**[최종 확인]** `POST /api/product-arrivals` · 이력 `GET /api/product-arrivals?limit=100&days=` · **[삭제]** `DELETE /api/product-arrivals/:id`

**연차신청 (LeavePage/LeavePage.tsx)** — `isManager = level ≥ 2`

**[신청]** `POST /api/leave-requests` · **[삭제]** `DELETE /api/leave-requests/:id` · **[승인/반려]** `PATCH /api/leave-requests/:id { status }`

로드: `GET /api/leave-requests?employeeId=` or `?all=true`

**게시판 (BoardPage.tsx)** — `isManager (level ≥ 2)` 공지 작성

**[글]** `POST /api/board/posts` · **[수정]** `PATCH` · **[삭제]** `DELETE /api/board/posts/:id?editor_id=&editor_level=` · **[댓글]** `POST /api/board/posts/:id/comments` · `PATCH/DELETE /api/board/comments/:id` · **[좋아요]** `PATCH /api/board/posts/:id` (like_count++)

**당직 예약 (ReservationPage/ReservationPage.tsx)** — TIME_SLOTS 09:00-21:00 30분 · PURPOSES 6종 · `isInternalStaff (level ≥ 2 · non-vendor)`

로드: `GET /api/staff-monthly` · `/api/reservations?date=` · `/api/blocked-slots?date=` · `/api/staff-availability?date=` · **[예약 등록]** `POST /api/reservations` · **[시간대 차단]** `POST /api/blocked-slots`

**OCR (OcrPage/OcrPage.tsx)** — 매입 > 거래명세서 진입

**[OCR 실행]** `POST /api/ocr?stream=1` (SSE · Gemini + ONNX · **⚠ Gemini 코드 수정 금지**) · 동의어 `GET/POST/PATCH/DELETE /api/ocr-synonyms/*` · 공급사 별칭 `GET/POST/PATCH/DELETE /api/ocr-supplier-aliases/*` · 템플릿 `POST /api/ocr-templates` · 잔고 `GET /api/ocr/search-balance` · `GET /api/supplier-balances`

**재고 확인 (StockCheckPage/StockCheckPage.tsx)** — 읽기 전용 · StockAxis + SellingAxis 독립 · **[검색]** `GET /api/stock-check?q=` (debounce · AbortController)

**내 정보 (MyPage/MyPage.tsx)** — 프로필·전화·비밀번호 · **계절 정의** (`SeasonRangesEditor.tsx`) 관리자 level ≥ 9 만

**권한 관리 (PermissionsPage/PermissionsPage.tsx)** — 탭 2개 (`permissions` · `app-settings`) · 11 페이지 최소 level · 직원별 0~9 슬라이더 · 환경설정 (`useSettings`)

## IV-6. 커스텀 이벤트 카탈로그

### 실시간 이벤트 (window CustomEvent)

| 이벤트명 | 발행 위치 | 구독 위치 | 용도 |
|---------|---------|---------|------|
| `zone-labels-changed` | `constants/zoneLabels.ts` (라벨 저장) | DisplayPage · CategoryTab · StoreZoneMap · SalesTrendPage · PharmacistPage | 구역 라벨 즉시 반영 |
| `vendors-changed` | VendorListEditor | `useVendors` · PurchaseHistoryTab | 공급사 리스트 재로드 |
| `supplier-payment-added` | PaymentInfoTab (결제 저장) | PaymentInfoTab (다른 카드) | 잔고 자동 갱신 |
| `return-need-count` | ReturnListPanel | OrderManagePage (반품 배지) | 배지 카운트 |
| `approval-count-updated` | ResignationApprovalPage · ResignationWriterPage | BusinessManagePage · ApprovalCenterPage | 승인대기 배지 즉시 |
| `products-hidden-changed` | ProductInfoCard · FlowTab · LowStockPanel | (구독 예정) | 숨김 상품 필터 |
| `inventory-checks-updated` | ProductInfoCard (실재고 저장) | ScanPage · RequestsPage · OrderManagePage | 재고 자동 재조회 |
| `staff-write-contract` | StaffManagePage (근로계약서 버튼) | DocumentWriterPage 진입 자동 선택 | 직원 자동 지정 |
| `tabs-reordered-{key}` | useSortableTabs | (커스터마이징) | 재정렬 알림 |

### 자동 폴링 · 세션

| 주기 | 위치 | 엔드포인트 · 조건 |
|------|-----|----------------|
| 30초 | RequestsPage | `/api/requests/pending-counts` (상시) |
| 60초 | ApprovalCenterPage · BusinessManagePage | pending-count (연차·사직서) · `showApprovalBadge (level ≥ 2)` |
| 30분 무활동 | useAuth 내부 | SessionTimeoutWarning 자동 |

### 웹푸시 (VAPID)

- `usePushSubscription` · 로그인 직후 자동 구독 (권한 팝업 1회)
- `POST /api/push-subscribe { employeeId, subscription }` · `POST /api/push-send { employeeId, title, body }`
- **익명**: LandingPage `[알림 구독]` → `POST /api/anon-push-subscribe`
- 진열요청 알림 · 입고알림 방송 등에 사용

## IV-7. 모달·팝업 카탈로그 (22종)

| 모달 | 파일 | 트리거 | 주 액션 |
|------|-----|-------|--------|
| 업로드 모달 (5탭) | LandingPage.tsx L1425 | LandingPage [업로드] | 상품·재고·공급사·매입·로그 xlsx |
| 공급사 로그인 | LandingPage.tsx L2167 | 공급사 아이콘 | vendor 로그인 |
| 비밀번호 입력 | LandingPage.tsx L2261 | 로그인 flow | 직원별 |
| 직원 편집 | EmployeeFormModal.tsx | 직원 카드 (관리자) | 직원 CRUD |
| 직원 캘린더 | EmployeeCalendarModal/EmployeeCalendarModal.tsx | 직원 이름 | 개인 월간 |
| 일일 타임라인 | DayTimelineModal/DayTimelineModal.tsx | 스케줄 셀 롱프레스 | 하루 상세 |
| 휴게 편집 | BreakModal.tsx | 스케줄 [휴게시간] (관리자) | 시간대 저장 |
| 상품정보 (T-SCAN-1) | ScanPage/ProductInfoCard.tsx | 스캔 즉시 | 5칸 실재고 · [진열요청] · [숨김] |
| 매입이력 (상품) | common/PurchaseHistoryList.tsx | 상품 클릭 | 공급사별 매입 |
| 구역 상세 | DisplayPage.tsx L2694 | 구역 카드 | 구역별 상품 |
| 직원 정보 | DisplayPage.tsx L2447 | 담당자 이름 | 오늘의 근무 |
| PDF 뷰어 | PharmacistPage/PdfViewerModal.tsx | 자료 항목 | 우클릭·복사·드래그·키보드 차단 · 워터마크 |
| 환경설정 | SettingsModal/SettingsModal.tsx | 톱니바퀴 | 직급/시급/근무지 |
| 세션 종료 경고 | SessionTimeoutWarning.tsx | 30분 무활동 임박 | [연장] [로그아웃] |
| 컬럼 매핑 (OCR) | OcrPage/ColumnMappingModal.tsx | OCR 결과 후 | 열 매핑 |
| 상품 매입 이력 | StockManagePage/ProductPurchaseHistoryModal.tsx | 상품 클릭 | 공급사별 매입 |
| 알림 벨 드롭다운 | NotificationBell.tsx | 헤더 벨 | 알림 · [모두읽음] |
| 중복 발주 확인 | RequestsPage.tsx L144 | 중복 감지 | 기존 stock 수정 |
| 실재고 이력 | RequestsPage.tsx L138 | inventory 로그 | 이력 조회 |
| RealMap 선택 | ScanPage/RealMapSelector.tsx | 구역 편집 | 구역 pick |
| 팝오버 (구역 배정) | DisplayPage/ZoneAssignPopover.tsx | 담당자 셀 | 담당자 pick |
| 팝오버 (구역 그룹) | DisplayPage/ZoneGroupPanel.tsx | 그룹 편집 | 그룹 CRUD |

## IV-8. 워크플로우 다이어그램 (5종)

### 진열요청 (T-SCAN-1)
```
[ScanPage] 바코드 스캔
   ↓ 상품정보 모달 자동 팝업
   ↓ [진열요청] (매장 슬롯별)
   ↓ POST /api/display-requests
   ↓ 진열담당자 자동 지정 (구역 → 담당자 매핑)

[RequestsPage · display 탭]
pending  (amber) 
   ↓ [창고준비] · PATCH /prepare
prepared (sky)
   ↓ [진열완료] · PATCH /complete
done     (emerald · opacity-60)

관리자 [알림전송] · POST /api/notifications (담당자별 그룹)
```

### 근로계약서
```
[StaffManagePage] 직원 카드
   ↓ [근로계약서 작성] · dispatchEvent("staff-write-contract")
   ↓ page=business-manage · subTab=document-writer · tab=contract
[ContractWriterPage] 자동 직원 선택
   ↓ settings.wageRates · 세전월급 자동
   ↓ contract_clauses (6 CMS) · 서명
   ↓ [저장] · POST /api/employee-contracts · PDF
```

### 사직서 (승인 흐름)
```
[ResignationWriterPage]
   ↓ 13사유 · 5조항 · 서명
   ↓ [저장] · POST /api/resignations · status="pending"
   ↓ dispatchEvent("approval-count-updated") · 배지 +1

[ApprovalCenterPage · resignation] 관리자
pending (rose)
   ↓ [승인] · PATCH /api/resignations/:id { status: "approved" }
   ↓ dispatchEvent("approval-count-updated") · 배지 -1
```

### 연차 (승인 흐름)
```
[LeavePage] 직원
   ↓ 날짜·사유 · [신청] · POST /api/leave-requests · status="pending"

[ApprovalCenterPage · leave] 관리자 · 60초 폴링
   ↓ [승인] · PATCH /api/leave-requests/:id { status: "approved" }
   ↓ 신청자 push 알림 (자동)
```

### 발주요청 · 전송 · 매입 확정
```
[Requests · order] or [OrderManage · purchase-order · need]
   ↓ [발주요청 등록] · POST /api/order-requests · 중복 시 dupOrderModal

[OrderManage · purchase-order · order] 공급사별
   ↓ [발주 전송] · POST /api/order-requests/bulk-send
   ↓ 카톡/문자/이메일 · 완료 후 clear

[재고관리 · 매입 · 거래명세서]
   ↓ [OCR 실행] · page=ocr · POST /api/ocr?stream=1 (SSE)
   ↓ Gemini/ONNX · 동의어·별칭 매칭
   ↓ [확정] · PATCH /api/goods-receipts/:id/confirm
   ↓ purchase_details 이관 · 매입이력 반영
```

## IV-9. 주요 액션 · 엔드포인트 매핑 (요약)

| 액션 | Method · Path |
|-----|--------------|
| 진열요청 창고준비 | `PATCH /api/display-requests/:id/prepare` |
| 진열요청 완료 | `PATCH /api/display-requests/:id/complete` |
| 발주요청 전송 (bulk) | `POST /api/order-requests/bulk-send` |
| 거래명세서 확정 | `PATCH /api/goods-receipts/:id/confirm` |
| 실재고 저장 (bulk) | `POST /api/inventory-checks/bulk` |
| 웹푸시 방송 (입고알림) | `POST /api/stock-arrivals/:id/broadcast` |
| 근로계약서 저장 | `POST /api/employee-contracts` |
| 근로계약서 스캔 업로드 | `POST /api/employee-contracts/upload` (multipart) |
| 사직서 저장 | `POST /api/resignations` |
| 이력서 업로드 | `POST /api/employees/:id/resume` (multipart) |
| 대기 카운트 조회 | `GET /api/requests/pending-counts` |
| 승인 카운트 (연차·사직서) | `GET /api/leave-requests/pending-count` · `/resignations/pending-count` |
| 구역 라벨 저장 | `POST /api/zone-labels` |
| 계약 조항 저장 | `POST /api/contract-clauses` |
| VAPID public key | `GET /api/vapid-public-key` |
| 익명 push 구독 | `POST /api/anon-push-subscribe` |

---

_이 문서는 코드 실측 기준 · 메뉴·자산 추가·변경 시 함께 업데이트 필요._
_마지막 확장: 2026-08-06 (research-strategist · Part II 공통 자산 카탈로그 + Part IV 심층 액션·API·워크플로우)_
