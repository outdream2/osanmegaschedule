// src/components/DisplayPage/overviews/PaymentSettlementOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 결제·정산 현황 overview
//   · 신규 결제 flow 생성 금지 · 기존 PaymentInput · supplierPayments 로 navigation만
//   · 미수금 등 미존재 widget 생략 (fake data 금지)

import React from "react";
import { CurrencyKrw, Receipt, Buildings, Calendar } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import { OverviewSection, OverviewTaskRow, OverviewQuickAction, OverviewEmpty } from "./StoreOverviewPrimitives";

export interface PaymentSettlementOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

export const PaymentSettlementOverview: React.FC<PaymentSettlementOverviewProps> = ({ onSelectSubTab }) => {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection
          title="오늘 처리할 업무"
          action={
            <button
              type="button"
              onClick={() => onSelectSubTab("payment")}
              className="text-[12px] font-semibold text-brand-deep hover:underline"
            >
              결제 전체
            </button>
          }
        >
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow
              icon={<Receipt size={16} weight="fill" />}
              label="결제 입력"
              description="신규 결제 등록"
              tone="brand"
              onClick={() => onSelectSubTab("payment")}
            />
            <OverviewTaskRow
              icon={<Buildings size={16} weight="regular" />}
              label="거래처 지급"
              description="공급사별 지급 관리"
              tone="brand"
              onClick={() => onSelectSubTab("payment")}
            />
            <OverviewTaskRow
              icon={<Calendar size={16} weight="regular" />}
              label="결제 이력"
              description="최근 결제 내역"
              tone="neutral"
              onClick={() => onSelectSubTab("payment")}
            />
          </div>
        </OverviewSection>

        <OverviewSection title="빠른 이동">
          <div className="flex flex-col gap-2">
            <OverviewQuickAction
              icon={<CurrencyKrw size={18} weight="bold" />}
              label="결제 등록"
              description="PaymentInput"
              onClick={() => onSelectSubTab("payment")}
            />
            <OverviewQuickAction
              icon={<Buildings size={18} weight="regular" />}
              label="거래처별 지급"
              description="공급사 결제·정산"
              onClick={() => onSelectSubTab("payment")}
            />
          </div>
        </OverviewSection>
      </div>

      <OverviewSection title="최근 결제·정산 활동">
        <OverviewEmpty message="최근 결제 내역은 결제 메뉴에서 확인하실 수 있습니다" />
      </OverviewSection>
    </div>
  );
};

export default PaymentSettlementOverview;
