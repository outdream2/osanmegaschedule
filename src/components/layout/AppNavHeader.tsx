// src/components/AppNavHeader.tsx
// 헤더 · 2026-07-19 · 2026-08-03 경영관리 통합 페이지 라우팅
//   - PC: 데스크톱 탭 실측 폭 기반 오버플로 · 넘어가는 탭만 삼선(☰) 드롭다운
//   - 모바일: 균등 분할 · 넘치는 탭 삼선(☰) 드롭다운 처리
//   - 로고 클릭 → 홈(랜딩) 이동
//   - 경영관리 탭 클릭 → business-manage 페이지로 단순 라우팅 (팝오버 제거)
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Lock, LogOut, Menu } from "lucide-react";
import {
  House,
  SquaresFour,
  Calendar,
  ChatCircle,
  Chat,
  Briefcase,
  FirstAid,
} from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import { NotificationBell } from "../NotificationBell";
import { NotificationToggle } from "../NotificationToggle";
import logoImg from "../../images/logo.png";
// 2026-08-11 · 사이드바 V2 · flag ON 시 슬림 헤더로 대체
import { SIDEBAR_ENABLED } from "../../hooks/useSidebar";
import { useIsMobile } from "../../hooks/use-mobile";

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
  | "pharmacist";          // 2026-08-03 · 약사 전용 페이지

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

// 2026-08-10 · 사용자 요청 · 순서: 홈 → 스케줄 → 매장 → 경영 → 약사 → 이슈 → 요청
// (기존: 홈 → 매장 → 경영 → 약사 → 스케줄 → 이슈 → 요청 · 무지개 순서 폐기)
// 2026-08-03: 경영관리 → business-manage 통합 페이지로 단순 라우팅 (팝오버 제거)
// 2026-08-03: scan · productarrival · ocr 탭 제거 (매장관리 매입 서브탭 및 랜딩 카드에서 접근 · union 유지)
const TABS: TabDef[] = [
  { key: "landing",       label: "홈",       mobileLabel: "홈",     icon: House,       managerOnly: false, color: "slate"   },
  { key: "schedule",      label: "스케줄",   mobileLabel: "스케줄", icon: Calendar,    managerOnly: false, color: "amber"   },
  { key: "display",       label: "매장",     mobileLabel: "매장",   icon: SquaresFour, managerOnly: true,  color: "red"     },
  { key: "business",      label: "경영",     mobileLabel: "경영",   icon: Briefcase,   managerOnly: true,  color: "violet"  },
  { key: "pharmacist",    label: "약사",     mobileLabel: "약사",   icon: FirstAid,    managerOnly: false, pharmacistOnly: true, color: "sky" },
  { key: "board",         label: "이슈",     mobileLabel: "이슈",   icon: ChatCircle,  managerOnly: false, color: "emerald" },
  { key: "requests",      label: "요청",     mobileLabel: "요청",   icon: Chat,        managerOnly: false, color: "cyan"    },
];

// 2026-08-06 · 랜딩 파스텔 톤 통일 · 활성 탭: 파스텔 배경 + 진한 텍스트 + border (흰 배경+진한gradient 제거)
const TAB_COLOR_MAP: Record<string, { activeBg: string; activeText: string; inactiveText: string; inactiveHoverText: string; }> = {
  slate:   { activeBg: "bg-slate-100 border border-slate-300",     activeText: "text-slate-800",   inactiveText: "text-slate-500",   inactiveHoverText: "hover:text-slate-700"   },
  blue:    { activeBg: "bg-blue-100 border border-blue-300",       activeText: "text-blue-800",    inactiveText: "text-blue-500",    inactiveHoverText: "hover:text-blue-700"    },
  red:     { activeBg: "bg-red-100 border border-red-300",         activeText: "text-red-700",     inactiveText: "text-red-500",     inactiveHoverText: "hover:text-red-700"     },
  sky:     { activeBg: "bg-sky-100 border border-sky-300",         activeText: "text-sky-700",     inactiveText: "text-sky-500",     inactiveHoverText: "hover:text-sky-700"     },
  indigo:  { activeBg: "bg-indigo-100 border border-indigo-300",   activeText: "text-indigo-700",  inactiveText: "text-indigo-500",  inactiveHoverText: "hover:text-indigo-700"  },
  orange:  { activeBg: "bg-orange-100 border border-orange-300",   activeText: "text-orange-700",  inactiveText: "text-orange-500",  inactiveHoverText: "hover:text-orange-700"  },
  emerald: { activeBg: "bg-emerald-100 border border-emerald-300", activeText: "text-emerald-700", inactiveText: "text-emerald-500", inactiveHoverText: "hover:text-emerald-700" },
  violet:  { activeBg: "bg-violet-100 border border-violet-300",   activeText: "text-violet-700",  inactiveText: "text-violet-500",  inactiveHoverText: "hover:text-violet-700"  },
  amber:   { activeBg: "bg-amber-100 border border-amber-300",     activeText: "text-amber-800",   inactiveText: "text-amber-600",   inactiveHoverText: "hover:text-amber-800"   },
  cyan:    { activeBg: "bg-cyan-100 border border-cyan-300",       activeText: "text-cyan-700",    inactiveText: "text-cyan-500",    inactiveHoverText: "hover:text-cyan-700"    },
};

// 경영관리 탭이 활성인 페이지들 (통합 페이지 + 서브 페이지들 · 헤더 활성 표시용)
// business-manage 는 통합 페이지 · leave/lunch/permissions 는 랜딩페이지에서 직접 이동 시 활성 표시
const BUSINESS_PAGES = new Set<AppNavPage>(["business-manage", "leave", "lunch", "permissions", "hr-forms"]);

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
  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (isVendor) return false;  // 거래처 로그인 시 홈 외 모든 탭 숨김
    if (t.managerOnly) return isPrivileged;
    if (t.pharmacistOnly) return isPharmacist;
    return true;
  }), [authSession, isPrivileged, isPharmacist, isVendor]);

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

    // 색상별 underline accent 색상 (active 탭 하단 bar)
    const ACCENT_BORDER: Record<string, string> = {
      slate:   "border-b-slate-500",
      blue:    "border-b-blue-500",
      red:     "border-b-red-500",
      sky:     "border-b-sky-500",
      indigo:  "border-b-indigo-500",
      orange:  "border-b-orange-500",
      emerald: "border-b-emerald-500",
      violet:  "border-b-violet-500",
      amber:   "border-b-amber-500",
      cyan:    "border-b-cyan-500",
    };
    // 색상별 hover 배경 (subtle tinted)
    const HOVER_BG: Record<string, string> = {
      slate:   "hover:bg-slate-50",
      blue:    "hover:bg-blue-50",
      red:     "hover:bg-red-50",
      sky:     "hover:bg-sky-50",
      indigo:  "hover:bg-indigo-50",
      orange:  "hover:bg-orange-50",
      emerald: "hover:bg-emerald-50",
      violet:  "hover:bg-violet-50",
      amber:   "hover:bg-amber-50",
      cyan:    "hover:bg-cyan-50",
    };
    // 색상별 active 배경 (매우 연한 tint)
    const ACTIVE_BG_TINT: Record<string, string> = {
      slate:   "bg-slate-50/80",
      blue:    "bg-blue-50/80",
      red:     "bg-red-50/80",
      sky:     "bg-sky-50/80",
      indigo:  "bg-indigo-50/80",
      orange:  "bg-orange-50/80",
      emerald: "bg-emerald-50/80",
      violet:  "bg-violet-50/80",
      amber:   "bg-amber-50/80",
      cyan:    "bg-cyan-50/80",
    };

    const colorKey = tab.color ?? "slate";
    const accentBar = ACCENT_BORDER[colorKey] ?? "border-b-slate-500";
    const hoverBg = HOVER_BG[colorKey] ?? "hover:bg-slate-50";
    const activeBgTint = ACTIVE_BG_TINT[colorKey] ?? "bg-slate-50/80";

    // 공통 베이스: 세로 border-b-2 underline 방식 · 상하 padding 은 Row 2 높이와 맞춤
    const baseCommon = "relative flex items-center gap-1.5 px-2.5 sm:px-2 md:px-2.5 lg:px-3 py-1.5 rounded-lg text-[15px] sm:text-[15px] md:text-[16px] lg:text-[17px] font-semibold whitespace-nowrap transition-all duration-150";

    const activeClass = `${baseCommon} ${activeBgTint} ${c.activeText} border-2 ${accentBar} border-x-transparent border-t-transparent font-bold`;
    const inactiveClass = `${baseCommon} ${hoverBg} ${c.inactiveText} ${c.inactiveHoverText} border-2 border-transparent hover:border-x-transparent hover:border-t-transparent hover:border-b-transparent active:scale-95 cursor-pointer disabled:opacity-40`;

    // 경영관리 탭 · business-manage 통합 페이지로 단순 라우팅 (2026-08-03)
    if (tab.key === "business") {
      const isActive = isBizPage;
      const bizOnClick = () => onNavigate?.("business-manage");
      if (isActive) {
        return (
          <span key="business" className={activeClass}>
            <Icon size={18} weight="fill" className="shrink-0 opacity-90" />
            <span>{tab.label}</span>
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
          <Icon size={18} weight="duotone" className="shrink-0 opacity-70" />
          <span>{tab.label}</span>
        </button>
      );
    }

    const isActive = tab.key === activePage;
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
    if (isActive) {
      return (
        <span key={tab.key} className={activeClass}>
          <Icon size={18} weight="fill" className="shrink-0 opacity-90" />
          <span>{tab.label}</span>
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
        <Icon size={18} weight="duotone" className="shrink-0 opacity-70" />
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
          <span key="business" className={`${base} ${c.activeBg} ${c.activeText} shadow-sm font-black`}>
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
          className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/80 cursor-pointer disabled:opacity-40`}
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
        <span key={tab.key} className={`${base} ${c.activeBg} ${c.activeText} shadow-sm font-black`}>
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
        className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white/80 cursor-pointer disabled:opacity-40`}
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

  // 2026-08-11 · 사이드바 V2 · 데스크탑에서는 헤더 완전 제거 (알림/로그아웃 사이드바로 이관 · rightSlot 만 있으면 미니 헤더)
  if (SIDEBAR_ENABLED && !isMobileNav) {
    if (!rightSlot) return null;
    return (
      <div className="flex justify-end px-3 py-1 shrink-0">
        {rightSlot}
      </div>
    );
  }

  return (
    <header className="border-b border-[#e2e8f0] shrink-0 shadow-sm" style={{ background: "linear-gradient(160deg, #f8faff 0%, #f3f4ff 50%, #f0fdf4 100%)" }}>
      {/* ── Row 1 (상단): 로고 + 서비스명 · 로그인정보 · 알림 · 로그아웃 (PC/모바일 동일 · 2026-08-04 사용자 요청) ── */}
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: logo (클릭 시 랜딩 이동) */}
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={onBack ?? (() => onNavigate?.("landing"))}
            className="flex items-center gap-3 sm:gap-4 shrink-0 px-1 py-0.5 cursor-pointer hover:opacity-80 active:opacity-70 transition rounded-lg"
            title="홈으로"
            aria-label="랜딩 페이지로 이동"
          >
            <img
              src={logoImg}
              alt="OSAN MEGATOWN 로고"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0"
              draggable={false}
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = "/src/images/logo.png"; }
              }}
            />
            {/* 2026-07-30 · 사용자 재요청 · 반응형(md 미만) OSAN MEGATOWN 텍>스트 숨김 · 로고만 노출 */}
            <div className="hidden md:flex flex-col gap-0.5 font-black tracking-tight leading-none select-none">
              <span className="text-red-500 text-lg leading-none">OSAN</span>
              <span className="text-gray-900 text-sm leading-none">MEGATOWN</span>
            </div>
          </button>
        </div>

        {/* Right: 로그인 이름 + rightSlot + logout */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {authSession?.employeeName && (
            <button
              type="button"
              onClick={() => onNavigate?.("mypage" as AppNavPage)}
              className="inline-flex items-center text-[11px] sm:text-[12px] font-bold text-slate-600 whitespace-nowrap px-1.5 sm:px-2 py-1 rounded-lg hover:bg-slate-100 active:scale-95 transition cursor-pointer max-w-[42vw] sm:max-w-none"
              title="마이페이지"
            >
              <span className="text-slate-800 font-black truncate">{authSession.employeeName}{authSession.employeeRank ?? ""}</span>
            </button>
          )}

          <NotificationToggle authSession={authSession} />
          <NotificationBell authSession={authSession} onNavigate={onNavigate as unknown as (page: string) => void} />

          {rightSlot}

          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 justify-center w-8 h-8 sm:w-auto sm:h-auto sm:px-2 sm:py-1.5 text-[10px] font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-300 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={13} strokeWidth={2.2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 justify-center w-8 h-8 sm:w-auto sm:h-auto sm:px-2 sm:py-1.5 text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200 rounded-lg shrink-0" title="비로그인">
              <Lock size={13} strokeWidth={2.2} />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2 (하단): Desktop/태블릿 nav tabs · 2026-08-11 리디자인 · sm+ ── */}
      <div className="hidden sm:block px-4 sm:px-5 md:px-6 pt-0.5 pb-1.5 border-t border-slate-100/60">
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
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] font-semibold transition-all duration-150 active:scale-95 cursor-pointer ${
                  desktopOverflowOpen
                    ? "bg-slate-800 text-white shadow-md"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
                title={`더보기 (${desktopOverflowTabs.length}개)`}
                aria-label="더보기 메뉴"
                aria-expanded={desktopOverflowOpen}
              >
                <Menu size={16} strokeWidth={2} />
                <span className="text-[14px]">{desktopOverflowTabs.length}</span>
              </button>
              {desktopOverflowOpen && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)] border border-slate-100 py-1.5 min-w-[160px] z-50 max-h-[70vh] overflow-y-auto">
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
                            : `${c.inactiveText} hover:bg-slate-50 hover:${c.inactiveHoverText.replace("hover:", "")} cursor-pointer`
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
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-slate-100/70 rounded-xl px-2 py-1 relative">
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
                  className={`min-w-[44px] h-full flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg text-[10px] font-black transition active:scale-95 ${
                    mobileOverflowOpen
                      ? "bg-slate-800 text-white shadow-md"
                      : "text-slate-600 hover:bg-white"
                  }`}
                  title={`더보기 (${mobileOverflowTabs.length}개)`}
                  aria-label="더보기 메뉴"
                  aria-expanded={mobileOverflowOpen}
                >
                  <Menu size={18} strokeWidth={2.4} />
                  <span className="text-[9px]">더보기</span>
                </button>
                {mobileOverflowOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[160px] z-50 max-h-[70vh] overflow-y-auto">
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
                              : `${c.inactiveText} hover:bg-slate-50 cursor-pointer`
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
