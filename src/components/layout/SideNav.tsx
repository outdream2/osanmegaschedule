// src/components/layout/SideNav.tsx
// 2026-08-11 · 사이드바 V2 · shadcn Sidebar + Radix Collapsible · 6그룹 접이식 트리
// 2026-08-12 · V3 · Warm Cream + Soft Pill + Micro Glow · 시인성 강화 · chevron pill 강조
// 디자인 참고: Notion · Anthropic · Attio · 2026 SaaS Warm Trend
// 2026-09-20 · 승인대기 · pending 배지 · 60초 폴링 + approval-count-updated 이벤트
import React, { useState, useCallback, useEffect } from "react";
import { Collapsible } from "radix-ui";
import { LogOut } from "lucide-react";
// 2026-08-12 · 접힘 아이콘 · CaretDown (Radix/shadcn 표준 · 부드러운 화살표)
import { CaretDown } from "@phosphor-icons/react";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-23 · #188 · usePageVisibility · 사이드바 items · 뷰포트별 필터
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { NotificationBell } from "../NotificationBell";
// 2026-09-14 · #108 · NotificationToggle 제거 (사용자 결정 · 실사용 빈도 낮음)
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import type { AppNavPage } from "./AppNavHeader";
import type { AuthSession } from "../../types";
import {
  filterGroupsForSession,
  isItemActive,
  DARK_COLOR_TONES,
  NAV_ACCENT,
  type SideNavGroup,
  type SideNavItem,
} from "./sideNavGroups";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context (사이드 채널 제거)
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { useSidebarWidth } from "../../hooks/useSidebar";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { getLeavePendingCount } from "../../lib/leaveApi";
import { getResignationPendingCount } from "../../lib/resignationsApi";
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

// 2026-09-27 · 네비게이션 SSOT · useActiveSubTab 훅 제거 · useActiveNav Context 로 통합

// 2026-09-04 · fix (Bug #3) · vendor 사이드바 · 공급사 정보 클릭 시 · 랜딩 이동 + 모달 open 신호
//   · vendor 는 DisplayPage 접근 불가 · LandingPage 의 VendorDetailModal 을 대신 open
//   · localStorage 신호 + custom event · LandingPage 마운트 시 감지 (또는 mount 상태에서 event 처리)
export const LANDING_ACTION_KEY = "landing.action";
export const LANDING_ACTION_EVENT = "landing:action";
export type LandingAction = "open-vendor-self" | "open-vendor-stock";
export function dispatchLandingAction(action: LandingAction): void {
  try { localStorage.setItem(LANDING_ACTION_KEY, action); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent<LandingAction>(LANDING_ACTION_EVENT, { detail: action })); } catch { /* silent */ }
}

// ─── CollapsibleGroup: 개별 그룹 접이식 트리 ────────────────────────────────
interface CollapsibleGroupProps {
  group: SideNavGroup;
  activePage: AppNavPage;
  activeSubTab: string | null;
  onNavigate: (page: AppNavPage) => void;
  isVendor: boolean;
  approvalBadge?: number;
}

const CollapsibleGroup: React.FC<CollapsibleGroupProps> = ({
  group,
  activePage,
  activeSubTab,
  onNavigate,
  isVendor,
  approvalBadge,
}) => {
  const [open, setOpen] = useState<boolean>(() => readGroupOpen(group.id));
  // 2026-09-27 · 네비게이션 SSOT · setActiveByPage · 그룹 클릭 시 activeNav 즉시 갱신
  const { setActiveByPage } = useActiveNav();

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

  // 2026-09-27 · 네비게이션 SSOT · setActiveByPage 로 activeNav 통합
  //   · 이전 · localStorage + CustomEvent 사이드 채널 · 각 페이지 리슨 · 오매칭 리스크
  //   · 이후 · setActiveByPage(page, subTab, nested) · Context 단일 · Header · Sidebar highlight 동시 반영
  //   · subTab 형식 "outer:inner" (예: "document-writer:contract") · nested 로 분해
  const handleNavItem = (item: SideNavItem) => {
    // 2026-09-04 · Bug #3 · vendor 특수 라우팅
    //   · vendor 는 DisplayPage 접근 불가 · "공급사 정보" (display+vendor-manage) 는 랜딩에서 모달 open
    //   · signal + event · LandingPage 가 감지하여 VendorDetailModal 자동 open
    if (isVendor && item.key === "display" && item.subTab === "vendor-manage") {
      dispatchLandingAction("open-vendor-self");
      onNavigate("landing");
      return;
    }
    if (item.subTab) {
      const [outer, inner] = item.subTab.split(":");
      // 그룹 id 명시 · lookup 이 아닌 사이드바 그룹 그대로 저장 (approval-request 오매칭 방지)
      setActiveByPage(item.key, outer, inner ?? null);
    } else {
      setActiveByPage(item.key);
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
            // 2026-10-07 · Batch 3 · 그룹 헤더 compact · spec: nav font 13~14px · group gap 14~18px
            "flex w-full items-center justify-between",
            "px-2.5 py-1.5 mt-3 mb-0",
            "rounded-lg",
            "text-[14px] leading-none",
            "transition-colors duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
            hasActiveItem
              ? [
                  "bg-white/[0.06]",
                  groupTone.activeText,    // text-white
                  "font-semibold",
                ].join(" ")
              : [
                  "text-[#9FBAD4]",
                  "hover:bg-white/[0.04] hover:text-white",
                  "font-medium",
                ].join(" "),
            "group-data-[collapsible=icon]:hidden",
          ].join(" ")}
        >
          <span className="flex items-center gap-2 relative">
            {/* 2026-10-07 · Batch 3 · 활성 accent · slim 2px · 3-layer glow 제거 · subtle visual signal 만 */}
            {hasActiveItem && (
              <span
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-[2px] h-[70%] rounded-r-full pointer-events-none group-data-[collapsible=icon]:hidden"
                style={{ background: NAV_ACCENT[group.color].hex }}
              />
            )}
            {/* 2026-10-07 · Batch 3 · 아이콘 · 활성=white · 비활성=muted blue-gray · drop-shadow glow 제거 */}
            {group.icon && (() => {
              const GroupIcon = group.icon;
              return (
                <GroupIcon
                  size={16}
                  weight={hasActiveItem ? "fill" : "regular"}
                  className={[
                    "shrink-0 transition-colors duration-150 ease-out",
                    hasActiveItem ? "text-white" : "text-[#8FA5BF]",
                  ].join(" ")}
                />
              );
            })()}
            <span className="tracking-tight">{group.label}</span>
          </span>

          {/* CaretDown · 닫힘 = -90도 (좌) · 열림 = 0도 (아래) · 부드러운 화살표 · 2026-08-17 · deep teal 톤 */}
          {/* 2026-08-17 v3 · chevron · 더 세련 · 부드러운 회전 + subtle hover */}
          <span
            className={[
              // 2026-10-07 · Batch 3 · chevron compact · scale hover 제거
              "flex items-center justify-center",
              "w-6 h-6 rounded-md",
              "transition-colors duration-150 ease-out",
              hasActiveItem ? "" : "hover:bg-white/[0.06]",
            ].join(" ")}
            aria-hidden="true"
          >
            <CaretDown
              size={12}
              weight="bold"
              className={[
                "shrink-0 transition-transform duration-200 ease-out",
                hasActiveItem ? "text-white/85" : "text-white/55",
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
            // 2026-08-12 · 하위 메뉴 아이콘 = 그룹 아이콘 (공통헤더 탭 아이콘) 통일
            const Icon = group.icon || item.icon;
            const active = isItemActive(item, activePage, activeSubTab);
            // 2026-10-07 · Batch 3 · DARK_COLOR_TONES per-item 사용 제거 (icon 색 통일) · NAV_ACCENT.hex 는 slim left bar 에만 사용

            return (
              <SidebarMenuItem key={`${item.key}-${item.subTab ?? "_"}-${itemIdx}`} className="relative">
                {/* 2026-10-07 · Batch 3 · 활성 표시 · slim 2px left accent 만 · 3-layer glow + 우측 dot 제거 */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[70%] rounded-r-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
                    style={{ background: NAV_ACCENT[item.color].hex }}
                  />
                )}

                <SidebarMenuButton
                  onClick={() => handleNavItem(item)}
                  isActive={active}
                  tooltip={item.label}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={[
                    // 2026-10-07 · Batch 3 · nav row h-10 (40px · spec 40~42) · font 13px · active bg subtle
                    "group-data-[collapsible=icon]:pl-2 pl-2.5 pr-2",
                    "h-10 rounded-lg",
                    "text-[13px]",
                    active
                      ? [
                          "bg-white/[0.08]",
                          "text-white",
                          "font-semibold tracking-tight",
                        ].join(" ")
                      : [
                          "font-medium text-[#9FBAD4]",
                          "hover:bg-white/[0.05] hover:text-white",
                        ].join(" "),
                    "transition-colors duration-150 ease-out",
                  ].join(" ")}
                >
                  {/* 2026-10-07 · Batch 3 · 아이콘 · 활성=white · 비활성=muted · drop-shadow glow 제거 */}
                  <Icon
                    size={16}
                    weight={active ? "fill" : "regular"}
                    className={[
                      "shrink-0 transition-colors duration-150 ease-out",
                      active ? "text-white" : "text-[#8FA5BF]",
                    ].join(" ")}
                  />
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    {/* 2026-09-20 · P3-1 fix · 라벨 문자열 대신 · key+subTab 기반 판정 (라벨 변경 취약성 제거) */}
                    {item.key === "requests" && item.subTab === "leave" && (approvalBadge ?? 0) > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold tabular-nums leading-none shrink-0 group-data-[collapsible=icon]:hidden">
                        {(approvalBadge ?? 0) > 99 ? "99+" : approvalBadge}
                      </span>
                    )}
                  </span>
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
      {/* 2026-10-07 · Batch 3 · SingleItemGroup 활성 표시 · slim 2px left accent 만 */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[70%] rounded-r-full pointer-events-none z-[1] group-data-[collapsible=icon]:hidden"
          style={{ background: NAV_ACCENT[group.color].hex }}
        />
      )}
    <button
      type="button"
      onClick={() => onNavigate(item.key)}
      aria-current={active ? "page" : undefined}
      aria-label={group.label}
      className={[
        // 2026-10-07 · Batch 3 · Single item 그룹 header-like · spec: nav font 13~14px · 40px row
        "flex w-full items-center gap-2",
        "px-2.5 h-10 mt-3 mb-0",
        "rounded-lg",
        "text-[14px] leading-none",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30",
        active
          ? [
              "bg-white/[0.08]",
              "text-white",
              "font-semibold tracking-tight",
            ].join(" ")
          : [
              "text-[#9FBAD4]",
              "hover:bg-white/[0.05] hover:text-white",
              "font-medium",
            ].join(" "),
        "group-data-[collapsible=icon]:justify-center",
      ].join(" ")}
    >
      {/* 2026-10-07 · Batch 3 · 아이콘 · 활성=white · 비활성=muted · drop-shadow glow 제거 */}
      <Icon
        size={16}
        weight={active ? "fill" : "regular"}
        className={[
          "shrink-0 transition-colors duration-150 ease-out",
          active ? "text-white" : "text-[#8FA5BF]",
        ].join(" ")}
      />
      <span className="group-data-[collapsible=icon]:hidden tracking-tight">{group.label}</span>
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
  // 2026-09-20 · 승인대기 배지 · leave + resignation pending count
  const [approvalBadge, setApprovalBadge] = useState(0);
  const isManager = (authSession?.level ?? 0) >= 2;
  const loadApprovalBadge = useCallback(async () => {
    if (!isManager) return;
    try {
      const [lc, rc] = await Promise.all([
        getLeavePendingCount().catch(() => 0),
        getResignationPendingCount().catch(() => 0),
      ]);
      setApprovalBadge(lc + rc);
    } catch { /* silent */ }
  }, [isManager]);
  useEffect(() => {
    loadApprovalBadge();
    const iv = setInterval(loadApprovalBadge, 60_000);
    const handler = () => loadApprovalBadge();
    window.addEventListener("approval-count-updated", handler);
    window.addEventListener("mt-approval-change", handler);
    return () => {
      clearInterval(iv);
      window.removeEventListener("approval-count-updated", handler);
      window.removeEventListener("mt-approval-change", handler);
    };
  }, [loadApprovalBadge]);

  // 2026-09-27 · 네비게이션 SSOT · useActiveNav Context 기반 · 현재 페이지 활성 서브탭 tracking
  const { activeNav } = useActiveNav();
  const activeSubTab = activeNav?.itemKey === activePage ? (activeNav.subTab ?? null) : null;
  // 2026-10-06 · 사용자 지시 · surface-specific hide 제거 (hideOnMobile)
  //   · PC/mobile/top nav 노출 통일 · DB app_settings.page_visibility 로 통일
  // 2026-08-16 · 페이지 숨김 반영 · 서버 perms 참조
  const { perms } = usePagePermissions();
  // 2026-08-20 · #175 · 본인 재직 상태 · document-writer 서브탭 filter · admin·pending_resignation 만 노출
  const { status: employmentStatus } = useEmploymentStatus(authSession);
  // 2026-08-23 · #188 · usePageVisibility (PC/모바일 체크박스) · 뷰포트별 필터
  const { isVisible } = usePageVisibility();
  const viewport = isMobile ? "mobile" : "pc";
  const groups = filterGroupsForSession(authSession, perms, employmentStatus)
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
      // 2026-10-07 · Batch 3 (PRESENTATION ONLY) · sidebar shadow 제거 · border 만 유지 (spec: shadow none)
      className="border-r border-white/[0.08]"
      style={!isMobile
        ? { ...teal, "--sidebar-width": `${width}px` } as React.CSSProperties
        : teal}
    >

      {/* 2026-10-07 · Batch 3 (PRESENTATION ONLY) · aurora glow + noise + heavy hairline 제거
             - 큰 decorative gradient 금지 · 큰 shadow 금지 · 2026 Operations SaaS calm density
             - 상단 얇은 hairline 하나만 유지 (brand 경계 신호 · pure visual)
             - 모든 handler / state / sideNavGroups / permission 미수정 */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none z-10" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 50%, transparent)" }} aria-hidden />

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
            {/* 2026-10-07 · Batch 3 · 로고 brand glow 제거 · subtle ring 유지 (28px · spec 32~36 아래 range 유지) */}
            <img
              src={brand.logoUrl || logoImg}
              alt={`${brand.region ? brand.region + " " : ""}${brand.shortName} 로고`}
              className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-white/15 transition-all duration-200 hover:ring-white/30"
            />
            {/* icon-only 모드에서 숨김 · 2026-10-07 · brand/region 폰트 축소 (14px/13px → spec 13~14px) */}
            <div className="flex flex-col gap-0 leading-none group-data-[collapsible=icon]:hidden min-w-0">
              {brand.region && (
                <span className="text-[14px] font-semibold text-white tracking-tight leading-tight break-words whitespace-normal">
                  {brand.region}
                </span>
              )}
              <span className="text-[12px] font-medium text-[#93B4D0] tracking-tight leading-tight break-words whitespace-normal mt-0.5">
                {brand.shortName}
              </span>
            </div>
          </button>
          {/* 2026-09-01 · 사용자 지시 · 사이드바 내부 토글 제거 · 헤더 위치로 원복 (a06a9abc 이전 UX) */}
        </div>
      </SidebarHeader>

      {/* ── 그룹 트리 · 2026-08-17 · relative + z-10 (aurora glow 뒤로) ── */}
      {/* 2026-09-01 · 사용자 지시 · 좌우 여백 감축 · px-1 → px-0.5 (SidebarMenu 자체 px-1 유지 · 총 여백 최소) */}
      <SidebarContent className="relative px-0.5 pt-1 z-10">
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
              isVendor={authSession?.role === "vendor"}
              approvalBadge={approvalBadge}
            />
          )
        ))}
      </SidebarContent>

      {/* ── 하단: 구분선 + 알림 + 로그아웃 · 2026-08-17 v2 · gradient hairline · glass 세련 ── */}
      {/* footer 상단 gradient hairline · fade edges · Attio/Linear 톤 */}
      <div className="relative h-px shrink-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12) 50%, transparent)" }} aria-hidden />

      <SidebarFooter className="relative px-2 py-1.5 gap-0.5 z-10">
        {/* 2026-10-07 · Batch 3 · footer user compact · spec: name 13~14px */}
        {authSession && authSession.employeeName && (
          <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-semibold text-white break-words whitespace-normal leading-tight">
              {authSession.employeeName}
            </span>
          </div>
        )}
        {/* 2026-08-17 v3 · 종 아이콘 테두리 여백 반 (PC · 사용자 요청) · px-2 py-1 → px-1 py-0.5 */}
        {/* 2026-08-20 · #174 · NotificationBell compact · 크기·테두리·그림자 축소 · 시각 균형 */}
        {/* 2026-08-26 · 사용자 지시 · 사이드바 접힘 시 튀어나옴 방지 · 세로 stack + overflow-hidden */}
        {authSession && (
          <div className="flex items-center gap-0.5 px-0.5 py-0 rounded-md group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:w-full">
            {/* 2026-09-14 · #108 · NotificationToggle 제거 · NotificationBell (알림 목록) 은 유지 */}
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
                  // 2026-10-07 · Batch 3 · logout compact · spec: nav font 13px · translate hover 제거
                  "h-9 rounded-md pl-2",
                  "text-[13px] font-medium",
                  "text-[#9FBAD4] hover:bg-white/[0.05] hover:text-white",
                  "transition-colors duration-150 ease-out",
                ].join(" ")}
              >
                <LogOut size={14} strokeWidth={2} className="shrink-0" />
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
