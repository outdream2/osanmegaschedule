// src/components/OrderManagePage/ReturnUnifiedPanel.tsx
// 2026-10-12 · #16 Step 1 · 반품 통합 재설계 skeleton
//   · (a) 병합 · ReturnListPanel (820) + ReturnConfirmedPanel (244) → 상하 2 섹션 wrapper
//   · 홈 랜딩 톤 CARD · rounded-[12px] + border-slate-200 + thin shadow
//   · (b) 자동 조건 필터 (최근 N일/M개) · Step 2 예정
//   · (c) 체크박스 bulk 선택 · Step 3 예정
//   · (d) 반품요청서 보내기 버튼 (공급사별 그룹) · Step 4 예정
//   · (e) ReturnRequestModal 재구성 (OrderModal 복제) · Step 5 예정
//   · (f) /api/return-requests POST + 알림 → 반품확정 refresh · Step 5 예정
//   · (g) 호출처 교체 (OrderManagePage · OrderReturnOverview) · Step 6 예정

import React from "react";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { ReturnGroupedView } from "./ReturnGroupedView";
import { ReturnConfirmedPanel } from "./ReturnConfirmedPanel";

export const ReturnUnifiedPanel: React.FC = () => {
  return (
    <div className="flex flex-col gap-4">
      {/* 상단 · 반품필요 · indigo accent · Step 7 완성 · 공급사별 그룹 CARD (발주요청서 패턴 복제) */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
        <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
          <span className="w-[3px] h-[16px] bg-indigo-500 rounded-full shrink-0" aria-hidden />
          <ArrowsLeftRight size={18} weight="fill" className="text-slate-500" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">반품필요</h3>
            <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">자동 조건 분류 · 공급사별 그룹 · 체크박스 bulk · 반품요청서 전송</p>
          </div>
        </header>
        <ReturnGroupedView />
      </section>

      {/* 하단 · 반품확정 · emerald accent · 완료 이력 */}
      <section className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col">
        <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100">
          <span className="w-[3px] h-[16px] bg-emerald-500 rounded-full shrink-0" aria-hidden />
          <ArrowsLeftRight size={18} weight="fill" className="text-slate-500" />
          <div className="min-w-0">
            <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">반품확정</h3>
            <p className="text-[13px] md:text-[14px] text-slate-500 mt-0.5">완료된 반품 이력</p>
          </div>
        </header>
        <div className="p-2">
          <ReturnConfirmedPanel />
        </div>
      </section>
    </div>
  );
};

export default ReturnUnifiedPanel;
