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
  MessageSquareText, StickyNote, ChevronDown, ChevronRight,
  AlertTriangle as Warning,
} from "lucide-react";
import { useSortableTable } from "../../hooks/useSortableTable";
import { TableListWrap, tableHeadCls, tableThCls, tableTdCls } from "../common/TableList";
import { SortHeader } from "../common/SortHeader";
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

// 2026-10-12 · 사용자 지시 · "연차" → "휴가" 전수 교체 (단독 "연차" 만 · 반차/월차/병가/특별휴가 유지)
const LEAVE_TYPES = ["휴가", "반차", "오전반차", "오후반차", "월차", "병가", "특별휴가"];

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
      {/* 2026-10-12 · 사용자 지시 · "반응형 주로 쓰임" · 모바일 UI 홈 랜딩 톤 재디자인
          · divide-y + rounded-[10px] + border-slate-200 + subtle bg-white
          · 각 row CARD · 상단 유형 pill + 상태 pill · 중앙 기간 inline · 하단 액션 */}
      <div className="md:hidden flex flex-col gap-1.5">
        {rows.map((r) => {
          const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
          const days = calcDays(r.start_date, r.end_date);
          const isSelected = selectedIds.has(r.id);
          return (
            <div
              key={r.id}
              className={`bg-white rounded-[10px] border px-3 py-2.5 transition-colors ${
                isSelected
                  ? "border-indigo-300 bg-indigo-50/40"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              {/* 상단 · 체크(관리자) + 이름 + 유형 pill + 상태 pill */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {isManager && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleRow(r.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {isManager && (
                      <span className="text-[14px] font-semibold text-ink truncate" title={r.employee_name}>{r.employee_name}</span>
                    )}
                    <span className="inline-flex items-center px-1.5 h-5 rounded text-[12px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100">
                      {r.leave_type}
                    </span>
                  </div>
                </div>
                <StatusPill tone={tone} size="sm" dot pulse={r.status === "pending"}>
                  {STATUS_LABEL[r.status]}
                </StatusPill>
              </div>

              {/* 기간 inline · tabular-nums */}
              <div className="flex items-center gap-1.5 mt-1.5 text-[13px] text-slate-600">
                <CalendarDays size={12} className="text-slate-400 shrink-0" />
                <span className="tabular-nums">{fmtDateYMD(r.start_date)}</span>
                {r.start_date !== r.end_date && (
                  <>
                    <span className="text-slate-400">~</span>
                    <span className="tabular-nums">{fmtDateYMD(r.end_date)}</span>
                  </>
                )}
                <span className="text-slate-400 tabular-nums text-[12px]">({days}일)</span>
              </div>

              {/* 비고 + 액션 · 노트 있을 때만 분리된 line · 액션은 우측 하단 */}
              {(r.reviewer_note || !isManager) && (
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    {r.reviewer_note && (
                      <span className="flex items-center gap-0.5 text-[12px] text-indigo-500 min-w-0">
                        <StickyNote size={10} className="shrink-0" />
                        <span className="break-words truncate" title={r.reviewer_note}>{r.reviewer_note}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenPdf(r)}
                      title="PDF 보기"
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-slate-50 border border-slate-200 transition-colors cursor-pointer"
                    >
                      <FileText size={11} />PDF
                    </button>
                    {!isManager && r.status === "pending" && (
                      <button
                        onClick={() => onCancel(r.id)}
                        disabled={cancellingId === r.id}
                        title="취소"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {cancellingId === r.id
                          ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-rose-400" />
                          : <Trash2 size={12} />
                        }
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* PC (md+): 테이블 · 2026-10-12 사용자 지시 UI 교체 · 홈 랜딩 톤
          · text-[21px] / text-[20px] 큰 폰트 → 홈 톤 compact (header 13 · body 14)
          · bg-zinc-50 border-zinc-200 → bg-slate-50 border-slate-200
          · uppercase tracking-wider 제거 · rounded-lg → rounded-[10px] */}
      <div className="hidden md:block overflow-x-auto rounded-[10px] border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[13px] font-semibold">
              {isManager && (
                <th className="text-center px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.size === rows.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length; }}
                    onChange={onToggleAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    aria-label="전체 선택"
                  />
                </th>
              )}
              {isManager && (
                <th className="text-left px-3 py-2 whitespace-nowrap">신청자</th>
              )}
              <th className="text-left px-3 py-2 whitespace-nowrap">유형</th>
              <th className="text-left px-3 py-2 whitespace-nowrap">기간</th>
              <th className="text-center px-3 py-2 whitespace-nowrap w-[88px]">상태</th>
              <th className="text-center px-3 py-2 whitespace-nowrap w-[64px]">PDF</th>
              {!isManager && (
                <th className="text-center px-3 py-2 whitespace-nowrap w-[56px]">취소</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const tone: PillTone = r.status === "pending" ? "amber" : r.status === "approved" ? "emerald" : "rose";
              return (
                <tr
                  key={r.id}
                  className={`group transition-colors hover:bg-slate-50/60 ${selectedIds.has(r.id) ? "bg-indigo-50/40" : ""}`}
                >
                  {isManager && (
                    <td className="text-center px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => onToggleRow(r.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        aria-label={`${r.employee_name} ${r.leave_type} 선택`}
                      />
                    </td>
                  )}
                  {isManager && (
                    <td className="px-3 py-2 text-[14px] font-semibold text-ink whitespace-nowrap">{r.employee_name}</td>
                  )}
                  <td className="px-3 py-2 text-[14px] font-semibold text-ink whitespace-nowrap">{r.leave_type}</td>
                  <td className="px-3 py-2 text-[13px] text-slate-600 whitespace-nowrap tabular-nums">
                    {fmtDateYMD(r.start_date)}
                    {r.start_date !== r.end_date && (
                      <span className="text-slate-400"> ~ {fmtDateYMD(r.end_date)}</span>
                    )}
                    <span className="text-slate-400 text-[12px] ml-1.5 tabular-nums">
                      ({calcDays(r.start_date, r.end_date)}일)
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <StatusPill tone={tone} size="sm" dot pulse={r.status === "pending"}>
                      {STATUS_LABEL[r.status]}
                    </StatusPill>
                    {r.reviewer_note && (
                      <div className="mt-1 flex items-center justify-center gap-0.5 text-[11px] text-indigo-500">
                        <StickyNote size={10} className="shrink-0" />
                        <span className="break-words truncate max-w-[120px]" title={r.reviewer_note}>{r.reviewer_note}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onOpenPdf(r)}
                      title="신청서 PDF 보기"
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer group-hover:text-slate-600"
                    >
                      <FileText size={13} />
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                  </td>
                  {!isManager && (
                    <td className="px-3 py-2 text-center">
                      {r.status === "pending" ? (
                        <button
                          onClick={() => onCancel(r.id)}
                          disabled={cancellingId === r.id}
                          title="신청 취소"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          {cancellingId === r.id
                            ? <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-rose-400" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      ) : (
                        <span className="text-slate-200 text-[13px]">—</span>
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

// ── PendingPCTable · PC(md+) 전용 · 승인대기 표 형식 ────────────────────────
type PendingColKey = "name" | "type" | "period" | "reason";

interface PendingPCTableProps {
  rows: LeaveRequest[];
  loading: boolean;
  reviewingId: string | null;
  reviewNote: string;
  processingId: string | null;
  deletingId: string | null;
  onSetReviewNote: (v: string) => void;
  onSetReviewingId: (id: string | null) => void;
  onReview: (id: string, status: "approved" | "rejected") => void;
  onDelete: (r: LeaveRequest) => void;
}

const PENDING_CMPS: Record<PendingColKey, (a: LeaveRequest, b: LeaveRequest) => number> = {
  name:   (a, b) => a.employee_name.localeCompare(b.employee_name, "ko"),
  type:   (a, b) => a.leave_type.localeCompare(b.leave_type, "ko"),
  period: (a, b) => a.start_date.localeCompare(b.start_date),
  reason: (a, b) => (a.reason ?? "").localeCompare(b.reason ?? "", "ko"),
};

const PendingPCTable: React.FC<PendingPCTableProps> = ({
  rows, loading,
  reviewingId, reviewNote, processingId, deletingId,
  onSetReviewNote, onSetReviewingId, onReview, onDelete,
}) => {
  const { sorted, sortKey, sortDir, toggleSort } =
    useSortableTable<LeaveRequest, PendingColKey>(rows, "period", PENDING_CMPS, "asc");

  return (
    <TableListWrap loading={loading} topAccent={false} maxHeight="none" className="overflow-visible">
      <table className="w-full border-collapse">
        <thead className={tableHeadCls()}>
          <tr>
            <th className={tableThCls("left", "pl-4 w-[130px]")}>
              <SortHeader label="직원명" columnKey="name" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="chevron" activeColor="zinc" />
            </th>
            <th className={tableThCls("left", "w-[110px]")}>
              <SortHeader label="유형" columnKey="type" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="chevron" activeColor="zinc" />
            </th>
            <th className={tableThCls("left", "w-[220px]")}>
              <SortHeader label="기간" columnKey="period" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="chevron" activeColor="zinc" />
            </th>
            <th className={tableThCls("left")}>
              <SortHeader label="사유" columnKey="reason" activeKey={sortKey} activeDir={sortDir} onToggle={toggleSort} arrowStyle="chevron" activeColor="zinc" />
            </th>
            <th className={tableThCls("center", "w-[180px] pr-4")}>액션</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const days = calcDays(r.start_date, r.end_date);
            const isReviewing = reviewingId === r.id;
            return (
              <React.Fragment key={r.id}>
                {/* 기본 행 */}
                <tr
                  className={[
                    "group border-t border-zinc-100 transition-colors duration-100",
                    idx === 0 ? "border-t-0" : "",
                    isReviewing
                      ? "bg-amber-50/60"
                      : "hover:bg-zinc-50/60",
                  ].join(" ")}
                >
                  {/* 직원명 */}
                  <td className={tableTdCls("left", "pl-4 py-3")}>
                    <span className="text-[18px] font-bold text-zinc-900 break-keep">{r.employee_name}</span>
                  </td>
                  {/* 유형 */}
                  <td className={tableTdCls("left", "py-3")}>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[15px] font-semibold border border-indigo-100 break-keep">
                      {r.leave_type}
                    </span>
                  </td>
                  {/* 기간 */}
                  <td className={tableTdCls("left", "py-3")}>
                    <span className="text-[17px] text-zinc-700 tabular-nums">
                      {fmtDateYMD(r.start_date)}
                      {r.start_date !== r.end_date && (
                        <span className="text-zinc-400"> ~ {fmtDateYMD(r.end_date)}</span>
                      )}
                      <span className="text-zinc-400 ml-1 tabular-nums">({days}일)</span>
                    </span>
                  </td>
                  {/* 사유 */}
                  <td className={tableTdCls("left", "py-3 max-w-[260px]")}>
                    {r.reason ? (
                      <span className="text-[16px] text-zinc-600 break-words leading-snug">{r.reason}</span>
                    ) : (
                      <span className="text-[15px] text-zinc-300">—</span>
                    )}
                  </td>
                  {/* 액션 버튼 */}
                  <td className={tableTdCls("center", "pr-4 py-2.5")}>
                    {isReviewing ? (
                      <button
                        onClick={() => { onSetReviewingId(null); onSetReviewNote(""); }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[14px] font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
                      >
                        <ChevronDown size={13} />
                        접기
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => { onSetReviewingId(r.id); onSetReviewNote(""); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[15px] font-bold bg-zinc-900 hover:bg-zinc-700 text-white transition-all cursor-pointer shadow-sm"
                        >
                          <ChevronRight size={13} />
                          검토
                        </button>
                        <button
                          onClick={() => onDelete(r)}
                          disabled={deletingId === r.id}
                          title="이력 삭제"
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 size={13} className={deletingId === r.id ? "animate-pulse" : ""} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* 검토 패널 (inline expand) */}
                {isReviewing && (
                  <tr className="bg-amber-50/40 border-t border-amber-100">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-[640px]">
                        <input
                          type="text"
                          value={reviewNote}
                          onChange={e => onSetReviewNote(e.target.value)}
                          placeholder="메모 (선택 입력)"
                          className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[16px] focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200 transition"
                        />
                        <button
                          onClick={() => onReview(r.id, "approved")}
                          disabled={processingId === r.id}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[16px] font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <CheckCircle2 size={15} />
                          {processingId === r.id ? "처리 중..." : "승인"}
                        </button>
                        <button
                          onClick={() => onReview(r.id, "rejected")}
                          disabled={processingId === r.id}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[16px] font-bold border-2 border-rose-500 text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <XCircle size={15} />
                          {processingId === r.id ? "처리 중..." : "반려"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </TableListWrap>
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

// 2026-10-09 · 사용자 지시 · 홈 랜딩 톤 · 2-3 column 그리드 fit · 폰트/padding 축소
const PendingLeaveCard: React.FC<PendingLeaveCardProps> = ({
  r, reviewingId, reviewNote, processingId, deletingId,
  onSetReviewNote, onSetReviewingId, onReview, onDelete,
}) => {
  const days = calcDays(r.start_date, r.end_date);
  return (
    <div className="group relative rounded-[12px] border border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.06)] transition-all duration-150 p-3.5">

      {/* 상단: 이름 · 유형 pill · 상태 · 삭제 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight leading-tight truncate">{r.employee_name}</span>
          <span className="inline-flex items-center px-1.5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-[12px] font-semibold">
            {r.leave_type}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
            대기
          </span>
          <button
            onClick={() => onDelete(r)}
            disabled={deletingId === r.id}
            title="이력 삭제"
            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
          >
            <Trash2 size={12} className={deletingId === r.id ? "animate-pulse" : ""} />
          </button>
        </div>
      </div>

      {/* 기간 */}
      <div className="flex items-center gap-1 mt-2 text-[13.5px] text-slate-700">
        <CalendarDays size={12} className="text-slate-400 shrink-0" />
        <span className="tabular-nums font-semibold">{fmtDateYMD(r.start_date)}</span>
        {r.start_date !== r.end_date && (
          <>
            <span className="text-slate-300">~</span>
            <span className="tabular-nums font-semibold">{fmtDateYMD(r.end_date)}</span>
          </>
        )}
        <span className="text-slate-400 font-normal tabular-nums text-[12px]">({days}일)</span>
      </div>

      {/* 사유 */}
      {r.reason && (
        <div className="mt-2 flex items-start gap-1 text-[13px] text-slate-600 bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5">
          <MessageSquareText size={11} className="text-slate-400 mt-0.5 shrink-0" />
          <span className="break-words leading-snug">{r.reason}</span>
        </div>
      )}

      {/* 신청 시각 */}
      <div className="mt-1.5 text-[11.5px] text-slate-400 tabular-nums">
        {fmtDateMD(r.created_at)} 신청
      </div>

      {/* 액션 영역 */}
      {reviewingId === r.id ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <input
            type="text" {...KO_INPUT_PROPS}
            value={reviewNote}
            onChange={e => onSetReviewNote(e.target.value)}
            placeholder="메모 (선택)"
            className="w-full bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-[13.5px] focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onReview(r.id, "approved")}
              disabled={processingId === r.id}
              className="flex items-center justify-center gap-1 h-9 rounded-md text-[13.5px] font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {processingId === r.id ? "처리 중..." : "승인"}
            </button>
            <button
              onClick={() => onReview(r.id, "rejected")}
              disabled={processingId === r.id}
              className="flex items-center justify-center gap-1 h-9 rounded-md text-[13.5px] font-semibold bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <XCircle size={13} />
              {processingId === r.id ? "처리 중..." : "반려"}
            </button>
          </div>
          <button
            onClick={() => { onSetReviewingId(null); onSetReviewNote(""); }}
            className="text-[12px] text-slate-400 hover:text-slate-600 text-center cursor-pointer py-0.5"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="mt-2.5">
          <button
            onClick={() => { onSetReviewingId(r.id); onSetReviewNote(""); }}
            className="w-full flex items-center justify-center gap-1 h-9 rounded-md text-[13.5px] font-semibold bg-slate-900 hover:bg-slate-800 active:bg-black text-white transition-colors cursor-pointer"
          >
            <ChevronDown size={13} className="rotate-[-90deg]" />
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

  // 직원 상세 정보 (PDF용 + 계약만료 D-day)
  const [employeeDetail, setEmployeeDetail] = useState<{
    employee_number?: string | null;
    position?: string | null;
    hire_date?: string | null;
    phone?: string | null;
    // 2026-10-12 · 사용자 지시 · 계약직 계약만료 D-day 표시
    employmentType?: string | null;
    contract_end?: string | null;
  } | null>(null);

  // ── Manager state ───────────────────────────────────────────────────────────
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 2026-10-12 · 사용자 지시 · 신청이력 검색 (관리자만) · 좌/우 분할 레이아웃
  const [searchQuery, setSearchQuery] = useState("");
  // 2026-10-12 · 사용자 지시 · 지각·결근 지표 (schedules.type 안 "지각"/"결근"/"조퇴" 포함 row)
  //   · 비관리자: 본인 (employeeId) · 관리자: 전체
  type AttendanceIssue = { date: string; employee_id: number; employee_name: string; type: string; kind: "지각" | "결근" | "조퇴" };
  const [attendanceIssues, setAttendanceIssues] = useState<AttendanceIssue[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const loadAttendanceIssues = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const { data } = await api.get<{ employees?: Array<{ id: number; name?: string; schedules?: Array<{ date: string; type?: string }> }> }>(
        `/api/schedules?year=${y}&month=${m}`,
      );
      const emps = Array.isArray(data?.employees) ? data!.employees! : [];
      const scoped = isManager ? emps : emps.filter(e => e.id === employeeId);
      const rows: AttendanceIssue[] = [];
      for (const e of scoped) {
        for (const s of e.schedules ?? []) {
          const t = String(s.type ?? "").trim();
          if (!t) continue;
          const kind: AttendanceIssue["kind"] | null = t.includes("결근") ? "결근" : t.includes("지각") ? "지각" : t.includes("조퇴") ? "조퇴" : null;
          if (!kind) continue;
          rows.push({ date: s.date, employee_id: e.id, employee_name: e.name ?? `#${e.id}`, type: t, kind });
        }
      }
      rows.sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceIssues(rows);
    } catch (err) {
      console.error("[LeavePage] attendance fetch failed", err);
      setAttendanceIssues([]);
    } finally {
      setAttendanceLoading(false);
    }
  }, [isManager, employeeId]);
  useEffect(() => { if (showApply) void loadAttendanceIssues(); }, [showApply, loadAttendanceIssues]);

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
        employmentType: data?.employmentType ?? data?.employment_type ?? null,
        contract_end: data?.contract_end ?? null,
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
      pdf.save(`유급휴가 신청서_${safeName}_${safeDate}.pdf`);
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
          <div>내용으로 유급휴가를 신청하시겠습니까?</div>
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
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-[#F4F7FA] flex flex-col"}>
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

        {/* ── 직원 뷰 (신청) · 2026-10-09 사용자 지시 · 홈 랜딩 톤 재디자인 ── */}
        {showApply && (
          <div className="flex flex-col gap-4">

            {/* 2026-10-12 · 사용자 지시 · "병합해서 컴팩트하고 깔끔하고 예쁘게"
                · 내 근태 정보 + 신규 신청 → 1개 통합 CARD
                · lg: 좌(근태 KPI) · 우(신청 폼) 분할 · 모바일 세로 stack */}
            {(() => {
              const mine = myRequests;
              const now = new Date();
              const yStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              const monthMine = mine.filter(r => String(r.start_date ?? "").startsWith(yStr));
              const pendingCount = mine.filter(r => r.status === "pending").length;
              const monthApproved = monthMine.filter(r => r.status === "approved").length;
              const monthRejected = monthMine.filter(r => r.status === "rejected").length;
              const usedPct = balance && balance.total > 0 ? Math.min(100, Math.round((balance.used / balance.total) * 100)) : 0;
              const curMonth = now.getMonth() + 1;
              // 2026-10-12 · 사용자 지시 · 계약직 계약만료 D-day
              const isContract = String(employeeDetail?.employmentType ?? "").includes("계약");
              const contractEnd = employeeDetail?.contract_end;
              let contractDday: number | null = null;
              if (isContract && contractEnd) {
                const d1 = new Date(contractEnd + "T00:00:00").getTime();
                const d0 = new Date(now.getFullYear() + "-" + String(curMonth).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0") + "T00:00:00").getTime();
                contractDday = Math.round((d1 - d0) / 86400000);
              }
              const contractTone =
                contractDday == null ? "" :
                contractDday < 0 ? "bg-slate-50 text-slate-500 border-slate-200" :
                contractDday <= 30 ? "bg-rose-50 text-rose-600 border-rose-100" :
                contractDday <= 90 ? "bg-amber-50 text-amber-700 border-amber-100" :
                "bg-emerald-50 text-emerald-700 border-emerald-100";
              const contractLabel =
                contractDday == null ? "" :
                contractDday < 0 ? `만료 (${-contractDday}일 경과)` :
                contractDday === 0 ? "오늘 만료" :
                `D-${contractDday}`;
              return (
                <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  {/* 통합 header · 좌 아이콘·타이틀 · 우 관리자 라벨 */}
                  <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-[3px] h-[14px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
                      <CalendarDays size={14} className="text-emerald-600 shrink-0" />
                      <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">휴가 · 근태</span>
                      <span className="text-[12.5px] md:text-[13px] text-slate-400 font-medium hidden sm:inline">· 유급휴가 신청</span>
                    </div>
                    {isManager && (
                      <span className="text-[12.5px] md:text-[13px] text-slate-400 font-medium">관리자 · 전체 신청 조회</span>
                    )}
                  </header>

                  <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                    {/* ── LEFT · 근태 KPI (lg 좌측 column · 모바일은 상단) ── */}
                    <div className="px-5 py-4 lg:border-r border-slate-100 border-b lg:border-b-0 flex flex-col gap-3">
                      {balance ? (
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[28px] md:text-[32px] font-bold text-emerald-700 tabular-nums tracking-tight leading-none">{balance.remaining}</span>
                          <span className="text-[13px] text-slate-500 font-medium">일 남음</span>
                          <span className="ml-auto text-[12px] text-slate-500 font-medium tabular-nums">사용 {balance.used} / {balance.total}</span>
                        </div>
                      ) : (
                        <div className="text-[13px] text-slate-400 font-medium">유급휴가 정보 로딩 중...</div>
                      )}
                      {balance && balance.total > 0 && (
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${usedPct >= 80 ? "bg-rose-500" : usedPct >= 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500 font-medium">대기</div>
                          <div className={`text-[16px] font-bold tabular-nums mt-0.5 ${pendingCount > 0 ? "text-amber-700" : "text-slate-400"}`}>{pendingCount}건</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500 font-medium">{curMonth}월 승인</div>
                          <div className={`text-[16px] font-bold tabular-nums mt-0.5 ${monthApproved > 0 ? "text-emerald-700" : "text-slate-400"}`}>{monthApproved}건</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] text-slate-500 font-medium">{curMonth}월 반려</div>
                          <div className={`text-[16px] font-bold tabular-nums mt-0.5 ${monthRejected > 0 ? "text-rose-600" : "text-slate-400"}`}>{monthRejected}건</div>
                        </div>
                      </div>
                      {/* 2026-10-12 · 사용자 지시 · 계약직 계약만료 D-day pill (계약직 + contract_end 둘 다 있을 때만) */}
                      {isContract && contractEnd && contractDday != null && (
                        <div className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-md ${contractTone}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Clock size={13} className="shrink-0" />
                            <span className="text-[12px] font-semibold tracking-tight">계약 만료</span>
                            <span className="text-[11.5px] opacity-80 tabular-nums shrink-0">· {contractEnd}</span>
                          </div>
                          <span className="text-[13px] font-bold tabular-nums shrink-0">{contractLabel}</span>
                        </div>
                      )}
                    </div>

                    {/* ── RIGHT · 신규 신청 폼 (컴팩트) ── */}
                    <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-[3px] h-[12px] bg-indigo-500 rounded-full shrink-0" aria-hidden />
                        <span className="text-[13.5px] md:text-[14px] font-semibold text-ink tracking-tight">신규 신청</span>
                      </div>

                      {/* PC · 1-line inline 폼 (유형/시작/종료/일수) · pill 톤 input */}
                      <div className="hidden sm:grid grid-cols-[140px_1fr_1fr_64px] gap-2">
                        <select
                          value={formType}
                          onChange={e => setFormType(e.target.value)}
                          className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep cursor-pointer transition"
                          aria-label="휴가 유형"
                        >
                          {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input
                          type="date"
                          value={formStart}
                          onChange={e => { const s = e.target.value; setFormStart(s); if (formEnd < s) setFormEnd(s); }}
                          className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums transition"
                          required aria-label="시작일"
                        />
                        <input
                          type="date"
                          value={formEnd} min={formStart}
                          onChange={e => setFormEnd(e.target.value)}
                          className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums transition"
                          required aria-label="종료일"
                        />
                        <div className="h-9 px-2.5 bg-emerald-50 border border-emerald-100 rounded-md flex items-center justify-center text-[14px] font-bold text-emerald-700 tabular-nums">
                          {calcDays(formStart, formEnd)}일
                        </div>
                      </div>

                      {/* 사유 input (PC + mobile 공통) */}
                      <input
                        type="text" {...KO_INPUT_PROPS}
                        value={formReason}
                        onChange={e => setFormReason(e.target.value)}
                        placeholder="사유 (선택)"
                        className="hidden sm:block h-9 w-full px-3 bg-white border border-slate-200 rounded-md text-[14px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
                      />

                      {/* 모바일 · 2열 그리드 */}
                      <div className="sm:hidden flex flex-col gap-2.5">
                        <select
                          value={formType}
                          onChange={e => setFormType(e.target.value)}
                          className="h-10 w-full px-3 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep cursor-pointer transition"
                        >
                          {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date" value={formStart}
                            onChange={e => { const s = e.target.value; setFormStart(s); if (formEnd < s) setFormEnd(s); }}
                            className="h-10 px-3 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums transition"
                            required aria-label="시작일"
                          />
                          <input
                            type="date" value={formEnd} min={formStart}
                            onChange={e => setFormEnd(e.target.value)}
                            className="h-10 px-3 bg-white border border-slate-200 rounded-md text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep tabular-nums transition"
                            required aria-label="종료일"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[13px] text-slate-500 font-medium">
                          <span>신청 일수</span>
                          <span className="text-[15px] font-bold text-emerald-700 tabular-nums">{calcDays(formStart, formEnd)}일</span>
                        </div>
                        <input
                          type="text" {...KO_INPUT_PROPS} value={formReason}
                          onChange={e => setFormReason(e.target.value)}
                          placeholder="사유 (선택)"
                          className="h-10 w-full px-3 bg-white border border-slate-200 rounded-md text-[14px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition"
                        />
                      </div>

                      {submitError && (
                        <div className="text-[13px] text-rose-600 font-medium">⚠ {submitError}</div>
                      )}

                      {/* 신청 버튼 · emerald primary · 전체 폭 */}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="h-10 w-full rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[14px] md:text-[15px] font-semibold tracking-tight transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {submitting ? "신청 중..." : "유급휴가 신청"}
                      </button>
                    </form>
                  </div>
                </section>
              );
            })()}

            {/* 2026-10-12 · 사용자 지시 · 좌(유급휴가 신청이력) + 우(지각·결근) 2-col 분할
                · 좌: 전체/내 유급휴가 신청이력 (관리자만 검색)
                · 우: 지각·결근 (본인/전체 scope) */}
            {(() => {
              const filteredRequests = isManager && searchQuery.trim()
                ? displayRequests.filter(r => {
                    const q = searchQuery.toLowerCase();
                    return String(r.employee_name ?? "").toLowerCase().includes(q)
                      || String(r.leave_type ?? "").toLowerCase().includes(q)
                      || String(r.reason ?? "").toLowerCase().includes(q);
                  })
                : displayRequests;
              const filteredIssues = isManager && searchQuery.trim()
                ? attendanceIssues.filter(a => {
                    const q = searchQuery.toLowerCase();
                    return String(a.employee_name ?? "").toLowerCase().includes(q)
                      || String(a.kind ?? "").toLowerCase().includes(q);
                  })
                : attendanceIssues;
              const historyTitle = isManager ? "전체 유급휴가 신청이력" : "내 유급휴가 신청이력";
              const issuesTitle = isManager ? "전체 지각·결근" : "내 지각·결근";
              return (
                <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
                  {/* ── 좌 · 유급휴가 신청이력 ── */}
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden relative">
                    <div className="absolute top-0 left-0 bottom-0 w-[4px] bg-gradient-to-b from-slate-300 to-slate-500" aria-hidden />
                    <div className="pl-6 pr-5 pt-4 pb-4">
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText size={16} className="text-slate-500 shrink-0" strokeWidth={2.2} />
                          <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{historyTitle}</span>
                          <span className="text-[13.5px] md:text-[14px] font-medium text-slate-400 tabular-nums">· {filteredRequests.length}건</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isManager && selectedIds.size > 0 && (
                            <button type="button" onClick={() => handleBulkDelete(Array.from(selectedIds))} disabled={bulkDeleting}
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 text-white text-[13px] md:text-[14px] font-semibold tracking-tight transition-colors cursor-pointer">
                              <Trash2 size={12} /><span>선택 삭제 ({selectedIds.size})</span>
                            </button>
                          )}
                          <button onClick={isManager ? loadAllRequests : loadMyRequests} disabled={displayLoading}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-slate-500 hover:text-ink hover:bg-slate-50 text-[13px] font-medium transition-colors cursor-pointer"
                            title="새로고침">
                            <RefreshCw size={12} className={displayLoading ? "animate-spin" : ""} />
                            <span className="hidden sm:inline">새로고침</span>
                          </button>
                        </div>
                      </div>

                      {/* 2026-10-12 · 사용자 지시 · 관리자만 검색 input */}
                      {isManager && (
                        <div className="mb-3">
                          <input
                            type="text" {...KO_INPUT_PROPS}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="직원명·유형·사유·지각·결근 검색"
                            className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-md text-[14px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep focus:bg-white transition"
                          />
                        </div>
                      )}

                      {displayLoading && filteredRequests.length > 0 && (
                        <div className="flex items-center justify-center gap-1.5 py-1.5 mb-2 bg-amber-50 border border-amber-100 rounded-md">
                          <Spinner size={12} tone="amber" label="새로 불러오는 중..." labelSize={13} />
                        </div>
                      )}

                      <RequestHistoryTable
                        rows={filteredRequests}
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
                    </div>
                  </section>

                  {/* ── 우 · 지각·결근 ── */}
                  <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-5 pt-4 pb-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-[3px] h-[14px] bg-rose-500 rounded-full shrink-0" aria-hidden />
                          <Warning size={14} className="text-rose-600 shrink-0" />
                          <span className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{issuesTitle}</span>
                          <span className="text-[13.5px] text-slate-400 font-medium tabular-nums">· {filteredIssues.length}건</span>
                        </div>
                        <button
                          onClick={loadAttendanceIssues}
                          disabled={attendanceLoading}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-slate-500 hover:text-ink hover:bg-slate-50 text-[13px] font-medium transition-colors cursor-pointer"
                          title="새로고침"
                        >
                          <RefreshCw size={12} className={attendanceLoading ? "animate-spin" : ""} />
                        </button>
                      </div>
                      {/* 월 요약 · 지각/결근/조퇴 count */}
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { k: "지각" as const, tone: "amber" },
                          { k: "결근" as const, tone: "rose" },
                          { k: "조퇴" as const, tone: "slate" },
                        ]).map(({ k, tone }) => {
                          const cnt = filteredIssues.filter(a => a.kind === k).length;
                          const toneCls = tone === "amber" ? "text-amber-700 bg-amber-50 border-amber-100"
                            : tone === "rose" ? "text-rose-600 bg-rose-50 border-rose-100"
                            : "text-slate-500 bg-slate-50 border-slate-200";
                          return (
                            <div key={k} className={`px-3 py-2 border rounded-md ${toneCls}`}>
                              <div className="text-[11px] font-medium opacity-80">{k}</div>
                              <div className="text-[16px] font-bold tabular-nums mt-0.5">{cnt}건</div>
                            </div>
                          );
                        })}
                      </div>
                      {/* 리스트 · 최근순 */}
                      <div className="min-h-[160px] max-h-[320px] overflow-y-auto border-t border-slate-100 pt-2">
                        {attendanceLoading && filteredIssues.length === 0 ? (
                          <div className="flex items-center justify-center py-8">
                            <Spinner size={13} tone="zinc" label="불러오는 중..." labelSize={13} />
                          </div>
                        ) : filteredIssues.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="text-[13px] text-slate-400 font-medium">이번 달 지각·결근 없음</div>
                            <div className="text-[12px] text-slate-400 mt-0.5">근태 성실 👍</div>
                          </div>
                        ) : (
                          <ul className="flex flex-col divide-y divide-slate-100">
                            {filteredIssues.map((a, i) => {
                              const kindCls = a.kind === "결근" ? "bg-rose-50 text-rose-600 border-rose-100"
                                : a.kind === "지각" ? "bg-amber-50 text-amber-700 border-amber-100"
                                : "bg-slate-50 text-slate-600 border-slate-200";
                              return (
                                <li key={`${a.employee_id}-${a.date}-${i}`} className="flex items-center justify-between gap-2 py-2 px-1">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-semibold shrink-0 ${kindCls}`}>{a.kind}</span>
                                    {isManager && (
                                      <span className="text-[13px] font-semibold text-ink truncate">{a.employee_name}</span>
                                    )}
                                    <span className="text-[12.5px] text-slate-500 tabular-nums shrink-0">{a.date.slice(5)}</span>
                                  </div>
                                  <span className="text-[12px] text-slate-500 truncate max-w-[160px]">{a.type}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── 관리자 뷰 (승인) · 2026-10-09 홈 랜딩 톤 재구성 (사용자 지시 #2)
             · CARD(rounded-[12px]+border-slate-200+thin shadow) · 2-tier typography
             · 좌측 accent 레일 제거 · 아이콘 inline (3px thin label accent)
             · 승인대기 카드 그리드 2~3 columns (사용자 지시 "리스트카드 2-3개로 다 보이게") ── */}
        {showApproval && (
          <div className="flex flex-col gap-4">

            {/* ── A. 승인 대기 · 홈 랜딩 톤 CARD · 카드 그리드 ── */}
            <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-[3px] h-[16px] bg-amber-500 rounded-full shrink-0" aria-hidden />
                  <Clock size={16} className="text-amber-600 shrink-0" strokeWidth={2.2} />
                  <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">승인 대기</h3>
                  {pending.length > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[12px] font-bold tabular-nums leading-none">
                      {pending.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={loadAllRequests}
                  disabled={allLoading}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-slate-500 hover:text-ink hover:bg-slate-50 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                  title="새로고침"
                >
                  <RefreshCw size={12} className={allLoading ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">새로고침</span>
                </button>
              </header>

              <div className="p-4">
                {allLoading && pending.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 mb-3 bg-amber-50 border border-amber-100 rounded-md">
                    <Spinner size={12} tone="amber" label="새로 불러오는 중..." labelSize={13} />
                  </div>
                )}
                {allLoading && pending.length === 0 ? (
                  <div className="flex items-center justify-center py-10">
                    <Spinner tone="zinc" label="로딩 중..." labelSize={13} />
                  </div>
                ) : pending.length === 0 ? (
                  <EmptyState title="대기 중인 신청 없음" hint="현재 검토가 필요한 연차 신청이 없습니다" size="compact" />
                ) : (
                  // 2026-10-09 · 사용자 지시 · "리스트카드 2-3개로 다 보이게"
                  //   · PC(xl) 3열 · tablet(md) 2열 · mobile 1열 · 모든 breakpoint 에서 카드 그리드로 통일
                  //   · PendingPCTable (표 형식) 폐기 → 카드 그리드로 통일 (한 눈에 다 보임)
                  <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ${allLoading ? "opacity-40 pointer-events-none" : ""}`}>
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
              </div>
            </section>

            {/* ── B. 전체 이력 표 · 홈 랜딩 톤 CARD ── */}
            <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-[3px] h-[16px] bg-slate-400 rounded-full shrink-0" aria-hidden />
                  <FileText size={16} className="text-slate-500 shrink-0" strokeWidth={2.2} />
                  <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">전체 이력</h3>
                  <span className="text-[13px] md:text-[14px] font-medium text-slate-400 tabular-nums">· {allSorted.length}건</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(Array.from(selectedIds))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 text-white text-[13px] md:text-[14px] font-semibold tracking-tight transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>선택 삭제 ({selectedIds.size})</span>
                    </button>
                  )}
                  {allSorted.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkDelete(allSorted.map(r => r.id))}
                      disabled={bulkDeleting}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 text-[13px] md:text-[14px] font-medium transition-colors cursor-pointer"
                    >
                      <Trash2 size={12} />
                      <span>전체 삭제</span>
                    </button>
                  )}
                  <button
                    onClick={loadAllRequests}
                    disabled={allLoading}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-slate-500 hover:text-ink hover:bg-slate-50 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                    title="새로고침"
                  >
                    <RefreshCw size={12} className={allLoading ? "animate-spin" : ""} />
                    <span className="hidden sm:inline">새로고침</span>
                  </button>
                </div>
              </header>

              <div className="p-4">
                {allLoading && allSorted.length > 0 && (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 mb-3 bg-slate-50 border border-slate-100 rounded-md">
                    <Spinner size={12} tone="brand" label="새로 불러오는 중..." labelSize={13} />
                  </div>
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
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ── PDF 미리보기 모달 ── */}
      <Modal
        open={pdfModalOpen}
        onClose={() => { setPdfModalOpen(false); setPdfModalData(null); }}
        title="유급휴가 신청서"
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
