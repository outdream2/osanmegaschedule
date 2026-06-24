// src/components/LandingPage.tsx
import React from "react";
import {
  Calendar,
  CalendarCheck,
  ChevronRight,
  MapPin,
  Clock,
  LayoutGrid,
} from "lucide-react";

interface LandingPageProps {
  onNavigate: (page: "schedule" | "reservation" | "display") => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">

      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[200px] bg-red-600/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[220px] bg-violet-600/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-4xl">

        {/* Brand */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <Calendar size={20} className="text-white" />
          </div>
          <div className="leading-none">
            <div className="font-black tracking-tight">
              <span className="text-red-500 text-3xl">OSAN</span>
              <span className="text-white text-2xl"> MEGATOWN</span>
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-sm font-medium mb-12 tracking-wide">
          오산 메가타운 약국 · 통합 관리 시스템
        </p>

        {/* Three cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">

          {/* 스케줄표 조회 */}
          <button
            onClick={() => onNavigate("schedule")}
            className="group relative bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-indigo-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-indigo-600/15 border border-indigo-500/30 flex items-center justify-center mb-4 group-hover:bg-indigo-600/25 transition-colors">
                <Calendar size={22} className="text-indigo-400" />
              </div>
              <div className="text-white font-bold text-lg mb-1 tracking-tight">스케줄표 조회</div>
              <div className="text-slate-400 text-sm leading-relaxed">직원 월간 근무 스케줄 확인 및 관리</div>
              <div className="flex items-center gap-1 mt-4 text-indigo-400 text-xs font-semibold">
                <span>입장하기</span>
                <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </button>

          {/* 방문예약 */}
          <button
            onClick={() => onNavigate("reservation")}
            className="group relative bg-slate-900 border border-slate-700 hover:border-emerald-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-emerald-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:bg-emerald-600/25 transition-colors">
                <CalendarCheck size={22} className="text-emerald-400" />
              </div>
              <div className="text-white font-bold text-lg mb-1 tracking-tight">방문예약</div>
              <div className="text-slate-400 text-sm leading-relaxed">상담 및 방문 일정을 간편하게 예약</div>
              <div className="flex items-center gap-1 mt-4 text-emerald-400 text-xs font-semibold">
                <span>예약하기</span>
                <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </button>

          {/* 매장진열 관리 */}
          <button
            onClick={() => onNavigate("display")}
            className="group relative bg-slate-900 border border-slate-700 hover:border-violet-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-violet-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center mb-4 group-hover:bg-violet-600/25 transition-colors">
                <LayoutGrid size={22} className="text-violet-400" />
              </div>
              <div className="text-white font-bold text-lg mb-1 tracking-tight">매장진열 관리</div>
              <div className="text-slate-400 text-sm leading-relaxed">진열대 상태 점검 및 보충 요청 관리</div>
              <div className="flex items-center gap-1 mt-4 text-violet-400 text-xs font-semibold">
                <span>관리하기</span>
                <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </button>

        </div>

        {/* Footer info */}
        <div className="flex items-center gap-4 mt-10 text-slate-600 text-[11px] font-medium">
          <span className="flex items-center gap-1.5">
            <MapPin size={11} />
            경기도 오산시 메가타운
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span className="flex items-center gap-1.5">
            <Clock size={11} />
            09:00 – 22:00
          </span>
        </div>

      </div>
    </div>
  );
};
