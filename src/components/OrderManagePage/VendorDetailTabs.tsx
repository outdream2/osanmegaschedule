// 2026-08-17 · apiClient 마이그레이션
// src/components/OrderManagePage/VendorDetailTabs.tsx
// 공급사 상세 패널 — 하단 2탭 (결제내역 · 매입이력)
// VendorInfoHeader 아래에 배치 · vendor, ledger, purchase-detail API 활용
// Props: vendor (VendorBasic) → 내부에서 직접 fetch

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Filter, X, Package2, ReceiptText, Wallet, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Spinner } from "../common/Spinner";
// 2026-08-29 · #165 A · SearchBar 프리미티브
import { SearchBar } from "../common/SearchBar";
// 2026-08-29 · 상품명 검색 · 통일 로직
import { matchesProductQuery } from "../../lib/productMatch";
import { VendorInfoHeader, type VendorBasic, type VendorKpi, type LedgerRowMinimal } from "./VendorInfoHeader";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { PurchaseHistoryList, type PurchaseHistoryRow } from "../common/PurchaseHistoryList";
import { StatusPill, type PillTone } from "../common/StatusPill";
import { Badge } from "../common/Badge";
import { SplitRightTabs } from "../common/SplitRightTabs";
import { EmptyState } from "../common/EmptyState";
import { IconTile } from "../common/IconTile";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
// 2026-08-26 · 사용자 버그 fix · memo 에 [meta]{...}[/meta] 원본 노출 문제 · decodeMemo 사용
import { decodeMemo } from "./PaymentInfoTab.utils";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useVendorInfoModal } from "../common/features/VendorInfoModal";

// ─── Types ────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string | number;
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
  // 2026-08-03 · #193 · VAT 통합 (서버 계산 · row 저장값 또는 vendor.vat_included 기반)
  vat_amount?: number;
  supply_amount?: number;
  tax_invoice_no?: string | null;
}

interface LedgerSummary {
  supplier: string;
  rows: LedgerRow[];
  total_purchase: number;
  total_payment: number;
  current_balance: number;
  // 2026-08-03 · #193 · VAT 통합 소계
  vat_included: boolean | null;
  total_purchase_vat: number;
  total_purchase_supply: number;
  total_payment_vat: number;
  total_payment_supply: number;
}

interface PurchaseDetailRow {
  id: string | number;
  date: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  // 2026-08-03 · #193
  vat_amount?: number;
  supply_amount?: number;
}

interface ProductStat {
  product_code: string;
  product_name: string;
  buy_count: number;
  total_qty: number;
  total_amount: number;
  latest_date: string | null;
  latest_unit_price: number;
}

type LedgerSortKey = "date" | "type" | "amount" | "running_balance";
type PurchaseSortKey = "date" | "product_name" | "quantity" | "amount";

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function methodLabel(m: string | null): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    transfer: "이체", cash: "현금", card: "카드",
    check: "수표", offset: "상계", etc: "기타",
  };
  return map[m] ?? m;
}

function dateLabel(d: string | null | undefined): string {
  if (!d) return "-";
  return String(d).slice(0, 10);
}

function calcAvgCycle(rows: PurchaseDetailRow[]): number | null {
  const dates = new Set(rows.map(r => r.date).filter(Boolean));
  if (dates.size < 2) return null;
  const sorted = Array.from(dates).sort();
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) {
    sum += (new Date(sorted[i] + "T00:00:00").getTime() - new Date(sorted[i - 1] + "T00:00:00").getTime()) / 86400000;
  }
  return Math.round(sum / (sorted.length - 1));
}

// ─── Tab bar ──────────────────────────────────────────────────────────────

type TabKey = "balance" | "history";

// ─── Ledger tab content ────────────────────────────────────────────────────

const LEDGER_CMP: Record<LedgerSortKey, Comparator<LedgerRow>> = {
  date:            (a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")),
  type:            (a, b) => a.type.localeCompare(b.type),
  amount:          (a, b) => a.amount - b.amount,
  running_balance: (a, b) => a.running_balance - b.running_balance,
};

const LedgerContent: React.FC<{
  ledger: LedgerSummary | null;
  loading: boolean;
  error: string | null;
}> = ({ ledger, loading, error }) => {
  // 2026-08-25 · 사용자 지시 · 결제내역 탭 · 결제 rows 만 표시 (매입은 매입이력 탭)
  const rawRows = useMemo(
    () => (ledger?.rows ?? []).filter(r => r.type === "payment"),
    [ledger],
  );
  const { sorted: rows, sortKey, sortDir, toggleSort } = useSortableTable<LedgerRow, LedgerSortKey>(rawRows, "date", LEDGER_CMP, "desc");
  const arrow = (k: LedgerSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  const { getWidth: lw, resizerProps: lr } = useColumnResize("vendorLedgerV2", {
    num:     { default: 28,  min: 20, max: 48  },
    date:    { default: 108, min: 72, max: 160 },
    memo:    { default: 200, min: 96, max: 380 },
    method:  { default: 72,  min: 48, max: 120 },
    amount:  { default: 112, min: 72, max: 180 },
    balance: { default: 112, min: 72, max: 180 },
  });

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={20} tone="brand" label="결제 내역 로딩 중..." labelSize={14} />
    </div>
  );
  if (error) return (
    <div className="flex-1 flex items-center justify-center py-12 text-rose-600 text-[14px] font-semibold">{error}</div>
  );
  if (!ledger || rows.length === 0) return (
    <div className="flex-1 min-h-[220px] flex items-center justify-center">
      <EmptyState
        icon={Wallet}
        title="결제 내역 없음"
        hint="해당 기간 등록된 결제가 없습니다"
      />
    </div>
  );

  // VAT 컬럼 표시 여부 · row 에 하나라도 vat_amount > 0 있으면 활성 (vendor.vat_included=null 이면 전부 0)
  const showVatCol = rows.some(r => (r.vat_amount ?? 0) > 0);

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="w-full text-[13px] min-w-[560px]" style={{ tableLayout: "fixed" }}>
        <thead className="sticky top-0 bg-white z-10 border-b border-line">
          <tr className="text-[12px] text-zinc-500 uppercase tracking-wider font-semibold">
            <th className="relative text-left px-3 py-2.5 text-zinc-300" style={{ width: lw("num"), minWidth: lw("num") }}>
              #
              <span {...lr("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th onClick={() => toggleSort("date")}
              className="relative text-left px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("date"), minWidth: lw("date") }}>
              날짜{arrow("date")}
              <span {...lr("date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th className="relative text-left px-3 py-2.5" style={{ width: lw("memo"), minWidth: lw("memo") }}>
              메모
              <span {...lr("memo")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-left px-3 py-2.5" style={{ width: lw("method"), minWidth: lw("method") }}>
              방법
              <span {...lr("method")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th onClick={() => toggleSort("amount")}
              className="relative text-right px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("amount"), minWidth: lw("amount") }}>
              결제금액{arrow("amount")}
              <span {...lr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            {showVatCol && (
              <th className="text-right px-3 py-2.5 text-zinc-500 w-24 font-semibold" title="부가세 (row 저장값 또는 vendor.vat_included 기반 계산)">
                VAT
              </th>
            )}
            <th onClick={() => toggleSort("running_balance")}
              className="relative text-right px-3 py-2.5 cursor-pointer select-none hover:bg-brand-tint/40 transition"
              style={{ width: lw("balance"), minWidth: lw("balance") }}>
              결제 후 잔고{arrow("running_balance")}
              <span {...lr("balance")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r, i) => {
            const vat = r.vat_amount ?? 0;
            return (
              <tr key={`led-${r.id}-${i}`}
                className="transition-colors duration-150 hover:bg-sky-50/50 group">
                <td className="px-3 py-2 text-zinc-300 text-[12px] tabular-nums align-top font-semibold">{i + 1}</td>
                <td className="px-3 py-2 tabular-nums text-[13px] font-semibold text-zinc-700 align-top whitespace-nowrap">
                  {dateLabel(r.date)}
                </td>
                <td className="px-3 py-2 text-[13px] text-zinc-700 align-top break-words whitespace-normal leading-snug">
                  {(() => {
                    // 2026-08-26 · 사용자 버그 fix · [meta]{...}[/meta] 태그 · decodeMemo 로 note 만 노출
                    const { note, meta } = decodeMemo(r.memo);
                    return (
                      <>
                        {note ? note : <span className="text-zinc-300">-</span>}
                        {meta?.card_issuer && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 border border-line text-[12px] font-semibold text-zinc-500 align-middle">
                            {meta.card_issuer}
                          </span>
                        )}
                        {meta?.bank_name && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 border border-line text-[12px] font-semibold text-zinc-500 align-middle">
                            {meta.bank_name}
                          </span>
                        )}
                        {meta?.tax_invoice_issued && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-[12px] font-bold text-teal-700 align-middle">
                            세금계산서
                          </span>
                        )}
                        {r.tax_invoice_no && (
                          <span title={`전자세금계산서 승인번호: ${r.tax_invoice_no}`} className="inline-block ml-1.5 align-middle">
                            <StatusPill tone="violet" size="xs">
                              세금계산서 {r.tax_invoice_no.slice(-8)}
                            </StatusPill>
                          </span>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <StatusPill tone="sky" size="xs" shape="square">
                    {methodLabel(r.method)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[14px] font-bold align-top text-sky-700">
                  {fmt(r.amount)}
                </td>
                {showVatCol && (
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-zinc-500 align-top font-semibold">
                    {vat > 0 ? fmt(vat) : <span className="text-zinc-300">-</span>}
                  </td>
                )}
                <td className={`px-3 py-2 text-right tabular-nums text-[13px] font-bold align-top ${
                  r.running_balance > 0 ? "text-amber-700" : r.running_balance < 0 ? "text-rose-700" : "text-zinc-400"
                }`}>
                  {fmt(r.running_balance)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-gradient-to-b from-brand-tint/40 to-brand-tint/20 border-t-2 border-brand-deep/30">
          <tr>
            <td colSpan={4} className="px-3 py-2.5 text-right text-[12px] font-bold text-zinc-600 uppercase tracking-wider">
              기간 결제 합계
            </td>
            <td className="px-3 py-2.5 text-right text-[14px] font-extrabold text-sky-800 tabular-nums" title={`기간 내 결제 총액`}>
              {fmt(ledger.total_payment)}
            </td>
            {showVatCol && (
              <td className="px-3 py-2.5 text-right text-[12px] font-bold text-zinc-600 tabular-nums" title={`결제 VAT`}>
                {fmt(ledger.total_payment_vat)}
              </td>
            )}
            <td className={`px-3 py-2.5 text-right tabular-nums text-[14px] font-extrabold ${
              ledger.current_balance > 0 ? "text-amber-700" : ledger.current_balance < 0 ? "text-rose-700" : "text-zinc-400"
            }`}>
              {fmt(ledger.current_balance)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ─── Purchase history tab content ─────────────────────────────────────────

const HistoryContent: React.FC<{
  detailRows: PurchaseDetailRow[];
  loading: boolean;
}> = ({ detailRows, loading }) => {
  const [productSearch, setProductSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"sku" | "all">("sku");
  // 2026-08-04 · 전체원장 뷰는 공통 PurchaseHistoryList 가 정렬 관리 (헤더 클릭)
  const { getWidth: sw, resizerProps: sr } = useColumnResize("vendorSku", {
    num:      { default: 24,  min: 20, max: 48  },
    name:     { default: 180, min: 100, max: 360 },
    count:    { default: 56,  min: 40, max: 100 },
    qty:      { default: 64,  min: 48, max: 120 },
    amount:   { default: 80,  min: 56, max: 140 },
    unit:     { default: 64,  min: 48, max: 120 },
    last_date:{ default: 80,  min: 60, max: 140 },
  });

  // 상품별 집계
  const productStats = useMemo<ProductStat[]>(() => {
    const byCode = new Map<string, ProductStat>();
    for (const r of detailRows) {
      const code = (r.product_code ?? "").trim();
      const name = (r.product_name ?? code).trim();
      if (!code) continue;
      const cur = byCode.get(code);
      if (cur) {
        cur.buy_count++;
        cur.total_qty += r.quantity;
        cur.total_amount += r.amount;
        if (!cur.latest_date || r.date > cur.latest_date) {
          cur.latest_date = r.date;
          cur.latest_unit_price = r.unit_price;
        }
      } else {
        byCode.set(code, {
          product_code: code,
          product_name: name,
          buy_count: 1,
          total_qty: r.quantity,
          total_amount: r.amount,
          latest_date: r.date,
          latest_unit_price: r.unit_price,
        });
      }
    }
    // 2026-08-29 · 통일 로직 · matchesProductQuery (초성 · 부분 · 코드)
    const list = Array.from(byCode.values()).filter(s => matchesProductQuery(s as any, productSearch));
    list.sort((a, b) => b.total_amount - a.total_amount);
    return list;
  }, [detailRows, productSearch]);

  // 전체 raw 행 (필터링만 · 정렬은 PurchaseHistoryList 가 담당)
  const allRows = useMemo(() => {
    let base = detailRows;
    if (selectedCode) base = base.filter(r => r.product_code === selectedCode);
    else if (productSearch.trim()) {
      // 2026-08-29 · 통일 로직 · matchesProductQuery
      base = base.filter(r => matchesProductQuery(r as any, productSearch));
    }
    return base;
  }, [detailRows, productSearch, selectedCode]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center py-16">
      <Spinner size={18} tone="zinc" label="매입이력 로딩 중..." labelSize={12} />
    </div>
  );
  if (detailRows.length === 0) return (
    <div className="flex-1 flex items-center justify-center py-16 text-zinc-400 text-[11px]">
      해당 기간 매입이력 없음
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap px-1">
        {/* 뷰 토글 */}
        <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-0.5 gap-0.5">
          {(["sku", "all"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`h-6 px-3 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                viewMode === mode
                  ? "bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {mode === "sku" ? "상품별 집계" : "전체 원장"}
            </button>
          ))}
        </div>
        {/* 2026-08-29 · #165 A · SearchBar 프리미티브 */}
        <SearchBar
          value={productSearch}
          onChange={setProductSearch}
          placeholder="상품명·코드 검색"
          historyKey="megatown_vendorDetail_search"
          accent="indigo"
          widthClass="w-40"
        />
        {/* 건수 */}
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {viewMode === "sku" ? `${productStats.length} SKU` : `${allRows.length}건`}
        </span>
        {selectedCode && (
          <button
            type="button"
            onClick={() => setSelectedCode(null)}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-semibold cursor-pointer transition"
          >
            <X size={10} /> 필터 해제
          </button>
        )}
      </div>

      {/* SKU 집계 테이블 */}
      {viewMode === "sku" && (
        <div className={`${CARD_BASE} flex-1 min-h-0 overflow-auto`}>
          <table className="w-full text-xs min-w-[500px]" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 bg-white z-10 border-b border-zinc-100">
              <tr className="text-[10px] text-zinc-400 uppercase tracking-wider">
                <th className="relative text-left px-3 py-2 text-zinc-300" style={{ width: sw("num"), minWidth: sw("num") }}>
                  #
                  <span {...sr("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2" style={{ width: sw("name"), minWidth: sw("name") }}>
                  상품명
                  <span {...sr("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("count"), minWidth: sw("count") }}>
                  매입건
                  <span {...sr("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("qty"), minWidth: sw("qty") }}>
                  총수량
                  <span {...sr("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("amount"), minWidth: sw("amount") }}>
                  총매입액
                  <span {...sr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-right px-3 py-2" style={{ width: sw("unit"), minWidth: sw("unit") }}>
                  최근단가
                  <span {...sr("unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
                <th className="relative text-left px-3 py-2" style={{ width: sw("last_date"), minWidth: sw("last_date") }}>
                  최근매입
                  <span {...sr("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {productStats.map((s, i) => {
                const isSel = s.product_code === selectedCode;
                return (
                  <tr
                    key={`ps-${s.product_code}`}
                    onClick={() => { setSelectedCode(isSel ? null : s.product_code); setViewMode("all"); }}
                    className={`cursor-pointer transition-all duration-100 ${
                      isSel ? "bg-emerald-50 border-l-2 border-emerald-500" : "hover:bg-zinc-50"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-zinc-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                    <td className="px-3 py-1.5 align-top">
                      <div className={`text-[11px] font-semibold leading-tight break-words whitespace-normal ${isSel ? "text-emerald-800" : "text-zinc-700"}`}>
                        {s.product_name}
                      </div>
                      <div className="text-[9px] text-zinc-400">{s.product_code}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 align-top">{s.buy_count}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-600 align-top">{fmt(s.total_qty)}</td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums font-semibold text-emerald-700 align-top">
                      {fmt(s.total_amount)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[11px] tabular-nums text-zinc-500 align-top">
                      {fmt(s.latest_unit_price)}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] text-zinc-400 align-top whitespace-nowrap">
                      {dateLabel(s.latest_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 전체 원장 테이블 · 2026-08-04 공통 PurchaseHistoryList 사용 */}
      {viewMode === "all" && (
        <div className={`${CARD_BASE} flex-1 min-h-0 overflow-hidden flex flex-col`}>
          {selectedCode && (
            <div className="px-3 py-1.5 border-b border-emerald-100 bg-emerald-50/50 flex items-center gap-2 shrink-0">
              <Filter size={11} className="text-emerald-600" />
              <span className="text-[12px] font-semibold text-emerald-700">
                {productStats.find(s => s.product_code === selectedCode)?.product_name ?? selectedCode}
              </span>
              <span className="text-[11px] text-emerald-500 tabular-nums">{allRows.length}건</span>
            </div>
          )}
          <PurchaseHistoryList
            rows={allRows as unknown as PurchaseHistoryRow[]}
            showSupplier={false}
            showProduct
            showRowNumber
            showFooterSum
            emptyText="해당 기간 매입 이력 없음"
            initialSortKey="date"
            initialSortDir="desc"
          />
        </div>
      )}
    </div>
  );
};

// ─── VendorDetailTabs (main export) ───────────────────────────────────────

interface VendorDetailTabsProps {
  vendor: VendorBasic;
  /** 외부에서 기간 필터를 공유할 때 사용 · 미지정 시 내부에서 관리 */
  periodMonths?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  periodSeason?: SeasonKey | null;
  onPeriodChange?: (months: 0 | 1 | 2 | 3 | 4 | 5 | 6, season: SeasonKey | null) => void;
}

export const VendorDetailTabs: React.FC<VendorDetailTabsProps> = ({ vendor }) => {
  const { toast, showError } = useToast();
  // 2026-08-24 · 사용자 지시 · 공급사 정보 수정 · openVendorInfo · [수정] 버튼 wiring
  const { openVendorInfo, modalElement: vendorModalElement } = useVendorInfoModal();
  const [activeTab, setActiveTab] = useState<TabKey>("balance");

  // 기간 필터 (내부 관리)
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 매입상세 데이터
  const [detailRows, setDetailRows] = useState<PurchaseDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);

  const loadLedger = useCallback(async () => {
    if (!vendor) return;
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const params = new URLSearchParams({ supplier: vendor.company_name, days: String(days) });
      const { data: j } = await api.get<any>(`/api/supplier-ledger?${params}`);
      setLedger({
        supplier: j.supplier ?? vendor.company_name,
        rows: Array.isArray(j.rows) ? j.rows : [],
        total_purchase: Number(j.total_purchase ?? 0),
        total_payment: Number(j.total_payment ?? 0),
        current_balance: Number(j.current_balance ?? 0),
        // 2026-08-03 · #193 · VAT 통합 필드 (서버가 없으면 0)
        vat_included: j.vat_included === true ? true : j.vat_included === false ? false : null,
        total_purchase_vat: Number(j.total_purchase_vat ?? 0),
        total_purchase_supply: Number(j.total_purchase_supply ?? 0),
        total_payment_vat: Number(j.total_payment_vat ?? 0),
        total_payment_supply: Number(j.total_payment_supply ?? 0),
      });
    } catch (e: any) {
      const msg = e instanceof ApiError ? e.message : (e?.message ?? "네트워크 오류");
      setLedgerError(msg);
      setLedger(null);
      showError(`원장 로드 실패: ${msg}`);
    } finally { setLedgerLoading(false); }
  }, [vendor, days]);

  const loadDetail = useCallback(async () => {
    if (!vendor) return;
    setDetailLoading(true);
    try {
      const { data: j } = await api.get<any>(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(vendor.company_name)}&days=${days}`);
      setDetailRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setDetailRows([]);
      showError(`매입이력 로드 실패: ${e?.message ?? "네트워크 오류"}`);
    } finally { setDetailLoading(false); }
  }, [vendor, days]);

  // 공급사/기간 변경 시 재조회
  useEffect(() => {
    loadLedger();
    loadDetail();
  }, [loadLedger, loadDetail]);

  // KPI 계산 (ledger 기반)
  const kpi = useMemo<VendorKpi>(() => {
    const totalPurchase = ledger?.total_purchase ?? 0;
    const totalPayment = ledger?.total_payment ?? 0;
    const balance = ledger?.current_balance ?? 0;
    const avgCycleDays = calcAvgCycle(detailRows);

    // MoM: 이번달 vs 지난달 (detailRows 기반)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lmStart = `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const lmEnd = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(lastMonthEnd.getDate()).padStart(2, "0")}`;
    let thisMonth = 0; let lastMonth = 0;
    for (const r of detailRows) {
      if (r.date >= monthStart) thisMonth += r.amount;
      if (r.date >= lmStart && r.date <= lmEnd) lastMonth += r.amount;
    }
    const momPct = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;

    // 활성 상품수 · 표시 기간 내 unique product_code
    const codeSet = new Set<string>();
    for (const r of detailRows) {
      const code = (r.product_code ?? "").trim();
      if (code) codeSet.add(code);
    }
    const activeProductCount = codeSet.size;

    return {
      totalPurchase,
      totalPayment,
      balance,
      avgCycleDays,
      momPct,
      rowCount: ledger?.rows.length,
      activeProductCount,
    };
  }, [ledger, detailRows]);

  const isLoading = ledgerLoading || detailLoading;

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* 헤더 카드 · 2026-08-24 · [수정] 버튼 · openVendorInfo → VendorDetailModal */}
      <VendorInfoHeader
        vendor={vendor}
        kpi={kpi}
        loading={isLoading}
        ledgerRows={ledger?.rows as LedgerRowMinimal[] | undefined}
        onEdit={() => openVendorInfo(vendor as any)}
      />
      {vendorModalElement}

      {/* 기간 필터 + 새로고침 */}
      <div className={`${CARD_BASE} px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5`}>
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0">기간</span>
        <div className="flex flex-wrap bg-zinc-50 border border-line rounded-lg p-0.5 gap-0.5">
          <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
            className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
            10일
          </button>
          {([1, 2, 3, 4, 5, 6] as const).map(m => (
            <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
              className={`px-2.5 h-6 text-[11px] font-semibold rounded-md transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {m}개월
            </button>
          ))}
        </div>
        <SeasonButtons
          value={periodSeason}
          onChange={v => { setPeriodSeason(v); if (v) setPeriodMonths(0); }}
          size="sm"
          hideLabel
        />
        <button
          type="button"
          onClick={() => { loadLedger(); loadDetail(); }}
          disabled={isLoading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-sky-50 hover:border-sky-300 text-zinc-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침"
        >
          <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 2026-08-25 · SplitRightTabs 프리미티브 이관 · v9 브랜드 시그니처 · 폰트 +2 */}
      <div className={`${CARD_BASE} overflow-hidden`}>
        <SplitRightTabs
          tabs={[
            { key: "balance", label: "결제내역", icon: ReceiptText as any, count: ledger?.rows.filter(r => r.type === "payment").length ?? undefined },
            { key: "history", label: "매입이력", icon: Package2 as any, count: detailRows.length || undefined },
          ]}
          active={activeTab}
          onSelect={(k) => setActiveTab(k as TabKey)}
          bg="bg-white"
        />
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === "balance" && (
          <div className={`relative ${CARD_BASE} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {/* v9 · gradient topAccent (brand-deep → sky-500) */}
            <span aria-hidden className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-deep via-sky-500 to-brand-deep opacity-90 z-10" />
            {/* 탭 내 KPI 3개 · 매입금액 · 결제금액 · 남은잔고 (미결제) */}
            {/* 2026-08-25 · v9 · IconTile + 폰트 +2 · Delta trend · Vercel/Attio 톤 */}
            {ledger && !ledgerLoading && (() => {
              const vatMode = ledger.vat_included;
              const vatModeText =
                vatMode === true  ? "VAT 포함" :
                vatMode === false ? "VAT 별도" :
                                    "VAT 미설정";
              const vatModeTone: PillTone =
                vatMode === true  ? "emerald" :
                vatMode === false ? "amber" :
                                    "zinc";
              const payRatio = ledger.total_purchase > 0
                ? Math.round((ledger.total_payment / ledger.total_purchase) * 100)
                : null;
              const items = [
                {
                  label: "매입 금액",
                  value: ledger.total_purchase,
                  tone: "emerald" as const,
                  icon: <Package2 size={14} strokeWidth={2.4} />,
                  subtitle: "구입 총액",
                  vatBadge: vatMode != null ? `VAT ${ledger.total_purchase_vat.toLocaleString()}원 · 공급가액 ${ledger.total_purchase_supply.toLocaleString()}원` : null,
                  trend: null as null | { icon: React.ReactNode; text: string; cls: string },
                },
                {
                  label: "결제 금액",
                  value: ledger.total_payment,
                  tone: "sky" as const,
                  icon: <Wallet size={14} strokeWidth={2.4} />,
                  subtitle: payRatio != null ? `매입 대비 ${payRatio}%` : "지불 총액",
                  vatBadge: vatMode === true && ledger.total_payment_vat > 0 ? `VAT ${ledger.total_payment_vat.toLocaleString()}원 · 공급가액 ${ledger.total_payment_supply.toLocaleString()}원` : null,
                  trend: null,
                },
                {
                  label: "남은 잔고 (미결제)",
                  value: ledger.current_balance,
                  tone: ledger.current_balance > 0 ? "amber" as const : "emerald" as const,
                  icon: ledger.current_balance > 0
                    ? <TrendingUp size={14} strokeWidth={2.4} />
                    : ledger.current_balance < 0
                      ? <TrendingDown size={14} strokeWidth={2.4} />
                      : <Minus size={14} strokeWidth={2.4} />,
                  subtitle: ledger.current_balance > 0 ? "지불 필요" : ledger.current_balance < 0 ? "초과 결제" : "완납",
                  vatBadge: null,
                  trend: null,
                },
              ];
              return (
                <div className="flex flex-col">
                  {/* VAT 모드 배지 (전체 우상단) */}
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <span className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">기간 합계</span>
                    <span
                      title={
                        vatMode === true  ? "거래명세서 총액에 VAT 포함 · amount÷11 로 세액 산정" :
                        vatMode === false ? "거래명세서 총액은 공급가액 · amount×0.1 별도 세액" :
                                            "공급사 관리에서 VAT 처리 방식을 설정하면 세액이 계산됩니다"
                      }
                    >
                      <StatusPill tone={vatModeTone} size="sm" dot={vatMode !== null}>{vatModeText}</StatusPill>
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-0 border-b border-line bg-gradient-to-b from-zinc-50/60 to-white">
                    {items.map((item, i) => (
                      <div key={i} className={`px-4 py-3.5 ${i < 2 ? "border-r border-line" : ""} flex flex-col gap-1.5`}>
                        <div className="flex items-center gap-2">
                          <IconTile icon={item.icon} tone={item.tone} size="sm" />
                          <span className="text-[13px] font-bold text-zinc-600 tracking-tight">{item.label}</span>
                        </div>
                        <span className={`text-[22px] font-extrabold tabular-nums leading-tight tracking-tight ${
                          item.tone === "emerald" ? "text-emerald-700" :
                          item.tone === "sky" ? "text-sky-700" :
                          "text-amber-700"
                        }`}>
                          {item.value.toLocaleString()}<span className="text-[13px] font-bold ml-0.5 text-zinc-400">원</span>
                        </span>
                        <span className="text-[12px] text-zinc-500 font-semibold">{item.subtitle}</span>
                        {item.vatBadge && (
                          <span className="text-[11px] text-zinc-500 font-semibold tabular-nums mt-0.5 leading-tight bg-zinc-50 px-2 py-1 rounded-md border border-line">
                            {item.vatBadge}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <LedgerContent ledger={ledger} loading={ledgerLoading} error={ledgerError} />
          </div>
        )}
        {activeTab === "history" && (
          <HistoryContent detailRows={detailRows} loading={detailLoading} />
        )}
      </div>
    </div>
    </>
  );
};

export default VendorDetailTabs;
