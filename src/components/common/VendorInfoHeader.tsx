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
  // 2026-09-02 · 사용자 지시 · 팀장 정보 · 담당자 연락 안 될 때 · 헤더 표시
  team_leader_name?: string | null;
  team_leader_phone?: string | null;
  emergency_contact?: string | null;
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
  // 2026-09-08 · 사용자 지시 · 3개월 매입금액 (신규)
  threeMonthAmount?: number;
  // 2026-09-08 · 사용자 지시 · 결제내역 잔고 (결제내역 테이블에서 조회)
  balance?: number | null;
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
    <div
      className={`relative overflow-hidden bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(10,46,74,0.04),0_4px_12px_-4px_rgba(10,46,74,0.06)] ${pad} flex flex-col gap-3 ${className}`}
    >
      {/* 2026-09-08 · 사용자 지시 · 목업 톤 재디자인 · 3px gradient top accent */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />

      {/* ── 공급사 헤더 라인 · 2026-09-08 · 사용자 지시 · 빌딩 아이콘 → 심플 말머리표 · 활성상품 제거 */}
      <div className="flex items-start gap-3 flex-wrap">
        {/* 심플 말머리표 · 3px vertical bullet · brand gradient */}
        <span aria-hidden className="mt-1.5 shrink-0 inline-block w-1 h-6 rounded-full bg-gradient-to-b from-brand-soft to-brand-deep" />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {/* 공급사명 · 분류 · 사업자번호 · VAT */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className={`${dense ? "text-[18px]" : "text-[20px]"} font-extrabold text-ink tracking-tight leading-tight break-words`}
              title={rawName}
            >
              {displayName}
            </h2>
            <VendorCategoryBadge category={vendor.category} className="text-[14px]" />
            {vendor.business_number && (
              <span className="text-[14px] font-semibold text-ink-soft bg-zinc-50 border border-line rounded-md px-2 py-0.5 tabular-nums">
                {fmtBizNum(vendor.business_number)}
              </span>
            )}
            {effectiveVatIncluded === true && (
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                VAT 포함
              </span>
            )}
            {effectiveVatIncluded === false && (
              <span
                className="inline-flex items-center gap-1 text-[13px] font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 rounded-md px-1.5 py-0.5"
                title={vendor.vat_included == null && nameHintsVatExcluded ? "공급사명에서 자동 추론" : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                부가세 별도
              </span>
            )}
          </div>

          {/* Sub-line · 담당자·전화·이메일·등록일 · 폰트 +2 */}
          <div className="flex items-center gap-3 flex-wrap text-[15px] text-ink-soft">
            {vendor.contact_name && (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <User2 size={13} className="text-zinc-400" />
                {vendor.contact_name}
              </span>
            )}
            {vendor.phone && (
              <a
                href={`tel:${vendor.phone.replace(/\D/g, "")}`}
                className="inline-flex items-center gap-1.5 tabular-nums font-semibold hover:text-brand-deep transition"
              >
                <Phone size={13} className="text-zinc-400" />
                {fmtPhone(vendor.phone)}
              </a>
            )}
            {vendor.email && (
              <a
                href={`mailto:${vendor.email}`}
                className="inline-flex items-center gap-1.5 truncate max-w-[260px] font-semibold hover:text-brand-deep transition"
                title={vendor.email}
              >
                <span className="text-zinc-400">@</span>
                {vendor.email}
              </a>
            )}
            {vendor.created_at && (
              <span className="inline-flex items-center gap-1.5 tabular-nums font-medium text-zinc-400">
                <Calendar size={13} className="text-zinc-400" />
                등록 {fmtDate(vendor.created_at)}
              </span>
            )}
          </div>

          {/* 2026-09-02 · 사용자 지시 · 팀장 정보 · 담당자 아래줄 · 값 있으면만 표시 */}
          {(vendor.team_leader_name || vendor.team_leader_phone) && (
            <div className="flex items-center gap-3 flex-wrap text-[13px] text-zinc-500 mt-0.5">
              <span className="inline-flex items-center gap-1 font-bold text-violet-600">
                <User2 size={10} className="text-violet-500" />
                팀장
              </span>
              {vendor.team_leader_name && (
                <span className="inline-flex items-center gap-1">
                  {vendor.team_leader_name}
                </span>
              )}
              {vendor.team_leader_phone && (
                <a
                  href={`tel:${vendor.team_leader_phone.replace(/\D/g, "")}`}
                  className="inline-flex items-center gap-1 tabular-nums hover:text-sky-600 transition"
                >
                  <Phone size={10} className="text-zinc-400" />
                  {fmtPhone(vendor.team_leader_phone)}
                </a>
              )}
            </div>
          )}

          {/* 2026-08-24 · #178 · xlsx 5 필드 · 값 있는 항목만 표시 */}
          {(vendor.order_method || vendor.region || vendor.invoice_method || vendor.order_status) && (
            <div className="flex items-center gap-3 flex-wrap text-[14px] text-zinc-600 mt-0.5">
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

        {/* [조회 및 수정] 버튼 · 목업 톤 */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-line text-[14px] font-bold text-ink-soft hover:border-brand-deep hover:text-brand-deep hover:bg-brand-tint/20 shadow-sm active:scale-[0.98] transition cursor-pointer"
            title="공급사 정보 조회 및 수정"
          >
            <Pencil size={13} strokeWidth={2.4} />
            조회·수정
          </button>
        )}
      </div>

      {/* 2026-08-24 · #178 · special_notes · 발주 특이사항 경고 배너 (있을 때만) */}
      {vendor.special_notes && String(vendor.special_notes).trim() && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mt-1">
          <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold text-amber-700 uppercase tracking-wider">발주 특이사항</span>
            <span className="text-[15px] text-amber-900 font-semibold leading-relaxed break-words whitespace-normal">
              {vendor.special_notes}
            </span>
          </div>
        </div>
      )}

      {/* ── KPI 텍스트 라인 · 2026-09-08 · 사용자 지시 · 미니카드 → 깔끔한 텍스트 · 3개월/이번달/잔고 ── */}
      {kpis != null && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] leading-tight border-t border-line/70 pt-3">
          {/* 3개월 매입금액 */}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-soft font-semibold">3개월 매입</span>
            <span className="tabular-nums font-extrabold text-brand-deep text-[17px]">
              {fmtWon(kpis.threeMonthAmount ?? 0)}
            </span>
            <span className="text-ink-soft/70 text-[13px]">원</span>
          </span>
          <span className="text-line font-light">|</span>

          {/* 이번달 매입금액 */}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-soft font-semibold">이번달 매입</span>
            <span className={`tabular-nums font-extrabold text-[17px] ${
              momTone === "rose" ? "text-rose-700"
              : momTone === "emerald" ? "text-emerald-700"
              : "text-ink"
            }`}>{fmtWon(kpis.thisMonthAmount)}</span>
            <span className="text-ink-soft/70 text-[13px]">원</span>
            {momText && (
              <span className="text-[12px] font-semibold text-ink-soft inline-flex items-center gap-0.5 tabular-nums">
                {momIcon}{momText}
              </span>
            )}
          </span>
          <span className="text-line font-light">|</span>

          {/* 잔고 (결제내역 테이블 링크) */}
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-ink-soft font-semibold">잔고</span>
            {kpis.balance != null ? (
              <>
                <span className={`tabular-nums font-extrabold text-[17px] ${
                  kpis.balance > 0 ? "text-rose-700" : kpis.balance < 0 ? "text-emerald-700" : "text-ink"
                }`}>{fmtWon(kpis.balance)}</span>
                <span className="text-ink-soft/70 text-[13px]">원</span>
                {kpis.balance > 0 && <span className="text-[12px] font-semibold text-rose-600">미결제</span>}
                {kpis.balance < 0 && <span className="text-[12px] font-semibold text-emerald-600">선결제</span>}
              </>
            ) : (
              <span className="text-zinc-400 text-[15px]">-</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default VendorInfoHeader;
