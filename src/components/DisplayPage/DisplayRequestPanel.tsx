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
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 size={10} />
        완료
      </span>
    );
  }
  if (urgent) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300 animate-pulse">
        <AlertTriangle size={10} />
        긴급
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-300">
      <Clock size={10} />
      대기
    </span>
  );
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
      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-500 active:scale-95 transition-all cursor-pointer border border-slate-200 hover:border-rose-200"
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
          ? "bg-slate-50 border-slate-100 opacity-70"
          : urgent
          ? "bg-rose-50/60 border-rose-200 shadow-sm shadow-rose-100"
          : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      {/* Row 1: 구역 + 상태 */}
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-bold ${urgent ? "text-rose-800" : "text-slate-900"}`}>
          {req.zoneLabel}
        </span>
        <StatusBadge req={req} />
      </div>
      {/* Row 2: 담당 + 시각 + 액션 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-medium text-slate-700 truncate">
            {req.assignedStaffName || "미배정"}
          </span>
          <span className="text-[11px] text-slate-400 shrink-0">{formatRel(req.requestedAt)}</span>
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
          : "hover:bg-slate-50/80"
      }`}
    >
      {/* 2026-08-10 · 사용자 요청 · 상품명 · 맨 앞 컬럼 */}
      <td className="px-3 py-2.5">
        <span className={`text-[12px] font-black ${urgent ? "text-rose-800" : "text-slate-900"} block truncate max-w-[220px]`} title={req.productName ?? undefined}>
          {req.productName ?? <span className="text-slate-300">-</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[12px] font-bold ${urgent ? "text-rose-800" : "text-slate-700"}`}>
          {req.zoneLabel}
        </span>
      </td>
      <td className="px-3 py-2.5 text-[12px] font-medium text-slate-700">
        {req.assignedStaffName || <span className="text-slate-400">미배정</span>}
      </td>
      <td className="px-3 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
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
  <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400 select-none">
    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
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
  const pendingCount = useMemo(() => requests.filter((r) => r.status === "pending").length, [requests]);
  const doneCount = useMemo(() => requests.filter((r) => r.status === "done").length, [requests]);
  const urgentCount = useMemo(() => requests.filter(isUrgent).length, [requests]);

  const handleComplete = (req: DisplayRequest) => {
    setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: "done" as const } : r));
    fetch(`/api/display-requests/${req.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    }).catch(() => {});
  };

  const handleDelete = (req: DisplayRequest) => {
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    fetch(`/api/display-requests/${req.id}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div
      className="w-full bg-white rounded-2xl border border-slate-200 shadow-md shadow-slate-200/60 flex flex-col overflow-hidden"
    >
      {/* ── 헤더 ── */}
      <div className="px-3 pt-3 pb-2.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
        {/* 좌: 아이콘 + 제목 + 카운트 pills */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <ClipboardList size={14} className="text-violet-600" />
          </div>
          <span className="text-[13px] font-bold text-slate-900 whitespace-nowrap">
            진열 보충 요청
          </span>
          {/* 대기 pill */}
          {pendingCount > 0 && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                urgentCount > 0
                  ? "bg-rose-50 border-rose-300 text-rose-700"
                  : "bg-amber-50 border-amber-300 text-amber-700"
              }`}
            >
              {urgentCount > 0 ? `긴급 ${urgentCount}건` : `대기 ${pendingCount}건`}
            </span>
          )}
          {/* 완료 pill */}
          {doneCount > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 whitespace-nowrap">
              완료 {doneCount}건
            </span>
          )}
        </div>

        {/* 우: segmented control */}
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {(["all", "pending", "done"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setReqFilter(k)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap ${
                reqFilter === k
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
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
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500">상품명</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 w-24">구역</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 w-20">담당</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 w-16">시각</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 text-center w-16">상태</th>
                    <th className="px-3 py-2 text-[11px] font-bold text-slate-500 text-center w-16">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
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
