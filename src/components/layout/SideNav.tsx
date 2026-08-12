// src/components/layout/SideNav.tsx
// 2026-08-11 · 사이드바 V2 · shadcn Sidebar + Radix Collapsible · 6그룹 접이식 트리
// 2026-08-12 · V3 · Warm Cream + Soft Pill + Micro Glow · 시인성 강화 · chevron pill 강조
// 디자인 참고: Notion · Anthropic · Attio · 2026 SaaS Warm Trend
import React, { useState, useCallback } from "react";
import { Collapsible } from "radix-ui";
import { LogOut } from "lucide-react";
// 2026-08-12 · 접힘 아이콘 · CaretDown (Radix/shadcn 표준 · 부드러운 화살표)
import { CaretDown } from "@phosphor-icons/react";
import { useIsMobile } from "../../hooks/use-mobile";
import { NotificationBell } from "../NotificationBell";
import { NotificationToggle } from "../NotificationToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";
import {
  filterGroupsForSession,
  isItemActive,
  COLOR_TONES,
  subTabStorageKey,
  type SideNavGroup,
  type SideNavItem,
} from "./sideNavGroups";
import { useSidebarWidth } from "../../hooks/useSidebar";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import logoImg from "../../images/logo.png";

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface SideNavProps {
  authSession: AuthSession | null;
  activePage: AppNavPage;
  onNavigate: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── localStorage 헬퍼 ──────────────────────────────────────────────────────
function readGroupOpen(groupId: string): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(`sidebar.groups.${groupId}`);
  if (raw === "false") return false;
  return true; // 기본값: 열림
}

function writeGroupOpen(groupId: string, open: boolean): void {
  localStorage.setItem(`sidebar.groups.${groupId}`, String(open));
}

// ─── CollapsibleGroup: 개별 그룹 접이식 트리 ────────────────────────────────
interface CollapsibleGroupProps {
  group: SideNavGroup;
  activePage: AppNavPage;
  onNavigate: (page: AppNavPage) => void;
}

const CollapsibleGroup: React.FC<CollapsibleGroupProps> = ({
  group,
  activePage,
  onNavigate,
}) => {
  const [open, setOpen] = useState<boolean>(() => readGroupOpen(group.id));

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      writeGroupOpen(group.id, next);
    },
    [group.id],
  );

  // 그룹 내 활성 항목 여부 (접힌 상태에서 헤더 accent 표시용)
  const hasActiveItem = group.items.some((item) =>
    isItemActive(item, activePage),
  );

  // 상위 그룹 헤더 톤 (공통헤더 AppNavHeader Tab 톤 매핑)
  const groupTone = COLOR_TONES[group.color];

  // 서브탭 클릭 시 · localStorage 저장 + custom event dispatch → 각 페이지가 리스닝하여 setSubTab
  //   · subTab 형식 "sub:nested" (예: "document-writer:contract") 는 3레벨 지원
  const handleNavItem = (item: SideNavItem) => {
    if (item.subTab) {
      const [outer, inner] = item.subTab.split(":");
      try {
        localStorage.setItem(subTabStorageKey(item.key), outer);
        if (inner) localStorage.setItem(`sidebar.subtab.${outer}`, inner);
      } catch { /* quota */ }
      window.dispatchEvent(new CustomEvent("sidebar:subtab", { detail: { page: item.key, subTab: outer, nested: inner ?? null } }));
    }
    onNavigate(item.key);
  };

  return (
    <Collapsible.Root open={open} onOpenChange={handleOpenChange}>

      {/* ── 그룹 헤더 · Collapsible trigger · 공통헤더 TAB 톤 ── */}
      <Collapsible.Trigger asChild>
        <button
          type="button"
          aria-label={`${group.label} 그룹 ${open ? "접기" : "펼치기"}`}
          className={[
            "flex w-full items-center justify-between",
            "px-2.5 py-1.5 mt-1.5 mb-0",
            "rounded-lg",
            "text-[19px] leading-none", // 2026-08-12 · 사용자 지시 · 사이드바 폰트 +2
            // 200ms ease-out · 모든 인터랙션 통일
            "transition-all duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
            // 활성/비활성 · warm pill
            hasActiveItem
              ? [
                  groupTone.activeBg,
                  groupTone.activeText,
                  "font-bold",
                  "shadow-sm",
                  groupTone.glowShadow,
                ].join(" ")
              : [
                  // 비활성 · text-slate-700 (시인성 강화)
                  "text-slate-700",
                  "hover:bg-white/70 hover:text-slate-900",
                  "font-semibold",
                ].join(" "),
            "group-data-[collapsible=icon]:hidden",
          ].join(" ")}
        >
          <span className="flex items-center gap-2">
            {/* 2026-08-12 · 사용자 지시 · 그룹 헤더 왼쪽 · 공통헤더 탭과 동일 아이콘 */}
            {group.icon && (() => {
              const GroupIcon = group.icon;
              return (
                <GroupIcon
                  size={18}
                  weight={hasActiveItem ? "fill" : "duotone"}
                  className={[
                    "shrink-0",
                    hasActiveItem ? groupTone.iconActive : "text-slate-500",
                    "transition-colors duration-200 ease-out",
                  ].join(" ")}
                />
              );
            })()}
            <span className="tracking-wide">{group.label}</span>
          </span>

          {/* 2026-08-12 · CaretDown · 닫힘 = -90도 (좌) · 열림 = 0도 (아래) · 부드러운 화살표 */}
          <span
            className={[
              "flex items-center justify-center",
              "w-7 h-7 rounded-md",
              "transition-colors duration-200 ease-out",
              hasActiveItem ? "bg-transparent" : "hover:bg-slate-100",
            ].join(" ")}
            aria-hidden="true"
          >
            <CaretDown
              size={18}
              weight="bold"
              className={[
                "shrink-0 transition-transform duration-200 ease-out",
                hasActiveItem ? groupTone.activeText : "text-slate-600",
                open ? "rotate-0" : "-rotate-90",
              ].join(" ")}
            />
          </span>
        </button>
      </Collapsible.Trigger>

      {/* ── 하위 항목 · Collapsible content ── */}
      <Collapsible.Content
        className={[
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down",
          "data-[state=closed]:animate-collapsible-up",
          // icon-only 모드: Content 가 항상 보여야 아이콘이 노출됨
          "group-data-[collapsible=icon]:!block group-data-[collapsible=icon]:!overflow-visible",
        ].join(" ")}
      >
        <SidebarMenu className="gap-0 px-1 pt-0.5 pb-1">
          {group.items.map((item, itemIdx) => {
            // 2026-08-12 · 사용자 지시 · 하위 메뉴 아이콘 = 그룹 아이콘 (공통헤더 탭 아이콘) 통일
            const Icon = group.icon || item.icon;
            const active = isItemActive(item, activePage);
            const tone = COLOR_TONES[item.color];

            return (
              <SidebarMenuItem key={`${item.key}-${item.subTab ?? "_"}-${itemIdx}`} className="relative">
                {/* 좌측 accent bar 완전 제거 (pill only + glow 방식으로 전환) */}

                <SidebarMenuButton
                  onClick={() => handleNavItem(item)}
                  isActive={active}
                  tooltip={item.label}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={[
                    // indent · 텍스트 모드: pl-4 · icon-only: pl-2
                    "group-data-[collapsible=icon]:pl-2 pl-4",
                    // 높이 · 항목 간격
                    "h-7 rounded-lg",
                    // 하위 항목 텍스트 크기 · 2026-08-12 · 사용자 지시 +2
                    "text-[18px]",
                    // 활성 스타일 · pill + glow
                    active
                      ? [
                          tone.activeBg,
                          tone.activeText,
                          "font-bold",
                          "shadow-sm",
                          tone.glowShadow,
                        ].join(" ")
                      : [
                          // 비활성 · text-slate-700 (시인성 강화)
                          "font-semibold text-slate-700",
                          "hover:bg-white/70 hover:text-slate-900",
                          // subtle slide on hover
                          "hover:translate-x-px",
                        ].join(" "),
                    "transition-all duration-200 ease-out",
                  ].join(" ")}
                >
                  {/* 2026-08-12 · 사용자 지시 · 하위 메뉴 아이콘 = 그룹 아이콘 (공통헤더 탭과 통일) */}
                  <Icon
                    size={14}
                    weight={active ? "fill" : "duotone"}
                    className={[
                      "shrink-0",
                      active
                        ? [tone.iconActive, "scale-105"].join(" ")
                        : "text-slate-500",
                      "transition-transform duration-200 ease-out",
                    ].join(" ")}
                  />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

// ─── SingleItemGroup · 하위 메뉴 없는 단일 그룹 · 그룹 헤더 = 페이지 링크 (chevron X) ──
interface SingleItemGroupProps {
  group: SideNavGroup;
  activePage: AppNavPage;
  onNavigate: (page: AppNavPage) => void;
}
const SingleItemGroup: React.FC<SingleItemGroupProps> = ({ group, activePage, onNavigate }) => {
  const item = group.items[0];
  const active = isItemActive(item, activePage);
  const tone = COLOR_TONES[group.color];
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={active ? "page" : undefined}
      aria-label={group.label}
      className={[
        "flex w-full items-center gap-1.5",
        // CollapsibleGroup 헤더와 동일한 여백·크기로 통일
        "px-2.5 py-1.5 mt-1.5 mb-0",
        "rounded-lg",
        "text-[17px] leading-none",
        "transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
        active
          ? [
              tone.activeBg,
              tone.activeText,
              "font-bold",
              "shadow-sm",
              tone.glowShadow,
            ].join(" ")
          : [
              "text-slate-700",
              "hover:bg-white/70 hover:text-slate-900",
              "font-semibold",
            ].join(" "),
        "group-data-[collapsible=icon]:justify-center",
      ].join(" ")}
    >
      {/* accent dot · w-2.5 h-2.5 · 활성 시 shadow-sm */}
      <span
        className={[
          "w-2.5 h-2.5 rounded-full shrink-0 group-data-[collapsible=icon]:hidden",
          active
            ? tone.activeBar + " shadow-sm"
            : tone.activeBar + " opacity-40",
        ].join(" ")}
        aria-hidden="true"
      />
      <Icon
        size={15}
        weight={active ? "fill" : "duotone"}
        className={[
          "shrink-0",
          active ? [tone.iconActive, "scale-105"].join(" ") : "text-slate-500",
          "transition-transform duration-200 ease-out",
        ].join(" ")}
      />
      <span className="group-data-[collapsible=icon]:hidden tracking-wide">{group.label}</span>
    </button>
  );
};

// ─── SideNav (메인) ──────────────────────────────────────────────────────────
export const SideNav: React.FC<SideNavProps> = ({
  authSession,
  activePage,
  onNavigate,
  onLogout,
}) => {
  const isMobile = useIsMobile();
  // 2026-08-12 · hideOnMobile 그룹은 반응형(모바일)에서 숨김 (거래처 그룹 등 · PC 관리자 전용)
  const groups = filterGroupsForSession(authSession).filter(g => !(isMobile && g.hideOnMobile));
  const { startResize } = useSidebarWidth();
  const { brand } = useBrandIdentity();

  return (
    // warm hairline border · border-r border-slate-200/60
    <Sidebar collapsible="icon" data-sb-v2="" className="border-r border-slate-200/60">

      {/* ── 로고 영역 ── */}
      <SidebarHeader className="px-2 py-2 pb-1.5 border-b border-slate-200/60">
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          title="홈"
          aria-label="홈으로 이동"
          className={[
            "w-full flex items-center gap-2.5",
            "px-2 py-1.5 rounded-lg",
            // warm hover
            "hover:bg-white/70 transition-all duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
            "cursor-pointer",
          ].join(" ")}
        >
          <img
            src={brand.logoUrl || logoImg}
            alt={`${brand.shortName} 로고`}
            className="w-6 h-6 object-contain shrink-0"
          />
          {/* icon-only 모드에서 숨김 */}
          <div className="flex flex-col gap-px leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-black text-slate-800 tracking-tight leading-tight">
              {brand.shortName}
            </span>
          </div>
        </button>
      </SidebarHeader>

      {/* ── 그룹 트리 ── */}
      <SidebarContent className="px-1 pt-1">
        {groups.map((group) => (
          group.items.length === 1 ? (
            <SingleItemGroup
              key={group.id}
              group={group}
              activePage={activePage}
              onNavigate={onNavigate}
            />
          ) : (
            <CollapsibleGroup
              key={group.id}
              group={group}
              activePage={activePage}
              onNavigate={onNavigate}
            />
          )
        ))}
      </SidebarContent>

      {/* ── 하단: 구분선 + 알림 + 로그아웃 ── */}
      <SidebarSeparator className="bg-slate-200/60" />

      <SidebarFooter className="px-2 py-1.5 gap-0.5">
        {authSession && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg group-data-[collapsible=icon]:justify-center">
            <NotificationToggle authSession={authSession} />
            <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} />
          </div>
        )}
        {authSession && onLogout && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onLogout}
                tooltip="로그아웃"
                aria-label="로그아웃"
                className={[
                  "h-7 rounded-md pl-2",
                  "text-[16px] font-semibold",
                  "text-rose-500 hover:bg-rose-50 hover:text-rose-600",
                  "transition-all duration-200 ease-out",
                ].join(" ")}
              >
                <LogOut size={13} strokeWidth={2} className="shrink-0" />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      {/* PC 드래그 리사이즈 handle · warm 톤 */}
      <div
        onMouseDown={startResize}
        className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-slate-300/50 active:bg-slate-400/60 transition z-30 group-data-[collapsible=icon]:hidden"
        title="드래그하여 사이드바 폭 조절"
        aria-label="사이드바 폭 조절"
        aria-hidden="true"
      />
    </Sidebar>
  );
};
