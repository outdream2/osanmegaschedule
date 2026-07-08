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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  managerOnly: boolean;
  iconClassName?: string;
}

const TABS: TabDef[] = [
  { key: "landing",  label: "홈",         mobileLabel: "홈",     icon: Home,          managerOnly: false },
  { key: "schedule", label: "스케줄관리", mobileLabel: "스케줄",  icon: Calendar,      managerOnly: false },
  { key: "lunch",    label: "점심불참",   mobileLabel: "불참",    icon: UtensilsCrossed, managerOnly: false, iconClassName: "text-red-500" },
  { key: "display",  label: "매장관리",   mobileLabel: "매장",    icon: LayoutGrid,    managerOnly: true  },
  { key: "requests", label: "요청목록",   mobileLabel: "요청",    icon: MessageSquare, managerOnly: false },
  { key: "board",    label: "이슈공유",   mobileLabel: "이슈",    icon: MessageCircleQuestion, managerOnly: false, iconClassName: "text-orange-500" },
  { key: "leave",    label: "연차승인",   mobileLabel: "연차",    icon: CheckCircle,   managerOnly: true  },
  { key: "scan",     label: "상품관리",   mobileLabel: "상품",    icon: Package,       managerOnly: true  },
  { key: "ocr",      label: "거래명세서", mobileLabel: "OCR",     icon: FileText,      managerOnly: true  },
];

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
    const base = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all";
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-indigo-600 text-white border-indigo-600 shadow-sm font-black`}>
          <Icon size={11} /> {tab.label}
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={`${base} bg-white text-gray-500 border-gray-200 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 cursor-pointer disabled:opacity-40`}
      >
        <Icon size={11} className={tab.iconClassName} /> {tab.label}
      </button>
    );
  };

  const renderMobileTab = (tab: TabDef) => {
    const Icon = tab.icon;
    const isActive = tab.key === activePage;
    const base = "shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition";
    const onClick = tab.key === "landing" ? (onBack ?? (() => onNavigate?.("landing"))) : () => onNavigate?.(tab.key);
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-white text-indigo-700 shadow-sm border border-indigo-100 font-black`}>
          <Icon size={12} className={tab.iconClassName} />
          <span>{tab.mobileLabel}</span>
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={onClick}
        disabled={!onNavigate && !onBack}
        className={`${base} text-gray-500 hover:text-gray-800 hover:bg-white cursor-pointer disabled:opacity-40`}
      >
        <Icon size={12} className={tab.iconClassName} />
        <span>{tab.mobileLabel}</span>
      </button>
    );
  };

  return (
    <header className="bg-white border-b border-[#e2e8f0] shrink-0 shadow-sm">
      {/* ── Top row: logo + desktop tabs + right actions ── */}
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: logo (non-clickable) + desktop nav tabs */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0 px-1 py-0.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
              <Home size={14} className="text-white" />
            </div>
            <span className="font-black tracking-tight leading-none select-none">
              <span className="text-red-500 text-lg sm:text-xl">OSAN</span>
              <span className="text-gray-900 text-sm sm:text-base"> MEGATOWN</span>
            </span>
          </div>

          {/* Desktop nav tabs — all tabs, hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1 ml-3">
            {visibleTabs.map(renderDesktopTab)}
          </div>
        </div>

        {/* Right: rightSlot + logout (역할 배지는 메뉴 아래 라인으로 이동) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">

          <NotificationToggle authSession={authSession} />
          <NotificationBell authSession={authSession} />

          {rightSlot}

          {/* 로그아웃: 모바일에서 아이콘만, 데스크탑에서 라벨 포함 */}
          {authSession && onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded-lg transition cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold bg-gray-50 text-gray-400 border border-gray-200 rounded-lg shrink-0" title="비로그인">
              <Lock size={12} />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile tab row: all visible tabs, horizontally scrollable ── */}
      {visibleTabs.length > 1 && (
        <div className="sm:hidden px-3 pb-2">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 overflow-x-auto scrollbar-none">
            {visibleTabs.map(renderMobileTab)}
          </div>
        </div>
      )}

      {/* ── 로그인 사용자 이름·직급 (탭 아래 라인) ── */}
      {authSession && (authSession.employeeName || authSession.employeeRank) && (
        <div className="px-4 sm:px-6 pb-1.5 sm:pb-2 -mt-0.5 flex items-center justify-end">
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
