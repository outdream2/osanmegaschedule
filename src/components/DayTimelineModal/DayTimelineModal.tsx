// 2026-08-16 · #8 · Phase 2A · 슬림화 · types.ts + utils.ts + WorkerChips.tsx 분리
// 2026-08-17 · apiClient 마이그레이션
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { X, Pencil, ChevronLeft, ChevronRight, CheckCircle, Pill } from "lucide-react";
import { Employee } from "../../types";
import type { ScheduleTypeEntry } from "../../constants";
import {
  DEFAULT_TONE, SKIP_TYPES, TYPE_ORDER, ZONE_ROWS,
  type TypeTone, type ZoneRow, type WorkerEntry, type SlotMap, type ZoneMap, type BreakInterval, type BreakCount,
} from "./types";
import {
  DISPLAY_START, DISPLAY_END, TOTAL, HOUR_SLOTS, LUNCH_SLOTS, REST_SLOTS,
  isOtherEmp, isPharmEmp, isStaffEmp,
  cleanupStaleTimelineKeys, safeSetTimelineItem,
  parseRange, pct, widthPct, minToStr, shiftSlot, datesInMonth,
  createGhost, moveGhost, removeGhost,
  buildTypeTones, buildAutoSuggestZoneMap, computeLunchAssignments,
} from "./utils";
import { WorkerChips } from "./WorkerChips";
import { BreakTimeline } from "./BreakTimeline";
import { api, ApiError } from "../../lib/apiClient";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-23 · #191 · Modal primitive 마이그레이션
import { Modal } from "../common/Modal";


// 2026-08-21 · Framework Phase 4 · ZoneSection 별도 파일 이관
import { ZoneSection, ZONE_SLOTS } from "./ZoneSection";
// 2026-08-22 · Framework Phase 4 · WorkTimeSection 별도 파일 이관
import { WorkTimeSection } from "./WorkTimeSection";
// 2026-08-22 · Framework Phase 4 · HeaderBar 별도 파일 이관
import { HeaderBar } from "./HeaderBar";
// 2026-08-22 · Framework Phase 4 · slot 핸들러 6개 훅 이관
import { useSlotHandlers } from "./useSlotHandlers";


// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  date: string;
  employees: Employee[];
  typeHoursMap?: Record<string, string>;
  pharmTypeHoursMap?: Record<string, string>;
  onClose: () => void;
  onDateChange?: (newDate: string) => void;
  onEditEmployee?: (emp: Employee) => void;
  // 2026-08-13 · #98 · onScheduleUpdate · Modal 안 호출 없음 · 완전 dead · 제거
  onUpdateSchedule?: (data: {
    employeeId: number; date: string; type: string;
    workingHours: string; actualHours: string; memo?: string;
  }) => Promise<void>;
  /** Optional: user-customized schedule type entries. Used to resolve per-type colors. */
  scheduleTypeEntries?: ScheduleTypeEntry[];
}

type TabKey = "전체" | "사원" | "약사" | "기타";

export const DayTimelineModal: React.FC<Props> = ({
  date, employees, typeHoursMap, pharmTypeHoursMap, onClose, onDateChange, onEditEmployee, onUpdateSchedule, scheduleTypeEntries,
}) => {
  // Build per-type tone map from user settings (hex-based). Rebuilds only when settings change.
  const typeTones = useMemo(() => buildTypeTones(scheduleTypeEntries), [scheduleTypeEntries]);
  // 2026-08-21 · Framework Phase 3 · alert → useToast
  const { toast: mainToast, showError: mainShowError } = useToast();
  const [editingWork, setEditingWork] = useState<{ empId: number; value: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("전체");

  // 모달 첫 마운트 시 30일 초과된 tl_* localStorage 키 정리 (Quota 방어)
  useEffect(() => { cleanupStaleTimelineKeys(); }, []);

  // ── Slot state ────────────────────────────────────────────────────────────
  const [lunchSlots, setLunchSlots] = useState<SlotMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_lunch_slots_${date}`) || "{}"); } catch { return {}; }
  });
  const [restSlots, setRestSlots] = useState<SlotMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_rest_slots_${date}`) || "{}"); } catch { return {}; }
  });
  const [zoneSlots, setZoneSlots] = useState<ZoneMap>(() => {
    try { return JSON.parse(localStorage.getItem(`tl_zone_slots_${date}`) || "{}"); } catch { return {}; }
  });

  // Slot window offsets (in minutes). Clamped to [-60, +60].
  const [lunchOffset, setLunchOffset] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(`tl_lunch_offset_${date}`) || "0", 10);
    return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
  });
  const [restOffset, setRestOffset] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(`tl_rest_offset_${date}`) || "0", 10);
    return Number.isFinite(v) ? Math.max(-60, Math.min(60, v)) : 0;
  });
  const [lunchInterval, setLunchInterval] = useState<BreakInterval>(() => {
    const v = localStorage.getItem(`tl_lunch_interval_${date}`);
    return v === "60" ? 60 : v === "90" ? 90 : 30;
  });
  const [restInterval, setRestInterval] = useState<BreakInterval>(() => {
    const v = localStorage.getItem(`tl_rest_interval_${date}`);
    return v === "60" ? 60 : v === "90" ? 90 : 30;
  });
  const [lunchCount, setLunchCount] = useState<BreakCount>(() => {
    const v = parseInt(localStorage.getItem(`tl_lunch_count_${date}`) || "1", 10);
    return ([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(v as BreakCount) ? (v as BreakCount) : 1;
  });
  const [restCount, setRestCount] = useState<BreakCount>(() => {
    const v = parseInt(localStorage.getItem(`tl_rest_count_${date}`) || "1", 10);
    return ([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(v as BreakCount) ? (v as BreakCount) : 1;
  });

  // 임의배치 상태 (DB/DOW 데이터 없을 때 자동 제안됨)
  const [isAutoSuggested, setIsAutoSuggested] = useState(false);
  // 확정 여부
  const [isConfirmed, setIsConfirmed] = useState(false);
  // 확정 저장 중
  const [confirming, setConfirming] = useState(false);

  // ── Day-of-week ───────────────────────────────────────────────────────────
  const dow = useMemo(() => new Date(date + "T00:00:00").getDay(), [date]);

  // ── DB-first loading: DB날짜별 → DOW 템플릿 → 임의배치 ────────────────────
  const dataLoadedRef = useRef<string | null>(null);

  // Helper: apply fetched data to state + localStorage
  const applySlotData = useCallback((
    data: {
      zone_slots?: ZoneMap; lunch_slots?: SlotMap; rest_slots?: SlotMap;
      lunch_offset?: number; rest_offset?: number;
      lunch_interval?: number; rest_interval?: number;
      lunch_count?: number; rest_count?: number;
    },
    targetDate: string,
  ) => {
    if (data.zone_slots && Object.keys(data.zone_slots).length > 0) {
      setZoneSlots(data.zone_slots);
      safeSetTimelineItem(`tl_zone_slots_${targetDate}`, JSON.stringify(data.zone_slots));
    }
    if (data.lunch_slots && Object.keys(data.lunch_slots).length > 0) {
      setLunchSlots(data.lunch_slots);
      safeSetTimelineItem(`tl_lunch_slots_${targetDate}`, JSON.stringify(data.lunch_slots));
    }
    if (data.rest_slots && Object.keys(data.rest_slots).length > 0) {
      setRestSlots(data.rest_slots);
      safeSetTimelineItem(`tl_rest_slots_${targetDate}`, JSON.stringify(data.rest_slots));
    }
    if (data.lunch_offset != null) {
      setLunchOffset(data.lunch_offset);
      safeSetTimelineItem(`tl_lunch_offset_${targetDate}`, String(data.lunch_offset));
    }
    if (data.rest_offset != null) {
      setRestOffset(data.rest_offset);
      safeSetTimelineItem(`tl_rest_offset_${targetDate}`, String(data.rest_offset));
    }
    if (data.lunch_interval === 30 || data.lunch_interval === 60 || data.lunch_interval === 90) {
      setLunchInterval(data.lunch_interval as BreakInterval);
      safeSetTimelineItem(`tl_lunch_interval_${targetDate}`, String(data.lunch_interval));
    }
    if (data.rest_interval === 30 || data.rest_interval === 60 || data.rest_interval === 90) {
      setRestInterval(data.rest_interval as BreakInterval);
      safeSetTimelineItem(`tl_rest_interval_${targetDate}`, String(data.rest_interval));
    }
    if (data.lunch_count && [1,2,3,4,5,6,7,8,9,10].includes(data.lunch_count)) {
      setLunchCount(data.lunch_count as BreakCount);
      safeSetTimelineItem(`tl_lunch_count_${targetDate}`, String(data.lunch_count));
    }
    if (data.rest_count && [1,2,3,4,5,6,7,8,9,10].includes(data.rest_count)) {
      setRestCount(data.rest_count as BreakCount);
      safeSetTimelineItem(`tl_rest_count_${targetDate}`, String(data.rest_count));
    }
  }, []);

  // 2026-08-22 · Framework Phase 4 · buildAutoSuggest 을 utils.buildAutoSuggestZoneMap 으로 이관
  // 알고리즘 · 1) 약사 로테이션 · 2) 캐셔 2명 로테이션 · 3) 사원 매장 · 4) 기타 매장
  const buildAutoSuggest = useCallback((
    workerList: WorkerEntry[],
    lunchMap: Map<number, string> = new Map(),
    rangeMap: Record<number, { start: number; end: number } | null> = {},
  ): ZoneMap => buildAutoSuggestZoneMap(workerList, ZONE_SLOTS, lunchMap, rangeMap), []);
  // 원본 로직 유지 (재사용 참조)

  useEffect(() => {
    if (dataLoadedRef.current === date) return;
    dataLoadedRef.current = date;

    // Reset state for new date (localStorage fallback)
    setIsAutoSuggested(false);
    setIsConfirmed(false);
    try { setLunchSlots(JSON.parse(localStorage.getItem(`tl_lunch_slots_${date}`) || "{}")); } catch { setLunchSlots({}); }
    try { setRestSlots(JSON.parse(localStorage.getItem(`tl_rest_slots_${date}`) || "{}")); } catch { setRestSlots({}); }
    try { setZoneSlots(JSON.parse(localStorage.getItem(`tl_zone_slots_${date}`) || "{}")); } catch { setZoneSlots({}); }
    const lo = parseInt(localStorage.getItem(`tl_lunch_offset_${date}`) || "0", 10);
    setLunchOffset(Number.isFinite(lo) ? Math.max(-60, Math.min(60, lo)) : 0);
    const ro = parseInt(localStorage.getItem(`tl_rest_offset_${date}`) || "0", 10);
    setRestOffset(Number.isFinite(ro) ? Math.max(-60, Math.min(60, ro)) : 0);
    const li = localStorage.getItem(`tl_lunch_interval_${date}`);
    setLunchInterval(li === "60" ? 60 : li === "90" ? 90 : 30);
    const ri2 = localStorage.getItem(`tl_rest_interval_${date}`);
    setRestInterval(ri2 === "60" ? 60 : ri2 === "90" ? 90 : 30);
    const lc = parseInt(localStorage.getItem(`tl_lunch_count_${date}`) || "1", 10);
    setLunchCount(([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(lc as BreakCount) ? (lc as BreakCount) : 1);
    const rc = parseInt(localStorage.getItem(`tl_rest_count_${date}`) || "1", 10);
    setRestCount(([1,2,3,4,5,6,7,8,9,10] as BreakCount[]).includes(rc as BreakCount) ? (rc as BreakCount) : 1);

    const slotHasData = (ls: SlotMap, rs: SlotMap, zs: ZoneMap) =>
      Object.values(ls).some((a: unknown) => (a as number[]).length > 0) ||
      Object.values(rs).some((a: unknown) => (a as number[]).length > 0) ||
      Object.values(zs).some((sm: unknown) => Object.values(sm as Record<string, number[]>).some(a => a.length > 0));

    // 1. DB 날짜별 배정 우선 조회
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    api.get<Record<string, unknown> & { _empty?: boolean; is_confirmed?: boolean }>(`/api/zone-day/${date}`)
      .then(({ data: dayData }) => {
        if (!dayData) throw new Error("no day data");
        if (dayData._empty) throw new Error("empty");
        // 데이터가 있으면 적용
        const hasSlots = slotHasData(
          (dayData.lunch_slots as SlotMap) ?? {},
          (dayData.rest_slots as SlotMap) ?? {},
          (dayData.zone_slots as ZoneMap) ?? {},
        );
        if (hasSlots) {
          applySlotData(dayData as Parameters<typeof applySlotData>[0], date);
          setIsConfirmed(dayData.is_confirmed ?? false);
          setIsAutoSuggested(false);
          return;
        }
        throw new Error("empty slots");
      })
      .catch(() => {
        // 2. DOW 템플릿 조회
        const currentDow = new Date(date + "T00:00:00").getDay();
        api.get<Record<string, unknown> | null>(`/api/zone-assignments/${currentDow}`)
          .then(({ data: dowData }) => {
            if (!dowData) throw new Error("no dow");
            const hasSlots = slotHasData(
              (dowData.lunch_slots as SlotMap) ?? {},
              (dowData.rest_slots as SlotMap) ?? {},
              (dowData.zone_slots as ZoneMap) ?? {},
            );
            if (hasSlots) {
              applySlotData(dowData as Parameters<typeof applySlotData>[0], date);
              setIsAutoSuggested(false);
              return;
            }
            throw new Error("empty dow");
          })
          .catch(() => {
            // 3. 임의배치: workers가 아직 계산 전일 수 있으므로 빈 ZoneMap으로만 마크 → workers 계산 후 실제 배치는 별도 effect
            setIsAutoSuggested(true);
          });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // ── Workers ───────────────────────────────────────────────────────────────
  // 입사일 이전 · 퇴사일 이후 직원은 자동 제외 (전체스케쥴 회색처리와 연동)
  const workers = useMemo(() => employees
    .map(emp => {
      if (emp.hireDate && date < emp.hireDate) return null;
      if (emp.retireDate && date > emp.retireDate) return null;
      const s = emp.schedules.find(sc => sc.date === date);
      if (!s || SKIP_TYPES.has(s.type)) return null;
      const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
      const wh = s.workingHours || hoursMap?.[s.type] || "";
      return { emp, schedule: s, wh } as WorkerEntry;
    })
    .filter((w): w is WorkerEntry => w !== null)
    .sort((a, b) => (TYPE_ORDER[a.schedule.type] ?? 99) - (TYPE_ORDER[b.schedule.type] ?? 99)),
  [employees, date, typeHoursMap, pharmTypeHoursMap]);

  // 임의배치 실제 적용: isAutoSuggested가 true가 된 뒤 workers가 준비되면 배치 생성
  useEffect(() => {
    if (!isAutoSuggested || workers.length === 0) return;
    // workRanges는 아래 useMemo보다 이 effect가 뒤에 실행되므로 직접 계산
    const localRangeMap: Record<number, { start: number; end: number } | null> = {};
    workers.forEach(w => { localRangeMap[w.emp.id] = parseRange(w.wh); });
    const suggested = buildAutoSuggest(workers, new Map(), localRangeMap);
    setZoneSlots(suggested);
    safeSetTimelineItem(`tl_zone_slots_${date}`, JSON.stringify(suggested));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoSuggested, workers]);

  const pharmacistWorkers = useMemo(() => workers.filter(w => w.emp.position === "약사"), [workers]);
  const staffWorkers      = useMemo(() => workers.filter(w => isStaffEmp(w.emp)), [workers]);
  const otherWorkers      = useMemo(() => workers.filter(w => isOtherEmp(w.emp)), [workers]);

  const tabWorkerIds = useMemo(() => new Set((() => {
    if (activeTab === "약사") return pharmacistWorkers.map(w => w.emp.id);
    if (activeTab === "사원") return staffWorkers.map(w => w.emp.id);
    if (activeTab === "기타") return otherWorkers.map(w => w.emp.id);
    return workers.map(w => w.emp.id);
  })()), [activeTab, workers, pharmacistWorkers, staffWorkers, otherWorkers]);
  const isTabAll = activeTab === "전체";
  const tabWorkers = useMemo(() => {
    if (activeTab === "약사") return pharmacistWorkers;
    if (activeTab === "사원") return staffWorkers;
    if (activeTab === "기타") return otherWorkers;
    return workers;
  }, [activeTab, workers, pharmacistWorkers, staffWorkers, otherWorkers]);

  // ── Row ordering ──────────────────────────────────────────────────────────
  const [dragRowId, setDragRowId] = useState<number | null>(null);
  const [orderedIds, setOrderedIds] = useState<number[]>(() => tabWorkers.map(w => w.emp.id));
  const [showUnassigned, setShowUnassigned] = useState(false);

  useEffect(() => {
    setOrderedIds(prev => {
      const validIds = new Set(tabWorkers.map(w => w.emp.id));
      const kept    = prev.filter(id => validIds.has(id));
      const missing = tabWorkers.map(w => w.emp.id).filter(id => !kept.includes(id));
      return [...kept, ...missing];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, workers]);

  const displayWorkers = useMemo(() => {
    const byId = new Map(tabWorkers.map(w => [w.emp.id, w]));
    const ordered = orderedIds.flatMap(id => { const w = byId.get(id); return w ? [w] : []; });
    const orderedSet = new Set(orderedIds);
    tabWorkers.forEach(w => { if (!orderedSet.has(w.emp.id)) ordered.push(w); });
    return ordered;
  }, [orderedIds, tabWorkers]);

  // 약사 / 사원 / 기타 그룹핑 — 일별 스케쥴 리스트에서 카테고리별로 분리
  const displayGroups = useMemo(() => {
    const pharm = displayWorkers.filter(w => w.emp.position === "약사");
    const staff = displayWorkers.filter(w => isStaffEmp(w.emp));
    const other = displayWorkers.filter(w => isOtherEmp(w.emp));
    return [
      { label: "약사", items: pharm, hdrCls: "text-indigo-600" },
      { label: "사원", items: staff, hdrCls: "text-zinc-500" },
      { label: "기타", items: other, hdrCls: "text-zinc-400" },
    ].filter(g => g.items.length > 0);
  }, [displayWorkers]);

  const workRanges = useMemo(() => {
    const r: Record<number, { start: number; end: number } | null> = {};
    workers.forEach(w => { r[w.emp.id] = parseRange(w.wh); });
    return r;
  }, [workers]);

  // ── 자동 저장 (debounce 1.5초) ────────────────────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleAutoSave = useCallback((
    zs: ZoneMap, ls: SlotMap, rs: SlotMap,
    lo: number, ro: number, li: BreakInterval, ri: BreakInterval,
    lc: BreakCount, rc: BreakCount,
  ) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient · fire-and-forget
      api.put(`/api/zone-day/${date}`, {
        zone_slots: zs, lunch_slots: ls, rest_slots: rs,
        lunch_offset: lo, rest_offset: ro,
        lunch_interval: li, rest_interval: ri,
        lunch_count: lc, rest_count: rc,
        is_confirmed: false,
      }).catch(() => {});
    }, 1500);
  }, [date]);

  // ── Row drag handlers ─────────────────────────────────────────────────────
  const handleRowDragStart = useCallback((e: React.DragEvent, empId: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragRowId(empId);
  }, []);
  const handleRowDragOver = useCallback((e: React.DragEvent, empId: number) => {
    e.preventDefault();
    if (dragRowId === null || dragRowId === empId) return;
    setOrderedIds(prev => {
      const ids = [...prev];
      const fi = ids.indexOf(dragRowId), ti = ids.indexOf(empId);
      if (fi === -1 || ti === -1) return prev;
      ids.splice(fi, 1); ids.splice(ti, 0, dragRowId);
      return ids;
    });
  }, [dragRowId]);
  const handleRowDrop    = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragRowId(null); }, []);
  const handleRowDragEnd = useCallback(() => setDragRowId(null), []);

  // ── Slot handlers · 2026-08-22 · useSlotHandlers 훅 이관 ──────────────────
  const { dropToLunchSlot, removeFromLunchSlot, dropToRestSlot, removeFromRestSlot, dropToZone, removeFromZone } = useSlotHandlers({
    date, employees,
    lunchSlots, restSlots, zoneSlots,
    setLunchSlots, setRestSlots, setZoneSlots,
    lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount,
    scheduleAutoSave, mainShowError,
  });

  // ── 요일별 템플릿 DB 저장 ─────────────────────────────────────────────────
  const saveTemplateToDow = useCallback(async (saveDow: number) => {
    // Pre-write FIRST so navigating to another date immediately shows data
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    while (cur.getDay() !== saveDow) cur.setDate(cur.getDate() + 1);
    const dayDates: string[] = [];
    for (let i = 0; i < 4; i++) {
      const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      dayDates.push(d);
      safeSetTimelineItem(`tl_zone_slots_${d}`,  JSON.stringify(zoneSlots));
      safeSetTimelineItem(`tl_lunch_slots_${d}`, JSON.stringify(lunchSlots));
      safeSetTimelineItem(`tl_rest_slots_${d}`,  JSON.stringify(restSlots));
      safeSetTimelineItem(`tl_lunch_offset_${d}`, String(lunchOffset));
      safeSetTimelineItem(`tl_rest_offset_${d}`,  String(restOffset));
      safeSetTimelineItem(`tl_lunch_interval_${d}`, String(lunchInterval));
      safeSetTimelineItem(`tl_rest_interval_${d}`, String(restInterval));
      safeSetTimelineItem(`tl_lunch_count_${d}`, String(lunchCount));
      safeSetTimelineItem(`tl_rest_count_${d}`, String(restCount));
      cur.setDate(cur.getDate() + 7);
    }
    try {
      const dayPayload = {
        zone_slots: zoneSlots,
        lunch_slots: lunchSlots,
        rest_slots: restSlots,
        lunch_offset: lunchOffset,
        rest_offset: restOffset,
        lunch_interval: lunchInterval,
        rest_interval: restInterval,
        lunch_count: lunchCount,
        rest_count: restCount,
      };
      // 2026-08-21 · Framework Phase 3 · fetch → apiClient · Promise.allSettled 로 실패 개수 집계
      const labels = [
        `/api/zone-assignments/${saveDow}`,
        ...dayDates.map(d => `/api/zone-day/${d}`),
      ];
      const results = await Promise.allSettled([
        api.put(`/api/zone-assignments/${saveDow}`, dayPayload),
        ...dayDates.map(d => api.put(`/api/zone-day/${d}`, { ...dayPayload, is_confirmed: false })),
      ]);
      const failedDetails = results
        .map((r, i) => ({ r, url: labels[i] }))
        .filter(({ r }) => r.status === "rejected")
        .map(({ r, url }) => {
          const err = (r as PromiseRejectedResult).reason;
          const msg = err instanceof ApiError ? `${err.status} ${err.message}` : String(err?.message ?? err);
          return `${url}: ${msg}`;
        });
      if (failedDetails.length > 0) {
        mainShowError("일부 저장 실패:\n" + failedDetails.join("\n"));
      }
    } catch (e) {
      mainShowError("저장 실패: " + (e as Error).message);
    }
  }, [zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, mainShowError]);

  // 확정 저장 (날짜별 + 요일 템플릿 동시 저장)
  // saveTemplateToDow 뒤에 정의하여 의존성 순서 보장
  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      await api.put(`/api/zone-day/${date}`, {
        zone_slots: zoneSlots, lunch_slots: lunchSlots, rest_slots: restSlots,
        lunch_offset: lunchOffset, rest_offset: restOffset,
        lunch_interval: lunchInterval, rest_interval: restInterval,
        lunch_count: lunchCount, rest_count: restCount,
        is_confirmed: true,
      });
      setIsConfirmed(true);
      setIsAutoSuggested(false);
      // 확정 시 요일 템플릿도 동시 저장 → 다음번 같은 요일 열면 자동 로드
      await saveTemplateToDow(dow).catch(() => {});
    } catch (e) {
      mainShowError("확정 저장 오류: " + (e instanceof ApiError ? e.message : (e as Error).message));
    } finally {
      setConfirming(false);
    }
  }, [date, dow, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, saveTemplateToDow, mainShowError]);

  const handleLunchShiftOffset = useCallback((delta: number) => {
    setLunchOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      safeSetTimelineItem(`tl_lunch_offset_${date}`, String(next));
      scheduleAutoSave(zoneSlots, lunchSlots, restSlots, next, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, restSlots, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleRestShiftOffset = useCallback((delta: number) => {
    setRestOffset(prev => {
      const next = Math.max(-60, Math.min(60, prev + delta));
      safeSetTimelineItem(`tl_rest_offset_${date}`, String(next));
      scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, next, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleSetLunchInterval = useCallback((v: BreakInterval) => {
    setLunchInterval(v);
    safeSetTimelineItem(`tl_lunch_interval_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, v, restInterval, lunchCount, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, restInterval, lunchCount, restCount, scheduleAutoSave]);
  const handleSetRestInterval = useCallback((v: BreakInterval) => {
    setRestInterval(v);
    safeSetTimelineItem(`tl_rest_interval_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, v, lunchCount, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, lunchCount, restCount, scheduleAutoSave]);

  const handleSetLunchCount = useCallback((v: BreakCount) => {
    setLunchCount(v);
    safeSetTimelineItem(`tl_lunch_count_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, v, restCount);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, restCount, scheduleAutoSave]);
  const handleSetRestCount = useCallback((v: BreakCount) => {
    setRestCount(v);
    safeSetTimelineItem(`tl_rest_count_${date}`, String(v));
    scheduleAutoSave(zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, v);
  }, [date, zoneSlots, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, scheduleAutoSave]);

  const shiftedLunchSlots = useMemo(() => {
    const all = LUNCH_SLOTS.map(s => shiftSlot(s, lunchOffset));
    if (lunchInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (lunchInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [lunchOffset, lunchInterval]);
  const shiftedRestSlots = useMemo(() => {
    const all = REST_SLOTS.map(s => shiftSlot(s, restOffset));
    if (restInterval === 90) return all.filter((_, i) => i % 3 === 0);
    if (restInterval === 60) return all.filter((_, i) => i % 2 === 0);
    return all;
  }, [restOffset, restInterval]);

  // ── Date title ────────────────────────────────────────────────────────────
  const d = new Date(date + "T00:00:00");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const title = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
  const offsetDate = useCallback((delta: number) => {
    const nd = new Date(date + "T00:00:00");
    nd.setDate(nd.getDate() + delta);
    return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
  }, [date]);

  const tabs = useMemo(() => [
    { key: "전체" as TabKey, count: workers.length },
    { key: "사원" as TabKey, count: staffWorkers.length },
    { key: "약사" as TabKey, count: pharmacistWorkers.length },
    { key: "기타" as TabKey, count: otherWorkers.length },
  ], [workers, staffWorkers, pharmacistWorkers, otherWorkers]);

  return (
    <>
      {/* 2026-08-23 · #191 · Modal primitive (v3.3 · align="top-mobile") 마이그레이션 */}
      <Modal
        open
        onClose={onClose}
        showClose={false}
        closeOnEsc
        closeOnBackdrop
        backdropIntensity="brand-strong"
        align="top-mobile"
        bodyPadding="none"
        className="!max-w-full sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-[1100px] shadow-brand-modal overflow-hidden flex flex-col"
        cardStyle={{ maxHeight: "92vh" }}
      >
        {/* Header + tabs + 임의배치 배너 (HeaderBar · 별도 파일 이관) */}
        <HeaderBar
          title={title}
          workersCount={workers.length}
          staffCount={staffWorkers.length}
          pharmCount={pharmacistWorkers.length}
          otherCount={otherWorkers.length}
          onClose={onClose}
          onDateChange={onDateChange}
          offsetDate={offsetDate}
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isConfirmed={isConfirmed}
          handleConfirm={handleConfirm}
          confirming={confirming}
          isAutoSuggested={isAutoSuggested}
        />

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 select-none">
          {/* ── 근무시간 섹션 (WorkTimeSection · 별도 파일 이관) ── */}
          <WorkTimeSection
            workers={workers}
            displayWorkers={displayWorkers}
            displayGroups={displayGroups}
            workRanges={workRanges}
            zoneSlots={zoneSlots}
            lunchSlots={lunchSlots}
            restSlots={restSlots}
            showUnassigned={showUnassigned}
            setShowUnassigned={setShowUnassigned}
            typeTones={typeTones}
            date={date}
            dragRowId={dragRowId}
            editingWork={editingWork}
            setEditingWork={setEditingWork}
            pharmTypeHoursMap={pharmTypeHoursMap}
            typeHoursMap={typeHoursMap}
            onEditEmployee={onEditEmployee}
            onUpdateSchedule={onUpdateSchedule}
            handleRowDragStart={handleRowDragStart}
            handleRowDragOver={handleRowDragOver}
            handleRowDrop={handleRowDrop}
            handleRowDragEnd={handleRowDragEnd}
          />

          <div className="mx-4 h-px bg-zinc-100" />

          {/* ── 구역 · 점심 · 휴게 배정 섹션 ── */}
          <div className="px-4 py-3 pb-5">
            <ZoneSection
              zoneMap={zoneSlots}
              workers={tabWorkers}
              allWorkers={workers}
              onDropToZone={dropToZone}
              onRemoveFromZone={removeFromZone}
              typeTones={typeTones}
              workRanges={workRanges}
              currentDow={dow}
              onSaveToDow={saveTemplateToDow}
              lunchSlotMap={lunchSlots}
              shiftedLunchSlots={shiftedLunchSlots}
              lunchOffset={lunchOffset}
              onShiftLunchOffset={handleLunchShiftOffset}
              onDropToLunch={dropToLunchSlot}
              onRemoveFromLunch={removeFromLunchSlot}
              onReorderLunch={(slot, empId, toIndex) => {
                setLunchSlots(prev => {
                  const arr = [...(prev[slot] ?? [])];
                  const from = arr.indexOf(empId);
                  if (from < 0) return prev;
                  arr.splice(from, 1);
                  const idx = Math.max(0, Math.min(toIndex, arr.length));
                  arr.splice(idx, 0, empId);
                  const next = { ...prev, [slot]: arr };
                  safeSetTimelineItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
                  scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return next;
                });
              }}
              restSlotMap={restSlots}
              shiftedRestSlots={shiftedRestSlots}
              restOffset={restOffset}
              onShiftRestOffset={handleRestShiftOffset}
              onDropToRest={dropToRestSlot}
              onRemoveFromRest={removeFromRestSlot}
              onReorderRest={(slot, empId, toIndex) => {
                setRestSlots(prev => {
                  const arr = [...(prev[slot] ?? [])];
                  const from = arr.indexOf(empId);
                  if (from < 0) return prev;
                  arr.splice(from, 1);
                  const idx = Math.max(0, Math.min(toIndex, arr.length));
                  arr.splice(idx, 0, empId);
                  const next = { ...prev, [slot]: arr };
                  safeSetTimelineItem(`tl_rest_slots_${date}`, JSON.stringify(next));
                  scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return next;
                });
              }}
              lunchInterval={lunchInterval}
              restInterval={restInterval}
              onSetLunchInterval={handleSetLunchInterval}
              onSetRestInterval={handleSetRestInterval}
              lunchCount={lunchCount}
              restCount={restCount}
              onSetLunchCount={handleSetLunchCount}
              onSetRestCount={handleSetRestCount}
              tabWorkerIds={tabWorkerIds}
              isTabAll={isTabAll}
              onUserInteract={() => setIsAutoSuggested(false)}
              onAutoSuggest={() => {
                // 2026-08-22 · 점심 배정 계산 · zone 배정 · utils 함수 재사용
                //   1) computeLunchAssignments · 매장 우선 · 카운터 후순위 · 라운드로빈
                //   2) buildAutoSuggest (utils.buildAutoSuggestZoneMap) · 점심 충돌 자동 제외
                //   3) 기존 zoneSlots 병합 · 4) lunchSlots 업데이트
                const tabIdSet = new Set(tabWorkers.map(w => w.emp.id));
                const lunchAssignments = computeLunchAssignments(tabWorkers, shiftedLunchSlots, workRanges, lunchCount);
                const suggested = buildAutoSuggest(tabWorkers, lunchAssignments, workRanges);

                // ── 3단계: 기존 zoneSlots에 현재 탭 인원 배정 병합 ───────────
                let nextZone: ZoneMap = {};
                setZoneSlots(prev => {
                  const next: ZoneMap = {};
                  for (const zone of ZONE_ROWS) {
                    const existing = prev[zone] ?? {};
                    const cleaned: Record<string, number[]> = {};
                    for (const [slot, ids] of Object.entries(existing)) {
                      // 현재 탭 인원의 기존 배정 제거 (새 배정으로 교체)
                      cleaned[slot] = (ids as number[]).filter(id => !tabIdSet.has(id));
                    }
                    next[zone] = cleaned;
                  }
                  // suggested 병합
                  for (const zone of ZONE_ROWS) {
                    const sug = suggested[zone] ?? {};
                    for (const [slot, idsRaw] of Object.entries(sug)) {
                      const ids = idsRaw as number[];
                      if (ids.length === 0) continue;
                      next[zone][slot] = [
                        ...(next[zone][slot] ?? []).filter(id => !ids.includes(id)),
                        ...ids,
                      ];
                    }
                  }
                  nextZone = next;
                  safeSetTimelineItem(`tl_zone_slots_${date}`, JSON.stringify(next));
                  return next;
                });

                // ── 4단계: 점심 배정 반영 ─────────────────────────────────
                setLunchSlots(prev => {
                  const cleaned: SlotMap = {};
                  for (const [slot, ids] of Object.entries(prev)) {
                    cleaned[slot] = (ids as number[]).filter(id => !tabIdSet.has(id));
                  }
                  for (const [empId, slot] of lunchAssignments) {
                    if (!cleaned[slot]) cleaned[slot] = [];
                    if (!cleaned[slot].includes(empId)) cleaned[slot].push(empId);
                  }
                  safeSetTimelineItem(`tl_lunch_slots_${date}`, JSON.stringify(cleaned));
                  scheduleAutoSave(nextZone, cleaned, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
                  return cleaned;
                });

                setIsAutoSuggested(false);
              }}
              isConfirmed={isConfirmed}
              confirming={confirming}
              onConfirm={handleConfirm}
            />
          </div>

        </div>
      </Modal>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {mainToast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(mainToast.tone)}>{mainToast.message}</div>
        </div>
      )}
    </>
  );
};
