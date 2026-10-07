// src/components/LandingPage.tsx
import React, { useState, useRef, useEffect } from "react";
// 2026-08-16 · apiClient 마이그레이션
import { api, ApiError } from "../../lib/apiClient";
// 2026-09-27 · 네비게이션 SSOT · useActiveNav Context · setActiveByPage 로 subTab 전달
import { useActiveNav } from "../../contexts/ActiveNavContext";
import { useConfirm } from "../../hooks/useConfirm";
import { UploadDataModal } from "./UploadDataModal";
import { LoginModals } from "./LoginModals";
// 2026-10-07 · 2026 Operations Dashboard 리뉴얼 · Hero/TodayStatusPanel/TodayRevenueKpiPanel/MenuCard grid 통합
import { HomeDashboard } from "./HomeDashboard";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
import { useApprovalRefreshListener } from "../../lib/approvalEvents";
import { useSettings } from "../../hooks/useSettings";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import { useContactInfo } from "../../hooks/useContactInfo";
import kakaoQrImg from "../../images/kakao_QR.png";
import {
  Clock,
  Lock,
  X,
  Bell,
  Building2,
} from "lucide-react";
import {
  SquaresFour,
  ShieldCheck,
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
  // 2026-09-24 · #352 · 거래처 발주이력 확인 · Truck 아이콘
  Truck,
} from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { TIMING } from "../../constants/timing";
// 2026-08-09 · 거래처 담당자 로그인 시 · 본인 공급사 조회·수정 · 공통 VendorDetailModal 재사용
import { VendorDetailModal } from "./VendorListEditor";
// 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 (VendorStockPage) 이관
//   · 2026-09-24 · VendorStockModal 파일 삭제 (VendorStockPage 로 완전 대체 · 사용처 없음)
//   · 랜딩 진입점만 · setShowVendorStock 대신 onNavigate("vendor-stock")
// 2026-10-06 · 공급사 승인 접근 fix · 승인 상태 derived hook · SSOT (useVendors 캐시 재사용)
import { useVendorApproval } from "../../hooks/useVendorApproval";
import { MenuCard } from "./MenuCard";
import { StockSearch } from "./StockSearch";
// 2026-08-25 · Framework Phase 4 · 입고알림 · self-contained 이관
import { StockArrivalList } from "./StockArrivalList";
// 2026-08-17 · 공용 Button (최신 트렌드 · Linear/Vercel 톤 · primary/secondary/ghost/danger)
import { Button } from "../common/Button";
import { Spinner } from "../common/Spinner";
// 2026-08-17 · UI 프레임워크 · SectionLabel · Hero (목업 톤)
import { SectionLabel } from "../common/SectionLabel";
import { Hero } from "../common/Hero";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";

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
  // 2026-09-27 · 네비게이션 SSOT · subTab 지정 이동 시 · setActiveByPage 사용 (localStorage 사이드 채널 제거)
  const { setActiveByPage } = useActiveNav();
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
  // 2026-10-06 · 사용자 지시 · 배치구역 불일치 기능 전체 제거 · mismatch 필드 삭제
  const [requestsCounts, setRequestsCounts] = useState({
    display: 0, order: 0, lunch: 0,
    inventory: 0, return: 0, resignation: 0,
    // 2026-09-02 · 사용자 지시 · 거래처 승인 요청 · 오늘의 현황 표시
    vendor: 0,
  });
  // 2026-08-21 · #171 Phase 3 · "전체 N건" 클릭 시 · 상세 breakdown 카드 토글
  const [statusDetailOpen, setStatusDetailOpen] = useState(false);
  // 2026-08-23 · #171 잔여 · 결제요청 (admin only · 미결제·부분결제 매입건)
  const [paymentPendingCount, setPaymentPendingCount] = useState(0);
  // 직원용: 나에게 배정된 진열 보충 요청 중 pending 개수
  const [myPendingCount, setMyPendingCount] = useState(0);

  // 2026-10-07 · HomeDashboard 리뉴얼 · 메뉴 검색 bar 제거 (giant search 금지) · state orphan 제거

  // 2026-08-03 · 경영관리 팝오버 제거 · business-manage 통합 페이지로 단순 라우팅

  // 데이터 업로드 통합 모달 (UploadDataModal.tsx 로 분리 · 2026-08-22)
  const [uploadOpen, setUploadOpen] = useState(false);

  // 2026-08-25 · Framework Phase 4 · 입고알림 · StockArrivalList 로 이관
  // 2026-08-09 · 거래처 담당자 · 본인 공급사 조회·수정 모달 여부
  const [showVendorSelf, setShowVendorSelf] = useState(false);
  // 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 (VendorStockPage) 이관
  //   · showVendorStock 상태 제거 · 버튼 클릭 시 onNavigate("vendor-stock") 호출
  // 2026-09-24 · E-013 · 사용자 보고 · 초기 vendor 로그인 시 · vendorSelf null · 버튼 비활성
  //   · useVendors · loading state 활용 · 로딩 중엔 별도 label · 승인 판정 지연 방지
  // 2026-10-06 · 공급사 승인 접근 fix · useVendorApproval 훅으로 추출 · SSOT · state/message 공통화
  const {
    vendorSelf,
    vendorsLoading,
    state: vendorApprovalState,
    message: vendorApprovalMessage,
    refresh: refreshVendorsSelf,
  } = useVendorApproval(authSession);
  const [unauthorizedToast, setUnauthorizedToast] = useState(false);

  // 2026-09-03 · fix · 사용자 리포트 · vendor 로그인 후에도 [공급사 정보] 클릭 안 됨
  //   · 원인 · useVendors 훅 · 마운트 시 1회만 fetch · 로그인 이전 401 실패 후 · 로그인해도 재조회 X
  //   · fix · authSession 변경 시 (특히 vendor 로그인) · vendors 캐시 강제 재로드
  useEffect(() => {
    if (authSession?.role === "vendor") {
      refreshVendorsSelf();
    }
  }, [authSession?.role, authSession?.employeeId, refreshVendorsSelf]);

  // 2026-09-04 · Bug fix · 관리자 승인 후 공급사 재고확인 자동 활성화
  //   · 승인 대기(requested/registered) 상태에서 30초마다 vendor 상태 재조회
  //   · admin 승인 시 DB → approval_status="approved" → 30초 이내 버튼 자동 활성
  useEffect(() => {
    if (authSession?.role !== "vendor") return;
    const status = (vendorSelf as any)?.approval_status;
    if (status === "approved") return; // 이미 승인 · 폴링 불필요
    const id = setInterval(() => { refreshVendorsSelf(); }, 30_000);
    return () => clearInterval(id);
  }, [authSession?.role, vendorSelf, refreshVendorsSelf]);

  // 2026-09-04 · Bug #3 · 사이드바 vendor · "공급사 정보" 클릭 시 · VendorDetailModal open 신호 처리
  //   · SideNav.dispatchLandingAction("open-vendor-self") → localStorage + CustomEvent
  //   · 여기서 감지 · showVendorSelf true · 신호 소비 (localStorage 삭제)
  //   · mount 시 (초기 진입) 도 localStorage 확인 · 이미 저장된 신호 처리
  useEffect(() => {
    if (authSession?.role !== "vendor") return;
    const openIfSelf = () => {
      if (vendorSelf) setShowVendorSelf(true);
    };
    const consume = () => {
      try {
        const action = localStorage.getItem("landing.action");
        if (action === "open-vendor-self") {
          openIfSelf();
          localStorage.removeItem("landing.action");
        } else if (action === "open-vendor-stock") {
          // 2026-09-04 · #23 · 모달 → 전용 페이지 이관 · 즉시 라우팅
          localStorage.removeItem("landing.action");
          if (authSession) onNavigate("vendor-stock", authSession);
        }
      } catch { /* silent */ }
    };
    // 초기 진입 시 · localStorage 신호 소비
    consume();
    // custom event · 이미 랜딩에 있을 때 · 사이드바 클릭 즉시 반응
    const onAction = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "open-vendor-self") openIfSelf();
      // 2026-09-04 · #23 · 모달 → 전용 페이지 이관 · 즉시 라우팅
      else if (detail === "open-vendor-stock" && authSession) onNavigate("vendor-stock", authSession);
      try { localStorage.removeItem("landing.action"); } catch { /* silent */ }
    };
    window.addEventListener("landing:action", onAction);
    return () => window.removeEventListener("landing:action", onAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.role, vendorSelf]);

  // ── 인라인 재고검색 (비로그인용) ──────────────────────────────────────
  // 2026-08-17 · #130 · code_slim · StockSearch 컴포넌트로 분리
  //   · stockQuery/Results/Searching state · getStockBadges 헬퍼 · handleStockSearch 로직 모두 이동
  //   · 공사중 (settings.underConstruction) 은 여기서 계속 관리
  const { settings } = useSettings();
  const underConstruction = settings.underConstruction === true;

  // 로그인 모달 (LoginModals.tsx 로 분리 · 2026-08-22)
  const [vendorLoginOpen, setVendorLoginOpen] = useState(false);

  // 2026-08-25 · Framework Phase 4 · 입고알림 · StockArrivalList 로 이관

  // If already logged in, go directly; otherwise open login modal
  const handleMenuClick = (page: "schedule" | "display") => {
    if (authSession) {
      onNavigate(page, authSession);
    } else {
      setPendingPage(page);
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

  // 2026-10-06 · 공급사 승인 접근 fix · 미승인 메뉴 클릭 · 메시지 + VendorInfo 안내
  //   · SSOT · useVendorApproval (hook) · vendorApprovalState/Message 는 위에서 derive
  const handleVendorApprovalBlocked = React.useCallback(() => {
    if (!isVendor) return;
    showError(vendorApprovalMessage || "공급사 승인이 완료되지 않았습니다.");
    if (vendorSelf) setShowVendorSelf(true);
  }, [isVendor, vendorApprovalMessage, showError, vendorSelf]);

  // Load pending counts for managers · 2026-08-18 · 즉시 갱신 지원 (useApprovalRefreshListener)
  const reloadPendingCounts = React.useCallback(() => {
    if (!isManagerOrAdmin) return;
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    // 2026-10-06 · 사용자 지시 · 배치구역 불일치 기능 전체 제거 · mismatch 응답 필드 삭제
    api.get<{ leave?: number; display?: number; order?: number; lunch?: number; inventory?: number; return?: number; resignation?: number; vendor?: number }>("/api/requests/pending-counts")
      .then(({ data: d }) => {
        setLeavePendingCount(d?.leave ?? 0);
        setRequestsCounts({
          display: d?.display ?? 0,
          order: d?.order ?? 0,
          lunch: d?.lunch ?? 0,
          inventory: d?.inventory ?? 0,
          return: d?.return ?? 0,
          resignation: d?.resignation ?? 0,
          vendor: d?.vendor ?? 0,
        });
      })
      .catch(() => { });
  }, [isManagerOrAdmin]);
  useEffect(() => { reloadPendingCounts(); }, [reloadPendingCounts]);
  // 2026-08-18 · 승인 요청/승인/반려/취소 시 즉시 재로드 (leave/display/order/return/lunch)
  useApprovalRefreshListener(reloadPendingCounts);

  // 2026-08-23 · #171 잔여 · 결제요청 (admin only · 미결제·부분결제 매입건 count)
  const reloadPaymentPending = React.useCallback(() => {
    if (!isSuperAdminLevel9) { setPaymentPendingCount(0); return; }
    api.get<{ count?: number }>("/api/supplier-payments/pending-count")
      .then(({ data }) => setPaymentPendingCount(Number(data?.count ?? 0)))
      .catch(() => setPaymentPendingCount(0));
  }, [isSuperAdminLevel9]);
  useEffect(() => { reloadPaymentPending(); }, [reloadPaymentPending]);

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

  // 2026-08-25 · Framework Phase 4 · handleAnonSubscribe · StockArrivalList 로 이관
  // 2026-08-25 · dead code · handleCreateArrival 삭제 (showCreateArrival JSX 미사용)

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
    // 2026-08-26 · 사용자 지시 · 랜딩페이지 · 전역 폰트 +2 스케일 제외 · data-scope 로 격리
    <div data-scope="landing" className="min-h-screen flex flex-col bg-zinc-50">

      {/* 세션 만료 안내 배너 · 2026-09-24 · 사용자 지시 · 크게 · 명확 */}
      {sessionExpiredNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl shadow-2xl px-6 py-5 flex items-center gap-4 max-w-2xl w-[calc(100%-2rem)]">
          <span className="text-4xl shrink-0">⏱️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[20px] font-extrabold tracking-tight">세션이 만료되었습니다</p>
            <p className="text-[16px] text-amber-800 mt-1 leading-relaxed">30분간 활동이 없어 자동 로그아웃되었습니다. 다시 로그인해 주세요.</p>
          </div>
          <button
            onClick={() => setSessionExpiredNotice(false)}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-amber-500 hover:text-amber-900 hover:bg-amber-100 text-2xl font-bold leading-none transition cursor-pointer"
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

          {/* 2026-10-07 · HomeDashboard VISUAL POLISH · Home 영역 안 giant search 제거
                · Global search 는 AppShell 영역 (deferred to Global UI agent)
                · MenuCard grid 가 제거됐으므로 메뉴 검색도 더 이상 필요 X */}

          {/* ═══ 2026-10-07 · 2026 Operations Dashboard (Phase 2) ═══
                · Hero + TodayStatusPanel + TodayRevenueKpiPanel + "직원용 바로가기" MenuCard grid 통합
                · 기존 API 재사용 (중복 fetch 0) · route/permission 유지
                · Schedule V1 FROZEN */}
          {isLoggedIn && authSession && !isVendor && (
            <HomeDashboard
              authSession={authSession}
              leavePendingCount={leavePendingCount}
              requestsCounts={requestsCounts}
              paymentPendingCount={paymentPendingCount}
              isAdmin={isSuperAdminLevel9}
              isManagerOrAdmin={isManagerOrAdmin}
              onNavigate={onNavigate}
              setActiveByPage={setActiveByPage}
            />
          )}

          {/* ── 2026-10-07 · 직원용 "바로가기" MenuCard grid 제거 (HomeDashboard 로 통합)
                · 기존 route/permission 모두 HomeDashboard QuickActions + Sidebar 로 접근 가능
                · 약사 전용/점심 불참/내 요청목록 등 role-specific 는 Sidebar 로 접근 ── */}

          {/* ── 비로그인: 인라인 재고검색 + 로그인 버튼 (보조) ── */}
          {!isLoggedIn && (
            <div className="w-full mb-7 flex flex-col gap-3">
              {/* 브랜드 헤더 · 2026-08-26 · 사용자 지시 · 원본 OSAN 붉은색 + 최신 트렌드 재해석
                    · Linear/Vercel/Attio 톤 · 초고해상도 · 부드러운 antialiased 렌더
                    · OSAN = red-500 (extrabold, 큰 사이즈) · MEGATOWN = slate-800 (semibold, 살짝 작게)
                    · tracking-tight (뭉침) · leading-none · subpixel-antialiased · font-feature-settings 정렬 */}
              {/* 2026-08-26 · 사용자 지시 · OSAN 붉은색 원본 (2026-07-03 이전) 그대로 · 대원칙 · 임의 변경 금지 */}
              <div className="w-full text-center pt-2 pb-1">
                <span className="font-black tracking-tight leading-none">
                  {(() => {
                    const en = lpBrand.brandNameEn || "OSAN MEGATOWN";
                    const accent = lpBrand.brandAccentWord || "MEGATOWN";
                    const idx = accent ? en.indexOf(accent) : -1;
                    const before = idx >= 0 ? en.slice(0, idx).trim() : en;
                    const after  = idx >= 0 ? en.slice(idx + accent.length).trim() : "";
                    return (
                      <>
                        {before && <span className="text-red-500 text-2xl">{before}</span>}
                        {idx >= 0 && <span className="text-slate-800 text-lg"> {accent}</span>}
                        {after && <span className="text-red-500 text-2xl"> {after}</span>}
                      </>
                    );
                  })()}
                </span>
                <div className="text-slate-400 text-[15px] sm:text-sm mt-1 font-semibold tracking-wide">{lpBrand.shortName || "오산 메가타운 약국"}</div>
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
                      <div className="text-[15px] font-bold uppercase tracking-[0.06em]" style={{ color: "#B9D6EA" }}>Coming Soon</div>
                      <div className="text-white font-extrabold text-[24px] sm:text-[28px] tracking-tight leading-tight">곧 오픈 예정입니다</div>
                      <div className="text-[16px] font-medium" style={{ color: "#DCE8F3" }}>서비스 준비 중 · 잠시만 기다려주세요</div>
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
              <Card variant="raw-md" rounded="2xl" padding="none" bg="bg-[#FEE500]" borderColor="border-[#F0D700]/70" clip className="w-full mt-3">
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-zinc-900 text-[#FEE500] font-bold text-[14px] flex items-center justify-center">talk</span>
                  <span className="text-zinc-900 font-bold text-[15px]">카카오톡 채널</span>
                  <span className="ml-auto text-zinc-800/70 font-semibold text-[15px]">새 소식 알림받기</span>
                </div>
                <div className="bg-white px-4 py-3 flex items-center gap-3">
                  <img
                    src={lpContact.kakaoQrImageUrl || kakaoQrImg}
                    alt="카카오톡 채널 QR"
                    className="w-20 h-20 rounded-lg bg-white p-1 shrink-0 object-contain border border-line"
                  />
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className="text-zinc-900 font-bold text-[15px] leading-tight whitespace-pre-line">{lpBrand.shortName || "오산\n메가타운약국"}</div>
                    <div className="text-zinc-500 text-[15px] leading-tight">QR 스캔 또는 아래 버튼 클릭</div>
                    <a
                      href={lpContact.kakaoChannelUrl || "https://pf.kakao.com/_XWuiX/friend"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center justify-center rounded-lg px-3 py-2 bg-[#FEE500] hover:bg-[#FADA0A] active:scale-[0.99] transition-all shadow-sm border border-[#F0D700]/60 cursor-pointer"
                    >
                      <span className="text-zinc-900 font-bold text-[15px]">친구추가</span>
                    </a>
                  </div>
                </div>
              </Card>
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
                        setActiveByPage("display", "vendor-manage");
                        onNavigate("display", authSession!);
                      }
                    }} />
                )}
                {/* 2026-08-26 · #192 · 거래처 승인 gate · approval_status="approved" 만 활성
                    2026-09-24 · E-013 · 로딩 중 · label "정보 확인 중..." · disabled 로직 개선
                    2026-10-06 · SSOT · vendorApprovalState · 미승인 메뉴 hide 금지 · 클릭 시 메시지 + VendorInfo 안내 */}
                {(isVendor || isSuperAdminLevel9) && (() => {
                  // vendor · state 기반 · admin/staff · 항상 approved 로 취급 (gate 없음)
                  const state = isVendor ? vendorApprovalState : "approved";
                  const label =
                    state === "loading"    ? "🔄 정보 확인 중..."
                    : state === "approved"   ? "상품별 재고 현황 조회"
                    : state === "requested"  ? "🔒 공급사 승인 요청 처리 중"
                    : state === "rejected"   ? "🚫 승인 거절 · 공급사 정보 확인 후 재요청"
                    :                          "🔒 공급사 정보 입력 후 승인 요청 필요";
                  const disabled = isVendor && state !== "approved";
                  return (
                    <MenuCard
                      color={disabled ? "zinc" : "amber"}
                      icon={Package}
                      title="공급사 재고확인"
                      description={label}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) { handleVendorApprovalBlocked(); return; }
                        // 2026-09-04 · #23 · 모달 → 전용 페이지 (VendorStockPage) 이관
                        if (isVendor && vendorSelf) { onNavigate("vendor-stock", authSession!); return; }
                        if (isSuperAdminLevel9) {
                          setActiveByPage("display", "vendor-manage");
                          onNavigate("display", authSession!);
                        }
                      }}
                    />
                  );
                })()}
                {/* 2026-09-24 · #352 · 사용자 지시 · 거래처 로그인 · 자기 발주이력 확인 (신규)
                    · vendor 조회 전용 · 자기 회사 발주만 · 매입확인 없음 · PDF 다운
                    · 승인 상태 gate · vendor-stock 과 동일 (승인 후만 활성) */}
                {(isVendor || isSuperAdminLevel9) && (() => {
                  const state = isVendor ? vendorApprovalState : "approved";
                  const label =
                    state === "loading"    ? "🔄 정보 확인 중..."
                    : state === "approved"   ? "자기 회사에 온 발주내역 조회"
                    : state === "requested"  ? "🔒 공급사 승인 요청 처리 중"
                    : state === "rejected"   ? "🚫 승인 거절 · 공급사 정보 확인 후 재요청"
                    :                          "🔒 공급사 정보 입력 후 승인 요청 필요";
                  const disabled = isVendor && state !== "approved";
                  return (
                    <MenuCard
                      color={disabled ? "zinc" : "coral"}
                      icon={Truck}
                      title="발주이력 확인"
                      description={label}
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) { handleVendorApprovalBlocked(); return; }
                        if (isVendor && vendorSelf) { onNavigate("vendor-order-history", authSession!); return; }
                        if (isSuperAdminLevel9) {
                          // admin/manager 는 매장 > 발주 페이지로 (관리자용 이력)
                          setActiveByPage("display", "purchase-order");
                          onNavigate("display", authSession!);
                        }
                      }}
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── 입고 알림 · 2026-08-25 · Framework Phase 4 · StockArrivalList 로 이관 ── */}
          <StockArrivalList isVendor={isVendor} />

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

      {/* 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 (VendorStockPage · App.tsx 라우팅) 이관 */}

      {/* ── Unauthorized toast ── */}
      {unauthorizedToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 bg-rose-600 text-white text-base font-bold rounded-2xl shadow-xl pointer-events-none animate-in fade-in duration-150">
          권한이 없습니다
        </div>
      )}

      {/* ── 로그인 모달 (LoginModals.tsx · 2026-08-22 분리) ── */}
      <LoginModals
        vendorLoginOpen={vendorLoginOpen}
        onVendorLoginClose={() => setVendorLoginOpen(false)}
        pendingPage={pendingPage}
        onPendingPageClose={() => setPendingPage(null)}
        onAuthOnly={onAuthOnly}
        lpBrand={lpBrand}
      />
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};
