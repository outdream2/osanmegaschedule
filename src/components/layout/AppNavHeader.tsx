// src/components/AppNavHeader.tsx
// 헤더 · 2026-07-19 · 2026-08-03 경영관리 통합 페이지 라우팅
//   - PC: 데스크톱 탭 실측 폭 기반 오버플로 · 넘어가는 탭만 삼선(☰) 드롭다운
//   - 모바일: 균등 분할 · 넘치는 탭 삼선(☰) 드롭다운 처리
//   - 로고 클릭 → 홈(랜딩) 이동
//   - 경영관리 탭 클릭 → business-manage 페이지로 단순 라우팅 (팝오버 제거)
// 2026-08-31 · 분리: NavDesktopTab · NavMobileTab · AppNavHeader.types
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Lock, LogOut, Menu } from "lucide-react";
import type { AuthSession } from "../../types";
import { NotificationBell } from "../NotificationBell";
import { NotificationToggle } from "../NotificationToggle";
import logoImg from "../../images/logo2.png";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { SidebarTrigger } from "../ui/sidebar";
import { Breadcrumb } from "../common/Breadcrumb";
import { buildBreadcrumb } from "./sideNavGroups";
import { useActiveSubTab } from "../../hooks/useActiveSubTab";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { SIDE_NAV_GROUPS } from "./sideNavGroups";
import { useIsMobile } from "../../hooks/use-mobile";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { DERIVED_TOP_TABS, type DerivedTopTab, type SideNavColor } from "./sideNavGroups";
import type { TabDef } from "./AppNavHeader.types";
// 2026-09-01 · TAB_COLOR_MAP · dropdown fix 후 · 이 파일에서 미사용 (NavDesktopTab·NavMobileTab 은 자체 import)
import { NavDesktopTab } from "./NavDesktopTab";
import { NavMobileTab } from "./NavMobileTab";

export type AppNavPage =
  | "landing"
  | "schedule"
  | "display"
  | "requests"
  | "leave"
  | "reservation"
  | "scan"
  | "productarrival"
  | "ocr"
  | "lunch"
  | "permissions"
  | "stockarrivals"
  | "stockcheck"
  | "board"
  | "mypage"
  | "zone-labels"
  | "business-manage"
  | "hr-forms"
  | "pharmacist"
  | "approval-request"
  | "branding"
  | "company-info"
  | "season-settings"
  | "system-settings";
  // 2026-08-23 · #181 · zone-settings 제거 · StoreZoneMap 인라인 편집만

// 헤더 내부 탭 렌더용 확장 키 (경영관리 · business-manage 로 라우팅)
type TabKey = AppNavPage | "business";

interface AppNavHeaderProps {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onBack?: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  rightSlot?: React.ReactNode;
}

// 2026-08-12 · #62 · TABS = SIDE_NAV_GROUPS 로부터 자동 파생 (단일 소스 · sideNavGroups.ts)
const TABS: TabDef[] = DERIVED_TOP_TABS.map((t: DerivedTopTab): TabDef => ({
  key: t.key as TabKey,
  label: t.label,
  mobileLabel: t.mobileLabel,
  icon: t.icon,
  managerOnly: t.managerOnly,
  pharmacistOnly: t.pharmacistOnly,
  color: t.color as SideNavColor & TabDef["color"],
}));

// 2026-08-29 · #196 Phase 4 · SIDE_NAV_GROUPS business 그룹 items 로부터 자동 파생 (하드코드 제거)
const BUSINESS_PAGES: Set<AppNavPage> = new Set(
  (() => {
    const businessGroup = SIDE_NAV_GROUPS.find(g => g.id === "business");
    const settingsGroup = SIDE_NAV_GROUPS.find(g => g.id === "settings");
    const keys: string[] = [];
    if (businessGroup) keys.push(...businessGroup.items.map(i => String(i.key)));
    if (settingsGroup) keys.push(...settingsGroup.items.map(i => String(i.key)));
    return keys as AppNavPage[];
  })()
);

export const AppNavHeader: React.FC<AppNavHeaderProps> = ({
  activePage,
  authSession,
  onBack,
  onNavigate,
  onLogout,
  rightSlot,
}) => {
  const isMobileNav = useIsMobile();
  const SIDEBAR_ENABLED = useSidebarEnabled();
  const { brand: hdrBrand } = useBrandIdentity();
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isPrivileged = userLevel >= 2;

  const isPharmacist = useMemo(() => {
    if (!authSession) return false;
    return (authSession.level ?? 0) >= 3;
  }, [authSession]);

  const isVendor = authSession?.role === "vendor";
  const { perms } = usePagePermissions();
  const { isVisible: isPageVisible } = usePageVisibility();
  const viewport = isMobileNav ? "mobile" : "pc";
  const ADMIN_ESSENTIAL_KEYS = React.useMemo(() => new Set<string>(["permissions", "business-manage", "account"]), []);

  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (isVendor) return false;
    if (t.managerOnly) return isPrivileged;
    if (t.pharmacistOnly) return isPharmacist;
    if (perms) {
      const group = SIDE_NAV_GROUPS.find(g => (g.topTab?.key ?? g.items[0]?.key) === t.key);
      if (group) {
        const allHidden = group.items.length > 0 && group.items.every(it => {
          const compositeKey = it.subTab ? `${it.key}:${it.subTab}` : it.key;
          const perm = perms[compositeKey] ?? perms[it.key];
          if (perm?.hidden !== true) return false;
          if (userLevel >= 9 && ADMIN_ESSENTIAL_KEYS.has(it.key)) return false;
          return true;
        });
        if (allHidden) return false;
      }
    }
    if (!isPageVisible(t.key as string, viewport)) return false;
    return true;
  }), [authSession, isPrivileged, isPharmacist, isVendor, perms, userLevel, ADMIN_ESSENTIAL_KEYS, isPageVisible, viewport]);

  const isBizPage = BUSINESS_PAGES.has(activePage);

  // ── 모바일 오버플로 처리 ─────────────────────────
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileMeasureRef = useRef<HTMLDivElement>(null);
  const mobileOverflowBtnRef = useRef<HTMLDivElement>(null);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(visibleTabs.length);
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false);

  useLayoutEffect(() => {
    const container = mobileContainerRef.current;
    const measure = mobileMeasureRef.current;
    if (!container || !measure) return;
    const calc = () => {
      const containerW = container.clientWidth;
      const btnW = 52;
      const tabEls = measure.querySelectorAll<HTMLElement>("[data-mobile-tab]");
      let used = 0;
      let count = 0;
      const gap = 4;
      const padding = 16;
      const avail = containerW - padding;
      for (let i = 0; i < tabEls.length; i++) {
        const w = tabEls[i].offsetWidth + (i > 0 ? gap : 0);
        const willHaveOverflow = i < tabEls.length - 1;
        const limit = willHaveOverflow ? avail - btnW - gap : avail;
        if (used + w > limit) break;
        used += w;
        count++;
      }
      setMobileVisibleCount(Math.max(1, count));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(container);
    return () => ro.disconnect();
  }, [visibleTabs]);

  useEffect(() => {
    if (!mobileOverflowOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!mobileOverflowBtnRef.current?.contains(e.target as Node)) setMobileOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mobileOverflowOpen]);

  const mobileOrderedTabs = useMemo(() => {
    const effectiveActive = isBizPage ? "business" : activePage;
    const activeIdx = visibleTabs.findIndex(t => t.key === effectiveActive);
    if (activeIdx < 0 || activeIdx < mobileVisibleCount) return visibleTabs;
    const arr = visibleTabs.slice();
    const [active] = arr.splice(activeIdx, 1);
    arr.splice(Math.max(0, mobileVisibleCount - 1), 0, active);
    return arr;
  }, [visibleTabs, activePage, isBizPage, mobileVisibleCount]);
  const mobileShownTabs = mobileOrderedTabs.slice(0, mobileVisibleCount);
  const mobileOverflowTabs = mobileOrderedTabs.slice(mobileVisibleCount);

  // ── 데스크탑 오버플로 처리 ─────────────────────────
  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const desktopMeasureRef = useRef<HTMLDivElement>(null);
  const desktopOverflowBtnRef = useRef<HTMLDivElement>(null);
  const [desktopVisibleCount, setDesktopVisibleCount] = useState(visibleTabs.length);
  const [desktopOverflowOpen, setDesktopOverflowOpen] = useState(false);

  useLayoutEffect(() => {
    const container = desktopContainerRef.current;
    const measure = desktopMeasureRef.current;
    if (!container || !measure) return;
    const calc = () => {
      const containerW = container.clientWidth;
      if (containerW <= 0) return;
      const btnW = 40;
      const gap = 4;
      const tabEls = measure.querySelectorAll<HTMLElement>("[data-desktop-tab]");
      if (tabEls.length === 0) return;
      let anyMeasured = false;
      for (let i = 0; i < tabEls.length; i++) {
        if (tabEls[i].offsetWidth > 0) { anyMeasured = true; break; }
      }
      if (!anyMeasured) return;
      let totalW = 0;
      for (let i = 0; i < tabEls.length; i++) {
        totalW += tabEls[i].offsetWidth + (i > 0 ? gap : 0);
      }
      if (totalW <= containerW) {
        setDesktopVisibleCount(tabEls.length);
        return;
      }
      const limit = containerW - btnW - gap;
      let used = 0;
      let count = 0;
      for (let i = 0; i < tabEls.length; i++) {
        const w = tabEls[i].offsetWidth + (i > 0 ? gap : 0);
        if (used + w > limit) break;
        used += w;
        count++;
      }
      setDesktopVisibleCount(Math.max(1, count));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(container);
    window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, [visibleTabs]);

  useEffect(() => {
    if (!desktopOverflowOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!desktopOverflowBtnRef.current?.contains(e.target as Node)) setDesktopOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [desktopOverflowOpen]);

  const desktopOrderedTabs = useMemo(() => {
    const effectiveActive = isBizPage ? "business" : activePage;
    const activeIdx = visibleTabs.findIndex(t => t.key === effectiveActive);
    if (activeIdx < 0 || activeIdx < desktopVisibleCount) return visibleTabs;
    const arr = visibleTabs.slice();
    const [active] = arr.splice(activeIdx, 1);
    arr.splice(Math.max(0, desktopVisibleCount - 1), 0, active);
    return arr;
  }, [visibleTabs, activePage, isBizPage, desktopVisibleCount]);
  const desktopShownTabs = desktopOrderedTabs.slice(0, desktopVisibleCount);
  const desktopOverflowTabs = desktopOrderedTabs.slice(desktopVisibleCount);

  // ── 브레드크럼 ─────────────────────────
  const activeSubTab = useActiveSubTab(activePage);
  const breadcrumbItems = useMemo(
    () => buildBreadcrumb(activePage, activeSubTab).map(s => ({
      label: s.label,
      page: s.page,
      subTab: s.subTab,
    })),
    [activePage, activeSubTab],
  );
  const handleBreadcrumbNav = (page: AppNavPage) => {
    if (page === "landing" && onBack) onBack();
    else onNavigate?.(page);
  };

  // ── 슬림 헤더 (사이드바 데스크탑) ─────────────────────────
  if (SIDEBAR_ENABLED && !isMobileNav) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-1 shrink-0 bg-white/60 backdrop-blur-sm border-b border-line/50">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* 2026-09-01 · 사이드바 토글 · 시각 개선 · 명확한 chip 버튼 (기존 60% 투명 → 명확한 bg+border+icon) */}
          <SidebarTrigger
            className="h-9 w-9 rounded-lg text-brand-deep bg-white border border-line hover:bg-brand-tint hover:border-brand-deep/30 hover:shadow-sm active:scale-95 transition-all cursor-pointer shrink-0 [&_svg]:h-4 [&_svg]:w-4"
            aria-label="사이드바 열기/접기"
            title="사이드바 열기·접기 (Cmd/Ctrl+B)"
          />
          <span className="w-px h-5 bg-line/70 shrink-0" aria-hidden />
          <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNav} className="min-w-0" />
        </div>
        <div className="flex items-center gap-2 shrink-0">{rightSlot}</div>
      </div>
    );
  }

  // ── 풀 헤더 (모바일 / 사이드바 미사용) ─────────────────────────
  return (
    <header
      className="relative z-40 border-b border-white/[0.08] shrink-0 shadow-[0_1px_3px_rgba(10,46,74,0.15),0_4px_20px_-4px_rgba(10,46,74,0.20),0_12px_40px_-16px_rgba(10,46,74,0.25)]"
      style={{ background: "linear-gradient(180deg, #0A2E4A 0%, #0D3350 50%, #0F3855 100%)" }}
    >
      {/* aurora radial glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-16 w-[420px] h-[240px] rounded-full opacity-[0.18] blur-3xl" style={{ background: "radial-gradient(closest-side, #5EA9E8, transparent)" }} />
        <div className="absolute -top-24 -right-20 w-[380px] h-[220px] rounded-full opacity-[0.12] blur-3xl" style={{ background: "radial-gradient(closest-side, #6FE3C2, transparent)" }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[160px] rounded-full opacity-[0.08] blur-3xl" style={{ background: "radial-gradient(closest-side, #A5B4FC, transparent)" }} />
      </div>
      {/* noise 패턴 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")` }}
        aria-hidden
      />
      {/* top hairline */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.10) 70%, transparent 100%)" }} />
      {/* bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(94,169,232,0.3) 20%, rgba(94,169,232,0.5) 50%, rgba(94,169,232,0.3) 80%, transparent 100%)" }} />

      {/* ── Row 1 · 로고 + 이름 + 알림 + 로그아웃 ── */}
      <div className="relative px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={onBack ?? (() => onNavigate?.("landing"))}
            className="flex items-center gap-3 sm:gap-4 shrink-0 px-1 py-0.5 cursor-pointer hover:opacity-90 active:opacity-75 transition rounded-lg"
            title="홈으로"
            aria-label="랜딩 페이지로 이동"
          >
            <img
              src={logoImg}
              alt={`${hdrBrand.shortName || "OSAN MEGATOWN"} 로고`}
              className="w-9 h-9 sm:w-10 sm:h-10 object-cover rounded-full ring-2 ring-white/25 shadow-[0_0_20px_rgba(94,169,232,0.25)] shrink-0 transition-all duration-200 group-hover:ring-white/40"
              draggable={false}
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = "/src/images/logo.png"; }
              }}
            />
            <div className="hidden md:flex items-center gap-3">
              <span className="w-px h-7 bg-gradient-to-b from-transparent via-white/25 to-transparent" aria-hidden />
              <div className="flex flex-col gap-0.5 font-bold leading-none select-none">
                <span className="text-white text-[17px] leading-none tracking-[0.05em]">OSAN</span>
                <span className="text-[#93B4D0] text-[13px] leading-none tracking-[0.20em] mt-0.5">MEGATOWN</span>
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {authSession?.employeeName && (
            <button
              type="button"
              onClick={() => onNavigate?.("mypage" as AppNavPage)}
              className="inline-flex items-center text-[13px] sm:text-[14px] font-bold text-white whitespace-nowrap px-2 sm:px-2.5 py-1.5 rounded-lg ring-1 ring-white/10 hover:ring-white/25 hover:bg-white/[0.10] hover:shadow-[0_0_16px_rgba(94,169,232,0.25)] active:scale-95 transition-all duration-150 cursor-pointer max-w-[42vw] sm:max-w-none"
              title="마이페이지"
            >
              <span className="break-words whitespace-normal leading-tight">{authSession.employeeName}{authSession.employeeRank ?? ""}</span>
            </button>
          )}
          <NotificationToggle authSession={authSession} />
          <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} />
          {rightSlot}
          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[13px] font-semibold text-white bg-white/[0.10] hover:bg-white/[0.18] border border-white/15 hover:border-white/30 rounded-lg transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={14} strokeWidth={2.2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[12px] font-semibold bg-white/[0.05] text-white/50 border border-white/10 rounded-lg shrink-0" title="비로그인">
              <Lock size={13} strokeWidth={2.2} />
            </div>
          )}
        </div>
      </div>

      {/* 브레드크럼 */}
      {breadcrumbItems.length > 0 && (
        <div className="relative px-4 sm:px-6 py-1.5 bg-white/[0.96] backdrop-blur-sm border-t border-white/10">
          <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNav} />
        </div>
      )}

      {/* ── Row 2 · Desktop/태블릿 nav tabs ── */}
      <div className="relative hidden sm:block px-4 sm:px-5 md:px-6 pt-1 pb-2 border-t border-white/[0.06]">
        <div ref={desktopContainerRef} className="flex items-center gap-0.5 min-w-0 relative">
          {/* 측정용 hidden 영역 */}
          <div
            ref={desktopMeasureRef}
            aria-hidden="true"
            className="absolute flex items-center gap-0.5 opacity-0 pointer-events-none"
            style={{ left: "-9999px", top: 0 }}
          >
            {visibleTabs.map(t => (
              <div key={`dmeasure-${t.key}`} data-desktop-tab>
                <NavDesktopTab tab={t} activePage={activePage} isBizPage={isBizPage} onNavigate={onNavigate} onBack={onBack} />
              </div>
            ))}
          </div>
          {/* 실제 노출 탭 */}
          {desktopShownTabs.map(t => (
            <NavDesktopTab key={t.key} tab={t} activePage={activePage} isBizPage={isBizPage} onNavigate={onNavigate} onBack={onBack} />
          ))}
          {/* 오버플로 · 삼선 ☰ 드롭다운 */}
          {desktopOverflowTabs.length > 0 && (
            <div ref={desktopOverflowBtnRef} className="relative shrink-0 ml-0.5">
              <button
                type="button"
                onClick={() => setDesktopOverflowOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] font-semibold transition-colors duration-150 active:scale-95 cursor-pointer ${
                  desktopOverflowOpen
                    ? "bg-white/[0.14] text-white"
                    : "text-[#C4DAEE] hover:bg-white/[0.06] hover:text-white"
                }`}
                title={`더보기 (${desktopOverflowTabs.length}개)`}
                aria-label="더보기 메뉴"
                aria-expanded={desktopOverflowOpen}
              >
                <Menu size={16} strokeWidth={2} />
                <span className="text-[14px]">{desktopOverflowTabs.length}</span>
              </button>
              {desktopOverflowOpen && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-2xl ring-1 ring-black/10 border border-zinc-200 py-1.5 min-w-[160px] z-[45] max-h-[70vh] overflow-y-auto">
                  {/* 2026-09-01 · fix · dropdown 흰 배경 · TAB_COLOR_MAP (헤더용 text-white) 대신 · 명시 dark 톤 */}
                  {desktopOverflowTabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = tab.key === "business" ? isBizPage : tab.key === activePage;
                    const onClickTab = () => {
                      setDesktopOverflowOpen(false);
                      if (tab.key === "business") { onNavigate?.("business-manage"); return; }
                      if (tab.key === "landing" && onBack) onBack();
                      else onNavigate?.(tab.key as AppNavPage);
                    };
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={onClickTab}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-[15px] font-semibold transition-all duration-100 rounded-lg mx-1 ${
                          isActive
                            ? "bg-brand-tint text-brand-deep font-bold"
                            : "text-zinc-700 hover:bg-zinc-50 hover:text-brand-deep cursor-pointer"
                        }`}
                        style={{ width: "calc(100% - 8px)" }}
                      >
                        <Icon size={17} weight={isActive ? "fill" : "duotone"} className="shrink-0" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile 전용 탭 행 ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-white/[0.08] border border-white/[0.12] rounded-xl px-2 py-1 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
            {/* 측정용 hidden 영역 */}
            <div
              ref={mobileMeasureRef}
              aria-hidden="true"
              className="absolute flex items-stretch gap-1 opacity-0 pointer-events-none"
              style={{ left: "-9999px", top: 0 }}
            >
              {visibleTabs.map(t => (
                <div key={`measure-${t.key}`} data-mobile-tab>
                  <NavMobileTab tab={t} activePage={activePage} isBizPage={isBizPage} onNavigate={onNavigate} onBack={onBack} />
                </div>
              ))}
            </div>
            {/* 실제 노출 탭 */}
            {mobileShownTabs.map(t => (
              <NavMobileTab key={t.key} tab={t} activePage={activePage} isBizPage={isBizPage} onNavigate={onNavigate} onBack={onBack} />
            ))}
            {/* 오버플로 · 삼선 ☰ 드롭다운 */}
            {mobileOverflowTabs.length > 0 && (
              <div ref={mobileOverflowBtnRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileOverflowOpen(v => !v)}
                  className={`min-w-[44px] h-full flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg text-[12px] font-bold transition-colors active:scale-95 ${
                    mobileOverflowOpen
                      ? "bg-white/[0.18] text-white shadow-sm"
                      : "text-[#C4DAEE] hover:bg-white/[0.10] hover:text-white"
                  }`}
                  title={`더보기 (${mobileOverflowTabs.length}개)`}
                  aria-label="더보기 메뉴"
                  aria-expanded={mobileOverflowOpen}
                >
                  <Menu size={18} strokeWidth={2.4} />
                  <span className="text-[9px]">더보기</span>
                </button>
                {mobileOverflowOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-2xl ring-1 ring-black/10 border border-zinc-200 py-1 min-w-[160px] z-[45] max-h-[70vh] overflow-y-auto">
                    {/* 2026-09-01 · fix · dropdown 흰 배경 · TAB_COLOR_MAP (헤더용 text-white) 대신 · 명시 dark 톤 */}
                    {mobileOverflowTabs.map(tab => {
                      const Icon = tab.icon;
                      const isActive = tab.key === "business" ? isBizPage : tab.key === activePage;
                      const onClickTab = () => {
                        setMobileOverflowOpen(false);
                        if (tab.key === "business") { onNavigate?.("business-manage"); return; }
                        if (tab.key === "landing" && onBack) onBack();
                        else onNavigate?.(tab.key as AppNavPage);
                      };
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={onClickTab}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-bold min-h-[44px] transition ${
                            isActive
                              ? "bg-brand-tint text-brand-deep"
                              : "text-zinc-700 hover:bg-zinc-50 hover:text-brand-deep cursor-pointer"
                          }`}
                        >
                          <Icon size={15} weight="fill" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default AppNavHeader;
