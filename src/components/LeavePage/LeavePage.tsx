// 2026-08-17 · apiClient 마이그레이션
import React, { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "../../lib/apiClient";
import {
  CalendarDays, Clock, CheckCircle2, XCircle,
  RefreshCw, Plus, X, Trash2, ChevronDown, Loader2,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { fmtDateYMD, fmtDateMD } from "../../lib/format";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";

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

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 border-amber-200",
  approved: "text-emerald-600 bg-emerald-50 border-emerald-200",
  rejected: "text-rose-600 bg-rose-50 border-rose-200",
};

const fmtDate = fmtDateYMD;
const fmtDateTime = fmtDateMD;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const LeavePage: React.FC<LeavePageProps> = ({ onBack, authSession, onNavigate, onLogout, embedded = false, mode = "both" }) => {
  const isManager = (authSession?.level ?? 0) >= 2;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "";

  // 모드별 뷰 활성화 · 관리자 UI 는 실제 관리자에게만 노출 (mode="approval" 이라도 방어)
  const showApply = mode === "apply" || (mode === "both" && !isManager);
  const showApproval = (mode === "approval" || (mode === "both" && isManager)) && isManager;

  // ── Employee state ──────────────────────────────────────────────────────────
  // 2026-08-12 · 잔여 연차 (신청 뷰 상단 배너)
  const [balance, setBalance] = useState<{ total: number; used: number; remaining: number } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState(LEAVE_TYPES[0]);
  const [formStart, setFormStart] = useState(today());
  const [formEnd, setFormEnd] = useState(today());
  const [formReason, setFormReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // ── Manager state ───────────────────────────────────────────────────────────
  const [mgrTab, setMgrTab] = useState<ManagerTab>("pending");
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const loadMyRequests = useCallback(async () => {
    if (!employeeId) return;
    setMyLoading(true);
    try {
      const { data } = await api.get<any[]>(`/api/leave-requests?employeeId=${employeeId}`);
      setMyRequests(Array.isArray(data) ? data : []);
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
      const { data } = await api.get<any[]>("/api/leave-requests?all=true");
      setAllRequests(Array.isArray(data) ? data : []);
    } catch { setAllRequests([]); }
    finally { setAllLoading(false); }
  }, []);

  useEffect(() => {
    if (showApproval) loadAllRequests();
    if (showApply) { loadMyRequests(); loadBalance(); }
  }, [showApproval, showApply, loadAllRequests, loadMyRequests, loadBalance]);

  // ── Submit (employee) ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !employeeName) return;
    if (formEnd < formStart) { setSubmitError("종료일이 시작일보다 빠릅니다."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post("/api/leave-requests", {
        employee_id: employeeId,
        employee_name: employeeName,
        leave_type: formType,
        start_date: formStart,
        end_date: formEnd,
        reason: formReason,
      });
      setShowForm(false);
      setFormType(LEAVE_TYPES[0]);
      setFormStart(today());
      setFormEnd(today());
      setFormReason("");
      await loadMyRequests();
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : (err as any)?.message ?? "오류 발생");
    } finally { setSubmitting(false); }
  };

  // ── Cancel (employee) ───────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.del(`/api/leave-requests/${id}`);
      setMyRequests(prev => prev.filter(r => r.id !== id));
    } catch { /* silent · UI 이미 유지 */ }
    finally { setCancellingId(null); }
  };

  // ── Approve / Reject (manager) ──────────────────────────────────────────────
  const handleReview = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      await api.put(`/api/leave-requests/${id}`, { status, reviewer_note: reviewNote });
      setAllRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status, reviewer_note: reviewNote, reviewed_at: new Date().toISOString() } : r,
      ));
      setReviewingId(null);
      setReviewNote("");
    } catch { /* silent · UI 이미 유지 */ }
    finally { setProcessingId(null); }
  };

  const pending = allRequests.filter(r => r.status === "pending");
  const reviewed = allRequests.filter(r => r.status !== "pending");

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-gray-50 flex flex-col"}>
      {/* Shared App Nav Header · embedded 모드(BusinessManagePage 임베드)에서는 skip */}
      {!embedded && (
        <AppNavHeader
          activePage="leave"
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
          rightSlot={
            showApproval && pending.length > 0 ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                <Clock size={11} />
                대기 {pending.length}건
              </span>
            ) : undefined
          }
        />
      )}

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">

        {/* ── 직원 뷰 (신청) ── 2026-08-12 · 글씨 -1 단계 · 무게 살짝 완화 */}
        {showApply && (
          <div className="flex flex-col gap-4">
            {/* 잔여 배너 + 신청 버튼 · 2026-08-12 · 사용자 지시 · 나란히 배치 */}
            {/* 2026-08-17 · #132 · 사용자 지시 · 버튼과 잔여 배너 여백/테두리 반 */}
            {/* 2026-08-17 · #147 · 사용자 지시 · 버튼 py 살짝 줄이고 옆카드와 높이 맞춤 · items-stretch 유지 */}
            {(balance || !showForm) && (
              <div className="flex items-stretch gap-1">
                {balance && (
                  <div className="flex-1 bg-white border border-line rounded-lg px-3 py-2 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={16} className="text-brand-deep" />
                      <span className="text-[18px] font-semibold text-ink">남은 연차</span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[19px] font-extrabold text-brand-deep tabular-nums">{balance.remaining}</span>
                      <span className="text-[18px] text-ink-soft">일 / 총 {balance.total}일 · 사용 {balance.used}일</span>
                    </div>
                  </div>
                )}
                {!showForm && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white font-semibold text-[18px] shadow-sm transition-colors cursor-pointer"
                  >
                    <Plus size={14} strokeWidth={2.2} />
                    연차 신청
                  </button>
                )}
              </div>
            )}

            {/* 신청 폼 */}
            {showForm && (
              <div className="bg-white border border-line rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-zinc-800">신규 휴가 신청</p>
                  <button onClick={() => { setShowForm(false); setSubmitError(null); }} className="text-zinc-400 hover:text-zinc-700 cursor-pointer"><X size={17} /></button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {/* 휴가 종류 */}
                  <div>
                    <label className="text-[19px] font-semibold text-zinc-600 block mb-1.5">휴가 종류</label>
                    <div className="relative">
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value)}
                        className="w-full bg-white border border-line rounded-lg px-3.5 py-2 text-zinc-800 text-xs font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition appearance-none cursor-pointer"
                      >
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                  {/* 날짜 */}
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[19px] font-semibold text-zinc-600 block mb-1.5">시작일</label>
                        <input
                          type="date"
                          value={formStart}
                          onChange={e => {
                            const s = e.target.value;
                            setFormStart(s);
                            if (formEnd < s) setFormEnd(s);
                          }}
                          className="w-full bg-white border border-line rounded-lg px-3 py-2 text-zinc-800 text-xs font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-[19px] font-semibold text-zinc-600 block mb-1.5">종료일</label>
                        <input
                          type="date"
                          value={formEnd}
                          min={formStart}
                          onChange={e => setFormEnd(e.target.value)}
                          className="w-full bg-white border border-line rounded-lg px-3 py-2 text-zinc-800 text-xs font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                          required
                        />
                      </div>
                    </div>
                    {formStart && formEnd && (
                      <p className="text-[19px] text-brand-deep font-semibold text-right tabular-nums">
                        총 {Math.round((new Date(formEnd).getTime() - new Date(formStart).getTime()) / 86400000) + 1}일
                      </p>
                    )}
                  </div>
                  {/* 사유 */}
                  <div>
                    <label className="text-[19px] font-semibold text-zinc-600 block mb-1.5">사유 <span className="font-normal text-zinc-400">(선택)</span></label>
                    <textarea
                      value={formReason}
                      onChange={e => setFormReason(e.target.value)}
                      placeholder="사유를 입력하세요"
                      rows={2}
                      className="w-full bg-white border border-line rounded-lg px-3.5 py-2 text-zinc-800 text-xs focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-none"
                    />
                  </div>
                  {submitError && <p className="text-[19px] text-rose-500 font-semibold">{submitError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-10 bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] disabled:opacity-40 text-white font-semibold rounded-lg transition-colors cursor-pointer text-[19px] flex items-center justify-center gap-2 shadow-sm"
                  >
                    {submitting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>신청 중...</span></> : "신청 제출"}
                  </button>
                </form>
              </div>
            )}

            {/* 내 신청 내역 · 최신 트렌드 · accent bar + brand-deep */}
            <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-[3px] h-[16px] rounded-full bg-brand-deep" />
                  <span className="text-[19px] font-bold text-ink tracking-tight">내 신청 내역</span>
                  <span className="text-[19px] font-medium text-ink-soft tabular-nums">· {myRequests.length}건</span>
                </div>
                <button onClick={loadMyRequests} disabled={myLoading} className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 cursor-pointer">
                  <RefreshCw size={11} className={myLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {myLoading && myRequests.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-[19px] text-amber-600 font-bold py-1.5 mb-1 bg-amber-50 border border-amber-200 rounded-md sticky top-0 z-10">
                  <Loader2 size={11} className="animate-spin" /> 새로 불러오는 중...
                </div>
              )}
              {myLoading && myRequests.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-zinc-400 text-[19px] font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
              ) : !myLoading && myRequests.length === 0 ? (
                <div className="text-center text-[18px] text-zinc-300 py-6">데이터 없음</div>
              ) : (
                <div className={`flex flex-col divide-y divide-zinc-50 ${myLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                  {myRequests.map(r => (
                    <div key={r.id} className={`py-2 px-2 hover:bg-zinc-50/60 transition-all duration-150 rounded-lg ${r.status === "pending" ? "border-l-2 border-amber-300" : r.status === "approved" ? "border-l-2 border-emerald-300" : "border-l-2 border-rose-300"}`}>
                      {/* 2026-08-12 · 사용자 지시 · 배치 재구성 · 희망연차일 + 종류 + 상태 (한 줄) · 신청일 · 검토일 · 아래 상세 */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[19px] font-bold text-gray-900">
                            {fmtDate(r.start_date)}{r.start_date !== r.end_date && ` ~ ${fmtDate(r.end_date)}`}
                            <span className="ml-2 text-[19px] text-gray-500 font-semibold">· {r.leave_type}</span>
                          </p>
                        </div>
                        <span className={`shrink-0 text-[19px] font-bold ${
                          r.status === "pending" ? "text-amber-600" :
                          r.status === "approved" ? "text-emerald-600" : "text-rose-600"
                        }`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[19px] text-gray-400 mt-1 mb-2">
                        <span>신청일: {fmtDateTime(r.created_at)}</span>
                        {r.reviewed_at && <span>검토일: {fmtDateTime(r.reviewed_at)}</span>}
                      </div>
                      {/* 아래 · 상세 내용 (사유 · 관리자 메모) */}
                      {(r.reason || r.reviewer_note) && (
                        <div className="border-t border-zinc-100 pt-2 flex flex-col gap-1.5">
                          {r.reason && <p className="text-[19px] text-zinc-600 px-0.5">사유: {r.reason}</p>}
                          {r.reviewer_note && (
                            <p className="text-[19px] text-indigo-700 px-0.5">
                              <span className="font-bold">관리자 메모:</span> {r.reviewer_note}
                            </p>
                          )}
                        </div>
                      )}
                      {r.status === "pending" && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          disabled={cancellingId === r.id}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[18px] font-semibold bg-zinc-50 border border-line text-zinc-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-150 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 size={11} />
                          {cancellingId === r.id ? "취소 중..." : "신청 취소"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 관리자 뷰 (승인) ── */}
        {showApproval && (
          <div className="flex flex-col gap-4">
            {/* 탭 */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 border border-line rounded-xl">
              {(["pending", "all"] as ManagerTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setMgrTab(t)}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${mgrTab === t ? "bg-white shadow-sm text-zinc-800 border border-line" : "text-zinc-400 hover:text-zinc-600"}`}
                >
                  {t === "pending" ? (
                    <><Clock size={12} />승인 대기 <span className={`ml-0.5 ${pending.length > 0 ? "text-amber-600" : ""}`}>{pending.length}</span></>
                  ) : (
                    <><CalendarDays size={12} />전체 목록</>
                  )}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-line p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-amber-600" />
                  <span className="text-sm font-bold text-zinc-700">
                    {mgrTab === "pending" ? "승인 대기" : "전체 목록"}
                  </span>
                  <span className="text-[18px] font-mono text-zinc-400">
                    ({(mgrTab === "pending" ? pending : reviewed).length}건)
                  </span>
                </div>
                <button onClick={loadAllRequests} disabled={allLoading} className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all duration-150 cursor-pointer">
                  <RefreshCw size={12} className={allLoading ? "animate-spin" : ""} />
                </button>
              </div>

            {allLoading && (mgrTab === "pending" ? pending : reviewed).length > 0 && (
              <div className="flex items-center justify-center gap-1.5 text-[18px] text-indigo-600 font-bold py-1.5 mb-1 bg-indigo-50 border border-indigo-200 rounded-md sticky top-0 z-10">
                <Loader2 size={11} className="animate-spin" /> 새로 불러오는 중...
              </div>
            )}
            {allLoading && (mgrTab === "pending" ? pending : reviewed).length === 0 ? (
              <div className="flex items-center justify-center py-8 text-zinc-400 text-xs font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
            ) : (
              <div className={`flex flex-col divide-y divide-zinc-50 ${allLoading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                {(mgrTab === "pending" ? pending : reviewed).length === 0 ? (
                  <div className="text-center text-[19px] text-zinc-300 py-6">데이터 없음</div>
                ) : (
                  (mgrTab === "pending" ? pending : reviewed).map(r => (
                    <div key={r.id} className={`py-1.5 hover:bg-zinc-50/60 transition-all duration-150 rounded-lg ${r.status === "pending" ? "border-l-2 border-amber-300 pl-2" : r.status === "approved" ? "border-l-2 border-emerald-300 pl-2" : "border-l-2 border-rose-300 pl-2"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-zinc-800">{r.employee_name}</p>
                            <span className="text-xs font-semibold text-zinc-500">{r.leave_type}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}</p>
                        </div>
                        <span className={`shrink-0 text-[18px] font-bold px-2 py-1 rounded-full border ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-zinc-500 mb-2 bg-zinc-50 px-2.5 py-1.5 rounded-md">{r.reason}</p>}
                      {r.reviewer_note && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg mb-2">
                          <span className="font-bold">내 메모:</span> {r.reviewer_note}
                        </p>
                      )}
                      <p className="text-[18px] text-zinc-400 mb-2">신청일: {fmtDateTime(r.created_at)}</p>

                      {/* 승인/반려 패널 */}
                      {r.status === "pending" && (
                        reviewingId === r.id ? (
                          <div className="flex flex-col gap-2 mt-2">
                            <input
                              type="text"
                              value={reviewNote}
                              onChange={e => setReviewNote(e.target.value)}
                              placeholder="메모 (선택)"
                              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleReview(r.id, "approved")}
                                disabled={processingId === r.id}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white transition-all duration-150 cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                {processingId === r.id ? "처리 중..." : "승인"}
                              </button>
                              <button
                                onClick={() => handleReview(r.id, "rejected")}
                                disabled={processingId === r.id}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all duration-150 cursor-pointer disabled:opacity-50"
                              >
                                <XCircle size={12} />
                                {processingId === r.id ? "처리 중..." : "반려"}
                              </button>
                            </div>
                            <button
                              onClick={() => { setReviewingId(null); setReviewNote(""); }}
                              className="text-[19px] text-zinc-400 hover:text-zinc-600 text-center cursor-pointer"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setReviewingId(r.id); setReviewNote(""); }}
                            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition cursor-pointer"
                          >
                            검토하기
                          </button>
                        )
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LeavePage;
