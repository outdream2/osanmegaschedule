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
  UtensilsCrossed,
  Package,
  Bell,
  BellOff,
  Plus,
  BookOpen,
  Megaphone,
  MessageSquare,
  MessageCircleQuestion,
} from "lucide-react";
import type { AuthSession, AuthRole } from "../../types";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";

interface LandingPageProps {
  authSession: AuthSession | null;
  onNavigate: (page: "schedule" | "reservation" | "display" | "scan" | "ocr" | "requests" | "leave" | "permissions" | "lunch" | "stockcheck" | "synonyms" | "stockarrivals", auth?: AuthSession) => void;
  onLogout: () => void;
  onAuthOnly?: (auth: AuthSession) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ authSession, onNavigate, onLogout, onAuthOnly }) => {
  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | "scan" | "requests" | "ocr" | "upload" | "leave" | null>(null);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  const [requestsCounts, setRequestsCounts] = useState({ display: 0, order: 0, mismatch: 0, lunch: 0 });
  // 직원용: 나에게 배정된 진열 보충 요청 중 pending 개수
  const [myPendingCount, setMyPendingCount] = useState(0);

  // Product list upload (manager only)
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; count?: number; msg?: string } | null>(null);
  const [importLog, setImportLog] = useState<{ timestamp: string; count: number }[]>([]);
  // 데이터 업로드 통합 모달 서브탭: products(기본) / stock
  const [uploadTab, setUploadTab] = useState<"products" | "stock" | "log">("products");
  // 재고 리스트 업로드
  const [stockUploadFile, setStockUploadFile] = useState<File | null>(null);
  const [stockUploadLoading, setStockUploadLoading] = useState(false);
  const [stockUploadResult, setStockUploadResult] = useState<{ ok: boolean; updated?: number; total?: number; history?: number; snapshot_date?: string; msg?: string } | null>(null);
  const [stockImportLog, setStockImportLog] = useState<{
    timestamp: string;
    count: number;
    total?: number;
    snapshot_date?: string;
    start_date?: string | null;
    period_type?: "early" | "mid" | "late" | null;
    history?: number;
  }[]>([]);
  const stockUploadInputRef = useRef<HTMLInputElement>(null);
  // 재고 업로드: 시작재고일 / 종료재고일 (사용자 명시 · 파일명 파싱 대체)
  // period_type 은 종료일의 dd 로 자동 판정 (1-10=early, 11-20=mid, 21-말일=late)
  const [stockStartDate, setStockStartDate] = useState<string>("");
  const [stockEndDate, setStockEndDate] = useState<string>("");
  const stockPeriodType: "early" | "mid" | "late" | null = (() => {
    const m = /^\d{4}-\d{2}-(\d{2})$/.exec(stockEndDate);
    if (!m) return null;
    const dd = Number(m[1]);
    if (dd >= 1 && dd <= 10) return "early";
    if (dd >= 11 && dd <= 20) return "mid";
    if (dd >= 21 && dd <= 31) return "late";
    return null;
  })();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Stock arrivals
  const [stockArrivals, setStockArrivals] = useState<Array<{id: number; title: string; body?: string | null; created_at: string}>>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [showCreateArrival, setShowCreateArrival] = useState(false);
  const [newArrivalTitle, setNewArrivalTitle] = useState("");
  const [newArrivalBody, setNewArrivalBody] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [unauthorizedToast, setUnauthorizedToast] = useState(false);

  const [empNumber, setEmpNumber] = useState(() => localStorage.getItem("megatown_remembered_phone") ?? "");
  const [empPassword, setEmpPassword] = useState("");
  const [empError, setEmpError] = useState<string | null>(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const empNumberRef = useRef<HTMLInputElement>(null);

  // 거래처 로그인
  const [vendorLoginOpen, setVendorLoginOpen] = useState(false);
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorPassword, setVendorPassword] = useState("");
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [showVendorPassword, setShowVendorPassword] = useState(false);
  const vendorPhoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/stock-arrivals")
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{id: number; title: string; body?: string | null; created_at: string}>) =>
        setStockArrivals([...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      )
      .catch(() => {})
      .finally(() => setArrivalsLoading(false));
    setPushSubscribed(localStorage.getItem("anon_push_subscribed") === "1");
  }, []);

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

  useEffect(() => {
    if (vendorLoginOpen) {
      setVendorPhone("");
      setVendorPassword("");
      setVendorError(null);
      setVendorLoading(false);
      setShowVendorPassword(false);
      setTimeout(() => vendorPhoneRef.current?.focus(), 50);
    }
  }, [vendorLoginOpen]);

  const handleVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = vendorPhone.trim().replace(/[^0-9]/g, "");
    if (!phone || !vendorPassword) {
      setVendorError("전화번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setVendorLoading(true);
    setVendorError(null);
    try {
      const res = await axios.post("/api/auth/vendor-login", { phone, password: vendorPassword });
      const { id, name, contactName, role, level } = res.data ?? {};
      if (!id) { setVendorError("로그인에 실패했습니다."); setVendorLoading(false); return; }
      setVendorLoginOpen(false);
      setVendorPassword("");
      const auth: AuthSession = { role: "vendor", employeeId: id, employeeName: name, employeeRank: contactName || undefined, level: level ?? 0 };
      onAuthOnly?.(auth);
    } catch (err: any) {
      const status = err?.response?.status;
      setVendorError(status === 401 || status === 400 ? (err.response?.data?.error ?? "전화번호 또는 비밀번호가 올바르지 않습니다") : "로그인 중 오류가 발생했습니다.");
      setVendorPassword("");
    } finally {
      setVendorLoading(false);
    }
  };

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
      const validRoles = ["superadmin", "admin", "manager", "employee", "vendor"] as const;
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

  const fetchStockImportLog = async () => {
    try {
      const res = await axios.get("/api/stock-import-log");
      setStockImportLog(Array.isArray(res.data) ? res.data : []);
    } catch { setStockImportLog([]); }
  };

  const handleClearStockImportLog = async () => {
    if (!confirm("재고 임포트 이력을 모두 삭제할까요?")) return;
    await axios.delete("/api/stock-import-log");
    setStockImportLog([]);
  };

  const handleStockUpload = async () => {
    if (!stockUploadFile) return;
    if (!authSession?.employeeId) return;
    // 필수 검증: 시작재고일 · 종료재고일 명시
    if (!stockStartDate || !stockEndDate) {
      setStockUploadResult({ ok: false, msg: "시작재고일 · 종료재고일을 모두 입력하세요" });
      return;
    }
    if (stockStartDate > stockEndDate) {
      setStockUploadResult({ ok: false, msg: "시작재고일이 종료재고일보다 뒤에 있습니다" });
      return;
    }
    if (!stockPeriodType) {
      setStockUploadResult({ ok: false, msg: "종료재고일의 일(dd)로 초/중/하순 판정 실패" });
      return;
    }
    setStockUploadLoading(true);
    setStockUploadResult(null);
    try {
      const params = new URLSearchParams({ managerId: String(authSession.employeeId) });
      params.set("snapshot_date", stockEndDate);
      params.set("start_date", stockStartDate);
      params.set("period_type", stockPeriodType);
      const buf = await stockUploadFile.arrayBuffer();
      const res = await axios.post(`/api/upload-stock?${params}`, buf, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      setStockUploadResult({
        ok: true,
        updated: res.data.updated ?? 0,
        total: res.data.total ?? 0,
        history: res.data.history ?? 0,
        snapshot_date: res.data.snapshot_date,
      });
      await fetchStockImportLog();
    } catch (err: any) {
      setStockUploadResult({ ok: false, msg: err?.response?.data?.error ?? "업로드 실패" });
    } finally {
      setStockUploadLoading(false);
    }
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
  const isVendor = authSession?.role === "vendor";
  const isLoggedIn = !!authSession;
  const isManagerOrAdmin = !isVendor && userLevel >= 2;
  const isSuperAdminLevel9 = !isVendor && userLevel >= 9;

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

  // 직원 로그인 시: 나에게 배정된 진열 보충 요청 중 pending 개수 로드 (완료 시 자동 0)
  useEffect(() => {
    if (!isEmployee || !authSession?.employeeId) { setMyPendingCount(0); return; }
    const empId = authSession.employeeId;
    fetch(`/api/display-requests?scope=mine&employeeId=${empId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ status?: string }>) => {
        const pending = Array.isArray(rows) ? rows.filter(r => (r.status ?? "pending") === "pending").length : 0;
        setMyPendingCount(pending);
      })
      .catch(() => setMyPendingCount(0));
  }, [isEmployee, authSession?.employeeId]);

  const handleAnonSubscribe = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      alert("서버 설정 오류: VAPID 공개키가 없습니다. 관리자에게 문의하세요.");
      return;
    }
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
      const res = await fetch("/api/anon-push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `서버 오류 (${res.status})`);
      }
      localStorage.setItem("anon_push_subscribed", "1");
      setPushSubscribed(true);
    } catch (err: any) {
      console.error("Push subscribe error:", err);
      alert("알림 구독 실패: " + (err.message ?? err));
    } finally {
      setPushLoading(false);
    }
  };

  const handleCreateArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArrivalTitle.trim() || !authSession) return;
    setCreateLoading(true);
    try {
      const res = await fetch("/api/stock-arrivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newArrivalTitle.trim(), body: newArrivalBody.trim() || undefined, employeeId: authSession.employeeId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const arrival = await res.json();
      setStockArrivals(prev => [arrival, ...prev]);
      setNewArrivalTitle("");
      setNewArrivalBody("");
      setShowCreateArrival(false);
    } catch (err: any) {
      alert("입고 알림 작성 실패: " + err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleNavNavigate = (page: AppNavPage) => {
    if (page === "landing") return;
    // requests · board 는 직원도 접근 가능 (서버에서 role 필터)
    const requiresManager = ["display", "leave", "scan", "ocr"].includes(page);
    if (!authSession) {
      setPendingPage("schedule");
      return;
    }
    if (requiresManager && !isManagerOrAdmin) {
      setUnauthorizedToast(true);
      setTimeout(() => setUnauthorizedToast(false), 2500);
      return;
    }
    onNavigate(page, authSession);
  };

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
      <div className="sticky top-0 z-30">
        <AppNavHeader
          activePage="landing"
          authSession={authSession}
          onLogout={onLogout}
          onNavigate={isVendor ? undefined : handleNavNavigate}
          rightSlot={isVendor ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs font-semibold bg-white hover:bg-rose-50 text-rose-600 border border-gray-200 hover:border-rose-300 rounded-lg transition cursor-pointer"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          ) : undefined}
        />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 relative overflow-hidden pt-8 pb-12">

        {/* Ambient background blobs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(99,102,241,0.07) 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/3 left-1/4 w-[500px] h-[260px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(16,185,129,0.05) 0%, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">

          {/* Hero brand area · 로그인 사용자 표시는 헤더 탭 아래 [이름 직급] 로 통일 */}
          <div className="w-full mb-3 px-1" />

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

                {/* 매장관리 · 재고관리 — sky */}
                <button onClick={() => onNavigate("display", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-sky-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(224,242,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #e0f2fe, #bae6fd)", border: "1px solid #7dd3fc" }}>
                      <LayoutGrid size={16} className="text-sky-600 sm:hidden" /><LayoutGrid size={20} className="text-sky-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight leading-tight">
                      관리메뉴
                    </div>
                    <div className="text-slate-400 text-[10px] leading-tight block mt-0.5">
                      매장관리 · 재고관리 · 입고알림관리
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-sky-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">관리하기</span>
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
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">진열·발주요청 및 배정구역 불일치 확인</div>
                    <div className="flex items-center gap-1 mt-2 text-indigo-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{(requestsCounts.display + requestsCounts.order + requestsCounts.mismatch + requestsCounts.lunch) > 0 ? `대기 ${requestsCounts.display + requestsCounts.order + requestsCounts.mismatch + requestsCounts.lunch}건` : "조회하기"}</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 데이터 업로드 (통합) — orange (level 9 전용) — 상품목록 · 재고리스트 서브탭 */}
                {isSuperAdminLevel9 && (
                  <button
                    onClick={() => { setUploadOpen(true); setUploadTab("products"); setUploadResult(null); setUploadFile(null); setStockUploadResult(null); setStockUploadFile(null); fetchImportLog(); fetchStockImportLog(); }}
                    className="group relative bg-white border border-slate-200/80 hover:border-orange-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,237,213,0.7) 0%, transparent 60%)" }} />
                    <div className="relative">
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffedd5, #fed7aa)", border: "1px solid #fdba74" }}>
                        <FileSpreadsheet size={16} className="text-orange-500 sm:hidden" /><FileSpreadsheet size={20} className="text-orange-500 hidden sm:block" />
                      </div>
                      <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">데이터 업로드</div>
                      <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">상품목록 · 재고리스트 xlsx 업로드</div>
                      <div className="flex items-center gap-1 mt-2 text-orange-500 text-xs font-bold">
                        <span className="text-[11px] sm:text-xs">업로드하기</span>
                        <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </button>
                )}

                {/* 거래명세서 OCR — amber */}
                <button onClick={() => onNavigate("ocr", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-amber-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(254,243,199,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #fef9c3, #fef08a)", border: "1px solid #fde047" }}>
                      <FileText size={16} className="text-yellow-600 sm:hidden" /><FileText size={20} className="text-yellow-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">거래명세서 OCR</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">PDF 업로드로 거래명세서 자동 추출</div>
                    <div className="flex items-center gap-1 mt-2 text-yellow-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">추출하기</span>
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
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">직원 휴가·연차 신청 승인 처리</div>
                    <div className="flex items-center gap-1 mt-2 text-teal-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">{leavePendingCount > 0 ? `대기 ${leavePendingCount}건` : "확인하기"}</span>
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
                      <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">페이지별 레벨 읽기·쓰기 권한 설정</div>
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

          {/* ── 직원용 (직원/관리자 로그인 시에만 표시) ── */}
          {isLoggedIn && !isVendor && (
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
                  className="order-2 group relative bg-white border border-slate-200/80 hover:border-blue-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(219,234,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #dbeafe, #bfdbfe)", border: "1px solid #93c5fd" }}>
                      <Calendar size={16} className="text-blue-600 sm:hidden" /><Calendar size={20} className="text-blue-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">스케줄표 조회</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">직원 월간 근무 스케줄 확인 및 관리</div>
                    <div className="flex items-center gap-1 mt-2 text-blue-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">입장하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 상품 스캔 — violet */}
                <button onClick={() => onNavigate("scan", authSession!)}
                  className="order-3 group relative bg-white border border-slate-200/80 hover:border-violet-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(237,233,254,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)", border: "1px solid #c4b5fd" }}>
                      <ScanLine size={16} className="text-violet-600 sm:hidden" /><ScanLine size={20} className="text-violet-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">상품 스캔</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">바코드 스캔으로 진열 보충 요청</div>
                    <div className="flex items-center gap-1 mt-2 text-violet-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">스캔하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 연차 신청 — rose · 뒤로 배치 */}
                <button onClick={() => onNavigate("leave", authSession!)}
                  className="order-5 group relative bg-white border border-slate-200/80 hover:border-rose-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,228,230,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffe4e6, #fecdd3)", border: "1px solid #fda4af" }}>
                      <CalendarDays size={16} className="text-rose-500 sm:hidden" /><CalendarDays size={20} className="text-rose-500 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">연차 신청</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">휴가·연차 신청 및 내역 조회</div>
                    <div className="flex items-center gap-1 mt-2 text-rose-500 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">신청하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 점심 불참 — orange · 맨 뒤 */}
                <button onClick={() => onNavigate("lunch", authSession!)}
                  className="order-6 group relative bg-white border border-slate-200/80 hover:border-orange-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(255,237,213,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #ffedd5, #fed7aa)", border: "1px solid #fdba74" }}>
                      <UtensilsCrossed size={16} className="text-red-500 sm:hidden" /><UtensilsCrossed size={20} className="text-red-500 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">점심 불참</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">오늘의 점심 불참 신청</div>
                    <div className="flex items-center gap-1 mt-2 text-orange-500 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">신청하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

                {/* 내 요청목록 · 무지개 gradient · 맨 앞 · 눈에 띄는 강조 */}
                {isEmployee && (
                <button onClick={() => onNavigate("requests", authSession!)}
                  className="order-1 group relative rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-lg ring-2 ring-white"
                  style={{
                    background: "linear-gradient(135deg, #ef4444 0%, #f97316 20%, #eab308 40%, #22c55e 60%, #06b6d4 80%, #8b5cf6 100%)"
                  }}
                >
                  {/* 내부 흰색 카드 배경 */}
                  <div className="absolute inset-0.5 rounded-[14px] bg-white/95 backdrop-blur-sm" />
                  {/* 호버 시 무지개 오버레이 */}
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6)" }} />
                  {/* 우상단 대기 배지 (pending > 0) */}
                  {myPendingCount > 0 && (
                    <div className="absolute top-2 right-2 z-10">
                      <span className="min-w-[24px] h-[24px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-black text-white bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg ring-2 ring-white animate-pulse">
                        {myPendingCount > 99 ? "99+" : myPendingCount}
                      </span>
                    </div>
                  )}
                  <div className="relative">
                    <div
                      className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-110 shadow-md ${myPendingCount > 0 ? "mt-5 sm:mt-6" : ""}`}
                      style={{
                        background: "linear-gradient(135deg, #ef4444 0%, #f97316 20%, #eab308 40%, #22c55e 60%, #06b6d4 80%, #8b5cf6 100%)"
                      }}
                    >
                      <MessageSquare size={16} className="text-white sm:hidden" strokeWidth={2.6} />
                      <MessageSquare size={20} className="text-white hidden sm:block" strokeWidth={2.6} />
                    </div>
                    <div
                      className="font-black text-xs sm:text-sm mb-0.5 tracking-tight bg-clip-text text-transparent"
                      style={{
                        backgroundImage: "linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6)"
                      }}
                    >내 요청목록</div>
                    <div className="text-slate-500 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">나에게 배정된 진열 보충 요청</div>
                    <div className="flex items-center gap-1 mt-2 text-xs font-bold">
                      <span
                        className="text-[11px] sm:text-xs bg-clip-text text-transparent font-black"
                        style={{
                          backgroundImage: "linear-gradient(135deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #8b5cf6)"
                        }}
                      >
                        {myPendingCount > 0 ? `대기 ${myPendingCount}건` : "확인하기"}
                      </span>
                      <ChevronRight size={11} className="text-indigo-600 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </button>
                )}

                {/* 이슈공유 게시판 (전체 직원) — amber */}
                <button onClick={() => onNavigate("board" as any, authSession!)}
                  className="order-4 group relative bg-white border border-slate-200/80 hover:border-amber-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(254,243,199,0.7) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)", border: "1px solid #fcd34d" }}>
                      <MessageCircleQuestion size={16} className="text-amber-600 sm:hidden" /><MessageCircleQuestion size={20} className="text-amber-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">이슈공유</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">질문·이슈·메모 · 사진 첨부 · 담당자 지정</div>
                    <div className="flex items-center gap-1 mt-2 text-amber-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">보러가기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* ── 비로그인: 재고확인 (메인) + 로그인 버튼 (보조) ── */}
          {!isLoggedIn && (
            <div className="w-full mb-7 flex flex-col gap-3">
              {/* 재고확인 — 메인 CTA */}
              <button
                onClick={() => onNavigate("stockcheck")}
                className="w-full group relative overflow-hidden rounded-3xl cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]"
                style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #3b82f6 100%)" }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl" style={{ background: "linear-gradient(135deg, #1e40af 0%, #2563eb 60%, #60a5fa 100%)" }} />
                <div className="relative px-6 py-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0" style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)" }}>
                      <Package size={26} className="text-white" />
                    </div>
                    <div className="text-left">
                      <div className="text-white font-black text-xl sm:text-2xl tracking-tight leading-tight">재고 확인</div>
                      <div className="text-blue-200 text-xs sm:text-sm mt-1 font-medium">원하는 약품·제품의 재고를 바로 확인하세요</div>
                    </div>
                  </div>
                  <div className="relative shrink-0 flex flex-col items-center gap-1 text-blue-200 group-hover:text-white transition-colors mr-1">
                    <ChevronRight size={22} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </button>

              {/* 직원·거래처 로그인 — 보조 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingPage("schedule")}
                  className="flex-1 group relative overflow-hidden flex items-center justify-center gap-2 rounded-2xl px-4 py-3 transition-all duration-200 hover:shadow-md cursor-pointer border border-indigo-200/80"
                  style={{ background: "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)" }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" style={{ background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)" }} />
                  <Lock size={14} className="relative text-indigo-600" />
                  <span className="relative text-indigo-700 font-bold text-sm">로그인</span>
                </button>
                <button
                  onClick={() => setVendorLoginOpen(true)}
                  className="flex-1 group relative overflow-hidden flex items-center justify-center gap-2 rounded-2xl px-4 py-3 transition-all duration-200 hover:shadow-md cursor-pointer border border-emerald-200/80"
                  style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }} />
                  <CalendarCheck size={14} className="relative text-emerald-600" />
                  <span className="relative text-emerald-700 font-bold text-sm">거래처 로그인</span>
                </button>
              </div>
            </div>
          )}

          {/* ── 거래처용 (거래처 로그인 시 또는 최고관리자도 표시) ── */}
          {isLoggedIn && (isVendor || isSuperAdminLevel9) && (
            <div className="w-full">
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                  <CalendarCheck size={10} className="text-white" />
                </div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">거래처용</span>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #a7f3d0, transparent)" }} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => onNavigate("reservation", authSession!)}
                  className="group relative bg-white border border-slate-200/80 hover:border-emerald-300 rounded-2xl p-3 sm:p-4 text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md active:scale-[0.99] cursor-pointer overflow-hidden shadow-sm">
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: "linear-gradient(135deg, rgba(209,250,229,0.6) 0%, transparent 60%)" }} />
                  <div className="relative">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center mb-2.5 sm:mb-3 transition-all duration-200 group-hover:scale-105" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)", border: "1px solid #6ee7b7" }}>
                      <CalendarCheck size={16} className="text-emerald-600 sm:hidden" /><CalendarCheck size={20} className="text-emerald-600 hidden sm:block" />
                    </div>
                    <div className="text-slate-800 font-bold text-xs sm:text-sm mb-0.5 tracking-tight">방문예약</div>
                    <div className="text-slate-400 text-[10px] sm:text-xs leading-tight sm:leading-relaxed block mt-0.5">상담 및 방문 일정을 간편하게 예약</div>
                    <div className="flex items-center gap-1 mt-2 text-emerald-600 text-xs font-bold">
                      <span className="text-[11px] sm:text-xs">예약하기</span>
                      <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── 입고 알림 ── */}
          <div className="w-full mb-6 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0ea5e9, #38bdf8)" }}>
                <Package size={10} className="text-white" />
              </div>
              <span className="text-[11px] font-bold text-sky-600 uppercase tracking-widest">입고 알림</span>
              <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #bae6fd, transparent)" }} />
              {!pushSubscribed && (
                <button
                  onClick={handleAnonSubscribe}
                  disabled={pushLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-sky-600 border border-sky-200 bg-sky-50 hover:bg-sky-100 transition disabled:opacity-50 cursor-pointer"
                >
                  <Bell size={10} />
                  알림 받기
                </button>
              )}
              {pushSubscribed && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-semibold">
                  <Bell size={10} /> 구독 중
                </span>
              )}
            </div>
            {arrivalsLoading ? (
              <div className="text-slate-400 text-xs text-center py-3">불러오는 중...</div>
            ) : stockArrivals.length === 0 ? (
              <div className="text-slate-400 text-xs text-center py-3">입고 알림이 없습니다</div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 shadow-sm">
                {stockArrivals.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                    <Package size={12} className="text-sky-500 shrink-0" />
                    <span className="flex-1 text-sm font-medium text-slate-700 truncate">{a.title}</span>
                    <span className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 mt-10 pt-6 border-t border-slate-200/60 w-full justify-center text-slate-400 text-[11px] font-medium">
            <span className="flex items-center gap-1.5"><MapPin size={11} />경기도 오산시 메가타운</span>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="flex items-center gap-1.5"><Clock size={11} />09:00 – 22:00</span>
          </div>
        </div>
      </div>

      {/* ── 데이터 업로드 통합 모달 (상품목록 · 재고리스트 서브탭) ── */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-2 sm:p-4" onClick={() => setUploadOpen(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                  <FileSpreadsheet size={15} className="text-orange-600" />
                </div>
                <span className="text-gray-900 font-bold text-sm">데이터 업로드</span>
              </div>
              <button onClick={() => setUploadOpen(false)} className="text-gray-400 hover:text-gray-700 transition cursor-pointer"><X size={18} /></button>
            </div>

            {/* 서브탭: 상품목록 · 재고리스트 · 임포트 목록 (통합 이력) */}
            <div className="flex items-center gap-1 mb-4">
              <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5">
                <button
                  onClick={() => setUploadTab("products")}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${
                    uploadTab === "products" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                  }`}>
                  상품목록
                </button>
                <button
                  onClick={() => setUploadTab("stock")}
                  className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${
                    uploadTab === "stock" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                  }`}>
                  재고리스트
                </button>
                <button
                  onClick={() => { setUploadTab("log"); fetchImportLog(); fetchStockImportLog(); }}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${
                    uploadTab === "log" ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                  }`}>
                  임포트 목록
                  {(importLog.length + stockImportLog.length) > 0 && (
                    <span className={`text-[9px] font-mono rounded-full px-1.5 py-0.5 ${uploadTab === "log" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"}`}>
                      {importLog.length + stockImportLog.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {uploadTab === "products" && (
              <>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  xlsx 파일을 업로드하면 전체 상품 데이터가 DB에 임포트됩니다.<br />
                  <span className="text-gray-400">기존 데이터는 모두 덮어씁니다.</span>
                </p>
                {uploadResult?.ok ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                    <p className="text-sm font-bold text-emerald-700">업로드 완료</p>
                    <p className="text-xs text-gray-500">{uploadResult.count?.toLocaleString()}개 상품 등록됨</p>
                    <button onClick={() => { setUploadResult(null); setUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
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
                {/* 상품 임포트 이력 */}
                {importLog.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">상품 임포트 이력</p>
                      <button onClick={handleClearImportLog} className="text-[10px] text-gray-400 hover:text-rose-500 transition cursor-pointer">clear</button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
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
              </>
            )}
            {uploadTab === "stock" && (
              <>
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  재고현황 xlsx (초순/중순/하순 스냅샷)를 <strong>stock_history</strong> 테이블에 임포트합니다.<br />
                  <span className="text-gray-400">같은 날짜+상품코드는 덮어쓰기. 매칭되는 상품 정보(공급사·규격 등)도 함께 저장.</span>
                </p>
                {stockUploadResult?.ok ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <CheckCircle2 size={36} className="text-emerald-500" />
                    <p className="text-sm font-bold text-emerald-700">임포트 완료</p>
                    <p className="text-sm text-gray-700">
                      <span className="font-black text-emerald-700">{(stockUploadResult.history ?? 0).toLocaleString()}</span>
                      <span className="text-gray-500 mx-1">/</span>
                      <span className="font-bold">{(stockUploadResult.total ?? 0).toLocaleString()}</span>
                      건 스냅샷 저장됨
                    </p>
                    {stockUploadResult.snapshot_date && (
                      <p className="text-[11px] text-gray-500">스냅샷일: <span className="font-mono font-bold text-gray-700">{stockUploadResult.snapshot_date}</span></p>
                    )}
                    {(stockUploadResult.history ?? 0) < (stockUploadResult.total ?? 0) && (
                      <p className="text-[10px] text-amber-600">일부 행 저장 실패 (서버 로그 확인 필요)</p>
                    )}
                    <button onClick={() => { setStockUploadResult(null); setStockUploadFile(null); }} className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">확인</button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* 시작재고일 · 종료재고일 (사용자 명시) — period_type 은 종료일 dd 로 자동 판정 */}
                    <div>
                      <div className="text-[11px] font-bold text-gray-500 mb-1.5">재고 기간 (필수)</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-gray-500">시작재고일</span>
                          <input
                            type="date"
                            value={stockStartDate}
                            onChange={(e) => setStockStartDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-mono border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-gray-500">종료재고일</span>
                          <input
                            type="date"
                            value={stockEndDate}
                            onChange={(e) => setStockEndDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-mono border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                          />
                        </label>
                      </div>
                      {/* 자동 판정 표시 */}
                      <div className="mt-2 flex items-center gap-2 flex-wrap text-[10px]">
                        {stockPeriodType ? (
                          <span className={`font-black px-2 py-0.5 rounded-full border ${
                            stockPeriodType === "early" ? "text-sky-700 bg-sky-50 border-sky-300" :
                            stockPeriodType === "mid"   ? "text-indigo-700 bg-indigo-50 border-indigo-300" :
                                                          "text-purple-700 bg-purple-50 border-purple-300"
                          }`}>
                            자동판정: {stockPeriodType === "early" ? "초순 (1-10일)" : stockPeriodType === "mid" ? "중순 (11-20일)" : "하순 (21-말일)"}
                          </span>
                        ) : (
                          <span className="text-gray-400">종료일 입력 시 초/중/하순 자동 판정</span>
                        )}
                        {stockStartDate && stockEndDate && stockStartDate > stockEndDate && (
                          <span className="text-rose-600 font-bold">⚠ 시작일이 종료일보다 뒤</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">예: 6월 초순 스냅샷 → 시작재고일 2026-06-01 · 종료재고일 2026-06-10</p>
                    </div>

                    <input ref={stockUploadInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) { setStockUploadFile(null); return; }
                      const ext = file.name.split(".").pop()?.toLowerCase();
                      if (ext !== "xlsx" && ext !== "xls") {
                        alert("xlsx 또는 xls 파일만 가능합니다.");
                        e.target.value = ""; return;
                      }
                      setStockUploadResult(null);
                      setStockUploadFile(file);
                      // 파일명 자동 파싱: "재고현황_YYYY-MMDD_MMDD.xlsx" → 시작재고일 / 종료재고일 자동 등록
                      // 지원 포맷:
                      //   재고현황_2026-0701_0708.xlsx
                      //   재고현황_2026-07-01_07-08.xlsx
                      //   재고현황_20260701_20260708.xlsx
                      try {
                        const stem = file.name.replace(/\.(xlsx|xls)$/i, "");
                        const two = (s: string) => s.padStart(2, "0");
                        // 패턴 1: 재고현황_YYYY-MMDD_MMDD
                        let m: RegExpMatchArray | null = stem.match(/(\d{4})[-_](\d{2})(\d{2})[-_](\d{2})(\d{2})/);
                        if (!m) {
                          // 패턴 2: 재고현황_YYYY-MM-DD_MM-DD
                          m = stem.match(/(\d{4})[-_](\d{2})[-_.](\d{2})[-_](\d{2})[-_.](\d{2})/);
                        }
                        if (!m) {
                          // 패턴 3: YYYYMMDD_YYYYMMDD
                          const alt = stem.match(/(\d{4})(\d{2})(\d{2})[-_](\d{4})(\d{2})(\d{2})/);
                          if (alt) {
                            const [, y1, m1, d1, y2, m2, d2] = alt;
                            setStockStartDate(`${y1}-${two(m1)}-${two(d1)}`);
                            setStockEndDate(`${y2}-${two(m2)}-${two(d2)}`);
                            return;
                          }
                        }
                        if (m) {
                          const [, yyyy, sMM, sDD, eMM, eDD] = m;
                          setStockStartDate(`${yyyy}-${two(sMM)}-${two(sDD)}`);
                          setStockEndDate(`${yyyy}-${two(eMM)}-${two(eDD)}`);
                        }
                      } catch { /* 파싱 실패 시 조용히 무시 · 사용자가 수동 입력 */ }
                    }} />
                    <button
                      type="button"
                      onClick={() => stockUploadInputRef.current?.click()}
                      className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 text-sm font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Upload size={16} />
                      {stockUploadFile ? stockUploadFile.name : "파일 선택 (.xlsx)"}
                    </button>
                    {stockUploadResult?.ok === false && (
                      <p className="text-xs text-rose-500 font-semibold text-center">{stockUploadResult.msg}</p>
                    )}
                    <button
                      type="button"
                      disabled={
                        !stockUploadFile ||
                        stockUploadLoading ||
                        !stockStartDate ||
                        !stockEndDate ||
                        !stockPeriodType ||
                        stockStartDate > stockEndDate
                      }
                      onClick={handleStockUpload}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 disabled:cursor-not-allowed text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2"
                    >
                      {stockUploadLoading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>임포트 중...</span></> : <><Upload size={14} /><span>재고 임포트</span></>}
                    </button>
                  </div>
                )}
                {/* 재고 임포트 이력 */}
                {stockImportLog.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">재고 임포트 이력</p>
                      <button onClick={handleClearStockImportLog} className="text-[10px] text-gray-400 hover:text-rose-500 transition cursor-pointer">clear</button>
                    </div>
                    <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                      {stockImportLog.map((entry, i) => {
                        // 재고기간 라벨: "2026-06-01 ~ 2026-06-10 · 초순"
                        const periodLabel = entry.period_type === "early" ? "초순"
                                          : entry.period_type === "mid"   ? "중순"
                                          : entry.period_type === "late"  ? "하순"
                                          : null;
                        // "4/20" 형식 (한자리 M/D)
                        const shortDate = (d?: string | null): string | null => {
                          if (!d) return null;
                          const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
                          if (!m) return null;
                          return `${Number(m[1])}/${Number(m[2])}`;
                        };
                        const rangeLabel = entry.start_date && entry.snapshot_date
                          ? `${shortDate(entry.start_date)} ~ ${shortDate(entry.snapshot_date)}`
                          : entry.snapshot_date
                            ? `~ ${shortDate(entry.snapshot_date)}`
                            : null;
                        const periodChipClass = entry.period_type === "early"
                          ? "text-sky-700 bg-sky-50 border-sky-200"
                          : entry.period_type === "mid"
                            ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                            : "text-purple-700 bg-purple-50 border-purple-200";
                        const stored = entry.history ?? entry.count;
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-gray-500 font-mono shrink-0">
                                {new Date(entry.timestamp).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              {rangeLabel && (
                                <span
                                  className="text-emerald-700 font-mono font-bold shrink-0"
                                  title={entry.start_date && entry.snapshot_date ? `재고기간 ${entry.start_date} ~ ${entry.snapshot_date}` : `스냅샷일 ${entry.snapshot_date}`}
                                >{rangeLabel}</span>
                              )}
                              {periodLabel && (
                                <span className={`text-[10px] font-black rounded-full px-1.5 py-0.5 border shrink-0 ${periodChipClass}`}>
                                  {periodLabel}
                                </span>
                              )}
                            </div>
                            <span className={`font-semibold shrink-0 ${i === 0 ? "text-indigo-600" : "text-gray-400"}`}>
                              {stored.toLocaleString()}개
                              {entry.total && entry.total !== stored && <span className="text-gray-300"> / {entry.total.toLocaleString()}</span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            {uploadTab === "log" && (
              <>
                <p className="text-xs text-gray-500 mb-2 leading-relaxed">
                  상품목록 · 재고리스트 임포트 이력을 시간순으로 표시합니다.
                </p>
                {stockImportLog.some(e => !e.start_date) && (
                  <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-3">
                    ℹ️ 시작재고일 저장 기능 이전에 임포트된 이력은 종료일만 표시됩니다. 이후 임포트부터는 <b>시작재고일 ~ 종료재고일</b> 이 함께 표시됩니다.
                  </div>
                )}
                {(() => {
                  const shortDate = (d?: string | null): string | null => {
                    if (!d) return null;
                    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d);
                    if (!m) return null;
                    return `${Number(m[1])}/${Number(m[2])}`;
                  };
                  type LogEntry =
                    | { kind: "products"; timestamp: string; count: number }
                    | {
                        kind: "stock";
                        timestamp: string;
                        count: number;
                        total?: number;
                        history?: number;
                        snapshot_date?: string;
                        start_date?: string | null;
                        period_type?: "early" | "mid" | "late" | null;
                      };
                  const merged: LogEntry[] = [
                    ...importLog.map(e => ({ kind: "products" as const, timestamp: e.timestamp, count: e.count })),
                    ...stockImportLog.map(e => ({
                      kind: "stock" as const,
                      timestamp: e.timestamp,
                      count: e.count,
                      total: e.total,
                      history: e.history,
                      snapshot_date: e.snapshot_date,
                      start_date: e.start_date,
                      period_type: e.period_type,
                    })),
                  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

                  if (merged.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
                        <p className="text-sm">임포트 이력이 없습니다</p>
                      </div>
                    );
                  }
                  return (
                    <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl bg-white">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-200 bg-gray-50/70">
                            <th className="text-left py-2 pl-4 pr-3 font-black w-14">유형</th>
                            <th className="text-left py-2 pr-3 font-black">시작재고일</th>
                            <th className="text-left py-2 pr-3 font-black">종료재고일</th>
                            <th className="text-right py-2 pr-3 font-black">임포트 시간</th>
                            <th className="text-right py-2 pr-4 font-black">갯수</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {merged.map((entry, i) => {
                            const when = new Date(entry.timestamp).toLocaleString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
                            if (entry.kind === "products") {
                              return (
                                <tr key={`p-${i}`} className="hover:bg-orange-50/40 transition">
                                  <td className="py-1.5 pl-4 pr-3">
                                    <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border text-orange-700 bg-white border-orange-300">상품</span>
                                  </td>
                                  <td className="py-1.5 pr-3 text-gray-300">—</td>
                                  <td className="py-1.5 pr-3 text-gray-300">—</td>
                                  <td className="py-1.5 pr-3 text-right text-gray-500 font-mono">{when}</td>
                                  <td className={`py-1.5 pr-4 text-right font-semibold ${i === 0 ? "text-orange-600" : "text-gray-500"}`}>
                                    {entry.count.toLocaleString()}개
                                  </td>
                                </tr>
                              );
                            }
                            // stock
                            const stored = entry.history ?? entry.count;
                            return (
                              <tr key={`s-${i}`} className="hover:bg-indigo-50/40 transition">
                                <td className="py-1.5 pl-4 pr-3">
                                  <span className="text-[10px] font-black rounded-full px-1.5 py-0.5 border text-indigo-700 bg-white border-indigo-300">재고</span>
                                </td>
                                <td className="py-1.5 pr-3 text-sky-700 font-mono font-bold" title={entry.start_date ?? "미입력"}>
                                  {entry.start_date ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-1.5 pr-3 text-emerald-700 font-mono font-bold" title={entry.snapshot_date ?? "미입력"}>
                                  {entry.snapshot_date ?? <span className="text-gray-300">—</span>}
                                </td>
                                <td className="py-1.5 pr-3 text-right text-gray-500 font-mono">{when}</td>
                                <td className={`py-1.5 pr-4 text-right font-semibold ${i === 0 ? "text-indigo-600" : "text-gray-500"}`}>
                                  {stored.toLocaleString()}개
                                  {entry.total && entry.total !== stored && <span className="text-gray-300"> / {entry.total.toLocaleString()}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 거래처 로그인 모달 ── */}
      {vendorLoginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.72)", backdropFilter: "blur(12px)" }}
          onClick={() => setVendorLoginOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            style={{ background: "rgba(255,255,255,0.98)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-7 pt-8 pb-6 overflow-hidden" style={{ background: "linear-gradient(135deg, #064e3b 0%, #059669 50%, #10b981 100%)" }}>
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #6ee7b7, transparent)" }} />
              <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #a7f3d0, transparent)" }} />
              <button onClick={() => setVendorLoginOpen(false)} aria-label="닫기" className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-emerald-200 hover:text-white transition cursor-pointer">
                <X size={14} />
              </button>
              <div className="relative flex items-center gap-4 mb-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
                  <CalendarCheck size={28} className="text-white" />
                </div>
                <div>
                  <div className="text-white/60 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Vendor Portal</div>
                  <div className="text-white font-black text-2xl leading-tight tracking-tight">거래처 로그인</div>
                  <div className="text-emerald-200 text-[11px] font-medium tracking-wide mt-0.5">방문예약 이용</div>
                </div>
              </div>
            </div>
            {/* Form */}
            <div className="px-7 pt-5 pb-7">
              <form onSubmit={handleVendorSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-600 text-xs font-semibold pl-1">전화번호</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><User size={14} className="text-slate-400" /></div>
                    <input
                      ref={vendorPhoneRef}
                      type="tel" inputMode="numeric"
                      value={vendorPhone}
                      onChange={(e) => { setVendorPhone(e.target.value); setVendorError(null); }}
                      placeholder="01012345678"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-4 py-3.5 text-slate-900 font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${vendorError ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-rose-100" : "border-2 border-slate-200 bg-slate-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"}`}
                      autoComplete="username" disabled={vendorLoading}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-600 text-xs font-semibold pl-1">비밀번호</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><Lock size={14} className="text-slate-400" /></div>
                    <input
                      type={showVendorPassword ? "text" : "password"}
                      value={vendorPassword}
                      onChange={(e) => { setVendorPassword(e.target.value); setVendorError(null); }}
                      placeholder="비밀번호 입력"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-12 py-3.5 text-slate-900 font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${vendorError ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-rose-100" : "border-2 border-slate-200 bg-slate-50 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"}`}
                      autoComplete="current-password" disabled={vendorLoading}
                    />
                    <button type="button" onClick={() => setShowVendorPassword((v) => !v)} className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer">
                      {showVendorPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                {vendorError && (
                  <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
                    <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                    <p className="text-rose-600 text-xs font-semibold leading-relaxed">{vendorError}</p>
                  </div>
                )}
                <button
                  type="submit" disabled={vendorLoading}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm mt-1 transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                  style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
                >
                  {vendorLoading ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /><span>로그인 중...</span></> : <span>거래처로 입장하기</span>}
                </button>
                <p className="text-[11px] text-slate-400 text-center leading-relaxed">비밀번호 분실 시 관리자에게 문의하세요</p>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Unauthorized toast ── */}
      {unauthorizedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 bg-rose-600 text-white text-sm font-bold rounded-2xl shadow-xl pointer-events-none animate-in fade-in duration-150">
          권한이 없습니다
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
                  <div className="text-white font-black text-2xl leading-tight tracking-tight">오산 메가타운</div>
                </div>
              </div>
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
                        style={{ fontSize: "16px" }}
                        className={`w-full rounded-2xl pl-10 pr-4 py-3.5 text-slate-900 font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${
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
                        style={{ fontSize: "16px" }}
                        className={`w-full rounded-2xl pl-10 pr-12 py-3.5 text-slate-900 font-semibold placeholder:font-normal placeholder:text-slate-300 focus:outline-none transition-all duration-150 ${
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
