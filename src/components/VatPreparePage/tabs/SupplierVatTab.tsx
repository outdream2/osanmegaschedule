// src/components/VatPreparePage/tabs/SupplierVatTab.tsx
// 2026-08-04 · Task #60 · 공급사별 매입세액 리스트 (부가세 신고용)
//   · 컬럼: 공급사 | 총 매입액 | 공급가액 | 부가세 (매입세액) | VAT 여부
//   · 하단 합계: 총 매입액 · 공급가액 · 부가세 (강조 · 큰 폰트) · 건수
//   · 기간 필터: 분기 · 반기 · 월 · 사용자 정의 (기본 · 현재 분기)
//   · 데이터 · /api/vat/vendor-breakdown (기존 API 재사용)
//   · 파생컬럼 X · 서버 runtime 계산 · vendor.vat_included flag 반영
//     (VAT 포함 · 부가세=amount/11, 공급가액=amount×10/11)
//     (VAT 별도 · 부가세=amount×0.1, 공급가액=amount)
//   · 좌·리스트 우·매입 명세 split-panel 은 유지 · 기존 VatPreparePage 컨테이너에서 처리
//
// 재사용 · VatPreparePage 매입 탭의 좌측 리스트 슬롯에 마운트
//
// 계산 로직 (서버 · vat.ts calcVat):
//   · vat 값이 row 에 있으면 우선
//   · 없으면 vendor.vat_included 로 자동 분리
//   · category === "면세" 인 공급사는 deductible=false (공제 불가)
//
// 부가세 신고 참고 (2026):
//   · 개인 일반과세자 반기 · 법인 분기
//   · 매입세액 공제 = 총 매입세액 - 면세사업 관련 매입세액
//   · 이 리스트가 홈택스 "매입처별 세금계산서 합계표" 대응

import React, { useMemo } from "react";
import { Building2, Loader2 } from "lucide-react";
import { StatusPill, type PillTone } from "../../common/StatusPill";

const fmt = (n: number): string => n.toLocaleString("ko-KR");

export interface VendorBreakdownRow {
  supplier_name: string;
  supplier_code: string | null;
  category: string | null;
  business_number: string | null;
  vat_included?: boolean | null;
  amount: number;   // 공급가액 (VAT 별도 기준 · 서버에서 반환)
  vat: number;      // 부가세
  total: number;    // 총 매입액 (amount + vat 또는 row.total)
  count: number;
  deductible: boolean;
}

interface SupplierVatTabProps {
  rows: VendorBreakdownRow[];
  loading?: boolean;
  selectedVendor: string | null;
  onSelectVendor: (name: string | null) => void;
}

/** 사업자번호 3-2-5 포맷 */
function fmtBusinessNumber(bn: string | null | undefined): string {
  if (!bn) return "";
  const digits = String(bn).replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return bn;
}

/** VAT 여부 라벨 · vendor.vat_included 우선 · 없으면 category=면세 · 기타 "미설정" · 2026-08-17 · StatusPill tone */
function vatFlagLabel(row: VendorBreakdownRow): { text: string; tone: PillTone; title: string } {
  if (row.category === "면세") {
    return { text: "면세", tone: "zinc", title: "면세사업자 · 부가세 없음" };
  }
  if (row.vat_included === true) {
    return { text: "포함", tone: "sky", title: "매입가에 VAT 포함 · vat = amount / 11" };
  }
  if (row.vat_included === false) {
    return { text: "별도", tone: "amber", title: "VAT 별도 과세 · vat = amount × 10%" };
  }
  return { text: "미설정", tone: "zinc", title: "공급사관리에서 VAT 포함/별도 설정 필요" };
}

const SupplierVatTab: React.FC<SupplierVatTabProps> = ({
  rows,
  loading = false,
  selectedVendor,
  onSelectVendor,
}) => {
  // 하단 합계 (건수는 count 합계 · 공급사 수는 rows.length)
  const totals = useMemo(() => {
    let supplyTotal = 0;   // 공급가액 합
    let vatTotal = 0;      // 부가세 합
    let grandTotal = 0;    // 총 매입액 합
    let entryCount = 0;    // 매입 건수 (건별 row 합)
    for (const r of rows) {
      const supply = r.amount || 0;
      const vat = r.vat || 0;
      const gross = r.total || supply + vat;
      supplyTotal += supply;
      vatTotal += vat;
      grandTotal += gross;
      entryCount += r.count || 0;
    }
    return {
      supplyTotal: Math.round(supplyTotal),
      vatTotal: Math.round(vatTotal),
      grandTotal: Math.round(grandTotal),
      entryCount,
      vendorCount: rows.length,
    };
  }, [rows]);

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm flex flex-col min-h-0 overflow-hidden h-full">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-rose-500" />
          <div className="text-[13px] font-bold text-zinc-800">공급사별 매입세액</div>
          <span className="text-[10px] font-bold text-zinc-400 ml-1">부가세 신고용</span>
        </div>
        <div className="text-[10px] font-bold text-zinc-500 tabular-nums">
          공급사 {fmt(totals.vendorCount)}곳 · 매입 {fmt(totals.entryCount)}건
        </div>
      </div>

      {/* 리스트 */}
      <div className="overflow-y-auto flex-1 min-h-0 max-h-[60vh]">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400 gap-2 text-[12px]">
            <Loader2 size={13} className="animate-spin" />불러오는 중...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-[11px] text-zinc-300">매입 데이터 없음</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-zinc-50 z-10 shadow-sm">
              <tr className="text-zinc-600">
                <th className="text-left px-3 py-2 font-bold">공급사</th>
                <th className="text-right px-2 py-2 font-bold" title="공급가액 + 부가세 (실제 매입 총액)">
                  총 매입액
                </th>
                <th className="text-right px-2 py-2 font-bold" title="VAT 제외 공급가액">
                  공급가액
                </th>
                <th className="text-right px-2 py-2 font-bold text-rose-700" title="매입세액 · 공제 대상">
                  부가세
                </th>
                <th className="text-center px-2 py-2 font-bold">VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map(v => {
                const flag = vatFlagLabel(v);
                const gross = v.total || v.amount + v.vat;
                return (
                  <tr
                    key={v.supplier_name}
                    onClick={() => onSelectVendor(selectedVendor === v.supplier_name ? null : v.supplier_name)}
                    className={`cursor-pointer transition ${
                      selectedVendor === v.supplier_name
                        ? "bg-rose-50 border-l-2 border-rose-500"
                        : "hover:bg-zinc-50 border-l-2 border-transparent"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold ${
                            selectedVendor === v.supplier_name ? "text-rose-800" : "text-zinc-700"
                          }`}
                        >
                          {v.supplier_name}
                        </span>
                        {!v.deductible && (
                          <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-zinc-100 text-zinc-500" title="매입세액 공제 불가">
                            불공제
                          </span>
                        )}
                      </div>
                      {v.business_number && (
                        <div className="text-[10px] text-zinc-400 tabular-nums">
                          {fmtBusinessNumber(v.business_number)}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-zinc-900">
                      {fmt(gross)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                      {fmt(v.amount)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-rose-700">
                      {fmt(v.vat)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span title={flag.title}>
                        <StatusPill tone={flag.tone} size="xs">{flag.text}</StatusPill>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* 하단 합계 · 부가세 강조 · 큰 폰트 */}
            <tfoot className="sticky bottom-0 bg-zinc-100 shadow-inner">
              <tr className="text-zinc-800 font-bold">
                <td className="px-3 py-3">
                  <div className="text-[11px]">합계</div>
                  <div className="text-[9px] font-bold text-zinc-500 mt-0.5">
                    {fmt(totals.vendorCount)}곳 · {fmt(totals.entryCount)}건
                  </div>
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-[12px] text-zinc-900">
                  {fmt(totals.grandTotal)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-[11px] text-zinc-700">
                  {fmt(totals.supplyTotal)}
                </td>
                {/* 부가세 합계 · 강조 · 큰 폰트 · 신고서 상 매입세액 총액 */}
                <td className="px-2 py-3 text-right">
                  <div className="tabular-nums text-[15px] font-bold text-rose-700 leading-tight">
                    {fmt(totals.vatTotal)}
                  </div>
                  <div className="text-[9px] font-bold text-rose-500/70">매입세액</div>
                </td>
                <td className="px-2 py-3"></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};

export default SupplierVatTab;
export { SupplierVatTab };
