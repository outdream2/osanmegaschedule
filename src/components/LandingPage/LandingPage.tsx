// src/components/LandingPage.tsx
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
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
  FileText,
  CheckCircle2,
  List,
  Eye,
  EyeOff,
  Pill,
} from "lucide-react";
import type { AuthSession } from "../../types";

interface LandingPageProps {
  authSession: AuthSession | null;
  onNavigate: (page: "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave", auth?: AuthSession) => void;
  onLogout: () => void;
  onAuthOnly?: (auth: AuthSession) => void;
}

type AuthTab = "admin" | "employee";

export const LandingPage: React.FC<LandingPageProps> = ({ authSession, onNavigate, onLogout, onAuthOnly }) => {
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | "scan" | "requests" | "ocr" | "upload" | "leave" | null>(null);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  const [requestsPendingCount, setRequestsPendingCount] = useState(0);
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
  const [showPassword, setShowPassword] = useState(false);
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
      setShowPassword(false);
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
      const page = pendingPage;
      setPendingPage(null);
      setPin("");
      const auth: AuthSession = { role: "superadmin" };
      onAuthOnly?.(auth);
      if (page === "upload") {
        setUploadOpen(true); setUploadResult(null); setUploadFile(null); fetchImportLog();
      }
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
      const page = pendingPage;
      setPendingPage(null);
      setEmpNumber("");
      setEmpPassword("");
      const auth: AuthSession = { role: role === "manager" ? "manager" : "employee", employeeId: id, employeeName: name };
      onAuthOnly?.(auth);
      if (page === "upload" && role === "manager") {
        setUploadOpen(true); setUploadResult(null); setUploadFile(null); fetchImportLog();
      }
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

  const handleClearImportLog = async () => {
    if (!confirm("임포트 이력을 모두 삭제할까요?")) return;
    await axios.delete("/api/product-import-log");
    setImportLog([]);
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
  const isManagerOrAdmin = isSuperAdmin || isManagerRole;

  // Load pending counts for managers
  useEffect(() => {
    if (!isManagerOrAdmin) return;
    fetch("/api/requests/pending-counts")
      .then(r => r.ok ? r.json() : {})
      .then((d: { leave?: number; display?: number; order?: number; mismatch?: number }) => {
        setLeavePendingCount(d.leave ?? 0);
        setRequestsPendingCount((d.display ?? 0) + (d.order ?? 0) + (d.mismatch ?? 0));
      })
      .catch(() => {});
  }, [isManagerOrAdmin]);

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

          {/* ── 관리자 도구 (관리자 로그인 시에만 표시) ── */}
          {isManagerOrAdmin && (
            <div className="w-full mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Shield size={12} className="text-violet-400" />
                <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest">관리자 도구</span>
                <div className="flex-1 h-px bg-violet-100" />
              </div>
              <div className="grid grid-cols-3 gap-3">

                {/* 매장진열 관리 */}
                <button onClick={() => onNavigate("display", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-violet-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-violet-100 border border-violet-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-violet-200 transition-colors">
                      <LayoutGrid size={16} className="text-violet-600 sm:hidden" /><LayoutGrid size={20} className="text-violet-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">매장진열 관리</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">진열대 상태 점검 및 보충 요청 관리</div>
                    <div className="flex items-center gap-1 mt-2 text-violet-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">관리하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 연차 승인 (관리자) */}
                <button onClick={() => onNavigate("leave", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-green-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {leavePendingCount > 0 && (
                    <div className="absolute top-3 right-3 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black shadow">
                      {leavePendingCount}
                    </div>
                  )}
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-green-100 border border-green-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-green-200 transition-colors">
                      <CalendarDays size={16} className="text-green-600 sm:hidden" /><CalendarDays size={20} className="text-green-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">연차 승인</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">직원 휴가·연차 신청 승인 처리</div>
                    <div className="flex items-center gap-1 mt-2 text-green-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">
                        {leavePendingCount > 0 ? `대기 ${leavePendingCount}건` : "확인하기"}
                      </span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 요청목록 조회 */}
                <button onClick={() => onNavigate("requests", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {requestsPendingCount > 0 && (
                    <div className="absolute top-2 right-2 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black shadow">
                      {requestsPendingCount}
                    </div>
                  )}
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-indigo-200 transition-colors">
                      <List size={16} className="text-indigo-600 sm:hidden" /><List size={20} className="text-indigo-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">요청목록 조회</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">진열·발주요청 및 배정구역 불일치 확인</div>
                    <div className="flex items-center gap-1 mt-2 text-indigo-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">
                        {requestsPendingCount > 0 ? `대기 ${requestsPendingCount}건` : "조회하기"}
                      </span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 상품 목록 관리 */}
                <button
                  onClick={() => { setUploadOpen(true); setUploadResult(null); setUploadFile(null); fetchImportLog(); }}
                  className="group relative bg-white border border-gray-200 hover:border-orange-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-orange-200 transition-colors">
                      <FileSpreadsheet size={16} className="text-orange-600 sm:hidden" /><FileSpreadsheet size={20} className="text-orange-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">상품 목록 관리</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">xlsx 파일 업로드로 상품 DB 갱신</div>
                    <div className="flex items-center gap-1 mt-2 text-orange-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">업로드하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 거래명세서 OCR */}
                <button onClick={() => onNavigate("ocr", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-amber-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-amber-200 transition-colors">
                      <FileText size={16} className="text-amber-600 sm:hidden" /><FileText size={20} className="text-amber-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">거래명세서 OCR</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">PDF 업로드로 거래명세서 자동 추출</div>
                    <div className="flex items-center gap-1 mt-2 text-amber-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">추출하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* ── 직원용 (로그인 시에만 표시) ── */}
          {isLoggedIn && (
            <div className="w-full mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Lock size={12} className="text-gray-400" />
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">직원용</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-3 gap-3">

                {/* 스케줄표 조회 */}
                <button onClick={() => onNavigate("schedule", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-indigo-200 transition-colors">
                      <Calendar size={16} className="text-indigo-600 sm:hidden" /><Calendar size={20} className="text-indigo-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">스케줄표 조회</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">직원 월간 근무 스케줄 확인 및 관리</div>
                    <div className="flex items-center gap-1 mt-2 text-indigo-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">입장하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 상품 스캔 */}
                <button onClick={() => onNavigate("scan", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-teal-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-teal-200 transition-colors">
                      <ScanLine size={16} className="text-teal-600 sm:hidden" /><ScanLine size={20} className="text-teal-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">상품 스캔</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">바코드 스캔으로 진열 보충 요청</div>
                    <div className="flex items-center gap-1 mt-2 text-teal-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">스캔하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 연차 신청 */}
                <button onClick={() => onNavigate("leave", authSession!)}
                  className="group relative bg-white border border-gray-200 hover:border-green-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-green-100 border border-green-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-green-200 transition-colors">
                      <CalendarDays size={16} className="text-green-600 sm:hidden" /><CalendarDays size={20} className="text-green-600 hidden sm:block" />
                    </div>
                    <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">연차 신청</div>
                    <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">휴가·연차 신청 및 내역 조회</div>
                    <div className="flex items-center gap-1 mt-2 text-green-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">신청하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* ── 비로그인 안내 ── */}
          {!isLoggedIn && (
            <div className="w-full mb-6">
              <button
                onClick={() => setPendingPage("schedule")}
                className="w-full group flex items-center justify-between bg-indigo-50 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100 rounded-2xl px-5 py-4 transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                    <Lock size={16} className="text-indigo-500" />
                  </div>
                  <div className="text-left">
                    <div className="text-indigo-700 font-bold text-sm">직원 로그인</div>
                    <div className="text-indigo-500 text-xs">스케줄표·연차신청·스캔 등 이용 가능</div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          )}

          {/* ── 외부용 ── */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">외부용</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => onNavigate("reservation")}
                className="group relative bg-white border border-gray-200 hover:border-emerald-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-md active:scale-[0.98] cursor-pointer overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-emerald-200 transition-colors">
                    <CalendarCheck size={16} className="text-emerald-600 sm:hidden" /><CalendarCheck size={20} className="text-emerald-600 hidden sm:block" />
                  </div>
                  <div className="text-gray-900 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">방문예약</div>
                  <div className="text-gray-500 text-xs sm:text-sm leading-relaxed hidden sm:block">상담 및 방문 일정을 간편하게 예약</div>
                  <div className="flex items-center gap-1 mt-2 text-emerald-600 text-xs font-bold">
                    <span className="text-[11px] sm:text-xs">예약하기</span>
                    <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 mt-10 text-gray-400 text-[11px] font-medium">
            <span className="flex items-center gap-1.5"><MapPin size={11} />경기도 오산시 메가타운</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="flex items-center gap-1.5"><Clock size={11} />09:00 – 22:00</span>
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
                <input ref={uploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  if (!file) { setUploadFile(null); return; }
                  const ext = file.name.split(".").pop()?.toLowerCase();
                  const validMime = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/octet-stream"];
                  if ((ext !== "xlsx" && ext !== "xls") || (!!file.type && !validMime.includes(file.type))) {
                    alert("형식이 다른 파일입니다. 상품리스트를 업로드해주세요.");
                    e.target.value = ""; return;
                  }
                  setUploadResult(null);
                  setUploadFile(file);
                }} />
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">임포트 이력</p>
                  <button onClick={handleClearImportLog} className="text-[10px] text-gray-400 hover:text-rose-500 transition cursor-pointer">clear</button>
                </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.72)", backdropFilter: "blur(12px)" }}
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: "rgba(255,255,255,0.98)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Branded hero panel ── */}
            <div
              className="relative px-7 pt-8 pb-6 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #312e81 0%, #4338ca 50%, #6366f1 100%)",
              }}
            >
              {/* Decorative blobs */}
              <div
                className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20"
                style={{ background: "radial-gradient(circle, #a5b4fc, transparent)" }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15"
                style={{ background: "radial-gradient(circle, #c7d2fe, transparent)" }}
              />
              <div
                className="absolute top-4 left-1/2 w-64 h-64 rounded-full opacity-[0.07]"
                style={{ transform: "translateX(-50%)", background: "radial-gradient(circle, #e0e7ff, transparent)" }}
              />

              {/* Close button */}
              <button
                onClick={closeModal}
                aria-label="닫기"
                className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-indigo-200 hover:text-white transition cursor-pointer"
              >
                <X size={14} />
              </button>

              {/* Brand identity */}
              <div className="relative flex items-center gap-3 mb-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
                >
                  <Pill size={20} className="text-white" />
                </div>
                <div>
                  <div className="text-white font-black text-lg leading-tight tracking-tight">메가타운 약국</div>
                  <div className="text-indigo-200 text-[11px] font-medium tracking-wide">MEGATOWN PHARMACY</div>
                </div>
              </div>
              <p className="relative text-indigo-200/80 text-xs font-medium">
                직원 전용 관리 시스템 · 로그인이 필요합니다
              </p>
            </div>

            {/* ── Form area ── */}
            <div className="px-7 pt-5 pb-7">

              {/* Tab switcher — sliding pill style */}
              <div className="relative flex bg-slate-100 rounded-2xl p-1 mb-6">
                {/* Sliding background indicator */}
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl shadow-sm transition-all duration-200 ease-out"
                  style={{
                    left: activeTab === "employee" ? "4px" : "calc(50%)",
                    background: "linear-gradient(135deg, #4338ca, #6366f1)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setActiveTab("employee")}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-colors duration-150 cursor-pointer ${
                    activeTab === "employee" ? "text-white" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <User size={12} />
                  <span>직원 로그인</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("admin")}
                  className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-colors duration-150 cursor-pointer ${
                    activeTab === "admin" ? "text-white" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Shield size={12} />
                  <span>최고관리자</span>
                </button>
              </div>

              {/* ── Admin PIN tab ── */}
              {activeTab === "admin" ? (
                <form onSubmit={handlePinSubmit} className="flex flex-col gap-5">
                  <div className="flex flex-col items-center gap-2 py-1">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mb-1"
                      style={{ background: "linear-gradient(135deg, #ede9fe, #c7d2fe)" }}
                    >
                      <Shield size={22} className="text-indigo-600" />
                    </div>
                    <p className="text-slate-500 text-xs text-center leading-relaxed">
                      관리자 비밀번호를 입력하세요
                    </p>
                  </div>

                  <div className="relative">
                    <input
                      ref={pinInputRef}
                      type="password"
                      value={pin}
                      onChange={(e) => { setPin(e.target.value); setAdminError(false); }}
                      placeholder="비밀번호 입력"
                      className={`w-full rounded-2xl px-5 py-4 text-slate-900 text-center text-xl tracking-[0.6em] font-black placeholder:tracking-normal placeholder:text-slate-300 placeholder:text-sm placeholder:font-normal focus:outline-none transition-all duration-150 ${
                        adminError
                          ? "border-2 border-rose-400 bg-rose-50 ring-2 ring-rose-100"
                          : "border-2 border-slate-200 bg-slate-50 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      }`}
                      maxLength={10}
                      autoComplete="off"
                    />
                    {adminError && (
                      <div className="flex items-center justify-center gap-1.5 mt-2.5">
                        <AlertCircle size={12} className="text-rose-500 shrink-0" />
                        <p className="text-rose-500 text-xs font-semibold">비밀번호가 올바르지 않습니다.</p>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-2xl text-white font-bold text-sm transition-all duration-150 cursor-pointer active:scale-[0.98] shadow-lg shadow-indigo-200"
                    style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}
                  >
                    관리자로 입장하기
                  </button>
                </form>
              ) : (
                /* ── Employee login tab ── */
                <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-4">

                  {/* Phone number field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-600 text-xs font-semibold pl-1">
                      전화번호
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <User size={14} className="text-slate-400" />
                      </div>
                      <input
                        ref={empNumberRef}
                        type="tel"
                        inputMode="numeric"
                        value={empNumber}
                        onChange={(e) => { setEmpNumber(e.target.value); setEmpError(null); }}
                        placeholder="01012345678"
                        className={`w-full rounded-2xl pl-10 pr-4 py-3.5 text-slate-900 text-sm font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${
                          empError
                            ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-rose-100"
                            : "border-2 border-slate-200 bg-slate-50 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                        }`}
                        autoComplete="username"
                        disabled={empLoading}
                      />
                    </div>
                  </div>

                  {/* Password field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-slate-600 text-xs font-semibold pl-1">
                      비밀번호
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Lock size={14} className="text-slate-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={empPassword}
                        onChange={(e) => { setEmpPassword(e.target.value); setEmpError(null); }}
                        placeholder="비밀번호 입력"
                        className={`w-full rounded-2xl pl-10 pr-12 py-3.5 text-slate-900 text-sm font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${
                          empError
                            ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-rose-100"
                            : "border-2 border-slate-200 bg-slate-50 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                        }`}
                        autoComplete="current-password"
                        disabled={empLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Error message */}
                  {empError && (
                    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
                      <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                      <p className="text-rose-600 text-xs font-semibold leading-relaxed">{empError}</p>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={empLoading}
                    className="w-full py-3.5 rounded-2xl text-white font-bold text-sm mt-1 transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}
                  >
                    {empLoading ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>로그인 중...</span>
                      </>
                    ) : (
                      <span>직원으로 입장하기</span>
                    )}
                  </button>

                  <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                    비밀번호 분실 시 관리자에게 문의하세요
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
