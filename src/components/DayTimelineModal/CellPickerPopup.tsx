// 2026-08-22 · Framework Phase 4 · ZoneSection.tsx large-file 분리
// CellPickerPopup · 셀 탭 팝업 (바텀시트) · 구역/점심/휴게 배정 관리
//   · props-driven · 부모 상태 유지 · self-contained helpers

import React from "react";
import { Pill } from "lucide-react";
import type { WorkerEntry, ZoneRow, SlotMap, ZoneMap, BreakCount, TypeTone } from "./types";
import { DEFAULT_TONE } from "./types";
import { isStaffEmp, isOtherEmp } from "./utils";

type CellPicker =
  | { type: "zone"; zone: ZoneRow; slot: string }
  | { type: "lunch"; slot: string }
  | { type: "rest"; slot: string };

interface CellPickerPopupProps {
  cellPicker: CellPicker;
  onClose: () => void;
  allWorkers: WorkerEntry[];
  zoneMap: ZoneMap;
  lunchSlotMap: SlotMap;
  restSlotMap: SlotMap;
  shiftedLunchSlots: string[];
  shiftedRestSlots: string[];
  lunchCount: BreakCount;
  restCount: BreakCount;
  typeTones: Record<string, TypeTone>;
  onDropToLunch: (slot: string, empId: number) => void;
  onRemoveFromLunch: (slot: string, empId: number) => void;
  onDropToRest: (slot: string, empId: number) => void;
  onRemoveFromRest: (slot: string, empId: number) => void;
  onRemoveFromZone: (zone: ZoneRow, slot: string, empId: number) => void;
  tryDropToZone: (zone: ZoneRow, slot: string, empId: number) => void;
  showError: (msg: string) => void;
}

export const CellPickerPopup: React.FC<CellPickerPopupProps> = ({
  cellPicker, onClose,
  allWorkers, zoneMap, lunchSlotMap, restSlotMap,
  shiftedLunchSlots, shiftedRestSlots, lunchCount, restCount, typeTones,
  onDropToLunch, onRemoveFromLunch, onDropToRest, onRemoveFromRest,
  onRemoveFromZone, tryDropToZone, showError,
}) => {
  const isZone   = cellPicker.type === "zone";
  const isLunch  = cellPicker.type === "lunch";
  const slot     = cellPicker.slot;
  const zone     = isZone ? (cellPicker as { type: "zone"; zone: ZoneRow; slot: string }).zone : undefined;

  const title = isZone
    ? `${zone} · ${slot}`
    : isLunch
    ? `점심 배정 (순차)`
    : `휴게 배정 (순차)`;

  const findEmpSlot = (empId: number, map: SlotMap): string | null => {
    for (const [s, arr] of Object.entries(map)) if (arr.includes(empId)) return s;
    return null;
  };
  const findFirstEmptySlot = (order: string[], map: SlotMap, cap: BreakCount): string | null => {
    for (const s of order) if ((map[s] ?? []).length < cap) return s;
    return null;
  };
  const isAssigned = (empId: number) => {
    if (isZone && zone) return ((zoneMap[zone] ?? {})[slot] ?? []).includes(empId);
    if (isLunch)        return findEmpSlot(empId, lunchSlotMap) !== null;
    return               findEmpSlot(empId, restSlotMap)  !== null;
  };
  const flattenQueue = (order: string[], map: SlotMap): number[] => {
    const out: number[] = [];
    for (const s of order) for (const id of (map[s] ?? [])) out.push(id);
    return out;
  };
  const assignedList: number[] = isZone && zone
    ? ((zoneMap[zone] ?? {})[slot] ?? [])
    : isLunch
    ? flattenQueue(shiftedLunchSlots, lunchSlotMap)
    : flattenQueue(shiftedRestSlots, restSlotMap);
  const canReorder = isLunch || cellPicker.type === "rest";

  const rebalanceQueue = (newOrder: number[], targetOrder: string[], map: SlotMap, cap: BreakCount, applyOne: (s: string, id: number) => void, removeOne: (s: string, id: number) => void) => {
    for (const [s, arr] of Object.entries(map)) for (const id of [...arr]) removeOne(s, id);
    let cursor = 0;
    for (const id of newOrder) {
      while (cursor < targetOrder.length) {
        const s = targetOrder[cursor];
        const idxInSlot = newOrder.indexOf(id) - targetOrder.slice(0, cursor).length * cap;
        if (idxInSlot < cap) { applyOne(s, id); break; }
        cursor++;
      }
    }
  };
  const moveAssigned = (empId: number, dir: -1 | 1) => {
    const idx = assignedList.indexOf(empId);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= assignedList.length) return;
    const newOrder = [...assignedList];
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    if (isLunch) {
      rebalanceQueue(newOrder, shiftedLunchSlots, lunchSlotMap, lunchCount, onDropToLunch, onRemoveFromLunch);
    } else if (cellPicker.type === "rest") {
      rebalanceQueue(newOrder, shiftedRestSlots, restSlotMap, restCount, onDropToRest, onRemoveFromRest);
    }
  };

  const toggle = (empId: number) => {
    if (isAssigned(empId)) {
      if (isZone && zone)  onRemoveFromZone(zone, slot, empId);
      else if (isLunch)    { const s = findEmpSlot(empId, lunchSlotMap); if (s) onRemoveFromLunch(s, empId); }
      else                 { const s = findEmpSlot(empId, restSlotMap);  if (s) onRemoveFromRest(s, empId); }
    } else {
      if (isZone && zone)  tryDropToZone(zone, slot, empId);
      else if (isLunch)    {
        const s = findFirstEmptySlot(shiftedLunchSlots, lunchSlotMap, lunchCount);
        if (s) onDropToLunch(s, empId);
        else showError("점심 슬롯이 모두 찼습니다. 인원수/오프셋을 조정하세요.");
      }
      else                 {
        const s = findFirstEmptySlot(shiftedRestSlots, restSlotMap, restCount);
        if (s) onDropToRest(s, empId);
        else showError("휴게 슬롯이 모두 찼습니다. 인원수/오프셋을 조정하세요.");
      }
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] backdrop-brand" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-2xl shadow-brand-modal flex flex-col"
        style={{ maxHeight: "65vh" }}>
        <div className={`flex items-center justify-between px-4 py-3 border-b ${
          isZone && zone === "카운터" ? "bg-rose-50 border-rose-200" :
          isZone ? "bg-sky-50 border-sky-200" :
          isLunch ? "bg-yellow-50 border-yellow-200" :
          "bg-violet-50 border-violet-200"
        }`}>
          <span className={`font-bold text-base ${
            isZone && zone === "카운터" ? "text-rose-700" :
            isZone ? "text-sky-700" :
            isLunch ? "text-yellow-700" : "text-violet-700"
          }`}>{title}</span>
          <button onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-xl font-bold cursor-pointer px-1">✕</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {allWorkers.length === 0 && (
            <div className="text-center text-zinc-400 text-[17px] py-8">근무자 없음</div>
          )}
          {canReorder && assignedList.length > 0 && (
            <div className="border-b border-line bg-indigo-50/30">
              <div className="px-5 py-1.5 text-[13px] font-bold uppercase tracking-wider text-indigo-700 border-b border-indigo-100 flex items-center justify-between">
                <span>배정된 인원 · 순서 조정</span>
                <span className="text-[12px] font-bold text-indigo-500">↑↓ 로 순서 변경</span>
              </div>
              {assignedList.map((empId, i) => {
                const w = allWorkers.find(ww => ww.emp.id === empId);
                if (!w) return null;
                return (
                  <div key={`ord-${empId}`} className="flex items-center gap-2 px-5 py-2 border-b border-zinc-100">
                    <span className="text-[14px] font-bold text-indigo-500 w-5">{i + 1}.</span>
                    <span className="font-bold text-[17px] text-zinc-800 flex-1 break-keep">{w.emp.name}</span>
                    <button
                      type="button"
                      onClick={() => moveAssigned(empId, -1)}
                      disabled={i === 0}
                      className="w-9 h-9 rounded-lg border border-line bg-white hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 font-bold text-base flex items-center justify-center cursor-pointer transition"
                      title="위로 이동"
                    >↑</button>
                    <button
                      type="button"
                      onClick={() => moveAssigned(empId, 1)}
                      disabled={i === assignedList.length - 1}
                      className="w-9 h-9 rounded-lg border border-line bg-white hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-600 font-bold text-base flex items-center justify-center cursor-pointer transition"
                      title="아래로 이동"
                    >↓</button>
                    <button
                      type="button"
                      onClick={() => toggle(empId)}
                      className="w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[17px] flex items-center justify-center cursor-pointer transition"
                      title="배정 제거"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {(() => {
            const popupSections: { label: string; items: typeof allWorkers; headerCls: string }[] = [
              { label: "약사", items: allWorkers.filter(w => w.emp.position === "약사"),                                                     headerCls: "bg-indigo-50 text-indigo-700 border-indigo-100" },
              { label: "사원", items: allWorkers.filter(w => isStaffEmp(w.emp)),                   headerCls: "bg-zinc-50 text-zinc-600 border-zinc-100" },
              { label: "기타", items: allWorkers.filter(w => isOtherEmp(w.emp)),                   headerCls: "bg-zinc-50 text-zinc-500 border-zinc-100" },
            ];
            return popupSections.map(({ label, items, headerCls }) => {
              if (items.length === 0) return null;
              return (
                <React.Fragment key={label}>
                  <div className={`px-5 py-1 text-[13px] font-bold uppercase tracking-wider border-b ${headerCls}`}>{label}</div>
                  {items.map(({ emp, schedule }) => {
                    const assigned = isAssigned(emp.id);
                    const c = typeTones[schedule.type] ?? DEFAULT_TONE;
                    const isPharm = emp.position === "약사";
                    return (
                      <button key={emp.id}
                        onClick={() => toggle(emp.id)}
                        className={`w-full flex items-center gap-3 px-5 py-3.5 border-b border-zinc-100 transition active:bg-zinc-100 cursor-pointer ${
                          assigned ? "bg-indigo-50" : "bg-white hover:bg-zinc-50"
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          assigned ? "bg-brand-deep border-indigo-500" : "border-zinc-300"
                        }`}>
                          {assigned && <span className="text-white text-[15px] font-bold">✓</span>}
                        </div>
                        <div className="flex flex-col items-start gap-0.5 min-w-0">
                          <div className="flex items-center gap-1">
                            {isPharm && <Pill size={11} className="text-purple-600 shrink-0" />}
                            <span className={`text-[17px] ${isPharm ? "text-purple-600 font-bold" : "text-zinc-800 font-bold"}`}>{emp.name}</span>
                          </div>
                          <span className="text-[15px] px-1.5 py-px rounded-full font-semibold"
                            style={{ backgroundColor: c.chipBg, color: c.chipText }}>{schedule.type}</span>
                        </div>
                        {assigned && (
                          <span className="ml-auto text-[14px] font-bold text-rose-400">탭해서 제거</span>
                        )}
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            });
          })()}
        </div>
        <div className="px-4 py-3 border-t border-zinc-100">
          <button onClick={onClose}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl cursor-pointer transition">
            완료
          </button>
        </div>
      </div>
    </>
  );
};
