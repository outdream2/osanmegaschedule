// src/components/ReservationPage.tsx
import React, { useState, useCallback, useEffect } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Phone,
  User,
  Clock,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  X,
  Building2,
  Loader2,
  Ban,
} from "lucide-react";

interface ReservationPageProps {
  onBack: () => void;
}

interface StaffAvailability {
  employeeId: number;
  name: string;
  scheduleType: string | null;
  isOff: boolean;
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

const PURPOSES = ["결제", "신약 상담", "발주 확인", "제품 상담", "재고 점검", "기타"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatKoreanDate = (ymd: string): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[dateObj.getDay()]})`;
};

const buildMonthGrid = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const getTargetFromNote = (noteStr: string): string => {
  if (!noteStr) return "대표";
  const match = noteStr.match(/^\[대상:(대표|이사|부장)\]/);
  return match ? match[1] : "대표";
};

const STAFF_NAMES = ["대표", "이사", "부장"];

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack }) => {
  const now = new Date();
  const todayYMD = formatYMD(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);

  // Reservations for the selected date
  const [reservations, setReservations] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Staff availability (휴무 check)
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability[]>(
    STAFF_NAMES.map((name, i) => ({ employeeId: i + 1, name, scheduleType: null, isOff: false }))
  );
  const [availLoading, setAvailLoading] = useState(false);

  // Modal state
  const [modalTime, setModalTime] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<string>("대표");
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const monthCells = buildMonthGrid(viewYear, viewMonth);
  const isPrevMonthDisabled = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // Booked slots per target
  const bookedByTarget: Record<string, string[]> = {};
  for (const name of STAFF_NAMES) {
    bookedByTarget[name] = reservations
      .filter(r => getTargetFromNote(r.note || r.purpose) === name)
      .map(r => r.time);
  }

  const fetchReservations = useCallback(async (ymd: string) => {
    setSlotsLoading(true);
    setReservations([]);
    try {
      const res = await fetch(`/api/reservations?date=${ymd}`);
      if (res.ok) {
        const data = await res.json();
        setReservations(Array.isArray(data) ? data : []);
      }
    } catch {
      setReservations([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const fetchStaffAvailability = useCallback(async (ymd: string) => {
    setAvailLoading(true);
    try {
      const res = await fetch(`/api/staff-availability?date=${ymd}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setStaffAvailability(data);
      }
    } catch {
      // silently ignore — treat all as available
    } finally {
      setAvailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations(selectedDate);
    fetchStaffAvailability(selectedDate);
  }, [selectedDate, fetchReservations, fetchStaffAvailability]);

  const handleDayClick = (d: Date) => {
    if (d < todayStart) return;
    setSelectedDate(formatYMD(d));
  };

  const openModal = (time: string, target: string) => {
    if (bookedByTarget[target]?.includes(time)) return;
    setModalTime(time);
    setModalTarget(target);
    setError("");
    setCompany(""); setContactName(""); setPhone("");
    setPurpose(""); setNote("");
  };

  const closeModal = () => {
    setModalTime(null);
    setError("");
  };

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 11);
    let formatted = digits;
    if (digits.length > 3 && digits.length <= 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else if (digits.length > 7) {
      formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
    setPhone(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !contactName.trim() || !phone.trim() || !purpose) {
      setError("모든 필수 항목을 입력해 주세요.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const finalNote = `[대상:${modalTarget}]${note ? ` ${note}` : ""}`;
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, time: modalTime, company, contactName, phone, purpose, note: finalNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "예약 중 오류가 발생했습니다.");
        return;
      }
      setSubmitted(true);
      setModalTime(null);
      fetchReservations(selectedDate);
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = slotsLoading || availLoading;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-md">
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white transition cursor-pointer mr-1 text-xs font-semibold shrink-0"
          >
            <ChevronLeft size={13} />
            <span className="hidden sm:inline">메인</span>
          </button>
          <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
            <Calendar size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="text-white text-base"> MEGATOWN</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
            <Calendar size={11} />
            <span>방문예약</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* ====== LEFT PANEL: Calendar ====== */}
        <div className="lg:w-[340px] shrink-0 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 sm:p-5 flex flex-col gap-4">

          {submitted && (
            <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-300 text-xs font-bold">예약이 접수되었습니다</p>
                <p className="text-emerald-500 text-[11px] mt-0.5">담당자가 확인 후 연락드립니다.</p>
              </div>
              <button onClick={() => setSubmitted(false)} className="ml-auto text-emerald-600 hover:text-emerald-400 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          <div>
            <h1 className="text-white font-bold text-lg">방문 예약</h1>
            <p className="text-slate-400 text-xs mt-0.5">날짜를 선택하면 오른쪽에 예약 가능 시간이 표시됩니다</p>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={goPrevMonth}
              disabled={isPrevMonthDisabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-white font-bold text-sm">
              {viewYear}년 {String(viewMonth + 1).padStart(2, "0")}월
            </h2>
            <button
              onClick={goNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`text-center text-[11px] font-bold py-1 ${
                  i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-slate-500"
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="aspect-square" />;
              const ymd = formatYMD(cell);
              const isPast = cell < todayStart;
              const isToday = ymd === todayYMD;
              const isSelected = ymd === selectedDate;
              const weekday = cell.getDay();

              let textColor = "text-slate-300";
              if (weekday === 0) textColor = "text-rose-400";
              else if (weekday === 6) textColor = "text-sky-400";

              let cellCls = "aspect-square flex items-center justify-center rounded-lg text-xs font-semibold transition ";
              if (isPast) {
                cellCls += "text-slate-600 cursor-not-allowed ";
              } else if (isSelected) {
                cellCls += "bg-emerald-600 text-white ring-2 ring-emerald-400 cursor-pointer ";
              } else if (isToday) {
                cellCls += `${textColor} ring-2 ring-emerald-500/60 hover:bg-slate-800 cursor-pointer `;
              } else {
                cellCls += `${textColor} hover:bg-slate-800 cursor-pointer `;
              }

              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleDayClick(cell)}
                  className={cellCls}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-emerald-500/60 inline-block" />
              오늘
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-emerald-600 inline-block" />
              선택
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-emerald-950/60 border border-emerald-800/50 inline-block" />
              예약 가능
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-rose-950/60 border border-rose-800/60 inline-block" />
              예약 완료
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-slate-700 inline-block" />
              휴무
            </div>
          </div>
        </div>

        {/* ====== RIGHT PANEL: 3-column Timetable ====== */}
        <div className="flex-1 overflow-hidden bg-slate-950 flex flex-col">

          {/* Timetable sticky header */}
          <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 shrink-0">
            <div className="px-3 sm:px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-white font-bold text-sm">{formatKoreanDate(selectedDate)}</h2>
                {isLoading ? (
                  <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> 불러오는 중...
                  </p>
                ) : (
                  <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    시간 슬롯을 클릭해 예약하세요
                  </p>
                )}
              </div>
            </div>

            {/* Column headers (대표 / 이사 / 부장) */}
            <div className="px-3 sm:px-5 pb-2 flex items-center gap-2">
              {/* time axis spacer */}
              <div className="w-12 shrink-0" />
              <div className="flex-1 grid grid-cols-3 gap-1.5">
                {staffAvailability.map(staff => (
                  <div
                    key={staff.employeeId}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-black border ${
                      staff.isOff
                        ? "bg-slate-800/60 border-slate-700 text-slate-500"
                        : "bg-indigo-900/40 border-indigo-700/50 text-indigo-300"
                    }`}
                  >
                    <span>{staff.name}</span>
                    {staff.isOff && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-700 px-1 rounded">
                        {staff.scheduleType ?? "휴무"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Time slot rows */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 flex flex-col gap-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-sm">
                <Loader2 size={18} className="animate-spin" />
                <span>예약 현황 불러오는 중...</span>
              </div>
            ) : (
              TIME_SLOTS.map(t => {
                const [h] = t.split(":").map(Number);
                const isPeak = h >= 11 && h < 14;

                return (
                  <div key={t} className="flex items-center gap-2">
                    {/* Time label */}
                    <div className="w-12 shrink-0 text-right">
                      <span className="text-[11px] font-bold tabular-nums text-slate-500">{t}</span>
                    </div>

                    {/* 3 columns */}
                    <div className="flex-1 grid grid-cols-3 gap-1.5">
                      {staffAvailability.map(staff => {
                        if (staff.isOff) {
                          return (
                            <div
                              key={staff.employeeId}
                              className="flex items-center justify-center py-2 rounded-lg bg-slate-800/30 border border-slate-700/30"
                            >
                              <Ban size={11} className="text-slate-600" />
                            </div>
                          );
                        }

                        const isBooked = bookedByTarget[staff.name]?.includes(t);

                        return (
                          <button
                            key={staff.employeeId}
                            type="button"
                            disabled={isBooked}
                            onClick={() => openModal(t, staff.name)}
                            className={`py-2 rounded-lg text-[11px] font-bold border transition-all ${
                              isBooked
                                ? "bg-rose-950/40 border-rose-900/50 text-rose-600/60 cursor-not-allowed"
                                : isPeak
                                ? "bg-emerald-950/70 border-emerald-800/60 text-emerald-300 hover:bg-emerald-600 hover:border-emerald-400 hover:text-white cursor-pointer active:scale-[0.98]"
                                : "bg-emerald-950/30 border-emerald-900/40 text-emerald-500 hover:bg-emerald-600 hover:border-emerald-400 hover:text-white cursor-pointer active:scale-[0.98]"
                            }`}
                          >
                            {isBooked ? "완료" : "예약"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ====== MODAL: Reservation Info Form ====== */}
      {modalTime && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-slate-900 border-t sm:border border-slate-700 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-white font-bold text-sm sm:text-base leading-tight">예약 정보 입력</h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-emerald-400 text-xs font-semibold">{formatKoreanDate(selectedDate)}</span>
                  <span className="text-slate-600 text-xs">·</span>
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                    <Clock size={11} /> {modalTime}
                  </span>
                  <span className="text-slate-600 text-xs">·</span>
                  <span className="text-indigo-400 text-xs font-black">
                    대상: {modalTarget}
                  </span>
                </div>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto p-5 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">

                {error && (
                  <div className="flex items-center gap-2 bg-rose-900/30 border border-rose-700/50 rounded-xl px-4 py-3 text-rose-300 text-sm">
                    <AlertCircle size={15} className="shrink-0" />
                    {error}
                  </div>
                )}

                {/* 거래처명 */}
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Building2 size={11} /> 거래처명 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="(주)한국제약"
                    className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    autoFocus
                  />
                </div>

                {/* 담당자 + 연락처 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <User size={11} /> 담당자 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Phone size={11} /> 연락처 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* 방문 목적 */}
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                    방문 목적 <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PURPOSES.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPurpose(p)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          purpose === p
                            ? "bg-emerald-600 border-emerald-500 text-white"
                            : "bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 추가 요청사항 */}
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <MessageSquare size={11} /> 추가 요청사항
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="특이사항이 있으면 입력해 주세요"
                    rows={2}
                    className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>예약 접수 중...</span>
                    </>
                  ) : (
                    <>
                      <Calendar size={15} />
                      <span>예약 신청</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
