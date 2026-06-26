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
  Lock,
  LockOpen,
} from "lucide-react";
import type { AuthSession } from "../../types";

interface ReservationPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
}

// Employee IDs 1,2,3 (대표/이사/부장) can manage blocked slots
const STAFF_MANAGER_IDS = [1, 2, 3];

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

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack, authSession }) => {
  // Internal staff (대표/이사/부장 or superadmin) can block/unblock time slots
  const isInternalStaff = authSession != null && (
    authSession.role === "superadmin" ||
    authSession.role === "admin" ||
    STAFF_MANAGER_IDS.includes(authSession.employeeId ?? -1)
  );
  const now = new Date();
  const todayYMD = formatYMD(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);

  // Reservations for the selected date
  const [reservations, setReservations] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Blocked slots: staffName → array of blocked times
  const [blockedSlots, setBlockedSlots] = useState<Record<string, string[]>>({});
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null); // "staffName|time"

  // Staff availability for selected date (휴무 check — per-column)
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability[]>(
    STAFF_NAMES.map((name, i) => ({ employeeId: i + 1, name, scheduleType: null, isOff: false }))
  );
  const [availLoading, setAvailLoading] = useState(false);

  // Monthly off map: date → names of staff who are off
  const [monthlyOff, setMonthlyOff] = useState<Record<string, string[]>>({});

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

  const fetchMonthlyOff = useCallback(async (year: number, month: number) => {
    try {
      const res = await fetch(`/api/staff-monthly?year=${year}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setMonthlyOff(data ?? {});
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Fetch monthly off when month changes
  useEffect(() => {
    fetchMonthlyOff(viewYear, viewMonth + 1);
  }, [viewYear, viewMonth, fetchMonthlyOff]);

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

  const fetchBlockedSlots = useCallback(async (ymd: string) => {
    try {
      const res = await fetch(`/api/blocked-slots?date=${ymd}`);
      if (res.ok) {
        const data = await res.json();
        setBlockedSlots(data ?? {});
      }
    } catch {
      setBlockedSlots({});
    }
  }, []);

  const toggleBlockedSlot = async (staffName: string, time: string) => {
    const key = `${staffName}|${time}`;
    if (togglingSlot === key) return;
    const currentlyBlocked = blockedSlots[staffName]?.includes(time) ?? false;
    // Optimistic update
    setBlockedSlots(prev => {
      const next = { ...prev };
      if (!next[staffName]) next[staffName] = [];
      if (currentlyBlocked) {
        next[staffName] = next[staffName].filter(t => t !== time);
      } else {
        next[staffName] = [...next[staffName], time];
      }
      return next;
    });
    setTogglingSlot(key);
    try {
      await fetch("/api/blocked-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, staffName, time, blocked: !currentlyBlocked }),
      });
    } catch {
      // Revert on failure
      setBlockedSlots(prev => {
        const next = { ...prev };
        if (!next[staffName]) next[staffName] = [];
        if (currentlyBlocked) {
          if (!next[staffName].includes(time)) next[staffName] = [...next[staffName], time];
        } else {
          next[staffName] = next[staffName].filter(t => t !== time);
        }
        return next;
      });
    } finally {
      setTogglingSlot(null);
    }
  };

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
    fetchBlockedSlots(selectedDate);
  }, [selectedDate, fetchReservations, fetchStaffAvailability, fetchBlockedSlots]);

  const handleDayClick = (d: Date) => {
    if (d < todayStart) return;
    setSelectedDate(formatYMD(d));
  };

  const openModal = (time: string, target: string) => {
    if (bookedByTarget[target]?.includes(time)) return;
    if (blockedSlots[target]?.includes(time)) return;
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
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-4 sm:px-6 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-500 hover:text-gray-900 transition cursor-pointer mr-1 text-xs font-semibold shrink-0"
          >
            <ChevronLeft size={13} />
            <span className="hidden sm:inline">메인</span>
          </button>
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Calendar size={14} className="text-white" />
          </div>
          <span className="font-black tracking-tight leading-none">
            <span className="text-red-500 text-xl">OSAN</span>
            <span className="text-gray-900 text-base"> MEGATOWN</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
            <Calendar size={11} />
            <span>방문예약</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

        {/* ====== LEFT PANEL: Calendar ====== */}
        <div className="lg:w-[340px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 p-4 sm:p-5 flex flex-col gap-4">

          {submitted && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2.5">
              <CheckCircle size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-emerald-800 text-xs font-bold">예약이 접수되었습니다</p>
                <p className="text-emerald-600 text-[11px] mt-0.5">담당자가 확인 후 연락드립니다.</p>
              </div>
              <button onClick={() => setSubmitted(false)} className="ml-auto text-emerald-500 hover:text-emerald-700 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}

          <div>
            <h1 className="text-gray-900 font-bold text-lg">방문 예약</h1>
            <p className="text-gray-500 text-xs mt-0.5">날짜를 선택하면 오른쪽에 예약 가능 시간이 표시됩니다</p>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={goPrevMonth}
              disabled={isPrevMonthDisabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-gray-900 font-bold text-sm">
              {viewYear}년 {String(viewMonth + 1).padStart(2, "0")}월
            </h2>
            <button
              onClick={goNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition cursor-pointer"
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
                  i === 0 ? "text-rose-500" : i === 6 ? "text-sky-600" : "text-gray-400"
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

              // 휴무 정보
              const offStaff = monthlyOff[ymd] ?? [];
              const isFullyOff = offStaff.length === 3; // 3명 모두 휴무
              const isPartialOff = offStaff.length > 0 && !isFullyOff;

              let textColor = "text-gray-700";
              if (weekday === 0) textColor = "text-rose-500";
              else if (weekday === 6) textColor = "text-sky-600";

              const isDisabled = isPast || isFullyOff;

              let cellCls = "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-semibold transition relative ";
              if (isDisabled) {
                cellCls += isFullyOff
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed "
                  : "text-gray-300 cursor-not-allowed ";
              } else if (isSelected) {
                cellCls += "bg-emerald-600 text-white ring-2 ring-emerald-400 cursor-pointer ";
              } else if (isToday) {
                cellCls += `${textColor} ring-2 ring-emerald-500 hover:bg-gray-100 cursor-pointer `;
              } else {
                cellCls += `${textColor} hover:bg-gray-100 cursor-pointer `;
              }

              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && handleDayClick(cell)}
                  className={cellCls}
                  title={isFullyOff ? `${ymd} — 전원 휴무 (예약 불가)` : isPartialOff ? `휴무: ${offStaff.join(", ")}` : undefined}
                >
                  {cell.getDate()}
                  {isFullyOff && (
                    <span className="text-[7px] font-bold text-gray-400 leading-none mt-0.5">휴무</span>
                  )}
                  {isPartialOff && !isSelected && !isDisabled && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-px">
                      {offStaff.map((_, i) => (
                        <span key={i} className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-200 text-[11px] text-gray-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-emerald-500 inline-block" />
              오늘
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-emerald-600 inline-block" />
              선택
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-gray-100 inline-block" />
              전원 휴무
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-white border border-gray-200 flex items-end justify-center pb-0.5 inline-flex">
                <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
              </span>
              일부 휴무
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-md bg-gray-200 border border-gray-300 inline-block" />
              예약불가
            </div>
          </div>
        </div>

        {/* ====== RIGHT PANEL: 3-column Timetable ====== */}
        <div className="flex-1 overflow-hidden bg-gray-50 flex flex-col">

          {/* Timetable sticky header */}
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 shrink-0">
            <div className="px-3 sm:px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 font-bold text-sm">{formatKoreanDate(selectedDate)}</h2>
                {isLoading ? (
                  <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> 불러오는 중...
                  </p>
                ) : (
                  <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    {isInternalStaff ? "슬롯을 클릭해 예약불가 시간 지정/해제" : "시간 슬롯을 클릭해 예약하세요"}
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
                        ? "bg-gray-100 border-gray-200 text-gray-400"
                        : "bg-indigo-50 border-indigo-200 text-indigo-700"
                    }`}
                  >
                    <span>{staff.name}</span>
                    {staff.isOff && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-200 px-1 rounded">
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
              <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
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
                      <span className="text-[11px] font-bold tabular-nums text-gray-400">{t}</span>
                    </div>

                    {/* 3 columns */}
                    <div className="flex-1 grid grid-cols-3 gap-1.5">
                      {staffAvailability.map(staff => {
                        if (staff.isOff) {
                          return (
                            <div
                              key={staff.employeeId}
                              className="flex items-center justify-center py-2 rounded-lg bg-gray-100 border border-gray-200"
                            >
                              <Ban size={11} className="text-gray-300" />
                            </div>
                          );
                        }

                        const isBooked = bookedByTarget[staff.name]?.includes(t);
                        const isBlocked = blockedSlots[staff.name]?.includes(t) ?? false;
                        const slotKey = `${staff.name}|${t}`;
                        const isToggling = togglingSlot === slotKey;

                        if (isInternalStaff) {
                          // Internal staff: toggle block/unblock; booked slots shown but not togglable
                          if (isBooked) {
                            return (
                              <div
                                key={staff.employeeId}
                                className="py-2 rounded-lg text-[11px] font-bold border bg-rose-50 border-rose-200 text-rose-400 text-center"
                              >
                                완료
                              </div>
                            );
                          }
                          return (
                            <button
                              key={staff.employeeId}
                              type="button"
                              disabled={isToggling}
                              onClick={() => toggleBlockedSlot(staff.name, t)}
                              className={`py-2 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-[0.98] ${
                                isBlocked
                                  ? "bg-gray-200 border-gray-300 text-gray-500 hover:bg-gray-100"
                                  : isPeak
                                  ? "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-gray-200 hover:border-gray-300 hover:text-gray-500"
                                  : "bg-white border-emerald-200 text-emerald-600 hover:bg-gray-200 hover:border-gray-300 hover:text-gray-500"
                              }`}
                              title={isBlocked ? "클릭하여 예약불가 해제" : "클릭하여 예약불가 지정"}
                            >
                              {isToggling ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : isBlocked ? (
                                <><LockOpen size={10} /><span>불가</span></>
                              ) : (
                                <><Lock size={10} className="opacity-30" /><span>가능</span></>
                              )}
                            </button>
                          );
                        }

                        // External user view
                        return (
                          <button
                            key={staff.employeeId}
                            type="button"
                            disabled={isBooked || isBlocked}
                            onClick={() => openModal(t, staff.name)}
                            className={`py-2 rounded-lg text-[11px] font-bold border transition-all ${
                              isBooked
                                ? "bg-rose-50 border-rose-200 text-rose-400 cursor-not-allowed"
                                : isBlocked
                                ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                                : isPeak
                                ? "bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer active:scale-[0.98]"
                                : "bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer active:scale-[0.98]"
                            }`}
                          >
                            {isBooked ? "완료" : isBlocked ? "불가" : "예약"}
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closeModal}
        >
          <div
            className="bg-white border-t sm:border border-gray-200 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-gray-900 font-bold text-sm sm:text-base leading-tight">예약 정보 입력</h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-emerald-700 text-xs font-semibold">{formatKoreanDate(selectedDate)}</span>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-emerald-700 text-xs font-bold flex items-center gap-1">
                    <Clock size={11} /> {modalTime}
                  </span>
                  <span className="text-gray-300 text-xs">·</span>
                  <span className="text-indigo-600 text-xs font-black">
                    대상: {modalTarget}
                  </span>
                </div>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition cursor-pointer">
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto p-5 flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">

                {error && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-rose-700 text-sm">
                    <AlertCircle size={15} className="shrink-0" />
                    {error}
                  </div>
                )}

                {/* 거래처명 */}
                <div>
                  <label className="block text-gray-600 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Building2 size={11} /> 거래처명 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={e => setCompany(e.target.value)}
                    placeholder="(주)한국제약"
                    className="w-full bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition"
                    autoFocus
                  />
                </div>

                {/* 담당자 + 연락처 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-600 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <User size={11} /> 담당자 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Phone size={11} /> 연락처 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => handlePhoneChange(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition"
                    />
                  </div>
                </div>

                {/* 방문 목적 */}
                <div>
                  <label className="block text-gray-600 text-xs font-bold uppercase tracking-wider mb-1.5">
                    방문 목적 <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PURPOSES.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPurpose(p)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          purpose === p
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 추가 요청사항 */}
                <div>
                  <label className="block text-gray-600 text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <MessageSquare size={11} /> 추가 요청사항
                  </label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="특이사항이 있으면 입력해 주세요"
                    rows={2}
                    className="w-full bg-white border border-gray-300 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
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
