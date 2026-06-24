// src/components/LandingPage.tsx
import React, { useState, useRef, useEffect } from "react";
import {
  Calendar,
  CalendarCheck,
  ChevronRight,
  MapPin,
  Clock,
  LayoutGrid,
  Lock,
  X,
} from "lucide-react";

interface LandingPageProps {
  onNavigate: (page: "schedule" | "reservation" | "display") => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingPage) {
      setPin("");
      setError(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingPage]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === "1234") {
      const page = pendingPage!;
      setPendingPage(null);
      setPin("");
      onNavigate(page);
    } else {
      setError(true);
      setPin("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[200px] bg-red-600/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[400px] h-[220px] bg-violet-600/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-3xl">

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
        <p className="text-slate-400 text-sm font-medium mb-10 tracking-wide">
          오산 메가타운 약국 · 통합 관리 시스템
        </p>

        {/* 직원용 섹션 */}
        <div className="w-full mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Lock size={12} className="text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">직원용</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* 스케줄표 조회 */}
            <button
              onClick={() => setPendingPage("schedule")}
              className="group relative bg-slate-900 border border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-indigo-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-3 right-3 opacity-30 group-hover:opacity-60 transition-opacity">
                <Lock size={13} className="text-indigo-400" />
              </div>
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

            {/* 매장진열 관리 */}
            <button
              onClick={() => setPendingPage("display")}
              className="group relative bg-slate-900 border border-slate-700 hover:border-violet-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-violet-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-3 right-3 opacity-30 group-hover:opacity-60 transition-opacity">
                <Lock size={13} className="text-violet-400" />
              </div>
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
        </div>

        {/* 외부용 섹션 */}
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">외부용</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* 방문예약 */}
            <button
              onClick={() => onNavigate("reservation")}
              className="group relative bg-slate-900 border border-slate-700 hover:border-emerald-500 rounded-2xl p-6 text-left transition-all duration-200 hover:bg-slate-800 hover:shadow-xl hover:shadow-emerald-900/20 active:scale-[0.98] cursor-pointer overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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

          </div>
        </div>

        {/* Footer */}
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

      {/* Password modal */}
      {pendingPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
          onClick={() => setPendingPage(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <Lock size={15} className="text-indigo-400" />
                </div>
                <span className="text-white font-bold text-sm">직원 전용 접근</span>
              </div>
              <button
                onClick={() => setPendingPage(null)}
                className="text-slate-500 hover:text-slate-300 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-slate-400 text-xs font-semibold block mb-2">비밀번호 입력</label>
                <input
                  ref={inputRef}
                  type="password"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value); setError(false); }}
                  placeholder="••••"
                  className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-center text-lg tracking-[0.5em] font-black focus:outline-none focus:border-indigo-500 transition ${
                    error ? "border-rose-500 animate-pulse" : "border-slate-600"
                  }`}
                  maxLength={10}
                  autoComplete="off"
                />
                {error && (
                  <p className="text-rose-400 text-xs font-semibold mt-2 text-center">비밀번호가 올바르지 않습니다.</p>
                )}
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition cursor-pointer text-sm"
              >
                입장하기
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
