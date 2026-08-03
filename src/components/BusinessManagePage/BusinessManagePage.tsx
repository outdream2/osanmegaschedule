// src/components/BusinessManagePage/BusinessManagePage.tsx
// 경영관리 페이지 · 2026-08-03
//   상단: AppNavHeader (activePage="business-manage")
//   서브탭: 직원관리 · 연차승인 · 점심불참 · 직원권한 (DisplayPage 서브탭 스타일 벤치마크)
//   각 서브탭 · 기존 페이지 임베드 (embedded prop 전달 → 자체 AppNavHeader skip)
import React, { Suspense, useState } from "react";
import { UserGear, CalendarDots, ForkKnife, ShieldCheck, FileText } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import { LeavePage } from "../LeavePage/LeavePage";
import { LunchPage } from "../LunchPage/LunchPage";
import { PermissionsPage } from "../PermissionsPage/PermissionsPage";
import type { AuthSession } from "../../types";

// StaffManagePage · props 없음 · lazy 로드 (초기 진입 시에만 필요)
const StaffManagePage = React.lazy(() => import("../StaffManagePage/StaffManagePage"));
// 2026-08-03 · 각종 양식 페이지 · lazy 로드 (초기 진입 시에만 필요)
const HrFormsPage = React.lazy(() => import("../HrFormsPage/HrFormsPage"));

interface BusinessManagePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type BmSubTab = "staff-manage" | "leave" | "lunch" | "permissions" | "hr-forms";

// 서브탭 색상 팔레트 · DisplayPage 서브탭 SUBTAB_COLORS 와 동일 구조
const SUBTAB_COLORS: Record<string, { bar: string; text: string; iconActive: string; hoverText: string }> = {
  emerald: { bar: "bg-emerald-500", text: "text-emerald-700", iconActive: "text-emerald-600", hoverText: "hover:text-emerald-700" },
  teal:    { bar: "bg-teal-500",    text: "text-teal-700",    iconActive: "text-teal-600",    hoverText: "hover:text-teal-700"    },
  orange:  { bar: "bg-orange-500",  text: "text-orange-700",  iconActive: "text-orange-600",  hoverText: "hover:text-orange-700"  },
  indigo:  { bar: "bg-indigo-500",  text: "text-indigo-700",  iconActive: "text-indigo-600",  hoverText: "hover:text-indigo-700"  },
  amber:   { bar: "bg-amber-500",   text: "text-amber-700",   iconActive: "text-amber-600",   hoverText: "hover:text-amber-700"   },
};

interface TabDef {
  key: BmSubTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; weight?: string }>;
  color: keyof typeof SUBTAB_COLORS;
}

const TABS: TabDef[] = [
  { key: "staff-manage", label: "직원관리",  icon: UserGear,     color: "emerald" },
  { key: "leave",        label: "연차승인",  icon: CalendarDots, color: "teal"    },
  { key: "lunch",        label: "점심불참",  icon: ForkKnife,    color: "orange"  },
  { key: "permissions",  label: "직원권한",  icon: ShieldCheck,  color: "indigo"  },
  { key: "hr-forms",     label: "각종양식",  icon: FileText,     color: "amber"   },
];

const BusinessManagePage: React.FC<BusinessManagePageProps> = ({
  onBack,
  authSession,
  onNavigate,
  onLogout,
}) => {
  const [subTab, setSubTab] = useState<BmSubTab>("staff-manage");

  // 노프롭 서브페이지에 넘길 공통 props (embedded=true 로 자체 헤더 skip 요청)
  const commonSubPageProps = {
    onBack,
    authSession,
    onNavigate,
    onLogout,
    embedded: true,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── 공용 상단 헤더 ── */}
      <AppNavHeader
        activePage={"business-manage" as AppNavPage}
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* ── 서브탭 바 · DisplayPage 서브탭 스타일 벤치마크 ── */}
      <div className="bg-white border-b border-slate-200 w-full shrink-0">
        <div className="max-w-[1360px] mx-auto px-2 sm:px-5 w-full overflow-x-auto scrollbar-none">
          <div className="flex flex-nowrap items-stretch gap-0">
            {TABS.map(t => {
              const active = subTab === t.key;
              const Icon = t.icon;
              const c = SUBTAB_COLORS[t.color];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSubTab(t.key)}
                  className={[
                    "relative flex items-center gap-2 sm:gap-2.5",
                    "px-4 sm:px-6 py-3.5 sm:py-4",
                    "text-[16px] sm:text-[18px] font-black leading-none whitespace-nowrap",
                    "transition-colors duration-150 cursor-pointer outline-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300",
                    "active:opacity-70",
                    active ? c.text : `text-slate-500 ${c.hoverText}`,
                  ].join(" ")}
                  title={t.label}
                >
                  <Icon
                    size={19}
                    weight="fill"
                    className={`shrink-0 sm:size-[20px] transition-colors duration-150 ${active ? c.iconActive : "text-slate-400"}`}
                  />
                  <span>{t.label}</span>
                  {active && (
                    <span className={`absolute left-0 right-0 -bottom-px h-[2.5px] ${c.bar} rounded-t-sm`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 서브탭 컨텐츠 ── */}
      <main className="flex-1 flex flex-col min-h-0">
        {subTab === "staff-manage" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">직원관리 로딩 중...</div>}>
            <StaffManagePage />
          </Suspense>
        )}
        {subTab === "leave" && (
          <LeavePage {...commonSubPageProps} />
        )}
        {subTab === "lunch" && (
          <LunchPage {...commonSubPageProps} />
        )}
        {subTab === "permissions" && (
          <PermissionsPage {...commonSubPageProps} />
        )}
        {subTab === "hr-forms" && (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-slate-400 text-sm font-bold py-16">각종 양식 로딩 중...</div>}>
            <HrFormsPage {...commonSubPageProps} />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default BusinessManagePage;
