// src/components/OrderManagePage/TrendingTab.tsx
// 판매 급상승 탭 · 2026-08-03 · StockManagePage.tsx 에서 이동
//   최근 window일 판매 vs 이전 window일 판매 비교
//   신규 진입 (prior=0, recent>0) 상단 · 성장률 desc

import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp, AlertTriangle, Loader2 as LoaderIcon } from "lucide-react";

// ─── 타입 ───────────────────────────────────────────────────────────────────
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
  label: string;
  sublabel: string;
  vsLabel: string;
  from: string;
  to: string;
  prior_from: string;
  prior_to: string;
  rows: PeriodBucketRow[];
  total: number;
  loading: boolean;
  error: boolean;
}

// ─── 날짜 유틸 ──────────────────────────────────────────────────────────────
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function buildMonthlyBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  const buckets: Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] = [];
  for (let i = 0; i < 6; i++) {
    const refDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = refDate.getFullYear();
    const m = refDate.getMonth() + 1;
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = lastDayOfMonth(y, m);
    const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = prevDate.getMonth() + 1;
    const prior_from = `${py}-${String(pm).padStart(2, "0")}-01`;
    const priorLast = lastDayOfMonth(py, pm);
    const prior_to = `${py}-${String(pm).padStart(2, "0")}-${String(priorLast).padStart(2, "0")}`;
    const mLabel = `${y}-${String(m).padStart(2, "0")}`;
    buckets.push({
      label: mLabel,
      sublabel: `${m}/1 ~ ${m}/${lastDay}`,
      vsLabel: `vs ${py}-${String(pm).padStart(2, "0")}`,
      from,
      to,
      prior_from,
      prior_to,
    });
  }
  return buckets;
}
function buildDecadalBuckets(): Omit<PeriodBucket, "rows" | "total" | "loading" | "error">[] {
  const today = new Date();
  type Decade = { year: number; month: number; decade: 1 | 2 | 3 };
  const decades: Decade[] = [];
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
  const prevDecade = (d: Decade): Decade => {
    if (d.decade === 1) {
      const prev = new Date(d.year, d.month - 2, 1);
      return { year: prev.getFullYear(), month: prev.getMonth() + 1, decade: 3 };
    }
    return { year: d.year, month: d.month, decade: (d.decade - 1) as 1 | 2 | 3 };
  };
  return decades.map(d => {
    const cur = decadeRange(d.year, d.month, d.decade);
    const prev = prevDecade(d);
    const pr = decadeRange(prev.year, prev.month, prev.decade);
    return {
      label: `${d.month}월 ${decadeLabel(d.decade)}`,
      sublabel: `${d.month}/${cur.from.slice(8)} ~ ${d.month}/${cur.to.slice(8)}`,
      vsLabel: `vs ${prev.month}월 ${decadeLabel(prev.decade)} (${prev.year}-${String(prev.month).padStart(2, "0")})`,
      from: cur.from,
      to: cur.to,
      prior_from: pr.from,
      prior_to: pr.to,
    };
  });
}

// ─── PeriodBucketCard ────────────────────────────────────────────────────────
const PeriodBucketCard: React.FC<{
  bucket: PeriodBucket;
  onProductClick?: (p: any) => void;
}> = ({ bucket, onProductClick }) => {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
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
            <li key={r.product_code} className="flex items-start gap-2 px-4 py-2.5 hover:bg-indigo-50/20 transition">
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

// ─── PeriodTrendingSection ───────────────────────────────────────────────────
const PeriodTrendingSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  buckets: PeriodBucket[];
  onProductClick?: (p: any) => void;
}> = ({ title, icon, buckets, onProductClick }) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="text-indigo-500 shrink-0">{icon}</span>
        <span className="text-[13px] font-bold text-slate-700">{title}</span>
        <div className="flex-1 h-px bg-indigo-100" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {buckets.map((b, i) => (
          <PeriodBucketCard key={i} bucket={b} onProductClick={onProductClick} />
        ))}
      </div>
    </div>
  );
};

// ─── TrendingTab (main export) ───────────────────────────────────────────────
export const TrendingTab: React.FC<{ onProductClick?: (p: any) => void }> = ({ onProductClick }) => {
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
