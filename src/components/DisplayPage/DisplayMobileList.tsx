// src/components/DisplayPage/DisplayMobileList.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage 모바일 구역 리스트 + fullscreen 구역도 분리
import React from "react";
import { Card } from "../common/Card";
import { StoreZoneMap } from "../common/StoreZoneMap";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { ZoneDef } from "../../hooks/useZoneDefs";
import type { Employee } from "./DisplayPage.types";
import type { ZoneProductsModalState } from "./ZoneProductsModal";
import { STAFF_COLORS } from "./DisplayPage.helpers";

const CAT_A: Record<number, string> = { 1:"bg-blue-500 text-white",2:"bg-yellow-400 text-yellow-950",3:"bg-red-500 text-white",4:"bg-pink-500 text-white",5:"bg-lime-500 text-lime-950",6:"bg-sky-500 text-white",7:"bg-brand-deep text-white",8:"bg-purple-500 text-white" };
const CAT_B: Record<number, string> = { 1:"bg-blue-100 text-blue-900",2:"bg-yellow-100 text-yellow-900",3:"bg-red-100 text-red-900",4:"bg-pink-100 text-pink-900",5:"bg-lime-100 text-lime-900",6:"bg-sky-100 text-sky-900",7:"bg-indigo-100 text-indigo-900",8:"bg-purple-100 text-purple-900" };

interface DisplayMobileListProps {
  zones: DisplayZone[];
  employees: Employee[];
  staffColorMap: Map<number, number>;
  fullMapOpen: boolean;
  setFullMapOpen: (v: boolean) => void;
  onZoneProductsOpen: (args: ZoneProductsModalState) => void;
  onZoneCellClick: (zone: DisplayZone, rect: DOMRect) => void;
  renderRequestButton: (num: number, id?: string) => React.ReactNode;
  ZONE_DEFS: ZoneDef[];
}

export const DisplayMobileList: React.FC<DisplayMobileListProps> = ({
  zones, employees, staffColorMap, fullMapOpen, setFullMapOpen,
  onZoneProductsOpen, onZoneCellClick, renderRequestButton, ZONE_DEFS,
}) => {
  const getPillCls = (z: DisplayZone): string => {
    if (z.num >= 1 && z.num <= 8) return z.id.endsWith("A") ? CAT_A[z.num] : CAT_B[z.num];
    return "bg-amber-800 text-white";
  };

  return (
    <>
      <Card clip padding="none" className="sm:hidden mb-2">
        <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50 flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="text-[13px] font-bold text-zinc-700">구역 리스트</span>
          <span className="text-[10px] font-mono text-zinc-400">({zones.length}개)</span>
          <button type="button" onClick={() => setFullMapOpen(true)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[10px] font-bold shadow-sm active:scale-95 transition">
            매장 구역도 보기
          </button>
        </div>
        <ul className="divide-y divide-zinc-100 max-h-[70vh] overflow-y-auto">
          {[...zones].sort((a, b) => a.num !== b.num ? a.num - b.num : (a.id.endsWith("A") ? 0 : 1) - (b.id.endsWith("A") ? 0 : 1)).map(z => {
            const zoneLabel = z.num <= 8 ? `${z.num}${z.id.endsWith("A") ? "A" : z.id.endsWith("B") ? "B" : ""}` : String(z.num);
            const pillCls = getPillCls(z);
            const staffNames = z.assignedStaffName ? z.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean) : [];
            return (
              <li key={`mobile-list-${z.id}`} className="grid grid-cols-[40px_1fr_84px_62px] items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 transition">
                <button type="button" onClick={() => onZoneProductsOpen({ zoneId: z.id, zoneNum: z.num, zoneLabel, category: z.category })} className={`w-full h-[38px] rounded text-[13px] font-bold flex items-center justify-center leading-none active:scale-95 transition ${pillCls}`}>{zoneLabel}</button>
                <span className="text-[12px] font-bold text-zinc-800 break-keep whitespace-normal leading-tight">{z.category || "-"}</span>
                <div className="flex flex-wrap gap-1 justify-end cursor-pointer" onClick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); onZoneCellClick(z, rect); }} title="담당자 변경">
                  {staffNames.length > 0 ? staffNames.map((name) => {
                    const emp = employees.find(e2 => e2.name === name);
                    const colorIdx = emp ? (staffColorMap.get(emp.id) ?? 0) : 0;
                    const chip = STAFF_COLORS[colorIdx % STAFF_COLORS.length];
                    const isPharm = emp ? (emp.position === "약사" || emp.position.startsWith("약사")) : false;
                    return <span key={`${z.id}-${name}`} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-bold border ${chip} active:scale-95 transition ${isPharm ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}>{name}</span>;
                  }) : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-zinc-400 bg-zinc-50 border border-dashed border-zinc-300 active:scale-95 transition">+ 배정</span>}
                </div>
                <div className="w-full">{renderRequestButton(z.num, z.id)}</div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* 모바일 fullscreen 구역도 */}
      {fullMapOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-zinc-900/70 backdrop-blur-sm flex flex-col" onClick={() => setFullMapOpen(false)}>
          <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-line shadow-sm">
            <span className="text-sm font-bold text-zinc-800">매장 구역도 (읽기 전용)</span>
            <button onClick={() => setFullMapOpen(false)} className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 text-lg font-bold">×</button>
          </div>
          <div className="flex-1 overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-2 bg-zinc-100">
              <div className="p-2 bg-zinc-200 rounded-2xl border-4 border-emerald-500 shadow-inner">
                <StoreZoneMap onZoneClick={(zoneId) => {
                  const num = parseInt(zoneId, 10);
                  const side = /[AB]$/.test(zoneId) ? zoneId.slice(-1) : "";
                  const zd = ZONE_DEFS.find(z => z.num === num);
                  const category = side === "A" ? (zd?.subA ?? zd?.category ?? "") : side === "B" ? (zd?.subB ?? zd?.category ?? "") : (zd?.category ?? "");
                  onZoneProductsOpen({ zoneId, zoneNum: num, zoneLabel: side ? `진열대 ${num}${side}` : (num === 22 ? "진열대 22" : `벽면 ${num}`), category });
                  setFullMapOpen(false);
                }} />
              </div>
            </div>
          </div>
          <div className="px-3 py-2 bg-white border-t border-line text-[10px] text-zinc-500 text-center">좌우로 드래그하여 전체 구역도 확인 · 셀 클릭 → 진열상품 조회</div>
        </div>
      )}
    </>
  );
};
