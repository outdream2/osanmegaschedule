// 2026-08-22 · Framework Phase 4 · ProductArrivalPage.tsx large-file 분리
// 3개 UI 섹션 · props-driven pure display
//   · FinalDecisionCard · 최종 확인 카드 (거래명세표 대조 · 저장 액션)
//   · ArrivalHistoryTab · 입고내역 리스트 탭 (기간 필터 · 테이블)
//   · ArrivalDetailModal · 입고내역 상세 모달 (아이템 리스트 · KPI)

import React from "react";
import {
  ShieldCheck, ClipboardCheck, ClipboardX, CheckCircle2, XCircle,
  Sparkles, AlertCircle, Package, RefreshCw, Trash2, PackagePlus,
} from "lucide-react";
import { StatusPill } from "../common/StatusPill";
import { Badge } from "../common/Badge";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { AccentBar } from "../common/AccentBar";
import { Modal } from "../common/Modal";
import type { ArrivalItem } from "./helpers";

// ─── 입고내역 타입 (기존 inline 정의 이관) ─────────────────────
export interface ArrivalHistoryRow {
  id: number;
  arrival_date: string;
  checked_by: string | null;
  total_items: number;
  total_qty: number;
  match_count: number;
  mismatch_count: number;
  expiring_count: number;
  final_decision: string | null;
  supplier_summary: string | null;
  note: string | null;
}
export interface ArrivalHistoryDetail extends ArrivalHistoryRow {
  items: Array<{ id: number; product_code: string | null; product_name: string | null; supplier: string | null; qty: number; status: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1) FinalDecisionCard · 최종 확인 카드 (거래명세표 대조 · 저장 액션)
// ═══════════════════════════════════════════════════════════════════════════

interface FinalDecisionCardProps {
  items: ArrivalItem[];
  allDecided: boolean;
  pendingCount: number;
  finalDecision: "all_match" | "has_mismatch" | null;
  mismatchMemo: string;
  saveStatus: "idle" | "saving" | "done" | "error";
  saveError: string | null;
  savedId: number | null;
  setFinalDecision: (v: "all_match" | "has_mismatch") => void;
  setMismatchMemo: (v: string) => void;
  onSave: () => void;
}

export const FinalDecisionCard: React.FC<FinalDecisionCardProps> = ({
  items, allDecided, pendingCount, finalDecision, mismatchMemo,
  saveStatus, saveError, savedId,
  setFinalDecision, setMismatchMemo, onSave,
}) => {
  return (
    <div className={`bg-white rounded-2xl border-2 transition-colors duration-150 overflow-hidden ${
      allDecided
        ? "border-sky-300/80 shadow-[0_0_0_4px_rgba(14,165,233,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
        : "border-line/80 shadow-[0_2px_8px_rgba(0,0,0,0.05)] opacity-90"
    }`}>
      <div className={`px-5 py-4 border-b border-zinc-100/80 flex items-center justify-between gap-2 ${
        allDecided ? "bg-sky-50/60" : "bg-zinc-50/40"
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            allDecided ? "bg-sky-100" : "bg-zinc-100"
          }`}>
            <ShieldCheck size={14} className={allDecided ? "text-sky-600" : "text-zinc-400"} />
          </div>
          <span className="text-sm font-bold text-zinc-800">최종 확인 · 거래명세표 대조</span>
        </div>
        {!allDecided && items.length > 0 && (
          <StatusPill tone="amber" size="md" dot pulse>{pendingCount}건 상태 미결정</StatusPill>
        )}
      </div>

      <div className="px-5 py-4 flex flex-col gap-4">
        <p className="text-[14px] text-zinc-500 leading-relaxed">
          모든 항목의 상태를 지정한 뒤, 거래명세표와 실제 입고 물품의
          최종 일치 여부를 선택하세요.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setFinalDecision("all_match")}
            disabled={!allDecided}
            className={[
              "relative inline-flex items-center justify-center gap-2.5",
              "min-h-[56px] py-3.5 rounded-xl font-bold text-[14px] sm:text-[15px]",
              "border-2 transition-colors duration-150 cursor-pointer",
              "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
              finalDecision === "all_match"
                ? "bg-emerald-500 text-white border-emerald-500 shadow-md"
                : allDecided
                  ? "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 shadow-sm hover:shadow-md"
                  : "bg-zinc-50 text-zinc-300 border-line shadow-none",
            ].join(" ")}
          >
            {finalDecision === "all_match" && (
              <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
            )}
            <ClipboardCheck size={17} />
            전체 품목일치
          </button>

          <button
            onClick={() => setFinalDecision("has_mismatch")}
            disabled={!allDecided}
            className={[
              "relative inline-flex items-center justify-center gap-2.5",
              "min-h-[56px] py-3.5 rounded-xl font-bold text-[14px] sm:text-[15px]",
              "border-2 transition-colors duration-150 cursor-pointer",
              "disabled:cursor-not-allowed active:scale-[0.98] overflow-hidden",
              finalDecision === "has_mismatch"
                ? "bg-rose-500 text-white border-rose-500 shadow-md"
                : allDecided
                  ? "bg-white text-rose-700 border-rose-300 hover:bg-rose-50 hover:border-rose-400 shadow-sm hover:shadow-md"
                  : "bg-zinc-50 text-zinc-300 border-line shadow-none",
            ].join(" ")}
          >
            {finalDecision === "has_mismatch" && (
              <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
            )}
            <ClipboardX size={17} />
            품목 불일치 있음
          </button>
        </div>

        {finalDecision === "has_mismatch" && (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-[14px] font-bold text-rose-700">
              <ClipboardX size={13} />
              품목이상 상세 메모
            </label>
            <textarea
              value={mismatchMemo}
              onChange={(e) => setMismatchMemo(e.target.value)}
              rows={2}
              placeholder="예) 박카스디 10병 · 3개 부족 · 명세표 20 실물 17"
              className="w-full px-3.5 py-2.5 rounded-xl text-[15px] resize-none
                border-2 border-rose-200 bg-rose-50/30
                placeholder:text-rose-300 text-zinc-800
                focus:outline-none focus:border-brand-deep focus:bg-white
                focus:ring-4 focus:ring-brand-tint/60
                transition-colors duration-150"
            />
          </div>
        )}

        {finalDecision && (
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-[14px] sm:text-[15px] font-bold border-2 ${
            finalDecision === "all_match"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
          }`}>
            {finalDecision === "all_match"
              ? <CheckCircle2 size={16} />
              : <XCircle size={16} />
            }
            최종 판정: {finalDecision === "all_match"
              ? "거래명세표와 실제 입고 완전 일치"
              : "거래명세표와 실제 입고 불일치 존재"}
          </div>
        )}

        {finalDecision && (
          <div className="flex flex-col gap-2">
            <button
              onClick={onSave}
              disabled={saveStatus === "saving" || saveStatus === "done"}
              className={[
                "relative w-full min-h-[56px] py-3.5 rounded-xl",
                "font-bold text-[14px] sm:text-[15px] text-white",
                "transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed",
                "active:scale-[0.99] overflow-hidden",
                saveStatus === "done"
                  ? "bg-emerald-500 shadow-md"
                  : saveStatus === "error"
                    ? "bg-rose-500 hover:bg-rose-600 shadow-md"
                    : saveStatus === "saving"
                      ? "bg-zinc-400"
                      : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] shadow-md hover:shadow-lg",
              ].join(" ")}
            >
              <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
              <span className="relative flex items-center justify-center gap-2.5">
                {saveStatus === "saving" && <Spinner size={17} />}
                {saveStatus === "done"    && <Sparkles size={17} />}
                {saveStatus === "error"   && <AlertCircle size={17} />}
                {saveStatus === "idle"    && <PackagePlus size={17} />}
                {saveStatus === "saving" ? "등록 중..." :
                 saveStatus === "done"   ? `등록 완료 (ID: ${savedId ?? "-"})` :
                 saveStatus === "error"  ? "다시 등록" :
                 "전체 등록"}
              </span>
            </button>

            {saveError && (
              <p className="text-[14px] text-rose-600 font-semibold px-1">{saveError}</p>
            )}
            {saveStatus === "done" && (
              <p className="text-[14px] text-zinc-400 font-medium px-1 leading-relaxed">
                저장 완료. 발주/사입관리 · 입고매칭 탭에서 발주 대비 확인 가능.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) ArrivalHistoryTab · 입고내역 리스트 탭 (기간 필터 · 테이블)
// ═══════════════════════════════════════════════════════════════════════════

interface ArrivalHistoryTabProps {
  arrivals: ArrivalHistoryRow[];
  arrivalsLoading: boolean;
  arrivalDays: 7 | 30 | 90;
  setArrivalDays: (v: 7 | 30 | 90) => void;
  loadArrivals: () => void;
  selectedArrivalId: number | null;
  setSelectedArrivalId: (v: number | null) => void;
  deleteArrival: (id: number) => void;
}

export const ArrivalHistoryTab: React.FC<ArrivalHistoryTabProps> = ({
  arrivals, arrivalsLoading, arrivalDays, setArrivalDays,
  loadArrivals, selectedArrivalId, setSelectedArrivalId, deleteArrival,
}) => {
  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-4 sm:py-5 flex flex-col gap-3 min-h-0">
      <Card padding="sm" className="h-12 flex items-center gap-2.5">
        <AccentBar />
        <Package size={16} className="text-brand-deep shrink-0" />
        <span className="text-[16px] font-bold text-ink tracking-tight">입고내역</span>
        <StatusPill tone="brand" size="md">{arrivals.length}건</StatusPill>
        <span className="text-[13px] font-medium text-ink-soft ml-2 hidden sm:inline">최근 {arrivalDays}일</span>
        <div className="flex items-center gap-0.5 bg-zinc-100 border border-line rounded-lg p-1 ml-auto">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setArrivalDays(d as 7 | 30 | 90)}
              className={`text-[15px] font-semibold px-2 py-1 rounded transition whitespace-nowrap cursor-pointer ${arrivalDays === d ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {d}일
            </button>
          ))}
        </div>
        <button onClick={loadArrivals} disabled={arrivalsLoading}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 cursor-pointer disabled:opacity-50"
          title="새로고침">
          <RefreshCw size={13} className={arrivalsLoading ? "animate-spin" : ""} />
        </button>
      </Card>

      <Card clip padding="none">
        {arrivalsLoading && arrivals.length === 0 ? (
          <div className="py-12 flex items-center justify-center"><Spinner tone="zinc" size={16} label="불러오는 중..." labelSize={15} /></div>
        ) : arrivals.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-[15px] font-semibold">최근 {arrivalDays}일 입고내역 없음</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] border-collapse">
              <thead className="bg-indigo-50/50 border-b border-indigo-100 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 text-left font-bold text-indigo-800 w-10">#</th>
                  <th className="px-2 py-2 text-left font-bold text-indigo-800 w-32">등록일시</th>
                  <th className="px-2 py-2 text-left font-bold text-indigo-800 w-24">담당</th>
                  <th className="px-2 py-2 text-left font-bold text-indigo-800 min-w-[200px]">공급사 요약</th>
                  <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">품목</th>
                  <th className="px-2 py-2 text-right font-bold text-indigo-800 w-14">수량</th>
                  <th className="px-2 py-2 text-center font-bold text-emerald-700 w-14">일치</th>
                  <th className="px-2 py-2 text-center font-bold text-rose-700 w-14">불일치</th>
                  <th className="px-2 py-2 text-center font-bold text-amber-700 w-14">기한임박</th>
                  <th className="px-2 py-2 text-center font-bold text-indigo-800 w-24">최종판정</th>
                  <th className="px-2 py-2 text-center font-bold text-zinc-500 w-24">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {arrivals.map((a, i) => {
                  const d = new Date(a.arrival_date);
                  const dateStr = isNaN(d.getTime()) ? "-" : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  const isSelected = selectedArrivalId === a.id;
                  return (
                    <tr key={a.id} className={`transition ${isSelected ? "bg-indigo-50/60" : "hover:bg-zinc-50/60"}`}>
                      <td className="px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-1.5 text-zinc-700 tabular-nums font-semibold">{dateStr}</td>
                      <td className="px-2 py-1.5 text-zinc-600">{a.checked_by ?? "-"}</td>
                      <td className="px-2 py-1.5 text-zinc-600 truncate max-w-[240px]" title={a.supplier_summary ?? ""}>{a.supplier_summary ?? "-"}</td>
                      <td className="px-2 py-1.5 text-right text-zinc-800 font-bold tabular-nums">{a.total_items}</td>
                      <td className="px-2 py-1.5 text-right text-zinc-800 font-bold tabular-nums">{a.total_qty.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-center text-emerald-700 font-bold tabular-nums">{a.match_count}</td>
                      <td className="px-2 py-1.5 text-center text-rose-700 font-bold tabular-nums">{a.mismatch_count}</td>
                      <td className="px-2 py-1.5 text-center text-amber-700 font-bold tabular-nums">{a.expiring_count}</td>
                      <td className="px-2 py-1.5 text-center">
                        <StatusPill
                          tone={a.final_decision === "all_match" ? "emerald" : a.final_decision === "has_mismatch" ? "rose" : "zinc"}
                          size="md"
                        >
                          {a.final_decision === "all_match" ? "완전일치" : a.final_decision === "has_mismatch" ? "불일치 있음" : "-"}
                        </StatusPill>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => setSelectedArrivalId(a.id)}
                            className="h-7 px-2 rounded-md text-[15px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 cursor-pointer transition">
                            상세
                          </button>
                          <button type="button" onClick={() => deleteArrival(a.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 border border-line hover:border-rose-200 cursor-pointer transition"
                            title="삭제">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) ArrivalDetailModal · 입고내역 상세 모달
// ═══════════════════════════════════════════════════════════════════════════

interface ArrivalDetailModalProps {
  selectedArrivalId: number | null;
  arrivalDetail: ArrivalHistoryDetail | null;
  arrivalDetailLoading: boolean;
  onClose: () => void;
}

export const ArrivalDetailModal: React.FC<ArrivalDetailModalProps> = ({
  selectedArrivalId, arrivalDetail, arrivalDetailLoading, onClose,
}) => {
  return (
    <Modal
      open={selectedArrivalId != null}
      onClose={onClose}
      size="lg"
      title="입고내역 상세"
      icon={<Package size={18} />}
      titleAccent
      headerRight={selectedArrivalId != null ? (
        <span className="text-[13px] font-semibold text-ink-soft tabular-nums">ID {selectedArrivalId}</span>
      ) : undefined}
      backdropIntensity="brand"
    >
      <div className="flex flex-col gap-4">
          {arrivalDetailLoading || !arrivalDetail ? (
            <div className="py-12 flex items-center justify-center"><Spinner tone="zinc" size={16} label="상세 로딩 중..." labelSize={15} /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">등록일시</div>
                  </div>
                  <div className="text-[15px] font-extrabold text-ink tabular-nums leading-tight">
                    {(() => { const d = new Date(arrivalDetail.arrival_date); return isNaN(d.getTime()) ? "-" : d.toLocaleString("ko-KR"); })()}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">담당자</div>
                  </div>
                  <div className="text-[15px] font-extrabold text-ink leading-tight">{arrivalDetail.checked_by ?? "-"}</div>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <div className="text-[12px] font-semibold text-ink-soft tracking-tight">품목·수량</div>
                  </div>
                  <div className="text-[15px] font-extrabold text-emerald-700 tabular-nums leading-tight">{arrivalDetail.total_items}개 · {arrivalDetail.total_qty.toLocaleString()}수량</div>
                </div>
                {(() => {
                  const isMatch = arrivalDetail.final_decision === "all_match";
                  const isMismatch = arrivalDetail.final_decision === "has_mismatch";
                  const dotCls = isMatch ? "bg-emerald-500" : isMismatch ? "bg-rose-500" : "bg-zinc-400";
                  const textCls = isMatch ? "text-emerald-700" : isMismatch ? "text-rose-700" : "text-ink-soft";
                  const label = isMatch ? "완전일치" : isMismatch ? "불일치 있음" : "-";
                  return (
                    <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                        <div className="text-[12px] font-semibold text-ink-soft tracking-tight">최종 판정</div>
                      </div>
                      <div className={`text-[15px] font-extrabold leading-tight ${textCls}`}>{label}</div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill tone="emerald" size="md" dot>수량일치 {arrivalDetail.match_count}</StatusPill>
                <StatusPill tone="rose" size="md" dot>수량불일치 {arrivalDetail.mismatch_count}</StatusPill>
                <StatusPill tone="amber" size="md" dot>유통기한 임박 {arrivalDetail.expiring_count}</StatusPill>
              </div>
              {arrivalDetail.supplier_summary && (
                <Card variant="flat" bg="bg-sky-50" borderColor="border-sky-200" rounded="lg" padding="sm">
                  <div className="text-[15px] font-semibold text-sky-600 uppercase tracking-wider mb-1">공급사 요약</div>
                  <div className="text-[15px] font-medium text-zinc-700 break-words">{arrivalDetail.supplier_summary}</div>
                </Card>
              )}
              {arrivalDetail.note && (
                <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" rounded="lg" padding="sm">
                  <div className="text-[15px] font-semibold text-amber-700 uppercase tracking-wider mb-1">메모</div>
                  <div className="text-[15px] font-medium text-zinc-700 whitespace-pre-wrap">{arrivalDetail.note}</div>
                </Card>
              )}
              <div className="border border-line rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-zinc-50 border-b border-line flex items-center gap-2">
                  <span className="text-[14px] font-bold text-zinc-700">입고 아이템</span>
                  <span className="text-[15px] font-semibold text-zinc-500 tabular-nums">{arrivalDetail.items?.length ?? 0}개</span>
                </div>
                <div className="overflow-x-auto max-h-[40vh]">
                  <table className="w-full text-[14px]">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="border-b border-line text-[15px] font-bold text-ink tracking-tight">
                        <th className="px-2 py-1.5 text-left w-10">#</th>
                        <th className="px-2 py-1.5 text-left w-24">코드</th>
                        <th className="px-2 py-1.5 text-left min-w-[180px]">상품명</th>
                        <th className="px-2 py-1.5 text-left w-28">공급사</th>
                        <th className="px-2 py-1.5 text-right w-14">수량</th>
                        <th className="px-2 py-1.5 text-center w-20">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(arrivalDetail.items ?? []).map((it, i) => (
                        <tr key={it.id} className="hover:bg-zinc-50/60">
                          <td className="px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                          <td className="px-2 py-1.5 text-zinc-500 tabular-nums text-[15px]">{it.product_code ?? "-"}</td>
                          <td className="px-2 py-1.5 text-zinc-800 font-semibold break-words">{it.product_name ?? "-"}</td>
                          <td className="px-2 py-1.5 text-zinc-600">{it.supplier ?? "-"}</td>
                          <td className="px-2 py-1.5 text-right font-bold tabular-nums text-zinc-800">{it.qty.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-center">
                            <Badge
                              tone={it.status === "match" ? "emerald" : it.status === "mismatch" ? "rose" : it.status === "expiring" ? "amber" : "zinc"}
                              size="xs"
                              shape="square"
                            >
                              {it.status === "match" ? "일치" : it.status === "mismatch" ? "불일치" : it.status === "expiring" ? "기한임박" : "미확인"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
      </div>
    </Modal>
  );
};
