import React, { useCallback, useEffect, useRef, useState } from "react";
import { UtensilsCrossed, Clock, RefreshCw, Users, ChevronLeft, ChevronRight, Stethoscope, UserRound, Coffee } from "lucide-react";
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

interface AttendanceInfo {
  pharmacistCount: number;
  staffCount: number;
  totalCount: number;
}

type BreakTab = "약사" | "사원" | "기타";
type BreakDuration = 30 | 60;

interface DayEmployee {
  id: number;
  name: string;
  position: string;
  employmentType: string;
}

interface BreakAssignment {
  employeeId: number;
  employeeName: string;
  startSlot: number;
  duration: BreakDuration;
}

interface LunchPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

const TIME_SLOTS = [
  "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00",
];
const SLOT_W = 72; // px per 30-min slot

const OFF_TYPES = new Set(["휴무", "월차", "지정휴무", "결근", "오전반차", "오후반차"]);

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function dateLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["일","월","화","수","목","금","토"];
  const prefix = ymd === todayString() ? "오늘 " : "";
  return `${prefix}${m}월 ${d}일 (${days[dt.getDay()]})`;
}

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export const LunchPage: React.FC<LunchPageProps> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const today = todayString();
  const userLevel = authSession?.level ?? 0;
  const isLoggedIn = !!authSession?.employeeId;
  const isAdmin = userLevel >= 2;
  const employeeId = authSession?.employeeId;
  const employeeName = authSession?.employeeName ?? "직원";

  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;

  // ── 점심 불참 state ──────────────────────────────────────
  const [allRequests, setAllRequests] = useState<LunchRequest[]>([]);
  const [myRequest, setMyRequest] = useState<LunchRequest | null | undefined>(undefined);
  const [attendance, setAttendance] = useState<AttendanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── 휴게시간 타임라인 state ───────────────────────────────
  const [breakTab, setBreakTab] = useState<BreakTab>("약사");
  const [breakDuration, setBreakDuration] = useState<BreakDuration>(30);
  const [dayEmployees, setDayEmployees] = useState<DayEmployee[]>([]);
  const [assignments, setAssignments] = useState<BreakAssignment[]>([]);
  const [draggedEmpId, setDraggedEmpId] = useState<number | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // ── Helpers ─────────────────────────────────────────────
  const safeJson = async (res: Response) => {
    const text = await res.text();
    if (!text.trim()) return {};
    try { return JSON.parse(text); } catch { return { error: text }; }
  };

  // ── 점심 불참 API ────────────────────────────────────────
  const loadLunch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lunchRes, attRes] = await Promise.all([
        fetch(`/api/lunch-requests?date=${selectedDate}`),
        fetch(`/api/lunch-attendance?date=${selectedDate}`),
      ]);
      const lunchData = await safeJson(lunchRes);
      if (!lunchRes.ok) throw new Error(lunchData.error ?? "서버 오류");
      const requests: LunchRequest[] = lunchData.requests ?? [];
      setAllRequests(requests);
      setMyRequest(employeeId ? (requests.find(r => r.employee_id === employeeId) ?? null) : null);
      if (attRes.ok) {
        const attData = await attRes.json();
        setAttendance({ pharmacistCount: attData.pharmacistCount, staffCount: attData.staffCount, totalCount: attData.totalCount });
      }
    } catch (e: any) {
      setError(e.message);
      setMyRequest(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, employeeId]);

  // ── 휴게시간 배정 API ────────────────────────────────────
  const loadBreakData = useCallback(async () => {
    const [y, m] = selectedDate.split("-").map(Number);
    const [schedRes, assignRes] = await Promise.all([
      fetch(`/api/schedules?year=${y}&month=${m}`),
      fetch(`/api/settings?key=break_timeline_${selectedDate}`),
    ]);
    if (schedRes.ok) {
      const data = await schedRes.json();
      const emps: DayEmployee[] = (data.employees ?? [])
        .filter((emp: any) => {
          const s = (emp.schedules ?? []).find((sc: any) => sc.date === selectedDate);
          return s && s.type && !OFF_TYPES.has(s.type);
        })
        .map((emp: any) => ({
          id: emp.id,
          name: emp.name,
          position: emp.position ?? "",
          employmentType: emp.employmentType ?? emp.employment_type ?? "",
        }));
      setDayEmployees(emps);
    }
    if (assignRes.ok) {
      const d = await safeJson(assignRes);
      setAssignments(Array.isArray(d.value) ? d.value : []);
    }
  }, [selectedDate]);

  const saveAssignments = async (next: BreakAssignment[]) => {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: `break_timeline_${selectedDate}`, value: next }),
    });
  };

  useEffect(() => { loadLunch(); loadBreakData(); }, [loadLunch, loadBreakData]);

  // ── 점심 불참 actions ────────────────────────────────────
  const submit = async (eating: boolean) => {
    if (!employeeId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/lunch-requests", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, employee_name: employeeName, date: selectedDate, eating, memo }),
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error ?? "신청 실패");
      await loadLunch();
      setMemo("");
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const cancel = async () => {
    if (!employeeId || !myRequest || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lunch-requests?employee_id=${employeeId}&date=${selectedDate}`, { method: "DELETE" });
      if (!res.ok) { const d = await safeJson(res); throw new Error(d.error ?? "취소 실패"); }
      await loadLunch();
    } catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  // ── 휴게 드래그 & 드롭 ───────────────────────────────────
  const handleDrop = (slotIdx: number) => {
    if (draggedEmpId === null) return;
    const emp = dayEmployees.find(e => e.id === draggedEmpId);
    if (!emp) return;
    const next: BreakAssignment[] = [
      ...assignments.filter(a => a.employeeId !== draggedEmpId),
      { employeeId: draggedEmpId, employeeName: emp.name, startSlot: slotIdx, duration: breakDuration },
    ];
    setAssignments(next);
    saveAssignments(next);
    setDraggedEmpId(null);
    setDragOverSlot(null);
  };

  const handleDropToPool = () => {
    if (draggedEmpId === null) return;
    const next = assignments.filter(a => a.employeeId !== draggedEmpId);
    setAssignments(next);
    saveAssignments(next);
    setDraggedEmpId(null);
    setDragOverSlot(null);
  };

  const removeAssignment = (empId: number) => {
    const next = assignments.filter(a => a.employeeId !== empId);
    setAssignments(next);
    saveAssignments(next);
  };

  // ── Tab filtering ────────────────────────────────────────
  const tabEmployees = dayEmployees.filter(emp => {
    if (breakTab === "약사") return emp.position === "약사";
    if (breakTab === "사원") return emp.position !== "약사" && emp.employmentType !== "알바";
    return emp.position !== "약사" && emp.employmentType === "알바";
  });

  const unassigned = tabEmployees.filter(emp => !assignments.some(a => a.employeeId === emp.id));
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

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-5">

        {/* 날짜 네비게이션 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedDate(d => addDays(d, -1))}
              className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-700 transition cursor-pointer shadow-sm">
              <ChevronLeft size={15} />
            </button>
            <div>
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">점심 관리</p>
              <h1 className="text-xl font-black text-gray-900">{dateLabel(selectedDate)}</h1>
            </div>
            <button onClick={() => setSelectedDate(d => addDays(d, 1))} disabled={isToday}
              className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-700 transition cursor-pointer shadow-sm disabled:opacity-30 disabled:cursor-default">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!isToday && (
              <button onClick={() => setSelectedDate(today)}
                className="text-[11px] text-indigo-600 font-bold border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition cursor-pointer">
                오늘
              </button>
            )}
            <button onClick={() => { loadLunch(); loadBreakData(); }}
              className="p-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-700 transition cursor-pointer shadow-sm">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-rose-700 text-xs font-semibold">{error}</div>
        )}

        {/* 출근인원 현황 */}
        {isLoggedIn && attendance !== null && (
          <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-4">
            <Users size={15} className="text-gray-400 shrink-0" />
            <div className="flex items-center gap-4 flex-1 text-sm">
              <div className="flex items-center gap-1.5">
                <Stethoscope size={13} className="text-indigo-400" />
                <span className="text-gray-500 font-medium">약사</span>
                <span className="font-black text-indigo-700">{attendance.pharmacistCount}명</span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserRound size={13} className="text-amber-400" />
                <span className="text-gray-500 font-medium">직원</span>
                <span className="font-black text-amber-700">{attendance.staffCount}명</span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[11px] text-gray-400 font-medium">총</span>
                <span className="font-black text-gray-800 text-base">{attendance.totalCount}명</span>
                <span className="text-[11px] text-gray-400 font-medium">출근</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 휴게시간 타임라인 ────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* 헤더 */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Coffee size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-700">휴게시간 배정</span>
            </div>
            <div className="flex items-center gap-3">
              {/* 탭 */}
              <div className="flex gap-1">
                {(["약사", "사원", "기타"] as BreakTab[]).map(tab => (
                  <button key={tab} onClick={() => setBreakTab(tab)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${breakTab === tab ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              {/* 시간 설정 */}
              <div className="flex gap-1">
                {([30, 60] as BreakDuration[]).map(d => (
                  <button key={d} onClick={() => setBreakDuration(d)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${breakDuration === d ? "bg-blue-500 text-white" : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {d === 30 ? "30분" : "1시간"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 타임라인 */}
          <div ref={timelineRef} className="overflow-x-auto">
            <div style={{ minWidth: `${TIME_SLOTS.length * SLOT_W}px` }}>
              {/* 시간 헤더 */}
              <div className="flex border-b border-gray-100">
                {TIME_SLOTS.map((slot, idx) => (
                  <div key={slot}
                    style={{ width: `${SLOT_W}px` }}
                    className={`flex-shrink-0 h-8 flex items-center justify-center text-[10px] font-bold border-r border-gray-100
                      ${slot === "12:00" || slot === "13:00" ? "text-indigo-600 bg-indigo-50" : "text-gray-400 bg-gray-50"}`}>
                    {slot}
                  </div>
                ))}
              </div>

              {/* 드롭 존 */}
              <div className="flex" style={{ minHeight: "100px" }}>
                {TIME_SLOTS.map((slot, slotIdx) => {
                  const slotAssignments = assignments.filter(a =>
                    a.startSlot === slotIdx && tabEmployees.some(e => e.id === a.employeeId)
                  );
                  const isOver = dragOverSlot === slotIdx;

                  return (
                    <div
                      key={slot}
                      style={{ width: `${SLOT_W}px` }}
                      className={`flex-shrink-0 border-r border-gray-100 p-1 flex flex-col gap-1 transition-colors
                        ${isOver ? "bg-indigo-50 border-indigo-200" : "hover:bg-gray-50"}
                        ${(slot === "12:00" || slot === "13:00") && !isOver ? "bg-indigo-50/30" : ""}`}
                      onDragOver={e => { e.preventDefault(); setDragOverSlot(slotIdx); }}
                      onDragLeave={e => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlot(null);
                      }}
                      onDrop={() => handleDrop(slotIdx)}
                    >
                      {slotAssignments.map(a => (
                        <div
                          key={a.employeeId}
                          draggable
                          onDragStart={() => setDraggedEmpId(a.employeeId)}
                          onDragEnd={() => { setDraggedEmpId(null); setDragOverSlot(null); }}
                          className="px-1.5 py-1 bg-indigo-100 border border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-800 flex items-center gap-1 cursor-grab select-none hover:bg-indigo-200 transition"
                        >
                          <span className="truncate flex-1">{a.employeeName}</span>
                          <button
                            onMouseDown={e => e.stopPropagation()}
                            onClick={() => removeAssignment(a.employeeId)}
                            className="shrink-0 text-indigo-400 hover:text-rose-500 leading-none"
                          >×</button>
                        </div>
                      ))}
                      {isOver && (
                        <div className="flex-1 border-2 border-dashed border-indigo-300 rounded-lg flex items-center justify-center text-[9px] text-indigo-400 font-bold min-h-[32px]">
                          {TIME_SLOTS[slotIdx]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 미배정 풀 */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] text-gray-400 font-bold">미배정</span>
              <span className="text-[10px] text-gray-300">← 아래에서 위 시간대로 드래그</span>
            </div>
            <div
              className={`min-h-[44px] flex flex-wrap gap-2 p-2 rounded-xl border-2 border-dashed transition-colors
                ${dragOverSlot === -1 ? "border-rose-300 bg-rose-50" : "border-gray-200"}`}
              onDragOver={e => { e.preventDefault(); setDragOverSlot(-1); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSlot(null); }}
              onDrop={handleDropToPool}
            >
              {unassigned.map(emp => (
                <div
                  key={emp.id}
                  draggable
                  onDragStart={() => setDraggedEmpId(emp.id)}
                  onDragEnd={() => { setDraggedEmpId(null); setDragOverSlot(null); }}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-grab shadow-sm hover:border-indigo-300 hover:text-indigo-700 select-none transition"
                >
                  {emp.name}
                </div>
              ))}
              {unassigned.length === 0 && tabEmployees.length > 0 && (
                <span className="text-[11px] text-gray-400 self-center">모두 배정됨</span>
              )}
              {tabEmployees.length === 0 && (
                <span className="text-[11px] text-gray-400 self-center">출근 {breakTab} 없음</span>
              )}
            </div>

            {/* 배정 완료 목록 (간략) */}
            {assignments.filter(a => tabEmployees.some(e => e.id === a.employeeId)).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {assignments
                  .filter(a => tabEmployees.some(e => e.id === a.employeeId))
                  .sort((a, b) => a.startSlot - b.startSlot)
                  .map(a => (
                    <span key={a.employeeId} className="text-[10px] text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2 py-0.5">
                      {a.employeeName} <span className="text-gray-400">{TIME_SLOTS[a.startSlot]}~{TIME_SLOTS[a.startSlot + a.duration / 30] ?? "+"}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 점심 불참 내 신청 ────────────────────────────── */}
        {!employeeId ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center text-amber-700 text-sm font-semibold">
            로그인 후 이용할 수 있습니다.
          </div>
        ) : loading && myRequest === undefined ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isToday && myRequest && !myRequest.eating ? (
          <div className="rounded-2xl border-2 bg-gray-50 border-gray-300 p-5 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UtensilsCrossed size={22} className="text-rose-400" />
                <span className="font-black text-xl text-gray-600">오늘 점심 불참</span>
              </div>
              <button onClick={cancel} disabled={submitting}
                className="text-[11px] text-gray-400 hover:text-rose-500 font-semibold transition cursor-pointer disabled:opacity-50">
                신청취소
              </button>
            </div>
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock size={10} />{fmtTime(myRequest.updated_at)} 신청
            </p>
            {myRequest.memo && (
              <p className="text-xs text-gray-600 bg-white rounded-xl px-3 py-2 border border-gray-100">{myRequest.memo}</p>
            )}
          </div>
        ) : isToday ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
            <p className="text-center text-base font-bold text-gray-700">오늘 점심 드시나요?</p>
            <p className="text-center text-[11px] text-gray-400">식사하시면 그냥 두시면 됩니다. 불참일 때만 신청해주세요.</p>
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="메모 (선택사항)" rows={2}
              className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none outline-none focus:border-indigo-300 text-gray-600 placeholder-gray-300" />
            <button onClick={() => submit(false)} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-5 rounded-2xl text-base font-black bg-gray-100 hover:bg-gray-200 active:scale-[0.97] text-gray-700 shadow-sm transition cursor-pointer disabled:opacity-50">
              <UtensilsCrossed size={18} className="text-rose-400" /> 점심 불참 신청
            </button>
          </div>
        ) : null}

        {/* ── 불참 현황 ────────────────────────────────────── */}
        {isLoggedIn && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UtensilsCrossed size={13} className="text-gray-400" />
                <span className="text-xs font-bold text-gray-700">점심 불참 현황</span>
                <span className="text-[10px] text-gray-400">({allRequests.length}명 응답)</span>
              </div>
              <span className="bg-gray-100 text-gray-600 border border-gray-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
                불참 {noEatCount}명
              </span>
            </div>
            {noEatCount === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">불참 신청자가 없습니다</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {allRequests.filter(r => !r.eating).map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gray-300" />
                    <span className="text-sm font-semibold text-gray-800 flex-1">{r.employee_name}</span>
                    {r.memo && <span className="text-[10px] text-gray-400 max-w-[130px] truncate">{r.memo}</span>}
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
