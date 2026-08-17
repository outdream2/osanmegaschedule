# common/ 프레임워크 컴포넌트

> 재사용 가능한 UI 프레임워크 · Linear/Vercel/Attio 2026 SaaS 톤 · 딥네이비 브랜드
>
> **원칙**: 3곳 이상 반복되면 즉시 추출 · className/style만 변경 · handler/state/API 절대 X

---

## 채택 시 우선순위

1. 채택할 컴포넌트 있는지 이 README 먼저 확인
2. 없으면 인라인 구현 → 3번째 반복 시 추출 요청
3. tone/size prop 지정 · 커스텀 className 최소화

---

## StatusPill · 상태/카운트 pill

**10 tone** · 3 size · dot + pulse · icon 지원

```tsx
import { StatusPill, type PillTone } from "@/components/common/StatusPill";

<StatusPill tone="brand" size="md" dot>12건</StatusPill>
<StatusPill tone="emerald" size="sm">승인 완료</StatusPill>
<StatusPill tone="rose" size="xs" pulse>미결</StatusPill>
<StatusPill tone="indigo" size="md" icon={<Clock size={11} />}>대기 3건</StatusPill>
```

**Tone**: `brand`(딥네이비) · `sky` · `emerald` · `amber` · `rose` · `violet` · `teal` · `indigo` · `zinc` · `pine`(Hermès Pine #01796F)
**Size**: `xs`(h-5·11px) · `sm`(h-6·12px) · `md`(py-0.5·13px)

**부적합** (StatusPill 강제 X):
- 버튼 (hover state, click) → `<Button>` 사용
- 매트릭스 (다중 tone lookup · SHIFT_BADGE, STAFF_COLORS) → 그대로 유지
- 테이블 `<th>` 그룹 헤더 → 구조상 다름
- 아이콘 컨테이너 (w-7 h-7 tinted box) → 별개 패턴
- 알림 banner (icon + longer text + border) → semantic banner 유지
- 진행바 · 스위치 · 라디오 → 별개

---

## CategoryChips · 필터 chip

카테고리 필터 · 각 chip 좌측 status dot (Vercel ≤10px 규칙) · 딥네이비 active

```tsx
import { CategoryChips } from "@/components/common/CategoryChips";

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

---

## KpiCard · 대시보드 KPI

Vercel Dashboard 톤 · 뉴트럴 배경 + status dot · `Number(value) > 0` 자동 active

```tsx
import { KpiCard } from "@/components/common/KpiCard";

<KpiCard label="총 매입 건수" value={125} unit="건" tone="emerald" />
<KpiCard label="전월비" value={12.4} unit="%" tone="sky" delta="+3.2%" />
<KpiCard label="발주 대기" value={0} tone="zinc" hint="없음" />
```

**뉴트럴 톤 원칙**: value 는 zinc-900 · delta 만 semantic (▲emerald ▼rose) · 파스텔 배경 금지

---

## CollapseCard · 접기 카드

status dot + chevron + icon + right slot · 제어/비제어 · Attio shadow

```tsx
import { CollapseCard } from "@/components/common/CollapseCard";

<CollapseCard
  title="공급사 정보"
  icon={<Building2 size={14} />}
  tone="brand"
  defaultOpen
  right={<StatusPill tone="emerald" size="xs">완료</StatusPill>}
>
  {/* content */}
</CollapseCard>
```

---

## BottomSheet · 모바일 sheet

iOS/Material 2026 표준 · frosted backdrop + slide-up · ESC/click dismiss

```tsx
import { BottomSheet } from "@/components/common/BottomSheet";

<BottomSheet open={open} onClose={() => setOpen(false)} title="필터">
  {/* content */}
</BottomSheet>
```

---

## PageToolbar · 페이지 상단

accent bar + icon + title + count + selectedCount + search + right slot

```tsx
import { PageToolbar } from "@/components/common/PageToolbar";

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

## PeriodSelector · 기간 조회

segmented pill (7/30/90/180일 or 1~6개월) · 딥네이비 active

```tsx
import { PeriodSelector } from "@/components/common/PeriodSelector";

<PeriodSelector value={period} onChange={setPeriod} unit="days" />
```

---

## Hero · 히어로 배너

딥네이비 gradient + aurora glow + decorative blobs · v2 (2026-08-17)

```tsx
import { Hero, HeroButton } from "@/components/common/Hero";

<Hero
  eyebrow="TODAY · 2026-08-17"
  title="안녕하세요, 홍길동님"
  description="오늘 예약 3건 · 발주 2건 대기 중"
  actions={<HeroButton onClick={onGo}>바로가기</HeroButton>}
/>
```

**v2 세부**: 3-layer shadow · 3-stop gradient · aurora radial (mint+sky) · top hairline · Attio 세련

---

## TabBar · 3계층 위계

- **L1** underline (헤더 상단)
- **L2** Attio "carved" pill wrap (bg-zinc-100/80 + white active)
- **L3** Pine Green solid (#01796F · Hermès Pine · 사용자 확정)

```tsx
import { TabBar } from "@/components/common/TabBar";

<TabBar level="L2" tabs={[...]} value={tab} onChange={setTab} />
```

---

## Button · 공용 버튼

4 variant · 3 size · 폰트 +2

```tsx
import { Button } from "@/components/common/Button";

<Button variant="primary" size="md">저장</Button>
<Button variant="secondary" size="sm">취소</Button>
<Button variant="ghost">더보기</Button>
<Button variant="destructive">삭제</Button>
```

---

## SectionLabel · 섹션 라벨

dot + text · 5 tone

```tsx
import { SectionLabel } from "@/components/common/SectionLabel";

<SectionLabel tone="brand">기본 정보</SectionLabel>
```

---

## Nav 프레임워크 · sideNavGroups.ts

- **NAV_ACCENT**: 8 group tone hex+gradient+glow (헤더↔사이드바 단일 소스)
- **DARK_COLOR_TONES**: 사이드바 활성/비활성 (deep teal · 목업 톤)
- **DERIVED_TOP_TABS**: SIDE_NAV_GROUPS 로부터 헤더 탭 자동 파생 (drift 방지)
- **headerAccentGradient(color)**: 헤더 탭 하단 accent bar gradient

**Nav v2 (2026-08-17 밤)**:
- aurora radial glow · 헤더 좌상단 sky + 우상단 mint · 사이드바 상단 sky
- 3-layer shadow · 3-stop gradient · top/bottom hairline
- 로고 · ring-2 + brand glow · OSAN MEGATOWN tracking
- 사용자 chip · ring + hover glow
- inactive 탭 · hover translate-y (-1px)
- 사이드바 그룹/아이템 · frosted + inset light + translate-x hover
- 성씨 initial 제거 (사용자 요청)

---

## 디자인 원칙 · Linear/Vercel/Attio 2026

1. **단일 accent + 상태색만** · 파스텔 다색 지양
2. **Status dot ≤10px** · Vercel 규칙
3. **Top hairline gradient** · hero 카드 1군데만
4. **Attio "carved" segmented** · bg-white shadow-sm ring-line
5. **뉴트럴 KPI 값** · semantic delta 만 (▲emerald ▼rose)
6. **Tab underline 2px brand** (L1)
7. **뉴트럴 background** · tinted card body 지양
8. **Aurora radial glow** · 저채도 blur-3xl · 브랜드 signature
9. **3-layer shadow** · GPU 가속 depth
10. **200ms ease-out** · 모든 인터랙션 통일

---

## 컴포넌트 카테고리

**Pure framework primitives** (재사용 · tone/size prop):
StatusPill · CategoryChips · KpiCard · CollapseCard · BottomSheet · Button · IconButton · Modal · ConfirmDialog · Panel · Hero · SectionLabel · MiniCard · TabBar · PeriodSelector · Toolbar · PageToolbar · PageHeader · FieldLabel · SearchBar · SortableHeader · ResizableHeader · SplitPanel · SettingsPageShell · StatusPill · FilterBar · FilterSortBar · SearchFilterChips · ListLoading · LoadingState · EmptyState · ErrorBoundary

**Feature/domain** (특정 도메인 전용 · 다른 파일 이동 검토):
EmployeeInfoForm · EmployeeProfileCard · InventoryEditModal · InventoryEditPanel · NewVendorModal · VendorInfoModal · VendorInfoHeader · VendorSearchModal · VendorCategoryBadge · ProductClassFilter · ProductDetailPanel · ProductSearchInput · PurchaseHistoryList · PurchaseHistoryModal · SeasonButtons · StoreZoneMap · ZoneLabelsEditor · BreakModal · AddressSearchModal · ImageUploadField · MobileOnlyGate · SessionTimeoutWarning

---

## 다음 우선순위 (2026-08-17 밤)

- ✅ legacy `StatusBadge` 삭제 (미사용 확인 후)
- 🔲 common/ 재분류 · `common/primitives/` vs `common/features/` 분리
- 🔲 500라인 초과 파일 슬림화 · ProductDetailPanel(647) · EmployeeInfoForm(482) · InventoryEditPanel(390)
- 🔲 ContractWriterPage (5,400 lines) 분리 후 프레임워크 확산
- 🔲 파스텔 잔재 P0 지속 · 남은 30 파일 중 실제 pill 후보 스캔
