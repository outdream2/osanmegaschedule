// src/components/DisplayPage/overviews/PaymentSettlementOverview.tsx
// 2026-10-09 · GLOBAL UI · 결제·정산 통합 대시보드 · 한 페이지 통합 + Modal
//   · PaymentInputPage · supplierPayments 보호 · 자체 fetch 없음
//   · 각 섹션 click → setDpSubTab(payment)

import React, { useState } from "react";
import { CurrencyKrw, Receipt, Buildings, Wallet, CreditCard, Calendar, PaperPlaneTilt, FileText } from "@phosphor-icons/react";
import type { DpSubTabKey } from "../DisplayPage.types";
import {
  OverviewL2TabsRow, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";

export interface PaymentSettlementOverviewProps { onSelectSubTab: (sub: DpSubTabKey) => void; }

export const PaymentSettlementOverview: React.FC<PaymentSettlementOverviewProps> = ({ onSelectSubTab }) => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");

  const section = (opts: { key: string; icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) => (
    <button key={opts.key} type="button" onClick={opts.onClick}
      className="w-full flex items-center gap-2 px-2 h-10 rounded-md text-left transition-colors hover:bg-slate-50 cursor-pointer">
      <span className="shrink-0 text-ink-soft">{opts.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-ink truncate">{opts.title}</div>
        {opts.sub && <div className="text-[12px] text-ink-soft truncate">{opts.sub}</div>}
      </div>
    </button>
  );

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6">
      <OverviewL2TabsRow active="overview" tabs={[{ key: "overview", label: "현황" }]} onSelect={() => {}} />
      <OverviewToolbar search={search} onSearch={setSearch} placeholder="거래처·금액 검색"
        right={
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
            className="h-9 px-2.5 text-[13px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
            <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
          </select>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={16} weight="fill" />} label="결제 대기" value="-" tone="amber" hint="결제 메뉴 확인" />
        <OverviewKpi icon={<Receipt size={16} weight="fill" />} label="결제 금액" value="-" tone="brand" hint="상세 확인" />
        <OverviewKpi icon={<Buildings size={16} weight="fill" />} label="거래처 지급" value="-" tone="violet" hint="상세 확인" />
        <OverviewKpi icon={<Wallet size={16} weight="fill" />} label="정산" value="-" tone="emerald" hint="상세 확인" />
      </div>

      <div className="px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <OverviewSection
          title={<span>결제 입력 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">PaymentInput</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("payment")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "pay-1", icon: <CurrencyKrw size={14} />, title: "신규 결제 등록", sub: "거래 입력", onClick: () => onSelectSubTab("payment") })}
            {section({ key: "pay-2", icon: <CreditCard size={14} />, title: "카드 결제 내역", sub: "카드사별", onClick: () => onSelectSubTab("payment") })}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>거래처 지급 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">공급사별</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("payment")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "sup-1", icon: <Buildings size={14} />, title: "공급사 지급 관리", sub: "거래처별 결제", onClick: () => onSelectSubTab("payment") })}
            {section({ key: "sup-2", icon: <FileText size={14} />, title: "거래명세", sub: "지급 명세표", onClick: () => onSelectSubTab("payment") })}
          </div>
        </OverviewSection>

        <OverviewSection
          title={<span>정산 관리 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">정산·분배</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("payment")} className="text-[13px] font-semibold text-brand-deep hover:underline">열기</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "set-1", icon: <Wallet size={14} />, title: "정산 처리", sub: "분배 · 결산", onClick: () => onSelectSubTab("payment") })}
            {section({ key: "set-2", icon: <PaperPlaneTilt size={14} />, title: "정산 예정", sub: "미정산 건", onClick: () => onSelectSubTab("payment") })}
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>결제 이력 <span className="ml-1.5 text-[13px] font-medium text-ink-soft">최근 거래</span></span>}
          action={<button type="button" onClick={() => onSelectSubTab("payment")} className="text-[13px] font-semibold text-brand-deep hover:underline">결제 전체</button>}
        >
          <div className="flex flex-col gap-0.5">
            {section({ key: "his-1", icon: <Calendar size={14} />, title: "최근 결제 내역", sub: "날짜 · 거래처 · 금액", onClick: () => onSelectSubTab("payment") })}
            {section({ key: "his-2", icon: <Receipt size={14} />, title: "환불·취소", sub: "환불 처리", onClick: () => onSelectSubTab("payment") })}
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default PaymentSettlementOverview;
