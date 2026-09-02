// src/components/OrderManagePage/PurchaseHistoryTab/LedgerTab.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PurchaseSubTabs 에서 이관
// Tab 1 · 매입 원장 · 매입일 그룹 + 화살표 확장
// 프레임워크: Spinner · useColumnResize
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Spinner } from "../../common/Spinner";
import { useColumnResize, RESIZER_CLS } from "../../../hooks/useColumnResize";
import { fmtWonNoUnit } from "../../../lib/format";

// PurchaseLedgerRow 타입은 PurchaseSubTabs 에서 export · 순환 방지 위해 local 재정의
export interface PurchaseLedgerRow {
  id: string | number;
  invoice_date: string | null;
  product_name: string | null;
  product_code: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
const fmtWon = fmtWonNoUnit;

interface DateGroup {
  date: string; // YYYY-MM-DD
  items: PurchaseLedgerRow[];
  totalAmount: number;
  itemCount: number;
  repName: string;
}

export const LedgerTab: React.FC<{
  rows: PurchaseLedgerRow[];
  loading: boolean;
  highlightId?: string | number | null;
}> = ({ rows, loading, highlightId = null }) => {
  const groups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, DateGroup>();
    for (const r of rows) {
      const d = String(r.invoice_date ?? "").slice(0, 10) || "-";
      let g = map.get(d);
      if (!g) {
        g = { date: d, items: [], totalAmount: 0, itemCount: 0, repName: "" };
        map.set(d, g);
      }
      g.items.push(r);
      g.totalAmount += Number(r.amount ?? 0) || 0;
      g.itemCount += 1;
    }
    for (const g of map.values()) {
      let best: PurchaseLedgerRow | null = null;
      for (const it of g.items) {
        if (!best) { best = it; continue; }
        if ((Number(it.amount ?? 0) || 0) > (Number(best.amount ?? 0) || 0)) best = it;
      }
      g.repName = String(best?.product_name ?? "").trim() || "(이름없음)";
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { getWidth: lw, resizerProps: lr } = useColumnResize("purchaseLedger", {
    expand:  { default: 32,  min: 28, max: 48  },
    date:    { default: 112, min: 72, max: 200 },
    name:    { default: 220, min: 100, max: 400 },
    count:   { default: 64,  min: 48, max: 100 },
    amount:  { default: 112, min: 80, max: 200 },
  });

  // 2026-08-06 · T-TEST-매입이력-그룹기본접힘 (사용자 요청)
  //   · 기본 접힌 상태 유지 · 사용자 클릭 시에만 펼침
  const groupsSigRef = useRef<string>("");
  useEffect(() => {
    const sig = groups.map(g => g.date).join("|");
    if (sig === groupsSigRef.current) return;
    groupsSigRef.current = sig;
    // 자동 펼침 로직 제거 · 기본 접힘 유지
  }, [groups]);

  const toggle = (date: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });
  };

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (highlightId == null) return;
    let targetDate: string | null = null;
    for (const g of groups) {
      if (g.items.some(it => String(it.id) === String(highlightId))) {
        targetDate = g.date; break;
      }
    }
    if (!targetDate) return;
    // 2026-08-06 · T-TEST-매입이력-그룹기본접힘 · highlight 발생해도 자동 펼침 X
    const t = window.setTimeout(() => {
      try { highlightRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }
      catch { highlightRowRef.current?.scrollIntoView(); }
    }, 60);
    return () => window.clearTimeout(t);
  }, [highlightId, groups]);

  const totalAmount = useMemo(() => groups.reduce((s, g) => s + g.totalAmount, 0), [groups]);
  const totalItems = useMemo(() => groups.reduce((s, g) => s + g.itemCount, 0), [groups]);
  const [sumCollapsed, setSumCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <Spinner size={14} tone="zinc" label="매입 이력 로딩 중..." labelSize={12} />
      </div>
    );
  }
  if (groups.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-zinc-400 text-[15px]">해당 기간 매입 이력 없음</div>;
  }

  return (
    <div className="overflow-auto flex-1 min-h-0 bg-white">
      <table className="w-full text-[15px] min-w-[420px]" style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
        {/* 2026-08-24 · v3 확산 · bg zinc-100/70 · 반응형 폰트 · font-bold */}
        <thead className="sticky top-0 bg-zinc-100/70 border-b border-line z-10">
          <tr className="text-[15px] sm:text-[16px] font-bold text-zinc-500 uppercase tracking-wider">
            <th className="relative text-center py-2" style={{ width: lw("expand"), minWidth: lw("expand") }}>
              <span {...lr("expand")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-left px-3 py-2" style={{ width: lw("date"), minWidth: lw("date") }}>
              매입일
              <span {...lr("date")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-left px-3 py-2" style={{ width: lw("name"), minWidth: lw("name") }}>
              상품 (대표 · 외 N건)
              <span {...lr("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-right px-3 py-2" style={{ width: lw("count"), minWidth: lw("count") }}>
              건수
              <span {...lr("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            <th className="relative text-right px-3 py-2 text-emerald-600" style={{ width: lw("amount"), minWidth: lw("amount") }}>
              매입금액
              <span {...lr("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {groups.map((g) => {
            const isOpen = expanded.has(g.date);
            const containsHighlight = highlightId != null && g.items.some(it => String(it.id) === String(highlightId));
            return (
              <React.Fragment key={`grp-${g.date}`}>
                <tr
                  onClick={() => toggle(g.date)}
                  className={`cursor-pointer transition-colors ${
                    containsHighlight ? "bg-amber-50 hover:bg-amber-100/70" : isOpen ? "bg-emerald-50/40 hover:bg-emerald-50/60" : "hover:bg-zinc-50/60"
                  }`}
                  title={isOpen ? "접기" : "펼치기"}
                >
                  <td className="text-center align-middle py-2">
                    {isOpen
                      ? <ChevronDown size={13} className="text-emerald-500 mx-auto" />
                      : <ChevronRight size={13} className="text-zinc-400 mx-auto" />}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[15px] font-semibold text-zinc-700 whitespace-nowrap">
                    {/* 2026-08-06 · T-TEST-매입이력-날짜포맷 · 2026 줄바꿈 7/20 */}
                    {(() => {
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g.date);
                      if (m) return (
                        <span className="inline-flex flex-col leading-tight items-start">
                          <span className="text-[16px] text-zinc-400">{m[1]}</span>
                          <span>{String(parseInt(m[2], 10))}/{String(parseInt(m[3], 10))}</span>
                        </span>
                      );
                      return g.date;
                    })()}
                    {containsHighlight && <span className="ml-1 text-[16px] text-amber-600 font-bold">◀</span>}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 break-words whitespace-normal leading-snug">
                    <span className="font-semibold">{g.repName}</span>
                    {g.itemCount > 1 && (
                      <span className="ml-1 text-[17px] text-zinc-500 font-semibold">외 {g.itemCount - 1}건</span>
                    )}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums text-[17px] text-zinc-600 whitespace-nowrap">
                    {fmt(g.itemCount)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                    {g.totalAmount > 0 ? fmt(g.totalAmount) : "-"}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-zinc-50/40">
                    <td></td>
                    <td colSpan={4} className="px-3 py-2">
                      <div className="overflow-x-auto rounded border border-line bg-white">
                        <table className="w-full text-[17px]">
                          <thead className="bg-zinc-50 border-b border-line">
                            <tr className="text-[16px] text-zinc-500 uppercase tracking-wider">
                              <th className="text-left px-2 py-1.5 w-7 text-zinc-300">#</th>
                              <th className="text-left px-2 py-1.5">상품명</th>
                              <th className="text-right px-2 py-1.5 w-16">수량</th>
                              <th className="text-right px-2 py-1.5 w-20">단가</th>
                              <th className="text-right px-2 py-1.5 w-24 text-emerald-600">금액</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {g.items.map((it, i) => {
                              const isHl = highlightId != null && String(it.id) === String(highlightId);
                              return (
                                <tr
                                  key={`gi-${g.date}-${it.id}-${i}`}
                                  ref={isHl ? highlightRowRef : undefined}
                                  className={`transition-colors ${isHl ? "bg-amber-50" : "hover:bg-emerald-50/40"}`}
                                >
                                  <td className="px-2 py-1 text-zinc-300 tabular-nums align-top">{i + 1}</td>
                                  <td className="px-2 py-1 align-top">
                                    <div className="text-[15px] font-semibold text-zinc-700 break-words whitespace-normal leading-snug">
                                      {it.product_name ?? "-"}
                                    </div>
                                    {it.product_code && (
                                      <div className="text-[16px] font-mono text-zinc-400 tabular-nums">{it.product_code}</div>
                                    )}
                                  </td>
                                  <td className="text-right px-2 py-1 font-bold text-zinc-800 tabular-nums align-top">
                                    {Number(it.quantity ?? 0) !== 0 ? fmt(Number(it.quantity ?? 0)) : "-"}
                                  </td>
                                  <td className="text-right px-2 py-1 text-zinc-500 tabular-nums align-top">
                                    {Number(it.unit_price ?? 0) > 0 ? fmt(Number(it.unit_price ?? 0)) : "-"}
                                  </td>
                                  <td className="text-right px-2 py-1 font-bold text-emerald-700 tabular-nums align-top">
                                    {Number(it.amount ?? 0) > 0 ? fmt(Number(it.amount ?? 0)) : "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-line">
          <tr>
            <td className="text-center">
              <button
                type="button"
                onClick={() => setSumCollapsed(v => !v)}
                title={sumCollapsed ? "합계 펼치기" : "합계 접기"}
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-emerald-600 transition cursor-pointer"
              >
                {sumCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
            </td>
            <td colSpan={2} className="px-3 py-2 text-right text-[17px] font-bold text-zinc-500">
              합계 <span className="text-zinc-400 font-bold">({groups.length}일)</span>
            </td>
            <td className={`px-3 py-2 text-right tabular-nums text-[15px] font-bold text-zinc-700 ${sumCollapsed ? "opacity-30" : ""}`}>
              {sumCollapsed ? "···" : fmt(totalItems)}
            </td>
            <td className={`px-3 py-2 text-right tabular-nums text-[16px] font-bold text-emerald-700 ${sumCollapsed ? "opacity-30" : ""}`}>
              {sumCollapsed ? "···" : fmtWon(totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
