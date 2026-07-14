// src/components/AppNavHeader.tsx
// 헤더 · 2026-07-14 옛날 심플 디자인 복원
//   - PC: 데스크톱 탭 가로 스크롤 (Priority+ 오버플로 "..." 제거)
//   - 모바일: 균등 분할 탭 행
//   - 로고 클릭 → 홈(랜딩) 이동
import React from "react";
import {
  Calendar,
  CheckCircle,
  FileText,
  Home,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  MessageCircleQuestion,
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
  rightSlot?: React.ReactNode;
}

interface TabDef {
  key: AppNavPage;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  managerOnly: boolean;
  iconClassName?: string;
  color?: "slate" | "blue" | "red" | "sky" | "indigo" | "orange" | "emerald" | "violet" | "amber" | "cyan";
}

// 무지개 순서: 홈 → 매장(빨) → 상품(주) → 스케줄(amber) → 이슈(초) → 요청(청록) → 연차(파) → 점심(남) → OCR(보라)
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
  const isPrivileged = userLevel >= 2;

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (t.managerOnly) return isPrivileged;
    return true;
  });

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
            <span className="font-black tracking-tight leading-none select-none flex flex-col sm:flex-row sm:items-baseline sm:gap-1">
              <span className="text-red-500 text-lg sm:text-xl leading-none">OSAN</span>
              <span className="text-gray-900 text-sm sm:text-base leading-none mt-0.5 sm:mt-0">MEGATOWN</span>
            </span>
          </button>

          {/* Desktop nav tabs — 가로 스크롤 (오버플로 "..." 없이 모두 노출) */}
          <div className="hidden sm:flex items-center gap-1 ml-3 min-w-0 overflow-x-auto scrollbar-none">
            {visibleTabs.map(renderDesktopTab)}
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

      {/* ── Mobile tab row: 한 줄 · 균등 분할 · 가로 스크롤 ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div className="flex items-stretch justify-between gap-1 bg-gray-100 rounded-xl px-2 py-1 overflow-x-auto scrollbar-none">
            {visibleTabs.map(renderMobileTab)}
          </div>
        </div>
      )}
    </header>
  );
};

export default AppNavHeader;
