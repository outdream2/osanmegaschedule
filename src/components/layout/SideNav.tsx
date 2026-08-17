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
  SidebarTrigger,
} from "../ui/sidebar";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";
import {
  filterGroupsForSession,
  isItemActive,
  DARK_COLOR_TONES,
  subTabStorageKey,
  type SideNavGroup,
  type SideNavItem,
} from "./sideNavGroups";
import { useSidebarWidth } from "../../hooks/useSidebar";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { usePagePermissions } from "../../hooks/usePagePermissions";
// 2026-08-17 · 사용자 지시 · 사이드바 · logo2 사용 (기본 로고와 별개)
import logoImg from "../../images/logo2.png";

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

  // 2026-08-17 · 사이드바 deep teal 배경 · DARK_COLOR_TONES 사용 (목업 톤)
  const groupTone = DARK_COLOR_TONES[group.color];

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
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
            // 2026-08-17 · deep teal 배경 · 목업 톤 · 활성/비활성 pill
            hasActiveItem
              ? [
                  groupTone.activeBg,      // bg-white/[0.12]
                  groupTone.activeText,    // text-white
                  "font-bold",
                ].join(" ")
              : [
                  // 비활성 · 목업 · #C4DAEE (light mint)
                  "text-[#C4DAEE]",
                  "hover:bg-white/[0.06] hover:text-white",
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
                    // 2026-08-17 · deep teal 배경 · 활성 = 그룹 톤 밝은 shade (300) · 비활성 = light mint
                    hasActiveItem ? groupTone.iconActive : "text-[#C4DAEE]/80",
                    "transition-all duration-200 ease-out",
                  ].join(" ")}
                />
              );
            })()}
            <span className="tracking-wide">{group.label}</span>
          </span>

          {/* CaretDown · 닫힘 = -90도 (좌) · 열림 = 0도 (아래) · 부드러운 화살표 · 2026-08-17 · deep teal 톤 */}
          <span
            className={[
              "flex items-center justify-center",
              "w-7 h-7 rounded-md",
              "transition-colors duration-200 ease-out",
              hasActiveItem ? "bg-transparent" : "hover:bg-white/[0.06]",
            ].join(" ")}
            aria-hidden="true"
          >
            <CaretDown
              size={18}
              weight="bold"
              className={[
                "shrink-0 transition-transform duration-200 ease-out",
                hasActiveItem ? "text-white" : "text-white/60",
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
            // 2026-08-17 · deep teal · DARK_COLOR_TONES
            const tone = DARK_COLOR_TONES[item.color];

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
                    // 2026-08-17 · deep teal · 활성 = white/12 pill · 비활성 = light mint
                    active
                      ? [
                          tone.activeBg,   // bg-white/[0.12]
                          tone.activeText, // text-white
                          "font-bold",
                        ].join(" ")
                      : [
                          // 비활성 · 목업 톤 · #C4DAEE · 하위 살짝 opacity 낮춤
                          "font-semibold text-[#C4DAEE]/85",
                          "hover:bg-white/[0.06] hover:text-white",
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
                      // 2026-08-17 · deep teal · 활성 = 그룹 밝은 shade · 비활성 = mint 톤
                      active
                        ? [tone.iconActive, "scale-105"].join(" ")
                        : "text-[#C4DAEE]/60",
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
  // 2026-08-17 · deep teal · DARK_COLOR_TONES
  const tone = DARK_COLOR_TONES[group.color];
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={active ? "page" : undefined}
      aria-label={group.label}
      className={[
        "flex w-full items-center gap-2",
        // 2026-08-12 · CollapsibleGroup 헤더와 동일 · 사용자 지시 · 글씨 크기 완전 통일
        "px-2.5 py-1.5 mt-1.5 mb-0",
        "rounded-lg",
        "text-[19px] leading-none",
        "transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
        // 2026-08-17 · deep teal · 목업 톤
        active
          ? [
              tone.activeBg,   // bg-white/[0.12]
              tone.activeText, // text-white
              "font-bold",
            ].join(" ")
          : [
              "text-[#C4DAEE]",
              "hover:bg-white/[0.06] hover:text-white",
              "font-semibold",
            ].join(" "),
        "group-data-[collapsible=icon]:justify-center",
      ].join(" ")}
    >
      {/* 2026-08-17 · deep teal · 활성 = 그룹 밝은 shade (300) · 비활성 = mint */}
      <Icon
        size={18}
        weight={active ? "fill" : "duotone"}
        className={[
          "shrink-0",
          active ? tone.iconActive : "text-[#C4DAEE]/80",
          "transition-all duration-200 ease-out",
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
  // 2026-08-16 · 페이지 숨김 반영 · 서버 perms 참조
  const { perms } = usePagePermissions();
  const groups = filterGroupsForSession(authSession, perms).filter(g => !(isMobile && g.hideOnMobile));
  const { width, startResize } = useSidebarWidth();
  const { brand } = useBrandIdentity();

  // 2026-08-17 · 사용자 지시 · 사이드바 deep navy (#0A2E4A) · 최신 블루톤 전환
  //   · CSS var override · --sidebar-* · 모든 shadcn Sidebar 내부 텍스트/배경 자동 대응
  const teal = {
    "--sidebar": "#0A2E4A",                              // deep navy bg
    "--sidebar-foreground": "#DCE8F3",                   // primary text (light blue-white)
    "--sidebar-border": "rgba(255,255,255,0.08)",        // subtle border
    "--sidebar-accent": "rgba(255,255,255,0.12)",        // hover/active bg
    "--sidebar-accent-foreground": "#FFFFFF",            // hover/active text
    "--sidebar-primary": "#5EA9E8",                      // active accent (bright blue)
    "--sidebar-primary-foreground": "#0A2E4A",
    "--sidebar-ring": "rgba(255,255,255,0.35)",
  } as React.CSSProperties;

  return (
    // 2026-08-16 · width 상태 실제 반영 · shadcn Sidebar --sidebar-width CSS 변수 override
    // 2026-08-17 · deep teal 적용 · 목업 톤
    <Sidebar
      collapsible="icon"
      data-sb-v2=""
      className="border-r border-white/8"
      style={!isMobile
        ? { ...teal, "--sidebar-width": `${width}px` } as React.CSSProperties
        : teal}
    >

      {/* ── 로고 영역 · 2026-08-17 · deep teal 톤 · light text · border-white/10 ── */}
      <SidebarHeader className="px-2 py-2 pb-1.5 border-b border-white/10">
        <div className="flex items-center gap-1 w-full">
          <button
            type="button"
            onClick={() => onNavigate("landing")}
            title="홈"
            aria-label="홈으로 이동"
            className={[
              "flex-1 min-w-0 flex items-center gap-2.5",
              "px-2 py-1.5 rounded-lg",
              "hover:bg-white/8 transition-all duration-200 ease-out",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
              "cursor-pointer",
            ].join(" ")}
          >
            {/* 2026-08-17 · 사용자 지시 · logo2 · 라운드 처리 · 사이드바 딥네이비 대비 명확 */}
            <img
              src={brand.logoUrl || logoImg}
              alt={`${brand.region ? brand.region + " " : ""}${brand.shortName} 로고`}
              className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-white/20"
            />
            {/* icon-only 모드에서 숨김 · 2026-08-17 · 흰색 텍스트 (deep teal bg 대비) */}
            <div className="flex flex-col gap-0 leading-none group-data-[collapsible=icon]:hidden min-w-0">
              {brand.region && (
                <span className="text-[15px] font-bold text-white tracking-tight leading-tight truncate">
                  {brand.region}
                </span>
              )}
              <span className="text-[11px] font-semibold text-[#93B4D0] tracking-tight leading-tight truncate mt-0.5">
                {brand.shortName}
              </span>
            </div>
          </button>
          {/* 접기/펼치기 토글 · 사이드바 내부 · 약국이름 우측 */}
          <SidebarTrigger
            className="h-7 w-7 rounded-md text-[#93B4D0] hover:text-white hover:bg-white/8 transition shrink-0 group-data-[collapsible=icon]:hidden"
            aria-label="사이드바 접기"
          />
        </div>
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

      {/* ── 하단: 구분선 + 알림 + 로그아웃 · 2026-08-17 · deep teal 톤 ── */}
      <SidebarSeparator className="bg-white/8" />

      <SidebarFooter className="px-2 py-1.5 gap-0.5">
        {authSession && authSession.employeeName && (
          <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-bold text-white truncate leading-tight">
              [{authSession.employeeName}]
            </span>
          </div>
        )}
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
                  // 2026-08-17 · 사용자 지시 · 사이드바 로그아웃 · 흰색 텍스트
                  "text-white hover:bg-white/[0.06]",
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
        // 2026-08-17 · deep teal · 반투명 흰 hover 로 대비
        className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-white/25 active:bg-white/40 transition z-30 group-data-[collapsible=icon]:hidden"
        title="드래그하여 사이드바 폭 조절"
        aria-label="사이드바 폭 조절"
        aria-hidden="true"
      />
    </Sidebar>
  );
};
