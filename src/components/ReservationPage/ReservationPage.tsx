// src/components/ReservationPage.tsx
// 2026-09-18 · vendor 예약 버그 fix · UI 개선
import React, { useState, useCallback, useEffect } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { useToast, toastClass } from "../../hooks/useToast";
import { useApiCall } from "../../hooks/useApiCall";
import { useVendors } from "../../hooks/useVendors";
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
  Ban,
  Lock,
  LockOpen,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import type { AuthSession } from "../../types";
import { AppNavHeader } from "../layout/AppNavHeader";
import { Modal } from "../common/Modal";
// 2026-09-21 · #329 · 한글 IME 우선
import { KO_INPUT_PROPS } from "../../lib/koreanInput";

interface ReservationPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
}

interface StaffAvailability {
  employeeId: number;
  name: string;              // "대표" / "이사"
  displayName?: string;      // 실제 직원 이름 (강남성 · 강남규)
  scheduleType: string | null;
  isOff: boolean;
}

// 2026-08-26 · 사용자 지시 · 1시간 텀
const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
  "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
];

const PURPOSES = ["결제", "신약 상담", "발주 확인", "제품 상담", "재고 점검", "기타"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 2026-08-23 · #194 · 대표/이사만 · 부장 제거
const STAFF_NAMES = ["대표", "이사"];

// 기본 staffAvailability — API 응답이 빈 배열이어도 컬럼을 유지하기 위한 fallback
const DEFAULT_STAFF_AVAIL: StaffAvailability[] = STAFF_NAMES.map((name, i) => ({
  employeeId: i + 1,
  name,
  scheduleType: null,
  isOff: false,
}));

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
  // 2026-08-23 · #194 · 부장 → 이사 fallback (기존 [대상:부장] 예약 데이터 마이그레이션)
  const match = noteStr.match(/^\[대상:(대표|이사|부장)\]/);
  if (!match) return "대표";
  return match[1] === "부장" ? "이사" : match[1];
};

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack, authSession }) => {
  const { toast } = useToast();
  const isVendor = authSession?.role === "vendor";
  // Internal staff (level >= 2) can block/unblock time slots
  const isInternalStaff = !isVendor && (authSession?.level ?? 0) >= 2;
  const now = new Date();
  const todayYMD = formatYMD(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);

  const [reservations, setReservations] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [blockedSlots, setBlockedSlots] = useState<Record<string, string[]>>({});
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

  // 2026-09-18 · fallback: API 빈 배열 반환 시에도 DEFAULT_STAFF_AVAIL 유지
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability[]>(DEFAULT_STAFF_AVAIL);
  const [availLoading, setAvailLoading] = useState(false);

  const [monthlyOff, setMonthlyOff] = useState<Record<string, string[]>>({});

  const [modalTime, setModalTime] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<string>("대표");
  const [submitted, setSubmitted] = useState(false);

  const [company, setCompany] = useState(() => isVendor ? (authSession?.employeeName ?? "") : "");
  const [contactName, setContactName] = useState(() => isVendor ? (authSession?.employeeRank ?? "") : "");
  const [phone, setPhone] = useState("");
  // 2026-09-18 · 사용자 지시 · vendor 로그인 · 3필드 (거래처·담당자·연락처) DB 조회 · 자동 채움 · 입력 X
  const { vendors: vendorList } = useVendors();
  useEffect(() => {
    if (!isVendor || !authSession?.employeeId || !vendorList?.length) return;
    const me = vendorList.find(v => Number(v.id) === Number(authSession.employeeId));
    if (!me) return;
    setCompany(String(me.company_name ?? ""));
    setContactName(String(me.contact_name ?? authSession?.employeeRank ?? ""));
    if (me.phone) setPhone(String(me.phone));
  }, [isVendor, authSession?.employeeId, authSession?.employeeRank, vendorList]);
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const { call: submitCall, loading: submitting } = useApiCall({
    successMsg: "예약이 접수되었습니다",
    errorPrefix: "예약 실패",
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
      setError(msg);
    },
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (isVendor) {
      setCompany(authSession?.employeeName ?? "");
      setContactName(authSession?.employeeRank ?? "");
    }
  }, [isVendor, authSession?.employeeName, authSession?.employeeRank]);

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
      const { data } = await api.get<any>(`/api/staff-monthly?year=${year}&month=${month}`);
      setMonthlyOff(data ?? {});
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchMonthlyOff(viewYear, viewMonth + 1);
  }, [viewYear, viewMonth, fetchMonthlyOff]);

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
      const { data } = await api.get<any[]>(`/api/reservations?date=${ymd}`);
      setReservations(Array.isArray(data) ? data : []);
    } catch { setReservations([]); }
    finally { setSlotsLoading(false); }
  }, []);

  const fetchBlockedSlots = useCallback(async (ymd: string) => {
    try {
      const { data } = await api.get<any>(`/api/blocked-slots?date=${ymd}`);
      setBlockedSlots(data ?? {});
    } catch { setBlockedSlots({}); }
  }, []);

  const toggleBlockedSlot = async (staffName: string, time: string) => {
    const key = `${staffName}|${time}`;
    if (togglingSlot === key) return;
    const currentlyBlocked = blockedSlots[staffName]?.includes(time) ?? false;
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
      await api.post("/api/blocked-slots", { date: selectedDate, staffName, time, blocked: !currentlyBlocked });
    } catch {
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
      const { data } = await api.get<any[]>(`/api/staff-availability?date=${ymd}`);
      // 2026-09-18 · 빈 배열 or 비정상 응답 시 DEFAULT_STAFF_AVAIL fallback
      if (Array.isArray(data) && data.length > 0) {
        setStaffAvailability(data);
      } else {
        setStaffAvailability(DEFAULT_STAFF_AVAIL);
      }
    } catch {
      // API 실패 시에도 기본값 유지 (대표/이사 컬럼 항상 표시)
      setStaffAvailability(DEFAULT_STAFF_AVAIL);
    }
    finally { setAvailLoading(false); }
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
    setCompany(isVendor ? (authSession?.employeeName ?? "") : "");
    setContactName(isVendor ? (authSession?.employeeRank ?? "") : "");
    setPhone("");
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
    const finalNote = `[대상:${modalTarget}]${note ? ` ${note}` : ""}`;
    const result = await submitCall(() => api.post("/api/reservations", {
      date: selectedDate, time: modalTime, company, contactName, phone, purpose, note: finalNote,
      ...(isVendor && authSession?.employeeId ? { vendorId: authSession.employeeId } : {}),
    }));
    if (result) {
      setSubmitted(true);
      setModalTime(null);
      fetchReservations(selectedDate);
    }
  };

  const isLoading = slotsLoading || availLoading;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}

      <AppNavHeader activePage="landing" authSession={authSession ?? null} onBack={onBack} />

      <div className={`flex-1 flex flex-col lg:flex-row gap-0 lg:overflow-hidden ${PAGE_CONTAINER_CLS}`}>

        {/* ====== LEFT PANEL: Calendar ====== */}
        <div className="lg:w-[320px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 p-5 flex flex-col gap-5">

          {submitted && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-emerald-800 text-sm font-semibold">예약이 접수되었습니다</p>
                <p className="text-emerald-600 text-xs mt-0.5">담당자가 확인 후 연락드립니다.</p>
              </div>
              <button onClick={() => setSubmitted(false)} className="text-emerald-400 hover:text-emerald-700 cursor-pointer shrink-0">
                <X size={14} />
              </button>
            </div>
          )}

          <div>
            <h1 className="text-gray-900 font-bold text-base">방문 예약</h1>
            <p className="text-gray-500 text-xs mt-1">날짜를 선택하면 예약 가능 시간이 표시됩니다</p>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={goPrevMonth}
              disabled={isPrevMonthDisabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-gray-900 font-bold text-sm tabular-nums">
              {viewYear}년 {String(viewMonth + 1).padStart(2, "0")}월
            </span>
            <button
              onClick={goNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`text-center text-xs font-semibold py-1.5 ${
                  i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {monthCells.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="aspect-square" />;
              const ymd = formatYMD(cell);
              const isPast = cell < todayStart;
              const isToday = ymd === todayYMD;
              const isSelected = ymd === selectedDate;
              const weekday = cell.getDay();

              const offStaff = monthlyOff[ymd] ?? [];
              const isFullyOff = offStaff.length >= 2;
              const isPartialOff = offStaff.length > 0 && !isFullyOff;
              const isDisabled = isPast || isFullyOff;

              let textColor = "text-gray-700";
              if (weekday === 0) textColor = "text-rose-500";
              else if (weekday === 6) textColor = "text-blue-500";

              let cellCls = "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-semibold transition relative ";
              if (isDisabled) {
                cellCls += isFullyOff
                  ? "bg-gray-100 text-gray-300 cursor-not-allowed "
                  : "text-gray-300 cursor-not-allowed ";
              } else if (isSelected) {
                cellCls += "bg-emerald-600 text-white shadow-sm cursor-pointer ";
              } else if (isToday) {
                cellCls += `${textColor} ring-2 ring-emerald-400 hover:bg-gray-50 cursor-pointer `;
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
                    <span className="text-[8px] font-semibold text-gray-400 leading-none mt-0.5">휴무</span>
                  )}
                  {isPartialOff && !isSelected && !isDisabled && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-sm bg-amber-400 inline-block" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 border-t border-gray-100 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm ring-2 ring-emerald-400 inline-block" />
              오늘
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
              선택
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-100 inline-block" />
              전원 휴무
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" />
              예약불가
            </span>
          </div>
        </div>

        {/* ====== RIGHT PANEL: Timetable ====== */}
        <div className="flex-1 lg:overflow-hidden bg-gray-50 flex flex-col">

          {/* Timetable sticky header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shrink-0">
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-gray-900 font-bold text-sm">{formatKoreanDate(selectedDate)}</h2>
                {isLoading ? (
                  <div className="mt-0.5">
                    <Spinner size={11} tone="zinc" label="불러오는 중..." labelSize={12} />
                  </div>
                ) : (
                  <p className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                    <Clock size={10} />
                    {isInternalStaff ? "슬롯을 클릭해 예약불가 시간 지정/해제" : "시간 슬롯을 클릭해 예약하세요"}
                  </p>
                )}
              </div>
            </div>

            {/* Column headers */}
            <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-3">
              <div className="w-14 shrink-0" />
              <div className="flex-1 grid grid-cols-2 gap-2">
                {staffAvailability.map(staff => (
                  <div
                    key={staff.employeeId}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold border ${
                      staff.isOff
                        ? "bg-gray-50 border-gray-200 text-gray-400"
                        : "bg-indigo-50 border-indigo-200 text-indigo-700"
                    }`}
                  >
                    <span className="font-bold">{staff.name}</span>
                    {/* 2026-09-18 · 사용자 지시 · displayName = name 중복 방지 · 실제 이름만 노출 */}
                    {staff.displayName && staff.displayName !== staff.name && (
                      <span className={`text-xs font-medium ${staff.isOff ? "text-gray-400" : "text-indigo-500"}`}>
                        {staff.displayName}
                      </span>
                    )}
                    {staff.isOff && (
                      <span className="text-[11px] font-semibold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                        {staff.scheduleType ?? "휴무"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Time slot rows */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 flex flex-col gap-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size={18} tone="zinc" label="예약 현황 불러오는 중..." labelSize={14} />
              </div>
            ) : (
              TIME_SLOTS.map(t => {
                const [h] = t.split(":").map(Number);
                const isPeak = h >= 11 && h < 14;

                return (
                  <div key={t} className="flex items-center gap-3">
                    {/* Time label */}
                    <div className="w-14 shrink-0 text-right">
                      <span className={`text-xs font-semibold tabular-nums ${isPeak ? "text-gray-600" : "text-gray-400"}`}>
                        {t}
                      </span>
                    </div>

                    {/* 2 columns */}
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      {staffAvailability.map(staff => {
                        if (staff.isOff) {
                          return (
                            <div
                              key={staff.employeeId}
                              className="flex items-center justify-center py-2.5 rounded-lg bg-gray-50 border border-gray-200"
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
                          if (isBooked) {
                            return (
                              <div
                                key={staff.employeeId}
                                className="py-2.5 rounded-lg text-xs font-semibold border bg-rose-50 border-rose-200 text-rose-500 text-center"
                              >
                                예약됨
                              </div>
                            );
                          }
                          return (
                            <button
                              key={staff.employeeId}
                              type="button"
                              disabled={isToggling}
                              onClick={() => toggleBlockedSlot(staff.name, t)}
                              className={`py-2.5 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                isBlocked
                                  ? "bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-50"
                                  : isPeak
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-500"
                                  : "bg-white border-gray-200 text-emerald-600 hover:bg-gray-100 hover:border-gray-300 hover:text-gray-500"
                              }`}
                              title={isBlocked ? "클릭하여 예약불가 해제" : "클릭하여 예약불가 지정"}
                            >
                              {isToggling ? (
                                <Spinner size={10} />
                              ) : isBlocked ? (
                                <><LockOpen size={10} /><span>불가</span></>
                              ) : (
                                <><Lock size={10} className="opacity-30" /><span>가능</span></>
                              )}
                            </button>
                          );
                        }

                        // Vendor / external user view
                        return (
                          <button
                            key={staff.employeeId}
                            type="button"
                            disabled={isBooked || isBlocked}
                            onClick={() => openModal(t, staff.name)}
                            className={`py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                              isBooked
                                ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                                : isBlocked
                                ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                                : isPeak
                                ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer"
                                : "bg-white border-gray-200 text-emerald-600 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer"
                            }`}
                          >
                            {isBooked ? "예약됨" : isBlocked ? "불가" : "예약"}
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
      <Modal
        open={!!modalTime}
        onClose={closeModal}
        align="bottom-mobile"
        size="lg-narrow"
        bodyPadding="none"
        showClose={false}
      >
        <div className="flex flex-col h-full">
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h3 className="text-gray-900 font-bold text-sm leading-tight">예약 정보 입력</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-emerald-700 text-xs font-semibold tabular-nums">{formatKoreanDate(selectedDate)}</span>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-emerald-700 text-xs font-bold tabular-nums flex items-center gap-1">
                  <Clock size={10} /> {modalTime}
                </span>
                <span className="text-gray-300 text-xs">·</span>
                <span className="text-indigo-600 text-xs font-bold">
                  대상: {modalTarget}
                </span>
              </div>
            </div>
            <button onClick={closeModal} className="text-gray-400 hover:text-gray-700 transition cursor-pointer shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Modal body */}
          <div className="overflow-y-auto p-5 flex-1 min-h-0">
            <form onSubmit={handleSubmit} className="space-y-4">

              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-50 border border-rose-200">
                  <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-rose-700 text-sm leading-snug">{error}</p>
                </div>
              )}

              {/* 거래처명 */}
              <div>
                <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Building2 size={11} /> 거래처명 <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  type="text" {...KO_INPUT_PROPS}
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="(주)한국제약"
                  readOnly={isVendor}
                  className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                  autoFocus={!isVendor}
                />
              </div>

              {/* 담당자 + 연락처 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <User size={11} /> 담당자 <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    type="text" {...KO_INPUT_PROPS}
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="홍길동"
                    readOnly={isVendor}
                    className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Phone size={11} /> 연락처 <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <input
                    lang="ko" type="tel"
                    value={phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    placeholder="010-0000-0000"
                    readOnly={isVendor}
                    className={`w-full border rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition ${isVendor ? "bg-gray-50 border-gray-200 cursor-not-allowed" : "bg-white border-gray-300 focus:border-indigo-400"}`}
                  />
                </div>
              </div>

              {/* 방문 목적 */}
              <div>
                <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
                  방문 목적 <span className="text-rose-500 font-bold">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {PURPOSES.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPurpose(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
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
                <label className="block text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MessageSquare size={11} /> 추가 요청사항
                </label>
                <textarea {...KO_INPUT_PROPS} value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="특이사항이 있으면 입력해 주세요"
                  rows={2}
                  className="w-full bg-white border border-gray-300 focus:border-indigo-400 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none transition resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Spinner size={14} />
                    <span>예약 접수 중...</span>
                  </>
                ) : (
                  <>
                    <Calendar size={14} />
                    <span>예약 신청</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
};
