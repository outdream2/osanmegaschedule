// src/components/SalesTrendPage/ZoneCategoryContent.tsx
// 2026-08-22 · Framework Phase 4 · SalesTrendPage.tsx 에서 분리
import React, { useEffect, useMemo, useState } from "react";
import { SK_SALESTREND_CATEGORY_W } from "../../lib/storageKeys";
import { X, RefreshCw, PieChart, Layers } from "lucide-react";
import { Spinner } from "../common/Spinner";
import { LoadingState } from "../common/LoadingState";
import { EmptyState } from "../common/EmptyState";
import { Package } from "lucide-react";
import { Card } from "../common/Card";
import { AccentBar } from "../common/AccentBar";
import { StoreZoneMap } from "../common/StoreZoneMap";
import { StatusPill } from "../common/StatusPill";
import { SeasonButtons } from "../common/SeasonButtons";
import { getProductsMap } from "../../lib/productsCache";
import { resolveProductLocation } from "../../lib/productLocation";
import { formatZoneDisplayCode } from "../../constants/displayZones";
import { fmtWon } from "../../lib/format";
import { api } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { CARD_BASE, TEXT } from "../../styles/tokens";
import { API_LIMITS } from "../../constants/apiLimits";
import { type SeasonKey } from "../../hooks/useSeasonRanges";
import { zoneCategoryLabel } from "./SalesTrendPage.helpers";

type ZoneItemSortKey = "name" | "sale" | "current" | "amount";
type ZoneListSortKey = "amount" | "qty" | "count";

// ─── 구역카테고리별 판매추이 ─────────────────────────────────────────────────
const ZoneCategoryContent: React.FC = () => {
  const { toast, showError } = useToast();
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
  // 2026-08-31 · 사용자 지시 · 좌측 카드 · 화살표 = 카드 아래 요약(상품수·판매·진행바) 접기 토글 · 기본 펼침
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());
  const toggleZoneCollapse = (zone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedZones(prev => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone); else next.add(zone);
      return next;
    });
  };
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [months, setMonths] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(1);
  // 2026-08-31 · #69 root cause · stock_history 최신 스냅샷이 오래됐을 때 (예: 34일 전) 기본 1개월 조회에 데이터 없음
  //   · 자동 확장 · 요청 기간 rows==0 & 사용자가 명시 변경 아닌 최초 로드 시 · 서버 snapshot_date 참고해서 안내
  //   · effectiveMonths · UI 상 강조 안 함 (사용자가 pick 한 기간 우선) · 대신 안내 배너로 명시
  const [autoExpanded, setAutoExpanded] = useState<{ requested: number; effective: number; latestSnapshot: string | null } | null>(null);
  const [itemSort, setItemSort] = useState<{ key: ZoneItemSortKey; dir: "asc" | "desc" }>({ key: "sale", dir: "desc" });
  const [categoryPanelWidth, setCategoryPanelWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(SK_SALESTREND_CATEGORY_W)); return Number.isFinite(v) && v > 0 ? v : 400; } catch { return 400; }
  });
  const [essentialSort, setEssentialSort] = useState<ZoneListSortKey>("amount");
  const [generalSort, setGeneralSort] = useState<ZoneListSortKey>("amount");
  const [groupTab, setGroupTab] = useState<"essential" | "general">("essential");

  useEffect(() => { try { localStorage.setItem(SK_SALESTREND_CATEGORY_W, String(categoryPanelWidth)); } catch { /**/ } }, [categoryPanelWidth]);
  const categoryPanelWidthRef = React.useRef(categoryPanelWidth);
  useEffect(() => { categoryPanelWidthRef.current = categoryPanelWidth; }, [categoryPanelWidth]);
  const categoryResizeRef = React.useRef<{ startX: number; startW: number } | null>(null);
  const onCategoryResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    categoryResizeRef.current = { startX: e.clientX, startW: categoryPanelWidthRef.current };
    const move = (ev: MouseEvent) => { const r = categoryResizeRef.current; if (!r) return; setCategoryPanelWidth(Math.min(800, Math.max(260, r.startW + (ev.clientX - r.startX)))); };
    const up = () => { categoryResizeRef.current = null; window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const toggleItemSort = (k: ZoneItemSortKey) => {
    setItemSort(prev => prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" });
  };

  const buildParams = (s: SeasonKey | null, m: number) => {
    const params = new URLSearchParams({ sort: "sale", dir: "desc", limit: String(API_LIMITS.MAX) });
    if (s) params.set("season", s);
    else if (m > 0) params.set("months", String(m));
    return params;
  };
  const fetchOnce = (s: SeasonKey | null, m: number) =>
    // 2026-08-31 · #69 · silent catch 개선 · 로그 + toast · 원인 파악
    api.get<{ rows?: any[]; snapshot_date?: string | null; dates?: string[] }>(`/api/stock-manage/top-sales?${buildParams(s, m)}`).catch((e) => {
      console.error("[ZoneCategoryContent] top-sales 실패:", e);
      showError(`판매 데이터 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      return { data: { rows: [], snapshot_date: null, dates: [] } };
    });
  const fetchData = async (s: SeasonKey | null, m: number) => {
    setLoading(true);
    try {
      // 2026-08-31 · #69 root cause · 요청 기간에 rows==0 이면 · 자동 확장 (months 옵션만 · season 은 그대로)
      //   · 기존 · 최근 stock_history 스냅샷이 오래되면 (예 · 34일 전) months=1 = 0 rows → "데이터 없음" 표시
      //   · 신규 · rows==0 & months>0 · 6/12 개월까지 확장 시도 · 첫 성공 결과 사용
      //   · UX · 확장 시 · autoExpanded 배너 노출 (사용자 안내 · 데이터 갱신 필요성)
      const [initial, p] = await Promise.all([fetchOnce(s, m), getProductsMap()]);
      let effectiveResp = initial;
      let effectiveMonths = m;
      const rowsCount = Array.isArray(initial.data?.rows) ? initial.data!.rows!.length : 0;
      if (rowsCount === 0 && !s && m > 0 && m < 12) {
        // 자동 확장 · 2/3/6/12 (기존 m 초과만)
        for (const nextM of [2, 3, 6, 12].filter(x => x > m)) {
          const resp = await fetchOnce(s, nextM);
          if (Array.isArray(resp.data?.rows) && resp.data!.rows!.length > 0) {
            effectiveResp = resp;
            effectiveMonths = nextM;
            break;
          }
        }
      }
      setSales(Array.isArray(effectiveResp.data?.rows) ? effectiveResp.data!.rows! : []);
      setProducts(p ?? {});
      if (effectiveMonths !== m) {
        setAutoExpanded({ requested: m, effective: effectiveMonths, latestSnapshot: effectiveResp.data?.snapshot_date ?? null });
      } else {
        setAutoExpanded(null);
      }
    } catch (err) {
      setSales([]);
      setProducts({});
      setAutoExpanded(null);
      showError(`데이터 로드 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(season, months); }, [season, months]);

  const grouped = useMemo(() => {
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
      // 2026-08-31 · #71 fix · row 자체 location/real_map 우선 · products fallback
      //   · 판매중지 상품은 products cache 미포함 or location NULL · row 자체 필드로 zone 확보
      //   · 서버 top-sales 응답에 location + real_map 포함됨 (stockManage.ts)
      const zone = (
        String((r as any).location ?? "").trim() ||
        String((r as any).real_map ?? "").trim() ||
        (resolveProductLocation(p) ?? String((p as any).spec ?? "").trim())
      );
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
  const ZONE_COLORS = ["sky", "emerald", "amber", "rose", "indigo", "teal", "violet", "orange"];
  const colorForZone = (zone: string) => ZONE_COLORS[Math.abs(zone.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % ZONE_COLORS.length];
  const selectedGroup = grouped.find(g => g.zone === selectedZone) ?? null;

  const zoneNum = (zone: string): number => { const m = zone.match(/^(\d+)/); return m ? parseInt(m[1], 10) : 999; };
  const isEssential = (zone: string) => zoneNum(zone) <= 9 && zoneNum(zone) > 0;
  const sortGroupList = (list: typeof grouped, key: ZoneListSortKey) =>
    [...list].sort((a, b) =>
      key === "qty" ? b.saleQty - a.saleQty :
      key === "count" ? b.items.length - a.items.length :
      b.totalAmount - a.totalAmount
    );
  const essentialGroups = useMemo(() => sortGroupList(grouped.filter(g => isEssential(g.zone)), essentialSort), [grouped, essentialSort]);
  const generalGroups = useMemo(() => sortGroupList(grouped.filter(g => !isEssential(g.zone)), generalSort), [grouped, generalSort]);

  const renderZoneCard = (g: typeof grouped[number], rank: number) => {
    const pct = total > 0 ? (g.totalAmount / total) * 100 : 0;
    const isSelected = selectedZone === g.zone;
    const color = colorForZone(g.zone);
    const barCls = { sky: "bg-sky-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400", indigo: "bg-indigo-400", teal: "bg-teal-400", violet: "bg-violet-400", orange: "bg-orange-400" }[color]!;
    const textCls = { sky: "text-sky-700", emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700", indigo: "text-indigo-700", teal: "text-teal-700", violet: "text-violet-700", orange: "text-orange-700" }[color]!;
    const selectedBorder = isSelected ? "border-violet-400 bg-violet-50/60 shadow-sm" : "border-line hover:bg-zinc-50";
    const rankCls = rank <= 2 ? "bg-rose-500 text-white border-rose-600" : rank <= 4 ? "bg-sky-500 text-white border-sky-600" : rank <= 6 ? "bg-emerald-500 text-white border-emerald-600" : rank <= 8 ? "bg-violet-500 text-white border-violet-600" : rank <= 10 ? "bg-zinc-400 text-white border-zinc-500" : "bg-white text-zinc-400 border-line";
    return (
      <button key={g.zone} type="button" onClick={() => setSelectedZone(prev => prev === g.zone ? null : g.zone)}
        className={`w-full flex flex-col gap-1.5 p-2.5 rounded-xl border cursor-pointer text-left transition ${selectedBorder}`}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center justify-center w-[20px] h-[20px] text-[12px] font-bold rounded-md border tabular-nums shrink-0 ${rankCls}`}>{rank}</span>
            <span className={`text-[13px] font-bold ${textCls} tabular-nums shrink-0`}>{formatZoneDisplayCode(g.zone)}</span>
            {zoneCategoryLabel(g.zone) && (
              <span className={`text-[11px] font-bold ${textCls} break-words whitespace-normal leading-tight`}>{zoneCategoryLabel(g.zone)}</span>
            )}
          </div>
          {/* 2026-08-31 · 사용자 지시 · 화살표 = 아래 요약 접기 토글 (오른쪽 상세와 무관) */}
          <span
            role="button"
            tabIndex={0}
            aria-label={collapsedZones.has(g.zone) ? "요약 펼치기" : "요약 접기"}
            onClick={(e) => toggleZoneCollapse(g.zone, e)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleZoneCollapse(g.zone, e as any); } }}
            className={`text-zinc-400 text-[10px] transition-transform shrink-0 cursor-pointer hover:text-zinc-600 px-1 ${!collapsedZones.has(g.zone) ? "rotate-90" : ""}`}
          >▶</span>
        </div>
        {!collapsedZones.has(g.zone) && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] tabular-nums">
              <div className="flex items-center gap-1.5 text-zinc-500 font-semibold">
                <span>상품 <span className="font-bold text-zinc-700">{g.items.length}</span>종</span>
                <span className="text-zinc-300">·</span>
                <span>판매 <span className="font-bold text-orange-700">{fmt(g.saleQty)}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-emerald-700 text-[12px]">{fmtWon(g.totalAmount)}</span>
                <span className="text-[10px] font-bold text-zinc-400">{pct.toFixed(1)}%</span>
              </div>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div className={`h-full ${barCls} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
      </button>
    );
  };

  const renderGroupSection = (label: string, badge: string, badgeCls: string, list: typeof grouped, sortKey: ZoneListSortKey, setSortKey: (k: ZoneListSortKey) => void) => {
    const SORT_OPTIONS: Array<{ key: ZoneListSortKey; label: string }> = [
      { key: "amount", label: "판매액" },
      { key: "qty", label: "판매량" },
      { key: "count", label: "상품수" },
    ];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 flex-wrap px-0.5 pt-1">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeCls}`}>{badge}</span>
            <span className="text-[12px] font-semibold text-zinc-700">{label}</span>
            <span className="text-[11px] text-zinc-400 tabular-nums">{list.length}개 구역</span>
          </div>
          <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-1">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.key} type="button" onClick={() => setSortKey(opt.key)}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded transition cursor-pointer ${sortKey === opt.key ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="text-[11px] text-zinc-300 py-2 text-center">해당 구역 없음</div>
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
        case "name":    return sign * String(a.name).localeCompare(String(b.name), "ko");
        case "sale":    return sign * (a.saleQty - b.saleQty);
        case "current": return sign * (a.currentStock - b.currentStock);
        default:        return sign * (a.amount - b.amount);
      }
    });
    const sortableTh = (k: ZoneItemSortKey, label: string, extraCls: string) => {
      const active = itemSort.key === k;
      return (
        <th onClick={() => toggleItemSort(k)}
          className={`cursor-pointer select-none hover:bg-zinc-50 transition ${extraCls} ${active ? "font-bold" : ""}`}
          title={`${label} 정렬`}>
          <span className="inline-flex items-center gap-0.5">{label}
            {active ? <span className="text-[9px]">{itemSort.dir === "asc" ? "▲" : "▼"}</span>
              : <span className="text-[10px] text-zinc-300">⇅</span>}
          </span>
        </th>
      );
    };
    return (
      <div className="flex flex-col gap-3 h-full">
        <div className="bg-violet-50/60 border border-violet-200 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[15px] font-bold ${textCls} tabular-nums`}>{formatZoneDisplayCode(g.zone)}</span>
              {zoneCategoryLabel(g.zone) && (
                <span className={`text-sm font-semibold ${textCls}`}>{zoneCategoryLabel(g.zone)}</span>
              )}
            </div>
            <button type="button" onClick={() => setSelectedZone(null)}
              className="lg:hidden w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0" title="닫기">
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]">
            <span className="text-zinc-500">상품 <span className="font-bold text-zinc-800">{g.items.length}개</span></span>
            <span className="text-zinc-500">판매 <span className="font-bold text-violet-700">{fmt(g.saleQty)}개</span></span>
            <span className="text-zinc-500">금액 <span className="font-bold text-emerald-700">{fmtWon(g.totalAmount)}</span></span>
            <span className="text-zinc-500">비중 <span className="font-bold text-orange-700">{pct.toFixed(1)}%</span></span>
          </div>
        </div>
        <div className={`${CARD_BASE} overflow-hidden flex-1`}>
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-xs sm:min-w-[540px]">
              <thead className="sticky top-0 bg-zinc-50 border-b-2 border-line z-10 shadow-sm">
                <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-1 py-1.5 w-6">#</th>
                  <th className="text-left px-0.5 py-1.5 w-24">공급사</th>
                  {sortableTh("name", "상품명", "text-left px-0.5 py-1.5")}
                  {sortableTh("sale", "판매량", "text-right px-0.5 py-1.5 w-14 text-orange-500 bg-orange-50/40")}
                  {sortableTh("amount", "판매금액", "text-right px-0.5 py-1.5 w-16 text-emerald-500 bg-emerald-50/40")}
                  <th className="text-right px-0.5 py-1.5 w-16 text-amber-600 bg-amber-50/40">최근매입</th>
                  <th className="text-right px-0.5 py-1.5 w-14 text-zinc-600 bg-zinc-50/40">추천적정</th>
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
                      <td className="px-0.5 py-1.5 text-[12px] font-bold text-orange-600">{i + 1}</td>
                      <td className="px-0.5 py-1.5 text-[11px] text-zinc-500 break-words whitespace-normal leading-tight">{it.supplier || "-"}</td>
                      <td className="px-0.5 py-1.5 break-words whitespace-normal leading-tight">
                        <span className="text-[13px] font-medium text-zinc-800 break-words whitespace-normal leading-tight">{it.name}</span>
                      </td>
                      <td className="text-right px-0.5 py-1.5 text-[12px] tabular-nums text-orange-700 font-bold bg-orange-50/40">{fmt(it.saleQty)}</td>
                      <td className="text-right px-0.5 py-1.5 text-[12px] tabular-nums font-bold text-emerald-700 bg-emerald-50/40">{fmtWon(it.amount)}</td>
                      <td className="text-right px-0.5 py-1.5 text-[11px] tabular-nums text-amber-700 font-semibold bg-amber-50/40">{lastPDShort}</td>
                      <td className={`text-right px-0.5 py-1.5 text-[12px] tabular-nums font-bold bg-zinc-50/40 ${it.optimalStock > 0 ? "text-zinc-700" : "text-zinc-300"}`}>{it.optimalStock > 0 ? fmt(it.optimalStock) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {g.items.length > 200 && <div className="text-[11px] text-zinc-400 text-center py-1">상위 200개만 · 전체 {g.items.length}개</div>}
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
    <div className="flex flex-col gap-2">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      {/* 상단 필터바 */}
      <div className={`${CARD_BASE} px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2`}>
        <div className="flex items-center gap-2.5">
          <AccentBar />
          <PieChart size={16} className="text-brand-deep shrink-0" />
          <span className="text-[16px] font-bold text-ink tracking-tight">카테고리별현황</span>
          <StatusPill tone="amber" size="sm">{grouped.length}개 구역</StatusPill>
          <span className="text-[12px] text-ink-soft hidden sm:inline">진열위치 기반 · 구역 클릭 → 상품 상세</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">기간</span>
          <div className="flex flex-wrap bg-zinc-100 border border-line rounded-lg p-1 gap-0.5">
            <button type="button" onClick={() => { setSeason(null); setMonths(0); }}
              className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!season && months === 0 ? "bg-amber-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              10일
            </button>
            {[1, 2, 3, 4, 5, 6].map(m => (
              <button key={m} type="button" onClick={() => { setSeason(null); setMonths(m as any); }}
                className={`px-2 h-6 text-[11px] font-semibold rounded transition cursor-pointer ${!season && months === m ? "bg-amber-500 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
                {m}개월
              </button>
            ))}
          </div>
          <SeasonButtons value={season} onChange={(v) => { setSeason(v); if (v) setMonths(0); }} size="sm" hideLabel />
        </div>
        <button type="button" onClick={() => fetchData(season, months)} disabled={loading}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-line bg-white hover:bg-amber-50 hover:border-amber-300 text-zinc-400 hover:text-amber-500 transition disabled:opacity-40 cursor-pointer"
          title="새로고침">
          {loading ? <Spinner size={13} tone="zinc" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {/* 2026-08-31 · #69 · 자동 확장 안내 배너 · 요청 기간에 데이터 없음 · 서버가 확장한 결과 표시 중 */}
      {autoExpanded && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[12px]">
          <span className="font-bold">데이터 안내</span>
          <span className="text-amber-700">
            최근 {autoExpanded.requested}개월 판매 스냅샷이 없어 <b>{autoExpanded.effective}개월</b>로 자동 확장했습니다
            {autoExpanded.latestSnapshot ? ` · 최신 스냅샷 ${autoExpanded.latestSnapshot}` : ""}
          </span>
        </div>
      )}

      {/* 매장 구역도 */}
      <StoreZoneMap
        zoneItemCounts={zoneItemCounts}
        zoneRankMap={zoneRankMap}
        showBestBadges
        collapsible
        defaultCollapsed
        title="🗺️ 매장 구역도 · 상위 map 동일 (참고)"
      />

      {/* 하단 좌우 split */}
      <div className="flex flex-col lg:flex-row gap-0 items-stretch flex-1 lg:min-h-[720px]">
        {/* 좌측: 구역 리스트 */}
        <div
          className="min-h-0 w-full lg:w-auto lg:shrink-0 flex flex-col gap-2"
          style={{ width: typeof window !== "undefined" && window.innerWidth >= 1024 ? categoryPanelWidth : undefined }}
        >
          {loading && grouped.length > 0 && (
            <Card variant="flat" bg="bg-violet-50" borderColor="border-violet-200" rounded="md" padding="none" className="flex items-center justify-center gap-1.5 py-1.5 mb-1 sticky top-0 z-10">
              <Spinner size={11} tone="violet" label="조건 변경 · 새로 불러오는 중..." labelSize={10} />
            </Card>
          )}
          {loading && grouped.length === 0 ? (
            // 2026-08-31 · 프레임워크 · LoadingState skeleton · 목업 톤
            <LoadingState skeleton rows={6} size="normal" tone="indigo" />
          ) : !loading && grouped.length === 0 ? (
            // 2026-08-31 · 프레임워크 · EmptyState · 진짜 데이터 없음 · 사용자 액션 안내
            <EmptyState
              icon={Package}
              title="판매 데이터 없음"
              hint="최근 12개월 재고 스냅샷 (stock_history) 이 없습니다. 재고관리 화면에서 새 스냅샷을 임포트해 주세요."
              size="normal"
            />
          ) : (
            <div className={`overflow-y-auto max-h-[65vh] pr-1 flex flex-col gap-2 ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
              <div className="flex items-center gap-1 border-b-2 border-line sticky top-0 bg-white z-10 -mx-1 px-1 pt-1">
                <button type="button" onClick={() => setGroupTab("essential")}
                  className={`relative px-4 py-2 text-[13px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${groupTab === "essential" ? "text-rose-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  상비약 <span className="text-[11px] font-semibold text-zinc-400 ml-1 tabular-nums">({essentialGroups.length})</span>
                  {groupTab === "essential" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-rose-500" />}
                </button>
                <button type="button" onClick={() => setGroupTab("general")}
                  className={`relative px-4 py-2 text-[13px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${groupTab === "general" ? "text-sky-700" : "text-zinc-400 hover:text-zinc-600"}`}>
                  일반약 <span className="text-[11px] font-semibold text-zinc-400 ml-1 tabular-nums">({generalGroups.length})</span>
                  {groupTab === "general" && <span className="absolute left-2 right-2 -bottom-[2px] h-[3px] rounded-t-full bg-sky-500" />}
                </button>
              </div>
              {groupTab === "essential"
                ? renderGroupSection("상비약 (1~9구역)", "상비약", "bg-rose-50 text-rose-700 border-rose-300", essentialGroups, essentialSort, setEssentialSort)
                : renderGroupSection("일반약 (10구역 이후)", "일반약", "bg-sky-50 text-sky-700 border-sky-300", generalGroups, generalSort, setGeneralSort)
              }
            </div>
          )}
        </div>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={onCategoryResizeStart}
          className="hidden lg:flex items-center justify-center w-1.5 hover:w-2 bg-zinc-200 hover:bg-violet-400 rounded-full cursor-col-resize transition-all shrink-0 mx-1 group"
          title="드래그하여 폭 조절"
        >
          <span className="text-[9px] text-zinc-400 group-hover:text-white font-bold rotate-90 opacity-0 group-hover:opacity-100 transition">||</span>
        </div>

        {/* 우측: 선택 구역 상세 */}
        <div
          className={`flex flex-col gap-3 min-h-0 flex-1 min-w-0 transition-transform duration-150 ${selectedZone ? "fixed inset-0 z-50 bg-zinc-50 overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible p-3 lg:p-0" : ""}`}
          style={{ willChange: selectedZone ? "transform, opacity" : "auto" }}
        >
          {selectedZone && (
            <div className="lg:hidden sticky top-0 z-30 bg-white border-b border-line shadow-md -mx-3 px-3 py-2 mb-1">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSelectedZone(null)}
                  className="w-8 h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-600 cursor-pointer shrink-0" title="닫기">
                  <X size={16} strokeWidth={2.4} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`${TEXT.body} text-zinc-800 break-keep whitespace-normal leading-tight`}>
                    구역 {formatZoneDisplayCode(selectedZone)}{zoneCategoryLabel(selectedZone) ? ` · ${zoneCategoryLabel(selectedZone)}` : ""}
                  </div>
                  <div className="text-[10px] tabular-nums text-zinc-500 break-keep whitespace-normal">
                    {grouped.find(g => g.zone === selectedZone)?.items.length ?? 0}개 상품
                  </div>
                </div>
              </div>
            </div>
          )}
          {!selectedZone ? (
            <div className="bg-white rounded-xl border border-line flex-1 flex flex-col items-center justify-center p-10 text-zinc-400 min-h-[400px]">
              <Layers size={40} className="mb-3 opacity-30" />
              <div className="text-sm font-bold">구역을 선택하세요</div>
              <div className="text-[11px] mt-1">해당 구역의 상품 판매 상세가 표시됩니다</div>
            </div>
          ) : selectedGroup ? renderDetailPanel(selectedGroup) : null}
        </div>
      </div>
    </div>
  );
};

// ─── CategoryTab (re-export wrapper · 외부 참조 유지) ─────────────────────
export const CategoryTab: React.FC = () => <ZoneCategoryContent />;

export default ZoneCategoryContent;
