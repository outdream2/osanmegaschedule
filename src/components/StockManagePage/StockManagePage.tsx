// src/components/StockManagePage/StockManagePage.tsx
// 재고관리 페이지 — 상품관리 탭의 sub-tab (level 9 전용)
// 좌측: ERP 현재고 + 수량 차이 추이 차트
// 우측: 공급사별 매입 · Top 100 · 적정재고 이하

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Package, TrendingUp, AlertTriangle, Building2, Info, EyeOff, Eye, Loader2 as LoaderIcon, Pencil, Check, X as XIcon, CheckSquare, Square, Boxes, Activity, Layers, FileText, LineChart } from "lucide-react";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { getProductsMap, lookupProduct, type ProductInfo } from "../../lib/productsCache";
import { useHiddenManager } from "../../hooks/useHiddenManager";
import { useProductInfoSearch } from "../../hooks/useProductInfoSearch";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import {
  MultiLineChart,
  periodLabel,
  fillPeriodsWithRows,
  aggregateToMonths,
  type PeriodRow,
} from "../../lib/stockPeriodUtils";
import {
  StockFlowPanel,
  type StockFlowRow as SalesTrendStockFlowRow,
} from "../SalesTrendPage/SalesTrendPage";

type Range = "week" | "month" | "3month";
const RANGE_LABEL: Record<Range, string> = { week: "1주일", month: "1개월", "3month": "3개월" };
const RANGE_DAYS: Record<Range, number> = { week: 7, month: 30, "3month": 90 };

interface ProductLite {
  product_name: string;
  product_code: string | null;
  spec: string | null;
  current_stock: number | null;
  optimal_stock: number | null;
  supplier: string | null;
  real_map: string | null;
}

interface PurchaseRow {
  supplier: string | null;
  product_name: string;
  product_code: string | null;
  quantity: number;
  amount: number;
  saved_at: string;
}

interface SupplierAggregate {
  supplier: string;
  purchaseAmount: number;
  purchaseQty: number;
  itemCount: number;
}

interface TopProduct {
  product_name: string;
  product_code: string | null;
  supplier: string | null;
  totalAmount: number;
  totalQty: number;
}

interface StockFlowRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  spec: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  closing_stock: number;
  total_amount: number;
  optimal_stock: number;
  last_purchase_date?: string | null;
}
type SortKey = "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss";
type SortDir = "asc" | "desc";

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}

function fmtWon(n: number): string {
  if (n >= 10000_0000) return `${(n / 10000_0000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return fmt(n) + "원";
}

// 다양한 날짜 포맷에서 (M/D) 추출
// - "2026-07-07" · "2026-7-7" · "2026-07-07T00:00:00Z" · "2026/07/07" · Date 객체 모두 대응
function extractMonthDay(raw: any): string | null {
  if (!raw) return null;
  try {
    // Date 객체 or ISO 문자열 시도
    if (raw instanceof Date) return `${raw.getMonth() + 1}/${raw.getDate()}`;
    const s = String(raw).trim();
    if (!s) return null;
    // 정규식: YYYY[-/]M[-/]D 형태
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
    if (m) return `${Number(m[2])}/${Number(m[3])}`;
    // ISO fallback via Date parser
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getMonth() + 1}/${d.getDate()}`;
    return null;
  } catch { return null; }
}

// 간단 SVG 라인차트 — 값 배열을 받아 렌더
const MiniChart: React.FC<{ values: number[]; labels?: string[]; height?: number; color?: string }> = ({
  values, labels, height = 100, color = "#3b82f6",
}) => {
  const w = 320;
  const h = height;
  const pad = 24;
  if (values.length < 2) {
    return <div className="text-[11px] text-slate-400 text-center py-6">데이터 없음</div>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <polyline fill="none" stroke={color} strokeWidth={2} points={points} />
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (v - min) / range) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}
      {labels && labels.length === values.length && labels.map((lb, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        return (
          <text key={i} x={x} y={h - 6} textAnchor="middle" className="text-[9px] fill-slate-400">{lb}</text>
        );
      })}
    </svg>
  );
};

// YYYY-MM-DD 형식 오늘/N일전 헬퍼
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};

// 원본 데이터 뷰 — stock_history 전체를 xlsx 원본 그대로 표시
interface RawRow {
  snapshot_date: string;
  product_code: string;
  supplier_code: string | null;
  supplier_name: string | null;
  product_name: string | null;
  spec: string | null;
  tax_type?: string | null;
  product_type?: string | null;
  opening_stock: number;
  purchase_qty: number;
  sale_qty: number;
  disposal_qty: number;
  internal_qty: number;
  adjustment_qty: number;
  closing_stock: number;
  taxable_amount: number;
  supply_amount: number;
  vat: number;
  duty_free_amount: number;
  total_amount: number;
}
// 원본 데이터 컬럼 정의 (헤더 라벨·데이터 키·정렬 가능 여부·정렬시 숫자 여부·기본 폭)
type RawColKey = keyof RawRow;
interface RawColDef {
  key: RawColKey;
  label: string;
  align: "left" | "right";
  numeric: boolean;
  width: number;
  cellClass?: (r: RawRow) => string;
}
const RAW_COLS: RawColDef[] = [
  { key: "supplier_code", label: "공급사코드", align: "left", numeric: false, width: 90 },
  { key: "supplier_name", label: "공급사명", align: "left", numeric: false, width: 140 },
  { key: "product_code", label: "코드", align: "left", numeric: false, width: 130 },
  { key: "product_name", label: "명", align: "left", numeric: false, width: 240 },
  { key: "spec", label: "전산배치", align: "left", numeric: false, width: 90 },
  { key: "tax_type", label: "i", align: "left", numeric: false, width: 40 },
  { key: "product_type", label: "상품유형", align: "left", numeric: false, width: 70 },
  { key: "opening_stock", label: "시작재고", align: "right", numeric: true, width: 80 },
  { key: "purchase_qty", label: "입고계", align: "right", numeric: true, width: 70, cellClass: () => "text-emerald-600" },
  { key: "sale_qty", label: "판매출고계", align: "right", numeric: true, width: 90, cellClass: () => "text-orange-600 font-bold" },
  { key: "disposal_qty", label: "폐기", align: "right", numeric: true, width: 60, cellClass: () => "text-rose-500" },
  { key: "internal_qty", label: "사내소비", align: "right", numeric: true, width: 70 },
  { key: "adjustment_qty", label: "재고조정", align: "right", numeric: true, width: 70 },
  { key: "closing_stock", label: "종료재고", align: "right", numeric: true, width: 80, cellClass: r => r.closing_stock < 0 ? "text-rose-600 font-bold" : "text-slate-800 font-bold" },
  { key: "taxable_amount", label: "과세", align: "right", numeric: true, width: 100 },
  { key: "supply_amount", label: "공급가액", align: "right", numeric: true, width: 110 },
  { key: "vat", label: "부가세", align: "right", numeric: true, width: 90 },
  { key: "duty_free_amount", label: "면세", align: "right", numeric: true, width: 80 },
  { key: "total_amount", label: "합계", align: "right", numeric: true, width: 110, cellClass: () => "font-bold text-slate-700" },
];

const RawDataView: React.FC = () => {
  const [rows, setRows] = useState<RawRow[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [rawSearch, setRawSearch] = useState<string>("");
  const [rawLoading, setRawLoading] = useState(false);
  // 정렬 상태
  const [sortKey, setSortKey] = useState<RawColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // 컬럼 너비 상태 (초기값 = 기본 폭)
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(RAW_COLS.map(c => [c.key, c.width]))
  );
  const dragRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    (async () => {
      setRawLoading(true);
      try {
        const params = new URLSearchParams({ limit: "10000" });
        if (selectedDate) params.set("snapshot_date", selectedDate);
        const res = await fetch(`/api/stock-manage/raw?${params}`);
        if (res.ok) {
          const data = await res.json();
          setDates(Array.isArray(data.dates) ? data.dates : []);
          setRows(Array.isArray(data.rows) ? data.rows : []);
          if (!selectedDate && Array.isArray(data.dates) && data.dates.length > 0) {
            setSelectedDate(data.dates[0]);
          }
        }
      } finally { setRawLoading(false); }
    })();
  }, [selectedDate]);

  const filtered = useMemo(() => {
    const q = rawSearch.trim().toLowerCase();
    const base = !q ? rows : rows.filter(r =>
      (r.product_name ?? "").toLowerCase().includes(q) ||
      (r.supplier_name ?? "").toLowerCase().includes(q) ||
      (r.product_code ?? "").toLowerCase().includes(q)
    );
    if (!sortKey) return base;
    const col = RAW_COLS.find(c => c.key === sortKey);
    const numeric = col?.numeric ?? false;
    const sorted = [...base].sort((a, b) => {
      const va = a[sortKey] as unknown, vb = b[sortKey] as unknown;
      if (numeric) {
        const na = Number(va ?? 0), nb = Number(vb ?? 0);
        return sortDir === "asc" ? na - nb : nb - na;
      }
      const sa = String(va ?? ""), sb = String(vb ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return sorted;
  }, [rows, rawSearch, sortKey, sortDir]);

  const handleHeaderClick = (key: RawColKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // 숫자 컬럼 처음 클릭시 내림차순(큰 값 먼저), 텍스트는 오름차순
      const col = RAW_COLS.find(c => c.key === key);
      setSortDir(col?.numeric ? "desc" : "asc");
    }
  };

  // 리사이즈: mousedown → 이동추적 → mouseup
  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { key, startX: e.clientX, startW: colWidths[key] };
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const nw = Math.max(40, d.startW + (ev.clientX - d.startX));
      setColWidths(prev => ({ ...prev, [d.key]: nw }));
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* 컨트롤 바 */}
      <div className="flex items-center gap-2 flex-wrap bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
          스냅샷 날짜
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-2 py-1 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:border-indigo-400">
            {dates.length === 0 && <option value="">(데이터 없음)</option>}
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <input
          type="text"
          value={rawSearch}
          onChange={e => setRawSearch(e.target.value)}
          placeholder="상품명·공급사·코드 검색..."
          className="flex-1 min-w-[200px] px-3 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-indigo-400"
        />
        <span className="text-[11px] font-bold text-slate-500">
          {rawLoading ? "불러오는 중..." : `${filtered.length}건 / 전체 ${rows.length}건`}
        </span>
        {sortKey && (
          <button onClick={() => { setSortKey(null); }}
            className="text-[10px] font-semibold text-slate-400 hover:text-rose-500 px-1.5 py-0.5 rounded hover:bg-rose-50 transition">
            ✕ 정렬 해제
          </button>
        )}
        <button onClick={() => setColWidths(Object.fromEntries(RAW_COLS.map(c => [c.key, c.width])))}
          className="text-[10px] font-semibold text-slate-400 hover:text-indigo-500 px-1.5 py-0.5 rounded hover:bg-indigo-50 transition">
          컬럼 폭 초기화
        </button>
      </div>

      {/* 원본 데이터 테이블 — 정렬·리사이즈 지원 */}
      <div className="flex-1 min-h-0 max-h-[72vh] lg:max-h-none bg-white border border-slate-200 rounded-xl shadow-sm overflow-auto">
        <table className="text-[11px]" style={{ tableLayout: "fixed", width: "auto" }}>
          <colgroup>
            {RAW_COLS.map(c => (
              <col key={c.key} style={{ width: `${colWidths[c.key]}px` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 bg-slate-100 z-10 text-slate-600">
            <tr>
              {RAW_COLS.map(c => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key}
                    onClick={() => handleHeaderClick(c.key)}
                    className={`relative px-2 py-1.5 border-r border-slate-200 whitespace-nowrap cursor-pointer select-none hover:bg-slate-200 transition ${c.align === "right" ? "text-right" : "text-left"
                      } ${active ? "text-indigo-700 font-black" : ""}`}
                    title={`클릭: ${c.label} 기준 정렬 (재클릭: 방향 반전)`}
                  >
                    <span className="pointer-events-none">
                      {c.label}
                      {active && <span className="ml-0.5 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </span>
                    {/* 리사이즈 핸들 (오른쪽 경계 4px) */}
                    <span
                      onMouseDown={e => startResize(e, c.key)}
                      onClick={e => e.stopPropagation()}
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300/60"
                      style={{ userSelect: "none" }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((r, i) => (
              <tr key={`raw-${r.snapshot_date}-${r.product_code}-${i}`} className="hover:bg-indigo-50/30">
                {RAW_COLS.map(c => {
                  const v = r[c.key];
                  const isNumeric = c.numeric;
                  const extraCls = c.cellClass ? c.cellClass(r) : "";
                  return (
                    <td key={c.key}
                      className={`px-2 py-1 border-r border-slate-100 truncate ${isNumeric ? "text-right font-mono" : ""
                        } ${extraCls} ${!isNumeric && !extraCls ? "text-slate-600" : ""}`}
                      title={String(v ?? "")}
                    >
                      {isNumeric ? fmt(Number(v ?? 0)) : (v ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// 상품관리 뷰 (2026-07-15) · products 캐시 검색·리스트뷰
//   행 클릭 → 상세/편집 모달 (openScanProductModal)
// ═══════════════════════════════════════════════════════════════════════
type PMSortKey = "name" | "code" | "supplier" | "current" | "optimal" | "price";
export const ProductManageView: React.FC<{ onProductClick: (p: any) => void }> = ({ onProductClick }) => {
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<PMSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProductsMap()
      .then(map => setAllProducts(Object.values(map)))
      .catch(() => setAllProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = allProducts.filter(p => {
      if (!showHidden && p.hidden === true) return false;
      if (!q) return true;
      return String(p.product_name ?? p.name ?? "").toLowerCase().includes(q)
        || String(p.product_code ?? p.code ?? "").includes(q)
        || String(p.supplier ?? "").toLowerCase().includes(q);
    });
    const sign = sortDir === "asc" ? 1 : -1;
    const getVal = (p: any): any => {
      switch (sortKey) {
        case "name": return String(p.product_name ?? p.name ?? "");
        case "code": return String(p.product_code ?? p.code ?? "");
        case "supplier": return String(p.supplier ?? "");
        case "current": return Number(p.current_stock ?? 0);
        case "optimal": return Number(p.optimal_stock ?? 0);
        case "price": return Number(p.sale_price ?? 0);
      }
    };
    return [...base].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), "ko");
    });
  }, [allProducts, search, sortKey, sortDir, showHidden]);

  const handleSort = (k: PMSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "current" || k === "optimal" || k === "price" ? "desc" : "asc"); }
  };
  const arrow = (k: PMSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2 flex-wrap">
          <Package size={14} className="text-indigo-600" />
          <span className="text-[11px] font-black text-slate-600">상품관리</span>
          <span className="text-[10px] font-mono text-slate-400">
            ({loading ? <><LoaderIcon size={10} className="inline animate-spin mr-1" />로딩...</> : `${filtered.length.toLocaleString()} / ${allProducts.length.toLocaleString()}개`})
          </span>
          <div className="relative min-w-[160px] flex-1 max-w-sm">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명 · 코드 · 공급사 검색"
              className="w-full pl-7 pr-6 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-orange-400 bg-white"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-rose-500 hover:text-rose-700 cursor-pointer">✕</button>
            )}
          </div>
          <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="cursor-pointer" />
            <EyeOff size={10} className={showHidden ? "text-slate-700" : "text-slate-400"} />
            숨김 포함
          </label>
        </div>
        <p className="text-[10px] text-slate-500 font-semibold leading-tight">상품명 클릭 → 상세 정보 · 판매가 · 재고 상황</p>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px] sm:text-xs sm:min-w-[540px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="text-left px-0.5 py-1.5 w-7">#</th>
              {([
                { k: "name" as const,     label: "상품명", w: "text-left",         activeColor: "text-slate-800 font-black",   inactiveColor: "text-slate-500",   bg: "" },
                { k: "code" as const,     label: "코드",   w: "w-24 text-left",    activeColor: "text-slate-800 font-black",   inactiveColor: "text-slate-500",   bg: "" },
                { k: "supplier" as const, label: "공급사", w: "w-24 text-left",    activeColor: "text-slate-800 font-black",   inactiveColor: "text-slate-500",   bg: "" },
                { k: "current" as const,  label: "현재고", w: "w-16 text-right",   activeColor: "text-amber-800 font-black",   inactiveColor: "text-amber-600 font-black", bg: "bg-amber-50/40" },
                { k: "optimal" as const,  label: "적정",   w: "w-14 text-right",   activeColor: "text-slate-800 font-black",   inactiveColor: "text-slate-500",   bg: "bg-slate-50/40" },
                { k: "price" as const,    label: "판매가", w: "w-20 text-right",   activeColor: "text-orange-700 font-black",  inactiveColor: "text-orange-500",  bg: "bg-orange-50/40" },
              ]).map(col => (
                <th key={col.k} onClick={() => handleSort(col.k)}
                  className={`px-0.5 py-1.5 ${col.w} cursor-pointer select-none hover:bg-slate-50 transition ${col.bg} ${sortKey === col.k ? col.activeColor : col.inactiveColor}`}>
                  {col.label}{arrow(col.k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-[11px] text-slate-300 py-6">
                {loading ? "로딩 중..." : search ? "검색 결과 없음" : "상품 데이터 없음"}
              </td></tr>
            ) : filtered.slice(0, 500).map((p, i) => (
              <tr key={String(p.product_code ?? p.code ?? i)}
                onClick={() => onProductClick(p)}
                className="hover:bg-orange-50/30 transition cursor-pointer">
                <td className="px-0.5 py-1.5 text-orange-600 font-black text-[10px] align-top">{i + 1}</td>
                <td className="px-0.5 py-1.5 align-top">
                  <button type="button" className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition">
                    {p.product_name ?? p.name ?? "-"}
                  </button>
                  {p.hidden === true && <span className="ml-1 text-[9px] text-amber-600 font-black">숨김</span>}
                  {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{p.supplier}</div>}
                </td>
                <td className="px-0.5 py-1.5 font-mono text-slate-500 text-[10px] align-top">{p.product_code ?? p.code ?? "-"}</td>
                <td className="px-0.5 py-1.5 text-slate-500 text-[10px] truncate max-w-[140px] align-top" title={p.supplier ?? undefined}>{p.supplier ?? "-"}</td>
                <td className="px-0.5 py-1.5 text-right font-mono font-black text-amber-700 bg-amber-50/40 align-top">{p.current_stock != null ? p.current_stock.toLocaleString() : "-"}</td>
                <td className="px-0.5 py-1.5 text-right font-mono text-slate-600 bg-slate-50/40 align-top">{p.optimal_stock != null ? p.optimal_stock.toLocaleString() : "-"}</td>
                <td className="px-0.5 py-1.5 text-right font-mono text-orange-600 font-bold bg-orange-50/40 align-top">{p.sale_price != null && p.sale_price > 0 ? `₩${p.sale_price.toLocaleString()}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <div className="text-[10px] text-slate-400 text-center py-2">상위 500개만 표시 · 검색으로 좁혀보세요 (전체 {filtered.length.toLocaleString()}개)</div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// 매입상세 뷰 (2026-07-15) · purchase_details 리스트 · 검색·정렬·기간 필터
// ═══════════════════════════════════════════════════════════════════════
type PDSortKey = "date" | "supplier" | "name" | "code" | "quantity" | "amount" | "cycle" | "min_order";
// 매입상세 조회 기간 프리셋 (재고흐름 · 판매추이와 통일)
type PDPeriodPreset = "all" | "10d" | "1m" | "3m" | "6m" | "custom";
const PD_PRESET_LABEL: Record<PDPeriodPreset, string> = {
  all: "전체", "10d": "10일", "1m": "1개월", "3m": "3개월", "6m": "6개월", custom: "직접",
};
const PurchaseDetailsView: React.FC<{ onProductClick?: (p: any) => void }> = ({ onProductClick }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [periodPreset, setPeriodPreset] = useState<PDPeriodPreset>("3m");
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [sortKey, setSortKey] = useState<PDSortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [importBatches, setImportBatches] = useState<any[]>([]);
  // 거래명세서 조회 모달 (2026-07-16) · 매입일+공급사 로 ocr_confirmed_items 조회
  const [invoiceModal, setInvoiceModal] = useState<{ purchase_date: string; supplier: string; product_name?: string } | null>(null);
  // 계절 필터 · 지정 시 년도 무관 · from/to/preset 무시
  const [season, setSeason] = useState<SeasonKey | null>(null);

  // 프리셋 → dateFrom/dateTo 자동 계산 (custom 은 사용자 입력 유지)
  const applyPreset = (preset: PDPeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === "custom") return; // 사용자가 직접 입력
    if (preset === "all") { setDateFrom(""); setDateTo(""); return; }
    const today = new Date();
    const to = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const start = new Date(today);
    if (preset === "10d") start.setDate(start.getDate() - 10);
    else if (preset === "1m") start.setMonth(start.getMonth() - 1);
    else if (preset === "3m") start.setMonth(start.getMonth() - 3);
    else if (preset === "6m") start.setMonth(start.getMonth() - 6);
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    setDateFrom(from); setDateTo(to);
  };

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "5000" });
    if (season) {
      params.set("season", season);
    } else {
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
    }
    if (supplierFilter) params.set("supplier", supplierFilter);
    fetch(`/api/purchase-details?${params}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    // 임포트 이력 병렬 로드
    fetch("/api/purchase-details/import-log")
      .then(r => r.ok ? r.json() : { batches: [] })
      .then(j => setImportBatches(Array.isArray(j.batches) ? j.batches : []))
      .catch(() => setImportBatches([]));
  };
  // 프리셋 변경 or 계절 변경 시 자동 조회 (custom 은 [조회] 버튼으로 트리거)
  // 마운트 시에도 periodPreset="all" !== "custom" 이므로 자동 조회됨 (중복 fetch 방지)
  useEffect(() => {
    if (season || periodPreset !== "custom") load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [dateFrom, dateTo, periodPreset, season]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q ? rows : rows.filter(r =>
      String(r.product_name ?? "").toLowerCase().includes(q) ||
      String(r.product_code ?? "").toLowerCase().includes(q) ||
      String(r.supplier_name ?? "").toLowerCase().includes(q)
    );
    const sign = sortDir === "asc" ? 1 : -1;
    const getVal = (r: any): any => {
      switch (sortKey) {
        case "date": return String(r.purchase_date ?? "");
        case "supplier": return String(r.supplier_name ?? "");
        case "name": return String(r.product_name ?? "");
        case "code": return String(r.product_code ?? "");
        case "quantity": return Number(r.quantity ?? 0);
        case "amount": return Number(r.total ?? r.amount ?? 0);
        case "cycle": return Number(r.cycle_days ?? 0);
        case "min_order": return Number(r.min_order ?? 0);
      }
    };
    return [...base].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), "ko");
    });
  }, [rows, search, sortKey, sortDir]);

  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0), [filtered]);
  const totalQty = useMemo(() => filtered.reduce((s, r) => s + (Number(r.quantity) || 0), 0), [filtered]);

  const handleSort = (k: PDSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "quantity" || k === "amount" || k === "date" ? "desc" : "asc"); }
  };
  const fmt = (n: number) => n.toLocaleString();
  const fmtWon = (n: number) => n >= 1_0000_0000 ? `${(n / 1_0000_0000).toFixed(1)}억` : n >= 10000 ? `${(n / 10000).toFixed(1)}만` : `${n.toLocaleString()}원`;

  // 조회 기간 배지 표시용 (season 우선 · 그 다음 from~to)
  const seasonBadgeMap: Record<SeasonKey, string> = {
    spring: "🌸 봄", summer: "☀️ 여름", autumn: "🍁 가을", winter: "❄️ 겨울",
  };
  const periodBadge = season
    ? `${seasonBadgeMap[season]} (년도 무관)`
    : (dateFrom || dateTo)
      ? `${dateFrom || "…"} ~ ${dateTo || "…"}`
      : "";

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 상단 헤더 · 재고리스트 표준 px-3 py-2 스타일 (2026-07-16 통일) */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={14} className="text-emerald-600" />
          <span className="text-[11px] font-black text-slate-600">
            매입상세<span className="text-[10px] font-semibold text-slate-400 ml-1">(기간별)</span>
          </span>
          {periodBadge && (
            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
              {periodBadge}
            </span>
          )}
          {loading && (
            <span className="text-[10px] text-slate-400 font-semibold inline-flex items-center gap-1">
              <LoaderIcon size={10} className="animate-spin" />로딩...
            </span>
          )}
          {!loading && filtered.length > 0 && (
            <span className="text-[10px] text-slate-500 font-semibold">
              수량 {fmt(totalQty)} · 금액 <span className="text-emerald-700 font-black">{fmtWon(totalAmount)}</span>
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-400">{filtered.length.toLocaleString()}건</span>
      </div>

      {/* 필터 바 · 재고리스트 표준 패딩 px-3 py-2 */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap text-[11px] border-b border-slate-200 shrink-0">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="상품·공급사·코드 검색"
            className="w-full pl-7 pr-6 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-emerald-400 bg-white"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-rose-500 hover:text-rose-700 cursor-pointer">✕</button>
          )}
        </div>
        <input
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          placeholder="공급사 정확일치"
          className="px-2 py-1.5 text-[12px] border border-slate-200 rounded-lg w-32 focus:outline-none focus:border-emerald-400 bg-white"
        />
        {/* 프리셋 기간 (재고흐름·판매추이와 UI 통일 · 2026-07-16) */}
        <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5 shadow-inner">
          {(["all", "10d", "1m", "3m", "6m"] as PDPeriodPreset[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setSeason(null); applyPreset(p); }}
              className={`px-2 py-1 text-[10px] font-black rounded transition cursor-pointer ${!season && periodPreset === p ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
                }`}
            >{PD_PRESET_LABEL[p]}</button>
          ))}
        </div>
        {/* 계절 조회 · 지정 시 년도 무관 · from/to/preset 자동 해제 */}
        <SeasonButtons value={season} onChange={(v) => {
          setSeason(v);
          if (v) { setPeriodPreset("all"); setDateFrom(""); setDateTo(""); }
        }} size="sm" hideLabel />
        {/* 직접 날짜 입력 · 값 변경 시 preset=custom 전환 */}
        <div className="inline-flex items-center gap-1 bg-slate-100/80 border border-slate-200/60 rounded-lg px-1.5 py-0.5 shadow-inner">
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setPeriodPreset("custom"); setDateFrom(e.target.value); }}
            className="bg-transparent text-[11px] font-mono focus:outline-none"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setPeriodPreset("custom"); setDateTo(e.target.value); }}
            className="bg-transparent text-[11px] font-mono focus:outline-none"
          />
        </div>
        {periodPreset === "custom" && (
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-black rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm cursor-pointer transition disabled:opacity-40"
            title="선택한 조건으로 조회"
          >조회 →</button>
        )}
      </div>

      {/* 힌트 · 재고리스트 표준 스타일 */}
      <p className="text-[10px] text-slate-500 font-semibold leading-tight px-3 py-1.5 border-b border-slate-200 shrink-0">
        상품명 클릭 → 상세 정보 + 재고 상황 · 매입 숫자 클릭 → 상세 매입현황
      </p>
      {/* 로딩 시 상단 배너 (조건 변경) */}
      {loading && rows.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-600 font-bold py-1.5 mx-3 mb-1 bg-emerald-50 border border-emerald-200 rounded-md shrink-0">
          <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
        </div>
      )}
      {rows.length === 0 && loading ? (
        <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2"><LoaderIcon size={14} className="animate-spin" /> 로딩 중...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          매입상세 데이터 없음 · <span className="text-slate-500 font-semibold">데이터 업로드 → 매입상세 탭에서 xlsx 임포트하세요</span>
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
          {/* 코드 컬럼 제거 · 매입일 간단(M/D) · 가로 스크롤 방지 (table-fixed) */}
          <table className="w-full text-[10px] sm:text-xs table-fixed">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-0.5 py-1.5 w-7">#</th>
                {([
                  { k: "date" as const,     label: "매입일",  w: "w-14 text-left",  bg: "" },
                  { k: "name" as const,     label: "상품명",  w: "text-left",        bg: "" },
                  { k: "quantity" as const, label: "수량",    w: "w-12 text-right",  bg: "bg-slate-50/40" },
                  { k: "cycle" as const,    label: "매입주기", w: "w-14 text-right", bg: "bg-sky-50/40" },
                  { k: "min_order" as const, label: "최소발주", w: "w-14 text-right", bg: "bg-sky-50/40" },
                  { k: "amount" as const,   label: "금액",    w: "w-20 text-right",  bg: "bg-emerald-50/40" },
                ] as { k: PDSortKey; label: string; w: string; bg: string }[]).map(col => {
                  const active = sortKey === col.k;
                  const align = col.w.includes("text-right") ? "justify-end" : "justify-start";
                  const activeColor = col.k === "amount" ? "text-emerald-700 font-black" : col.k === "quantity" ? "text-slate-700 font-black" : "text-slate-800 font-black";
                  const inactiveColor = col.k === "amount" ? "text-emerald-500" : col.k === "quantity" ? "text-slate-500" : "";
                  return (
                    <th
                      key={col.k}
                      onClick={() => handleSort(col.k)}
                      className={`px-0.5 py-1.5 ${col.w} cursor-pointer select-none hover:bg-slate-50 transition ${col.bg} ${active ? activeColor : inactiveColor}`}
                      title={`${col.label} 정렬 (${active ? (sortDir === "asc" ? "오름차순 · 클릭 → 내림차순" : "내림차순 · 클릭 → 오름차순") : "클릭하여 정렬"})`}
                    >
                      <span className={`inline-flex items-center gap-0.5 w-full ${align}`}>
                        {col.label}
                        {active ? (
                          <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>
                        ) : (
                          <span className="text-[8px] text-slate-300">⇅</span>
                        )}
                      </span>
                    </th>
                  );
                })}
                {/* 명세서 열 (정렬 불가 · 클릭 시 ocr_confirmed_items 모달) */}
                <th className="text-center px-0.5 py-1.5 w-14" title="OCR 거래명세서 조회">명세서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-[11px] text-slate-300 py-6">필터 조건에 맞는 매입 없음</td></tr>
              ) : filtered.slice(0, 1000).map((r, i) => {
                const md = r.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.purchase_date))
                  ? `${String(r.purchase_date).slice(5, 7)}/${String(r.purchase_date).slice(8, 10)}` : "-";
                const cycle = Number(r.cycle_days ?? 0);
                const cycleLabel = cycle > 0 ? `${cycle}일` : (Number(r.purchase_count_total ?? 0) >= 2 ? "-" : "-");
                const minOrder = Number(r.min_order ?? 0);
                return (
                  <tr key={r.id ?? i} className="hover:bg-orange-50/30 transition align-top">
                    <td className="px-0.5 py-1.5 text-orange-600 font-black text-[10px]">{i + 1}</td>
                    <td className="px-0.5 py-1.5 font-mono text-slate-600 whitespace-nowrap" title={r.purchase_date ?? undefined}>{md}</td>
                    <td className="px-0.5 py-1.5 break-words whitespace-normal leading-tight" title={r.product_name ?? undefined}>
                      {onProductClick && r.product_code ? (
                        <button
                          type="button"
                          onClick={() => onProductClick(r)}
                          className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                        >
                          {r.product_name ?? "-"}
                        </button>
                      ) : <span className="text-[13px] font-medium text-slate-800">{r.product_name ?? "-"}</span>}
                      {r.supplier_name && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{r.supplier_name}</div>}
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono font-black text-slate-700 bg-slate-50/40">{r.quantity != null ? r.quantity.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right font-mono text-sky-600 bg-sky-50/40" title={cycle > 0 ? `${Number(r.purchase_count_total)}회 매입 · 평균 ${cycle}일 주기` : "2회 미만 · 계산 불가"}>{cycleLabel}</td>
                    <td className="px-1 py-1.5 text-right font-mono text-sky-700 font-semibold bg-sky-50/40" title={minOrder > 0 ? `최소발주량 ${minOrder}` : "미지정"}>{minOrder > 0 ? minOrder.toLocaleString() : "-"}</td>
                    <td className="px-1 py-1.5 text-right font-mono font-black text-emerald-700 bg-emerald-50/40" title={(r.total ?? r.amount) != null ? Number(r.total ?? r.amount).toLocaleString() + "원" : undefined}>{(r.total ?? r.amount) != null ? fmtWon(Number(r.total ?? r.amount)) : "-"}</td>
                    <td className="px-1 py-1.5 text-center whitespace-nowrap">
                      {r.purchase_date && r.supplier_name ? (
                        <button
                          type="button"
                          onClick={() => setInvoiceModal({ purchase_date: String(r.purchase_date), supplier: String(r.supplier_name), product_name: r.product_name ?? undefined })}
                          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 active:scale-95 cursor-pointer transition whitespace-nowrap leading-none"
                          title={`${r.purchase_date} · ${r.supplier_name} 거래명세서 조회`}
                        >명세서</button>
                      ) : (
                        <span className="text-slate-300 text-[10px]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 1000 && (
            <div className="text-[10px] text-slate-400 text-center py-2">상위 1000개만 표시 · 검색/기간으로 좁혀보세요 (전체 {filtered.length.toLocaleString()}건)</div>
          )}
        </div>
      )}

      {/* ─── 임포트 이력 (2026-07-15) · 매입상세 하단 · 임포트 배치별 요약 ─── */}
      {importBatches.length > 0 && (
        <div className="shrink-0 border-t border-slate-200 px-3 pt-2 pb-2 bg-slate-50/40">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-black text-slate-600">📋 임포트 이력</span>
            <span className="text-[9px] text-slate-400">최근 {importBatches.length}건</span>
          </div>
          <div className="max-h-32 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="text-slate-400 uppercase text-[9px]">
                <tr>
                  <th className="text-left px-2 py-1">임포트 시각</th>
                  <th className="text-left px-2 py-1">기간</th>
                  <th className="text-right px-2 py-1">행수</th>
                  <th className="text-left px-2 py-1">종류</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importBatches.map((b, i) => {
                  const d = new Date(b.imported_at);
                  const ts = isNaN(d.getTime()) ? b.imported_at : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                  const ptLabel = b.periodType === "early" ? "초순" : b.periodType === "mid" ? "중순" : b.periodType === "late" ? "하순" : "-";
                  return (
                    <tr key={i} className="hover:bg-white">
                      <td className="px-2 py-0.5 font-mono text-slate-600">{ts}</td>
                      <td className="px-2 py-0.5 font-mono text-slate-500">{b.periodStart ?? b.startDate} ~ {b.endDate}</td>
                      <td className="text-right px-2 py-0.5 font-mono font-black text-emerald-700">{b.count.toLocaleString()}</td>
                      <td className="px-2 py-0.5 text-slate-500">{ptLabel !== "-" && <span className="font-mono">{ptLabel}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 거래명세서 조회 모달 (2026-07-16) · ocr_confirmed_items 매입일+공급사 필터 */}
      {invoiceModal && (
        <InvoiceLookupModal
          purchaseDate={invoiceModal.purchase_date}
          supplier={invoiceModal.supplier}
          highlightProduct={invoiceModal.product_name}
          onClose={() => setInvoiceModal(null)}
        />
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 거래명세서 조회 모달 (2026-07-16)
//   매입상세 행의 [명세서 조회] 버튼 클릭 시 · 해당 매입일 + 공급사 로 매칭되는
//   ocr_confirmed_items (거래명세서 저장 테이블) 을 조회해서 표시
// ═══════════════════════════════════════════════════════════════════
interface OcrConfirmedItem {
  id: number;
  saved_at: string;
  supplier: string;
  product_name: string;
  product_code: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  balance: number | null;
  expiry_date: string | null;
  memo: string | null;
}
const InvoiceLookupModal: React.FC<{ purchaseDate: string; supplier: string; highlightProduct?: string; onClose: () => void }> = ({ purchaseDate, supplier, highlightProduct, onClose }) => {
  const [items, setItems] = useState<OcrConfirmedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supplierFallback, setSupplierFallback] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true); setError(null); setSupplierFallback(false);
    // 1차: 매입일 + 공급사 정확 매칭
    const params = new URLSearchParams({ date: purchaseDate, supplier });
    fetch(`/api/ocr-confirmed-items?${params}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(async j => {
        const rows: OcrConfirmedItem[] = Array.isArray(j.items) ? j.items : [];
        if (rows.length > 0) { setItems(rows); return; }
        // 2차 fallback: 공급사만 (일자 무시) · 최근 명세서에서 매칭 가능
        setSupplierFallback(true);
        const p2 = new URLSearchParams({ supplier });
        const r2 = await fetch(`/api/ocr-confirmed-items?${p2}`);
        const j2 = r2.ok ? await r2.json() : { items: [] };
        setItems(Array.isArray(j2.items) ? j2.items : []);
      })
      .catch(e => setError(e?.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [purchaseDate, supplier]);

  const totalAmount = useMemo(() => items.reduce((s, x) => s + (Number(x.amount) || 0), 0), [items]);
  const totalQty = useMemo(() => items.reduce((s, x) => s + (Number(x.quantity) || 0), 0), [items]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:min-h-[70vh] md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-fuchsia-50">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={20} className="text-violet-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-slate-800 truncate">거래명세서 조회</div>
              <div className="text-[11px] text-slate-500 font-mono">
                {purchaseDate} · <span className="font-bold">{supplier}</span>
                {supplierFallback && <span className="ml-2 text-amber-600 font-black">· 일자 매칭 없음 · 공급사 전체 이력 표시</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-2 transition"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2"><LoaderIcon size={14} className="animate-spin" /> 로딩중...</div>
          ) : error ? (
            <div className="text-center py-8 text-rose-500 text-sm font-bold">{error}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              <div className="text-3xl mb-2">🗂️</div>
              <div className="font-bold">해당 매입일 · 공급사에 매칭되는 거래명세서 없음</div>
              <div className="text-[11px] text-slate-400 mt-1">거래명세서 OCR (사입) 에서 저장하면 여기에 표시됩니다</div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-black">{items.length}건</span>
                <span className="text-slate-500 font-mono">수량 {totalQty.toLocaleString()} · 금액 <span className="text-violet-700 font-black">{totalAmount.toLocaleString()}원</span></span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-500 text-[9px] uppercase">
                    <tr>
                      <th className="text-left px-2 py-1 w-16">저장일</th>
                      <th className="text-left px-2 py-1">품명</th>
                      <th className="text-right px-2 py-1 w-10">수량</th>
                      <th className="text-right px-2 py-1 w-14">단가</th>
                      <th className="text-right px-2 py-1 w-16">금액</th>
                      <th className="text-left px-2 py-1 w-16">유통기한</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((x, i) => {
                      const isHighlight = highlightProduct && x.product_name && String(x.product_name).includes(String(highlightProduct).slice(0, 6));
                      return (
                        <tr key={x.id ?? i} className={`align-top ${isHighlight ? "bg-violet-50 hover:bg-violet-100" : "hover:bg-slate-50"}`}>
                          <td className="px-2 py-1 font-mono text-slate-500 whitespace-nowrap">{String(x.saved_at).slice(5)}</td>
                          <td className="px-2 py-1 text-slate-800 break-words leading-tight font-semibold" title={x.memo ?? undefined}>
                            {x.product_name}
                            {x.product_code && <span className="ml-1 text-[9px] font-mono text-slate-400">[{x.product_code}]</span>}
                          </td>
                          <td className="text-right px-2 py-1 font-mono text-slate-700">{x.quantity != null ? Number(x.quantity).toLocaleString() : "-"}</td>
                          <td className="text-right px-2 py-1 font-mono text-slate-600">{x.unit_price != null ? Number(x.unit_price).toLocaleString() : "-"}</td>
                          <td className="text-right px-2 py-1 font-mono font-black text-emerald-700 whitespace-nowrap">{x.amount != null ? Number(x.amount).toLocaleString() : "-"}</td>
                          <td className="px-2 py-1 font-mono text-slate-500 text-[10px] whitespace-nowrap">{x.expiry_date ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">
                <span className="font-black text-slate-500">데이터 소스:</span> ocr_confirmed_items · 사입(OCR거래명세서 등록)에서 저장된 항목
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// 상품 매입 이력 모달 (2026-07-16)
//   상품재고현황 리스트의 매입 셀 클릭 시 표시
//   해당 product_code 의 purchase_details 이력 조회 · 최근순
// ═══════════════════════════════════════════════════════════════════
interface PurchaseDetailRow {
  id: number;
  purchase_date: string;
  supplier_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  total: number | null;
}
export const ProductPurchaseHistoryModal: React.FC<{ productCode: string; productName: string; onClose: () => void }> = ({ productCode, productName, onClose }) => {
  const [rows, setRows] = useState<PurchaseDetailRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ product_code: productCode, limit: "500" });
    fetch(`/api/purchase-details?${params}`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => setRows(Array.isArray(j.rows) ? j.rows : []))
      .catch(e => setError(e?.message ?? "조회 실패"))
      .finally(() => setLoading(false));
  }, [productCode]);

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.total ?? r.amount) || 0), 0);
  const uniqueSuppliers = new Set(rows.map(r => r.supplier_name).filter(Boolean)).size;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:min-h-[70vh] md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-slate-800 break-words leading-tight">{productName}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                코드 <span className="font-black">{productCode}</span>
                <span className="ml-2 text-slate-400">· 매입 이력 조회</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-2 transition"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400 gap-2"><LoaderIcon size={14} className="animate-spin" /> 로딩중...</div>
          ) : error ? (
            <div className="text-center py-8 text-rose-500 text-sm font-bold">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
              <div className="font-bold">매입 이력 없음</div>
              <div className="text-[11px] text-slate-400 mt-1">purchase_details 테이블에 이 상품의 매입 기록이 없습니다</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-[10px] font-black text-emerald-800 opacity-70 uppercase">총 매입 건수</div>
                  <div className="text-lg font-black text-emerald-800 font-mono">{rows.length.toLocaleString()}건</div>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/60 border border-indigo-200 rounded-lg px-3 py-2">
                  <div className="text-[10px] font-black text-indigo-800 opacity-70 uppercase">총 매입 수량</div>
                  <div className="text-lg font-black text-indigo-800 font-mono">{totalQty.toLocaleString()}</div>
                </div>
                <div className="bg-gradient-to-br from-violet-50 to-violet-100/60 border border-violet-200 rounded-lg px-3 py-2">
                  <div className="text-[10px] font-black text-violet-800 opacity-70 uppercase">총 매입 금액</div>
                  <div className="text-lg font-black text-violet-800 font-mono">{totalAmount.toLocaleString()}<span className="text-xs ml-0.5">원</span></div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-2">
                <span className="font-black">공급사 종류:</span>
                <span className="font-mono text-slate-700">{uniqueSuppliers}개 사</span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[50vh]">
                <table className="w-full text-[11px] min-w-[520px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-500 text-[9px] uppercase">
                    <tr>
                      <th className="text-left px-2 py-1 w-16">매입일</th>
                      <th className="text-left px-2 py-1">공급사</th>
                      <th className="text-right px-2 py-1 w-10">수량</th>
                      <th className="text-right px-2 py-1 w-16">단가</th>
                      <th className="text-right px-2 py-1 w-16">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                      <tr key={r.id ?? i} className="hover:bg-emerald-50/30 align-top">
                        <td className="px-2 py-1 font-mono text-slate-500 whitespace-nowrap">{String(r.purchase_date).slice(5)}</td>
                        <td className="px-2 py-1 text-slate-700 break-words leading-tight font-semibold">{r.supplier_name ?? "-"}</td>
                        <td className="text-right px-2 py-1 font-mono text-slate-700">{r.quantity != null ? Number(r.quantity).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 font-mono text-slate-600">{r.unit_price != null ? Number(r.unit_price).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 font-mono font-black text-emerald-700 whitespace-nowrap">{r.total != null ? Number(r.total).toLocaleString() : r.amount != null ? Number(r.amount).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">
                <span className="font-black text-slate-500">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const StockManagePage: React.FC = () => {
  const [pageTab, setPageTab] = useState<"dashboard" | "raw">("dashboard");
  const [range, setRange] = useState<Range>("week");
  // 재고 흐름 조회: 스냅샷 · 정렬 · limit
  const [flowSnapshot, setFlowSnapshot] = useState<string>("");
  const [flowSort, setFlowSort] = useState<SortKey>("sale");
  const [flowDir, setFlowDir] = useState<SortDir>("desc");
  const toggleFlowSort = (key: SortKey) => {
    if (flowSort === key) {
      setFlowDir(flowDir === "desc" ? "asc" : "desc");
    } else {
      setFlowSort(key);
      setFlowDir("desc");
    }
  };
  const [flowLimit, setFlowLimit] = useState<number>(100);
  // 재고흐름 리스트 · 상품명/코드 검색 (필터)
  const [flowSearch, setFlowSearch] = useState<string>("");
  // 재고흐름 리스트 · 벌크 숨김 · 판매추이와 동일 패턴
  const [selectedFlowCodes, setSelectedFlowCodes] = useState<Set<string>>(new Set());
  const [flowBulkHiding, setFlowBulkHiding] = useState(false);
  const toggleSelectFlow = (code: string) => setSelectedFlowCodes(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const bulkHideFlow = async () => {
    if (selectedFlowCodes.size === 0) return;
    // 로컬 리스트에서만 제외 · DB 수정 · 다른 페이지 연동 없음 (2026-07-15 · 사용자 정책)
    setStockFlow(prev => prev.filter(r => !selectedFlowCodes.has(String(r.product_code))));
    setSelectedFlowCodes(new Set());
  };
  // 기간 aggregation: 0=단일 스냅샷 · N=최근 N개월 aggregation
  const [flowMonths, setFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  // 기간 선택 · 확인 버튼 누르기 전 임시 값 (자동 fetch 방지)
  const [pendingFlowMonths, setPendingFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  // 2026-07-16 · 재고리스트 계절 필터 (봄/여름/가을/겨울) · 지정 시 flowMonths/snapshot 무시 · 년도 무관 · 해당 월 전체
  const [flowSeason, setFlowSeason] = useState<SeasonKey | null>(null);
  // 2026-07-16 · 좌우 split 레이아웃 · 좌측 리스트 폭 (localStorage 저장)
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_flow_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_flow_w", String(flowPanelWidth)); } catch { /* ignore */ } }, [flowPanelWidth]);
  const flowResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onFlowResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    flowResizeRef.current = { startX: e.clientX, startW: flowPanelWidth };
    const move = (ev: MouseEvent) => {
      const r = flowResizeRef.current;
      if (!r) return;
      const next = Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)));
      setFlowPanelWidth(next);
    };
    const up = () => {
      flowResizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  // flowChart state · ProductDetailPanel 내부(StockFlowChart)로 이관됨

  // 2026-07-16 · 우측 상세 패널용 선택 상품 (좌측 재고리스트 클릭 시 세팅)
  const [flowSelectedProduct, setFlowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadFlowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setFlowSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        setFlowSelectedProduct(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* cache load 실패 무시 */ }
  }, []);

  // flowChart useEffect · ProductDetailPanel 내부(StockFlowChart)로 이관됨

  const [availableSnapshots, setAvailableSnapshots] = useState<string[]>([]);
  const [snapshotPeriods, setSnapshotPeriods] = useState<Record<string, string | null>>({});
  const [flowPeriodType, setFlowPeriodType] = useState<string | null>(null);
  const [lastImportAt, setLastImportAt] = useState<string | null>(null);
  const [supplierCardCollapsed, setSupplierCardCollapsed] = useState(false);
  const [lowStockCollapsed, setLowStockCollapsed] = useState(false);
  const [stockDiffCollapsed, setStockDiffCollapsed] = useState(false);
  const [flowCollapsedTop, setFlowCollapsedTop] = useState(false);

  // ── 탭별 좌우 split 레이아웃 state (2026-07-16) ──────────────────────────
  // supplier 탭
  const [supplierPanelWidth, setSupplierPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_supplier_w")); return Number.isFinite(v) && v > 0 ? v : 600; } catch { return 600; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_supplier_w", String(supplierPanelWidth)); } catch { /**/ } }, [supplierPanelWidth]);
  const supplierPanelWidthRef = useRef(supplierPanelWidth);
  useEffect(() => { supplierPanelWidthRef.current = supplierPanelWidth; }, [supplierPanelWidth]);
  const supplierResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onSupplierResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    supplierResizeRef.current = { startX: e.clientX, startW: supplierPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = supplierResizeRef.current; if (!r) return; setSupplierPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { supplierResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [supplierSelectedKey, setSupplierSelectedKey] = useState<string | null>(null);
  // supplierSelectedObj 는 xlsxSuppliers 선언(line 1636+) 이후에 계산되어야 함 · 아래에서 정의

  // purchase 탭
  const [purchasePanelWidth, setPurchasePanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_purchase_w")); return Number.isFinite(v) && v > 0 ? v : 600; } catch { return 600; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_purchase_w", String(purchasePanelWidth)); } catch { /**/ } }, [purchasePanelWidth]);
  const purchasePanelWidthRef = useRef(purchasePanelWidth);
  useEffect(() => { purchasePanelWidthRef.current = purchasePanelWidth; }, [purchasePanelWidth]);
  const purchaseResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onPurchaseResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    purchaseResizeRef.current = { startX: e.clientX, startW: purchasePanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = purchaseResizeRef.current; if (!r) return; setPurchasePanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { purchaseResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [purchaseSelectedProduct, setPurchaseSelectedProduct] = useState<ProductInfo | null>(null);
  const loadPurchaseSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null };
    setPurchaseSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setPurchaseSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // low 탭
  const [lowPanelWidth, setLowPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_low_w")); return Number.isFinite(v) && v > 0 ? v : 560; } catch { return 560; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_low_w", String(lowPanelWidth)); } catch { /**/ } }, [lowPanelWidth]);
  const lowPanelWidthRef = useRef(lowPanelWidth);
  useEffect(() => { lowPanelWidthRef.current = lowPanelWidth; }, [lowPanelWidth]);
  const lowResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onLowResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    lowResizeRef.current = { startX: e.clientX, startW: lowPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = lowResizeRef.current; if (!r) return; setLowPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { lowResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [lowSelectedProduct, setLowSelectedProduct] = useState<ProductInfo | null>(null);
  const loadLowSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null, warehouse_stock: p.warehouse_stock ?? null, store_stock: p.store_stock ?? null };
    setLowSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setLowSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // diff 탭
  const [diffPanelWidth, setDiffPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_diff_w")); return Number.isFinite(v) && v > 0 ? v : 480; } catch { return 480; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_diff_w", String(diffPanelWidth)); } catch { /**/ } }, [diffPanelWidth]);
  const diffPanelWidthRef = useRef(diffPanelWidth);
  useEffect(() => { diffPanelWidthRef.current = diffPanelWidth; }, [diffPanelWidth]);
  const diffResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onDiffResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    diffResizeRef.current = { startX: e.clientX, startW: diffPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = diffResizeRef.current; if (!r) return; setDiffPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { diffResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [diffSelectedProduct, setDiffSelectedProduct] = useState<ProductInfo | null>(null);
  const loadDiffSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null, warehouse_stock: p.warehouse_stock ?? null, store_stock: p.store_stock ?? null };
    setDiffSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setDiffSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);

  // product 탭
  const [productPanelWidth, setProductPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_product_w")); return Number.isFinite(v) && v > 0 ? v : 600; } catch { return 600; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_stockmanage_product_w", String(productPanelWidth)); } catch { /**/ } }, [productPanelWidth]);
  const productPanelWidthRef = useRef(productPanelWidth);
  useEffect(() => { productPanelWidthRef.current = productPanelWidth; }, [productPanelWidth]);
  const productResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onProductResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    productResizeRef.current = { startX: e.clientX, startW: productPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = productResizeRef.current; if (!r) return; setProductPanelWidth(Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { productResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [productSelectedProduct, setProductSelectedProduct] = useState<ProductInfo | null>(null);
  const loadProductSelectedProduct = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    const partial: ProductInfo = { code, name: String(p.product_name ?? ""), spec: String(p.spec ?? ""), current_stock: p.current_stock ?? null, optimal_stock: p.optimal_stock ?? null, supplier: p.supplier ?? null, real_map: p.real_map ?? null };
    setProductSelectedProduct(partial);
    try {
      let full = lookupProduct(code);
      if (!full) { const map = await getProductsMap(); full = map[code] ?? map[code.replace(/^0+/, "")] ?? null; }
      if (full) setProductSelectedProduct(prev => { if (!prev || prev.code !== code) return prev; const o: Record<string, any> = {}; for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) o[k] = v; return { ...full, ...o, code, name: full.name || prev.name }; });
    } catch { /**/ }
  }, []);
  // 통합 탭 (2026-07-15) · 4개 섹션을 상단 탭으로 통합
  //   flow · supplier · low · diff
  //   기본: flow (재고흐름)
  const [stockTab, setStockTab] = useState<"flow" | "supplier" | "purchase" | "low" | "diff" | "product">("flow");
  // 상품재고현황 매입 셀 클릭 시 팝업 (2026-07-16) · 해당 상품 매입 이력
  const [productPurchaseModal, setProductPurchaseModal] = useState<{ product_code: string; product_name: string } | null>(null);

  // ── 상품재고현황 탭 (flow) · 좌우 분할 레이아웃 state ──────────────────
  // 선택 상품 (StockFlowPanel 클릭 시 설정 → 우측 차트 표시)
  const [flowSelected, setFlowSelected] = useState<SalesTrendStockFlowRow | null>(null);
  // 선택 상품의 시계열 rows
  const [flowDetailRows, setFlowDetailRows] = useState<PeriodRow[]>([]);
  const [flowDetailLoading, setFlowDetailLoading] = useState(false);
  // 차트 계절 필터
  const [flowDetailSeason, setFlowDetailSeason] = useState<SeasonKey | null>(null);
  // 차트 기간 (개월 수)
  const [flowDetailMonths, setFlowDetailMonths] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
  // X축 단위
  const [flowDetailGranularity, setFlowDetailGranularity] = useState<"10day" | "month">("10day");
  // 폭 조절 · localStorage 저장 · key 는 salestrend 것과 분리
  const [flowDetailPanelWidth, setFlowDetailPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stockmanage_flowdetail_w")); return Number.isFinite(v) && v > 0 ? v : 640; } catch { return 640; }
  });
  useEffect(() => {
    try { localStorage.setItem("megatown_stockmanage_flowdetail_w", String(flowDetailPanelWidth)); } catch { /* ignore */ }
  }, [flowDetailPanelWidth]);
  const flowDetailPanelWidthRef = useRef(flowDetailPanelWidth);
  useEffect(() => { flowDetailPanelWidthRef.current = flowDetailPanelWidth; }, [flowDetailPanelWidth]);
  const flowDetailResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onFlowDetailResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    flowDetailResizeRef.current = { startX: e.clientX, startW: flowDetailPanelWidthRef.current };
    const move = (ev: MouseEvent) => {
      const r = flowDetailResizeRef.current;
      if (!r) return;
      const next = Math.min(1000, Math.max(320, r.startW + (ev.clientX - r.startX)));
      setFlowDetailPanelWidth(next);
    };
    const up = () => {
      flowDetailResizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);
  // 시계열 rows 클라측 캐시
  const flowDetailRowsCache = useRef<Map<string, PeriodRow[]>>(new Map());
  // 선택 상품 or 계절 변경 시 fetch
  useEffect(() => {
    if (!flowSelected) { setFlowDetailRows([]); return; }
    const code = String(flowSelected.product_code);
    const cacheKey = `${code}::${flowDetailSeason ?? ""}`;
    const cached = flowDetailRowsCache.current.get(cacheKey);
    if (cached) { setFlowDetailRows(cached); return; }
    let cancelled = false;
    setFlowDetailLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ code });
        if (flowDetailSeason) params.set("season", flowDetailSeason);
        else params.set("months", "6");
        const r = await fetch(`/api/sales-trend/product?${params}`);
        if (cancelled) return;
        if (r.ok) {
          const j = await r.json();
          const list: PeriodRow[] = Array.isArray(j.rows) ? j.rows : [];
          flowDetailRowsCache.current.set(cacheKey, list);
          if (!cancelled) setFlowDetailRows(list);
        }
      } finally { if (!cancelled) setFlowDetailLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [flowSelected, flowDetailSeason]);

  // 재고 흐름 카드 접기 (모바일에서만 노출)
  const [flowCardCollapsed, setFlowCardCollapsed] = useState(false);
  // 좌우 컬럼 폭 조절 (좌측 공급사 재고자산 카드 폭 · localStorage 저장)
  const [supplierColWidth, setSupplierColWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_stock_supplier_w")); return Number.isFinite(v) && v > 0 ? v : 360; } catch { return 360; }
  });
  // ref 로 최신 값 참조 (버그 #5 픽스 · useCallback 빈 deps 에서 stale closure 방지)
  const supplierColWidthRef = useRef(supplierColWidth);
  useEffect(() => { supplierColWidthRef.current = supplierColWidth; }, [supplierColWidth]);
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = supplierColWidthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(240, Math.min(640, startW + (ev.clientX - startX)));
      setSupplierColWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);
  // 리사이즈 후 저장 (state가 최종 업데이트되면 저장)
  useEffect(() => {
    try { localStorage.setItem("megatown_stock_supplier_w", String(supplierColWidth)); } catch { /* silent */ }
  }, [supplierColWidth]);

  // 적정재고 이하 상품 클릭 시: 바코드 스캔 모달과 동일한 ProductInfoCard 표시
  // products 전체 캐시(/products.json)에서 원본 상품을 조회하여 매입가·판매가·최근매입일·판매상태 등 모든 필드를 병합
  const [scanProductModal, setScanProductModal] = useState<ProductInfo | null>(null);
  const openScanProductModal = useCallback(async (p: any) => {
    const code = String(p.product_code ?? "").trim();
    // 1) 목록 행의 기본 필드를 먼저 세팅 (즉시 노출)
    const partial: ProductInfo = {
      code,
      name: String(p.product_name ?? ""),
      spec: String(p.spec ?? ""),
      current_stock: p.current_stock ?? null,
      optimal_stock: p.optimal_stock ?? null,
      supplier: p.supplier ?? null,
      real_map: p.real_map ?? null,
      warehouse_stock: p.warehouse_stock ?? null,
      store_stock: p.store_stock ?? null,
    };
    setScanProductModal(partial);
    // 2) 전체 상품 캐시에서 원본 조회 후 병합 (매입가·판매가·최근매입일·판매상태·유통기한·제조사·바코드·비고 등)
    try {
      let full = lookupProduct(code);
      if (!full) {
        const map = await getProductsMap();
        full = map[code] ?? map[code.replace(/^0+/, "")] ?? null;
      }
      if (full) {
        // full(DB 원본, 모든 필드) 위에 partial(리스트 최신 값)의 null 아닌 값만 덮어씀
        setScanProductModal(prev => {
          if (!prev || prev.code !== code) return prev;
          const overlay: Record<string, any> = {};
          for (const [k, v] of Object.entries(prev)) if (v !== null && v !== undefined) overlay[k] = v;
          return { ...full, ...overlay, code, name: full.name || prev.name };
        });
      }
    } catch { /* 캐시 로드 실패 시 partial 만 유지 */ }
  }, []);

  // 스냅샷 날짜 + period_type 으로 기간 범위 계산
  // early: 1일~해당일 / mid: 11일~해당일 / late: 21일~말일
  // 표시 형식: `early-M/D~M/D` (오늘이면 `~오늘`)
  const flowDateRange = useMemo<string | null>(() => {
    if (!flowSnapshot) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(flowSnapshot);
    if (!m) return null;
    const yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
    const today = new Date();
    const isTodaySnap = today.getFullYear() === yyyy && (today.getMonth() + 1) === mm && today.getDate() === dd;
    const endLabel = isTodaySnap ? "오늘" : `${mm}/${dd}`;
    // period_type 정규화 — DB에 early/mid/late 또는 초순/중순/하순 어느쪽이든 지원
    const pt = flowPeriodType === "초순" ? "early"
      : flowPeriodType === "중순" ? "mid"
        : flowPeriodType === "하순" ? "late"
          : flowPeriodType;
    if (pt === "early") return `${mm}월 초순 : ${mm}/1 ~ ${endLabel}`;
    if (pt === "mid") return `${mm}월 중순 : ${mm}/11 ~ ${endLabel}`;
    if (pt === "late") {
      const lastDay = new Date(yyyy, mm, 0).getDate();
      const lastLabel = isTodaySnap && dd === lastDay ? "오늘" : `${mm}/${lastDay}`;
      return `${mm}월 하순 : ${mm}/21 ~ ${lastLabel}`;
    }
    return `${mm}/${dd}`;
  }, [flowSnapshot, flowPeriodType]);

  // ── 상품재고현황 우측 차트 데이터 ────────────────────────────────────────
  const flowDetailRangeDays = flowDetailMonths * 30;
  const flowDetailFilteredRows = useMemo(() => {
    const filled = fillPeriodsWithRows(
      flowDetailRows,
      flowDetailRangeDays,
      (start, end, period_type): PeriodRow => ({
        period_start_date: start,
        snapshot_date: end,
        period_type,
        opening_stock: 0, purchase_qty: 0, sale_qty: 0, disposal_qty: 0, closing_stock: 0,
        supply_amount: 0, total_amount: 0,
      })
    );
    return flowDetailGranularity === "month" ? aggregateToMonths(filled) : filled;
  }, [flowDetailRows, flowDetailRangeDays, flowDetailGranularity]);

  const flowDetailChartData = useMemo(() => ({
    labels: flowDetailFilteredRows.map(r => flowDetailGranularity === "month"
      ? (() => { const m = /^(\d{4})-(\d{2})/.exec(r.period_start_date); return m ? `${Number(m[2])}월` : r.period_start_date; })()
      : periodLabel(r.period_start_date, r.snapshot_date)
    ),
    series: [
      { label: "매입", color: "#10b981", kind: "bar" as const, values: flowDetailFilteredRows.map(r => Number(r.purchase_qty ?? 0)), format: "count" as const },
      { label: "판매", color: "#dc2626", kind: "line" as const, values: flowDetailFilteredRows.map(r => Number(r.sale_qty ?? 0)), format: "count" as const },
      { label: "종료재고", color: "#6366f1", kind: "line" as const, values: flowDetailFilteredRows.map(r => Number(r.closing_stock ?? 0)), format: "count" as const },
    ],
  }), [flowDetailFilteredRows, flowDetailGranularity]);

  // 판매수량 범위 필터: 판매 X개 ~ Y개 (빈 문자열이면 범위 제한 없음)
  const [salesQtyMin, setSalesQtyMin] = useState<string>("");
  const [salesQtyMax, setSalesQtyMax] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductLite | null>(null);
  const [searchResults, setSearchResults] = useState<ProductLite[]>([]);
  const [productHistory, setProductHistory] = useState<PurchaseRow[]>([]);
  const [supplierAggs, setSupplierAggs] = useState<SupplierAggregate[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [stockFlow, setStockFlow] = useState<StockFlowRow[]>([]);
  const [topTab, setTopTab] = useState<"purchase" | "sale">("sale");
  const [lowStock, setLowStock] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(false);
  // 스냅샷 전체 통계 (대시보드 상단 메트릭)
  const [snapshotTotals, setSnapshotTotals] = useState<{
    itemCount: number; totalSale: number; totalPurchase: number; totalDisposal: number;
    totalAmount: number; negativeStockCount: number; positiveStockCount: number; zeroStockCount: number;
  } | null>(null);
  // 스냅샷 기반 공급사별 합계 집계 (공급사코드로 그룹핑)
  type SupplierAgg = {
    supplier: string;
    supplier_code: string | null;
    names?: string[];
    code_conflict?: boolean;
    purchaseQty: number; purchaseAmount: number; saleQty: number;
    itemCount: number; totalStockAmount: number;
  };
  const [xlsxSuppliers, setXlsxSuppliers] = useState<SupplierAgg[]>([]);
  // 2026-07-16 · supplier 우측 패널용 · xlsxSuppliers 선언 이후로 이동
  const supplierSelectedObj = useMemo(() => supplierSelectedKey ? xlsxSuppliers.find(s => `${s.supplier_code ?? "-"}::${s.supplier}` === supplierSelectedKey) ?? null : null, [supplierSelectedKey, xlsxSuppliers]);
  const [xlsxTopSupplier, setXlsxTopSupplier] = useState<SupplierAgg | null>(null);
  const [supplierModal, setSupplierModal] = useState<{ supplier: string; code: string | null } | null>(null);
  const [supplierModalRows, setSupplierModalRows] = useState<any[] | null>(null);
  const [supplierModalLoading, setSupplierModalLoading] = useState(false);

  // 상품 정보확인 검색 (2026-07-15 · useProductInfoSearch 훅으로 통합)
  //   기존 변수 이름 유지 · JSX 무변경 · 동작 100% 동일
  const _pis = useProductInfoSearch();
  const infoSearchQuery = _pis.query;
  const setInfoSearchQuery = _pis.setQuery;
  const infoSearchResults = _pis.results;
  const setInfoSearchResults = _pis.setResults;
  const infoSelected = _pis.selected;
  const setInfoSelected = _pis.setSelected;
  const runInfoSearch = _pis.runSearch;
  const [infoModal, setInfoModal] = useState<{ code: string; name: string } | null>(null);
  const [infoModalData, setInfoModalData] = useState<{ product: any; stock_history: any[]; inventory_checks: any[] } | null>(null);
  const [infoModalLoading, setInfoModalLoading] = useState(false);
  const [infoModalTab, setInfoModalTab] = useState<"product" | "stock">("product");
  useEffect(() => { if (infoModal) setInfoModalTab("product"); }, [infoModal]);

  // 적정재고 이하 리스트 · 적정재고 인라인 편집
  const [optimalEditCode, setOptimalEditCode] = useState<string | null>(null);
  const [optimalEditValue, setOptimalEditValue] = useState<string>("");
  const [optimalEditSaving, setOptimalEditSaving] = useState(false);
  const startOptimalEdit = (code: string, current: number) => {
    setOptimalEditCode(code);
    setOptimalEditValue(current > 0 ? String(current) : "");
  };
  const cancelOptimalEdit = () => { setOptimalEditCode(null); setOptimalEditValue(""); };
  const commitOptimalEdit = useCallback(async () => {
    if (!optimalEditCode) return;
    const val = optimalEditValue.trim();
    const num = val === "" ? null : Number(val);
    if (val !== "" && (!Number.isFinite(num) || (num as number) < 0)) {
      alert("숫자만 입력 (0 이상)");
      return;
    }
    setOptimalEditSaving(true);
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(optimalEditCode)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optimal_stock: num }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(b.error ?? `저장 실패 (${res.status})`);
        return;
      }
      // 로컬 리스트 업데이트
      setLowStock(prev => prev.map(p =>
        String(p.product_code) === optimalEditCode
          ? { ...p, optimal_stock: num as any }
          : p
      ));
      // 상세 모달이 열려 있고 편집 대상 상품과 일치하면 모달 데이터도 갱신
      setInfoModalData(prev => {
        if (!prev || String(prev.product?.product_code ?? "") !== optimalEditCode) return prev;
        return { ...prev, product: { ...prev.product, optimal_stock: num as any } };
      });
      setOptimalEditCode(null);
      setOptimalEditValue("");
      // 다른 리스트 재조회 트리거
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed")); } catch { /* ignore */ }
    } catch (e: any) {
      alert(e?.message ?? "네트워크 오류");
    } finally { setOptimalEditSaving(false); }
  }, [optimalEditCode, optimalEditValue]);

  // 숨김 항목 관리 (2026-07-15 · useHiddenManager 훅 · 페이지별 격리 동작)
  //   unhide 성공 시 재고관리 자기 리스트만 갱신 · 판매추이 영향 없음
  //   ref 로 콜백 감싸서 fetchAggregates/fetchStockFlow 는 아래 선언이라 forward-ref 방식
  const unhideRefreshRef = useRef<() => void>(() => { });
  const _hm = useHiddenManager({
    onUnhideSuccess: () => unhideRefreshRef.current(),
  });
  const hiddenModalOpen = _hm.modalOpen;
  const setHiddenModalOpen = _hm.setModalOpen;
  const hiddenList = _hm.list;
  const hiddenLoading = _hm.loading;
  const hiddenUnhideBusyCode = _hm.unhideBusyCode;
  const loadHiddenList = _hm.load;
  const openHiddenManagerModal = _hm.open;
  const unhideProduct = _hm.unhide;

  // runInfoSearch · 자동 검색 debounce → useProductInfoSearch 훅 내부에서 처리

  const openProductInfoModal = useCallback(async () => {
    // 상단 검색 → 정보확인 클릭 시: 적정재고이하 상품명 클릭과 동일한 모달(ProductInfoCard) 사용
    let target = infoSelected;
    if (!target && infoSearchResults.length > 0) target = infoSearchResults[0];
    if (!target && infoSearchQuery.trim()) {
      try {
        const res = await fetch(`/api/products-search?q=${encodeURIComponent(infoSearchQuery.trim())}`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            target = list[0];
            setInfoSelected(list[0]);
            setInfoSearchResults([]);
          }
        }
      } catch { /* ignore */ }
    }
    if (!target) return;
    // 적정재고이하와 동일하게 ProductInfoCard 모달 오픈
    openScanProductModal(target);
    return; // 아래 legacy dashboard 모달 로직 미실행

    // ── (사용 안 함, 참조용) 통합대시보드 모달 원래 로직 ──
    // eslint-disable-next-line no-unreachable
    setInfoModal({ code: target.product_code, name: target.product_name });
    setInfoModalData(null);
    setInfoModalLoading(true);
    try {
      const res = await fetch(`/api/stock-manage/product-info?code=${encodeURIComponent(target.product_code)}`);
      if (res.ok) {
        const data = await res.json();
        setInfoModalData({
          product: data?.product ?? null,
          stock_history: Array.isArray(data?.stock_history) ? data.stock_history : [],
          inventory_checks: Array.isArray(data?.inventory_checks) ? data.inventory_checks : [],
        });
      } else {
        const body = await res.text().catch(() => "");
        console.error("[product-info] failed:", res.status, body);
        setInfoModalData({ product: target, stock_history: [], inventory_checks: [] });
      }
    } catch (e) {
      console.error("[product-info] error:", e);
      setInfoModalData({ product: target, stock_history: [], inventory_checks: [] });
    } finally { setInfoModalLoading(false); }
  }, [infoSelected, infoSearchResults, infoSearchQuery, openScanProductModal]);
  // 공급사 상세 모달 · 상품명 컬럼 폭 조절 (localStorage 저장)
  const [supplierModalNameWidth, setSupplierModalNameWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem("megatown_supmodal_name_w")); return Number.isFinite(v) && v >= 120 && v <= 500 ? v : 220; } catch { return 220; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_supmodal_name_w", String(supplierModalNameWidth)); } catch { /* ignore */ } }, [supplierModalNameWidth]);
  const nameColResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const onNameColResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    nameColResizeRef.current = { startX: e.clientX, startW: supplierModalNameWidth };
    const move = (ev: MouseEvent) => {
      const r = nameColResizeRef.current;
      if (!r) return;
      const next = Math.min(500, Math.max(120, r.startW + (ev.clientX - r.startX)));
      setSupplierModalNameWidth(next);
    };
    const up = () => {
      nameColResizeRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  type ModalSortKey = "product_name" | "opening_stock" | "closing_stock" | "purchase_qty" | "sale_qty" | "current_stock" | "loss" | "sale_price";
  const [modalSortKey, setModalSortKey] = useState<ModalSortKey>("sale_qty");
  const [modalSortDir, setModalSortDir] = useState<"asc" | "desc">("desc");
  const toggleModalSort = (key: ModalSortKey) => {
    if (modalSortKey === key) setModalSortDir(modalSortDir === "desc" ? "asc" : "desc");
    else { setModalSortKey(key); setModalSortDir(key === "product_name" ? "asc" : "desc"); }
  };
  // 모달 내 조회수량(판매출고계) 범위 검색 — 숫자 필드만 허용
  type ModalQtyKey = "opening_stock" | "closing_stock" | "purchase_qty" | "sale_qty" | "current_stock" | "sale_price";
  const [modalQtyMin, setModalQtyMin] = useState<string>("");
  const [modalQtyMax, setModalQtyMax] = useState<string>("");
  const [modalQtyField, setModalQtyField] = useState<ModalQtyKey>("sale_qty");
  const modalDisplayRows = useMemo(() => {
    if (!supplierModalRows) return [];
    const min = modalQtyMin === "" ? -Infinity : Number(modalQtyMin);
    const max = modalQtyMax === "" ? Infinity : Number(modalQtyMax);
    const filtered = supplierModalRows.filter(p => {
      const v = Number((p as any)[modalQtyField] ?? 0) || 0;
      return v >= min && v <= max;
    });
    const sign = modalSortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (modalSortKey === "product_name") {
        return sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko");
      }
      if (modalSortKey === "loss") {
        const la = (Number(a.opening_stock ?? 0) - Number(a.sale_qty ?? 0)) - Number(a.closing_stock ?? 0);
        const lb = (Number(b.opening_stock ?? 0) - Number(b.sale_qty ?? 0)) - Number(b.closing_stock ?? 0);
        return sign * (la - lb);
      }
      return sign * (Number((a as any)[modalSortKey] ?? 0) - Number((b as any)[modalSortKey] ?? 0));
    });
  }, [supplierModalRows, modalSortKey, modalSortDir, modalQtyMin, modalQtyMax, modalQtyField]);
  useEffect(() => {
    if (!supplierModal) {
      setModalQtyMin(""); setModalQtyMax(""); setModalQtyField("sale_qty");
      setModalSortKey("sale_qty"); setModalSortDir("desc");
    }
  }, [supplierModal]);

  // 공급사재고 인라인 확장 (2026-07-15 · 모달 대신 접었다펴는 방식)
  //   각 공급사 행 아래에 판매출고계 내림차순 상품 리스트 노출
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [supplierRowsMap, setSupplierRowsMap] = useState<Record<string, any[] | null>>({});
  const [supplierRowsLoading, setSupplierRowsLoading] = useState<Set<string>>(new Set());
  // 최소발주 미설정(불량) 카드용 확장 상태 (2026-07-16) · 공급사재고와 같은 API 재사용
  const [expandedMinOrder, setExpandedMinOrder] = useState<Set<string>>(new Set());
  const [minOrderRowsMap, setMinOrderRowsMap] = useState<Record<string, any[] | null>>({});
  const [minOrderLoading, setMinOrderLoading] = useState<Set<string>>(new Set());
  const minOrderFetchedRef = useRef<Set<string>>(new Set());
  // 2026-07-16 · 공급사별 min_order > 0 상품 카운트 (사용자 요청: 없는 공급사는 표시 X)
  //   supplier tab 진입 시 top-sales 한 번 fetch · 공급사명(정리)별 집계
  const [minOrderCounts, setMinOrderCounts] = useState<Record<string, number>>({});
  const [minOrderCountsLoaded, setMinOrderCountsLoaded] = useState(false);
  const minOrderCountsFetchedRef = useRef(false);
  const normalizeSupName = (s: string) => String(s ?? "").replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").replace(/\s+/g, " ").trim();
  useEffect(() => {
    if (stockTab !== "supplier" || minOrderCountsFetchedRef.current) return;
    minOrderCountsFetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/stock-manage/top-sales?sort=purchase&dir=desc&limit=50000`);
        if (!res.ok) { setMinOrderCountsLoaded(true); return; }
        const j = await res.json();
        const rows: any[] = Array.isArray(j.rows) ? j.rows : [];
        const counts: Record<string, number> = {};
        for (const r of rows) {
          const mo = Number(r.min_order ?? 0);
          if (!(mo > 0)) continue;
          const nm = normalizeSupName(r.supplier ?? "");
          if (!nm) continue;
          counts[nm] = (counts[nm] ?? 0) + 1;
        }
        setMinOrderCounts(counts);
        setMinOrderCountsLoaded(true);
      } catch { setMinOrderCountsLoaded(true); }
    })();
  }, [stockTab]);
  // 확장 테이블 정렬 · 공용 (열려있는 여러 테이블 동일 정렬)
  // 2026-07-15: 판매 컬럼 제거 · 매입 중심 · 매입수량 내림차순 기본
  type SupSortKey = "name" | "current" | "cycle" | "purchase_date" | "purchase_qty" | "min_order" | "amount";
  const [supRowsSort, setSupRowsSort] = useState<{ key: SupSortKey; dir: "asc" | "desc" }>({ key: "purchase_qty", dir: "desc" });
  // 우측 패널 단순 상품 리스트 정렬 (공급사 클릭 후 나오는 #·상품명·현재고·매입주기·최근매입일·매입수량·최소발주·재고금액)
  // 기본: 재고금액 내림차순 (total_amount)
  type SupDetailSortKey = "name" | "current" | "cycle" | "purchase_date" | "purchase_qty" | "min_order" | "total_amount";
  const [supDetailSort, setSupDetailSort] = useState<{ key: SupDetailSortKey; dir: "asc" | "desc" }>({ key: "total_amount", dir: "desc" });
  const toggleSupDetailSort = (k: SupDetailSortKey) => {
    setSupDetailSort(prev => prev.key === k
      ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key: k, dir: k === "name" ? "asc" : "desc" });
  };
  const toggleSupSort = (k: SupSortKey) => {
    setSupRowsSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };
  const sortSupRows = (rows: any[]): any[] => {
    const { key, dir } = supRowsSort;
    const mult = dir === "asc" ? 1 : -1;
    // 매입주기 계산: 총 기간(오늘 - 최초 매입일) / 매입 횟수 → 평균 며칠에 한 번
    const cycleDays = (r: any): number => {
      const cnt = Number(r.purchase_count ?? 0);
      if (cnt < 2) return 0;
      const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
      const lastDate = String(r.last_purchase_date ?? "");
      if (!firstDate || !lastDate || firstDate === lastDate) return 0;
      const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
      return cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
    };
    const getVal = (r: any): any => {
      if (key === "name") return String(r.product_name ?? "");
      if (key === "current") return Number(r.current_stock ?? 0);
      if (key === "cycle") return cycleDays(r);
      if (key === "purchase_date") return String(r.last_purchase_date ?? "");
      if (key === "purchase_qty") return Number(r.purchase_total_qty ?? r.purchase_qty ?? 0);
      if (key === "min_order") return Number(r.min_order ?? 0);
      return Number(r.total_amount ?? 0);
    };
    return [...rows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (typeof va === "string") return va.localeCompare(String(vb), "ko") * mult;
      return (va - vb) * mult;
    });
  };
  const sortSupDetailRows = (rows: any[]): any[] => {
    const { key, dir } = supDetailSort;
    const mult = dir === "asc" ? 1 : -1;
    const detailCycleDays = (r: any): number => {
      const cnt = Number(r.purchase_count ?? 0);
      if (cnt < 2) return 0;
      const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
      const lastDate = String(r.last_purchase_date ?? "");
      if (!firstDate || !lastDate || firstDate === lastDate) return 0;
      const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
      return cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
    };
    return [...rows].sort((a, b) => {
      let va: any, vb: any;
      if (key === "name") { va = String(a.product_name ?? ""); vb = String(b.product_name ?? ""); }
      else if (key === "current") { va = Number(a.current_stock ?? 0); vb = Number(b.current_stock ?? 0); }
      else if (key === "cycle") { va = detailCycleDays(a); vb = detailCycleDays(b); }
      else if (key === "purchase_date") { va = String(a.last_purchase_date ?? ""); vb = String(b.last_purchase_date ?? ""); }
      else if (key === "purchase_qty") { va = Number(a.purchase_total_qty ?? a.purchase_qty ?? 0); vb = Number(b.purchase_total_qty ?? b.purchase_qty ?? 0); }
      else if (key === "min_order") { va = Number(a.min_order ?? 0); vb = Number(b.min_order ?? 0); }
      else { va = Number(a.total_amount ?? 0); vb = Number(b.total_amount ?? 0); }
      if (typeof va === "string") return va.localeCompare(String(vb), "ko") * mult;
      return (va - vb) * mult;
    });
  };
  // ref 로 fetch 중복 방지 (React state closure race 회피)
  const supplierFetchedRef = useRef<Set<string>>(new Set());
  const supplierInflightRef = useRef<Set<string>>(new Set());
  const toggleSupplierExpand = useCallback(async (sup: SupplierAgg) => {
    const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
    // 토글: 이미 열려있으면 닫기 · 아니면 열기
    let isCurrentlyExpanded = false;
    setExpandedSuppliers(prev => {
      isCurrentlyExpanded = prev.has(key);
      const next = new Set(prev);
      if (isCurrentlyExpanded) next.delete(key); else next.add(key);
      return next;
    });
    // 닫는 중이면 fetch 불필요
    if (isCurrentlyExpanded) return;
    // 이미 fetch 했거나 진행중이면 skip
    if (supplierFetchedRef.current.has(key) || supplierInflightRef.current.has(key)) return;
    supplierInflightRef.current.add(key);
    setSupplierRowsLoading(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: "5000" });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      const rows = res.ok ? (await res.json()).rows : [];
      setSupplierRowsMap(prev => ({ ...prev, [key]: Array.isArray(rows) ? rows : [] }));
      supplierFetchedRef.current.add(key);
    } catch {
      setSupplierRowsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      supplierInflightRef.current.delete(key);
      setSupplierRowsLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [flowSnapshot]);

  // 최소발주 불량(미설정) 카드 · 확장 시 fetch → min_order == 0 필터 (2026-07-16)
  const toggleMinOrderExpand = useCallback(async (sup: SupplierAgg) => {
    const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
    let isCurrentlyExpanded = false;
    setExpandedMinOrder(prev => {
      isCurrentlyExpanded = prev.has(key);
      const next = new Set(prev);
      if (isCurrentlyExpanded) next.delete(key); else next.add(key);
      return next;
    });
    if (isCurrentlyExpanded) return;
    if (minOrderFetchedRef.current.has(key)) return;
    minOrderFetchedRef.current.add(key);
    setMinOrderLoading(prev => { const n = new Set(prev); n.add(key); return n; });
    try {
      const params = new URLSearchParams({ sort: "purchase", dir: "desc", limit: "5000" });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      const rows = res.ok ? (await res.json()).rows : [];
      // 최소발주 설정된 (min_order > 0) 상품만 필터 (2026-07-16 · 사용자 요청)
      const filtered = Array.isArray(rows) ? rows.filter((r: any) => Number(r.min_order ?? 0) > 0) : [];
      setMinOrderRowsMap(prev => ({ ...prev, [key]: filtered }));
    } catch {
      setMinOrderRowsMap(prev => ({ ...prev, [key]: [] }));
    } finally {
      setMinOrderLoading(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }, [flowSnapshot]);

  const openSupplierModal = useCallback(async (sup: SupplierAgg) => {
    setSupplierModal({ supplier: sup.supplier, code: sup.supplier_code });
    setSupplierModalRows(null);
    setSupplierModalLoading(true);
    try {
      const params = new URLSearchParams({
        sort: "sale", dir: "desc", limit: "5000",
      });
      if (sup.supplier_code) params.set("supplier_code", sup.supplier_code);
      else if (sup.supplier) params.set("supplier", sup.supplier);
      if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSupplierModalRows(Array.isArray(data.rows) ? data.rows : []);
      } else {
        setSupplierModalRows([]);
      }
    } catch {
      setSupplierModalRows([]);
    } finally {
      setSupplierModalLoading(false);
    }
  }, [flowSnapshot]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 상품 검색 (300ms debounce)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 1) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stock-check?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data.slice(0, 20) : []);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // 선택된 상품의 매입 이력
  useEffect(() => {
    if (!selectedProduct) { setProductHistory([]); return; }
    (async () => {
      try {
        const params = new URLSearchParams({
          product_name: selectedProduct.product_name,
          days: String(RANGE_DAYS[range]),
        });
        const res = await fetch(`/api/stock-manage/product-history?${params}`);
        if (res.ok) {
          const data = await res.json();
          setProductHistory(Array.isArray(data) ? data : []);
        }
      } catch { /* ignore */ }
    })();
  }, [selectedProduct, range]);

  // 공급사별 집계 + Top 매입 + 적정재고 이하 (기간 변경 시 재조회)
  const fetchAggregates = useCallback(async () => {
    setLoading(true);
    try {
      const q = `?days=${RANGE_DAYS[range]}`;
      const [supRes, topRes, lowRes] = await Promise.allSettled([
        fetch(`/api/stock-manage/suppliers${q}`),
        fetch(`/api/stock-manage/top-products${q}&limit=100`),
        // 적정재고는 products.optimal_stock DB 값 기준 (products.current_stock < products.optimal_stock)
        fetch(`/api/stock-manage/low-stock`),
      ]);
      if (supRes.status === "fulfilled" && supRes.value.ok) {
        setSupplierAggs(await supRes.value.json());
      }
      if (topRes.status === "fulfilled" && topRes.value.ok) {
        setTopProducts(await topRes.value.json());
      }
      if (lowRes.status === "fulfilled" && lowRes.value.ok) {
        setLowStock(await lowRes.value.json());
      }
    } finally { setLoading(false); }
  }, [range]);
  useEffect(() => { fetchAggregates(); }, [fetchAggregates]);

  // 다른 컴포넌트(예: ProductInfoCard)에서 창고/매장 실재고 저장 시 자동 리로드
  //   버그 #4 픽스: deps에서 fetchAggregates 제거 · ref 로 최신 함수 참조
  //   → range 변경마다 리스너 재등록 방지 (원인: fetchAggregates useCallback deps=[range])
  const fetchAggregatesRef = useRef(fetchAggregates);
  useEffect(() => { fetchAggregatesRef.current = fetchAggregates; }, [fetchAggregates]);
  useEffect(() => {
    const handler = () => { fetchAggregatesRef.current(); };
    window.addEventListener("inventory-checks-updated", handler);
    return () => window.removeEventListener("inventory-checks-updated", handler);
  }, []);

  // C 캐시 (2026-07-15): 재고흐름 결과를 params key 로 캐싱 · 재방문 즉시 표시
  //   TTL 60초 · 캐시 hit 시 backgound 로 갱신 (stale-while-revalidate)
  const stockFlowCacheRef = useRef<Map<string, { data: any; ts: number }>>(new Map());
  const STOCK_FLOW_CACHE_TTL = 60000;
  // 재고 흐름 조회 (스냅샷·정렬·limit·flowMonths 변경 시 자동 재조회)
  const fetchStockFlow = useCallback(async () => {
    setLoading(true);
    try {
      // 서버가 지원하는 정렬 key 만 전달 (나머지는 클라이언트에서 정렬)
      const serverSort = (["sale", "purchase", "amount", "closing"] as SortKey[]).includes(flowSort) ? flowSort : "sale";
      const params = new URLSearchParams({ sort: serverSort, dir: flowDir, limit: String(flowLimit) });
      // 2026-07-16 · 계절 지정 시 우선 · flowMonths/snapshot 무시 (년도 무관 · 해당 월 전체)
      if (flowSeason) {
        params.set("season", flowSeason);
      } else if (flowMonths > 0) {
        params.set("months", String(flowMonths));
      } else if (flowSnapshot) {
        params.set("snapshot_date", flowSnapshot);
      }
      const cacheKey = params.toString();
      // 캐시 hit → 즉시 표시 (백그라운드 갱신은 아래 fetch 계속)
      const cached = stockFlowCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < STOCK_FLOW_CACHE_TTL) {
        const d = cached.data;
        setStockFlow(Array.isArray(d.rows) ? d.rows : []);
        setAvailableSnapshots(Array.isArray(d.dates) ? d.dates : []);
        setFlowPeriodType(d.period_type ?? null);
      }
      const res = await fetch(`/api/stock-manage/top-sales?${params}`);
      if (res.ok) {
        const data = await res.json();
        stockFlowCacheRef.current.set(cacheKey, { data, ts: Date.now() });
        setStockFlow(Array.isArray(data.rows) ? data.rows : []);
        setAvailableSnapshots(Array.isArray(data.dates) ? data.dates : []);
        setFlowPeriodType(data.period_type ?? null);
        if (Array.isArray(data.dates_with_period)) {
          const map: Record<string, string | null> = {};
          for (const d of data.dates_with_period) map[d.snapshot_date] = d.period_type ?? null;
          setSnapshotPeriods(map);
        }
        // B 픽스 (2026-07-15): 첫 로드 시 snapshot 자동 세팅으로 재fetch 되던 문제
        //   서버 반환값을 ref 로 표시 · state 세팅은 최초 1회만
        if (flowMonths === 0 && !flowSnapshotAutoSet.current && data.snapshot_date) {
          flowSnapshotAutoSet.current = true;
          if (!flowSnapshot) setFlowSnapshot(data.snapshot_date);
        }
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [flowSnapshot, flowSort, flowDir, flowLimit, flowMonths, flowSeason]);
  const flowSnapshotAutoSet = useRef(false);
  useEffect(() => { fetchStockFlow(); }, [fetchStockFlow]);

  // 상품 숨김 상태 변경 시: 적정재고 이하 · 재고흐름 · 실재고차이 리스트 자동 갱신
  //   버그 #3 픽스: deps에서 함수 참조 제거 → 이벤트 리스너 재등록 방지
  //   모달 open/close · range 변경만으로 리스너 replace 되던 race gap 해소
  //   ref로 최신 함수 참조 (동일 동작 유지)
  const fetchStockFlowRef = useRef(fetchStockFlow);
  const loadHiddenListRef = useRef(loadHiddenList);
  const hiddenModalOpenRef = useRef(hiddenModalOpen);
  useEffect(() => { fetchStockFlowRef.current = fetchStockFlow; }, [fetchStockFlow]);
  useEffect(() => { loadHiddenListRef.current = loadHiddenList; }, [loadHiddenList]);
  useEffect(() => { hiddenModalOpenRef.current = hiddenModalOpen; }, [hiddenModalOpen]);
  // unhide 후속 처리 · 재고관리 자기 리스트만 갱신
  useEffect(() => {
    unhideRefreshRef.current = () => {
      fetchAggregatesRef.current();
      fetchStockFlowRef.current();
    };
  }, []);
  useEffect(() => {
    const handler = () => {
      fetchAggregatesRef.current();
      fetchStockFlowRef.current();
      if (hiddenModalOpenRef.current) loadHiddenListRef.current();
    };
    window.addEventListener("products-hidden-changed", handler);
    return () => window.removeEventListener("products-hidden-changed", handler);
  }, []);

  // 스냅샷 전체 통계 조회
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
        const res = await fetch(`/api/stock-manage/snapshot-summary?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSnapshotTotals(data.totals ?? null);
        }
      } catch { /* ignore */ }
    })();
  }, [flowSnapshot]);

  // 2026-07-16 · 공급사별 재고자산 · 기간 필터 (10일/1~6개월 + 계절)
  const [supplierMonths, setSupplierMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(0);
  const [supplierSeason, setSupplierSeason] = useState<SeasonKey | null>(null);

  // xlsx 기반 공급사별 매입 집계 · 기간 파라미터 지원 (2026-07-16)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "20" });
        // 계절 우선 · 지정 시 months/snapshot 무시 (년도 무관)
        if (supplierSeason) {
          params.set("season", supplierSeason);
        } else if (supplierMonths > 0) {
          params.set("months", String(supplierMonths));
        } else if (flowSnapshot) {
          params.set("snapshot_date", flowSnapshot);
        }
        const res = await fetch(`/api/stock-manage/supplier-purchases?${params}`);
        if (res.ok) {
          const data = await res.json();
          setXlsxSuppliers(Array.isArray(data.rows) ? data.rows : []);
          setXlsxTopSupplier(data.top ?? null);
        }
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [flowSnapshot, supplierMonths, supplierSeason]);

  // 상품 DB 임포트 최신 이력 조회 (상단 배지에 표시)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings?key=product_import_log");
        if (res.ok) {
          const j = await res.json();
          const logs = Array.isArray(j?.value) ? j.value : [];
          const latest = logs[0]?.timestamp ?? null;
          setLastImportAt(latest);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // 판매수량 범위 필터링 (판매 X개 ~ Y개)
  const filteredFlow = useMemo(() => {
    const minN = salesQtyMin.trim() === "" ? null : parseInt(salesQtyMin, 10);
    const maxN = salesQtyMax.trim() === "" ? null : parseInt(salesQtyMax, 10);
    const q = flowSearch.trim().toLowerCase();
    const filtered = stockFlow.filter(p => {
      const qty = p.sale_qty;
      if (minN != null && Number.isFinite(minN) && qty < minN) return false;
      if (maxN != null && Number.isFinite(maxN) && qty > maxN) return false;
      if (q) {
        const hit = String(p.product_name ?? "").toLowerCase().includes(q)
          || String(p.product_code ?? "").toLowerCase().includes(q)
          || String(p.supplier ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
    // 클라이언트 정렬: name/opening/current/loss 는 서버가 지원하지 않으므로 여기서 처리
    // sale/purchase/amount/closing 은 서버 정렬을 유지 (필터링만)
    const sign = flowDir === "asc" ? 1 : -1;
    if (flowSort === "loss") {
      const lossOf = (p: any) => (Number(p.opening_stock ?? 0) - Number(p.sale_qty ?? 0)) - Number(p.closing_stock ?? 0);
      return [...filtered].sort((a, b) => sign * (lossOf(a) - lossOf(b)));
    }
    if (flowSort === "name") {
      return [...filtered].sort((a, b) => sign * String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "ko"));
    }
    if (flowSort === "opening") {
      return [...filtered].sort((a, b) => sign * (Number(a.opening_stock ?? 0) - Number(b.opening_stock ?? 0)));
    }
    if (flowSort === "current") {
      return [...filtered].sort((a, b) => sign * (Number((a as any).current_stock ?? 0) - Number((b as any).current_stock ?? 0)));
    }
    return filtered;
  }, [stockFlow, salesQtyMin, salesQtyMax, flowSort, flowDir, flowSearch]);

  // 상품 이력을 일자별 매입 수량으로 집계 → 차트 데이터
  const chartData = useMemo(() => {
    if (productHistory.length === 0) return { values: [], labels: [] };
    // 일자별 합
    const byDay = new Map<string, number>();
    for (const row of productHistory) {
      const day = (row.saved_at ?? "").slice(0, 10);
      if (!day) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + (row.quantity ?? 0));
    }
    // 정렬된 배열
    const entries = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      values: entries.map(([, qty]) => qty),
      labels: entries.map(([d]) => d.slice(5)), // MM-DD
    };
  }, [productHistory]);

  const totalPurchase = supplierAggs.reduce((s, x) => s + (x.purchaseAmount || 0), 0);

  return (
    <div className="flex-1 flex flex-col max-w-[1360px] mx-auto w-full px-3 sm:px-6 py-2 sm:py-4 gap-2 sm:gap-4">
      {/* 페이지 상단 탭: 대시보드 / 원본 데이터 */}
      <div className="flex flex-col gap-2">
        {/* 1행: 제목 + 서브탭 + 날짜범위 배지 · 아이콘은 상단 네비 탭(재고관리=Boxes)과 통일 */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Boxes size={18} className="text-slate-500 shrink-0" />
          <h2 className="text-lg font-black text-slate-800">재고관리</h2>
          <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">ERP 데이터 기준</span>
          {/* 페이지 서브탭 pill */}
          <div className="inline-flex bg-slate-100/70 border border-slate-200/60 rounded-2xl p-1 gap-0.5">
            <button onClick={() => setPageTab("dashboard")}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${pageTab === "dashboard"
                ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}>대시보드</button>
            <button onClick={() => setPageTab("raw")}
              className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-200 cursor-pointer ${pageTab === "raw"
                ? "bg-white text-slate-900 ring-1 ring-slate-200/70 shadow-sm"
                : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                }`}>원본 데이터</button>
          </div>
          {lastImportAt && (() => {
            const d = new Date(lastImportAt);
            if (isNaN(d.getTime())) return null;
            const m = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            return (
              <span
                className="text-[9px] sm:text-[10px] font-semibold font-mono text-slate-400 ml-1 whitespace-nowrap"
                title={`상품 DB 최근 임포트 시각: ${d.toLocaleString()}`}
              >
                DB {m}/{day} {hh}:{mm}
              </span>
            );
          })()}
          {flowDateRange && (
            <span className={`text-[11px] font-black rounded-full px-2.5 py-1 border font-mono hidden sm:inline ${flowPeriodType === "초순" || flowPeriodType === "early" ? "text-sky-700 bg-sky-50 border-sky-300" :
              flowPeriodType === "중순" || flowPeriodType === "mid" ? "text-indigo-700 bg-indigo-50 border-indigo-300" :
                flowPeriodType === "하순" || flowPeriodType === "late" ? "text-purple-700 bg-purple-50 border-purple-300" :
                  "text-slate-700 bg-slate-100 border-slate-300"
              }`}>
              {flowDateRange}
            </span>
          )}
        </div>
        {/* 2행: 기간 선택 + 검색 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 1주/1개월/3개월 탭 제거됨 (사용자 요청) */}
          {/* 상품명·코드 검색 + 정보확인 (데스크탑 전용 · 모바일은 조회기간 아래로 이동) */}
          {pageTab === "dashboard" && (
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-xl px-2 py-1 shadow-sm min-w-0">
              <div className="relative min-w-0 w-full sm:w-auto">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={infoSearchQuery}
                  onChange={(e) => setInfoSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runInfoSearch(); }}
                  placeholder="상품명 · 코드 검색"
                  className="w-full sm:w-96 pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-sky-400 bg-white"
                />
                {infoSearchResults.length > 0 && (
                  <div className="absolute left-0 top-full mt-1 max-h-64 overflow-y-auto border border-slate-200 bg-white rounded-lg shadow-lg z-30 divide-y divide-slate-100 min-w-full sm:min-w-[500px]">
                    {infoSearchResults.map((p, i) => (
                      <button
                        key={`info-sr-${p.product_code}-${i}`}
                        onClick={() => { setInfoSelected(p); setInfoSearchQuery(p.product_name); setInfoSearchResults([]); }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-sky-50 transition text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 whitespace-nowrap">{p.product_name}</div>
                          <div className="text-[9px] font-mono text-slate-400 whitespace-nowrap">#{p.product_code} · {p.supplier ?? "-"}</div>
                        </div>
                        <span className="text-[9px] text-slate-400 shrink-0">재고 {p.current_stock ?? "-"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => openProductInfoModal()}
                disabled={!infoSelected && !infoSearchQuery.trim() && infoSearchResults.length === 0}
                className="flex items-center gap-1 text-[10px] font-black text-white bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm shrink-0"
                title="상품 선택 후 클릭 (미선택 시 검색결과 첫번째 사용)"
              >
                <Info size={11} /> 정보확인
              </button>
              <button
                onClick={() => openHiddenManagerModal()}
                className="flex items-center gap-1 text-[10px] font-black text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm shrink-0"
                title="숨김 처리된 상품을 확인/해제 · 검색·발주 리스트 노출 여부 관리"
              >
                <EyeOff size={11} /> 숨김 관리
              </button>
            </div>
          )}
        </div>
      </div>

      {pageTab === "raw" ? <RawDataView /> : (
        <>

          {/* 통합 탭 바 (2026-07-15) · Vercel Ink 스타일 · underline · 미니멀 */}
          <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b border-slate-200 sm:overflow-x-auto sm:scrollbar-none">
            {[
              { k: "flow" as const, label: "상품재고현황", icon: Activity, color: "teal" },
              { k: "supplier" as const, label: "공급사재고", icon: Building2, color: "sky" },
              { k: "purchase" as const, label: "매입상세", icon: TrendingUp, color: "emerald" },
              { k: "low" as const, label: "적정재고↓", icon: AlertTriangle, color: "rose", badge: lowStock.length },
              { k: "diff" as const, label: "실재고차이", icon: Layers, color: "violet" },
              // 상품관리 · 판매추이에서 이동 (2026-07-16 · 사용자 요청 · 실재고차이 옆)
              { k: "product" as const, label: "상품관리", icon: Package, color: "indigo" },
            ].map(t => {
              const Icon = t.icon;
              const active = stockTab === t.k;
              const activeText = {
                teal: "text-teal-700",
                sky: "text-sky-700",
                emerald: "text-emerald-700",
                rose: "text-rose-700",
                violet: "text-violet-700",
                indigo: "text-indigo-700",
              }[t.color]!;
              const activeBar = {
                teal: "bg-teal-500",
                sky: "bg-sky-500",
                emerald: "bg-emerald-500",
                rose: "bg-rose-500",
                violet: "bg-violet-500",
                indigo: "bg-indigo-500",
              }[t.color]!;
              return (
                <button key={t.k} onClick={() => setStockTab(t.k)}
                  className={`relative basis-1/3 sm:basis-auto flex-grow-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-[13px] font-bold leading-tight transition-colors duration-150 ${active ? activeText : "text-slate-400 hover:text-slate-700"
                    }`}>
                  <Icon size={13} strokeWidth={active ? 2.4 : 1.8} className="hidden sm:inline-block shrink-0" />
                  <span>{t.label}</span>
                  {"badge" in t && t.badge != null && t.badge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[14px] sm:min-w-[18px] px-1 h-4 rounded-full text-[9px] font-black ${active ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.badge}
                    </span>
                  )}
                  {/* 밑줄 · 활성 탭만 */}
                  {active && (
                    <span className={`absolute left-0 right-0 -bottom-px h-[2px] ${activeBar} rounded-t-sm`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 flex-1 min-h-0">
            {/* 탭 컨텐츠 · 활성 탭만 렌더 */}
            <div className="flex flex-col gap-3 min-h-0 w-full">
              {/* ── 공급사재고 탭 · 좌우 split (2026-07-16) ── */}
              {stockTab === "supplier" && (
              <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                {/* 좌측: 공급사 리스트 (원본 유지) */}
                <div
                  className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                  style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? supplierPanelWidth : undefined }}
                >
              {/* 공급사별 재고자산 (종료일 시점, xlsx 합계 컬럼 합산) — 최상위 공급사 하이라이트 + 순위 리스트 */}
              {true && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Building2 size={14} className="text-sky-600" />
                      <span className="text-[11px] font-black text-slate-600">공급사별 재고자산<span className="text-[10px] font-semibold text-slate-400 ml-1">(종료일)</span></span>
                      {flowSnapshot && (
                        <span className="text-[10px] font-mono text-sky-600 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5">
                          {flowSnapshot}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">({xlsxSuppliers.length}개 사)</span>
                    </div>
                    {/* 2026-07-16 · 기간 필터 (재고리스트와 동일 UI) */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black text-slate-500">기간</span>
                      <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5 shadow-inner">
                        <button onClick={() => { setSupplierSeason(null); setSupplierMonths(0); }}
                          className={`px-2 py-1 text-[10px] font-black rounded transition cursor-pointer ${!supplierSeason && supplierMonths === 0 ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}>10일</button>
                        {[1, 2, 3, 4, 5, 6].map(m => (
                          <button key={m} onClick={() => { setSupplierSeason(null); setSupplierMonths(m as any); }}
                            className={`px-2 py-1 text-[10px] font-black rounded transition cursor-pointer ${!supplierSeason && supplierMonths === m ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"}`}>{m}개월</button>
                        ))}
                      </div>
                      <SeasonButtons value={supplierSeason} onChange={(v) => { setSupplierSeason(v); if (v) setSupplierMonths(0); }} size="sm" hideLabel />
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold leading-tight">공급사 클릭 → 오른쪽에 상품 리스트 · 판매출고계 내림차순</p>
                  </div>
                  {!supplierCardCollapsed && (<>
                    {/* 순위 리스트 (재고자산 기준 내림차순) — 우측 스크롤바 여백 확보 */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                      {xlsxSuppliers.length === 0 ? (
                        <div className="text-center text-[11px] text-slate-300 py-6">
                          {loading ? "불러오는 중..." : "데이터 없음"}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {xlsxSuppliers.map((sup, i) => {
                            const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
                            const isExpanded = expandedSuppliers.has(key);
                            const isLoading = supplierRowsLoading.has(key);
                            const rows = supplierRowsMap[key];
                            return (
                              <div key={key} className="py-2">
                                {/* 헤더 행 · 클릭시 상세 접기/펼치기 */}
                                <button
                                  type="button"
                                  onClick={() => { toggleSupplierExpand(sup); setSupplierSelectedKey(key); }}
                                  className={`w-full flex items-center justify-between gap-2 -mx-1 px-1 py-0.5 rounded-lg transition cursor-pointer ${supplierSelectedKey === key ? "bg-sky-100/80 hover:bg-sky-100" : "hover:bg-orange-50/30"}`}
                                  title={isExpanded ? "상세 접기" : "상세 펼치기 (판매출고계 내림차순)"}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`text-slate-400 text-xs transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                                    <span className="text-[10px] font-black text-orange-600 shrink-0">{i + 1}</span>
                                    <Building2 size={11} className="text-sky-500 shrink-0" />
                                    <span className="text-[13px] font-medium text-slate-800 truncate">{sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</span>
                                    {sup.supplier_code && (
                                      <span className="text-[9px] font-mono text-slate-400 shrink-0" title="공급사코드">#{sup.supplier_code}</span>
                                    )}
                                    {sup.code_conflict && (
                                      <span
                                        className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 shrink-0"
                                        title="같은 이름에 여러 공급사코드가 존재 — 중복 의심"
                                      >⚠</span>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-black text-emerald-700 shrink-0">{fmtWon(sup.totalStockAmount)}</span>
                                </button>
                                <div className="flex items-center justify-end mt-0.5">
                                  <span
                                    className="text-[10px] text-slate-400 shrink-0 text-right"
                                    title={`매입 ${fmt(sup.purchaseQty)}개 · 취급 상품 ${sup.itemCount}종`}
                                  >매입 {fmt(sup.purchaseQty)}개 · <span className="text-slate-500 font-semibold">상품 {sup.itemCount}종</span></span>
                                </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>)}
                </div>
              )}
                </div>{/* 좌측 공급사 리스트 wrapper close */}

                {/* 리사이즈 핸들 (데스크탑만) */}
                <div onMouseDown={onSupplierResizeStart}
                  className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-sky-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                  title="드래그하여 폭 조절">
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
                </div>

                {/* 우측: 공급사 상세 · 모바일 fullscreen 모달 */}
                <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${supplierSelectedObj ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
                  {supplierSelectedObj && (
                    <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => setSupplierSelectedKey(null)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                          <XIcon size={16} strokeWidth={2.4} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-black text-slate-800 truncate leading-tight">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">{supplierSelectedObj.supplier_code ? `#${supplierSelectedObj.supplier_code}` : ""} · 재고자산 {fmtWon(supplierSelectedObj.totalStockAmount)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!supplierSelectedObj ? (
                    <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                      <Building2 size={40} className="mb-3 opacity-30" />
                      <div className="text-sm font-bold">리스트에서 공급사를 클릭하세요</div>
                      <div className="text-[11px] mt-1">재고자산 요약 · 상품 리스트</div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Building2 size={16} className="text-sky-600 shrink-0" />
                        <span className="text-base font-black text-slate-800 break-keep">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</span>
                        {supplierSelectedObj.supplier_code && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">#{supplierSelectedObj.supplier_code}</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-emerald-600 font-semibold">재고자산</div>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">{fmtWon(supplierSelectedObj.totalStockAmount)}</div>
                        </div>
                        <div className="bg-sky-50 border border-sky-200 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-sky-600 font-semibold">매입수량</div>
                          <div className="text-sm font-black text-sky-700 mt-0.5">{fmt(supplierSelectedObj.purchaseQty)}</div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-center">
                          <div className="text-[10px] text-slate-500 font-semibold">취급상품</div>
                          <div className="text-sm font-black text-slate-700 mt-0.5">{fmt(supplierSelectedObj.itemCount)}종</div>
                        </div>
                      </div>
                      {/* 상품 리스트 (확장 리스트에서 가져옴) */}
                      {(() => {
                        const key = `${supplierSelectedObj.supplier_code ?? "-"}::${supplierSelectedObj.supplier}`;
                        const rows = supplierRowsMap[key];
                        const isLoading = supplierRowsLoading.has(key);
                        if (isLoading) return <div className="flex items-center gap-2 text-[11px] text-slate-400 py-4"><LoaderIcon size={12} className="animate-spin" />상품 로드 중...</div>;
                        if (!rows) return <div className="text-[11px] text-slate-400 py-4">공급사를 클릭하면 상품 리스트가 로드됩니다</div>;
                        if (rows.length === 0) return <div className="text-[11px] text-slate-400 py-4">상품 데이터 없음</div>;
                        // 우측 단순 상품 리스트 · 헤더 클릭 정렬 (2026-07-16)
                        const supDetailArrow = (k: SupDetailSortKey) =>
                          supDetailSort.key === k
                            ? (supDetailSort.dir === "desc" ? " ▼" : " ▲")
                            : " ⇅";
                        const sortedDetail = sortSupDetailRows(rows);
                        const fmtPurchaseDate = (d: string | null | undefined): string => {
                          if (!d) return "-";
                          const dt = new Date(d);
                          if (isNaN(dt.getTime())) return "-";
                          const m = String(dt.getMonth() + 1).padStart(2, "0");
                          const day = String(dt.getDate()).padStart(2, "0");
                          return `${m}/${day}`;
                        };
                        const detailCycleStr = (r: any): string => {
                          const cnt = Number(r.purchase_count ?? 0);
                          if (cnt < 2) return "-";
                          const firstDate = String(r.first_purchase_date ?? r.last_purchase_date ?? "");
                          const lastDate = String(r.last_purchase_date ?? "");
                          if (!firstDate || !lastDate || firstDate === lastDate) return "-";
                          const days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (86400 * 1000));
                          const cycle = cnt > 1 ? Math.round(days / (cnt - 1)) : 0;
                          return cycle > 0 ? `${cycle}일` : "-";
                        };
                        return (
                          <div className="overflow-auto max-h-[60vh] rounded-lg border border-slate-100">
                            <table className="w-full text-[10px] min-w-[560px]">
                              <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                                <tr className="text-[10px] text-slate-400 uppercase tracking-wider">
                                  <th className="text-left px-1 py-1.5 w-6">#</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("name")}
                                    className={`text-left px-1 py-1.5 cursor-pointer select-none hover:bg-slate-50 transition ${supDetailSort.key === "name" ? "text-slate-800 font-black" : ""}`}
                                    title="상품명 정렬"
                                  >상품명{supDetailArrow("name")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("current")}
                                    className={`text-right px-1 py-1.5 w-12 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "current" ? "text-amber-700 font-black" : "text-amber-500"}`}
                                    title="현재고 정렬"
                                  >현재고{supDetailArrow("current")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("cycle")}
                                    className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50/60 transition ${supDetailSort.key === "cycle" ? "text-slate-700 font-black" : "text-slate-400"}`}
                                    title="매입주기 정렬"
                                  >매입주기{supDetailArrow("cycle")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("purchase_date")}
                                    className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50/60 transition ${supDetailSort.key === "purchase_date" ? "text-slate-700 font-black" : "text-slate-400"}`}
                                    title="최근매입일 정렬"
                                  >최근매입일{supDetailArrow("purchase_date")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("purchase_qty")}
                                    className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-slate-50 transition ${supDetailSort.key === "purchase_qty" ? "text-slate-800 font-black" : ""}`}
                                    title="매입수량 정렬"
                                  >매입수량{supDetailArrow("purchase_qty")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("min_order")}
                                    className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-sky-50/60 transition ${supDetailSort.key === "min_order" ? "text-sky-700 font-black" : "text-sky-400"}`}
                                    title="최소발주 정렬"
                                  >최소발주{supDetailArrow("min_order")}</th>
                                  <th
                                    onClick={() => toggleSupDetailSort("total_amount")}
                                    className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-emerald-50/60 transition ${supDetailSort.key === "total_amount" ? "text-emerald-700 font-black" : "text-emerald-500"}`}
                                    title="재고금액 정렬"
                                  >재고금액{supDetailArrow("total_amount")}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sky-100">
                                {sortedDetail.slice(0, 200).map((r, ri) => {
                                  const minOrder = Number(r.min_order ?? 0);
                                  return (
                                  <tr key={`supdet-${r.product_code ?? ri}`} className="hover:bg-orange-50/30 transition align-top">
                                    <td className="px-1 py-1 text-slate-400">{ri + 1}</td>
                                    <td className="px-1 py-1 break-words whitespace-normal leading-tight">
                                      <button type="button" onClick={() => loadFlowSelectedProduct(r)} className="text-left font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer transition break-words whitespace-normal">{r.product_name}</button>
                                    </td>
                                    <td className="text-right px-1 py-1 font-mono text-amber-700">{fmt(Number(r.current_stock ?? 0))}</td>
                                    <td className="text-right px-1 py-1 font-mono text-slate-500">{detailCycleStr(r)}</td>
                                    <td className="text-right px-1 py-1 font-mono text-slate-500">{fmtPurchaseDate(r.last_purchase_date)}</td>
                                    <td className="text-right px-1 py-1 font-mono text-slate-700">{fmt(Number(r.purchase_total_qty ?? r.purchase_qty ?? 0))}</td>
                                    <td className="text-right px-1 py-1 font-mono text-sky-600">{minOrder > 0 ? `${fmt(minOrder)}개` : "-"}</td>
                                    <td className="text-right px-1 py-1 font-mono font-bold text-emerald-700">{fmtWon(Number(r.total_amount ?? 0))}</td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {rows.length > 200 && <div className="text-[10px] text-slate-400 text-center py-1">상위 200개만 표시 · 전체 {rows.length}개</div>}
                          </div>
                        );

                      })()}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 매입상세 리스트 (2026-07-15) · purchase_details 조회 · 검색·기간·공급사·헤더정렬 · 상품명 클릭 → 상세 모달 */}
              {stockTab === "purchase" && (
              <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                <div
                  className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                  style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? purchasePanelWidth : undefined }}
                >
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                  <PurchaseDetailsView onProductClick={loadPurchaseSelectedProduct} />
                </div>
                </div>
                <div onMouseDown={onPurchaseResizeStart}
                  className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-emerald-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                  title="드래그하여 폭 조절">
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
                </div>
                <div className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0 transition-transform duration-150 ${purchaseSelectedProduct ? "fixed inset-0 z-50 bg-slate-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible" : ""}`}>
                  {purchaseSelectedProduct && (
                    <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-slate-200 shadow-md">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => setPurchaseSelectedProduct(null)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer shrink-0" title="닫기">
                          <XIcon size={16} strokeWidth={2.4} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-black text-slate-800 truncate leading-tight">{purchaseSelectedProduct.name}</div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">#{purchaseSelectedProduct.code} · {purchaseSelectedProduct.supplier ?? "-"}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!purchaseSelectedProduct ? (
                    <div className="bg-white rounded-xl border border-slate-200 flex-1 flex flex-col items-center justify-center p-10 text-slate-400 min-h-[400px]">
                      <Package size={40} className="mb-3 opacity-30" />
                      <div className="text-sm font-bold">리스트에서 항목을 클릭하세요</div>
                      <div className="text-[11px] mt-1">상세 정보가 표시됩니다</div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <ProductInfoCard
                        product={purchaseSelectedProduct}
                        context="stock-manage"
                        editable={true}
                        onRealMapUpdate={(v) => setPurchaseSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                        onProductUpdate={(u) => setPurchaseSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                      />
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* 적정재고 이하 리스트 · 좌우 분할 레이아웃 */}
              {stockTab === "low" && (
              <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                {/* 좌측: 적정재고 이하 리스트 */}
                <div
                  className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                  style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? lowPanelWidth : undefined }}
                >
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-rose-500" />
                      <span className="text-[11px] font-black text-slate-600">적정재고 이하</span>
                      <span className="text-[10px] text-slate-400 font-semibold">현재고 &lt; 적정재고</span>
                      <span className="text-[10px] font-mono text-slate-400">({lowStock.length}개)</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold leading-tight">상품명 클릭 → 상세 정보 · 실재고 스캔 현황</p>
                  </div>
                  {!lowStockCollapsed && (
                    <div className="flex-1 overflow-y-auto relative">
                      {loading && lowStock.length > 0 && (
                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-rose-600 font-bold py-1.5 mb-1 bg-rose-50 border border-rose-200 rounded-md sticky top-0 z-10">
                          <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                        </div>
                      )}
                      {loading && lowStock.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><LoaderIcon size={14} className="animate-spin" />로딩 중...</div>
                      ) : lowStock.length === 0 ? (
                        <div className="text-center text-[11px] text-slate-300 py-6">해당 상품 없음</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[10px] sm:text-xs sm:min-w-[480px]">
                            <thead className="sticky top-0 bg-white z-10">
                              <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                                <th className="text-left px-0.5 py-1.5 w-7">#</th>
                                <th className="text-left px-0.5 py-1.5">상품명</th>
                                <th className="text-right px-0.5 py-1.5 w-14 text-amber-500 cursor-pointer hover:bg-slate-50" title="ERP 현재고 (products.current_stock)">ERP</th>
                                <th className="text-right px-0.5 py-1.5 w-16 bg-cyan-50/40 text-cyan-600 font-black cursor-pointer hover:bg-cyan-100/40" title="실재고 · 바코드스캔 창고">창고</th>
                                <th className="text-right px-0.5 py-1.5 w-16 bg-violet-50/40 text-violet-600 font-black cursor-pointer hover:bg-violet-100/40" title="실재고 · 바코드스캔 매장">매장</th>
                                <th className="text-right px-0.5 py-1.5 w-14 text-emerald-500 font-black cursor-pointer hover:bg-slate-50" title="실재고 합계 (창고+매장)">실재고</th>
                                <th className="text-right px-0.5 py-1.5 w-14 text-slate-500 cursor-pointer hover:bg-slate-50">적정</th>
                                <th className="text-right px-0.5 py-1.5 w-14 text-rose-500 cursor-pointer hover:bg-slate-50">필요</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {lowStock.slice(0, 200).map((p, i) => {
                                const cur = Number(p.current_stock ?? 0);
                                const opt = Number(p.optimal_stock ?? 0);
                                const need = Math.max(0, opt - cur);
                                const wh = p.warehouse_stock;
                                const st = p.store_stock;
                                const isSelected = lowSelectedProduct?.code === String(p.product_code ?? "");
                                return (
                                  <tr key={`low-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                                    <td className="px-0.5 py-1.5 text-orange-600 font-black text-[10px] align-top">{i + 1}</td>
                                    <td className="px-0.5 py-1.5 align-top">
                                      <button
                                        onClick={() => loadLowSelectedProduct(p)}
                                        className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                                        title={`${p.product_name} — 클릭 시 상세 정보`}
                                      >
                                        {p.product_name}
                                      </button>
                                      {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{p.supplier}</div>}
                                    </td>
                                    <td className={`text-right px-0.5 py-1.5 font-mono font-black text-[10px] align-top ${cur <= 0 ? "text-red-600" : "text-amber-700"}`} title="ERP 현재고 (products.current_stock)">{fmt(cur)}</td>
                                    <td className={`text-right px-0.5 py-1.5 font-mono font-black text-[10px] bg-cyan-50/40 align-top ${wh != null ? "text-cyan-700" : "text-slate-300"}`} title={p.inv_checked_at ? `실재고 창고 · 최근입력 ${new Date(p.inv_checked_at).toLocaleDateString("ko-KR")}` : "창고 실재고 미입력"}>
                                      {wh != null ? fmt(Number(wh)) : "—"}
                                    </td>
                                    <td className={`text-right px-0.5 py-1.5 font-mono font-black text-[10px] bg-violet-50/40 align-top ${st != null ? "text-violet-700" : "text-slate-300"}`} title={p.inv_checked_at ? `실재고 매장 · 최근입력 ${new Date(p.inv_checked_at).toLocaleDateString("ko-KR")}` : "매장 실재고 미입력"}>
                                      {st != null ? fmt(Number(st)) : "—"}
                                    </td>
                                    {(() => {
                                      const whN = wh != null ? Number(wh) : null;
                                      const stN = st != null ? Number(st) : null;
                                      const realTotal = whN != null || stN != null ? (whN ?? 0) + (stN ?? 0) : null;
                                      const mismatch = realTotal != null && realTotal !== cur;
                                      return (
                                        <td
                                          className={`text-right px-0.5 py-1.5 font-mono font-black text-[10px] align-top ${realTotal == null ? "text-slate-300" : mismatch ? "text-red-600" : "text-emerald-700"}`}
                                          title={realTotal == null ? "실재고 미입력" : mismatch ? `실재고 ${realTotal} ≠ ERP ${cur} · 불일치` : "실재고 = 창고 + 매장"}
                                        >{realTotal != null ? fmt(realTotal) : "—"}</td>
                                      );
                                    })()}
                                    <td className="text-right px-0.5 py-1.5 font-mono text-[10px] text-slate-600 align-top">
                                      {optimalEditCode === String(p.product_code) ? (
                                        <div className="flex items-center justify-end gap-0.5">
                                          <input
                                            autoFocus
                                            type="number"
                                            min={0}
                                            inputMode="numeric"
                                            value={optimalEditValue}
                                            onChange={(e) => setOptimalEditValue(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") { e.preventDefault(); commitOptimalEdit(); }
                                              else if (e.key === "Escape") { e.preventDefault(); cancelOptimalEdit(); }
                                            }}
                                            disabled={optimalEditSaving}
                                            className="w-12 text-right font-mono text-[12px] font-black border-2 border-indigo-400 rounded-md px-1 py-1 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 bg-white"
                                          />
                                          <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={commitOptimalEdit}
                                            disabled={optimalEditSaving}
                                            className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition disabled:opacity-50 shadow-sm"
                                            title="저장"
                                          >
                                            <Check size={12} strokeWidth={3} />
                                          </button>
                                          <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={cancelOptimalEdit}
                                            className="p-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 transition shadow-sm"
                                            title="취소"
                                          >
                                            <XIcon size={12} strokeWidth={3} />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => startOptimalEdit(String(p.product_code), opt)}
                                          className="w-full min-h-[32px] flex items-center justify-end gap-1 text-right font-mono text-[12px] font-bold hover:bg-indigo-50 active:bg-indigo-100 border border-transparent hover:border-indigo-200 rounded-md px-2 py-1.5 cursor-pointer transition"
                                          title="탭하여 적정재고 편집"
                                        >
                                          <span className={opt > 0 ? "text-slate-800" : "text-slate-400"}>{opt > 0 ? fmt(opt) : "입력"}</span>
                                          <Pencil size={10} className="text-indigo-400 shrink-0" />
                                        </button>
                                      )}
                                    </td>
                                    <td className="text-right px-0.5 py-1.5 font-mono font-bold text-[10px] text-rose-600 align-top">{need > 0 ? `+${fmt(need)}` : "-"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>

                {/* 리사이즈 핸들 (데스크탑만) */}
                <div onMouseDown={onLowResizeStart}
                  className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-rose-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                  title="드래그하여 폭 조절">
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
                </div>

                {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
                <ProductDetailRightPanel
                  selected={lowSelectedProduct}
                  onClose={() => setLowSelectedProduct(null)}
                  onProductUpdate={(u) => setLowSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                  onRealMapUpdate={(v) => setLowSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                  showChart={true}
                  context="stock-manage"
                  editable={true}
                  emptySub="상세 정보가 표시됩니다"
                />
              </div>
              )}

              {/* 실재고 vs ERP 차이 상품 리스트 · 좌우 분할 레이아웃 */}
              {stockTab === "diff" && (
              <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                {/* 좌측: 차이 리스트 */}
                <div
                  className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                  style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? diffPanelWidth : undefined }}
                >
                {(() => {
                  const diffList = lowStock
                    .map(p => {
                      const wh = p.warehouse_stock;
                      const st = p.store_stock;
                      if (wh == null && st == null) return null;
                      const actual = (Number(wh) || 0) + (Number(st) || 0);
                      const cur = Number(p.current_stock ?? 0);
                      const diff = actual - cur;
                      if (diff === 0) return null;
                      return { ...p, actual, cur, diff };
                    })
                    .filter(Boolean) as Array<any>;
                  return (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-purple-500" />
                        <span className="text-[11px] font-black text-slate-600">실재고 ↔ ERP 차이</span>
                        <span className="text-[10px] text-slate-400 font-semibold">창고+매장 ≠ 현재고</span>
                        <span className="text-[10px] font-mono text-slate-400">({diffList.length}개)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-semibold leading-tight">상품명 클릭 → 상세 정보 · 실재고 스캔 현황</p>
                    </div>
                    {!stockDiffCollapsed && (
                      <div className="flex-1 overflow-y-auto relative">
                        {loading && diffList.length > 0 && (
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-purple-600 font-bold py-1.5 mb-1 bg-purple-50 border border-purple-200 rounded-md sticky top-0 z-10">
                            <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                          </div>
                        )}
                        {loading && diffList.length === 0 ? (
                          <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><LoaderIcon size={14} className="animate-spin" />로딩 중...</div>
                        ) : diffList.length === 0 ? (
                          <div className="text-center text-[11px] text-slate-300 py-6">차이 있는 상품 없음</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10px] sm:text-xs sm:min-w-[280px]">
                              <thead className="sticky top-0 bg-white z-10">
                                <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                                  <th className="text-left px-0.5 py-1.5 w-7">#</th>
                                  <th className="text-left px-0.5 py-1.5">상품명</th>
                                  <th className="text-right px-0.5 py-1.5 w-14 bg-amber-50/40 text-amber-500 cursor-pointer hover:bg-amber-100/40">ERP</th>
                                  <th className="text-right px-0.5 py-1.5 w-16 bg-violet-50/40 text-violet-600 font-black cursor-pointer hover:bg-violet-100/40">실재고</th>
                                  <th className="text-right px-0.5 py-1.5 w-14 bg-rose-50/40 text-rose-500 cursor-pointer hover:bg-rose-100/40">차이</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {diffList.slice(0, 100).map((p: any, i: number) => {
                                  const isSelected = diffSelectedProduct?.code === String(p.product_code ?? "");
                                  return (
                                  <tr key={`diff-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                                    <td className="px-0.5 py-1.5 text-orange-600 font-black text-[10px] align-top">{i + 1}</td>
                                    <td className="px-0.5 py-1.5 align-top">
                                      <button
                                        onClick={() => loadDiffSelectedProduct(p)}
                                        className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                                        title={p.product_name}
                                      >
                                        {p.product_name}
                                      </button>
                                      {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{p.supplier}</div>}
                                    </td>
                                    <td className="text-right px-0.5 py-1.5 font-mono font-black text-[10px] bg-amber-50/40 text-amber-700 align-top">{fmt(p.cur)}</td>
                                    <td className="text-right px-0.5 py-1.5 font-mono font-black text-[10px] bg-violet-50/40 text-violet-700 align-top">{fmt(p.actual)}</td>
                                    <td className={`text-right px-0.5 py-1.5 font-mono font-black text-[10px] align-top ${p.diff > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                      {p.diff > 0 ? `+${fmt(p.diff)}` : fmt(p.diff)}
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })()}
                </div>

                {/* 리사이즈 핸들 (데스크탑만) */}
                <div onMouseDown={onDiffResizeStart}
                  className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-purple-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                  title="드래그하여 폭 조절">
                  <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
                </div>

                {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
                <ProductDetailRightPanel
                  selected={diffSelectedProduct}
                  onClose={() => setDiffSelectedProduct(null)}
                  onProductUpdate={(u) => setDiffSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                  onRealMapUpdate={(v) => setDiffSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                  showChart={true}
                  context="stock-manage"
                  editable={true}
                  emptySub="상세 정보가 표시됩니다"
                />
              </div>
              )}
            </div>

            {/* 상품관리 탭 · 좌우 분할 레이아웃 */}
            {stockTab === "product" && (
            <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
              {/* 좌측: ProductManageView */}
              <div
                className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? productPanelWidth : undefined }}
              >
                <ProductManageView onProductClick={loadProductSelectedProduct} />
              </div>

              {/* 리사이즈 핸들 (데스크탑만) */}
              <div onMouseDown={onProductResizeStart}
                className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-indigo-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                title="드래그하여 폭 조절">
                <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
              </div>

              {/* 우측: 상품 상세 · ProductDetailRightPanel (공용) */}
              <ProductDetailRightPanel
                selected={productSelectedProduct}
                onClose={() => setProductSelectedProduct(null)}
                onProductUpdate={(u) => setProductSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setProductSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                showChart={true}
                context="stock-manage"
                editable={true}
                emptySub="상세 정보가 표시됩니다"
              />
            </div>
            )}

            {/* 상품재고현황 탭 · 좌우 분할 레이아웃 (2026-07-16) · 좌: 재고리스트(원본) · 우: 제품정보(모바일 fullscreen 모달) */}
            {stockTab === "flow" && (
            <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
              {/* ─── 좌측: 재고리스트 (원본 유지) ─── */}
              <div
                className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? flowPanelWidth : undefined }}
              >
              {/* 재고 흐름 카드 · 판매추이 StockFlowPanel 과 동일 레이아웃 */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 헤더 · 세그먼트 탭 + 스냅샷 날짜 + 접기 버튼 · 안내 */}
                <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* 접기/펴기 화살표 · 세그먼트 탭 제거 (2026-07-15) · 상단 통합 탭이 대체 */}
                      {/* 스냅샷 날짜 pill */}
                      {topTab === "sale" && flowSnapshot && (
                        <span className="text-[10px] font-mono font-black text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5">
                          {flowSnapshot}
                        </span>
                      )}
                      {topTab === "sale" && flowDateRange && (
                        <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border font-mono ${
                          flowPeriodType === "초순" || flowPeriodType === "early" ? "text-sky-700 bg-sky-50 border-sky-300" :
                          flowPeriodType === "중순" || flowPeriodType === "mid"   ? "text-indigo-700 bg-indigo-50 border-indigo-300" :
                          flowPeriodType === "하순" || flowPeriodType === "late"  ? "text-purple-700 bg-purple-50 border-purple-300" :
                          "text-slate-600 bg-slate-100 border-slate-300"
                        }`}>
                          {flowDateRange}
                        </span>
                      )}
                    </div>
                    {/* 재고흐름 상위 리스트 조회 · 판매추이와 동일 pill 스타일 (2026-07-15 복원) */}
                    {topTab === "sale" && !flowCardCollapsed && (
                      <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none">
                        {[
                          { v: 100,   label: "Top 100" },
                          { v: 300,   label: "Top 300" },
                          { v: 1000,  label: "Top 1000" },
                          { v: 2000,  label: "Top 2000" },
                          { v: 50000, label: "전체" },
                        ].map(o => (
                          <button key={o.v} onClick={() => setFlowLimit(o.v)}
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded transition whitespace-nowrap ${
                              flowLimit === o.v ? "bg-teal-500 text-white" : "text-slate-500 hover:bg-slate-100"
                            }`}
                          >{o.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!flowCardCollapsed && (
                    <p className="text-[10px] text-slate-500 font-semibold leading-tight">
                      💡 상품명을 누르면 상세 정보와 재고 상황이 나옵니다
                    </p>
                  )}
                </div>
                <div className={`flex-1 min-h-0 flex flex-col p-3 ${flowCardCollapsed ? "hidden" : "flex"}`}>
                {topTab === "sale" && (
                  <>
                    {/* 조회기간 · 버튼 클릭 즉시 자동 조회 · 계절 지정 시 년도 무관 (2026-07-19 자동조회 복원) */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap text-[11px]">
                      <span className="text-slate-500 font-black text-[11px] shrink-0">조회기간</span>
                      <div className="inline-flex bg-slate-100/80 border border-slate-200/60 rounded-lg p-0.5 shadow-inner">
                        <button onClick={() => { setFlowSeason(null); setPendingFlowMonths(0); setFlowMonths(0); }}
                          className={`px-2 py-1 text-[10px] font-black rounded transition cursor-pointer ${
                            !flowSeason && flowMonths === 0 ? "bg-white text-orange-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
                          }`}>10일</button>
                        {[1, 2, 3, 4, 5, 6].map(m => (
                          <button key={m} onClick={() => { setFlowSeason(null); setPendingFlowMonths(m as any); setFlowMonths(m as any); }}
                            className={`px-2 py-1 text-[10px] font-black rounded transition cursor-pointer ${
                              !flowSeason && flowMonths === m ? "bg-white text-orange-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
                            }`}>{m}개월</button>
                        ))}
                      </div>
                      {/* 2026-07-16 · 계절 조회 · 지정 시 flowMonths 무시 */}
                      <SeasonButtons value={flowSeason} onChange={(v) => { setFlowSeason(v); if (v) { setPendingFlowMonths(0); setFlowMonths(0); } }} size="sm" hideLabel />
                      {loading && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-teal-600">
                          <LoaderIcon size={11} className="animate-spin" /> 불러오는 중...
                        </span>
                      )}
                      {/* 실제 조회 날짜 범위 표시 (현재 적용된 flowMonths 기준) */}
                      {flowMonths > 0 && (() => {
                        const today = new Date();
                        const start = new Date(today.getFullYear(), today.getMonth() - flowMonths, 1);
                        const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
                        const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                        return (
                          <span className="text-[10px] font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                            {s} ~ {e}
                          </span>
                        );
                      })()}
                    </div>
                    {/* 조회기간 다음 줄: TOP 리스트 내 검색 + 정보확인 + 숨김관리 */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap text-[11px]">
                      <div className="relative flex-1 min-w-[140px]">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          value={flowSearch}
                          onChange={e => setFlowSearch(e.target.value)}
                          placeholder="TOP 리스트 내 검색 (상품명·코드)"
                          className="w-full pl-7 pr-6 py-1.5 border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:border-orange-400 bg-white"
                        />
                        {flowSearch && (
                          <button onClick={() => setFlowSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-rose-500 hover:text-rose-700 cursor-pointer">✕</button>
                        )}
                      </div>
                      {pageTab === "dashboard" && (
                        <>
                          <button
                            onClick={() => openProductInfoModal()}
                            disabled={!infoSelected && !infoSearchQuery.trim() && infoSearchResults.length === 0 && !flowSearch.trim()}
                            title="선택 상품의 상세 정보"
                            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-white bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95">
                            <Info size={12} /> 정보확인
                          </button>
                          <button
                            onClick={() => openHiddenManagerModal()}
                            title="숨김 처리된 상품 관리"
                            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-amber-700 bg-white border border-amber-300 hover:bg-amber-50 rounded-lg px-2 py-1.5 cursor-pointer transition shadow-sm active:scale-95">
                            <EyeOff size={12} /> 숨김 관리
                          </button>
                        </>
                      )}
                    </div>
                    {/* 판매수량 범위 필터 (모바일 최적화) */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap text-[11px]">
                      <span className="text-slate-500 font-black text-[11px] shrink-0">판매출고계</span>
                      <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
                        <input type="number" min={0} value={salesQtyMin}
                          onChange={e => setSalesQtyMin(e.target.value)} placeholder="최소"
                          className="flex-1 sm:w-20 min-w-0 px-2 py-1 border border-slate-200 rounded text-[12px] font-mono text-right focus:outline-none focus:border-orange-400" />
                        <span className="text-slate-400 shrink-0">~</span>
                        <input type="number" min={0} value={salesQtyMax}
                          onChange={e => setSalesQtyMax(e.target.value)} placeholder="최대"
                          className="flex-1 sm:w-20 min-w-0 px-2 py-1 border border-slate-200 rounded text-[12px] font-mono text-right focus:outline-none focus:border-orange-400" />
                        <span className="text-slate-400 shrink-0">개</span>
                      </div>
                      {(salesQtyMin || salesQtyMax) && (
                        <button onClick={() => { setSalesQtyMin(""); setSalesQtyMax(""); }}
                          className="text-[11px] font-black text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer shrink-0">
                          ✕ 초기화
                        </button>
                      )}
                    </div>
                  </>
                )}
                {/* 리스트 · 재고리스트 · 10개 넘으면 세로 스크롤 */}
                <div className="px-1 pt-1.5 pb-0.5 flex items-center gap-2 border-t border-slate-100">
                  <span className="text-[11px] font-black text-slate-600">{topTab === "sale" ? "재고리스트" : "매입리스트"}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ({topTab === "sale" ? filteredFlow.length : topProducts.length}건)
                  </span>
                </div>
                <div className="flex-1 overflow-auto -mx-1 max-h-[50vh]">
                  {topTab === "sale" ? (
                    filteredFlow.length === 0 ? (
                      <div className="text-center text-[11px] text-slate-300 py-6">
                        {loading
                          ? "불러오는 중..."
                          : stockFlow.length === 0
                            ? "재고 데이터 없음 (재고현황 xlsx 업로드 필요)"
                            : "선택한 판매수량 범위에 해당하는 상품 없음"}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full text-[10px] sm:text-xs sm:min-w-[540px]">
                        <thead className="sticky top-0 bg-white z-10">
                          {selectedFlowCodes.size > 0 && (
                            <tr className="bg-rose-50 border-b border-rose-200">
                              <td colSpan={10} className="px-2 py-1.5">
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="font-black text-rose-700">{selectedFlowCodes.size}개 선택됨</span>
                                  <button onClick={bulkHideFlow} disabled={flowBulkHiding}
                                    className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500 hover:bg-rose-600 text-white font-black shadow-sm disabled:opacity-50">
                                    {flowBulkHiding ? <LoaderIcon size={11} className="animate-spin" /> : <EyeOff size={11} />}
                                    선택 숨김
                                  </button>
                                  <button onClick={() => setSelectedFlowCodes(new Set())}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-black">
                                    <XIcon size={11} /> 해제
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                            {(() => {
                              const arrowFor = (key: SortKey) => {
                                if (flowSort !== key) return " ⇅";
                                return flowDir === "desc" ? " ▼" : " ▲";
                              };
                              return (
                                <>
                                  <th className="text-center px-0.5 py-1.5 w-6">
                                    <button onClick={() => {
                                      if (selectedFlowCodes.size === filteredFlow.length) setSelectedFlowCodes(new Set());
                                      else setSelectedFlowCodes(new Set(filteredFlow.map(r => String(r.product_code))));
                                    }} className="text-slate-400 hover:text-rose-500 transition inline-flex items-center justify-center" title="전체 선택/해제">
                                      {selectedFlowCodes.size === filteredFlow.length && filteredFlow.length > 0
                                        ? <CheckSquare size={13} className="text-rose-500" />
                                        : <Square size={13} />}
                                    </button>
                                  </th>
                                  <th className="text-left px-0.5 py-1.5 w-7">#</th>
                                  <th
                                    onClick={() => toggleFlowSort("name")}
                                    className={`text-left px-1 py-1.5 min-w-[100px] cursor-pointer select-none hover:bg-slate-50 transition ${flowSort === "name" ? "text-slate-800 font-black" : "text-slate-500"}`}
                                    title="클릭: 상품명 가나다순 정렬"
                                  >상품명{arrowFor("name")}</th>
                                  <th
                                    onClick={() => toggleFlowSort("opening")}
                                    className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none bg-slate-50/60 hover:bg-slate-100 transition ${flowSort === "opening" ? "text-slate-800 font-black" : "text-slate-500"}`}
                                    title="클릭: 시작재고 기준 정렬"
                                  >시작{arrowFor("opening")}</th>
                                  <th
                                    onClick={() => toggleFlowSort("purchase")}
                                    className={`text-right px-0.5 py-1.5 w-16 cursor-pointer select-none bg-emerald-50/60 hover:bg-emerald-100 transition ${flowSort === "purchase" ? "text-emerald-700 font-black" : "text-emerald-500"}`}
                                    title="클릭: 매입 기준 정렬 (재클릭 시 방향 반전) · 옆 (M/D)는 최근 매입일"
                                  >매입 <span className="text-[8px] font-normal text-slate-400">(M/D)</span>{arrowFor("purchase")}</th>
                                  <th
                                    onClick={() => toggleFlowSort("sale")}
                                    className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none bg-orange-50/60 hover:bg-orange-100 transition ${flowSort === "sale" ? "text-orange-700 font-black" : "text-orange-500"}`}
                                    title="클릭: 판매출고계 기준 정렬 · 실제 팔린 양"
                                  >판매{arrowFor("sale")}</th>
                                  <th
                                    onClick={() => toggleFlowSort("current")}
                                    className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "current" ? "text-amber-800 font-black" : "text-amber-600 font-black"}`}
                                    title="클릭: ERP 현재고 기준 정렬 · products.current_stock"
                                  >현재고{arrowFor("current")}</th>
                                  <th
                                    onClick={() => toggleFlowSort("loss")}
                                    className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none bg-rose-50/60 hover:bg-rose-100 transition ${flowSort === "loss" ? "text-rose-700 font-black" : "text-rose-500"}`}
                                    title="클릭: 손실 기준 정렬 (재클릭 시 방향 반전). 손실 = (시작재고 − 판매) − 종료재고"
                                  >손실{arrowFor("loss")}</th>
                                </>
                              );
                            })()}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredFlow.map((p, i) => {
                            const cur = Number((p as any).current_stock ?? 0);
                            const openV = Number(p.opening_stock ?? 0);
                            const saleV = Number(p.sale_qty ?? 0);
                            const purchV = Number(p.purchase_qty ?? 0);
                            const closeV = Number(p.closing_stock ?? 0);
                            const loss = (openV - saleV) - closeV;
                            return (
                            <tr key={`flow-${p.product_code}-${i}`} className={`transition ${selectedFlowCodes.has(String(p.product_code)) ? "bg-rose-50/50" : "hover:bg-orange-50/30"}`}>
                              <td className="text-center px-0.5 py-1.5 align-top" onClick={(e) => { e.stopPropagation(); toggleSelectFlow(String(p.product_code)); }}>
                                {selectedFlowCodes.has(String(p.product_code))
                                  ? <CheckSquare size={13} className="text-rose-500 inline cursor-pointer" />
                                  : <Square size={13} className="text-slate-300 hover:text-rose-500 inline cursor-pointer" />}
                              </td>
                              <td className="px-0.5 py-1.5 text-[10px] font-black text-orange-600 align-top">{i + 1}</td>
                              <td className="px-1 py-1.5 align-top">
                                <button
                                  type="button"
                                  onClick={() => loadFlowSelectedProduct(p)}
                                  className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition"
                                  title={`${p.product_name} · 클릭하면 오른쪽에 상세 정보 (모바일 · 모달)`}
                                >
                                  {p.product_name}
                                  {(p as any).min_order != null && (p as any).min_order > 0 && (
                                    <span className="inline-flex items-center ml-1 px-1 py-0.5 rounded text-[9px] font-black text-sky-700 bg-sky-100 border border-sky-300 align-middle" title={`최소주문량 ${(p as any).min_order}`}>
                                      최소{(p as any).min_order}
                                    </span>
                                  )}
                                </button>
                                {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal">{p.supplier}</div>}
                              </td>
                              <td className="text-right px-0.5 py-1.5 font-mono text-slate-500 text-[11px] bg-slate-50/40 align-top">{fmt(p.opening_stock)}</td>
                              <td className="text-right px-0.5 py-1.5 font-mono text-emerald-600 text-[11px] bg-emerald-50/40 align-top" title={p.last_purchase_date ? `최근 매입: ${p.last_purchase_date}` : "매입 이력 없음"}>
                                {fmt(p.purchase_qty)}
                                {(() => {
                                  const md = extractMonthDay(p.last_purchase_date);
                                  return md ? <span className="text-[9px] text-slate-400 font-normal ml-0.5">({md})</span> : null;
                                })()}
                              </td>
                              <td
                                className="text-right px-0.5 py-1.5 font-mono font-bold text-orange-700 text-[11px] bg-orange-50/40 align-top"
                                title="판매출고계 · 실제 팔린 양"
                              >{fmt(saleV)}</td>
                              {(() => {
                                const close = Number(p.closing_stock ?? 0);
                                const mismatch = close !== cur;
                                return (
                                  <td
                                    className={`text-right px-0.5 py-1.5 font-mono font-black text-[11px] bg-amber-50/40 align-top ${cur <= 0 ? "text-red-600" : mismatch ? "text-red-600" : "text-amber-700"}`}
                                    title={mismatch ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(close)}) · 스냅샷 이후 변동 있음` : "ERP 현재고 (= 스냅샷 종료재고)"}
                                  >{fmt(cur)}</td>
                                );
                              })()}
                              <td
                                className={`text-right px-0.5 py-1.5 font-mono text-[11px] bg-rose-50/40 align-top ${loss > 0 ? "text-rose-600 font-black" : loss < 0 ? "text-emerald-600 font-bold" : "text-slate-400"}`}
                                title={`손실 = (시작${fmt(openV)} − 판매${fmt(saleV)}) − 종료${fmt(closeV)} = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}${purchV > 0 ? `\n※ 입고 ${fmt(purchV)} 있음 (참고)` : ""}`}
                              >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    )
                  ) : (
                    topProducts.length === 0 ? (
                      <div className="text-center text-[11px] text-slate-300 py-6">
                        {loading ? "불러오는 중..." : "OCR 매입 데이터 없음"}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[280px]">
                        <thead className="sticky top-0 bg-white z-10">
                          <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                            <th className="text-left px-1 py-1.5 w-8">#</th>
                            <th className="text-left px-1 py-1.5">상품명</th>
                            <th className="text-right px-1 py-1.5 w-16">수량</th>
                            <th className="text-right px-1 py-1.5 w-24">금액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {topProducts.map((p, i) => (
                            <tr key={`top-${p.product_name}-${i}`} className="hover:bg-emerald-50/30 transition">
                              <td className="px-1 py-1.5 text-[10px] font-black text-emerald-600">{i + 1}</td>
                              <td className="px-1 py-1.5">
                                <div className="font-bold text-slate-700 truncate max-w-[220px]" title={p.product_name}>{p.product_name}</div>
                                {p.supplier && <div className="text-[9px] text-slate-400">{p.supplier}</div>}
                              </td>
                              <td className="text-right px-1 py-1.5 font-mono text-slate-600">{fmt(p.totalQty)}</td>
                              <td className="text-right px-1 py-1.5 font-mono font-bold text-slate-800">{fmtWon(p.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    )
                  )}
                </div>
                </div>
              </div>
              {/* 2026-07-16 · 좌측 재고리스트 wrapper close */}
              </div>

              {/* ─── 리사이즈 핸들 (데스크탑만) ─── */}
              <div
                onMouseDown={onFlowResizeStart}
                className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-slate-200 hover:bg-teal-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
                title="드래그하여 폭 조절"
              >
                <span className="text-[9px] text-slate-400 group-hover:text-white font-black rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
              </div>

              {/* ─── 우측: 제품 정보 · ProductDetailRightPanel (공용) ─── */}
              <ProductDetailRightPanel
                selected={flowSelectedProduct}
                onClose={() => setFlowSelectedProduct(null)}
                onProductUpdate={(u) => setFlowSelectedProduct(prev => prev ? { ...prev, ...u } : prev)}
                onRealMapUpdate={(v) => setFlowSelectedProduct(prev => prev ? { ...prev, real_map: v } : prev)}
                showChart={true}
                context="stock-manage"
                editable={true}
                emptyMessage="리스트에서 상품을 클릭하세요"
                emptySub="상세 정보 · 재고 현황 · 매입/판매가"
              />
            </div>
            )}
          </div>
        </>
      )}

      {/* ── 상품 매입 이력 모달 (2026-07-16 · 상품재고현황 매입 셀 클릭) ── */}
      {productPurchaseModal && (
        <ProductPurchaseHistoryModal
          productCode={productPurchaseModal.product_code}
          productName={productPurchaseModal.product_name}
          onClose={() => setProductPurchaseModal(null)}
        />
      )}

      {/* ── 공급사별 상품 상세 모달 (판매출고계 내림차순) ── */}
      {supplierModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
          onClick={() => { setSupplierModal(null); setSupplierModalRows(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-md">
                  <Building2 size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-slate-800 break-keep">{supplierModal.supplier}</span>
                    {supplierModal.code && (
                      <span className="text-[10px] font-mono text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                        #{supplierModal.code}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-orange-600">판매출고계</span>
                    <span>내림차순</span>
                    {flowSnapshot && <span className="font-mono text-slate-400">· {flowSnapshot}</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSupplierModal(null); setSupplierModalRows(null); }}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
                aria-label="닫기"
              >×</button>
            </div>

            {/* 검색 툴바 */}
            {!supplierModalLoading && supplierModalRows && supplierModalRows.length > 0 && (
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">조회수량</span>
                <select
                  value={modalQtyField}
                  onChange={(e) => setModalQtyField(e.target.value as ModalQtyKey)}
                  className="text-[10px] font-bold text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-sky-400"
                >
                  <option value="sale_qty">판매출고계</option>
                  <option value="purchase_qty">매입</option>
                  <option value="opening_stock">시작재고</option>
                  <option value="closing_stock">종료재고</option>
                  <option value="current_stock">현재고</option>
                  <option value="sale_price">판매가</option>
                </select>
                <input
                  type="number"
                  value={modalQtyMin}
                  onChange={(e) => setModalQtyMin(e.target.value)}
                  placeholder="최소"
                  className="w-20 text-[11px] font-mono border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-400"
                />
                <span className="text-[10px] text-slate-400">~</span>
                <input
                  type="number"
                  value={modalQtyMax}
                  onChange={(e) => setModalQtyMax(e.target.value)}
                  placeholder="최대"
                  className="w-20 text-[11px] font-mono border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-400"
                />
                {(modalQtyMin !== "" || modalQtyMax !== "") && (
                  <button
                    onClick={() => { setModalQtyMin(""); setModalQtyMax(""); }}
                    className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 cursor-pointer transition"
                  >초기화</button>
                )}
                <span className="ml-auto text-[10px] font-bold text-slate-500">
                  {modalDisplayRows.length} / {supplierModalRows.length}
                </span>
              </div>
            )}

            {/* 컨텐츠 (리스트, 세로 스크롤 하나만) */}
            <div className="flex-1 overflow-y-auto overflow-x-auto bg-white">
              {supplierModalLoading ? (
                <div className="text-center text-sm text-slate-400 py-16 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" />
                  불러오는 중...
                </div>
              ) : !supplierModalRows || supplierModalRows.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-16">이 공급사의 상품이 없습니다</div>
              ) : (
                <table className="w-full text-[10px] sm:text-xs sm:min-w-[500px]">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase tracking-wider">
                      {(() => {
                        const arr = (k: ModalSortKey) => modalSortKey !== k ? <span className="text-[8px] text-slate-300"> ⇅</span> : <span className="text-[9px]">{modalSortDir === "desc" ? " ▼" : " ▲"}</span>;
                        const thCls = (k: ModalSortKey, base: string, extra = "") =>
                          `px-0.5 py-1.5 cursor-pointer select-none hover:bg-slate-50 transition ${extra} ${modalSortKey === k ? "font-black text-slate-800" : base}`;
                        return (
                          <>
                            <th className="text-left px-0.5 py-1.5 w-7">#</th>
                            <th
                              onClick={() => toggleModalSort("product_name")}
                              className={`${thCls("product_name", "text-slate-500")} text-left relative`}
                            >
                              <span className="inline-flex items-center gap-0.5">상품명{arr("product_name")}</span>
                              <div
                                onMouseDown={onNameColResizeStart}
                                className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300/70 active:bg-indigo-400 transition"
                                title="드래그하여 상품명 컬럼 폭 조절"
                              />
                            </th>
                            <th onClick={() => toggleModalSort("opening_stock")} className={`${thCls("opening_stock", "text-slate-500", "bg-slate-50/40")} text-right w-12`}><span className="inline-flex items-center justify-end gap-0.5 w-full">시작{arr("opening_stock")}</span></th>
                            <th onClick={() => toggleModalSort("purchase_qty")} className={`${thCls("purchase_qty", "text-emerald-500", "bg-emerald-50/40")} text-right w-16`}><span className="inline-flex items-center justify-end gap-0.5 w-full">매입 <span className="text-[7px] font-normal text-slate-400">(M/D)</span>{arr("purchase_qty")}</span></th>
                            <th onClick={() => toggleModalSort("sale_qty")} className={`${thCls("sale_qty", "text-orange-500", "bg-orange-50/40")} text-right w-14`}><span className="inline-flex items-center justify-end gap-0.5 w-full">판매{arr("sale_qty")}</span></th>
                            <th onClick={() => toggleModalSort("current_stock")} className={`${thCls("current_stock", "text-amber-600 font-black", "bg-amber-50/40")} text-right w-12`}><span className="inline-flex items-center justify-end gap-0.5 w-full">현재고{arr("current_stock")}</span></th>
                            <th onClick={() => toggleModalSort("loss")} className={`${thCls("loss", "text-rose-500", "bg-rose-50/40")} text-right w-12`}><span className="inline-flex items-center justify-end gap-0.5 w-full">손실{arr("loss")}</span></th>
                            <th onClick={() => toggleModalSort("sale_price")} className={`${thCls("sale_price", "text-slate-500")} text-right w-14`}><span className="inline-flex items-center justify-end gap-0.5 w-full">판매가{arr("sale_price")}</span></th>
                          </>
                        );
                      })()}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {modalDisplayRows.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-[11px] text-slate-300 py-6">검색 조건에 맞는 상품 없음</td></tr>
                    ) : modalDisplayRows.map((p, i) => {
                      const cur = Number((p as any).current_stock ?? 0);
                      const openV = Number(p.opening_stock ?? 0);
                      const saleV = Number(p.sale_qty ?? 0);
                      const closeV = Number(p.closing_stock ?? 0);
                      const loss = (openV - saleV) - closeV;
                      return (
                        <tr
                          key={`sup-modal-${p.product_code}-${i}`}
                          className="hover:bg-orange-50/30 transition"
                        >
                          <td className="px-0.5 py-1.5 text-orange-600 font-black text-[10px] font-mono align-top">{i + 1}</td>
                          <td className="px-0.5 py-1.5 align-top" style={{ width: supplierModalNameWidth }}>
                            <button
                              type="button"
                              onClick={() => openScanProductModal(p)}
                              className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition w-full"
                              title={`${p.product_name} · 클릭하면 상세 정보`}
                            >{p.product_name}</button>
                          </td>
                          <td className="px-0.5 py-1.5 font-mono text-slate-500 text-[10px] text-right bg-slate-50/40 align-top">{fmt(p.opening_stock)}</td>
                          <td className="px-0.5 py-1.5 font-mono text-emerald-700 text-[10px] text-right bg-emerald-50/40 align-top" title={p.last_purchase_date ? `최근 매입: ${p.last_purchase_date}` : "매입 이력 없음"}>
                            {fmt(p.purchase_qty)}
                            {(() => {
                              const md = extractMonthDay(p.last_purchase_date);
                              return md ? <span className="text-[8px] text-slate-400 font-normal ml-0.5">({md})</span> : null;
                            })()}
                          </td>
                          <td className="px-0.5 py-1.5 font-mono font-black text-orange-700 text-[10px] text-right bg-orange-50/40 align-top">{fmt(p.sale_qty)}</td>
                          <td
                            className={`px-0.5 py-1.5 font-mono font-black text-[10px] text-right bg-amber-50/40 align-top ${cur <= 0 ? "text-red-600" : cur !== Number(p.closing_stock ?? 0) ? "text-red-600" : "text-amber-700"}`}
                            title={cur !== Number(p.closing_stock ?? 0) ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(p.closing_stock)}) · 스냅샷 이후 변동 있음` : "ERP 현재고 (= 스냅샷 종료재고)"}
                          >{fmt(cur)}</td>
                          <td
                            className={`px-0.5 py-1.5 font-mono text-[10px] text-right bg-rose-50/40 align-top ${loss > 0 ? "text-rose-600 font-black" : loss < 0 ? "text-emerald-600 font-bold" : "text-slate-400"}`}
                            title={`손실 = (시작${fmt(openV)} − 판매${fmt(saleV)}) − 종료${fmt(closeV)} = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}${Number(p.purchase_qty ?? 0) > 0 ? `\n※ 입고 ${fmt(Number(p.purchase_qty ?? 0))} 있음 (참고)` : ""}`}
                          >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                          <td className="px-0.5 py-1.5 font-mono text-slate-500 font-bold text-[10px] text-right align-top">{p.sale_price > 0 ? fmtWon(p.sale_price) : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">
                {supplierModalRows ? (
                  <>
                    <span className="text-slate-800">{modalDisplayRows.length}</span>
                    <span className="text-slate-400"> / {supplierModalRows.length}</span>
                    <span className="ml-1">품목</span>
                  </>
                ) : ""}
              </span>
              <button
                onClick={() => { setSupplierModal(null); setSupplierModalRows(null); }}
                className="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-4 py-1.5 cursor-pointer transition"
              >닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 상품 판매현황 대시보드 (products + stock_history + inventory_checks 통합) ── */}
      {infoModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
          onClick={() => { setInfoModal(null); setInfoModalData(null); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[98vh] sm:max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-md">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{infoModal.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span>#{infoModal.code}</span>
                    {infoModalData?.product?.supplier && (
                      <>· <span className="text-slate-600">{infoModalData.product.supplier}</span></>
                    )}
                    {infoModalData?.product?.spec && (
                      <>· <span className="text-slate-500">{infoModalData.product.spec}</span></>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setInfoModal(null); setInfoModalData(null); }}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
              >×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 bg-slate-50">
              {infoModalLoading ? (
                <div className="text-center text-sm text-slate-400 py-16 flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-sky-500 animate-spin" />
                  불러오는 중...
                </div>
              ) : !infoModalData ? (
                <div className="text-center text-sm text-slate-400 py-16">데이터 없음</div>
              ) : (() => {
                // ── 파생 지표 계산 ──
                const prod = infoModalData.product ?? {};
                const history = [...infoModalData.stock_history].sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
                const totalSale = history.reduce((s, r) => s + Number(r.sale_qty ?? 0), 0);
                const totalPurchase = history.reduce((s, r) => s + Number(r.purchase_qty ?? 0), 0);
                const totalDisposal = history.reduce((s, r) => s + Number(r.disposal_qty ?? 0), 0);
                const totalInternal = history.reduce((s, r) => s + Number(r.internal_qty ?? 0), 0);
                const totalAdjust = history.reduce((s, r) => s + Number(r.adjustment_qty ?? 0), 0);
                const latestSnap = history[history.length - 1];
                const oldestSnap = history[0];
                const currentStock = Number(prod.current_stock ?? latestSnap?.closing_stock ?? 0);
                const stockAmount = Number(latestSnap?.total_amount ?? prod.stock_amount ?? 0);
                const purchasePrice = Number(prod.purchase_price ?? 0);
                const salePrice = Number(prod.sale_price ?? 0);
                const profitRate = prod.profit_rate;
                const optimalStock = Number(prod.optimal_stock ?? 0);
                // 판매속도: 각 스냅샷(초순/중순/하순=10일)의 평균 판매수량 → 하루당
                const snapDays = 10; // 스냅샷당 기간(초순/중순/하순 = 10일)
                const avgSalePerDay = history.length > 0 ? totalSale / (history.length * snapDays) : 0;
                const daysRemaining = avgSalePerDay > 0 ? Math.floor(currentStock / avgSalePerDay) : null;
                // 회전율 (연환산 근사): 판매수량 합 / 기간 → 연간 배수
                const spanDays = history.length * snapDays;
                const avgStock = history.length > 0 ? history.reduce((s, r) => s + Number(r.closing_stock ?? 0), 0) / history.length : 0;
                const turnoverAnn = (avgStock > 0 && spanDays > 0) ? (totalSale / avgStock) * (365 / spanDays) : null;
                // 날짜 표시용 포맷터: ISO/타임스탬프/Excel 시리얼 어떤 형식이든 YYYY-MM-DD.
                const fmtDate = (v: any): string | null => {
                  if (v == null || v === "") return null;
                  const s = String(v).trim();
                  if (!s) return null;
                  // 이미 YYYY-MM-DD 형식
                  const m = /^(\d{4})[-.\/](\d{2})[-.\/](\d{2})/.exec(s);
                  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
                  // Excel 시리얼 넘버 (숫자 문자열, 20000~99999 범위) → 1900-01-01 기준
                  const n = Number(s);
                  if (Number.isFinite(n) && n > 20000 && n < 100000) {
                    // Excel의 1900 leap year 버그 보정: serial 60(1900-02-29)은 존재하지 않음
                    // 표준 공식: (serial - 25569) days since Unix epoch, 단 serial>=61인 경우 -1 보정
                    const adj = n >= 60 ? n - 1 : n;
                    const ms = (adj - 25568) * 86400 * 1000;
                    const d = new Date(ms);
                    if (!isNaN(d.getTime())) {
                      const yyyy = d.getUTCFullYear();
                      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
                      const dd = String(d.getUTCDate()).padStart(2, "0");
                      return `${yyyy}-${mm}-${dd}`;
                    }
                  }
                  const d = new Date(s);
                  if (isNaN(d.getTime())) return null;
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  return `${yyyy}-${mm}-${dd}`;
                };
                // 마지막 판매 D+
                const lastSaleISO = fmtDate(prod.last_sale_date);
                const daysSinceLastSale = lastSaleISO ? Math.floor((Date.now() - new Date(lastSaleISO).getTime()) / (1000 * 60 * 60 * 24)) : null;
                // 최근 매입일
                const lastPurchaseISO = fmtDate(prod.last_purchase_date);
                // 유통기한 D-
                const expIso = fmtDate(prod.expiry_date);
                const daysToExpiry = expIso ? Math.floor((new Date(expIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                // 재고 상태
                const stockStatus =
                  currentStock < 0 ? { label: "재고 마이너스", color: "text-red-700 bg-red-100 border-red-300" } :
                    currentStock === 0 ? { label: "품절", color: "text-red-700 bg-red-50 border-red-200" } :
                      (optimalStock > 0 && currentStock < optimalStock) ? { label: "적정재고 이하", color: "text-amber-700 bg-amber-50 border-amber-200" } :
                        daysSinceLastSale !== null && daysSinceLastSale >= 90 ? { label: "데드스톡 의심", color: "text-slate-600 bg-slate-100 border-slate-300" } :
                          { label: "정상", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
                // 실재고 vs 시스템
                const latestInv = infoModalData.inventory_checks[0];
                const invActual = latestInv ? (Number(latestInv.warehouse_stock ?? 0) + Number(latestInv.store_stock ?? 0)) : null;
                const invDiff = (latestInv && invActual !== null) ? invActual - currentStock : null;
                // 판매 트렌드 sparkline 값
                const salesTrend = history.map(r => Number(r.sale_qty ?? 0));
                const maxSale = Math.max(1, ...salesTrend);

                return (
                  <>
                    {/* 통합 대시보드 — 재고관리 핵심 정보만 */}
                    <>
                      {/* Hero 지표 카드 (핵심 4개) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
                          <div className="text-xs font-black text-indigo-500 uppercase tracking-wider">현재고</div>
                          <div className={`text-3xl font-black mt-1 font-mono ${currentStock < 0 ? "text-red-600" : "text-indigo-700"}`}>{fmt(currentStock)}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">
                            {optimalStock > 0 ? `적정 ${fmt(optimalStock)}` : "적정재고 없음"}
                          </div>
                        </div>
                        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
                          <div className="text-xs font-black text-orange-500 uppercase tracking-wider">일평균 판매</div>
                          <div className="text-3xl font-black text-orange-700 mt-1 font-mono">{avgSalePerDay.toFixed(1)}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">최근 {history.length}스냅샷 기준</div>
                        </div>
                        <div className={`bg-white border rounded-xl p-4 shadow-sm ${daysRemaining !== null && daysRemaining < 7 ? "border-red-300" : "border-emerald-200"}`}>
                          <div className={`text-xs font-black uppercase tracking-wider ${daysRemaining !== null && daysRemaining < 7 ? "text-red-500" : "text-emerald-500"}`}>재고 잔여일</div>
                          <div className={`text-3xl font-black mt-1 font-mono ${daysRemaining !== null && daysRemaining < 7 ? "text-red-700" : "text-emerald-700"}`}>
                            {daysRemaining !== null ? `${daysRemaining}일` : "-"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">
                            {daysRemaining !== null && daysRemaining < 7 ? "⚠ 발주 시급" : "여유"}
                          </div>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <div className="text-xs font-black text-slate-500 uppercase tracking-wider">재고금액</div>
                          <div className="text-xl font-black text-slate-800 mt-1">{fmtWon(stockAmount)}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">
                            {turnoverAnn !== null ? `회전 ${turnoverAnn.toFixed(1)}회/년` : "회전 -"}
                          </div>
                        </div>
                      </div>

                      {/* 상태 배지 (재고 관련 + 상품 상태) */}
                      <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-black border rounded-full px-3 py-1 ${stockStatus.color}`}>
                          {stockStatus.label}
                        </span>
                        {prod.sale_status && prod.sale_status !== "판매" && (
                          <span className="text-sm font-bold border rounded-full px-3 py-1 text-slate-700 bg-slate-200 border-slate-300">
                            {prod.sale_status}
                          </span>
                        )}
                        {daysToExpiry !== null && (
                          <span className={`text-sm font-bold border rounded-full px-3 py-1 ${daysToExpiry < 30 ? "text-red-700 bg-red-50 border-red-300" : daysToExpiry < 90 ? "text-amber-700 bg-amber-50 border-amber-300" : "text-slate-600 bg-slate-50 border-slate-200"}`}>
                            유통기한 {daysToExpiry >= 0 ? `D-${daysToExpiry}` : `초과 ${-daysToExpiry}일`}
                          </span>
                        )}
                        {daysSinceLastSale !== null && (
                          <span className={`text-sm font-bold border rounded-full px-3 py-1 ${daysSinceLastSale >= 90 ? "text-slate-600 bg-slate-100 border-slate-300" : daysSinceLastSale >= 30 ? "text-amber-600 bg-amber-50 border-amber-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}`}>
                            최근판매 D+{daysSinceLastSale}일
                          </span>
                        )}
                        {totalDisposal > 0 && (
                          <span className="text-sm font-bold border rounded-full px-3 py-1 text-rose-700 bg-rose-50 border-rose-200">
                            폐기 {fmt(totalDisposal)}개
                          </span>
                        )}
                        {Math.abs(totalAdjust) > 0 && (
                          <span className="text-sm font-bold border rounded-full px-3 py-1 text-purple-700 bg-purple-50 border-purple-200">
                            재고조정 {totalAdjust > 0 ? "+" : ""}{fmt(totalAdjust)}
                          </span>
                        )}
                      </div>

                      {/* 재고관리 핵심 정보 — 상품 위치 + 발주 판단 (ERP) */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-black uppercase tracking-wider text-sky-600 flex items-center gap-1.5">
                            <Package size={14} /> 상품 · 발주 정보
                          </div>
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-2 py-0.5">ERP</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">전산배치구역</span><span className="text-sm font-bold text-slate-800 break-keep">{prod.spec ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">공급처</span><span className="text-sm font-bold text-slate-800 truncate block">{prod.supplier ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">실제배치구역</span><span className="text-sm font-bold text-slate-800 truncate block">{prod.real_map ?? prod.display_location ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">판매상태</span><span className="text-sm font-bold text-slate-800">{prod.sale_status ?? "-"}</span></div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">적정재고</span>
                            {optimalEditCode === String(prod.product_code) ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={optimalEditValue}
                                  onChange={(e) => setOptimalEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); commitOptimalEdit(); }
                                    else if (e.key === "Escape") { e.preventDefault(); cancelOptimalEdit(); }
                                  }}
                                  disabled={optimalEditSaving}
                                  className="w-20 text-right font-mono text-base font-black border-2 border-indigo-400 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 bg-white"
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={commitOptimalEdit}
                                  disabled={optimalEditSaving}
                                  className="p-1.5 rounded bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition disabled:opacity-50 shadow-sm"
                                  title="저장 (Enter)"
                                >
                                  <Check size={14} strokeWidth={3} />
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={cancelOptimalEdit}
                                  className="p-1.5 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 active:scale-95 transition shadow-sm"
                                  title="취소 (Esc)"
                                >
                                  <XIcon size={14} strokeWidth={3} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startOptimalEdit(String(prod.product_code), optimalStock)}
                                className="inline-flex items-center gap-1.5 min-h-[36px] px-2 py-1 rounded-md border border-transparent hover:border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100 transition cursor-pointer"
                                title="탭하여 적정재고 편집"
                              >
                                <span className={`text-base font-mono font-black ${optimalStock > 0 ? "text-slate-700" : "text-slate-400"}`}>{optimalStock > 0 ? fmt(optimalStock) : "입력"}</span>
                                <Pencil size={12} className="text-indigo-500" />
                              </button>
                            )}
                          </div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최소발주</span><span className="text-base font-mono font-black text-sky-700">{prod.min_order ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">필요재고</span><span className="text-base font-mono font-black text-rose-600">{optimalStock > 0 && currentStock < optimalStock ? `+${fmt(optimalStock - currentStock)}` : "-"}</span></div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">유통기한</span>
                            <span className={`text-sm font-mono font-bold ${daysToExpiry !== null && daysToExpiry < 30 ? "text-red-600" : "text-slate-700"}`}>
                              {expIso ?? "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 매입일</span>
                            <span className="text-sm font-mono font-bold text-slate-700">{lastPurchaseISO ?? "-"}</span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 판매일</span>
                            <span className={`text-sm font-mono font-bold ${daysSinceLastSale !== null && daysSinceLastSale >= 90 ? "text-rose-600" : "text-slate-700"}`}>
                              {lastSaleISO ?? "-"}
                              {daysSinceLastSale !== null && lastSaleISO && <span className="text-[10px] font-semibold text-slate-500 ml-1">(D+{daysSinceLastSale})</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 매입/판매가 (재고 가치 계산용, ERP) */}
                      <div className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-black uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">💰 매입 · 판매가</div>
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-2 py-0.5">ERP</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">매입가</span><span className="text-base font-mono font-black text-slate-800">{purchasePrice > 0 ? fmtWon(purchasePrice) : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">판매가</span><span className="text-base font-mono font-black text-slate-800">{salePrice > 0 ? fmtWon(salePrice) : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">이익률</span><span className="text-base font-mono font-black text-emerald-700">{profitRate != null ? `${profitRate}%` : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">개당 이익</span><span className="text-base font-mono font-black text-emerald-700">{(salePrice > 0 && purchasePrice > 0) ? fmtWon(salePrice - purchasePrice) : "-"}</span></div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* 판매 트렌드 */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-black uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                              <TrendingUp size={14} /> 판매 트렌드
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-2 py-0.5 ml-1">ERP 스냅샷</span>
                            </div>
                            <span className="text-xs font-bold text-slate-600">총 {fmt(totalSale)}개</span>
                          </div>
                          {history.length === 0 ? (
                            <div className="text-sm text-slate-400 py-8 text-center">스냅샷 없음</div>
                          ) : (
                            <div className="flex items-end gap-1.5 h-32">
                              {history.map((r, i) => {
                                const v = Number(r.sale_qty ?? 0);
                                const h = (v / maxSale) * 100;
                                return (
                                  <div key={`bar-${i}`} className="flex-1 flex flex-col items-center gap-1" title={`${r.snapshot_date}: ${fmt(v)}개`}>
                                    <div className="text-[11px] font-mono text-orange-600 font-black">{v}</div>
                                    <div className="w-full bg-gradient-to-t from-orange-500 to-orange-300 rounded-t" style={{ height: `${h}%`, minHeight: "3px" }} />
                                    <div className="text-[10px] text-slate-500 font-mono">{String(r.snapshot_date).slice(5)}</div>
                                    {r.period_type && (
                                      <div className="text-[10px] text-slate-600 font-bold">
                                        {r.period_type === "early" ? "초순" : r.period_type === "mid" ? "중순" : r.period_type === "late" ? "하순" : r.period_type}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 재고/판매 요약 */}
                        <div className="bg-white rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                              <Package size={14} /> 누적 요약
                            </div>
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-full px-2 py-0.5">ERP 스냅샷</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 판매</span><span className="text-base font-mono font-black text-orange-700">{fmt(totalSale)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 매입</span><span className="text-base font-mono font-black text-emerald-700">{fmt(totalPurchase)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 폐기</span><span className={`text-base font-mono font-black ${totalDisposal > 0 ? "text-rose-700" : "text-slate-500"}`}>{fmt(totalDisposal)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">사내소비</span><span className="text-base font-mono font-black text-slate-700">{fmt(totalInternal)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">평균 종료재고</span><span className="text-base font-mono font-bold text-slate-700">{avgStock.toFixed(1)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">스냅샷 수</span><span className="text-base font-mono font-bold text-slate-700">{history.length}회</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최초 스냅샷</span><span className="text-sm font-mono text-slate-600">{oldestSnap?.snapshot_date ?? "-"}</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 스냅샷</span><span className="text-sm font-mono text-slate-600">{latestSnap?.snapshot_date ?? "-"}</span></div>
                          </div>
                        </div>
                      </div>

                      {/* 실재고 vs 시스템재고 */}
                      {latestInv && (
                        <div className="bg-white rounded-xl border border-violet-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-black uppercase tracking-wider text-violet-600 flex items-center gap-1.5">
                              🔍 실재고 vs 시스템재고 <span className="text-xs text-slate-400 font-semibold normal-case tracking-normal">(최근 스캔)</span>
                            </div>
                            <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-300 rounded-full px-2 py-0.5">바코드 실측</span>
                          </div>
                          <div className="grid grid-cols-4 gap-3 text-center">
                            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3">
                              <div className="text-xs font-semibold text-cyan-500">창고</div>
                              <div className="text-2xl font-black text-cyan-700 font-mono mt-1">{latestInv.warehouse_stock != null ? fmt(Number(latestInv.warehouse_stock)) : "-"}</div>
                            </div>
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                              <div className="text-xs font-semibold text-violet-500">매장</div>
                              <div className="text-2xl font-black text-violet-700 font-mono mt-1">{latestInv.store_stock != null ? fmt(Number(latestInv.store_stock)) : "-"}</div>
                            </div>
                            <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
                              <div className="text-xs font-semibold text-slate-500">실재고 합</div>
                              <div className="text-2xl font-black text-slate-700 font-mono mt-1">{invActual !== null ? fmt(invActual) : "-"}</div>
                            </div>
                            <div className={`border rounded-lg p-3 ${invDiff !== null && invDiff !== 0 ? "bg-rose-50 border-rose-300" : "bg-emerald-50 border-emerald-300"}`}>
                              <div className={`text-xs font-semibold ${invDiff !== null && invDiff !== 0 ? "text-rose-500" : "text-emerald-500"}`}>차이 (실-시스)</div>
                              <div className={`text-2xl font-black font-mono mt-1 ${invDiff !== null && invDiff !== 0 ? "text-rose-700" : "text-emerald-700"}`}>{invDiff !== null ? (invDiff > 0 ? `+${fmt(invDiff)}` : fmt(invDiff)) : "-"}</div>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 text-center mt-3">
                            시스템 재고 <span className="font-bold text-slate-700">{fmt(currentStock)}</span> · 스캔 {latestInv.checked_at ? new Date(latestInv.checked_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"} · {latestInv.checked_by ?? "익명"}
                          </div>
                        </div>
                      )}

                      {/* 스냅샷 원본 표 (접힘) · 모바일에서 세로 스크롤 · 컴팩트 */}
                      <details className="bg-white rounded-xl border border-slate-200">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase tracking-wider text-slate-600 select-none hover:bg-slate-50 transition">
                          📊 스냅샷 원본 데이터 <span className="text-xs text-slate-400 font-semibold normal-case tracking-normal">({history.length}회)</span>
                        </summary>
                        <div className="overflow-auto px-2 sm:px-4 pb-4 max-h-[240px] sm:max-h-[360px]">
                          <table className="w-full text-[11px] sm:text-[12px] min-w-[520px]">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                <th className="text-left px-2 py-1.5">스냅샷일</th>
                                <th className="text-left px-2 py-1.5">기간</th>
                                <th className="text-right px-2 py-1.5">시작</th>
                                <th className="text-right px-2 py-1.5 text-emerald-600">매입</th>
                                <th className="text-right px-2 py-1.5 text-orange-600">판매</th>
                                <th className="text-right px-2 py-1.5 text-rose-500">폐기</th>
                                <th className="text-right px-2 py-1.5 text-purple-500">조정</th>
                                <th className="text-right px-2 py-1.5">종료</th>
                                <th className="text-right px-2 py-1.5">재고금액</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {[...history].reverse().map((s, i) => (
                                <tr key={`sh-${s.snapshot_date}-${i}`} className="hover:bg-slate-50">
                                  <td className="px-2 py-1 font-mono text-[11px] text-slate-700">{s.snapshot_date}</td>
                                  <td className="px-2 py-1.5 text-xs text-slate-600 font-semibold">{s.period_type === "early" ? "초순" : s.period_type === "mid" ? "중순" : s.period_type === "late" ? "하순" : (s.period_type ?? "-")}</td>
                                  <td className="text-right px-2 py-1 font-mono text-[11px] text-slate-600">{fmt(Number(s.opening_stock ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 font-mono font-bold text-sm text-emerald-700">{fmt(Number(s.purchase_qty ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 font-mono font-black text-sm text-orange-700">{fmt(Number(s.sale_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 font-mono text-[11px] ${Number(s.disposal_qty ?? 0) > 0 ? "text-rose-600 font-bold" : "text-slate-400"}`}>{fmt(Number(s.disposal_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 font-mono text-[11px] ${Math.abs(Number(s.adjustment_qty ?? 0)) > 0 ? "text-purple-600 font-bold" : "text-slate-400"}`}>{fmt(Number(s.adjustment_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 font-mono text-[11px] ${Number(s.closing_stock ?? 0) < 0 ? "text-red-600 font-bold" : "text-slate-700"}`}>{fmt(Number(s.closing_stock ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-xs text-slate-600">{fmtWon(Number(s.total_amount ?? 0))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>

                      {/* 실재고 이력 원본 */}
                      {infoModalData.inventory_checks.length > 0 && (
                        <details className="bg-white rounded-xl border border-slate-200">
                          <summary className="cursor-pointer px-4 py-3 text-sm font-black uppercase tracking-wider text-violet-600 select-none hover:bg-slate-50 transition">
                            🔍 실재고 스캔 이력 <span className="text-xs text-slate-400 font-semibold normal-case tracking-normal">({infoModalData.inventory_checks.length}회)</span>
                          </summary>
                          <div className="overflow-x-auto px-4 pb-4">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                  <th className="text-left px-2 py-1.5">체크일시</th>
                                  <th className="text-right px-2 py-1.5 text-cyan-500">창고</th>
                                  <th className="text-right px-2 py-1.5 text-violet-500">매장</th>
                                  <th className="text-right px-2 py-1.5">시스템</th>
                                  <th className="text-left px-2 py-1.5">담당</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {infoModalData.inventory_checks.map((c, i) => (
                                  <tr key={`ic-${c.id ?? i}`} className="hover:bg-slate-50">
                                    <td className="px-2 py-1.5 text-xs font-mono text-slate-700">
                                      {c.checked_at ? new Date(c.checked_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                                    </td>
                                    <td className="text-right px-2 py-1.5 font-mono font-bold text-sm text-cyan-700">{c.warehouse_stock != null ? fmt(Number(c.warehouse_stock)) : "-"}</td>
                                    <td className="text-right px-2 py-1.5 font-mono font-bold text-sm text-violet-700">{c.store_stock != null ? fmt(Number(c.store_stock)) : "-"}</td>
                                    <td className="text-right px-2 py-1 font-mono text-[11px] text-slate-600">{c.system_stock != null ? fmt(Number(c.system_stock)) : "-"}</td>
                                    <td className="px-2 py-1.5 text-xs text-slate-700 truncate max-w-[120px]">{c.checked_by ?? "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </>
                  </>
                );
              })()}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-end">
              <button
                onClick={() => { setInfoModal(null); setInfoModalData(null); }}
                className="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-4 py-1.5 cursor-pointer transition"
              >닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 바코드 스캔과 동일한 상품 확인 모달 (적정재고이하 클릭 시) ── */}
      {/* 2026-07-15 · 사이즈 축소 · 화면 중앙 정렬 */}
      {scanProductModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
          onClick={() => setScanProductModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-md">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 truncate">{scanProductModal.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">#{scanProductModal.code}</div>
                </div>
              </div>
              <button
                onClick={() => setScanProductModal(null)}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
              >×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-slate-50">
              <ProductInfoCard
                product={scanProductModal}
                context="stock-manage"
                editable
                onRealMapUpdate={(newValue) => {
                  setScanProductModal(prev => prev ? { ...prev, real_map: newValue } : prev);
                }}
                onProductUpdate={(updates) => {
                  setScanProductModal(prev => prev ? { ...prev, ...updates } : prev);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 숨김 항목 관리 모달 ── */}
      {hiddenModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
          onClick={() => setHiddenModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                  <EyeOff size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-base font-black text-slate-800">숨김 항목 관리</div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-0.5">
                    숨김 처리된 상품 · 검색·발주 리스트에서 노출되지 않음
                  </div>
                </div>
              </div>
              <button
                onClick={() => setHiddenModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-3xl leading-none font-black w-9 h-9 rounded-lg hover:bg-white/70 transition cursor-pointer flex items-center justify-center shrink-0"
              >×</button>
            </div>
            <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-white">
              <span className="text-[11px] font-bold text-slate-500">
                총 <span className="text-amber-700 font-black">{hiddenList.length}</span>개 숨김
              </span>
              <button
                onClick={loadHiddenList}
                disabled={hiddenLoading}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded-lg px-2 py-1 cursor-pointer transition"
              >
                {hiddenLoading ? "..." : "새로고침"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50">
              {hiddenLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                  <LoaderIcon size={14} className="animate-spin mr-2" />
                  불러오는 중...
                </div>
              ) : hiddenList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <EyeOff size={28} className="opacity-40" />
                  <div className="text-sm font-bold">숨김 처리된 상품이 없습니다</div>
                  <div className="text-[11px]">정보확인 창에서 "숨기기"로 항목 추가 가능</div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 bg-white">
                  {hiddenList.map((p) => {
                    const code = String(p.product_code ?? "");
                    const busy = hiddenUnhideBusyCode === code;
                    return (
                      <li key={`hidden-${code}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-slate-800 truncate" title={p.product_name}>{p.product_name}</div>
                          <div className="text-[10px] font-mono text-slate-400 truncate">
                            #{code}
                            {p.supplier ? ` · ${p.supplier}` : ""}
                            {p.real_map ? ` · ${p.real_map}` : ""}
                            {p.current_stock != null ? ` · 재고 ${p.current_stock}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => unhideProduct(code)}
                          disabled={busy}
                          className="shrink-0 flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-white border border-emerald-300 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-wait rounded-lg px-2.5 py-1.5 cursor-pointer transition"
                          title="숨김 해제 · 다시 검색·발주 리스트에 표시"
                        >
                          {busy ? <LoaderIcon size={11} className="animate-spin" /> : <Eye size={11} />}
                          다시 표시
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagePage;
