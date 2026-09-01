// src/components/layout/SideNav.tsx
// 2026-08-11 · 사이드바 V2 · shadcn Sidebar + Radix Collapsible · 6그룹 접이식 트리
// 2026-08-12 · V3 · Warm Cream + Soft Pill + Micro Glow · 시인성 강화 · chevron pill 강조
// 디자인 참고: Notion · Anthropic · Attio · 2026 SaaS Warm Trend
import React, { useState, useCallback, useEffect } from "react";
import { Collapsible } from "radix-ui";
import { LogOut } from "lucide-react";
// 2026-08-12 · 접힘 아이콘 · CaretDown (Radix/shadcn 표준 · 부드러운 화살표)
import { CaretDown } from "@phosphor-icons/react";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-23 · #188 · usePageVisibility · 사이드바 items · 뷰포트별 필터
import { usePageVisibility } from "../../hooks/usePageVisibility";
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
  DARK_COLOR_TONES,
  NAV_ACCENT,
  subTabStorageKey,
  type SideNavGroup,
  type SideNavItem,
} from "./sideNavGroups";
import { useSidebarWidth } from "../../hooks/useSidebar";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { usePagePermissions } from "../../hooks/usePagePermissions";
// 2026-08-20 · #175 · 본인 재직 상태 · 사직서 작성 서브탭 gate
import { useEmploymentStatus } from "../../hooks/useEmploymentStatus";
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

// 2026-08-31 · useActiveSubTab · 공용 위치 이관 (src/hooks/useActiveSubTab.ts)
//   · AppNavHeader Breadcrumb 등 다른 소비자와 공유
import { useActiveSubTab } from "../../hooks/useActiveSubTab";

// ─── CollapsibleGroup: 개별 그룹 접이식 트리 ────────────────────────────────
interface CollapsibleGroupProps {
  group: SideNavGroup;
  activePage: AppNavPage;
  activeSubTab: string | null;
  onNavigate: (page: AppNavPage) => void;
}

const CollapsibleGroup: React.FC<CollapsibleGroupProps> = ({
  group,
  activePage,
  activeSubTab,
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
    isItemActive(item, activePage, activeSubTab),
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

      {/* ── 그룹 헤더 · 2026-08-18 v5 · 컬러 dot + 심플 배경 (사용자 피드백 반영) ── */}
      <Collapsible.Trigger asChild>
        <button
          type="button"
          aria-label={`${group.label} 그룹 ${open ? "접기" : "펼치기"}`}
          className={[
            "flex w-full items-center justify-between",
            "px-2.5 py-1.5 mt-1.5 mb-0",
            "rounded-lg",
            "text-[19px] leading-none",
            "transition-all duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
            hasActiveItem
              ? [
                  "bg-white/[0.10]",
                  groupTone.activeText,    // text-white
                  "font-bold",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]",
                ].join(" ")
              : [
                  "text-[#C4DAEE]",
                  "hover:bg-white/[0.06] hover:text-white hover:translate-x-[1px]",
                  "font-semibold",
                ].join(" "),
            "group-data-[collapsible=icon]:hidden",
          ].join(" ")}
        >
          <span className="flex items-center gap-2 relative">
            {/* 2026-08-18 v5 · 활성 stripe · 두께 4px + 강력한 glow (사용자 피드백 · 컬러 액센트 강화) */}
            {hasActiveItem && (
              <span
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-[4px] h-[85%] rounded-r-full pointer-events-none group-data-[collapsible=icon]:hidden"
                style={{
                  background: NAV_ACCENT[group.color].hex,
                  boxShadow: `0 0 12px ${NAV_ACCENT[group.color].hex}, 0 0 24px ${NAV_ACCENT[group.color].hex}80`,
                }}
              />
            )}
            {/* 2026-08-18 v5 · 아이콘 · 활성/비활성 모두 그룹 accent color (사용자 피드백 · 항상 컬러 유지) */}
            {group.icon && (() => {
              const GroupIcon = group.icon;
              return (
                <GroupIcon
                  size={20}
                  weight={hasActiveItem ? "fill" : "duotone"}
                  className={[
                    "shrink-0 transition-all duration-200 ease-out",
                    NAV_ACCENT[group.color].iconText,   // 항상 그룹 accent color (액센트 유지)
                    hasActiveItem ? "scale-110" : "opacity-80 group-hover:opacity-100 group-hover:scale-[1.05]",
                  ].join(" ")}
                  style={hasActiveItem ? { filter: `drop-shadow(0 0 8px ${NAV_ACCENT[group.color].hex}90) drop-shadow(0 0 16px ${NAV_ACCENT[group.color].hex}40)` } : undefined}
                />
              );
            })()}
            <span className="tracking-wide">{group.label}</span>
          </span>

          {/* CaretDown · 닫힘 = -90도 (좌) · 열림 = 0도 (아래) · 부드러운 화살표 · 2026-08-17 · deep teal 톤 */}
          {/* 2026-08-17 v3 · chevron · 더 세련 · 부드러운 회전 + subtle hover */}
          <span
            className={[
              "flex items-center justify-center",
              "w-7 h-7 rounded-md",
              "transition-all duration-200 ease-out",
              hasActiveItem ? "bg-transparent" : "hover:bg-white/[0.08] hover:scale-110",
            ].join(" ")}
            aria-hidden="true"
          >
            <CaretDown
              size={16}
              weight="bold"
              className={[
                "shrink-0 transition-transform duration-300 ease-out",
                hasActiveItem ? "text-white" : "text-white/70",
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
          // 2026-08-31 · 사용자 지시 · 접힘 시 하위메뉴 완전 숨김
          "group-data-[collapsible=icon]:!hidden",
        ].join(" ")}
      >
        <SidebarMenu className="gap-0 px-1 pt-0.5 pb-1">
          {group.items.map((item, itemIdx) => {
            // 2026-08-12 · 사용자 지시 · 하위 메뉴 아이콘 = 그룹 아이콘 (공통헤더 탭 아이콘) 통일
            const Icon = group.icon || item.icon;
            const active = isItemActive(item, activePage, activeSubTab);
            // 2026-08-17 · deep teal · DARK_COLOR_TONES
            const tone = DARK_COLOR_TONES[item.color];

            return (
              <SidebarMenuItem key={`${item.key}-${item.subTab ?? "_"}-${itemIdx}`} className="relative">
                {/* 2026-08-31 · 사용자 지시 · 선택 표시 강화 · Linear/Vercel/Attio 2026 톤
                   · 좌측 accent bar · 5px · glow 3-layer · 확대 (h 95%)
                   · 우측 accent dot · 항상 표시 · 위치 명확화 */}
                {active && (
                  <>
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[5px] h-[95%] rounded-r-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
                      style={{
                        background: NAV_ACCENT[item.color].hex,
                        boxShadow: `0 0 8px ${NAV_ACCENT[item.color].hex}, 0 0 16px ${NAV_ACCENT[item.color].hex}CC, 0 0 32px ${NAV_ACCENT[item.color].hex}66`,
                      }}
                    />
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
                      style={{
                        background: NAV_ACCENT[item.color].hex,
                        boxShadow: `0 0 6px ${NAV_ACCENT[item.color].hex}`,
                      }}
                    />
                  </>
                )}

                <SidebarMenuButton
                  onClick={() => handleNavItem(item)}
                  isActive={active}
                  tooltip={item.label}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={[
                    "group-data-[collapsible=icon]:pl-2 pl-4",
                    "h-8 rounded-lg",
                    "text-[18px]",
                    // 2026-08-31 · 강한 대비 · bg 강도 up (10% → 22%) · text 강도 up · font-extrabold
                    active
                      ? [
                          "bg-white/[0.22]",
                          "text-white",
                          "font-extrabold tracking-tight",
                          "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.10)]",
                          "ring-1 ring-white/15",
                        ].join(" ")
                      : [
                          "font-semibold text-[#C4DAEE]/85",
                          "hover:bg-white/[0.08] hover:text-white",
                          "hover:translate-x-px",
                        ].join(" "),
                    "transition-all duration-200 ease-out",
                  ].join(" ")}
                >
                  {/* 아이콘 · 활성 시 · scale 125 + 강한 glow */}
                  <Icon
                    size={16}
                    weight={active ? "fill" : "duotone"}
                    className={[
                      "shrink-0 transition-all duration-200 ease-out",
                      NAV_ACCENT[item.color].iconText,
                      active ? "scale-125" : "opacity-70 group-hover:opacity-100 group-hover:scale-[1.05]",
                    ].join(" ")}
                    style={active ? { filter: `drop-shadow(0 0 8px ${NAV_ACCENT[item.color].hex}) drop-shadow(0 0 16px ${NAV_ACCENT[item.color].hex}80)` } : undefined}
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
  activeSubTab: string | null;
  onNavigate: (page: AppNavPage) => void;
}
const SingleItemGroup: React.FC<SingleItemGroupProps> = ({ group, activePage, activeSubTab, onNavigate }) => {
  const item = group.items[0];
  const active = isItemActive(item, activePage, activeSubTab);
  const Icon = item.icon;
  return (
    <div className="relative">
      {/* 2026-08-31 · 사용자 지시 · SingleItemGroup 활성 표시 강화 (SubItem 과 통일) */}
      {active && (
        <>
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[5px] h-[85%] rounded-r-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
            style={{
              background: NAV_ACCENT[group.color].hex,
              boxShadow: `0 0 8px ${NAV_ACCENT[group.color].hex}, 0 0 16px ${NAV_ACCENT[group.color].hex}CC, 0 0 32px ${NAV_ACCENT[group.color].hex}66`,
            }}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
            style={{
              background: NAV_ACCENT[group.color].hex,
              boxShadow: `0 0 6px ${NAV_ACCENT[group.color].hex}`,
            }}
          />
        </>
      )}
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={active ? "page" : undefined}
      aria-label={group.label}
      className={[
        "flex w-full items-center gap-2",
        "px-2.5 py-1.5 mt-1.5 mb-0",
        "rounded-lg",
        "text-[19px] leading-none",
        "transition-all duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
        // 2026-08-31 · 강한 대비 · SubItem 과 동일 톤
        active
          ? [
              "bg-white/[0.22]",
              "text-white",
              "font-extrabold tracking-tight",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.10)]",
              "ring-1 ring-white/15",
            ].join(" ")
          : [
              "text-[#C4DAEE]",
              "hover:bg-white/[0.08] hover:text-white hover:translate-x-[1px]",
              "font-semibold",
            ].join(" "),
        "group-data-[collapsible=icon]:justify-center",
      ].join(" ")}
    >
      {/* 아이콘 · 활성 시 · scale 125 + 강한 glow · SubItem 과 통일 */}
      <Icon
        size={18}
        weight={active ? "fill" : "duotone"}
        className={[
          "shrink-0 transition-all duration-200 ease-out",
          NAV_ACCENT[group.color].iconText,
          active ? "scale-125" : "opacity-80 group-hover:opacity-100 group-hover:scale-[1.05]",
        ].join(" ")}
        style={active ? { filter: `drop-shadow(0 0 6px ${NAV_ACCENT[group.color].hex}90) drop-shadow(0 0 14px ${NAV_ACCENT[group.color].hex}40)` } : undefined}
      />
      <span className="group-data-[collapsible=icon]:hidden tracking-wide">{group.label}</span>
    </button>
    </div>
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
  // 2026-08-31 · 서브탭 활성 표시 fix · 현재 페이지 활성 서브탭 tracking
  const activeSubTab = useActiveSubTab(activePage);
  // 2026-08-12 · hideOnMobile 그룹은 반응형(모바일)에서 숨김 (거래처 그룹 등 · PC 관리자 전용)
  // 2026-08-16 · 페이지 숨김 반영 · 서버 perms 참조
  const { perms } = usePagePermissions();
  // 2026-08-20 · #175 · 본인 재직 상태 · document-writer 서브탭 filter · admin·pending_resignation 만 노출
  const { status: employmentStatus } = useEmploymentStatus(authSession);
  // 2026-08-23 · #188 · usePageVisibility (PC/모바일 체크박스) · 뷰포트별 필터
  const { isVisible } = usePageVisibility();
  const viewport = isMobile ? "mobile" : "pc";
  const groups = filterGroupsForSession(authSession, perms, employmentStatus)
    .filter(g => !(isMobile && g.hideOnMobile))
    .map(g => ({
      ...g,
      // 2026-08-25 · 사용자 지시 · 서브탭별 개별 노출 지원 · 그룹키 hidden 또는 composite key hidden 이면 숨김
      items: g.items.filter(it => {
        if (it.key === "landing") return true;
        // 그룹 자체가 hidden 이면 숨김
        if (!isVisible(it.key as string, viewport)) return false;
        // subTab 이 있으면 · composite key 도 체크 · false 이면 숨김
        if (it.subTab && !isVisible(`${it.key}:${it.subTab}`, viewport)) return false;
        return true;
      }),
    }))
    .filter(g => g.items.length > 0);
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
      // 2026-08-17 v3 · 세련 · border 강화 (white/8 → white/[0.10]) + shadow (헤더 통일)
      className="border-r border-white/[0.10] shadow-[4px_0_20px_-8px_rgba(10,46,74,0.20),12px_0_40px_-16px_rgba(10,46,74,0.25)]"
      style={!isMobile
        ? { ...teal, "--sidebar-width": `${width}px` } as React.CSSProperties
        : teal}
    >

      {/* ── 로고 영역 · 2026-08-17 v3 · aurora + noise + hairline · 초고해상도 세련 ── */}
      {/* aurora radial glow · 사이드바 상단 · brand identity signature */}
      <div className="absolute inset-x-0 top-0 h-40 pointer-events-none overflow-hidden">
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[340px] h-[220px] rounded-full opacity-[0.16] blur-3xl" style={{ background: "radial-gradient(closest-side, #5EA9E8, transparent)" }} />
        <div className="absolute -bottom-20 -left-16 w-[280px] h-[240px] rounded-full opacity-[0.08] blur-3xl" style={{ background: "radial-gradient(closest-side, #6FE3C2, transparent)" }} />
      </div>
      {/* 미세 noise 패턴 · 프리미엄 종이 질감 (Vercel/Linear signature) */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")` }}
        aria-hidden
      />
      {/* top hairline · inner light · glass 세련 */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none z-10" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.14) 50%, transparent)" }} />

      <SidebarHeader className="relative px-2 py-2 pb-1.5 border-b border-white/10 z-10">
        <div className="flex items-center gap-1 w-full">
          <button
            type="button"
            onClick={() => onNavigate("landing")}
            title="홈"
            aria-label="홈으로 이동"
            className={[
              "flex-1 min-w-0 flex items-center gap-2.5",
              "px-2 py-1.5 rounded-lg",
              "hover:bg-white/8 transition-colors duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
              "cursor-pointer",
            ].join(" ")}
          >
            {/* 2026-08-17 v3 · 로고 · ring-2 + brand glow · 세련 (헤더와 통일) */}
            <img
              src={brand.logoUrl || logoImg}
              alt={`${brand.region ? brand.region + " " : ""}${brand.shortName} 로고`}
              className="w-7 h-7 rounded-full object-cover shrink-0 ring-2 ring-white/25 shadow-[0_0_16px_rgba(94,169,232,0.30)] transition-all duration-200 hover:ring-white/40"
            />
            {/* icon-only 모드에서 숨김 · 2026-08-17 · 흰색 텍스트 (deep teal bg 대비) */}
            <div className="flex flex-col gap-0 leading-none group-data-[collapsible=icon]:hidden min-w-0">
              {brand.region && (
                <span className="text-[15px] font-bold text-white tracking-tight leading-tight break-words whitespace-normal">
                  {brand.region}
                </span>
              )}
              <span className="text-[11px] font-semibold text-[#93B4D0] tracking-tight leading-tight break-words whitespace-normal mt-0.5">
                {brand.shortName}
              </span>
            </div>
          </button>
          {/* 2026-09-01 · 사용자 지시 · 사이드바 내부 토글 제거 · 헤더 위치로 원복 (a06a9abc 이전 UX) */}
        </div>
      </SidebarHeader>

      {/* ── 그룹 트리 · 2026-08-17 · relative + z-10 (aurora glow 뒤로) ── */}
      <SidebarContent className="relative px-1 pt-1 z-10">
        {groups.map((group) => (
          group.items.length === 1 ? (
            <SingleItemGroup
              key={group.id}
              group={group}
              activePage={activePage}
              activeSubTab={activeSubTab}
              onNavigate={onNavigate}
            />
          ) : (
            <CollapsibleGroup
              key={group.id}
              group={group}
              activePage={activePage}
              activeSubTab={activeSubTab}
              onNavigate={onNavigate}
            />
          )
        ))}
      </SidebarContent>

      {/* ── 하단: 구분선 + 알림 + 로그아웃 · 2026-08-17 v2 · gradient hairline · glass 세련 ── */}
      {/* footer 상단 gradient hairline · fade edges · Attio/Linear 톤 */}
      <div className="relative h-px shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 50%, transparent)" }} aria-hidden />

      <SidebarFooter className="relative px-2 py-1.5 gap-0.5 z-10">
        {/* 2026-08-17 v3 · 사용자 이름 · 성씨 initial 제거 · 이름만 표시 (사용자 요청) */}
        {authSession && authSession.employeeName && (
          <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-bold text-white break-words whitespace-normal leading-tight">
              {authSession.employeeName}
            </span>
          </div>
        )}
        {/* 2026-08-17 v3 · 종 아이콘 테두리 여백 반 (PC · 사용자 요청) · px-2 py-1 → px-1 py-0.5 */}
        {/* 2026-08-20 · #174 · NotificationBell compact · 크기·테두리·그림자 축소 · 시각 균형 */}
        {/* 2026-08-26 · 사용자 지시 · 사이드바 접힘 시 튀어나옴 방지 · 세로 stack + overflow-hidden */}
        {authSession && (
          <div className="flex items-center gap-0.5 px-0.5 py-0 rounded-md group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:w-full">
            <NotificationToggle authSession={authSession} />
            <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} compact />
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
                  // 2026-08-17 v2 · frosted hover · translate-x · 세련
                  "text-white hover:bg-white/[0.08] hover:translate-x-[1px]",
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
      {/* 2026-09-01 · 사용자 지시 · SidebarRail 제거 · 사이드바 안 토글 전면 폐지 · 헤더 chip 버튼으로 통일 */}
    </Sidebar>
  );
};
