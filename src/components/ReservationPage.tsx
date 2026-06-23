// src/components/ReservationPage.tsx
import React, { useState } from "react";
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
} from "lucide-react";

interface ReservationPageProps {
  onBack: () => void;
}

const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "13:00", "13:30", "14:00", "14:30", "15:00",
  "15:30", "16:00", "16:30", "17:00", "17:30", "18:00",
  "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

const PURPOSES = [
  "약사 상담", "건강기능식품 상담", "처방전 문의", "대량구매 상담", "기타",
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** Format a Date as "YYYY-MM-DD" using local time (not UTC) */
const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Pretty Korean date string: "2026년 6월 23일 (화)" */
const formatKoreanDate = (ymd: string): string => {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[dateObj.getDay()]})`;
};

/** Build calendar grid (always 6 rows × 7 cols) starting on Sunday */
const buildMonthGrid = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);
  return cells;
};

type Step = "calendar" | "time" | "info";

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack }) => {
  // Reservation state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");

  // Flow state
  const [step, setStep] = useState<Step>("calendar");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Calendar view state
  const now = new Date();
  const todayYMD = formatYMD(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const monthCells = buildMonthGrid(viewYear, viewMonth);

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

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const isPrevMonthDisabled = (() => {
    // disable if showing current month
    return viewYear === now.getFullYear() && viewMonth === now.getMonth();
  })();

  const handleDayClick = (d: Date) => {
    if (d < todayStart) return;
    setDate(formatYMD(d));
    setTime("");
    setStep("time");
  };

  const handleTimeSelect = (t: string) => {
    setTime(t);
    setStep("info");
  };

  const closeModal = () => {
    setStep("calendar");
  };

  const backToTimeSelection = () => {
    setStep("time");
  };

  const resetAll = () => {
    setSubmitted(false);
    setName("");
    setPhone("");
    setDate("");
    setTime("");
    setPurpose("");
    setNote("");
    setError("");
    setStep("calendar");
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date || !time || !purpose) {
      setError("모든 필수 항목을 입력해 주세요.");
      return;
    }
    setError("");
    setSubmitting(true);
    // Simulate API call (replace with real endpoint when ready)
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    setSubmitted(true);
    setStep("calendar");
  };

  const modalOpen = step === "time" || step === "info";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 h-14 flex items-center px-4 sm:px-6 gap-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm font-medium cursor-pointer"
        >
          <ChevronLeft size={16} />
          <span>홈으로</span>
        </button>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Calendar size={13} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">방문예약</span>
        </div>
        <div className="ml-auto">
          <span className="font-black tracking-tight">
            <span className="text-red-500 text-base">OSAN</span>
            <span className="text-slate-400 text-sm"> MEGATOWN</span>
          </span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">

          {submitted ? (
            /* Success state */
            <div className="bg-slate-900 border border-emerald-700/50 rounded-2xl p-8 text-center mt-8">
              <div className="w-14 h-14 rounded-full bg-emerald-600/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-white font-bold text-xl mb-2">예약이 접수되었습니다</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-1">
                <span className="text-white font-semibold">{name}</span>님, {formatKoreanDate(date)} {time}
              </p>
              <p className="text-slate-400 text-sm mb-1">목적: <span className="text-white">{purpose}</span></p>
              <p className="text-slate-500 text-xs mt-4 leading-relaxed">
                담당자가 확인 후 연락드립니다.<br />문의: 오산 메가타운 약국
              </p>
              <button
                onClick={resetAll}
                className="mt-6 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl transition cursor-pointer"
              >
                새 예약하기
              </button>
            </div>
          ) : (
            /* Calendar view */
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 mt-4">
              <div className="mb-4">
                <h1 className="text-white font-bold text-xl">방문 예약</h1>
                <p className="text-slate-400 text-sm mt-1">날짜를 선택해 주세요</p>
              </div>

              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={goPrevMonth}
                  disabled={isPrevMonthDisabled}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  aria-label="이전 달"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="text-white font-bold text-base sm:text-lg">
                  {viewYear}년 {String(viewMonth + 1).padStart(2, "0")}월
                </h2>
                <button
                  onClick={goNextMonth}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                  aria-label="다음 달"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Weekday header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {WEEKDAYS.map((wd, i) => (
                  <div
                    key={wd}
                    className={`text-center text-xs font-bold py-2 ${
                      i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-slate-400"
                    }`}
                  >
                    {wd}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((cell, idx) => {
                  if (!cell) {
                    return <div key={`empty-${idx}`} className="aspect-square" />;
                  }
                  const ymd = formatYMD(cell);
                  const isPast = cell < todayStart;
                  const isToday = ymd === todayYMD;
                  const isSelected = ymd === date;
                  const weekday = cell.getDay();

                  let textColor = "text-slate-200";
                  if (weekday === 0) textColor = "text-rose-400";
                  else if (weekday === 6) textColor = "text-sky-400";

                  let cellClasses =
                    "aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition relative ";

                  if (isPast) {
                    cellClasses += "text-slate-600 cursor-not-allowed ";
                  } else if (isSelected) {
                    cellClasses += "bg-emerald-600 text-white ring-2 ring-emerald-400 cursor-pointer ";
                  } else if (isToday) {
                    cellClasses += `${textColor} ring-2 ring-emerald-500/60 hover:bg-slate-800 cursor-pointer `;
                  } else {
                    cellClasses += `${textColor} hover:bg-slate-800 cursor-pointer `;
                  }

                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={isPast}
                      onClick={() => handleDayClick(cell)}
                      className={cellClasses}
                    >
                      {cell.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full ring-2 ring-emerald-500/60 inline-block" />
                  <span>오늘</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-emerald-600 inline-block" />
                  <span>선택</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-700 inline-block" />
                  <span>예약 불가</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Time / Info Modal */}
      {modalOpen && !submitted && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-slate-900 border-t sm:border border-slate-700 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                {step === "info" && (
                  <button
                    onClick={backToTimeSelection}
                    className="text-slate-400 hover:text-white transition cursor-pointer"
                    aria-label="시간 선택으로"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                <h3 className="text-white font-bold text-base">
                  {step === "time" ? (
                    <>
                      <span className="text-emerald-400">{formatKoreanDate(date)}</span>
                      <span className="text-slate-300"> 예약 가능 시간</span>
                    </>
                  ) : (
                    "예약 정보 입력"
                  )}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white transition cursor-pointer"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto p-5">
              {step === "time" ? (
                <>
                  <p className="text-slate-400 text-xs mb-4 flex items-center gap-1.5">
                    <Clock size={12} />
                    원하시는 시간을 선택해 주세요
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {TIME_SLOTS.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleTimeSelect(t)}
                        className={`py-2.5 rounded-xl text-sm font-semibold border transition cursor-pointer ${
                          time === t
                            ? "bg-emerald-600 border-emerald-500 text-white"
                            : "bg-slate-800 border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-white"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={closeModal}
                    className="w-full mt-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-bold rounded-xl border border-slate-700 transition cursor-pointer"
                  >
                    닫기
                  </button>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Selected date+time banner */}
                  <div className="bg-slate-800/60 border border-emerald-700/40 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                      <Calendar size={16} className="text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-white text-sm font-bold truncate">{formatKoreanDate(date)}</div>
                      <div className="text-emerald-400 text-xs font-semibold flex items-center gap-1 mt-0.5">
                        <Clock size={11} /> {time}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 bg-rose-900/30 border border-rose-700/50 rounded-xl px-4 py-3 text-rose-300 text-sm">
                      <AlertCircle size={15} className="shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <User size={11} /> 성함 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition"
                    />
                  </div>

                  {/* Phone */}
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

                  {/* Purpose */}
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

                  {/* Note */}
                  <div>
                    <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <MessageSquare size={11} /> 추가 요청사항
                    </label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="특이사항이 있으면 입력해 주세요"
                      rows={3}
                      className="w-full bg-slate-800 border border-slate-600 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none transition resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
