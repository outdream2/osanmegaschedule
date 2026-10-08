// src/components/DisplayPage/overviews/PaymentSettlementOverview.tsx
// 2026-10-08 · GLOBAL UI · 매장 통합 · 결제·정산 현황 (Reference-tone dashboard · nav hub)
//   · PaymentInputPage · supplierPayments 보호 · 자체 pending/settlement fetch 없음
//   · L2 + Toolbar + KPI (placeholder) + Main+Tasks + QuickActions + Bottom + Right

import React, { useState } from "react";
import { CurrencyKrw, Receipt, Buildings, Calendar, CreditCard, Wallet, PaperPlaneTilt, FileText } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
  OverviewTaskRow, OverviewQuickAction, OverviewTable,
  type OverviewTableColumn,
} from "./StoreOverviewPrimitives";

export interface PaymentSettlementOverviewProps {
  onSelectSubTab: (sub: DpSubTabKey) => void;
}

const L2_TABS = [
  { key: "overview", label: "현황" },
  { key: "payment", label: "결제" },
];

export const PaymentSettlementOverview: React.FC<PaymentSettlementOverviewProps> = ({ onSelectSubTab }) => {
  const [search, setSearch] = useState("");

  const columns: OverviewTableColumn[] = [
    { key: "metric", label: "지표" },
    { key: "value", label: "값", align: "right" },
    { key: "source", label: "상세", align: "center" },
  ];
  const rows: Array<Record<string, React.ReactNode>> = [
    { metric: "결제 대기", value: "결제 메뉴 확인", source: "결제" },
    { metric: "결제 이력", value: "결제 메뉴 확인", source: "결제" },
    { metric: "거래처 지급", value: "결제 메뉴 확인", source: "결제" },
    { metric: "정산 관리", value: "결제 메뉴 확인", source: "결제" },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow
        active="overview"
        tabs={L2_TABS}
        onSelect={(k) => {
          if (k === "overview") return;
          onSelectSubTab("payment");
        }}
      />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="거래처·금액 검색" />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={16} weight="fill" />} label="결제 대기" value="-" tone="amber" hint="결제 메뉴 확인" />
        <OverviewKpi icon={<Receipt size={16} weight="fill" />} label="결제 금액" value="-" tone="brand" hint="결제 메뉴 확인" />
        <OverviewKpi icon={<Buildings size={16} weight="fill" />} label="거래처 지급" value="-" tone="violet" hint="상세 확인" />
        <OverviewKpi icon={<Wallet size={16} weight="fill" />} label="정산" value="-" tone="emerald" hint="상세 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="결제·정산 바로가기" action={
          <button type="button" onClick={() => onSelectSubTab("payment")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">결제 메뉴</button>
        }>
          <OverviewTable columns={columns} rows={rows} />
        </OverviewSection>

        <OverviewSection title="오늘 처리할 업무">
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<Receipt size={14} />} label="결제 입력" description="신규 결제"
              tone="brand" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Buildings size={14} />} label="거래처 지급" description="공급사별 결제"
              tone="violet" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Calendar size={14} />} label="결제 이력" description="최근 결제"
              tone="neutral" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Wallet size={14} />} label="정산 관리" description="정산·분배"
              tone="emerald" onClick={() => onSelectSubTab("payment")} />
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <OverviewQuickAction icon={<CurrencyKrw size={16} weight="bold" />} label="결제 등록" description="PaymentInput"
          tone="brand" onClick={() => onSelectSubTab("payment")} />
        <OverviewQuickAction icon={<Receipt size={16} />} label="결제 이력" description="최근 내역"
          tone="neutral" onClick={() => onSelectSubTab("payment")} />
        <OverviewQuickAction icon={<Buildings size={16} />} label="거래처 지급" description="공급사별"
          tone="violet" onClick={() => onSelectSubTab("payment")} />
        <OverviewQuickAction icon={<Wallet size={16} />} label="정산 관리" description="정산·분배"
          tone="emerald" onClick={() => onSelectSubTab("payment")} />
        <OverviewQuickAction icon={<CreditCard size={16} />} label="카드 결제" description="카드 내역"
          tone="amber" onClick={() => onSelectSubTab("payment")} />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <OverviewSection title="결제 메뉴 바로가기" action={
          <button type="button" onClick={() => onSelectSubTab("payment")}
            className="text-[12px] font-semibold text-brand-deep hover:underline">전체</button>
        }>
          <div className="flex flex-col gap-0.5">
            <OverviewTaskRow icon={<Receipt size={14} />} label="결제 입력" description="PaymentInput"
              tone="brand" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Buildings size={14} />} label="거래처 지급" description="supplier payment"
              tone="violet" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Calendar size={14} />} label="결제 이력" description="최근 결제 내역"
              tone="neutral" onClick={() => onSelectSubTab("payment")} />
            <OverviewTaskRow icon={<Wallet size={14} />} label="정산 관리" description="정산·분배"
              tone="emerald" onClick={() => onSelectSubTab("payment")} />
          </div>
        </OverviewSection>

        <div className="flex flex-col gap-3">
          <OverviewSection title="처리 대기">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<Receipt size={14} />} label="결제 대기" tone="amber"
                onClick={() => onSelectSubTab("payment")} />
            </div>
          </OverviewSection>

          <OverviewSection title="거래처 관련">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<Buildings size={14} />} label="거래처 지급" tone="violet"
                onClick={() => onSelectSubTab("payment")} />
              <OverviewTaskRow icon={<FileText size={14} />} label="거래명세" tone="neutral"
                onClick={() => onSelectSubTab("payment")} />
            </div>
          </OverviewSection>

          <OverviewSection title="정산 요약">
            <div className="flex flex-col gap-0.5">
              <OverviewTaskRow icon={<PaperPlaneTilt size={14} />} label="정산 예정" tone="emerald"
                onClick={() => onSelectSubTab("payment")} />
            </div>
          </OverviewSection>
        </div>
      </div>
    </div>
  );
};

export default PaymentSettlementOverview;
