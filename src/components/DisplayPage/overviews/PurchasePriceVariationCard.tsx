// 2026-10-12 · 사용자 지시 · 매입단가 변동 추적 카드
//   · 기간별 (7일·14일·한달·월별 멀티선택) 상품별 매입단가 비교
//   · 각 상품의 매입 record 안 unit_price 가 **변동 있는 상품만** 리스트업
//   · API · /api/purchase-details?from=X&to=Y (매입이력 재사용)

import React, { useEffect, useMemo, useState } from "react";
import { Warning, X as XIcon } from "@phosphor-icons/react";
import { api } from "../../../lib/apiClient";
import { MonthToggleSelector, dateRangesFromMonths } from "../../common/MonthToggleSelector";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const fmt = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString("ko-KR");

interface PurchaseRow {
  product_code?: string | null;
  product_name?: string | null;
  supplier_name?: string | null;
  purchase_date?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

interface VariationRow {
  code: string;
  name: string;
  supplier: string | null;
  prices: Array<{ date: string; price: number; qty: number }>;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;        // qty-weighted
  diffPct: number;         // (max - min) / avg × 100
  totalQty: number;
}

type QuickRange = "7d" | "14d" | "30d" | null;

const todayYmd = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDay = (ymd: string, delta: number): string => {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface PurchasePriceVariationCardProps {
  /** min diff % threshold · 기본 1% 이상만 리스트업 */
  minDiffPct?: number;
}

export const PurchasePriceVariationCard: React.FC<PurchasePriceVariationCardProps> = ({ minDiffPct = 1 }) => {
  const [quickRange, setQuickRange] = useState<QuickRange>("14d");
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    const d = new Date(); return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`];
  });
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  // 2026-10-12 · 사용자 지시 · 행 클릭 → 상품 매입이력 slide drawer
  const [drawerProduct, setDrawerProduct] = useState<{ code: string; name: string } | null>(null);

  // 기간 결정 · quickRange 우선 · null 이면 selectedMonths
  const dateRange = useMemo(() => {
    if (quickRange) {
      const days = quickRange === "7d" ? 7 : quickRange === "14d" ? 14 : 30;
      const to = todayYmd();
      const from = addDay(to, -(days - 1));
      return { from, to };
    }
    const ranges = dateRangesFromMonths(selectedMonths);
    if (ranges.length === 0) return null;
    const from = ranges[0].startDate;
    const to = ranges[ranges.length - 1].endDate;
    return { from, to };
  }, [quickRange, selectedMonths]);

  useEffect(() => {
    if (!dateRange) { setRows([]); return; }
    let alive = true;
    setLoading(true);
    api.get<{ rows?: PurchaseRow[] }>(`/api/purchase-details?from=${dateRange.from}&to=${dateRange.to}&no_cycle=1&per_page=10000`)
      .then(({ data }) => { if (alive) setRows(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dateRange]);

  // 상품별 매입단가 집계 · unit_price 변동 있는 상품만
  const variationRows: VariationRow[] = useMemo(() => {
    const byCode = new Map<string, VariationRow>();
    for (const r of rows) {
      const code = String(r.product_code ?? "").trim();
      if (!code) continue;
      const price = Number(r.unit_price ?? 0);
      if (price <= 0) continue;
      const qty = Number(r.quantity ?? 0);
      if (qty <= 0) continue;
      const date = String(r.purchase_date ?? "").slice(0, 10);
      const existing = byCode.get(code);
      if (existing) {
        existing.prices.push({ date, price, qty });
        existing.minPrice = Math.min(existing.minPrice, price);
        existing.maxPrice = Math.max(existing.maxPrice, price);
        existing.totalQty += qty;
      } else {
        byCode.set(code, {
          code,
          name: String(r.product_name ?? code),
          supplier: r.supplier_name ?? null,
          prices: [{ date, price, qty }],
          minPrice: price,
          maxPrice: price,
          avgPrice: 0,
          diffPct: 0,
          totalQty: qty,
        });
      }
    }
    // avg + diffPct 계산 · 변동 있는 상품만 filter
    const result: VariationRow[] = [];
    for (const v of byCode.values()) {
      const totalAmt = v.prices.reduce((s, p) => s + p.price * p.qty, 0);
      v.avgPrice = v.totalQty > 0 ? totalAmt / v.totalQty : 0;
      v.diffPct = v.avgPrice > 0 ? ((v.maxPrice - v.minPrice) / v.avgPrice) * 100 : 0;
      if (v.diffPct >= minDiffPct) result.push(v);
    }
    result.sort((a, b) => b.diffPct - a.diffPct);
    return result;
  }, [rows, minDiffPct]);

  const periodLabel = dateRange ? `${dateRange.from} ~ ${dateRange.to}` : "기간 선택";

  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap">
        <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
        <Warning size={18} weight="fill" className="text-slate-500" />
        <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매입단가 변동 품목</h3>
        <span className="text-[13px] text-slate-500 font-medium">· {variationRows.length}건 · {periodLabel}</span>
      </header>

      {/* 기간 필터 · 7일/14일/한달/월별 */}
      <div className="px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-md p-0.5" role="tablist">
          {([
            { k: "7d"  as const, label: "7일"  },
            { k: "14d" as const, label: "14일" },
            { k: "30d" as const, label: "한달" },
            { k: null, label: "월별" },
          ]).map(p => (
            <button key={String(p.k)} type="button" onClick={() => setQuickRange(p.k)}
              className={`h-7 px-2.5 rounded-sm text-[13px] font-semibold tabular-nums transition-colors cursor-pointer ${
                quickRange === p.k ? "bg-white text-brand-deep shadow-sm" : "text-slate-500 hover:text-ink"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {quickRange === null && (
          <MonthToggleSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} maxMonths={6} minOne />
        )}
      </div>

      {/* 리스트 */}
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-[14px] text-slate-500">조회 중...</div>
        ) : variationRows.length === 0 ? (
          <div className="py-8 text-center text-[14px] text-slate-500">단가 변동 품목이 없습니다 (기간 내)</div>
        ) : (
          <table className="w-full text-[14px]">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200 text-[13px] font-semibold text-slate-500">
                <th className="pl-5 pr-2 py-1.5 text-left">상품</th>
                <th className="px-2 py-1.5 text-right w-[72px]">매입횟수</th>
                <th className="px-2 py-1.5 text-right w-[96px]">최저단가</th>
                <th className="px-2 py-1.5 text-right w-[96px]">최고단가</th>
                <th className="px-2 py-1.5 text-right w-[96px]">평균단가</th>
                <th className="px-2 pr-5 py-1.5 text-right w-[80px]">변동률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variationRows.slice(0, 100).map(v => (
                <tr key={v.code} onClick={() => setDrawerProduct({ code: v.code, name: v.name })}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors" title="클릭 · 상품 매입이력 보기">
                  <td className="pl-5 pr-2 py-2 align-middle">
                    <div className="text-[14px] text-ink font-medium">{v.name}</div>
                    <div className="text-[12px] text-slate-500">{v.supplier ?? "-"} · {v.prices.length}회 매입 · 총 {fmt(v.totalQty)}개</div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[14px] text-ink">{v.prices.length}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[14px] text-emerald-700 font-semibold">{fmt(v.minPrice)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[14px] text-rose-700 font-semibold">{fmt(v.maxPrice)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[14px] text-slate-700">{fmt(Math.round(v.avgPrice))}</td>
                  <td className={`px-2 pr-5 py-2 text-right tabular-nums text-[14px] font-bold ${v.diffPct >= 10 ? "text-rose-600" : v.diffPct >= 5 ? "text-amber-600" : "text-slate-700"}`}>
                    {v.diffPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* 2026-10-12 · 사용자 지시 · 행 클릭 → 상품 매입이력 slide drawer */}
      {drawerProduct && (
        <ProductPurchaseDrawer
          productCode={drawerProduct.code}
          productName={drawerProduct.name}
          onClose={() => setDrawerProduct(null)}
        />
      )}
    </section>
  );
};

// ─────────────────────────────────────────────────────────────
// 상품 매입이력 slide drawer (오른쪽) · 2026-10-12 사용자 지시
// ─────────────────────────────────────────────────────────────

const ProductPurchaseDrawer: React.FC<{
  productCode: string;
  productName: string;
  onClose: () => void;
}> = ({ productCode, productName, onClose }) => {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ rows?: PurchaseRow[] }>(`/api/purchase-details?product_code=${encodeURIComponent(productCode)}&per_page=500`)
      .then(({ data }) => { if (alive) setRows(Array.isArray(data?.rows) ? data.rows : []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productCode]);

  const totalQty = rows.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  const totalAmt = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const avgPrice = totalQty > 0 ? Math.round(totalAmt / totalQty) : 0;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`${productName} 매입이력`}
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[520px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-[3px] h-[14px] bg-rose-500 rounded-full shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] md:text-[16px] font-semibold text-ink truncate">{productName}</h2>
              <p className="text-[12px] text-slate-500 tabular-nums">{productCode} · 매입 {rows.length}건 · 총 {fmt(totalQty)}개 · 평균 {fmt(avgPrice)}원</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500" aria-label="닫기">
            <XIcon size={16} weight="bold" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-[14px] text-slate-500">조회 중...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-[14px] text-slate-500">매입 이력 없음</div>
          ) : (
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[13px] font-semibold text-slate-500">
                <tr>
                  <th className="pl-4 pr-2 py-2 text-left">날짜</th>
                  <th className="px-2 py-2 text-left">공급사</th>
                  <th className="px-2 py-2 text-right w-[64px]">수량</th>
                  <th className="px-2 py-2 text-right w-[90px]">단가</th>
                  <th className="px-2 pr-4 py-2 text-right w-[96px]">금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/60">
                    <td className="pl-4 pr-2 py-2 text-[13px] tabular-nums text-slate-500 whitespace-nowrap">{String(r.purchase_date ?? "").slice(0, 10)}</td>
                    <td className="px-2 py-2 text-[13px] text-slate-700 truncate">{r.supplier_name ?? "-"}</td>
                    <td className="px-2 py-2 text-right text-[14px] tabular-nums text-ink">{fmt(r.quantity)}</td>
                    <td className="px-2 py-2 text-right text-[14px] tabular-nums font-semibold text-ink">{fmt(r.unit_price)}</td>
                    <td className="px-2 pr-4 py-2 text-right text-[14px] tabular-nums text-slate-700">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </>
  );
};

export default PurchasePriceVariationCard;
