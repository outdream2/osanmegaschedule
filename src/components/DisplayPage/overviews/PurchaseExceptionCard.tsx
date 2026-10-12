// 2026-10-12 · 사용자 지시 · 매입이상 공통 카드 (overview 2곳 공유 · "병합")
//   · 발주반품현황 / 매입재고현황 양쪽 "현황판" overview tab 에 노출
//   · 자체 fetch · /api/order-purchase-match + /api/products-map (현재고 lookup)
//   · 홈 랜딩 톤 · CARD + inline 3px rose 세로줄 + 2-tier typography
//   · "매입재고현황정보" (현재고) column 포함 · 사용자 지시 "매입재고현황정보도 매입이상에 나와야"

import React, { useEffect, useState, useMemo } from "react";
import { Warning } from "@phosphor-icons/react";
import { api } from "../../../lib/apiClient";

const CARD = "bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const fmt = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString("ko-KR");

interface MatchRow {
  product_code?: string;
  product_name?: string;
  supplier?: string;
  order_qty?: number;
  purchase_qty?: number;
  order_date?: string;
  order_number?: string;
  match_status?: string;
  exception_type?: string;
}
interface ProductMetaSlim {
  pcode?: string | null;
  product_name?: string | null;
  current_stock?: number | null;
}

export interface PurchaseExceptionCardProps {
  /** 조회 기간 (일) · 7 · 14 · 30 */
  period: number;
  /** 전체보기 클릭 핸들러 · 발주반품현황 매입이상 탭으로 이동 */
  onViewAll: () => void;
  /** row 클릭 핸들러 · default 는 onViewAll */
  onRowClick?: (row: MatchRow) => void;
  /** maxHeight (table scroll) · 기본 320 */
  maxHeight?: number;
  /** 라벨 overrides · "매입이상" (default) */
  title?: string;
}

export const PurchaseExceptionCard: React.FC<PurchaseExceptionCardProps> = ({
  period, onViewAll, onRowClick, maxHeight = 320, title = "매입이상",
}) => {
  const [matchData, setMatchData] = useState<any>(null);
  const [stockByCode, setStockByCode] = useState<Map<string, number>>(new Map());
  // 2026-10-12 · 사용자 지시 · 판매 데이터와 재고 데이터 같이 표시 · period 일 동안 pcode별 판매수량 집계
  const [saleQtyByCode, setSaleQtyByCode] = useState<Map<string, number>>(new Map());

  // Fetch · 매입이상
  useEffect(() => {
    let alive = true;
    api.get<any>(`/api/order-purchase-match?days=${period}`)
      .then(({ data }) => { if (alive) setMatchData(data ?? {}); })
      .catch(() => { if (alive) setMatchData({}); });
    return () => { alive = false; };
  }, [period]);

  // 2026-10-12 · 사용자 지시 · 판매 데이터 fetch (period 일 · ERP sale-day-products chunked)
  //   · 매입이상 row 의 pcode 와 매칭하여 "판매" column 노출
  useEffect(() => {
    let alive = true;
    (async () => {
      const dates: string[] = [];
      for (let i = 0; i < period; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      }
      const CHUNK = 5;
      const saleMap = new Map<string, number>();
      for (let i = 0; i < dates.length; i += CHUNK) {
        if (!alive) return;
        const batch = dates.slice(i, i + CHUNK);
        const results = await Promise.all(batch.map(d =>
          api.get<any>(`/api/erp/sale-day-products?date=${d}`).then(r => r.data).catch(() => ({ ok: false }))
        ));
        for (const r of results) {
          for (const it of (r?.items ?? [])) {
            const key = String(it.pcode ?? "").trim();
            if (!key) continue;
            saleMap.set(key, (saleMap.get(key) ?? 0) + (Number(it.totalStock) || 0));
          }
        }
      }
      if (alive) setSaleQtyByCode(saleMap);
    })();
    return () => { alive = false; };
  }, [period]);

  // Fetch · products-map (현재고 lookup)
  useEffect(() => {
    let alive = true;
    api.get<Record<string, ProductMetaSlim>>("/api/products-map?fields=slim&include_inactive=1&include_hidden=1")
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map<string, number>();
        for (const [code, p] of Object.entries(data ?? {})) {
          if (!p) continue;
          const pcode = String(p.pcode ?? code).trim();
          if (pcode && Number.isFinite(Number(p.current_stock))) {
            m.set(pcode, Number(p.current_stock));
          }
        }
        setStockByCode(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const exceptionRows = useMemo<MatchRow[]>(() => {
    return Array.isArray(matchData?.exceptions) ? matchData.exceptions : [];
  }, [matchData]);

  // 2026-10-12 · 사용자 지시 · 발주갯수 · 매입갯수 합계 (header meta)
  const totals = useMemo(() => {
    let order = 0, purchase = 0;
    for (const r of exceptionRows) {
      order += Number(r.order_qty ?? 0);
      purchase += Number(r.purchase_qty ?? 0);
    }
    return { order, purchase };
  }, [exceptionRows]);

  const rowClick = (r: MatchRow) => {
    if (onRowClick) onRowClick(r);
    else onViewAll();
  };

  return (
    <section className={`${CARD} overflow-hidden`}>
      <header className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap">
        <span className="w-[3px] h-[16px] bg-rose-500 rounded-full shrink-0" aria-hidden />
        <Warning size={18} weight="fill" className="text-slate-500" />
        <h3 className="text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">{title}</h3>
        <span className="text-[14px] text-slate-500 font-medium">· {exceptionRows.length}건</span>
        {/* 2026-10-12 · 사용자 지시 · 발주갯수 · 매입갯수 합계 노출 */}
        {exceptionRows.length > 0 && (
          <span className="text-[13px] text-slate-500 tabular-nums font-medium">
            · 발주 <b className="text-ink">{fmt(totals.order)}</b> / 매입 <b className={totals.purchase === totals.order ? "text-ink" : "text-rose-600"}>{fmt(totals.purchase)}</b>
          </span>
        )}
        <button
          type="button"
          onClick={onViewAll}
          className="ml-auto inline-flex items-center gap-0.5 text-[13px] md:text-[14px] font-semibold text-brand-deep hover:text-[#0d3a5c] cursor-pointer transition-colors"
        >
          전체보기 →
        </button>
      </header>

      <div style={{ maxHeight }} className="overflow-y-auto">
        {exceptionRows.length === 0 ? (
          <div className="py-8 text-center text-[13px] md:text-[14px] text-slate-500">
            {matchData == null ? "불러오는 중..." : "매입이상이 없습니다"}
          </div>
        ) : (
          /* 2026-10-12 · 사용자 지시 · 발주량/매입량 별도 column 분리 + 글씨 다 나오게 (truncate 제거 · overflow-x scroll) */
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="pl-5 pr-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 w-[80px] whitespace-nowrap">날짜</th>
                  <th className="px-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 whitespace-nowrap">상품</th>
                  <th className="px-2 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 whitespace-nowrap">공급사</th>
                  <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[64px] whitespace-nowrap">발주</th>
                  <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[64px] whitespace-nowrap">매입</th>
                  {/* 2026-10-12 · 사용자 지시 · 판매 데이터 (period 기간 ERP sale 집계) */}
                  <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[64px] whitespace-nowrap" title={`최근 ${period}일 판매수량`}>판매</th>
                  {/* 2026-10-12 · 사용자 지시 · 매입재고현황 정보 (현재고) column */}
                  <th className="px-2 py-1.5 text-right text-[12px] md:text-[13px] font-semibold text-slate-500 w-[72px] whitespace-nowrap">현재고</th>
                  <th className="px-2 pr-5 py-1.5 text-left text-[12px] md:text-[13px] font-semibold text-slate-500 w-[108px] whitespace-nowrap">처리현황</th>
                </tr>
              </thead>
              <tbody>
                {exceptionRows.slice(0, 50).map((r, i) => {
                  const oq = Number(r.order_qty ?? 0);
                  const pq = Number(r.purchase_qty ?? 0);
                  const diff = pq - oq;
                  const status = r.exception_type ?? r.match_status ?? (diff !== 0 ? "수량 불일치" : "미확인");
                  const statusCls = status.includes("완료") ? "text-emerald-700"
                    : status.includes("미") || status.includes("불일치") ? "text-rose-600" : "text-amber-700";
                  const stock = r.product_code ? stockByCode.get(String(r.product_code)) : undefined;
                  const saleQty = r.product_code ? saleQtyByCode.get(String(r.product_code)) : undefined;
                  return (
                    <tr
                      key={i}
                      onClick={() => rowClick(r)}
                      className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                      title="클릭 · 발주·매입대조 상품 리스트로 이동"
                    >
                      <td className="pl-5 pr-2 py-2 text-[13px] tabular-nums text-slate-500 align-middle whitespace-nowrap">
                        {String(r.order_date ?? "").slice(5, 10) || "-"}
                      </td>
                      <td className="px-2 py-2 text-[13px] md:text-[14px] text-ink font-medium align-middle whitespace-nowrap">
                        {r.product_name ?? r.product_code ?? "-"}
                      </td>
                      <td className="px-2 py-2 text-[13px] text-slate-500 align-middle whitespace-nowrap">
                        {r.supplier ?? "-"}
                      </td>
                      <td className="px-2 py-2 text-right text-[14px] md:text-[15px] font-semibold text-ink tabular-nums align-middle whitespace-nowrap">
                        {fmt(oq)}
                      </td>
                      <td className={`px-2 py-2 text-right text-[14px] md:text-[15px] font-semibold tabular-nums align-middle whitespace-nowrap ${diff === 0 ? "text-ink" : "text-rose-600"}`}>
                        {fmt(pq)}
                      </td>
                      <td className="px-2 py-2 text-right text-[14px] md:text-[15px] font-semibold text-emerald-700 tabular-nums align-middle whitespace-nowrap">
                        {saleQty != null && saleQty > 0 ? fmt(saleQty) : <span className="text-slate-300">0</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-[14px] md:text-[15px] font-semibold text-ink tabular-nums align-middle whitespace-nowrap">
                        {stock != null ? fmt(stock) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-2 pr-5 py-2 text-[13px] font-semibold align-middle whitespace-nowrap ${statusCls}`}>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default PurchaseExceptionCard;
