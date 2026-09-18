// 2026-08-17 · apiClient 마이그레이션
// 2026-09-18 · 연차신청 UI 재설계 + PDF 생성 기능 (사용자 지시)
//   · apply 뷰 · 대시보드 KPI + 좌우 split 폼/미리보기 + 이력 카드 PDF 버튼
//   · approval 뷰 · 변경 없음
import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "../../lib/apiClient";
// 2026-09-14 · leaveApi 프리미티브
import { listLeaveRequests, createLeaveRequest, reviewLeaveRequest, deleteLeaveRequest } from "../../lib/leaveApi";
import { getErrorMessage } from "../../lib/errorMessage";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import {
  CalendarDays, Clock, CheckCircle2, XCircle,
  RefreshCw, X, Trash2, ChevronDown,
  MessageSquareText, StickyNote, FileText, Download,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { fmtDateYMD, fmtDateMD } from "../../lib/format";
import { getKstYmd } from "../../lib/kstDate";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { KpiCard } from "../common/KpiCard";
import { TabBar } from "../common/TabBar";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { LeaveRequestPdfPreview, type LeaveRequestPdfData } from "./LeaveRequestPdfPreview";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

interface LeaveRequest {
  id: string;
  employee_id: number;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** 2026-08-12 · 연차 페이지 모드 분리
 *  · "apply"    · 직원 신청 UI 만 (승인요청 그룹용)
 *  · "approval" · 관리자 승인 UI 만 (요청목록 탭용) · 실제 관리자(level≥2) 만 노출
 *  · "both"     · 기존 통합 (하위호환) · isManager 로 자동 분기
 */
export type LeaveMode = "apply" | "approval" | "both";

interface LeavePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true 시 자체 AppNavHeader skip (BusinessManagePage 임베드용 · 2026-08-03) */
  embedded?: boolean;
  mode?: LeaveMode;
}

type ManagerTab = "pending" | "all";

const LEAVE_TYPES = ["연차", "반차", "오전반차", "오후반차", "월차", "병가", "특별휴가"];

const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  approved: "승인",
  rejected: "반려",
};

const fmtDate = fmtDateYMD;
const fmtDateTime = fmtDateMD;

/** YYYY-MM-DD 두 날짜 간 일수 (양 끝 포함) */
function calcDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export const LeavePage: React.FC<LeavePageProps> = ({ onBack, authSession, onNavigate, onLogout, embedded = false, mode = "both" }) => {
  const isManager = (authSession?.level ?? 0) >= 2;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "";
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  // 모드별 뷰 활성화
  const showApply = mode === "apply" || (mode === "both" && !isManager);
  const showApproval = (mode === "approval" || (mode === "both" && isManager)) && isManager;

  // ── Employee state ──────────────────────────────────────────────────────────
  const [balance, setBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);
  // form은 항상 노출 (기존 showForm 토글 제거 · 재설계 → 항상 표시)
  const [formType, setFormType] = useState(LEAVE_TYPES[0]);
  const [formStart, setFormStart] = useState(getKstYmd());
  const [formEnd, setFormEnd] = useState(getKstYmd());
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ── PDF state ──────────────────────────────────────────────────────────────
  /** 폼 PDF 캡처 전용 offscreen ref */
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);
  /** 폼 PDF 임시 데이터 (offscreen 렌더용) */
  const [formPdfData, setFormPdfData] = useState<LeaveRequestPdfData | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  /** 이력 카드별 PDF 생성 중인 ID */
  const [historyPdfId, setHistoryPdfId] = useState<string | null>(null);
  /** PDF 미리보기용 offscreen ref (이력 카드용) */
  const historyPdfRef = useRef<HTMLDivElement | null>(null);
  /** 이력 카드 PDF 팝업에서 사용할 임시 데이터 */
  const [historyPdfData, setHistoryPdfData] = useState<LeaveRequestPdfData | null>(null);

  // 직원 상세 정보 (PDF용)
  const [employeeDetail, setEmployeeDetail] = useState<{
    employee_number?: string | null;
    position?: string | null;
    hire_date?: string | null;
    phone?: string | null;
  } | null>(null);

  // ── Manager state ───────────────────────────────────────────────────────────
  const [mgrTab, setMgrTab] = useState<ManagerTab>("pending");
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadMyRequests = useCallback(async () => {
    if (!employeeId) return;
    setMyLoading(true);
    try {
      const list = await listLeaveRequests({ employeeId });
      setMyRequests(list as any);
    } catch { setMyRequests([]); }
    finally { setMyLoading(false); }
  }, [employeeId]);

  const loadBalance = useCallback(async () => {
    if (!employeeId) return;
    try {
      const { data } = await api.get<any>(`/api/leave-balance?employeeId=${employeeId}`);
      setBalance(data);
    } catch { /* silent */ }
  }, [employeeId]);

  const loadAllRequests = useCallback(async () => {
    setAllLoading(true);
    try {
      const list = await listLeaveRequests({ all: true });
      setAllRequests(list as any);
    } catch { setAllRequests([]); }
    finally { setAllLoading(false); }
  }, []);

  // 직원 상세 (PDF용 · 최초 1회)
  const loadEmployeeDetail = useCallback(async () => {
    if (!employeeId) return;
    try {
      const { data } = await api.get<any>(`/api/employees/${employeeId}`);
      setEmployeeDetail({
        employee_number: data?.employee_number ?? null,
        position: data?.position ?? null,
        hire_date: data?.hireDate ?? data?.hire_date ?? null,
        phone: data?.phone ?? null,
      });
    } catch { /* silent */ }
  }, [employeeId]);

  useEffect(() => {
    if (showApproval) loadAllRequests();
    if (showApply) {
      loadMyRequests();
      loadBalance();
      loadEmployeeDetail();
    }
  }, [showApproval, showApply, loadAllRequests, loadMyRequests, loadBalance, loadEmployeeDetail]);

  // ── Submit (employee) ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !employeeName) return;
    if (formEnd < formStart) { setSubmitError("종료일이 시작일보다 빠릅니다."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createLeaveRequest({
        employee_id: employeeId,
        employee_name: employeeName,
        leave_type: formType,
        start_date: formStart,
        end_date: formEnd,
        reason: formReason,
      });
      setFormType(LEAVE_TYPES[0]);
      setFormStart(getKstYmd());
      setFormEnd(getKstYmd());
      setFormReason("");
      await loadMyRequests();
      await loadBalance();
      dispatchApprovalChange("leave");
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : getErrorMessage(err, "오류 발생"));
    } finally { setSubmitting(false); }
  };

  // ── Cancel (employee) ───────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    const target = myRequests.find(r => r.id === id);
    const ok = await confirm({
      message: target
        ? `${target.leave_type} · ${target.start_date}~${target.end_date} 신청을 취소할까요?`
        : "연차 신청을 취소할까요?",
      danger: true,
    });
    if (!ok) return;
    setCancellingId(id);
    try {
      await deleteLeaveRequest(id);
      setMyRequests(prev => prev.filter(r => r.id !== id));
      dispatchApprovalChange("leave");
    } catch { /* silent */ }
    finally { setCancellingId(null); }
  };

  // ── PDF 생성 공통 유틸 ──────────────────────────────────────────────────────
  const buildPdfFromRef = async (refEl: HTMLDivElement): Promise<jsPDF> => {
    const canvas = await html2canvas(refEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: refEl.scrollWidth,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;
    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
        remaining -= pdfH;
        yOffset += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }
    return pdf;
  };

  /** 현재 폼 기준 PDF 데이터 */
  const getCurrentPdfData = useCallback((): LeaveRequestPdfData => ({
    employeeName,
    employeeNumber: employeeDetail?.employee_number,
    position: employeeDetail?.position,
    hireDate: employeeDetail?.hire_date,
    phone: employeeDetail?.phone,
    leaveType: formType,
    startDate: formStart,
    endDate: formEnd,
    days: calcDays(formStart, formEnd),
    reason: formReason,
    applyDate: getKstYmd(),
  }), [employeeName, employeeDetail, formType, formStart, formEnd, formReason]);

  /** 이력 카드 기준 PDF 데이터 */
  const getHistoryPdfData = useCallback((r: LeaveRequest): LeaveRequestPdfData => ({
    employeeName: r.employee_name,
    employeeNumber: employeeDetail?.employee_number,
    position: employeeDetail?.position,
    hireDate: employeeDetail?.hire_date,
    phone: employeeDetail?.phone,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: calcDays(r.start_date, r.end_date),
    reason: r.reason,
    applyDate: r.created_at.slice(0, 10),
  }), [employeeDetail]);

  /** 폼 기준 PDF 미리보기 또는 다운로드 */
  const handleFormPdf = async (download: boolean) => {
    setPdfGenerating(true);
    // offscreen 렌더용 데이터 세팅 후 DOM 렌더 대기
    const data = getCurrentPdfData();
    setFormPdfData(data);
    await new Promise(r => setTimeout(r, 120));
    try {
      if (!pdfCaptureRef.current) {
        showError("PDF 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      const pdf = await buildPdfFromRef(pdfCaptureRef.current);
      const safeName = (employeeName || "직원").replace(/[\\/:*?"<>|]/g, "_");
      const safeDate = formStart.replace(/-/g, "");
      const filename = `연차신청서_${safeName}_${safeDate}.pdf`;
      if (download) {
        pdf.save(filename);
      } else {
        // 미리보기 · 새 탭에 열기
        const blob = pdf.output("blob");
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) {
      showError("PDF 생성에 실패했습니다.");
      console.error("[LeavePage] PDF error:", err);
    } finally {
      setPdfGenerating(false);
      setFormPdfData(null);
    }
  };

  /** 이력 카드 PDF 다운로드 */
  const handleHistoryPdf = async (r: LeaveRequest) => {
    setHistoryPdfId(r.id);
    const data = getHistoryPdfData(r);
    setHistoryPdfData(data);
    // DOM 렌더 대기
    await new Promise(res => setTimeout(res, 120));
    try {
      if (!historyPdfRef.current) return;
      const pdf = await buildPdfFromRef(historyPdfRef.current);
      const safeName = (r.employee_name || "직원").replace(/[\\/:*?"<>|]/g, "_");
      const safeDate = r.start_date.replace(/-/g, "");
      const filename = `연차신청서_${safeName}_${safeDate}.pdf`;
      pdf.save(filename);
    } catch (err) {
      showError("PDF 생성에 실패했습니다.");
      console.error("[LeavePage] History PDF error:", err);
    } finally {
      setHistoryPdfId(null);
      setHistoryPdfData(null);
    }
  };

  // ── Approve / Reject (manager) ──────────────────────────────────────────────
  const handleDeleteLeaveRequest = async (r: LeaveRequest) => {
    const statusLabel = r.status === "pending" ? "대기 중" : r.status === "approved" ? "승인된" : "반려된";
    const ok = await confirm({
      message: `${r.employee_name} · ${r.leave_type} · ${r.start_date}~${r.end_date} · ${statusLabel} 연차이력을 삭제할까요?${r.status === "approved" ? "\n\n승인된 연차의 스케쥴도 함께 제거됩니다." : ""}`,
      danger: true,
    });
    if (!ok) return;
    setDeletingId(r.id);
    try {
      await deleteLeaveRequest(r.id);
      setAllRequests(prev => prev.filter(x => x.id !== r.id));
      dispatchApprovalChange("leave");
      showSuccess("연차이력 삭제 완료");
    } catch (e) {
      showError(`삭제 실패: ${getErrorMessage(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      await reviewLeaveRequest(id, { status, reviewer_note: reviewNote });
      setAllRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status, reviewer_note: reviewNote, reviewed_at: new Date().toISOString() } : r,
      ));
      setReviewingId(null);
      setReviewNote("");
      dispatchApprovalChange("leave");
    } catch { /* silent */ }
    finally { setProcessingId(null); }
  };

  const pending = allRequests.filter(r => r.status === "pending");
  const reviewed = allRequests.filter(r => r.status !== "pending");

  // ── 연차 통계 ────────────────────────────────────────────────────────────────
  const pendingCount = myRequests.filter(r => r.status === "pending").length;
  const rejectedCount = myRequests.filter(r => r.status === "rejected").length;
  const usageRate = balance && balance.total > 0
    ? Math.round((balance.used / balance.total) * 100)
    : 0;

  // 현재 폼 PDF 데이터 (실시간 반영)
  const currentPdfData = getCurrentPdfData();

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage="leave"
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
          rightSlot={
            showApproval && pending.length > 0 ? (
              <StatusPill tone="amber" size="md" icon={<Clock size={11} />}>대기 {pending.length}건</StatusPill>
            ) : undefined
          }
        />
      )}

      <main className={`flex-1 ${PAGE_CONTAINER_CLS} px-4 py-5`}>

        {/* ── 직원 뷰 (신청) · 재설계 ── */}
        {showApply && (
          <div className="flex flex-col gap-5">

            {/* 1. 상단 · 잔여연차 대시보드 카드 */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <AccentBar />
                <span className="text-[19px] font-bold text-ink tracking-tight">연차 현황</span>
              </div>

              {/* KPI 3개 */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <KpiCard
                  icon={<CalendarDays size={16} />}
                  label="총 연차"
                  value={balance?.total ?? "-"}
                  unit="일"
                  tone="brand"
                  isActive={true}
                />
                <KpiCard
                  icon={<CheckCircle2 size={16} />}
                  label="사용"
                  value={balance?.used ?? "-"}
                  unit="일"
                  tone="emerald"
                  isActive={(balance?.used ?? 0) > 0}
                />
                <KpiCard
                  icon={<CalendarDays size={16} />}
                  label="잔여"
                  value={balance?.remaining ?? "-"}
                  unit="일"
                  tone="sky"
                  isActive={(balance?.remaining ?? 0) > 0}
                />
              </div>

              {/* 프로그레스 바 */}
              {balance && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[15px] font-semibold text-zinc-500">사용률</span>
                    <span className="text-[15px] font-bold text-zinc-700 tabular-nums">{usageRate}%</span>
                  </div>
                  <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-deep transition-all duration-500"
                      style={{ width: `${Math.min(usageRate, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 승인 대기 / 반려 count */}
              {(pendingCount > 0 || rejectedCount > 0) && (
                <div className="flex items-center gap-3 mt-2">
                  {pendingCount > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                      <Clock size={13} className="text-amber-600" />
                      <span className="text-[15px] font-semibold text-amber-700 tabular-nums">승인 대기 {pendingCount}건</span>
                    </div>
                  )}
                  {rejectedCount > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200">
                      <XCircle size={13} className="text-rose-600" />
                      <span className="text-[15px] font-semibold text-rose-700 tabular-nums">반려 {rejectedCount}건</span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* 2+3. 좌우 레이아웃 · 신청 폼 + A4 미리보기 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* 좌: 신청 폼 */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <AccentBar />
                  <span className="text-[19px] font-bold text-ink tracking-tight">휴가 신청</span>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                  {/* 휴가 종류 · chip 선택 */}
                  <div>
                    <label className="text-[15px] font-bold text-zinc-500 block mb-2.5">휴가 종류</label>
                    <div className="flex flex-wrap gap-2">
                      {LEAVE_TYPES.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setFormType(t)}
                          className={[
                            "px-3.5 py-2 rounded-lg text-[15px] font-semibold border transition-all duration-150 cursor-pointer",
                            formType === t
                              ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                              : "bg-white text-zinc-600 border-zinc-200 hover:border-brand-deep hover:text-brand-deep",
                          ].join(" ")}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 날짜 range */}
                  <div>
                    <label className="text-[15px] font-bold text-zinc-500 block mb-2.5">기간</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <div className="text-[13px] font-semibold text-zinc-400 mb-1">시작일</div>
                        <input
                          type="date"
                          value={formStart}
                          onChange={e => {
                            const s = e.target.value;
                            setFormStart(s);
                            if (formEnd < s) setFormEnd(s);
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                          required
                        />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-zinc-400 mb-1">종료일</div>
                        <input
                          type="date"
                          value={formEnd}
                          min={formStart}
                          onChange={e => setFormEnd(e.target.value)}
                          className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                          required
                        />
                      </div>
                    </div>
                    {formStart && formEnd && (
                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <span className="text-[15px] text-zinc-400 font-medium">총</span>
                        <span className="text-[17px] font-extrabold text-brand-deep tabular-nums">
                          {calcDays(formStart, formEnd)}
                        </span>
                        <span className="text-[15px] text-zinc-400 font-medium">일</span>
                      </div>
                    )}
                  </div>

                  {/* 사유 */}
                  <div>
                    <label className="text-[15px] font-bold text-zinc-500 block mb-2">
                      사유 <span className="text-zinc-300 font-normal">(선택)</span>
                    </label>
                    <textarea
                      lang="ko"
                      value={formReason}
                      onChange={e => setFormReason(e.target.value)}
                      placeholder="사유를 입력하세요"
                      rows={3}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3.5 py-2.5 text-[15px] text-zinc-800 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-none"
                    />
                  </div>

                  {submitError && (
                    <div className="text-[15px] text-rose-500 font-semibold px-1">{submitError}</div>
                  )}

                  {/* 하단 버튼 3개 */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleFormPdf(false)}
                      disabled={pdfGenerating}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[15px] font-semibold hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-150 cursor-pointer disabled:opacity-40"
                    >
                      <FileText size={15} />
                      미리보기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFormPdf(true)}
                      disabled={pdfGenerating}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[15px] font-semibold hover:border-zinc-400 hover:bg-zinc-50 transition-all duration-150 cursor-pointer disabled:opacity-40"
                    >
                      {pdfGenerating ? (
                        <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-zinc-500" /><span>생성 중...</span></>
                      ) : (
                        <><Download size={15} /><span>PDF 저장</span></>
                      )}
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 text-white text-[15px] font-bold shadow-sm transition-colors cursor-pointer"
                    >
                      {submitting ? (
                        <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>신청 중...</span></>
                      ) : "신청 제출"}
                    </button>
                  </div>
                </form>
              </Card>

              {/* 우: A4 PDF 미리보기 (실시간 · 축소 표시) */}
              <Card className="flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <AccentBar />
                  <span className="text-[19px] font-bold text-ink tracking-tight">신청서 미리보기</span>
                  <span className="ml-1 text-[13px] text-zinc-400 font-medium">(실시간 반영)</span>
                </div>

                {/* 축소 A4 프리뷰 · scale down · 시각적 미리보기 전용 (캡처용 ref 없음) */}
                <div className="flex-1 flex items-start justify-center overflow-hidden">
                  <div
                    style={{
                      transform: "scale(0.38)",
                      transformOrigin: "top center",
                      width: 794,
                      marginLeft: "calc(50% - 794px * 0.38 / 2)",
                      pointerEvents: "none",
                      position: "relative",
                    }}
                  >
                    <LeaveRequestPdfPreview
                      data={currentPdfData}
                      variant="visible"
                    />
                  </div>
                </div>

                <p className="mt-3 text-[13px] text-zinc-400 text-center font-medium">
                  클릭 전 미리보기 버튼으로 전체 화면 확인
                </p>
              </Card>
            </div>

            {/* 4. 하단 · 내 신청 이력 */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <AccentBar />
                  <span className="text-[19px] font-bold text-ink tracking-tight">내 신청 내역</span>
                  <span className="text-[15px] font-medium text-ink-soft tabular-nums">· {myRequests.length}건</span>
                </div>
                <button
                  onClick={loadMyRequests}
                  disabled={myLoading}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 cursor-pointer"
                >
                  <RefreshCw size={11} className={myLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {myLoading && myRequests.length > 0 && (
                <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-1 sticky top-0 z-10">
                  <Spinner size={11} tone="amber" label="새로 불러오는 중..." labelSize={15} />
                </Card>
              )}
              {myLoading && myRequests.length === 0 ? (
                <div className="flex items-center justify-center py-8"><Spinner tone="zinc" label="로딩 중..." labelSize={15} /></div>
              ) : !myLoading && myRequests.length === 0 ? (
                <EmptyState title="신청한 연차 없음" hint="위 폼에서 신청하세요" size="compact" />
              ) : (
                <div className={`flex flex-col gap-2 ${myLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                  {myRequests.map(r => {
                    const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
                    return (
                      <div
                        key={r.id}
                        className="group relative rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150 p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[17px] font-bold text-zinc-900 tabular-nums">
                                {fmtDate(r.start_date)}
                                {r.start_date !== r.end_date && <span className="text-zinc-400"> ~ </span>}
                                {r.start_date !== r.end_date && fmtDate(r.end_date)}
                              </span>
                              <span className="text-[13px] font-semibold text-brand-deep bg-brand-tint px-2 py-0.5 rounded-full">
                                {r.leave_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[13px] text-zinc-400 tabular-nums">
                              <span>{fmtDateTime(r.created_at)} 신청</span>
                              {r.reviewed_at && <span>{fmtDateTime(r.reviewed_at)} 검토</span>}
                            </div>
                            {r.reason && (
                              <div className="mt-2 flex items-start gap-1.5 text-[13px] text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-1.5">
                                <MessageSquareText size={13} className="text-zinc-400 mt-0.5 shrink-0" />
                                <span className="break-words">{r.reason}</span>
                              </div>
                            )}
                            {r.reviewer_note && (
                              <div className="mt-1.5 flex items-start gap-1.5 text-[13px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                                <StickyNote size={13} className="text-indigo-400 mt-0.5 shrink-0" />
                                <span className="break-words"><span className="font-bold">관리자 메모:</span> {r.reviewer_note}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <StatusPill tone={tone} size="md" dot pulse={r.status === "pending"} className="shrink-0">
                              {STATUS_LABEL[r.status]}
                            </StatusPill>
                            {/* PDF 다운로드 버튼 · 모든 이력 */}
                            <button
                              type="button"
                              onClick={() => handleHistoryPdf(r)}
                              disabled={historyPdfId === r.id}
                              title="신청서 PDF 다운로드"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-brand-deep hover:bg-brand-tint transition-all duration-150 cursor-pointer disabled:opacity-40"
                            >
                              {historyPdfId === r.id ? (
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-deep" />
                              ) : (
                                <Download size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                        {r.status === "pending" && (
                          <button
                            onClick={() => handleCancel(r.id)}
                            disabled={cancellingId === r.id}
                            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold text-zinc-500 border border-zinc-200 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-all duration-150 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 size={13} />
                            {cancellingId === r.id ? "취소 중..." : "신청 취소"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── 관리자 뷰 (승인) · 변경 없음 ── */}
        {showApproval && (
          <div className="flex flex-col gap-4">
            <TabBar
              level={2}
              activeKey={mgrTab}
              onSelect={(k) => setMgrTab(k as ManagerTab)}
              badgeColor="amber"
              tabs={[
                { key: "pending", label: "승인 대기", icon: Clock, badge: pending.length },
                { key: "all", label: "전체 목록", icon: CalendarDays },
              ]}
            />

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-[17px] font-bold text-zinc-900">
                    {mgrTab === "pending" ? "승인 대기" : "전체 목록"}
                  </span>
                  <span className="text-[13px] tabular-nums text-zinc-400 font-medium">
                    {(mgrTab === "pending" ? pending : reviewed).length}건
                  </span>
                </div>
                <button
                  onClick={loadAllRequests}
                  disabled={allLoading}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all duration-150 cursor-pointer"
                >
                  <RefreshCw size={14} className={allLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {allLoading && (mgrTab === "pending" ? pending : reviewed).length > 0 && (
                <Card variant="flat" bg="bg-indigo-50" borderColor="border-indigo-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-2 sticky top-0 z-10">
                  <Spinner size={11} tone="brand" label="새로 불러오는 중..." labelSize={13} />
                </Card>
              )}
              {allLoading && (mgrTab === "pending" ? pending : reviewed).length === 0 ? (
                <div className="flex items-center justify-center py-12"><Spinner tone="zinc" label="로딩 중..." labelSize={13} /></div>
              ) : (mgrTab === "pending" ? pending : reviewed).length === 0 ? (
                <EmptyState title={mgrTab === "pending" ? "대기 중인 신청 없음" : "검토 완료 없음"} size="compact" />
              ) : (
                <div className={`flex flex-col gap-2 ${allLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                  {(mgrTab === "pending" ? pending : reviewed).map(r => {
                    const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
                    return (
                      <div
                        key={r.id}
                        className="group relative rounded-xl border border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-150 p-3.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {/* 2026-09-18 · 동그란 이니셜 원 제거 · accent bar left border로 대체 */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[17px] font-bold text-zinc-900 leading-tight">{r.employee_name}</span>
                                <span className="text-[13px] font-semibold text-brand-deep bg-brand-tint px-2 py-0.5 rounded-full">
                                  {r.leave_type}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 text-[15px] text-zinc-600">
                                <CalendarDays size={14} className="text-zinc-400" />
                                <span className="tabular-nums font-medium">{fmtDate(r.start_date)}</span>
                                {r.start_date !== r.end_date && (
                                  <>
                                    <span className="text-zinc-400">~</span>
                                    <span className="tabular-nums font-medium">{fmtDate(r.end_date)}</span>
                                  </>
                                )}
                              </div>
                              {r.reason && (
                                <div className="mt-2 flex items-start gap-1.5 text-[13px] text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-lg px-2.5 py-1.5">
                                  <MessageSquareText size={13} className="text-zinc-400 mt-0.5 shrink-0" />
                                  <span className="break-words">{r.reason}</span>
                                </div>
                              )}
                              {r.reviewer_note && (
                                <div className="mt-1.5 flex items-start gap-1.5 text-[13px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                                  <StickyNote size={13} className="text-indigo-400 mt-0.5 shrink-0" />
                                  <span className="break-words"><span className="font-bold">내 메모:</span> {r.reviewer_note}</span>
                                </div>
                              )}
                              <div className="mt-2 text-[13px] text-zinc-400 tabular-nums">
                                {fmtDateTime(r.created_at)} 신청
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <StatusPill tone={tone} size="md" dot pulse={r.status === "pending"}>
                              {STATUS_LABEL[r.status]}
                            </StatusPill>
                            <button
                              onClick={() => handleDeleteLeaveRequest(r)}
                              disabled={deletingId === r.id}
                              title="이력 삭제"
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all duration-150 cursor-pointer disabled:opacity-40"
                            >
                              <Trash2 size={14} className={deletingId === r.id ? "animate-pulse" : ""} />
                            </button>
                          </div>
                        </div>

                        {r.status === "pending" && (
                          reviewingId === r.id ? (
                            <div className="mt-3 flex flex-col gap-2">
                              <input
                                lang="ko" type="text"
                                value={reviewNote}
                                onChange={e => setReviewNote(e.target.value)}
                                placeholder="메모 (선택)"
                                className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[15px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleReview(r.id, "approved")}
                                  disabled={processingId === r.id}
                                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[15px] font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all duration-150 cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 size={14} />
                                  {processingId === r.id ? "처리 중..." : "승인"}
                                </button>
                                <button
                                  onClick={() => handleReview(r.id, "rejected")}
                                  disabled={processingId === r.id}
                                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[15px] font-semibold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white transition-all duration-150 cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle size={14} />
                                  {processingId === r.id ? "처리 중..." : "반려"}
                                </button>
                              </div>
                              <button
                                onClick={() => { setReviewingId(null); setReviewNote(""); }}
                                className="text-[13px] text-zinc-400 hover:text-zinc-600 text-center cursor-pointer py-1"
                              >
                                취소
                              </button>
                            </div>
                          ) : (
                            <div className="mt-3">
                              <button
                                onClick={() => { setReviewingId(r.id); setReviewNote(""); }}
                                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[15px] font-semibold bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white transition-all duration-150 cursor-pointer"
                              >
                                검토하기
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </main>

      {/* ── Offscreen PDF 캡처용 컴포넌트 (폼 PDF 용) ── */}
      {formPdfData && (
        <div style={{ position: "fixed", top: 0, left: -99999, zIndex: -1, pointerEvents: "none" }}>
          <LeaveRequestPdfPreview
            ref={pdfCaptureRef}
            data={formPdfData}
            variant="offscreen"
          />
        </div>
      )}

      {/* ── Offscreen PDF 캡처용 컴포넌트 (이력 카드 PDF 용) ── */}
      {historyPdfData && (
        <div style={{ position: "fixed", top: 0, left: -99999, zIndex: -1, pointerEvents: "none" }}>
          <LeaveRequestPdfPreview
            ref={historyPdfRef}
            data={historyPdfData}
            variant="offscreen"
          />
        </div>
      )}
    </div>
  );
};

export default LeavePage;
