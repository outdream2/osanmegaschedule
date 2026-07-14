// src/components/AppNavHeader.tsx
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import {
  Calendar,
  CheckCircle,
  FileText,
  Home,
  LayoutGrid,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MessageCircleQuestion,
  MoreHorizontal,
  ScanBarcode,
  UtensilsCrossed,
} from "lucide-react";
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
  | "scan"
  | "ocr"
  | "lunch"
  | "permissions"
  | "stockarrivals"
  | "synonyms"
  | "stockcheck"
  | "board"
  | "mypage";

interface AppNavHeaderProps {
  activePage: AppNavPage;
  authSession: AuthSession | null;
  onBack?: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** Extra right-side slot for page-specific action buttons (placed before role badge/logout) */
  rightSlot?: React.ReactNode;
}

interface TabDef {
  key: AppNavPage;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  managerOnly: boolean;
  iconClassName?: string;
  /** 탭 색상 · 활성/비활성 스타일 결정 (tailwind 색상명) */
  color?: "slate" | "blue" | "red" | "sky" | "indigo" | "orange" | "emerald" | "violet" | "amber" | "cyan";
}

// 무지개 순서 (노랑 대신 진한 amber · 시인성 확보):
// 홈 → 매장(빨) → 상품(주) → 스케줄(amber) → 이슈(초) → 요청(청록) → 연차(파) → 점심(남) → OCR(보라)
const TABS: TabDef[] = [
  { key: "landing",  label: "홈",         mobileLabel: "홈",     icon: Home,          managerOnly: false, color: "slate"   },
  { key: "display",  label: "매장관리",   mobileLabel: "매장",    icon: LayoutGrid,    managerOnly: true,  color: "red"     },
  { key: "scan",     label: "상품검색",   mobileLabel: "상품",    icon: ScanBarcode,   managerOnly: true,  color: "orange"  },
  { key: "schedule", label: "스케줄관리", mobileLabel: "스케줄",  icon: Calendar,      managerOnly: false, color: "amber"   },
  { key: "board",    label: "이슈공유",   mobileLabel: "이슈",    icon: MessageCircleQuestion, managerOnly: false, color: "emerald" },
  { key: "requests", label: "요청목록",   mobileLabel: "요청",    icon: MessageSquare, managerOnly: false, color: "cyan"    },
  { key: "leave",    label: "연차승인",   mobileLabel: "연차",    icon: CheckCircle,   managerOnly: true,  color: "blue"    },
  { key: "lunch",    label: "점심불참",   mobileLabel: "불참",    icon: UtensilsCrossed, managerOnly: false, color: "indigo"  },
  { key: "ocr",      label: "거래명세서", mobileLabel: "OCR",     icon: FileText,      managerOnly: true,  color: "violet"  },
];

// 탭 색상 매핑 · 모바일 활성/비활성 (amber 는 노랑 대신 · 시인성 확보 위해 더 진하게)
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
  const isAdmin    = userLevel >= 9;
  const isManager  = userLevel >= 2 && userLevel < 9;
  const isEmployee = userLevel === 1;
  const isPrivileged = userLevel >= 2;

  const visibleTabs = TABS.filter((t) => {
    // 랜딩페이지에서는 홈 탭 숨김 (이미 홈에 있으므로 중복 · 로고 클릭으로 이동 가능)
    if (t.key === "landing") return activePage !== "landing";
    if (!authSession) return false;
    if (t.managerOnly) return isPrivileged;
    return true;
  });

  // ── Priority+ 네비게이션 (데스크탑) ─────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(visibleTabs.length);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const overflowWrapRef = useRef<HTMLDivElement>(null);
  const OVERFLOW_BTN_WIDTH = 48;

  // ── Priority+ 네비게이션 (모바일) · 넘치는 탭은 삼선(☰) 뒤로 이동 ─────
  const [mobileVisibleCount, setMobileVisibleCount] = useState(visibleTabs.length);
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false);
  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const mobileMeasureRef = useRef<HTMLDivElement>(null);
  const mobileOverflowWrapRef = useRef<HTMLDivElement>(null);
  const MOBILE_HAMBURGER_WIDTH = 52;

  useLayoutEffect(() => {
    const container = tabsContainerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const available = container.clientWidth;
      const children = Array.from(measure.children) as HTMLElement[];
      let used = 0;
      let fit = children.length; // 모두 들어가면 fit=전체
      for (let i = 0; i < children.length; i++) {
        const w = children[i].getBoundingClientRect().width + 4; // + gap
        const isLast = i === children.length - 1;
        // 마지막 아이템까지 남아있을 때는 overflow 버튼 불필요
        const budget = isLast ? available : available - OVERFLOW_BTN_WIDTH;
        if (used + w > budget) { fit = i; break; }
        used += w;
      }
      setVisibleCount(Math.max(0, fit));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [visibleTabs.length, activePage]);

  // 활성 탭이 오버플로우 영역에 들어가면 앞으로 당김 (사용자가 현재 페이지를 항상 볼 수 있게)
  const orderedTabs = useMemo(() => {
    const activeIdx = visibleTabs.findIndex(t => t.key === activePage);
    if (activeIdx < 0 || activeIdx < visibleCount) return visibleTabs;
    const arr = [...visibleTabs];
    const [active] = arr.splice(activeIdx, 1);
    // 마지막 visible 위치 앞으로 삽입 (visibleCount - 1)
    arr.splice(Math.max(0, visibleCount - 1), 0, active);
    return arr;
  }, [visibleTabs, visibleCount, activePage]);
  const shownTabs = orderedTabs.slice(0, visibleCount);
  const overflowTabs = orderedTabs.slice(visibleCount);

  // 바깥 클릭 · ESC 로 dropdown 닫기
  useEffect(() => {
    if (!overflowOpen) return;
    const onClick = (e: MouseEvent) => {
      if (overflowWrapRef.current?.contains(e.target as Node)) return;
      setOverflowOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOverflowOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [overflowOpen]);

  // 모바일 Priority+ 측정 · 넘치는 탭은 삼선 뒤로
  useLayoutEffect(() => {
    const container = mobileContainerRef.current;
    const measure = mobileMeasureRef.current;
    if (!container || !measure) return;
    const compute = () => {
      const available = container.clientWidth;
      const children = Array.from(measure.children) as HTMLElement[];
      let used = 0;
      let fit = children.length;
      for (let i = 0; i < children.length; i++) {
        const w = children[i].getBoundingClientRect().width + 4;
        const isLast = i === children.length - 1;
        const budget = isLast ? available : available - MOBILE_HAMBURGER_WIDTH;
        if (used + w > budget) { fit = i; break; }
        used += w;
      }
      setMobileVisibleCount(Math.max(0, fit));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [visibleTabs.length, activePage]);
  const mobileOrderedTabs = useMemo(() => {
    const activeIdx = visibleTabs.findIndex(t => t.key === activePage);
    if (activeIdx < 0 || activeIdx < mobileVisibleCount) return visibleTabs;
    const arr = [...visibleTabs];
    const [active] = arr.splice(activeIdx, 1);
    arr.splice(Math.max(0, mobileVisibleCount - 1), 0, active);
    return arr;
  }, [visibleTabs, mobileVisibleCount, activePage]);
  const mobileShownTabs = mobileOrderedTabs.slice(0, mobileVisibleCount);
  const mobileOverflowTabs = mobileOrderedTabs.slice(mobileVisibleCount);
  useEffect(() => {
    if (!mobileOverflowOpen) return;
    const onClick = (e: MouseEvent) => {
      if (mobileOverflowWrapRef.current?.contains(e.target as Node)) return;
      setMobileOverflowOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOverflowOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [mobileOverflowOpen]);

  const renderDesktopTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const isActive = tab.key === activePage;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    const base = "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13.5px] font-medium border transition-all whitespace-nowrap";
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} border-transparent shadow-sm font-bold`}>
          <Icon size={15} strokeWidth={2.2} /> {tab.label}
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
        <Icon size={15} strokeWidth={1.8} /> {tab.label}
      </button>
    );
  };

  const renderMobileTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const isActive = tab.key === activePage;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    const base = "flex-1 min-w-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-bold transition-all active:scale-95";
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} shadow-md font-black`}>
          <Icon size={18} strokeWidth={2.6} />
          <span className="leading-tight text-center">
            {(() => {
              const L = tab.label;
              const isAllAscii = /^[\x20-\x7e]+$/.test(L);
              if (L.length >= 4 && !isAllAscii) {
                // 4자: 2+2 · 5자: 2+3 (거래/명세서, 스케쥴/관리는 특수 처리)
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
        <Icon size={18} strokeWidth={2.2} />
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
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: logo (클릭 시 랜딩 이동 · 2026-07-14) + desktop nav tabs */}
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
            <span className="font-black tracking-tight leading-none select-none flex flex-col sm:flex-row sm:items-baseline sm:gap-1">
              <span className="text-red-500 text-lg sm:text-xl leading-none">OSAN</span>
              <span className="text-gray-900 text-sm sm:text-base leading-none mt-0.5 sm:mt-0">MEGATOWN</span>
            </span>
          </button>

          {/* Desktop nav tabs — Priority+ · 넘치는 탭은 우측 "⋯" 뒤 dropdown */}
          <div ref={tabsContainerRef} className="hidden sm:flex items-center gap-1 ml-3 min-w-0 flex-1 relative">
            {/* 숨겨진 측정용 영역 — 각 탭의 실제 폭 측정 */}
            <div
              ref={measureRef}
              aria-hidden="true"
              className="absolute flex items-center gap-1 opacity-0 pointer-events-none"
              style={{ left: "-9999px", top: 0 }}
            >
              {visibleTabs.map(renderDesktopTab)}
            </div>
            {/* 실제 노출되는 탭 */}
            {shownTabs.map(renderDesktopTab)}
            {/* 오버플로우 "⋯" 버튼 + dropdown */}
            {overflowTabs.length > 0 && (
              <div ref={overflowWrapRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setOverflowOpen(v => !v)}
                  className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-[13.5px] font-medium border transition-all cursor-pointer ${
                    overflowOpen
                      ? "bg-slate-100 text-slate-800 border-slate-300"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                  title={`더보기 (${overflowTabs.length}개)`}
                  aria-label="더보기 메뉴"
                  aria-expanded={overflowOpen}
                >
                  <MoreHorizontal size={16} strokeWidth={2.2} />
                </button>
                {overflowOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[180px] z-50 max-h-[70vh] overflow-y-auto">
                    {overflowTabs.map(tab => {
                      const Icon = tab.icon;
                      const c = TAB_COLOR_MAP[tab.color ?? "slate"];
                      const isActive = tab.key === activePage;
                      const onClickTab = () => {
                        setOverflowOpen(false);
                        if (tab.key === "landing" && onBack) onBack();
                        else onNavigate?.(tab.key);
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
                          <Icon size={15} strokeWidth={isActive ? 2.4 : 1.9} />
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

          {/* 로그인한 사용자 이름 (알람 스위치 앞) · 클릭 시 마이페이지 이동 · 형식: "로그인:강남규이사" (붙여쓰기) · 모바일/데스크탑 공통 노출 */}
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

          {/* 로그아웃: 벨과 동일 사이즈 (9x9=36px) 모바일, 데스크탑 라벨 포함 */}
          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-300 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={15} strokeWidth={2.2} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 text-xs font-bold bg-slate-50 text-slate-400 border border-slate-200 rounded-xl shrink-0" title="비로그인">
              <Lock size={14} strokeWidth={2.2} />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile tab row: Priority+ · 넘치는 탭은 삼선(☰) 뒤 dropdown ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div ref={mobileContainerRef} className="flex items-stretch gap-1 bg-gray-100 rounded-xl px-2 py-1 relative">
            {/* 숨긴 측정 영역 */}
            <div
              ref={mobileMeasureRef}
              aria-hidden="true"
              className="absolute flex items-stretch gap-1 opacity-0 pointer-events-none"
              style={{ left: "-9999px", top: 0 }}
            >
              {visibleTabs.map(renderMobileTab)}
            </div>
            {/* 실제 노출되는 탭 */}
            {mobileShownTabs.map(renderMobileTab)}
            {/* 삼선(☰) 오버플로우 버튼 + dropdown */}
            {mobileOverflowTabs.length > 0 && (
              <div ref={mobileOverflowWrapRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileOverflowOpen(v => !v)}
                  className={`min-w-[44px] h-full flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg text-[10px] font-black transition active:scale-95 ${
                    mobileOverflowOpen
                      ? "bg-slate-800 text-white shadow-md"
                      : "text-slate-600 hover:bg-white"
                  }`}
                  title={`더보기 (${mobileOverflowTabs.length}개)`}
                  aria-label="메뉴 더보기"
                  aria-expanded={mobileOverflowOpen}
                >
                  <Menu size={18} strokeWidth={2.4} />
                  <span className="text-[9px] leading-none">더보기</span>
                </button>
                {mobileOverflowOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[180px] z-50 max-h-[70vh] overflow-y-auto">
                    {mobileOverflowTabs.map(tab => {
                      const Icon = tab.icon;
                      const c = TAB_COLOR_MAP[tab.color ?? "slate"];
                      const isActive = tab.key === activePage;
                      const onClickTab = () => {
                        setMobileOverflowOpen(false);
                        if (tab.key === "landing" && onBack) onBack();
                        else onNavigate?.(tab.key);
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
                          <Icon size={15} strokeWidth={isActive ? 2.4 : 1.9} />
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
