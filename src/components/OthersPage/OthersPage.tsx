// src/components/OthersPage/OthersPage.tsx
// 2026-08-03 · 기타 도구 페이지 · 관리자용 · 잘 안 쓰이는 페이지 링크 카드 그리드
//   - 재고·판매 통합 (InventorySalesPage) · sky
//   - OCR 동의어 관리 (SynonymPage) · amber
// 미로그인/일반 직원은 접근 제한 (관리자 level 2+ 만)
//
// 2026-08-03 (#199) · #185 UI 리포트 · inline gradient → Tailwind 클래스 · 페이지 헤더 크기 상향 (Level 1)
import React from "react";
import { BarChart2, BookOpen, ChevronRight, LayoutGrid } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

interface OthersPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

interface ToolCard {
  key: "inventory-sales" | "synonyms";
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  cta: string;
  // Tailwind 정적 클래스 (JIT purge 안전) · #199 · inline gradient 제거
  borderHover: string;
  iconBg: string;      // 아이콘 컨테이너 gradient (Tailwind bg-gradient-* + from-*/to-*)
  iconBorder: string;  // 아이콘 컨테이너 border
  iconText: string;
  ctaText: string;
  overlayBg: string;   // hover overlay gradient (Tailwind)
}

const CARDS: ToolCard[] = [
  {
    key: "inventory-sales",
    title: "재고·판매 통합",
    subtitle: "상품·매출·재고 통합 뷰 (구 페이지)",
    Icon: BarChart2,
    cta: "열기",
    borderHover: "hover:border-sky-300",
    iconBg: "bg-gradient-to-br from-sky-100 to-sky-200",
    iconBorder: "border border-sky-300",
    iconText: "text-sky-600",
    ctaText: "text-sky-600",
    overlayBg: "bg-gradient-to-br from-sky-100/70 to-transparent",
  },
  {
    key: "synonyms",
    title: "OCR 동의어 관리",
    subtitle: "상품·공급사 동의어 사전 편집",
    Icon: BookOpen,
    cta: "열기",
    borderHover: "hover:border-amber-300",
    iconBg: "bg-gradient-to-br from-amber-100 to-amber-200",
    iconBorder: "border border-amber-300",
    iconText: "text-amber-600",
    ctaText: "text-amber-600",
    overlayBg: "bg-gradient-to-br from-amber-100/70 to-transparent",
  },
];

export const OthersPage: React.FC<OthersPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isManagerOrAdmin = userLevel >= 2;

  // AppNavHeader 는 onNavigate(AppNavPage) 시그니처 · 내부 문자열을 그대로 전달
  const handleHeaderNav = (page: AppNavPage) => onNavigate(page);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/40">
      <div className="sticky top-0 z-30">
        <AppNavHeader
          activePage={"others" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={handleHeaderNav}
          onLogout={onLogout}
        />
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* 제목 헤더 · Level 1 · 16~17px (#199 · #185 리포트 · 페이지 헤더 크기 통일) */}
        <div className="flex items-center gap-2 mb-4 sm:mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-slate-500 to-slate-400 shadow-sm">
            <LayoutGrid size={16} className="text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[16px] sm:text-[17px] font-black text-slate-800 tracking-tight">기타 도구</span>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-300 to-transparent" />
        </div>

        {!isManagerOrAdmin ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm shadow-sm">
            관리자 권한이 필요합니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {CARDS.map((card) => {
              const Icon = card.Icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onNavigate(card.key)}
                  className={`group relative bg-white border border-slate-200/80 ${card.borderHover} rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm`}
                >
                  <div
                    className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${card.overlayBg}`}
                  />
                  <div className="relative">
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-200 group-hover:scale-105 ${card.iconBg} ${card.iconBorder}`}
                    >
                      <Icon size={20} className={card.iconText} strokeWidth={2} />
                    </div>
                    <div className="text-slate-800 font-bold text-sm sm:text-[15px] mb-0.5 tracking-tight leading-tight">
                      {card.title}
                    </div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">
                      {card.subtitle}
                    </div>
                    <div className={`flex items-center gap-1 mt-3 ${card.ctaText} text-xs font-bold`}>
                      <span className="text-[11px] sm:text-xs">{card.cta}</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default OthersPage;
