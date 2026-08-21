// 2026-08-17 · apiClient 마이그레이션
// src/components/VatPreparePage/VatPreparePage.tsx
// 2026-08-03 · #197 · 부가세 준비 페이지
// 2026-08-04 · Phase 1 · 매출 탭 신설 + 5 KPI 확장 + 3 탭 컨테이너 (매출·매입·신고서)
// 2026-08-04 · #253 · 매출탭 완전 재편성 · DB 자동 조회
//   · [월별 부가세 탭] stock_history 매출 + purchase_details 매입 자동 · 경비 localStorage
//     · 매출세액 · 매입세액 공제 · 경비세액 · 예상 부가세 실시간 재계산
//     · 이전 · localStorage 매출 수동 입력 (useSalesLocal) · 완전 제거
//   · [매입 탭] 공급사별 매입세액 리스트 + 매입 명세 · vendors.vat_included flag 표시
//   · [신고서 미리보기 탭] Phase 3 예정 placeholder
//   · 공통 · 준비 체크리스트 (localStorage)
//
// 한국 부가세 리서치 요약:
//   · 개인 일반과세자 · 반기 신고 (1~6월분 → 7/25, 7~12월분 → 1/25 다음해)
//   · 법인 일반과세자 · 분기 신고 (예정 4/25·10/25, 확정 7/25·1/25)
//   · 간이과세자 · 연 1회 (1/25 다음해)
//   · 세율 10% · 매출세액 = 과세 공급가액 × 10% · 매입세액 = 매입가 × 10%
//   · 납부세액 = 매출세액 - 매입세액공제 (음수면 환급)
//   · 공제 = 매입세액 - 면세사업 관련 매입 (약국 처방전 · 전문의약품 대부분 면세)
//   · 홈택스 신고서: 매입처별 세금계산서 합계표 · 신용카드 매출전표 수령명세서
//
// API:
//   · GET /api/vat/summary?period=YYYY-1H|2H|Q1..Q4
//   · GET /api/vat/vendor-breakdown?period=...
//   · GET /api/vat/vendor-detail?period=...&supplier=...

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import {
  Calculator, Calendar, Loader2, AlertTriangle, CheckSquare, Square,
  FileText, TrendingUp, ChevronRight, RefreshCw,
  Receipt, PackageCheck, FileCheck2,
} from "lucide-react";
import SalesTab from "./tabs/SalesTab";
import SupplierVatTab from "./tabs/SupplierVatTab";
import { AccentBar } from "../common/AccentBar";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { useKvSetting } from "../../hooks/useKvSetting";

// ─── 타입 ────────────────────────────────────────────────────────

type PeriodPreset = "current-half" | "prev-half" | "current-year" | "custom";

interface PeriodRange { from: string; to: string; label: string; type: "예정" | "확정"; dueDate: string; }
interface NextDeadline { period: string; label: string; type: "예정" | "확정"; dueDate: string; daysLeft: number; }

interface VatSummary {
  range: PeriodRange;
  next: NextDeadline;
  totalAmount: number;
  totalVat: number;
  deductibleVat: number;
  exemptVat: number;
  vendorCount: number;
  rowCount: number;
  warning?: string;
}

interface VendorBreakdownRow {
  supplier_name: string;
  supplier_code: string | null;
  category: string | null;
  business_number: string | null;
  vat_included?: boolean | null;   // 2026-08-04 · Task #60 · VAT 여부 컬럼 표시용
  amount: number;
  vat: number;
  total: number;
  count: number;
  deductible: boolean;
}

interface VendorDetailRow {
  id: number;
  purchase_date: string;
  product_code: string;
  product_name: string;
  spec: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  vat: number;
  total: number;
}

// ─── 체크리스트 저장 ────────────────────────────────────────────
// 2026-08-06 · T-DB-Migrate-LocalStorage
//   · 이전: localStorage `megatown_vatPrepareState`
//   · 현재: Supabase settings key `vat_prepare_state` · JSONB
//           `{ [period]: { vatVerified, invoicesCollected, vatCalculated, filingReady } }`
//   · 여러 관리자 반기별 체크리스트 진행 상태 공유
//   · legacy localStorage 자동 마이그레이션 (useKvSetting 내부)
const LEGACY_STORAGE_KEY = "megatown_vatPrepareState";
const VAT_PREPARE_SETTINGS_KEY = "vat_prepare_state";

interface VatChecklistState {
  vatVerified: boolean;
  invoicesCollected: boolean;
  vatCalculated: boolean;
  filingReady: boolean;
}

type VatPrepareMap = Record<string, VatChecklistState>;

const DEFAULT_CHECKLIST: VatChecklistState = {
  vatVerified: false,
  invoicesCollected: false,
  vatCalculated: false,
  filingReady: false,
};

const EMPTY_PREPARE_MAP: VatPrepareMap = {};

/** 서버/legacy raw → VatPrepareMap · 각 period 값 정규화 */
function sanitizeVatPrepareMap(raw: unknown): VatPrepareMap | null {
  if (raw == null) return null;
  if (typeof raw !== "object") return null;
  const out: VatPrepareMap = {};
  for (const [period, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    out[period] = {
      vatVerified: obj.vatVerified === true,
      invoicesCollected: obj.invoicesCollected === true,
      vatCalculated: obj.vatCalculated === true,
      filingReady: obj.filingReady === true,
    };
  }
  return out;
}

// ─── 유틸 ────────────────────────────────────────────────────────
const fmt = (n: number): string => n.toLocaleString("ko-KR");

/** 오늘 기준 현재 반기 (1H / 2H) */
function currentHalfPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  return m <= 6 ? `${y}-1H` : `${y}-2H`;
}

/** 오늘 기준 직전 반기 */
function prevHalfPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m <= 6) return `${y - 1}-2H`;
  return `${y}-1H`;
}

// ─── 탭 컨테이너 ─────────────────────────────────────────────────
type MainTab = "sales" | "purchase" | "preview";

// 매출 KPI (SalesTab 에서 상위로 전달)
interface SalesAggregate {
  taxableSales: number;
  exemptSales: number;
  outputVat: number;
  salesRowCount: number;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────

const VatPreparePage: React.FC = () => {
  // 신고 기간 선택
  const [period, setPeriod] = useState<string>(() => currentHalfPeriod());
  const [preset, setPreset] = useState<PeriodPreset>("current-half");

  // 요약 · 공급사별 · 상세
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [breakdown, setBreakdown] = useState<VendorBreakdownRow[]>([]);
  const [detail, setDetail] = useState<VendorDetailRow[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // 체크리스트 · Supabase settings 서버 저장 (legacy localStorage 자동 마이그레이션)
  //   전체 map (반기별 4 flag) 을 하나의 settings row 로 저장
  //   개별 period 는 map[period] 로 접근
  const {
    value: prepareMap,
    setValue: setPrepareMap,
  } = useKvSetting<VatPrepareMap>({
    key: VAT_PREPARE_SETTINGS_KEY,
    defaultValue: EMPTY_PREPARE_MAP,
    legacyStorageKey: LEGACY_STORAGE_KEY,
    sanitize: sanitizeVatPrepareMap,
  });

  const checklist: VatChecklistState = prepareMap[period] ?? DEFAULT_CHECKLIST;
  const setChecklist = useCallback((next: VatChecklistState | ((prev: VatChecklistState) => VatChecklistState)) => {
    setPrepareMap(prev => {
      const currentForPeriod = prev[period] ?? DEFAULT_CHECKLIST;
      const resolved = typeof next === "function"
        ? (next as (p: VatChecklistState) => VatChecklistState)(currentForPeriod)
        : next;
      return { ...prev, [period]: resolved };
    });
  }, [period, setPrepareMap]);

  // 메인 탭 (매출/매입/신고서 미리보기)
  const [mainTab, setMainTab] = useState<MainTab>("sales");

  // 매출 KPI (SalesTab 이 계산해서 전달)
  const [salesAgg, setSalesAgg] = useState<SalesAggregate>({
    taxableSales: 0,
    exemptSales: 0,
    outputVat: 0,
    salesRowCount: 0,
  });
  const handleSalesAggregate = useCallback((agg: SalesAggregate) => {
    setSalesAgg(agg);
  }, []);

  // 체크리스트는 useKvSetting 이 자동 로드·저장 (period 변경 시에도 map 에서 조회)

  // 요약·공급사별 조회
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const [{ data: sData }, { data: bData }] = await Promise.all([
        api.get<VatSummary>(`/api/vat/summary?period=${encodeURIComponent(period)}`),
        api.get<{ rows: VendorBreakdownRow[]; warning?: string }>(`/api/vat/vendor-breakdown?period=${encodeURIComponent(period)}`),
      ]);
      setSummary(sData);
      setBreakdown(bData.rows ?? []);
      if (sData.warning) setWarning(sData.warning);
      else if (bData.warning) setWarning(bData.warning);
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : (e?.message ?? "조회 실패"));
      setSummary(null);
      setBreakdown([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  // 공급사 상세 조회
  const loadDetail = useCallback(async (supplier: string) => {
    setDetailLoading(true);
    try {
      const { data: j } = await api.get<{ rows: VendorDetailRow[] }>(`/api/vat/vendor-detail?period=${encodeURIComponent(period)}&supplier=${encodeURIComponent(supplier)}`);
      setDetail(j.rows ?? []);
    } catch {
      setDetail([]);
    } finally {
      setDetailLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (selectedVendor) loadDetail(selectedVendor);
    else setDetail([]);
  }, [selectedVendor, loadDetail]);

  // 신고 준비도 계산
  const readiness = useMemo(() => {
    const items = [checklist.vatVerified, checklist.invoicesCollected, checklist.vatCalculated, checklist.filingReady];
    const done = items.filter(Boolean).length;
    return Math.round((done / items.length) * 100);
  }, [checklist]);

  // 예상 매입세액 공제 (매입 탭 하단 · 안내용)
  const expectedRefund = summary?.deductibleVat ?? 0;

  // ── Phase 1 매출·매입 통합 계산 ─────────────────────────────
  //   · 매출세액 (outputVat)          · SalesTab 에서 계산
  //   · 매입세액 공제 (deductibleVat) · 서버 /api/vat/summary
  //   · 납부예상 (netPayable) = 매출세액 - 매입세액 공제
  //     양수 = 납부 · 음수 = 환급
  const outputVat = salesAgg.outputVat;
  const netPayable = outputVat - (summary?.deductibleVat ?? 0);

  // Preset 전환 핸들러
  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "current-half") setPeriod(currentHalfPeriod());
    else if (p === "prev-half") setPeriod(prevHalfPeriod());
    else if (p === "current-year") {
      const y = new Date().getFullYear();
      setPeriod(`${y}-1H`);
    }
  };

  // 카운트다운 색상 (D-30 이내 rose · D-60 이내 amber · 그 외 sky)
  const dCountColor = (() => {
    const d = summary?.next?.daysLeft ?? 999;
    if (d <= 30) return { bg: "bg-rose-50", text: "text-rose-700", ring: "ring-rose-200" };
    if (d <= 60) return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" };
    return { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-200" };
  })();

  return (
    <div className="flex flex-col gap-3 min-h-0 h-full">

      {/* ── 상단: 다음 신고일 · Preset 선택 ── */}
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* 로고·타이틀 · 2026-08-17 · 최신 트렌드 · accent bar + 딥네이비 통일 */}
          <div className="flex items-center gap-3 shrink-0">
            <AccentBar h={26} className="shrink-0" />
            <div className="w-10 h-10 rounded-xl bg-brand-deep flex items-center justify-center text-white shrink-0 shadow-sm">
              <Calculator size={20} />
            </div>
            <div>
              <div className="text-[18px] font-bold text-ink leading-tight tracking-tight">부가세 준비</div>
              <div className="text-[13px] text-ink-soft leading-tight mt-0.5">공급사별 매입세액 집계 · 신고 준비 체크리스트</div>
            </div>
          </div>

          {/* 다음 신고일 카운트다운 */}
          {summary?.next && (
            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ring-1 ${dCountColor.bg} ${dCountColor.ring} shrink-0`}>
              <Calendar size={18} className={dCountColor.text} />
              <div>
                <div className={`text-[10px] font-bold ${dCountColor.text} uppercase tracking-wide`}>{summary.next.type} · 다음 신고</div>
                <div className={`text-[13px] font-bold ${dCountColor.text} leading-tight`}>
                  {summary.next.label} · <span className="tabular-nums">D-{summary.next.daysLeft}</span>
                </div>
                <div className="text-[10px] text-zinc-500">신고 기한 · {summary.next.dueDate}</div>
              </div>
            </div>
          )}

          {/* Preset · 새로고침 · 우측 정렬 */}
          <div className="flex items-center gap-2 lg:ml-auto flex-wrap">
            {(["current-half", "prev-half", "current-year"] as PeriodPreset[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`h-8 px-3 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                  preset === p
                    ? "bg-rose-500 text-white shadow"
                    : "bg-zinc-50 text-zinc-600 border border-line hover:bg-zinc-100"
                }`}
              >
                {p === "current-half" ? "현재 반기" : p === "prev-half" ? "직전 반기" : "올해"}
              </button>
            ))}
            <select
              value={period}
              onChange={e => { setPreset("custom"); setPeriod(e.target.value); }}
              className="h-8 px-2 text-[11px] font-semibold border border-line rounded-lg outline-none focus:ring-2 focus:ring-brand-tint"
            >
              {[0, 1, 2].map(offset => {
                const y = new Date().getFullYear() - offset;
                return (
                  <React.Fragment key={y}>
                    <option value={`${y}-1H`}>{y} 1기 확정 (1~6월)</option>
                    <option value={`${y}-2H`}>{y} 2기 확정 (7~12월)</option>
                    <option value={`${y}-Q1`}>{y} 1기 예정 (1~3월)</option>
                    <option value={`${y}-Q3`}>{y} 2기 예정 (7~9월)</option>
                  </React.Fragment>
                );
              })}
            </select>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-zinc-50 border border-line hover:bg-zinc-100 text-zinc-600 cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {summary?.range && (
          <div className="mt-3 pt-3 border-t border-zinc-100 text-[11px] text-zinc-500 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><b className="text-zinc-700">조회 기간</b> · {summary.range.from} ~ {summary.range.to}</span>
            <span><b className="text-zinc-700">신고 유형</b> · {summary.range.type}</span>
            <span><b className="text-zinc-700">신고 기한</b> · {summary.range.dueDate}</span>
            <span><b className="text-zinc-700">매입 건수</b> · {fmt(summary.rowCount)}건</span>
          </div>
        )}
      </Card>

      {/* ── 경고 · 에러 ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-center gap-2 text-[12px] text-rose-700">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}
      {warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-[12px] text-amber-800">
          <AlertTriangle size={14} /><span>{warning}</span>
        </div>
      )}

      {/* ── KPI 카드 4개 (월별 탭에서 상세 계산) ── */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        title="본 계산은 참고용이며, 실제 신고는 세무사 검토 후 진행하세요."
      >
        <KpiCard
          label="매출 공급가액"
          value={`${fmt(salesAgg.taxableSales)}원`}
          sub={salesAgg.salesRowCount > 0 ? `stock_history · ${salesAgg.salesRowCount}건` : "월별 탭 참조"}
          icon={<Receipt size={16} />}
          color="rose"
          loading={false}
        />
        <KpiCard
          label="매출세액"
          value={`${fmt(outputVat)}원`}
          sub="매출 총액 × 10/110"
          icon={<TrendingUp size={16} />}
          color="rose"
          loading={false}
        />
        <KpiCard
          label="매입세액 공제"
          value={summary ? `${fmt(summary.deductibleVat)}원` : "-"}
          sub={summary ? `총 매입세액 ${fmt(summary.totalVat)}원 중 공제분` : ""}
          icon={<PackageCheck size={16} />}
          color="emerald"
          loading={loading}
        />
        <KpiCard
          label={netPayable >= 0 ? "납부 예상 (경비 전)" : "환급 예상 (경비 전)"}
          value={`${fmt(Math.abs(netPayable))}원`}
          sub={netPayable >= 0 ? "매출세액 − 매입공제" : "매입공제 > 매출세액"}
          icon={<Calculator size={16} />}
          color={netPayable >= 0 ? "rose" : "emerald"}
          loading={loading}
        />
      </div>

      {/* 신고 준비도 (별도 · 5 KPI 카드 정렬 유지 위해 하단 얇은 바) */}
      <Card padding="none" className="px-4 py-3 flex items-center gap-3">
        <CheckSquare size={14} className="text-sky-500 shrink-0" />
        <div className="text-[11px] font-bold text-zinc-600 shrink-0">신고 준비도</div>
        <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 transition-all"
            style={{ width: `${readiness}%` }}
          />
        </div>
        <div className="text-[11px] font-bold text-sky-700 tabular-nums shrink-0">{readiness}%</div>
        <div className="text-[10px] text-zinc-500 shrink-0 hidden sm:block">
          체크리스트 {Object.values(checklist).filter(Boolean).length}/4 완료
        </div>
      </Card>

      {/* ── 메인 탭 (매출 / 매입 / 신고서 미리보기) ── */}
      <div className="bg-white rounded-xl border border-line shadow-sm">
        <div className="flex border-b border-line">
          {([
            { key: "sales" as const,    label: "월별 부가세",       icon: Receipt,    color: "text-rose-600",    activeBar: "bg-rose-500" },
            { key: "purchase" as const, label: "매입",             icon: PackageCheck, color: "text-emerald-600", activeBar: "bg-emerald-500" },
            { key: "preview" as const,  label: "신고서 미리보기",   icon: FileCheck2, color: "text-sky-600",     activeBar: "bg-sky-500" },
          ]).map(t => {
            const active = mainTab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setMainTab(t.key)}
                className={`relative flex items-center gap-2 px-5 py-3 text-[13px] font-bold transition cursor-pointer ${
                  active ? t.color : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} />
                <span>{t.label}</span>
                {active && (
                  <span className={`absolute left-0 right-0 -bottom-px h-[3px] ${t.activeBar}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 매출 탭 ── */}
      {mainTab === "sales" && summary?.range && (
        <SalesTab
          fromDate={summary.range.from}
          toDate={summary.range.to}
          onAggregateChange={handleSalesAggregate}
        />
      )}
      {mainTab === "sales" && !summary?.range && (
        <Card padding="none" className="p-8 text-center">
          <Spinner size={20} tone="zinc" />
          <div className="text-[11px] text-zinc-400 mt-2">기간 정보를 불러오는 중…</div>
        </Card>
      )}

      {/* ── 신고서 미리보기 탭 (Phase 3 placeholder) ── */}
      {mainTab === "preview" && (
        <Card padding="none" className="p-10 text-center">
          <FileCheck2 size={32} className="text-sky-400 mx-auto" />
          <div className="mt-3 text-[13px] font-bold text-zinc-700">신고서 미리보기 · Phase 3 예정</div>
          <div className="mt-1 text-[11px] text-zinc-500 leading-relaxed max-w-lg mx-auto">
            홈택스 일반과세자 신고서 서식 · 매입처별 세금계산서 합계표 · 신용카드 매출전표 수령명세서 등
            <br />
            자동 생성 · PDF 미리보기 기능을 Phase 3 에서 추가 예정입니다.
          </div>
        </Card>
      )}

      {/* ── 매입 탭 (기존 좌 공급사별 리스트 · 우 매입 명세) ── */}
      {mainTab === "purchase" && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1 min-h-0">

        {/* 좌: 공급사별 매입세액 리스트 (Task #60 · SupplierVatTab 분리) */}
        <div className="lg:col-span-2 min-h-0">
          <SupplierVatTab
            rows={breakdown}
            loading={loading}
            selectedVendor={selectedVendor}
            onSelectVendor={setSelectedVendor}
          />
        </div>

        {/* 우: 매입 명세 (선택 공급사) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-line shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-rose-500" />
              <div className="text-[13px] font-bold text-zinc-800">
                매입 명세{selectedVendor ? ` · ${selectedVendor}` : ""}
              </div>
            </div>
            {selectedVendor && (
              <button
                type="button"
                onClick={() => setSelectedVendor(null)}
                className="text-[10px] font-bold text-zinc-500 hover:text-zinc-800 cursor-pointer"
              >
                × 닫기
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
            {!selectedVendor ? (
              <div className="py-10 text-center text-zinc-400 flex flex-col items-center gap-2">
                <ChevronRight size={20} className="opacity-30 rotate-180" />
                <div className="text-[12px] font-bold">좌측 공급사를 선택하세요</div>
                <div className="text-[10px]">매입일 · 상품 · 수량 · 매입가 · 부가세 명세</div>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner tone="zinc" size={13} label="불러오는 중..." labelSize={12} /></div>
            ) : detail.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-zinc-300">해당 기간 매입 없음</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-zinc-50 z-10 shadow-sm">
                  <tr className="text-zinc-600">
                    <th className="text-left px-3 py-2 font-bold">매입일</th>
                    <th className="text-left px-2 py-2 font-bold">상품</th>
                    <th className="text-right px-2 py-2 font-bold">수량</th>
                    <th className="text-right px-2 py-2 font-bold">매입가</th>
                    <th className="text-right px-2 py-2 font-bold">부가세</th>
                    <th className="text-right px-2 py-2 font-bold">합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {detail.map(r => (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-1.5 tabular-nums text-zinc-600">{r.purchase_date}</td>
                      <td className="px-2 py-1.5">
                        <div className="text-zinc-700 font-semibold">{r.product_name}</div>
                        {r.spec && <div className="text-[10px] text-zinc-400">{r.spec}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{r.quantity}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">{fmt(r.amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700 font-semibold">{fmt(r.vat)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-zinc-800">{fmt(r.total || r.amount + r.vat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-zinc-50 shadow-inner">
                  <tr className="text-zinc-800 font-bold">
                    <td className="px-3 py-2 text-[11px]" colSpan={3}>합계 · {detail.length}건</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[11px]">
                      {fmt(detail.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-700 text-[11px]">
                      {fmt(detail.reduce((s, r) => s + r.vat, 0))}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[11px]">
                      {fmt(detail.reduce((s, r) => s + (r.total || r.amount + r.vat), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 예상 매입세액 공제 (매입 탭 하단 · 안내용) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <PackageCheck size={14} className="text-emerald-600" />
            <div className="text-[13px] font-bold text-emerald-800">예상 매입세액 공제</div>
          </div>
          <div className="text-[22px] font-bold text-emerald-700 tabular-nums leading-none mb-2">
            {fmt(expectedRefund)}<span className="text-[13px] font-bold ml-1">원</span>
          </div>
          <div className="text-[10px] text-zinc-500 leading-relaxed">
            매출세액에서 위 금액을 공제받을 수 있습니다. 매출세액이 매입세액보다 적으면 환급 · 많으면 차액만 납부.
          </div>
          <div className="mt-3 pt-3 border-t border-emerald-100 text-[10px] text-zinc-500 leading-relaxed">
            <b className="text-zinc-700">약국 특이사항</b><br />
            처방전 조제료·전문의약품 대부분은 <b>면세</b>이므로, 관련 매입세액은 <b>안분 후 불공제</b> 처리. 일반 매약(OTC)은 과세이므로 매입세액 전액 공제 가능.
          </div>
        </div>

        <div className={`${netPayable >= 0 ? "bg-rose-50" : "bg-emerald-50"} rounded-xl border ${netPayable >= 0 ? "border-rose-200" : "border-emerald-200"} shadow-sm p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Calculator size={14} className={netPayable >= 0 ? "text-rose-600" : "text-emerald-600"} />
            <div className={`text-[13px] font-bold ${netPayable >= 0 ? "text-rose-800" : "text-emerald-800"}`}>
              {netPayable >= 0 ? "예상 납부세액" : "예상 환급세액"}
            </div>
          </div>
          <div className={`text-[22px] font-bold ${netPayable >= 0 ? "text-rose-700" : "text-emerald-700"} tabular-nums leading-none mb-2`}>
            {fmt(Math.abs(netPayable))}<span className="text-[13px] font-bold ml-1">원</span>
          </div>
          <div className="text-[10px] text-zinc-500 leading-relaxed">
            매출세액 <b className="text-zinc-700">{fmt(outputVat)}원</b>
            {" − "}
            매입공제 <b className="text-zinc-700">{fmt(expectedRefund)}원</b>
            {" = "}
            <b className={netPayable >= 0 ? "text-rose-700" : "text-emerald-700"}>{fmt(netPayable)}원</b>
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100 text-[10px] text-zinc-400 leading-relaxed">
            <AlertTriangle size={10} className="inline mb-0.5 mr-0.5" />
            본 계산은 참고용 · 실제 신고는 세무사 검토 필수
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── 공통 하단: 준비 체크리스트 · 2026-08-17 · accent bar + brand-deep 통일 ── */}
      <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_2px_8px_rgba(10,46,74,0.06)] p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <AccentBar />
          <CheckSquare size={16} className="text-brand-deep" />
          <div className="text-[16px] font-bold text-ink tracking-tight">신고 준비 체크리스트</div>
          <div className="text-[12px] text-ink-soft ml-auto font-medium">자동 저장 · 서버 공유</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <ChecklistItem
            label="모든 공급사 VAT 여부 확인"
            hint="공급사관리에서 카테고리를 '면세' 또는 일반으로 설정"
            checked={checklist.vatVerified}
            onChange={v => setChecklist(prev => ({ ...prev, vatVerified: v }))}
          />
          <ChecklistItem
            label="거래명세서·세금계산서 확보"
            hint="홈택스 매입처별 세금계산서 합계표 · 신용카드 매출전표 수령명세서"
            checked={checklist.invoicesCollected}
            onChange={v => setChecklist(prev => ({ ...prev, invoicesCollected: v }))}
          />
          <ChecklistItem
            label="매입세액 계산 완료"
            hint="공제 대상 매입세액 확정 · 면세사업분 안분 계산 (약국 조제료 관련 매입)"
            checked={checklist.vatCalculated}
            onChange={v => setChecklist(prev => ({ ...prev, vatCalculated: v }))}
          />
          <ChecklistItem
            label="홈택스 신고 서식 준비"
            hint="일반과세자 신고서 · 매입처별 세금계산서 합계표 등"
            checked={checklist.filingReady}
            onChange={v => setChecklist(prev => ({ ...prev, filingReady: v }))}
          />
        </div>
      </div>
    </div>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: "rose" | "sky" | "emerald" | "amber" | "slate";
  loading: boolean;
  bar?: number; // 0-100
}

// 2026-08-17 · 세련 · Vercel Dashboard 톤 · 뉴트럴 body + status dot + 값 semantic color
const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, color, loading, bar }) => {
  const colors: Record<string, { dot: string; text: string; iconBg: string; iconColor: string; bar: string }> = {
    rose:    { dot: "bg-rose-500",    text: "text-rose-700",    iconBg: "bg-rose-50",    iconColor: "text-rose-600",    bar: "bg-rose-500" },
    sky:     { dot: "bg-sky-500",     text: "text-sky-700",     iconBg: "bg-sky-50",     iconColor: "text-sky-600",     bar: "bg-sky-500" },
    emerald: { dot: "bg-emerald-500", text: "text-emerald-700", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", bar: "bg-emerald-500" },
    amber:   { dot: "bg-amber-500",   text: "text-amber-700",   iconBg: "bg-amber-50",   iconColor: "text-amber-600",   bar: "bg-amber-500" },
    slate:   { dot: "bg-zinc-400",    text: "text-ink",         iconBg: "bg-zinc-100",   iconColor: "text-zinc-700",    bar: "bg-zinc-500" },
  };
  const c = colors[color];
  return (
    <div className="bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.03),0_2px_8px_rgba(10,46,74,0.04)] p-3.5 relative overflow-hidden">
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0 ${c.iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            <div className="text-[12px] font-semibold text-ink-soft tracking-tight">{label}</div>
          </div>
          <div className={`text-[18px] font-extrabold ${c.text} tabular-nums leading-tight mt-1`}>
            {loading ? <Spinner size={14} tone="zinc" className="inline" /> : value}
          </div>
          {sub && <div className="text-[11px] text-ink-soft mt-0.5 leading-tight truncate font-medium">{sub}</div>}
        </div>
      </div>
      {typeof bar === "number" && (
        <div className="mt-3 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${c.bar} transition-all`}
            style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
          />
        </div>
      )}
    </div>
  );
};

// ─── Checklist Item ─────────────────────────────────────────────
interface ChecklistItemProps { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; }

const ChecklistItem: React.FC<ChecklistItemProps> = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition cursor-pointer ${
      checked
        ? "bg-emerald-50 border border-emerald-200"
        : "bg-zinc-50 border border-line hover:bg-zinc-100"
    }`}
  >
    {checked
      ? <CheckSquare size={16} className="text-emerald-600 shrink-0 mt-0.5" />
      : <Square size={16} className="text-zinc-400 shrink-0 mt-0.5" />
    }
    <div className="flex-1 min-w-0">
      <div className={`text-[12px] font-bold ${checked ? "text-emerald-800" : "text-zinc-700"}`}>{label}</div>
      {hint && <div className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">{hint}</div>}
    </div>
  </button>
);

export default VatPreparePage;
export { VatPreparePage };
