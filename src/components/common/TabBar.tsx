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

import React from "react";
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
  /** 커스텀 컨테이너 max-width · 미지정 시 전체폭 (페이지 콘텐츠와 정렬) · 2026-09-15
   *   · 이전 · 1360 기본 · 초광폭 모니터에서 탭이 오른쪽으로 밀리는 이슈
   *   · 이후 · 미지정 = 전체폭 · 필요 시 숫자·문자열 명시 전달 (하위호환) */
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
  maxWidth,
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

  // 2026-10-08 · Batch 4 CLOSEOUT · L2 default = FLAT LINE TABS (presentation-only · FROZEN)
  //   · reference image lock · "얇고 정돈된 상단 업무 navigation"
  //   · transparent bg · no pill · no icon · no card wrapper
  //   · tab row baseline 1px slate-200 · active tab 아래 2px deep ink underline
  //   · tab gap 20~32px · flex-nowrap · mobile 가로 스크롤
  //   · active=text-ink font-semibold · inactive=text-ink-soft/80 font-medium
  //   · 아이콘 prop 무시 (PAGE TAB = TEXT FIRST)
  if (level === 2 && variant !== "nested") {
    return (
      <div className={`bg-transparent border-b border-slate-200 w-full shrink-0 ${className}`}>
        <div
          className="tab-bar-inner"
          style={maxWidth == null ? undefined : (typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth })}
        >
          <div
            role="tablist"
            className={`flex items-stretch flex-nowrap gap-5 sm:gap-7 md:gap-8 overflow-x-auto scrollbar-hide ${sortable?.isDragging ? "select-none" : ""}`}
          >
            {visibleTabs.map(t => {
              const active = activeKey === t.key;
              const dnd = sortable?.getTabProps(t.key);

              const dragCls = dnd
                ? [
                    dnd.isBeingDragged ? "opacity-50" : "",
                    dnd.isDropTarget ? "ring-2 ring-ink ring-inset" : "",
                    dnd.isArmed && !dnd.isBeingDragged ? "tab-shake cursor-grab" : "",
                    dnd.isBeingDragged ? "cursor-grabbing" : "",
                  ].filter(Boolean).join(" ")
                : "";

              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
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
                    "relative inline-flex items-center justify-center shrink-0",
                    "h-11 px-1",
                    "text-[13px] sm:text-[14px] whitespace-nowrap tracking-tight",
                    "bg-transparent border-0 rounded-none shadow-none",
                    "transition-colors duration-150 cursor-pointer outline-none",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-tint",
                    active
                      ? "text-ink font-semibold"
                      : "text-ink-soft/80 font-medium hover:text-ink",
                    dragCls,
                  ].join(" ")}
                >
                  <span>{t.label}</span>
                  {t.badge != null && t.badge > 0 && (
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold leading-none tabular-nums transition-colors ${active ? `${badgeBg} text-white` : "bg-zinc-100 text-ink-soft"}`}
                      title={`${t.label} · ${t.badge}건`}
                    >
                      {t.badge}
                    </span>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 2026-10-07 · Batch 4 · L3 = COMPACT FILTER CHIP (presentation-only)
  //   · spec · small chip · h 32-36 · text 12-13 · radius 8-10 · neutral surface
  //   · 기존 Pine Green deep pill (#01796F) 폐지 · subtle brand-tint active surface
  //   · dot marker 제거 · colored rainbow 제거 (slate base)
  //   · icon · 유지 가능 · size 13 · 활성=brand-deep · 비활성=muted
  if (level === 3) {
    return (
      <div className={`bg-white border-b border-line w-full shrink-0 ${className}`}>
        <div
          className="tab-bar-inner py-1.5"
          style={maxWidth == null ? undefined : (typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth })}
        >
          <div role="tablist" className={`inline-flex items-center gap-1 flex-wrap ${sortable?.isDragging ? "select-none" : ""}`}>
            {visibleTabs.map(t => {
              const active = activeKey === t.key;
              const Icon = t.icon;
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
                  role="tab"
                  aria-selected={active}
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
                    "inline-flex items-center gap-1 h-8 px-3 rounded-lg",
                    "text-[13px] font-medium whitespace-nowrap tracking-tight",
                    "transition-colors duration-150 cursor-pointer outline-none",
                    "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-tint",
                    "border",
                    active
                      ? "bg-brand-tint/60 text-brand-deep border-brand-deep/15 font-semibold"
                      : "bg-transparent text-ink-soft border-transparent hover:bg-zinc-50 hover:text-ink",
                    dragCls,
                  ].join(" ")}
                >
                  {Icon && (
                    <Icon
                      size={13}
                      strokeWidth={active ? 2.2 : 1.8}
                      weight={active ? "fill" : "regular"}
                      className={`shrink-0 transition-colors duration-150 ${active ? "text-brand-deep" : "text-ink-soft/70"}`}
                    />
                  )}
                  <span>{t.label}</span>
                  {t.badge != null && t.badge > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[11px] font-bold leading-none tabular-nums transition-colors ${active ? "bg-brand-deep text-white" : "bg-zinc-200 text-zinc-700"}`}
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

  // L1 · underline + gradient bar (default · large primary)
  return (
    <div className={outerCls}>
      <div
        className="tab-bar-inner"
        style={maxWidth == null ? undefined : (typeof maxWidth === "number" ? { maxWidth: `${maxWidth}px` } : { maxWidth })}
      >
        <div role="tablist" className={`tab-bar-row ${sortable?.isDragging ? "select-none" : ""}`}>
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
                role="tab"
                aria-selected={active}
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
                    className={`ml-0.5 text-[13px] font-bold tabular-nums leading-none whitespace-nowrap ${c.text}`}
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
