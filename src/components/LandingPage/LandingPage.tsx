// src/components/LandingPage.tsx
import React, { useState, useRef, useEffect, useMemo } from "react";
// 2026-08-16 · apiClient 마이그레이션
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import { UploadDataModal } from "./UploadDataModal";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { useApprovalRefreshListener } from "../../lib/approvalEvents";
import { useSettings } from "../../hooks/useSettings";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";
import kakaoQrImg from "../../images/kakao_QR.png";
// 2026-08-17 · 사용자 지시 · 로그인 모달 · pharmacy cross(+) 대신 로고 이미지
import logo2Img from "../../images/logo2.png";
import {
  Clock,
  Lock,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Bell,
  Search,
  Building2,
} from "lucide-react";
import {
  SquaresFour,
  ShieldCheck,
  User,
  Briefcase,
  CalendarDots,
  CalendarCheck,
  Calendar,
  Scan,
  Table,
  ForkKnife,
  Package,
  List,
  Chat,
  ChatCircle,
  FirstAid,
} from "@phosphor-icons/react";
import type { AuthSession, AuthRole } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { TIMING } from "../../constants/timing";
// 2026-08-09 · 거래처 담당자 로그인 시 · 본인 공급사 조회·수정 · 공통 VendorDetailModal 재사용
import { VendorDetailModal, type Vendor as VendorFull } from "./VendorListEditor";
import { VendorStockModal } from "./VendorStockModal";
import { useVendors } from "../../hooks/useVendors";
import { MenuCard } from "./MenuCard";
import { StockSearch } from "./StockSearch";
// 2026-08-17 · 공용 Button (최신 트렌드 · Linear/Vercel 톤 · primary/secondary/ghost/danger)
import { Button } from "../common/Button";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
// 2026-08-17 · UI 프레임워크 · SectionLabel · Hero (목업 톤)
import { SectionLabel } from "../common/SectionLabel";
import { Hero } from "../common/Hero";
import { Card } from "../common/Card";

interface LandingPageProps {
  authSession: AuthSession | null;
  onNavigate: (page: Exclude<AppNavPage, "landing">, auth?: AuthSession) => void;
  onLogout: () => void;
  onAuthOnly?: (auth: AuthSession) => void;
}


export const LandingPage: React.FC<LandingPageProps> = ({ authSession, onNavigate, onLogout, onAuthOnly }) => {
  const confirm = useConfirm();
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast, showError } = useToast();
  // 2026-08-12 · 프레임워크 · brand·contact 반영 · 값 없으면 하드코딩 fallback 유지
  const { brand: lpBrand } = useBrandIdentity();
  const { contact: lpContact } = useContactInfo();

  // 세션 만료 배너 표시 (URL 쿼리 또는 sessionStorage 플래그로 감지 · 2026-07-14)
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(() => {
    try {
      const flag = sessionStorage.getItem("megatown_session_expired");
      const url = new URL(window.location.href);
      const hasQuery = url.searchParams.get("expired") === "1";
      if (flag || hasQuery) {
        sessionStorage.removeItem("megatown_session_expired");
        if (hasQuery) {
          url.searchParams.delete("expired");
          window.history.replaceState({}, "", url.pathname + (url.search ? "?" + url.searchParams.toString() : ""));
        }
        return true;
      }
    } catch { /* noop */ }
    return false;
  });
  useEffect(() => {
    if (!sessionExpiredNotice) return;
    const id = setTimeout(() => setSessionExpiredNotice(false), 8000);
    return () => clearTimeout(id);
  }, [sessionExpiredNotice]);

  const [pendingPage, setPendingPage] = useState<"schedule" | "display" | "scan" | "requests" | "ocr" | "upload" | "leave" | null>(null);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  // 2026-08-21 · #171 Phase 2 · 관리자 오늘 현황 · 모든 알림/요청 노출 · inventory·return·resignation 추가
  const [requestsCounts, setRequestsCounts] = useState({
    display: 0, order: 0, mismatch: 0, lunch: 0,
    inventory: 0, return: 0, resignation: 0,
  });
  // 2026-08-21 · #171 Phase 3 · "전체 N건" 클릭 시 · 상세 breakdown 카드 토글
  const [statusDetailOpen, setStatusDetailOpen] = useState(false);
  // 직원용: 나에게 배정된 진열 보충 요청 중 pending 개수
  const [myPendingCount, setMyPendingCount] = useState(0);

  // 2026-08-03 · 메뉴 검색 · 관리자·직원 카드 이름·부제 매칭 · [data-menu-card] 요소를 조회하여 필터링
  const [menuSearch, setMenuSearch] = useState<string>("");
  useEffect(() => {
    const q = menuSearch.trim().toLowerCase();
    const nodes = document.querySelectorAll<HTMLElement>("[data-menu-card]");
    nodes.forEach(el => {
      if (!q) { el.style.display = ""; return; }
      const text = (el.textContent ?? "").toLowerCase();
      el.style.display = text.includes(q) ? "" : "none";
    });
  });

  // 2026-08-03 · 경영관리 팝오버 제거 · business-manage 통합 페이지로 단순 라우팅

  // 데이터 업로드 통합 모달 (UploadDataModal.tsx 로 분리 · 2026-08-22)
  const [uploadOpen, setUploadOpen] = useState(false);

  // Stock arrivals
  const [stockArrivals, setStockArrivals] = useState<Array<{ id: number; title: string; body?: string | null; created_at: string }>>([]);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [showCreateArrival, setShowCreateArrival] = useState(false);
  // 2026-08-09 · 거래처 담당자 · 본인 공급사 조회·수정 모달 여부
  const [showVendorSelf, setShowVendorSelf] = useState(false);
  // 2026-08-10 · #23 · 공급사 재고확인 모달
  const [showVendorStock, setShowVendorStock] = useState(false);
  const { vendors: _rawVendorsSelf, refresh: refreshVendorsSelf } = useVendors();
  const vendorSelf = useMemo<VendorFull | null>(() => {
    if (!authSession || authSession.role !== "vendor") return null;
    const list = _rawVendorsSelf as unknown as VendorFull[];
    // 우선 id 매칭 · 실패 시 이름 매칭
    const byId = list.find(v => v.id === authSession.employeeId);
    if (byId) return byId;
    const nm = String(authSession.employeeName ?? "").trim();
    return nm ? (list.find(v => v.company_name === nm) ?? null) : null;
  }, [_rawVendorsSelf, authSession]);
  const [newArrivalTitle, setNewArrivalTitle] = useState("");
  const [newArrivalBody, setNewArrivalBody] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  const [unauthorizedToast, setUnauthorizedToast] = useState(false);

  // ── 인라인 재고검색 (비로그인용) ──────────────────────────────────────
  // 2026-08-17 · #130 · code_slim · StockSearch 컴포넌트로 분리
  //   · stockQuery/Results/Searching state · getStockBadges 헬퍼 · handleStockSearch 로직 모두 이동
  //   · 공사중 (settings.underConstruction) 은 여기서 계속 관리
  const { settings } = useSettings();
  const underConstruction = settings.underConstruction === true;

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
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<Array<{ id: number; title: string; body?: string | null; created_at: string }>>("/api/stock-arrivals")
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : [];
        setStockArrivals([...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      })
      .catch(() => { })
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
      setVendorError("핸드폰번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setVendorLoading(true);
    setVendorError(null);
    try {
      const { data } = await api.post<{ id?: number; name?: string; contactName?: string; role?: string; level?: number }>(
        "/api/auth/vendor-login",
        { phone, password: vendorPassword },
      );
      const { id, name, contactName, level } = data ?? {};
      if (!id) { setVendorError("로그인에 실패했습니다."); setVendorLoading(false); return; }
      setVendorLoginOpen(false);
      setVendorPassword("");
      const auth: AuthSession = { role: "vendor", employeeId: id, employeeName: name ?? "", employeeRank: contactName || undefined, level: level ?? 0 };
      onAuthOnly?.(auth);
    } catch (err: unknown) {
      const isApi = err instanceof ApiError;
      const status = isApi ? err.status : 0;
      setVendorError(status === 401 || status === 400 ? (isApi ? err.message : "핸드폰번호 또는 비밀번호가 올바르지 않습니다") : "로그인 중 오류가 발생했습니다.");
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
      setEmpError("핸드폰번호와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    setEmpLoading(true);
    setEmpError(null);
    try {
      const { data } = await api.post<{ id?: number; name?: string; role?: string; level?: number; rank?: string | null }>(
        "/api/auth/login",
        { employee_id: phone, password: empPassword, rememberMe: rememberMe || undefined },
      );
      const { id, name, role, level, rank } = data ?? {};
      if (!id) {
        setEmpError("핸드폰번호 또는 비밀번호가 올바르지 않습니다");
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
    } catch (err: unknown) {
      const isApi = err instanceof ApiError;
      const status = isApi ? err.status : 0;
      if (status === 401 || status === 400) {
        setEmpError(isApi ? err.message : "핸드폰번호 또는 비밀번호가 올바르지 않습니다");
      } else {
        setEmpError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
      setEmpPassword("");
    } finally {
      setEmpLoading(false);
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

  // Load pending counts for managers · 2026-08-18 · 즉시 갱신 지원 (useApprovalRefreshListener)
  const reloadPendingCounts = React.useCallback(() => {
    if (!isManagerOrAdmin) return;
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<{ leave?: number; display?: number; order?: number; mismatch?: number; lunch?: number; inventory?: number; return?: number; resignation?: number }>("/api/requests/pending-counts")
      .then(({ data: d }) => {
        setLeavePendingCount(d?.leave ?? 0);
        setRequestsCounts({
          display: d?.display ?? 0,
          order: d?.order ?? 0,
          mismatch: d?.mismatch ?? 0,
          lunch: d?.lunch ?? 0,
          inventory: d?.inventory ?? 0,
          return: d?.return ?? 0,
          resignation: d?.resignation ?? 0,
        });
      })
      .catch(() => { });
  }, [isManagerOrAdmin]);
  useEffect(() => { reloadPendingCounts(); }, [reloadPendingCounts]);
  // 2026-08-18 · 승인 요청/승인/반려/취소 시 즉시 재로드 (leave/display/order/return/lunch/mismatch)
  useApprovalRefreshListener(reloadPendingCounts);

  // 직원 로그인 시: 나에게 배정된 진열 보충 요청 중 pending 개수 로드 (완료 시 자동 0)
  const reloadMyPending = React.useCallback(() => {
    if (!isEmployee || !authSession?.employeeId) { setMyPendingCount(0); return; }
    const empId = authSession.employeeId;
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<Array<{ status?: string }>>(`/api/display-requests?scope=mine&employeeId=${empId}`)
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const pending = rows.filter(r => (r.status ?? "pending") === "pending").length;
        setMyPendingCount(pending);
      })
      .catch(() => setMyPendingCount(0));
  }, [isEmployee, authSession?.employeeId]);
  useEffect(() => { reloadMyPending(); }, [reloadMyPending]);
  useApprovalRefreshListener(reloadMyPending);

  const handleAnonSubscribe = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      showError("이 브라우저는 알림을 지원하지 않습니다.");
      return;
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      showError("서버 설정 오류: VAPID 공개키가 없습니다. 관리자에게 문의하세요.");
      return;
    }
    setPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        showError("알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      });
      await api.post("/api/anon-push-subscribe", { subscription: sub.toJSON() });
      localStorage.setItem("anon_push_subscribed", "1");
      setPushSubscribed(true);
    } catch (err: unknown) {
      console.error("Push subscribe error:", err);
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? String(err);
      showError("알림 구독 실패: " + msg);
    } finally {
      setPushLoading(false);
    }
  };

  const handleCreateArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArrivalTitle.trim() || !authSession) return;
    setCreateLoading(true);
    try {
      const { data: arrival } = await api.post<any>("/api/stock-arrivals", {
        title: newArrivalTitle.trim(),
        body: newArrivalBody.trim() || undefined,
        employeeId: authSession.employeeId,
      });
      setStockArrivals(prev => [arrival, ...prev]);
      setNewArrivalTitle("");
      setNewArrivalBody("");
      setShowCreateArrival(false);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "오류";
      showError("입고 알림 작성 실패: " + msg);
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
      setTimeout(() => setUnauthorizedToast(false), TIMING.TOAST_SHORT);
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
    <div className="min-h-screen flex flex-col bg-zinc-50">

      {/* 세션 만료 안내 배너 (30분 무활동 자동 로그아웃 · 8초 후 자동 닫힘) */}
      {sessionExpiredNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-amber-50 border border-amber-300 text-amber-900 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 max-w-md animate-pulse">
          <span className="text-lg">⏱️</span>
          <div className="flex-1">
            <p className="text-sm font-bold">세션이 만료되었습니다</p>
            <p className="text-xs text-amber-700 mt-0.5">30분간 활동이 없어 자동 로그아웃되었습니다. 다시 로그인해 주세요.</p>
          </div>
          <button
            onClick={() => setSessionExpiredNotice(false)}
            className="text-amber-500 hover:text-amber-800 text-xl leading-none"
            aria-label="닫기"
          >×</button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="sticky top-0 z-30">
        {/* 2026-08-10 · 사용자 요청 · 거래처 로그인 시 rightSlot 큰 로그아웃 제거 (AppNavHeader 기본 로그아웃 사용 · 중복 방지) */}
        <AppNavHeader
          activePage="landing"
          authSession={authSession}
          onLogout={onLogout}
          onNavigate={isVendor ? undefined : handleNavNavigate}
        />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 relative overflow-hidden pt-8 pb-12">

        {/* 2026-08-17 · Ambient background · 세련 · 3-layer aurora · 딥네이비 · sky · violet · 저채도 */}
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(10,46,74,0.09) 0%, transparent 70%)", filter: "blur(30px)" }} />
        <div className="absolute top-[220px] right-[6%] w-[520px] h-[340px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(62,124,177,0.08) 0%, transparent 70%)", filter: "blur(28px)" }} />
        <div className="absolute bottom-1/4 left-[8%] w-[560px] h-[300px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(139,92,246,0.05) 0%, transparent 70%)", filter: "blur(32px)" }} />
        <div className="absolute bottom-[10%] right-[16%] w-[380px] h-[220px] rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(16,185,129,0.04) 0%, transparent 70%)", filter: "blur(24px)" }} />

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl md:max-w-4xl xl:max-w-6xl">

          {/* Hero brand area · 로그인 사용자 표시는 헤더 탭 아래 [이름 직급] 로 통일 */}
          <div className="w-full mb-3 px-1" />

          {/* 2026-08-03 · 메뉴 검색 · 관리자·직원 카드 이름·부제 텍스트 매칭 (거래처는 검색 제외) */}
          {isLoggedIn && !isVendor && (
            <div className="w-full mb-5 px-1">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="search"
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="메뉴 검색"
                  className="w-full h-10 pl-9 pr-9 text-[13px] font-semibold text-zinc-800 bg-white border border-line rounded-xl shadow-sm placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                />
                {menuSearch && (
                  <button
                    type="button"
                    onClick={() => setMenuSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 transition cursor-pointer"
                    aria-label="검색어 지우기"
                    title="지우기"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Hero · 2026-08-17 · 사용자 지시 · 로그인한 모든 사용자에게 웰컴카드 노출 ── */}
          {isLoggedIn && authSession && (() => {
            const now = new Date();
            const w = ["일","월","화","수","목","금","토"][now.getDay()];
            const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${w}요일`;
            // 관리자만 · pending 요약 노출 · 직원은 일반 인사말
            const pendingParts: string[] = [];
            if (isManagerOrAdmin) {
              if (leavePendingCount > 0) pendingParts.push(`연차 승인 ${leavePendingCount}건`);
              const displayTotal = requestsCounts.display + requestsCounts.order + requestsCounts.mismatch;
              if (displayTotal > 0) pendingParts.push(`진열·발주 ${displayTotal}건`);
            }
            const desc = isManagerOrAdmin
              ? (pendingParts.length > 0
                  ? `오늘 처리할 ${pendingParts.join(", ")}이 있어요.`
                  : "오늘 대기 중인 승인/요청이 없습니다.")
              : "오늘도 좋은 하루 되세요.";
            return (
              <Hero
                eyebrow={dateStr}
                title={<>안녕하세요, {authSession.employeeName}{authSession.employeeRank ? ` ${authSession.employeeRank}` : ""}님 👋</>}
                description={desc}
              />
            );
          })()}

          {/* ── 오늘의 현황 · 2026-08-17 · 사용자 지시 · 텍스트 형식 · dot 색 accent ── */}
          {/* 2026-08-21 · #171 Phase 3 · 모든 직원 노출 (B 선택 · isManagerOrAdmin 제거) · 전체 N건 요약 · 클릭 시 상세 리스트 토글 */}
          {authSession && !isVendor && (
            <div className="w-full mb-6">
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                <AccentBar />
                <div className="text-ink font-bold tracking-tight text-[16px]">오늘의 현황</div>
                {/* 전체 요청 N건 요약 · 클릭 → 상세 리스트 토글 · 2026-08-21 · #171 Phase 3 */}
                {(() => {
                  const totalCount = leavePendingCount
                    + requestsCounts.display + requestsCounts.order
                    + requestsCounts.mismatch + requestsCounts.lunch
                    + requestsCounts.inventory + requestsCounts.return
                    + requestsCounts.resignation;
                  return (
                    <button
                      type="button"
                      onClick={() => setStatusDetailOpen(v => !v)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[13px] font-semibold text-brand-deep bg-brand-tint hover:brightness-95 border border-brand/15 cursor-pointer transition-colors"
                      title={statusDetailOpen ? "상세 리스트 접기" : "상세 리스트 펼치기"}
                      aria-expanded={statusDetailOpen}
                    >
                      전체 <b className="tabular-nums">{totalCount}</b>건
                      <span aria-hidden className={`transition-transform ${statusDetailOpen ? "rotate-180" : ""}`}>▾</span>
                    </button>
                  );
                })()}
              </div>
              {/* 7항목 (연차·진열발주·불일치·점심·재고점검·반품·사직서) · 각 클릭 → 페이지 이동 */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[17px] text-ink-soft pl-[13px]">
                <button
                  type="button"
                  onClick={() => onNavigate("leave", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-amber-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="연차 승인 페이지로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${leavePendingCount > 0 ? "bg-amber-500" : "bg-zinc-300"}`} />
                  연차 승인 <b className={`font-bold tabular-nums ${leavePendingCount > 0 ? "text-amber-700" : "text-ink"}`}>{leavePendingCount}</b>건
                </button>
                {/* 2026-08-21 · #171 · 진열/발주 분리 · 사용자 요청 · 발주 별도 항목 (teal) */}
                <button
                  type="button"
                  onClick={() => onNavigate("requests", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-sky-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="진열 요청 · 요청 목록으로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.display > 0 ? "bg-sky-500" : "bg-zinc-300"}`} />
                  진열 요청 <b className={`font-bold tabular-nums ${requestsCounts.display > 0 ? "text-sky-700" : "text-ink"}`}>{requestsCounts.display}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("display", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-teal-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="발주 요청 · 매장>발주로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.order > 0 ? "bg-teal-500" : "bg-zinc-300"}`} />
                  발주 요청 <b className={`font-bold tabular-nums ${requestsCounts.order > 0 ? "text-teal-700" : "text-ink"}`}>{requestsCounts.order}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("requests", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-rose-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="배치구역 불일치 · 요청 목록으로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.mismatch > 0 ? "bg-rose-500" : "bg-zinc-300"}`} />
                  배치구역 불일치 <b className={`font-bold tabular-nums ${requestsCounts.mismatch > 0 ? "text-rose-700" : "text-ink"}`}>{requestsCounts.mismatch}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("lunch", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-emerald-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="점심 신청 페이지로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.lunch > 0 ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  점심 신청 <b className={`font-bold tabular-nums ${requestsCounts.lunch > 0 ? "text-emerald-700" : "text-ink"}`}>{requestsCounts.lunch}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("stockcheck", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="재고 점검 페이지로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.inventory > 0 ? "bg-violet-500" : "bg-zinc-300"}`} />
                  재고 점검 <b className={`font-bold tabular-nums ${requestsCounts.inventory > 0 ? "text-violet-700" : "text-ink"}`}>{requestsCounts.inventory}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("requests", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-orange-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="반품 요청 · 요청 목록으로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.return > 0 ? "bg-orange-500" : "bg-zinc-300"}`} />
                  반품 요청 <b className={`font-bold tabular-nums ${requestsCounts.return > 0 ? "text-orange-700" : "text-ink"}`}>{requestsCounts.return}</b>건
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("business-manage", authSession!)}
                  className="inline-flex items-center gap-1.5 hover:text-red-800 hover:underline underline-offset-2 cursor-pointer transition-colors"
                  title="사직서 승인 · 경영관리로 이동"
                >
                  <span className={`w-2 h-2 rounded-full ${requestsCounts.resignation > 0 ? "bg-red-500" : "bg-zinc-300"}`} />
                  사직서 승인 <b className={`font-bold tabular-nums ${requestsCounts.resignation > 0 ? "text-red-700" : "text-ink"}`}>{requestsCounts.resignation}</b>건
                </button>
              </div>

              {/* 2026-08-21 · #171 Phase 3 · 상세 리스트 (전체 N건 클릭 시 토글) · 7항목 breakdown table */}
              {statusDetailOpen && (
                <Card variant="raw-sm" padding="none" className="mt-3 px-4 py-3">
                  <div className="text-[13px] font-bold text-ink-soft mb-2 tracking-tight">요청 상세 · 카테고리별 대기 건수</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
                    {[
                      { label: "연차 승인", count: leavePendingCount, dot: "bg-amber-500", text: "text-amber-700", nav: "leave" as Exclude<AppNavPage, "landing"> },
                      { label: "진열 요청", count: requestsCounts.display, dot: "bg-sky-500", text: "text-sky-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
                      { label: "발주 요청", count: requestsCounts.order, dot: "bg-teal-500", text: "text-teal-700", nav: "display" as Exclude<AppNavPage, "landing"> },
                      { label: "배치구역 불일치", count: requestsCounts.mismatch, dot: "bg-rose-500", text: "text-rose-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
                      { label: "점심 신청", count: requestsCounts.lunch, dot: "bg-emerald-500", text: "text-emerald-700", nav: "lunch" as Exclude<AppNavPage, "landing"> },
                      { label: "재고 점검", count: requestsCounts.inventory, dot: "bg-violet-500", text: "text-violet-700", nav: "stockcheck" as Exclude<AppNavPage, "landing"> },
                      { label: "반품 요청", count: requestsCounts.return, dot: "bg-orange-500", text: "text-orange-700", nav: "requests" as Exclude<AppNavPage, "landing"> },
                      { label: "사직서 승인", count: requestsCounts.resignation, dot: "bg-red-500", text: "text-red-700", nav: "business-manage" as Exclude<AppNavPage, "landing"> },
                    ].map(item => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => onNavigate(item.nav, authSession!)}
                        className="flex items-center gap-2 py-1 hover:bg-zinc-50 rounded-md px-1.5 cursor-pointer transition-colors text-left"
                      >
                        <span className={`w-2 h-2 rounded-full ${item.count > 0 ? item.dot : "bg-zinc-300"} shrink-0`} />
                        <span className="flex-1 text-ink-soft">{item.label}</span>
                        <span className={`font-bold tabular-nums ${item.count > 0 ? item.text : "text-zinc-400"}`}>{item.count}</span>
                        <span className="text-zinc-400">건</span>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ── 관리자 도구 (관리자 로그인 시에만 표시) · 2026-08-17 · SectionLabel + 반응형 grid ── */}
          {isManagerOrAdmin && (
            <div className="w-full mb-7">
              <SectionLabel tone="teal">관리자 도구 바로가기</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">

                {/* 매장관리 · teal · 목업 톤 기본 사이즈 */}
                <MenuCard color="teal" icon={SquaresFour} title="매장관리" description="매장 · 발주 · 매입 · 결제 · 통계 · 입고알림"
                  onClick={() => onNavigate("display", authSession!)} />

                {/* 경영관리 — violet · MenuCard · pending 배지 */}
                <MenuCard color="sky" icon={Briefcase} title="경영관리" description="직원관리 · 연차승인 · 점심불참 · 권한"
                  onClick={() => onNavigate("business-manage", authSession!)}
                  badge={leavePendingCount > 0 ? (
                    <div className="absolute top-2.5 right-2.5 min-w-[24px] h-6 px-2 rounded-full flex items-center justify-center text-white text-[11px] font-bold tabular-nums bg-brand-deep shadow-sm ring-2 ring-white z-10">
                      {leavePendingCount}
                    </div>
                  ) : undefined} />

                {/* 요청목록 조회 · 2026-08-17 · 최신 트렌드 · 단일 mono 배지 (4개 파스텔 dot → 총 건수) */}
                <MenuCard color="coral" icon={List} title="요청목록 조회" description="진열·발주요청 및 배치구역 불일치 확인"
                  onClick={() => onNavigate("requests", authSession!)}
                  badge={(() => {
                    const total = requestsCounts.display + requestsCounts.order + requestsCounts.mismatch + requestsCounts.lunch;
                    if (total === 0) return undefined;
                    return (
                      <div className="absolute top-2.5 right-2.5 min-w-[24px] h-6 px-2 rounded-full flex items-center justify-center text-white text-[11px] font-bold tabular-nums bg-brand-deep shadow-sm ring-2 ring-white z-10">
                        {total}
                      </div>
                    );
                  })()} />

                {/* 데이터 업로드 (통합) — orange (level 9 전용) — 상품목록 · 재고리스트 서브탭 */}
                {isSuperAdminLevel9 && (
                  <MenuCard color="amber" icon={Table} title="데이터 업로드" description="상품목록 · 재고리스트 xlsx 업로드"
                    onClick={() => setUploadOpen(true)} />
                )}

                {/* 거래명세서 OCR 카드 · 매장관리 > 매입 > 사입·OCR 서브탭으로 이동 · 2026-08-03 랜딩 제거 */}

                {/* 연차 승인 카드 · 경영관리 팝오버로 이동 · 2026-08-03 */}

                {/* 설정 — zinc (level 9 전용) · 권한 조정 + 환경 설정 통합 · 원본 inline style 문법오류 fix */}
                {isSuperAdminLevel9 && (
                  <MenuCard color="zinc" icon={ShieldCheck} title="설정" description="권한 · 근무 유형 · 시급 등 앱 전체 설정"
                    onClick={() => onNavigate("permissions", authSession!)} />
                )}

                {/* 구역 라벨 관리 카드 · 설정(권한관리 > 환경설정) 내부로 이동 · 2026-08-03 랜딩 제거 */}
                {/* 기타 도구 카드 · 2026-08-04 · 사용자 요청으로 완전 삭제 (OthersPage · InventorySalesPage · SynonymPage) */}

              </div>
            </div>
          )}

          {/* ── 직원용 · 2026-08-17 · SectionLabel + 반응형 grid ── */}
          {isLoggedIn && !isVendor && (
            <div className="w-full mb-7">
              <SectionLabel tone="sky">직원용 바로가기</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">

                {/* 약사 전용 — sky · level ≥ 3 만 노출 */}
                {(authSession?.level ?? 0) >= 3 && (
                  <MenuCard color="teal" icon={FirstAid} title="약사 전용" description="교육자료 · 복약지도 · 참고 문서"
                    orderClass="order-1"
                    onClick={() => onNavigate("pharmacist", authSession!)} />
                )}

                {/* 스케줄표 조회 — amber */}
                <MenuCard color="amber" icon={Calendar} title="스케줄표 조회" description="직원 월간 근무 스케줄 확인 및 관리"
                  orderClass="order-2"
                  onClick={() => onNavigate("schedule", authSession!)} />

                {/* 실재고 확인 — red · Scan */}
                <MenuCard color="amber" icon={Scan} title="실재고 확인" description="바코드 스캔 · 실재고·진열보충 요청"
                  orderClass="order-3"
                  onClick={() => onNavigate("scan", authSession!)} />

                {/* 상품입고 — red · Package */}
                <MenuCard color="coral" icon={Package} title="상품입고" description="바코드 스캔으로 입고 상품 등록"
                  orderClass="order-4"
                  onClick={() => onNavigate("productarrival", authSession!)} />

                {/* 연차 신청 — indigo · 사이드바 [승인요청]>[연차신청] 로 연결 (subTab=leave) */}
                <MenuCard color="sky" icon={CalendarDots} title="연차 신청" description="휴가·연차 신청 및 내역 조회"
                  orderClass="order-5"
                  onClick={() => {
                    try { localStorage.setItem("sidebar.subtab.approval-request", "leave"); } catch { /* silent */ }
                    onNavigate("approval-request", authSession!);
                  }} />

                {/* 점심 불참 — indigo · ForkKnife */}
                <MenuCard color="amber" icon={ForkKnife} title="점심 불참" description="오늘의 점심 불참 신청"
                  orderClass="order-6"
                  onClick={() => onNavigate("lunch", authSession!)} />

                {/* 내 요청목록 · rose · MenuCard 통일 (2026-08-17 · #130 · 무지개 gradient 정리) */}
                {isEmployee && (
                  <MenuCard color="rose" icon={Chat} title="내 요청목록"
                    description={authSession?.employeeName
                      ? `${authSession.employeeName}${authSession.employeeRank ? " " + authSession.employeeRank : ""} 님 · 배정된 요청 확인`
                      : "나에게 배정된 진열 보충 요청"}
                    orderClass="order-1"
                    onClick={() => onNavigate("requests", authSession!)}
                    badge={myPendingCount > 0 ? (
                      <div className="absolute top-2 right-2 z-10">
                        <span className="min-w-[24px] h-[24px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-rose-500 shadow-lg ring-2 ring-white animate-pulse">
                          {myPendingCount > 99 ? "99+" : myPendingCount}
                        </span>
                      </div>
                    ) : undefined} />
                )}

                {/* 이슈공유 게시판 (전체 직원) — amber */}
                <MenuCard color="amber" icon={ChatCircle} title="이슈공유" description="질문·이슈·메모 · 사진 첨부 · 담당자 지정"
                  orderClass="order-4"
                  onClick={() => onNavigate("board" as any, authSession!)} />

              </div>
            </div>
          )}

          {/* ── 비로그인: 인라인 재고검색 + 로그인 버튼 (보조) ── */}
          {!isLoggedIn && (
            <div className="w-full mb-7 flex flex-col gap-3">
              {/* 브랜드 헤더 · 2026-08-13 · PC 공통헤더 (AppNavHeader) 와 · 글씨·색깔 완전 통일
                    · OSAN = red-500 · MEGATOWN = gray-900 · font-bold · tracking-tight · 2줄 배치 */}
              <div className="w-full flex flex-col items-center pt-2 pb-1">
                <div className="flex flex-col gap-0.5 font-bold tracking-tight leading-none select-none items-center">
                  {(() => {
                    const en = lpBrand.brandNameEn || "OSAN MEGATOWN";
                    const accent = lpBrand.brandAccentWord || "MEGATOWN";
                    const idx = accent ? en.indexOf(accent) : -1;
                    const before = idx >= 0 ? en.slice(0, idx).trim() : en;
                    const after  = idx >= 0 ? en.slice(idx + accent.length).trim() : "";
                    return (
                      <>
                        {before && <span className="text-red-500 text-lg leading-none">{before}</span>}
                        {idx >= 0 && <span className="text-gray-900 text-sm leading-none">{accent}</span>}
                        {after && <span className="text-red-500 text-lg leading-none">{after}</span>}
                      </>
                    );
                  })()}
                </div>
                <div className="text-zinc-400 text-[11px] sm:text-xs mt-1 font-semibold tracking-wide whitespace-pre-line leading-tight">{lpBrand.shortName || "오산\n메가타운약국"}</div>
              </div>
              {/* 2026-08-17 · 사용자 지시 · 공사중 배너 · 최신 트렌드 · 노랑 → 딥네이비 modern (Linear/Vercel 톤) */}
              {underConstruction ? (
                <div className="w-full rounded-[20px] overflow-hidden shadow-lg relative"
                  style={{ background: "linear-gradient(120deg, #0A2E4A 0%, #1E5C8E 62%, #3E7CB1 100%)" }}>
                  {/* subtle decorative blobs */}
                  <div className="absolute rounded-full w-[180px] h-[180px] -right-[40px] -top-[70px] pointer-events-none" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="absolute rounded-full w-[120px] h-[120px] right-[100px] -bottom-[60px] pointer-events-none" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="relative px-6 py-12 flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/[0.12] ring-1 ring-white/20 backdrop-blur-sm">
                      <Clock size={30} className="text-white animate-pulse" strokeWidth={2} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="text-[13px] font-bold uppercase tracking-[0.06em]" style={{ color: "#B9D6EA" }}>Coming Soon</div>
                      <div className="text-white font-extrabold text-[22px] sm:text-[26px] tracking-tight leading-tight">곧 오픈 예정입니다</div>
                      <div className="text-[14px] font-medium" style={{ color: "#DCE8F3" }}>서비스 준비 중 · 잠시만 기다려주세요</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* 인라인 재고검색 · StockSearch 컴포넌트 (2026-08-17 · #130 · code_slim 분리) */
                <StockSearch />
              )}

              {/* 직원·거래처 로그인 · 2026-08-17 · 최신 트렌드 · 공용 Button · primary/secondary */}
              <div className="flex gap-2.5">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  icon={<Lock size={16} strokeWidth={2.2} />}
                  onClick={() => setPendingPage("schedule")}
                >
                  직원 로그인
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  icon={<CalendarCheck size={16} weight="fill" />}
                  onClick={() => setVendorLoginOpen(true)}
                >
                  거래처 로그인
                </Button>
              </div>

              {/* 2026-08-11 · 카카오톡 채널 친구추가 · 하단 · 세련된 카드 · 공사중 모드에선 숨김 */}
              {!underConstruction && (
              <div className="w-full mt-3 rounded-2xl overflow-hidden shadow-md border border-[#F0D700]/70 bg-[#FEE500]">
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-zinc-900 text-[#FEE500] font-bold text-[10px] flex items-center justify-center">talk</span>
                  <span className="text-zinc-900 font-bold text-[13px]">카카오톡 채널</span>
                  <span className="ml-auto text-zinc-800/70 font-semibold text-[11px]">새 소식 알림받기</span>
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <img
                    src={lpContact.kakaoQrImageUrl || kakaoQrImg}
                    alt="카카오톡 채널 QR"
                    className="w-20 h-20 rounded-lg bg-white p-1 shrink-0 object-contain border border-line"
                  />
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className="text-zinc-900 font-bold text-[13px] leading-tight whitespace-pre-line">{lpBrand.shortName || "오산\n메가타운약국"}</div>
                    <div className="text-zinc-500 text-[11px] leading-tight">QR 스캔 또는 아래 버튼 클릭</div>
                    <a
                      href={lpContact.kakaoChannelUrl || "https://pf.kakao.com/_XWuiX/friend"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center justify-center rounded-lg px-3 py-2 bg-[#FEE500] hover:bg-[#FADA0A] active:scale-[0.99] transition-all shadow-sm border border-[#F0D700]/60 cursor-pointer"
                    >
                      <span className="text-zinc-900 font-bold text-[13px]">친구추가</span>
                    </a>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}

          {/* ── 거래처용 · 2026-08-17 · #145 · SectionLabel + MenuCard 통일 (인라인 button 3개 제거) ── */}
          {isLoggedIn && (isVendor || isSuperAdminLevel9) && (
            <div className="w-full">
              <SectionLabel tone="teal">거래처용 바로가기</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
                <MenuCard color="teal" icon={CalendarCheck} title="방문예약" description="상담 및 방문 일정을 간편하게 예약"
                  onClick={() => onNavigate("reservation", authSession!)} />
                {(isVendor || isSuperAdminLevel9) && (
                  <MenuCard color="sky" icon={Building2} title="공급사 정보"
                    description={isVendor && !vendorSelf ? "정보를 불러올 수 없습니다" : "본인 공급사 정보 조회·수정"}
                    onClick={() => {
                      if (isVendor && vendorSelf) { setShowVendorSelf(true); return; }
                      if (isSuperAdminLevel9) {
                        try { localStorage.setItem("sidebar.subtab.display", "vendor-manage"); } catch { /* silent */ }
                        onNavigate("display", authSession!);
                      }
                    }} />
                )}
                {(isVendor || isSuperAdminLevel9) && (
                  <MenuCard color="amber" icon={Package} title="공급사 재고확인" description="상품별 재고 현황 조회"
                    onClick={() => {
                      if (isVendor && vendorSelf) { setShowVendorStock(true); return; }
                      if (isSuperAdminLevel9) {
                        try { localStorage.setItem("sidebar.subtab.display", "vendor-manage"); } catch { /* silent */ }
                        onNavigate("display", authSession!);
                      }
                    }} />
                )}
              </div>
            </div>
          )}

          {/* ── 입고 알림 · 2026-08-10 · #22 · 거래처 로그인 시 숨김 ── */}
          {!isVendor && (
          <div className="w-full mb-6 mt-2">
            {/* 2026-08-17 · SectionLabel + right slot (알림 받기 / 구독 중) · 최신 트렌드 · 딥네이비 톤 */}
            <SectionLabel tone="sky" right={
              !pushSubscribed ? (
                <button
                  onClick={handleAnonSubscribe}
                  disabled={pushLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <Bell size={13} fill="currentColor" />알림 받기
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[14px] text-brand-deep font-semibold bg-brand-tint border border-brand/15 rounded-full px-3 py-1.5">
                  <Bell size={13} fill="currentColor" /> 구독 중
                </span>
              )
            }>입고 알림</SectionLabel>
            {arrivalsLoading && stockArrivals.length > 0 && (
              <div className="flex items-center justify-center py-1.5 mb-1 bg-brand-tint border border-brand/15 rounded-lg sticky top-0 z-10"><Spinner tone="brand" size={13} label="새로 불러오는 중..." labelSize={13} /></div>
            )}
            {arrivalsLoading && stockArrivals.length === 0 ? (
              <div className="flex items-center justify-center py-10"><Spinner tone="zinc" size={16} label="로딩 중..." labelSize={14} /></div>
            ) : !arrivalsLoading && stockArrivals.length === 0 ? (
              <Card variant="flat" padding="none" className="text-center text-[14px] text-ink-soft py-8">데이터 없음</Card>
            ) : (
              <Card clip padding="none" className={`divide-y divide-line/70 ${arrivalsLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {stockArrivals.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-tint/40 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-brand-tint flex items-center justify-center shrink-0">
                      <Package size={15} className="text-brand-deep" weight="fill" />
                    </div>
                    <span className="flex-1 text-[15px] font-semibold text-ink truncate">{a.title}</span>
                    <span className="text-[13px] text-ink-soft shrink-0 whitespace-nowrap tabular-nums">
                      {new Date(a.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
          )}

        </div>
      </div>

      {/* ── 데이터 업로드 통합 모달 (UploadDataModal.tsx · 2026-08-22 분리) ── */}
      <UploadDataModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        authSession={authSession}
        isManagerOrAdmin={isManagerOrAdmin}
      />

      {/* 2026-08-09 · 거래처 담당자 · 본인 공급사 조회·수정 모달 (공통 VendorDetailModal · 매입이력과 동일) */}
      {showVendorSelf && vendorSelf && (
        <VendorDetailModal
          vendor={vendorSelf}
          onClose={() => setShowVendorSelf(false)}
          onSaved={refreshVendorsSelf}
        />
      )}

      {/* 2026-08-10 · #23 · 거래처 · 공급사 재고확인 모달 */}
      {showVendorStock && vendorSelf && (
        <VendorStockModal
          open={showVendorStock}
          onClose={() => setShowVendorStock(false)}
          vendorName={vendorSelf.company_name ?? ""}
        />
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
            {/* Header · 2026-08-17 · 딥네이비 gradient 통일 (모든 로그인 모달 · 브랜드 톤 일관) */}
            <div className="relative px-7 pt-8 pb-6 overflow-hidden" style={{ background: "linear-gradient(120deg, #0A2E4A 0%, #1E5C8E 62%, #3E7CB1 100%)" }}>
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #93B4D0, transparent)" }} />
              <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #C4DAEE, transparent)" }} />
              <button onClick={() => setVendorLoginOpen(false)} aria-label="닫기" className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition cursor-pointer">
                <X size={14} />
              </button>
              <div className="relative flex items-center gap-4 mb-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0" style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)" }}>
                  <CalendarCheck size={28} className="text-white" weight="fill" />
                </div>
                <div>
                  <div className="text-white/70 text-[10px] font-semibold tracking-widest uppercase mb-0.5">Vendor Portal</div>
                  <div className="text-white font-bold text-2xl leading-tight tracking-tight">거래처 로그인</div>
                  <div className="text-emerald-100 text-[11px] font-medium tracking-wide mt-0.5">방문예약 이용</div>
                </div>
              </div>
            </div>
            {/* Form */}
            <div className="px-7 pt-5 pb-7">
              <form onSubmit={handleVendorSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-600 text-xs font-semibold pl-1">핸드폰번호</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><User size={14} className="text-zinc-400" weight="fill" /></div>
                    <input
                      ref={vendorPhoneRef}
                      type="tel" inputMode="numeric"
                      value={vendorPhone}
                      onChange={(e) => { setVendorPhone(e.target.value); setVendorError(null); }}
                      placeholder="01012345678"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-4 py-3.5 text-zinc-900 font-semibold placeholder:font-normal placeholder:text-zinc-300 focus:outline-none transition-all duration-150 ${vendorError ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-brand-tint" : "border-2 border-line bg-zinc-50 focus:border-brand-deep focus:bg-white focus:ring-2 focus:ring-brand-tint"}`}
                      autoComplete="username" disabled={vendorLoading}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-600 text-xs font-semibold pl-1">비밀번호</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none"><Lock size={14} className="text-zinc-400" /></div>
                    <input
                      type={showVendorPassword ? "text" : "password"}
                      value={vendorPassword}
                      onChange={(e) => { setVendorPassword(e.target.value); setVendorError(null); }}
                      placeholder="비밀번호 입력"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-12 py-3.5 text-zinc-900 font-semibold placeholder:font-normal placeholder:text-zinc-300 focus:outline-none transition-all duration-150 ${vendorError ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-brand-tint" : "border-2 border-line bg-zinc-50 focus:border-brand-deep focus:bg-white focus:ring-2 focus:ring-brand-tint"}`}
                      autoComplete="current-password" disabled={vendorLoading}
                    />
                    <button type="button" onClick={() => setShowVendorPassword((v) => !v)} className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-600 transition cursor-pointer">
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
                 
                >
                  {vendorLoading ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /><span>로그인 중...</span></> : <span>거래처로 입장하기</span>}
                </button>
                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">비밀번호 분실 시 관리자에게 문의하세요</p>
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
            {/* ── Branded hero panel · 2026-08-17 · 딥네이비 톤 (Hero/사이드바와 통일) ── */}
            <div
              className="relative px-7 pt-8 pb-6 overflow-hidden"
              style={{
                background: "linear-gradient(120deg, #0A2E4A 0%, #1E5C8E 62%, #3E7CB1 100%)",
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

              {/* Brand identity · 2026-08-17 · 사용자 지시 · + 아이콘 대신 로고 · 한 줄 "오산 메가타운약국" */}
              <div className="relative flex items-center gap-4 mb-3">
                <img
                  src={logo2Img}
                  alt={`${lpBrand.region ? lpBrand.region + " " : ""}${lpBrand.shortName} 로고`}
                  className="w-14 h-14 object-cover rounded-2xl ring-1 ring-white/30 shadow-lg shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <div className="text-white font-bold text-2xl leading-tight tracking-tight truncate">
                    {(lpBrand.region ? lpBrand.region + " " : "오산 ") + (lpBrand.shortName || "메가타운약국")}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Form area ── */}
            <div className="px-7 pt-5 pb-7">

              {/* ── Employee login form ── */}
              <form onSubmit={handleEmployeeSubmit} className="flex flex-col gap-4">

                {/* Phone number field */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-600 text-xs font-semibold pl-1">
                    핸드폰번호
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <User size={14} className="text-zinc-400" weight="fill" />
                    </div>
                    <input
                      ref={empNumberRef}
                      type="tel"
                      inputMode="numeric"
                      value={empNumber}
                      onChange={(e) => { setEmpNumber(e.target.value); setEmpError(null); }}
                      placeholder="01012345678"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-4 py-3.5 text-zinc-900 font-semibold placeholder:font-normal placeholder:text-zinc-300 focus:outline-none transition-all duration-150 ${empError
                        ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-brand-tint"
                        : "border-2 border-line bg-zinc-50 focus:border-brand-deep focus:bg-white focus:ring-2 focus:ring-brand-tint"
                        }`}
                      autoComplete="username"
                      disabled={empLoading}
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-600 text-xs font-semibold pl-1">
                    비밀번호
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Lock size={14} className="text-zinc-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={empPassword}
                      onChange={(e) => { setEmpPassword(e.target.value); setEmpError(null); }}
                      placeholder="비밀번호 입력"
                      style={{ fontSize: "16px" }}
                      className={`w-full rounded-2xl pl-10 pr-12 py-3.5 text-zinc-900 font-semibold placeholder:font-normal placeholder:text-zinc-300 focus:outline-none transition-all duration-150 ${empError
                        ? "border-2 border-rose-400 bg-rose-50 focus:ring-2 focus:ring-brand-tint"
                        : "border-2 border-line bg-zinc-50 focus:border-brand-deep focus:bg-white focus:ring-2 focus:ring-brand-tint"
                        }`}
                      autoComplete="current-password"
                      disabled={empLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-4 flex items-center text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
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
                    className="w-4 h-4 rounded border-2 border-zinc-300 text-indigo-600 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-700 transition">자동 로그인</span>
                </label>

                {/* Error message */}
                {empError && (
                  <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
                    <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                    <p className="text-rose-600 text-xs font-semibold leading-relaxed">{empError}</p>
                  </div>
                )}

                {/* Submit button · 2026-08-17 · 공용 Button · primary lg · 딥네이비 */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={empLoading}
                  className="mt-1"
                >
                  {empLoading ? "로그인 중..." : "직원으로 입장하기"}
                </Button>

                <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
                  비밀번호 분실 시 관리자에게 문의하세요
                </p>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};
