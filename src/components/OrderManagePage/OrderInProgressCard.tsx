// src/components/OrderManagePage/OrderInProgressCard.tsx
// 2026-09-15 · #39 Phase B · 발주필요 페이지 상단 · "요청 진행중 N건" 접힘 카드
//   · 업계 표준 (Odoo·Zoho·NetSuite·Cin7·SAP Ariba · 100% 채택 · PO Lifecycle 리서치 결과)
//   · 라인 아이템 · 완전 이동 원칙 · 발주필요 리스트는 clean 유지
//   · 이미 요청한 상품 · 상단 CollapseCard 로 즉시 확인 · 중복 요청 방지
//   · 각 항목 · 상품명 · 공급사 · N일전 뱃지 (지연 tier) · [발주요청 페이지 이동] 링크
//   · 사용자 요청 · 요청 후 2-3일 도착 · 지연 시각화 필수
import React from "react";
import { PackageOpen, ArrowRight } from "lucide-react";
import { CollapseCard } from "../common/CollapseCard";
import { StatusPill } from "../common/StatusPill";
import type { OrderRequest } from "./OrderManagePage.types";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";

export interface OrderInProgressCardProps {
  /** 요청 진행중 (status='requested') · 발주 대기 상품 리스트 */
  orderReqs: OrderRequest[];
  /** 발주요청 탭으로 이동 · 사용자 지시 시 · OrderManagePage 에서 setPurchaseOrderSubTab('order') 호출 */
  onNavigateToOrderRequest: () => void;
}

/** 요청일 → 지연 tier 판정 · 3일 초과 · rose 지연 강조 */
function daysSince(iso?: string): { days: number; label: string; tone: "amber" | "orange" | "rose" } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return { days: 0, label: "오늘", tone: "amber" };
  if (days === 1) return { days: 1, label: "1일 전", tone: "amber" };
  if (days <= 2) return { days, label: `${days}일 전`, tone: "amber" };
  if (days <= 5) return { days, label: `${days}일 전`, tone: "orange" };
  return { days, label: `⚠ ${days}일 전 (지연)`, tone: "rose" };
}

export const OrderInProgressCard: React.FC<OrderInProgressCardProps> = ({ orderReqs, onNavigateToOrderRequest }) => {
  // status='requested' 만 · 서버 GET /api/order-requests 기본 필터 · 이미 정제됨
  const count = orderReqs.length;
  if (count === 0) return null;

  // 지연 상품 · 3일 초과 · 통계 표시
  const delayed = orderReqs.filter(r => {
    const info = daysSince(r.requested_at);
    return info && info.days >= 3;
  }).length;

  // 정렬 · 지연 순 · 요청 오래된 순
  const sorted = [...orderReqs].sort((a, b) => {
    const ta = a.requested_at ? new Date(a.requested_at).getTime() : 0;
    const tb = b.requested_at ? new Date(b.requested_at).getTime() : 0;
    return ta - tb;
  });

  // 상단 5개만 미리보기 · 나머지는 발주요청 탭에서
  const preview = sorted.slice(0, 5);
  const remaining = count - preview.length;

  return (
    <CollapseCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="text-[16px] font-bold text-ink">요청 진행중</span>
          <span className="inline-flex items-center justify-center min-w-[24px] h-[22px] px-1.5 rounded-full text-[13px] font-bold leading-none tabular-nums bg-sky-100 text-sky-700 border border-sky-200">{count}</span>
          {delayed > 0 && (
            <StatusPill tone="rose" size="md" dot>
              지연 {delayed}
            </StatusPill>
          )}
        </span>
      }
      icon={<PackageOpen size={17} className="text-sky-600" />}
      right={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigateToOrderRequest(); }}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-[14px] font-semibold text-white bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] transition cursor-pointer whitespace-nowrap"
          title="발주요청 페이지로 이동"
        >
          발주요청 <ArrowRight size={13} />
        </button>
      }
      defaultOpen={false}
      depth="sm"
      contentPadding="md"
    >
      <ul className="flex flex-col gap-1.5">
        {preview.map(r => {
          const info = daysSince(r.requested_at);
          const toneCls = info?.tone === "rose"
            ? "text-rose-700 bg-rose-50 border-rose-300"
            : info?.tone === "orange"
              ? "text-orange-700 bg-orange-50 border-orange-300"
              : "text-amber-700 bg-amber-50 border-amber-300";
          return (
            <li key={r.id} className="flex items-center gap-2 flex-wrap px-2 py-1.5 rounded-md hover:bg-zinc-50 transition">
              <span className="text-[15px] font-semibold text-ink truncate max-w-[280px] sm:max-w-[400px]" title={r.product_name}>
                {r.product_name || "-"}
              </span>
              {r.supplier && (
                <span className="text-[13px] text-ink-soft">· {displayVendorName(r.supplier) || r.supplier}</span>
              )}
              {r.order_qty != null && (
                <span className="text-[13px] font-bold text-brand-deep tabular-nums">· {Number(r.order_qty)}개</span>
              )}
              {info && (
                <span className={`ml-auto text-[12px] font-bold tabular-nums border rounded px-1.5 h-5 inline-flex items-center ${toneCls}`}>
                  {info.label}
                </span>
              )}
            </li>
          );
        })}
        {remaining > 0 && (
          <li className="text-center text-[13px] text-ink-soft py-1">
            외 <span className="font-bold text-brand-deep tabular-nums">{remaining}건</span> · 발주요청 페이지에서 전체 확인
          </li>
        )}
      </ul>
    </CollapseCard>
  );
};

export default OrderInProgressCard;
