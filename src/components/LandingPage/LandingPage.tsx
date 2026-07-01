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
  Utensils,
} from "lucide-react";
import type { AuthSession, AuthRole } from "../../types";
import { NotificationBell } from "../NotificationBell";

interface LandingPageProps {
  authSession: AuthSession | null;
  onNavigate: (page: "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave" | "permissions" | "lunch", auth?: AuthSession) => void;
  onLogout: () => void;
  onAuthOnly?: (auth: AuthSession) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ authSession, onNavigate, onLogout, onAuthOnly }) => {
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | "scan" | "requests" | "ocr" | "upload" | "leave" | null>(null);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  const [requestsCounts, setRequestsCounts] = useState({ display: 0, order: 0, mismatch: 0, lunch: 0 });

  // Product list upload (manager only)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; count?: number; msg?: string } | null>(null);
  const [importLog, setImportLog] = useState<{ timestamp: string; count: number }[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [empNumber, setEmpNumber] = useState(() => localStorage.getItem("megatown_remembered_phone") ?? "");
  const [empPassword, setEmpPassword] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("megatown_remembered_phone"));
  const empNumberRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingPage) {
      setEmpNumber(localStorage.getItem("megatown_remembered_phone") ?? "");
      setEmpPassword("");
      setEmpError(null);
      setEmpLoading(false);
      setShowPassword(false);
      setTimeout(() => empNumberRef.current?.focus(), 50);
    }
  }, [pendingPage]);

  const closeModal = () => setPendingPage(null);

  // If already logged in, go directly; otherwise open login modal
  const handleMenuClick = (page: "schedule" | "display") => {
    if (authSession) {
      onNavigate(page, authSession);
    } else {
      setPendingPage(page);
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
      const { id, name, role, level, rank } = res.data ?? {};
      if (!id) {
        setEmpError("전화번호 또는 비밀번호가 올바르지 않습니다");
        setEmpLoading(false);
        return;
      }
      const page = pendingPage;
      setPendingPage(null);
      setEmpPassword("");
      if (rememberMe) {
        localStorage.setItem("megatown_remembered_phone", phone);
      } else {
        localStorage.removeItem("megatown_remembered_phone");
        setEmpNumber("");
      }
      const validRoles = ["superadmin", "admin", "manager", "employee"] as const;
      const authRole: AuthRole = (validRoles as readonly string[]).includes(role) ? (role as AuthRole) : "employee";
      const auth: AuthSession = { role: authRole, employeeId: id, employeeName: name, level: level ?? 1, employeeRank: rank ?? undefined, rememberMe: rememberMe || undefined };
      onAuthOnly?.(auth);
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
    const canUpload = isManagerOrAdmin && !!authSession?.employeeId;
    if (!canUpload) return;
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const params = `managerId=${authSession!.employeeId}`;
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

  // Level with role-based fallback for backwards-compat with old sessions
  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
    : authSession?.role === "manager" ? 2
    : authSession?.role === "employee" ? 1 : 0);
  const isSuperAdmin = userLevel >= 9;
  const isManagerRole = userLevel >= 2 && userLevel < 9;
  const isAdmin = isSuperAdmin;
  const isEmployee = userLevel === 1;
  const isLoggedIn = !!authSession;
  const isManagerOrAdmin = userLevel >= 2;
  const isSuperAdminLevel9 = userLevel >= 9;

  // Load pending counts for managers
  useEffect(() => {
    if (!isManagerOrAdmin) return;
    fetch("/api/requests/pending-counts")
      .then(r => r.ok ? r.json() : {})
      .then((d: { leave?: number; display?: number; order?: number; mismatch?: number; lunch?: number }) => {
        setLeavePendingCount(d.leave ?? 0);
        setRequestsCounts({
          display: d.display ?? 0,
          order: d.order ?? 0,
          mismatch: d.mismatch ?? 0,
          lunch: d.lunch ?? 0,
        });
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
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #f8faff 0%, #f1f5ff 40%, #f0fdf4 100%)" }}>

      {/* ── Header ── */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/70 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 sticky top-0 z-30" style={{ boxShadow: "0 1px 0 0 rgba(99,102,241,0.06), 0 2px 8px 0 rgba(15,23,42,0.04)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}>
            <Calendar size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="text-slate-800 text-base"> MEGATOWN</span>
          </span>
        </div>

        {isLoggedIn ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border" style={{ background: "linear-gradient(135deg, #eef2ff, #e0e7ff)", borderColor: "#c7d2fe", color: "#4338ca" }}>
              {isManagerOrAdmin ? <Shield size={11} /> : <User size={11} />}
              <span className="max-w-[80px] truncate">{roleLabel}</span>
            </div>
            <NotificationBell authSession={authSession} />
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-all duration-150 cursor-pointer"
            >
              <LogOut size={11} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Lock size={11} />
            <span className="hidden sm:inline">로그인 필요</span>
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 relative overflow-hidden pt-8 pb-12">

        {/* Ambient background blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[260px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(16,185,129,0.05) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">

          {/* ── Hero brand area ── */}
          <div className="w-full mb-7 px-1">
            <p className="text-[11px] text-slate-400 font-medium mb-0.5">오산 메가타운 약국</p>
            <h1 className="text-slate-900 font-black text-xl sm:text-2xl tracking-tight leading-none">통합 관리 시스템</h1>
            {isLoggedIn && authSession?.employeeName && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border"
                style={
                  isSuperAdmin
                    ? { background: "#ecfdf5", borderColor: "#6ee7b7", color: "#065f46" }
                    : isManagerRole
                    ? { background: "#eff6ff", borderColor: "#93c5fd", color: "#1e40af" }
                    : { background: "#fffbeb", borderColor: "#fcd34d", color: "#92400e" }
                }
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: isSuperAdmin ? "#10b981" : isManagerRole ? "#3b82f6" : "#f59e0b" }}
                />
                {(isSuperAdmin || isManagerRole) && (
                  <>
                    <span>{isSuperAdmin ? "최고관리자" : "관리자"}</span>
                    <span className="opacity-40 mx-0.5">·</span>
                  </>
                )}
                <span className="font-semibold">
                  {authSession.employeeName}
                  {authSession.employeeRank && (
                    <span className="opacity-70 ml-1">{authSession.employeeRank}</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* ── 관리자 도구 (관리자 로그인 시에만 표시) ── */}
          {isManagerOrAdmin && (
            <div className="w-full mb-7">
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #8b5cf6)" }}>
                  <Shield size={10} className="text-white" />
                </div>
                <span className="text-[11px] font-bold text-violet-600 uppercase tracking-widest">관리자 도구</span>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #ddd6fe, transparent)" }} />
              </div>
              <div className="grid grid-cols-3 gap-3">

                {/* 매장진열 관리 — sky */}
                <button onClick={() => onNavigate("display", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-sky-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(224,242,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)", border: "1px solid #7dd3fc" }}>
                      <LayoutGrid size={16} className="text-sky-600 sm:hidden" /><LayoutGrid size={20} className="text-sky-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">매장진열 관리</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">진열대 상태 점검 및 보충 요청 관리</div>
                    <div className="flex items-center gap-1 mt-2 text-sky-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">관리하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 연차 승인 — teal */}
                <button onClick={() => onNavigate("leave", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-teal-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(204,251,241,0.7) 0%, transparent 60%)" }} />
                  {leavePendingCount > 0 && (
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[10px] font-black" style={{ background: "linear-gradient(135deg, #f43f5e, #e11d48)", boxShadow: "0 0 0 2px white, 0 2px 6px rgba(244,63,94,0.4)" }}>
                      {leavePendingCount}
                    </div>
                  )}
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ccfbf1, #99f6e4)", border: "1px solid #5eead4" }}>
                      <CalendarDays size={16} className="text-teal-600 sm:hidden" /><CalendarDays size={20} className="text-teal-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">연차 승인</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">직원 휴가·연차 신청 승인 처리</div>
                    <div className="flex items-center gap-1 mt-2 text-teal-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{leavePendingCount > 0 ? `대기 ${leavePendingCount}건` : "확인하기"}</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 요청목록 조회 — indigo */}
                <button onClick={() => onNavigate("requests", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-indigo-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(224,231,255,0.7) 0%, transparent 60%)" }} />
                  <div className="absolute top-2 right-2 flex items-center gap-0.5">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-blue-500 shadow-sm">{requestsCounts.display}</span>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-red-500 shadow-sm">{requestsCounts.order}</span>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-orange-500 shadow-sm">{requestsCounts.mismatch}</span>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white bg-emerald-500 shadow-sm">{requestsCounts.lunch}</span>
                  </div>
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105 mt-5 sm:mt-6" style={{ background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", border: "1px solid #a5b4fc" }}>
                      <List size={16} className="text-indigo-600 sm:hidden" /><List size={20} className="text-indigo-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">요청목록 조회</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">진열·발주요청 및 배정구역 불일치 확인</div>
                    <div className="flex items-center gap-1 mt-2 text-indigo-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{(requestsCounts.display + requestsCounts.order + requestsCounts.mismatch + requestsCounts.lunch) > 0 ? `대기 ${requestsCounts.display + requestsCounts.order + requestsCounts.mismatch + requestsCounts.lunch}건` : "조회하기"}</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 상품 목록 관리 — orange */}
                <button
                  onClick={() => { setUploadOpen(true); setUploadResult(null); setUploadFile(null); fetchImportLog(); }}
                  className="group relative bg-white border border-slate-200/80 hover:border-orange-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,237,213,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffedd5, #fed7aa)", border: "1px solid #fdba74" }}>
                      <FileSpreadsheet size={16} className="text-orange-500 sm:hidden" /><FileSpreadsheet size={20} className="text-orange-500 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">상품 목록 관리</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">xlsx 파일 업로드로 상품 DB 갱신</div>
                    <div className="flex items-center gap-1 mt-2 text-orange-500 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">업로드하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 거래명세서 OCR — amber */}
                <button onClick={() => onNavigate("ocr", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-amber-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(254,243,199,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #fef9c3, #fef08a)", border: "1px solid #fde047" }}>
                      <FileText size={16} className="text-yellow-600 sm:hidden" /><FileText size={20} className="text-yellow-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">거래명세서 OCR</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">PDF 업로드로 거래명세서 자동 추출</div>
                    <div className="flex items-center gap-1 mt-2 text-yellow-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">추출하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 권한 조정 — fuchsia (level 9 전용) */}
                {isSuperAdminLevel9 && (
                  <button onClick={() => onNavigate("permissions", authSession!)}
                    className="group relative bg-white border border-fuchsia-200/80 hover:border-fuchsia-400 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(253,244,255,0.7) 0%, transparent 60%)" }} />
                    <div className="relative">
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #fdf4ff, #fae8ff)", border: "1px solid #e879f9" }}>
                        <Shield size={16} className="text-fuchsia-600 sm:hidden" /><Shield size={20} className="text-fuchsia-600 hidden sm:block" />
                      </div>
                      <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">권한 조정</div>
                      <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">페이지별 레벨 읽기·쓰기 권한 설정</div>
                      <div className="flex items-center gap-1 mt-2 text-fuchsia-600 text-xs font-bold">
                        <span className="text-[11px] sm:text-xs">설정하기</span>
                        <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </button>
                )}

              </div>
            </div>
          )}

          {/* ── 직원용 (로그인 시에만 표시) ── */}
          {isLoggedIn && (
            <div className="w-full mb-7">
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}>
                  <User size={10} className="text-white" />
                </div>
                <span className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">직원용</span>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #c7d2fe, transparent)" }} />
              </div>
              <div className="grid grid-cols-3 gap-3">

                {/* 스케줄표 조회 — blue */}
                <button onClick={() => onNavigate("schedule", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(219,234,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #dbeafe, #bfdbfe)", border: "1px solid #93c5fd" }}>
                      <Calendar size={16} className="text-blue-600 sm:hidden" /><Calendar size={20} className="text-blue-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">스케줄표 조회</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">직원 월간 근무 스케줄 확인 및 관리</div>
                    <div className="flex items-center gap-1 mt-2 text-blue-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">입장하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 상품 스캔 — violet */}
                <button onClick={() => onNavigate("scan", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-violet-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(237,233,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)", border: "1px solid #c4b5fd" }}>
                      <ScanLine size={16} className="text-violet-600 sm:hidden" /><ScanLine size={20} className="text-violet-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">상품 스캔</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">바코드 스캔으로 진열 보충 요청</div>
                    <div className="flex items-center gap-1 mt-2 text-violet-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">스캔하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 연차 신청 — rose */}
                <button onClick={() => onNavigate("leave", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-rose-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,228,230,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffe4e6, #fecdd3)", border: "1px solid #fda4af" }}>
                      <CalendarDays size={16} className="text-rose-500 sm:hidden" /><CalendarDays size={20} className="text-rose-500 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">연차 신청</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">휴가·연차 신청 및 내역 조회</div>
                    <div className="flex items-center gap-1 mt-2 text-rose-500 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">신청하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 점심 신청 — orange */}
                <button onClick={() => onNavigate("lunch", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-orange-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,237,213,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffedd5, #fed7aa)", border: "1px solid #fdba74" }}>
                      <Utensils size={16} className="text-orange-500 sm:hidden" /><Utensils size={20} className="text-orange-500 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">점심 신청</div>
                    <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">오늘의 점심 식사 신청</div>
                    <div className="flex items-center gap-1 mt-2 text-orange-500 text-xs font-bold">
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
            <div className="w-full mb-7">
              <button
                onClick={() => setPendingPage("schedule")}
                className="w-full group relative overflow-hidden flex items-center justify-between rounded-2xl px-5 py-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer border border-indigo-200/80 shadow-sm"
                style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)" }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl" style={{ background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)" }} />
                <div className="relative flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}>
                    <Lock size={16} className="text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-indigo-800 font-bold text-sm tracking-tight">직원 로그인</div>
                    <div className="text-indigo-500 text-xs mt-0.5">스케줄표·연차신청·스캔 등 이용 가능</div>
                  </div>
                </div>
                <div className="relative flex items-center gap-1 text-indigo-500 group-hover:text-indigo-700 transition-colors">
                  <span className="text-xs font-bold hidden sm:inline">시작하기</span>
                  <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            </div>
          )}

          {/* ── 외부용 ── */}
          <div className="w-full">
            <div className="flex items-center gap-2 mb-3.5">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                <CalendarCheck size={10} className="text-white" />
              </div>
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">외부용</span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #a7f3d0, transparent)" }} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => onNavigate("reservation")}
                className="group relative bg-white border border-slate-200/80 hover:border-emerald-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(209,250,229,0.6) 0%, transparent 60%)" }} />
                <div className="relative">
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)", border: "1px solid #6ee7b7" }}>
                    <CalendarCheck size={16} className="text-emerald-600 sm:hidden" /><CalendarCheck size={20} className="text-emerald-600 hidden sm:block" />
                  </div>
                  <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">방문예약</div>
                  <div className="text-slate-400 text-[11px] sm:text-xs leading-relaxed hidden sm:block">상담 및 방문 일정을 간편하게 예약</div>
                  <div className="flex items-center gap-1 mt-2 text-emerald-600 text-xs font-bold">
                    <span className="text-[11px] sm:text-xs">예약하기</span>
                    <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 mt-10 pt-6 border-t border-slate-200/60 w-full justify-center text-slate-400 text-[11px] font-medium">
            <span className="flex items-center gap-1.5"><MapPin size={11} />경기도 오산시 메가타운</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
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
                <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
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
              <div className="relative flex items-center gap-4 mb-3">
                {/* Pharmacy cross logo */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0"
                  style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="12" y="3" width="8" height="26" rx="3" fill="white"/>
                    <rect x="3" y="12" width="26" height="8" rx="3" fill="white"/>
                  </svg>
                </div>
                <div>
                  <div className="text-white/60 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Osan Megatown</div>
                  <div className="text-white font-black text-2xl leading-tight tracking-tight">오산메가타운</div>
                  <div className="text-indigo-200 text-[11px] font-medium tracking-wide mt-0.5">약국 통합 관리 시스템</div>
                </div>
              </div>
              <p className="relative text-indigo-200/70 text-xs font-medium">
                직원 전용 · 로그인이 필요합니다
              </p>
            </div>

            {/* ── Form area ── */}
            <div className="px-7 pt-5 pb-7">

                {/* ── Employee login form ── */}
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

                  {/* Remember me checkbox */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-2 border-slate-300 text-indigo-600 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-500 group-hover:text-slate-700 transition">자동 로그인</span>
                  </label>

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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
