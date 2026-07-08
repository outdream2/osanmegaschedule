// src/components/AppNavHeader.tsx
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
  Package,
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
  | "board";

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
  color?: "slate" | "blue" | "red" | "sky" | "indigo" | "orange" | "emerald" | "violet" | "amber";
}

const TABS: TabDef[] = [
  { key: "landing",  label: "홈",         mobileLabel: "홈",     icon: Home,          managerOnly: false, color: "slate"   },
  { key: "schedule", label: "스케줄관리", mobileLabel: "스케줄",  icon: Calendar,      managerOnly: false, color: "blue"    },
  { key: "lunch",    label: "점심불참",   mobileLabel: "불참",    icon: UtensilsCrossed, managerOnly: false, color: "red"     },
  { key: "display",  label: "매장관리",   mobileLabel: "매장",    icon: LayoutGrid,    managerOnly: true,  color: "sky"     },
  { key: "requests", label: "요청목록",   mobileLabel: "요청",    icon: MessageSquare, managerOnly: false, color: "indigo"  },
  { key: "board",    label: "이슈공유",   mobileLabel: "이슈",    icon: MessageCircleQuestion, managerOnly: false, color: "orange" },
  { key: "leave",    label: "연차승인",   mobileLabel: "연차",    icon: CheckCircle,   managerOnly: true,  color: "emerald" },
  { key: "scan",     label: "상품관리",   mobileLabel: "상품",    icon: Package,       managerOnly: true,  color: "violet"  },
  { key: "ocr",      label: "거래명세서", mobileLabel: "OCR",     icon: FileText,      managerOnly: true,  color: "amber"   },
];

// 탭 색상 매핑 · 모바일 활성/비활성
const TAB_COLOR_MAP: Record<string, { activeBg: string; activeText: string; inactiveText: string; inactiveHoverText: string; }> = {
  slate:   { activeBg: "from-slate-500 to-slate-600",     activeText: "text-white", inactiveText: "text-slate-600",   inactiveHoverText: "hover:text-slate-800"   },
  blue:    { activeBg: "from-blue-500 to-blue-600",       activeText: "text-white", inactiveText: "text-blue-600",    inactiveHoverText: "hover:text-blue-800"    },
  red:     { activeBg: "from-red-500 to-red-600",         activeText: "text-white", inactiveText: "text-red-600",     inactiveHoverText: "hover:text-red-800"     },
  sky:     { activeBg: "from-sky-500 to-sky-600",         activeText: "text-white", inactiveText: "text-sky-600",     inactiveHoverText: "hover:text-sky-800"     },
  indigo:  { activeBg: "from-indigo-500 to-indigo-600",   activeText: "text-white", inactiveText: "text-indigo-600",  inactiveHoverText: "hover:text-indigo-800"  },
  orange:  { activeBg: "from-orange-500 to-orange-600",   activeText: "text-white", inactiveText: "text-orange-600",  inactiveHoverText: "hover:text-orange-800"  },
  emerald: { activeBg: "from-emerald-500 to-emerald-600", activeText: "text-white", inactiveText: "text-emerald-600", inactiveHoverText: "hover:text-emerald-800" },
  violet:  { activeBg: "from-violet-500 to-violet-600",   activeText: "text-white", inactiveText: "text-violet-600",  inactiveHoverText: "hover:text-violet-800"  },
  amber:   { activeBg: "from-amber-500 to-amber-600",     activeText: "text-white", inactiveText: "text-amber-600",   inactiveHoverText: "hover:text-amber-800"   },
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
    if (t.key === "landing") return true;
    if (!authSession) return false;
    if (t.managerOnly) return isPrivileged;
    return true;
  });

  const renderDesktopTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const isActive = tab.key === activePage;
    const c = TAB_COLOR_MAP[tab.color ?? "slate"];
    const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all";
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-gradient-to-br ${c.activeBg} ${c.activeText} border-transparent shadow-sm font-black`}>
          <Icon size={11} /> {tab.label}
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={`${base} bg-white ${c.inactiveText} ${c.inactiveHoverText} border-slate-200 hover:bg-slate-50 hover:border-slate-300 cursor-pointer disabled:opacity-40`}
      >
        <Icon size={11} /> {tab.label}
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
        {/* Left: logo (non-clickable) + desktop nav tabs */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-3 sm:gap-4 shrink-0 px-1 py-0.5">
            <img
              src={logoImg}
              alt="OSAN MEGATOWN 로고"
              className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
              draggable={false}
              onError={(e) => {
                // fallback: /src/images/logo.png 상대경로로 재시도
                const el = e.currentTarget;
                if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = "/src/images/logo.png"; }
              }}
            />
            <span className="font-black tracking-tight leading-none select-none">
              <span className="text-red-500 text-lg sm:text-xl">OSAN</span>
              <span className="text-gray-900 text-sm sm:text-base"> MEGATOWN</span>
            </span>
          </div>

          {/* Desktop nav tabs — 좁은 데스크탑에서 가로 스크롤 · 오버플로 방지 */}
          <div className="hidden sm:flex items-center gap-1 ml-3 min-w-0 overflow-x-auto scrollbar-none">
            {visibleTabs.map(renderDesktopTab)}
          </div>
        </div>

        {/* Right: rightSlot + logout (역할 배지는 메뉴 아래 라인으로 이동) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">

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

      {/* ── Mobile tab row: 한 줄 · 각 탭 균등 분할 · 양쪽 여백 확보 ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-4 pb-2">
          <div className="flex items-stretch justify-between gap-1 bg-gray-100 rounded-xl px-2 py-1 overflow-x-auto scrollbar-none">
            {visibleTabs.map(renderMobileTab)}
          </div>
        </div>
      )}

      {/* ── 로그인 사용자 이름·직급 · 가운데 정렬 ── */}
      {authSession && (authSession.employeeName || authSession.employeeRank) && (
        <div className="px-4 sm:px-6 pb-1.5 sm:pb-2 -mt-0.5 flex items-center justify-center">
          <span className="text-[11px] sm:text-xs font-black text-slate-500 tracking-tight">
            <span className="text-slate-300 font-normal">[</span>
            {authSession.employeeName && <span className="text-slate-800">{authSession.employeeName}</span>}
            {authSession.employeeName && authSession.employeeRank && <span className="text-slate-400"> </span>}
            {authSession.employeeRank && <span className="text-slate-600">{authSession.employeeRank}</span>}
            <span className="text-slate-300 font-normal">]</span>
          </span>
        </div>
      )}
    </header>
  );
};

export default AppNavHeader;
