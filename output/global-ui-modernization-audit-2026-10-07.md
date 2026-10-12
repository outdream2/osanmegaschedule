# Global UI Modernization — Phase 0 Audit

**Date:** 2026-10-07
**Scope:** Entire webapp **excluding Schedule** (SchedulePage · schedule-v2 · LeavePage · DayTimelineModal · EmployeeCalendarModal · ScheduleSettingsPage).
**Mode:** READ-ONLY. No code / CSS / component / route / API / DB / business-logic change.
**Design reference:** `c:\Users\USER\Desktop\46ecd86a-97c7-4d83-b07a-4d24366b0327.png` — modern Operations SaaS dashboard (dark navy sidebar · 3-KPI hero · 3-card main grid · quick-launch grid · PC/mobile parity). Already partially realised on `landing` (commit `4c13b869` · feat(home): phase 2 · 2026 operations dashboard redesign).

---

## 1. Menu Tree (code-sourced)

Single source: `src/components/layout/sideNavGroups.ts` (`SIDE_NAV_GROUPS[]`). Permission gates: `managerOnly` / `minLevel` / `pharmacistOnly`. Sub-tabs are derived from this file — not hardcoded in page components.

```
홈
└─ 홈 ................................. landing

업무요청 (indigo)
├─ 승인업무 ............................. requests, subTab=leave     (managerOnly)
├─ 요청확인 ............................. requests, subTab=display   (managerOnly)
└─ 서류작성 ............................. approval-request, subTab=document-writer

매장 (red)
├─ 발주 ................................ display, subTab=purchase-order (minLevel 9)
├─ 매입 ................................ display, subTab=purchase       (minLevel 9)
├─ 판매 ................................ display, subTab=statistics     (minLevel 9)
├─ 매출 ................................ display, subTab=revenue        (minLevel 9)
├─ 결제 ................................ display, subTab=payment        (minLevel 9)
├─ 반품 ................................ display, subTab=return         (minLevel 9)
├─ 매장진열 ............................. display, subTab=store          (managerOnly)
└─ 입고알림 ............................. display, subTab=stock-arrivals (minLevel 3)

거래처 (emerald)
├─ 방문예약 ............................. reservation
├─ 공급사 정보 .......................... display, subTab=vendor-manage
├─ 공급사 재고확인 ...................... vendor-stock
└─ 발주이력 확인 ........................ vendor-order-history

경영 (violet)
├─ 직원관리 ............................. business-manage, subTab=staff-manage        (managerOnly)
├─ 근로계약서 작성 ...................... business-manage, subTab=document-writer:contract (managerOnly)
└─ 각종양식 ............................. business-manage, subTab=hr-forms            (managerOnly)

약사 (sky)
└─ 약사 ................................ pharmacist (pharmacistOnly)

이슈 (emerald)
└─ 이슈 ................................ board

설정 (slate · minLevel 9)
├─ 메뉴 설정 ............................ permissions
├─ 스케줄 설정 .......................... schedule-settings   ← SCHEDULE SCOPE · exclude
├─ 회사·브랜드 .......................... company-info
├─ 통계 설정 ............................ season-settings
├─ 시스템 설정 .......................... system-settings
├─ 발주 설정 ............................ order-settings
└─ ERP 초기 구축 ........................ admin-initial-build

계정 (slate)
└─ 마이페이지 ........................... mypage

[스케줄] ← OUT OF SCOPE (frozen V1 + V2 workstream)
├─ 스케줄 ............................... schedule
├─ 새 스케줄 ............................ schedule-v2
└─ 연차신청 ............................. approval-request, subTab=leave  (shared router — leave form belongs to schedule domain)

Direct entry (not in sidebar — opened by action/scan/code):
scan · productarrival · ocr · leave (schedule) · lunch · stockcheck · stockarrivals · zone-labels · hr-forms · pharmacist · branding · order-settings · settings-hub
```

**Sub-tab config SSOT.** Pages consume `getPageSubTabs(pageKey)` / `getGroupSubTabs(groupId, pageKey)` from `sideNavGroups.ts`. Active sub-tab state is `ActiveNavContext` (SSOT since 2026-09-27). Legacy `sidebar.subtab.*` localStorage keys are deprecated.

---

## 2. Page Inventory (schedule excluded)

| page | menu | component | permission | primary | secondary | subtabs | filter | table | detail | mobile | risk | WIP |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LandingPage | 홈 | `LandingPage/LandingPage.tsx` | all | A | — | 0 | status/keyword | — | modal | parity | LOW | **ACTIVE** (phase-2 dashboard just landed `4c13b869`) |
| DisplayPage | 매장 (umbrella) | `DisplayPage/*` + `OrderManagePage.tsx` | mixed | D | B / C | 10+ | search / zone / dow / staff | yes | modal + aside | OK | MEDIUM | clean |
| OrderManagePage | 매장 → 발주 | `OrderManagePage.tsx` (initialTopTab) | lv 9 | D | B | 8+ (nested) | vendor / month / product | yes | modal (nested) | PC-first | HIGH | clean |
| StockManagePage | 매장 → 매입 | `StockManagePage/*` | lv 9 | B | E | 5 | supplier / flow-class | yes | — | OK | MEDIUM | clean |
| SalesTrendPage | 매장 → 판매 | `SalesTrendPage.tsx` | lv 9 | E | — | 2 | month-range / granularity / supplier | yes | modal | OK | MEDIUM | clean |
| RevenuePage | 매장 → 매출 | `RevenuePage/*` | lv 9 | E | A | — | period preset / month | yes | drill-down table | OK | MEDIUM | clean |
| VatPreparePage | 매장 → 결제 | `VatPreparePage/*` | lv 9 | E | B | 3 | period-preset | yes | — | PC-first | MEDIUM | clean |
| ScanPage | 매장 → 입고알림 (and direct `scan`) | `ScanPage/ScanPage.tsx` | all | D | B | 0 | location / zone / expiry | yes | right-panel | mobile-first | HIGH | clean |
| ProductArrivalPage | 매장 → 입고알림 (direct) | `ProductArrivalPage/*` | all | D | B | 2 | status / date | yes | modal | mobile-first | MEDIUM | clean |
| StockArrivalPage | 매장 → 입고알림 | `StockArrivalPage/*` | mgr | B | — | 0 | scheduled / status | yes | inline-edit | OK | LOW | clean |
| ProductInfoPage | 매장 → 매입 (내부) | `ProductInfoPage/*` | lv 9 | C | B | 0 | search / sale-status | yes | SplitPanel | PC-first | MEDIUM | clean |
| ReservationPage | 거래처 → 방문예약 | `ReservationPage.tsx` | mgr | G | — | 0 | date / month | — | availability-slot | OK | MEDIUM | clean |
| VendorStockPage | 거래처 → 재고확인 | `VendorStockPage.tsx` | mgr | B | — | 0 | supplier / search | yes | modal | OK | LOW | clean |
| VendorOrderHistoryPage | 거래처 → 발주이력 | `VendorOrderHistoryPage.tsx` | mgr | B | — | 0 | supplier / month | yes | aside | OK | LOW | clean |
| BusinessManagePage | 경영 (umbrella) | `BusinessManagePage/*` | mgr | D | — | 4 | — | — | modal | OK | MEDIUM | clean |
| StaffManagePage | 경영 → 직원관리 | `StaffManagePage/*` | mgr | C | B | 0 | search / status | yes | SplitPanel + modal | OK | HIGH | clean |
| ContractWriterPage | 경영 → 근로계약서 | `ContractWriterPage/*` | mgr | G | — | 0 | — | — | SplitPanel (preview) | PC-first | HIGH | clean |
| HrFormsPage | 경영 → 각종양식 | `BusinessManagePage` subtab | mgr | B | G | — | type / date | yes | modal | OK | MEDIUM | clean |
| RequestsPage | 업무요청 (umbrella) | `RequestsPage/*` | mgr | D | F | 5 | status / date | yes | modal | OK | MEDIUM | clean |
| ApprovalRequestPage | 승인요청 (employee entry) | `ApprovalRequestPage/*` | all | D | G | 3 | — | — | — | OK | LOW | clean |
| LunchPage | 업무요청 → 점심불참 | `LunchPage/LunchPage.tsx` | all | D | — | 0 | date / employee | — | timeline aside | OK | MEDIUM | clean |
| BoardPage | 이슈 | `BoardPage/BoardPage.tsx` | all | B | — | 0 | type / status / category / search | yes | inline-expand + modal | OK | LOW | clean |
| PharmacistPage | 약사 | `PharmacistPage/*` | lv ≥ 3 | D | B | 3 | — | — | right-panel | OK | MEDIUM | clean |
| MyPage | 계정 | `MyPage.tsx` | all | G | — | 0 | — | — | — | OK | LOW | clean |
| PermissionsPage | 설정 → 메뉴 설정 | `PermissionsPage.tsx` | lv 9 | B | G | 0 | role / search | yes | modal | PC-first | MEDIUM | clean |
| CompanyInfoSettingsPage | 설정 → 회사·브랜드 | lazy | lv 9 | G | — | 0 | — | — | — | OK | LOW | clean |
| SeasonSettingsPage | 설정 → 통계 | lazy | lv 9 | G | — | 0 | — | — | — | OK | LOW | clean |
| SystemSettingsPage | 설정 → 시스템 | lazy | lv 9 | G | — | 0 | — | — | — | OK | LOW | clean |
| OrderSettingsPage | 설정 → 발주 | lazy | lv 9 | G | — | 0 | — | — | — | OK | LOW | clean |
| AdminInitialBuildPage | 설정 → ERP 초기 | lazy | lv 9 | D | G | 2+ | — | — | — | PC-only | HIGH | clean (DEPRECATED per memory `project_erp_sync_architecture_2026-10-03`) |
| ZoneLabelsEditor | direct `zone-labels` | lazy | mgr | G | — | 0 | — | — | — | OK | MEDIUM | clean |
| OcrPage | direct `ocr` | `OcrPage.tsx` | mgr | D | G | 0 | — | yes | aside | OK | HIGH | clean |

**WIP ledger (from `git status` + recent commits).**
- `docs/FRAMEWORK_AUDIT.md` (tracked-modified) — audit note only, non-UI.
- `output/*` and `scripts/*` and `tools/*` (untracked) — audit artefacts & dev tools, do not touch.
- Recent 15 commits touched: `landing` (phase 2 dashboard · 4 commits · ACTIVE WIP), `location` SSOT (`45b14f69` / `e876c3d7`), `revenue` (duplicate monthly removed), `schedule` (frozen · do not touch), `sales` (DashboardTab removed).

**Classification.**
- ACTIVE WIP → `LandingPage` only (phase-2 dashboard just landed, continued iteration expected).
- CLEAN → every other non-schedule page.
- DEFERRED → `AdminInitialBuildPage` (per project memory 2026-10-03 · ERP build moved to sync-agent; UI de-emphasised).

---

## 3. Current UI Patterns (code-sourced)

### 3.1 Existing primitives (`src/components/common/`) — reusability indicators

| component | purpose | import count (rough) |
|---|---|---|
| `Button` | action button · size/variant/tone | **200+** |
| `Modal` | centered overlay · size preset · headerBg override (v3.4) | **177** |
| `AccentBar` | 3px vertical brand bar | 78+ |
| `Spinner` | inline loader | 55+ |
| `Card` | surface primitive · variant / padding / rounded / border | **41+** |
| `StatusPill` | badge · rounded-full/md · tone + dot + pulse | **41+** |
| `TabBar` | multi-level tabs (L1 underline · L2 pill · L3 chip) | **23** |
| `KpiCard` | KPI metric · icon + label + value + delta | 15+ |
| `SectionLabel` | block-level label with tone dot + text | 14+ |
| `InlineLabel` | accent bar + text (sm/md/lg) | 14+ |
| `FilterSortBar` | pill filter group with accent-bar label | 12+ |
| `PageToolbar` | accent bar + icon/title + count + search + right slot | 10+ |
| `SegmentedControl` | pill/flat segmented · brand/emerald/zinc | 8+ |
| `CollapseCard` | expandable card · header icon + chevron + right slot | 8+ |
| `BottomSheet` | mobile bottom drawer (v2: fullscreen · custom header) | 8+ |
| `SplitPanel` | master-detail · drag-resize divider · localStorage width | 8+ |
| `SplitListPanel` | left list wrapper · search/filter/add toolbar · loading/empty/error | 6+ |
| `EmptyState` | empty list block | 6+ |
| `FormRow` / `FormSection` | form layout wrappers | 6+ |
| `CategoryChips` | chip group with ≤10 px identity dot | 4+ |
| `SearchBar` | search input wrapper | 4+ |
| `Badge` | small label | 4+ |
| `Breadcrumb` | navigation trail · icon support | 3+ |
| `Hero` | banner section · icon/title/aside | 2+ |
| `PeriodSelector` | date range picker **stub** · only Landing uses it | 2+ |
| `ChartCard` | Recharts wrapper | 2+ |

**Observation.** The primitive layer is already dense. Modernisation does not need new primitives — it needs **enforced routing of every surface to the existing ones**.

### 3.2 Tab styles in use

| bucket | files | representative path |
|---|---|---|
| `common/TabBar` L1 (underline + brand gradient bar) | ~8 | `OrderManagePage/CategoryTab.tsx` |
| `common/TabBar` L2 (Attio "carved" pill) | ~12 | `BusinessManagePage/BusinessManagePage.tsx` |
| `common/TabBar` L3 (chip row with Pine Green #01796F active) | ~4 | `RequestsPage` sub-rows |
| `SegmentedControl` pills / flat | 8+ | `SaleStatusFilter`, `ProductDetailPanel` |
| hand-rolled `role="tab"` | 4 | `OcrPage`, `PharmacistPage` legacy |
| Line Tabs (schedule-v2 line tabs — out of scope ref) | 1 | `ScheduleV2Page.tsx` |

### 3.3 Filter styles in use

| bucket | files | representative path |
|---|---|---|
| `PageToolbar` (search + right slot) | 5+ | `OrderManagePage/CategoryTab.tsx` |
| `FilterSortBar` (pill group + accent label) | 6+ | `StockManagePage/SupplierFilterBar.tsx` |
| custom per-page toolbars (inline flex of chips) | ~15 | `StaffManagePage`, `BoardPage`, `ScanPage` |
| period picker — custom per page | 2–3 | `TodayRevenueKpiPanel`, `RevenueAnalysis` |

### 3.4 Detail-panel styles

| pattern | representative | notes |
|---|---|---|
| `SplitListPanel` + `SplitPanel` | `ProductInfoPage`, `StaffManagePage` | localStorage width · responsive mobile fallback · `autoFitLeft` |
| `Modal` detail | `BoardPage`, `VendorOrderHistoryPage` | 177 Modal imports total; many unnecessary when selection could stay in-page |
| `BottomSheet` (fullscreen variant) | `RealMapSelector`, `StaffMobileDetail` | custom indigo/dark header — not matching primitive |
| full-page detail | `ContractWriterPage` preview, `ReservationPage` | needed by workflow |

### 3.5 Analytics patterns

Already well-shaped on `RevenuePage` (period preset · KPI · chart · drill-down table) and `VatPreparePage` (period preset · KPI · breakdown table). Reusable as the analytics template.

### 3.6 Dashboard pattern

`LandingPage` (phase-2 commit `4c13b869`) + `TodayRevenueKpiPanel` + `TodayStatusPanel` (just refactored to card layout) already implement the Operations Dashboard template from the design reference. This is the canonical dashboard shape going forward.

---

## 4. Inconsistencies

| # | issue | severity | reason |
|---|---|---|---|
| 1 | Filter location drift | **HIGH** | Same filter concept (search / status / period) lives in `PageToolbar` right slot on some pages, in `FilterSortBar` on others, inline-flex of custom chips on 15+ pages. No single filter-row contract. |
| 2 | Period selector fragmentation | **HIGH** | `PeriodSelector` primitive exists but only Landing uses it. `RevenuePage`, `SalesTrendPage`, `VatPreparePage` each roll their own date-range UI. |
| 3 | Modal over-use for detail | **HIGH** | 177 `Modal` imports — many pages open a modal where a `SplitListPanel` / `SplitPanel` + `BottomSheet` mobile fallback would be more coherent. Breaks the "same role → same look" rule. |
| 4 | Mixed tab styles across the same hierarchy | MEDIUM | L1 vs L2 vs chip tabs are intermixed. Some pages use L1 for internal view switcher (should be Segmented), some use L2 for top-level page nav (should be L1 Line Tabs). |
| 5 | Z-index incoherence | MEDIUM | `Modal` z-50, `ConfirmDialog` / `VendorInfoModal` z-[9999], `BottomSheet` z-[100] with ad-hoc overrides. No tiered scale. |
| 6 | Per-page page headers | MEDIUM | Mixed `<h1>`, `PageToolbar`, custom `<div>` headers. No consistent breadcrumb → title → action chain. |
| 7 | Custom per-page filter toolbars | MEDIUM | ~15 pages hand-roll `<div className="flex gap-...">` filter rows instead of using `FilterSortBar` / `PageToolbar`. |
| 8 | Empty detail rail | LOW | `ProductInfoPage` / `StaffManagePage` show empty right pane with no selection — eats whitespace. SplitPanel supports `autoFitLeft` but it's not always wired. |
| 9 | Icon colour overload | LOW | MenuCards and dashboard icons use many different tones per icon. Design reference shows calmer palette (tinted backgrounds, dark glyphs). |
| 10 | BottomSheet drift | LOW | 2 BottomSheet variants (default vs fullscreen with custom header). Minor duplication. |

---

## 5. Reusable Primitives — Keep / Extend / Avoid Creating

**Keep as-is** (already carry the modernization load):
- `Button`, `Card`, `Modal`, `BottomSheet`, `TabBar` (L1/L2/L3), `SegmentedControl`, `SplitPanel`, `SplitListPanel`, `StatusPill`, `KpiCard`, `AccentBar`, `SectionLabel`, `InlineLabel`, `EmptyState`, `Spinner`, `Breadcrumb`, `Hero`, `ChartCard`, `CategoryChips`, `CollapseCard`, `FormRow` / `FormSection`.

**Extend** (minor contract hardening — no new file):
- `PageToolbar` → make it the mandatory page header shell (breadcrumb slot + title + description + primary action + search + right slot). Already covers 10+ pages.
- `FilterSortBar` → add a "compact toolbar" preset: `[search] [status ▾] [period ▾] [+filter]`. Keep the pill-group variant for simple filter rows.
- `PeriodSelector` → promote stub into the single period picker; wire into Revenue / Sales / VAT / Today-KPI panels (currently only Landing uses it).
- `SplitListPanel` → standardize the `autoFitLeft` / `desktopMinWidth` props so "no selection → list full width" is the default across master-detail pages.
- `BottomSheet` v2 → absorb the custom indigo/dark variant used in a couple of fullscreen mobile sheets.

**New** (ONLY create after real duplicate count justifies it):
- `AppPageHeader` thin wrapper around `PageToolbar` + `Breadcrumb` (currently 3+ Breadcrumb usages — extract when ≥5).
- `CompactFilterToolbar` as a `FilterSortBar` preset — probably doesn't need a new file, just a preset prop.
- No other new primitives in Phase 0.

**Avoid** (do NOT introduce):
- A new Dashboard-only shell. `LandingPage` already is it.
- A new DataTable abstraction. Use the dense table pattern already in Revenue / Stock.
- A separate mobile component tree. Mobile = same components + `BottomSheet` for detail.

---

## 6. Design System Proposal — Six Page Templates

The audit confirms the user-stated template taxonomy fits every non-schedule page. Each template fixes which existing primitives are allowed where.

| template | canonical pages | header | inner nav | filter | content | detail | mobile |
|---|---|---|---|---|---|---|---|
| **A · Operations Dashboard** | `LandingPage` | Hero + section labels | — | — | KPI row (`KpiCard` ×3) · action-list cards · quick-launch grid · 공지/알림 | modal only for drill-ins | same layout stacked · BottomSheet for action-list drill-in |
| **B · Tabbed Operations** | `OrderManagePage` 발주 · `OrderManagePage` 매입 · `StockManagePage` · `OrderManagePage` 판매 · `VendorStockPage` · `VendorOrderHistoryPage` · `DisplayPage` | `PageToolbar` + `Breadcrumb` | `TabBar` L1 Line (page nav) · `SegmentedControl` (view switch, 공급사별/상품별/단가변동 등) | `FilterSortBar` compact: search + status + period + +filter | `DataTable` dense (`StatusPill` for state) | contextual `SplitPanel` aside | PC columns stacked · aside → `BottomSheet` |
| **C · Analytics (KPI + Chart + Drilldown)** | `RevenuePage` · `SalesTrendPage` · `VatPreparePage` · (future 경영 요약) | `PageToolbar` + `PeriodSelector` | `SegmentedControl` (metric / view) | compact filter · supplier/category chips | `KpiCard` row → `ChartCard` → drilldown table | row click → inline expand or `BottomSheet` | same |
| **D · Workflow List** | `RequestsPage` · `ApprovalRequestPage` · `ProductArrivalPage` · `ScanPage` (right pane) · `StockArrivalPage` (반품 포함) · `BoardPage` | `PageToolbar` | `TabBar` L1 status tabs (대기/진행/완료) | compact filter: search + 담당자 + 기간 | action-list rows with `StatusPill` + primary action button | `SplitPanel` aside or `BottomSheet` (mobile) | mobile sheet |
| **E · Master → Detail** | `ProductInfoPage` · `StaffManagePage` · `PermissionsPage` · `PharmacistPage` | `PageToolbar` | — | `SplitListPanel` built-in toolbar | dense list on left | `SplitPanel` right aside w/ tabs | mobile = full page on select · `BottomSheet` for quick actions |
| **F · Form / Editor** | `ContractWriterPage` · `MyPage` · `ReservationPage` · 각종양식 · `CompanyInfoSettingsPage` · `SeasonSettingsPage` · `SystemSettingsPage` · `OrderSettingsPage` · `ZoneLabelsEditor` | `PageToolbar` | — | — | `FormSection` + `FormRow` grid · live preview (`SplitPanel` for Contract) | — | single-column form · sticky action footer |

**Design language (applies to every template).**
Less chrome · more data · clear hierarchy · contextual actions · quiet colours · consistent navigation. No pill-in-pill, no card-in-card, no gradient blocks on list pages, no icon-colour explosions. Line Tabs for page nav · Segmented for view · Toolbar for filter · Aside/Sheet for detail · same taxonomy on every page.

**Rejected mappings.** `AdminInitialBuildPage` is Template F in form but DEPRECATED per sync-agent decision — not in migration scope. `OcrPage` sits between D and F; treat as D (document pipeline is a workflow) but low priority. `DisplayPage` is an umbrella router for Template B pages — the umbrella itself needs no redesign, only the children.

---

## 7. Missing Shared Patterns (gaps the templates expose)

- **No `AppPageHeader`.** `PageToolbar` is close but lacks a formal breadcrumb slot and primary-action slot contract. 3 pages hand-roll breadcrumbs.
- **No compact filter-toolbar preset.** `FilterSortBar` is the pill variant; the dashboard-style `[search] [status ▾] [period ▾] [+filter]` is absent — ~15 pages improvise.
- **No shared period picker.** `PeriodSelector` is a 2-use stub; every analytics page bakes its own.
- **No z-index scale.** Scattered 50 / 100 / 9999 — modal/overlay/toast tiers are unspecified.
- **No `useListDetail` hook** for the "selection + aside" contract. SplitPanel is wired manually each time.

Each gap is **addressed by extending an existing primitive**, not creating a new one — see §5.

---

## 8. Migration Batches

Ordered by risk and by shared-template amortisation (every batch widens the same template contract):

| batch | pages | template | risk | reason to go first/last |
|---|---|---|---|---|
| **1 · AppShell + Dashboard** (already landed) | `LandingPage` | A | LOW | commit `4c13b869` just shipped — only stabilise/polish, do not restart |
| **2 · Master-Detail list pages** | `ProductInfoPage` · `StaffManagePage` · `BoardPage` · `VendorStockPage` · `VendorOrderHistoryPage` | B / E | LOW–MEDIUM | pure presentation, exercises `SplitListPanel` + compact filter toolbar early |
| **3 · Tabbed operations (매입 / 매장진열 / 재고)** | `StockManagePage` · `DisplayPage` 매장진열 · `StockArrivalPage` | B | MEDIUM | locks in Template B · dense table + aside |
| **4 · Analytics (매출 / 판매 / 결제)** | `RevenuePage` · `SalesTrendPage` · `VatPreparePage` | C | MEDIUM | reuses Template B toolbar, adds KPI + Chart + Drilldown |
| **5 · Workflow pages** | `RequestsPage` · `ApprovalRequestPage` · `ProductArrivalPage` · `LunchPage` · `ScanPage` (right pane) | D | MEDIUM | status tabs + action-list rows + BottomSheet |
| **6 · Settings + Forms** | `PermissionsPage` · `CompanyInfoSettingsPage` · `SeasonSettingsPage` · `SystemSettingsPage` · `OrderSettingsPage` · `ZoneLabelsEditor` · `MyPage` · `ReservationPage` · `HrFormsPage` · `ContractWriterPage` | F | LOW–HIGH (Contract is HIGH) | isolated from the data mesh — safe to leave for last |
| **7 (deferred)** | `AdminInitialBuildPage` · `OcrPage` | — | HIGH | ERP initial-build is deprecated per sync-agent; OCR is complex and low business urgency |
| **8 (never, this programme)** | all schedule pages + Order's complex nested `OrderManagePage` 발주/매입 flows | — | HIGH | schedule is OUT OF SCOPE; `OrderManagePage` deep nest requires a dedicated workstream, not a global pass |

**Dependency notes.**
- Batch 2 is a prerequisite for Batch 3 and 5 because it hardens `SplitListPanel` + compact filter toolbar.
- Batch 3 is a prerequisite for Batch 4 because analytics reuses the same tabbed header + dense table.
- `OrderManagePage` is intentionally held — its nested sub-tabs & vendor detail tabs are deep; treat as its own batch after templates stabilise.

---

## 9. Risk Summary

- **Highest risk pages** (postpone or isolate): `ScanPage` (write path · dual-pane state), `ContractWriterPage` (wage calc · PDF export), `StaffManagePage` (file uploads + contract history), `AdminInitialBuildPage` (deprecated), `OcrPage` (model pipeline).
- **Design-language risk**: Operations Dashboard template leans on the just-landed phase-2 Landing commit; any destabilising change there slows the rest. Keep Landing in a stabilise-only mode during Batch 2–3.
- **Memory-rule constraints that must be upheld during modernisation**:
  - 첫 탭 default · localStorage 복원 금지 (feedback_default_first_tab_2026-09-23)
  - 탭 재정렬 long-press (feedback_tab_reorder) — managerOnly, hierarchical sub-tabs only, main nav excluded
  - 리스트/카드 앞 동그란 아이콘 금지 (feedback_no_circular_icons_2026-09-18) — Operations Dashboard icon-pills must obey (text-first, tinted bg, no circular avatar)
  - 반응형 리스트 → 카드 전환 (feedback_responsive_list_to_card_2026-09-20)
  - 말줄임표 금지 · 폭 확장 or 줄바꿈 (feedback_no_ellipsis)
  - DB 연동 최우선 · fallback 금지 · "(이름없음)" 등 금지 (feedback_no_fallback_db_first_2026-10-06)

---

## 10. RECOMMENDED GLOBAL UI SYSTEM

**Decision.** Six-template Operations SaaS system, implemented by **extending existing primitives**. No new design system file, no new tokens, no new base components in Phase 0.

**Contract.**

| role | one UI — always |
|---|---|
| Page navigation | `TabBar` L1 (Line Tabs) |
| Same-page view switch | `SegmentedControl` |
| Filtering | `FilterSortBar` compact preset (search · status · period · +filter) |
| Period selection | `PeriodSelector` (promoted from stub) |
| List | dense table (shared row/column conventions) |
| Detail | desktop `SplitPanel` aside · mobile `BottomSheet` |
| Modal | only for destructive confirms, imports, pickers |
| Workflow row action | `StatusPill` + primary `Button` |
| Analytics | `KpiCard` → `ChartCard` → drilldown table |
| Form | `FormSection` + `FormRow` + sticky action footer |
| Dashboard | Hero + SectionLabel + KpiCard row + action-list cards + quick-launch grid |

**What to keep.** All 25+ primitives in `src/components/common/` plus `TodayRevenueKpiPanel`, `TodayStatusPanel` (newly refactored), `LandingPage` phase-2 layout.

**What to extend (small contract changes, no new files unless noted).**
1. `PageToolbar` — add `breadcrumb`, `description`, `primaryAction` optional slots.
2. `FilterSortBar` — add `preset="compact-toolbar"` variant.
3. `PeriodSelector` — promote stub to canonical period picker; wire into analytics pages.
4. `SplitListPanel` — default `autoFitLeft` on, `desktopMinWidth` sensible.
5. `BottomSheet` v2 — absorb the fullscreen/custom-header variant.
6. Optional new file (only after Batch 2 confirms real duplication): `AppPageHeader` thin shell combining `Breadcrumb` + `PageToolbar`.

**What NOT to create.** New Dashboard-only components, a parallel mobile tree, a bespoke DataTable framework, new design tokens.

**First migration batch to execute (when the user authorises Phase 1).**
**Batch 2** — Master-Detail list pages (`ProductInfoPage` · `StaffManagePage` · `BoardPage` · `VendorStockPage` · `VendorOrderHistoryPage`). Reasons: pure presentation, lowest risk, exercises both `SplitListPanel` and the compact filter toolbar across 5 pages so every later batch inherits a hardened pattern.

**Explicitly deferred.** `OrderManagePage` deep nest · `AdminInitialBuildPage` (deprecated) · `OcrPage` · all schedule pages.

**Schedule confirmation.** SCHEDULE TOUCHED = NO. Every schedule-scope file (SchedulePage · schedule-v2 · LeavePage · DayTimelineModal · EmployeeCalendarModal · ScheduleSettingsPage · schedule server routes · schedule shared logic) is explicitly outside this programme.

---

## FINAL STATUS

| flag | value |
|---|---|
| MENU TREE COMPLETE | YES |
| PAGE INVENTORY COMPLETE | YES |
| PAGE TYPES CLASSIFIED | YES (six templates A–F) |
| SHARED PATTERNS IDENTIFIED | YES |
| ACTIVE WIP IDENTIFIED | YES (Landing phase-2 only) |
| RECOMMENDED GLOBAL UI SYSTEM | YES (six-template, extend-not-create) |
| MIGRATION PLAN READY | YES (8 batches ordered by risk + template amortisation) |
| SCHEDULE TOUCHED | NO |
| CODE CHANGED | NO |
