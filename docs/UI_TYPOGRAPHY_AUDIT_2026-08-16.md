# UI Typography Audit · 2026-08-16
# megatown-staff-scheduler · 폰트 사이즈 통일성 감사 + 통합 계획

> 작성일: 2026-08-16  
> 스코프: `src/components/**/*.tsx` + `src/styles/tokens.ts` + `src/index.css`  
> 목적: 제각각 폰트 사이즈 → 8단계 통합 스케일 → 롤아웃 로드맵

---

## Phase 1 · 현재 상태 감사

### 1-0. 전역 스케일 오버라이드 (index.css · 최우선)

현재 `src/index.css`에 **중첩 오버라이드**가 3단계로 쌓여 있다. 이것이 불일치의 핵심 원인.

```
html { font-size: 20px }            (< 640px)
html { font-size: 23px }            (≥ 640px)

Tailwind named classes:
  text-xs   → 0.90rem (= 18px / 20.7px)
  text-sm   → 1.05rem (= 21px / 24.15px)
  text-base → 1.18rem (= 23.6px / 27.14px)
  text-lg   → 1.30rem (= 26px / 29.9px)
  text-xl   → 1.45rem (= 29px / 33.35px)
  text-2xl  → 1.65rem (= 33px / 37.95px)

Arbitrary [Npx] 오버라이드:
  text-[8px]  → 19px  (was 17)
  text-[9px]  → 21px  (was 19)
  text-[10px] → 22px  (was 20)
  text-[11px] → 23px  (was 21)
  text-[12px] → 23px  (was 21)  ← 11px 와 동일! 충돌
  text-[13px] → 24px  (was 22)
  text-[14px] → 24px  (was 22)  ← 13px 와 동일! 충돌
  text-[15px] → 25px  (was 23)
  text-[16px] → 26px  (was 24)
  text-[17px] → 27px  (was 25)
```

**문제점**: `text-[11px]`과 `text-[12px]`가 동일(23px), `text-[13px]`과 `text-[14px]`가 동일(24px). 코드에서 다른 사이즈 클래스를 썼음에도 화면에서 구별 불가. 4단계가 실질적으로 2단계로 압착됨.

---

### 1-1. 페이지 제목 (AppNavHeader · h1 · 모달 제목)

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| AppNavHeader · 로고 텍스트 OSAN | `text-lg` | ~26px | AppNavHeader.tsx:511 |
| AppNavHeader · 로고 텍스트 MEGATOWN | `text-sm` | ~21px | AppNavHeader.tsx:512 |
| AppNavHeader · Desktop 탭 레이블 | `text-[15px]~text-[17px]` | 25~27px | AppNavHeader.tsx:338 |
| AppNavHeader · Mobile 탭 레이블 | `text-[12px]` | 23px | AppNavHeader.tsx:396 |
| PageHeader · 페이지 타이틀 (`TEXT.hero`) | `text-[16px] sm:text-[17px]` | 26~27px | PageHeader.tsx:73 |
| PermissionsPage · 섹션 h2 | `text-[17px]` | 27px | PermissionsPage.tsx:476 |
| PermissionsPage · 서브 h2 | `text-[13px]` | 24px | PermissionsPage.tsx:608 |
| 모달 제목 | `modal-header` CSS (미정의 px) | — | index.css 400행 |

**불일치 패턴**: 같은 h2 역할인데 PermissionsPage.tsx 안에서만 17px vs 13px 혼재.

---

### 1-2. 섹션 헤더 (카드 헤더 · 그룹 헤더)

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| `settingsTypography` · SET_SECTION_TITLE | `text-base` | ~23.6px | settingsTypography.ts:9 |
| `tokens.ts` · SECTION_TITLE | `text-[11px] font-bold uppercase` | 23px | tokens.ts:184 |
| KpiCard · label | `kpi-card-label` CSS → `text-[11px]` | 23px | index.css:364 |
| InventoryEditPanel · 섹션 레이블 | `text-[10px] font-bold uppercase` | 22px | InventoryEditPanel.tsx:310 |
| NewVendorModal · 섹션 레이블 | `text-[10px] font-black uppercase` | 22px | NewVendorModal.tsx:99 |
| SchedulePage · 인건비 합계 영역 | `text-[15px] font-semibold` | 25px | SchedulePage.tsx:1626 |

**불일치 패턴**: 섹션 헤더 역할에 `text-base(23.6px)` vs `text-[11px](23px)` vs `text-[10px](22px)` 혼재. `text-base`는 사실상 섹션 헤더보다 훨씬 큰 본문 크기.

---

### 1-3. 탭 메뉴

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| TabBar L1 (`.tab-l1`) | `text-[16px] sm:text-[17px] font-black` | 26~27px | index.css:273 |
| TabBar L2 (`.tab-l2`) | `text-[15px] sm:text-[16px] font-bold` | 25~26px | index.css:281 |
| TabBar L3 (`.tab-l3`) | `text-[12px] sm:text-[13px] font-bold` | 23~24px | index.css:293 |
| AppNavHeader · Desktop 탭 | `text-[15px]~text-[17px]` | 25~27px | AppNavHeader.tsx:338 |
| AppNavHeader · Mobile 탭 | `text-[12px]` | 23px | AppNavHeader.tsx:396 |
| SchedulePage · 인라인 탭 버튼 | `text-[13px] sm:text-[15px]` | 24~25px | SchedulePage.tsx:1664 |

**불일치 패턴**: L1·L2 사이 단차 1px(25→26, 26→27). 감지 불가 수준. L3와 L2 사이 단차 2~3px — 식별 가능하나 좁음.

---

### 1-4. 버튼

| 종류 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| `BUTTON_PRIMARY` (tokens.ts) | `text-[12px]` | 23px | tokens.ts:131 |
| `BUTTON_SECONDARY` (tokens.ts) | `text-[12px]` | 23px | tokens.ts:138 |
| `BUTTON_DANGER` (tokens.ts) | `text-[12px]` | 23px | tokens.ts:145 |
| `SET_BTN_PRIMARY` (settingsTypography) | `text-sm` | ~21px | settingsTypography.ts:58 |
| `SET_BTN_SECONDARY` (settingsTypography) | `text-sm` | ~21px | settingsTypography.ts:63 |
| SchedulePage · 주요 버튼 | `text-[13px] sm:text-[15px]` | 24~25px | SchedulePage.tsx:1664 |
| EmployeeProfileCard · 액션 버튼 | `text-[12px]` | 23px | EmployeeProfileCard.tsx:128 |
| PermissionsPage · 저장 버튼 | `text-[12px]` | 23px | PermissionsPage.tsx:781 |
| StaffManagePage · 저장/취소 | `text-[11px]` | 23px | StaffManagePage.tsx:602 |

**불일치 패턴**: 공통 BUTTON_* 토큰(12px=23px)과 SET_BTN_*(text-sm=21px)이 동일 역할임에도 2px 격차. SchedulePage는 독자적으로 15px(25px)을 씀.

---

### 1-5. 입력창 (input · select · textarea)

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| `INPUT_BASE` (tokens.ts) | `text-[13px]` | 24px | tokens.ts:121 |
| `.input-field` CSS | `text-[14px]` | 24px | index.css:377 |
| `SET_INPUT` (settingsTypography) | `text-sm` | ~21px | settingsTypography.ts:24 |
| EmployeeInfoForm · 기본 input | `text-[13px]` | 24px | EmployeeInfoForm.tsx:109 |
| EmployeeInfoForm · compact input | `text-[13px]` | 24px | EmployeeInfoForm.tsx:116 |
| StaffManagePage · 필터 input | `text-[12px]` | 23px | StaffManagePage.tsx:572 |
| NewVendorModal · 입력창 | `text-[13px]` | 24px | NewVendorModal.tsx:108 |
| LandingPage · 검색창 | `text-sm font-semibold` | ~21px | LandingPage.tsx:1331 |

**불일치 패턴**: `text-sm(21px)` vs `text-[13px](24px)` vs `text-[14px](24px)` 세 가지 혼재. 특히 SET_INPUT(설정 페이지)이 다른 모든 입력창보다 3px 작다.

---

### 1-6. 라벨 (form label · 필드 레이블)

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| `FieldLabel` 공통 컴포넌트 | `text-[12px] font-bold` | 23px | FieldLabel.tsx:26 |
| `.label-field` CSS | `text-[12px] font-bold` | 23px | index.css:382 |
| `SET_LABEL` (settingsTypography) | `text-xs font-semibold` | ~18px | settingsTypography.ts:20 |
| `ImageUploadField` · LABEL_CLS | `text-[11px] font-semibold` | 23px | ImageUploadField.tsx:24 |
| EmployeeInfoForm · 컴팩트 라벨 | `text-[11px] font-semibold` | 23px | EmployeeInfoForm.tsx:115 |
| StaffManagePage · 필터 라벨 | `text-[10px] font-semibold uppercase` | 22px | StaffManagePage.tsx:566 |
| InventoryEditPanel · 섹션 라벨 | `text-[10px] font-bold uppercase` | 22px | InventoryEditPanel.tsx:144 |

**불일치 패턴**: `text-xs(18px)` vs `text-[11px](23px)` vs `text-[12px](23px)` vs `text-[10px](22px)` — 같은 라벨 역할에 실질 렌더 사이즈가 18px~23px로 5px 격차. `SET_LABEL`(설정 페이지)이 일반 `FieldLabel`보다 5px 작아 시각적으로 현저히 다름.

---

### 1-7. 테이블 헤더 / 리스트 행

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| PermissionsPage · 테이블 헤더 | `text-[16px] font-bold` | 26px | PermissionsPage.tsx:511 |
| PermissionsPage · 직원 목록 헤더 | `text-[11px] font-bold uppercase` | 23px | PermissionsPage.tsx:622 |
| StaffManagePage · 테이블 본문 | `text-[13px] font-bold` | 24px | StaffManagePage.tsx:1079 |
| StaffManagePage · 배지 셀 | `text-[11px] font-semibold` | 23px | StaffManagePage.tsx:1088 |
| LandingPage · VendorListEditor 헤더 | `text-[11px] font-black uppercase` | 23px | VendorListEditor.tsx:431 |
| LandingPage · VendorListEditor 본문 | `text-[13px] font-semibold` | 24px | VendorListEditor.tsx:533 |
| SchedulePage · 셀 내용 | `text-[10px] font-semibold` | 22px | SchedulePage.tsx:1491 |
| KpiCard · 값 (kpi-card-value) | `text-lg font-black` | ~26px | index.css:362 |

**불일치 패턴**: 테이블 헤더가 16px(26px)~10px(22px)까지 4px 범위 혼재. 특히 PermissionsPage 내부에서만 페이지 헤더(16px)와 직원 목록 헤더(11px)가 26px vs 23px로 3px 차이.

---

### 1-8. 본문 텍스트 (설명 · 안내 · 툴팁)

| 위치 | 클래스 | 렌더 사이즈 | 파일:대표라인 |
|------|--------|------------|--------------|
| `TEXT.body` (tokens.ts) | `text-[13px] sm:text-[13.5px]` | 24px | tokens.ts:31 |
| `TEXT.caption` (tokens.ts) | `text-[11px] sm:text-[11.5px]` | 23px | tokens.ts:33 |
| `TEXT.micro` (tokens.ts) | `text-[9.5px] sm:text-[10px]` | 21~22px | tokens.ts:35 |
| SET_SECTION_DESC (설정 설명) | `text-xs` | ~18px | settingsTypography.ts:15 |
| SET_HINT (힌트 텍스트) | `text-xs` | ~18px | settingsTypography.ts:41 |
| EmployeeProfileCard · 비고 | `text-[13px]` | 24px | EmployeeProfileCard.tsx:261 |
| SchedulePage · 인라인 안내 | `text-[10px] text-zinc-500` | 22px | SchedulePage.tsx:1771 |
| PermissionsPage · 안내 텍스트 | `text-[11px] text-zinc-400` | 23px | PermissionsPage.tsx:600 |
| StaffManagePage · 빈 상태 안내 | `text-[12px] text-zinc-300` | 23px | StaffManagePage.tsx:628 |

**불일치 패턴**: `text-xs(18px)`(settingsTypography)와 `TEXT.caption(23px)`(tokens.ts)이 동일 역할(캡션/힌트)인데 5px 격차. 설정 페이지만 현저히 작게 보임.

---

### Phase 1 요약 · 핵심 불일치 집계

| 불일치 유형 | 사례 수 | 심각도 |
|------------|--------|--------|
| 11px = 12px (렌더 동일) | 전체 코드 다수 | 높음 · 의미 없는 구분 |
| 13px = 14px (렌더 동일) | 전체 코드 다수 | 높음 · 의미 없는 구분 |
| SET_* (text-xs/text-sm) vs tokens.ts 토큰 (text-[Npx]) | 설정 페이지 전체 | 높음 · 5px 시각 격차 |
| 버튼: BUTTON_*(12px) vs SET_BTN_*(text-sm) | 페이지별 | 중간 |
| 입력창: SET_INPUT(text-sm) vs INPUT_BASE(text-[13px]) | 설정 vs 일반 | 중간 |
| 테이블 헤더: 10px~16px 범위 혼재 | 여러 페이지 | 중간 |
| TabBar L1~L2 단차 1px 이하 | 탭바 전체 | 낮음 |

---

## Phase 2 · 벤치마크 리서치

WebFetch 권한 미허가로 직접 DOM 추출은 불가. WebSearch 결과 + 공개 design system 분석 자료 기반 정리.

### 2-1. Linear (linear.app)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| Display / 페이지 제목 | 64px (모바일 48px) | 700 | -0.04em | 1.1 | Inter Variable |
| Section title | 24px | 600 | -0.02em | 1.3 | Inter Variable |
| UI label / 탭 | 14px | 500 | 0 | 1.4 | Inter Variable |
| Body text | 14px | 400 | 0 | 1.5 | Inter Variable |
| Caption / meta | 12px | 400 | 0 | 1.4 | Inter Variable |
| Code / 숫자 | 13px | 400 | 0 | 1.5 | Berkeley Mono |
| Button | 13px | 500 | 0 | — | Inter Variable |
| Input | 14px | 400 | 0 | — | Inter Variable |
| Table header | 11px (UPPERCASE) | 600 | +0.06em | — | Inter Variable |

**Linear 특징**: 전체 UI가 **14px 본문** 중심. 탭도 14px. 컴팩트 데이터 밀도 우선. 제목만 크게 뛰고 나머지는 균일.

---

### 2-2. Vercel Dashboard (vercel.com)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| 페이지 H1 | 24px | 600 | -0.96px | 1.2 | Geist Variable |
| 섹션 H2 | 20px | 600 | -0.5px | 1.3 | Geist Variable |
| 카드 헤더 | 16px | 500 | -0.2px | 1.4 | Geist Variable |
| Body / 설명 | 14px | 400 | 0 | 1.6 | Geist Variable |
| Label / 캡션 | 12px | 500 | 0 | 1.4 | Geist Variable |
| Button | 14px | 500 | 0 | — | Geist Variable |
| Input | 14px | 400 | 0 | — | Geist Variable |
| Table header | 12px (UPPERCASE) | 600 | +0.04em | — | Geist Variable |
| Code / 숫자 | 13px | 400 | 0 | — | Geist Mono |

**Vercel 특징**: 굵기 3단계만(400/500/600). 700 없음. 기본 body 14px. Letter-spacing 은 사이즈 클수록 음수로. 4px 스페이싱 그리드. Shadow-as-border(`0 0 0 1px rgba(0,0,0,0.08)`).

---

### 2-3. Notion (notion.so)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| 페이지 제목 | 40px (모바일 32px) | 700 | -0.03em | 1.1 | NotionInter |
| H2 헤딩 | 24px | 600 | -0.01em | 1.3 | NotionInter |
| H3 헤딩 | 20px | 600 | 0 | 1.4 | NotionInter |
| Body | 16px | 400 | 0 | 1.6 | NotionInter |
| UI 레이블 / 메타 | 14px | 500 | 0 | 1.4 | NotionInter |
| Caption / 힌트 | 12px | 400 | 0 | 1.5 | NotionInter |
| Button | 14px | 500 | 0 | — | NotionInter |
| Input | 16px | 400 | 0 | — | NotionInter |

**Notion 특징**: Body 16px (콘텐츠 헤비 · 장문 읽기 최적화). 모바일에서 디스플레이 20% 축소. Border-radius: 4px(button/input), 8~12px(card).

---

### 2-4. Attio (attio.com)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| 페이지 제목 | 20px | 600 | -0.01em | 1.3 | Inter |
| 섹션 헤더 | 16px | 600 | -0.01em | 1.4 | Inter |
| Body / 리스트 | 14px | 400 | 0 | 1.5 | Inter |
| Meta / 레이블 | 12px | 500 | 0 | 1.4 | Inter |
| Caption | 11px | 400 | 0 | 1.4 | Inter |
| Button | 13px | 500 | 0 | — | Inter |
| Table header | 11px (UPPERCASE) | 600 | +0.05em | — | Inter |

**Attio 특징**: CRM 특성상 데이터 밀도 높음. Body 14px · 탭/레이블도 12~13px. 색상: teal(#008080)+green 계열 accent.

---

### 2-5. Cal.com (cal.com)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| 페이지 제목 | 24px | 700 | tight | 1.2 | Cal Sans UI (Variable) |
| 섹션 헤더 | 18px | 600 | -0.01em | 1.3 | Cal Sans Text |
| Body | 14px | 400 | 0 | 1.5 | Cal Sans Text |
| Label | 12px | 500 | 0 | 1.4 | Cal Sans UI |
| Button | 14px | 600 | 0 | — | Cal Sans UI |
| Input | 14px | 400 | 0 | — | Cal Sans Text |

**Cal.com 특징**: 자체 Cal Sans 폰트(variable, opsz axis). `font-optical-sizing: auto` 활성. 제목은 매우 tight 자간. GEOM axis로 기하학적 정도 조절.

---

### 2-6. Stripe Dashboard (dashboard.stripe.com)

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| Display | 48px (모바일 32px) | 300 | -2.4px | 1.0 | sohne-var |
| 페이지 제목 | 24px | 500 | -0.5px | 1.2 | sohne-var |
| 섹션 헤더 | 16px | 500 | -0.1px | 1.4 | sohne-var |
| Body | 14px | 400 | 0 | 1.6 | sohne-var |
| Label | 12px | 500 | 0 | 1.4 | sohne-var |
| Caption | 11px | 400 | 0 | 1.5 | sohne-var |
| Button | 14px | 500 padding≥8px 16px | 0 | — | sohne-var |
| Input | 16px (모바일 최소) | 400 | 0 | — | sohne-var |
| Table header | 11px UPPERCASE | 600 | +0.04em | — | sohne-var |
| 숫자 · 금액 | `font-feature-settings: "tnum","ss01"` | — | — | — | sohne-var |

**Stripe 특징**: Display는 굵기 300 + 음수 자간 (브랜드 시그니처). 금액/수치에 항상 `tnum`. Button padding 최소 `8px 16px`. Input 모바일 최소 16px.

---

### 2-7. Toss (toss.im) · 한글 UI 최고 수준

| 요소 | 사이즈 | 굵기 | 자간 | 행간 | 폰트 |
|------|--------|------|------|------|------|
| 대제목 | 28px | 700 | -0.02em | 1.2 | TossFace (자체) |
| 중제목 | 20px | 700 | -0.01em | 1.3 | TossFace |
| 소제목 | 16px | 600 | 0 | 1.4 | TossFace |
| Body | 15px | 400 | 0 | 1.55 | TossFace |
| Caption | 13px | 400 | 0 | 1.5 | TossFace |
| Micro | 11px | 600 | +0.02em | 1.4 | TossFace |
| Button | 16px | 600 | 0 | — | TossFace |
| Input | 16px | 400 | 0 | — | TossFace |
| 숫자 (금액 · 거래) | tabular-nums, lining-nums | 700 | — | — | TossFace |

**Toss 특징**: 한글 UI 기준. Body 15px (모바일 터치 최적). Button 16px (iOS 자동 확대 방지 기준). 8단계 굵기(300~950) 중 UI는 400/600/700만. 숫자는 항상 tabular + lining.

---

### 2-8. 공통 패턴 추출 (7개 사이트)

| 항목 | 업계 표준 값 |
|------|------------|
| 페이지 제목 | **20~24px** (Notion/Notion-like는 40px+, 앱 UI는 20~24px) |
| 섹션 헤더 | **16~18px** |
| 탭 / UI 레이블 | **13~14px** |
| Body 텍스트 | **14~16px** (데이터 앱은 14px · 콘텐츠 앱은 16px) |
| Caption / 힌트 | **11~12px** |
| 테이블 헤더 | **11~12px UPPERCASE** |
| 버튼 | **13~14px** (Toss 16px) |
| Input | **14~16px** (모바일 최소 16px) |
| Micro 레이블 | **10~11px UPPERCASE** |
| 굵기 전략 | 3단계 최대: 400(body) / 500~600(UI) / 700(강조) |
| 자간 | 제목: -0.01~-0.04em · body: 0 · micro UPPERCASE: +0.04~+0.06em |
| 행간 | 제목: 1.1~1.3 · body: 1.5~1.6 · caption: 1.4 |
| 숫자 | `font-variant-numeric: tabular-nums lining-nums` 전역 필수 |

---

## Phase 3 · 통합 스케일 제안

### 3-1. 설계 원칙

현재 프로젝트의 전역 오버라이드 구조(`html { font-size: 20px }` + `[class*="text-\[Npx\]"]` 재정의)는 유지. 단, **사용 사이즈를 8단계로 정규화**하여 임의값 남발을 차단.

**렌더 목표값 (오버라이드 적용 후 실제 화면 픽셀)**:

| 단계 | 이름 | 코드 클래스 (소스) | 모바일 렌더 | 데스크탑 렌더 | 굵기 | 자간 | 행간 |
|------|------|-----------------|------------|------------|------|------|------|
| T-8 | hero | `text-[17px]` | 27px | 27px | 900 (font-black) | -0.02em | 1.2 |
| T-7 | title | `text-[16px]` | 26px | 26px | 800 (font-extrabold) | -0.01em | 1.3 |
| T-6 | section | `text-[15px]` | 25px | 25px | 700 (font-bold) | -0.005em | 1.35 |
| T-5 | tab | `text-[14px]` | 24px | 24px | 700 (font-bold) | 0 | 1.0 (leading-none) |
| T-4 | body | `text-[13px]` | 24px | 24px | 600 (font-semibold) | 0 | 1.5 |
| T-3 | caption | `text-[11px]` | 23px | 23px | 600 (font-semibold) | 0 | 1.4 |
| T-2 | label | `text-[10px]` | 22px | 22px | 700 (font-bold) | +0.04em | 1.3 |
| T-1 | micro | `text-[9px]` | 21px | 21px | 700 (font-bold) | +0.06em | 1.0 |

> 참고: 현재 오버라이드로 `text-[11px]`=23px, `text-[12px]`=23px (동일). 따라서 `text-[12px]` 는 이 스케일에서 사용하지 않는다. `text-[13px]`=24px, `text-[14px]`=24px (동일) 이므로 `text-[14px]`도 T-5(탭 전용)로만 한정.

### 3-2. 핵심 수정: index.css 오버라이드 충돌 해결

현재 `text-[11px]`=`text-[12px]`=23px, `text-[13px]`=`text-[14px]`=24px 충돌을 해결하려면 두 가지 방법이 있다.

**방법 A · 오버라이드 정밀화** (권장 · 최소 회귀):
```css
/* index.css 수정안 */
[class*="text-\\[11px\\]"] { font-size: 22px !important; }  /* T-3 caption · 23→22 */
[class*="text-\\[12px\\]"] { font-size: 23px !important; }  /* T-3 alt (기존 유지 · 소화) */
[class*="text-\\[13px\\]"] { font-size: 23px !important; }  /* T-4 body · 24→23 */
[class*="text-\\[14px\\]"] { font-size: 24px !important; }  /* T-5 tab · 기존 유지 */
/* 11≠12, 13≠14 로 단차 복원 */
```

**방법 B · 스케일 재설계** (이상적이나 회귀 위험):
html font-size를 18px/21px로 낮추고 Tailwind named classes(text-sm 등)와 정렬.  
현재 `text-[Npx]` 클래스가 122개 파일에 3,114개 사용 중. 대규모 회귀 위험 → 방법 A 우선.

### 3-3. tokens.ts 확장 제안

```typescript
// src/styles/tokens.ts 에 추가 (기존 TEXT 객체 교체)
export const TEXT = {
  /** T-8 · 페이지 타이틀 · 모달 제목 · AppNavHeader Row1 브랜드명 */
  hero: "text-[17px] font-black tracking-tight leading-tight",
  /** T-7 · 섹션 그룹 제목 · h2 */
  title: "text-[16px] font-extrabold tracking-tight leading-snug",
  /** T-6 · 카드 헤더 · 서브섹션 제목 */
  section: "text-[15px] font-bold leading-snug",
  /** T-5 · 탭 메뉴 · 내비게이션 항목 · 전용 (tab-l2 와 일치) */
  tab: "text-[14px] font-bold leading-none",
  /** T-4 · 본문 · 리스트 주요 텍스트 · 입력창 내용 */
  body: "text-[13px] font-semibold leading-relaxed",
  /** T-3 · 캡션 · 서브 텍스트 · 힌트 · 보조 레이블 */
  caption: "text-[11px] font-semibold leading-snug",
  /** T-2 · 컬럼 헤더 · 메타 라벨 · UPPERCASE 축약 */
  label: "text-[10px] font-bold uppercase tracking-wider",
  /** T-1 · 마이크로 · 배지 · 최소 표시 */
  micro: "text-[9px] font-bold uppercase tracking-widest",
  /** 숫자 전용 · tabular-nums · 색상은 별도 지정 */
  num: "tabular-nums font-black",
} as const;
```

### 3-4. settingsTypography.ts 수정 제안

설정 페이지 전용 상수(`SET_*`)가 일반 토큰과 다른 베이스(text-xs/text-sm)를 쓰는 것이 핵심 불일치. 통일 방안:

```typescript
// settingsTypography.ts · 수정 제안 (text-xs/text-sm → text-[Npx] 정렬)

// 현재                        →  수정안
// SET_SECTION_TITLE: text-base → "text-[15px] font-bold text-zinc-800 ..."   (T-6)
// SET_LABEL: text-xs           → "text-[10px] font-bold text-zinc-600 ..."   (T-2)  
// SET_INPUT: text-sm           → "... text-[13px] ..."                        (T-4)
// SET_BTN_PRIMARY: text-sm     → "... text-[13px] ..."                        (T-4)
// SET_HINT: text-xs            → "text-[10px] text-zinc-400 mt-1"             (T-2)
// SET_ERROR: text-xs           → "text-[10px] text-rose-500 mt-1 font-semibold" (T-2)
```

### 3-5. 역할별 표준 클래스 정리

| UI 역할 | 표준 클래스 (수정안) | 렌더 사이즈 |
|---------|------------------|------------|
| 페이지 제목 (h1) | `TEXT.hero` = `text-[17px] font-black` | 27px |
| 섹션 제목 (h2) | `TEXT.title` = `text-[16px] font-extrabold` | 26px |
| 카드/그룹 헤더 | `TEXT.section` = `text-[15px] font-bold` | 25px |
| 탭 메뉴 | CSS `.tab-l2` (현행 유지 · 일치함) | 25~26px |
| 본문 리스트 항목 | `TEXT.body` = `text-[13px] font-semibold` | 24px |
| 입력창 내용 | `text-[13px]` (INPUT_BASE 현행 유지) | 24px |
| 버튼 텍스트 | `text-[13px]` (BUTTON_* 수정 필요) | 24px |
| 폼 라벨 | `TEXT.label` = `text-[10px] font-bold uppercase` | 22px |
| 캡션 / 힌트 | `TEXT.caption` = `text-[11px] font-semibold` | 23px |
| 테이블 헤더 | `TEXT.label` = `text-[10px] font-bold uppercase` | 22px |
| 배지 / 마이크로 | `TEXT.micro` = `text-[9px] font-bold uppercase` | 21px |

---

## Phase 4 · 롤아웃 계획

### 4-1. 우선순위 분류

**P0 · index.css 충돌 즉시 해결** (1개 파일 · ~5줄):
- `text-[11px]`≠`text-[12px]`, `text-[13px]`≠`text-[14px]` 단차 복원
- 영향: 전체 122개 파일 3,114개 인스턴스에 즉각 반영 (CSS만 수정)
- 회귀 위험: 낮음 (렌더 px 1~2px 미세 변동만)

**P1 · tokens.ts / settingsTypography.ts 통일** (2개 파일 · ~30줄):
- `TEXT.hero/title/section/tab/body/caption/label/micro` 8단계 재정의
- `SET_LABEL/SET_INPUT/SET_BTN_*/SET_HINT` → `text-[Npx]` 정렬
- 영향: 직접 수정 없음 · 이후 P2 마이그레이션의 기준점
- 회귀 위험: 없음 (토큰 재정의 · 아직 100% 마이그레이션 안 된 파일들은 개별 클래스 그대로)

**P2 · 설정 페이지 그룹 통일** (~8개 파일 · ~100라인):
- `settingsTypography.ts`를 쓰는 페이지 우선 (CompanyInfoSettings, BrandingSettings, SystemSettings, PharmacistMenuSettings 등)
- 단차 가장 두드러진 곳: SET_LABEL(text-xs=18px) vs FieldLabel(text-[12px]=23px) 5px 격차
- 추천 순서: BrandingSettingsPage → CompanyInfoSettingsPage → SystemSettingsPage

**P3 · 고밀도 데이터 페이지** (~10개 파일 · ~200라인):
- PermissionsPage (내부 h2 17px vs 13px 혼재)
- StaffManagePage (라벨 10px~13px 혼재)
- SchedulePage (독자적 13px~15px 버튼 클래스)
- 이 그룹은 레이아웃 깨짐 위험이 있으므로 파일당 개별 TS+build 검증 필수

**P4 · OCR / 재고 / 발주 페이지** (~30개 파일):
- OcrPage, StockManagePage, OrderManagePage, SalesTrendPage
- 이미 T-CSS Phase 2 마이그레이션 완료된 파일이 많음 · 잔여 임의값만 정리
- OCR 관련 파일은 수정 금지 대상 포함 · 별도 검토

---

### 4-2. 페이지별 예상 변경 규모

| 페이지 | 파일 수 | 임의값 인스턴스 | 레이아웃 위험 | 우선순위 |
|--------|--------|--------------|------------|--------|
| index.css | 1 | ~12줄 | 낮음 | P0 |
| tokens.ts | 1 | ~15줄 | 없음 | P1 |
| settingsTypography.ts | 1 | ~15줄 | 없음 | P1 |
| BrandingSettingsPage | 1 | ~24개 | 낮음 | P2 |
| CompanyInfoSettingsPage | 1 | ~2개 | 없음 | P2 |
| SystemSettingsPage | 1 | ~3개 | 없음 | P2 |
| PharmacistMenuSettingsPage | 1 | ~9개 | 낮음 | P2 |
| PermissionsPage | 1 | ~34개 | 중간 | P3 |
| StaffManagePage | 1 | ~174개 | 중간 | P3 |
| SchedulePage | 4 | ~41개 | 높음 | P3 (끝에) |
| ContractWriterPage | 1 | 170개 | 높음 | P4 |
| LandingPage | 3 | ~107개 | 중간 | P4 |
| OrderManagePage | 9 | ~139개 | 낮음 (T-CSS 기완료) | P4 |
| StockManagePage | 5 | ~19개 | 낮음 (T-CSS 기완료) | P4 |

---

### 4-3. 레이아웃 회귀 위험 포인트

다음 패턴은 폰트 사이즈 변경 시 그리드 폭·행 높이에 영향을 줄 수 있음:

1. **`grid grid-cols-[minmax(0,1fr)_170px_180px]` 패턴** (PermissionsPage.tsx:511)  
   → 컬럼 폭이 고정 px이라 폰트 확대 시 텍스트가 잘릴 수 있음. 수정 전 min-w 검토 필요.

2. **`h-7 / h-9 / h-10` 고정 높이 버튼** (StaffManagePage, EmployeeInfoForm 다수)  
   → 폰트 확대 시 버튼 텍스트가 세로로 클리핑될 수 있음. `min-h-*`로 전환 권장.

3. **`whitespace-nowrap` + 좁은 컬럼** (탭 레이블, 테이블 셀 다수)  
   → 폰트 변경 시 탭이 오버플로 되어 삼선(☰) 드롭다운으로 밀릴 수 있음. 의도적 동작이므로 수용 가능.

4. **`SchedulePage` · `ScheduleCell`** (셀 내부 10px→22px 강제)  
   → 셀 폭이 고정되어 있어 폰트 상향 시 근무 정보 클리핑 위험 높음. 반드시 마지막 처리.

5. **`ContractWriterPage` · 170개 임의값**  
   → 근로계약서 인쇄 레이아웃이 물려 있어 폰트 변경 시 레이아웃 전반 재검토 필요.

---

### 4-4. 롤아웃 실행 시퀀스 (안전 순서)

```
Step 1: index.css · text-[11px]/[12px] 단차 복원, text-[13px]/[14px] 단차 복원
        → TS + build 검증 (0개 파일 변경 · CSS만)
        → 시각 QA: 각 페이지 대표 스크린샷 비교

Step 2: tokens.ts TEXT 8단계 재정의
        → TS + build 검증

Step 3: settingsTypography.ts SET_* → text-[Npx] 정렬
        → TS + build 검증

Step 4: P2 설정 페이지 (파일당 개별 수정 + 검증)
        BrandingSettingsPage → CompanyInfoSettingsPage → SystemSettingsPage

Step 5: PermissionsPage (고밀도 · grid 폭 확인 병행)

Step 6: StaffManagePage (h-7 고정 높이 패턴 min-h 전환 포함)

Step 7: LandingPage, OrderManagePage, StockManagePage (T-CSS 기완료 · 잔여 정리)

Step 8: SchedulePage, ContractWriterPage (레이아웃 충돌 재검토 후)
```

---

## 참고 · 현재 적용된 폰트 스택 (2026-08-16 기준)

```css
--font-sans: "Pretendard Variable", "Geist Variable", -apple-system, BlinkMacSystemFont,
             "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
```

- Pretendard Variable: 한글 최우선 (Toss·Kakao·Line·Naver 표준)
- Geist Variable: 라틴/영문 (Vercel 제작 · 이미 설치됨)
- `font-variant-numeric: tabular-nums lining-nums` 전역 적용됨 (프로젝트 규칙 준수)
- `-webkit-font-smoothing: antialiased` 적용됨 (또렷한 렌더링)

---

*Sources (벤치마크 리서치):*
- [Linear Design Tokens, Typography & CSS Variables — DesignMD](https://designmd.cc/benchmarks/linear)
- [Vercel Design Tokens, Typography & CSS Variables — DesignMD](https://designmd.cc/benchmarks/vercel)
- [Attio Design System — attio-com Design System](https://www.designmd.co/d/attio-com)
- [Cal.com Typography — design.cal.com](https://design.cal.com/basics/typography)
- [Stripe Design Tokens — DesignMD](https://designmd.cc/benchmarks/stripe)
- [Toss Design System — oh-my-design.kr](https://oh-my-design.kr/design-systems/toss)
- [SaaS Dashboard Typography Best Practices 2025 — Lollypop Design](https://lollypop.design/blog/2026/july/enterprise-saas-typography-rules/)
- [Typography in Dashboard Design — NumberAnalytics](https://www.numberanalytics.com/blog/typography-in-dashboard-design)
