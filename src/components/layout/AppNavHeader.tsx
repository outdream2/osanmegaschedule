// src/components/AppNavHeader.tsx
// 헤더 · 2026-07-19 · 2026-08-03 경영관리 통합 페이지 라우팅
//   - PC: 데스크톱 탭 실측 폭 기반 오버플로 · 넘어가는 탭만 삼선(☰) 드롭다운
//   - 모바일: 균등 분할 · 넘치는 탭 삼선(☰) 드롭다운 처리
//   - 로고 클릭 → 홈(랜딩) 이동
//   - 경영관리 탭 클릭 → business-manage 페이지로 단순 라우팅 (팝오버 제거)
// 2026-08-31 · 분리: NavDesktopTab · NavMobileTab · AppNavHeader.types
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Lock, LogOut, Menu, Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning, User } from "lucide-react";
import type { AuthSession } from "../../types";
import { NotificationBell } from "../NotificationBell";
// 2026-09-14 · #108 · NotificationToggle 제거 (사용자 결정 · 실사용 빈도 낮음)
import logoImg from "../../images/logo2.png";
import { useSidebarEnabled } from "../../hooks/useSidebar";
import { SidebarTrigger } from "../ui/sidebar";
import { Breadcrumb } from "../common/Breadcrumb";
import { buildBreadcrumbFromNav } from "./sideNavGroups";
// 2026-09-27 · 네비게이션 SSOT · useActiveSubTab 훅 · localStorage · CustomEvent → useActiveNav Context
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { SIDE_NAV_GROUPS } from "./sideNavGroups";
// 2026-10-08 · Group Line Tabs 제거 (Sidebar primary nav 와 중복) · filterGroupsForSession/isItemActive/SideNavItem/dispatchLandingAction/useEmploymentStatus import 삭제
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
  // 2026-10-07 · 스케줄 V2 · 신규 workspace (기존 schedule 과 병행 · 평가용)
  | "schedule-v2"
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
  | "system-settings"
  // 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 전환 (VendorStockPage)
  | "vendor-stock"
  // 2026-09-24 · #352 · 거래처 로그인 · 자기 발주이력 확인 페이지 (VendorOrderHistoryPage)
  | "vendor-order-history"
  // 2026-10-12 · #13 · 거래처 그룹 현황판 (방문예약 · 공급사 정보 · 재고확인 · 발주이력 통합)
  | "vendor-overview"
  // 2026-09-04 · 스케줄 설정 (기본연차일 등)
  | "schedule-settings"
  // 2026-09-07 · 발주 설정 (SMTP·이메일)
  | "order-settings"
  // 2026-09-07 · 설정 허브 · 모든 설정 통합 진입점
  | "settings-hub"
  // 2026-10-03 저녁 · Phase 2 · ERP 초기 데이터 구축 (관리자 lv9 · DRY-RUN 전용)
  | "admin-initial-build";
  // 2026-09-02 · #74 · warehouse-zones 제거 (규칙 고정 · 수동 편집 불필요)
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

// 2026-10-08 · 사용자 지시 · 헤더 우측 · 오늘 날짜 + 날씨 + 현재 접속 지역 (geolocation 기반)
//   · Open-Meteo 무료 API (날씨 · 키 불필요) + BigDataCloud reverse-geocode (지역명 · 키 불필요)
//   · WMO weathercode 매핑 · lucide 아이콘 (이모지 금지 원칙)
//   · 권한 거부/실패 시 fallback = 오산 (약국 소재지)
const WEATHER_LAT_FALLBACK = 37.1498; // 오산시 (날씨 fallback 좌표 · 지역 라벨은 미표시)
const WEATHER_LON_FALLBACK = 127.0772;

const WeatherIcon: React.FC<{ code: number; size?: number }> = ({ code, size = 14 }) => {
  const common = { size, strokeWidth: 2 as const };
  if (code === 0) return <Sun {...common} className="text-amber-300" />;
  if (code <= 3) return <CloudSun {...common} className="text-sky-200" />;
  if (code === 45 || code === 48) return <CloudFog {...common} className="text-slate-300" />;
  if (code >= 71 && code <= 77) return <CloudSnow {...common} className="text-sky-100" />;
  if (code >= 95) return <CloudLightning {...common} className="text-violet-300" />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 86)) return <CloudRain {...common} className="text-sky-300" />;
  return <Cloud {...common} className="text-slate-300" />;
};

// 2026-10-08 · 사용자 지시 · 년/월/일/요일 full · 날씨 + 접속 지역 (geolocation)
//   · 포맷: 2026년 10월 8일 (수) · [icon] 맑음 24° · 오산
const weatherLabel = (code: number): string => {
  if (code === 0 || code === 1) return "맑음";
  if (code === 2) return "구름 조금";
  if (code === 3) return "흐림";
  if (code === 45 || code === 48) return "안개";
  if (code >= 51 && code <= 57) return "이슬비";
  if (code >= 61 && code <= 67) return "비";
  if (code >= 71 && code <= 77) return "눈";
  if (code >= 80 && code <= 82) return "소나기";
  if (code >= 85 && code <= 86) return "눈 소나기";
  if (code >= 95) return "뇌우";
  return "";
};
const HeaderDateWeather: React.FC<{ dark?: boolean }> = ({ dark = true }) => {
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  // 2026-10-08 · 사용자 지시 · 위치 허용 안 되면 지역 미표시 (fallback 라벨 제거)
  const [region, setRegion] = useState<string | null>(null);
  const now = new Date();
  const dayNames = ["일","월","화","수","목","금","토"];
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${dayNames[now.getDay()]})`;

  useEffect(() => {
    const fetchWeather = (lat: number, lon: number) => {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=Asia/Seoul`)
        .then(r => r.json())
        .then(d => {
          if (d?.current_weather && typeof d.current_weather.temperature === "number") {
            setWeather({ temp: Math.round(d.current_weather.temperature), code: Number(d.current_weather.weathercode ?? 0) });
          }
        })
        .catch(() => { /* silent · 날씨 미표시 fallback */ });
    };
    const fetchRegion = (lat: number, lon: number) => {
      // BigDataCloud 역지오코딩 · client-side 무료 · 키 불필요
      //   · city > locality > principalSubdivision (예: 오산시 > 오산동 > 경기도)
      //   · 사용자 지시 · "시" 접미어 유지 (예: 오산시 그대로)
      fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`)
        .then(r => r.json())
        .then(d => {
          const raw = d?.city || d?.locality || d?.principalSubdivision;
          if (raw && typeof raw === "string") setRegion(raw);
        })
        .catch(() => { /* silent · fallback 지역 유지 */ });
    };

    const useFallback = () => {
      fetchWeather(WEATHER_LAT_FALLBACK, WEATHER_LON_FALLBACK);
    };

    if (!navigator.geolocation) { useFallback(); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetchWeather(latitude, longitude);
        fetchRegion(latitude, longitude);
      },
      () => useFallback(),
      { timeout: 5000, maximumAge: 10 * 60 * 1000 }
    );
  }, []);
  // 2026-10-08 · 사용자 지시 · 배지(pill) 제거 · 텍스트만
  //   · 레이아웃: 날짜 (한줄) + 날씨아이콘 + 세로스택 [맑음 18°C / 오산시]
  //   · 위치 허용 안 되면 region null · "오산시" 아예 미표시
  const dateCls = dark ? "text-white"    : "text-slate-900";
  const metaCls = dark ? "text-white/70" : "text-slate-500";
  const subCls  = dark ? "text-white/55" : "text-slate-400";
  const tempCls = dark ? "text-white"    : "text-slate-900";
  return (
    <div className="hidden md:inline-flex items-center gap-2.5 whitespace-nowrap">
      <span className={`text-[14px] font-semibold tabular-nums ${dateCls}`}>{dateStr}</span>
      {weather && (
        <div className="inline-flex items-center gap-1.5">
          <WeatherIcon code={weather.code} size={18} />
          <div className="inline-flex flex-col leading-tight">
            <span className={`text-[13px] ${metaCls}`}>
              {weatherLabel(weather.code)}
              <span className={`font-semibold tabular-nums ml-1 ${tempCls}`}>{weather.temp}°C</span>
            </span>
            {region && (
              <span className={`text-[11px] ${subCls}`}>{region}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
  // 2026-09-27 · 네비게이션 SSOT · useActiveNav Context · activeNav 기반 buildBreadcrumbFromNav 정공법
  const { activeNav, setActiveByPage } = useActiveNav();
  const breadcrumbItems = useMemo(
    () => buildBreadcrumbFromNav(activeNav).map(s => ({
      label: s.label,
      page: s.page,
      subTab: s.subTab,
    })),
    [activeNav],
  );
  // 2026-09-27 · Breadcrumb navigate · localStorage / CustomEvent 사이드 채널 제거
  //   · setActiveByPage 로 · activeNav 즉시 갱신 · Header · Sidebar highlight 동시 반영
  //   · 페이지 이동 후 · 해당 페이지 mount 시 · 다시 setActiveByPage 로 최종 정착
  const handleBreadcrumbNav = (page: AppNavPage, subTab?: string) => {
    if (page === "landing" && onBack) onBack();
    else {
      setActiveByPage(page, subTab ?? null);
      onNavigate?.(page);
    }
  };

  // ── 슬림 헤더 (사이드바 데스크탑) · 2026-10-07 Batch 3 ─────────────────────────
  //   - height 52~56px (spec 56~60px · breadcrumb 포함 compact)
  //   - SidebarTrigger · 명확한 chip 제거 · 플랫 icon 버튼 (spec 11)
  //   - shadow 거의 없음 · border-b 중립 · zero behavior delta
  //   - 2026-10-08 · GLOBAL UI 재조정 · Group Line Tabs 로직 제거 (Sidebar primary nav 와 중복)
  //       · navigation hierarchy · Sidebar=Primary · 각 Page의 L2 TabBar=Secondary · SegmentedControl=View · Toolbar=Filter
  //       · 각 페이지가 자체 서브탭 (TabBar level=2)으로 content 상단 Line Tabs 담당
  if (SIDEBAR_ENABLED && !isMobileNav) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 h-14 shrink-0 bg-white border-b border-line sticky top-0 z-40">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <SidebarTrigger
            className="h-9 w-9 rounded-lg text-ink-soft hover:bg-zinc-100 hover:text-ink transition-colors cursor-pointer shrink-0 [&_svg]:h-4 [&_svg]:w-4"
            aria-label="사이드바 열기/접기"
            title="사이드바 열기·접기 (Cmd/Ctrl+B)"
          />
          <span className="w-px h-4 bg-zinc-200 shrink-0" aria-hidden />
          <Breadcrumb items={breadcrumbItems} onNavigate={handleBreadcrumbNav} className="min-w-0" />
        </div>
        {/* 2026-10-08 · 사용자 지시 · slim 헤더에도 날짜/날씨 → 알림 → 아바타 → 로그아웃 (full 헤더와 동일 순서) */}
        <div className="flex items-center gap-2 shrink-0">
          <HeaderDateWeather dark={false} />
          <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} />
          {authSession?.employeeName && (
            <button
              type="button"
              onClick={() => onNavigate?.("mypage" as AppNavPage)}
              // 2026-10-08 · 사용자 지시 · 최신 트렌드 ghost · 아이콘 20px (slim/light 톤)
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
              title={`${authSession.employeeName}${authSession.employeeRank ?? ""} · 마이페이지`}
              aria-label={`${authSession.employeeName}${authSession.employeeRank ?? ""} 마이페이지`}
            >
              <User size={20} strokeWidth={2} />
            </button>
          )}
          {rightSlot}
          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[14px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={16} strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[14px] font-medium bg-slate-50 text-slate-400 rounded-lg shrink-0" title="비로그인">
              <Lock size={15} strokeWidth={2} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── 풀 헤더 (모바일 / 사이드바 미사용) · 2026-10-07 Batch 3 ─────────────────────────
  //   - aurora radial glow + noise + triple shadow + hairline gradients 제거
  //   - 단일 solid deep-navy bg + 얇은 bottom border 만 유지
  //   - zero behavior delta (nav/breadcrumb/overflow/handlers unchanged)
  return (
    <header
      className="sticky top-0 z-40 border-b border-white/[0.08] shrink-0"
      style={{ background: "#0A2E4A" }}
    >

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
              className="w-8 h-8 sm:w-9 sm:h-9 object-cover rounded-full ring-1 ring-white/15 shrink-0 transition-all duration-200 group-hover:ring-white/30"
              draggable={false}
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = "/src/images/logo.png"; }
              }}
            />
            <div className="hidden md:flex items-center gap-2.5">
              <span className="w-px h-5 bg-white/15" aria-hidden />
              <div className="flex flex-col gap-0.5 font-semibold leading-none select-none">
                <span className="text-white text-[14px] leading-none tracking-[0.03em]">OSAN</span>
                <span className="text-[#93B4D0] text-[12px] leading-none tracking-[0.15em] mt-0.5">MEGATOWN</span>
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center h-9 gap-1 sm:gap-1.5 shrink-0">
          {/* 2026-10-08 · 사용자 지시 · 우측 끝 순서 · 날짜·날씨·지역 → 알림 → 로그인 정보 → 로그아웃 */}
          <HeaderDateWeather dark />
          {/* 2026-09-14 · #108 · NotificationToggle 제거 · Bell 만 유지 */}
          <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} />
          {authSession?.employeeName && (
            <button
              type="button"
              onClick={() => onNavigate?.("mypage" as AppNavPage)}
              // 2026-10-08 · 사용자 지시 · visible chrome · 알림종과 통일 톤 (dark bg용)
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.1] hover:bg-white/[0.16] ring-1 ring-white/15 text-white transition-colors cursor-pointer shrink-0"
              title={`${authSession.employeeName}${authSession.employeeRank ?? ""} · 마이페이지`}
              aria-label={`${authSession.employeeName}${authSession.employeeRank ?? ""} 마이페이지`}
            >
              <User size={20} strokeWidth={2} />
            </button>
          )}
          {rightSlot}
          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              // 2026-10-08 · 사용자 피드백 · 상단 링크 폰트 확대 (13→15)
              className="flex items-center gap-1.5 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[15px] font-medium text-white/85 hover:bg-white/[0.08] hover:text-white rounded-lg transition-colors cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={16} strokeWidth={2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 text-[15px] font-medium bg-white/[0.04] text-white/50 rounded-lg shrink-0" title="비로그인">
              <Lock size={15} strokeWidth={2} />
            </div>
          )}
        </div>
      </div>

      {/* 브레드크럼 · 2026-10-08 · spacing 균등 (py-1.5→py-2 상하 동일) · height ~40-44 */}
      {breadcrumbItems.length > 0 && (
        <div className="relative px-4 sm:px-6 py-2 bg-white border-t border-white/10">
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
          {/* 오버플로 · 삼선 ☰ 드롭다운 · 2026-10-08 · amber → neutral (더보기는 inactive tone) */}
          {desktopOverflowTabs.length > 0 && (
            <div ref={desktopOverflowBtnRef} className="relative shrink-0 ml-0.5">
              <button
                type="button"
                onClick={() => setDesktopOverflowOpen(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[14px] font-medium transition-colors duration-150 cursor-pointer ${
                  desktopOverflowOpen
                    ? "bg-white/[0.12] text-white"
                    : "text-[#9FBAD4] hover:bg-white/[0.06] hover:text-white"
                }`}
                title={`더보기 (${desktopOverflowTabs.length}개)`}
                aria-label="더보기 메뉴"
                aria-expanded={desktopOverflowOpen}
              >
                <Menu size={14} strokeWidth={2} />
                <span className="text-[12px] font-semibold tabular-nums bg-white/[0.14] rounded-full px-1.5 leading-none py-0.5">{desktopOverflowTabs.length}</span>
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

      {/* ── Mobile 전용 탭 행 · 2026-10-08 · spacing symmetric (pb-2→py-2 · container py-1→py-1.5) · 상/하 균등 ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 py-2">
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-white/[0.08] border border-white/[0.12] rounded-xl px-2 py-1.5 relative shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm">
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
            {/* 오버플로 · 삼선 ☰ 드롭다운 · 2026-10-08 · amber → neutral (더보기는 inactive tone) */}
            {mobileOverflowTabs.length > 0 && (
              <div ref={mobileOverflowBtnRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileOverflowOpen(v => !v)}
                  className={`min-w-[44px] h-full flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg text-[12px] font-medium transition-colors ${
                    mobileOverflowOpen
                      ? "bg-white/[0.14] text-white"
                      : "text-[#9FBAD4] hover:bg-white/[0.08] hover:text-white"
                  }`}
                  title={`더보기 (${mobileOverflowTabs.length}개)`}
                  aria-label="더보기 메뉴"
                  aria-expanded={mobileOverflowOpen}
                >
                  <Menu size={16} strokeWidth={2} />
                  <span className="leading-tight">더보기</span>
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
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-[15px] font-bold min-h-[44px] transition ${
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
