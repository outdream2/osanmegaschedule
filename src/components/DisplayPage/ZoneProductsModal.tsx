// src/components/DisplayPage/ZoneProductsModal.tsx
// 2026-08-22 · Framework Phase 4 · DisplayPage.tsx 에서 분리
// 2026-08-23 · #191 · inline fixed inset-0 → common/Modal primitive
import React from "react";
import { StatusPill } from "../common/StatusPill";
import { Modal } from "../common/Modal";
import type { ProductInfo } from "../../lib/productsCache";

export interface ZoneProductsModalState {
  zoneId: string;
  zoneNum: number;
  zoneLabel: string;
  category: string;
}

type SortKey = "name" | "spec" | "real_map" | "current_stock" | "warehouse_stock" | "store_stock" | "real_total" | "loss" | "optimal_stock" | "status" | "mismatch";

interface ZoneProductsModalProps {
  modal: ZoneProductsModalState;
  productsMap: Record<string, ProductInfo>;
  filter: "all" | "mismatch";
  search: string;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onClose: () => void;
  onSetFilter: (f: "all" | "mismatch") => void;
  onSetSearch: (s: string) => void;
  onSetSort: (s: { key: SortKey; dir: "asc" | "desc" }) => void;
  onProductClick: (p: ProductInfo) => void;
}

export const ZoneProductsModal: React.FC<ZoneProductsModalProps> = ({
  modal,
  productsMap,
  filter,
  search,
  sort,
  onClose,
  onSetFilter,
  onSetSearch,
  onSetSort,
  onProductClick,
}) => {
  const { zoneId, zoneNum, zoneLabel, category } = modal;

  const parseSideAndNum = (v: string): { num: number; side: "A" | "B" | null } | null => {
    const s = v.trim();
    const m1 = /^(\d+)번[^A-Z]*?([AB])?$/.exec(s);
    if (m1) return { num: Number(m1[1]), side: (m1[2] as "A" | "B") ?? null };
    const m2 = /^(\d+)([AB])?$/.exec(s);
    if (m2) return { num: Number(m2[1]), side: (m2[2] as "A" | "B") ?? null };
    return null;
  };

  const isAisle18 = zoneNum >= 1 && zoneNum <= 8;
  const zoneSide: "A" | "B" | null = zoneId.endsWith("A") ? "A" : zoneId.endsWith("B") ? "B" : null;

  const matchesZone = (raw: string | null | undefined): boolean => {
    if (!raw) return false;
    const parsed = parseSideAndNum(String(raw));
    if (!parsed) return false;
    if (parsed.num !== zoneNum) return false;
    if (isAisle18) return parsed.side === zoneSide || parsed.side === null;
    return true;
  };

  const matched = (Object.values(productsMap) as ProductInfo[]).filter(p =>
    matchesZone(p.spec) || matchesZone(p.real_map)
  );

  const q = search.trim().toLowerCase();
  const filteredRaw = matched.filter((p: ProductInfo) => {
    if (q && !(String(p.name ?? "").toLowerCase().includes(q))) return false;
    if (filter === "mismatch") {
      const specStr = String(p.spec ?? "").trim();
      const realStr = String(p.real_map ?? "").trim();
      if (specStr === realStr) return false;
    }
    return true;
  });

  const cmpStr = (a: string, b: string) => a.localeCompare(b, "ko");
  const cmpNum = (a: number, b: number) => a - b;
  const numOrNaN = (v: any) => v != null && v !== "" ? Number(v) : NaN;
  const realTotalOf = (p: any) => {
    const wh = numOrNaN(p.warehouse_stock);
    const st = numOrNaN(p.store_stock);
    if (!Number.isFinite(wh) && !Number.isFinite(st)) return -Infinity;
    return (Number.isFinite(wh) ? wh : 0) + (Number.isFinite(st) ? st : 0);
  };
  const lossOf = (p: any) => {
    const closing = numOrNaN(p.closing_stock);
    const cur = numOrNaN(p.current_stock);
    return (Number.isFinite(closing) && Number.isFinite(cur)) ? closing - cur : -Infinity;
  };
  const statusRank = (p: any) => {
    const cur = numOrNaN(p.current_stock);
    const opt = numOrNaN(p.optimal_stock);
    if (!Number.isFinite(cur)) return 5;
    if (cur <= 0) return 0;
    if (cur < 3) return 1;
    if (Number.isFinite(opt) && opt > 0 && cur < opt) return 2;
    return 3;
  };

  const filtered = [...filteredRaw].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "name": return dir * cmpStr(String(a.name ?? ""), String(b.name ?? ""));
      case "spec": return dir * cmpStr(String(a.spec ?? ""), String(b.spec ?? ""));
      case "real_map": return dir * cmpStr(String(a.real_map ?? ""), String(b.real_map ?? ""));
      case "current_stock": {
        const aS = numOrNaN((a as any).current_stock); const bS = numOrNaN((b as any).current_stock);
        return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
      }
      case "warehouse_stock": {
        const aS = numOrNaN((a as any).warehouse_stock); const bS = numOrNaN((b as any).warehouse_stock);
        return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
      }
      case "store_stock": {
        const aS = numOrNaN((a as any).store_stock); const bS = numOrNaN((b as any).store_stock);
        return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
      }
      case "real_total": return dir * cmpNum(realTotalOf(a), realTotalOf(b));
      case "loss": return dir * cmpNum(lossOf(a), lossOf(b));
      case "optimal_stock": {
        const aS = numOrNaN((a as any).optimal_stock); const bS = numOrNaN((b as any).optimal_stock);
        return dir * cmpNum(Number.isFinite(aS) ? aS : -Infinity, Number.isFinite(bS) ? bS : -Infinity);
      }
      case "status": return dir * cmpNum(statusRank(a), statusRank(b));
      case "mismatch": {
        const aMis = (String(a.spec ?? "").trim() !== String(a.real_map ?? "").trim()) ? 1 : 0;
        const bMis = (String(b.spec ?? "").trim() !== String(b.real_map ?? "").trim()) ? 1 : 0;
        return dir * cmpNum(aMis, bMis);
      }
      default: return 0;
    }
  });

  const toggleSort = (key: SortKey) => {
    onSetSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  };
  const sortIcon = (key: SortKey) =>
    sort.key !== key ? "↕" : sort.dir === "asc" ? "▲" : "▼";

  const modalTitle = (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">구역별 상품 리스트</div>
      <div className="text-lg font-bold text-zinc-800 mt-0.5">{zoneLabel}</div>
      {category && (
        <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{category}</div>
      )}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={modalTitle}
      headerTint={false}
      className="w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh]"
      footer={
        <button onClick={onClose} className="text-[11px] font-bold text-zinc-600 bg-white border border-zinc-300 px-4 py-1.5 rounded hover:bg-zinc-100 cursor-pointer">닫기</button>
      }
    >
      {/* Filters */}
      <div className="-mx-5 px-4 py-2 bg-zinc-50 border-b border-line flex items-center gap-2 flex-wrap mb-3">
        <input type="text" value={search} onChange={e => onSetSearch(e.target.value)} placeholder="상품명 검색"
          className="flex-1 min-w-[120px] text-[11px] border border-zinc-300 rounded px-2 py-1 focus:outline-none focus:border-brand-deep" />
        <div className="inline-flex bg-white border border-zinc-300 rounded p-0.5">
          <button onClick={() => onSetFilter("all")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${filter === "all" ? "bg-brand-deep text-white" : "text-zinc-500"}`}>전체</button>
          <button onClick={() => onSetFilter("mismatch")} className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${filter === "mismatch" ? "bg-rose-500 text-white" : "text-rose-500"}`}>불일치</button>
        </div>
        <span className="text-[10px] font-bold text-zinc-500 ml-auto">{filtered.length}/{matched.length}건</span>
      </div>
      {/* List */}
      <div className="overflow-y-auto overflow-x-hidden bg-zinc-50 -mx-5 px-2 sm:px-4 pb-2">
        {filtered.length === 0 ? (
          <div className="text-center text-xs text-zinc-400 py-10 bg-white rounded-xl border border-line">해당 조건의 상품 없음</div>
        ) : (
          <div className="bg-white rounded-xl border border-line overflow-hidden">
            <table className="w-full text-[11px] table-fixed">
              <colgroup>
                <col />
                <col className="w-[44px]" />
                <col className="w-[44px]" />
                <col className="w-[44px]" />
                <col className="w-[48px]" />
                <col className="w-[44px]" />
                <col className="w-[44px]" />
                <col className="w-[60px]" />
              </colgroup>
              <thead className="bg-zinc-50 border-b border-line sticky top-0 z-10">
                <tr className="text-[10px] font-bold text-zinc-600 uppercase tracking-wide">
                  <th className="text-left px-2 py-2">
                    <button type="button" onClick={() => toggleSort("name")} className="hover:text-zinc-900 cursor-pointer inline-flex items-center gap-1">
                      상품명 <span className="text-zinc-400 text-[10px]">{sortIcon("name")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 text-amber-500" title="ERP 현재고">
                    <button type="button" onClick={() => toggleSort("current_stock")} className="hover:text-amber-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      ERP<span className="text-zinc-400 text-[10px]">{sortIcon("current_stock")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 bg-cyan-50 text-cyan-600 font-bold" title="실재고 · 창고">
                    <button type="button" onClick={() => toggleSort("warehouse_stock")} className="hover:text-cyan-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      창고<span className="text-zinc-400 text-[10px]">{sortIcon("warehouse_stock")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 bg-violet-50 text-violet-600 font-bold" title="실재고 · 매장">
                    <button type="button" onClick={() => toggleSort("store_stock")} className="hover:text-violet-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      매장<span className="text-zinc-400 text-[10px]">{sortIcon("store_stock")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 text-emerald-600 font-bold" title="실재고 합계">
                    <button type="button" onClick={() => toggleSort("real_total")} className="hover:text-emerald-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      실재고<span className="text-zinc-400 text-[10px]">{sortIcon("real_total")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 text-rose-500 font-bold" title="손실">
                    <button type="button" onClick={() => toggleSort("loss")} className="hover:text-rose-700 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      손실<span className="text-zinc-400 text-[10px]">{sortIcon("loss")}</span>
                    </button>
                  </th>
                  <th className="text-right px-1 py-2 text-zinc-500" title="추천적정재고">
                    <button type="button" onClick={() => toggleSort("optimal_stock")} className="hover:text-zinc-800 cursor-pointer inline-flex items-center justify-end gap-0.5 w-full">
                      추천적정<span className="text-zinc-400 text-[10px]">{sortIcon("optimal_stock")}</span>
                    </button>
                  </th>
                  <th className="text-center px-1 py-2">
                    <button type="button" onClick={() => toggleSort("status")} className="hover:text-zinc-900 cursor-pointer inline-flex items-center justify-center gap-0.5 w-full">
                      상황<span className="text-zinc-400 text-[10px]">{sortIcon("status")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtered.map((p: ProductInfo) => {
                  const stockRaw = (p as any).current_stock;
                  const stockNum = stockRaw != null && stockRaw !== "" ? Number(stockRaw) : NaN;
                  const optRaw = (p as any).optimal_stock;
                  const optNum = optRaw != null && optRaw !== "" ? Number(optRaw) : NaN;
                  const wh = (p as any).warehouse_stock;
                  const st = (p as any).store_stock;
                  const realTotalVal = (wh != null || st != null) ? (Number(wh ?? 0) + Number(st ?? 0)) : null;
                  const mismatch = realTotalVal != null && Number.isFinite(stockNum) && realTotalVal !== stockNum;
                  let statusLabel = "정상";
                  let statusTone: "emerald" | "zinc" | "rose" | "amber" = "emerald";
                  let statusPulse = false;
                  if (!Number.isFinite(stockNum)) {
                    statusLabel = "미확인"; statusTone = "zinc";
                  } else if (stockNum <= 0) {
                    statusLabel = "품절"; statusTone = "rose";
                  } else if (stockNum < 3) {
                    statusLabel = "품절임박"; statusTone = "amber"; statusPulse = true;
                  } else if (Number.isFinite(optNum) && optNum > 0 && stockNum < optNum) {
                    statusLabel = "적정이하"; statusTone = "amber";
                  }
                  const fmt = (v: any) => v == null ? "-" : String(v);
                  return (
                    <tr key={p.code} className="hover:bg-zinc-50 cursor-pointer" onClick={() => onProductClick(p)}>
                      <td className="text-left px-2 py-1.5 min-w-0">
                        <div className="text-[12px] font-bold text-zinc-800 truncate" title={p.name}>{p.name}</div>
                        {((p as any).spec || (p as any).real_map) && (
                          <div className="mt-0.5 text-[9px] text-zinc-400 truncate">
                            {(p as any).spec && <span className="font-mono" title="전산배치구역">전산 {String((p as any).spec)}</span>}
                            {(p as any).real_map && <span className="font-mono" title="실제배치구역"> · 실제 {String((p as any).real_map)}</span>}
                          </div>
                        )}
                      </td>
                      <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${!Number.isFinite(stockNum) ? "text-zinc-300" : stockNum <= 0 ? "text-red-600" : "text-amber-700"}`}>{Number.isFinite(stockNum) ? stockNum : "-"}</td>
                      <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] bg-cyan-50/50 ${wh != null ? "text-cyan-700" : "text-zinc-300"}`}>{fmt(wh)}</td>
                      <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] bg-violet-50/50 ${st != null ? "text-violet-700" : "text-zinc-300"}`}>{fmt(st)}</td>
                      <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${realTotalVal == null ? "text-zinc-300" : mismatch ? "text-rose-600" : "text-emerald-700"}`} title={mismatch ? `실재고 ${realTotalVal} ≠ ERP ${stockNum} · 불일치` : "실재고 합계"}>{realTotalVal == null ? "-" : realTotalVal}</td>
                      {(() => {
                        const closingRaw = (p as any).closing_stock;
                        const closingNum = closingRaw != null && closingRaw !== "" ? Number(closingRaw) : NaN;
                        const loss = (Number.isFinite(closingNum) && Number.isFinite(stockNum)) ? (closingNum - stockNum) : null;
                        return (
                          <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${loss == null ? "text-zinc-300" : loss > 0 ? "text-rose-600" : loss < 0 ? "text-sky-600" : "text-zinc-500"}`} title={loss == null ? "마감재고 없음" : `마감재고 ${closingNum} - 현재고 ${stockNum} = ${loss}`}>{loss == null ? "-" : loss}</td>
                        );
                      })()}
                      <td className={`text-right px-1 py-1.5 font-mono font-bold text-[11px] ${Number.isFinite(optNum) ? "text-zinc-600" : "text-zinc-300"}`}>{Number.isFinite(optNum) ? optNum : "-"}</td>
                      <td className="text-center px-1 py-1.5">
                        <StatusPill tone={statusTone} size="xs" dot={statusTone !== "zinc"} pulse={statusPulse}>{statusLabel}</StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};
