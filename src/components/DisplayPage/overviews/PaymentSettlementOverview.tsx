// src/components/DisplayPage/overviews/PaymentSettlementOverview.tsx
// 2026-10-09 · GLOBAL UI · 결제·정산 Single-Page Operations Console
//   · L2 폐기 · PaymentInputPage · supplierPayments business 보호
//   · Payment summary endpoint 재사용 후 KPI/table enrichment · 이번 pass는 통합 shell

import React, { useState } from "react";
import { CurrencyKrw, Receipt, Buildings, Wallet, Shield } from "@phosphor-icons/react";
import {
  OverviewPageHeader, OverviewToolbar, OverviewSection, OverviewKpi,
} from "./StoreOverviewPrimitives";

export interface PaymentSettlementOverviewProps { onSelectSubTab: (sub: any) => void; }

export const PaymentSettlementOverview: React.FC<PaymentSettlementOverviewProps> = () => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"7" | "14" | "30">("14");

  return (
    <div className="flex flex-col gap-4 min-h-0 pb-6 bg-[#F4F7FA]">
      <OverviewPageHeader title="결제·정산" description="결제 입력 · 거래처 지급 · 정산을 한 페이지에서 처리합니다" />

      <OverviewToolbar search={search} onSearch={setSearch} placeholder="거래처·금액 검색"
        right={
          <select value={period} onChange={(e) => setPeriod(e.target.value as any)}
            className="h-10 px-3 text-[14px] font-medium text-ink border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-tint">
            <option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option>
          </select>
        }
      />

      <div className="px-4 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewKpi icon={<CurrencyKrw size={18} weight="fill" />} label="결제 대기" value="-" tone="amber" hint="Payment summary 통합 예정" />
        <OverviewKpi icon={<Receipt size={18} weight="fill" />} label="결제 금액" value="-" tone="brand" hint="통합 예정" />
        <OverviewKpi icon={<Buildings size={18} weight="fill" />} label="거래처 지급" value="-" tone="violet" hint="통합 예정" />
        <OverviewKpi icon={<Wallet size={18} weight="fill" />} label="정산 예정" value="-" tone="emerald" hint="통합 예정" />
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>Payment business 보호 안내</span>}>
          <div className="flex items-start gap-3 p-4 border border-brand-deep/15 bg-brand-tint/30 rounded-lg text-[14px]">
            <Shield size={20} className="text-brand-deep shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink">PaymentInputPage · supplierPayments 보호</div>
              <div className="text-[13px] text-ink-soft mt-1">
                기존 결제 handler · validation · supplier payment balance / purchase payment 계산 flow 보호 유지.
                이 페이지에서는 Payment summary endpoint를 재사용해 KPI (결제 대기 / 금액 / 거래처 지급 / 정산 예정)와
                최근 결제 내역을 표시하고, row click 시 PaymentSettlementDetailModal 안에서 기존 action
                (입력 · 승인 · 처리 · 수정 · 취소)을 호출합니다. (별도 workstream handoff · 통합 후 재배포)
              </div>
            </div>
          </div>
        </OverviewSection>
      </div>

      <div className="px-4 sm:px-6">
        <OverviewSection title={<span>결제·정산 섹션 플레이스홀더 (향후 통합)</span>}>
          <ul className="text-[14px] text-ink-soft list-disc pl-5 space-y-1">
            <li>결제 대기 리스트 · row click → PaymentSettlementDetailModal (입력/승인)</li>
            <li>최근 결제 이력 · 거래처별 지급 상태</li>
            <li>정산 예정 · 환불/취소 요약</li>
            <li>미수금 (기존 기능 확인 후 추가)</li>
          </ul>
          <div className="text-[12px] text-ink-soft mt-2">
            이 섹션들은 Payment summary API 재연결 후 실제 데이터로 교체됩니다. 신규 계산 없음.
          </div>
        </OverviewSection>
      </div>
    </div>
  );
};

export default PaymentSettlementOverview;
