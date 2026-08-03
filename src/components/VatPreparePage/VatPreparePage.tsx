// src/components/VatPreparePage/VatPreparePage.tsx
// 2026-08-03 · #197 · 부가세 준비 페이지
//   · 다음 신고일 카운트다운 · 신고기간별 매입세액 KPI
//   · 공급사별 매입세액 리스트 (면세 배제·매입세액 공제 대상 표시)
//   · 공급사 상세 매입 명세 · 준비 체크리스트 (localStorage)
//
// 한국 부가세 리서치 요약:
//   · 개인 일반과세자 · 반기 신고 (1~6월분 → 7/25, 7~12월분 → 1/25 다음해)
//   · 법인 일반과세자 · 분기 신고 (예정 4/25·10/25, 확정 7/25·1/25)
//   · 간이과세자 · 연 1회 (1/25 다음해)
//   · 세율 10% · 매입세액 = 매입가 × 10% (공급가액 별도과세 기준)
//   · 공제 = 매입세액 - 면세사업 관련 매입 (약국 처방전 · 전문의약품 대부분 면세)
//   · 홈택스 신고서: 매입처별 세금계산서 합계표 · 신용카드 매출전표 수령명세서
//
// API:
//   · GET /api/vat/summary?period=YYYY-1H|2H|Q1..Q4
//   · GET /api/vat/vendor-breakdown?period=...
//   · GET /api/vat/vendor-detail?period=...&supplier=...

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator, Calendar, Building2, Loader2, AlertTriangle, CheckSquare, Square,
  FileText, TrendingUp, Wallet, ChevronRight, RefreshCw,
} from "lucide-react";

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
const STORAGE_KEY = "megatown_vatPrepareState";

interface VatChecklistState {
  vatVerified: boolean;
  invoicesCollected: boolean;
  vatCalculated: boolean;
  filingReady: boolean;
}

const DEFAULT_CHECKLIST: VatChecklistState = {
  vatVerified: false,
  invoicesCollected: false,
  vatCalculated: false,
  filingReady: false,
};

function loadChecklist(period: string): VatChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHECKLIST;
    const obj = JSON.parse(raw);
    return obj[period] ?? DEFAULT_CHECKLIST;
  } catch { return DEFAULT_CHECKLIST; }
}

function saveChecklist(period: string, state: VatChecklistState) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[period] = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch { /* noop */ }
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

  // 체크리스트
  const [checklist, setChecklist] = useState<VatChecklistState>(() => loadChecklist(period));

  // period 변경 시 체크리스트 로드
  useEffect(() => { setChecklist(loadChecklist(period)); }, [period]);
  // 체크리스트 변경 시 저장
  useEffect(() => { saveChecklist(period, checklist); }, [period, checklist]);

  // 요약·공급사별 조회
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const [sRes, bRes] = await Promise.all([
        fetch(`/api/vat/summary?period=${encodeURIComponent(period)}`),
        fetch(`/api/vat/vendor-breakdown?period=${encodeURIComponent(period)}`),
      ]);
      if (!sRes.ok) throw new Error(`요약 조회 실패 (${sRes.status})`);
      if (!bRes.ok) throw new Error(`공급사별 조회 실패 (${bRes.status})`);
      const sData: VatSummary = await sRes.json();
      const bData: { rows: VendorBreakdownRow[]; warning?: string } = await bRes.json();
      setSummary(sData);
      setBreakdown(bData.rows ?? []);
      if (sData.warning) setWarning(sData.warning);
      else if (bData.warning) setWarning(bData.warning);
    } catch (e: any) {
      setError(e?.message ?? "조회 실패");
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
      const r = await fetch(`/api/vat/vendor-detail?period=${encodeURIComponent(period)}&supplier=${encodeURIComponent(supplier)}`);
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
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

  // 예상 납부·환급 · 매출세액 데이터가 없으므로 매입세액공제분 만 표시 (환급 관점)
  const expectedRefund = summary?.deductibleVat ?? 0;

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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* 로고·타이틀 */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white shrink-0">
              <Calculator size={20} />
            </div>
            <div>
              <div className="text-[15px] font-black text-slate-800 leading-tight">부가세 준비</div>
              <div className="text-[11px] text-slate-500 leading-tight">공급사별 매입세액 집계 · 신고 준비 체크리스트</div>
            </div>
          </div>

          {/* 다음 신고일 카운트다운 */}
          {summary?.next && (
            <div className={`flex items-center gap-3 px-4 py-2 rounded-xl ring-1 ${dCountColor.bg} ${dCountColor.ring} shrink-0`}>
              <Calendar size={18} className={dCountColor.text} />
              <div>
                <div className={`text-[10px] font-bold ${dCountColor.text} uppercase tracking-wide`}>{summary.next.type} · 다음 신고</div>
                <div className={`text-[13px] font-black ${dCountColor.text} leading-tight`}>
                  {summary.next.label} · <span className="tabular-nums">D-{summary.next.daysLeft}</span>
                </div>
                <div className="text-[10px] text-slate-500">신고 기한 · {summary.next.dueDate}</div>
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
                    : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {p === "current-half" ? "현재 반기" : p === "prev-half" ? "직전 반기" : "올해"}
              </button>
            ))}
            <select
              value={period}
              onChange={e => { setPreset("custom"); setPeriod(e.target.value); }}
              className="h-8 px-2 text-[11px] font-semibold border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-rose-400"
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
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {summary?.range && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span><b className="text-slate-700">조회 기간</b> · {summary.range.from} ~ {summary.range.to}</span>
            <span><b className="text-slate-700">신고 유형</b> · {summary.range.type}</span>
            <span><b className="text-slate-700">신고 기한</b> · {summary.range.dueDate}</span>
            <span><b className="text-slate-700">매입 건수</b> · {fmt(summary.rowCount)}건</span>
          </div>
        )}
      </div>

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

      {/* ── KPI 카드 4개 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="총 매입가"
          value={summary ? `${fmt(summary.totalAmount)}원` : "-"}
          sub={summary ? `공급사 ${summary.vendorCount}곳` : ""}
          icon={<Wallet size={16} />}
          color="slate"
          loading={loading}
        />
        <KpiCard
          label="이번 신고기간 매입세액"
          value={summary ? `${fmt(summary.totalVat)}원` : "-"}
          sub="공급가액의 10% (별도과세)"
          icon={<Calculator size={16} />}
          color="rose"
          loading={loading}
        />
        <KpiCard
          label="매입세액공제 대상"
          value={summary ? `${fmt(summary.deductibleVat)}원` : "-"}
          sub={summary ? `면세 ${fmt(summary.exemptVat)}원 제외` : ""}
          icon={<TrendingUp size={16} />}
          color="emerald"
          loading={loading}
        />
        <KpiCard
          label="신고 준비도"
          value={`${readiness}%`}
          sub={`체크리스트 ${Object.values(checklist).filter(Boolean).length}/4 완료`}
          icon={<CheckSquare size={16} />}
          color="sky"
          loading={false}
          bar={readiness}
        />
      </div>

      {/* ── 중단: 좌 공급사별 매입세액 · 우 매입 명세 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1 min-h-0">

        {/* 좌: 공급사별 매입세액 리스트 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-rose-500" />
              <div className="text-[13px] font-black text-slate-800">공급사별 매입세액</div>
            </div>
            <div className="text-[10px] font-bold text-slate-500">{fmt(breakdown.length)}곳</div>
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : breakdown.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-slate-300">매입 데이터 없음</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="text-slate-600">
                    <th className="text-left px-3 py-2 font-bold">공급사</th>
                    <th className="text-right px-2 py-2 font-bold">매입가</th>
                    <th className="text-right px-2 py-2 font-bold">부가세</th>
                    <th className="text-center px-2 py-2 font-bold">공제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {breakdown.map(v => (
                    <tr
                      key={v.supplier_name}
                      onClick={() => setSelectedVendor(prev => prev === v.supplier_name ? null : v.supplier_name)}
                      className={`cursor-pointer transition ${
                        selectedVendor === v.supplier_name
                          ? "bg-rose-50 border-l-2 border-rose-500"
                          : "hover:bg-slate-50 border-l-2 border-transparent"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${selectedVendor === v.supplier_name ? "text-rose-800" : "text-slate-700"}`}>
                            {v.supplier_name}
                          </span>
                          {v.category === "면세" && (
                            <span className="text-[9px] font-black px-1 py-0.5 rounded bg-slate-200 text-slate-600">면세</span>
                          )}
                        </div>
                        {v.business_number && (
                          <div className="text-[10px] text-slate-400 tabular-nums">
                            {v.business_number.length === 10
                              ? `${v.business_number.slice(0, 3)}-${v.business_number.slice(3, 5)}-${v.business_number.slice(5)}`
                              : v.business_number}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{fmt(v.amount)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-rose-700">{fmt(v.vat)}</td>
                      <td className="px-2 py-2 text-center">
                        {v.deductible ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">공제</span>
                        ) : (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">불공제</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50 shadow-inner">
                  <tr className="text-slate-800 font-black">
                    <td className="px-3 py-2 text-[11px]">합계</td>
                    <td className="px-2 py-2 text-right tabular-nums text-[11px]">
                      {fmt(breakdown.reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-700 text-[11px]">
                      {fmt(breakdown.reduce((s, r) => s + r.vat, 0))}
                    </td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* 우: 매입 명세 (선택 공급사) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-rose-500" />
              <div className="text-[13px] font-black text-slate-800">
                매입 명세{selectedVendor ? ` · ${selectedVendor}` : ""}
              </div>
            </div>
            {selectedVendor && (
              <button
                type="button"
                onClick={() => setSelectedVendor(null)}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                × 닫기
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
            {!selectedVendor ? (
              <div className="py-10 text-center text-slate-400 flex flex-col items-center gap-2">
                <ChevronRight size={20} className="opacity-30 rotate-180" />
                <div className="text-[12px] font-bold">좌측 공급사를 선택하세요</div>
                <div className="text-[10px]">매입일 · 상품 · 수량 · 매입가 · 부가세 명세</div>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400 gap-2 text-[12px]">
                <Loader2 size={13} className="animate-spin" />불러오는 중...
              </div>
            ) : detail.length === 0 ? (
              <div className="py-10 text-center text-[11px] text-slate-300">해당 기간 매입 없음</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="text-slate-600">
                    <th className="text-left px-3 py-2 font-bold">매입일</th>
                    <th className="text-left px-2 py-2 font-bold">상품</th>
                    <th className="text-right px-2 py-2 font-bold">수량</th>
                    <th className="text-right px-2 py-2 font-bold">매입가</th>
                    <th className="text-right px-2 py-2 font-bold">부가세</th>
                    <th className="text-right px-2 py-2 font-bold">합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detail.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5 tabular-nums text-slate-600">{r.purchase_date}</td>
                      <td className="px-2 py-1.5">
                        <div className="text-slate-700 font-semibold">{r.product_name}</div>
                        {r.spec && <div className="text-[10px] text-slate-400">{r.spec}</div>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{r.quantity}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{fmt(r.amount)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-rose-700 font-semibold">{fmt(r.vat)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-black text-slate-800">{fmt(r.total || r.amount + r.vat)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-slate-50 shadow-inner">
                  <tr className="text-slate-800 font-black">
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

      {/* ── 하단: 준비 체크리스트 · 예상 환급 안내 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckSquare size={14} className="text-rose-500" />
            <div className="text-[13px] font-black text-slate-800">신고 준비 체크리스트</div>
            <div className="text-[10px] text-slate-400 ml-auto">자동 저장 · localStorage</div>
          </div>
          <div className="space-y-2">
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

        <div className="bg-gradient-to-br from-rose-50 to-white rounded-xl border border-rose-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-rose-600" />
            <div className="text-[13px] font-black text-rose-800">예상 매입세액 공제</div>
          </div>
          <div className="text-[22px] font-black text-rose-700 tabular-nums leading-none mb-2">
            {fmt(expectedRefund)}<span className="text-[13px] font-bold ml-1">원</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed">
            매출세액에서 위 금액을 공제받을 수 있습니다. 매출세액이 매입세액보다 적으면 환급 · 많으면 차액만 납부.
          </div>
          <div className="mt-3 pt-3 border-t border-rose-100 text-[10px] text-slate-500 leading-relaxed">
            <b className="text-slate-700">약국 특이사항</b><br />
            처방전 조제료·전문의약품 대부분은 <b>면세</b>이므로, 관련 매입세액은 <b>안분 후 불공제</b> 처리. 일반 매약(OTC)은 과세이므로 매입세액 전액 공제 가능.
          </div>
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

const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, color, loading, bar }) => {
  const colors: Record<string, { bg: string; text: string; icon: string; bar: string }> = {
    rose:    { bg: "bg-rose-50",    text: "text-rose-700",    icon: "bg-rose-500 text-white",    bar: "bg-rose-500"    },
    sky:     { bg: "bg-sky-50",     text: "text-sky-700",     icon: "bg-sky-500 text-white",     bar: "bg-sky-500"     },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-500 text-white", bar: "bg-emerald-500" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-700",   icon: "bg-amber-500 text-white",   bar: "bg-amber-500"   },
    slate:   { bg: "bg-slate-50",   text: "text-slate-700",   icon: "bg-slate-600 text-white",   bar: "bg-slate-500"   },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} rounded-xl border border-slate-200 shadow-sm p-3.5 relative overflow-hidden`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-8 h-8 rounded-lg ${c.icon} flex items-center justify-center shrink-0`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-tight">{label}</div>
          <div className={`text-[16px] font-black ${c.text} tabular-nums leading-tight mt-0.5`}>
            {loading ? <Loader2 size={14} className="animate-spin inline" /> : value}
          </div>
          {sub && <div className="text-[10px] text-slate-500 mt-0.5 leading-tight truncate">{sub}</div>}
        </div>
      </div>
      {typeof bar === "number" && (
        <div className="mt-3 h-1.5 bg-slate-200 rounded-full overflow-hidden">
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
        : "bg-slate-50 border border-slate-200 hover:bg-slate-100"
    }`}
  >
    {checked
      ? <CheckSquare size={16} className="text-emerald-600 shrink-0 mt-0.5" />
      : <Square size={16} className="text-slate-400 shrink-0 mt-0.5" />
    }
    <div className="flex-1 min-w-0">
      <div className={`text-[12px] font-black ${checked ? "text-emerald-800" : "text-slate-700"}`}>{label}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{hint}</div>}
    </div>
  </button>
);

export default VatPreparePage;
export { VatPreparePage };
