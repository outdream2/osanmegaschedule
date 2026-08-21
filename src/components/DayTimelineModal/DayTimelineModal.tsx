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
  buildTypeTones,
} from "./utils";
import { WorkerChips } from "./WorkerChips";
import { BreakTimeline } from "./BreakTimeline";
import { api, ApiError } from "../../lib/apiClient";
import { StatusPill } from "../common/StatusPill";
// 2026-08-21 · Framework Phase 3 · alert → useToast
import { useToast, toastClass } from "../../hooks/useToast";


// 2026-08-21 · Framework Phase 4 · ZoneSection 별도 파일 이관
import { ZoneSection, ZONE_SLOTS } from "./ZoneSection";


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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // ─── 임의배치 생성 (정교화) ─────────────────────────────────────────────────
  // 알고리즘:
  //  1) 약사 1시간 로테이션 → 슬롯마다 약사 한 명씩 순환 배정 (근무 시간 밖 스킵)
  //  2) 캐셔 풀 → 슬롯마다 2명씩 순환 배정 (카운터 팀 = 약사 1 + 캐셔 2)
  //  3) 사원(정규) 중 캐셔가 아닌 인원 → 매장 고정
  //  4) 기타/알바 → 매장 고정
  //  ※ 점심 배정은 별도 lunchAssignments 결과를 onAutoSuggest에서 주입하므로
  //    buildAutoSuggest 자체는 zone 배정만 담당 (충돌 제거는 onAutoSuggest에서)
  const buildAutoSuggest = useCallback((
    workerList: WorkerEntry[],
    // 점심 배정 맵: empId → lunchSlotKey (점심 시간과 겹치는 zone slot에서 제외하기 위해)
    lunchMap: Map<number, string> = new Map(),
    // 근무 범위 맵: workRanges 를 파라미터로 받아 선언 순서 문제 해소
    rangeMap: Record<number, { start: number; end: number } | null> = {},
  ): ZoneMap => {
    if (workerList.length === 0) return {};
    const newZoneMap: ZoneMap = { 카운터: {}, 매장: {} };

    // 근무 범위 헬퍼 (슬롯 시작 분 기준 — slotH 는 분)
    const inRange = (empId: number, slotH: number): boolean => {
      const r = rangeMap[empId];
      if (!r) return true; // 근무 시간 미정이면 포함
      return slotH < r.end && slotH + 60 > r.start;
    };

    // 점심 충돌 헬퍼: 이 empId 가 이 zone slot 시간과 겹치는 점심을 가졌으면 true
    const conflictsWithLunch = (empId: number, slotH: number): boolean => {
      const lKey = lunchMap.get(empId);
      if (!lKey) return false;
      const [lh, lm] = lKey.split(":").map(Number);
      const lStart = lh * 60 + lm;
      const lEnd = lStart + 30;
      return slotH < lEnd && slotH + 60 > lStart;
    };

    // 그룹 분류
    // 캐셔 풀: 포지션에 "캐셔" 포함
    const pharmWorkers = workerList.filter(w => isPharmEmp(w.emp));
    const cashierWorkers = workerList.filter(w =>
      !isPharmEmp(w.emp) && w.emp.position.includes("캐셔")
    );
    // 나머지 사원/기타 (매장 담당)
    const otherWorkers = workerList.filter(w =>
      !isPharmEmp(w.emp) && !w.emp.position.includes("캐셔")
    );

    // 약사 / 캐셔 각자의 로테이션 인덱스 (슬롯 횟수 기준)
    let pharmRIdx = 0; // 다음에 배정할 약사 인덱스
    let cashier1Idx = 0; // 카운터 캐셔 시작 인덱스 (슬롯마다 1씩 shift)

    for (const slot of ZONE_SLOTS) {
      const slotH = parseInt(slot.split(":")[0], 10) * 60;

      // ── 카운터: 약사 한 명 배정 (로테이션, 근무 시간·점심 충돌 고려) ──────
      let pharmAssigned: number | null = null;
      if (pharmWorkers.length > 0) {
        // 현재 인덱스부터 순환하며 근무 가능한 약사 탐색
        for (let tries = 0; tries < pharmWorkers.length; tries++) {
          const candidate = pharmWorkers[(pharmRIdx + tries) % pharmWorkers.length];
          if (inRange(candidate.emp.id, slotH) && !conflictsWithLunch(candidate.emp.id, slotH)) {
            pharmAssigned = candidate.emp.id;
            // 다음 슬롯에서 다음 약사로 넘어감 (한 바퀴 돌도록)
            pharmRIdx = (pharmRIdx + 1) % pharmWorkers.length;
            break;
          }
          // 이 약사를 이 슬롯에서 못 쓰는 경우 — 다음 약사로 시도하되 index 넘기지 않음
        }
        // 탐색 실패 시 pharmRIdx 그대로 유지 (다음 슬롯에서 재시도)
      }
      if (pharmAssigned != null) {
        if (!newZoneMap["카운터"][slot]) newZoneMap["카운터"][slot] = [];
        newZoneMap["카운터"][slot].push(pharmAssigned);
      }

      // ── 카운터: 캐셔 2명 배정 (로테이션) ─────────────────────────────────
      if (cashierWorkers.length > 0) {
        const c1 = cashierWorkers.length;
        let assigned = 0;
        // cashier1Idx 부터 2명을 순환 배정
        for (let offset = 0; offset < c1 && assigned < 2; offset++) {
          const idx = (cashier1Idx + offset) % c1;
          const candidate = cashierWorkers[idx];
          if (inRange(candidate.emp.id, slotH) && !conflictsWithLunch(candidate.emp.id, slotH)) {
            if (!newZoneMap["카운터"][slot]) newZoneMap["카운터"][slot] = [];
            newZoneMap["카운터"][slot].push(candidate.emp.id);
            assigned++;
          }
        }
        // 다음 슬롯에서 다음 캐셔 쌍으로 로테이션 (1씩 shift)
        cashier1Idx = (cashier1Idx + 1) % Math.max(1, c1);
      }

      // ── 매장: 카운터에 배정 안 된 약사 (규칙: 카운터에 없는 약사는 매장 배치) ──
      for (const w of pharmWorkers) {
        if (w.emp.id === pharmAssigned) continue;
        if (inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
          if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
          newZoneMap["매장"][slot].push(w.emp.id);
        }
      }

      // ── 매장: 기타/나머지 사원들 ──────────────────────────────────────────
      for (const w of otherWorkers) {
        if (inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
          if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
          newZoneMap["매장"][slot].push(w.emp.id);
        }
      }

      // ── 매장: 카운터에 배정 안 된 캐셔 (점심/범위 걸리거나 슬롯 오버일 때) ──
      // 카운터 배정된 캐셔 셋
      const counterCashierSet = new Set(newZoneMap["카운터"][slot] ?? []);
      for (const w of cashierWorkers) {
        if (!counterCashierSet.has(w.emp.id) && inRange(w.emp.id, slotH) && !conflictsWithLunch(w.emp.id, slotH)) {
          if (!newZoneMap["매장"][slot]) newZoneMap["매장"][slot] = [];
          newZoneMap["매장"][slot].push(w.emp.id);
        }
      }
    }

    return newZoneMap;
  }, []);

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

  // ── Slot handlers ─────────────────────────────────────────────────────────
  const dropToLunchSlot = useCallback((slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const [lh, lm] = slot.split(":").map(Number);
    const lStart = lh * 60 + lm;
    const lEnd = lStart + 30;
    // 점심 시간 겹침 검사 — 같은 사람이 시간이 겹치는 점심 슬롯에 배정될 수 없음
    // source slot(= 같은 lunch에서 이동)은 skip해서 정상 이동 허용
    const lunchDup = Object.entries(lunchSlots).some(([ls, ids]) => {
      if (source?.type === "lunch" && source.slot === ls) return false;
      if (!(ids as number[]).includes(empId)) return false;
      const [oh, om] = ls.split(":").map(Number);
      const oStart = oh * 60 + om;
      const oEnd = oStart + 30;
      return oStart < lEnd && oEnd > lStart;
    });
    if (lunchDup) { mainShowError("이미 배정되었습니다.\n같은 시간대에 이미 점심이 배정되어 있습니다."); return; }
    // 2026-08-11 · 같은 30분 슬롯에 약사 2명 이상 배치 금지 (매장에 최소 1명 약사 유지)
    const targetEmp = employees.find(e => e.id === empId);
    if (targetEmp?.position === "약사") {
      const existingIds = (lunchSlots[slot] ?? []).filter(id => id !== empId);
      const hasOtherPharm = existingIds.some(id => employees.find(e => e.id === id)?.position === "약사");
      if (hasOtherPharm) { mainShowError("한 시간대에 약사는 1명만 점심 배정할 수 있습니다.\n(매장에 최소 1명 약사가 남아있어야 합니다)"); return; }
    }
    // 출발지가 zone이고 그 slot이 이 lunch 시간대와 겹치면 zone 충돌 검사 스킵
    const zoneConflict = ZONE_ROWS.some(zone =>
      Object.entries(zoneSlots[zone] ?? {}).some(([zSlot, ids]) => {
        if (!(ids as number[]).includes(empId)) return false;
        if (source?.type === "zone" && source.zone === zone && source.slot === zSlot) return false;
        const zh = parseInt(zSlot.split(":")[0], 10) * 60;
        return zh < lEnd && zh + 60 > lStart;
      })
    );
    if (zoneConflict) { mainShowError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 카운터/매장 구역이 배정되어 있습니다)"); return; }
    const restConflict = Object.entries(restSlots).some(([rs, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "rest" && source.slot === rs) return false;
      const [rh, rm] = rs.split(":").map(Number);
      const rStart = rh * 60 + rm;
      return rStart < lEnd && rStart + 30 > lStart;
    });
    if (restConflict) { mainShowError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 휴게시간이 배정되어 있습니다)"); return; }
    // 출발지 lunch/rest/zone에서 자동 제거 (atomic 이동)
    if (source?.type === "lunch" && source.slot !== slot) {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "rest") {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "zone" && source.zone) {
      const srcZone = source.zone;
      setZoneSlots(prev => {
        const z = { ...(prev[srcZone] ?? {}) };
        z[source.slot] = (z[source.slot] ?? []).filter(id => id !== empId);
        return { ...prev, [srcZone]: z };
      });
    }
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      safeSetTimelineItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, restSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, employees]);

  const removeFromLunchSlot = useCallback((slot: string, empId: number) => {
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      safeSetTimelineItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const dropToRestSlot = useCallback((slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    const [rh, rm] = slot.split(":").map(Number);
    const rStart = rh * 60 + rm;
    const rEnd = rStart + 30;
    const zoneConflict = ZONE_ROWS.some(zone =>
      Object.entries(zoneSlots[zone] ?? {}).some(([zSlot, ids]) => {
        if (!(ids as number[]).includes(empId)) return false;
        if (source?.type === "zone" && source.zone === zone && source.slot === zSlot) return false;
        const zh = parseInt(zSlot.split(":")[0], 10) * 60;
        return zh < rEnd && zh + 60 > rStart;
      })
    );
    if (zoneConflict) { mainShowError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 카운터/매장 구역이 배정되어 있습니다)"); return; }
    const lunchConflict = Object.entries(lunchSlots).some(([ls, ids]) => {
      if (!(ids as number[]).includes(empId)) return false;
      if (source?.type === "lunch" && source.slot === ls) return false;
      const [lh, lm] = ls.split(":").map(Number);
      const lStart = lh * 60 + lm;
      return lStart < rEnd && lStart + 30 > rStart;
    });
    if (lunchConflict) { mainShowError("중복배치입니다. 다시 배정하세요.\n(같은 시간대에 이미 점심시간이 배정되어 있습니다)"); return; }
    // 출발지에서 자동 제거 (atomic 이동)
    if (source?.type === "rest" && source.slot !== slot) {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "lunch") {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "zone" && source.zone) {
      const srcZone = source.zone;
      setZoneSlots(prev => {
        const z = { ...(prev[srcZone] ?? {}) };
        z[source.slot] = (z[source.slot] ?? []).filter(id => id !== empId);
        return { ...prev, [srcZone]: z };
      });
    }
    setRestSlots(prev => {
      const next = { ...prev, [slot]: [...(prev[slot] ?? []).filter(id => id !== empId), empId] };
      safeSetTimelineItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const removeFromRestSlot = useCallback((slot: string, empId: number) => {
    setRestSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      safeSetTimelineItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const dropToZone = useCallback((zone: ZoneRow, slot: string, empId: number,
    source?: { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string }
  ) => {
    // 출발지가 lunch/rest이면 그 곳에서 자동 제거
    if (source?.type === "lunch") {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "rest") {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    }
    // 출발지가 zone이면 그 zone/slot에서 제거 (같은 zone/slot이면 이동 아니므로 skip)
    setZoneSlots(prev => {
      let base = prev;
      if (source?.type === "zone" && source.zone && !(source.zone === zone && source.slot === slot)) {
        const srcZone = source.zone;
        const zSrc = { ...(base[srcZone] ?? {}) };
        zSrc[source.slot] = (zSrc[source.slot] ?? []).filter(id => id !== empId);
        base = { ...base, [srcZone]: zSrc };
      }
      const z = { ...(base[zone] ?? {}) };
      z[slot] = [...(z[slot] ?? []).filter(id => id !== empId), empId];
      const next = { ...base, [zone]: z };
      safeSetTimelineItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(next, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

  const removeFromZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setZoneSlots(prev => {
      const z = { ...(prev[zone] ?? {}) };
      z[slot] = (z[slot] ?? []).filter(id => id !== empId);
      const next = { ...prev, [zone]: z };
      safeSetTimelineItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(next, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave]);

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
    // 2026-08-17 v2 · Modal 통일
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center backdrop-brand-strong p-0 sm:p-4 pt-4 sm:pt-0" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-brand-modal w-full sm:max-w-3xl lg:max-w-4xl xl:max-w-[1100px] overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header · 2026-08-17 · 최신 트렌드 · 딥네이비 · 사이드바 통일 · 폰트 +2 */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-brand-deep text-white flex-shrink-0 gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onDateChange && (
              <button onClick={() => onDateChange(offsetDate(-1))}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white cursor-pointer shrink-0">
                <ChevronLeft size={16} />
              </button>
            )}
            <span className="text-[19px] font-extrabold tracking-tight shrink-0 break-keep">{title}</span>
            {onDateChange && (
              <button onClick={() => onDateChange(offsetDate(1))}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white cursor-pointer shrink-0">
                <ChevronRight size={16} />
              </button>
            )}
            <span className="bg-white/[0.12] text-white text-[15px] px-2.5 py-1 rounded-full font-semibold shrink-0 hidden sm:inline tabular-nums">
              근무 {workers.length}명 · 사원 {staffWorkers.length} · 약사 {pharmacistWorkers.length}
              {otherWorkers.length > 0 ? ` · 기타 ${otherWorkers.length}` : ""}
            </span>
            <span className="bg-white/[0.12] text-white text-[15px] px-2.5 py-1 rounded-full font-semibold shrink-0 sm:hidden tabular-nums">
              {workers.length}명
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Position filter tabs · 2026-08-17 · 최신 트렌드 · segmented pill · 파스텔 지양 · 폰트 +2 */}
        <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-3 pb-2 bg-white border-b border-line flex-shrink-0 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map(({ key, count }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-[15px] font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === key
                  ? "bg-brand-deep text-white shadow-sm"
                  : "text-ink-soft hover:bg-zinc-100 hover:text-ink"
              }`}>
              {key}
              <span className={`text-[13px] px-1.5 py-0.5 rounded-full tabular-nums ${activeTab === key ? "bg-white/20 text-white" : "bg-zinc-200 text-ink-soft"}`}>{count}</span>
            </button>
          ))}
          {/* 확정 버튼 · 딥네이비 accent · 최신 트렌드 */}
          <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
            {isConfirmed ? (
              <StatusPill tone="emerald" size="md" dot>
                <CheckCircle size={14} className="inline mr-1" />
                확정됨
              </StatusPill>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex items-center gap-1.5 text-[15px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white cursor-pointer disabled:opacity-40 transition-colors shadow-sm">
                <CheckCircle size={14} />
                {confirming ? "저장중…" : "확정"}
              </button>
            )}
          </div>
        </div>

        {/* 임의배치 배너 · 2026-08-17 · 최신 트렌드 · flat · 이모지 지양 */}
        {isAutoSuggested && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
            <span className="text-[15px] font-semibold text-amber-800 tracking-tight">
              임의배치 · 확정하기 전에 배치를 조정하세요
            </span>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="text-[14px] font-semibold px-3.5 py-1.5 rounded-lg bg-brand-deep text-white hover:bg-[#0d3a5c] cursor-pointer disabled:opacity-40 transition-colors ml-3 shrink-0 shadow-sm">
              {confirming ? "저장중…" : "지금 확정"}
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 select-none">

          {/* ── 근무시간 섹션 ── */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest">근무시간</span>
              {/* 미배정 직원 수 배지 — 클릭 시 이름 목록 토글 */}
              {(() => {
                const unassignedList = workers.filter(w => {
                  const inZone  = ZONE_ROWS.some(zone => Object.values(zoneSlots[zone] ?? {}).some(ids => (ids as number[]).includes(w.emp.id)));
                  const inLunch = Object.values(lunchSlots).some(ids => (ids as number[]).includes(w.emp.id));
                  const inRest  = Object.values(restSlots).some(ids => (ids as number[]).includes(w.emp.id));
                  return !inZone && !inLunch && !inRest;
                });
                if (unassignedList.length === 0) return null;
                return (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowUnassigned(v => !v)}
                      className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 cursor-pointer transition flex items-center gap-1"
                      title="클릭하여 미배정 인원 명단 보기"
                    >
                      미배정 {unassignedList.length}명
                      <span className={`text-[12px] transition-transform ${showUnassigned ? "rotate-180" : ""}`}>▾</span>
                    </button>
                    {showUnassigned && (
                      <div className="absolute z-30 mt-1 left-0 bg-white border border-orange-200 rounded-lg shadow-lg p-2 min-w-[180px] max-w-[280px] max-h-64 overflow-y-auto">
                        <div className="text-[12px] font-bold text-orange-500 uppercase tracking-wider mb-1 px-1">미배정 인원</div>
                        <div className="flex flex-wrap gap-1">
                          {unassignedList.map(w => (
                            <span key={w.emp.id}
                              className="text-[13px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-100">
                              {w.emp.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {[...new Set(workers.map(w => w.schedule.type))].map(type => {
                const colors = typeTones[type] ?? DEFAULT_TONE;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                    <span className="text-[12px] font-semibold text-zinc-500">{type}</span>
                  </div>
                );
              })}
            </div>

            {displayWorkers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2">
                <span className="text-xl">📅</span>
                <span className="text-zinc-400 text-[17px] font-medium">이 날 근무자가 없습니다</span>
              </div>
            ) : (
              <div className="flex gap-3 min-w-0">
                {/* Name column */}
                <div className="flex-shrink-0 w-[132px]">
                  <div className="h-7" />
                  {displayGroups.flatMap(g => [
                    <div key={`hdr-${g.label}`}
                      className={`mb-1 h-5 px-1 flex items-end text-[12px] font-bold uppercase tracking-wider border-b border-line ${g.hdrCls}`}>
                      {g.label} · {g.items.length}
                    </div>,
                    ...g.items.map(({ emp, schedule }) => {
                    const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                    const isPharmacist = emp.position === "약사";
                    const hasLunch = Object.values(lunchSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));
                    const hasRest  = Object.values(restSlots ?? {}).some(ids => Array.isArray(ids) && (ids as number[]).includes(emp.id));

                    // 물류 담당 구역 (물류 또는 캐셔+물류 겸직인 경우 표시)
                    const isLogistics = emp.position.includes("물류");
                    const isCashierLogistics = emp.position.includes("캐셔") && emp.position.includes("물류");
                    const showZoneBadge = isLogistics || isCashierLogistics;
                    return (
                      <div key={emp.id}
                        className={`mb-1 h-8 flex flex-col justify-center gap-0 group cursor-grab active:cursor-grabbing transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}
                        draggable
                        onDragStart={e => handleRowDragStart(e, emp.id)}
                        onDragOver={e => handleRowDragOver(e, emp.id)}
                        onDrop={handleRowDrop}
                        onDragEnd={handleRowDragEnd}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {isPharmacist
                            ? <Pill size={10} className="text-indigo-500 shrink-0" />
                            : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                          }
                          <span className={`text-[14px] whitespace-nowrap ${isPharmacist ? "text-purple-600 font-bold" : "text-zinc-800 font-bold"}`}>{emp.name}</span>
                          {/* 입사일/퇴사일 배지 — 오늘 보고 있는 날짜가 그날인 경우 표시 */}
                          {!!emp.hireDate && date === emp.hireDate && (
                            <span className="text-[11px] font-bold px-1 py-px rounded bg-emerald-500 text-white leading-none shrink-0" title={`입사일 (${emp.hireDate})`}>입사</span>
                          )}
                          {!!emp.retireDate && date === emp.retireDate && (
                            <span className="text-[11px] font-bold px-1 py-px rounded bg-rose-500 text-white leading-none shrink-0" title={`퇴사일 (${emp.retireDate})`}>퇴사</span>
                          )}
                          {/* 오픈/마감 등 근무유형을 이름 옆에 배지로 인라인 표시 (기존 별도 줄 제거) */}
                          <span className="text-[12px] font-bold leading-none shrink-0" style={{ color: colors.text }}>{schedule.type}</span>
                          {/* 배정 구역 배지: 물류 또는 캐셔+물류 직원의 담당구역 (파란색) */}
                          {showZoneBadge && (() => {
                            const zoneNumsRaw = (emp as any).zone_nums ?? (emp as any).zoneNums;
                            const zoneNums: number[] = Array.isArray(zoneNumsRaw) ? zoneNumsRaw : [];
                            if (zoneNums.length === 0) return null;
                            return (
                              <span className={`text-[11px] font-bold px-1 py-px rounded leading-none shrink-0 ${isCashierLogistics ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300" : "bg-blue-50 text-blue-600"}`}
                                title={isCashierLogistics ? "캐셔·물류 겸직" : "물류 담당구역"}>
                                {zoneNums.slice(0, 3).join("·")}{zoneNums.length > 3 ? "…" : ""}
                              </span>
                            );
                          })()}
                          {hasLunch && (
                            <span className="text-[11px] font-bold px-1 py-px rounded bg-yellow-100 text-yellow-600 leading-none shrink-0">점심</span>
                          )}
                          {hasRest && (
                            <span className="text-[11px] font-bold px-1 py-px rounded bg-violet-100 text-violet-600 leading-none shrink-0">휴게</span>
                          )}
                          {onEditEmployee && (
                            <button onClick={() => onEditEmployee(emp)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-200 transition-all cursor-pointer shrink-0">
                              <Pencil size={9} className="text-zinc-400" />
                            </button>
                          )}
                        </div>
                        {/* Editable work hours */}
                        {(() => {
                          const hoursMap = emp.position === "약사" ? (pharmTypeHoursMap ?? typeHoursMap) : typeHoursMap;
                          const displayHours = schedule.workingHours || hoursMap?.[schedule.type] || "";
                          if (editingWork?.empId === emp.id) {
                            return (
                              <div className="flex items-center gap-0.5 mt-0.5" onClick={e => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  value={editingWork.value}
                                  onChange={e => setEditingWork({ empId: emp.id, value: e.target.value })}
                                  onKeyDown={async e => {
                                    if (e.key === "Enter") {
                                      await onUpdateSchedule?.({ employeeId: emp.id, date, type: schedule.type, workingHours: editingWork.value, actualHours: schedule.actualHours || "", memo: schedule.memo || "" });
                                      setEditingWork(null);
                                    }
                                    if (e.key === "Escape") setEditingWork(null);
                                  }}
                                  placeholder="09:00-18:00"
                                  className="text-[12px] font-mono border border-line rounded px-1 py-0 w-[70px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep transition-colors"
                                />
                                <button className="text-[11px] text-indigo-500 hover:text-indigo-700 cursor-pointer font-bold"
                                  onClick={async e => { e.stopPropagation(); await onUpdateSchedule?.({ employeeId: emp.id, date, type: schedule.type, workingHours: editingWork.value, actualHours: schedule.actualHours || "", memo: schedule.memo || "" }); setEditingWork(null); }}>✓</button>
                                <button className="text-[11px] text-zinc-400 hover:text-zinc-600 cursor-pointer"
                                  onClick={e => { e.stopPropagation(); setEditingWork(null); }}>✕</button>
                              </div>
                            );
                          }
                          return displayHours ? (
                            <span
                              className={`text-[12px] font-mono leading-none cursor-pointer hover:text-indigo-600 hover:underline ${onUpdateSchedule ? "text-zinc-400" : "text-zinc-300"}`}
                              onClick={e => { if (!onUpdateSchedule) return; e.stopPropagation(); setEditingWork({ empId: emp.id, value: displayHours }); }}
                              title={onUpdateSchedule ? "클릭해서 근무시간 편집" : undefined}
                            >{displayHours}</span>
                          ) : (
                            onUpdateSchedule ? (
                              <span className="text-[12px] text-zinc-300 leading-none cursor-pointer hover:text-indigo-400"
                                onClick={e => { e.stopPropagation(); setEditingWork({ empId: emp.id, value: "" }); }}>+ 시간</span>
                            ) : null
                          );
                        })()}
                      </div>
                    );
                  }),
                  ])}
                </div>

                {/* Timeline grid */}
                <div className="flex-1 min-w-0 overflow-x-auto">
                  <div style={{ minWidth: "560px" }}>
                    {/* 1-hour time axis */}
                    <div className="relative h-7 mb-0.5">
                      <div className="absolute top-0 bottom-0 bg-orange-100 rounded pointer-events-none flex items-end justify-center pb-0.5"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }}>
                        <span className="text-[11px] font-bold text-orange-500 tracking-tight">피크타임</span>
                      </div>
                      {HOUR_SLOTS.map((slot, i) => (
                        <div key={slot} className="absolute top-0 flex flex-col items-center"
                          style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, transform: "translateX(-50%)" }}>
                          <span className={`text-[12px] whitespace-nowrap font-medium ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "text-orange-500 font-bold" : "text-zinc-400"}`}>{slot}</span>
                          <span className={`mt-0.5 block w-px h-1.5 ${parseInt(slot) >= 14 && parseInt(slot) <= 17 ? "bg-orange-300" : "bg-zinc-300"}`} />
                        </div>
                      ))}
                    </div>
                    {/* Work bars */}
                    <div className="relative">
                      <div className="absolute top-0 bottom-0 bg-orange-50 border-l-2 border-r-2 border-orange-200/70 pointer-events-none"
                        style={{ left: `${pct(14 * 60)}%`, width: `${widthPct(14 * 60, 17 * 60)}%` }} />
                      {HOUR_SLOTS.map((slot, i) => (
                        <div key={`g-${slot}`} className="absolute top-0 bottom-0 border-l pointer-events-none"
                          style={{ left: `${(i / (HOUR_SLOTS.length - 1)) * 100}%`, borderColor: "#e2e8f0" }} />
                      ))}
                      {displayGroups.flatMap(g => [
                        <div key={`sp-${g.label}`} className="mb-1 h-5" />,
                        ...g.items.map(({ emp, schedule }) => {
                        const colors = typeTones[schedule.type] ?? DEFAULT_TONE;
                        const workRange = workRanges[emp.id];
                        return (
                          <div key={emp.id}
                            className={`relative mb-1 h-8 bg-zinc-50 rounded-lg border border-zinc-100 transition-opacity ${dragRowId === emp.id ? "opacity-40" : "opacity-100"}`}>
                            {workRange ? (
                              <div className="absolute top-1 bottom-1 rounded-md opacity-90"
                                style={{
                                  left: `${pct(workRange.start)}%`,
                                  width: `${Math.max(widthPct(workRange.start, workRange.end), 0.5)}%`,
                                  backgroundColor: colors.bg,
                                }}>
                                <div className="flex items-center justify-center h-full">
                                  <span className="text-[12px] font-bold select-none truncate px-1" style={{ color: colors.text }}>
                                    {minToStr(workRange.start)}~{minToStr(workRange.end)}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <span className="text-[13px] text-zinc-300 font-medium">시간 미정</span>
                              </div>
                            )}
                          </div>
                        );
                      }),
                      ])}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                // ─────────────────────────────────────────────────────────────
                // 임의배치 콜백 (정교화 버전)
                //
                // 단계:
                //  1) 점심 배정 계산 (구역 배정보다 먼저 — 겹침 방지용)
                //     - "카운터에 없는 사람(매장/기타)"이 먼저 점심 slot 앞쪽
                //     - 같은 카운터 팀(같은 슬롯에 배정될 예정인 3명) 동시 점심 방지
                //     - 근무 시간(workRanges) 안에 있는 slot만 배정
                //     - lunchCount 명까지 동시 배정 허용 (라운드로빈)
                //  2) 점심 배정 결과를 buildAutoSuggest에 전달 → zone 배정
                //     (buildAutoSuggest 내부에서 점심 충돌 slot 자동 제외)
                //  3) 기존 zoneSlots에 현재 탭 인원 배정만 병합 (다른 탭 보존)
                //  4) lunchSlots 업데이트
                // ─────────────────────────────────────────────────────────────

                const tabIdSet = new Set(tabWorkers.map(w => w.emp.id));

                // ── 1단계: 점심 배정 계산 ─────────────────────────────────
                const lunchAssignments = new Map<number, string>(); // empId → slot

                const lunchSlotArr = [...shiftedLunchSlots];
                if (lunchSlotArr.length > 0) {
                  // 각 슬롯 가용 인원 카운터
                  const perSlotCount: Record<string, number> = {};
                  lunchSlotArr.forEach(s => { perSlotCount[s] = 0; });

                  // 점심 가능 후보: 근무 범위 내 어느 슬롯이라도 포함하는 사람
                  const lunchCandidates = tabWorkers.filter(w => {
                    const r = workRanges[w.emp.id];
                    if (!r) return true;
                    // 최소 하나의 lunch slot이 근무 범위 안에 있으면 후보
                    return lunchSlotArr.some(slot => {
                      const [lh, lm] = slot.split(":").map(Number);
                      const lStart = lh * 60 + lm;
                      return lStart >= r.start && lStart < r.end;
                    });
                  });

                  // "매장/기타" 인원이 앞에 오도록 정렬 (카운터 없는 사람 먼저 점심)
                  // 임의배치 전 기준: 약사/캐셔(카운터 후보) 후순위
                  const pharmAndCashier = new Set(
                    tabWorkers
                      .filter(w => isPharmEmp(w.emp) || w.emp.position.includes("캐셔"))
                      .map(w => w.emp.id)
                  );
                  const sortedCandidates = [...lunchCandidates].sort((a, b) => {
                    const aCounter = pharmAndCashier.has(a.emp.id) ? 1 : 0;
                    const bCounter = pharmAndCashier.has(b.emp.id) ? 1 : 0;
                    return aCounter - bCounter; // 매장 인원(0) 먼저
                  });

                  // 라운드로빈으로 slot 배정 (lunchCount 명 제한)
                  let si = 0;
                  for (const w of sortedCandidates) {
                    const empId = w.emp.id;
                    const r = workRanges[empId];
                    // 이 사람이 쓸 수 있는 슬롯 찾기 (근무 범위 + 아직 꽉 안 참)
                    let assigned = false;
                    for (let tries = 0; tries < lunchSlotArr.length; tries++) {
                      const slotKey = lunchSlotArr[(si + tries) % lunchSlotArr.length];
                      if (perSlotCount[slotKey] >= lunchCount) continue;
                      if (r) {
                        const [lh, lm] = slotKey.split(":").map(Number);
                        const lStart = lh * 60 + lm;
                        if (lStart < r.start || lStart >= r.end) continue;
                      }
                      lunchAssignments.set(empId, slotKey);
                      perSlotCount[slotKey]++;
                      si = (lunchSlotArr.indexOf(slotKey) + 1) % lunchSlotArr.length;
                      assigned = true;
                      break;
                    }
                    if (!assigned) {
                      // 사용 가능한 slot 없음 — 다음 라운드에서 처리 (배정 안 됨)
                    }
                  }
                }

                // ── 2단계: zone 배정 (점심 맵 + workRanges 전달) ─────────────
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
      </div>
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {mainToast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(mainToast.tone)}>{mainToast.message}</div>
        </div>
      )}
    </div>
  );
};
