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
import type { AuthSession } from "../types";
import { NotificationBell } from "./NotificationBell";
import { NotificationToggle } from "./NotificationToggle";
import logoImg from "../images/logo.png";

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

// 무지개 순서: 홈 → 매장(빨) → 경영(보라) → 스케줄(amber) → 이슈(초) → 요청(청록)
// 2026-08-03: 경영관리 → business-manage 통합 페이지로 단순 라우팅 (팝오버 제거)
// 2026-08-03: scan · productarrival · ocr 탭 제거 (매장관리 매입 서브탭 및 랜딩 카드에서 접근 · union 유지)
const TABS: TabDef[] = [
  { key: "landing",       label: "홈",         mobileLabel: "홈",     icon: House,       managerOnly: false, color: "slate"   },
  { key: "display",       label: "매장관리",   mobileLabel: "매장",   icon: SquaresFour, managerOnly: true,  color: "red"     },
  { key: "business",      label: "경영관리",   mobileLabel: "경영",   icon: Briefcase,   managerOnly: true,  color: "violet"  },
  { key: "pharmacist",    label: "약사전용",   mobileLabel: "약사",   icon: FirstAid,    managerOnly: false, pharmacistOnly: true, color: "sky" },
  { key: "schedule",      label: "스케줄관리", mobileLabel: "스케줄", icon: Calendar,    managerOnly: false, color: "amber"   },
  { key: "board",         label: "이슈공유",   mobileLabel: "이슈",   icon: ChatCircle,  managerOnly: false, color: "emerald" },
  { key: "requests",      label: "요청목록",   mobileLabel: "요청",   icon: Chat,        managerOnly: false, color: "cyan"    },
];

const TAB_COLOR_MAP: Record<string, { activeBg: string; activeText: string; inactiveText: string; inactiveHoverText: string; }> = {
  slate:   { activeBg: "from-slate-500 to-slate-600",     activeText: "text-white", inactiveText: "text-slate-600",   inactiveHoverText: "hover:text-slate-800"   },
  blue:    { activeBg: "from-blue-500 to-blue-600",       activeText: "text-white", inactiveText: "text-blue-600",    inactiveHoverText: "hover:text-blue-800"    },
  red:     { activeBg: "from-red-500 to-red-600",         activeText: "text-white", inactiveText: "text-red-600",     inactiveHoverText: "hover:text-red-800"     },
  sky:     { activeBg: "from-sky-500 to-sky-600",         activeText: "text-white", inactiveText: "text-sky-600",     inactiveHoverText: "hover:text-sky-800"     },
  indigo:  { activeBg: "from-indigo-500 to-indigo-600",   activeText: "text-white", inactiveText: "text-indigo-600",  inactiveHoverText: "hover:text-indigo-800"  },
  orange:  { activeBg: "from-orange-500 to-orange-600",   activeText: "text-white", inactiveText: "text-orange-600",  inactiveHoverText: "hover:text-orange-800"  },
  emerald: { activeBg: "from-emerald-500 to-emerald-600", activeText: "text-white", inactiveText: "text-emerald-600", inactiveHoverText: "hover:text-emerald-800" },
  violet:  { activeBg: "from-violet-500 to-violet-600",   activeText: "text-white", inactiveText: "text-violet-600",  inactiveHoverText: "hover:text-violet-800"  },
  amber:   { activeBg: "from-amber-600 to-amber-700",     activeText: "text-white", inactiveText: "text-amber-700",   inactiveHoverText: "hover:text-amber-900"   },
  cyan:    { activeBg: "from-cyan-500 to-cyan-600",       activeText: "text-white", inactiveText: "text-cyan-600",    inactiveHoverText: "hover:text-cyan-800"    },
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

  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (t.managerOnly) return isPrivileged;
    if (t.pharmacistOnly) return isPharmacist;
    return true;
  }), [authSession, isPrivileged, isPharmacist]);

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

  const renderDesktopTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    // 2026-07-24 · sm 컴팩트 · md 중간 · lg 정상 (사용자 "모바일/PC 버전 바뀜" 대응)
    //   sm (640-767): 매우 컴팩트 · md (768-1023): 중간 · lg (1024+): 원래대로
    const base = "flex items-center gap-1 md:gap-1.5 px-2 md:px-3 lg:px-4 py-1.5 md:py-2 rounded-lg text-[13px] md:text-[14px] lg:text-[16px] font-bold border transition-all whitespace-nowrap";

    // 경영관리 탭 · business-manage 통합 페이지로 단순 라우팅 (2026-08-03)
    if (tab.key === "business") {
      const isActive = isBizPage;
      const bizOnClick = () => onNavigate?.("business-manage");
      if (isActive) {
        return (
          <span key="business" className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} border-transparent shadow-sm font-bold`}>
            <Icon size={17} weight="fill" /> {tab.label}
          </span>
        );
      }
      return (
        <button
          key="business"
          type="button"
          onClick={bizOnClick}
          disabled={!onNavigate}
          className={`${base} bg-white ${c.inactiveText} ${c.inactiveHoverText} border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:scale-95 cursor-pointer disabled:opacity-40`}
        >
          <Icon size={15} weight="fill" /> {tab.label}
        </button>
      );
    }

    const isActive = tab.key === activePage;
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} border-transparent shadow-sm font-bold`}>
          <Icon size={15} weight="fill" /> {tab.label}
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={`${base} bg-white ${c.inactiveText} ${c.inactiveHoverText} border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:scale-95 cursor-pointer disabled:opacity-40`}
      >
        <Icon size={15} weight="fill" /> {tab.label}
      </button>
    );
  };

  const renderMobileTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    const base = "flex-1 min-w-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95";

    // 경영관리 탭 (모바일) · business-manage 단순 라우팅 (2026-08-03)
    if (tab.key === "business") {
      const isActive = isBizPage;
      const bizOnClick = () => onNavigate?.("business-manage");
      if (isActive) {
        return (
          <span key="business" className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} shadow-md font-black`}>
            <Icon size={18} weight="fill" />
            <span className="leading-tight text-center">경영</span>
          </span>
        );
      }
      return (
        <button
          key="business"
          type="button"
          onClick={bizOnClick}
          disabled={!onNavigate}
          className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white cursor-pointer disabled:opacity-40`}
        >
          <Icon size={18} weight="fill" />
          <span className="leading-tight text-center">경영</span>
        </button>
      );
    }

    const isActive = tab.key === activePage;
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key as AppNavPage);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} shadow-md font-black`}>
          <Icon size={18} weight="fill" />
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
        className={`${base} ${c.inactiveText} ${c.inactiveHoverText} hover:bg-white cursor-pointer disabled:opacity-40`}
      >
        <Icon size={18} weight="fill" />
        <span className="leading-tight text-center">
          {tab.label.length > 2 ? (
            <>
              <div>{tab.label.slice(0, tab.label.length - 2)}</div>
              <div>{tab.label.slice(-2)}</div>
            </>
          ) : tab.label}
        </span>
      </button>
    );
  };

  return (
    <header className="bg-white border-b border-[#e2e8f0] shrink-0 shadow-sm">
      {/* ── Top row: logo + desktop tabs + right actions ── */}
      <div className="px-4 sm:px-6 min-h-14 flex flex-wrap items-center justify-between gap-3 py-2 sm:py-0">
        {/* Left: logo (클릭 시 랜딩 이동) + desktop nav tabs */}
        <div className="flex items-center gap-2 min-w-0">
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
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
              draggable={false}
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = "/src/images/logo.png"; }
              }}
            />
            {/* 2026-07-30 · 사용자 재요청 · 반응형(md 미만) OSAN MEGATOWN 텍스트 숨김 · 로고만 노출 */}
            <div className="hidden md:flex flex-col gap-0.5 font-black tracking-tight leading-none select-none">
              <span className="text-red-500 text-xl leading-none">OSAN</span>
              <span className="text-gray-900 text-base leading-none">MEGATOWN</span>
            </div>
          </button>

          {/* 2026-07-30 · Desktop/태블릿 nav tabs · sm+ · 화면 넘어가면 두줄 wrap (2026-08-04 · 사용자 요청)
              · flex-wrap 으로 자연 wrap · 삼선 드롭다운 로직은 유지 (매우 좁은 화면 대비 fallback) */}
          <div ref={desktopContainerRef} className="hidden sm:flex flex-wrap items-center gap-1 gap-y-1.5 ml-3 min-w-0 relative flex-1 py-1">
            {/* 측정용 hidden 영역 · 실제 탭 폭 계산 */}
            <div
              ref={desktopMeasureRef}
              aria-hidden="true"
              className="absolute flex items-center gap-1 opacity-0 pointer-events-none"
              style={{ left: "-9999px", top: 0 }}
            >
              {visibleTabs.map(t => (
                <div key={`dmeasure-${t.key}`} data-desktop-tab>{renderDesktopTab(t)}</div>
              ))}
            </div>
            {/* 실제 노출 탭 */}
            {desktopShownTabs.map(renderDesktopTab)}
            {/* 오버플로 · 삼선 ☰ 드롭다운 */}
            {desktopOverflowTabs.length > 0 && (
              <div ref={desktopOverflowBtnRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setDesktopOverflowOpen(v => !v)}
                  className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-[13px] font-bold border transition-all active:scale-95 cursor-pointer ${
                    desktopOverflowOpen
                      ? "bg-slate-800 text-white border-transparent shadow-md"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                  }`}
                  title={`더보기 (${desktopOverflowTabs.length}개)`}
                  aria-label="더보기 메뉴"
                  aria-expanded={desktopOverflowOpen}
                >
                  <Menu size={16} strokeWidth={2.2} />
                </button>
                {desktopOverflowOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[180px] z-50 max-h-[70vh] overflow-y-auto">
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
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-bold transition ${
                            isActive
                              ? `bg-gradient-to-r ${c.activeBg} ${c.activeText}`
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
          <NotificationBell authSession={authSession} />

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

      {/* ── Mobile 전용 탭 행: 태블릿·PC 는 상단 탭 사용 (2026-07-16) ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-gray-100 rounded-xl px-2 py-1 relative">
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
                              ? `bg-gradient-to-r ${c.activeBg} ${c.activeText}`
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
