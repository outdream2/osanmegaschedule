// src/components/OrderManagePage/PurchaseHistoryTab/ProductAggTab.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PurchaseSubTabs 에서 이관
// Tab 2 · 상품별 집계 (product_name groupBy)
// 프레임워크: useSortableTable · useColumnResize
import React, { useEffect, useMemo, useState } from "react";
import { useSortableTable, type Comparator } from "../../../hooks/useSortableTable";
import { useColumnResize, RESIZER_CLS } from "../../../hooks/useColumnResize";
import { fmtWonNoUnit, fmtDateSlice } from "../../../lib/format";
import { Spinner } from "../../common/Spinner";

// PurchaseDetailRow · PurchaseSubTabs 에서 export 하지만 순환 방지 위해 local 재정의
// 2026-10-06 · supplier_name 추가 · 상품별조회 공급사 컬럼 (ERP 매입이력 원본)
export interface PurchaseDetailRow {
  id: string | number;
  date: string; // YYYY-MM-DD
  product_code: string | null;
  product_name: string | null;
  supplier_name: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
}
const fmtWon = fmtWonNoUnit;
const dateLabel = fmtDateSlice;

interface ProductAgg {
  key: string;
  // 2026-10-06 · 사용자 지시 · 상품 identity = product_code 유지 (07b59756 원칙)
  //   · supplier 는 display/aggregation 정보 · identity/grouping 아님
  //   · 같은 product_code 그룹의 non-empty supplier_name 전체 unique Set 수집
  //     - count 0 → "-"
  //     - count 1 → 공급사명 그대로
  //     - count ≥ 2 → "공급사 N곳" (title tooltip 에 전체 목록)
  //   · 첫 공급사를 대표로 쓰지 않음 (대표 공급사 근거 없음)
  suppliers: string[];                  // 가나다 정렬된 unique supplier_name
  // 정렬용 내부 key · 단일=이름 · 복수=join (가나다 정렬된 전체 목록)
  supplier_sort_key: string;
  product_name: string;
  product_code: string | null;
  total_qty: number;
  total_amount: number;
  avg_unit_price: number;
  last_date: string;
  purchase_count: number;
  avg_interval: number | null; // 2026-08-06 · 평균 매입주기 (일) · 2회+ 만 계산
  _dates: Set<string>; // 계산 임시
  _supplierSet: Set<string>; // 수집 임시 (post-process 에서 suppliers / sort_key 생성)
}

type ProductSortKey = "supplier_name" | "product_name" | "total_qty" | "avg_unit_price" | "last_date" | "purchase_count" | "total_amount" | "avg_interval";

const PRODUCT_AGG_CMP: Record<ProductSortKey, Comparator<ProductAgg>> = {
  // 2026-10-06 · 복수 공급사 안정 정렬 · 가나다 정렬 후 join 한 내부 key 비교
  supplier_name:  (a, b) => a.supplier_sort_key.localeCompare(b.supplier_sort_key, "ko"),
  product_name:   (a, b) => a.product_name.localeCompare(b.product_name, "ko"),
  total_qty:      (a, b) => a.total_qty - b.total_qty,
  avg_unit_price: (a, b) => a.avg_unit_price - b.avg_unit_price,
  last_date:      (a, b) => a.last_date.localeCompare(b.last_date),
  purchase_count: (a, b) => a.purchase_count - b.purchase_count,
  total_amount:   (a, b) => a.total_amount - b.total_amount,
  avg_interval:   (a, b) => (a.avg_interval ?? 999) - (b.avg_interval ?? 999),
};

export const ProductAggTab: React.FC<{ rows: PurchaseDetailRow[]; loading: boolean }> = ({ rows, loading }) => {
  const aggregated = useMemo<ProductAgg[]>(() => {
    // 2026-10-06 · 사용자 지시 · identity/group key = canonical product_code
    //   · product_name · supplier_name 은 display/aggregation only (DB 받은 값 그대로)
    //   · product_name · 첫 non-empty 로 display 보강 (상품별 1 row)
    //   · supplier · 같은 code 그룹의 non-empty unique Set 전체 수집 (대표 공급사 없음)
    //   · product_code 가 없는 row 는 unmapped · 집계에서 skip (ghost merge 방지)
    const map = new Map<string, ProductAgg>();
    for (const r of rows) {
      const code = String(r.product_code ?? "").trim();
      if (!code) continue; // identity 없음 → skip
      const pname = String(r.product_name ?? "").trim();
      const sname = String(r.supplier_name ?? "").trim();
      let a = map.get(code);
      if (!a) {
        a = {
          key: code,
          suppliers: [],
          supplier_sort_key: "",
          product_name: pname || "-",
          product_code: code,
          total_qty: 0,
          total_amount: 0,
          avg_unit_price: 0,
          last_date: r.date,
          purchase_count: 0,
          avg_interval: null,
          _dates: new Set<string>(),
          _supplierSet: new Set<string>(),
        };
        map.set(code, a);
      } else if ((a.product_name === "-" || !a.product_name) && pname) {
        // 첫 non-empty product_name 으로 display 보강
        a.product_name = pname;
      }
      if (sname) a._supplierSet.add(sname);
      a.total_qty += r.quantity;
      a.total_amount += r.amount;
      a.purchase_count += 1;
      if (r.date > a.last_date) a.last_date = r.date;
      const d = String(r.date ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) a._dates.add(d);
    }
    for (const a of map.values()) {
      a.avg_unit_price = a.total_qty > 0 ? a.total_amount / a.total_qty : 0;
      // 평균 매입주기 · 2회+ 매입 · 정렬 dates · 인접 간격 평균 (일)
      if (a._dates.size >= 2) {
        const dates = Array.from(a._dates).sort();
        let total = 0;
        for (let i = 1; i < dates.length; i++) {
          total += Math.round((new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000);
        }
        a.avg_interval = Math.round(total / (dates.length - 1));
      }
      // supplier 가나다 정렬 unique list · 정렬 key (단일=이름 · 복수=join)
      a.suppliers = Array.from(a._supplierSet).sort((x, y) => x.localeCompare(y, "ko"));
      a.supplier_sort_key = a.suppliers.join(" · ");
    }
    return Array.from(map.values());
  }, [rows]);

  const { sorted, sortKey, sortDir, toggleSort } = useSortableTable<ProductAgg, ProductSortKey>(aggregated, "total_amount", PRODUCT_AGG_CMP, "desc");
  const arrow = (k: ProductSortKey) => sortKey !== k ? " ⇅" : sortDir === "asc" ? " ▲" : " ▼";
  // 2026-10-06 · 사용자 지시 · 공급사 컬럼 추가 (상품명 앞)
  //   · storageKey "productAgg" 유지 · 사용자 저장 width 는 기존 컬럼만 적용 (하위호환)
  const { getWidth: aw, resizerProps: ar } = useColumnResize("productAgg", {
    num:      { default: 28,  min: 24, max: 48  },
    supplier: { default: 140, min: 80, max: 260 },
    name:     { default: 200, min: 100, max: 400 },
    qty:      { default: 80,  min: 56, max: 140 },
    unit:     { default: 80,  min: 56, max: 140 },
    interval: { default: 56,  min: 40, max: 100 },
    last_date:{ default: 56,  min: 40, max: 100 },
    count:    { default: 56,  min: 40, max: 100 },
    amount:   { default: 96,  min: 64, max: 160 },
  });

  const totalAmount = useMemo(() => aggregated.reduce((s, a) => s + a.total_amount, 0), [aggregated]);

  // 2026-10-06 · 사용자 지시 · 페이지 기능 추가 · 대량 집계 시 렌더 부하 완화
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  // 정렬/데이터 변경 시 1페이지로 reset · 또한 totalPages 초과 시 clamp
  useEffect(() => { setPage(1); }, [sortKey, sortDir, pageSize, totalCount]);
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);
  const pageSum = useMemo(() => pageRows.reduce((s, a) => s + a.total_amount, 0), [pageRows]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center py-12"><Spinner label="불러오는 중..." size={13} tone="zinc" labelSize={11} /></div>;
  }
  if (aggregated.length === 0) {
    return <div className="flex-1 flex items-center justify-center py-12 text-zinc-400 text-[17px]">해당 기간 매입 상품 없음</div>;
  }
  return (
    <div className="flex-1 min-h-0 flex flex-col">
     <div className="overflow-auto flex-1 min-h-0">
      <table className="w-full text-xs min-w-[600px]" style={{ tableLayout: "fixed" }}>
        {/* 2026-08-24 · v3 확산 · bg zinc-100/70 · font-bold */}
        <thead className="sticky top-0 bg-zinc-100/70 z-10 border-b border-line">
          <tr className="text-[15px] sm:text-[16px] font-bold text-zinc-500 uppercase tracking-wider">
            <th className="relative text-left px-2 py-2 text-zinc-300" style={{ width: aw("num"), minWidth: aw("num") }}>
              #
              <span {...ar("num")} className={RESIZER_CLS} style={{ touchAction: "none" }} />
            </th>
            {/* 2026-10-06 · 공급사 컬럼 (상품명 앞) · ERP 매입이력 상품별 조회와 컬럼 일치 */}
            <th onClick={() => toggleSort("supplier_name")}
              className="relative text-left px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("supplier"), minWidth: aw("supplier") }}>
              공급사{arrow("supplier_name")}
              <span {...ar("supplier")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("product_name")}
              className="relative text-left px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("name"), minWidth: aw("name") }}>
              상품{arrow("product_name")}
              <span {...ar("name")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("total_qty")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("qty"), minWidth: aw("qty") }}>
              총매입수량{arrow("total_qty")}
              <span {...ar("qty")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("avg_unit_price")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition"
              style={{ width: aw("unit"), minWidth: aw("unit") }}>
              평균단가{arrow("avg_unit_price")}
              <span {...ar("unit")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("avg_interval")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("interval"), minWidth: aw("interval") }}>
              평균<br />매입주기{arrow("avg_interval")}
              <span {...ar("interval")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("last_date")}
              className="relative text-left px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("last_date"), minWidth: aw("last_date") }}>
              최근<br />매입일{arrow("last_date")}
              <span {...ar("last_date")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("purchase_count")}
              className="relative text-right px-2 py-2 cursor-pointer select-none hover:bg-zinc-50 transition leading-tight"
              style={{ width: aw("count"), minWidth: aw("count") }}>
              매입<br />횟수{arrow("purchase_count")}
              <span {...ar("count")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
            <th onClick={() => toggleSort("total_amount")}
              className="relative text-right px-2 py-2 text-emerald-600 cursor-pointer select-none hover:bg-emerald-50 transition"
              style={{ width: aw("amount"), minWidth: aw("amount") }}>
              총매입액{arrow("total_amount")}
              <span {...ar("amount")} className={RESIZER_CLS} style={{ touchAction: "none" }} onClick={(e: React.MouseEvent) => e.stopPropagation()} />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {pageRows.map((a, i) => (
            <tr key={`pa-${a.key}-${pageStart + i}`} className="hover:bg-zinc-50/60 transition-all duration-100">
              <td className="px-2 py-1.5 text-zinc-300 text-[17px] tabular-nums align-top">{pageStart + i + 1}</td>
              {/* 2026-10-06 · 공급사 셀 · unique Set 집계 · 복수면 "공급사 N곳" + title tooltip 전체 목록
                   · 대표 공급사 없음 (첫 공급사 가정 금지) */}
              <td className="px-2 py-1.5 align-top">
                {a.suppliers.length === 0 ? (
                  <div className="text-[15px] text-zinc-300">-</div>
                ) : a.suppliers.length === 1 ? (
                  <div className="text-[15px] font-semibold text-zinc-600 break-words whitespace-normal leading-snug">
                    {a.suppliers[0]}
                  </div>
                ) : (
                  <div
                    className="text-[15px] font-semibold text-zinc-600 whitespace-nowrap cursor-help"
                    title={a.suppliers.join("\n")}
                  >
                    공급사 {a.suppliers.length}곳
                  </div>
                )}
              </td>
              {/* 2026-10-06 · 사용자 지시 · 코드 셀 제거 · 상품명만 표시 */}
              <td className="px-2 py-1.5 align-top">
                <div className="text-[15px] font-semibold text-zinc-700 break-words whitespace-normal leading-snug">
                  {a.product_name}
                </div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {fmt(a.total_qty)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {a.avg_unit_price > 0 ? fmt(Math.round(a.avg_unit_price)) : "-"}
              </td>
              {/* 평균 매입주기 (2026-08-06) · 일수 · 2회 미만이면 '-' */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[15px] align-top ${a.avg_interval == null ? "text-zinc-300" : "text-zinc-600"}`}
                  title={a.avg_interval == null ? "매입 2회 미만" : `평균 ${a.avg_interval}일`}>
                {a.avg_interval == null ? "—" : `${a.avg_interval}일`}
              </td>
              {/* 최근매입일 (2026-08-06) · 2026 (10px 회색) 줄바꿈 7/20 형식 */}
              <td className="px-2 py-1.5 tabular-nums text-[17px] text-zinc-500 align-top whitespace-nowrap">
                {(() => {
                  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.last_date);
                  if (m) return (
                    <span className="inline-flex flex-col leading-tight items-start">
                      <span className="text-[15px] text-zinc-400">{m[1]}</span>
                      <span>{String(parseInt(m[2], 10))}/{String(parseInt(m[3], 10))}</span>
                    </span>
                  );
                  return dateLabel(a.last_date);
                })()}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] text-zinc-600 align-top">
                {fmt(a.purchase_count)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[15px] font-semibold text-emerald-700 align-top">
                {fmt(a.total_amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-white border-t-2 border-line">
          <tr>
            {/* 2026-10-06 · 공급사 컬럼 추가로 colSpan 7 → 8 · 페이지 합계 + 전체 합계 병기 */}
            <td colSpan={8} className="px-2 py-2 text-right text-[15px] font-bold text-zinc-500">
              페이지 합계 <span className="ml-1 text-zinc-400 font-normal">(전체 {fmtWon(totalAmount)})</span>
            </td>
            <td className="px-2 py-2 text-right tabular-nums text-[16px] font-bold text-emerald-700">{fmtWon(pageSum)}</td>
          </tr>
        </tfoot>
      </table>
     </div>
      {/* 2026-10-06 · 페이지네이션 컨트롤 · 대량 집계 렌더 부하 완화 */}
      <div className="shrink-0 border-t border-line bg-zinc-50/60 px-3 py-2 flex items-center gap-2 text-[14px] text-zinc-600 flex-wrap">
        <span className="tabular-nums">
          {totalCount === 0
            ? "0건"
            : `${(pageStart + 1).toLocaleString()}–${Math.min(pageStart + pageRows.length, totalCount).toLocaleString()} / ${totalCount.toLocaleString()}건`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <label className="text-[13px] text-zinc-500 mr-1">페이지당</label>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] cursor-pointer hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={safePage <= 1}
            className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
            aria-label="첫 페이지"
          >‹‹</button>
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
            aria-label="이전 페이지"
          >‹</button>
          <span className="px-2 tabular-nums text-[14px] font-semibold text-zinc-700">
            {safePage.toLocaleString()} / {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
            aria-label="다음 페이지"
          >›</button>
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={safePage >= totalPages}
            className="h-7 px-2 rounded border border-zinc-200 bg-white text-[13px] disabled:opacity-40 disabled:cursor-not-allowed hover:border-zinc-300 cursor-pointer"
            aria-label="마지막 페이지"
          >››</button>
        </div>
      </div>
    </div>
  );
};
