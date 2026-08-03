// src/components/OrderManagePage/PaymentInfoTab.tsx
// #147 · 결제 탭 > 결제정보 서브탭 · 공급사별 결제 KPI + 원장
// 2026-08-03 신규 생성

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Building2, Filter, Loader2, Package, RefreshCw, X } from "lucide-react";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VendorItem {
  id: number;
  company_name: string;
  category: string | null;
}

interface LedgerRow {
  id: string | number;
  type: "purchase" | "payment";
  date: string | null;
  amount: number;
  method: string | null;
  memo: string | null;
  running_balance: number;
}

interface LedgerSummary {
  supplier: string;
  rows: LedgerRow[];
  total_purchase: number;
  total_payment: number;
  current_balance: number;
}

// 상품별 매입 raw row · /api/supplier-purchase-detail
interface PurchaseDetailRow {
  id: number | string;
  date: string;
  product_code: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

// 상품별 집계 · UI 좌측 상품 리스트
interface ProductStat {
  product_code: string;
  product_name: string;
  buy_count: number;
  total_qty: number;
  total_amount: number;
  latest_date: string | null;
  latest_unit_price: number;
  current_stock: number;
  purchase_price: number;
  stock_value: number;
}

// products-search · 재고잔고 계산용 최소 필드
interface SupplierProduct {
  product_code: string;
  product_name: string;
  supplier: string | null;
  current_stock: number;
  purchase_price: number;
}

type SortKey = "date" | "type" | "amount" | "running_balance";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtWon(n: number): string {
  if (Math.abs(n) >= 10000_0000) return `${(n / 10000_0000).toFixed(1)}억`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return fmt(n) + "원";
}

function methodLabel(m: string | null): string {
  if (!m) return "-";
  const map: Record<string, string> = {
    transfer: "이체", cash: "현금", card: "카드",
    check: "수표", offset: "상계", etc: "기타",
  };
  return map[m] ?? m;
}

function dateLabel(d: string | null): string {
  if (!d) return "-";
  return String(d).slice(0, 10);
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "sky" | "rose" | "amber";
}> = ({ label, value, sub, color }) => {
  const colors = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    sky:     "bg-sky-50 border-sky-200 text-sky-700",
    rose:    "bg-rose-50 border-rose-200 text-rose-700",
    amber:   "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-[18px] font-black mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
};

// ─── PaymentInfoTab ───────────────────────────────────────────────────────────

export const PaymentInfoTab: React.FC = () => {
  // 공급사 목록
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");

  // 선택 공급사
  const [selectedVendor, setSelectedVendor] = useState<VendorItem | null>(null);

  // 원장 데이터
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // 상품별 매입 상세 (raw rows) + 재고 스냅샷
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseDetailRow[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 상품 필터 (선택 시 원장 및 통계도 해당 상품 기준)
  const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  // 기간 필터
  const [periodMonths, setPeriodMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [periodSeason, setPeriodSeason] = useState<SeasonKey | null>(null);

  // 정렬
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: SortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  // 공급사 목록 로드
  const loadVendors = useCallback(async () => {
    setVendorsLoading(true);
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) throw new Error(String(res.status));
      const list: any[] = await res.json();
      setVendors(list.map(v => ({ id: v.id, company_name: String(v.company_name ?? ""), category: v.category ?? null })));
    } catch { setVendors([]); }
    finally { setVendorsLoading(false); }
  }, []);

  useEffect(() => {
    loadVendors();
    window.addEventListener("vendors-changed", loadVendors);
    return () => window.removeEventListener("vendors-changed", loadVendors);
  }, [loadVendors]);

  // 원장 로드
  const loadLedger = useCallback(async (supplier: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);
      const params = new URLSearchParams({ supplier, days: String(days) });
      const res = await fetch(`/api/supplier-ledger?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setLedger({
        supplier: j.supplier ?? supplier,
        rows: Array.isArray(j.rows) ? j.rows : [],
        total_purchase: Number(j.total_purchase ?? 0),
        total_payment: Number(j.total_payment ?? 0),
        current_balance: Number(j.current_balance ?? 0),
      });
    } catch (e: any) {
      setLedgerError(e?.message ?? "네트워크 오류");
      setLedger(null);
    } finally { setLedgerLoading(false); }
  }, [periodMonths, periodSeason]);

  useEffect(() => {
    if (selectedVendor) loadLedger(selectedVendor.company_name);
    else setLedger(null);
  }, [selectedVendor, loadLedger]);

  // 공급사 변경 시 상품 필터/캐시 초기화
  useEffect(() => {
    setSelectedProductCode(null);
    setProductSearch("");
  }, [selectedVendor]);

  // 상품별 매입 상세 + 공급사 상품 리스트 로드 (기간 · 공급사 변경 시)
  const loadDetail = useCallback(async (supplier: string) => {
    setDetailLoading(true);
    try {
      const days = periodSeason ? 365 : (periodMonths === 0 ? 10 : (periodMonths || 1) * 30);
      const [detailRes, productsRes] = await Promise.allSettled([
        fetch(`/api/supplier-purchase-detail?supplier=${encodeURIComponent(supplier)}&days=${days}`),
        fetch(`/api/products-search?q=%20&supplier=${encodeURIComponent(supplier)}&include_hidden=1`),
      ]);

      // 매입 상세
      if (detailRes.status === "fulfilled" && detailRes.value.ok) {
        const j = await detailRes.value.json();
        setPurchaseDetail(Array.isArray(j.rows) ? j.rows : []);
      } else setPurchaseDetail([]);

      // 공급사 상품 (재고잔고 계산용)
      if (productsRes.status === "fulfilled" && productsRes.value.ok) {
        const arr: any[] = await productsRes.value.json();
        setSupplierProducts(
          (Array.isArray(arr) ? arr : [])
            .filter(p => String(p.supplier ?? "").trim() === supplier.trim())
            .map(p => ({
              product_code: String(p.product_code ?? "").trim(),
              product_name: String(p.product_name ?? "").trim(),
              supplier: p.supplier ?? null,
              current_stock: Number(p.current_stock) || 0,
              purchase_price: Number(p.purchase_price) || 0,
            }))
        );
      } else setSupplierProducts([]);
    } catch {
      setPurchaseDetail([]);
      setSupplierProducts([]);
    } finally { setDetailLoading(false); }
  }, [periodMonths, periodSeason]);

  useEffect(() => {
    if (selectedVendor) loadDetail(selectedVendor.company_name);
    else { setPurchaseDetail([]); setSupplierProducts([]); }
  }, [selectedVendor, loadDetail]);

  // 필터링된 공급사
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendors.filter(v => {
      if (q && !v.company_name.toLowerCase().includes(q)) return false;
      if (vendorCategoryFilter !== "전체" && v.category !== vendorCategoryFilter) return false;
      return true;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter]);

  // 결제방법 카운트 (purchase 제외)
  const methodCount = useMemo(() => {
    if (!ledger) return {};
    const m: Record<string, number> = {};
    for (const r of ledger.rows) {
      if (r.type !== "payment") continue;
      const k = r.method ?? "etc";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [ledger]);

  // 재고잔고 = SUM(current_stock × purchase_price)
  const stockValue = useMemo(() => {
    return supplierProducts.reduce((s, p) => s + p.current_stock * p.purchase_price, 0);
  }, [supplierProducts]);

  // 상품별 집계 (매입 상세 → SKU 그룹핑) + 재고 병합
  const productStats = useMemo<ProductStat[]>(() => {
    const byCode = new Map<string, ProductStat>();
    for (const r of purchaseDetail) {
      const code = (r.product_code ?? "").trim();
      if (!code) continue;
      const cur = byCode.get(code);
      if (cur) {
        cur.buy_count += 1;
        cur.total_qty += r.quantity;
        cur.total_amount += r.amount;
        if (!cur.latest_date || (r.date && r.date > cur.latest_date)) {
          cur.latest_date = r.date;
          cur.latest_unit_price = r.unit_price;
        }
      } else {
        byCode.set(code, {
          product_code: code,
          product_name: r.product_name ?? code,
          buy_count: 1,
          total_qty: r.quantity,
          total_amount: r.amount,
          latest_date: r.date,
          latest_unit_price: r.unit_price,
          current_stock: 0,
          purchase_price: 0,
          stock_value: 0,
        });
      }
    }
    // products 캐시 병합 (매입 이력 없어도 재고 있는 SKU 포함)
    const productByCode = new Map<string, SupplierProduct>(supplierProducts.map(p => [p.product_code, p] as [string, SupplierProduct]));
    for (const p of supplierProducts) {
      const cur = byCode.get(p.product_code);
      if (cur) {
        cur.current_stock = p.current_stock;
        cur.purchase_price = p.purchase_price;
        cur.stock_value = p.current_stock * p.purchase_price;
        if (!cur.product_name && p.product_name) cur.product_name = p.product_name;
      } else if (p.current_stock > 0) {
        // 재고만 있고 매입이력 없음 (기간 밖)
        byCode.set(p.product_code, {
          product_code: p.product_code,
          product_name: p.product_name || p.product_code,
          buy_count: 0,
          total_qty: 0,
          total_amount: 0,
          latest_date: null,
          latest_unit_price: 0,
          current_stock: p.current_stock,
          purchase_price: p.purchase_price,
          stock_value: p.current_stock * p.purchase_price,
        });
      }
    }
    // 상품명 없는 코드에 대해 products 캐시로 fallback
    for (const s of byCode.values()) {
      if ((!s.product_name || s.product_name === s.product_code) && productByCode.has(s.product_code)) {
        const p = productByCode.get(s.product_code)!;
        if (p.product_name) s.product_name = p.product_name;
      }
    }
    // 검색 필터
    const q = productSearch.trim().toLowerCase();
    const list = Array.from(byCode.values()).filter(s => {
      if (!q) return true;
      return s.product_name.toLowerCase().includes(q) || s.product_code.toLowerCase().includes(q);
    });
    // 총 매입액 desc → 재고금액 desc → 이름
    list.sort((a, b) => {
      if (b.total_amount !== a.total_amount) return b.total_amount - a.total_amount;
      if (b.stock_value !== a.stock_value) return b.stock_value - a.stock_value;
      return a.product_name.localeCompare(b.product_name);
    });
    return list;
  }, [purchaseDetail, supplierProducts, productSearch]);

  // 선택된 상품 (하이라이트/원장 필터용)
  const selectedProduct = useMemo(() => {
    if (!selectedProductCode) return null;
    return productStats.find(p => p.product_code === selectedProductCode)
        ?? supplierProducts.find(p => p.product_code === selectedProductCode) as ProductStat | undefined
        ?? null;
  }, [selectedProductCode, productStats, supplierProducts]);

  // 선택 상품의 매입 이력 (필터된 raw rows) · date desc
  const selectedProductPurchases = useMemo(() => {
    if (!selectedProductCode) return [];
    return purchaseDetail
      .filter(r => (r.product_code ?? "") === selectedProductCode)
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [selectedProductCode, purchaseDetail]);

  // 정렬된 원장 행 (상품 선택 시 · 해당 상품 매입만 + 결제 전체)
  const sortedRows = useMemo(() => {
    if (!ledger) return [];
    let base = ledger.rows;
    if (selectedProductCode) {
      // 매입은 memo(product_name) 매칭 · 결제는 전체 유지
      const productName = selectedProduct?.product_name?.trim();
      base = ledger.rows.filter(r => {
        if (r.type === "payment") return true;
        if (!productName) return true;
        return String(r.memo ?? "").trim() === productName;
      });
    }
    const sign = sortDir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "date":            return sign * String(a.date ?? "").localeCompare(String(b.date ?? ""));
        case "type":            return sign * String(a.type).localeCompare(String(b.type));
        case "amount":          return sign * (a.amount - b.amount);
        case "running_balance": return sign * (a.running_balance - b.running_balance);
        default:                return 0;
      }
    });
  }, [ledger, sortKey, sortDir, selectedProductCode, selectedProduct]);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* 상단 필터바 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-sky-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">결제정보</span>
          {selectedVendor && ledger && (
            <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">
              {ledger.rows.length}건
            </span>
          )}
        </div>
        {/* 기간 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            <button onClick={() => { setPeriodSeason(null); setPeriodMonths(0); }}
              className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
            {([1, 2, 3, 4, 5, 6] as const).map(m => (
              <button key={m} onClick={() => { setPeriodSeason(null); setPeriodMonths(m); }}
                className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!periodSeason && periodMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
            ))}
          </div>
          <SeasonButtons value={periodSeason} onChange={(v) => { setPeriodSeason(v); if (v) setPeriodMonths(0); }} size="sm" hideLabel />
        </div>
        {selectedVendor && (
          <button
            type="button"
            onClick={() => { loadLedger(selectedVendor.company_name); loadDetail(selectedVendor.company_name); }}
            disabled={ledgerLoading || detailLoading}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={(ledgerLoading || detailLoading) ? "animate-spin" : ""} />
          </button>
        )}
      </div>

      {/* 좌우 분할 */}
      <div className="flex flex-col lg:flex-row gap-2 flex-1 min-h-0">
        {/* 좌측: 공급사 리스트 */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-3 py-2 flex flex-col gap-2">
            <input
              type="text"
              value={vendorSearch}
              onChange={e => setVendorSearch(e.target.value)}
              placeholder="공급사명 검색"
              className="w-full h-7 px-2.5 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-sky-400 focus:border-sky-400 transition"
            />
            <div className="flex flex-wrap gap-0.5">
              {(["전체", "위탁", "선결제", "60일회전", "90일회전", "기타"] as const).map(cat => (
                <button key={cat} onClick={() => setVendorCategoryFilter(cat)}
                  className={`h-6 px-2 text-[10px] font-semibold rounded transition cursor-pointer ${
                    vendorCategoryFilter === cat
                      ? cat === "전체" ? "bg-slate-700 text-white"
                      : cat === "위탁" ? "bg-violet-500 text-white"
                      : cat === "선결제" ? "bg-rose-500 text-white"
                      : cat === "60일회전" ? "bg-emerald-500 text-white"
                      : cat === "90일회전" ? "bg-teal-500 text-white"
                      : "bg-slate-500 text-white"
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:text-slate-700"
                  }`}>{cat}</button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="py-8 text-center text-[11px] text-slate-300">공급사 없음</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredVendors.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVendor(v)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition cursor-pointer ${
                      selectedVendor?.id === v.id
                        ? "bg-sky-50 border-l-2 border-sky-500"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <VendorCategoryBadge category={v.category} />
                    <span className={`text-[12px] font-semibold break-words whitespace-normal leading-tight flex-1 ${selectedVendor?.id === v.id ? "text-sky-800" : "text-slate-700"}`}>
                      {v.company_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 결제정보 상세 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
          {!selectedVendor ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
              <Package size={40} className="mb-3 opacity-30" />
              <div className="text-[11px] font-semibold">좌측에서 공급사를 선택하세요</div>
              <div className="text-[11px] mt-1">결제정보와 원장이 표시됩니다</div>
            </div>
          ) : ledgerLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 flex-1 flex items-center justify-center min-h-[400px]">
              <Loader2 size={24} className="animate-spin text-sky-500 opacity-60" />
            </div>
          ) : ledgerError ? (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-red-700">
              <div className="font-bold mb-1">조회 실패</div>
              <div className="text-[11px] font-mono">{ledgerError}</div>
            </div>
          ) : ledger ? (
            <>
              {/* 공급사 헤더 + 결제방법 요약 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 size={14} className="text-sky-600 shrink-0" />
                  <VendorCategoryBadge category={selectedVendor.category} />
                  <span className="text-[15px] font-black text-slate-800">{selectedVendor.company_name}</span>
                </div>
                {/* 결제방법 요약 */}
                {Object.keys(methodCount).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 self-center">결제방법</span>
                    {Object.entries(methodCount).map(([method, cnt]) => (
                      <span key={method} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
                        {methodLabel(method)} <span className="tabular-nums text-slate-400">{cnt}회</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* KPI 5카드 · 재고잔고 + 매입/결제/남은잔고 + 원장건수 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                <KpiCard
                  label="현재 재고잔고"
                  value={fmtWon(stockValue)}
                  sub={`${supplierProducts.length} SKU · 현재고 × 매입가`}
                  color="emerald"
                />
                <KpiCard
                  label="총 매입액"
                  value={fmtWon(ledger.total_purchase)}
                  sub="기간 내 OCR 확정"
                  color="emerald"
                />
                <KpiCard
                  label="총 결제액"
                  value={fmtWon(ledger.total_payment)}
                  sub="기간 내 결제"
                  color="sky"
                />
                <KpiCard
                  label="남은 잔고"
                  value={fmtWon(ledger.current_balance)}
                  sub="매입 - 결제"
                  color={ledger.current_balance > 0 ? "amber" : "emerald"}
                />
                <KpiCard
                  label="원장 건수"
                  value={String(ledger.rows.length)}
                  sub={`매입 ${ledger.rows.filter(r => r.type === "purchase").length} · 결제 ${ledger.rows.filter(r => r.type === "payment").length}`}
                  color="sky"
                />
              </div>

              {/* 상품별 매입 리스트 · 클릭 시 원장/이력 필터 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <Boxes size={13} className="text-emerald-500 shrink-0" />
                  <span className="text-[12px] font-black text-slate-700">상품별 매입이력</span>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 rounded-full px-2 py-0.5 border border-slate-200 tabular-nums">
                    {productStats.length} SKU
                  </span>
                  <input
                    type="text"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    placeholder="상품명·코드 검색"
                    className="ml-auto w-40 h-6 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition"
                  />
                  {selectedProductCode && (
                    <button
                      type="button"
                      onClick={() => setSelectedProductCode(null)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-semibold cursor-pointer transition"
                      title="상품 필터 해제"
                    >
                      <X size={11} /> 필터 해제
                    </button>
                  )}
                </div>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-6 text-slate-400 gap-2 text-[11px]">
                    <Loader2 size={12} className="animate-spin" />불러오는 중...
                  </div>
                ) : productStats.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-slate-300">해당 기간 매입/재고 없음</div>
                ) : (
                  <div className="overflow-auto max-h-64">
                    <table className="w-full text-xs min-w-[560px]">
                      <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                        <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                          <th className="text-left px-2 py-1.5 w-6 text-slate-300">#</th>
                          <th className="text-left px-2 py-1.5">상품명</th>
                          <th className="text-right px-2 py-1.5 w-16">매입건</th>
                          <th className="text-right px-2 py-1.5 w-16">총수량</th>
                          <th className="text-right px-2 py-1.5 w-20">총매입액</th>
                          <th className="text-right px-2 py-1.5 w-16">현재고</th>
                          <th className="text-right px-2 py-1.5 w-20">재고금액</th>
                          <th className="text-left px-2 py-1.5 w-20">최근매입</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {productStats.map((s, i) => {
                          const isSel = s.product_code === selectedProductCode;
                          return (
                            <tr
                              key={`ps-${s.product_code}`}
                              onClick={() => setSelectedProductCode(isSel ? null : s.product_code)}
                              className={`cursor-pointer transition-all duration-100 ${
                                isSel
                                  ? "bg-emerald-50 border-l-2 border-emerald-500"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="px-2 py-1.5 text-slate-300 text-[10px] tabular-nums align-top">{i + 1}</td>
                              <td className="px-2 py-1.5 align-top">
                                <div className={`text-[11px] font-semibold leading-tight break-words whitespace-normal ${isSel ? "text-emerald-800" : "text-slate-700"}`}>
                                  {s.product_name}
                                </div>
                                <div className="text-[9px] text-slate-400 font-mono">{s.product_code}</div>
                              </td>
                              <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-slate-600 align-top">
                                {s.buy_count > 0 ? s.buy_count : <span className="text-slate-300">-</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right text-[11px] tabular-nums text-slate-600 align-top">
                                {s.total_qty > 0 ? fmt(s.total_qty) : <span className="text-slate-300">-</span>}
                              </td>
                              <td className="px-2 py-1.5 text-right text-[11px] tabular-nums font-semibold text-emerald-700 align-top">
                                {s.total_amount > 0 ? fmt(s.total_amount) : <span className="text-slate-300 font-normal">-</span>}
                              </td>
                              <td className={`px-2 py-1.5 text-right text-[11px] tabular-nums align-top ${s.current_stock > 0 ? "text-slate-700 font-semibold" : "text-slate-300"}`}>
                                {s.current_stock > 0 ? fmt(s.current_stock) : "-"}
                              </td>
                              <td className={`px-2 py-1.5 text-right text-[11px] tabular-nums align-top ${s.stock_value > 0 ? "text-amber-700 font-semibold" : "text-slate-300"}`}>
                                {s.stock_value > 0 ? fmt(s.stock_value) : "-"}
                              </td>
                              <td className="px-2 py-1.5 text-[10px] text-slate-400 align-top whitespace-nowrap">
                                {s.latest_date ? dateLabel(s.latest_date) : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 선택 상품 매입 이력 (drill-down) */}
                {selectedProductCode && (
                  <div className="border-t border-slate-100 bg-emerald-50/20 px-4 py-2.5">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Filter size={11} className="text-emerald-600" />
                      <span className="text-[11px] font-black text-emerald-800">
                        {selectedProduct?.product_name ?? selectedProductCode}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-mono">{selectedProductCode}</span>
                      <span className="text-[10px] font-semibold text-emerald-600 bg-white rounded-full px-2 py-0.5 border border-emerald-200 tabular-nums">
                        매입 {selectedProductPurchases.length}건
                      </span>
                    </div>
                    {selectedProductPurchases.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-2">해당 기간 매입 이력 없음</div>
                    ) : (
                      <div className="overflow-auto max-h-40">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] text-slate-400 uppercase tracking-wider border-b border-emerald-100">
                              <th className="text-left px-2 py-1 w-20">매입일</th>
                              <th className="text-right px-2 py-1 w-16">수량</th>
                              <th className="text-right px-2 py-1 w-20">단가</th>
                              <th className="text-right px-2 py-1 w-24">금액</th>
                              <th className="text-left px-2 py-1">명세서</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-50">
                            {selectedProductPurchases.map((r) => (
                              <tr key={`spp-${r.id}`} className="hover:bg-emerald-50/40">
                                <td className="px-2 py-1 text-[11px] tabular-nums text-slate-500 whitespace-nowrap">
                                  {dateLabel(r.date)}
                                </td>
                                <td className="px-2 py-1 text-right text-[11px] tabular-nums text-slate-600">{fmt(r.quantity)}</td>
                                <td className="px-2 py-1 text-right text-[11px] tabular-nums text-slate-500">{fmt(r.unit_price)}</td>
                                <td className="px-2 py-1 text-right text-[11px] tabular-nums font-semibold text-emerald-700">
                                  {fmt(r.amount)}
                                </td>
                                <td className="px-2 py-1 text-[10px] text-slate-400">-</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 원장 테이블 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-black text-slate-700">매입·결제 통합 원장</span>
                  {selectedProductCode && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      <Filter size={10} /> {selectedProduct?.product_name ?? selectedProductCode}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">시간순 · running balance</span>
                </div>
                {sortedRows.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-12 text-slate-400 text-[11px]">
                    {selectedProductCode ? "해당 상품 매입 내역 없음 (결제는 상품 필터와 무관)" : "해당 기간 내역 없음"}
                  </div>
                ) : (
                  <div className="overflow-auto flex-1 min-h-0">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                        <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
                          <th className="text-left px-2 py-2 w-7 text-slate-300">#</th>
                          <th onClick={() => toggleSort("date")}
                            className="text-left px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            날짜{arrow("date")}
                          </th>
                          <th onClick={() => toggleSort("type")}
                            className="text-left px-2 py-2 w-16 cursor-pointer select-none hover:bg-slate-50 transition">
                            구분{arrow("type")}
                          </th>
                          <th className="text-left px-2 py-2">메모</th>
                          <th className="text-left px-2 py-2 w-16">방법</th>
                          <th onClick={() => toggleSort("amount")}
                            className="text-right px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            금액{arrow("amount")}
                          </th>
                          <th onClick={() => toggleSort("running_balance")}
                            className="text-right px-2 py-2 w-24 cursor-pointer select-none hover:bg-slate-50 transition">
                            잔고{arrow("running_balance")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {sortedRows.map((r, i) => {
                          const isPurchase = r.type === "purchase";
                          return (
                            <tr key={`led-${r.id}-${i}`} className={`transition-all duration-100 ${isPurchase ? "hover:bg-emerald-50/30" : "hover:bg-sky-50/30"}`}>
                              <td className="px-2 py-1.5 text-slate-300 text-[11px] tabular-nums align-top">{i + 1}</td>
                              <td className="px-2 py-1.5 tabular-nums text-[11px] text-slate-500 align-top whitespace-nowrap">
                                {dateLabel(r.date)}
                              </td>
                              <td className="px-2 py-1.5 align-top">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${
                                  isPurchase
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-sky-100 text-sky-700"
                                }`}>
                                  {isPurchase ? "매입" : "결제"}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-slate-600 align-top break-words whitespace-normal leading-snug">
                                {r.memo ?? "-"}
                              </td>
                              <td className="px-2 py-1.5 text-[11px] text-slate-400 align-top whitespace-nowrap">
                                {isPurchase ? "-" : methodLabel(r.method)}
                              </td>
                              <td className={`px-2 py-1.5 text-right tabular-nums text-[12px] font-semibold align-top ${isPurchase ? "text-emerald-700" : "text-sky-700"}`}>
                                {isPurchase ? "+" : "-"}{fmt(r.amount)}
                              </td>
                              <td className={`px-2 py-1.5 text-right tabular-nums text-[12px] font-black align-top ${r.running_balance > 0 ? "text-amber-700" : r.running_balance < 0 ? "text-rose-700" : "text-slate-400"}`}>
                                {fmt(r.running_balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-white border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={5} className="px-2 py-2 text-right text-[11px] font-black text-slate-500">최종잔고</td>
                          <td className="px-2 py-2 text-right text-[11px] font-black text-slate-500">
                            {fmtWon(ledger.total_purchase)}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums text-[13px] font-black ${ledger.current_balance > 0 ? "text-amber-700" : ledger.current_balance < 0 ? "text-rose-700" : "text-slate-400"}`}>
                            {fmtWon(ledger.current_balance)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PaymentInfoTab;
