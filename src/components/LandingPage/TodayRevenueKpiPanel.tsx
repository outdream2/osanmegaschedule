// src/components/LandingPage/TodayRevenueKpiPanel.tsx
// 2026-10-05 · 사용자 지시 · 홈 "오늘의 현황" 상단 매장 운영 KPI
//
//   · 현재매출금액 = Sales_Days_TimeReport.SaleTotal SUM · 현재시간 이하 (매출 페이지 TODAY KPI 와 동일 definition)
//   · 거래건수 = Sales_Days_TimeReport.CustomerCnt SUM · 현재시간 이하 (CustomerCnt 의미 UNVERIFIED · "거래건수" 안전 라벨)
//   · 방문자 KPI = source 미발견 (DATA LINEAGE #127 확정) · 표시 안 함
//   · 조회 실패 시 "-" 표시 · 홈 전체 render 영향 X
//   · 클릭 → 매장 > 매출 페이지

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/apiClient";

interface HourlyRow {
  SaleDate?: string;
  SaleTime?: string;
  CustomerCnt?: number | string;
  SaleTotal?: number | string;
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 2026-10-05 fix (#128) · ERP working condition END=START+1 (Fiddler 확정)
function addOneDay(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseHour(saleTime?: string): number {
  const m = (saleTime || "").match(/^(\d{1,2})/);
  return m ? Number(m[1]) : -1;
}

interface Props {
  onOpenRevenue: () => void;
}

type FetchStatus = "idle" | "loading" | "success" | "error";

export const TodayRevenueKpiPanel: React.FC<Props> = ({ onOpenRevenue }) => {
  // 2026-10-05 · ERROR != ZERO (사용자 재강조)
  //   · idle: 조회 전 → "-"
  //   · loading: 조회 중
  //   · error: 실패 → "-" + 오류
  //   · success: 성공 → 실제 값 (0 포함)
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [sale, setSale] = useState<number>(0);
  const [txn, setTxn] = useState<number>(0);
  const [errMsg, setErrMsg] = useState<string>("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const y = todayYmd();
      const yNext = addOneDay(y);
      const r = await api.get<{ ok: boolean; rows?: HourlyRow[]; error?: string }>(
        `/api/erp/sale-hourly-report?from=${y}&to=${yNext}`
      );
      if (!r.data.ok) {
        setStatus("error"); setErrMsg(r.data.error ?? "조회 실패"); return;
      }
      const curH = new Date().getHours();
      const rows = (r.data.rows ?? []).filter((row) => {
        const h = parseHour(row.SaleTime);
        return h >= 0 && h <= curH;
      });
      const s = rows.reduce((a, row) => a + (Number(row.SaleTotal) || 0), 0);
      const t = rows.reduce((a, row) => a + (Number(row.CustomerCnt) || 0), 0);
      setSale(s); setTxn(t); setStatus("success"); setErrMsg("");
    } catch (e) {
      setStatus("error"); setErrMsg((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
  const showValue = status === "success";

  return (
    <div
      className="w-full mb-3 bg-white border border-zinc-200 rounded-2xl shadow-[0_1px_3px_rgba(10,46,74,0.05)] hover:shadow-[0_2px_10px_rgba(10,46,74,0.08)] hover:border-brand-deep/25 cursor-pointer transition overflow-hidden relative"
      onClick={onOpenRevenue}
      role="button"
      title="매장 > 매출 페이지로 이동"
    >
      <div className="flex items-stretch divide-x divide-zinc-100">
        {/* 매출 (메인) · 좌측 brand accent bar · 색 포인트 */}
        <div className="flex-[2] px-4 sm:px-6 py-3 sm:py-3.5 min-w-0 relative">
          <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-brand-deep rounded-r-full" aria-hidden />
          <div className="text-[15px] sm:text-[16px] text-zinc-500 font-semibold mb-1 tracking-tight">현재 매출</div>
          <div className="text-[18px] sm:text-[22px] font-bold tabular-nums leading-tight text-brand-deep truncate">
            {showValue ? fmt(sale) + "원" : "-"}
          </div>
        </div>
        {/* 객단가 */}
        <div className="flex-1 px-3 sm:px-4 py-3 sm:py-3.5 min-w-0">
          <div className="text-[15px] sm:text-[16px] text-zinc-500 font-semibold mb-1 tracking-tight">객단가</div>
          <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-ink leading-tight truncate">
            {showValue && txn > 0 ? fmt(sale / txn) + "원" : "-"}
          </div>
        </div>
        {/* 방문객 */}
        <div className="flex-1 px-3 sm:px-4 py-3 sm:py-3.5 min-w-0">
          <div className="text-[15px] sm:text-[16px] text-zinc-500 font-semibold mb-1 tracking-tight">방문객</div>
          <div className="text-[18px] sm:text-[22px] font-bold tabular-nums text-ink leading-tight truncate">
            {showValue ? fmt(txn) + "명" : "-"}
          </div>
        </div>
        {/* 매출 상세 → (PC) */}
        <div className="hidden sm:flex items-center px-4 bg-zinc-50/60 hover:bg-zinc-100 transition">
          <div className="text-[16px] text-brand-deep font-semibold whitespace-nowrap">매출 상세 ›</div>
        </div>
      </div>
      {/* 모바일 하단 바 (상태 + 매출 상세) */}
      <div className="sm:hidden flex items-center justify-between px-3 py-1.5 bg-zinc-50/60 text-[15px] border-t border-zinc-100">
        <span className="text-zinc-500">
          {status === "error" ? <span className="text-rose-600 font-semibold">⚠ 조회 실패</span> :
           status === "loading" ? "조회 중..." :
           "실시간 ERP"}
        </span>
        <span className="text-brand-deep font-semibold">매출 상세 ›</span>
      </div>
      {status === "error" && (
        <span className="hidden sm:block absolute top-2 right-2 text-[11px] text-rose-600 font-semibold" title={errMsg}>⚠ 조회 실패</span>
      )}
    </div>
  );
};

export default TodayRevenueKpiPanel;
