// src/components/DisplayPage/ZoneDetailModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
import React from "react";
import { CheckCircle2, Save, Send, ScanLine, User } from "lucide-react";
import type { ZoneStatus } from "../../utils/zoneUtils";
import type { DisplayZone } from "../../utils/zoneUtils";
import type { Employee } from "./DisplayPage.types";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { Modal } from "../common/Modal";
import { Card } from "../common/Card";
import {
  DOW_ALL, DOW_LABELS,
  STATUS_LABEL, statusCell, statusDot,
} from "./DisplayPage.helpers";

const STATUS_TONE: Record<ZoneStatus, PillTone> = {
  normal: "emerald",
  low: "amber",
  empty: "rose",
};

interface ZoneDetailModalProps {
  activeZone: DisplayZone;
  draftCategory: string;
  draftProducts: string;
  draftStaffId: number | null;
  draftStatus: ZoneStatus;
  requestNote: string;
  savedFlash: boolean;
  requestFlash: boolean;
  employees: Employee[];
  staffColorMap: Map<number, number>;
  canRequest: boolean;
  onClose: () => void;
  onSetDraftStaffId: (id: number | null) => void;
  onSetDraftProducts: (v: string) => void;
  onSetDraftStatus: (s: ZoneStatus) => void;
  onSetRequestNote: (v: string) => void;
  onSave: () => void;
  onSendRequest: () => void;
  onScanProducts: () => void;
  toggleZoneDow: (zoneId: string, nameKey: string, dow: number) => void;
}

export const ZoneDetailModal: React.FC<ZoneDetailModalProps> = ({
  activeZone,
  draftProducts,
  draftStaffId,
  draftStatus,
  requestNote,
  savedFlash,
  requestFlash,
  employees,
  staffColorMap,
  canRequest,
  onClose,
  onSetDraftStaffId,
  onSetDraftProducts,
  onSetDraftStatus,
  onSetRequestNote,
  onSave,
  onSendRequest,
  onScanProducts,
  toggleZoneDow,
}) => {
  const modalTitle = (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center shrink-0 font-bold text-lg ${statusCell(draftStatus)}`}>
        {activeZone.num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-zinc-900 truncate">{activeZone.label}</div>
        <div className="text-[11px] text-zinc-500">{activeZone.category}</div>
      </div>
      <StatusPill tone={STATUS_TONE[draftStatus]} size="xs">
        {STATUS_LABEL[draftStatus]}
      </StatusPill>
    </div>
  );

  const modalFooter = (
    <div className="flex flex-col-reverse sm:flex-row gap-2 w-full">
      <button onClick={onSave}
        className="flex-1 sm:flex-none px-4 py-2.5 text-sm font-semibold rounded-xl bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 transition cursor-pointer flex items-center justify-center gap-1.5">
        <Save size={14} />저장
      </button>
      <button onClick={onSendRequest} disabled={!canRequest}
        title={!canRequest ? "상태를 부족/품절로 변경하고 담당 직원을 배정하세요" : ""}
        className="flex-1 px-4 py-2.5 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition cursor-pointer flex items-center justify-center gap-2 disabled:bg-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-400 shadow-sm shadow-violet-200">
        <Send size={15} />진열 요청 보내기
        {!canRequest && <span className="text-[10px] font-normal opacity-70">(부족·품절 + 담당자 필요)</span>}
      </button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={modalTitle}
      headerTint
      footer={modalFooter}
      className="w-full sm:max-w-lg max-h-[92vh]"
    >
      <div className="space-y-4">

        {/* Assigned staff */}
        <div>
          <label className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1 block">
            <User size={11} />담당 직원
          </label>
          {(() => {
            const assignedStaff = employees.find((e) => e.id === draftStaffId) ?? null;
            const isLogistics = assignedStaff?.position.includes("물류");
            return assignedStaff ? (
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-indigo-200 bg-indigo-50">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 bg-brand-tint text-brand-deep">
                  {assignedStaff.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-zinc-900">{assignedStaff.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isLogistics ? "bg-indigo-200 text-indigo-800" : "bg-zinc-200 text-zinc-600"}`}>
                      {assignedStaff.position || "약사"}
                    </span>
                  </div>
                </div>
                <button type="button" onClick={() => onSetDraftStaffId(null)}
                  className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer p-1">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            ) : (
              <select value="" onChange={(e) => onSetDraftStaffId(e.target.value === "" ? null : Number(e.target.value))}
                disabled={employees.length === 0}
                className="w-full px-3 py-2.5 text-sm rounded-xl border-2 border-dashed border-zinc-300 bg-white focus:border-brand-deep outline-none transition cursor-pointer disabled:bg-zinc-50 text-zinc-500">
                <option value="">— 담당 직원 선택 —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}{emp.position ? ` (${emp.position})` : ""}</option>
                ))}
              </select>
            );
          })()}
        </div>

        {/* 요일별 담당 (다중 요일 선택) */}
        {activeZone.assignedStaffName && (
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-2 flex items-center gap-1">
              적용 요일
              <span className="text-[10px] font-normal text-zinc-400">체크된 요일에만 이 담당이 표시됩니다</span>
            </label>
            <div className="space-y-2">
              {activeZone.assignedStaffName.split(",").map(s => s.trim()).filter(Boolean).map((name) => {
                const mask = activeZone.dowMap?.[name] ?? DOW_ALL;
                return (
                  <div key={name} className="flex items-center gap-2 flex-wrap px-2 py-1.5 bg-zinc-50 rounded-lg border border-line">
                    <span className="text-xs font-bold text-zinc-700 shrink-0 min-w-[3rem]">{name}</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {DOW_LABELS.map((lb, dow) => {
                        const active = ((mask >> dow) & 1) === 1;
                        return (
                          <button
                            key={dow}
                            type="button"
                            onClick={() => toggleZoneDow(activeZone.id, name, dow)}
                            className={`w-7 h-7 text-[11px] font-bold rounded-md border transition cursor-pointer ${active
                              ? (dow === 0 ? "bg-rose-500 text-white border-rose-500"
                                : dow === 6 ? "bg-sky-500 text-white border-sky-500"
                                  : "bg-brand-deep text-white border-indigo-500")
                              : "bg-white text-zinc-400 border-line hover:border-zinc-300"
                            }`}
                            title={`${lb}요일 ${active ? "제외" : "포함"}`}
                          >{lb}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <label className="text-xs font-semibold text-zinc-600 mb-2 block">진열 상태</label>
          <div className="grid grid-cols-3 gap-2">
            {(["normal", "low", "empty"] as const).map((s) => (
              <button key={s} type="button" onClick={() => onSetDraftStatus(s)}
                className={`py-2.5 text-xs font-semibold rounded-xl border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${draftStatus === s
                  ? s === "normal" ? "bg-emerald-50 text-emerald-700 border-emerald-400 shadow-sm"
                    : s === "low" ? "bg-amber-50 text-amber-700 border-amber-400 shadow-sm"
                      : "bg-red-50 text-red-700 border-red-400 shadow-sm"
                  : "bg-white text-zinc-500 border-line hover:border-zinc-300"}`}>
                <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Products */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-600">진열 상품 메모</label>
            <button
              type="button"
              onClick={onScanProducts}
              title="바코드 스캔으로 상품 추가"
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
            >
              <ScanLine size={11} />
              바코드 스캔
            </button>
          </div>
          <textarea value={draftProducts} onChange={(e) => onSetDraftProducts(e.target.value)} rows={2}
            placeholder="예: 타이레놀 500mg, 베아제, 판콜에이..."
            className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 bg-white focus:border-brand-deep focus:ring-2 focus:ring-brand-tint outline-none transition resize-none" />
        </div>

        {/* Request note */}
        {(draftStatus === "low" || draftStatus === "empty") && (
          <div>
            <label className="text-xs font-semibold text-zinc-600 mb-1.5 block">요청 메모 (선택)</label>
            <input type="text" value={requestNote} onChange={(e) => onSetRequestNote(e.target.value)}
              placeholder="오늘 오후까지 보충 부탁드립니다"
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-300 bg-white focus:border-brand-deep outline-none transition" />
          </div>
        )}

        {savedFlash && (
          <Card variant="flat" bg="bg-emerald-50" borderColor="border-emerald-200" padding="none" className="px-3 py-2 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 size={13} />저장되었습니다
          </Card>
        )}
        {requestFlash && (
          <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" padding="none" className="px-3 py-2 text-violet-700 text-xs font-semibold flex items-center gap-1.5">
            <Send size={13} />진열 요청이 전송되었습니다
          </Card>
        )}
      </div>
    </Modal>
  );
};
