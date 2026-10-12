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
  // 2026-10-12 · 사용자 지시 "매입단가이상 데이터 이상" fix · 서버 응답 field 추가
  unit_price?: number;             // 발주 단가
  purchase_avg_price?: number;     // 매입 가중평균 단가
  price_diff_pct?: number;         // 단가 차이 %
  auto_exception_type?: "qty_short" | "qty_over" | "price_diff" | "no_purchase" | null;
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
          /* 2026-10-12 · 사용자 지시 "공급사 안나오게 · 발주/매입 통합 · 이것만 나오게 · 너무 길다"
              · 4 column 만 유지: 날짜 · 상품 · 발주/매입 · 처리현황 (공급사 · 판매 · 현재고 제거) */
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200">
                  <th className="pl-5 pr-2 py-1.5 text-left text-[13px] font-semibold text-slate-500 w-[80px] whitespace-nowrap">날짜</th>
                  <th className="px-2 py-1.5 text-left text-[13px] font-semibold text-slate-500">상품</th>
                  <th className="px-2 py-1.5 text-right text-[13px] font-semibold text-slate-500 w-[96px] whitespace-nowrap">발주/매입</th>
                  <th className="px-2 pr-5 py-1.5 text-left text-[13px] font-semibold text-slate-500 w-[108px] whitespace-nowrap">처리현황</th>
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
                  return (
                    <tr
                      key={i}
                      onClick={() => rowClick(r)}
                      className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                      title={`${r.supplier ?? "-"} · 클릭 → 발주·매입대조`}
                    >
                      <td className="pl-5 pr-2 py-2 text-[13px] tabular-nums text-slate-500 align-middle whitespace-nowrap">
                        {String(r.order_date ?? "").slice(5, 10) || "-"}
                      </td>
                      <td className="px-2 py-2 text-[14px] text-ink font-medium align-middle">
                        <div className="truncate">{r.product_name ?? r.product_code ?? "-"}</div>
                        {/* 2026-10-12 · 사용자 지시 · 매입단가 이상 데이터 노출 · 단가 subtext (발주 vs 매입) */}
                        {(r.auto_exception_type === "price_diff" || (r.unit_price != null && r.purchase_avg_price != null && r.unit_price !== r.purchase_avg_price)) && (
                          <div className="text-[12px] text-slate-500 tabular-nums mt-0.5">
                            단가 발주 <span className="text-ink font-semibold">{fmt(r.unit_price)}</span>
                            <span className="text-slate-300 mx-0.5">/</span>
                            <span className={`font-semibold ${r.price_diff_pct != null && Math.abs(r.price_diff_pct) >= 5 ? "text-rose-600" : "text-slate-700"}`}>
                              매입 {fmt(r.purchase_avg_price)}
                            </span>
                            {r.price_diff_pct != null && (
                              <span className={`ml-1 text-[11px] font-semibold ${Math.abs(r.price_diff_pct) >= 5 ? "text-rose-600" : "text-slate-500"}`}>
                                ({r.price_diff_pct > 0 ? "+" : ""}{r.price_diff_pct.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-[14px] tabular-nums align-middle whitespace-nowrap">
                        <span className="font-semibold text-ink">{fmt(oq)}</span>
                        <span className="text-slate-300 mx-0.5">/</span>
                        <span className={`font-semibold ${diff === 0 ? "text-ink" : "text-rose-600"}`}>{fmt(pq)}</span>
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
