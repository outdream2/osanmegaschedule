// 2026-07-28 · 재고·판매 통합 페이지 · 심플 · 좌 리스트 + 우 상세(차트+정보)
//   구조 · 상품별/공급사별 탭 · 좌측 = 리스트 (재고·판매·회전율 컬럼) · 우측 = 선택 상세 (차트 + 정보)
//   KPI 대시보드 제거 (사용자 요청)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { Package, Building2, RefreshCw, Loader2, Search, X } from "lucide-react";

type TabKey = "product" | "supplier";
type SortDir = "asc" | "desc";

interface ProductRow {
  product_code: string;
  product_name: string;
  supplier: string;
  real_map: string | null;
  current_stock: number;
  purchase_interval: number | null;
  last_purchase_date: string | null;
  purchase_qty: number;
  unit_price: number;
  total_amount: number;
  stock_value: number;
  sale_qty: number;
  turnover: number;
  doh: number;
}

interface SupplierRow {
  supplier: string;
  sku_count: number;
  total_stock_qty: number;
  avg_purchase_interval: number | null;
  last_purchase_date: string | null;
  purchase_qty: number;
  avg_unit_price: number;
  total_amount: number;
  stock_value: number;
  sale_qty: number;
  turnover: number;
  doh: number;
  balance: number;
}

const PERIOD_OPTIONS: Array<{ key: string; days: number; label: string }> = [
  { key: "1w", days: 7, label: "1주" },
  { key: "1m", days: 30, label: "1개월" },
  { key: "3m", days: 90, label: "3개월" },
  { key: "6m", days: 180, label: "6개월" },
];

const TOP_OPTIONS: Array<{ key: string; limit: number | null; label: string }> = [
  { key: "100", limit: 100, label: "TOP 100" },
  { key: "500", limit: 500, label: "TOP 500" },
  { key: "1000", limit: 1000, label: "TOP 1,000" },
  { key: "3000", limit: 3000, label: "TOP 3,000" },
  { key: "all", limit: null, label: "전체" },
];

const fmtNum = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "-";
  return Math.round(v).toLocaleString("ko-KR");
};
const fmtDec = (v: number | null | undefined, digits = 1) => {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toFixed(digits);
};

// 미니 바 차트 · SVG · 4~6 데이터 포인트
const MiniBarChart: React.FC<{ data: Array<{ label: string; value: number; color?: string }>; height?: number }> = ({ data, height = 100 }) => {
  const max = Math.max(1, ...data.map(d => Math.abs(d.value)));
  const w = 260;
  const gap = 4;
  const barW = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto">
      {data.map((d, i) => {
        const h = (Math.abs(d.value) / max) * (height - 24);
        const x = i * (barW + gap);
        const y = height - h - 16;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} fill={d.color ?? "#6366f1"} rx={2} />
            <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize={9} fill="#334155">{fmtNum(d.value)}</text>
            <text x={x + barW / 2} y={height - 3} textAnchor="middle" fontSize={9} fill="#64748b">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

export const InventorySalesPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("product");
  const [periodKey, setPeriodKey] = useState<string>("1m");
  const [topKey, setTopKey] = useState<string>("100");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [sortKey, setSortKey] = useState<string>("turnover");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierRow | null>(null);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  const days = PERIOD_OPTIONS.find(p => p.key === periodKey)?.days ?? 30;

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // 2026-07-28 · 사용자 요청 · 재고관리 페이지가 쓰는 top-sales API 를 재사용 (검증된 데이터 소스)
      //   months = days / 30 · 최소 1 · limit 50000 · 서버 정렬 sale desc
      const months = Math.max(1, Math.round(days / 30));
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: "50000", months: String(months) });
      const res = await axios.get(`/api/stock-manage/top-sales?${params}`);
      const rows: any[] = Array.isArray(res.data?.rows) ? res.data.rows : [];
      console.log(`[InventorySales] top-sales API · ${rows.length}건 · months=${months}`, rows.slice(0, 2));
      // top-sales row → ProductRow 변환
      const items: ProductRow[] = rows.map(r => {
        const purchase_qty = Number(r.purchase_qty ?? 0);
        const supply_amount = Number(r.supply_amount ?? r.total_supply_amount ?? 0);
        const unit_price = purchase_qty > 0
          ? supply_amount / purchase_qty
          : Number(r.purchase_price ?? 0);
        const current_stock = Number(r.current_stock ?? r.closing_stock ?? 0);
        const stock_value = current_stock * unit_price;
        const avg_stock = (Number(r.opening_stock ?? 0) + current_stock) / 2;
        const sale_qty = Number(r.sale_qty ?? 0);
        const turnover = avg_stock > 0 ? sale_qty / avg_stock : 0;
        const doh = turnover > 0 ? days / turnover : 999;
        return {
          product_code: String(r.product_code ?? ""),
          product_name: String(r.product_name ?? ""),
          supplier: String(r.supplier ?? r.supplier_name ?? ""),
          real_map: r.real_map ?? null,
          current_stock,
          purchase_interval: null,
          last_purchase_date: r.last_purchase_date ?? null,
          purchase_qty,
          unit_price,
          total_amount: Number(r.total_amount ?? 0),
          stock_value,
          sale_qty,
          turnover: Number.isFinite(turnover) ? turnover : 0,
          doh: Number.isFinite(doh) ? doh : 999,
        };
      });
      setProducts(items);
      // suppliers · 잔고 정보만 병행 조회 (실패 무시)
      try {
        const supRes = await axios.get(`/api/inventory-sales/suppliers?days=${days}`);
        setSuppliers(Array.isArray(supRes.data?.items) ? supRes.data.items : []);
      } catch { /* 무시 */ }
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? e?.message ?? "조회 실패";
      console.error(`[InventorySales] 조회 실패`, msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);
  // 탭 바뀌면 선택 초기화
  useEffect(() => { setSelectedProduct(null); setSelectedSupplier(null); }, [tab]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const topLimit = TOP_OPTIONS.find(t => t.key === topKey)?.limit ?? null;

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        p.product_name?.toLowerCase().includes(q) ||
        p.product_code?.toLowerCase().includes(q) ||
        p.supplier?.toLowerCase().includes(q)
      );
    }
    const sorted = [...list].sort((a: any, b: any) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return topLimit != null ? sorted.slice(0, topLimit) : sorted;
  }, [products, search, sortKey, sortDir, topLimit]);

  const filteredSuppliers = useMemo(() => {
    let list = suppliers;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.supplier?.toLowerCase().includes(q));
    }
    const sorted = [...list].sort((a: any, b: any) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return topLimit != null ? sorted.slice(0, topLimit) : sorted;
  }, [suppliers, search, sortKey, sortDir, topLimit]);

  // 2026-07-28 · 공급사 탭 · 상품리스트를 공급사별로 묶어서 (사용자 요청)
  //   각 공급사: 소속 상품들 + 그룹 aggregate (총 재고금액 · 총 판매금액 · 상품수)
  interface SupplierGroup {
    supplier: string;
    products: ProductRow[];
    total_amount: number;
    stock_value: number;
    sku_count: number;
    total_stock_qty: number;
    total_sale_qty: number;
    balance: number;
  }
  const supplierGroups: SupplierGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const balMap = new Map(suppliers.map(s => [s.supplier, s.balance]));
    const m = new Map<string, SupplierGroup>();
    for (const p of products) {
      const supp = p.supplier || "미상";
      if (q && !supp.toLowerCase().includes(q) &&
          !p.product_name?.toLowerCase().includes(q) &&
          !p.product_code?.toLowerCase().includes(q)) continue;
      if (!m.has(supp)) {
        m.set(supp, {
          supplier: supp, products: [], total_amount: 0, stock_value: 0,
          sku_count: 0, total_stock_qty: 0, total_sale_qty: 0,
          balance: Number(balMap.get(supp) ?? 0),
        });
      }
      const g = m.get(supp)!;
      g.products.push(p);
      g.total_amount += p.total_amount || 0;
      g.stock_value += p.stock_value || 0;
      g.total_stock_qty += p.current_stock || 0;
      g.total_sale_qty += p.sale_qty || 0;
      g.sku_count += 1;
    }
    // 상품 내부 정렬 (판매금액 내림)
    for (const g of m.values()) g.products.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
    // 공급사 정렬 (총 판매금액 내림)
    const list = [...m.values()].sort((a, b) => b.total_amount - a.total_amount);
    // TOP N · 공급사 수 기준
    return topLimit != null ? list.slice(0, topLimit) : list;
  }, [products, suppliers, search, topLimit]);

  const toggleSupplierExpand = (supplier: string) => {
    setExpandedSuppliers(prev => {
      const n = new Set(prev);
      if (n.has(supplier)) n.delete(supplier); else n.add(supplier);
      return n;
    });
  };

  const renderTh = (key: string, label: string, align: string = "left", width: string = "") => {
    const active = sortKey === key;
    return (
      <th key={key}
        onClick={() => toggleSort(key)}
        className={`px-2 py-2 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 transition text-${align} whitespace-nowrap ${width}`}
      >
        {label}{active && <span className="ml-0.5 text-indigo-500">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  };

  // 2026-07-28 · 재고+판매현황+회전율 통합 컬럼 (사용자 요청)
  //   재고: 현재고 · 재고금액 · 매입주기 · 최근매입일 · 매입수량 · 단가
  //   판매: 판매수량 · 판매금액
  //   회전율: 회전율 · 회전일수
  const productCols: Array<{ key: string; label: string; align?: "left" | "right"; render: (r: ProductRow) => React.ReactNode; width?: string; group?: string }> = [
    { key: "product_name", label: "상품", align: "left", width: "min-w-[200px]", render: r => (
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-slate-800 truncate max-w-[260px]">{r.product_name}</span>
        <span className="text-[9px] text-slate-400 font-mono">{r.product_code} · {r.supplier}</span>
      </div>
    )},
    { key: "current_stock", label: "현재고", align: "right", width: "w-16", group: "재고",
      render: r => <span className="font-bold text-slate-800">{fmtNum(r.current_stock)}</span> },
    { key: "stock_value", label: "재고금액", align: "right", width: "w-24", group: "재고",
      render: r => <span className="font-bold text-indigo-700">{fmtNum(r.stock_value)}</span> },
    { key: "purchase_interval", label: "매입주기", align: "right", width: "w-20", group: "매입",
      render: r => r.purchase_interval != null ? <span>{fmtDec(r.purchase_interval, 0)}일</span> : <span className="text-slate-300">-</span> },
    { key: "last_purchase_date", label: "최근매입일", align: "left", width: "w-24", group: "매입",
      render: r => <span className="text-slate-600 font-mono text-[10px]">{r.last_purchase_date ?? "-"}</span> },
    { key: "purchase_qty", label: "매입수량", align: "right", width: "w-16", group: "매입",
      render: r => <span className="text-emerald-700">{fmtNum(r.purchase_qty)}</span> },
    { key: "unit_price", label: "단가", align: "right", width: "w-20", group: "매입",
      render: r => fmtNum(r.unit_price) },
    { key: "sale_qty", label: "판매수량", align: "right", width: "w-16", group: "판매",
      render: r => <span className="text-sky-700">{fmtNum(r.sale_qty)}</span> },
    { key: "total_amount", label: "판매금액", align: "right", width: "w-24", group: "판매",
      render: r => <span className="font-bold text-amber-700">{fmtNum(r.total_amount)}</span> },
    { key: "turnover", label: "회전율", align: "right", width: "w-16", group: "회전",
      render: r => <span className="font-bold text-emerald-700">{fmtDec(r.turnover, 2)}</span> },
    { key: "doh", label: "회전일수", align: "right", width: "w-16", group: "회전",
      render: r => <span className="text-slate-600">{fmtNum(r.doh)}</span> },
  ];

  const supplierCols: Array<{ key: string; label: string; align?: "left" | "right"; render: (r: SupplierRow) => React.ReactNode; width?: string }> = [
    { key: "supplier", label: "공급사", align: "left", width: "min-w-[180px]", render: r => (
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-slate-800 truncate max-w-[240px]">{r.supplier}</span>
        <span className="text-[9px] text-slate-400">SKU {r.sku_count}개</span>
      </div>
    )},
    { key: "total_stock_qty", label: "현재고", align: "right", width: "w-16", render: r => <span className="font-bold text-slate-800">{fmtNum(r.total_stock_qty)}</span> },
    { key: "avg_purchase_interval", label: "매입주기", align: "right", width: "w-20", render: r => r.avg_purchase_interval != null ? <span>{fmtDec(r.avg_purchase_interval, 0)}일</span> : <span className="text-slate-300">-</span> },
    { key: "last_purchase_date", label: "최근매입일", align: "left", width: "w-24", render: r => <span className="text-slate-600 font-mono text-[10px]">{r.last_purchase_date ?? "-"}</span> },
    { key: "purchase_qty", label: "매입수량", align: "right", width: "w-16", render: r => <span className="text-emerald-700">{fmtNum(r.purchase_qty)}</span> },
    { key: "avg_unit_price", label: "평균단가", align: "right", width: "w-20", render: r => fmtNum(r.avg_unit_price) },
    { key: "total_amount", label: "판매금액", align: "right", width: "w-24", render: r => <span className="font-bold text-amber-700">{fmtNum(r.total_amount)}</span> },
    { key: "stock_value", label: "재고금액", align: "right", width: "w-24", render: r => <span className="font-bold text-indigo-700">{fmtNum(r.stock_value)}</span> },
    { key: "balance", label: "잔고", align: "right", width: "w-20", render: r => <span className="text-orange-700 font-bold">{fmtNum(r.balance)}</span> },
  ];

  return (
    <div className="flex flex-col gap-2 p-3 max-w-[1800px] mx-auto w-full">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* 상단 · 탭 + 필터 (KPI 대시보드 제거 · 사용자 요청) */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab("product")}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                tab === "product"
                  ? "bg-indigo-500 text-white shadow-sm"
                  : "text-indigo-700 hover:bg-indigo-50 border border-indigo-200"
              }`}
            >
              <Package size={12} /> 상품별
            </button>
            <button
              type="button"
              onClick={() => setTab("supplier")}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                tab === "supplier"
                  ? "bg-rose-400 text-white shadow-sm"
                  : "text-rose-600 hover:bg-rose-50 border border-rose-200"
              }`}
            >
              <Building2 size={12} /> 공급사별
            </button>
          </div>
          <span className="text-[11px] text-slate-400 mx-1">|</span>
          <span className="text-[11px] font-bold text-slate-600">기간</span>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriodKey(p.key)}
              className={`text-[11px] font-bold px-2 py-0.5 rounded border cursor-pointer transition ${
                periodKey === p.key ? "bg-indigo-500 text-white border-indigo-600" : "text-slate-600 border-slate-300 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="text-[11px] text-slate-400 mx-1">|</span>
          <span className="text-[11px] font-bold text-slate-600">상위</span>
          {TOP_OPTIONS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTopKey(t.key)}
              className={`text-[11px] font-bold px-2 py-0.5 rounded border cursor-pointer transition ${
                topKey === t.key ? "bg-emerald-500 text-white border-emerald-600" : "text-slate-600 border-slate-300 hover:bg-slate-100"
              }`}
              title={t.limit ? `정렬 상위 ${t.limit.toLocaleString()}개` : "전체"}
            >
              {t.label}
            </button>
          ))}
          <div className="relative ml-2 flex-1 max-w-xs min-w-[160px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              lang="ko"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === "product" ? "품명·코드·공급사..." : "공급사명..."}
              className="w-full pl-7 pr-2 py-1 text-[11px] border border-slate-300 rounded outline-none focus:border-indigo-400 bg-white"
            />
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-slate-200 cursor-pointer disabled:opacity-40"
            title="새로고침"
          >
            <RefreshCw size={13} className={`text-slate-500 ${loading ? "animate-spin" : ""}`} />
          </button>
          <span className="ml-auto text-[11px] text-slate-500 font-bold">
            {tab === "product"
              ? `${filteredProducts.length}건`
              : `${supplierGroups.length}개 공급사 · 상품 ${supplierGroups.reduce((s, g) => s + g.sku_count, 0)}건`}
          </span>
        </div>

        {err && (
          <div className="px-4 py-2 text-[11px] text-rose-700 bg-rose-50 border-b border-rose-100 font-semibold">
            {err}
          </div>
        )}

        {/* 좌우 분할 · 좌 리스트 · 우 차트+정보 */}
        <div className="flex flex-col md:flex-row min-h-[500px]">
          {/* 좌 · 리스트 */}
          <div className="flex-1 md:basis-[62%] md:border-r border-slate-200 overflow-x-auto max-h-[calc(100vh-180px)] overflow-y-auto">
            {loading && (tab === "product" ? filteredProducts.length : supplierGroups.length) === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
                <Loader2 size={14} className="animate-spin" /> 불러오는 중...
              </div>
            ) : !loading && (tab === "product" ? filteredProducts.length : supplierGroups.length) === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">데이터가 없습니다.</div>
            ) : tab === "product" ? (
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                  <tr>{productCols.map(c => renderTh(c.key, c.label, c.align, c.width))}</tr>
                </thead>
                <tbody>
                  {filteredProducts.map(r => (
                    <tr key={r.product_code}
                      onClick={() => setSelectedProduct(r)}
                      className={`border-t border-slate-100 cursor-pointer transition ${
                        selectedProduct?.product_code === r.product_code ? "bg-indigo-50" : "hover:bg-slate-50"
                      }`}
                    >
                      {productCols.map(c => (
                        <td key={c.key} className={`px-2 py-1.5 text-${c.align ?? "left"} ${c.align === "right" ? "tabular-nums" : ""}`}>
                          {c.render(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              // 2026-07-28 · 공급사 탭 · 상품리스트를 공급사별로 묶어서 (사용자 요청)
              //   그룹 헤더 · 공급사명 · 상품수 · 재고금액 · 판매금액 · 잔고 · 클릭 시 확장
              //   확장 시 · 내부에 상품 컬럼 그대로 리스트
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-rose-50 border-b border-rose-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 w-6 text-center font-bold text-rose-800"></th>
                    <th className="px-2 py-2 text-left font-bold text-rose-800 min-w-[200px]">공급사</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-16">상품수</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-20">현재고</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-24">재고금액</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-16">판매수량</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-24">판매금액</th>
                    <th className="px-2 py-2 text-right font-bold text-rose-800 w-20">잔고</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierGroups.map(g => {
                    const expanded = expandedSuppliers.has(g.supplier);
                    return (
                      <React.Fragment key={g.supplier}>
                        <tr
                          onClick={() => {
                            toggleSupplierExpand(g.supplier);
                            const sup = suppliers.find(s => s.supplier === g.supplier);
                            if (sup) setSelectedSupplier(sup);
                          }}
                          className={`border-t border-rose-100 cursor-pointer transition ${
                            selectedSupplier?.supplier === g.supplier ? "bg-rose-50" : "hover:bg-rose-50/40"
                          }`}
                        >
                          <td className="px-2 py-1.5 text-center text-rose-500 font-bold">{expanded ? "▼" : "▶"}</td>
                          <td className="px-2 py-1.5 font-semibold text-slate-800 truncate">{g.supplier}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{g.sku_count}</td>
                          <td className="px-2 py-1.5 text-right text-slate-800 font-bold tabular-nums">{fmtNum(g.total_stock_qty)}</td>
                          <td className="px-2 py-1.5 text-right text-indigo-700 font-bold tabular-nums">{fmtNum(g.stock_value)}</td>
                          <td className="px-2 py-1.5 text-right text-sky-700 tabular-nums">{fmtNum(g.total_sale_qty)}</td>
                          <td className="px-2 py-1.5 text-right text-amber-700 font-bold tabular-nums">{fmtNum(g.total_amount)}</td>
                          <td className="px-2 py-1.5 text-right text-orange-700 font-bold tabular-nums">{fmtNum(g.balance)}</td>
                        </tr>
                        {expanded && (
                          <tr className="bg-rose-50/20">
                            <td colSpan={8} className="p-0">
                              <table className="w-full text-[10px] border-collapse">
                                <thead className="bg-rose-100/40 border-b border-rose-200">
                                  <tr>{productCols.map(c => renderTh(c.key, c.label, c.align, c.width))}</tr>
                                </thead>
                                <tbody>
                                  {g.products.map(p => (
                                    <tr key={p.product_code}
                                      onClick={() => setSelectedProduct(p)}
                                      className={`border-t border-rose-100/50 cursor-pointer transition ${
                                        selectedProduct?.product_code === p.product_code ? "bg-rose-100/40" : "hover:bg-rose-50/60"
                                      }`}
                                    >
                                      {productCols.map(c => (
                                        <td key={c.key} className={`px-2 py-1 text-${c.align ?? "left"} ${c.align === "right" ? "tabular-nums" : ""}`}>
                                          {c.render(p)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* 우 · 차트 + 정보 */}
          <div className="md:basis-[38%] bg-slate-50/40 p-3 flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-180px)]">
            {tab === "product" && selectedProduct ? (
              <ProductDetail row={selectedProduct} onClose={() => setSelectedProduct(null)} />
            ) : tab === "supplier" && selectedSupplier ? (
              <SupplierDetail row={selectedSupplier} onClose={() => setSelectedSupplier(null)} />
            ) : (
              <div className="text-center text-slate-400 text-[11px] py-8">
                좌측 리스트에서 항목을 선택하면 · 차트와 정보가 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 상세 · 상품 ──────────────────────────────────────────────────────
const ProductDetail: React.FC<{ row: ProductRow; onClose: () => void }> = ({ row, onClose }) => {
  const qty = [
    { label: "매입", value: row.purchase_qty, color: "#10b981" },
    { label: "판매", value: row.sale_qty, color: "#0ea5e9" },
    { label: "현재고", value: row.current_stock, color: "#334155" },
  ];
  const money = [
    { label: "판매금액", value: row.total_amount, color: "#f59e0b" },
    { label: "재고금액", value: row.stock_value, color: "#6366f1" },
  ];
  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-black text-slate-800 truncate">{row.product_name}</span>
          <span className="text-[10px] text-slate-500 font-mono">{row.product_code} · {row.supplier}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" title="닫기"><X size={14} /></button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <InfoCell label="현재고" value={fmtNum(row.current_stock)} color="slate" />
        <InfoCell label="매입주기" value={row.purchase_interval != null ? fmtDec(row.purchase_interval, 0) : "-"} unit="일" color="indigo" />
        <InfoCell label="최근매입일" value={row.last_purchase_date ?? "-"} color="sky" />
        <InfoCell label="매입수량" value={fmtNum(row.purchase_qty)} color="emerald" />
        <InfoCell label="단가" value={fmtNum(row.unit_price)} unit="원" color="slate" />
        <InfoCell label="회전율" value={fmtDec(row.turnover, 2)} unit="회" color="emerald" />
      </div>

      <div>
        <div className="text-[10px] font-bold text-slate-600 mb-1">📦 수량</div>
        <div className="bg-white border border-slate-200 rounded p-2">
          <MiniBarChart data={qty} height={110} />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold text-slate-600 mb-1">💰 금액</div>
        <div className="bg-white border border-slate-200 rounded p-2">
          <MiniBarChart data={money} height={110} />
        </div>
      </div>
    </>
  );
};

// ── 상세 · 공급사 ────────────────────────────────────────────────────
const SupplierDetail: React.FC<{ row: SupplierRow; onClose: () => void }> = ({ row, onClose }) => {
  const qty = [
    { label: "매입", value: row.purchase_qty, color: "#10b981" },
    { label: "판매", value: row.sale_qty, color: "#0ea5e9" },
    { label: "재고", value: row.total_stock_qty, color: "#334155" },
  ];
  const money = [
    { label: "판매금액", value: row.total_amount, color: "#f59e0b" },
    { label: "재고금액", value: row.stock_value, color: "#6366f1" },
    { label: "잔고", value: row.balance, color: "#f97316" },
  ];
  return (
    <>
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-black text-slate-800 truncate">{row.supplier}</span>
          <span className="text-[10px] text-slate-500">SKU {row.sku_count}개</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" title="닫기"><X size={14} /></button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <InfoCell label="현재고 합계" value={fmtNum(row.total_stock_qty)} color="slate" />
        <InfoCell label="매입주기" value={row.avg_purchase_interval != null ? fmtDec(row.avg_purchase_interval, 0) : "-"} unit="일" color="indigo" />
        <InfoCell label="최근매입일" value={row.last_purchase_date ?? "-"} color="sky" />
        <InfoCell label="매입수량" value={fmtNum(row.purchase_qty)} color="emerald" />
        <InfoCell label="평균단가" value={fmtNum(row.avg_unit_price)} unit="원" color="slate" />
        <InfoCell label="회전율" value={fmtDec(row.turnover, 2)} unit="회" color="emerald" />
      </div>

      <div>
        <div className="text-[10px] font-bold text-slate-600 mb-1">📦 수량</div>
        <div className="bg-white border border-slate-200 rounded p-2">
          <MiniBarChart data={qty} height={110} />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold text-slate-600 mb-1">💰 금액</div>
        <div className="bg-white border border-slate-200 rounded p-2">
          <MiniBarChart data={money} height={110} />
        </div>
      </div>
    </>
  );
};

const InfoCell: React.FC<{ label: string; value: string; unit?: string; color?: string }> = ({ label, value, unit, color = "slate" }) => {
  const colorMap: Record<string, string> = {
    slate: "text-slate-700",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
    sky: "text-sky-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    orange: "text-orange-700",
    violet: "text-violet-700",
  };
  return (
    <div className="bg-white border border-slate-200 rounded p-1.5">
      <div className="text-[8px] text-slate-400 font-bold">{label}</div>
      <div className={`text-xs font-black ${colorMap[color] ?? colorMap.slate}`}>{value}<span className="text-[9px] font-normal ml-0.5">{unit}</span></div>
    </div>
  );
};

export default InventorySalesPage;
