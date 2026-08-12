// src/components/layout/SideNav.tsx
// 2026-08-11 · 사이드바 V2 · shadcn Sidebar + Radix Collapsible · 6그룹 접이식 트리
// 2026-08-12 · 톤 통일 · AppNavHeader 파스텔 팔레트 + 헤더 그라디언트 배경과 조화
// 디자인 참고: Notion · Linear · Vercel 2026 · 깔끔하고 세련된 톤
import React, { useState, useCallback } from "react";
import { Collapsible } from "radix-ui";
import { ChevronRight, LogOut } from "lucide-react";
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
            // 상단 여백 줄임 (mt-1.5) · 헤더와 하위 항목 간 리듬감
            "px-2.5 py-1.5 mt-1.5 mb-0",
            "rounded-lg",
            // 그룹 헤더는 15px (하위 항목 14px 보다 한 단계 위) · 계층감
            "text-[15px] leading-none",
            "transition-all duration-150",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
            // 활성/비활성 톤 · 파스텔 tint + 좌측 세로 accent
            hasActiveItem
              ? [groupTone.activeBg, groupTone.activeText, "font-bold"].join(" ")
              : ["text-slate-500", groupTone.hoverBg, "hover:text-slate-700", "font-semibold"].join(" "),
            "group-data-[collapsible=icon]:hidden",
          ].join(" ")}
        >
          <span className="flex items-center gap-1.5">
            {/* 좌측 그룹 컬러 accent dot · 활성 시 약간 더 밝음 */}
            <span
              className={[
                "w-2 h-2 rounded-full shrink-0",
                hasActiveItem ? groupTone.activeBar : groupTone.activeBar + " opacity-40",
              ].join(" ")}
              aria-hidden="true"
            />
            <span className="tracking-wide">{group.label}</span>
          </span>
          <ChevronRight
            size={12}
            strokeWidth={2.5}
            className={[
              "shrink-0 opacity-50 transition-transform duration-200 ease-out",
              open ? "rotate-90" : "rotate-0",
            ].join(" ")}
          />
        </button>
      </Collapsible.Trigger>

      {/* ── 하위 항목 · Collapsible content ── */}
      {/*
        Radix CollapsibleContent 는 data-[state=open/closed] 를 자동으로 붙여줌.
        tw-animate-css 의 animate-collapsible-down/up 은
        --radix-collapsible-content-height CSS 변수로 높이 애니메이션.
      */}
      <Collapsible.Content
        className={[
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down",
          "data-[state=closed]:animate-collapsible-up",
          // icon-only 모드: Content 가 항상 보여야 아이콘이 노출됨
          // shadcn Collapsible.Content 는 data-state=closed 일 때 display:none 을 적용하므로
          // icon-only 모드에서는 강제 표시 (아이콘 tooltip 만 노출)
          "group-data-[collapsible=icon]:!block group-data-[collapsible=icon]:!overflow-visible",
        ].join(" ")}
      >
        <SidebarMenu className="gap-0 px-1 pt-0.5 pb-1">
          {group.items.map((item, itemIdx) => {
            const Icon = item.icon;
            const active = isItemActive(item, activePage);
            const tone = COLOR_TONES[item.color];

            return (
              <SidebarMenuItem key={`${item.key}-${item.subTab ?? "_"}-${itemIdx}`} className="relative">

                {/* 활성 좌측 accent bar · 3px 세로 선 · icon-only 모드 숨김 */}
                {active && (
                  <span
                    aria-hidden="true"
                    className={[
                      "absolute left-0.5 top-1/2 -translate-y-1/2",
                      "w-[3px] h-[60%] min-h-[14px] max-h-[22px] rounded-full",
                      "group-data-[collapsible=icon]:hidden",
                      tone.activeBar,
                    ].join(" ")}
                  />
                )}

                <SidebarMenuButton
                  onClick={() => handleNavItem(item)}
                  isActive={active}
                  tooltip={item.label}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={[
                    // indent · 텍스트 모드: pl-4 (accent bar 공간 포함) · icon-only: pl-2
                    "group-data-[collapsible=icon]:pl-2 pl-4",
                    // 높이 · 항목 간격 · 하위 항목은 헤더보다 컴팩트
                    "h-7 rounded-md",
                    // 하위 항목 텍스트 크기 · 그룹 헤더(15px)보다 한 단계 작게 → 계층감
                    "text-[14px]",
                    // 활성 스타일
                    active
                      ? [
                        tone.activeBg,
                        tone.activeText,
                        "font-bold",
                      ].join(" ")
                      : [
                        "font-medium text-slate-500",
                        tone.hoverBg,
                        "hover:text-slate-700",
                      ].join(" "),
                    "transition-colors duration-150",
                  ].join(" ")}
                >
                  <Icon
                    size={14}
                    weight={active ? "fill" : "duotone"}
                    className={[
                      "shrink-0",
                      active ? tone.iconActive : "text-slate-400",
                    ].join(" ")}
                  />
                  {/* 텍스트 레이블 · icon-only 모드 숨김은 SidebarMenuButton 내부에서 처리 */}
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
        "text-[15px] leading-none",
        "transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300",
        active
          ? [tone.activeBg, tone.activeText, "font-bold"].join(" ")
          : ["text-slate-500", tone.hoverBg, "hover:text-slate-700", "font-semibold"].join(" "),
        "group-data-[collapsible=icon]:justify-center",
      ].join(" ")}
    >
      {/* accent dot · CollapsibleGroup 헤더와 동일 스타일 */}
      <span
        className={[
          "w-2 h-2 rounded-full shrink-0 group-data-[collapsible=icon]:hidden",
          active ? tone.activeBar : tone.activeBar + " opacity-40",
        ].join(" ")}
        aria-hidden="true"
      />
      <Icon size={15} weight={active ? "fill" : "duotone"} className={["shrink-0", active ? tone.iconActive : "text-slate-400"].join(" ")} />
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
  const groups = filterGroupsForSession(authSession);
  const { startResize } = useSidebarWidth();

  return (
    <Sidebar collapsible="icon" data-sb-v2="">

      {/* ── 로고 영역 ── */}
      {/* 헤더 배경과 조화: 사이드바 배경색(파스텔 블루 슬레이트)보다 살짝 진한 흰 경계 */}
      <SidebarHeader className="px-2 py-2 pb-1.5 border-b border-slate-200/70">
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          title="홈"
          aria-label="홈으로 이동"
          className={[
            "w-full flex items-center gap-2.5",
            "px-2 py-1.5 rounded-lg",
            // 파스텔 블루 계열 hover · --sidebar 배경보다 살짝 진한 파스텔
            "hover:bg-blue-50/80 transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-200",
            "cursor-pointer",
          ].join(" ")}
        >
          <img
            src={logoImg}
            alt="메가타운 로고"
            className="w-6 h-6 object-contain shrink-0"
          />
          {/* icon-only 모드에서 숨김 */}
          <div className="flex flex-col gap-px leading-none group-data-[collapsible=icon]:hidden">
            {/* 앱 헤더 OSAN MEGATOWN 텍스트와 동일 감성 */}
            <span className="text-[13px] font-black text-slate-800 tracking-tight leading-tight">
              오산메가타운약국
            </span>
          </div>
        </button>
      </SidebarHeader>

      {/* ── 그룹 트리 · 단일 항목 그룹은 chevron 없이 · 헤더 = 페이지 링크 ── */}
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
      {/* border 색을 --sidebar-border(파스텔 블루 슬레이트)와 통일 */}
      <SidebarSeparator className="bg-slate-200/80" />

      <SidebarFooter className="px-2 py-1.5 gap-0.5">
        {/* 알림 스위치 + 알림 벨 · 로그인 시만 · icon-only 모드에서도 노출 (아이콘만) */}
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
                  // 헤더 로그아웃 버튼 스타일 참고 (rose 계열 · 앱 전체 통일)
                  "h-7 rounded-md pl-2",
                  "text-[14px] font-semibold",
                  "text-rose-500 hover:bg-rose-50 hover:text-rose-600",
                  "transition-colors duration-150",
                ].join(" ")}
              >
                <LogOut size={13} strokeWidth={2} className="shrink-0" />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      {/* 2026-08-11 · PC 드래그 리사이즈 handle · 오른쪽 가장자리 · md 이상만 노출 */}
      {/* 2026-08-12 · 파스텔 블루 톤으로 조화 */}
      <div
        onMouseDown={startResize}
        className="hidden md:block absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-blue-200/70 active:bg-blue-300 transition z-30 group-data-[collapsible=icon]:hidden"
        title="드래그하여 사이드바 폭 조절"
        aria-label="사이드바 폭 조절"
        aria-hidden="true"
      />
    </Sidebar>
  );
};
