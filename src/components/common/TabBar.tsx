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
type TabColor = "sky" | "amber" | "violet" | "teal" | "indigo" | "rose" | "emerald" | "orange" | "slate";

const COLOR_MAP: Record<TabColor, { text: string; bar: string; iconActive: string; hoverText: string; badge: string }> = {
  sky:     { text: "text-sky-700",     bar: "bg-sky-500",     iconActive: "text-sky-600",     hoverText: "hover:text-sky-700",     badge: "bg-sky-100 text-sky-700"     },
  amber:   { text: "text-amber-700",   bar: "bg-amber-500",   iconActive: "text-amber-600",   hoverText: "hover:text-amber-700",   badge: "bg-amber-100 text-amber-700"   },
  violet:  { text: "text-violet-700",  bar: "bg-violet-500",  iconActive: "text-violet-600",  hoverText: "hover:text-violet-700",  badge: "bg-violet-100 text-violet-700"  },
  teal:    { text: "text-teal-700",    bar: "bg-teal-500",    iconActive: "text-teal-600",    hoverText: "hover:text-teal-700",    badge: "bg-teal-100 text-teal-700"    },
  indigo:  { text: "text-indigo-700",  bar: "bg-indigo-500",  iconActive: "text-indigo-600",  hoverText: "hover:text-indigo-700",  badge: "bg-indigo-100 text-indigo-700"  },
  rose:    { text: "text-rose-700",    bar: "bg-rose-500",    iconActive: "text-rose-600",    hoverText: "hover:text-rose-700",    badge: "bg-rose-100 text-rose-700"    },
  emerald: { text: "text-emerald-700", bar: "bg-emerald-500", iconActive: "text-emerald-600", hoverText: "hover:text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  orange:  { text: "text-orange-700",  bar: "bg-orange-500",  iconActive: "text-orange-600",  hoverText: "hover:text-orange-700",  badge: "bg-orange-100 text-orange-700"  },
  slate:   { text: "text-slate-700",   bar: "bg-slate-500",   iconActive: "text-slate-600",   hoverText: "hover:text-slate-700",   badge: "bg-slate-100 text-slate-700"   },
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
  /** 배경 (기본 white · nested 서브탭은 slate-50 등) */
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
    ? `bg-slate-50/50 border-b border-slate-200 w-full shrink-0 ${className}`
    : `${barCls} ${className}`;

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
            const c = COLOR_MAP[t.color ?? "slate"];
            const dnd = sortable?.getTabProps(t.key);

            const dragCls = dnd
              ? [
                  dnd.isBeingDragged ? "opacity-50" : "",
                  dnd.isDropTarget ? "ring-2 ring-indigo-400 ring-inset" : "",
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
                  active ? c.text : `text-slate-500 ${c.hoverText}`,
                  dragCls,
                ].join(" ")}
              >
                {Icon && (
                  <Icon
                    size={iconSize}
                    strokeWidth={active ? 2.4 : 2}
                    weight="fill"
                    className={`shrink-0 transition-colors duration-150 ${active ? c.iconActive : "text-slate-400"}`}
                  />
                )}
                <span>{t.label}</span>
                {t.badge != null && t.badge > 0 && (
                  <span
                    className="ml-0.5 text-[11px] font-semibold text-slate-400 tabular-nums leading-none whitespace-nowrap"
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
