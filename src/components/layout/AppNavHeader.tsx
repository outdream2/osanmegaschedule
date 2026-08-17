// src/components/AppNavHeader.tsx
// 헤더 · 2026-07-19 · 2026-08-03 경영관리 통합 페이지 라우팅
//   - PC: 데스크톱 탭 실측 폭 기반 오버플로 · 넘어가는 탭만 삼선(☰) 드롭다운
//   - 모바일: 균등 분할 · 넘치는 탭 삼선(☰) 드롭다운 처리
//   - 로고 클릭 → 홈(랜딩) 이동
//   - 경영관리 탭 클릭 → business-manage 페이지로 단순 라우팅 (팝오버 제거)
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Lock, LogOut, Menu } from "lucide-react";
import type { AuthSession } from "../../types";
import { NotificationBell } from "../NotificationBell";
import { NotificationToggle } from "../NotificationToggle";
// 2026-08-17 · 사용자 지시 · 반응형 헤더 · logo2 (사이드바와 통일)
import logoImg from "../../images/logo2.png";
// 2026-08-11 · 사이드바 V2 · flag ON 시 슬림 헤더로 대체
// 2026-08-16 · env → 서버 KV 설정 훅으로 이관
import { useSidebarEnabled } from "../../hooks/useSidebar";
// 2026-08-16 · 페이지 hidden · 공통헤더에서도 필터
import { usePagePermissions } from "../../hooks/usePagePermissions";
import { SIDE_NAV_GROUPS } from "./sideNavGroups";
// 2026-08-12 · PC 사이드바 접기 · 헤더에 토글 버튼 노출
import { SidebarTrigger } from "../ui/sidebar";
import { useIsMobile } from "../../hooks/use-mobile";
// 2026-08-12 · 프레임워크 · logo alt 만 brand.shortName 반영 (하드코딩 fallback 유지)
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
// 2026-08-12 · #62 · 공통헤더 TABS 를 SIDE_NAV_GROUPS 로부터 파생 (단일 소스 · B 방식)
import { DERIVED_TOP_TABS, type DerivedTopTab, type SideNavColor, NAV_ACCENT, headerAccentGradient } from "./sideNavGroups";

export type AppNavPage =
  | "landing"
  | "schedule"
  | "display"
  | "requests"
  | "leave"
  | "reservation"          // 예약 페이지 · 랜딩 카드에서 접근 · 헤더 탭 노출 없음
  | "scan"                 // 헤더 탭에서는 제거되었으나 라우팅용 union 유지 · 랜딩 카드·매입 서브탭·설정 등에서 접근
  | "productarrival"       // 헤더 탭에서는 제거되었으나 라우팅용 union 유지 · 랜딩 카드·매입 서브탭 등에서 접근
  | "ocr"                  // 헤더 탭에서는 제거되었으나 라우팅용 union 유지 · 매입 사입 서브탭에서 접근
  | "lunch"
  | "permissions"
  | "stockarrivals"
  | "stockcheck"
  | "board"
  | "mypage"
  | "zone-labels"          // 2026-08-03 · 구역 라벨 관리 (설정 링크에서 접근 · 헤더 탭 노출 없음 · 라우팅 union 유지)
  | "business-manage"      // 2026-08-03 · 경영관리 통합 페이지
  | "hr-forms"             // 2026-08-03 · 각종 양식 (경영관리 서브탭 · 별도 라우팅 union 유지)
  | "pharmacist"           // 2026-08-03 · 약사 전용 페이지
  | "approval-request"     // 2026-08-12 · 승인요청 통합 페이지 (연차·점심불참·서류작성 서브탭)
  | "branding"             // 2026-08-12 · Phase 5 · 브랜딩/연락처/도장/모바일 가시성 통합 설정 페이지
  | "company-info"         // 2026-08-12 · 회사정보 설정 페이지 (약국명·대표·사업자·주소·전화)
  | "season-settings"      // 2026-08-12 · 계절 정의 설정 페이지 (MyPage 에서 이동)
  | "system-settings";     // 2026-08-12 · 시스템 설정 페이지 (env 편집 · 재시작 반영)

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

interface TabDef {
  key: TabKey;
  label: string;
  mobileLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; weight?: any }>;
  managerOnly: boolean;
  pharmacistOnly?: boolean;   // 2026-08-03 · 약사만 노출 (position === '약사' or role 'pharmacist')
  iconClassName?: string;
  color?: "slate" | "blue" | "red" | "sky" | "indigo" | "orange" | "emerald" | "violet" | "amber" | "cyan";
}

// 2026-08-12 · #62 · TABS = SIDE_NAV_GROUPS 로부터 자동 파생 (단일 소스 · sideNavGroups.ts)
// (이전: 하드코딩 배열 · 사이드바 그룹 정의와 이중 관리 → 파생으로 통일)
//   · 순서 · 라벨 · 색상 · 아이콘 모두 group 정의 그대로 (회귀 없음)
//   · business 특수 키 · 헤더 내부에서 business-manage 로 라우팅 유지
//   · 계정 그룹은 topTab.hideInTopTabs=true 로 헤더 제외
const TABS: TabDef[] = DERIVED_TOP_TABS.map((t: DerivedTopTab): TabDef => ({
  key: t.key as TabKey,
  label: t.label,
  mobileLabel: t.mobileLabel,
  icon: t.icon,
  managerOnly: t.managerOnly,
  pharmacistOnly: t.pharmacistOnly,
  // SideNavColor ⊂ TabDef.color · cast 안전 (slate/amber/red/sky/indigo/emerald/violet/cyan 모두 커버)
  color: t.color as SideNavColor & TabDef["color"],
}));

// 2026-08-06 · 랜딩 파스텔 톤 통일 · 활성 탭: 파스텔 배경 + 진한 텍스트 + border (흰 배경+진한gradient 제거)
// 2026-08-17 · 사용자 지시 · 헤더 제목 색깔 조금만 진하게 · inactive 500→600 · active 700→800
// 2026-08-17 · 사용자 지시 · 반응형 · 메인 헤더 딥네이비 배경 · 모바일 tab bar 통일
//   · 활성 · 반투명 흰 pill (bg-white/[0.14]) · text-white · shadow-sm
//   · 비활성 · text-[#C4DAEE] (light blue) · hover text-white
//   · 카테고리 identity · 아이콘 색만 살짝 유지 (renderMobileTab 에서 icon)
const TAB_COLOR_MAP: Record<string, { activeBg: string; activeText: string; inactiveText: string; inactiveHoverText: string; }> = {
  slate:   { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  blue:    { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  red:     { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  sky:     { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  indigo:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  orange:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  emerald: { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  violet:  { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  amber:   { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
  cyan:    { activeBg: "bg-white/[0.14] border border-white/20 shadow-sm", activeText: "text-white", inactiveText: "text-[#C4DAEE]", inactiveHoverText: "hover:text-white" },
};

// 경영관리 탭이 활성인 페이지들 (통합 페이지 + 서브 페이지들 · 헤더 활성 표시용)
// business-manage 는 통합 페이지 · permissions/hr-forms 는 랜딩페이지에서 직접 이동 시 활성 표시
// 2026-08-12 · leave / lunch 는 승인요청 통합 페이지 (approval-request) 로 이관 · BUSINESS_PAGES 에서 제외
const BUSINESS_PAGES = new Set<AppNavPage>(["business-manage", "permissions", "hr-forms"]);

export const AppNavHeader: React.FC<AppNavHeaderProps> = ({
  activePage,
  authSession,
  onBack,
  onNavigate,
  onLogout,
  rightSlot,
}) => {
  // 2026-08-11 · 사이드바 V2 · 데스크탑만 슬림 헤더 · 훅 rules 준수 위해 조건 return 은 모든 훅 이후로 이동
  const isMobileNav = useIsMobile();
  const SIDEBAR_ENABLED = useSidebarEnabled(); // 2026-08-16 · 로컬 상수 유지 · body 로직 변경 최소
  // 2026-08-12 · 프레임워크 · logo alt 만 반영
  const { brand: hdrBrand } = useBrandIdentity();
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isPrivileged = userLevel >= 2;

  // 2026-08-03 · 경영관리 팝오버 제거 (business-manage 통합 페이지로 라우팅)

  // 약사 판정 · level ≥ 3 · 사용자 확정 (2026-08-03)
  const isPharmacist = useMemo(() => {
    if (!authSession) return false;
    return (authSession.level ?? 0) >= 3;
  }, [authSession]);

  // 2026-08-10 · #22 · 거래처 로그인 (role='vendor') · [홈] 만 노출 · 스케줄·이슈·요청·기타 숨김
  const isVendor = authSession?.role === "vendor";
  // 2026-08-16 · 페이지 hidden · 공통헤더에서도 반영 (lv 9 관리자는 예외 · 설정 접근용)
  const { perms } = usePagePermissions();
  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (isVendor) return false;  // 거래처 로그인 시 홈 외 모든 탭 숨김
    if (t.managerOnly) return isPrivileged;
    if (t.pharmacistOnly) return isPharmacist;
    // 2026-08-16 · 그룹 내 · perms 기반 hidden 필터 · 모든 item hidden 이면 top tab 숨김
    if (userLevel < 9 && perms) {
      const group = SIDE_NAV_GROUPS.find(g => (g.topTab?.key ?? g.items[0]?.key) === t.key);
      if (group) {
        const allHidden = group.items.length > 0 && group.items.every(it => {
          const compositeKey = it.subTab ? `${it.key}:${it.subTab}` : it.key;
          const perm = (perms as any)[compositeKey] ?? (perms as any)[it.key];
          return perm?.hidden === true;
        });
        if (allHidden) return false;
      }
    }
    return true;
  }), [authSession, isPrivileged, isPharmacist, isVendor, perms, userLevel]);

  // 경영관리 하위 페이지 활성 여부 (연차승인·점심불참·권한관리)
  const isBizPage = BUSINESS_PAGES.has(activePage);

  // ── 모바일 오버플로 처리 (2026-07-15) ─────────────────────────
  //   실측 폭 기반: 컨테이너에 못 들어가는 탭은 삼선 ☰ 드롭다운으로 이동
  //   활성 탭은 항상 노출 (오버플로 되어도 앞으로 당김)
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
      const btnW = 52; // ☰ 버튼 여유 (오버플로 있을 때만 사용)
      const tabEls = measure.querySelectorAll<HTMLElement>("[data-mobile-tab]");
      let used = 0;
      let count = 0;
      const gap = 4; // gap-1
      const padding = 16; // px-2 좌우
      const avail = containerW - padding;
      // 순차 누적 · 다음 탭 못 들어가면 stop (☰ 버튼 자리 확보)
      for (let i = 0; i < tabEls.length; i++) {
        const w = tabEls[i].offsetWidth + (i > 0 ? gap : 0);
        // 남은 탭이 하나 이상이면 ☰ 자리 필요
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

  // 활성 탭이 오버플로 영역이면 앞으로 당김 (사용자가 현재 위치 볼 수 있도록)
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

  // 2026-07-30 · 사용자 재요청 · 데스크탑 오버플로 시 삼선 (☰) 드롭다운 복원 (flex-wrap 폐기)
  //   실측 폭 기반: 컨테이너에 못 들어가는 탭은 삼선 ☰ 드롭다운으로 이동 · 넓으면 다 노출
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
      // 1-pass · 버튼 예약 없이 전부 맞는지 확인
      let totalW = 0;
      for (let i = 0; i < tabEls.length; i++) {
        totalW += tabEls[i].offsetWidth + (i > 0 ? gap : 0);
      }
      if (totalW <= containerW) {
        setDesktopVisibleCount(tabEls.length);
        return;
      }
      // 2-pass · ☰ 공간 확보 후 재계산
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

  // 활성 탭이 오버플로 영역이면 앞으로 당김 (사용자가 현재 위치 볼 수 있도록)
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

  // 2026-08-11 · PC 데스크탑 탭 · Linear/Vercel SaaS 스타일 리디자인
  //   - 활성: 하단 accent underline + 탭 색상 텍스트 + 살짝 tinted 배경
  //   - 비활성: 텍스트만 · hover 시 subtle 배경 + 색상 전환
  //   - 모바일 코드(renderMobileTab) 미변경
  const renderDesktopTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];

    // 2026-08-17 · 세련 · 공통헤더 ↔ 사이드바 연동 (NAV_ACCENT 단일 소스 · sideNavGroups.ts)
    //   · 활성 · glass pill + 그룹 색 아이콘 + 하단 gradient accent bar + subtle glow
    //   · SideNav 좌측 accent bar 와 동일 hex 참조 → drift 방지
    const colorKey = (tab.color ?? "slate") as SideNavColor;
    const validColor: SideNavColor = (["slate","amber","red","sky","indigo","emerald","violet","cyan"] as SideNavColor[]).includes(colorKey) ? colorKey : "slate";
    const accent = NAV_ACCENT[validColor];
    const accentGradient = headerAccentGradient(validColor);
    const iconAccent = accent.iconText;
    const activeGlow = accent.glow;

    // 2026-08-17 · 딥네이비 배경 · 폰트 +2 유지
    const baseCommon = "relative flex items-center gap-1.5 px-3 sm:px-3 md:px-3.5 lg:px-4 py-1.5 rounded-lg text-[19px] sm:text-[19px] md:text-[20px] lg:text-[21px] font-semibold whitespace-nowrap transition-all duration-150";

    // active · 흰 반투명 pill + 흰 텍스트 + gradient accent bar (하단)
    // Attio/Linear · frosted pill · white/12 bg + inset highlight 만 (border 제거 · 노이즈 감소 · 세련)
    const activeClass = `${baseCommon} bg-white/[0.12] text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`;
    // inactive · 라이트 블루 텍스트 + hover subtle
    const inactiveClass = `${baseCommon} text-[#C4DAEE] hover:bg-white/[0.06] hover:text-white active:scale-95 cursor-pointer disabled:opacity-40`;

    // 경영관리 탭 · business-manage 통합 페이지로 단순 라우팅 (2026-08-03)
    if (tab.key === "business") {
      const isActive = isBizPage;
      const bizOnClick = () => onNavigate?.("business-manage");
      if (isActive) {
        return (
          <span key="business" className={activeClass}>
            <Icon size={20} weight="fill" className={`shrink-0 ${iconAccent}`} style={{ filter: `drop-shadow(0 0 6px ${accent.hex}80)` }} />
            <span>{tab.label}</span>
            {/* 2026-08-17 · 사용자 요청 · 색 accent 부활 · solid color stripe (3px · 그룹 톤 + subtle glow) */}
          <span
            className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-[85%] h-[3px] rounded-full pointer-events-none"
            style={{ backgroundColor: accent.hex, boxShadow: `0 0 10px ${accent.hex}90` }}
          />
          </span>
        );
      }
      return (
        <button
          key="business"
          type="button"
          onClick={bizOnClick}
          disabled={!onNavigate}
          className={inactiveClass}
        >
          <Icon size={20} weight="duotone" className="shrink-0 opacity-70" />
          <span>{tab.label}</span>
        </button>
      );
    }

    const isActive = tab.key === activePage;
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
    if (isActive) {
      return (
        <span key={tab.key} className={activeClass}>
          <Icon size={20} weight="fill" className={`shrink-0 ${iconAccent}`} style={{ filter: `drop-shadow(0 0 6px ${accent.hex}80)` }} />
          <span>{tab.label}</span>
          {/* 2026-08-17 · 사용자 요청 · 색 accent 부활 · solid color stripe (3px · 그룹 톤 + subtle glow) */}
          <span
            className="absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-[85%] h-[3px] rounded-full pointer-events-none"
            style={{ backgroundColor: accent.hex, boxShadow: `0 0 10px ${accent.hex}90` }}
          />
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={inactiveClass}
      >
        <Icon size={20} weight="duotone" className="shrink-0 opacity-70" />
        <span>{tab.label}</span>
      </button>
    );
  };

  const renderMobileTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    // 2026-08-10 · 하단 모바일 탭 · +2 (10→12)
    const base = "flex-1 min-w-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[12px] font-bold transition-all active:scale-95";

    // 경영관리 탭 (모바일) · business-manage 단순 라우팅 (2026-08-03)
    if (tab.key === "business") {
      const isActive = isBizPage;
      const bizOnClick = () => onNavigate?.("business-manage");
      if (isActive) {
        return (
          <span key="business" className={`${base} ${c.activeBg} ${c.activeText} shadow-sm font-bold`}>
            <Icon size={26} weight="fill" />
            <span className="leading-tight text-center whitespace-nowrap">경영</span>
          </span>
        );
      }
      return (
        <button
          key="business"
          type="button"
          onClick={bizOnClick}
          disabled={!onNavigate}
          className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/[0.10] cursor-pointer disabled:opacity-40`}
        >
          <Icon size={26} weight="fill" />
          <span className="leading-tight text-center">경영</span>
        </button>
      );
    }

    const isActive = tab.key === activePage;
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} ${c.activeBg} ${c.activeText} shadow-sm font-bold`}>
          <Icon size={26} weight="fill" />
          <span className="leading-tight text-center">
            {(() => {
              const L = tab.label;
              const isAllAscii = /^[\x20-\x7e]+$/.test(L);
              if (L.length >= 4 && !isAllAscii) {
                const custom: Record<string, [string, string]> = {
                  "거래명세서": ["거래", "명세서"],
                  "스케줄관리": ["스케줄", "관리"],
                };
                if (custom[L]) return <><div>{custom[L][0]}</div><div>{custom[L][1]}</div></>;
                const half = L.length === 5 ? 2 : Math.ceil(L.length / 2);
                return <><div>{L.slice(0, half)}</div><div>{L.slice(half)}</div></>;
              }
              return L;
            })()}
          </span>
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/[0.10] cursor-pointer disabled:opacity-40`}
      >
        <Icon size={26} weight="fill" />
        <span className="leading-tight text-center whitespace-nowrap">
          {/* 2026-08-04 · 3자 이하는 한줄 · 4자 이상만 wrap (스케줄 등 3자 줄바꿈 방지) */}
          {tab.label.length > 3 ? (
            <>
              <div>{tab.label.slice(0, tab.label.length - 2)}</div>
              <div>{tab.label.slice(-2)}</div>
            </>
          ) : tab.label}
        </span>
      </button>
    );
  };

  // 2026-08-11 · 사이드바 V2 · 데스크탑에서는 헤더 최소화
  // 2026-08-12 · 사이드바 접기 토글 (SidebarTrigger) · 사이드바 내부 (약국이름 옆) 로 이동
  //   · 사이드바 접힌 상태(icon)에서만 · 여기서 펼치기 트리거 노출 (사이드바에는 숨김 처리됨)
  if (SIDEBAR_ENABLED && !isMobileNav) {
    return (
      <div className="flex items-center justify-between px-3 py-1 shrink-0 bg-white/60 backdrop-blur-sm border-b border-line/50">
        {/* 접힘 상태 · 펼치기 트리거 · 사이드바 안 트리거는 숨겨지므로 · 대체 트리거 */}
        <SidebarTrigger
          className="h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition cursor-pointer group-has-[[data-state=expanded]]/sidebar-wrapper:hidden"
          aria-label="사이드바 펼치기"
        />
        <div className="flex items-center gap-2 ml-auto">{rightSlot}</div>
      </div>
    );
  }

  return (
    // 2026-08-17 · 최신 트렌드 v2 · Linear/Vercel/Attio SaaS · 세련 · 초고해상도 · 부드러움
    //   · gradient · 딥네이비 → 살짝 밝은 네이비 (subtle depth · 3-stop)
    //   · aurora radial · 좌측 상단 sky glow + 우측 상단 warm glow (매우 저채도 · 브랜드 identity)
    //   · shadow · 3-layer (즉시/중거리/원거리 · GPU 가속)
    //   · top hairline · white/6 (subtle inner light · glass 효과 시작점)
    //   · bottom hairline · mint accent (기존 유지)
    <header
      className="relative border-b border-white/[0.08] shrink-0 shadow-[0_1px_3px_rgba(10,46,74,0.15),0_4px_20px_-4px_rgba(10,46,74,0.20),0_12px_40px_-16px_rgba(10,46,74,0.25)]"
      style={{ background: "linear-gradient(180deg, #0A2E4A 0%, #0D3350 50%, #0F3855 100%)" }}
    >
      {/* 2026-08-17 · aurora radial glow · 좌상단 sky (#5EA9E8) · 우상단 mint (#6FE3C2) · 매우 저채도 · 브랜드 signature */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-16 w-[420px] h-[240px] rounded-full opacity-[0.16] blur-3xl" style={{ background: "radial-gradient(closest-side, #5EA9E8, transparent)" }} />
        <div className="absolute -top-24 -right-20 w-[380px] h-[220px] rounded-full opacity-[0.10] blur-3xl" style={{ background: "radial-gradient(closest-side, #6FE3C2, transparent)" }} />
      </div>
      {/* top hairline · inner light · glass 효과 시작점 · 세련 */}
      <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.10) 70%, transparent 100%)" }} />
      {/* bottom hairline · mint accent · 은은한 브랜드 시그니처 */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(94,169,232,0.3) 20%, rgba(94,169,232,0.5) 50%, rgba(94,169,232,0.3) 80%, transparent 100%)" }} />

      {/* ── Row 1 · 로고 + 서비스명 · 이름 · 알림 · 로그아웃 ── */}
      <div className="relative px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: logo (클릭 시 랜딩 이동) · logo2 · 라운드 · ring-white/20 */}
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={onBack ?? (() => onNavigate?.("landing"))}
            className="flex items-center gap-3 sm:gap-4 shrink-0 px-1 py-0.5 cursor-pointer hover:opacity-90 active:opacity-75 transition rounded-lg"
            title="홈으로"
            aria-label="랜딩 페이지로 이동"
          >
            {/* 2026-08-17 · 로고 · ring-2 · gradient border · subtle glow (브랜드 identity) */}
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
            {/* 2026-08-17 · PC (md+) · 서비스명 · subtle divider (좌측 hairline) · 타이포 개선 */}
            <div className="hidden md:flex items-center gap-3">
              <span className="w-px h-7 bg-gradient-to-b from-transparent via-white/25 to-transparent" aria-hidden />
              <div className="flex flex-col gap-0.5 font-bold leading-none select-none">
                <span className="text-white text-[17px] leading-none tracking-[0.05em]">OSAN</span>
                <span className="text-[#93B4D0] text-[13px] leading-none tracking-[0.20em] mt-0.5">MEGATOWN</span>
              </div>
            </div>
          </button>
        </div>

        {/* Right: 로그인 이름 + rightSlot + logout · deep navy 톤 · 흰 텍스트 · 반투명 hover */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* 2026-08-17 · 사용자 name chip · subtle ring · hover glow · 세련 */}
          {authSession?.employeeName && (
            <button
              type="button"
              onClick={() => onNavigate?.("mypage" as AppNavPage)}
              className="inline-flex items-center text-[13px] sm:text-[14px] font-bold text-white whitespace-nowrap px-2 sm:px-2.5 py-1.5 rounded-lg ring-1 ring-white/10 hover:ring-white/25 hover:bg-white/[0.10] hover:shadow-[0_0_16px_rgba(94,169,232,0.25)] active:scale-95 transition-all duration-150 cursor-pointer max-w-[42vw] sm:max-w-none"
              title="마이페이지"
            >
              <span className="truncate">{authSession.employeeName}{authSession.employeeRank ?? ""}</span>
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

      {/* ── Row 2 · Desktop/태블릿 nav tabs · 딥네이비 · Row 1 gradient 연장 ── */}
      <div className="relative hidden sm:block px-4 sm:px-5 md:px-6 pt-1 pb-2 border-t border-white/[0.06]">
        <div ref={desktopContainerRef} className="flex items-center gap-0.5 min-w-0 relative">
          {/* 측정용 hidden 영역 · 실제 탭 폭 계산 */}
          <div
            ref={desktopMeasureRef}
            aria-hidden="true"
            className="absolute flex items-center gap-0.5 opacity-0 pointer-events-none"
            style={{ left: "-9999px", top: 0 }}
          >
            {visibleTabs.map(t => (
              <div key={`dmeasure-${t.key}`} data-desktop-tab>{renderDesktopTab(t)}</div>
            ))}
          </div>
          {/* 실제 노출 탭 */}
          {desktopShownTabs.map(renderDesktopTab)}
          {/* 오버플로 · 삼선 ☰ 드롭다운 · fallback (매우 좁은 화면) */}
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
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] border border-zinc-100 py-1.5 min-w-[160px] z-50 max-h-[70vh] overflow-y-auto">
                  {desktopOverflowTabs.map(tab => {
                    const Icon = tab.icon;
                    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
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
                            ? `${c.activeBg} ${c.activeText} font-bold`
                            : `${c.inactiveText} hover:bg-zinc-50 hover:${c.inactiveHoverText.replace("hover:", "")} cursor-pointer`
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

      {/* ── Mobile 전용 탭 행: 태블릿·PC 는 상단 탭 사용 (2026-07-16) ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-white/[0.06] border border-white/10 rounded-xl px-2 py-1 relative">
            {/* 측정용 hidden 영역 · 실제 탭 폭 계산 */}
            <div
              ref={mobileMeasureRef}
              aria-hidden="true"
              className="absolute flex items-stretch gap-1 opacity-0 pointer-events-none"
              style={{ left: "-9999px", top: 0 }}
            >
              {visibleTabs.map(t => (
                <div key={`measure-${t.key}`} data-mobile-tab>{renderMobileTab(t)}</div>
              ))}
            </div>
            {/* 실제 노출 탭 */}
            {mobileShownTabs.map(renderMobileTab)}
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
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-line py-1 min-w-[160px] z-50 max-h-[70vh] overflow-y-auto">
                    {mobileOverflowTabs.map(tab => {
                      const Icon = tab.icon;
                      const c = TAB_COLOR_MAP[tab.color ?? "slate"];
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
                              ? `${c.activeBg} ${c.activeText}`
                              : `${c.inactiveText} hover:bg-zinc-50 cursor-pointer`
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
