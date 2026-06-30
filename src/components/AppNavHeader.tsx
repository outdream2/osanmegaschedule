// src/components/AppNavHeader.tsx
import React from "react";
import {
  Calendar,
  CheckCircle,
  ChevronLeft,
  FileText,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  Package,
} from "lucide-react";
import type { AuthSession } from "../types";

export type AppNavPage =
  | "schedule"
  | "display"
  | "requests"
  | "leave"
  | "scan"
  | "ocr";

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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** When true, the tab is only shown to admin/manager users. */
  managerOnly: boolean;
}

const TABS: TabDef[] = [
  { key: "schedule", label: "스케줄관리", icon: Calendar,        managerOnly: false },
  { key: "display",  label: "매장관리",   icon: LayoutGrid,      managerOnly: false },
  { key: "requests", label: "요청목록",   icon: MessageSquare,   managerOnly: true  },
  { key: "leave",    label: "연차승인",   icon: CheckCircle,     managerOnly: true  },
  { key: "scan",     label: "상품관리",   icon: Package,         managerOnly: true  },
  { key: "ocr",      label: "거래명세서", icon: FileText,        managerOnly: true  },
];

export const AppNavHeader: React.FC<AppNavHeaderProps> = ({
  activePage,
  authSession,
  onBack,
  onNavigate,
  onLogout,
  rightSlot,
}) => {
  const isAdmin =
    authSession?.role === "superadmin" || authSession?.role === "admin";
  const isManager = authSession?.role === "manager";
  const isEmployee = authSession?.role === "employee";
  const isPrivileged = isAdmin || isManager;

  const visibleTabs = TABS.filter((t) => !t.managerOnly || isPrivileged);

  // Mobile shows only these 3 tabs
  const mobileTabs = TABS.filter(
    (t) => t.key === "schedule" || t.key === "requests" || t.key === "leave"
  ).filter((t) => !t.managerOnly || isPrivileged);

  const renderTab = (tab: TabDef, size: "sm" | "xs" = "sm") => {
    const Icon = tab.icon;
    const isActive = tab.key === activePage;
    const baseDesktop = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold";
    const baseMobile  = "flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold";
    const base = size === "sm" ? baseDesktop : baseMobile;
    if (isActive) {
      return (
        <span key={tab.key} className={`${base} bg-white text-indigo-700 shadow-sm border border-indigo-100 font-black`}>
          <Icon size={11} /> {tab.label}
        </span>
      );
    }
    return (
      <button
        key={tab.key}
        onClick={() => onNavigate?.(tab.key)}
        disabled={!onNavigate}
        className={`${base} text-gray-500 hover:text-gray-800 hover:bg-white transition cursor-pointer disabled:opacity-40`}
      >
        <Icon size={11} /> {tab.label}
      </button>
    );
  };

  return (
    <header className="bg-white border-b border-[#e2e8f0] shrink-0 shadow-sm">
      {/* ── Top row: logo + desktop tabs + right actions ── */}
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left: back + logo + desktop nav tabs */}
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer text-xs font-semibold shrink-0"
              title="메인으로 돌아가기"
            >
              <ChevronLeft size={13} />
              <span className="hidden sm:inline">메인</span>
            </button>
          )}
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <Calendar size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none shrink-0">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="text-gray-900 text-base hidden sm:inline"> MEGATOWN</span>
          </span>

          {/* Desktop nav tabs — all tabs, hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1 ml-3 bg-gray-100 rounded-xl p-1">
            {visibleTabs.map((tab) => renderTab(tab, "sm"))}
          </div>
        </div>

        {/* Right: role badge + rightSlot + logout */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>최고관리자</span>
            </div>
          ) : isManager ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
              <span>관리자</span>
              {authSession?.employeeName && (
                <span className="text-sky-600 font-semibold border-l border-sky-300 pl-1.5 ml-0.5 truncate max-w-[60px]">
                  {authSession.employeeName}
                </span>
              )}
            </div>
          ) : isEmployee ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="truncate max-w-[80px]">{authSession?.employeeName ?? "직원 모드"}</span>
            </div>
          ) : null}

          {rightSlot}

          {(isAdmin || isManager || isEmployee) ? (
            onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded-lg transition cursor-pointer"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">로그아웃</span>
              </button>
            )
          ) : (
            <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold bg-gray-50 text-gray-400 border border-gray-200 rounded-lg">
              <Lock size={12} />
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile tab row: 스케줄관리 · 요청목록 · 연차승인 only ── */}
      {mobileTabs.length > 0 && (
        <div className="sm:hidden px-3 pb-2">
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1">
            {mobileTabs.map((tab) => renderTab(tab, "xs"))}
          </div>
        </div>
      )}
    </header>
  );
};

export default AppNavHeader;
