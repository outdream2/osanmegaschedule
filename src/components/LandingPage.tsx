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
  LogOut,
  AlertCircle,
  ScanLine,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import type { AuthSession } from "../types";

interface LandingPageProps {
  authSession: AuthSession | null;
  onNavigate: (page: "schedule" | "reservation" | "display" | "scan", auth?: AuthSession) => void;
  onLogout: () => void;
}

type AuthTab = "admin" | "employee";

export const LandingPage: React.FC<LandingPageProps> = ({ authSession, onNavigate, onLogout }) => {
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | null>(null);
  const [activeTab, setActiveTab] = useState<AuthTab>("employee");

  const [pin, setPin] = useState("");
  const [adminError, setAdminError] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Product list upload (manager only)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; count?: number; msg?: string } | null>(null);
  const [importLog, setImportLog] = useState<{ timestamp: string; count: number }[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [empNumber, setEmpNumber] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const empNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingPage) {
      setActiveTab("employee");
      setPin("");
      setAdminError(false);
      setEmpNumber("");
      setEmpPassword("");
      setEmpError(null);
      setEmpLoading(false);
      setTimeout(() => empNumberRef.current?.focus(), 50);
    }
  }, [pendingPage]);

  useEffect(() => {
    if (!pendingPage) return;
    setTimeout(() => {
      if (activeTab === "admin") pinInputRef.current?.focus();
      else empNumberRef.current?.focus();
    }, 50);
  }, [activeTab, pendingPage]);

  const closeModal = () => setPendingPage(null);

  // If already logged in, go directly; otherwise open login modal
  const handleMenuClick = (page: "schedule" | "display") => {
    if (authSession) {
      onNavigate(page, authSession);
    } else {
      setPendingPage(page);
    }
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === "1234") {
      const page = pendingPage!;
      setPendingPage(null);
      setPin("");
      onNavigate(page, { role: "superadmin" });
    } else {
      setAdminError(true);
      setPin("");
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  };

  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = empNumber.trim().replace(/[^0-9]/g, "");
    if (!phone || !empPassword) {
      setEmpError("전화번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setEmpLoading(true);
    setEmpError(null);
    try {
      const res = await axios.post("/api/auth/login", {
        employee_id: phone,
        password: empPassword,
      });
      const { id, name, role } = res.data ?? {};
      if (!id) {
        setEmpError("전화번호 또는 비밀번호가 올바르지 않습니다");
        setEmpLoading(false);
        return;
      }
      const page = pendingPage!;
      setPendingPage(null);
      setEmpNumber("");
      setEmpPassword("");
      onNavigate(page, { role: role === "manager" ? "manager" : "employee", employeeId: id, employeeName: name });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 400) {
        setEmpError("전화번호 또는 비밀번호가 올바르지 않습니다");
      } else {
        setEmpError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setEmpPassword("");
    } finally {
      setEmpLoading(false);
    }
  };

  const fetchImportLog = async () => {
    try {
      const res = await axios.get("/api/settings?key=product_import_log");
      const logs = Array.isArray(res.data?.value) ? res.data.value : [];
      setImportLog(logs);
    } catch { setImportLog([]); }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const canUpload = isSuperAdmin || (isManagerRole && !!authSession?.employeeId);
    if (!canUpload) return;
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const params = isSuperAdmin && !authSession?.employeeId
        ? "adminKey=1234"
        : `managerId=${authSession!.employeeId}`;
      const buf = await uploadFile.arrayBuffer();
      const res = await axios.post(`/api/upload-products?${params}`, buf, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      setUploadResult({ ok: true, count: res.data.count });
      await fetchImportLog();
    } catch (err: any) {
      setUploadResult({ ok: false, msg: err?.response?.data?.error ?? "업로드 실패" });
    } finally {
      setUploadLoading(false);
    }
  };

  const isSuperAdmin = authSession?.role === "superadmin" || authSession?.role === "admin";
  const isManagerRole = authSession?.role === "manager";
  const isAdmin = isSuperAdmin;
  const isEmployee = authSession?.role === "employee";
  const isLoggedIn = !!authSession;

  const roleLabel = isSuperAdmin ? "최고관리자" : isManagerRole ? "관리자" : (authSession?.employeeName ?? "직원");

  // Permission check per menu
  const canAccess = (page: "schedule" | "display"): boolean => {
    if (!isLoggedIn) return false;
    if (isSuperAdmin || isManagerRole) return true;
    if (isEmployee && page === "schedule") return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Calendar size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="text-gray-900 text-base"> MEGATOWN</span>
          </span>
        </div>

        {isLoggedIn ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold">
              {(isSuperAdmin || isManagerRole) ? <Shield size={11} /> : <User size={11} />}
              <span className="max-w-[80px] truncate">{roleLabel}</span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-gray-500 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 transition cursor-pointer"
            >
              <LogOut size={11} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Lock size={11} />
            <span className="hidden sm:inline">로그인 필요</span>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden py-10">

        {/* Background effects */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-400/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[200px] bg-red-400/8 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">

          <p className="text-gray-500 text-sm font-medium mb-10 tracking-wide">
            오산 메가타운 약국 · 통합 관리 시스템
          </p>

          {/* 직원용 */}
          <div className="w-full mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Lock size={12} className="text-gray-400" />
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">직원용</span>
              <div className="flex-1 h-px bg-gray-200" />
              {!isLoggedIn && (
                <span className="text-[10px] text-gray-400 font-medium">로그인 후 이용 가능</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">

              {/* 스케줄표 조회 */}
              <button
                onClick={() => handleMenuClick("schedule")}
                className="group relative bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-4 sm:p-6 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {!isLoggedIn && (
                  <div className="absolute top-3 right-3 opacity-40 group-hover:opacity-70 transition-opacity">
                    <Lock size={13} className="text-indigo-400" />
                  </div>
                )}
                <div className="relative">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-indigo-200 transition-colors">
                    <Calendar size={18} className="text-indigo-600 sm:hidden" />
                    <Calendar size={22} className="text-indigo-600 hidden sm:block" />
                  </div>
                  <div className="text-gray-900 font-bold text-sm sm:text-lg mb-0.5 sm:mb-1 tracking-tight">스케줄표 조회</div>
                  <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">직원 월간 근무 스케줄 확인 및 관리</div>
                  <div className={`flex items-center gap-1 mt-2 sm:mt-4 text-xs font-bold ${isLoggedIn || !isLoggedIn ? "text-indigo-600" : "text-gray-400"}`}>
                    <span className="text-[11px] sm:text-xs">{isLoggedIn ? "입장하기" : "로그인 필요"}</span>
                    <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>

              {/* 매장진열 관리 — admin only */}
              {(isAdmin || !isLoggedIn) && (
                <button
                  onClick={() => handleMenuClick("display")}
                  className="group relative bg-white border border-gray-200 hover:border-violet-400 rounded-2xl p-4 sm:p-6 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {!isLoggedIn && (
                    <div className="absolute top-3 right-3 opacity-40 group-hover:opacity-70 transition-opacity">
                      <Lock size={13} className="text-violet-400" />
                    </div>
                  )}
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-violet-200 transition-colors">
                      <LayoutGrid size={18} className="text-violet-600 sm:hidden" />
                      <LayoutGrid size={22} className="text-violet-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-sm sm:text-lg mb-0.5 sm:mb-1 tracking-tight">매장진열 관리</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">진열대 상태 점검 및 보충 요청 관리</div>
                    <div className="flex items-center gap-1 mt-2 sm:mt-4 text-violet-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{isLoggedIn ? "관리하기" : "로그인 필요"}</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* 상품 스캔 — 로그인한 직원 */}
              {(isLoggedIn || !isLoggedIn) && (
                <button
                  onClick={() => isLoggedIn ? onNavigate("scan") : setPendingPage("schedule")}
                  className="group relative bg-white border border-gray-200 hover:border-teal-400 rounded-2xl p-4 sm:p-6 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {!isLoggedIn && (
                    <div className="absolute top-3 right-3 opacity-40 group-hover:opacity-70 transition-opacity">
                      <Lock size={13} className="text-teal-400" />
                    </div>
                  )}
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-teal-200 transition-colors">
                      <ScanLine size={18} className="text-teal-600 sm:hidden" />
                      <ScanLine size={22} className="text-teal-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-sm sm:text-lg mb-0.5 sm:mb-1 tracking-tight">상품 스캔</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">바코드 스캔으로 진열 보충 요청</div>
                    <div className="flex items-center gap-1 mt-2 sm:mt-4 text-teal-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{isLoggedIn ? "스캔하기" : "로그인 필요"}</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              )}

              {/* 상품 목록 관리 — 관리자 전용 */}
              {(isSuperAdmin || isManagerRole) && (
                <button
                  onClick={() => { setUploadOpen(true); setUploadResult(null); setUploadFile(null); fetchImportLog(); }}
                  className="group relative bg-white border border-gray-200 hover:border-orange-400 rounded-2xl p-4 sm:p-6 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-orange-200 transition-colors">
                      <FileSpreadsheet size={18} className="text-orange-600 sm:hidden" />
                      <FileSpreadsheet size={22} className="text-orange-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-sm sm:text-lg mb-0.5 sm:mb-1 tracking-tight">상품 목록 관리</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">xlsx 파일 업로드로 상품 DB 갱신</div>
                    <div className="flex items-center gap-1 mt-2 sm:mt-4 text-orange-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">업로드하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* 외부용 */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">외부용</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => onNavigate("reservation")}
                className="group relative bg-white border border-gray-200 hover:border-emerald-400 rounded-2xl p-4 sm:p-6 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-emerald-200 transition-colors">
                    <CalendarCheck size={18} className="text-emerald-600 sm:hidden" />
                    <CalendarCheck size={22} className="text-emerald-600 hidden sm:block" />
                  </div>
                  <div className="text-gray-900 font-bold text-sm sm:text-lg mb-0.5 sm:mb-1 tracking-tight">방문예약</div>
                  <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">상담 및 방문 일정을 간편하게 예약</div>
                  <div className="flex items-center gap-1 mt-2 sm:mt-4 text-emerald-600 text-xs font-bold">
                    <span className="text-[11px] sm:text-xs">예약하기</span>
                    <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>

            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 mt-10 text-gray-400 text-[11px] font-medium">
            <span className="flex items-center gap-1.5">
              <MapPin size={11} />
              경기도 오산시 메가타운
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              09:00 – 22:00
            </span>
          </div>
        </div>
      </div>

      {/* ── Product upload modal ── */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4" onClick={() => setUploadOpen(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <FileSpreadsheet size={15} className="text-orange-600" />
                </div>
                <span className="text-gray-900 font-bold text-sm">상품 목록 업로드</span>
              </div>
              <button onClick={() => setUploadOpen(false)} className="text-gray-400 hover:text-gray-700 transition cursor-pointer"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              xlsx 파일을 업로드하면 전체 상품 데이터가 DB에 임포트됩니다.<br />
              <span className="text-gray-400">기존 데이터는 모두 덮어씁니다.</span>
            </p>
            {uploadResult?.ok ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 size={36} className="text-emerald-500" />
                <p className="text-sm font-bold text-emerald-700">업로드 완료</p>
                <p className="text-xs text-gray-500">{uploadResult.count?.toLocaleString()}개 상품 등록됨</p>
                <button onClick={() => setUploadOpen(false)} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">닫기</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-orange-400 text-gray-500 hover:text-orange-600 text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Upload size={16} />
                  {uploadFile ? uploadFile.name : "파일 선택 (.xlsx)"}
                </button>
                {uploadResult?.ok === false && (
                  <p className="text-xs text-rose-500 font-semibold text-center">{uploadResult.msg}</p>
                )}
                <button
                  type="button"
                  disabled={!uploadFile || uploadLoading}
                  onClick={handleUpload}
                  className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {uploadLoading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중...</span></> : <><Upload size={14} /><span>DB 임포트</span></>}
                </button>
              </div>
            )}
            {/* Import log */}
            {importLog.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">임포트 이력</p>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                  {importLog.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">
                        {new Date(entry.timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`font-semibold ${i === 0 ? "text-orange-600" : "text-gray-400"}`}>
                        {entry.count.toLocaleString()}개
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Auth modal ── */}
      {pendingPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Lock size={15} className="text-indigo-600" />
                </div>
                <span className="text-gray-900 font-bold text-sm">직원 전용 접근</span>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4 ml-10 flex items-center gap-1">
              <AlertCircle size={11} />
              로그인이 필요한 메뉴입니다
            </p>

            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 border border-gray-200 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => setActiveTab("employee")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "employee" ? "bg-indigo-600 text-white shadow" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <User size={13} />
                <span>직원 로그인</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("admin")}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                  activeTab === "admin" ? "bg-indigo-600 text-white shadow" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Shield size={13} />
                <span>최고관리자</span>
              </button>
            </div>

            {activeTab === "admin" ? (
              <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="text-gray-600 text-xs font-semibold block mb-2">관리자 비밀번호</label>
                  <input
                    ref={pinInputRef}
                    type="password"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value); setAdminError(false); }}
                    placeholder="••••"
                    className={`w-full bg-white border rounded-xl px-4 py-3 text-gray-900 text-center text-lg tracking-[0.5em] font-black focus:outline-none focus:border-indigo-500 transition ${
                      adminError ? "border-rose-500 animate-pulse" : "border-gray-300"
                    }`}
                    maxLength={10}
                    autoComplete="off"
                  />
                  {adminError && (
                    <p className="text-rose-500 text-xs font-semibold mt-2 text-center">비밀번호가 올바르지 않습니다.</p>
                  )}
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer text-sm shadow-sm"
                >
                  관리자로 입장하기
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-3">
                <p className="text-gray-500 text-xs text-center">전화번호 + 비밀번호로 입장합니다</p>
                <div>
                  <label className="text-gray-600 text-xs font-semibold block mb-1.5">전화번호</label>
                  <input
                    ref={empNumberRef}
                    type="tel"
                    inputMode="numeric"
                    value={empNumber}
                    onChange={(e) => { setEmpNumber(e.target.value); setEmpError(null); }}
                    placeholder="숫자만 입력 (예: 01012345678)"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-gray-900 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition"
                    autoComplete="username"
                    disabled={empLoading}
                  />
                </div>
                <div>
                  <label className="text-gray-600 text-xs font-semibold block mb-1.5">비밀번호</label>
                  <input
                    type="password"
                    value={empPassword}
                    onChange={(e) => { setEmpPassword(e.target.value); setEmpError(null); }}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-gray-900 text-sm font-semibold focus:outline-none focus:border-indigo-500 transition"
                    autoComplete="current-password"
                    disabled={empLoading}
                  />
                </div>
                {empError && (
                  <p className="text-rose-500 text-xs font-semibold text-center">{empError}</p>
                )}
                <button
                  type="submit"
                  disabled={empLoading}
                  className="w-full py-3 mt-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  {empLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                      <span>로그인 중...</span>
                    </>
                  ) : (
                    <span>직원으로 입장하기</span>
                  )}
                </button>
                <p className="text-[10px] text-gray-400 text-center mt-1 leading-relaxed">
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
