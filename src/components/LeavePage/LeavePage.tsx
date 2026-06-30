import React, { useEffect, useState, useCallback } from "react";
import {
  CalendarDays, Clock, CheckCircle2, XCircle,
  RefreshCw, Plus, X, Trash2, ChevronDown,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";

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

interface LeavePageProps {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
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

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  } catch { return iso; }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const LeavePage: React.FC<LeavePageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const isManager = (authSession?.level ?? 0) >= 2;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "";

  // ── Employee state ──────────────────────────────────────────────────────────
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
      const res = await fetch(`/api/leave-requests?employeeId=${employeeId}`);
      setMyRequests(res.ok ? await res.json() : []);
    } catch { setMyRequests([]); }
    finally { setMyLoading(false); }
  }, [employeeId]);

  const loadAllRequests = useCallback(async () => {
    setAllLoading(true);
    try {
      const res = await fetch("/api/leave-requests?all=true");
      setAllRequests(res.ok ? await res.json() : []);
    } catch { setAllRequests([]); }
    finally { setAllLoading(false); }
  }, []);

  useEffect(() => {
    if (isManager) { loadAllRequests(); }
    else { loadMyRequests(); }
  }, [isManager]);

  // ── Submit (employee) ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !employeeName) return;
    if (formEnd < formStart) { setSubmitError("종료일이 시작일보다 빠릅니다."); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          employee_name: employeeName,
          leave_type: formType,
          start_date: formStart,
          end_date: formEnd,
          reason: formReason,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "오류 발생"); }
      setShowForm(false);
      setFormType(LEAVE_TYPES[0]);
      setFormStart(today());
      setFormEnd(today());
      setFormReason("");
      await loadMyRequests();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally { setSubmitting(false); }
  };

  // ── Cancel (employee) ───────────────────────────────────────────────────────
  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await fetch(`/api/leave-requests/${id}`, { method: "DELETE" });
      setMyRequests(prev => prev.filter(r => r.id !== id));
    } finally { setCancellingId(null); }
  };

  // ── Approve / Reject (manager) ──────────────────────────────────────────────
  const handleReview = async (id: string, status: "approved" | "rejected") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewer_note: reviewNote }),
      });
      if (res.ok) {
        setAllRequests(prev => prev.map(r =>
          r.id === id ? { ...r, status, reviewer_note: reviewNote, reviewed_at: new Date().toISOString() } : r
        ));
        setReviewingId(null);
        setReviewNote("");
      }
    } finally { setProcessingId(null); }
  };

  const pending = allRequests.filter(r => r.status === "pending");
  const reviewed = allRequests.filter(r => r.status !== "pending");

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Shared App Nav Header */}
      <AppNavHeader
        activePage="leave"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          isManager ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              <Clock size={11} />
              대기 {pending.length}건
            </span>
          ) : undefined
        }
      />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-5">

        {/* ── 직원 뷰 ── */}
        {!isManager && (
          <div className="flex flex-col gap-4">
            {/* 신청 버튼 */}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-sm transition cursor-pointer"
              >
                <Plus size={16} />
                연차 신청하기
              </button>
            )}

            {/* 신청 폼 */}
            {showForm && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-black text-gray-900">신규 휴가 신청</p>
                  <button onClick={() => { setShowForm(false); setSubmitError(null); }} className="text-gray-400 hover:text-gray-700 cursor-pointer"><X size={17} /></button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {/* 휴가 종류 */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">휴가 종류</label>
                    <div className="relative">
                      <select
                        value={formType}
                        onChange={e => setFormType(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-gray-900 text-sm font-semibold focus:outline-none focus:border-green-500 transition appearance-none cursor-pointer"
                      >
                        {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  {/* 날짜 */}
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">시작일</label>
                        <input
                          type="date"
                          value={formStart}
                          onChange={e => {
                            const s = e.target.value;
                            setFormStart(s);
                            if (formEnd < s) setFormEnd(s);
                          }}
                          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 text-sm font-semibold focus:outline-none focus:border-green-500 transition"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1.5">종료일</label>
                        <input
                          type="date"
                          value={formEnd}
                          min={formStart}
                          onChange={e => setFormEnd(e.target.value)}
                          className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 text-sm font-semibold focus:outline-none focus:border-green-500 transition"
                          required
                        />
                      </div>
                    </div>
                    {/* 일수 자동 계산 */}
                    {formStart && formEnd && (
                      <p className="text-xs text-green-600 font-bold text-right">
                        총 {Math.round((new Date(formEnd).getTime() - new Date(formStart).getTime()) / 86400000) + 1}일
                      </p>
                    )}
                  </div>
                  {/* 사유 */}
                  <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1.5">사유 <span className="font-normal text-gray-400">(선택)</span></label>
                    <textarea
                      value={formReason}
                      onChange={e => setFormReason(e.target.value)}
                      placeholder="사유를 입력하세요"
                      rows={2}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-green-500 transition resize-none"
                    />
                  </div>
                  {submitError && <p className="text-xs text-rose-500 font-semibold">{submitError}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-bold rounded-xl transition cursor-pointer text-sm flex items-center justify-center gap-2"
                  >
                    {submitting ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" /><span>신청 중...</span></> : "신청 제출"}
                  </button>
                </form>
              </div>
            )}

            {/* 내 신청 내역 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">내 신청 내역</p>
                <button onClick={loadMyRequests} disabled={myLoading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition">
                  <RefreshCw size={11} className={myLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {myLoading ? (
                <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
              ) : myRequests.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-gray-300">
                  <CalendarDays size={36} className="mb-3" />
                  <p className="text-sm font-bold text-gray-400">신청 내역이 없습니다</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {myRequests.map(r => (
                    <div key={r.id} className={`bg-white border rounded-xl p-4 shadow-sm ${r.status === "pending" ? "border-amber-200" : r.status === "approved" ? "border-emerald-200" : "border-rose-200"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-black text-gray-900">{r.leave_type}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}</p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-gray-500 mb-2 bg-gray-50 px-2.5 py-1.5 rounded-lg">{r.reason}</p>}
                      {r.reviewer_note && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg mb-2">
                          <span className="font-bold">관리자 메모:</span> {r.reviewer_note}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>신청일: {fmtDateTime(r.created_at)}</span>
                        {r.reviewed_at && <span>검토일: {fmtDateTime(r.reviewed_at)}</span>}
                      </div>
                      {r.status === "pending" && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          disabled={cancellingId === r.id}
                          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-gray-50 border border-gray-200 text-gray-500 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer disabled:opacity-50"
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

        {/* ── 관리자 뷰 ── */}
        {isManager && (
          <div className="flex flex-col gap-4">
            {/* 탭 */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 border border-gray-200 rounded-xl">
              {(["pending", "all"] as ManagerTab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setMgrTab(t)}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${mgrTab === t ? "bg-white shadow text-gray-900 border border-gray-200" : "text-gray-400 hover:text-gray-600"}`}
                >
                  {t === "pending" ? (
                    <><Clock size={12} />승인 대기 <span className={`ml-0.5 ${pending.length > 0 ? "text-amber-600" : ""}`}>{pending.length}</span></>
                  ) : (
                    <><CalendarDays size={12} />전체 목록</>
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <button onClick={loadAllRequests} disabled={allLoading} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 cursor-pointer px-2 py-1 rounded-lg hover:bg-gray-100 transition">
                <RefreshCw size={11} className={allLoading ? "animate-spin" : ""} /> 새로고침
              </button>
            </div>

            {allLoading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="flex flex-col gap-2">
                {(mgrTab === "pending" ? pending : reviewed).length === 0 ? (
                  <div className="flex flex-col items-center py-16 text-gray-300">
                    <CheckCircle2 size={36} className="mb-3" />
                    <p className="text-sm font-bold text-gray-400">
                      {mgrTab === "pending" ? "대기 중인 신청이 없습니다" : "검토 완료된 신청이 없습니다"}
                    </p>
                  </div>
                ) : (
                  (mgrTab === "pending" ? pending : reviewed).map(r => (
                    <div key={r.id} className={`bg-white border rounded-xl p-4 shadow-sm ${r.status === "pending" ? "border-amber-200" : r.status === "approved" ? "border-emerald-200" : "border-rose-200"}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-gray-900">{r.employee_name}</p>
                            <span className="text-xs font-bold text-gray-500">{r.leave_type}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{fmtDate(r.start_date)} ~ {fmtDate(r.end_date)}</p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${STATUS_COLOR[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      {r.reason && <p className="text-xs text-gray-500 mb-2 bg-gray-50 px-2.5 py-1.5 rounded-lg">{r.reason}</p>}
                      {r.reviewer_note && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg mb-2">
                          <span className="font-bold">내 메모:</span> {r.reviewer_note}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mb-2">신청일: {fmtDateTime(r.created_at)}</p>

                      {/* 승인/반려 패널 */}
                      {r.status === "pending" && (
                        reviewingId === r.id ? (
                          <div className="flex flex-col gap-2 mt-2">
                            <input
                              type="text"
                              value={reviewNote}
                              onChange={e => setReviewNote(e.target.value)}
                              placeholder="메모 (선택)"
                              className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-500 transition"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleReview(r.id, "approved")}
                                disabled={processingId === r.id}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                {processingId === r.id ? "처리 중..." : "승인"}
                              </button>
                              <button
                                onClick={() => handleReview(r.id, "rejected")}
                                disabled={processingId === r.id}
                                className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer disabled:opacity-50"
                              >
                                <XCircle size={12} />
                                {processingId === r.id ? "처리 중..." : "반려"}
                              </button>
                            </div>
                            <button
                              onClick={() => { setReviewingId(null); setReviewNote(""); }}
                              className="text-[11px] text-gray-400 hover:text-gray-600 text-center cursor-pointer"
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
        )}
      </main>
    </div>
  );
};

export default LeavePage;
