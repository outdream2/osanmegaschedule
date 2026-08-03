// src/components/PharmacistPage/PharmacistPage.tsx
// 2026-08-03 · 약사 전용 페이지
//   - 교육자료 (동영상·PDF·문서 업로드/다운로드)
//   - 향후 · 약사 전용 도구·기능 추가 예정
// 관리자만 업로드 · 약사(및 관리자) 다운로드 · 미로그인 접근 제한

import React, { useState } from "react";
import { FirstAid, BookOpen, Video, FileText, GraduationCap } from "@phosphor-icons/react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

interface PharmacistPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: AppNavPage) => void;
  onLogout: () => void;
}

interface ToolCard {
  key: string;
  title: string;
  subtitle: string;
  Icon: React.ComponentType<{ size?: number; className?: string; weight?: any }>;  // eslint-disable-line @typescript-eslint/no-explicit-any
  color: "sky" | "emerald" | "violet" | "amber" | "rose";
}

// 향후 확장 · 약사 전용 도구
const TOOLS: ToolCard[] = [
  {
    key: "education",
    title: "교육자료",
    subtitle: "약사 교육 · 동영상·PDF·문서",
    Icon: GraduationCap,
    color: "sky",
  },
  {
    key: "reference",
    title: "복약지도 참고",
    subtitle: "약물 상호작용·부작용 자료 (준비 중)",
    Icon: BookOpen,
    color: "emerald",
  },
  {
    key: "video",
    title: "동영상 강의",
    subtitle: "약사회·제약사 교육 영상 (준비 중)",
    Icon: Video,
    color: "violet",
  },
  {
    key: "docs",
    title: "각종 문서",
    subtitle: "안내문·양식·매뉴얼 (준비 중)",
    Icon: FileText,
    color: "amber",
  },
];

const COLOR: Record<string, { bg: string; text: string; border: string; hover: string }> = {
  sky:     { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     hover: "hover:border-sky-400" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", hover: "hover:border-emerald-400" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200",  hover: "hover:border-violet-400" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   hover: "hover:border-amber-400" },
  rose:    { bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    hover: "hover:border-rose-400" },
};

export const PharmacistPage: React.FC<PharmacistPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50/40 via-white to-emerald-50/30">
      <div className="sticky top-0 z-30">
        <AppNavHeader
          activePage={"pharmacist" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm">
            <FirstAid size={20} className="text-white" weight="fill" />
          </div>
          <div>
            <h1 className="text-[17px] sm:text-[18px] font-black text-slate-800 tracking-tight leading-tight">약사 전용</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">약사 교육자료 · 참고 문서 · 관리 도구</p>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-slate-300 to-transparent" />
        </div>

        {selectedTool === "education" ? (
          <ComingSoon title="교육자료" subtitle="Supabase Storage 업로드/다운로드 페이지 · 곧 구현 예정" onBack={() => setSelectedTool(null)} />
        ) : selectedTool ? (
          <ComingSoon title={TOOLS.find(t => t.key === selectedTool)?.title ?? "준비 중"} subtitle="이 도구는 곧 구현 예정입니다" onBack={() => setSelectedTool(null)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
            {TOOLS.map(card => {
              const Icon = card.Icon;
              const c = COLOR[card.color];
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setSelectedTool(card.key)}
                  className={`group relative bg-white border-2 ${c.border} ${c.hover} rounded-2xl p-4 sm:p-5 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm`}
                >
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-3 ${c.bg}`}>
                    <Icon size={22} className={c.text} weight="fill" />
                  </div>
                  <div className="text-slate-800 font-black text-[14px] sm:text-[15px] mb-1 leading-tight">
                    {card.title}
                  </div>
                  <div className="text-slate-500 text-[12px] leading-snug">
                    {card.subtitle}
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

const ComingSoon: React.FC<{ title: string; subtitle: string; onBack: () => void }> = ({ title, subtitle, onBack }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm flex flex-col items-center gap-3">
    <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-500 flex items-center justify-center">
      <FirstAid size={28} weight="fill" />
    </div>
    <h2 className="text-base font-black text-slate-800">{title}</h2>
    <p className="text-[13px] text-slate-500 leading-snug max-w-md">{subtitle}</p>
    <button
      type="button"
      onClick={onBack}
      className="mt-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-bold transition cursor-pointer"
    >
      ← 도구 목록으로
    </button>
  </div>
);

export default PharmacistPage;
