// src/components/common/index.ts
// 2026-08-21 · #176 Phase D 준비 · common/ barrel export
//
// 목적:
//   기존 · `import { Card } from "../common/Card"` (파일 경로 직접)
//   신규 · `import { Card } from "../common"` (barrel · 파일 이동에 무감각)
//
// 향후 파일 이동/재분류 시 · barrel 만 갱신하면 사용처는 무영향.
// 기존 direct import 는 유지 (하위호환) · 새 코드부터 barrel 사용 권장.
//
// 유형 별 그룹 (README 및 리서치 결과 반영):
//   Primitives (프리미티브 · 40+) · 순수 표현·재사용성 높음
//   Feature-adjacent · common/ 에 위치하지만 도메인 로직 있는 것 (few)
//   Features · src/components/common/features/ 별도 (barrel 제외)
//   Helpers  · src/lib/ 이동 (barrel 제외)

// ── Primitives (배지·버튼·카드·헤더·필터·아이콘·모달 등) ──
// 2026-09-01 · 미사용 11개 삭제 · ActionBar · GroupedListPanel · IconButton · MiniCard
//   · PageContainer · PageHeader · ProductClassFilter · SearchFilterChips · SortableHeader
//   · SplitRightHeader · SplitRightLoading (자체 test 외 참조 zero)
export { AccentBar } from "./AccentBar";
export { Badge } from "./Badge";
export type { BadgeTone } from "./Badge";
export { BottomSheet } from "./BottomSheet";
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbItem, BreadcrumbProps } from "./Breadcrumb";
export { Button } from "./Button";
export { Card } from "./Card";
export type { CardProps, CardVariant, CardPadding, CardRounded } from "./Card";
export { CategoryChips } from "./CategoryChips";
export { CollapseCard } from "./CollapseCard";
export { ConfirmDialog } from "./ConfirmDialog";
export { EmptyState } from "./EmptyState";
export { ErrorBoundary } from "./ErrorBoundary";
export { ChartCard } from "./ChartCard";
export type { ChartCardProps } from "./ChartCard";
export { FieldLabel } from "./FieldLabel";
export { FilterBar } from "./FilterBar";
export { FormRow } from "./FormRow";
export type { FormRowProps } from "./FormRow";
export { FormSection } from "./FormSection";
export type { FormSectionProps } from "./FormSection";
export { FilterSortLabel, FilterSortGroup, FilterSortRow } from "./FilterSortBar";
export { GradientAccent } from "./GradientAccent";
export { Hero } from "./Hero";
export { IconTile } from "./IconTile";
export { ImageUploadField } from "./ImageUploadField";
export { InlineLabel } from "./InlineLabel";
export { KpiCard } from "./KpiCard";
export { ListLoading } from "./ListLoading";
export { ListPanel, ListRow } from "./ListRow";
export type { ListPanelProps, ListRowProps } from "./ListRow";
export { LoadingState } from "./LoadingState";
export { MobileOnlyGate } from "./MobileOnlyGate";
export { Modal } from "./Modal";
export { NotificationToast } from "./NotificationToast";
export { PageToolbar } from "./PageToolbar";
export { Panel } from "./Panel";
export { PeriodSelector } from "./PeriodSelector";
export { ProductDetailHero } from "./ProductDetailHero";
export { ResizableTh } from "./ResizableHeader";
export { SaleStatusFilter } from "./SaleStatusFilter";
export { SearchBar } from "./SearchBar";
export { SeasonButtons } from "./SeasonButtons";
export { SectionCard } from "./SectionCard";
export { SectionLabel } from "./SectionLabel";
export { SegmentedControl } from "./SegmentedControl";
export type { SegmentedTone, SegmentedSize, SegmentedOption, SegmentedControlProps } from "./SegmentedControl";
export { SessionTimeoutWarning } from "./SessionTimeoutWarning";
export { SettingsPageShell } from "./SettingsPageShell";
export { SignaturePad } from "./SignaturePad";
export { SubmitBar } from "./SubmitBar";
export type { SubmitBarProps } from "./SubmitBar";
export { Spinner } from "./Spinner";
export { SplitLeftHeader } from "./SplitLeftHeader";
export { SplitListPanel } from "./SplitListPanel";
export { SplitPanel } from "./SplitPanel";
export { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "./TableList";
export type { TableListWrapProps, TableThAlign } from "./TableList";
export { SplitRightEmpty } from "./SplitRightEmpty";
export type { SplitRightEmptyProps } from "./SplitRightEmpty";
export { SplitRightError } from "./SplitRightError";
export type { SplitRightErrorProps } from "./SplitRightError";
export { SplitRightTabs } from "./SplitRightTabs";
export type { SplitRightTabsProps, SplitRightTabDef } from "./SplitRightTabs";
export { StatusPill } from "./StatusPill";
export type { StatusPillProps } from "./StatusPill";
export { StepperInput } from "./StepperInput";
export { TabBar } from "./TabBar";
export type { TabDef } from "./TabBar";
export { Toolbar } from "./Toolbar";
export { VendorCategoryBadge } from "./VendorCategoryBadge";
export { VendorInfoHeader } from "./VendorInfoHeader";
export type { VendorInfoFull, VendorKpis, VendorInfoHeaderProps } from "./VendorInfoHeader";

// ── Feature-adjacent (common/ 위치 유지 · 도메인 데이터/서버 fetch 있음) ──
export { EmployeeInfoForm } from "./EmployeeInfoForm";
export { EmployeeProfileCard } from "./EmployeeProfileCard";
export { InventoryEditPanel } from "./InventoryEditPanel";
export { PurchaseHistoryList } from "./PurchaseHistoryList";
export type { PurchaseHistoryRow } from "./PurchaseHistoryList";
export { ProductDetailPanel } from "./ProductDetailPanel";
export { StoreZoneMap } from "./StoreZoneMap";

// ── Infra guard (부팅·설치 안내) ──
export { IosInstallGuide } from "./IosInstallGuide";

// ─────────────────────────────────────────────────────────────
// features/ (사용처 적음 · 도메인 특화 · 별도 barrel 로 관리 가능)
//   · common/features/ · import { X } from "../common/features/X"
//   · 필요 시 · features 서브 barrel 도 추후 도입 가능
//
// lib helpers (src/lib/) · 컴포넌트 아님
//   · hangulSearch · settingsTypography · from "../../lib/..."
