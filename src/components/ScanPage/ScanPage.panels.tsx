// 2026-08-22 · Framework Phase 4 · ScanPage.tsx large-file 분리
// 4개 UI 섹션 · props-driven pure display
//   · ScanLeftPanel · 좌측 스캐너 + 최근 스캔 상품 카드
//   · SaveCard · 우측 하단 전체 저장 카드 (대량 저장 액션)
//   · HistoryModal · 실재고 저장 이력 모달
//   · ReviewSheet · 등록 전 검토 시트 (Modal)

import React from "react";
import {
  ScanLine, AlertCircle, RotateCcw, X, History, SaveAll, Sparkles, Megaphone,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { IconTile } from "../common/IconTile";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
import { Modal } from "../common/Modal";
import { ProductSearchInput } from "../common/features/ProductSearchInput";
import { calcRowTotal, type StockRow } from "./stockRowTypes";
import type { ProductInfo } from "../../lib/productsCache";
import type { InventoryHistoryRow } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════
// 1) ScanLeftPanel · 스캐너 버튼 + 상품 검색 + 최근 스캔 상품 카드
// ═══════════════════════════════════════════════════════════════════════════

interface ScanLeftPanelProps {
  mapLoading: boolean;
  autoIncOn: boolean;
  onToggleAutoInc: () => void;
  notFoundCode: string | null;
  lastProduct: ProductInfo | null;
  lastCode: string | null;
  requestingKey: string | null;
  rows: StockRow[];
  onOpenScanner: () => void;
  onScan: (code: string, preloadedProduct?: ProductInfo | null) => void;
  onRequestDisplay: (row: StockRow) => void;
  /** 2026-08-23 · #179 · 미등록 상품 즉시 등록 · 권한자만 노출 */
  canManageProducts?: boolean;
  onOpenCreate?: (code: string) => void;
}

export const ScanLeftPanel: React.FC<ScanLeftPanelProps> = ({
  mapLoading, autoIncOn, onToggleAutoInc,
  notFoundCode, lastProduct, lastCode, requestingKey, rows,
  onOpenScanner, onScan, onRequestDisplay,
  canManageProducts, onOpenCreate,
}) => {
  return (
    <Card clip padding="none">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line bg-zinc-50/60">
        <AccentBar className="shrink-0" />
        <ScanLine size={18} className="text-brand-deep shrink-0" />
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-ink leading-tight tracking-tight">바코드 스캔</p>
          <p className="text-[15px] text-ink-soft leading-tight mt-0.5">스캔 시 우측 리스트에 자동 등록</p>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3">
        <button
          onClick={onOpenScanner}
          disabled={mapLoading}
          className="w-full h-11 flex items-center justify-center gap-2 rounded-md font-bold text-[14px] text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {mapLoading
            ? <><Spinner size={16} /> 상품 정보 로딩...</>
            : <><ScanLine size={16} /> 바코드 스캔</>
          }
        </button>

        {/* 2026-08-25 · 사용자 지시 · 검색 선택 시 · product 객체도 함께 전달 (fallback preload)
              · 원인 · products-map 캐시 stale 시 · lookupProduct null → 미등록 오탐지 */}
        <ProductSearchInput
          accent="teal"
          placeholder="상품명·코드 검색"
          onSelect={(code, p) => onScan(code, p)}
        />

        <label className="flex items-center gap-2 text-[15px] text-zinc-600 font-semibold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoIncOn}
            onChange={onToggleAutoInc}
            className="w-3.5 h-3.5 accent-teal-500"
          />
          <span>중복 스캔 시 매1 자동 +1</span>
        </label>

        {notFoundCode && !lastProduct && (
          <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200/80" padding="sm" className="flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-amber-800 leading-none">미등록 상품 코드</p>
                <p className="text-[15px] font-mono tabular-nums text-amber-700 break-all mt-1.5
                  bg-amber-100/60 px-2 py-1 rounded-md">
                  {notFoundCode}
                </p>
              </div>
            </div>
            {/* 2026-08-23 · #179 · 권한자만 등록 유도 · #177 ProductCreateModal 재사용 */}
            {canManageProducts && onOpenCreate && (
              <button
                type="button"
                onClick={() => onOpenCreate(notFoundCode)}
                className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-md
                  bg-amber-600 hover:bg-amber-700 active:bg-amber-800
                  text-white text-[15px] font-bold shadow-sm transition-colors cursor-pointer"
                title="스캔한 바코드로 상품 신규 등록"
              >
                + 이 코드로 상품 등록
              </button>
            )}
          </Card>
        )}

        {/* 2026-08-26 · 사용자 지시 · 최근 스캔 · 하나 → 다수 리스트 · 최근 것 맨 위
              · rows 는 이미 [newRow, ...prev] 로 최신순 정렬됨 · 그대로 렌더
              · 참고 props · lastProduct/lastCode/requestingKey/onRequestDisplay · 하위 호환 유지 */}
        {rows.length > 0 && (
          <div className="flex flex-col rounded-2xl overflow-hidden bg-white border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_16px_rgba(10,46,74,0.08)]">
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-zinc-50/60 border-b border-line">
              <StatusPill tone="emerald" size="sm" dot>최근 스캔</StatusPill>
              <span className="ml-auto text-[15px] text-ink-soft tabular-nums">{rows.length}건 · 최신순</span>
            </div>
            <div className="divide-y divide-line max-h-[360px] overflow-y-auto">
              {rows.slice(0, 20).map((r, idx) => {
                const isLatest = idx === 0;
                return (
                  <div
                    key={r.key}
                    className={`px-3.5 py-2 flex flex-col gap-0.5 hover:bg-zinc-50/70 transition-colors ${isLatest ? "bg-emerald-50/40" : ""}`}
                  >
                    <div className="flex items-baseline gap-2 min-w-0">
                      {isLatest && <span className="shrink-0 text-[14px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded px-1 py-0.5 leading-none">NEW</span>}
                      <p className="text-[14px] sm:text-[15px] font-bold text-zinc-900 break-words whitespace-normal leading-snug flex-1 min-w-0">
                        {r.product.name || "-"}
                      </p>
                      <span className="shrink-0 text-[14px] font-mono tabular-nums text-ink-soft/70">{r.code}</span>
                    </div>
                    <div className="flex items-baseline gap-2 flex-wrap text-[14px]">
                      {(r.product as any).spec && (
                        <span className="inline-flex items-baseline gap-1">
                          <span className="text-zinc-400 font-semibold">구역</span>
                          <span className="text-violet-700 font-bold">{(r.product as any).spec}</span>
                        </span>
                      )}
                      {(r.product as any).supplier && (
                        <span className="inline-flex items-baseline gap-1 min-w-0">
                          <span className="text-zinc-400 font-semibold">공급사</span>
                          <span className="text-sky-700 font-bold truncate max-w-[140px]">{(r.product as any).supplier}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {rows.length > 20 && (
                <div className="px-3.5 py-1.5 text-center text-[14px] text-zinc-400 bg-zinc-50/40">
                  전체 {rows.length}건 중 최근 20건 표시
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 2) SaveCard · 전체 저장 카드 (idle · saving · done · error 상태별 스타일)
// ═══════════════════════════════════════════════════════════════════════════

interface SaveCardProps {
  rows: StockRow[];
  saveStatus: "idle" | "saving" | "done" | "error";
  savedCount: number;
  saveError: string | null;
  onReview: () => void;
  onReset: () => void;
}

export const SaveCard: React.FC<SaveCardProps> = ({
  rows, saveStatus, savedCount, saveError, onReview, onReset,
}) => {
  if (rows.length === 0) return null;
  return (
    <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-colors duration-150 ${
      saveStatus === "done"
        ? "border-emerald-300/80 shadow-[0_0_0_4px_rgba(16,185,129,0.08),0_4px_16px_rgba(0,0,0,0.08)]"
        : "border-line/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
    }`}>
      {/* 2026-08-25 · 사용자 지시 · 합계 · product_storage.png 톤 (창고 cyan · 매장 violet 파스텔) 적용 */}
      <div className={`px-5 py-3.5 border-b border-zinc-100/80 flex items-center justify-between gap-2 flex-wrap ${
        saveStatus === "done" ? "bg-emerald-50/60" : "bg-zinc-50/40"
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
            saveStatus === "done" ? "bg-emerald-100" : "bg-zinc-100"
          }`}>
            <SaveAll size={14} className={saveStatus === "done" ? "text-emerald-600" : "text-zinc-400"} />
          </div>
          <span className="text-[16px] font-bold text-zinc-800">전체 등록</span>
        </div>
        {(() => {
          const num = (v: number | null | undefined | "") => (v != null && v !== "" ? Number(v) : 0);
          const warehouseTotal = rows.reduce((acc, r) =>
            acc + num(r.prevWarehouse1Qty) + num(r.warehouse1AddQty)
                + num(r.prevWarehouse2Qty) + num(r.warehouse2AddQty), 0);
          const storeTotal = rows.reduce((acc, r) =>
            acc + num(r.prevStore1Qty) + num(r.store1AddQty)
                + num(r.prevStore2Qty) + num(r.store2AddQty)
                + num(r.prevStore3Qty) + num(r.store3AddQty), 0);
          const grandTotal = warehouseTotal + storeTotal;
          return (
            <div className="flex items-center gap-1.5 tabular-nums text-[14px] font-bold">
              <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700">
                <span className="text-[14px] font-semibold text-zinc-500">건수</span>
                <span>{rows.length}</span>
              </span>
              <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-800" title="창고1 + 창고2 합계">
                <span className="text-[14px] font-semibold text-cyan-600">창고</span>
                <span>{warehouseTotal}</span>
              </span>
              <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-violet-800" title="매장1 + 매장2 + 매장3 합계">
                <span className="text-[14px] font-semibold text-violet-600">매장</span>
                <span>{storeTotal}</span>
              </span>
              <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-brand-tint border border-brand-deep/20 text-brand-deep" title="창고 + 매장 총합">
                <span className="text-[14px] font-semibold text-brand-deep/70">총합</span>
                <span>{grandTotal}</span>
              </span>
            </div>
          );
        })()}
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {/* 2026-08-23 · #202 · 사용자 지시 · 전체 등록 버튼 바로 위 · 등록 준비 요약 리스트 */}
        <div className="rounded-lg border border-line/70 bg-zinc-50/50 divide-y divide-zinc-100 overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-2 bg-white/60 border-b border-line/60">
            <span className="text-[14px] font-bold text-ink tracking-tight">등록 준비 요약</span>
            <span className="ml-auto text-[14px] text-zinc-500 tabular-nums font-medium">{rows.length}건</span>
          </div>
          <ul className="max-h-[36vh] overflow-auto">
            {rows.map((r, idx) => {
              const total = calcRowTotal(r);
              const location = String((r.product as any).realMap ?? (r.product as any).real_map ?? "").trim();
              return (
                <li key={r.key} className="px-3 py-1.5 flex items-center gap-2 text-[14px] hover:bg-white/60 transition-colors">
                  <span className="w-5 h-5 shrink-0 rounded bg-brand-tint text-brand-deep inline-flex items-center justify-center text-[15px] font-bold tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.product.name}</span>
                  {location && (
                    <span className="shrink-0 text-[15px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                      {location}
                    </span>
                  )}
                  <span className="shrink-0 text-[14px] font-bold text-brand-deep tabular-nums">{total}개</span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="text-[14px] text-zinc-500 leading-relaxed">
          리스트의 모든 항목을 한 번에 저장합니다.
          창고1·2 · 매장1·2·3 수량과 구역을 확인한 뒤 아래 버튼을 누르세요.
        </p>

        <button
          onClick={onReview}
          disabled={saveStatus === "saving" || saveStatus === "done" || rows.length === 0}
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
                  : "bg-teal-600 hover:bg-teal-700 shadow-md hover:shadow-lg",
          ].join(" ")}
        >
          <span className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent pointer-events-none" />
          <span className="relative flex items-center justify-center gap-2.5">
            {saveStatus === "saving" && <Spinner size={17} />}
            {saveStatus === "done"    && <Sparkles size={17} />}
            {saveStatus === "error"   && <AlertCircle size={17} />}
            {saveStatus === "idle"    && <SaveAll size={17} />}
            {saveStatus === "saving" ? "저장 중..." :
             saveStatus === "done"   ? `저장 완료 (${savedCount}건)` :
             saveStatus === "error"  ? "다시 시도" :
             `전체 등록 (${rows.length}건)`}
          </span>
        </button>

        {saveError && (
          <p className="text-[14px] text-rose-600 font-semibold px-1">{saveError}</p>
        )}

        {saveStatus === "done" && (
          <div className="flex items-center gap-2">
            <p className="text-[14px] text-emerald-600 font-semibold flex-1">
              저장 완료. 재고관리 · 실재고 탭에서 차이 있는 상품을 확인할 수 있습니다.
            </p>
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[15px] font-bold
                text-zinc-500 bg-white border border-line hover:bg-zinc-50
                transition cursor-pointer shrink-0"
            >
              <RotateCcw size={11} /> 목록 초기화
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 3) HistoryModal · 실재고 저장 이력 모달
// ═══════════════════════════════════════════════════════════════════════════

interface HistoryModalProps {
  historyModal: { code: string; name: string } | null;
  historyRows: InventoryHistoryRow[];
  historyLoading: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  historyModal, historyRows, historyLoading, onClose,
}) => {
  // 2026-08-23 · v3.2 · Modal primitive · align="bottom-mobile" 재마이그레이션
  return (
    <Modal
      open={!!historyModal}
      onClose={onClose}
      align="bottom-mobile"
      zIndex={9998}
      size="md"
      bodyPadding="none"
      showClose={false}
    >
      {historyModal && (
        <div className="flex flex-col h-full">
          <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/60 flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-teal-600 uppercase tracking-widest">실재고 저장 이력</div>
              <div className="text-[16px] font-bold text-zinc-800 truncate">{historyModal.name}</div>
              <div className="text-[14px] text-zinc-400 font-mono">{historyModal.code}</div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer shrink-0"
              title="닫기"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-400 text-[14px] font-semibold">
                <Spinner size={16} className="mr-2" /> 이력 조회 중...
              </div>
            ) : historyRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-zinc-400 text-[14px] font-semibold">
                <History size={22} className="mb-2 text-zinc-300" />
                저장 이력이 없습니다.
              </div>
            ) : (
              <table className="w-full text-[15px]">
                <thead className="bg-zinc-50 border-b border-line text-[14px] uppercase tracking-widest text-zinc-500 font-bold">
                  <tr>
                    <th className="px-3 py-2 text-left">일시</th>
                    <th className="px-2 py-2 text-center">창1</th>
                    <th className="px-2 py-2 text-center">창2</th>
                    <th className="px-2 py-2 text-center">매1</th>
                    <th className="px-2 py-2 text-center">매2</th>
                    <th className="px-2 py-2 text-center">매3</th>
                    <th className="px-3 py-2 text-left">담당</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {historyRows.map(h => {
                    const dt = h.checked_at ? new Date(h.checked_at) : null;
                    const dtLabel = dt
                      ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`
                      : "-";
                    const w1 = h.warehouse1_stock ?? h.warehouse_stock;
                    return (
                      <tr key={h.id} className="hover:bg-teal-50/40">
                        <td className="px-3 py-2 tabular-nums text-zinc-700 whitespace-nowrap">{dtLabel}</td>
                        <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{w1 ?? "-"}</td>
                        <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.warehouse2_stock ?? "-"}</td>
                        <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store_stock ?? "-"}</td>
                        <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store_stock_2 ?? "-"}</td>
                        <td className="px-2 py-2 text-center tabular-nums font-bold text-zinc-700">{h.store3_stock ?? "-"}</td>
                        <td className="px-3 py-2 text-zinc-600 truncate max-w-[100px]">{h.checked_by ?? "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-5 py-2.5 border-t border-zinc-100 bg-zinc-50/60 text-[14px] text-zinc-400 font-semibold text-center shrink-0">
            같은 날 저장은 덮어쓰고, 다른 날 저장은 이력으로 추가됩니다.
          </div>
        </div>
      )}
    </Modal>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// 4) ReviewSheet · 등록 전 검토 시트 (Modal · saveStatus disabled 반영)
// ═══════════════════════════════════════════════════════════════════════════

interface ReviewSheetProps {
  reviewOpen: boolean;
  rows: StockRow[];
  saveStatus: "idle" | "saving" | "done" | "error";
  onClose: () => void;
  onConfirm: () => void;
}

export const ReviewSheet: React.FC<ReviewSheetProps> = ({
  reviewOpen, rows, saveStatus, onClose, onConfirm,
}) => {
  return (
    <Modal
      open={reviewOpen}
      onClose={onClose}
      titleAccent
      icon={<SaveAll size={18} />}
      title="등록 전 검토"
      headerRight={
        <StatusPill tone="brand" size="md">
          {rows.length}건 · {rows.reduce((acc, r) => acc + calcRowTotal(r), 0)}개
        </StatusPill>
      }
      size="md"
      footer={
        <>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint
              text-ink text-[14px] font-bold transition cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            disabled={saveStatus === "saving" || rows.length === 0}
            className="h-10 px-6 rounded-lg bg-brand-deep hover:bg-brand-deep/90
              shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_-1px_rgba(10,46,74,0.25)]
              text-white text-[15px] font-bold disabled:opacity-60 disabled:cursor-not-allowed transition cursor-pointer"
          >
            확정 · {rows.length}건 저장
          </button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-line/60">
        {rows.map((r, idx) => {
          const total = calcRowTotal(r);
          const added =
            (Number(r.warehouse1AddQty) || 0) +
            (Number(r.warehouse2AddQty) || 0) +
            (Number(r.store1AddQty) || 0) +
            (Number(r.store2AddQty) || 0) +
            (Number(r.store3AddQty) || 0);
          return (
            <li key={r.key} className="px-1 py-3 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors rounded-lg">
              <span className="w-7 h-7 shrink-0 rounded-lg bg-brand-tint text-brand-deep
                inline-flex items-center justify-center text-[14px] font-bold tabular-nums
                shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_1px_2px_rgba(10,46,74,0.05)]">
                {idx + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink tracking-tight truncate">
                  {r.product.name}
                </div>
                <div className="text-[14px] text-ink-soft font-mono tabular-nums truncate mt-0.5">
                  #{r.code}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {added > 0 ? (
                  <StatusPill tone="emerald" size="sm">+{added}</StatusPill>
                ) : (
                  <span className="text-[14px] font-semibold text-zinc-300">변화 없음</span>
                )}
                <span className={`text-[18px] font-bold tabular-nums tracking-tight ${
                  total > 0 ? "text-brand-deep" : "text-zinc-300"
                }`}>
                  {total}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};
