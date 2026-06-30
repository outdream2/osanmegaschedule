import React, { useCallback, useEffect, useState } from "react";
import { Utensils, X, CheckCircle, Clock, RefreshCw, Users } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession } from "../../types";

interface LunchRequest {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  eating: boolean;
  memo: string | null;
  updated_at: string;
}

interface LunchPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function todayLabel() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export const LunchPage: React.FC<LunchPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const today = todayString();
  const userLevel = authSession?.level ?? 0;
  const isManager = userLevel >= 2;
  const isLoggedIn = !!authSession?.employeeId;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "직원";

  const [allRequests, setAllRequests] = useState<LunchRequest[]>([]);
  const [myRequest, setMyRequest] = useState<LunchRequest | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { return { error: text }; }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lunch-requests?date=${today}`);
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error ?? "서버 오류");
      const requests: LunchRequest[] = data.requests ?? [];
      setAllRequests(requests);
      setMyRequest(employeeId ? (requests.find(r => r.employee_id === employeeId) ?? null) : null);
    } catch (e: any) {
      setError(e.message);
      setMyRequest(null);
    } finally {
      setLoading(false);
    }
  }, [today, employeeId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (eating: boolean) => {
    if (!employeeId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lunch-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, employee_name: employeeName, date: today, eating, memo }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error ?? "신청 실패");
      await load();
      setMemo("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!employeeId || !myRequest || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lunch-requests?employee_id=${employeeId}&date=${today}`, { method: "DELETE" });
      if (!res.ok) { const d = await safeJson(res); throw new Error(d.error ?? "취소 실패"); }
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const eatCount  = allRequests.filter(r => r.eating).length;
  const noEatCount = allRequests.filter(r => !r.eating).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppNavHeader
        activePage="lunch"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-6 flex flex-col gap-5">

        {/* 날짜 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">오늘의 점심</p>
            <h1 className="text-2xl font-black text-gray-900">{todayLabel()}</h1>
          </div>
          <button
            onClick={load}
            className="p-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 transition cursor-pointer shadow-sm"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* 내 신청 카드 */}
        {!employeeId ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-amber-700 text-sm font-semibold">
            로그인 후 이용할 수 있습니다.
          </div>
        ) : loading && myRequest === undefined ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : myRequest ? (
          /* 이미 신청한 상태 */
          <div className={`rounded-2xl border-2 p-5 flex flex-col gap-3 shadow-sm transition-colors ${
            myRequest.eating
              ? "bg-emerald-50 border-emerald-300"
              : "bg-gray-50 border-gray-300"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {myRequest.eating
                  ? <CheckCircle size={22} className="text-emerald-500" />
                  : <X size={22} className="text-gray-400" />}
                <span className={`font-black text-xl ${myRequest.eating ? "text-emerald-700" : "text-gray-500"}`}>
                  {myRequest.eating ? "식사합니다 🍱" : "안 합니다"}
                </span>
              </div>
              <button
                onClick={cancel}
                disabled={submitting}
                className="text-[11px] text-gray-400 hover:text-rose-500 font-semibold transition cursor-pointer disabled:opacity-50"
              >
                신청취소
              </button>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock size={10} />
              {fmtTime(myRequest.updated_at)} 신청
            </p>
            {myRequest.memo && (
              <p className="text-xs text-gray-600 bg-white rounded-xl px-3 py-2 border border-gray-100">{myRequest.memo}</p>
            )}
            {/* 변경 버튼 */}
            <div className="flex gap-2 pt-2 border-t border-black/10">
              <span className="text-[11px] text-gray-400 font-semibold self-center shrink-0">변경:</span>
              <button
                onClick={() => submit(true)}
                disabled={submitting || myRequest.eating}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                🍱 식사
              </button>
              <button
                onClick={() => submit(false)}
                disabled={submitting || !myRequest.eating}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                ✕ 불참
              </button>
            </div>
          </div>
        ) : (
          /* 신청 전 */
          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
            <p className="text-center text-base font-bold text-gray-700">오늘 점심 드실 건가요?</p>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="메모 (선택사항)"
              rows={2}
              className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-indigo-300 text-gray-600 placeholder-gray-300"
            />
            <div className="flex gap-3">
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-5 rounded-2xl text-base font-black bg-emerald-500 hover:bg-emerald-600 active:scale-[0.97] text-white shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <Utensils size={18} /> 식사합니다
              </button>
              <button
                onClick={() => submit(false)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 py-5 rounded-2xl text-base font-black bg-gray-100 hover:bg-gray-200 active:scale-[0.97] text-gray-600 shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                <X size={18} /> 안 합니다
              </button>
            </div>
          </div>
        )}

        {/* 전체 신청 현황 (로그인한 직원 모두 볼 수 있음) */}
        {isLoggedIn && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={13} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-700">직원 신청 현황</span>
                <span className="text-[10px] text-gray-400">({allRequests.length}명 응답)</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full">
                  🍱 {eatCount}명
                </span>
                <span className="bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                  ✕ {noEatCount}명
                </span>
              </div>
            </div>
            {allRequests.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                아직 신청자가 없습니다
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {allRequests.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.eating ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{r.employee_name}</span>
                    {r.memo && (
                      <span className="text-[10px] text-gray-400 max-w-[130px] truncate">{r.memo}</span>
                    )}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      r.eating ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {r.eating ? "식사" : "불참"}
                    </span>
                    <span className="text-[10px] text-gray-300 shrink-0">{fmtTime(r.updated_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
