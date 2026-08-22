// 2026-08-22 · Framework Phase 4 · DayTimelineModal drop/remove 핸들러 훅 이관
// 점심/휴게/구역 slot 배치 · atomic 이동 (출발지 자동 제거) · 겹침·중복 검증 · localStorage 즉시반영 + 자동저장

import { useCallback } from "react";
import type { Employee } from "../../types";
import type { SlotMap, ZoneMap, ZoneRow, BreakInterval, BreakCount } from "./types";
import { ZONE_ROWS } from "./types";
import { safeSetTimelineItem } from "./utils";

type Source = { type: "zone" | "lunch" | "rest"; zone?: ZoneRow; slot: string };

interface UseSlotHandlersDeps {
  date: string;
  employees: Employee[];
  lunchSlots: SlotMap;
  restSlots: SlotMap;
  zoneSlots: ZoneMap;
  setLunchSlots: React.Dispatch<React.SetStateAction<SlotMap>>;
  setRestSlots: React.Dispatch<React.SetStateAction<SlotMap>>;
  setZoneSlots: React.Dispatch<React.SetStateAction<ZoneMap>>;
  lunchOffset: number;
  restOffset: number;
  lunchInterval: BreakInterval;
  restInterval: BreakInterval;
  lunchCount: BreakCount;
  restCount: BreakCount;
  scheduleAutoSave: (
    zones: ZoneMap, lunch: SlotMap, rest: SlotMap,
    lo: number, ro: number, li: BreakInterval, ri: BreakInterval,
    lc: BreakCount, rc: BreakCount,
  ) => void;
  mainShowError: (msg: string) => void;
}

export function useSlotHandlers(deps: UseSlotHandlersDeps) {
  const {
    date, employees,
    lunchSlots, restSlots, zoneSlots,
    setLunchSlots, setRestSlots, setZoneSlots,
    lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount,
    scheduleAutoSave, mainShowError,
  } = deps;

  const dropToLunchSlot = useCallback((slot: string, empId: number, source?: Source) => {
    const [lh, lm] = slot.split(":").map(Number);
    const lStart = lh * 60 + lm;
    const lEnd = lStart + 30;
    const lunchDup = Object.entries(lunchSlots).some(([ls, ids]) => {
      if (source?.type === "lunch" && source.slot === ls) return false;
      if (!(ids as number[]).includes(empId)) return false;
      const [oh, om] = ls.split(":").map(Number);
      const oStart = oh * 60 + om;
      const oEnd = oStart + 30;
      return oStart < lEnd && oEnd > lStart;
    });
    if (lunchDup) { mainShowError("이미 배정되었습니다.\n같은 시간대에 이미 점심이 배정되어 있습니다."); return; }
    const targetEmp = employees.find(e => e.id === empId);
    if (targetEmp?.position === "약사") {
      const existingIds = (lunchSlots[slot] ?? []).filter(id => id !== empId);
      const hasOtherPharm = existingIds.some(id => employees.find(e => e.id === id)?.position === "약사");
      if (hasOtherPharm) { mainShowError("한 시간대에 약사는 1명만 점심 배정할 수 있습니다.\n(매장에 최소 1명 약사가 남아있어야 합니다)"); return; }
    }
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
  }, [date, zoneSlots, restSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, employees, setLunchSlots, setRestSlots, setZoneSlots, mainShowError]);

  const removeFromLunchSlot = useCallback((slot: string, empId: number) => {
    setLunchSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      safeSetTimelineItem(`tl_lunch_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, next, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, setLunchSlots]);

  const dropToRestSlot = useCallback((slot: string, empId: number, source?: Source) => {
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
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, setLunchSlots, setRestSlots, setZoneSlots, mainShowError]);

  const removeFromRestSlot = useCallback((slot: string, empId: number) => {
    setRestSlots(prev => {
      const next = { ...prev, [slot]: (prev[slot] ?? []).filter(id => id !== empId) };
      safeSetTimelineItem(`tl_rest_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(zoneSlots, lunchSlots, next, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, zoneSlots, lunchSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, setRestSlots]);

  const dropToZone = useCallback((zone: ZoneRow, slot: string, empId: number, source?: Source) => {
    if (source?.type === "lunch") {
      setLunchSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    } else if (source?.type === "rest") {
      setRestSlots(prev => ({ ...prev, [source.slot]: (prev[source.slot] ?? []).filter(id => id !== empId) }));
    }
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
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, setLunchSlots, setRestSlots, setZoneSlots]);

  const removeFromZone = useCallback((zone: ZoneRow, slot: string, empId: number) => {
    setZoneSlots(prev => {
      const z = { ...(prev[zone] ?? {}) };
      z[slot] = (z[slot] ?? []).filter(id => id !== empId);
      const next = { ...prev, [zone]: z };
      safeSetTimelineItem(`tl_zone_slots_${date}`, JSON.stringify(next));
      scheduleAutoSave(next, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount);
      return next;
    });
  }, [date, lunchSlots, restSlots, lunchOffset, restOffset, lunchInterval, restInterval, lunchCount, restCount, scheduleAutoSave, setZoneSlots]);

  return { dropToLunchSlot, removeFromLunchSlot, dropToRestSlot, removeFromRestSlot, dropToZone, removeFromZone };
}
