# common/ 프레임워크 컴포넌트 · v5

> 재사용 가능한 UI 프레임워크 · Linear/Vercel/Attio 2026 SaaS 톤 · 딥네이비 브랜드
>
> **원칙**: 3곳 이상 반복되면 즉시 추출 · className/style만 변경 · handler/state/API 절대 X

---

## 채택 시 우선순위

1. 이 README 먼저 확인
2. 없으면 인라인 구현 → 3번째 반복 시 추출
3. tone/size prop 지정 · 커스텀 className 최소화
4. 새 컴포넌트는 `common/` 에 · usage 여기 문서화

---

## 목차

- [Primitives](#primitives) · Pure framework · tone/size prop
  - [StatusPill](#statuspill) · [CategoryChips](#categorychips) · [KpiCard](#kpicard) · [CollapseCard](#collapsecard) · [BottomSheet](#bottomsheet) · [Button](#button) · [IconButton](#iconbutton) · [Modal · ConfirmDialog](#modal) · [Panel](#panel)
- [Layout & Shell](#layout)
  - [Hero](#hero) · [PageToolbar](#pagetoolbar) · [PageHeader](#pageheader) · [TabBar](#tabbar) · [SectionLabel](#sectionlabel) · [MiniCard](#minicard) · [SplitPanel](#splitpanel) · [SettingsPageShell](#settingspageshell)
- [Form & Filter](#form-filter)
  - [FieldLabel](#fieldlabel) · [Toolbar](#toolbar) · [SearchBar](#searchbar) · [FilterBar](#filterbar) · [FilterSortBar](#filtersortbar) · [PeriodSelector](#periodselector) · [SearchFilterChips](#searchfilterchips) · [SeasonButtons](#seasonbuttons) · [ProductClassFilter](#productclassfilter)
- [State](#state)
  - [LoadingState](#loadingstate) · [ListLoading](#listloading) · [EmptyState](#emptystate) · [ErrorBoundary](#errorboundary)
- [Table Header](#table-header)
  - [SortableHeader](#sortableheader) · [ResizableHeader](#resizableheader)
- [CSS Utilities](#css-utilities)
  - [.backdrop-brand · .shadow-brand-modal · .kpi-card · .input-field · .filter-bar · .modal-*](#css-classes)
- [Nav Framework](#nav)
- [Event System](#events)
- [디자인 원칙](#principles)

---

<a name="primitives"></a>
# Primitives

<a name="statuspill"></a>
## StatusPill

**10 tone · 3 size · dot + pulse · icon**

```tsx
import { StatusPill } from "@/components/common/StatusPill";

<StatusPill tone="brand" size="md" dot>12건</StatusPill>
<StatusPill tone="emerald" size="sm">승인 완료</StatusPill>
<StatusPill tone="rose" size="xs" pulse>미결</StatusPill>
<StatusPill tone="indigo" size="md" icon={<Clock size={11} />}>대기 3건</StatusPill>
```

**Tone**: `brand`(딥네이비) · `sky` · `emerald` · `amber` · `rose` · `violet` · `teal` · `indigo` · `zinc` · `pine`(Hermès Pine #01796F)
**Size**: `xs`(h-5·11px) · `sm`(h-6·12px) · `md`(py-0.5·13px)

**부적합** (StatusPill 강제 X): 버튼 · 매트릭스 lookup · 테이블 TH · 아이콘 컨테이너 · 알림 banner · 진행바

---

<a name="categorychips"></a>
## CategoryChips

```tsx
<CategoryChips
  options={[
    { key: "all", label: "전체", tone: "brand" },
    { key: "pending", label: "대기", tone: "amber", count: 3 },
    { key: "done", label: "완료", tone: "emerald", count: 12 },
  ]}
  value={selected}
  onChange={setSelected}
/>
```

각 chip · status dot (Vercel ≤10px) · 딥네이비 active

---

<a name="kpicard"></a>
## KpiCard

Vercel Dashboard 톤 · `Number(value) > 0` 자동 active

```tsx
<KpiCard label="총 매입 건수" value={125} unit="건" tone="emerald" />
<KpiCard label="전월비" value={12.4} unit="%" tone="sky" delta={3.2} deltaUnit="%" />
<KpiCard label="발주 대기" value={0} tone="zinc" hint="없음" />
```

**뉴트럴 톤 원칙**: value · zinc-900 · delta 만 semantic (▲emerald ▼rose) · 파스텔 배경 금지

CSS class · `.kpi-card` (Attio inset light + 2-layer shadow · hover lift)

---

<a name="collapsecard"></a>
## CollapseCard

status dot + chevron + icon + right slot

```tsx
<CollapseCard
  title="공급사 정보"
  icon={<Building2 size={14} />}
  defaultOpen
  depth="md"       // sm(내부) or md(외부)
  right={<StatusPill tone="emerald" size="xs">완료</StatusPill>}
>
  {children}
</CollapseCard>
```

---

<a name="bottomsheet"></a>
## BottomSheet

iOS/Material 2026 · frosted backdrop + slide-up

```tsx
<BottomSheet
  open={open}
  onClose={() => setOpen(false)}
  title="필터"
  maxHeight="70vh"
>
  {children}
</BottomSheet>
```

---

<a name="button"></a>
## Button

4 variant · 3 size · inset light + brand glow shadow

```tsx
<Button variant="primary" size="md">저장</Button>
<Button variant="secondary" size="sm" icon={<Plus size={14} />}>추가</Button>
<Button variant="ghost">더보기</Button>
<Button variant="danger" loading={saving}>삭제</Button>
<Button fullWidth suffix={<ChevronRight size={14} />}>계속</Button>
```

**Variant**: `primary`(딥네이비) · `secondary`(흰+border) · `ghost`(투명) · `danger`(rose)
**Size**: `sm`(h-8·15px) · `md`(h-10·17px) · `lg`(h-11·18px) · 폰트 +2

---

<a name="icontile"></a>
## IconTile

아이콘 컨테이너 tile · 카드/헤더의 아이콘 표시용 · 10 tone · 3 size

```tsx
import { IconTile } from "@/components/common/IconTile";

<IconTile icon={<Package size={14} />} tone="brand" size="md" />
<IconTile icon={<Bell size={12} />} tone="amber" size="sm" />
<IconTile icon={<Users size={16} />} tone="emerald" size="lg" shape="full" />
```

**Tone**: brand · sky · emerald · amber · rose · violet · teal · indigo · zinc · pine
**Size**: `sm`(24) · `md`(28 · 표준) · `lg`(36)
**Shape**: `rounded`(기본) · `full`

**대체 대상**: 인라인 `<div className="w-7 h-7 rounded-lg bg-{color}-100 flex items-center justify-center">` 반복 패턴 (20+ 곳)

---

<a name="iconbutton"></a>
## IconButton

36×36 rounded · notification dot · inset light + hover brand shadow

```tsx
<IconButton
  icon={<Bell size={14} />}
  ariaLabel="알림"
  showDot={hasUnread}
  onClick={onOpen}
/>
```

---

<a name="modal"></a>
## Modal · ConfirmDialog · v2 확장 (2026-08-18)

frosted backdrop (딥네이비 + blur 6px) · 3-layer shadow (Attio)

**기본**:
```tsx
<Modal open={open} onClose={() => setOpen(false)} title="상세" size="md" footer={<Button>확인</Button>}>
  {children}
</Modal>
```

**v2 확장 (인라인 모달 대체용)**:
```tsx
<Modal
  open={open}
  onClose={onClose}
  icon={<Package size={18} />}
  title="상품 상세"
  titleAccent          // 좌측 3px accent bar
  headerRight={<StatusPill tone="emerald">완료</StatusPill>}
  size="lg"
  backdropIntensity="brand"  // "brand" (기본) or "brand-strong" (이미지 뷰어)
  headerTint            // 헤더 zinc-50/60 배경 (기본 true)
>
  {children}
</Modal>
```

**Size**: `sm`(md) · `md`(2xl) · `lg`(4xl) · `xl`(6xl) · `full`(95vw)

**Promise 기반 confirm (useConfirm 훅)**:
```tsx
const confirm = useConfirm();
if (await confirm({ message: "삭제할까요?", danger: true })) doDelete();
```

**마이그레이션 대상**: 30+ 인라인 모달 (`backdrop-brand` + inline 헤더 반복) → `<Modal>` v2 props 로 통합

---

<a name="panel"></a>
## Panel

Attio 세련 · inset light + 2-layer shadow · title + moreLabel

```tsx
<Panel title="공지사항" moreLabel="전체보기" onMore={onGo}>
  {children}
</Panel>
```

---

<a name="layout"></a>
# Layout & Shell

<a name="hero"></a>
## Hero

딥네이비 gradient + aurora glow + noise texture · v3

```tsx
<Hero
  eyebrow="TODAY · 2026-08-18"
  title="안녕하세요, 홍길동님"
  description="오늘 예약 3건 · 발주 2건 대기 중"
  actions={<HeroButton onClick={onGo}>바로가기</HeroButton>}
  aside={<StatCard />}
/>
```

**v3 세부**: 3-layer shadow · 3-stop gradient · aurora radial (mint+sky) · top hairline · SVG noise texture

---

<a name="pagetoolbar"></a>
## PageToolbar

accent bar + icon + title + count + selectedCount + search + right

```tsx
<PageToolbar
  icon={<Package size={16} />}
  title="재고 관리"
  count={items.length}
  selectedCount={selected.length}
  search={{ value: q, onChange: setQ, placeholder: "상품명 검색..." }}
  right={<Button variant="primary">추가</Button>}
/>
```

---

<a name="pageheader"></a>
## PageHeader

페이지 내부 상단 헤더 · title + subtitle + icon + actions

```tsx
<PageHeader
  title="재고 관리"
  subtitle="전체 234건"
  icon={Package}
  actions={<Button>발주 요청</Button>}
/>
```

기본 iconColor · `text-brand-deep`

---

<a name="tabbar"></a>
## TabBar 3계층 위계

- **L1** underline (헤더 상단)
- **L2** Attio "carved" pill wrap (bg-zinc-100/80 + white active)
- **L3** Pine Green solid (#01796F · Hermès · 사용자 확정)

---

<a name="sectionlabel"></a>
## SectionLabel

dot + text · 5 tone

```tsx
<SectionLabel tone="brand">기본 정보</SectionLabel>
<SectionLabel tone="amber" right={<Button>...</Button>}>알림</SectionLabel>
```

---

<a name="minicard"></a>
## MiniCard

랜딩 직원용 · 32×32 아이콘 + title + desc · hover lift

```tsx
<MiniCard
  color="teal"
  icon={Bell}
  title="알림 요약"
  description="12건 대기"
  onClick={onGo}
/>
```

---

<a name="splitpanel"></a>
## SplitPanel

마스터-디테일 (좌 list + 우 detail) · 폭 조정 · 모바일 자동 모달

```tsx
<SplitPanel
  storageKey="staffManage.listWidth"
  defaultWidth={288}
  dividerColor="indigo"
  mobileRightAsModal
  mobileModalTitle="상세"
  mobileOpen={!!selected}
  onMobileClose={() => setSelected(null)}
  left={<List />}
  right={<Detail />}
/>
```

---

<a name="settingspageshell"></a>
## SettingsPageShell

[설정] 하위 페이지 공용 셸

```tsx
<SettingsPageShell
  activePage="company-info"
  authSession={authSession}
  onBack={onBack}
  icon={Buildings}
  title="회사정보"
  description="약국명 · 사업자번호 · 주소"
>
  {sections}
</SettingsPageShell>
```

---

<a name="form-filter"></a>
# Form & Filter

<a name="fieldlabel"></a>
## FieldLabel

폼 필드 라벨 · icon + required *

```tsx
<FieldLabel icon={<User size={12} />} required>이름</FieldLabel>
```

---

<a name="toolbar"></a>
## Toolbar

컴팩트 툴바 · left + search + right

```tsx
<Toolbar
  left={<span>공급사 목록</span>}
  search={{ value: q, onChange: setQ, placeholder: "상품 검색" }}
  right={<Button>+ 추가</Button>}
/>
```

---

<a name="searchbar"></a>
## SearchBar

통합 검색 · debounce · 최근 검색어 dropdown · 결과 카운트

```tsx
<SearchBar
  value={search}
  onChange={setSearch}
  placeholder="상품·코드·공급사"
  resultCount={filtered.length}
  historyKey="megatown_search_history"
/>
```

---

<a name="filterbar"></a>
## FilterBar

여러 필터 · flex-wrap 컨테이너 · Attio inset light

```tsx
<FilterBar gap="medium">
  <select>...</select>
  <PeriodSelector />
  <Button className="ml-auto">전체선택</Button>
</FilterBar>
```

---

<a name="filtersortbar"></a>
## FilterSortBar

라벨 + segmented pill 그룹 · 정렬/필터 통일

```tsx
<FilterSortRow>
  <FilterSortLabel>정렬</FilterSortLabel>
  <FilterSortGroup
    options={[{ key: "name", label: "이름" }, { key: "date", label: "날짜", sortDir: "desc" }]}
    active={sortKey}
    onSelect={setSortKey}
  />
</FilterSortRow>
```

---

<a name="periodselector"></a>
## PeriodSelector

기간 조회 · 딥네이비 active · brand glow shadow

```tsx
<PeriodSelector
  options={PERIOD_MONTHS_PRESET}
  value={months}
  onChange={setMonths}
/>
```

Preset: `PERIOD_MONTHS_PRESET` (1/3/6/12개월) · `PERIOD_DAYS_PRESET` (10/30/60/90일)

---

<a name="searchfilterchips"></a>
## SearchFilterChips

다중 선택 filter chips · 딥네이비 active · count 배지

```tsx
<SearchFilterChips
  label="상태"
  options={[
    { key: "zero", label: "재고 0", count: 12 },
    { key: "low", label: "저재고", count: 34 },
  ]}
  selected={statusFilter}
  onToggle={key => setStatusFilter(prev => toggle(prev, key))}
/>
```

---

<a name="seasonbuttons"></a>
## SeasonButtons

4계절 세그먼트 · 딥네이비 active

```tsx
<SeasonButtons value={season} onChange={setSeason} label="계절" />
```

---

<a name="productclassfilter"></a>
## ProductClassFilter

상비약 / 일반약 / 전체 · semantic tone shadow

```tsx
<ProductClassFilter value={classFilter} onChange={setClassFilter} counts={counts} />
```

---

<a name="state"></a>
# State Components

<a name="loadingstate"></a>
## LoadingState

페이지/섹션 로딩 · skeleton 지원

```tsx
{loading && <LoadingState label="공급사 로드 중..." tone="indigo" />}
{loading && <LoadingState skeleton rows={5} />}
```

---

<a name="listloading"></a>
## ListLoading

리스트 인라인 로딩

```tsx
{loading && <ListLoading label="불러오는 중..." />}
```

---

<a name="emptystate"></a>
## EmptyState

빈 상태 · brand-tint circle + Icon + title + hint + action

```tsx
<EmptyState
  icon={Package}
  title="재고 없음"
  hint="발주 후 입고 시 표시됩니다"
  action={<Button>발주 요청</Button>}
/>
```

---

<a name="errorboundary"></a>
## ErrorBoundary

앱 최상단 wrap · ChunkLoadError 자동 처리

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

<a name="table-header"></a>
# Table Header

<a name="sortableheader"></a>
## SortableHeader

정렬 가능 테이블 헤더 · asc/desc 순환

```tsx
<thead>
  <SortableHeader
    columns={[
      { key: "name", label: "이름", align: "left" },
      { key: "qty", label: "수량", align: "right" },
    ]}
    activeKey={sortKey}
    activeDir={sortDir}
    onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}
  />
</thead>
```

---

<a name="resizableheader"></a>
## ResizableHeader

컬럼 폭 드래그 조절 · localStorage 저장 (useColumnResize 훅)

---

<a name="css-utilities"></a>
# CSS Utilities

<a name="css-classes"></a>
## 유틸리티 클래스 (index.css)

**Backdrop 유틸**:
- `.backdrop-brand` · rgba(10,46,74,0.35) + blur 6px (표준 모달)
- `.backdrop-brand-strong` · rgba 0.45 + blur 8px (이미지 뷰어)

**Shadow 유틸**:
- `.shadow-brand-modal` · 3-layer 딥네이비 tint (Attio/Linear)

**컴포넌트 CSS** (BEM-lite):
- `.kpi-card` · inset light + 2-layer shadow + hover lift
- `.input-field` · 브랜드 focus + ring-2 brand-tint + 폰트 +2
- `.label-field` · 폰트 +2 · ink-soft
- `.filter-bar` · Attio inset light + subtle shadow
- `.card-panel` · 재사용 카드 컨테이너
- `.split-right` · SplitPanel 우측 패널
- `.modal-backdrop · .modal-card · .modal-header · .modal-body` · Modal 기본
- `.badge-base` · 배지 기본 크기

**Scrollbar**: 딥네이비 tint + transparent track (전 앱 자동)

**Font**: Pretendard + Geist Variable · antialiasing + smooth rendering

---

<a name="nav"></a>
# Nav Framework · sideNavGroups.ts

- **`SIDE_NAV_GROUPS`** · 사이드바 그룹 정의 (단일 소스)
- **`DERIVED_TOP_TABS`** · 헤더 탭 자동 파생 (drift 방지)
- **`NAV_ACCENT`** · 8 group tone hex + gradient + glow (헤더↔사이드바 연동)
- **`DARK_COLOR_TONES`** · deep teal 활성/비활성 (사이드바 목업 톤)
- **`headerAccentGradient(color)`** · 헤더 탭 하단 accent bar gradient

**v5 세부 (2026-08-18)**:
- Aurora radial glow · 3-point (sky+mint+indigo)
- SVG noise texture (fractalNoise 0.85 · opacity 0.03)
- 아이콘 · 활성/비활성 모두 그룹 accent color 유지 (사용자 요구)
- Stripe · 4px + solid + double glow (12+24)
- 로고 · ring-2 + brand color glow · OSAN MEGATOWN tracking
- 사용자 name chip · ring + hover glow
- 성씨 initial 제거 (사용자 요청)
- Hover · translate-y/x + underline reveal (Vercel/Linear)

---

<a name="events"></a>
# Event System

## approvalEvents.ts · 실시간 배지 갱신

승인/요청 상태 변경 시 · 배지 즉시 갱신 · window focus 자동 refresh

**발신** (제출/승인/취소 후 성공 시):
```tsx
import { dispatchApprovalChange } from "@/lib/approvalEvents";

await api.post("/api/leave-requests", data);
dispatchApprovalChange("leave");
```

**수신** (Landing badge · NotificationBell 등):
```tsx
import { useApprovalRefreshListener } from "@/lib/approvalEvents";

useApprovalRefreshListener(reloadCounts);
```

**Scope**: `leave · display · order · return · lunch · mismatch · notification · all`

---

<a name="principles"></a>
# 디자인 원칙 · Linear/Vercel/Attio 2026

1. **단일 accent + 상태색만** · 파스텔 다색 지양
2. **Status dot ≤10px** · Vercel 규칙
3. **Top hairline gradient** · hero 카드 1군데만
4. **Attio "carved" segmented** · bg-white shadow-sm ring-line
5. **뉴트럴 KPI 값** · semantic delta 만 (▲emerald ▼rose)
6. **Tab underline 2px brand** (L1)
7. **뉴트럴 background** · tinted card body 지양
8. **Aurora radial glow** · 저채도 blur-3xl · 브랜드 signature
9. **3-layer shadow** · GPU 가속 depth · inset light + 즉시 + 원거리
10. **200ms ease-out** · 모든 인터랙션 통일
11. **폰트 +2 규칙** · 40대+ 가독성 (12→14, 14→15, ...)
12. **모달 backdrop** · frosted 딥네이비 · `.backdrop-brand` 사용

---

# 컴포넌트 분류

## Primitives (재사용 · tone/size prop)
StatusPill · CategoryChips · KpiCard · CollapseCard · BottomSheet · Button · IconButton · Modal · ConfirmDialog · Panel · Hero · SectionLabel · MiniCard · TabBar · PeriodSelector · Toolbar · PageToolbar · PageHeader · FieldLabel · SearchBar · SortableHeader · ResizableHeader · SplitPanel · SettingsPageShell · FilterBar · FilterSortBar · SearchFilterChips · ListLoading · LoadingState · EmptyState · ErrorBoundary · ProductClassFilter · SeasonButtons

## Feature/Domain (특정 도메인 · 재분류 후보)
EmployeeInfoForm · EmployeeProfileCard · InventoryEditModal · InventoryEditPanel · NewVendorModal · VendorInfoModal · VendorInfoHeader · VendorSearchModal · VendorCategoryBadge · ProductDetailPanel · ProductSearchInput · PurchaseHistoryList · PurchaseHistoryModal · StoreZoneMap · BreakModal · AddressSearchModal · ImageUploadField · MobileOnlyGate · SessionTimeoutWarning

---

# 마이그레이션 체크리스트

기존 코드 → 프레임워크로 리팩터링 시:

- [ ] 인라인 pill (`bg-*-50 text-*-700 rounded-full`) → **StatusPill**
- [ ] 인라인 backdrop (`bg-black/50`) → **`.backdrop-brand`** 유틸
- [ ] 인라인 shadow (`shadow-2xl`) → **`.shadow-brand-modal`** 유틸
- [ ] 인라인 input focus (`focus:border-indigo-500`) → **`.input-field`** or brand focus
- [ ] 인라인 label (`text-[12px] text-slate-600`) → **FieldLabel** or **`.label-field`**
- [ ] 인라인 loading (`Loader2 animate-spin`) → **LoadingState** or **ListLoading**
- [ ] 인라인 empty (`<Inbox size={28}>...`) → **EmptyState**
- [ ] 요청 제출 후 · **`dispatchApprovalChange(scope)`** 추가
- [ ] 헤더/사이드바 색상 · **NAV_ACCENT** 참조 (하드코딩 금지)

---

# 관련 문서

- **docs/TASKS.md** · 태스크 목록 · 완료 로그
- **docs/UI_MOCKUP_2026-08-17.html** · 목업 (참고)
- **memory/project_framework_components_2026-08-17.md** · 프레임워크 히스토리
- **memory/feedback_ui_top_principle.md** · UI 최상위 원칙
