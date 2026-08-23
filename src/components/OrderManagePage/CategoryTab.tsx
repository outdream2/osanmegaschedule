// src/components/OrderManagePage/CategoryTab.tsx
// 카테고리별 판매현황 탭 · 2026-08-03 · SalesTrendPage.tsx 에서 이동
//   real_map 기반 구역별 판매금액·수량 집계 + 매장 구역도

import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, Layers, PieChart } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { getProductsMap } from "../../lib/productsCache";
import { SeasonButtons } from "../common/SeasonButtons";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { StoreZoneMap } from "../common/StoreZoneMap";
import { getZoneLabel } from "../../constants/zoneLabels";
import { ZONE_DEFS } from "../../constants/displayZones";
import { type ClassFilter } from "../../utils/productClassify";
// T-CSS Phase 2 · 2026-08-06
import { CARD_BASE } from "../../styles/tokens";
import { fmtWonCompact } from "../../lib/format";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { AccentBar } from "../common/AccentBar";
// 2026-08-23 · #185 · PageToolbar 프리미티브 통일 · 통계 서브탭 UI 통일
import { PageToolbar } from "../common/PageToolbar";
// 2026-08-21 · Framework Phase 3 · fetch → apiClient
import { api } from "../../lib/apiClient";
import { InlineLabel } from "../common/InlineLabel";
import { useColumnResize, RESIZER_CLS } from "../../hooks/useColumnResize";
import { API_LIMITS } from "../../constants/apiLimits";
import { useResizablePanel } from "../../hooks/useResizablePanel";
import { useToast, toastClass } from "../../hooks/useToast";

// ─── 구역 코드 → 카테고리 설명 매핑 ──────────────────────────────────────────
const ZONE_CATEGORY_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const z of ZONE_DEFS) {
    const nStr = String(z.num);
    if (z.subA && z.subB) {
      map[`${nStr}A`] = z.subA;
      map[`${nStr}B`] = z.subB;
    }
    map[nStr] = z.category;
  }
  return map;
})();

const zoneCategoryLabel = (zone: string): string => {
  if (!zone || zone === "미배치") return "미배치 상품";
  return ZONE_CATEGORY_MAP[zone.toUpperCase()] ?? ZONE_CATEGORY_MAP[zone.replace(/[AB]$/, "")] ?? "";
};

// ─── 타입 ───────────────────────────────────────────────────────────────────
type ZoneItemSortKey = "name" | "sale" | "current" | "amount";

// ─── ZoneCategoryContent ────────────────────────────────────────────────────
const ZoneCategoryContent: React.FC = () => {
  const { toast, showError } = useToast();
  // zone-labels-changed 이벤트 수신 → 강제 리렌더 (getZoneLabel 이 mutable 모듈 변수 참조)
  const [, setZoneLabelVersion] = useState(0);
  useEffect(() => {
    const handler = () => setZoneLabelVersion(v => v + 1);
    window.addEventListener("zone-labels-changed", handler);
    return () => window.removeEventListener("zone-labels-changed", handler);
  }, []);

  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [months, setMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  const [itemSort, setItemSort] = useState<{ key: ZoneItemSortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });
  const toggleItemSort = (k: ZoneItemSortKey) => {
    setItemSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };
  const { getWidth, resizerProps } = useColumnResize("categoryTab", {
    num:      { default: 24,  min: 20, max: 48  },
    supplier: { default: 96,  min: 60, max: 180 },
    name:     { default: 200, min: 100, max: 400 },
    sale:     { default: 56,  min: 40, max: 100 },
    amount:   { default: 64,  min: 48, max: 120 },
    last_pur: { default: 64,  min: 48, max: 120 },
    optimal:  { default: 56,  min: 40, max: 100 },
  });

  // 카테고리 패널 폭 (useResizablePanel 훅 · god-phase1)
  const { width: categoryPanelWidth, startResize: onCategoryResizeStart } = useResizablePanel({
    storageKey: "megatown_salestrend_category_w",
    defaultWidth: 400,
    minWidth: 260,
    maxWidth: 800,
  });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.MAX) });
    if (season) params.set("season", season);
    else if (months > 0) params.set("months", String(months));
    // 2026-08-21 · Framework Phase 3 · fetch → apiClient
    Promise.all([
      api.get<{ rows?: any[] }>(`/api/stock-manage/top-sales?${params}`).catch(() => ({ data: { rows: [] } })),
      getProductsMap(),
    ])
      .then(([s, p]) => { setSales(Array.isArray(s.data?.rows) ? s.data.rows : []); setProducts(p ?? {}); })
      .catch((e: any) => { setSales([]); setProducts({}); showError(`구역현황 로드 실패: ${e?.message ?? "네트워크 오류"}`); })
      .finally(() => setLoading(false));
  }, [season, months]);

  const grouped = useMemo(() => {
    // 2026-08-10 · 사용자 정책 · 진열위치 구역 = spec (real_map 은 실제진열위치 · 별도)
    // spec "8A/냉" 같은 "/" 분리 상품 · 첫 부분(primary)만 카운트
    const parsePrimaryZone = (raw: string): string => {
      if (!raw) return "미배치";
      const t = String(raw).trim();
      if (!t) return "미배치";
      const primary = t.split(/[\/\-_\s]/)[0];
      return (primary ?? "").slice(0, 4) || "미배치";
    };
    const map = new Map<string, { zone: string; saleQty: number; totalAmount: number; items: Array<{ code: string; name: string; saleQty: number; amount: number; currentStock: number; supplier: string; optimalStock: number; lastPurchaseDate: string | null }> }>();
    for (const r of sales) {
      const code = String(r.product_code ?? "");
      const p = products[code] ?? {};
      const zone = String((p as any).spec ?? "").trim();
      const key = parsePrimaryZone(zone);
      const cur = map.get(key) ?? { zone: key, saleQty: 0, totalAmount: 0, items: [] };
      const saleQty = Number(r.sale_qty ?? 0) || 0;
      const amount = Number(r.total_amount ?? 0) || 0;
      if (saleQty > 0 || amount > 0) {
        cur.saleQty += saleQty;
        cur.totalAmount += amount;
        cur.items.push({
          code,
          name: String(r.product_name ?? ""),
          saleQty,
          amount,
          currentStock: Number(r.current_stock ?? 0),
          supplier: String(p.supplier ?? r.supplier ?? ""),
          optimalStock: Number(p.optimal_stock ?? 0),
          lastPurchaseDate: p.last_purchase_date ?? null,
        });
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [sales, products]);

  const total = grouped.reduce((s, g) => s + g.totalAmount, 0);
  const fmt = (n: number) => n.toLocaleString();
  const fmtWon = fmtWonCompact;
  const ZONE_COLORS = ["sky", "emerald", "amber", "rose", "indigo", "teal", "violet", "orange"];
  const colorForZone = (zone: string) => ZONE_COLORS[Math.abs(zone.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % ZONE_COLORS.length];

  const selectedGroup = grouped.find(g => g.zone === selectedZone) ?? null;

  // 상비약 / 일반약 / 전체 3-way 필터 (localStorage 저장)
  type ZoneListSortKey = "amount" | "qty" | "count";
  const [essentialSort, setEssentialSort] = useState<ZoneListSortKey>("amount");
  const [generalSort, setGeneralSort] = useState<ZoneListSortKey>("amount");
  const [allSort, setAllSort] = useState<ZoneListSortKey>("amount");
  const [classFilter, setClassFilter] = useState<ClassFilter>(() => {
    try {
      const v = localStorage.getItem("megatown_category_classfilter");
      return v === "stationery" || v === "general" || v === "all" ? v : "stationery";
    } catch { return "stationery"; }
  });
  useEffect(() => { try { localStorage.setItem("megatown_category_classfilter", classFilter); } catch { /**/ } }, [classFilter]);

  const zoneNum = (zone: string): number => {
    const m = zone.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
  };
  const isEssential = (zone: string) => zoneNum(zone) <= 9 && zoneNum(zone) > 0;

  const sortGroupList = (list: typeof grouped, key: ZoneListSortKey) =>
    [...list].sort((a, b) =>
      key === "qty" ? b.saleQty - a.saleQty :
        key === "count" ? b.items.length - a.items.length :
          b.totalAmount - a.totalAmount
    );

  const essentialGroups = useMemo(() => sortGroupList(grouped.filter(g => isEssential(g.zone)), essentialSort), [grouped, essentialSort]);
  const generalGroups = useMemo(() => sortGroupList(grouped.filter(g => !isEssential(g.zone)), generalSort), [grouped, generalSort]);
  const allGroups = useMemo(() => sortGroupList(grouped, allSort), [grouped, allSort]);

  const renderZoneCard = (g: typeof grouped[number], rank: number) => {
    const pct = total > 0 ? (g.totalAmount / total) * 100 : 0;
    const isSelected = selectedZone === g.zone;
    const color = colorForZone(g.zone);
    const barCls = { sky: "bg-sky-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400", indigo: "bg-indigo-400", teal: "bg-teal-400", violet: "bg-violet-400", orange: "bg-orange-400" }[color]!;
    const textCls = { sky: "text-sky-700", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", indigo: "text-indigo-700", teal: "text-teal-700", violet: "text-violet-700", orange: "text-orange-700" }[color]!;
    const selectedBorder = isSelected ? "border-violet-400 bg-violet-50/60 shadow-sm" : "border-line hover:bg-zinc-50";
    const rankCls = rank <= 2
      ? "bg-rose-500 text-white border-rose-600"
      : rank <= 4
        ? "bg-sky-500 text-white border-sky-600"
        : rank <= 6
          ? "bg-emerald-500 text-white border-emerald-600"
          : rank <= 8
            ? "bg-violet-500 text-white border-violet-600"
            : rank <= 10
              ? "bg-zinc-400 text-white border-zinc-500"
              : "bg-white text-zinc-400 border-line";

    // 판매량 상위 베스트 아이템 (최대 3개)
    const bestItems = [...g.items]
      .sort((a, b) => b.saleQty - a.saleQty)
      .slice(0, 3);

    return (
      <button
        key={g.zone}
        type="button"
        onClick={() => setSelectedZone(prev => prev === g.zone ? null : g.zone)}
        className={`w-full flex flex-col gap-1.5 p-2.5 rounded-xl border cursor-pointer text-left transition ${selectedBorder}`}
      >
        {/* 베스트 아이템 한 행 */}
        {bestItems.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {bestItems.map((it, i) => (
              <span
                key={it.code}
                className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-zinc-600 bg-zinc-50 border border-line rounded px-1.5 py-0.5 leading-tight break-words whitespace-normal"
                title={it.name}
              >
                <span className="text-[15px] font-bold text-orange-500 tabular-nums shrink-0">{i + 1}</span>
                <span className="line-clamp-1">{it.name}</span>
              </span>
            ))}
          </div>
        )}
        {/* 구역 정보 행 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center justify-center w-[20px] h-[20px] text-[14px] font-bold rounded-md border tabular-nums shrink-0 ${rankCls}`}
              title={`그룹 내 순위 ${rank}위`}>
              {rank}
            </span>
            {/* 2026-08-23 · #184 · 구역 배지 강조 · 크기 up · 배경/테두리 shadow */}
            <span className={`text-[17px] font-extrabold ${textCls} tabular-nums shrink-0 px-2 py-0.5 rounded-md bg-white/90 border border-current shadow-sm`}>{getZoneLabel(g.zone)}</span>
            {zoneCategoryLabel(g.zone) && (
              <span className={`text-[15px] font-bold ${textCls} break-words whitespace-normal leading-tight`}
                title={zoneCategoryLabel(g.zone)}>
                {zoneCategoryLabel(g.zone)}
              </span>
            )}
          </div>
          <span className={`text-zinc-400 text-[14px] transition-transform shrink-0 ${isSelected ? "rotate-90" : ""}`}>▶</span>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap text-[15px] tabular-nums">
          <div className="flex items-center gap-1.5 text-zinc-500 font-semibold">
            <span>상품 <span className="font-bold text-zinc-700">{g.items.length}</span>종</span>
            <span className="text-zinc-300">·</span>
            <span>판매 <span className="font-bold text-orange-700">{fmt(g.saleQty)}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-700 text-[14px]">{fmtWon(g.totalAmount)}</span>
            <span className="text-[14px] font-bold text-zinc-400">{pct.toFixed(1)}%</span>
          </div>
        </div>
        <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div className={`h-full ${barCls} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </button>
    );
  };

  const renderGroupSection = (
    label: string,
    badge: string,
    badgeCls: string,
    list: typeof grouped,
    sortKey: ZoneListSortKey,
    setSortKey: (k: ZoneListSortKey) => void,
  ) => {
    const SORT_OPTIONS: Array<{ key: ZoneListSortKey; label: string }> = [
      { key: "amount", label: "판매액" },
      { key: "qty", label: "판매량" },
      { key: "count", label: "상품수" },
    ];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 flex-wrap px-0.5 pt-1">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[15px] font-bold border ${badgeCls}`}>{badge}</span>
            <span className="text-[14px] font-semibold text-zinc-700">{label}</span>
            <span className="text-[15px] text-zinc-400 tabular-nums">{list.length}개 구역</span>
          </div>
          <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortKey(opt.key)}
                className={`px-2 py-0.5 text-[15px] font-semibold rounded transition cursor-pointer ${sortKey === opt.key ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="text-[15px] text-zinc-300 py-2 text-center">해당 구역 없음</div>
        ) : (
          list.map((g, idx) => renderZoneCard(g, idx + 1))
        )}
      </div>
    );
  };

  const renderDetailPanel = (g: typeof grouped[number]) => {
    const color = colorForZone(g.zone);
    const textCls = { sky: "text-sky-700", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", indigo: "text-indigo-700", teal: "text-teal-700", violet: "text-violet-700", orange: "text-orange-700" }[color]!;
    const pct = total > 0 ? (g.totalAmount / total) * 100 : 0;
    const sortedItems = [...g.items].sort((a, b) => {
      const sign = itemSort.dir === "asc" ? 1 : -1;
      switch (itemSort.key) {
        case "name": return sign * String(a.name).localeCompare(String(b.name), "ko");
        case "sale": return sign * (a.saleQty - b.saleQty);
        case "current": return sign * (a.currentStock - b.currentStock);
        default: return sign * (a.amount - b.amount);
      }
    });
    const sortableTh = (k: ZoneItemSortKey, label: string, extraCls: string, colKey: Parameters<typeof getWidth>[0]) => {
      const active = itemSort.key === k;
      return (
        <th onClick={() => toggleItemSort(k)}
          className={`relative cursor-pointer select-none hover:bg-zinc-50 transition ${extraCls} ${active ? "font-bold" : ""}`}
          style={{ width: getWidth(colKey), minWidth: getWidth(colKey) }}
          title={`${label} 정렬 (${active ? (itemSort.dir === "asc" ? "오름차순 · 클릭 → 내림차순" : "내림차순 · 클릭 → 오름차순") : "클릭하여 정렬"})`}>
          <span className="inline-flex items-center gap-0.5">{label}
            {active
              ? <span className="text-[15px]">{itemSort.dir === "asc" ? "▲" : "▼"}</span>
              : <span className="text-[10px] text-zinc-300">⇅</span>}
          </span>
          <span {...resizerProps(colKey)} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
        </th>
      );
    };
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[15px] font-bold ${textCls} tabular-nums`}>{getZoneLabel(g.zone)}</span>
              {zoneCategoryLabel(g.zone) && (
                <span className={`text-sm font-semibold ${textCls}`}>{zoneCategoryLabel(g.zone)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedZone(null)}
              className="lg:hidden w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0"
              title="닫기"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-[15px]">
            <span className="text-zinc-500">상품 <span className="font-bold text-zinc-800">{g.items.length}개</span></span>
            <span className="text-zinc-500">판매 <span className="font-bold text-violet-700">{fmt(g.saleQty)}개</span></span>
            <span className="text-zinc-500">금액 <span className="font-bold text-emerald-700">{fmtWon(g.totalAmount)}</span></span>
            <span className="text-zinc-500">비중 <span className="font-bold text-orange-700">{pct.toFixed(1)}%</span></span>
          </div>
        </div>
        <div className={`${CARD_BASE} overflow-hidden flex-1`}>
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-xs sm:min-w-[540px]" style={{ tableLayout: "fixed" }}>
              <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                <tr className="text-[15px] text-zinc-500 uppercase tracking-wider">
                  <th className="relative text-left px-1 py-1.5" style={{ width: getWidth("num"), minWidth: getWidth("num") }}>
                    #
                    <span {...resizerProps("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                  <th className="relative text-left px-0.5 py-1.5" style={{ width: getWidth("supplier"), minWidth: getWidth("supplier") }}>
                    공급사
                    <span {...resizerProps("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                  {sortableTh("name", "상품명", "text-left px-0.5 py-1.5", "name")}
                  {sortableTh("sale", "판매량", "text-right px-0.5 py-1.5 text-orange-500 bg-orange-50/40", "sale")}
                  {sortableTh("amount", "판매금액", "text-right px-0.5 py-1.5 text-emerald-500 bg-emerald-50/40", "amount")}
                  <th className="relative text-right px-0.5 py-1.5 text-amber-600 bg-amber-50/40" style={{ width: getWidth("last_pur"), minWidth: getWidth("last_pur") }}>
                    최근매입
                    <span {...resizerProps("last_pur")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                  <th className="relative text-right px-0.5 py-1.5 text-zinc-600 bg-zinc-50/40" style={{ width: getWidth("optimal"), minWidth: getWidth("optimal") }}>
                    추천적정
                    <span {...resizerProps("optimal")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {sortedItems.slice(0, 200).map((it, i) => {
                  const lastPD = it.lastPurchaseDate;
                  const lastPDShort = lastPD && /^\d{4}-\d{2}-\d{2}/.test(String(lastPD))
                    ? `${String(lastPD).slice(5, 7)}/${String(lastPD).slice(8, 10)}`
                    : "-";
                  return (
                    <tr key={`${g.zone}-${it.code}`} className="hover:bg-zinc-50/60 align-top transition">
                      <td className="px-0.5 py-1.5 text-[14px] font-bold text-orange-600">{i + 1}</td>
                      <td className="px-0.5 py-1.5 text-[15px] text-zinc-500 break-words whitespace-normal leading-tight" title={it.supplier || undefined}>{it.supplier || "-"}</td>
                      <td className="px-0.5 py-1.5 break-words whitespace-normal leading-tight">
                        <span className="text-[15px] font-medium text-zinc-800 break-words whitespace-normal leading-tight" title={it.name}>{it.name}</span>
                      </td>
                      <td className="text-right px-0.5 py-1.5 text-[14px] tabular-nums text-orange-700 font-bold bg-orange-50/40">{fmt(it.saleQty)}</td>
                      <td className="text-right px-0.5 py-1.5 text-[14px] tabular-nums font-bold text-emerald-700 bg-emerald-50/40">{fmtWon(it.amount)}</td>
                      <td className="text-right px-0.5 py-1.5 text-[15px] tabular-nums text-amber-700 font-semibold bg-amber-50/40" title={lastPD ?? undefined}>{lastPDShort}</td>
                      <td className={`text-right px-0.5 py-1.5 text-[14px] tabular-nums font-bold bg-zinc-50/40 ${it.optimalStock > 0 ? "text-zinc-700" : "text-zinc-300"}`}>{it.optimalStock > 0 ? fmt(it.optimalStock) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {g.items.length > 200 && <div className="text-[15px] text-zinc-400 text-center py-1">상위 200개만 · 전체 {g.items.length}개</div>}
          </div>
        </div>
      </div>
    );
  };

  const zoneItemCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of grouped) m[g.zone] = g.items.length;
    return m;
  }, [grouped]);

  const zoneRankMap = useMemo(() => {
    const m: Record<string, number> = {};
    grouped.forEach((g, i) => { m[g.zone] = i + 1; });
    return m;
  }, [grouped]);

  return (
    <>
    {toast && (
      <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>
    )}
    <div className="flex flex-col gap-2">
      {/* 2026-08-23 · #185 · PageToolbar 프리미티브 통일 · 통계 서브탭 통일 */}
      <PageToolbar
        icon={<PieChart size={16} />}
        title="구역현황"
        count={grouped.length}
        countLabel="개 구역"
        leftSlot={<span className="text-[13px] text-ink-soft hidden md:inline">real_map 기반 · 구역 클릭 → 상품 상세</span>}
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <InlineLabel>기간</InlineLabel>
            <div className="inline-flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
              <button type="button" onClick={() => { setSeason(null); setMonths(0); }}
                className={`px-2.5 h-7 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${!season && months === 0 ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>
                10일
              </button>
              {[1, 2, 3, 4, 5, 6].map(m => (
                <button key={m} type="button" onClick={() => { setSeason(null); setMonths(m as any); }}
                  className={`px-2.5 h-7 text-[14px] font-semibold rounded-md transition-colors cursor-pointer ${!season && months === m ? "bg-brand-deep text-white shadow-sm" : "text-ink hover:text-brand-deep hover:bg-white"}`}>
                  {m}개월
                </button>
              ))}
            </div>
            <SeasonButtons value={season} onChange={(v) => { setSeason(v); if (v) setMonths(0); }} size="sm" hideLabel />
            {/* 새로고침 · 우측 정렬 · 딥네이비 hover */}
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.MAX) });
                if (season) params.set("season", season);
                else if (months > 0) params.set("months", String(months));
                // 2026-08-21 · Framework Phase 3 · fetch → apiClient
                Promise.all([
                  api.get<{ rows?: any[] }>(`/api/stock-manage/top-sales?${params}`).catch(() => ({ data: { rows: [] } })),
                  getProductsMap(),
                ])
                  .then(([s, p]) => { setSales(Array.isArray(s.data?.rows) ? s.data.rows : []); setProducts(p ?? {}); })
                  .catch((e: any) => { setSales([]); setProducts({}); showError(`새로고침 실패: ${e?.message ?? "네트워크 오류"}`); })
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-line bg-white hover:bg-brand-tint hover:border-brand-deep text-ink-soft hover:text-brand-deep transition-colors disabled:opacity-40 cursor-pointer"
              title="새로고침"
            >
              <Loader2 size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />

      {/* 매장 구역도 */}
      <StoreZoneMap
        zoneItemCounts={zoneItemCounts}
        zoneRankMap={zoneRankMap}
        showBestBadges
        collapsible
        defaultCollapsed
        title="🗺️ 매장 구역도 · 상위 map 동일 (참고)"
      />

      {/* 하단: 좌측 구역 리스트 + 우측 상세 split · 2026-08-17 · items-stretch · 좌우 높이 매칭 */}
      <div className="flex flex-col lg:flex-row gap-0 items-stretch flex-1 lg:min-h-[720px]">
        {/* 좌측: 구역 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-2"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? categoryPanelWidth : undefined }}
        >
          {loading && grouped.length > 0 && (
            <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-1 sticky top-0 z-10">
              <Spinner size={11} tone="violet" label="조건 변경 · 새로 불러오는 중..." labelSize={14} />
            </Card>
          )}
          {loading && grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <div className="w-10 h-10 border-4 border-line border-t-orange-500 rounded-full animate-spin" />
              <div className="text-xs font-bold text-zinc-600">데이터 로딩중...</div>
            </div>
          ) : !loading && grouped.length === 0 ? (
            <div className="text-center text-[15px] text-zinc-300 py-6">데이터 없음</div>
          ) : (
            <div className={`overflow-y-auto max-h-[65vh] pr-1 flex flex-col gap-2 ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
              <div className="flex items-center gap-1 border-b-2 border-line sticky top-0 bg-white z-10 -mx-1 px-1 pt-1">
                <button type="button" onClick={() => setClassFilter("stationery")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "stationery" ? "text-violet-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  상비약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({essentialGroups.length})</span>
                  {classFilter === "stationery" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-violet-500" />}
                </button>
                <button type="button" onClick={() => setClassFilter("general")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  일반약 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({generalGroups.length})</span>
                  {classFilter === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
                </button>
                <button type="button" onClick={() => setClassFilter("all")}
                  className={`relative px-4 py-2 text-[15px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${classFilter === "all" ? "text-zinc-800" : "text-zinc-400 hover:text-zinc-600"}`}>
                  전체 <span className="text-[15px] font-semibold text-zinc-400 ml-1 tabular-nums">({allGroups.length})</span>
                  {classFilter === "all" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-zinc-500" />}
                </button>
              </div>
              {classFilter === "stationery"
                ? renderGroupSection(
                  "상비약 (1~9구역)", "상비약",
                  "bg-violet-50 text-violet-700 border-violet-300",
                  essentialGroups, essentialSort, setEssentialSort,
                )
                : classFilter === "general"
                ? renderGroupSection(
                  "일반약 (10구역 이후)", "일반약",
                  "bg-sky-50 text-sky-700 border-sky-300",
                  generalGroups, generalSort, setGeneralSort,
                )
                : renderGroupSection(
                  "전체 구역", "전체",
                  "bg-zinc-100 text-zinc-700 border-zinc-300",
                  allGroups, allSort, setAllSort,
                )
              }
            </div>
          )}
        </div>

        {/* 리사이즈 핸들 (데스크탑만) */}
        <div
          onMouseDown={onCategoryResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-violet-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절"
        >
          <span className="text-[15px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 선택 구역 상세 */}
        <div
          className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 transition-transform duration-150 ${selectedZone ? "fixed inset-0 z-50 bg-zinc-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible p-3 lg:p-0" : ""}`}
          style={{ willChange: selectedZone ? "transform, opacity" : "auto" }}
        >
          {/* 모바일 fullscreen 헤더 */}
          {selectedZone && (
            <div className="lg:hidden sticky top-0 z-[60] bg-white border-b border-line shadow-md -mx-3 px-3 py-2 mb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedZone(null)}
                  className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0"
                  title="닫기"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-zinc-800 truncate leading-tight">
                    구역 {getZoneLabel(selectedZone)}{zoneCategoryLabel(selectedZone) ? ` · ${zoneCategoryLabel(selectedZone)}` : ""}
                  </div>
                  <div className="text-[14px] tabular-nums text-zinc-500 truncate">
                    {grouped.find(g => g.zone === selectedZone)?.items.length ?? 0}개 상품
                  </div>
                </div>
              </div>
            </div>
          )}
          {!selectedZone ? (
            <div className={`${CARD_BASE} flex-1 min-h-[400px]`}>
              <EmptyState icon={Layers} title="구역을 선택하세요" hint="해당 구역의 상품 판매 상세가 표시됩니다" />
            </div>
          ) : selectedGroup ? (
            renderDetailPanel(selectedGroup)
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
};

// ─── CategoryTab (main export) ───────────────────────────────────────────────
export const CategoryTab: React.FC = () => {
  return <ZoneCategoryContent />;
};
