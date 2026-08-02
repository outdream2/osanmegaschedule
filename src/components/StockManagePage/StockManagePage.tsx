// src/components/StockManagePage/StockManagePage.tsx
// 재고관리 페이지 — 상품관리 탭의 sub-tab (level 9 전용)
// 좌측: ERP 현재고 + 수량 차이 추이 차트
// 우측: 공급사별 매입 · Top 100 · 적정재고 이하

import React, { useCallback, useEffect, useMemo, useRef, useState, lazy } from "react";
// 2026-07-28 · 카테고리별판매·손실추적 · 판매추이 페이지에서 이동 · lazy 로드
const CategoryTabLazy = lazy(() => import("../SalesTrendPage/SalesTrendPage").then(m => ({ default: m.CategoryTab })));
// 2026-07-29 · LossTrackerTabLazy 제거 · 손실추적 탭이 실재고차이로 통합됨 (사용자 요청)
import { Search, Package, TrendingUp, AlertTriangle, Building2, Info, EyeOff, Eye, Loader2 as LoaderIcon, Pencil, Check, X as XIcon, CheckSquare, Square, Boxes, Activity, Layers, FileText, LineChart, PieChart, ChevronRight, ChevronDown, PackageCheck } from "lucide-react";
import { ReturnListPanel } from "../OrderManagePage/ReturnListPanel";
import { LowStockPanel } from "./LowStockPanel";
import { ProductInfoCard } from "../ScanPage/ProductInfoCard";
import { ProductDetailRightPanel } from "../common/ProductDetailPanel";
import { PurchaseHistoryModal } from "../common/PurchaseHistoryModal";
import { VendorCategoryBadge } from "../common/VendorCategoryBadge";
import { VendorDetailModal } from "../LandingPage/VendorListEditor";
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
  // 2026-07-28 · 사용자 요청 · 판매가·사입가·이익률 컬럼 추가
  sale_price?: number;
  purchase_price?: number;
}
// 2026-07-28 · 사용자 요청 · 모든 컬럼 정렬 가능하게 확장
type SortKey = "name" | "opening" | "sale" | "purchase" | "amount" | "closing" | "current" | "loss"
  | "turnover" | "doh" | "cycle" | "last_purchase" | "min_order" | "last_purchase_price"
  | "stock_value" | "sale_price" | "profit_rate" | "turnover_3m";
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
      <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
          스냅샷 날짜
          <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-2 py-1.5 border border-slate-200 rounded-md text-[11px] tabular-nums focus:outline-none focus:border-slate-400 bg-white">
            {dates.length === 0 && <option value="">(데이터 없음)</option>}
            {dates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <input
          type="text"
          value={rawSearch}
          onChange={e => setRawSearch(e.target.value)}
          placeholder="상품명·공급사·코드 검색..."
          className="flex-1 min-w-[200px] px-3 py-1.5 text-[11px] border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
        />
        <span className="text-[11px] text-slate-400">
          {rawLoading ? "불러오는 중..." : `${filtered.length}건 / 전체 ${rows.length}건`}
        </span>
        {sortKey && (
          <button onClick={() => { setSortKey(null); }}
            className="text-[10px] font-medium text-slate-400 hover:text-rose-500 px-2 py-1 rounded-md hover:bg-rose-50 transition border border-slate-200">
            정렬 해제
          </button>
        )}
        <button onClick={() => setColWidths(Object.fromEntries(RAW_COLS.map(c => [c.key, c.width])))}
          className="text-[10px] font-medium text-slate-400 hover:text-slate-600 px-2 py-1 rounded-md hover:bg-slate-50 transition border border-slate-200">
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
          <thead className="sticky top-0 bg-slate-50 z-10 text-slate-500">
            <tr>
              {RAW_COLS.map(c => {
                const active = sortKey === c.key;
                return (
                  <th key={c.key}
                    onClick={() => handleHeaderClick(c.key)}
                    className={`relative px-2 py-2 border-r border-slate-200 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 transition text-[10px] font-medium tracking-wider ${c.align === "right" ? "text-right" : "text-left"
                      } ${active ? "text-slate-800 font-semibold" : ""}`}
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
              <tr key={`raw-${r.snapshot_date}-${r.product_code}-${i}`} className="hover:bg-slate-50/60">
                {RAW_COLS.map(c => {
                  const v = r[c.key];
                  const isNumeric = c.numeric;
                  const extraCls = c.cellClass ? c.cellClass(r) : "";
                  return (
                    <td key={c.key}
                      className={`px-2 py-1 border-r border-slate-100 truncate ${isNumeric ? "text-right tabular-nums" : ""
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
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <Package size={13} className="text-slate-400" />
          <span className="text-[12px] font-semibold text-slate-600">상품관리</span>
          <span className="text-[10px] tabular-nums text-slate-400">
            ({loading ? <><LoaderIcon size={10} className="inline animate-spin mr-1" />로딩...</> : `${filtered.length.toLocaleString()} / ${allProducts.length.toLocaleString()}개`})
          </span>
          <div className="relative min-w-[160px] flex-1 max-w-sm">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="상품명 · 코드 · 공급사 검색"
              className="w-full pl-8 pr-6 py-1.5 border border-slate-200 rounded-md text-[11px] focus:outline-none focus:border-slate-400 bg-white"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 hover:text-slate-600 cursor-pointer">✕</button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="cursor-pointer" />
            <EyeOff size={10} className={showHidden ? "text-slate-600" : "text-slate-400"} />
            숨김 포함
          </label>
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">상품명 클릭 → 상세 정보 · 판매가 · 재고 상황</p>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[10px] sm:text-xs sm:min-w-[540px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-slate-100 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              <th className="text-left px-1 py-2 w-7">#</th>
              {([
                { k: "name" as const, label: "상품명", w: "text-left", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "" },
                { k: "code" as const, label: "코드", w: "w-24 text-left", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "" },
                { k: "supplier" as const, label: "공급사", w: "w-24 text-left", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "" },
                { k: "current" as const, label: "현재고", w: "w-16 text-right", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "bg-slate-50/40" },
                { k: "optimal" as const, label: "적정", w: "w-14 text-right", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "bg-slate-50/40" },
                { k: "price" as const, label: "판매가", w: "w-20 text-right", activeColor: "text-slate-700 font-semibold", inactiveColor: "text-slate-400", bg: "" },
              ]).map(col => (
                <th key={col.k} onClick={() => handleSort(col.k)}
                  className={`px-1 py-2 ${col.w} cursor-pointer select-none hover:bg-slate-50 transition ${col.bg} ${sortKey === col.k ? col.activeColor : col.inactiveColor}`}>
                  {col.label}{arrow(col.k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-6">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                    <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-300">{search ? "검색 결과 없음" : "상품 데이터 없음"}</span>
                )}
              </td></tr>
            ) : filtered.slice(0, 500).map((p, i) => (
              <tr key={String(p.product_code ?? p.code ?? i)}
                onClick={() => onProductClick(p)}
                className="hover:bg-slate-50/60 transition cursor-pointer">
                <td className="px-1 py-2 text-slate-400 font-medium text-[10px] align-top">{i + 1}</td>
                <td className="px-1 py-2 align-top">
                  <button type="button" className="text-left text-[12px] font-medium text-slate-700 hover:text-slate-900 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition">
                    {p.product_name ?? p.name ?? "-"}
                  </button>
                  {p.hidden === true && <span className="ml-1 text-[9px] text-slate-500 font-medium">숨김</span>}
                  {p.supplier && <div className="text-[9px] text-slate-400 break-words whitespace-normal mt-0.5">{p.supplier}</div>}
                </td>
                <td className="px-1 py-2 tabular-nums text-slate-400 text-[10px] align-top">{p.product_code ?? p.code ?? "-"}</td>
                <td className="px-1 py-2 text-slate-400 text-[10px] break-words whitespace-normal leading-tight align-top">{p.supplier ?? "-"}</td>
                <td className="px-1 py-2 text-right tabular-nums font-medium text-slate-700 bg-slate-50/40 align-top">{p.current_stock != null ? p.current_stock.toLocaleString() : "-"}</td>
                <td className="px-1 py-2 text-right tabular-nums text-slate-500 bg-slate-50/40 align-top">{p.optimal_stock != null ? p.optimal_stock.toLocaleString() : "-"}</td>
                <td className="px-1 py-2 text-right tabular-nums text-slate-600 align-top">{p.sale_price != null && p.sale_price > 0 ? `₩${p.sale_price.toLocaleString()}` : "-"}</td>
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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[90vh] md:h-auto md:min-h-[70vh] md:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={20} className="text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-slate-800 break-words leading-tight">{productName}</div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                코드 <span className="font-black">{productCode}</span>
                <span className="ml-2 text-slate-400">· 매입 이력 조회</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 ml-2 transition"><XIcon size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
              <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
            </div>
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
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-emerald-800 opacity-70 uppercase">총 매입 건수</div>
                  <div className="text-lg font-semibold text-emerald-800 tabular-nums">{rows.length.toLocaleString()}건</div>
                </div>
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-indigo-800 opacity-70 uppercase">총 매입 수량</div>
                  <div className="text-lg font-semibold text-indigo-800 tabular-nums">{totalQty.toLocaleString()}</div>
                </div>
                <div className="bg-violet-50/70 border border-violet-200 rounded-lg px-3 py-2">
                  <div className="text-[11px] font-semibold text-violet-800 opacity-70 uppercase">총 매입 금액</div>
                  <div className="text-lg font-semibold text-violet-800 tabular-nums">{totalAmount.toLocaleString()}<span className="text-xs ml-0.5">원</span></div>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mb-1 flex items-center gap-2">
                <span className="font-black">공급사 종류:</span>
                <span className="tabular-nums text-slate-700">{uniqueSuppliers}개 사</span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-auto max-h-[50vh]">
                <table className="w-full text-xs min-w-[520px]">
                  <thead className="sticky top-0 bg-slate-50 border-b-2 border-slate-200 z-10 shadow-sm text-slate-500 text-[11px] uppercase tracking-wider">
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
                      <tr key={r.id ?? i} className="hover:bg-slate-50/60 transition-all duration-150 align-top">
                        <td className="px-2 py-1 tabular-nums text-slate-500 whitespace-nowrap">{String(r.purchase_date).slice(5)}</td>
                        <td className="px-2 py-1 text-slate-700 break-words leading-tight font-semibold">{r.supplier_name ?? "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums text-slate-700">{r.quantity != null ? Number(r.quantity).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums text-slate-600">{r.unit_price != null ? Number(r.unit_price).toLocaleString() : "-"}</td>
                        <td className="text-right px-2 py-1 tabular-nums font-black text-emerald-700 whitespace-nowrap">{r.total != null ? Number(r.total).toLocaleString() : r.amount != null ? Number(r.amount).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                <span className="font-black text-slate-500">데이터 소스:</span> purchase_details · 매입상세 xlsx 임포트에서 저장된 이력
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// TrendingTab · 판매 급상승 상품 (2026-07-29)
//   최근 window일 판매 vs 이전 window일 판매 비교
//   신규 진입 (prior=0, recent>0) 상단 · 성장률 desc
// ═══════════════════════════════════════════════════════════════════════
interface TrendingRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  absolute_delta: number;
  newly_trending: boolean;
  current_stock: number;
  optimal_stock: number;
  sale_price: number;
  below_optimal: boolean;
}
// ───────────────────────────────────────────────────────────────────────
// 급상승 버킷 타입 정의 (월별 / 순별 공용)
// ───────────────────────────────────────────────────────────────────────
interface PeriodBucketRow {
  product_code: string;
  product_name: string;
  supplier: string | null;
  recent_sale: number;
  prior_sale: number;
  growth_rate: number | null;
  absolute_delta: number;
  newly_trending: boolean;
  current_stock: number;
}
interface PeriodBucket {
  label: string;          // "2026-07"
  sublabel: string;       // "7/1 ~ 7/31"
  vsLabel: string;        // "vs 2026-06"
  from: string;           // "2026-07-01"
  to: string;             // "2026-07-31"
  prior_from: string;     // "2026-06-01"
  prior_to: string;       // "2026-06-30"
  rows: PeriodBucketRow[];
  total: number;
  loading: boolean;
  error: boolean;
}

// 날짜 헬퍼
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-based
}
// 월별 버킷 생성 (최근 6개월)
function buildMonthlyBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  const buckets: Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] = [];
  for (let i = 0; i < 6; i++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1; // 1-based
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = lastDayOfMonth(y, m);
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    // 이전 월
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const prior_from = `${py}-${String(pm).padStart(2, "0")}-01`;
    const priorLast = lastDayOfMonth(py, pm);
    const prior_to = `${py}-${String(pm).padStart(2, "0")}-${String(priorLast).padStart(2, "0")}`;
    const mLabel = `${y}-${String(m).padStart(2, "0")}`;
    const pmLabel = `${py}-${String(pm).padStart(2, "0")}`;
    buckets.push({
      label: mLabel,
      sublabel: `${m}/1 ~ ${m}/${lastDay}`,
      vsLabel: `vs ${pmLabel}`,
      from,
      to,
      prior_from,
      prior_to,
    });
  }
  return buckets;
}
// 순별 버킷 생성 (최근 2개월 · 6순)
function buildDecadalBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  type Decade = { year: number; month: number; decade: 1 | 2 | 3 };
  const decades: Decade[] = [];
  // 현재 월 3순 + 이전 월 3순 = 6순
  for (let mi = 0; mi < 2; mi++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - mi, 1);
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1;
    for (const d of [3, 2, 1] as const) {
      decades.push({ year: y, month: m, decade: d });
    }
  }
  const decadeLabel = (d: 1 | 2 | 3) => d === 1 ? "초순" : d === 2 ? "중순" : "하순";
  const decadeRange = (y: number, m: number, d: 1 | 2 | 3): { from: string; to: string } => {
    const mm = String(m).padStart(2, "0");
    if (d === 1) return { from: `${y}-${mm}-01`, to: `${y}-${mm}-10` };
    if (d === 2) return { from: `${y}-${mm}-11`, to: `${y}-${mm}-20` };
    const last = lastDayOfMonth(y, m);
    return { from: `${y}-${mm}-21`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
  };
  // 이전 순 계산
  const prevDecade = (d: Decade): Decade => {
    if (d.decade === 1) {
      // 이전 월 하순
      const prev = new Date(d.year, d.month - 2, 1);
      return { year: prev.getFullYear(), month: prev.getMonth() + 1, decade: 3 };
    }
    return { year: d.year, month: d.month, decade: (d.decade - 1) as 1 | 2 | 3 };
  };
  return decades.map(d => {
    const cur = decadeRange(d.year, d.month, d.decade);
    const prev = prevDecade(d);
    const pr = decadeRange(prev.year, prev.month, prev.decade);
    const pmLabel = `${prev.year}-${String(prev.month).padStart(2, "0")}`;
    return {
      label: `${d.month}월 ${decadeLabel(d.decade)}`,
      sublabel: `${d.month}/${cur.from.slice(8)} ~ ${d.month}/${cur.to.slice(8)}`,
      vsLabel: `vs ${prev.month}월 ${decadeLabel(prev.decade)} (${pmLabel})`,
      from: cur.from,
      to: cur.to,
      prior_from: pr.from,
      prior_to: pr.to,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────
// PeriodBucketCard · 단일 버킷 카드
// ───────────────────────────────────────────────────────────────────────
const PeriodBucketCard: React.FC<{
  bucket: PeriodBucket;
  onProductClick?: (p: any) => void;
}> = ({ bucket, onProductClick }) => {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* 카드 헤더 */}
      <div className="px-4 py-3 bg-indigo-50/50 border-b border-indigo-100 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-800">{bucket.label}</span>
            <span className="text-[11px] text-slate-500">({bucket.sublabel})</span>
            {!bucket.loading && !bucket.error && (
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded-full px-2 py-0.5 tabular-nums">
                {bucket.total}건
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{bucket.vsLabel}</div>
        </div>
      </div>
      {/* 카드 바디 */}
      {bucket.loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
          <div className="w-5 h-5 border-2 border-indigo-100 border-t-indigo-400 rounded-full animate-spin" />
          <span className="text-[11px]">불러오는 중...</span>
        </div>
      ) : bucket.error ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-rose-400 gap-1.5">
          <AlertTriangle size={14} />
          <span>데이터 로드 실패</span>
        </div>
      ) : bucket.rows.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-slate-400 gap-1.5">
          <TrendingUp size={14} className="opacity-30" />
          <span>급상승 상품 없음</span>
        </div>
      ) : (
        <ol className="divide-y divide-slate-50">
          {bucket.rows.map((r, i) => (
            <li key={r.product_code}
              className="flex items-start gap-2 px-4 py-2.5 hover:bg-indigo-50/20 transition">
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onProductClick?.({ product_code: r.product_code, product_name: r.product_name, supplier: r.supplier })}
                    className="text-[12px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline text-left break-words cursor-pointer transition"
                  >
                    {r.product_name}
                  </button>
                  {r.newly_trending && (
                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 shrink-0">신규</span>
                  )}
                </div>
                {r.supplier && <div className="text-[10px] text-slate-400 mt-0.5">{r.supplier}</div>}
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] tabular-nums">
                  <span className="font-semibold text-indigo-700">현재 {fmt(r.recent_sale)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">이전 {fmt(r.prior_sale)}</span>
                  <span className="text-slate-300">·</span>
                  <span className={`font-bold ${r.newly_trending ? "text-indigo-600" : (r.growth_rate ?? 0) > 0 ? "text-indigo-600" : "text-slate-400"}`}>
                    {r.newly_trending ? "NEW" : r.growth_rate != null ? `+${r.growth_rate}%` : "-"}
                  </span>
                  {r.current_stock > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">재고 {fmt(r.current_stock)}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────
// PeriodTrendingSection · 월별 or 순별 섹션 (버킷 그리드)
// ───────────────────────────────────────────────────────────────────────
const PeriodTrendingSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  buckets: PeriodBucket[];
  onProductClick?: (p: any) => void;
}> = ({ title, icon, buckets, onProductClick }) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-indigo-500 shrink-0">{icon}</span>
        <span className="text-[13px] font-bold text-slate-700">{title}</span>
        <div className="flex-1 h-px bg-indigo-100" />
      </div>
      {/* 버킷 그리드 · 모바일 1열 · lg 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {buckets.map((b, i) => (
          <PeriodBucketCard key={i} bucket={b} onProductClick={onProductClick} />
        ))}
      </div>
    </div>
  );
};

const TrendingTab: React.FC<{ onProductClick?: (p: any) => void }> = ({ onProductClick }) => {
  const [rows, setRows] = useState<TrendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [windowDays, setWindowDays] = useState<7 | 14 | 30 | 60 | 90>(30);
  const [sortKey, setSortKey] = useState<"growth" | "delta" | "recent" | "shortage">("growth");
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [meta, setMeta] = useState<{ recent_from: string; prior_from: string; total: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stock-manage/trending?window=${windowDays}&limit=1000`)
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(j => {
        setRows(Array.isArray(j.rows) ? j.rows : []);
        setMeta({ recent_from: j.recent_from ?? "", prior_from: j.prior_from ?? "", total: Number(j.total ?? 0) });
      })
      .catch(() => { setRows([]); setMeta(null); })
      .finally(() => setLoading(false));
  }, [windowDays]);

  const displayed = useMemo(() => {
    let arr = onlyShortage ? rows.filter(r => r.below_optimal) : rows;
    arr = [...arr].sort((a, b) => {
      if (sortKey === "growth") {
        if (a.newly_trending !== b.newly_trending) return a.newly_trending ? -1 : 1;
        return (b.growth_rate ?? -999999) - (a.growth_rate ?? -999999);
      }
      if (sortKey === "delta") return b.absolute_delta - a.absolute_delta;
      if (sortKey === "recent") return b.recent_sale - a.recent_sale;
      if (sortKey === "shortage") return (b.optimal_stock - b.current_stock) - (a.optimal_stock - a.current_stock);
      return 0;
    });
    return arr;
  }, [rows, sortKey, onlyShortage]);

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="flex flex-col gap-2">
      {/* ── 카드: 헤더 툴바 + 컨트롤 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* h-12 툴바 */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-indigo-100 bg-indigo-50/40 shrink-0">
          <TrendingUp size={14} className="text-indigo-500 shrink-0" />
          <span className="text-[13px] font-semibold text-slate-800">판매 급상승</span>
          {meta && (
            <span className="text-[11px] font-medium text-indigo-700 bg-indigo-100 rounded-full px-2 py-0.5 tabular-nums">
              {fmt(meta.total)}건
            </span>
          )}
          <span className="text-[11px] text-slate-400 hidden sm:block">
            {meta ? `최근 ${windowDays}일 (${meta.recent_from} ~) vs 이전 ${windowDays}일 비교` : `최근 ${windowDays}일 vs 이전 기간 판매 비교 · 신규진입 상단`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetch(`/api/stock-manage/trending?window=${windowDays}&limit=1000`)
                  .then(r => r.ok ? r.json() : { rows: [] })
                  .then(j => {
                    setRows(Array.isArray(j.rows) ? j.rows : []);
                    setMeta({ recent_from: j.recent_from ?? "", prior_from: j.prior_from ?? "", total: Number(j.total ?? 0) });
                  })
                  .catch(() => { setRows([]); setMeta(null); })
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 text-slate-400 hover:text-indigo-500 transition disabled:opacity-40 cursor-pointer"
              title="새로고침"
            >
              <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {/* 컨트롤 행 */}
        <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap border-b border-slate-100 bg-white">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">비교기간</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            {([7, 14, 30, 60, 90] as const).map(w => (
              <button key={w} onClick={() => setWindowDays(w)}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${windowDays === w ? "bg-indigo-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {w}일
              </button>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">정렬</span>
          <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
            {([
              { k: "growth" as const, label: "성장률" },
              { k: "delta" as const, label: "증가량" },
              { k: "recent" as const, label: "최근판매" },
              { k: "shortage" as const, label: "재고부족" },
            ]).map(o => (
              <button key={o.k} onClick={() => setSortKey(o.k)}
                className={`h-7 px-2.5 text-[11px] font-semibold rounded transition cursor-pointer ${sortKey === o.k ? "bg-indigo-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {o.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer ml-auto">
            <input type="checkbox" checked={onlyShortage} onChange={e => setOnlyShortage(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-500" />
            재고 부족만
          </label>
        </div>
      </div>

      {/* ── 테이블 카드 ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-400">
            <div className="w-9 h-9 border-4 border-indigo-100 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-[12px] font-semibold">불러오는 중...</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2 text-slate-400">
            <TrendingUp size={28} className="opacity-20" />
            <div className="text-[12px] font-semibold">{onlyShortage ? "재고 부족인 급상승 상품 없음" : "급상승 상품 없음"}</div>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10">
                {/* 컬럼 그룹 헤더 */}
                <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th colSpan={2} className="bg-slate-50 text-slate-400 text-left px-3 py-1.5">기본정보</th>
                  <th colSpan={2} className="bg-indigo-50 text-indigo-600 text-center px-3 py-1.5">판매량 비교</th>
                  <th colSpan={2} className="bg-indigo-100 text-indigo-700 text-center px-3 py-1.5">성장 지표</th>
                  <th colSpan={2} className="bg-slate-50 text-slate-400 text-center px-3 py-1.5">재고현황</th>
                </tr>
                {/* 서브헤더 */}
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-white">
                  <th className="text-center px-2 py-1.5 w-9">#</th>
                  <th className="text-left px-2 py-1.5 min-w-[200px]">상품명</th>
                  <th className="text-right px-2 py-1.5 w-16 bg-indigo-50/50 text-indigo-600">최근{windowDays}일</th>
                  <th className="text-right px-2 py-1.5 w-16 bg-indigo-50/30 text-indigo-500">이전{windowDays}일</th>
                  <th className="text-right px-2 py-1.5 w-16 bg-indigo-100/60 text-indigo-700">성장률</th>
                  <th className="text-right px-2 py-1.5 w-16 bg-indigo-50/60 text-indigo-600">증가량</th>
                  <th className="text-right px-2 py-1.5 w-14 text-slate-500">현재고</th>
                  <th className="text-right px-2 py-1.5 w-14 text-slate-400">적정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayed.map((r, i) => (
                  <tr key={r.product_code} className={`hover:bg-indigo-50/20 transition ${r.newly_trending ? "bg-indigo-50/10" : ""}`}>
                    <td className="text-center px-2 py-2 text-[11px] font-medium text-slate-400 tabular-nums align-top">{i + 1}</td>
                    <td className="text-left px-2 py-2 align-top">
                      <button onClick={() => onProductClick?.({ product_code: r.product_code, product_name: r.product_name, supplier: r.supplier })}
                        className="text-left text-[12px] font-semibold text-slate-700 hover:text-indigo-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition">
                        {r.product_name}
                      </button>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {r.supplier && <span className="text-[10px] text-slate-400">{r.supplier}</span>}
                        {r.newly_trending && (
                          <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5">신규진입</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right px-2 py-2 text-[12px] font-semibold text-indigo-700 tabular-nums align-top bg-indigo-50/30">{fmt(r.recent_sale)}</td>
                    <td className="text-right px-2 py-2 text-[12px] font-medium text-slate-400 tabular-nums align-top bg-indigo-50/10">{fmt(r.prior_sale)}</td>
                    <td className={`text-right px-2 py-2 text-[12px] font-bold tabular-nums align-top bg-indigo-50/40 ${r.newly_trending ? "text-indigo-600" :
                      (r.growth_rate ?? 0) >= 50 ? "text-indigo-700" :
                        (r.growth_rate ?? 0) > 0 ? "text-indigo-600" :
                          "text-slate-400"
                      }`}>
                      {r.newly_trending ? "NEW" : r.growth_rate != null ? `${r.growth_rate > 0 ? "+" : ""}${r.growth_rate}%` : "-"}
                    </td>
                    <td className={`text-right px-2 py-2 text-[12px] font-semibold tabular-nums align-top bg-indigo-50/20 ${r.absolute_delta > 0 ? "text-indigo-600" : r.absolute_delta < 0 ? "text-rose-500" : "text-slate-400"}`}>
                      {r.absolute_delta > 0 ? `+${fmt(r.absolute_delta)}` : fmt(r.absolute_delta)}
                    </td>
                    <td className={`text-right px-2 py-2 text-[12px] font-semibold tabular-nums align-top ${r.below_optimal ? "text-rose-500" : "text-slate-600"}`}
                      title={r.below_optimal ? `현재고 부족 · ${r.current_stock} < 적정 ${r.optimal_stock}` : ""}>
                      {fmt(r.current_stock)}
                    </td>
                    <td className="text-right px-2 py-2 text-[12px] font-medium text-slate-400 tabular-nums align-top">{r.optimal_stock > 0 ? fmt(r.optimal_stock) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

// 2026-07-29 · Phase 1 · module-level cache · 페이지 이동해도 유지 (5분)
const GLOBAL_STOCK_FLOW_CACHE = new Map<string, { data: any; ts: number }>();

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
  // 2026-07-29 · 사용자 요청 · 재고리스트 기본 전체 (Top 100 → 전체)
  // 2026-07-31 · 사용자 · "상품현황리스트 로딩시 너무 긴데" · 초기값 50000 (전체) → 300 축소
  //   상단 Top N 옵션(100/300/1000/2000/전체)에서 사용자가 필요 시 확대
  const [flowLimit, setFlowLimit] = useState<number>(300);
  // 재고흐름 리스트 · 상품명/코드 검색 (필터)
  const [flowSearch, setFlowSearch] = useState<string>("");
  // 재고흐름 리스트 · 벌크 숨김 · 판매추이와 동일 패턴
  const [selectedFlowCodes, setSelectedFlowCodes] = useState<Set<string>>(new Set());
  // 2026-07-29 · 사용자 요청 · 재고리스트 컬럼 3그룹 접기/펼치기 (기본 재고현황만 노출)
  type FlowGroup = "stock" | "purchase" | "sales";
  const [flowGroupCollapsed, setFlowGroupCollapsed] = useState<Set<FlowGroup>>(new Set(["purchase", "sales"]));
  const toggleFlowGroup = (g: FlowGroup) => {
    setFlowGroupCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g); else n.add(g);
      return n;
    });
  };
  const isFlowGroupCollapsed = (g: FlowGroup) => flowGroupCollapsed.has(g);
  // 2026-07-30 · low/diff GroupCollapsed · 아래에서 typed 로 선언 (중복 제거)
  const [flowBulkHiding, setFlowBulkHiding] = useState(false);
  const toggleSelectFlow = (code: string) => setSelectedFlowCodes(prev => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });
  const bulkHideFlow = async () => {
    if (selectedFlowCodes.size === 0) return;
    // 2026-07-29 · 사용자 지적 버그 fix · 로컬만 필터하고 DB PATCH 를 안 해서 리로드 시 다시 나오던 문제
    //   각 상품 PATCH { hidden: true } 병렬 호출 후 · 리스트에서 제외 · 다른 페이지 리스트도 갱신 이벤트
    setFlowBulkHiding(true);
    try {
      const codes: string[] = Array.from(selectedFlowCodes);
      await Promise.all(codes.map(code =>
        fetch(`/api/products/${encodeURIComponent(code)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden: true }),
        }).catch(() => { /* 개별 실패 무시 · 나머지 진행 */ })
      ));
      setStockFlow(prev => prev.filter(r => !selectedFlowCodes.has(String(r.product_code))));
      setSelectedFlowCodes(new Set());
      try { window.dispatchEvent(new CustomEvent("products-hidden-changed")); } catch { /* ignore */ }
    } finally {
      setFlowBulkHiding(false);
    }
  };
  // 기간 aggregation: 0=단일 스냅샷 · N=최근 N개월 aggregation
  // 2026-07-29 · 사용자 요청 · 기본 조회기간 1개월 (Phase 1 로딩 속도 개선)
  const [flowMonths, setFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  // 기간 선택 · 확인 버튼 누르기 전 임시 값 (자동 fetch 방지)
  const [pendingFlowMonths, setPendingFlowMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  // 2026-07-16 · 재고리스트 계절 필터 (봄/여름/가을/겨울) · 지정 시 flowMonths/snapshot 무시 · 년도 무관 · 해당 월 전체
  const [flowSeason, setFlowSeason] = useState<SeasonKey | null>(null);
  // 2026-07-16 · 좌우 split 레이아웃 · 좌측 리스트 폭 (localStorage 저장)
  const [flowPanelWidth, setFlowPanelWidth] = useState<number>(() => {
    // 2026-07-30 (2nd) · 사용자 요청 · 기본 좌우 6:4 · window.innerWidth 기준
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_flow_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
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
  const [supplierCardCollapsed, setSupplierCardCollapsed] = useState(false);
  const [stockDiffCollapsed, setStockDiffCollapsed] = useState(false);
  const [flowCollapsedTop, setFlowCollapsedTop] = useState(false);
  // ── 그룹 헤더 클릭 접기 · supplier/low/diff 탭 ─────────────────────────
  // 2026-08-03 · 재고현황(sky)/매입현황(amber)/판매현황(rose) 3그룹으로 재편
  type SupplierGroup = "stock" | "purchase" | "sale";
  const [supplierGroupCollapsed, setSupplierGroupCollapsed] = useState<Set<SupplierGroup>>(new Set());
  const toggleSupplierGroup = (g: SupplierGroup) => setSupplierGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isSupplierGroupCollapsed = (g: SupplierGroup) => supplierGroupCollapsed.has(g);

  type DiffGroup = "basic" | "erp" | "actual" | "diff";
  const [diffGroupCollapsed, setDiffGroupCollapsed] = useState<Set<DiffGroup>>(new Set());
  const toggleDiffGroup = (g: DiffGroup) => setDiffGroupCollapsed(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  const isDiffGroupCollapsed = (g: DiffGroup) => diffGroupCollapsed.has(g);

  // ── 탭별 좌우 split 레이아웃 state (2026-07-16) ──────────────────────────
  // supplier 탭
  const [supplierPanelWidth, setSupplierPanelWidth] = useState<number>(() => {
    // 2026-07-30 (2nd) · 사용자 요청 · 기본 좌우 6:4
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_supplier_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
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

  // 2026-07-29 · 사용자 요청 · 매입상세 탭 삭제 · purchase state/callback 제거
  // low 탭 state → LowStockPanel.tsx 로 이동됨 (2026-07-31)

  // diff 탭
  const [diffPanelWidth, setDiffPanelWidth] = useState<number>(() => {
    // 2026-07-30 (2nd) · 사용자 요청 · 기본 좌우 6:4
    const defaultW = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.6) : 800;
    try { const v = Number(localStorage.getItem("megatown_stockmanage_diff_w")); return Number.isFinite(v) && v > 0 ? v : defaultW; } catch { return defaultW; }
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
  // 2026-07-29 · 사용자 요청 · 손실추적 → 실재고차이(diff) 로 통합 · "loss" 타입 제거
  const [stockTab, setStockTab] = useState<"flow" | "supplier" | "low" | "return" | "diff" | "category" | "trending">("flow");
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
  // 2026-07-30 · diff 탭 · 실재고 vs ERP 차이 리스트 (미리 계산 · JSX 내 IIFE 없애기 위해)
  const diffList = useMemo(() => lowStock
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
    .filter(Boolean) as Array<any>, [lowStock]);
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
    purchaseQty: number; purchaseAmount: number; saleQty: number; saleAmount?: number;
    itemCount: number; totalStockAmount: number;
  };
  const [xlsxSuppliers, setXlsxSuppliers] = useState<SupplierAgg[]>([]);
  // 2026-07-30 · 공급사 분류 맵 · 아래 useMemo forward-reference 방지 위해 여기서 선언
  const [vendorCategoryMap, setVendorCategoryMap] = useState<Record<string, string | null>>({});
  // 2026-07-28 · 사용자 요청 · 공급사 리스트 정렬 (재고자산 · 판매량 · 판매액 · 매입 · 상품수 · 공급사명)
  type SupListSortKey = "totalStockAmount" | "saleQty" | "saleAmount" | "purchaseQty" | "itemCount" | "supplier";
  const [supListSort, setSupListSort] = useState<{ key: SupListSortKey; dir: "asc" | "desc" }>({ key: "totalStockAmount", dir: "desc" });
  const toggleSupListSort = (k: SupListSortKey) => {
    setSupListSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "supplier" ? "asc" : "desc" });
  };
  const sortedXlsxSuppliers = useMemo(() => {
    const { key, dir } = supListSort;
    const mult = dir === "asc" ? 1 : -1;
    return [...xlsxSuppliers].sort((a, b) => {
      if (key === "supplier") return mult * String(a.supplier ?? "").localeCompare(String(b.supplier ?? ""), "ko");
      return mult * (Number(a[key] ?? 0) - Number(b[key] ?? 0));
    });
  }, [xlsxSuppliers, supListSort]);
  // 2026-07-28 · 사용자 요청 · Top N 필터 (기본 전체)
  const [supListLimit, setSupListLimit] = useState<number>(999999);
  // 2026-07-31 · 사용자 확정 · 분류 5개 · 전체·위탁·선결제·60일회전·90일회전·기타
  const [supListCategory, setSupListCategory] = useState<"전체" | "위탁" | "선결제" | "60일회전" | "90일회전" | "기타">("전체");
  const displayedXlsxSuppliers = useMemo(() => {
    const filtered = supListCategory === "전체"
      ? sortedXlsxSuppliers
      : sortedXlsxSuppliers.filter(sup => {
          const nm = String(sup.supplier ?? "").trim();
          const cat = vendorCategoryMap[nm] ?? null;
          return cat === supListCategory;
        });
    return filtered.slice(0, supListLimit);
  }, [sortedXlsxSuppliers, supListLimit, supListCategory, vendorCategoryMap]);
  // 2026-07-23 · 공급사별 최신 잔고 (supplier_balances 최신값) — 우측 패널 재고자산 앞 표시
  const [supplierBalanceMap, setSupplierBalanceMap] = useState<Record<string, { balance: number; invoice_date: string | null }>>({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/supplier-balances");
        if (!res.ok) return;
        const j = await res.json();
        const rows: any[] = Array.isArray(j?.balances) ? j.balances : [];
        const map: Record<string, { balance: number; invoice_date: string | null }> = {};
        for (const r of rows) {
          const name = String(r.supplier_name ?? "").trim();
          if (!name) continue;
          if (!(name in map)) map[name] = { balance: Number(r.balance ?? 0), invoice_date: r.invoice_date ?? null };
        }
        setSupplierBalanceMap(map);
      } catch { /* ignore */ }
    })();
  }, []);
  // 2026-07-30 · 공급사 분류 맵 · 위쪽 forward-reference 방지 위해 이미 선언됨 · 여기 중복 제거
  const [supplierDetailModal, setSupplierDetailModal] = useState<any | null>(null);
  const openSupplierDetailModal = useCallback(async (supplierName: string) => {
    if (!supplierName) return;
    const name = supplierName.trim();
    try {
      const res = await fetch("/api/vendors?withBalances=1");
      if (!res.ok) { alert(`공급사 정보 조회 실패 (${res.status})`); return; }
      const list: any[] = await res.json();
      const exact = list.find(v => String(v.company_name ?? "").trim() === name);
      if (exact) { setSupplierDetailModal(exact); return; }
      const stripped = name.replace(/\s*\(.*?\)\s*/g, "").trim();
      const strippedMatch = stripped ? list.find(v => {
        const vn = String(v.company_name ?? "").trim();
        return vn === stripped || vn.includes(stripped);
      }) : undefined;
      if (strippedMatch) { setSupplierDetailModal(strippedMatch); return; }
      const partial = list.find(v => {
        const vn = String(v.company_name ?? "").trim();
        return vn && (vn.includes(name) || name.includes(vn));
      });
      if (partial) { setSupplierDetailModal(partial); return; }
      alert(`공급사 정보 없음: ${supplierName}`);
    } catch (e: any) {
      alert(`공급사 정보 조회 실패: ${e?.message ?? "네트워크 오류"}`);
    }
  }, []);
  // 2026-07-30 · 사용자 요청 · 분류 저장 시 리스트 반영 · vendors-changed 이벤트 listen
  useEffect(() => {
    const loadVendorMap = async () => {
      try {
        const res = await fetch("/api/vendors?withBalances=1");
        if (!res.ok) return;
        const list: Array<{ company_name: string; category: string | null }> = await res.json();
        const map: Record<string, string | null> = {};
        for (const v of list) {
          const name = String(v.company_name ?? "").trim();
          if (name) map[name] = v.category ?? null;
        }
        setVendorCategoryMap(map);
      } catch { /* ignore */ }
    };
    loadVendorMap();
    const handler = () => loadVendorMap();
    window.addEventListener("vendors-changed", handler);
    return () => window.removeEventListener("vendors-changed", handler);
  }, []);
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
  // 우측 패널 단순 상품 리스트 정렬 (공급사 클릭 후 나오는 #·상품명·현재고·매입주기·최근매입일·매입수량·매입단가·판매량·판매금액·재고금액)
  // 기본: 재고금액 내림차순 (total_amount)
  // 2026-08-03 · 매입단가(purchase_price)·판매량(sale_qty)·판매금액(sale_amount) 정렬 추가
  type SupDetailSortKey = "name" | "current" | "cycle" | "purchase_date" | "purchase_qty" | "min_order" | "total_amount" | "purchase_price" | "sale_qty" | "sale_amount";
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
      else if (key === "purchase_price") { va = Number(a.purchase_price ?? 0); vb = Number(b.purchase_price ?? 0); }
      else if (key === "sale_qty") { va = Number(a.sale_qty ?? 0); vb = Number(b.sale_qty ?? 0); }
      // sale_amount: API total_amount = 판매금액 · total_amount key: 재고금액(current_stock * purchase_price)
      else if (key === "sale_amount") { va = Number(a.total_amount ?? 0); vb = Number(b.total_amount ?? 0); }
      else {
        // total_amount key = 재고금액 (current_stock × purchase_price)
        const stockA = Number(a.current_stock ?? 0) * Number(a.purchase_price ?? 0);
        const stockB = Number(b.current_stock ?? 0) * Number(b.purchase_price ?? 0);
        va = stockA; vb = stockB;
      }
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
  //   TTL 5분 (2026-07-29 · Phase 1 · 60초 → 5분 · SWR 패턴 · 서버 캐시 10분과 병행)
  //   module-level 로 상향 · 다른 탭 갔다와도 유지 (컴포넌트 unmount 시 캐시 유지)
  const stockFlowCacheRef = useRef<Map<string, { data: any; ts: number }>>(GLOBAL_STOCK_FLOW_CACHE);
  const STOCK_FLOW_CACHE_TTL = 5 * 60 * 1000;
  // 재고 흐름 조회 · 2026-07-29 · Phase 2 Lazy Loading (사용자 요청)
  //   1단계 · skip_purchase=1 로 즉시 응답 (purchase_details 조인 SKIP · 빠름)
  //   2단계 · purchase-info-batch 로 매입 정보 병렬 조회 · rows 에 병합 · 재렌더
  const fetchStockFlow = useCallback(async () => {
    setLoading(true);
    try {
      const serverSort = (["sale", "purchase", "amount", "closing"] as SortKey[]).includes(flowSort) ? flowSort : "sale";
      const params = new URLSearchParams({ sort: serverSort, dir: flowDir, limit: String(flowLimit) });
      if (flowSeason) params.set("season", flowSeason);
      else if (flowMonths > 0) params.set("months", String(flowMonths));
      else if (flowSnapshot) params.set("snapshot_date", flowSnapshot);
      const cacheKey = params.toString();

      // 캐시 hit → 즉시 표시 (SWR · 백그라운드 갱신)
      const cached = stockFlowCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.ts < STOCK_FLOW_CACHE_TTL) {
        const d = cached.data;
        setStockFlow(Array.isArray(d.rows) ? d.rows : []);
        setAvailableSnapshots(Array.isArray(d.dates) ? d.dates : []);
        setFlowPeriodType(d.period_type ?? null);
      }

      // 1단계 · skip_purchase=1 로 basic 데이터 즉시 fetch
      const basicParams = new URLSearchParams(params);
      basicParams.set("skip_purchase", "1");
      const res = await fetch(`/api/stock-manage/top-sales?${basicParams}`);
      if (res.ok) {
        const data = await res.json();
        setStockFlow(Array.isArray(data.rows) ? data.rows : []);
        setAvailableSnapshots(Array.isArray(data.dates) ? data.dates : []);
        setFlowPeriodType(data.period_type ?? null);
        if (Array.isArray(data.dates_with_period)) {
          const map: Record<string, string | null> = {};
          for (const d of data.dates_with_period) map[d.snapshot_date] = d.period_type ?? null;
          setSnapshotPeriods(map);
        }
        if (flowMonths === 0 && !flowSnapshotAutoSet.current && data.snapshot_date) {
          flowSnapshotAutoSet.current = true;
          if (!flowSnapshot) setFlowSnapshot(data.snapshot_date);
        }
        // 1단계 완료 즉시 loading 해제 · 사용자에게 표시
        setLoading(false);

        // 2단계 · purchase 정보 병렬 fetch · 백그라운드
        const rows: any[] = Array.isArray(data.rows) ? data.rows : [];
        const codes = rows.map(r => String(r.product_code ?? "")).filter(Boolean);
        if (codes.length > 0) {
          try {
            // codes 를 여러 chunk 로 나눠 병렬 fetch (URL 길이 제한 회피)
            const URL_CHUNK = 200;
            const fetchPromises: Promise<Record<string, any>>[] = [];
            for (let i = 0; i < codes.length; i += URL_CHUNK) {
              const chunk = codes.slice(i, i + URL_CHUNK);
              fetchPromises.push(
                fetch(`/api/stock-manage/purchase-info-batch?codes=${encodeURIComponent(chunk.join(","))}`)
                  .then(r => r.ok ? r.json() : { items: {} })
                  .then(j => j.items ?? {})
                  .catch(() => ({}))
              );
            }
            const results = await Promise.all(fetchPromises);
            const merged: Record<string, any> = {};
            for (const items of results) Object.assign(merged, items);
            // rows 에 병합 · setState 로 재렌더
            const enrichedRows = rows.map(r => {
              const info = merged[String(r.product_code ?? "")];
              return info ? { ...r, ...info } : r;
            });
            const fullData = { ...data, rows: enrichedRows };
            stockFlowCacheRef.current.set(cacheKey, { data: fullData, ts: Date.now() });
            setStockFlow(enrichedRows);
          } catch { /* ignore · basic 데이터는 이미 표시됨 */ }
        } else {
          stockFlowCacheRef.current.set(cacheKey, { data, ts: Date.now() });
        }
      } else {
        setLoading(false);
      }
    } catch { setLoading(false); }
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

  // 2026-07-20: 탭 전환 시 각 리스트의 기간·검색 필터 초기화 (프레시 시작)
  //   재고흐름/공급사재고 state 는 StockManagePage 스코프라 탭 스위치 시 유지되던 문제 해결
  useEffect(() => {
    setFlowMonths(0);
    setFlowSeason(null);
    setPendingFlowMonths(0);
    setFlowSearch("");
    setSalesQtyMin("");
    setSalesQtyMax("");
    setSupplierMonths(0);
    setSupplierSeason(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stockTab]);

  // xlsx 기반 공급사별 매입 집계 · 기간 파라미터 지원 (2026-07-16)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 2026-07-28 · 정확성 위주 · 전체 받아옴 · client Top N 필터로 slice (사용자 요청)
        const params = new URLSearchParams({ limit: "50000" });
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
    // 2026-07-28 · 사용자 요청 · 추가 컬럼 정렬 지원
    // 각 필드 · 서버 응답 스키마 기반 · 정렬 값 추출
    const periodDaysLocal = (flowMonths && flowMonths > 0) ? flowMonths * 30 : 30;
    const getVal = (p: any): number | string => {
      const openV = Number(p.opening_stock ?? 0);
      const cur = Number(p.current_stock ?? p.closing_stock ?? 0);
      const saleV = Number(p.sale_qty ?? 0);
      const purP = Number(p.purchase_price ?? 0);
      const saleP = Number(p.sale_price ?? 0);
      switch (flowSort) {
        case "turnover": {
          const avgStock = (openV + cur) / 2;
          return avgStock > 0 ? saleV / avgStock : 0;
        }
        case "doh": {
          const avgStock = (openV + cur) / 2;
          const turnover = avgStock > 0 ? saleV / avgStock : 0;
          return turnover > 0 ? periodDaysLocal / turnover : 999999;
        }
        case "cycle": {
          const cnt = Number(p.purchase_count ?? 0);
          const first = p.first_purchase_date;
          const last = p.last_purchase_date;
          if (cnt < 2 || !first || !last || first === last) return 999999;
          const days = Math.round((new Date(last).getTime() - new Date(first).getTime()) / (86400 * 1000));
          return cnt > 1 ? Math.round(days / (cnt - 1)) : 999999;
        }
        case "last_purchase":
          return String(p.last_purchase_date ?? "");
        case "min_order":
          return Number(p.min_order ?? 0);
        case "last_purchase_price":
          return purP;
        case "stock_value":
          return cur * purP;
        case "sale_price":
          return saleP;
        case "profit_rate":
          return saleP > 0 && purP > 0 ? ((saleP - purP) / saleP) * 100 : -999999;
        case "turnover_3m":
          // 사용자 요청 · 매입주기 회전율 (sale_qty_cycle) 로 대체
          return Number(p.sale_qty_cycle ?? 0);
        default:
          return 0;
      }
    };
    const clientKeys: SortKey[] = ["turnover", "doh", "cycle", "last_purchase", "min_order", "last_purchase_price", "stock_value", "sale_price", "profit_rate", "turnover_3m"];
    if (clientKeys.includes(flowSort as SortKey)) {
      return [...filtered].sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (typeof va === "string" && typeof vb === "string") return sign * va.localeCompare(vb);
        return sign * ((va as number) - (vb as number));
      });
    }
    return filtered;
  }, [stockFlow, salesQtyMin, salesQtyMax, flowSort, flowDir, flowSearch, flowMonths]);

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
    <div className="flex-1 flex flex-col max-w-[1360px] mx-auto w-full px-4 sm:px-6 py-3 sm:py-5 gap-3 sm:gap-5">
      {/* 2026-07-29 · 사용자 요청 · 상단 검색 블록 제거 · 리스트 안으로 이동 */}

      {pageTab === "raw" ? <RawDataView /> : (
        <>

          {/* 2026-07-30 · 서브탭 리디자인 · 사용자 요청 "밋밋 개선 · 세련 · 폰트 확대"
              - 각 탭 고유 색상 accent · 활성 시 bg tint + colored underline · 아이콘 컬러 채움
              - 폰트 확대 · text-[14-15px] · 아이콘 15-16px · gap·padding 여유
              - 배경 · rounded-t-lg · 활성 시 미묘한 tint · 비활성 hover 도 tint */}
          <div className="flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-x-0 sm:gap-1 border-b-2 border-slate-200 sm:overflow-x-auto sm:scrollbar-none px-1 pt-1">
            {(() => {
              type TabDef = { k: "flow" | "supplier" | "low" | "return" | "diff" | "category" | "trending"; label: string; icon: any; color: "teal" | "sky" | "rose" | "violet" | "amber" | "indigo" | "emerald"; badge?: number };
              const tabs: TabDef[] = [
                { k: "trending", label: "급상승", icon: TrendingUp, color: "indigo" },
                { k: "category", label: "카테고리별현황", icon: PieChart, color: "amber" },
                { k: "flow", label: "상품현황", icon: Activity, color: "teal" },
                { k: "supplier", label: "공급사", icon: Building2, color: "sky" },
                { k: "low", label: "적정재고↓", icon: AlertTriangle, color: "emerald" },
                { k: "diff", label: "손실추적", icon: Layers, color: "violet" },
                { k: "return", label: "반품필요", icon: PackageCheck, color: "rose" },
              ];
              const COLOR_MAP: Record<TabDef["color"], { activeText: string; activeBg: string; activeUnderline: string; activeIcon: string; inactiveHover: string; badgeActive: string; badgeInactive: string }> = {
                teal: { activeText: "text-teal-700", activeBg: "bg-teal-50/70", activeUnderline: "bg-teal-500", activeIcon: "text-teal-600", inactiveHover: "hover:bg-teal-50/40 hover:text-teal-700", badgeActive: "bg-teal-100 text-teal-700", badgeInactive: "bg-slate-100 text-slate-500" },
                sky: { activeText: "text-sky-700", activeBg: "bg-sky-50/70", activeUnderline: "bg-sky-500", activeIcon: "text-sky-600", inactiveHover: "hover:bg-sky-50/40 hover:text-sky-700", badgeActive: "bg-sky-100 text-sky-700", badgeInactive: "bg-slate-100 text-slate-500" },
                rose: { activeText: "text-rose-700", activeBg: "bg-rose-50/70", activeUnderline: "bg-rose-500", activeIcon: "text-rose-600", inactiveHover: "hover:bg-rose-50/40 hover:text-rose-700", badgeActive: "bg-rose-500 text-white", badgeInactive: "bg-rose-100 text-rose-600" },
                violet: { activeText: "text-violet-700", activeBg: "bg-violet-50/70", activeUnderline: "bg-violet-500", activeIcon: "text-violet-600", inactiveHover: "hover:bg-violet-50/40 hover:text-violet-700", badgeActive: "bg-violet-100 text-violet-700", badgeInactive: "bg-slate-100 text-slate-500" },
                amber: { activeText: "text-amber-700", activeBg: "bg-amber-50/70", activeUnderline: "bg-amber-500", activeIcon: "text-amber-600", inactiveHover: "hover:bg-amber-50/40 hover:text-amber-700", badgeActive: "bg-amber-100 text-amber-700", badgeInactive: "bg-slate-100 text-slate-500" },
                indigo: { activeText: "text-indigo-700", activeBg: "bg-indigo-50/70", activeUnderline: "bg-indigo-500", activeIcon: "text-indigo-600", inactiveHover: "hover:bg-indigo-50/40 hover:text-indigo-700", badgeActive: "bg-indigo-100 text-indigo-700", badgeInactive: "bg-slate-100 text-slate-500" },
                emerald: { activeText: "text-emerald-700", activeBg: "bg-emerald-50/70", activeUnderline: "bg-emerald-500", activeIcon: "text-emerald-600", inactiveHover: "hover:bg-emerald-50/40 hover:text-emerald-700", badgeActive: "bg-emerald-100 text-emerald-700", badgeInactive: "bg-slate-100 text-slate-500" },
              };
              return tabs.map(t => {
                const Icon = t.icon;
                const active = stockTab === t.k;
                const c = COLOR_MAP[t.color];
                return (
                  <button key={t.k} type="button" onClick={() => setStockTab(t.k)}
                    className={`relative basis-1/3 sm:basis-auto flex-grow-0 inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 rounded-t-lg text-[14px] sm:text-[15px] font-bold leading-tight whitespace-nowrap transition-all duration-150 cursor-pointer ${active ? `${c.activeText} ${c.activeBg}` : `text-slate-500 ${c.inactiveHover}`
                      }`}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 2.0} className={`hidden sm:inline-block shrink-0 ${active ? c.activeIcon : "text-slate-400"}`} />
                    <span>{t.label}</span>
                    {t.badge != null && t.badge > 0 && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] px-1.5 h-[18px] rounded-full text-[10px] font-black tabular-nums ${active ? c.badgeActive : c.badgeInactive}`}>
                        {t.badge}
                      </span>
                    )}
                    {/* 활성 탭 · underline · 컬러 */}
                    {active && (
                      <span className={`absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full ${c.activeUnderline}`} />
                    )}
                  </button>
                );
              });
            })()}
          </div>

          <div className="flex flex-col gap-2 flex-1 min-h-0">
            {/* 탭 컨텐츠 · 활성 탭만 렌더 */}
            <div className="flex flex-col gap-3 min-h-0 w-full">
              {/* ── 공급사재고 탭 · 상단 필터바 + 하단 좌우 split (2026-07-30) ── */}
              {stockTab === "supplier" && (
                <div className="flex flex-col gap-2">

                  {/* ── 상단 필터바 (full-width) ── */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {/* 아이콘 + 제목 + 카운트배지 */}
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-sky-500 shrink-0" />
                      <span className="text-[13px] font-semibold text-slate-800">공급사현황</span>
                      <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">{displayedXlsxSuppliers.length}개 사</span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">행 클릭 → 우측 상품 리스트 · 상품명 클릭 → 상세</span>
                    </div>
                    {/* 조회기간 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
                      <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
                        <button onClick={() => { setSupplierSeason(null); setSupplierMonths(0); }}
                          className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === 0 ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
                        {[1, 2, 3, 4, 5, 6].map(m => (
                          <button key={m} onClick={() => { setSupplierSeason(null); setSupplierMonths(m as any); }}
                            className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!supplierSeason && supplierMonths === m ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
                        ))}
                      </div>
                    </div>
                    {/* 계절 */}
                    <SeasonButtons value={supplierSeason} onChange={(v) => { setSupplierSeason(v); if (v) setSupplierMonths(0); }} size="sm" hideLabel />
                    {/* Top N */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Top N</span>
                      <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
                        {[
                          { v: 100, label: "100" },
                          { v: 300, label: "300" },
                          { v: 1000, label: "1k" },
                          { v: 2000, label: "2k" },
                          { v: 999999, label: "전체" },
                        ].map(o => (
                          <button key={o.v} onClick={() => setSupListLimit(o.v)}
                            className={`text-[11px] font-semibold h-6 px-2 rounded transition whitespace-nowrap cursor-pointer ${supListLimit === o.v ? "bg-sky-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                          >{o.label}</button>
                        ))}
                      </div>
                    </div>
                    {/* 새로고침 */}
                    <button
                      type="button"
                      onClick={fetchAggregates}
                      disabled={loading}
                      className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
                      title="새로고침"
                    >
                      <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                  </div>

                  {/* ── 하단 좌우 split ── */}
                  <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                    {/* 좌측: 공급사 리스트 카드 */}
                    <div
                      className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                      style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? supplierPanelWidth : undefined }}
                    >
                    {/* 공급사별 재고자산 (종료일 시점, xlsx 합계 컬럼 합산) — 최상위 공급사 하이라이트 + 순위 리스트 */}
                    {true && (
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">

                        {/* ── 카드 헤더 툴바 ── */}
                        <div className="flex items-center gap-2 px-4 h-10 border-b border-slate-100 bg-white shrink-0">
                          <Building2 size={14} className="text-sky-500 shrink-0" />
                          <span className="text-[13px] font-semibold text-slate-800">공급사별 현황</span>
                          {flowSnapshot && (
                            <span className="text-[11px] font-semibold tabular-nums text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                              {flowSnapshot}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold tabular-nums text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                            {displayedXlsxSuppliers.length}{supListLimit < xlsxSuppliers.length ? `/${xlsxSuppliers.length}` : ""}개 사
                          </span>
                        </div>

                        {/* ── 분류 필터 · 2026-07-31 · 사용자 요청 · 위탁/선결제/회전/기타 필터링 ── */}
                        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">분류</span>
                          {([
                            { k: "전체" as const, activeCls: "bg-slate-700 text-white shadow-sm" },
                            { k: "위탁" as const, activeCls: "bg-violet-500 text-white shadow-sm" },
                            { k: "선결제" as const, activeCls: "bg-rose-500 text-white shadow-sm" },
                            { k: "60일회전" as const, activeCls: "bg-emerald-500 text-white shadow-sm" },
                            { k: "90일회전" as const, activeCls: "bg-teal-500 text-white shadow-sm" },
                            { k: "기타" as const, activeCls: "bg-slate-500 text-white shadow-sm" },
                          ]).map(o => {
                            const active = supListCategory === o.k;
                            return (
                              <button key={o.k} onClick={() => setSupListCategory(o.k)}
                                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${active ? o.activeCls : "text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200"}`}>
                                {o.k}
                              </button>
                            );
                          })}
                        </div>

                        {/* ── 정렬 행 ── */}
                        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">정렬</span>
                          {([
                            { k: "totalStockAmount" as SupListSortKey, label: "재고자산", color: "amber" },
                            { k: "saleQty" as SupListSortKey, label: "판매량", color: "emerald" },
                            { k: "saleAmount" as SupListSortKey, label: "판매액", color: "emerald" },
                            { k: "purchaseQty" as SupListSortKey, label: "매입", color: "emerald" },
                            { k: "itemCount" as SupListSortKey, label: "상품수", color: "slate" },
                            { k: "supplier" as SupListSortKey, label: "공급사명", color: "sky" },
                          ]).map(o => {
                            const active = supListSort.key === o.k;
                            const arrow = active ? (supListSort.dir === "desc" ? " ▼" : " ▲") : "";
                            const activeMap: Record<string, string> = {
                              amber: "bg-amber-500 text-white shadow-sm",
                              emerald: "bg-emerald-500 text-white shadow-sm",
                              sky: "bg-sky-500 text-white shadow-sm",
                              slate: "bg-slate-700 text-white shadow-sm",
                            };
                            return (
                              <button key={o.k} onClick={() => toggleSupListSort(o.k)}
                                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${active ? activeMap[o.color] : "text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200"}`}>
                                {o.label}{arrow}
                              </button>
                            );
                          })}
                        </div>

                        {/* ── 테이블 영역 ── */}
                        {!supplierCardCollapsed && (
                          <div className="relative flex-1 overflow-auto">
                            {loading && xlsxSuppliers.length > 0 && (
                              <div className="flex items-center justify-center gap-1.5 text-[12px] text-sky-700 font-semibold py-1.5 mx-3 mt-2 bg-sky-50 border border-sky-200 rounded-md">
                                <LoaderIcon size={12} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                              </div>
                            )}
                            {xlsxSuppliers.length === 0 ? (
                              loading ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-10">
                                  <div className="w-9 h-9 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
                                  <div className="text-[13px] font-semibold text-slate-500">데이터 로딩중...</div>
                                </div>
                              ) : (
                                <div className="text-center text-[13px] text-slate-400 py-10 font-semibold">데이터 없음</div>
                              )
                            ) : (
                              <table className={`w-full text-[13px] ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`} style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                                <thead className="sticky top-0 z-10">
                                  {/* 그룹 컬러 헤더 · 재고현황(sky)/매입현황(amber)/판매현황(rose) 3그룹 · 2026-08-03 */}
                                  <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                                    {/* 기본정보 (slate) · 항상 표시 */}
                                    <th colSpan={3} className="bg-slate-50 text-slate-400 text-left px-3 py-1.5">기본정보</th>
                                    {/* 재고현황 (sky) · 재고자산 + 상품수 */}
                                    <th colSpan={isSupplierGroupCollapsed("stock") ? 1 : 2}
                                      className="bg-sky-50 text-sky-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-sky-100 transition"
                                      onClick={() => toggleSupplierGroup("stock")}
                                      title={isSupplierGroupCollapsed("stock") ? "재고현황 펼치기" : "재고현황 접기"}>
                                      <span className="inline-flex items-center gap-1">
                                        {isSupplierGroupCollapsed("stock") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}재고현황
                                      </span>
                                    </th>
                                    {/* 매입현황 (amber) · 매입수량 */}
                                    <th colSpan={isSupplierGroupCollapsed("purchase") ? 1 : 1}
                                      className="bg-amber-50 text-amber-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-amber-100 transition"
                                      onClick={() => toggleSupplierGroup("purchase")}
                                      title={isSupplierGroupCollapsed("purchase") ? "매입현황 펼치기" : "매입현황 접기"}>
                                      <span className="inline-flex items-center gap-1">
                                        {isSupplierGroupCollapsed("purchase") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}매입현황
                                      </span>
                                    </th>
                                    {/* 판매현황 (rose) · 판매량 + 판매액 */}
                                    <th colSpan={isSupplierGroupCollapsed("sale") ? 1 : 2}
                                      className="bg-rose-50 text-rose-600 text-center px-3 py-1.5 cursor-pointer select-none hover:bg-rose-100 transition"
                                      onClick={() => toggleSupplierGroup("sale")}
                                      title={isSupplierGroupCollapsed("sale") ? "판매현황 펼치기" : "판매현황 접기"}>
                                      <span className="inline-flex items-center gap-1">
                                        {isSupplierGroupCollapsed("sale") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}판매현황
                                      </span>
                                    </th>
                                  </tr>
                                  {/* 컬럼 서브 헤더 */}
                                  <tr className="text-[11px] font-semibold text-slate-500 border-b border-slate-200 bg-white">
                                    <th className="text-center w-7 py-2"></th>
                                    <th className="text-center w-9 py-2">#</th>
                                    <th
                                      className="text-left px-3 py-2 cursor-pointer select-none hover:bg-slate-50 transition"
                                      onClick={() => toggleSupListSort("supplier")}
                                      title="공급사명 정렬"
                                    >공급사 {supListSort.key === "supplier" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-slate-300">⇅</span>}</th>
                                    {/* 재고현황 그룹 (sky) · 재고자산 + 상품수 */}
                                    {isSupplierGroupCollapsed("stock") ? (
                                      <th className="bg-sky-50/20 w-4"></th>
                                    ) : (
                                      <>
                                        <th
                                          className="text-right px-3 py-2 w-24 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition text-sky-700"
                                          onClick={() => toggleSupListSort("totalStockAmount")}
                                          title="재고자산 정렬"
                                        >재고자산 {supListSort.key === "totalStockAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-sky-300">⇅</span>}</th>
                                        <th
                                          className="text-right px-3 py-2 w-16 cursor-pointer select-none bg-sky-50/40 hover:bg-sky-100 transition text-sky-600"
                                          onClick={() => toggleSupListSort("itemCount")}
                                          title="상품수 정렬"
                                        >상품수 {supListSort.key === "itemCount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-sky-300">⇅</span>}</th>
                                      </>
                                    )}
                                    {/* 매입현황 그룹 (amber) · 매입수량 */}
                                    {isSupplierGroupCollapsed("purchase") ? (
                                      <th className="bg-amber-50/20 w-4"></th>
                                    ) : (
                                      <th
                                        className="text-right px-3 py-2 w-20 cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition text-amber-600"
                                        onClick={() => toggleSupListSort("purchaseQty")}
                                        title="매입수량 정렬"
                                      >매입 {supListSort.key === "purchaseQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-amber-300">⇅</span>}</th>
                                    )}
                                    {/* 판매현황 그룹 (rose) · 판매량 + 판매액 */}
                                    {isSupplierGroupCollapsed("sale") ? (
                                      <th className="bg-rose-50/20 w-4"></th>
                                    ) : (
                                      <>
                                        <th
                                          className="text-right px-3 py-2 w-20 cursor-pointer select-none bg-rose-50/60 hover:bg-rose-100 transition text-rose-600"
                                          onClick={() => toggleSupListSort("saleQty")}
                                          title="판매량 정렬"
                                        >판매량 {supListSort.key === "saleQty" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-rose-300">⇅</span>}</th>
                                        <th
                                          className="text-right px-3 py-2 w-24 cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition text-rose-700"
                                          onClick={() => toggleSupListSort("saleAmount")}
                                          title="판매액 정렬"
                                        >판매액 {supListSort.key === "saleAmount" ? (supListSort.dir === "desc" ? "▼" : "▲") : <span className="text-rose-300">⇅</span>}</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {displayedXlsxSuppliers.map((sup, i) => {
                                    const key = `${sup.supplier_code ?? "-"}::${sup.supplier}`;
                                    const isExpanded = expandedSuppliers.has(key);
                                    const isSelected = supplierSelectedKey === key;
                                    return (
                                      <tr key={key}
                                        onClick={() => { toggleSupplierExpand(sup); setSupplierSelectedKey(key); }}
                                        className={`cursor-pointer transition-colors ${isSelected ? "bg-sky-50 hover:bg-sky-100/70" : "hover:bg-slate-50/60"}`}
                                        title="클릭 → 오른쪽 패널에 상세 (판매출고계 내림차순 상품 리스트)"
                                      >
                                        <td className="text-center align-middle py-2.5">
                                          {isExpanded
                                            ? <ChevronDown size={13} className="text-sky-400 mx-auto" />
                                            : <ChevronRight size={13} className="text-slate-300 mx-auto" />}
                                        </td>
                                        <td className="text-center align-middle py-2.5 text-[11px] font-semibold text-slate-400 tabular-nums">{i + 1}</td>
                                        <td className="text-left px-3 py-2.5 align-middle">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-[13px] font-semibold break-words whitespace-normal leading-tight ${isSelected ? "text-sky-800" : "text-slate-700"}`}>
                                              {sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}
                                            </span>
                                            {(() => {
                                              const nm = sup.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                                              const cat = vendorCategoryMap[nm] ?? vendorCategoryMap[sup.supplier ?? ""] ?? null;
                                              return <VendorCategoryBadge category={cat} />;
                                            })()}
                                            {sup.supplier_code && (
                                              <span className="text-[10px] tabular-nums text-slate-400 shrink-0 font-mono bg-slate-100 rounded px-1" title="공급사코드">#{sup.supplier_code}</span>
                                            )}
                                            {sup.code_conflict && (
                                              <span className="text-[11px] font-semibold text-amber-500 shrink-0" title="같은 이름에 여러 공급사코드가 존재 — 중복 의심">⚠</span>
                                            )}
                                          </div>
                                        </td>
                                        {/* 재고현황 그룹 (sky) · 재고자산 + 상품수 */}
                                        {isSupplierGroupCollapsed("stock") ? (
                                          <td className="bg-sky-50/20 w-4"></td>
                                        ) : (
                                          <>
                                            <td className="text-right px-3 py-2.5 align-middle text-[13px] font-semibold text-sky-700 tabular-nums bg-sky-50/40" title="재고자산">
                                              {fmtWon(sup.totalStockAmount)}
                                            </td>
                                            <td className="text-right px-3 py-2.5 align-middle text-[12px] font-semibold text-sky-600 tabular-nums bg-sky-50/20" title="취급 상품 종수">
                                              {sup.itemCount}
                                            </td>
                                          </>
                                        )}
                                        {/* 매입현황 그룹 (amber) · 매입수량 */}
                                        {isSupplierGroupCollapsed("purchase") ? (
                                          <td className="bg-amber-50/20 w-4"></td>
                                        ) : (
                                          <td className="text-right px-3 py-2.5 align-middle text-[13px] font-semibold text-amber-700 tabular-nums bg-amber-50/30" title="매입수량">
                                            {fmt(sup.purchaseQty)}
                                          </td>
                                        )}
                                        {/* 판매현황 그룹 (rose) · 판매량 + 판매액 */}
                                        {isSupplierGroupCollapsed("sale") ? (
                                          <td className="bg-rose-50/20 w-4"></td>
                                        ) : (
                                          <>
                                            <td className="text-right px-3 py-2.5 align-middle text-[13px] font-semibold text-rose-600 tabular-nums bg-rose-50/20" title="판매수량">
                                              {fmt(sup.saleQty)}
                                            </td>
                                            <td className="text-right px-3 py-2.5 align-middle text-[13px] font-semibold text-rose-700 tabular-nums bg-rose-50/30" title="판매액">
                                              {fmtWon(Number(sup.saleAmount ?? 0))}
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
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
                            <div className="text-[13px] font-black text-slate-800 break-keep whitespace-normal leading-tight">{supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim()}</div>
                            <div className="text-[10px] tabular-nums text-slate-500 break-words whitespace-normal leading-tight">{supplierSelectedObj.supplier_code ? `#${supplierSelectedObj.supplier_code}` : ""} · 재고자산 {fmtWon(supplierSelectedObj.totalStockAmount)}</div>
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
                          {(() => {
                            const nm = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                            return <VendorCategoryBadge category={vendorCategoryMap[nm] ?? vendorCategoryMap[supplierSelectedObj.supplier ?? ""] ?? null} />;
                          })()}
                          {supplierSelectedObj.supplier_code && <span className="text-[10px] tabular-nums text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">#{supplierSelectedObj.supplier_code}</span>}
                          {/* 2026-07-30 · 사용자 요청 · 공급사 정보 조회 · 공급사관리 모달 오픈 */}
                          {(() => {
                            const nm = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                            return (
                              <button type="button"
                                onClick={() => openSupplierDetailModal(nm || supplierSelectedObj.supplier || "")}
                                className="ml-auto inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-300 hover:bg-sky-100 cursor-pointer transition"
                                title="공급사 정보 조회·수정">
                                <Building2 size={11} /> 조회
                              </button>
                            );
                          })()}
                        </div>
                        {(() => {
                          // 2026-07-23 · supplier_balances 최신값 (재고자산 앞에 표시)
                          const supName = supplierSelectedObj.supplier?.replace(/\s*\(\s*vat\s*미포함\s*\)\s*/gi, "").trim() ?? "";
                          const balInfo = supplierBalanceMap[supName] ?? supplierBalanceMap[supplierSelectedObj.supplier ?? ""] ?? null;
                          return (
                            <div className="grid grid-cols-4 gap-2">
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center" title={balInfo?.invoice_date ? `기준일 ${balInfo.invoice_date}` : "최신 잔고 없음"}>
                                <div className="text-[10px] text-amber-600 font-semibold">최신잔고</div>
                                <div className="text-sm font-black text-amber-700 mt-0.5">{balInfo ? fmtWon(balInfo.balance) : "-"}</div>
                              </div>
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
                          );
                        })()}
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
                              <table className="w-full text-[12px] min-w-[560px]">
                                <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                                  <tr className="text-[11px] text-slate-400 uppercase tracking-wider">
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
                                    {/* 2026-07-30 · 사용자 요청 · 최소발주 제거 · 매입단가·판매량·판매금액 추가 */}
                                    {/* 2026-08-03 · 3개 컬럼 정렬 추가 */}
                                    <th
                                      onClick={() => toggleSupDetailSort("purchase_price")}
                                      className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-amber-50/60 transition ${supDetailSort.key === "purchase_price" ? "text-amber-700 font-black" : "text-amber-600"}`}
                                      title="매입단가 정렬"
                                    >매입단가{supDetailArrow("purchase_price")}</th>
                                    <th
                                      onClick={() => toggleSupDetailSort("sale_qty")}
                                      className={`text-right px-1 py-1.5 w-14 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_qty" ? "text-rose-700 font-black" : "text-rose-600"}`}
                                      title="판매량 정렬"
                                    >판매량{supDetailArrow("sale_qty")}</th>
                                    <th
                                      onClick={() => toggleSupDetailSort("sale_amount")}
                                      className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-rose-50/60 transition ${supDetailSort.key === "sale_amount" ? "text-rose-800 font-black" : "text-rose-700"}`}
                                      title="판매금액 정렬"
                                    >판매금액{supDetailArrow("sale_amount")}</th>
                                    <th
                                      onClick={() => toggleSupDetailSort("total_amount")}
                                      className={`text-right px-1 py-1.5 w-16 cursor-pointer select-none hover:bg-slate-100 transition-all duration-150 ${supDetailSort.key === "total_amount" ? "text-emerald-700 font-black" : "text-emerald-500"}`}
                                      title="재고금액 정렬"
                                    >재고금액{supDetailArrow("total_amount")}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-sky-100">
                                  {sortedDetail.slice(0, 200).map((r, ri) => {
                                    const purchPrice = Number(r.purchase_price ?? 0);
                                    const saleQty = Number(r.sale_qty ?? 0);
                                    const saleAmt = Number(r.total_amount ?? 0);
                                    const curStock = Number(r.current_stock ?? 0);
                                    const stockValue = curStock > 0 && purchPrice > 0 ? curStock * purchPrice : 0;
                                    return (
                                      <tr key={`supdet-${r.product_code ?? ri}`} className="hover:bg-slate-50/60 transition-all duration-150 align-top">
                                        <td className="px-1 py-1 text-[11px] text-slate-400">{ri + 1}</td>
                                        <td className="px-1 py-1 break-words whitespace-normal leading-tight">
                                          <button type="button" onClick={() => loadFlowSelectedProduct(r)} className="text-left text-[12px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer transition break-words whitespace-normal">{r.product_name}</button>
                                        </td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-amber-700">{fmt(curStock)}</td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-slate-500">{detailCycleStr(r)}</td>
                                        <td className="text-right px-1 py-1 tabular-nums">
                                          {r.product_code && r.last_purchase_date ? (
                                            <button type="button"
                                              onClick={() => setProductPurchaseModal({
                                                product_code: String(r.product_code),
                                                product_name: r.product_name ?? "",
                                              })}
                                              className="text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
                                              title={`${r.last_purchase_date} · 매입 이력 보기`}
                                            >{fmtPurchaseDate(r.last_purchase_date)}</button>
                                          ) : (
                                            <span className="text-slate-500">{fmtPurchaseDate(r.last_purchase_date)}</span>
                                          )}
                                        </td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-slate-700">{fmt(Number(r.purchase_total_qty ?? r.purchase_qty ?? 0))}</td>
                                        {/* 2026-07-30 · 매입단가 · 판매량 · 판매금액 (최소발주 제거) */}
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-amber-700 font-semibold">{purchPrice > 0 ? purchPrice.toLocaleString() : "-"}</td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-rose-600 font-semibold">{saleQty > 0 ? fmt(saleQty) : "-"}</td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums text-rose-700 font-semibold">{saleAmt > 0 ? fmtWon(saleAmt) : "-"}</td>
                                        <td className="text-right px-1 py-1 text-[11px] tabular-nums font-bold text-emerald-700">{stockValue > 0 ? fmtWon(stockValue) : "-"}</td>
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
              </div>
              )}

              {/* 2026-07-29 · 사용자 요청 · 매입상세 탭 삭제 · 관련 JSX 제거 */}

              {/* 적정재고↓ 탭 · LowStockPanel (2026-07-31 · OrderManagePage에서 복귀) */}
              {stockTab === "low" && (
                <LowStockPanel />
              )}

              {/* 반품필요 탭 · ReturnListPanel (2026-07-31 · 탭 스왑 · OrderManagePage에서 이동) */}
              {stockTab === "return" && (
                <ReturnListPanel />
              )}

              {/* 실재고 vs ERP 차이 상품 리스트 · 상단 필터바 + 좌우 분할 레이아웃 */}
              {stockTab === "diff" && (
                <div className="flex flex-col gap-2">
                  {/* ── 상단 필터바 (통일 규격) ── */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-violet-500 shrink-0" />
                      <span className="text-[13px] font-semibold text-slate-800">손실추적</span>
                      <span className="text-[11px] font-semibold text-violet-600 bg-violet-50 rounded-full px-2 py-0.5 border border-violet-200 tabular-nums">{diffList.length}건</span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">실재고(창고+매장) ↔ ERP 차이 · 도난·파손·미기록 판매·재고 오류 · 상품명 클릭 → 상세</span>
                    </div>
                    <button
                      type="button"
                      onClick={fetchAggregates}
                      disabled={loading}
                      className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-300 text-slate-400 hover:text-violet-500 transition disabled:opacity-40 cursor-pointer"
                      title="새로고침"
                    >
                      <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                  </div>

                  {/* ── 하단 · 좌우 split ── */}
                  <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                  {/* 좌측: 차이 리스트 */}
                  <div
                    className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                    style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? diffPanelWidth : undefined }}
                  >
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
                          {!stockDiffCollapsed && (
                            <div className="flex-1 overflow-y-auto relative">
                              {loading && diffList.length > 0 && (
                                <div className="flex items-center justify-center gap-1.5 text-[10px] text-violet-600 font-bold py-1.5 mb-1 bg-violet-50 border border-violet-200 rounded-md sticky top-0 z-10">
                                  <LoaderIcon size={11} className="animate-spin" /> 조건 변경 · 새로 불러오는 중...
                                </div>
                              )}
                              {loading && diffList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-10">
                                  <div className="w-9 h-9 border-4 border-violet-100 border-t-violet-400 rounded-full animate-spin" />
                                  <div className="text-[11px] font-semibold text-slate-500">데이터 로딩중...</div>
                                </div>
                              ) : diffList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
                                  <Layers size={28} className="opacity-20" />
                                  <div className="text-[12px] font-semibold">차이 있는 상품 없음</div>
                                  <div className="text-[11px] text-slate-300">실재고와 ERP 현재고가 일치합니다</div>
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs sm:min-w-[280px]">
                                    <thead className="sticky top-0 z-10">
                                      {/* 컬럼 그룹 헤더 · 클릭 접기 */}
                                      <tr className="text-[10px] font-semibold uppercase tracking-wider border-b border-slate-200">
                                        <th colSpan={2} className="bg-slate-50 text-slate-400 text-left px-2 py-1.5">기본정보</th>
                                        <th className="bg-slate-100/60 text-slate-500 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-slate-200/60 transition"
                                          onClick={() => toggleDiffGroup("erp")}
                                          title={isDiffGroupCollapsed("erp") ? "ERP 펼치기" : "ERP 접기"}>
                                          <span className="inline-flex items-center gap-1 justify-end">
                                            {isDiffGroupCollapsed("erp") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}ERP
                                          </span>
                                        </th>
                                        <th className="bg-violet-50 text-violet-600 text-right px-2 py-1.5 cursor-pointer select-none hover:bg-violet-100 transition"
                                          onClick={() => toggleDiffGroup("actual")}
                                          title={isDiffGroupCollapsed("actual") ? "실재고 펼치기" : "실재고 접기"}>
                                          <span className="inline-flex items-center gap-1 justify-end">
                                            {isDiffGroupCollapsed("actual") ? <ChevronRight size={11} /> : <ChevronDown size={11} />}실재고
                                          </span>
                                        </th>
                                        <th className="bg-violet-100 text-violet-700 text-right px-2 py-1.5">차이</th>
                                      </tr>
                                      {/* 서브헤더 */}
                                      <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-white">
                                        <th className="text-left px-2 py-1.5 w-7">#</th>
                                        <th className="text-left px-2 py-1.5">상품명</th>
                                        {isDiffGroupCollapsed("erp") ? (
                                          <th className="bg-slate-50/20 w-4"></th>
                                        ) : (
                                          <th className="text-right px-2 py-1.5 w-14 bg-slate-50/40 text-slate-500">현재고</th>
                                        )}
                                        {isDiffGroupCollapsed("actual") ? (
                                          <th className="bg-violet-50/10 w-4"></th>
                                        ) : (
                                          <th className="text-right px-2 py-1.5 w-16 bg-violet-50/40 text-violet-600">실재고</th>
                                        )}
                                        <th className="text-right px-2 py-1.5 w-14 text-violet-700">차이</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {diffList.slice(0, 100).map((p: any, i: number) => {
                                        const isSelected = diffSelectedProduct?.code === String(p.product_code ?? "");
                                        return (
                                          <tr key={`diff-${p.product_name}-${i}`} className={`transition ${isSelected ? "bg-violet-50/30" : "hover:bg-slate-50/60"}`}>
                                            <td className="px-2 py-2 text-slate-400 font-medium text-[11px] align-top tabular-nums">{i + 1}</td>
                                            <td className="px-2 py-2 align-top">
                                              <button
                                                onClick={() => loadDiffSelectedProduct(p)}
                                                className="text-left text-[12px] font-semibold text-slate-700 hover:text-violet-700 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                                title={p.product_name}
                                              >
                                                {p.product_name}
                                              </button>
                                              {p.supplier && <div className="text-[10px] text-slate-400 break-words whitespace-normal mt-0.5">{p.supplier}</div>}
                                            </td>
                                            {isDiffGroupCollapsed("erp") ? (
                                              <td className="bg-slate-50/10 w-4"></td>
                                            ) : (
                                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-medium bg-slate-50/40 text-slate-600 align-top">{fmt(p.cur)}</td>
                                            )}
                                            {isDiffGroupCollapsed("actual") ? (
                                              <td className="bg-violet-50/10 w-4"></td>
                                            ) : (
                                              <td className="text-right px-2 py-2 tabular-nums text-[12px] font-semibold bg-violet-50/30 text-violet-700 align-top">{fmt(p.actual)}</td>
                                            )}
                                            <td className={`text-right px-2 py-2 tabular-nums text-[12px] font-bold align-top ${p.diff > 0 ? "text-emerald-600" : "text-rose-500"}`}>
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
                    onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
                  />
                  </div>
                </div>
              )}

            </div>

            {/* 2026-07-28 · 사용자 요청 · 상품관리 탭 제거 · 카테고리별판매 (판매추이에서 이동) */}
            {stockTab === "category" && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <React.Suspense fallback={<div className="text-center text-xs text-slate-400 py-8">카테고리별판매 로딩 중...</div>}>
                  <CategoryTabLazy />
                </React.Suspense>
              </div>
            )}
            {/* 2026-07-29 · 손실추적 탭 및 LossTrackerTabLazy 완전 제거 · 실재고차이 탭이 커버 */}
            {/* 2026-07-29 · 급상승 탭 · 최근 window일 판매 vs 이전 window일 판매 비교 */}
            {stockTab === "trending" && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TrendingTab onProductClick={loadFlowSelectedProduct} />
              </div>
            )}

            {/* 상품재고현황 탭 · 상단 필터바 + 좌우 분할 레이아웃 (2026-07-30) */}
            {stockTab === "flow" && (
              <div className="flex flex-col gap-2">

                {/* ── 상단 필터바 (full-width · 벤치마크: OrderManage need 탭) ── */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* 페이지 제목 · 아이콘 · 카운트 배지 (sky 톤) */}
                  <div className="flex items-center gap-2">
                    <Boxes size={14} className="text-sky-500 shrink-0" />
                    <span className="text-[13px] font-semibold text-slate-800">상품현황리스트</span>
                    <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 rounded-full px-2 py-0.5 border border-sky-200 tabular-nums">{filteredFlow.length}건</span>
                  </div>
                  {/* 조회기간 · 날짜범위 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">기간</span>
                    {flowMonths === 0 && !flowSeason && flowSnapshot && (
                      <span className="text-[11px] tabular-nums font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
                        {flowDateRange ?? flowSnapshot}
                      </span>
                    )}
                    {flowMonths > 0 && (() => {
                      const today = new Date();
                      const start = new Date(today.getFullYear(), today.getMonth() - flowMonths, 1);
                      const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
                      const e = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                      return (
                        <span className="text-[11px] tabular-nums font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5">
                          {s} ~ {e}
                        </span>
                      );
                    })()}
                    <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
                      <button onClick={() => { setFlowSeason(null); setPendingFlowMonths(0); setFlowMonths(0); }}
                        className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === 0 ? "bg-teal-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>10일</button>
                      {[1, 2, 3, 4, 5, 6].map(m => (
                        <button key={m} onClick={() => { setFlowSeason(null); setPendingFlowMonths(m as any); setFlowMonths(m as any); }}
                          className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!flowSeason && flowMonths === m ? "bg-teal-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{m}개월</button>
                      ))}
                    </div>
                    <SeasonButtons value={flowSeason} onChange={(v) => { setFlowSeason(v); if (v) { setPendingFlowMonths(0); setFlowMonths(0); } }} size="sm" hideLabel />
                  </div>
                  {/* Top N */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">Top N</span>
                    <div className="inline-flex bg-slate-50 border border-slate-200 rounded-md p-0.5">
                      {[
                        { v: 100, label: "100" },
                        { v: 300, label: "300" },
                        { v: 1000, label: "1k" },
                        { v: 2000, label: "2k" },
                        { v: 50000, label: "전체" },
                      ].map(o => (
                        <button key={o.v} onClick={() => setFlowLimit(o.v)}
                          className={`text-[11px] font-semibold h-6 px-2 rounded transition whitespace-nowrap cursor-pointer ${flowLimit === o.v ? "bg-teal-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* 정보확인 검색 */}
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={infoSearchQuery}
                      onChange={(e) => setInfoSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") runInfoSearch(); }}
                      placeholder="전체 DB 검색 (정보확인)"
                      className="w-48 h-7 pl-7 pr-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 bg-white transition"
                    />
                    {infoSearchResults.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 max-h-64 overflow-y-auto border border-slate-200 bg-white rounded-lg shadow-lg z-30 divide-y divide-slate-100 min-w-full sm:min-w-[500px]">
                        {infoSearchResults.map((p, i) => (
                          <button key={`info-sr-${p.product_code}-${i}`}
                            onClick={() => { setInfoSelected(p); setInfoSearchQuery(p.product_name); setInfoSearchResults([]); }}
                            className="w-full text-left px-2.5 py-1 hover:bg-sky-50 transition flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">{p.product_name}</div>
                              <div className="text-[11px] tabular-nums text-slate-400 whitespace-nowrap">#{p.product_code} · {p.supplier ?? "-"}</div>
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0">재고 {p.current_stock ?? "-"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* 정보확인 버튼 */}
                  <button
                    onClick={() => {
                      const target = infoSelected ?? infoSearchResults[0] ?? null;
                      if (target) { loadFlowSelectedProduct(target); setInfoSearchResults([]); }
                    }}
                    disabled={!infoSelected && !infoSearchQuery.trim() && infoSearchResults.length === 0}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-3 h-7 cursor-pointer transition shrink-0"
                    title="검색 후 클릭 → 오른쪽 상세 패널에 상품 정보 표시">
                    <Info size={12} /> 정보확인
                  </button>
                  {/* 판매출고계 범위 필터 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">판매출고계</span>
                    <input type="number" min={0} value={salesQtyMin}
                      onChange={e => setSalesQtyMin(e.target.value)} placeholder="최소"
                      className="w-14 h-7 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 tabular-nums text-right transition" />
                    <span className="text-slate-400 text-[11px]">~</span>
                    <input type="number" min={0} value={salesQtyMax}
                      onChange={e => setSalesQtyMax(e.target.value)} placeholder="최대"
                      className="w-14 h-7 px-2 text-[11px] border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400 tabular-nums text-right transition" />
                    <span className="text-slate-400 text-[11px]">개</span>
                    {(salesQtyMin || salesQtyMax) && (
                      <button onClick={() => { setSalesQtyMin(""); setSalesQtyMax(""); }}
                        className="text-[10px] font-semibold text-rose-500 hover:text-rose-700 px-1.5 py-1 rounded-md hover:bg-rose-50 transition cursor-pointer border border-rose-200">초기화</button>
                    )}
                  </div>
                  {/* 숨김관리 */}
                  <button
                    onClick={() => openHiddenManagerModal()}
                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-md px-2.5 h-7 cursor-pointer transition shrink-0"
                    title="숨김 처리된 상품을 확인/해제">
                    <EyeOff size={12} /> 숨김관리
                  </button>
                  {/* 새로고침 (아이콘 · 우측 정렬) */}
                  <button
                    onClick={fetchAggregates}
                    disabled={loading}
                    className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-300 text-slate-400 hover:text-sky-500 transition disabled:opacity-40 cursor-pointer"
                    title="새로고침"
                  >
                    <LoaderIcon size={13} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>

                {/* ── 하단 · 좌우 split ── */}
                <div className="flex flex-col lg:flex-row gap-2 min-h-[520px]">
                {/* ─── 좌측: 재고리스트 ─── */}
                <div
                  className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-3"
                  style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? flowPanelWidth : undefined }}
                >
                  {/* 재고 흐름 카드 · 순수 테이블 영역 · section 패턴 (벤치마크: need 탭) */}
                  <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className={`flex-1 min-h-0 flex flex-col ${flowCardCollapsed ? "hidden" : "flex"}`}>
                      {topTab === "sale" && (
                      <>
                        {/* 리스트 소제목 (dot + 라벨 + 카운트) · 벤치마크: need 탭 */}
                        <div className="flex items-center gap-2 mb-2 shrink-0">
                          <span className="inline-block w-1 h-3.5 rounded-full bg-sky-400 shrink-0"></span>
                          <span className="text-[11px] font-semibold text-slate-500">재고 · 매입 · 판매 현황</span>
                          <span className="text-[11px] text-slate-400 font-normal tabular-nums">{filteredFlow.length}건</span>
                          {selectedFlowCodes.size > 0 && (
                            <span className="text-[11px] text-rose-600 font-semibold tabular-nums ml-1">· {selectedFlowCodes.size}개 선택됨</span>
                          )}
                        </div>
                      <div className="relative flex-1 overflow-auto max-h-[50vh]">
                        {/* 2026-07-20: 리스트 내부 로딩 배너 · 데이터 있을 때 sticky 상단 · shimmer 애니메이션 · 아래 데이터 opacity 60% */}
                        {/* 2026-07-20: 로딩 UI 통일 · 판매추이 공급사별판매 패턴 */}
                        {loading && topTab === "sale" && filteredFlow.length > 0 && (
                          <div className="flex items-center justify-center gap-1.5 py-1.5 mx-1 mb-1 bg-sky-50 border border-sky-200 rounded-md shrink-0">
                            <LoaderIcon size={11} className="animate-spin text-sky-600" /><span className="text-[10px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
                          </div>
                        )}
                        {topTab === "sale" ? (
                          filteredFlow.length === 0 ? (
                            loading ? (
                              <div className="flex flex-col items-center justify-center gap-3 py-8">
                                <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                                <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
                              </div>
                            ) : (
                              <div className="text-center text-[13px] text-slate-300 py-6">
                                {stockFlow.length === 0
                                  ? "재고 데이터 없음 (재고현황 xlsx 업로드 필요)"
                                  : "선택한 판매수량 범위에 해당하는 상품 없음"}
                              </div>
                            )
                          ) : (
                            // 2026-07-29 · sticky thead 활성화 · 내부 overflow-hidden 제거 (sticky 를 막던 이슈)
                            <div className={`transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
                              <table className="w-full text-[13px] sm:text-sm" style={{ tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0 }}>
                                <thead className="sticky top-0 bg-white z-20 shadow-sm">
                                  {selectedFlowCodes.size > 0 && (
                                    <tr className="bg-rose-50 border-b border-rose-200">
                                      <td colSpan={10} className="px-2 py-1.5">
                                        <div className="flex items-center gap-2 text-[13px]">
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
                                  {/* 2026-07-30 · 사용자 요청 · 3그룹 헤더 색상 (재고현황 sky · 매입현황 amber · 판매현황 emerald) */}
                                  <tr className="border-b border-slate-200 text-[12px] font-black tracking-wider">
                                    <th colSpan={2} className="bg-slate-50"></th>{/* 체크박스+# 통합 셀 + 상품명 */}
                                    {(() => {
                                      // 2026-07-30 · 사용자 요청 · 재고현황 파란 · 매입현황 주황 · 판매현황 붉은 계열
                                      const GROUP_COLOR: Record<FlowGroup, { bg: string; text: string; hover: string }> = {
                                        stock: { bg: "bg-sky-50", text: "text-sky-700", hover: "hover:bg-sky-100" },
                                        purchase: { bg: "bg-amber-50", text: "text-amber-700", hover: "hover:bg-amber-100" },
                                        sales: { bg: "bg-rose-50", text: "text-rose-700", hover: "hover:bg-rose-100" },
                                      };
                                      const groupHeader = (g: FlowGroup, label: string, span: number) => {
                                        const collapsed = isFlowGroupCollapsed(g);
                                        const c = GROUP_COLOR[g];
                                        return (
                                          <th colSpan={collapsed ? 1 : span}
                                            className={`text-center py-2 border-l border-r border-slate-100 cursor-pointer select-none transition uppercase ${c.bg} ${c.text} ${c.hover}`}
                                            onClick={() => toggleFlowGroup(g)}
                                            title={collapsed ? `${label} 펼치기` : `${label} 접기`}
                                          >
                                            <span className="inline-flex items-center gap-1 font-black text-[11px] whitespace-nowrap">
                                              {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                              {label}
                                            </span>
                                          </th>
                                        );
                                      };
                                      return (
                                        <>
                                          {groupHeader("stock", "재고현황", 3)}
                                          {groupHeader("purchase", "매입현황", 3)}
                                          {groupHeader("sales", "판매현황", 5)}
                                        </>
                                      );
                                    })()}
                                  </tr>
                                  {/* 서브헤더 · 벤치마크: need 탭 11px · 컴팩트 */}
                                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-white">
                                    {(() => {
                                      const arrowFor = (key: SortKey): string => {
                                        if (flowSort !== key) return "⇅";
                                        return flowDir === "desc" ? "▼" : "▲";
                                      };
                                      return (
                                        <>
                                          {/* 2026-07-29 · 체크박스 + # 한 셀 통합 (사용자 요청) */}
                                          <th className="text-center px-1 py-1.5" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                                            <div className="flex items-center justify-center gap-1.5">
                                              <button onClick={() => {
                                                if (selectedFlowCodes.size === filteredFlow.length) setSelectedFlowCodes(new Set());
                                                else setSelectedFlowCodes(new Set(filteredFlow.map(r => String(r.product_code))));
                                              }} className="text-slate-400 hover:text-rose-500 transition inline-flex items-center justify-center" title="전체 선택/해제">
                                                {selectedFlowCodes.size === filteredFlow.length && filteredFlow.length > 0
                                                  ? <CheckSquare size={13} className="text-rose-500" />
                                                  : <Square size={13} />}
                                              </button>
                                              <span className="text-[14px] font-black text-slate-500">#</span>
                                            </div>
                                          </th>
                                          <th
                                            onClick={() => toggleFlowSort("name")}
                                            className={`text-left px-1 py-1.5 min-w-[260px] cursor-pointer select-none hover:bg-slate-50 transition ${flowSort === "name" ? "text-slate-800 font-black" : "text-slate-500"}`}
                                            title="클릭: 상품명 가나다순 정렬"
                                          >
                                            <span className="flex flex-col leading-tight items-start">
                                              <span>상품명</span>
                                              <span className="text-[10px] opacity-70">{arrowFor("name")}</span>
                                            </span>
                                          </th>
                                          {/* 2026-07-28 · 사용자 요청 · 시작 컬럼 제거 · 매입 → 최근매입일 옆으로 이동 (라벨 · 최근매입량) */}
                                          {/* === 재고현황 그룹 (판매량 · 현재고 · 적정재고) · sky 톤 통일 · 2026-07-30 · 사용자 요청 */}
                                          {isFlowGroupCollapsed("stock") && <th className="bg-sky-50/20"></th>}
                                          {!isFlowGroupCollapsed("stock") && <>
                                            <th
                                              onClick={() => toggleFlowSort("sale")}
                                              className={`text-right px-0.5 py-1.5 w-14 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "sale" ? "text-sky-800 font-black" : "text-sky-600 font-black"}`}
                                              title="클릭: 판매출고계 기준 정렬 · 실제 팔린 양"
                                            >
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>판매량</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("sale")}</span>
                                              </span>
                                            </th>
                                            <th
                                              onClick={() => toggleFlowSort("current")}
                                              className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === "current" ? "text-sky-800 font-black" : "text-sky-600 font-black"}`}
                                              title="클릭: ERP 현재고 기준 정렬 · products.current_stock"
                                            >
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>현재고</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("current")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("optimal" as any)}
                                              className={`text-right px-0.5 py-1.5 w-12 cursor-pointer select-none bg-sky-50/60 hover:bg-sky-100 transition ${flowSort === ("optimal" as any) ? "text-sky-800 font-black" : "text-sky-600 font-black"}`}
                                              title="적정재고 = 최근 30일 판매 총합 (관리자가 상단 '적정재고 = 30일 판매량' 버튼 실행 시점 · products.optimal_stock)"
                                            >
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>적정재고</span>
                                                <span className="text-[11px] font-semibold text-sky-500">최근 30일</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("optimal" as any)}</span>
                                              </span>
                                            </th>
                                          </>}
                                          {/* === 매입현황 그룹 (평균매입주기 · 최근매입일 · 최근매입량) · amber 톤 통일 */}
                                          {isFlowGroupCollapsed("purchase") && <th className="bg-amber-50/20"></th>}
                                          {!isFlowGroupCollapsed("purchase") && <>
                                            <th onClick={() => toggleFlowSort("cycle")}
                                              className={`text-right px-0.5 py-1.5 w-12 text-[11px] font-black cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "cycle" ? "text-amber-800" : "text-amber-600"}`}
                                              title="평균 매입주기 = (최근-최초 매입일) / (매입횟수-1) · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span className="text-[12px] font-semibold text-amber-500">평균</span>
                                                <span>매입주기</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("cycle")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("last_purchase")}
                                              className={`text-right px-0.5 py-1.5 w-11 text-[11px] font-black cursor-pointer select-none bg-amber-50/40 hover:bg-amber-100 transition ${flowSort === "last_purchase" ? "text-amber-800" : "text-amber-600"}`}
                                              title="최근 매입일 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span className="text-[12px] font-semibold text-amber-500">최근</span>
                                                <span>매입일</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("last_purchase")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("purchase")}
                                              className={`text-right px-0.5 py-1.5 w-12 text-[11px] font-black cursor-pointer select-none bg-amber-50/60 hover:bg-amber-100 transition ${flowSort === "purchase" ? "text-amber-800" : "text-amber-600"}`}
                                              title="최근매입량 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span className="text-[12px] font-semibold text-amber-500">최근</span>
                                                <span>매입량</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("purchase")}</span>
                                              </span>
                                            </th>
                                          </>}
                                          {/* === 판매현황 그룹 (재고금액 · ERP단가 · 판매가 · 이익률) · rose 톤 통일 · 2026-07-30 · 사용자 요청 */}
                                          {isFlowGroupCollapsed("sales") && <th className="bg-rose-50/20"></th>}
                                          {!isFlowGroupCollapsed("sales") && <>
                                            {/* 2026-07-30 · 사용자 요청 · 판매현황 · 재고금액 → 판매량 (sale_qty) */}
                                            <th onClick={() => toggleFlowSort("sale")}
                                              className={`text-right px-0.5 py-1.5 w-16 text-[11px] font-black cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale" ? "text-rose-800" : "text-rose-700"}`}
                                              title="판매량 · 조회기간 sale_qty 합계 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>판매량</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("sale")}</span>
                                              </span>
                                            </th>
                                            {/* 2026-07-31 · 사용자 요청 · 판매량 옆 판매금액 (기간별 total_amount 합계) */}
                                            <th onClick={() => toggleFlowSort("amount")}
                                              className={`text-right px-0.5 py-1.5 w-20 text-[11px] font-black cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "amount" ? "text-rose-800" : "text-rose-700"}`}
                                              title="판매금액 · 조회기간 total_amount 합계 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>판매금액</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("amount")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("last_purchase_price")}
                                              className={`text-right px-0.5 py-1.5 w-16 text-[11px] font-black cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "last_purchase_price" ? "text-rose-800" : "text-rose-600"}`}
                                              title="ERP단가 = products.purchase_price · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span className="font-semibold text-rose-500">ERP</span>
                                                <span>단가</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("last_purchase_price")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("sale_price")}
                                              className={`text-right px-0.5 py-1.5 w-16 text-[11px] font-black cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "sale_price" ? "text-rose-800" : "text-rose-600"}`}
                                              title="판매 단가 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>판매가</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("sale_price")}</span>
                                              </span>
                                            </th>
                                            <th onClick={() => toggleFlowSort("profit_rate")}
                                              className={`text-right px-0.5 py-1.5 w-14 text-[11px] font-black cursor-pointer select-none bg-rose-50/40 hover:bg-rose-100 transition ${flowSort === "profit_rate" ? "text-rose-800" : "text-rose-600"}`}
                                              title="이익률 · 클릭 정렬">
                                              <span className="flex flex-col leading-tight items-end">
                                                <span>이익률</span>
                                                <span className="text-[10px] opacity-70">{arrowFor("profit_rate")}</span>
                                              </span>
                                            </th>
                                          </>}
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
                                    // 2026-07-28 · 사용자 요청 · 공급사재고와 동일 데이터 · purchase_total_qty 우선 fallback purchase_qty
                                    const purchV = Number((p as any).purchase_total_qty ?? p.purchase_qty ?? 0);
                                    const closeV = Number(p.closing_stock ?? 0);
                                    const loss = (openV - saleV) - closeV;
                                    const saleP = Number((p as any).sale_price ?? 0);
                                    const purP = Number((p as any).purchase_price ?? 0);
                                    const profitRate = saleP > 0 && purP > 0 ? Math.trunc(((saleP - purP) / saleP) * 100) : null;
                                    const periodDays = (flowMonths && flowMonths > 0) ? flowMonths * 30 : 30;
                                    const avgStock = (openV + cur) / 2;
                                    const turnover = avgStock > 0 ? saleV / avgStock : 0;
                                    const doh = turnover > 0 ? Math.round(periodDays / turnover) : null;
                                    // 2026-07-28 · 매입주기 = (last - first) / (count - 1) · 공급사재고 리스트와 동일 계산
                                    const purchaseCount = Number((p as any).purchase_count ?? 0);
                                    const firstPD = (p as any).first_purchase_date as string | null;
                                    const lastPD = p.last_purchase_date;
                                    const purchaseCycle = (() => {
                                      if (purchaseCount < 2 || !firstPD || !lastPD || firstPD === lastPD) return null;
                                      const days = Math.round((new Date(lastPD).getTime() - new Date(firstPD).getTime()) / (86400 * 1000));
                                      return purchaseCount > 1 ? Math.round(days / (purchaseCount - 1)) : null;
                                    })();
                                    // 최근매입일 M/D 축약
                                    const lastPDShort = (() => {
                                      const d = lastPD;
                                      if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d))) return "-";
                                      return `${String(d).slice(5, 7)}/${String(d).slice(8, 10)}`;
                                    })();
                                    // 재고금액 · "N.N만" 축약 (예 · 4488000 → 448.8만)
                                    const stockValue = cur > 0 && purP > 0 ? cur * purP : 0;
                                    const fmtMan = (v: number): string => {
                                      if (v <= 0) return "-";
                                      if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억`;
                                      if (v >= 10_000) return `${(v / 10_000).toFixed(1)}만`;
                                      return v.toLocaleString();
                                    };
                                    const minOrder = Number((p as any).min_order ?? 0);
                                    return (
                                      <tr key={`flow-${p.product_code}-${i}`} className={`transition ${selectedFlowCodes.has(String(p.product_code)) ? "bg-slate-50" : "hover:bg-slate-50/70"}`}>
                                        {/* 2026-07-29 · 체크박스 + 순위 한 셀 통합 (사용자 요청) */}
                                        <td className="text-center px-1 py-2 align-top" style={{ width: 48, minWidth: 48, maxWidth: 48 }}>
                                          <div className="flex items-center justify-center gap-1.5">
                                            <span onClick={(e) => { e.stopPropagation(); toggleSelectFlow(String(p.product_code)); }}
                                              className="cursor-pointer inline-flex items-center justify-center">
                                              {selectedFlowCodes.has(String(p.product_code))
                                                ? <CheckSquare size={13} className="text-slate-500" />
                                                : <Square size={13} className="text-slate-300 hover:text-slate-500" />}
                                            </span>
                                            <span className="text-[12px] font-semibold text-slate-400 tabular-nums">{i + 1}</span>
                                          </div>
                                        </td>
                                        <td className="px-2 py-2.5 align-top">
                                          <button
                                            type="button"
                                            onClick={() => loadFlowSelectedProduct(p)}
                                            className="text-left text-[13px] font-black text-slate-700 hover:text-slate-900 hover:underline break-words whitespace-normal leading-snug cursor-pointer transition"
                                            title={`${p.product_name} · 클릭하면 오른쪽에 상세 정보 (모바일 · 모달)`}
                                          >
                                            {p.product_name}
                                            {(p as any).min_order != null && (p as any).min_order > 0 && (
                                              <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-sm text-[10px] font-black text-slate-500 bg-slate-100 border border-slate-200 align-middle" title={`최소주문량 ${(p as any).min_order}`}>
                                                최소{(p as any).min_order}
                                              </span>
                                            )}
                                          </button>
                                          {p.supplier && (
                                            <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                              <span className="text-[11px] font-medium text-slate-400 break-words whitespace-normal">{p.supplier}</span>
                                              <VendorCategoryBadge category={vendorCategoryMap[p.supplier] ?? null} />
                                            </div>
                                          )}
                                        </td>
                                        {/* === 재고현황 그룹 (판매량 · 현재고 · 적정재고) === */}
                                        {!isFlowGroupCollapsed("stock") && <>
                                          <td
                                            className="text-right px-1.5 py-2.5 font-black text-[14px] bg-slate-50/60 align-top tabular-nums text-slate-700"
                                            title="판매출고계 · 실제 팔린 양"
                                          >{fmt(saleV)}</td>
                                          {(() => {
                                            const close = Number(p.closing_stock ?? 0);
                                            const opt = Number((p as any).optimal_stock ?? 0);
                                            const mismatch = close !== cur;
                                            const belowOptimal = opt > 0 && cur < opt;
                                            // 2026-07-29 · 현재고 < 적정재고 시 빨간색 (사용자 요청)
                                            return (
                                              <td
                                                className={`text-right px-1.5 py-2.5 font-black text-[12px] align-top tabular-nums ${cur <= 0 || mismatch || belowOptimal ? "text-rose-500" : "text-slate-700"}`}
                                                title={belowOptimal ? `현재고 부족 · ${cur} < 적정재고 ${opt}` : mismatch ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(close)}) · 스냅샷 이후 변동 있음` : "ERP 현재고 (= 스냅샷 종료재고)"}
                                              >{fmt(cur)}</td>
                                            );
                                          })()}
                                          {(() => {
                                            const opt = Number((p as any).optimal_stock ?? 0);
                                            const below = opt > 0 && cur < opt;
                                            return (
                                              <td className={`text-right px-1.5 py-2.5 font-black text-[12px] align-top tabular-nums ${opt <= 0 ? "text-slate-300" : below ? "text-rose-400" : "text-slate-500"}`}
                                                title={opt > 0 ? `적정재고 ${fmt(opt)}${below ? ` · 현재고 부족 (${cur}/${opt})` : ""}` : "적정재고 미설정"}>
                                                {opt > 0 ? fmt(opt) : "-"}
                                              </td>
                                            );
                                          })()}
                                        </>}
                                        {/* 그룹 접힘 시 빈 셀 placeholder (colSpan 맞춤용) */}
                                        {isFlowGroupCollapsed("stock") && <td className="bg-slate-50/20"></td>}
                                        {/* === 매입현황 그룹 (매입주기 · 최근매입일 · 최근매입량) === */}
                                        {!isFlowGroupCollapsed("purchase") && <>
                                          <td className={`text-right px-1.5 py-2.5 font-black text-[12px] align-top tabular-nums ${purchaseCycle != null ? "text-slate-600" :
                                            purchaseCount === 1 ? "text-slate-400" :
                                              purchaseCount >= 2 && firstPD === lastPD ? "text-slate-400" :
                                                "text-slate-300"
                                            }`}
                                            title={
                                              purchaseCycle != null
                                                ? `${purchaseCount}회 매입 · 평균 ${purchaseCycle}일 주기`
                                                : purchaseCount === 1 && lastPD
                                                  ? `1회만 매입됨 (${lastPD}) · 주기 계산 불가`
                                                  : purchaseCount >= 2 && firstPD === lastPD
                                                    ? `${purchaseCount}회 매입 모두 같은 날짜 (${lastPD}) · 주기 계산 불가`
                                                    : "매입 이력 없음 (purchase_details 미조인 가능성)"
                                            }>
                                            {purchaseCycle != null
                                              ? `${purchaseCycle}일`
                                              : purchaseCount === 1
                                                ? "1회"
                                                : purchaseCount >= 2 && firstPD === lastPD
                                                  ? "동일일"
                                                  : "-"}
                                          </td>
                                          <td className="text-right px-1.5 py-2.5 text-slate-500 font-black text-[12px] align-top tabular-nums"
                                            title={lastPD ?? undefined}>
                                            {lastPDShort}
                                          </td>
                                          <td className="text-right px-1.5 py-2.5 text-slate-600 font-black text-[12px] align-top tabular-nums"
                                            title={purchV > 0 ? `최근매입량 ${fmt(purchV)}` : "매입 없음"}>
                                            {purchV > 0 ? fmt(purchV) : "-"}
                                          </td>
                                        </>}
                                        {isFlowGroupCollapsed("purchase") && <td className="bg-slate-50/20"></td>}
                                        {/* === 판매현황 그룹 · 2026-07-30 · 재고금액 → 판매량(sale_qty) · ERP단가 · 판매가 · 이익률 === */}
                                        {!isFlowGroupCollapsed("sales") && <>
                                          <td className="text-right px-1.5 py-2.5 text-rose-700 font-black text-[12px] align-top tabular-nums"
                                            title="판매량 · 조회기간 sale_qty 합계">
                                            {saleV > 0 ? fmt(saleV) : "-"}
                                          </td>
                                          {/* 2026-07-31 · 판매금액 (기간별 total_amount 합계) · 만원/억 축약 · fmtMan */}
                                          {(() => {
                                            const saleAmount = Number((p as any).total_amount ?? 0);
                                            return (
                                              <td className="text-right px-1.5 py-2.5 text-rose-600 font-black text-[12px] align-top tabular-nums"
                                                title={saleAmount > 0 ? `판매금액 ${saleAmount.toLocaleString()}원 · 조회기간 total_amount 합계` : "판매금액 없음"}>
                                                {fmtMan(saleAmount)}
                                              </td>
                                            );
                                          })()}
                                          <td className="text-right px-1.5 py-2.5 text-slate-500 font-black text-[12px] align-top tabular-nums" title="ERP 사입 단가 (products.purchase_price)">{purP > 0 ? fmtWon(purP) : "-"}</td>
                                          <td className="text-right px-1.5 py-2.5 text-slate-600 font-black text-[12px] align-top tabular-nums">{saleP > 0 ? fmtWon(saleP) : "-"}</td>
                                          <td className={`text-right px-1.5 py-2.5 font-black text-[12px] align-top tabular-nums ${profitRate == null ? "text-slate-300" : profitRate >= 30 ? "text-slate-700" : profitRate >= 15 ? "text-slate-600" : profitRate >= 0 ? "text-slate-500" : "text-rose-500"}`}
                                            title={profitRate != null ? `(판매가 ${fmtWon(saleP)} − 최근매입가 ${fmtWon(purP)}) / 판매가 = ${profitRate}%` : "-"}>
                                            {profitRate != null ? `${profitRate}%` : "-"}
                                          </td>
                                        </>}
                                        {isFlowGroupCollapsed("sales") && <td className="bg-slate-50/20"></td>}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        ) : (
                          topProducts.length === 0 ? (
                            <div className="text-center text-[13px] text-slate-300 py-6">
                              {loading ? "불러오는 중..." : "OCR 매입 데이터 없음"}
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm min-w-[280px]">
                                <thead className="sticky top-0 bg-white z-10">
                                  <tr className="border-b border-slate-100 text-[12px] text-slate-400 uppercase tracking-wider">
                                    <th className="text-left px-1 py-1.5 w-8">#</th>
                                    <th className="text-left px-1 py-1.5">상품명</th>
                                    <th className="text-right px-1 py-1.5 w-16">수량</th>
                                    <th className="text-right px-1 py-1.5 w-24">금액</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {topProducts.map((p, i) => (
                                    <tr key={`top-${p.product_name}-${i}`} className="hover:bg-slate-50/60 transition-all duration-150">
                                      <td className="px-1 py-1.5 text-[12px] font-black text-emerald-600">{i + 1}</td>
                                      <td className="px-1 py-1.5">
                                        <div className="font-bold text-slate-700 break-words whitespace-normal leading-tight">{p.product_name}</div>
                                        {p.supplier && <div className="text-[12px] text-slate-400 break-words whitespace-normal leading-tight">{p.supplier}</div>}
                                      </td>
                                      <td className="text-right px-1 py-1.5 tabular-nums text-slate-600">{fmt(p.totalQty)}</td>
                                      <td className="text-right px-1 py-1.5 tabular-nums font-bold text-slate-800">{fmtWon(p.totalAmount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        )}
                      </div>
                      </>
                      )}
                    </div>
                  </section>
                  {/* 좌측 재고리스트 wrapper close */}
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
                  onSupplierInfoOpen={(nm) => openSupplierDetailModal(nm)}
                />
              </div>
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

      {/* 2026-07-30 · 사용자 요청 · 공급사 정보 조회·수정 모달 */}
      {supplierDetailModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={() => setSupplierDetailModal(null)}>
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-white rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <VendorDetailModal
              vendor={supplierDetailModal}
              onClose={() => setSupplierDetailModal(null)}
              onSaved={() => setSupplierDetailModal(null)}
            />
          </div>
        </div>
      )}

      {/* ── 공급사별 상품 상세 모달 (판매출고계 내림차순) ── */}
      {supplierModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
          onClick={() => { setSupplierModal(null); setSupplierModalRows(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-slate-200 bg-sky-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Building2 size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-black text-slate-800 break-keep">{supplierModal.supplier}</span>
                    {supplierModal.code && (
                      <span className="text-[10px] tabular-nums text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
                        #{supplierModal.code}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-orange-600">판매출고계</span>
                    <span>내림차순</span>
                    {flowSnapshot && <span className="tabular-nums text-slate-400">· {flowSnapshot}</span>}
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
                  className="w-20 text-[11px] tabular-nums border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-400"
                />
                <span className="text-[10px] text-slate-400">~</span>
                <input
                  type="number"
                  value={modalQtyMax}
                  onChange={(e) => setModalQtyMax(e.target.value)}
                  placeholder="최대"
                  className="w-20 text-[11px] tabular-nums border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-400"
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
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                  <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
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
                          className="hover:bg-slate-50/60 transition-all duration-150"
                        >
                          <td className="px-0.5 py-1.5 text-orange-600 font-black text-[12px] align-top">{i + 1}</td>
                          <td className="px-0.5 py-1.5 align-top" style={{ width: supplierModalNameWidth }}>
                            <button
                              type="button"
                              onClick={() => openScanProductModal(p)}
                              className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-600 hover:underline break-words whitespace-normal leading-tight cursor-pointer transition w-full"
                              title={`${p.product_name} · 클릭하면 상세 정보`}
                            >{p.product_name}</button>
                          </td>
                          <td className="px-0.5 py-1.5 tabular-nums text-slate-500 text-right bg-slate-50/40 align-top">{fmt(p.opening_stock)}</td>
                          <td className="px-0.5 py-1.5 tabular-nums text-emerald-700 text-right bg-emerald-50/40 align-top" title={p.last_purchase_date ? `최근 매입: ${p.last_purchase_date}` : "매입 이력 없음"}>
                            {fmt(p.purchase_qty)}
                            {(() => {
                              const md = extractMonthDay(p.last_purchase_date);
                              return md ? <span className="text-[9px] text-slate-400 font-normal ml-0.5">({md})</span> : null;
                            })()}
                          </td>
                          <td className="px-0.5 py-1.5 tabular-nums font-black text-orange-700 text-right bg-orange-50/40 align-top">{fmt(p.sale_qty)}</td>
                          <td
                            className={`px-0.5 py-1.5 tabular-nums font-black text-right bg-amber-50/40 align-top ${cur <= 0 ? "text-red-600" : cur !== Number(p.closing_stock ?? 0) ? "text-red-600" : "text-amber-700"}`}
                            title={cur !== Number(p.closing_stock ?? 0) ? `현재고(${fmt(cur)}) ≠ 스냅샷 종료재고(${fmt(p.closing_stock)}) · 스냅샷 이후 변동 있음` : "ERP 현재고 (= 스냅샷 종료재고)"}
                          >{fmt(cur)}</td>
                          <td
                            className={`px-0.5 py-1.5 tabular-nums text-right bg-rose-50/40 align-top ${loss > 0 ? "text-rose-600 font-black" : loss < 0 ? "text-emerald-600 font-bold" : "text-slate-400"}`}
                            title={`손실 = (시작${fmt(openV)} − 판매${fmt(saleV)}) − 종료${fmt(closeV)} = ${loss > 0 ? "-" + fmt(loss) : loss < 0 ? "+" + fmt(Math.abs(loss)) : "0"}${Number(p.purchase_qty ?? 0) > 0 ? `\n※ 입고 ${fmt(Number(p.purchase_qty ?? 0))} 있음 (참고)` : ""}`}
                          >{loss === 0 ? "0" : loss > 0 ? `-${fmt(loss)}` : `+${fmt(Math.abs(loss))}`}</td>
                          <td className="px-0.5 py-1.5 tabular-nums text-slate-500 font-bold text-right align-top">{p.sale_price > 0 ? fmtWon(p.sale_price) : "-"}</td>
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
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[98vh] sm:max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-sky-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-sky-500 flex items-center justify-center shrink-0 shadow-sm">
                  <TrendingUp size={20} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 break-words leading-tight">{infoModal.name}</div>
                  <div className="text-[11px] tabular-nums text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
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
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                  <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
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
                          <div className={`text-3xl font-black mt-1 tabular-nums ${currentStock < 0 ? "text-red-600" : "text-indigo-700"}`}>{fmt(currentStock)}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">
                            {optimalStock > 0 ? `적정 ${fmt(optimalStock)}` : "적정재고 없음"}
                          </div>
                        </div>
                        <div className="bg-white border border-orange-200 rounded-xl p-4 shadow-sm">
                          <div className="text-xs font-black text-orange-500 uppercase tracking-wider">일평균 판매</div>
                          <div className="text-3xl font-black text-orange-700 mt-1 tabular-nums">{avgSalePerDay.toFixed(1)}</div>
                          <div className="text-xs text-slate-500 mt-1 font-semibold">최근 {history.length}스냅샷 기준</div>
                        </div>
                        <div className={`bg-white border rounded-xl p-4 shadow-sm ${daysRemaining !== null && daysRemaining < 7 ? "border-red-300" : "border-emerald-200"}`}>
                          <div className={`text-xs font-black uppercase tracking-wider ${daysRemaining !== null && daysRemaining < 7 ? "text-red-500" : "text-emerald-500"}`}>재고 잔여일</div>
                          <div className={`text-3xl font-black mt-1 tabular-nums ${daysRemaining !== null && daysRemaining < 7 ? "text-red-700" : "text-emerald-700"}`}>
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
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">공급처</span><span className="text-sm font-bold text-slate-800 break-words whitespace-normal leading-tight">{prod.supplier ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">실제배치구역</span><span className="text-sm font-bold text-slate-800 break-words whitespace-normal leading-tight">{prod.real_map ?? prod.display_location ?? "-"}</span></div>
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
                                  className="w-20 text-right tabular-nums text-base font-black border-2 border-indigo-400 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 bg-white"
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
                                <span className={`text-base tabular-nums font-black ${optimalStock > 0 ? "text-slate-700" : "text-slate-400"}`}>{optimalStock > 0 ? fmt(optimalStock) : "입력"}</span>
                                <Pencil size={12} className="text-indigo-500" />
                              </button>
                            )}
                          </div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최소발주</span><span className="text-base tabular-nums font-black text-sky-700">{prod.min_order ?? "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">필요재고</span><span className="text-base tabular-nums font-black text-rose-600">{optimalStock > 0 && currentStock < optimalStock ? `+${fmt(optimalStock - currentStock)}` : "-"}</span></div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">유통기한</span>
                            <span className={`text-sm tabular-nums font-bold ${daysToExpiry !== null && daysToExpiry < 30 ? "text-red-600" : "text-slate-700"}`}>
                              {expIso ?? "-"}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 매입일</span>
                            <span className="text-sm tabular-nums font-bold text-slate-700">{lastPurchaseISO ?? "-"}</span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 판매일</span>
                            <span className={`text-sm tabular-nums font-bold ${daysSinceLastSale !== null && daysSinceLastSale >= 90 ? "text-rose-600" : "text-slate-700"}`}>
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
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">매입가</span><span className="text-base tabular-nums font-black text-slate-800">{purchasePrice > 0 ? fmtWon(purchasePrice) : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">판매가</span><span className="text-base tabular-nums font-black text-slate-800">{salePrice > 0 ? fmtWon(salePrice) : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">이익률</span><span className="text-base tabular-nums font-black text-emerald-700">{profitRate != null ? `${profitRate}%` : "-"}</span></div>
                          <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">개당 이익</span><span className="text-base tabular-nums font-black text-emerald-700">{(salePrice > 0 && purchasePrice > 0) ? fmtWon(salePrice - purchasePrice) : "-"}</span></div>
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
                                    <div className="text-[11px] tabular-nums text-orange-600 font-black">{v}</div>
                                    <div className="w-full bg-gradient-to-t from-orange-500 to-orange-300 rounded-t" style={{ height: `${h}%`, minHeight: "3px" }} />
                                    <div className="text-[10px] text-slate-500 tabular-nums">{String(r.snapshot_date).slice(5)}</div>
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
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 판매</span><span className="text-base tabular-nums font-black text-orange-700">{fmt(totalSale)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 매입</span><span className="text-base tabular-nums font-black text-emerald-700">{fmt(totalPurchase)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">누적 폐기</span><span className={`text-base tabular-nums font-black ${totalDisposal > 0 ? "text-rose-700" : "text-slate-500"}`}>{fmt(totalDisposal)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">사내소비</span><span className="text-base tabular-nums font-black text-slate-700">{fmt(totalInternal)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">평균 종료재고</span><span className="text-base tabular-nums font-bold text-slate-700">{avgStock.toFixed(1)}개</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">스냅샷 수</span><span className="text-base tabular-nums font-bold text-slate-700">{history.length}회</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최초 스냅샷</span><span className="text-sm tabular-nums text-slate-600">{oldestSnap?.snapshot_date ?? "-"}</span></div>
                            <div><span className="text-xs text-slate-500 font-semibold block mb-0.5">최근 스냅샷</span><span className="text-sm tabular-nums text-slate-600">{latestSnap?.snapshot_date ?? "-"}</span></div>
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
                              <div className="text-2xl font-black text-cyan-700 tabular-nums mt-1">{latestInv.warehouse_stock != null ? fmt(Number(latestInv.warehouse_stock)) : "-"}</div>
                            </div>
                            <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                              <div className="text-xs font-semibold text-violet-500">매장</div>
                              <div className="text-2xl font-black text-violet-700 tabular-nums mt-1">{latestInv.store_stock != null ? fmt(Number(latestInv.store_stock)) : "-"}</div>
                            </div>
                            <div className="bg-slate-100 border border-slate-300 rounded-lg p-3">
                              <div className="text-xs font-semibold text-slate-500">실재고 합</div>
                              <div className="text-2xl font-black text-slate-700 tabular-nums mt-1">{invActual !== null ? fmt(invActual) : "-"}</div>
                            </div>
                            <div className={`border rounded-lg p-3 ${invDiff !== null && invDiff !== 0 ? "bg-rose-50 border-rose-300" : "bg-emerald-50 border-emerald-300"}`}>
                              <div className={`text-xs font-semibold ${invDiff !== null && invDiff !== 0 ? "text-rose-500" : "text-emerald-500"}`}>차이 (실-시스)</div>
                              <div className={`text-2xl font-black tabular-nums mt-1 ${invDiff !== null && invDiff !== 0 ? "text-rose-700" : "text-emerald-700"}`}>{invDiff !== null ? (invDiff > 0 ? `+${fmt(invDiff)}` : fmt(invDiff)) : "-"}</div>
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
                                  <td className="px-2 py-1 tabular-nums text-[11px] text-slate-700">{s.snapshot_date}</td>
                                  <td className="px-2 py-1.5 text-xs text-slate-600 font-semibold">{s.period_type === "early" ? "초순" : s.period_type === "mid" ? "중순" : s.period_type === "late" ? "하순" : (s.period_type ?? "-")}</td>
                                  <td className="text-right px-2 py-1 tabular-nums text-xs text-slate-600">{fmt(Number(s.opening_stock ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 tabular-nums font-bold text-sm text-emerald-700">{fmt(Number(s.purchase_qty ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 tabular-nums font-black text-sm text-orange-700">{fmt(Number(s.sale_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 tabular-nums text-xs ${Number(s.disposal_qty ?? 0) > 0 ? "text-rose-600 font-bold" : "text-slate-400"}`}>{fmt(Number(s.disposal_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 tabular-nums text-xs ${Math.abs(Number(s.adjustment_qty ?? 0)) > 0 ? "text-purple-600 font-bold" : "text-slate-400"}`}>{fmt(Number(s.adjustment_qty ?? 0))}</td>
                                  <td className={`text-right px-2 py-1 tabular-nums text-xs ${Number(s.closing_stock ?? 0) < 0 ? "text-red-600 font-bold" : "text-slate-700"}`}>{fmt(Number(s.closing_stock ?? 0))}</td>
                                  <td className="text-right px-2 py-1.5 tabular-nums text-xs text-slate-600">{fmtWon(Number(s.total_amount ?? 0))}</td>
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
                                    <td className="px-2 py-1.5 text-xs tabular-nums text-slate-700">
                                      {c.checked_at ? new Date(c.checked_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                                    </td>
                                    <td className="text-right px-2 py-1.5 tabular-nums font-bold text-sm text-cyan-700">{c.warehouse_stock != null ? fmt(Number(c.warehouse_stock)) : "-"}</td>
                                    <td className="text-right px-2 py-1.5 tabular-nums font-bold text-sm text-violet-700">{c.store_stock != null ? fmt(Number(c.store_stock)) : "-"}</td>
                                    <td className="text-right px-2 py-1 tabular-nums text-xs text-slate-600">{c.system_stock != null ? fmt(Number(c.system_stock)) : "-"}</td>
                                    <td className="px-2 py-1.5 text-xs text-slate-700 break-words whitespace-normal">{c.checked_by ?? "-"}</td>
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
            className="bg-white rounded-xl shadow-2xl w-full max-w-md sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-emerald-50/50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Package size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-black text-slate-800 break-words leading-tight">{scanProductModal.name}</div>
                  <div className="text-[11px] tabular-nums text-slate-500 mt-0.5">#{scanProductModal.code}</div>
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
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[98vh] sm:max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-amber-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
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
                <div className="flex flex-col items-center justify-center gap-3 py-8">
                  <div className="w-10 h-10 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                  <div className="text-xs font-black text-slate-600">데이터 로딩중...</div>
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
                          <div className="text-sm font-black text-slate-800 break-words leading-tight">{p.product_name}</div>
                          <div className="text-[10px] tabular-nums text-slate-400 break-words whitespace-normal leading-tight">
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
