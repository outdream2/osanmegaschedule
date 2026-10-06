// src/components/ReservationPage.tsx
// 2026-09-18 · vendor 예약 버그 fix · UI 개선
// 2026-10-06 · #VisitorReservationEmployeeAssignment · Phase 7
//   · 하드코드 "대표/이사" 제거 · settings.visitorReservation.assigneeEmployeeIds 기반
//   · [대상:xxx] note parse/write 완전 제거
//   · TIME_SLOTS 하드코드 제거 · 서버 /api/reservations/availability 가 canonical
//   · 담당자 0명 · 1명 · 2명+ UX 분기
import React, { useState, useCallback, useEffect, useMemo } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import { useToast, toastClass } from "../../hooks/useToast";
import { useApiCall } from "../../hooks/useApiCall";
import { useVendors } from "../../hooks/useVendors";
import { useSettings } from "../../hooks/useSettings";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Ban,
  Lock,
  LockOpen,
  UserCheck,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import type { AuthSession } from "../../types";
import { AppNavHeader } from "../layout/AppNavHeader";
// 2026-10-06 · 사용자 지시 · breadcrumb 통일 · 네비게이션 SSOT · activeNav 정착
import { useSetActiveByPage } from "../../contexts/ActiveNavContext";
// 2026-10-06 · 모달 분리 (framework audit · 800라인 방지)
import { ReservationFormModal } from "./ReservationFormModal";

interface ReservationPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
}

interface StaffAvailability {
  employeeId: number;
  name: string;                    // 실제 직원 이름 (강남성 · 강남규)
  rank?: string | null;            // 직급 (대표/부장 등) · 노출 참고용
  displayName?: string;            // 호환용 (= name)
  scheduleType: string | null;
  workingHours?: string | null;
  isOff: boolean;
}

interface AvailabilitySlot { start: string; end: string }
interface AvailabilityResponse {
  employeeId: number;
  date: string;
  scheduleType: string | null;
  slotMinutes?: number;
  bufferMinutes?: number;
  workingRange?: { start: string; end: string } | null;
  slots: AvailabilitySlot[];
}

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

export const ReservationPage: React.FC<ReservationPageProps> = ({ onBack, authSession }) => {
  const { toast } = useToast();
  const { visitorReservation } = useSettings();
  const isVendor = authSession?.role === "vendor";
  // 2026-10-06 · 사용자 지시 · breadcrumb 통일 · 페이지 mount 시 activeNav 정착
  const setActiveByPage = useSetActiveByPage();
  useEffect(() => {
    setActiveByPage("reservation");
  }, [setActiveByPage]);
  // Internal staff (level >= 2) can block/unblock time slots
  const isInternalStaff = !isVendor && (authSession?.level ?? 0) >= 2;
  const now = new Date();
  const todayYMD = formatYMD(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);

  // 2026-10-06 · 담당자별 availability slot
  const [staffAvailability, setStaffAvailability] = useState<StaffAvailability[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [slotsByEmp, setSlotsByEmp] = useState<Record<number, AvailabilitySlot[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [blockedSlots, setBlockedSlots] = useState<Record<string, string[]>>({});
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);

  const [monthlyOff, setMonthlyOff] = useState<Record<string, string[]>>({});

  const [modalTime, setModalTime] = useState<string | null>(null);
  const [modalEmployeeId, setModalEmployeeId] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [company, setCompany] = useState(() => isVendor ? (authSession?.employeeName ?? "") : "");
  const [contactName, setContactName] = useState(() => isVendor ? (authSession?.employeeRank ?? "") : "");
  const [phone, setPhone] = useState("");

  // 2026-09-18 · vendor 로그인 · 3필드 (거래처·담당자·연락처) DB 조회 · 자동 채움
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

  const fetchStaffAvailability = useCallback(async (ymd: string) => {
    setAvailLoading(true);
    try {
      const { data } = await api.get<StaffAvailability[]>(`/api/staff-availability?date=${ymd}`);
      setStaffAvailability(Array.isArray(data) ? data : []);
    } catch {
      setStaffAvailability([]);
    } finally {
      setAvailLoading(false);
    }
  }, []);

  const fetchAvailabilityForEmployee = useCallback(async (ymd: string, empId: number) => {
    try {
      const { data } = await api.get<AvailabilityResponse>(`/api/reservations/availability?date=${ymd}&employeeId=${empId}`);
      return data?.slots ?? [];
    } catch {
      return [];
    }
  }, []);

  const fetchAllSlots = useCallback(async (ymd: string, staff: StaffAvailability[]) => {
    if (staff.length === 0) {
      setSlotsByEmp({});
      return;
    }
    setSlotsLoading(true);
    try {
      const entries: Array<[number, AvailabilitySlot[]]> = await Promise.all(
        staff.map(async (s): Promise<[number, AvailabilitySlot[]]> => {
          if (s.isOff) return [s.employeeId, []];
          const slots = await fetchAvailabilityForEmployee(ymd, s.employeeId);
          return [s.employeeId, slots];
        }),
      );
      const next: Record<number, AvailabilitySlot[]> = {};
      for (const [id, slots] of entries) next[id] = slots;
      setSlotsByEmp(next);
    } finally {
      setSlotsLoading(false);
    }
  }, [fetchAvailabilityForEmployee]);

  const fetchBlockedSlots = useCallback(async (ymd: string) => {
    try {
      const { data } = await api.get<any>(`/api/blocked-slots?date=${ymd}`);
      setBlockedSlots(data ?? {});
    } catch { setBlockedSlots({}); }
  }, []);

  useEffect(() => {
    fetchStaffAvailability(selectedDate);
    fetchBlockedSlots(selectedDate);
  }, [selectedDate, fetchStaffAvailability, fetchBlockedSlots]);

  // staffAvailability 변경 시 · 각 담당자 slot 조회
  useEffect(() => {
    if (staffAvailability.length > 0) {
      fetchAllSlots(selectedDate, staffAvailability);
    } else {
      setSlotsByEmp({});
    }
  }, [staffAvailability, selectedDate, fetchAllSlots]);

  // 담당자 1명 자동 선택 (예약 UX 간소화)
  useEffect(() => {
    const active = staffAvailability.filter(s => !s.isOff);
    if (active.length === 1 && selectedEmployeeId !== active[0].employeeId) {
      setSelectedEmployeeId(active[0].employeeId);
    } else if (active.length === 0) {
      setSelectedEmployeeId(null);
    } else if (selectedEmployeeId && !active.find(s => s.employeeId === selectedEmployeeId)) {
      // 선택된 담당자가 OFF 로 바뀌었거나 사라졌을 때
      setSelectedEmployeeId(null);
    }
  }, [staffAvailability, selectedEmployeeId]);

  const handleDayClick = (d: Date) => {
    if (d < todayStart) return;
    setSelectedDate(formatYMD(d));
  };

  const toggleBlockedSlot = async (empKey: string, time: string) => {
    const key = `${empKey}|${time}`;
    if (togglingSlot === key) return;
    const currentlyBlocked = blockedSlots[empKey]?.includes(time) ?? false;
    setBlockedSlots(prev => {
      const next = { ...prev };
      if (!next[empKey]) next[empKey] = [];
      if (currentlyBlocked) {
        next[empKey] = next[empKey].filter(t => t !== time);
      } else {
        next[empKey] = [...next[empKey], time];
      }
      return next;
    });
    setTogglingSlot(key);
    try {
      await api.post("/api/blocked-slots", { date: selectedDate, staffName: empKey, time, blocked: !currentlyBlocked });
    } catch {
      setBlockedSlots(prev => {
        const next = { ...prev };
        if (!next[empKey]) next[empKey] = [];
        if (currentlyBlocked) {
          if (!next[empKey].includes(time)) next[empKey] = [...next[empKey], time];
        } else {
          next[empKey] = next[empKey].filter(t => t !== time);
        }
        return next;
      });
    } finally {
      setTogglingSlot(null);
    }
  };

  const openModal = (time: string, empId: number) => {
    const slots = slotsByEmp[empId] ?? [];
    const available = slots.some(s => s.start === time);
    if (!available) return;
    if (blockedSlots[String(empId)]?.includes(time)) return;
    setModalTime(time);
    setModalEmployeeId(empId);
    setError("");
    setCompany(isVendor ? (authSession?.employeeName ?? "") : "");
    setContactName(isVendor ? (authSession?.employeeRank ?? "") : "");
    setPhone("");
    setPurpose(""); setNote("");
  };

  const closeModal = () => {
    setModalTime(null);
    setModalEmployeeId(null);
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
    if (!modalEmployeeId) {
      setError("담당자가 지정되지 않았습니다.");
      return;
    }
    if (!company.trim() || !contactName.trim() || !phone.trim() || !purpose) {
      setError("모든 필수 항목을 입력해 주세요.");
      return;
    }
    setError("");
    // 2026-10-06 · [대상:xxx] note 자동 생성 금지 · note 는 사용자 입력 그대로
    const result = await submitCall(() => api.post("/api/reservations", {
      date: selectedDate,
      time: modalTime,
      company,
      contactName,
      phone,
      purpose,
      note: note || null,
      assignedEmployeeId: modalEmployeeId,
      ...(isVendor && authSession?.employeeId ? { vendorId: authSession.employeeId } : {}),
    }));
    if (result) {
      setSubmitted(true);
      setModalTime(null);
      setModalEmployeeId(null);
      // 재조회 · 방금 예약한 slot 반영
      fetchAllSlots(selectedDate, staffAvailability);
    }
  };

  const isLoading = slotsLoading || availLoading;

  // 2026-10-06 · 담당자 설정이 비어있는 경우 안내
  const hasAssignees = (visitorReservation?.assigneeEmployeeIds?.length ?? 0) > 0;
  const activeStaffList = useMemo(
    () => staffAvailability.filter(s => !s.isOff),
    [staffAvailability],
  );

  // 담당자 선택 시 특정 담당자만 noise · 자동 선택이 되었다면 그대로
  const visibleStaff = useMemo(() => {
    if (selectedEmployeeId == null) return staffAvailability;
    return staffAvailability.filter(s => s.employeeId === selectedEmployeeId || s.isOff);
  }, [staffAvailability, selectedEmployeeId]);

  // 모달 담당자 라벨
  const modalEmployeeLabel = useMemo(() => {
    if (!modalEmployeeId) return "";
    const s = staffAvailability.find(x => x.employeeId === modalEmployeeId);
    if (!s) return "";
    return s.rank ? `${s.name} · ${s.rank}` : s.name;
  }, [modalEmployeeId, staffAvailability]);

  // slot 전체 수집 (화면 좌측 time axis 용 · union 정렬)
  const allSlotTimes = useMemo(() => {
    const set = new Set<string>();
    for (const emp of visibleStaff) {
      if (emp.isOff) continue;
      for (const s of slotsByEmp[emp.employeeId] ?? []) set.add(s.start);
    }
    return [...set].sort();
  }, [visibleStaff, slotsByEmp]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}

      {/* 2026-10-06 · 사용자 지시 · activePage="reservation" 정정 */}
      <AppNavHeader activePage="reservation" authSession={authSession ?? null} onBack={onBack} />

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

          {/* 담당자 설정 없음 안내 */}
          {!hasAssignees && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200">
              <AlertCircle size={13} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-rose-700 text-xs leading-snug font-semibold">
                현재 방문예약 담당자가 설정되지 않았습니다. 관리자에게 문의하세요.
              </p>
            </div>
          )}

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
              const totalAssignees = visitorReservation?.assigneeEmployeeIds?.length ?? 0;
              const isFullyOff = totalAssignees > 0 && offStaff.length >= totalAssignees;
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

            {/* 담당자 2명+ 선택 UI */}
            {activeStaffList.length > 1 && (
              <div className="px-4 sm:px-6 pb-2 flex flex-wrap gap-2">
                {activeStaffList.map(s => (
                  <button
                    key={s.employeeId}
                    type="button"
                    onClick={() => setSelectedEmployeeId(prev => prev === s.employeeId ? null : s.employeeId)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                      selectedEmployeeId === s.employeeId
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    <UserCheck size={11} />
                    {s.name}
                    {s.rank && <span className="opacity-70 font-semibold">· {s.rank}</span>}
                  </button>
                ))}
                {selectedEmployeeId !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedEmployeeId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400 cursor-pointer"
                  >
                    전체 보기
                  </button>
                )}
              </div>
            )}

            {/* Column headers (담당자별) */}
            <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-3">
              <div className="w-14 shrink-0" />
              <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleStaff.length)}, minmax(0, 1fr))` }}>
                {visibleStaff.map(staff => (
                  <div
                    key={staff.employeeId}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold border ${
                      staff.isOff
                        ? "bg-gray-50 border-gray-200 text-gray-400"
                        : "bg-indigo-50 border-indigo-200 text-indigo-700"
                    }`}
                  >
                    <span className="font-bold">{staff.name}</span>
                    {staff.rank && (
                      <span className={`text-xs font-semibold ${staff.isOff ? "text-gray-400" : "text-indigo-500"}`}>
                        {staff.rank}
                      </span>
                    )}
                    {staff.isOff && (
                      <span className="text-[11px] font-semibold text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                        {staff.scheduleType ?? "휴무"}
                      </span>
                    )}
                  </div>
                ))}
                {visibleStaff.length === 0 && (
                  <div className="flex items-center justify-center py-2 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-200 text-gray-400">
                    담당자 없음
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Time slot rows */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 flex flex-col gap-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size={18} tone="zinc" label="예약 현황 불러오는 중..." labelSize={14} />
              </div>
            ) : visibleStaff.length === 0 || allSlotTimes.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <p className="text-xs text-gray-400 font-semibold">
                  {hasAssignees ? "선택한 날짜에 예약 가능한 시간이 없습니다." : "담당자가 설정되지 않았습니다."}
                </p>
              </div>
            ) : (
              allSlotTimes.map(t => {
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

                    {/* columns per visible staff */}
                    <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleStaff.length)}, minmax(0, 1fr))` }}>
                      {visibleStaff.map(staff => {
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

                        const slots = slotsByEmp[staff.employeeId] ?? [];
                        const isAvailable = slots.some(s => s.start === t);
                        const empKey = String(staff.employeeId);
                        const isBlocked = blockedSlots[empKey]?.includes(t) ?? false;
                        const slotKey = `${empKey}|${t}`;
                        const isToggling = togglingSlot === slotKey;

                        if (isInternalStaff) {
                          if (!isAvailable) {
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
                              onClick={() => toggleBlockedSlot(empKey, t)}
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
                        if (!isAvailable) {
                          return (
                            <div
                              key={staff.employeeId}
                              className="py-2.5 rounded-lg text-xs font-semibold border bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed text-center"
                            >
                              예약됨
                            </div>
                          );
                        }

                        return (
                          <button
                            key={staff.employeeId}
                            type="button"
                            disabled={isBlocked}
                            onClick={() => openModal(t, staff.employeeId)}
                            className={`py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                              isBlocked
                                ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                                : isPeak
                                ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer"
                                : "bg-white border-gray-200 text-emerald-600 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white cursor-pointer"
                            }`}
                          >
                            {isBlocked ? "불가" : "예약"}
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

      {/* ====== MODAL: Reservation Info Form (분리) ====== */}
      <ReservationFormModal
        open={!!modalTime}
        onClose={closeModal}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        isVendor={isVendor}
        modalTime={modalTime}
        modalEmployeeLabel={modalEmployeeLabel}
        selectedDateLabel={formatKoreanDate(selectedDate)}
        company={company}
        setCompany={setCompany}
        contactName={contactName}
        setContactName={setContactName}
        phone={phone}
        onPhoneChange={handlePhoneChange}
        purpose={purpose}
        setPurpose={setPurpose}
        note={note}
        setNote={setNote}
      />
    </div>
  );
};
