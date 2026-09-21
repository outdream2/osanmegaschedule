// 2026-08-17 · apiClient 마이그레이션
// 2026-09-18 · 재재설계 (사용자 지시)
//   · 신청 UI → 표(테이블) 형식 · 좌우 split/KPI/프로그레스 바/미리보기 제거
//   · submit 전 confirm 다이얼로그
//   · 이력 표 형식 · PDF 컬럼 → 클릭 시 모달
//   · PDF 결재란/도장/그라디언트 완전 제거
// 2026-09-18 · 관리자 전체 신청 표시 + 컬럼 축소 + 목업 스타일 + 글씨 +2 (사용자 지시)
// 2026-09-20 · approval 뷰 재구성 (사용자 지시)
//   · TabBar(승인대기/전체목록) 제거 · mgrTab 제거
//   · 상단 = pending 카드 (개선된 UI) · 하단 = 전체 이력 표 (RequestHistoryTable 공유)
import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { listLeaveRequests, createLeaveRequest, reviewLeaveRequest, deleteLeaveRequest } from "../../lib/leaveApi";
import { getErrorMessage } from "../../lib/errorMessage";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { EmptyState } from "../common/EmptyState";
import {
  CalendarDays, Clock, CheckCircle2, XCircle,
  RefreshCw, Trash2, FileText, Download,
  MessageSquareText, StickyNote, ChevronDown,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { fmtDateYMD, fmtDateMD } from "../../lib/format";
import { getKstYmd } from "../../lib/kstDate";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
import { useConfirm } from "../../hooks/useConfirm";
import { useToast } from "../../hooks/useToast";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
import { LeaveRequestPdfPreview, type LeaveRequestPdfData } from "./LeaveRequestPdfPreview";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
// 2026-09-21 · #329 · 한글 IME 우선
import { KO_INPUT_PROPS } from "../../lib/koreanInput";

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
 *  · "apply"    · 직원 신청 UI 만
 *  · "approval" · 관리자 승인 UI 만
 *  · "both"     · 기존 통합
 */
export type LeaveMode = "apply" | "approval" | "both";

interface LeavePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  embedded?: boolean;
  mode?: LeaveMode;
}

const LEAVE_TYPES = ["연차", "반차", "오전반차", "오후반차", "월차", "병가", "특별휴가"];

const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  approved: "승인",
  rejected: "반려",
};

const fmtDate = fmtDateYMD;
const fmtDateTime = fmtDateMD;

function calcDays(start: string, end: string): number {
  if (!start || !end) return 1;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

// ── RequestHistoryTable · apply + approval 양쪽 재사용 ─────────────────────
interface RequestHistoryTableProps {
  rows: LeaveRequest[];
  isManager: boolean;
  loading: boolean;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  cancellingId: string | null;
  deletingId: string | null;
  onCancel: (id: string) => void;
  onDelete: (r: LeaveRequest) => void;
  onOpenPdf: (r: LeaveRequest) => void;
}

const RequestHistoryTable: React.FC<RequestHistoryTableProps> = ({
  rows, isManager, loading, selectedIds,
  onToggleRow, onToggleAll,
  cancellingId, deletingId,
  onCancel, onDelete, onOpenPdf,
}) => {
  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner tone="zinc" label="로딩 중..." labelSize={16} />
      </div>
    );
  }
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title="신청 이력 없음"
        hint={isManager ? "전체 직원 연차 신청이 없습니다" : "위 폼에서 신청하세요"}
        size="compact"
      />
    );
  }
  return (
    <div className={loading ? "opacity-40 pointer-events-none" : ""}>
      {/* 모바일 (md 미만): 카드형 */}
      <div className="md:hidden flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 overflow-hidden">
        {rows.map((r) => {
          const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
          const days = calcDays(r.start_date, r.end_date);
          const isSelected = selectedIds.has(r.id);
          return (
            <div
              key={r.id}
              className={`px-3 py-3 min-h-[44px] transition-colors ${isSelected ? "bg-blue-50/40" : "hover:bg-zinc-50/60"}`}
            >
              {/* 상단: 체크(관리자) + 이름(관리자) + 유형 + 상태 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  {isManager && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleRow(r.id)}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {isManager && (
                      <span className="text-[16px] font-bold text-zinc-800 break-keep">{r.employee_name}</span>
                    )}
                    <span className={`${isManager ? "ml-1.5" : ""} inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[14px] font-semibold border border-indigo-100`}>
                      {r.leave_type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill tone={tone} size="sm" dot pulse={r.status === "pending"}>
                    {STATUS_LABEL[r.status]}
                  </StatusPill>
                </div>
              </div>

              {/* 기간 */}
              <div className="flex items-center gap-1.5 mt-1.5 text-[15px] text-zinc-600 ml-0">
                <CalendarDays size={13} className="text-zinc-400 shrink-0" />
                <span className="tabular-nums">{fmtDateYMD(r.start_date)}</span>
                {r.start_date !== r.end_date && (
                  <>
                    <span className="text-zinc-400">~</span>
                    <span className="tabular-nums">{fmtDateYMD(r.end_date)}</span>
                  </>
                )}
                <span className="text-zinc-400 tabular-nums">({days}일)</span>
              </div>

              {/* 비고 + 액션 */}
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <div className="flex items-center gap-1 min-w-0">
                  {r.reviewer_note && (
                    <span className="flex items-center gap-0.5 text-[13px] text-indigo-500">
                      <StickyNote size={11} className="shrink-0" />
                      <span className="break-words">{r.reviewer_note}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenPdf(r)}
                    title="PDF 보기"
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[13px] text-zinc-400 hover:text-brand-deep hover:bg-zinc-50 border border-zinc-200 transition cursor-pointer"
                  >
                    <FileText size={12} />PDF
                  </button>
                  {!isManager && r.status === "pending" && (
                    <button
                      onClick={() => onCancel(r.id)}
                      disabled={cancellingId === r.id}
                      title="취소"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition cursor-pointer disabled:opacity-40"
                    >
                      {cancellingId === r.id
                        ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-rose-400" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PC (md+): 테이블 */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {isManager && (
                <th className="text-center px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length; }}
                    onChange={onToggleAll}
                    className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    aria-label="전체 선택"
                  />
                </th>
              )}
              {isManager && (
                <th className="text-left px-4 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">신청자</th>
              )}
              <th className="text-left px-4 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">유형</th>
              <th className="text-left px-4 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">기간</th>
              <th className="text-center px-3 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">상태</th>
              <th className="text-center px-3 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">PDF</th>
              {!isManager && (
                <th className="text-center px-3 py-3 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider whitespace-nowrap">취소</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
              return (
                <tr
                  key={r.id}
                  className={`group transition-colors duration-100 hover:bg-zinc-50/60 ${idx !== 0 ? "border-t border-zinc-100" : ""} ${selectedIds.has(r.id) ? "bg-blue-50/40" : ""}`}
                >
                  {isManager && (
                    <td className="text-center px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => onToggleRow(r.id)}
                        className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        aria-label={`${r.employee_name} ${r.leave_type} 선택`}
                      />
                    </td>
                  )}
                  {isManager && (
                    <td className="px-4 py-3 font-semibold text-[20px] text-zinc-800 whitespace-nowrap">{r.employee_name}</td>
                  )}
                  <td className="px-4 py-3 font-semibold text-[20px] text-zinc-800 whitespace-nowrap">{r.leave_type}</td>
                  <td className="px-4 py-3 text-[20px] text-zinc-600 whitespace-nowrap tabular-nums">
                    {fmtDateYMD(r.start_date)}
                    {r.start_date !== r.end_date && (
                      <span className="text-zinc-400"> ~ {fmtDateYMD(r.end_date)}</span>
                    )}
                    <span className="text-zinc-400 text-[20px] ml-1.5 tabular-nums">
                      ({calcDays(r.start_date, r.end_date)}일)
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <StatusPill tone={tone} size="sm" dot pulse={r.status === "pending"}>
                      {STATUS_LABEL[r.status]}
                    </StatusPill>
                    {r.reviewer_note && (
                      <div className="mt-1 flex items-center justify-center gap-0.5 text-[20px] text-indigo-500">
                        <StickyNote size={12} className="shrink-0" />
                        <span className="break-words">{r.reviewer_note}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenPdf(r)}
                      title="신청서 PDF 보기"
                      className="inline-flex items-center gap-1 text-[20px] font-medium text-zinc-400 hover:text-brand-deep transition-colors cursor-pointer group-hover:text-zinc-600"
                    >
                      <FileText size={14} />
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                  </td>
                  {!isManager && (
                    <td className="px-3 py-3 text-center">
                      {r.status === "pending" ? (
                        <button
                          onClick={() => onCancel(r.id)}
                          disabled={cancellingId === r.id}
                          title="신청 취소"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40"
                        >
                          {cancellingId === r.id
                            ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-rose-400" />
                            : <Trash2 size={14} />
                          }
                        </button>
                      ) : (
                        <span className="text-zinc-200 text-[20px]">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── PendingLeaveCard · 승인 대기 단일 카드 · 개선된 UI ─────────────────────
interface PendingLeaveCardProps {
  r: LeaveRequest;
  reviewingId: string | null;
  reviewNote: string;
  processingId: string | null;
  deletingId: string | null;
  onSetReviewNote: (v: string) => void;
  onSetReviewingId: (id: string | null) => void;
  onReview: (id: string, status: "approved" | "rejected") => void;
  onDelete: (r: LeaveRequest) => void;
}

const PendingLeaveCard: React.FC<PendingLeaveCardProps> = ({
  r, reviewingId, reviewNote, processingId, deletingId,
  onSetReviewNote, onSetReviewingId, onReview, onDelete,
}) => {
  const days = calcDays(r.start_date, r.end_date);
  return (
    <div className="group relative rounded-2xl border border-zinc-100 bg-white hover:border-zinc-200 hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] transition-all duration-150 py-4 px-5">

      {/* 상단: 이름 · 유형 pill · 상태 · 삭제 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap flex-1 min-w-0">
          <span className="text-[22px] font-bold text-zinc-900 leading-tight">{r.employee_name}</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[19px] font-semibold border border-indigo-100">
            {r.leave_type}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill tone="amber" size="md" dot pulse>
            대기 중
          </StatusPill>
          <button
            onClick={() => onDelete(r)}
            disabled={deletingId === r.id}
            title="이력 삭제"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40"
          >
            <Trash2 size={14} className={deletingId === r.id ? "animate-pulse" : ""} />
          </button>
        </div>
      </div>

      {/* 기간 */}
      <div className="flex items-center gap-1.5 mt-2.5 text-[21px] text-zinc-700">
        <CalendarDays size={15} className="text-zinc-400 shrink-0" />
        <span className="tabular-nums font-semibold">{fmtDateYMD(r.start_date)}</span>
        {r.start_date !== r.end_date && (
          <>
            <span className="text-zinc-400">~</span>
            <span className="tabular-nums font-semibold">{fmtDateYMD(r.end_date)}</span>
          </>
        )}
        <span className="text-zinc-400 font-normal tabular-nums">({days}일)</span>
      </div>

      {/* 사유 */}
      {r.reason && (
        <div className="mt-2.5 flex items-start gap-1.5 text-[20px] text-zinc-600 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2">
          <MessageSquareText size={14} className="text-zinc-400 mt-0.5 shrink-0" />
          <span className="break-words leading-relaxed">{r.reason}</span>
        </div>
      )}

      {/* 신청 시각 */}
      <div className="mt-2 text-[19px] text-zinc-400 tabular-nums">
        {fmtDateMD(r.created_at)} 신청
      </div>

      {/* 액션 영역 */}
      {reviewingId === r.id ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text" {...KO_INPUT_PROPS}
            value={reviewNote}
            onChange={e => onSetReviewNote(e.target.value)}
            placeholder="메모 (선택)"
            className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-[20px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onReview(r.id, "approved")}
              disabled={processingId === r.id}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[21px] font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              {processingId === r.id ? "처리 중..." : "승인"}
            </button>
            <button
              onClick={() => onReview(r.id, "rejected")}
              disabled={processingId === r.id}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[21px] font-bold border-2 border-rose-500 text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-all cursor-pointer disabled:opacity-50"
            >
              <XCircle size={16} />
              {processingId === r.id ? "처리 중..." : "반려"}
            </button>
          </div>
          <button
            onClick={() => { onSetReviewingId(null); onSetReviewNote(""); }}
            className="text-[20px] text-zinc-400 hover:text-zinc-600 text-center cursor-pointer py-1"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <button
            onClick={() => { onSetReviewingId(r.id); onSetReviewNote(""); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[21px] font-bold bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-950 text-white shadow-sm transition-all cursor-pointer"
          >
            <ChevronDown size={16} className="rotate-[-90deg]" />
            검토하기
          </button>
        </div>
      )}
    </div>
  );
};

export const LeavePage: React.FC<LeavePageProps> = ({
  onBack, authSession, onNavigate, onLogout, embedded = false, mode = "both",
}) => {
  const isManager = (authSession?.level ?? 0) >= 2;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "";
  const confirm = useConfirm();
  const { showError, showSuccess } = useToast();

  // 관리자 · mode="both" 시 · apply UI 도 항상 노출 (자기 신청 + 모두 조회)
  const showApply = mode === "apply" || mode === "both";
  const showApproval = (mode === "approval" || (mode === "both" && isManager)) && isManager;

  // ── Employee state ──────────────────────────────────────────────────────────
  const [balance, setBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);
  const [formType, setFormType] = useState(LEAVE_TYPES[0]);
  const [formStart, setFormStart] = useState(getKstYmd());
  const [formEnd, setFormEnd] = useState(getKstYmd());
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // 2026-09-20 · 사용자 지시 · 이력 · 선택 체크박스 · 전체/선택 삭제
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── PDF state ───────────────────────────────────────────────────────────────
  const pdfModalRef = useRef<HTMLDivElement | null>(null);
  const [pdfModalData, setPdfModalData] = useState<LeaveRequestPdfData | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  // offscreen 캡처용
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);
  const [pdfCaptureData, setPdfCaptureData] = useState<LeaveRequestPdfData | null>(null);

  // 직원 상세 정보 (PDF용)
  const [employeeDetail, setEmployeeDetail] = useState<{
    employee_number?: string | null;
    position?: string | null;
    hire_date?: string | null;
    phone?: string | null;
  } | null>(null);

  // ── Manager state ───────────────────────────────────────────────────────────
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────────
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

  // 관리자 apply 뷰 · allRequests(전체) 표시 · 비관리자 · myRequests(본인) 표시
  const displayRequests = isManager ? allRequests : myRequests;
  const displayLoading = isManager ? allLoading : myLoading;

  useEffect(() => {
    // 관리자 · showApply 시에도 allRequests 로드 필요 (apply 뷰에서 전체 표시)
    if (showApproval || (showApply && isManager)) loadAllRequests();
    if (showApply) {
      if (!isManager) loadMyRequests();
      loadBalance();
      loadEmployeeDetail();
    }
  }, [showApproval, showApply, isManager, loadAllRequests, loadMyRequests, loadBalance, loadEmployeeDetail]);

  // ── PDF 유틸 ────────────────────────────────────────────────────────────────
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
    const imgH = (canvas.height * pdfW) / canvas.width;
    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, imgH, undefined, "FAST");
    } else {
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, pdfW, imgH, undefined, "FAST");
        remaining -= pdfH;
        yOffset += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }
    return pdf;
  };

  const buildPdfData = useCallback((r: LeaveRequest): LeaveRequestPdfData => ({
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

  /** PDF 모달 열기 */
  const openPdfModal = (r: LeaveRequest) => {
    setPdfModalData(buildPdfData(r));
    setPdfModalOpen(true);
  };

  /** PDF 다운로드 (모달 안 버튼) */
  const handlePdfDownload = async () => {
    if (!pdfModalData) return;
    setPdfDownloading(true);
    setPdfCaptureData(pdfModalData);
    await new Promise(res => setTimeout(res, 120));
    try {
      if (!pdfCaptureRef.current) { showError("PDF 생성에 실패했습니다."); return; }
      const pdf = await buildPdfFromRef(pdfCaptureRef.current);
      const safeName = (pdfModalData.employeeName || "직원").replace(/[\\/:*?"<>|]/g, "_");
      const safeDate = pdfModalData.startDate.replace(/-/g, "");
      pdf.save(`연차신청서_${safeName}_${safeDate}.pdf`);
    } catch (err) {
      showError("PDF 생성에 실패했습니다.");
      console.error("[LeavePage] PDF download error:", err);
    } finally {
      setPdfDownloading(false);
      setPdfCaptureData(null);
    }
  };

  // ── Submit (employee) ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !employeeName) return;
    if (formEnd < formStart) { setSubmitError("종료일이 시작일보다 빠릅니다."); return; }

    const days = calcDays(formStart, formEnd);
    const reasonSummary = formReason.length > 20 ? formReason.slice(0, 20) + "..." : formReason;

    const ok = await confirm({
      message: (
        <div className="text-[21px] leading-relaxed text-zinc-700">
          <div className="font-semibold text-zinc-900 mb-1">
            {formType} · {formStart} ~ {formEnd} ({days}일)
          </div>
          {formReason && (
            <div className="text-zinc-500 mb-1.5">사유: {reasonSummary}</div>
          )}
          <div>내용으로 연차신청하시겠습니까?</div>
        </div>
      ),
      confirmLabel: "신청",
      cancelLabel: "취소",
    });
    if (!ok) return;

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
  // 2026-09-20 · 이력 · 선택 삭제 헬퍼
  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === displayRequests.length) return new Set();
      return new Set(displayRequests.map(r => r.id));
    });
  };
  const handleBulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    const isAll = ids.length === displayRequests.length;
    const ok = await confirm({
      title: isAll ? "전체 삭제" : "선택 삭제",
      message: `${ids.length}건의 신청 이력을 삭제할까요?${isManager ? "\n승인된 항목의 스케쥴도 함께 제거됩니다." : ""}`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBulkDeleting(true);
    let succeed = 0, fail = 0;
    for (const id of ids) {
      try { await deleteLeaveRequest(id); succeed += 1; }
      catch { fail += 1; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (fail > 0) showError(`${fail}건 삭제 실패 (성공 ${succeed})`);
    else showSuccess(`${succeed}건 삭제 완료`);
    if (isManager) await loadAllRequests(); else await loadMyRequests();
    dispatchApprovalChange("leave");
  };

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
  // 전체 이력: 최근순 정렬
  const allSorted = [...allRequests].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

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

        {/* ── 직원 뷰 (신청) ── */}
        {showApply && (
          <div className="flex flex-col gap-5">

            {/* 잔여 연차 · 한 줄 텍스트 */}
            <div className="flex items-center justify-between px-1">
              <div className="text-[20px] font-semibold text-zinc-700">
                {balance
                  ? <>잔여 연차: <span className="font-bold text-zinc-900 tabular-nums">{balance.remaining}일</span>
                      <span className="text-zinc-400 text-[20px] font-normal ml-2">
                        (사용 {balance.used} / 총 {balance.total})
                      </span>
                    </>
                  : <span className="text-zinc-400 text-[21px]">연차 정보 로딩 중...</span>
                }
              </div>
              {isManager && (
                <span className="text-[20px] text-zinc-400 font-medium">관리자 · 전체 신청 조회</span>
              )}
            </div>

            {/* 신청 폼 · 표 형식 */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <AccentBar />
                <span className="text-[21px] font-bold text-ink tracking-tight">신규 신청</span>
              </div>

              <form onSubmit={handleSubmit}>
                {/* 표 헤더 */}
                <div className="hidden sm:grid grid-cols-[120px_1fr_1fr_72px_1fr] gap-0 bg-zinc-50 border border-zinc-200 rounded-t-lg overflow-hidden">
                  {(["유형", "시작일", "종료일", "일수", "사유"] as const).map(h => (
                    <div key={h} className="px-3 py-2.5 text-[21px] font-semibold text-zinc-500 uppercase tracking-wider border-r last:border-r-0 border-zinc-200">
                      {h}
                    </div>
                  ))}
                </div>

                {/* 표 입력 행 */}
                <div className="hidden sm:grid grid-cols-[120px_1fr_1fr_72px_1fr] gap-0 border border-t-0 border-zinc-200 rounded-b-lg overflow-hidden">
                  {/* 유형 */}
                  <div className="px-2 py-2.5 border-r border-zinc-200 flex items-center">
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value)}
                      className="w-full bg-white border-0 text-[20px] font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-brand-deep rounded px-1 py-1 cursor-pointer"
                    >
                      {LEAVE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* 시작일 */}
                  <div className="px-2 py-2.5 border-r border-zinc-200 flex items-center">
                    <input
                      type="date"
                      value={formStart}
                      onChange={e => {
                        const s = e.target.value;
                        setFormStart(s);
                        if (formEnd < s) setFormEnd(s);
                      }}
                      className="w-full bg-white border-0 text-[20px] font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-brand-deep rounded px-1 py-1 tabular-nums"
                      required
                    />
                  </div>

                  {/* 종료일 */}
                  <div className="px-2 py-2.5 border-r border-zinc-200 flex items-center">
                    <input
                      type="date"
                      value={formEnd}
                      min={formStart}
                      onChange={e => setFormEnd(e.target.value)}
                      className="w-full bg-white border-0 text-[20px] font-semibold text-zinc-800 focus:outline-none focus:ring-1 focus:ring-brand-deep rounded px-1 py-1 tabular-nums"
                      required
                    />
                  </div>

                  {/* 일수 */}
                  <div className="px-2 py-2.5 border-r border-zinc-200 flex items-center justify-center">
                    <span className="text-[20px] font-bold text-zinc-700 tabular-nums">
                      {calcDays(formStart, formEnd)}일
                    </span>
                  </div>

                  {/* 사유 */}
                  <div className="px-2 py-2.5 flex items-center">
                    <input
                      type="text" {...KO_INPUT_PROPS}
                      value={formReason}
                      onChange={e => setFormReason(e.target.value)}
                      placeholder="사유 입력 (선택)"
                      className="w-full bg-white border-0 text-[20px] text-zinc-700 focus:outline-none focus:ring-1 focus:ring-brand-deep rounded px-1 py-1"
                    />
                  </div>
                </div>

                {/* 모바일 · 세로 스택 폼 */}
                <div className="sm:hidden flex flex-col gap-3">
                  <div>
                    <div className="text-[21px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">유형</div>
                    <select
                      value={formType}
                      onChange={e => setFormType(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[21px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep transition cursor-pointer"
                    >
                      {LEAVE_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[21px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">시작일</div>
                      <input
                        type="date" value={formStart}
                        onChange={e => { const s = e.target.value; setFormStart(s); if (formEnd < s) setFormEnd(s); }}
                        className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[21px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep transition tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <div className="text-[21px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">종료일</div>
                      <input
                        type="date" value={formEnd} min={formStart}
                        onChange={e => setFormEnd(e.target.value)}
                        className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[21px] font-semibold text-zinc-800 focus:outline-none focus:border-brand-deep transition tabular-nums"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[20px] text-zinc-500">
                    <span>총</span>
                    <span className="font-bold text-zinc-800 tabular-nums">{calcDays(formStart, formEnd)}일</span>
                  </div>
                  <div>
                    <div className="text-[21px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">사유 <span className="font-normal text-zinc-400">(선택)</span></div>
                    <input
                      type="text" {...KO_INPUT_PROPS} value={formReason}
                      onChange={e => setFormReason(e.target.value)}
                      placeholder="사유 입력"
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2.5 text-[21px] text-zinc-700 focus:outline-none focus:border-brand-deep transition"
                    />
                  </div>
                </div>

                {submitError && (
                  <div className="mt-2 text-[20px] text-rose-500 font-semibold px-1">{submitError}</div>
                )}

                {/* 2026-09-18 · 사용자 지시 · 최신 트렌드 · 파란 primary + 그림자 hover · "연차신청" 라벨 */}
                <div className="flex justify-end mt-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[21px] font-bold tracking-tight shadow-sm hover:shadow-md hover:shadow-blue-200/60 transition-all duration-150 cursor-pointer"
                  >
                    {submitting ? "신청 중..." : "연차신청"}
                  </button>
                </div>
              </form>
            </Card>

            {/* 신청 이력 · 표 형식 · 관리자=전체 · 직원=본인 */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <AccentBar />
                  <span className="text-[21px] font-bold text-ink tracking-tight">
                    {isManager ? "전체 신청 이력" : "내 신청 이력"}
                  </span>
                  <span className="text-[20px] font-medium text-ink-soft tabular-nums">· {displayRequests.length}건</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 2026-09-20 · 사용자 지시 · Bulk delete · 관리자만
                       · 직원 · 개별 pending row 만 취소 가능 (아래 취소 컬럼)
                       · 승인된 연차 · 관리자만 삭제 가능 */}
                  {isManager && selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(Array.from(selectedIds))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 text-white text-[20px] font-bold tracking-tight shadow-sm transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>선택 삭제 ({selectedIds.size})</span>
                    </button>
                  )}
                  {isManager && displayRequests.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(displayRequests.map(r => r.id))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-[20px] font-semibold transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>전체 삭제</span>
                    </button>
                  )}
                  <button
                    onClick={isManager ? loadAllRequests : loadMyRequests}
                    disabled={displayLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={displayLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {displayLoading && displayRequests.length > 0 && (
                <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-2 sticky top-0 z-10">
                  <Spinner size={12} tone="amber" label="새로 불러오는 중..." labelSize={16} />
                </Card>
              )}

              <RequestHistoryTable
                rows={displayRequests}
                isManager={isManager}
                loading={displayLoading}
                selectedIds={selectedIds}
                onToggleRow={toggleSelectRow}
                onToggleAll={toggleSelectAll}
                cancellingId={cancellingId}
                deletingId={deletingId}
                onCancel={handleCancel}
                onDelete={handleDeleteLeaveRequest}
                onOpenPdf={openPdfModal}
              />
            </Card>
          </div>
        )}

        {/* ── 관리자 뷰 (승인) · 2026-09-20 재구성 ── */}
        {showApproval && (
          <div className="flex flex-col gap-5">

            {/* ── A. 승인 대기 · 개선된 카드 리스트 ── */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <AccentBar />
                  <span className="text-[21px] font-bold text-ink tracking-tight">승인 대기</span>
                  {pending.length > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500 text-white text-[13px] font-bold tabular-nums leading-none">
                      {pending.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={loadAllRequests}
                  disabled={allLoading}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-all cursor-pointer"
                >
                  <RefreshCw size={14} className={allLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {allLoading && pending.length > 0 && (
                <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-2 sticky top-0 z-10">
                  <Spinner size={12} tone="amber" label="새로 불러오는 중..." labelSize={15} />
                </Card>
              )}
              {allLoading && pending.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner tone="zinc" label="로딩 중..." labelSize={15} />
                </div>
              ) : pending.length === 0 ? (
                <EmptyState title="대기 중인 신청 없음" hint="현재 검토가 필요한 연차 신청이 없습니다" size="compact" />
              ) : (
                <div className={`flex flex-col gap-3 ${allLoading ? "opacity-40 pointer-events-none" : ""}`}>
                  {pending.map(r => (
                    <PendingLeaveCard
                      key={r.id}
                      r={r}
                      reviewingId={reviewingId}
                      reviewNote={reviewNote}
                      processingId={processingId}
                      deletingId={deletingId}
                      onSetReviewNote={setReviewNote}
                      onSetReviewingId={setReviewingId}
                      onReview={handleReview}
                      onDelete={handleDeleteLeaveRequest}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* ── B. 전체 이력 표 · apply 뷰의 RequestHistoryTable 재사용 ── */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <AccentBar />
                  <span className="text-[21px] font-bold text-ink tracking-tight">전체 이력</span>
                  <span className="text-[20px] font-medium text-ink-soft tabular-nums">· {allSorted.length}건</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(Array.from(selectedIds))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 text-white text-[20px] font-bold tracking-tight shadow-sm transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>선택 삭제 ({selectedIds.size})</span>
                    </button>
                  )}
                  {allSorted.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(allSorted.map(r => r.id))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-[20px] font-semibold transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>전체 삭제</span>
                    </button>
                  )}
                  <button
                    onClick={loadAllRequests}
                    disabled={allLoading}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all cursor-pointer"
                  >
                    <RefreshCw size={13} className={allLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {allLoading && allSorted.length > 0 && (
                <Card variant="flat" bg="bg-indigo-50" borderColor="border-indigo-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-2 sticky top-0 z-10">
                  <Spinner size={12} tone="brand" label="새로 불러오는 중..." labelSize={15} />
                </Card>
              )}

              <RequestHistoryTable
                rows={allSorted}
                isManager
                loading={allLoading}
                selectedIds={selectedIds}
                onToggleRow={toggleSelectRow}
                onToggleAll={() => {
                  setSelectedIds(prev => {
                    if (prev.size === allSorted.length) return new Set();
                    return new Set(allSorted.map(r => r.id));
                  });
                }}
                cancellingId={cancellingId}
                deletingId={deletingId}
                onCancel={handleCancel}
                onDelete={handleDeleteLeaveRequest}
                onOpenPdf={openPdfModal}
              />
            </Card>
          </div>
        )}
      </main>

      {/* ── PDF 미리보기 모달 ── */}
      <Modal
        open={pdfModalOpen}
        onClose={() => { setPdfModalOpen(false); setPdfModalData(null); }}
        title="연차신청서"
        icon={<FileText size={16} />}
        size="lg"
        bodyPadding="none"
        footer={
          <div className="flex items-center gap-2">
            <button
              onClick={handlePdfDownload}
              disabled={pdfDownloading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-700 text-white text-[20px] font-semibold transition-colors cursor-pointer disabled:opacity-40"
            >
              {pdfDownloading ? (
                <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>생성 중...</span></>
              ) : (
                <><Download size={14} /><span>다운로드</span></>
              )}
            </button>
            <button
              onClick={() => { setPdfModalOpen(false); setPdfModalData(null); }}
              className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-[20px] font-semibold hover:bg-zinc-50 transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        }
      >
        {pdfModalData && (
          <div className="overflow-auto max-h-[70vh] flex items-start justify-center bg-zinc-100 p-4">
            <div style={{ transform: "scale(0.75)", transformOrigin: "top center", width: 794, flexShrink: 0 }}>
              <LeaveRequestPdfPreview data={pdfModalData} variant="visible" />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Offscreen PDF 캡처용 (다운로드 전용) ── */}
      {pdfCaptureData && (
        <div style={{ position: "fixed", top: 0, left: -99999, zIndex: -1, pointerEvents: "none" }}>
          <LeaveRequestPdfPreview
            ref={pdfCaptureRef}
            data={pdfCaptureData}
            variant="offscreen"
          />
        </div>
      )}
    </div>
  );
};

export default LeavePage;
