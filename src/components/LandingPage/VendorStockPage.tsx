// src/components/LandingPage/VendorStockPage.tsx
// 2026-09-04 · #23 · 공급사 재고확인 · 모달 → 전용 페이지 전환
// 2026-09-18 · f8045e8e · 응답 형식 fix + supplier only 검색 지원 (크리티컬)
// 2026-09-18 · #301 · 양쪽 대시보드 재설계 · 좌 KPI+알림+도넛 · 우 카드 그룹 (사용자 지시)
// 2026-09-18 · #302 · 거래처 관점 콘텐츠 강화 + 글씨 +2 (사용자 지시)
//
// UI 대원칙 준수 · Linear/Notion 톤 · 화이트 베이스 · 폰트 +2 규칙 (13px+)
// 안전 규칙 · API 호출 · state · handler · props 시그니처 완전 유지 · UI 만 변경

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Package, PackageCheck, PackageX, AlertTriangle,
  CalendarRange, TrendingUp, Layers, Phone, RefreshCw,
  ShoppingCart,
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { PAGE_CONTAINER_CLS, TEXT } from "../../styles/tokens";
import { SplitPanel } from "../common/SplitPanel";
import { SearchBar } from "../common/SearchBar";
import { KpiCard } from "../common/KpiCard";
import { StatusPill } from "../common/StatusPill";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { SplitLeftHeader } from "../common/SplitLeftHeader";
import { SaleStatusFilter } from "../common/SaleStatusFilter";
import { useSaleStatusFilter } from "../../hooks/useSaleStatusFilter";
import { useSortableTable, type Comparator } from "../../hooks/useSortableTable";
import { matchesProductQuery } from "../../lib/productMatch";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import type { AuthSession } from "../../types";

// ─── 타입 ──────────────────────────────────────────────────────────────
interface VendorProduct {
  code: string;
  name: string;
  spec?: string | null;
  current_stock?: number | null;
  optimal_stock?: number | null;
  min_stock?: number | null;
  sale_status?: string | null;
}

interface VendorStockPageProps {
  vendorName: string;
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

// ─── 정렬 컬럼 ────────────────────────────────────────────────────────
type SortKey = "code" | "name" | "current_stock" | "optimal_stock" | "min_stock" | "status";

// 재고상태 우선순위 (없음=0, 부족=1, 정상=2)
function stockStateOrder(p: VendorProduct): number {
  const cur = Number(p.current_stock ?? 0);
  const minS = Number(p.min_stock ?? 0);
  if (cur <= 0) return 0;
  if (minS > 0 && cur < minS) return 1;
  return 2;
}

const COMPARATORS: Record<SortKey, Comparator<VendorProduct>> = {
  code: (a, b) => (a.code ?? "").localeCompare(b.code ?? ""),
  name: (a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"),
  current_stock: (a, b) => Number(a.current_stock ?? 0) - Number(b.current_stock ?? 0),
  optimal_stock: (a, b) => Number(a.optimal_stock ?? 0) - Number(b.optimal_stock ?? 0),
  min_stock: (a, b) => Number(a.min_stock ?? 0) - Number(b.min_stock ?? 0),
  status: (a, b) => stockStateOrder(a) - stockStateOrder(b),
};

// ─── 재고상태 판정 ────────────────────────────────────────────────────
type StockLevel = "normal" | "low" | "none";
function getStockLevel(p: VendorProduct): StockLevel {
  const cur = Number(p.current_stock ?? 0);
  const minS = Number(p.min_stock ?? 0);
  if (cur <= 0) return "none";
  if (minS > 0 && cur < minS) return "low";
  return "normal";
}

// ─── 기간 프리셋 ──────────────────────────────────────────────────────
type PeriodPreset = "1m" | "3m" | "6m" | "custom" | null;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function shiftMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ─── 알림 카드 아이템 ──────────────────────────────────────────────────
interface AlertItem {
  code: string;
  name: string;
  current_stock: number;
  level: StockLevel;
}

// ─── 오늘 날짜 포맷 ───────────────────────────────────────────────────
function formatTodayKo(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

// ─── 도넛 차트 커스텀 툴팁 ────────────────────────────────────────────
const DonutTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-line rounded-lg px-3 py-2 shadow-md text-[17px] font-semibold text-ink">
      {name}: <span className="tabular-nums">{value}</span>종
    </div>
  );
};

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────
export const VendorStockPage: React.FC<VendorStockPageProps> = ({
  vendorName,
  authSession,
  onBack,
  onNavigate,
  onLogout,
}) => {
  // ─── 데이터 상태 ────────────────────────────────────────────────────
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // 기간 필터 (UI 만 · 시계열 API 확장 후 적용)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // 정렬 선택 (우측 드롭다운)
  const [sortSelect, setSortSelect] = useState<SortKey>("status");

  // 판매중 필터 (default active · localStorage)
  const { value: saleFilter, setValue: setSaleFilter, matches: saleMatches } = useSaleStatusFilter({
    storageKey: "vendorStock.saleFilter",
  });

  const { toast, showError } = useToast(4000);

  // 재고없음 섹션 ref (스트립 클릭 시 스크롤)
  const noneRef = useRef<HTMLDivElement>(null);
  const normalRef = useRef<HTMLDivElement>(null);

  // ─── 데이터 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    if (!vendorName) return;
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // 2026-09-18 · 사용자 지시 fix · 응답 형식 호환 · API 는 배열 직접 반환 · legacy { items } 도 지원
        const { data } = await api.get<any>(
          `/api/products-search?supplier=${encodeURIComponent(vendorName)}&limit=1000`,
        );
        if (!alive) return;
        const rows: any[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        const items: VendorProduct[] = rows.map((it: any) => ({
          code: String(it.code ?? it.product_code ?? ""),
          name: String(it.name ?? it.product_name ?? ""),
          spec: it.spec ?? null,
          current_stock: it.current_stock ?? null,
          optimal_stock: it.optimal_stock ?? null,
          min_stock: it.min_stock ?? null,
          sale_status: it.sale_status ?? null,
        }));
        setProducts(items);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : "조회 실패";
        setError(msg);
        showError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [vendorName, showError]);

  // ─── 판매중 · 검색 필터 ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!saleMatches(p.sale_status)) return false;
      if (!search) return true;
      return matchesProductQuery(
        { product_name: p.name, product_code: p.code },
        search,
      );
    });
  }, [products, search, saleMatches]);

  // ─── 정렬 ───────────────────────────────────────────────────────────
  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<VendorProduct, SortKey>(
    filtered,
    sortSelect,
    COMPARATORS,
    sortSelect === "status" ? "asc" : "asc",
  );

  // sortSelect 변경 시 toggleSort 동기화
  useEffect(() => {
    // sortKey 와 다를 때만 (무한루프 방지)
    if (sortKey !== sortSelect) {
      toggleSort(sortSelect);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortSelect]);

  // ─── KPI 집계 (필터 이후 기준 · 사용자 관점 실측) ────────────────────
  const kpi = useMemo(() => {
    let normal = 0;
    let low = 0;
    let none = 0;
    let totalStock = 0;
    for (const p of filtered) {
      const lv = getStockLevel(p);
      if (lv === "normal") normal += 1;
      else if (lv === "low") low += 1;
      else none += 1;
      totalStock += Number(p.current_stock ?? 0);
    }
    return {
      total: filtered.length,
      normal,
      low,
      none,
      totalStock,
    };
  }, [filtered]);

  // ─── 알림 리스트 (재고 없음 top3 + 부족 top3) ─────────────────────
  const alertItems = useMemo((): AlertItem[] => {
    const noneItems = filtered
      .filter((p) => getStockLevel(p) === "none")
      .slice(0, 3)
      .map((p) => ({ code: p.code, name: p.name, current_stock: Number(p.current_stock ?? 0), level: "none" as StockLevel }));
    const lowItems = filtered
      .filter((p) => getStockLevel(p) === "low")
      .slice(0, 3)
      .map((p) => ({ code: p.code, name: p.name, current_stock: Number(p.current_stock ?? 0), level: "low" as StockLevel }));
    return [...noneItems, ...lowItems];
  }, [filtered]);

  // ─── 도넛 차트 데이터 ────────────────────────────────────────────────
  const donutData = useMemo(() => [
    { name: "재고 있음", value: kpi.normal, color: "#10b981" },
    { name: "재고 부족", value: kpi.low,    color: "#f59e0b" },
    { name: "재고 없음", value: kpi.none,   color: "#f43f5e" },
  ].filter((d) => d.value > 0), [kpi]);

  // ─── 기간 프리셋 핸들러 ─────────────────────────────────────────────
  const applyPreset = useCallback((preset: Exclude<PeriodPreset, null | "custom">) => {
    const now = new Date();
    const months = preset === "1m" ? -1 : preset === "3m" ? -3 : -6;
    const from = shiftMonths(now, months);
    setDateFrom(formatDate(from));
    setDateTo(formatDate(now));
    setPeriodPreset(preset);
  }, []);

  const clearPeriod = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setPeriodPreset(null);
  }, []);

  const periodActive = !!(dateFrom || dateTo);

  // ─── 재고상태별 그룹 분리 ─────────────────────────────────────────────
  const grouped = useMemo(() => {
    const none: VendorProduct[] = [];
    const low: VendorProduct[] = [];
    const normal: VendorProduct[] = [];
    for (const p of sorted) {
      const lv = getStockLevel(p);
      if (lv === "none") none.push(p);
      else if (lv === "low") low.push(p);
      else normal.push(p);
    }
    return { none, low, normal };
  }, [sorted]);

  // 발주 예상 수량 (재고없음 + 부족)
  const orderExpected = kpi.none + kpi.low;

  // ─── 좌측 대시보드 ──────────────────────────────────────────────────
  const dashboardNode = (
    <div className="flex flex-col gap-4 p-4">
      {/* 환영 배너 · 거래처 관점 */}
      <div className="rounded-xl bg-gradient-to-br from-brand-deep to-indigo-700 px-4 py-3.5 shadow-sm">
        <div className="text-[13px] font-semibold text-indigo-200 mb-0.5">{formatTodayKo()}</div>
        <div className="text-[19px] font-black text-white leading-snug break-words whitespace-normal">
          안녕하세요, {vendorName || "-"}님
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-[14px] text-indigo-100 font-semibold">
            총 <span className="text-white font-black tabular-nums">{kpi.total}</span>종
          </span>
          {orderExpected > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/80 text-white text-[13px] font-bold">
              <ShoppingCart size={12} />
              발주 예상 {orderExpected}종
            </span>
          )}
        </div>
      </div>

      {/* 헤더 */}
      <SplitLeftHeader
        icon={<Package size={17} />}
        title="재고 대시보드"
        subtitle={<span className="text-[15px] text-ink-soft">공급사 상품 · ERP 현재고 기준</span>}
      />

      {/* KPI 4개 · 2x2 grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard
          icon={<Package size={14} />}
          label="총 상품수"
          value={kpi.total}
          unit="종"
          tone="brand"
          isActive={kpi.total > 0}
        />
        <KpiCard
          icon={<PackageCheck size={14} />}
          label="재고 있음"
          value={kpi.normal}
          unit="종"
          tone="emerald"
          isActive={kpi.normal > 0}
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label="재고 부족"
          value={kpi.low}
          unit="종"
          tone="amber"
          hint="최소재고 미만"
          isActive={kpi.low > 0}
        />
        <KpiCard
          icon={<PackageX size={14} />}
          label="재고 없음"
          value={kpi.none}
          unit="종"
          tone="rose"
          isActive={kpi.none > 0}
        />
      </div>

      {/* 총 재고 수량 + 회전율 · 가로 2분할 */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card padding="sm" variant="sm">
          <div className="flex items-center gap-1.5 mb-1">
            <Layers size={13} className="text-brand-deep shrink-0" />
            <span className={`${TEXT.caption} text-ink-soft`}>총 재고</span>
          </div>
          <div className="text-[21px] font-black text-brand-deep tabular-nums leading-tight">
            {kpi.totalStock.toLocaleString()}
          </div>
          <div className="text-[15px] text-ink-soft mt-0.5">수량 합계</div>
        </Card>
        <Card padding="sm" variant="sm">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-emerald-600 shrink-0" />
            <span className={`${TEXT.caption} text-ink-soft`}>재고율</span>
          </div>
          <div className="text-[21px] font-black text-emerald-700 tabular-nums leading-tight">
            {kpi.total > 0 ? Math.round((kpi.normal / kpi.total) * 100) : 0}
            <span className="text-[16px] font-bold ml-0.5">%</span>
          </div>
          <div className="text-[15px] text-ink-soft mt-0.5">정상 비율</div>
        </Card>
      </div>

      {/* 도넛 차트 · 재고 상태 비율 */}
      {donutData.length > 0 && (
        <Card padding="sm" variant="sm">
          <div className={`${TEXT.caption} text-ink-soft mb-2`}>재고 상태 비율</div>
          <div className="flex items-center gap-3">
            <div style={{ width: 88, height: 88, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={42}
                    dataKey="value"
                    strokeWidth={1.5}
                    stroke="#fff"
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {donutData.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-[15px] font-semibold text-ink-soft break-words whitespace-normal">{d.name}</span>
                  </div>
                  <span className="text-[16px] font-bold tabular-nums text-ink shrink-0">{d.value}종</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 긴급 알림 카드 · 재고없음/부족 상위 */}
      {alertItems.length > 0 && (
        <Card padding="sm" variant="sm">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={13} className="text-rose-600 shrink-0" />
            <span className={`${TEXT.caption} text-rose-700`}>긴급 알림</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {alertItems.map((item) => (
              <div
                key={item.code}
                className={[
                  "flex items-center justify-between px-2.5 py-1.5 rounded-lg border",
                  item.level === "none"
                    ? "bg-rose-50 border-rose-200/60"
                    : "bg-amber-50 border-amber-200/60",
                ].join(" ")}
              >
                <div className="flex flex-col min-w-0 mr-2">
                  <span className="text-[16px] font-semibold text-ink break-words whitespace-normal leading-snug">
                    {item.name}
                  </span>
                  <span className="text-[14px] text-ink-soft">{item.code}</span>
                </div>
                <StatusPill
                  tone={item.level === "none" ? "rose" : "amber"}
                  size="xs"
                  dot
                >
                  {item.level === "none" ? "없음" : "부족"}
                </StatusPill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 기간 필터 */}
      <Card padding="md" variant="sm">
        <div className="flex items-center gap-1.5 mb-2.5">
          <CalendarRange size={14} className="text-brand-deep" />
          <span className={`${TEXT.label} text-ink`}>기간 필터</span>
        </div>

        {/* 프리셋 버튼 3개 */}
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {(["1m", "3m", "6m"] as const).map((k) => {
            const label = k === "1m" ? "1개월" : k === "3m" ? "3개월" : "6개월";
            const active = periodPreset === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => applyPreset(k)}
                className={[
                  "h-8 rounded-md text-[15px] font-semibold border transition-all",
                  active
                    ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                    : "bg-white text-ink-soft border-line hover:border-brand-deep hover:text-brand-deep",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 직접 지정 date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPeriodPreset("custom");
            }}
            className="flex-1 min-w-0 h-8 px-2 text-[15px] border border-line rounded-md focus:outline-none focus:border-brand-deep"
          />
          <span className="text-zinc-400 text-[15px]">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPeriodPreset("custom");
            }}
            className="flex-1 min-w-0 h-8 px-2 text-[15px] border border-line rounded-md focus:outline-none focus:border-brand-deep"
          />
        </div>

        {periodActive && (
          <button
            type="button"
            onClick={clearPeriod}
            className="mt-2 w-full h-7 text-[14px] font-semibold text-ink-soft bg-zinc-50 border border-line rounded-md hover:bg-zinc-100 transition"
          >
            기간 필터 초기화
          </button>
        )}

        {/* 안내 · 시계열 API 확장 후 실적용 */}
        <div className="mt-2.5 px-2.5 py-2 rounded-md bg-amber-50/70 border border-amber-200/70">
          <div className="text-[14px] text-amber-800 leading-relaxed">
            <span className="font-bold">안내</span> · 현재는 시점 재고만 표시됩니다.
            매입이력 시계열 연동 후 · 기간별 입출고 통계가 적용될 예정입니다.
          </div>
        </div>
      </Card>

      {/* 안내 카드 · 발주 문의 + 데이터 기준 */}
      <Card padding="md" variant="sm">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-deep/10 flex items-center justify-center shrink-0 mt-0.5">
              <Phone size={13} className="text-brand-deep" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-ink leading-snug">발주 문의</div>
              <div className="text-[14px] text-ink-soft leading-relaxed mt-0.5">
                재고 관련 문의 · 약국에 직접 연락 부탁드립니다
              </div>
            </div>
          </div>
          <div className="h-px bg-line" />
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
              <RefreshCw size={13} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold text-ink leading-snug">데이터 기준</div>
              <div className="text-[14px] text-ink-soft leading-relaxed mt-0.5">
                매장 실사 기준 · ERP 현재고 실시간 반영
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  // ─── 우측 · 대시보드 카드 ────────────────────────────────────────────
  const listNode = (
    <div className="flex flex-col h-full min-h-0">
      {/* 스티키 툴바 */}
      <div className="shrink-0 p-4 pb-3 border-b border-line bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="상품명 · 코드 검색 (초성 지원)"
              resultCount={sorted.length}
              historyKey="megatown_vendorStockPage_search"
              accent="sky"
              widthClass="w-full"
            />
          </div>
          <SaleStatusFilter value={saleFilter} onChange={setSaleFilter} size="sm" />
          {/* 정렬 드롭다운 */}
          <select
            value={sortSelect}
            onChange={(e) => setSortSelect(e.target.value as SortKey)}
            className="h-9 px-2.5 text-[14px] font-semibold border border-line rounded-lg bg-white text-ink-soft hover:border-brand-deep focus:outline-none focus:border-brand-deep transition cursor-pointer"
          >
            <option value="status">재고상태순</option>
            <option value="name">상품명순</option>
            <option value="code">코드순</option>
            <option value="current_stock">현재고순</option>
          </select>
        </div>
      </div>

      {/* 요약 스트립 · 강화 버전 */}
      {!loading && !error && sorted.length > 0 && (
        <div className="shrink-0 px-4 py-2.5 bg-zinc-50 border-b border-line flex items-center gap-3 flex-wrap">
          <span className="text-[15px] font-semibold text-ink-soft">
            전체 <span className="text-brand-deep tabular-nums font-black">{sorted.length}</span>종
          </span>
          {(kpi.none > 0 || kpi.low > 0) && (
            <button
              type="button"
              onClick={() => noneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-700 hover:bg-rose-200 transition cursor-pointer"
            >
              <ShoppingCart size={13} />
              <span className="text-[15px] font-black tabular-nums">발주 필요 {kpi.none + kpi.low}종</span>
            </button>
          )}
          {kpi.normal > 0 && (
            <button
              type="button"
              onClick={() => normalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition cursor-pointer"
            >
              <PackageCheck size={13} />
              <span className="text-[15px] font-black tabular-nums">재고 정상 {kpi.normal}종</span>
            </button>
          )}
          {search && (
            <span className="text-[15px] text-zinc-400">"{search}" 검색 중</span>
          )}
        </div>
      )}

      {/* 카드 body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={18} tone="zinc" label="불러오는 중..." labelSize={16} />
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[16px] font-bold">
              <AlertTriangle size={16} />
              {error}
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-16 text-center text-ink-soft text-[17px]">
            {search ? "검색 결과가 없습니다" : "표시할 상품이 없습니다"}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* 섹션 : 재고 없음 */}
            {grouped.none.length > 0 && (
              <div ref={noneRef}>
                <StockSection
                  level="none"
                  items={grouped.none}
                  label="재고 없음"
                  count={grouped.none.length}
                  isOrderExpected
                />
              </div>
            )}
            {/* 섹션 : 재고 부족 */}
            {grouped.low.length > 0 && (
              <div ref={grouped.none.length === 0 ? noneRef : undefined}>
                <StockSection
                  level="low"
                  items={grouped.low}
                  label="재고 부족"
                  count={grouped.low.length}
                  isOrderExpected
                />
              </div>
            )}
            {/* 섹션 : 재고 있음 */}
            {grouped.normal.length > 0 && (
              <div ref={normalRef}>
                <StockSection
                  level="normal"
                  items={grouped.normal}
                  label="재고 있음"
                  count={grouped.normal.length}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <AppNavHeader
        activePage="vendor-stock"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          <StatusPill tone="brand" size="md" icon={<Package size={12} />}>
            <span className="hidden sm:inline">공급사 재고</span>
          </StatusPill>
        }
      />

      <div className={`${PAGE_CONTAINER_CLS} max-w-[1600px] flex-1 flex flex-col px-4 sm:px-6 py-4 gap-3 min-h-0`}>
        {/* 페이지 헤더 · 공급사명 크게 */}
        <Card padding="md" variant="sm" topAccent>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-deep flex items-center justify-center shadow-sm shrink-0">
              <Package size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-semibold text-ink-soft leading-tight">공급사 재고현황</div>
              <div className="text-[24px] font-bold text-ink tracking-tight leading-tight break-words whitespace-normal">
                {vendorName || "-"}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <StatusPill tone="emerald" size="sm" dot>
                승인 완료
              </StatusPill>
            </div>
          </div>
        </Card>

        {/* SplitPanel · 좌 대시보드 / 우 카드 그룹 */}
        <div className="flex-1 min-h-0">
          <SplitPanel
            storageKey="vendorStockPage.dashboardWidth"
            defaultWidth={360}
            minWidth={280}
            maxWidth={520}
            dividerColor="indigo"
            mobileRightAsModal={false}
            left={dashboardNode}
            right={listNode}
            style={{ minHeight: "calc(100vh - 240px)" }}
          />
        </div>
      </div>

      {/* Toast · 조회 실패 등 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

// ─── 재고 섹션 컴포넌트 ────────────────────────────────────────────────
interface StockSectionProps {
  level: StockLevel;
  items: VendorProduct[];
  label: string;
  count: number;
  isOrderExpected?: boolean;
}

const SECTION_STYLE: Record<StockLevel, {
  header: string;
  dot: string;
  border: string;
  cardBorder: string;
  cardBg: string;
  barBg: string;
  valueColor: string;
  labelColor: string;
}> = {
  none: {
    header:     "text-rose-700",
    dot:        "bg-rose-500",
    border:     "border-rose-200",
    cardBorder: "border-rose-200/60",
    cardBg:     "bg-rose-50/30",
    barBg:      "bg-rose-500",
    valueColor: "text-rose-700",
    labelColor: "text-rose-600",
  },
  low: {
    header:     "text-amber-700",
    dot:        "bg-amber-500",
    border:     "border-amber-200",
    cardBorder: "border-amber-200/60",
    cardBg:     "bg-amber-50/30",
    barBg:      "bg-amber-500",
    valueColor: "text-amber-700",
    labelColor: "text-amber-600",
  },
  normal: {
    header:     "text-emerald-700",
    dot:        "bg-emerald-500",
    border:     "border-emerald-200",
    cardBorder: "border-zinc-200/70",
    cardBg:     "bg-white",
    barBg:      "bg-emerald-500",
    valueColor: "text-emerald-700",
    labelColor: "text-emerald-600",
  },
};

const StockSection: React.FC<StockSectionProps> = ({ level, items, label, count, isOrderExpected }) => {
  const s = SECTION_STYLE[level];
  const pillTone = level === "normal" ? "emerald" : level === "low" ? "amber" : "rose";
  const pillLabel = level === "normal" ? "정상" : level === "low" ? "부족" : "없음";

  return (
    <div>
      {/* 섹션 헤더 */}
      <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${s.border}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${s.dot} shrink-0`} />
        <span className={`text-[18px] font-extrabold ${s.header}`}>{label}</span>
        <span className={`text-[16px] font-bold tabular-nums ${s.labelColor}`}>{count}종</span>
        {isOrderExpected && (
          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-700 text-[13px] font-bold">
            <ShoppingCart size={11} />
            발주 예상 상품
          </span>
        )}
      </div>

      {/* 상품 카드 그리드 · 2열 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((p, idx) => {
          const cur = Number(p.current_stock ?? 0);
          const minS = Number(p.min_stock ?? 0);
          const opt = Number(p.optimal_stock ?? 0);
          // 진행바 비율 (현재고 / 적정재고)
          const barPct = opt > 0 ? Math.min(100, Math.round((cur / opt) * 100)) : (cur > 0 ? 100 : 0);

          return (
            <div
              key={`${p.code}-${idx}`}
              className={[
                "rounded-xl border p-3.5 flex flex-col gap-2.5 transition-shadow hover:shadow-md",
                s.cardBg,
                s.cardBorder,
              ].join(" ")}
            >
              {/* 상단 : 상품명 + 상태 pill */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[17px] font-bold text-ink break-words whitespace-normal leading-snug">
                    {p.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[15px] text-ink-soft font-semibold">{p.code}</span>
                    {p.spec && (
                      <span className="text-[14px] text-zinc-400 font-medium break-words whitespace-normal">{p.spec}</span>
                    )}
                  </div>
                </div>
                <StatusPill tone={pillTone} size="xs" dot className="shrink-0 mt-0.5">
                  {pillLabel}
                </StatusPill>
              </div>

              {/* 현재고 큰 숫자 */}
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[28px] font-black tabular-nums leading-none ${s.valueColor}`}>
                  {cur.toLocaleString()}
                </span>
                <span className="text-[15px] font-semibold text-ink-soft">개</span>
              </div>

              {/* 진행 바 · 강화 (두껍게 + 퍼센트 표기) */}
              <div className="flex flex-col gap-1">
                <div className="w-full h-2.5 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.barBg}`}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                {opt > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-zinc-400">현재고 / 적정재고</span>
                    <span className={`text-[14px] font-black tabular-nums ${s.valueColor}`}>{barPct}%</span>
                  </div>
                )}
              </div>

              {/* 하단 : 최소/적정 */}
              <div className="flex items-center gap-3 text-[15px] font-semibold text-ink-soft">
                <span>
                  최소 <span className="tabular-nums font-bold text-ink">{minS > 0 ? minS : "-"}</span>
                </span>
                <span>
                  적정 <span className="tabular-nums font-bold text-ink">{opt > 0 ? opt : "-"}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VendorStockPage;
