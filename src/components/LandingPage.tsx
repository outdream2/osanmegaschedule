// src/components/LandingPage.tsx
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  Calendar,
  CalendarCheck,
  ChevronRight,
  MapPin,
  Clock,
  LayoutGrid,
  Lock,
  X,
  Shield,
  User,
} from "lucide-react";
import type { AuthSession } from "../types";

interface LandingPageProps {
  onNavigate: (page: "schedule" | "reservation" | "display", auth?: AuthSession) => void;
}

type AuthTab = "admin" | "employee";

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  // Which protected page the user wants to enter (null = modal closed)
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | null>(null);

  // Active tab inside the auth modal
  const [activeTab, setActiveTab] = useState<AuthTab>("admin");

  // Admin tab state
  const [pin, setPin] = useState("");
  const [adminError, setAdminError] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Employee tab state
  const [empNumber, setEmpNumber] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const empNumberRef = useRef<HTMLInputElement>(null);

  // Reset modal state whenever it opens
  useEffect(() => {
    if (pendingPage) {
      setActiveTab("admin");
      setPin("");
      setAdminError(false);
      setEmpNumber("");
      setEmpPassword("");
      setEmpError(null);
      setEmpLoading(false);
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  }, [pendingPage]);

  // Focus the correct input on tab switch
  useEffect(() => {
    if (!pendingPage) return;
    setTimeout(() => {
      if (activeTab === "admin") pinInputRef.current?.focus();
      else empNumberRef.current?.focus();
    }, 50);
  }, [activeTab, pendingPage]);

  const closeModal = () => {
    setPendingPage(null);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === "1234") {
      const page = pendingPage!;
      setPendingPage(null);
      setPin("");
      onNavigate(page, { role: "admin" });
    } else {
      setAdminError(true);
      setPin("");
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empNumber.trim() || !empPassword) {
      setEmpError("사번과 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setEmpLoading(true);
    setEmpError(null);
    try {
      const res = await axios.post("/api/auth/login", {
        employee_id: parseInt(empNumber.trim()),
        password: empPassword,
      });
      const { id, name } = res.data ?? {};
      if (!id) {
        setEmpError("사번 또는 비밀번호가 올바르지 않습니다");
        setEmpLoading(false);
        return;
      }
      const page = pendingPage!;
      setPendingPage(null);
      setEmpNumber("");
      setEmpPassword("");
      onNavigate(page, {
        role: "employee",
        employeeId: id,
        employeeName: name,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 400) {
        setEmpError("사번 또는 비밀번호가 올바르지 않습니다");
      } else {
        setEmpError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setEmpPassword("");
    } finally {
      setEmpLoading(false);
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

      {/* Auth modal: tabs for admin (PIN) vs employee (사번 + 비밀번호) */}
      {pendingPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <Lock size={15} className="text-indigo-400" />
                </div>
                <span className="text-white font-bold text-sm">직원 전용 접근</span>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-slate-300 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-800/70 border border-slate-700 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => setActiveTab("admin")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "admin"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Shield size={13} />
                <span>관리자</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("employee")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "employee"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User size={13} />
                <span>직원</span>
              </button>
            </div>

            {activeTab === "admin" ? (
              <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-slate-400 text-xs font-semibold block mb-2">관리자 비밀번호</label>
                  <input
                    ref={pinInputRef}
                    type="password"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setAdminError(false); }}
                    placeholder="••••"
                    className={`w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-center text-lg tracking-[0.5em] font-black focus:outline-none focus:border-indigo-500 transition ${
                      adminError ? "border-rose-500 animate-pulse" : "border-slate-600"
                    }`}
                    maxLength={10}
                    autoComplete="off"
                  />
                  {adminError && (
                    <p className="text-rose-400 text-xs font-semibold mt-2 text-center">비밀번호가 올바르지 않습니다.</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition cursor-pointer text-sm"
                >
                  관리자로 입장하기
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-3">
                <p className="text-slate-400 text-xs text-center">사번 + 비밀번호로 입장합니다</p>
                <div>
                  <label className="text-slate-400 text-xs font-semibold block mb-1.5">사번</label>
                  <input
                    ref={empNumberRef}
                    type="number"
                    inputMode="numeric"
                    value={empNumber}
                    onChange={(e) => { setEmpNumber(e.target.value); setEmpError(null); }}
                    placeholder="숫자 사번 입력 (예: 3)"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3.5 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 transition"
                    autoComplete="username"
                    disabled={empLoading}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-semibold block mb-1.5">비밀번호</label>
                  <input
                    type="password"
                    value={empPassword}
                    onChange={(e) => { setEmpPassword(e.target.value); setEmpError(null); }}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3.5 py-2.5 text-white text-sm font-semibold focus:outline-none focus:border-indigo-500 transition"
                    autoComplete="current-password"
                    disabled={empLoading}
                  />
                </div>
                {empError && (
                  <p className="text-rose-400 text-xs font-semibold text-center">{empError}</p>
                )}
                <button
                  type="submit"
                  disabled={empLoading}
                  className="w-full py-3 mt-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {empLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>로그인 중...</span>
                    </>
                  ) : (
                    <span>직원으로 입장하기</span>
                  )}
                </button>
                <p className="text-[10px] text-slate-500 text-center mt-1 leading-relaxed">
                  비밀번호는 관리자가 설정합니다. 분실 시 관리자에게 문의해 주세요.
                </p>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
