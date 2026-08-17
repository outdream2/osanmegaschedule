// src/components/common/TabBar.tsx
// 2026-08-03 (#183) · 공통 탭바 컴포넌트
//   - 3 레벨 (L1/L2/L3) 지원 · 크기·패딩·언더라인 두께 상이
//   - 색상 프리셋 · Tailwind JIT purge 안전 (정적 클래스 맵)
//   - 선택적 long-press 드래그 재정렬 · useSortableTabs 훅과 결합
//   - 선택적 배지 (숫자 · 우선 rose)
//   - 아이콘 컴포넌트 (Phosphor · Lucide 등) 지원 · 크기 자동
//
// 사용 예 (기본):
//   <TabBar
//     level={2}
//     tabs={[
//       { key: "a", label: "발주", icon: ShoppingCart, color: "sky" },
//       { key: "b", label: "매입", icon: PackageCheck,  color: "amber", badge: 3 },
//     ]}
//     activeKey={topTab}
//     onSelect={setTopTab}
//   />
//
// 사용 예 (드래그 재정렬):
//   const sortable = useSortableTabs("tabOrder.foo", TABS, isAdmin);
//   <TabBar
//     level={2}
//     tabs={sortable.tabs}
//     activeKey={tab}
//     onSelect={setTab}
//     sortable={{ getTabProps: sortable.getTabProps, isDragging: sortable.isDragging }}
//   />

import React, { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useIsMobile } from "../../hooks/use-mobile";
import { BottomSheet } from "./BottomSheet";
import type { TabHandlerProps } from "../../hooks/useSortableTabs";

// ── 색상 프리셋 (Tailwind JIT purge 안전 · 정적 클래스 맵) ──
type TabColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate" | "blue" | "cyan" | "red" | "green" | "yellow" | "pink" | "purple";

// 2026-08-17 · 사용자 지시 · 전체 앱 최신 트렌드 통일 · mono neutral + brand-deep accent
//   · 활성 · text-ink + bar bg-brand-deep · Linear/Vercel 톤
//   · 아이콘 · 소량의 색상 identity 유지 (Phosphor duotone 매력)
//   · 배지 · 통일 · brand-tint bg / brand-deep text (신호 · 우연 색상 지양)
const COLOR_MAP: Record<TabColor, { text: string; bar: string; iconActive: string; hoverText: string; badge: string }> = {
  sky:     { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-sky-600",     hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  amber:   { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-amber-600",   hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  violet:  { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-violet-600",  hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  teal:    { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-teal-600",    hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  indigo:  { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-brand-deep",  hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  rose:    { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-rose-600",    hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  emerald: { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-emerald-600", hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  orange:  { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-orange-600",  hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  slate:   { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-ink-soft",    hoverText: "hover:text-brand-deep", badge: "bg-zinc-100 text-ink" },
  blue:    { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-blue-600",    hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  cyan:    { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-cyan-600",    hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  red:     { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-red-600",     hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  green:   { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-green-600",   hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  yellow:  { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-yellow-600",  hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  pink:    { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-pink-600",    hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
  purple:  { text: "text-ink", bar: "bg-brand-deep", iconActive: "text-purple-600",  hoverText: "hover:text-brand-deep", badge: "bg-brand-tint text-brand-deep" },
};

// Phosphor / Lucide 두 라이브러리 모두 지원 · 원본 타입에 얽매이지 않음
// props 는 size · className · strokeWidth · weight 를 옵셔널로 받는 함수형 컴포넌트
type IconLike = React.ComponentType<{
  size?: number;
  className?: string;
  strokeWidth?: number;
  weight?: "regular" | "bold" | "fill" | "duotone" | "light" | "thin";
}>;

export interface TabDef<K extends string = string> {
  key: K;
  label: string;
  icon?: IconLike;
  color?: TabColor;
  /** 우측 카운트 배지 (0 이면 숨김 · > 0 이면 rose) */
  badge?: number;
  /** 특정 탭만 숨김 처리 (필터링 · undefined 는 표시) */
  visible?: boolean;
}

export interface TabBarProps<K extends string = string> {
  /** 계층 · 1|2|3 · 스타일 크기 결정 */
  level: 1 | 2 | 3;
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  /** long-press 드래그 재정렬 (선택) */
  sortable?: {
    getTabProps: (keyOrTab: K | TabDef<K>) => TabHandlerProps;
    isDragging: boolean;
  };
  /** 배지 색상 (기본 rose · pending 등에서 rose · info 는 sky 등) */
  badgeColor?: "rose" | "sky" | "amber" | "emerald";
  /** 커스텀 컨테이너 max-width · 기본 1360 */
  maxWidth?: number | string;
  /** 배경 (기본 white · nested 서브탭은 zinc-50 등) */
  variant?: "default" | "nested";
  className?: string;
}

/**
 * 공통 탭바
 *   - 스타일: level (1|2|3) · 색상 프리셋 · 배지 · 드래그
 *   - 기능 유지: onClick · draggable · isBeingDragged · isDropTarget · isArmed 시각 피드백
 */
export function TabBar<K extends string = string>({
  level,
  tabs,
  activeKey,
  onSelect,
  sortable,
  badgeColor = "rose",
  maxWidth = 1360,
  variant = "default",
  className = "",
}: TabBarProps<K>) {
  // 2026-08-17 · 3 계층 · 디자인 다르게 · Linear/Vercel/Attio 2026 SaaS 표준
  //   · L1 · underline + gradient bar (large · primary tabs) · 기존 유지
  //   · L2 · Attio "carved" segmented pill container (medium · section tabs)
  //   · L3 · minimal text + dot marker (small · deep tabs · Linear docs 톤)
  const barCls = level === 3 ? "tab-bar-l3" : level === 1 ? "tab-bar-l1" : "tab-bar-l2";
  const btnCls = level === 3 ? "tab-l3" : level === 1 ? "tab-l1" : "tab-l2";
  const underlineCls = level === 3 ? "tab-active-underline-l3" : level === 1 ? "tab-active-underline-l1" : "tab-active-underline-l2";

  const iconSize = level === 3 ? 15 : 19;

  const badgeBg =
    badgeColor === "sky" ? "bg-sky-500" :
    badgeColor === "amber" ? "bg-amber-500" :
    badgeColor === "emerald" ? "bg-emerald-500" :
    "bg-rose-500";

  const visibleTabs = tabs.filter(t => t.visible !== false);

  const outerCls = variant === "nested"
    ? `bg-zinc-50/50 border-b border-line w-full shrink-0 ${className}`
    : `${barCls} ${className}`;

  // L2 · Attio "carved" segmented container (rounded-2xl pill wrap · 세련 · 부드러운 그림자)
  if (level === 2 && variant !== "nested") {
    return (
      <div className={`bg-gradient-to-b from-white to-zinc-50/30 border-b border-line w-full shrink-0 ${className}`}>
        <div
          className="tab-bar-inner py-2.5"
          style={typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth }}
        >
          <div className={`inline-flex items-center bg-zinc-100/80 backdrop-blur-sm border border-line rounded-2xl p-1 gap-0.5 flex-wrap shadow-[inset_0_1px_2px_rgba(10,46,74,0.04)] ${sortable?.isDragging ? "select-none" : ""}`}>
            {visibleTabs.map(t => {
              const active = activeKey === t.key;
              const Icon = t.icon;
              const c = COLOR_MAP[t.color ?? "slate"] ?? COLOR_MAP.slate;
              const dnd = sortable?.getTabProps(t.key);

              const dragCls = dnd
                ? [
                    dnd.isBeingDragged ? "opacity-50" : "",
                    dnd.isDropTarget ? "ring-2 ring-brand-deep ring-inset" : "",
                    dnd.isArmed && !dnd.isBeingDragged ? "tab-shake cursor-grab" : "",
                    dnd.isBeingDragged ? "cursor-grabbing" : "",
                  ].filter(Boolean).join(" ")
                : "";

              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onSelect(t.key)}
                  title={t.label}
                  draggable={dnd?.draggable}
                  onDragStart={dnd?.onDragStart}
                  onDragOver={dnd?.onDragOver}
                  onDragEnter={dnd?.onDragEnter}
                  onDragLeave={dnd?.onDragLeave}
                  onDrop={dnd?.onDrop}
                  onDragEnd={dnd?.onDragEnd}
                  onMouseDown={dnd?.onMouseDown}
                  onMouseUp={dnd?.onMouseUp}
                  onMouseLeave={dnd?.onMouseLeave}
                  onTouchStart={dnd?.onTouchStart}
                  onTouchEnd={dnd?.onTouchEnd}
                  onTouchCancel={dnd?.onTouchCancel}
                  className={[
                    "inline-flex items-center gap-1.5 sm:gap-2 h-11 px-3.5 sm:px-4.5 rounded-xl text-[15px] sm:text-[16px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer tracking-tight",
                    active
                      ? "bg-white text-ink font-bold shadow-[0_2px_8px_rgba(10,46,74,0.08),0_1px_2px_rgba(10,46,74,0.04)] ring-1 ring-line/80"
                      : "text-ink-soft hover:text-ink hover:bg-white/80",
                    dragCls,
                  ].join(" ")}
                >
                  {Icon && (
                    <Icon
                      size={17}
                      strokeWidth={active ? 2.4 : 2}
                      weight={active ? "fill" : "duotone"}
                      className={`shrink-0 transition-colors duration-200 ${active ? c.iconActive : "text-zinc-400"}`}
                    />
                  )}
                  <span>{t.label}</span>
                  {t.badge != null && t.badge > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-bold leading-none tabular-nums transition-colors ${active ? `${badgeBg} text-white shadow-sm` : "bg-zinc-200/80 text-zinc-600"}`}
                      title={`${t.label} · ${t.badge}건`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // L3 · 반응형 · 모바일 = BottomSheet trigger (2026 iOS/Material 표준) · 태블릿+ = filter chip row
  //   · L3TabBar 컴포넌트에서 처리 (아래 정의)
  if (level === 3) {
    return <L3TabBar<K>
      tabs={visibleTabs}
      activeKey={activeKey}
      onSelect={onSelect}
      badgeBg={badgeBg}
      maxWidth={maxWidth}
      className={className}
      sortable={sortable}
    />;
  }

  // L1 · underline + gradient bar (default · large primary)
  return (
    <div className={outerCls}>
      <div
        className="tab-bar-inner"
        style={typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth }}
      >
        <div className={`tab-bar-row ${sortable?.isDragging ? "select-none" : ""}`}>
          {visibleTabs.map(t => {
            const active = activeKey === t.key;
            const Icon = t.icon;
            const c = COLOR_MAP[t.color ?? "slate"] ?? COLOR_MAP.slate;
            const dnd = sortable?.getTabProps(t.key);

            const dragCls = dnd
              ? [
                  dnd.isBeingDragged ? "opacity-50" : "",
                  dnd.isDropTarget ? "ring-2 ring-brand-deep ring-inset" : "",
                  dnd.isArmed && !dnd.isBeingDragged ? "tab-shake cursor-grab" : "",
                  dnd.isBeingDragged ? "cursor-grabbing" : "",
                ].filter(Boolean).join(" ")
              : "";

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelect(t.key)}
                title={t.label}
                draggable={dnd?.draggable}
                onDragStart={dnd?.onDragStart}
                onDragOver={dnd?.onDragOver}
                onDragEnter={dnd?.onDragEnter}
                onDragLeave={dnd?.onDragLeave}
                onDrop={dnd?.onDrop}
                onDragEnd={dnd?.onDragEnd}
                onMouseDown={dnd?.onMouseDown}
                onMouseUp={dnd?.onMouseUp}
                onMouseLeave={dnd?.onMouseLeave}
                onTouchStart={dnd?.onTouchStart}
                onTouchEnd={dnd?.onTouchEnd}
                onTouchCancel={dnd?.onTouchCancel}
                className={[
                  btnCls,
                  active ? c.text : `text-zinc-500 ${c.hoverText}`,
                  dragCls,
                ].join(" ")}
              >
                {Icon && (
                  <Icon
                    size={iconSize}
                    strokeWidth={active ? 2.4 : 2}
                    weight="fill"
                    className={`shrink-0 transition-colors duration-150 ${active ? c.iconActive : "text-zinc-400"}`}
                  />
                )}
                <span>{t.label}</span>
                {t.badge != null && t.badge > 0 && (
                  <span
                    className={`ml-0.5 text-[11px] font-bold tabular-nums leading-none whitespace-nowrap ${c.text}`}
                    title={`${t.label} · ${t.badge}건`}
                  >
                    {t.badge}
                  </span>
                )}
                {active && (
                  <span className={`${underlineCls} ${c.bar}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TabBar;

// ────────────────────────────────────────────────────────────────
// L3TabBar · 반응형 · 모바일 = BottomSheet trigger · 태블릿+ = filter chip row
// 2026 · iOS/Material Bottom Sheet 표준 · Baymard/NN-Group 검증
// ────────────────────────────────────────────────────────────────

interface L3TabBarProps<K extends string> {
  tabs: TabDef<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  badgeBg: string;
  maxWidth: number | string;
  className: string;
  sortable?: TabBarProps<K>["sortable"];
}

function L3TabBar<K extends string>({
  tabs, activeKey, onSelect, badgeBg, maxWidth, className, sortable,
}: L3TabBarProps<K>) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const active = tabs.find(t => t.key === activeKey);

  // 모바일 · Bottom Sheet trigger
  if (isMobile) {
    return (
      <>
        <div className={`bg-white border-b border-line w-full shrink-0 ${className}`}>
          <div
            className="tab-bar-inner py-2.5"
            style={typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth }}
          >
            {/* Trigger · 현재 선택 · 클릭 → BottomSheet */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-brand-deep text-white font-bold text-[15px] shadow-[0_1px_2px_rgba(10,46,74,0.15)] cursor-pointer active:scale-[0.98] transition-transform tracking-tight"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
            >
              {active?.icon && (() => {
                const AIcon = active.icon;
                return <AIcon size={15} weight="fill" className="shrink-0 text-white" strokeWidth={2.4} />;
              })()}
              <span>{active?.label ?? "선택"}</span>
              {active?.badge != null && active.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none tabular-nums bg-white/25 text-white">
                  {active.badge}
                </span>
              )}
              <ChevronDown size={16} className="text-white/80 shrink-0" strokeWidth={2.4} />
            </button>
            <span className="ml-2 text-[13px] text-ink-soft font-medium">서브탭 · 탭하여 선택</span>
          </div>
        </div>

        {/* Bottom Sheet · 전체 옵션 리스트 */}
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={`서브탭 · ${tabs.length}개`}
          maxHeight="70vh"
        >
          <div className="flex flex-col divide-y divide-zinc-100 pb-4">
            {tabs.map(t => {
              const isActive = t.key === activeKey;
              const Icon = t.icon;
              const c = COLOR_MAP[t.color ?? "slate"] ?? COLOR_MAP.slate;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { onSelect(t.key); setSheetOpen(false); }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors cursor-pointer ${
                    isActive ? "bg-brand-tint/60" : "hover:bg-zinc-50 active:bg-zinc-100"
                  }`}
                >
                  {/* dot marker · category identity */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.iconActive.replace("text-", "bg-")}`} />
                  {Icon && (
                    <Icon
                      size={18}
                      weight={isActive ? "fill" : "duotone"}
                      className={`shrink-0 ${isActive ? c.iconActive : "text-ink-soft"}`}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  )}
                  <span className={`flex-1 text-[15px] tracking-tight ${isActive ? "text-brand-deep font-bold" : "text-ink font-semibold"}`}>
                    {t.label}
                  </span>
                  {t.badge != null && t.badge > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded-full text-[11px] font-bold leading-none tabular-nums ${
                        isActive ? `${badgeBg} text-white` : "bg-zinc-100 text-ink-soft"
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                  {isActive && <Check size={16} className="text-brand-deep shrink-0" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </BottomSheet>
      </>
    );
  }

  // 태블릿+ · Filter Chip Row (기존)
  return (
    <div className={`bg-white border-b border-line w-full shrink-0 ${className}`}>
      <div
        className="tab-bar-inner py-2.5"
        style={typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth }}
      >
        <div className={`inline-flex items-center gap-1.5 flex-wrap ${sortable?.isDragging ? "select-none" : ""}`}>
          {tabs.map(t => {
            const isActive = t.key === activeKey;
            const Icon = t.icon;
            const c = COLOR_MAP[t.color ?? "slate"] ?? COLOR_MAP.slate;
            const dnd = sortable?.getTabProps(t.key);

            const dragCls = dnd
              ? [
                  dnd.isBeingDragged ? "opacity-50" : "",
                  dnd.isDropTarget ? "ring-2 ring-brand-deep ring-inset" : "",
                  dnd.isArmed && !dnd.isBeingDragged ? "tab-shake cursor-grab" : "",
                  dnd.isBeingDragged ? "cursor-grabbing" : "",
                ].filter(Boolean).join(" ")
              : "";

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onSelect(t.key)}
                title={t.label}
                draggable={dnd?.draggable}
                onDragStart={dnd?.onDragStart}
                onDragOver={dnd?.onDragOver}
                onDragEnter={dnd?.onDragEnter}
                onDragLeave={dnd?.onDragLeave}
                onDrop={dnd?.onDrop}
                onDragEnd={dnd?.onDragEnd}
                onMouseDown={dnd?.onMouseDown}
                onMouseUp={dnd?.onMouseUp}
                onMouseLeave={dnd?.onMouseLeave}
                onTouchStart={dnd?.onTouchStart}
                onTouchEnd={dnd?.onTouchEnd}
                onTouchCancel={dnd?.onTouchCancel}
                className={[
                  "group inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[15px] font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer tracking-tight border",
                  isActive
                    ? "bg-brand-deep text-white border-brand-deep shadow-[0_1px_2px_rgba(10,46,74,0.15)]"
                    : "bg-zinc-50 text-ink-soft border-line hover:bg-white hover:text-ink hover:border-brand-deep/30",
                  dragCls,
                ].join(" ")}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${isActive ? "bg-white/80" : c.iconActive.replace("text-", "bg-")}`}
                />
                {Icon && (
                  <Icon
                    size={14}
                    strokeWidth={isActive ? 2.4 : 2}
                    weight={isActive ? "fill" : "duotone"}
                    className={`shrink-0 transition-colors duration-200 ${isActive ? "text-white" : c.iconActive}`}
                  />
                )}
                <span>{t.label}</span>
                {t.badge != null && t.badge > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none tabular-nums transition-colors ${isActive ? "bg-white/25 text-white" : `${badgeBg} text-white`}`}
                    title={`${t.label} · ${t.badge}건`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
