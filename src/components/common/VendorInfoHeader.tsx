// src/components/common/VendorInfoHeader.tsx
// T-COMMON-VendorInfo · 공급사 정보 헤더 공통 컴포넌트 (2026-08-06)
//
// 사용처:
//   - PurchaseHistoryTab/VendorHeaderPanel → 이 컴포넌트로 위임
//   - PaymentInfoTab · 우측 상단 공급사 카드
//   - 필요 시 StockManagePage/SupplierTab 상세 패널
//
// Props:
//   vendor    · VendorInfoFull (회사명·분류·담당자·전화·이메일·사업자번호·부가세·등록일)
//   kpis?     · 매입 KPI (누적·이번달·MoM%·평균주기·활성SKU수) — 없으면 KPI 줄 비표시
//   kpisLoading? · KPI 로딩 중 여부
//   detailRowCount? · KPI 건수 표시용 (예: "365일 내 N건")
//   onEdit?   · [조회 및 수정] 버튼 클릭 콜백 (VendorDetailModal 열기는 부모 담당)
//   dense?    · true → 아이콘·여백 축소 (PaymentInfoTab 등 컴팩트 레이아웃)
//   className?

import React from "react";
import {
  Building2, Phone, User2, Calendar, Package,
  TrendingUp, TrendingDown, Minus, Pencil,
  ShoppingCart, MapPin, Receipt, CircleDot, AlertTriangle,
} from "lucide-react";
import { VendorCategoryBadge } from "./VendorCategoryBadge";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import { fmtWonNoUnit, fmtDateSlice } from "../../lib/format";

// ─── Types ─────────────────────────────────────────────────────────────────

/** 공급사 기본 정보 (DB 컬럼 기준 · camelCase 변환 없음) */
export interface VendorInfoFull {
  id: number;
  company_name: string;
  category: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  business_number?: string | null;
  note?: string | null;
  created_at?: string | null;
  /** DB: vat_included (boolean | null) */
  vat_included?: boolean | null;
  // 2026-08-24 · #178 · xlsx 마스터 5 신규 필드 (읽기 표시)
  order_method?: string | null;
  region?: string | null;
  invoice_method?: string | null;
  order_status?: string | null;
  special_notes?: string | null;
}

/** 매입 KPI (VendorHeaderPanel.calcKpis 결과와 동일 구조) */
export interface VendorKpis {
  totalAmount: number;
  thisMonthAmount: number;
  lastMonthAmount: number;
  /** null = 전월 매입 없음 */
  momPct: number | null;
  /** null = 매입일 2개 미만 */
  avgCycleDays: number | null;
  activeSkuCount: number;
}

export interface VendorInfoHeaderProps {
  vendor: VendorInfoFull;
  kpis?: VendorKpis;
  kpisLoading?: boolean;
  /** KPI 건수 표시용 (예: detailRows.length) */
  detailRowCount?: number;
  /** [조회 및 수정] 버튼 클릭 → 부모가 VendorDetailModal 열기 */
  onEdit?: () => void;
  /** true → 여백·아이콘 축소 */
  dense?: boolean;
  className?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtWon = fmtWonNoUnit;

function fmtBizNum(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 10) return String(n);
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

function fmtPhone(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return String(n);
}

const fmtDate = fmtDateSlice;

// ─── VendorInfoHeader ──────────────────────────────────────────────────────

export const VendorInfoHeader: React.FC<VendorInfoHeaderProps> = ({
  vendor,
  kpis,
  kpisLoading = false,
  detailRowCount,
  onEdit,
  dense = false,
  className = "",
}) => {
  // MoM 아이콘·톤
  const momIcon = kpis == null || kpis.momPct == null
    ? <Minus size={10} />
    : kpis.momPct > 0 ? <TrendingUp size={10} /> : kpis.momPct < 0 ? <TrendingDown size={10} /> : <Minus size={10} />;
  const momTone: "emerald" | "rose" | "slate" =
    kpis == null || kpis.momPct == null ? "slate"
    : kpis.momPct > 5 ? "emerald"
    : kpis.momPct < -5 ? "rose"
    : "slate";
  const momText = kpis == null || kpis.momPct == null
    ? "전월 매입 없음"
    : kpis.momPct === 0
      ? "전월 대비 변동 없음"
      : `전월 대비 ${kpis.momPct > 0 ? "+" : ""}${kpis.momPct.toFixed(1)}%`;

  const pad = dense ? "p-2.5" : "p-3";

  // 2026-08-06 · 표시명: (주)·주식회사·(vat미포함) 등 부가정보 제거
  // 2026-08-06 · vat_included 자동 추정 · 기본 true (VAT포함)
  //   1. vendor.vat_included 명시값 우선
  //   2. 이름에 "vat미포함/별도/없음" 있으면 false (부가세 별도)
  //   3. 그 외 (null) 는 true 로 기본 표시 (사용자 요청)
  const rawName = vendor.company_name ?? "";
  const displayName = displayVendorName(rawName);
  const nameHintsVatExcluded = /vat\s*(미포함|별도|없음)/i.test(rawName);
  const effectiveVatIncluded: boolean =
    vendor.vat_included === true ? true
    : vendor.vat_included === false ? false
    : nameHintsVatExcluded ? false
    : true;

  return (
    <div className={`bg-white rounded-xl border border-line shadow-sm ${pad} flex flex-col gap-2.5 ${className}`}>
      {/* ── 공급사 헤더 라인 ── */}
      <div className="flex items-start gap-2 flex-wrap">
        <Building2 size={dense ? 14 : 16} className="text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          {/* 공급사명 · 분류 · 사업자번호 · 2026-08-06 · 정제 이름 사용 */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-bold text-zinc-800 break-words" title={rawName}>{displayName}</h2>
            <VendorCategoryBadge category={vendor.category} />
            {vendor.business_number && (
              <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-50 border border-line rounded px-1.5 py-0.5 tabular-nums">
                {fmtBizNum(vendor.business_number)}
              </span>
            )}
            {/* 부가세 · 텍스트 · 2026-08-06 · 사용자 요청 · 배지 → 깔끔한 텍스트 */}
            {effectiveVatIncluded === true && (
              <span className="text-[11px] font-semibold text-emerald-700">VAT 포함</span>
            )}
            {effectiveVatIncluded === false && (
              <span
                className="text-[11px] font-semibold text-zinc-500"
                title={vendor.vat_included == null && nameHintsVatExcluded ? "공급사명에서 자동 추론" : undefined}
              >
                부가세 별도
              </span>
            )}
          </div>

          {/* Sub-line · 담당자·전화·이메일·등록일 */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-zinc-500">
            {vendor.contact_name && (
              <span className="inline-flex items-center gap-1">
                <User2 size={10} className="text-zinc-400" />
                {vendor.contact_name}
              </span>
            )}
            {vendor.phone && (
              <a
                href={`tel:${vendor.phone.replace(/\D/g, "")}`}
                className="inline-flex items-center gap-1 tabular-nums hover:text-sky-600 transition"
              >
                <Phone size={10} className="text-zinc-400" />
                {fmtPhone(vendor.phone)}
              </a>
            )}
            {vendor.email && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]" title={vendor.email}>
                @{vendor.email}
              </span>
            )}
            {vendor.created_at && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Calendar size={10} className="text-zinc-400" />
                등록 {fmtDate(vendor.created_at)}
              </span>
            )}
          </div>

          {/* 2026-08-24 · #178 · xlsx 5 필드 · 값 있는 항목만 표시 */}
          {(vendor.order_method || vendor.region || vendor.invoice_method || vendor.order_status) && (
            <div className="flex items-center gap-3 flex-wrap text-[12px] text-zinc-600 mt-0.5">
              {vendor.order_method && (
                <span className="inline-flex items-center gap-1" title={`주문 방식: ${vendor.order_method}`}>
                  <ShoppingCart size={11} className="text-emerald-500 shrink-0" />
                  <span className="text-zinc-400 font-semibold">주문</span>
                  <span className="font-semibold text-emerald-700">{vendor.order_method}</span>
                </span>
              )}
              {vendor.region && (
                <span className="inline-flex items-center gap-1" title={`지역: ${vendor.region}`}>
                  <MapPin size={11} className="text-sky-500 shrink-0" />
                  <span className="text-zinc-400 font-semibold">지역</span>
                  <span className="font-semibold text-sky-700">{vendor.region}</span>
                </span>
              )}
              {vendor.invoice_method && (
                <span className="inline-flex items-center gap-1" title={`거래명세서: ${vendor.invoice_method}`}>
                  <Receipt size={11} className="text-indigo-500 shrink-0" />
                  <span className="text-zinc-400 font-semibold">명세서</span>
                  <span className="font-semibold text-indigo-700">{vendor.invoice_method}</span>
                </span>
              )}
              {vendor.order_status && (
                <span className="inline-flex items-center gap-1" title={`주문 현황: ${vendor.order_status}`}>
                  <CircleDot size={11} className="text-zinc-500 shrink-0" />
                  <span className="text-zinc-400 font-semibold">현황</span>
                  <span className="font-semibold text-zinc-700">{vendor.order_status}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* [조회 및 수정] 버튼 */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-line text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition cursor-pointer"
            title="공급사 정보 조회 및 수정"
          >
            <Pencil size={11} />
            조회·수정
          </button>
        )}
      </div>

      {/* 2026-08-24 · #178 · special_notes · 발주 특이사항 경고 배너 (있을 때만) */}
      {vendor.special_notes && String(vendor.special_notes).trim() && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
          <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">발주 특이사항</span>
            <span className="text-[13px] text-amber-900 font-semibold leading-relaxed break-words whitespace-normal">
              {vendor.special_notes}
            </span>
          </div>
        </div>
      )}

      {/* ── KPI 텍스트 줄 (kpis 있을 때만) ── */}
      {kpis != null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] leading-tight border-t border-zinc-100 pt-2">
          {/* 누적 매입액 */}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-zinc-400 font-semibold">누적 매입액 (1년)</span>
            <span className="tabular-nums font-bold text-emerald-700">{fmtWon(kpis.totalAmount)}원</span>
            <span className="text-zinc-400 tabular-nums">
              ({kpisLoading ? "로딩" : detailRowCount != null ? `${detailRowCount}건` : ""})
            </span>
          </span>
          <span className="text-zinc-200">·</span>
          {/* 이번달 매입 + MoM + VAT 정보 (2026-08-06 · 사용자 요청) */}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-zinc-400 font-semibold">이번달 매입</span>
            <span className={`tabular-nums font-bold ${
              momTone === "rose" ? "text-rose-700"
              : momTone === "emerald" ? "text-emerald-700"
              : "text-zinc-700"
            }`}>{fmtWon(kpis.thisMonthAmount)}원</span>
            {effectiveVatIncluded === true && (
              <span className="text-[10.5px] font-semibold text-emerald-700">VAT 포함</span>
            )}
            {effectiveVatIncluded === false && (
              <span className="text-[10.5px] font-semibold text-zinc-500">부가세 별도</span>
            )}
            <span className="text-zinc-400 tabular-nums inline-flex items-center gap-0.5">
              {momIcon}{momText}
            </span>
          </span>
          <span className="text-zinc-200">·</span>
          {/* 평균 매입주기 */}
          <span className="inline-flex items-center gap-1.5">
            <span className="text-zinc-400 font-semibold">평균 매입주기</span>
            <span className="tabular-nums font-bold text-zinc-700">
              {kpis.avgCycleDays != null ? `${kpis.avgCycleDays}일` : "-"}
            </span>
          </span>
          <span className="text-zinc-200">·</span>
          {/* 활성 상품 */}
          <span className="inline-flex items-center gap-1.5">
            <Package size={11} className="text-zinc-400 shrink-0" />
            <span className="text-zinc-400 font-semibold">활성 상품</span>
            <span className="tabular-nums font-bold text-zinc-700">
              {kpis.activeSkuCount > 0 ? `${kpis.activeSkuCount.toLocaleString()}종` : "-"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
};

export default VendorInfoHeader;
