// src/components/DisplayPage/DisplayRequestPanel.tsx
// 2026-08-03 · 실시간 진열 보충 요청 현황 · UI 세련화 컴포넌트 분리
import React, { useMemo } from "react";
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";
import { dispatchApprovalChange } from "../../lib/approvalEvents";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface DisplayRequest {
  id: string;
  zoneId: string;
  zoneLabel: string;
  category: string;
  requestedAt: string;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: "pending" | "done";
  note: string;
  // 2026-08-10 · 사용자 요청 · 상품명 컬럼 · 서버 응답에서 products JOIN 으로 채움
  productName?: string | null;
  productSpec?: string | null;
  productCode?: string | null;
}

interface DisplayRequestPanelProps {
  filteredReqs: DisplayRequest[];
  requests: DisplayRequest[];
  reqFilter: "all" | "pending" | "done";
  setReqFilter: (f: "all" | "pending" | "done") => void;
  setRequests: React.Dispatch<React.SetStateAction<DisplayRequest[]>>;
  formatRel: (iso: string) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const URGENT_MS = 30 * 60 * 1000; // 30분

function isUrgent(req: DisplayRequest): boolean {
  return req.status === "pending" && Date.now() - new Date(req.requestedAt).getTime() > URGENT_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Status badge
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ req: DisplayRequest }> = ({ req }) => {
  const urgent = isUrgent(req);
  if (req.status === "done") {
    return <StatusPill tone="emerald" size="sm" dot>완료</StatusPill>;
  }
  if (urgent) {
    return <StatusPill tone="rose" size="sm" dot pulse>긴급</StatusPill>;
  }
  return <StatusPill tone="amber" size="sm" dot>대기</StatusPill>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Action buttons
// ─────────────────────────────────────────────────────────────────────────────
const ActionButtons: React.FC<{
  req: DisplayRequest;
  onComplete: () => void;
  onDelete: () => void;
}> = ({ req, onComplete, onDelete }) => (
  <div className="flex items-center justify-center gap-1">
    {req.status === "pending" && (
      <button
        type="button"
        onClick={onComplete}
        title="완료 처리"
        className="w-7 h-7 flex items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-sm"
      >
        <CheckCircle2 size={13} />
      </button>
    )}
    <button
      type="button"
      onClick={onDelete}
      title="삭제"
      className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:scale-95 transition-all cursor-pointer border border-line hover:border-rose-200"
    >
      <Trash2 size={12} />
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Card view row (mobile)
// ─────────────────────────────────────────────────────────────────────────────
const RequestCard: React.FC<{
  req: DisplayRequest;
  onComplete: () => void;
  onDelete: () => void;
  formatRel: (iso: string) => string;
}> = ({ req, onComplete, onDelete, formatRel }) => {
  const urgent = isUrgent(req);
  return (
    <div
      className={`rounded-lg border p-3 flex flex-col gap-2 transition-all duration-150 ${
        req.status === "done"
          ? "bg-zinc-50 border-zinc-100 opacity-70"
          : urgent
          ? "bg-rose-50/60 border-rose-200 shadow-sm shadow-rose-100"
          : "bg-white border-line hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      {/* Row 1: 구역 + 상태 */}
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-bold ${urgent ? "text-rose-800" : "text-zinc-900"}`}>
          {req.zoneLabel}
        </span>
        <StatusBadge req={req} />
      </div>
      {/* Row 2: 담당 + 시각 + 액션 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-medium text-zinc-700 break-words whitespace-normal">
            {req.assignedStaffName || "미배정"}
          </span>
          <span className="text-[11px] text-zinc-400 shrink-0">{formatRel(req.requestedAt)}</span>
        </div>
        <ActionButtons req={req} onComplete={onComplete} onDelete={onDelete} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Table row (desktop)
// ─────────────────────────────────────────────────────────────────────────────
const RequestTableRow: React.FC<{
  req: DisplayRequest;
  onComplete: () => void;
  onDelete: () => void;
  formatRel: (iso: string) => string;
}> = ({ req, onComplete, onDelete, formatRel }) => {
  const urgent = isUrgent(req);
  return (
    <tr
      className={`group transition-colors duration-100 ${
        req.status === "done"
          ? "opacity-60"
          : urgent
          ? "bg-rose-50/50 hover:bg-rose-50"
          : "hover:bg-zinc-50/80"
      }`}
    >
      {/* 2026-08-10 · 사용자 요청 · 상품명 · 맨 앞 컬럼 */}
      <td className="px-3 py-2.5">
        {/* 2026-08-29 · UI 감사 U1 · truncate 제거 · 상품명 잘림 방지 */}
        <span className={`text-[12px] font-bold ${urgent ? "text-rose-800" : "text-zinc-900"} block break-words whitespace-normal leading-tight`} title={req.productName ?? undefined}>
          {req.productName ?? <span className="text-zinc-300">-</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[12px] font-bold ${urgent ? "text-rose-800" : "text-zinc-700"}`}>
          {req.zoneLabel}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] font-medium text-zinc-700">
        {req.assignedStaffName || <span className="text-zinc-400">미배정</span>}
      </td>
      <td className="px-3 py-2.5 text-[11px] text-zinc-400 whitespace-nowrap">
        {formatRel(req.requestedAt)}
      </td>
      <td className="px-3 py-2.5 text-center">
        <StatusBadge req={req} />
      </td>
      <td className="px-3 py-2.5 text-center">
        <ActionButtons req={req} onComplete={onComplete} onDelete={onDelete} />
      </td>
    </tr>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Empty state
// ─────────────────────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ reqFilter: "all" | "pending" | "done" }> = ({ reqFilter }) => (
  <div className="flex flex-col items-center justify-center py-10 gap-3 text-zinc-400 select-none">
    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
      <Bell size={18} className="opacity-50 animate-bounce" />
    </div>
    <p className="text-[12px] font-medium">
      {reqFilter === "done"
        ? "완료된 요청이 없습니다"
        : reqFilter === "pending"
        ? "대기 중인 요청이 없습니다"
        : "등록된 진열 요청이 없습니다"}
    </p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const DisplayRequestPanel: React.FC<DisplayRequestPanelProps> = ({
  filteredReqs,
  requests,
  reqFilter,
  setReqFilter,
  setRequests,
  formatRel,
}) => {
  const { toast, showError, showSuccess } = useToast();
  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);
  const doneCount = useMemo(() => requests.filter((r) => r.status === "done").length, [requests]);
  const urgentCount = useMemo(() => requests.filter(isUrgent).length, [requests]);

  const handleComplete = (req: DisplayRequest) => {
    // optimistic update
    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r));
    api.patch(`/api/display-requests/${req.id}`, { status: "done" })
      .then(() => { dispatchApprovalChange("display"); showSuccess("완료 처리되었습니다"); })
      .catch((e: any) => {
        // 낙관적 업데이트 롤백
        setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "pending" as const } : r));
        showError(`완료 처리 실패: ${e?.message ?? "네트워크 오류"}`);
      });
  };

  const handleDelete = (req: DisplayRequest) => {
    // optimistic update
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    api.del(`/api/display-requests/${req.id}`)
      .then(() => { dispatchApprovalChange("display"); showSuccess("삭제되었습니다"); })
      .catch((e: any) => {
        // 낙관적 업데이트 롤백
        setRequests((prev) => [...prev, req].sort((a, b) => a.requestedAt < b.requestedAt ? 1 : -1));
        showError(`삭제 실패: ${e?.message ?? "네트워크 오류"}`);
      });
  };

  return (
    <div
      className="w-full bg-white rounded-2xl border border-line shadow-md shadow-zinc-200/60 flex flex-col overflow-hidden"
    >
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
      {/* ── 헤더 ── */}
      <div className="px-3 pt-3 pb-2.5 border-b border-zinc-100 flex items-center justify-between flex-wrap gap-2">
        {/* 좌: 아이콘 + 제목 + 카운트 pills */}
        <div className="flex items-center gap-2 min-w-0">
          {/* 2026-08-18 · IconTile 확산 */}
          <IconTile icon={<ClipboardList size={14} />} tone="violet" size="md" />

          <span className="text-[13px] font-bold text-zinc-900 whitespace-nowrap">
            진열 보충 요청
          </span>
          {/* 대기 pill · 2026-08-17 · StatusPill 프레임워크 통일 */}
          {pendingCount > 0 && (
            <StatusPill tone={urgentCount > 0 ? "rose" : "amber"} size="xs" pulse={urgentCount > 0}>
              {urgentCount > 0 ? `긴급 ${urgentCount}건` : `대기 ${pendingCount}건`}
            </StatusPill>
          )}
          {/* 완료 pill · 2026-08-17 · StatusPill 프레임워크 통일 */}
          {doneCount > 0 && (
            <StatusPill tone="emerald" size="xs">완료 {doneCount}건</StatusPill>
          )}
        </div>

        {/* 우: segmented control */}
        <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-0.5 shrink-0">
          {(["all", "pending", "done"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setReqFilter(k)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap ${
                reqFilter === k
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {k === "all" ? "전체" : k === "pending" ? "대기" : "완료"}
            </button>
          ))}
        </div>
      </div>

      {/* ── 콘텐츠 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredReqs.length === 0 ? (
          <EmptyState reqFilter={reqFilter} />
        ) : (
          <>
            {/* 모바일: 카드 뷰 (sm 미만) */}
            <div className="sm:hidden flex flex-col gap-2 p-2.5">
              {filteredReqs.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  onComplete={() => handleComplete(req)}
                  onDelete={() => handleDelete(req)}
                  formatRel={formatRel}
                />
              ))}
            </div>

            {/* sm+: 테이블 뷰 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {/* 2026-08-10 · 사용자 요청 · 상품명 · 맨 앞 컬럼 */}
                  <tr className="bg-zinc-50/80 border-b border-zinc-100">
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500">상품명</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500 w-24">구역</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500 w-20">담당</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500 w-16">시각</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500 text-center w-16">상태</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-zinc-500 text-center w-16">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100/80">
                  {filteredReqs.map((req) => (
                    <RequestTableRow
                      key={req.id}
                      req={req}
                      onComplete={() => handleComplete(req)}
                      onDelete={() => handleDelete(req)}
                      formatRel={formatRel}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
