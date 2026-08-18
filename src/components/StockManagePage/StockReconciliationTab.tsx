// src/components/StockManagePage/StockReconciliationTab.tsx
// 실재고 · ERP 재고 vs 실재고 차이만 필터 (2026-08-03 · Phase 2)
//
// - ERP 재고 = products.current_stock
// - 실재고    = inventory_checks 최신값 · warehouse1 + warehouse2 + store1 + store2 + store3
//              (레거시 컬럼: warehouse_stock + store_stock + store_stock_2 도 합산에 fallback)
// - ERP 재고 ≠ 실재고 인 상품만 리스트 · 차이(+/-) 표시
//
// 이전 세션 기반 3단계 검증 UI 는 대체됨. (git history: 이전 커밋에 원본 보존)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Building2,
  Package,
  Filter,
} from "lucide-react";
import type { AuthSession } from "../../types";
import { useSortableTable } from "../../hooks/useSortableTable";
import { EmptyState } from "../common/EmptyState";
import { AccentBar } from "../common/AccentBar";
import { LoadingState } from "../common/LoadingState";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { StatusPill } from "../common/StatusPill";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InventoryCheckRow {
  id?: number;
  product_code: string;
  product_name?: string | null;
  // 레거시 컬럼 (하위 호환)
  warehouse_stock?: number | null;
  store_stock?: number | null;
  store_stock_2?: number | null;
  // 신규 컬럼 (Phase 3 · DB 확장 후)
  warehouse1_stock?: number | null;
  warehouse2_stock?: number | null;
  store3_stock?: number | null;
  checked_at?: string | null;
  checked_by?: string | null;
}

interface DiffRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  erp_qty: number;      // ERP 재고
  actual_qty: number;   // 실재고 합계 (창고1·2 + 매장1·2·3)
  diff: number;         // actual - erp
  checked_at: string | null;
}

type SortKey = "diff" | "name" | "supplier" | "erp" | "actual" | "checked_at";
type SortDir = "asc" | "desc";

// ─── Helpers ────────────────────────────────────────────────────────────────

// inventory_checks row → 실재고 총합 (신규+레거시 fallback)
function actualTotalOf(row: InventoryCheckRow): number {
  const w1 = row.warehouse1_stock ?? row.warehouse_stock ?? 0;
  const w2 = row.warehouse2_stock ?? 0;
  const s1 = row.store_stock ?? 0;         // store_stock == store1
  const s2 = row.store_stock_2 ?? 0;
  const s3 = row.store3_stock ?? 0;
  return (
    (Number.isFinite(Number(w1)) ? Number(w1) : 0) +
    (Number.isFinite(Number(w2)) ? Number(w2) : 0) +
    (Number.isFinite(Number(s1)) ? Number(s1) : 0) +
    (Number.isFinite(Number(s2)) ? Number(s2) : 0) +
    (Number.isFinite(Number(s3)) ? Number(s3) : 0)
  );
}

// row 에 실재고 관련 정보가 하나라도 있는지
function hasAnyActual(row: InventoryCheckRow): boolean {
  return (
    row.warehouse1_stock != null ||
    row.warehouse2_stock != null ||
    row.warehouse_stock != null ||
    row.store_stock != null ||
    row.store_stock_2 != null ||
    row.store3_stock != null
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${dd} ${hh}:${mi}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const StockReconciliationTab: React.FC<{
  onOpenOcr?: () => void;
  authSession?: AuthSession | null;
}> = () => {
  const { getWidth, resizerProps } = useColumnResize("stockRecon", {
    num:        { default: 40,  min: 28, max: 60  },
    name:       { default: 200, min: 80, max: 400 },
    supplier:   { default: 140, min: 80, max: 280 },
    erp:        { default: 80,  min: 50, max: 160 },
    actual:     { default: 80,  min: 50, max: 160 },
    diff:       { default: 80,  min: 50, max: 160 },
    checked_at: { default: 120, min: 80, max: 200 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [query, setQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // ── Data load ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 병렬 · 실재고 최신 + 상품 마스터 (current_stock 포함 → /api/products-map)
      const [invRes, prodRes] = await Promise.all([
        fetch("/api/inventory-checks"),
        fetch("/api/products-map"),
      ]);
      if (!invRes.ok) throw new Error(`실재고 로드 실패 (${invRes.status})`);
      const invRaw: InventoryCheckRow[] = await invRes.json().catch(() => []);
      const prodMap: Record<string, any> = prodRes.ok ? await prodRes.json().catch(() => ({})) : {};

      // product_code 별 최신 row 만 유지 (checked_at desc 로 이미 정렬돼있음)
      const latestByCode = new Map<string, InventoryCheckRow>();
      for (const r of Array.isArray(invRaw) ? invRaw : []) {
        const code = String(r.product_code ?? "").trim();
        if (!code) continue;
        if (!latestByCode.has(code)) latestByCode.set(code, r);
      }

      // 차이 계산
      const diffs: DiffRow[] = [];
      latestByCode.forEach((row, code) => {
        if (!hasAnyActual(row)) return; // 실재고 정보 자체가 없으면 skip
        // products-map 은 code · stripped(code) 두 키 모두 보유 · 안전하게 두 번 조회
        const prod = prodMap[code] ?? prodMap[code.replace(/^0+/, "")] ?? {};
        const erpRaw = prod.current_stock ?? null;
        const erp_qty = Number.isFinite(Number(erpRaw)) ? Number(erpRaw) : 0;
        const actual_qty = actualTotalOf(row);
        if (erp_qty === actual_qty) return; // 일치하면 skip

        diffs.push({
          product_code: code,
          product_name: String(
            prod.product_name ?? prod.name ?? row.product_name ?? code
          ),
          supplier: prod.supplier ?? null,
          erp_qty,
          actual_qty,
          diff: actual_qty - erp_qty,
          checked_at: row.checked_at ?? null,
        });
      });
      setRows(diffs);
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e?.message ?? "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Filter · Sort ─────────────────────────────────────────────────────────
  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.supplier) set.add(r.supplier); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => {
      if (supplierFilter && (r.supplier ?? "") !== supplierFilter) return false;
      if (q) {
        const hay = `${r.product_name} ${r.product_code} ${r.supplier ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, supplierFilter]);

  // 공용 정렬 훅 (T30-followup · 22파일 중복 통합의 두번째 채택자)
  const sortComparators = useMemo<Record<SortKey, (a: DiffRow, b: DiffRow) => number>>(() => ({
    name:       (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
    supplier:   (a, b) => (a.supplier ?? "").localeCompare(b.supplier ?? "", "ko"),
    erp:        (a, b) => a.erp_qty - b.erp_qty,
    actual:     (a, b) => a.actual_qty - b.actual_qty,
    checked_at: (a, b) => (new Date(a.checked_at ?? 0).getTime()) - (new Date(b.checked_at ?? 0).getTime()),
    diff:       (a, b) => Math.abs(a.diff) - Math.abs(b.diff), // 절대값 큰 순 (asc = 작은 차이부터)
  }), []);
  const { sorted: visibleRows, sortKey, sortDir, toggleSort } = useSortableTable<DiffRow, SortKey>(filteredRows, "diff", sortComparators, "desc");

  const SortIcon: React.FC<{ k: SortKey }> = ({ k }) => {
    if (sortKey !== k) return <ArrowUpDown size={10} className="text-zinc-300 ml-0.5 inline" />;
    return sortDir === "asc"
      ? <ArrowUp size={10} className="text-emerald-500 ml-0.5 inline" />
      : <ArrowDown size={10} className="text-emerald-500 ml-0.5 inline" />;
  };

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const diffCount = visibleRows.length;
  const totalDiffAbs = visibleRows.reduce((s, r) => s + Math.abs(r.diff), 0);
  const overCount = visibleRows.filter(r => r.diff > 0).length;
  const underCount = visibleRows.filter(r => r.diff < 0).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3">

      {/* ── 헤더 카드 · 2026-08-17 · StatusPill 통일 · 딥네이비 accent + semantic status ── */}
      <div className={`${CARD_BASE} p-3 flex flex-wrap items-center gap-2`}>
        <AccentBar className="shrink-0" />
        <CheckCircle2 size={16} className="text-brand-deep shrink-0" />
        <span className="text-[15px] font-bold text-ink tracking-tight">실재고</span>
        <StatusPill tone="emerald" size="md" dot>차이 있는 상품 {diffCount}개</StatusPill>
        {diffCount > 0 && (
          <>
            <StatusPill tone="rose" size="md" dot>부족 {underCount}개</StatusPill>
            <StatusPill tone="amber" size="md" dot>초과 {overCount}개</StatusPill>
            <StatusPill tone="zinc" size="md">차이합 {totalDiffAbs}</StatusPill>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {refreshedAt && !loading && (
            <span className="text-[14px] font-semibold text-zinc-400 tabular-nums hidden sm:inline">
              {fmtDate(refreshedAt.toISOString())}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-line text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 cursor-pointer disabled:opacity-50 transition"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── 필터바 ── */}
      <div className={`${CARD_BASE} p-2 flex flex-wrap items-center gap-2`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="상품명 · 상품코드 · 공급사 검색"
            className="w-full h-8 pl-7 pr-2 text-[14px] bg-zinc-50 border border-line rounded-lg
              focus:outline-none focus:border-brand-deep focus:bg-white transition"
          />
        </div>
        <div className="relative">
          <Filter size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
          <select
            value={supplierFilter}
            onChange={e => setSupplierFilter(e.target.value)}
            className="h-8 pl-7 pr-6 text-[14px] font-semibold bg-zinc-50 border border-line rounded-lg
              focus:outline-none focus:border-brand-deep focus:bg-white transition cursor-pointer appearance-none"
          >
            <option value="">전체 공급사</option>
            {supplierOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {(query || supplierFilter) && (
          <button
            onClick={() => { setQuery(""); setSupplierFilter(""); }}
            className="h-8 px-3 text-[15px] font-bold text-zinc-500 hover:text-zinc-800
              bg-zinc-50 hover:bg-zinc-100 border border-line rounded-lg cursor-pointer transition"
          >
            초기화
          </button>
        )}
      </div>

      {/* ── 리스트 카드 ── */}
      <div className={`${CARD_BASE} overflow-hidden flex-1 min-h-0 flex flex-col`}>
        {error ? (
          <EmptyState
            icon={AlertTriangle}
            title="로드 실패"
            hint={error}
            size="compact"
          />
        ) : loading && rows.length === 0 ? (
          <LoadingState tone="emerald" size="compact" label="실재고 대사 계산 중..." />
        ) : diffCount === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={rows.length === 0 ? "실재고가 입력된 상품이 없습니다" : "ERP 재고와 실재고가 모두 일치합니다"}
            hint={rows.length === 0 ? "'실재고입력' 탭에서 바코드 스캔 후 저장하세요" : "필터 조건을 확인하거나 새로고침해보세요"}
            size="normal"
          />
        ) : (
          <div className="overflow-auto flex-1 min-h-0">
            <table className="w-full text-[14px] border-collapse" style={{ tableLayout: "fixed" }}>
              <thead className="bg-emerald-50/50 border-b border-emerald-100 sticky top-0 z-10">
                <tr>
                  <th className="relative px-2 py-2 text-left font-bold text-emerald-800" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                    #
                    <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-left font-bold text-emerald-800 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("name"), minWidth: getWidth("name") }}
                    onClick={() => toggleSort("name")}
                  >
                    <span className="inline-flex items-center gap-1"><Package size={11} className="text-emerald-500" />상품명</span>
                    <SortIcon k="name" />
                    <span {...resizerProps("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-left font-bold text-emerald-800 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}
                    onClick={() => toggleSort("supplier")}
                  >
                    <span className="inline-flex items-center gap-1"><Building2 size={11} className="text-emerald-500" />공급사</span>
                    <SortIcon k="supplier" />
                    <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-right font-bold text-zinc-700 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("erp"), minWidth: getWidth("erp") }}
                    onClick={() => toggleSort("erp")}
                  >
                    ERP재고<SortIcon k="erp" />
                    <span {...resizerProps("erp")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-right font-bold text-teal-700 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("actual"), minWidth: getWidth("actual") }}
                    onClick={() => toggleSort("actual")}
                  >
                    실재고<SortIcon k="actual" />
                    <span {...resizerProps("actual")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-right font-bold text-rose-700 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("diff"), minWidth: getWidth("diff") }}
                    onClick={() => toggleSort("diff")}
                  >
                    차이<SortIcon k="diff" />
                    <span {...resizerProps("diff")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                  <th
                    className="relative px-2 py-2 text-center font-bold text-zinc-500 cursor-pointer select-none hover:bg-emerald-100/40 transition"
                    style={{ width: getWidth("checked_at"), minWidth: getWidth("checked_at") }}
                    onClick={() => toggleSort("checked_at")}
                  >
                    조정일<SortIcon k="checked_at" />
                    <span {...resizerProps("checked_at")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleRows.map((r, i) => {
                  const negative = r.diff < 0;
                  return (
                    <tr key={r.product_code} className="hover:bg-zinc-50/60 transition">
                      <td className="px-2 py-1.5 text-zinc-400 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <p className="text-[14px] font-bold text-zinc-800 leading-snug break-words">{r.product_name}</p>
                        <p className="text-[14px] tabular-nums text-zinc-400 mt-0.5">#{r.product_code}</p>
                      </td>
                      <td className="px-2 py-1.5 text-zinc-600 break-words max-w-[160px]" title={r.supplier ?? ""}>
                        {r.supplier ?? <span className="text-zinc-300">-</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right text-zinc-700 font-bold tabular-nums">{r.erp_qty}</td>
                      <td className="px-2 py-1.5 text-right text-teal-700 font-bold tabular-nums">{r.actual_qty}</td>
                      <td className="px-2 py-1.5 text-right">
                        {/* 2026-08-17 · StatusPill 프레임워크 통일 */}
                        <StatusPill tone={negative ? "rose" : "amber"} size="md" className="min-w-[48px] justify-center">
                          {r.diff > 0 ? `+${r.diff}` : r.diff}
                        </StatusPill>
                      </td>
                      <td className="px-2 py-1.5 text-center text-zinc-500 tabular-nums text-[15px]">
                        {fmtDate(r.checked_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

export default StockReconciliationTab;
