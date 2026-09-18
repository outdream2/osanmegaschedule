// src/components/DisplayPage/RealStockDetailModal.tsx
// 2026-09-18 · #149 R-2 · 상세 Modal 컴포넌트 분리 (사용자 지시)

import React from "react";
import { Modal } from "../common/Modal";
import { ShelfPositionsBadge } from "../common/ShelfPositionsBadge";
import { displayVendorName } from "../../utils/vendorNameNormalize";
import type { ShelfPositions } from "../../lib/shelfPositions";
import type { Row } from "./RealStockTablePage.types";

type ShelfMap = Record<string, ShelfPositions>;

interface Props {
  row: Row;
  shelfMap: ShelfMap;
  onClose: () => void;
}

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="text-[14px] font-bold text-ink-soft uppercase tracking-wider">{label}</span>
    <span className="text-[15px] text-ink break-keep">{value}</span>
  </div>
);

export const RealStockDetailModal: React.FC<Props> = ({ row, shelfMap, onClose }) => (
  <Modal
    open
    onClose={onClose}
    title={row.product_name}
    size="md"
    titleAccent
  >
    <div className="flex flex-col gap-3 text-[15px]">
      <div className="grid grid-cols-2 gap-3">
        <Field label="상품코드" value={<span className="font-mono text-[15px] tabular-nums">{row.product_code}</span>} />
        <Field label="공급사"  value={row.supplier ? (displayVendorName(row.supplier) || row.supplier) : "-"} />
        <Field label="진열위치" value={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{row.location ?? "미지정"}</span>
            <ShelfPositionsBadge positions={shelfMap[row.product_code]} size="sm" />
          </div>
        } />
        <Field label="ERP재고"  value={<b className="text-amber-700 tabular-nums text-[17px]">{row.erp ?? "-"}</b>} />
        <Field label="실재고합계" value={<b className="text-brand-deep tabular-nums text-[17px]">{row.total > 0 ? row.total : "-"}</b>} />
      </div>
      <div className="border-t border-line pt-3">
        <div className="text-[15px] font-bold text-ink-soft uppercase tracking-wider mb-2">위치별 실재고</div>
        <div className="grid grid-cols-5 gap-2">
          {(() => {
            const sp = shelfMap[row.product_code] ?? {};
            const fmt = (v: string | null | undefined): string | null =>
              typeof v === "string" && v.length === 3 ? `${v[0]}-${v[1]}-${v[2]}` : null;
            return [
              { label: "매장1", qty: row.s1, zone: row.s1zone, tone: "violet", shelfCode: "store1" },
              { label: "매장2", qty: row.s2, zone: row.s2zone, tone: "violet", shelfCode: "store2" },
              { label: "매장3", qty: row.s3, zone: row.s3zone, tone: "violet", shelfCode: "store3" },
              { label: "창고1", qty: row.w1, zone: row.w1zone, tone: "cyan",   shelfCode: "warehouse1" },
              { label: "창고2", qty: row.w2, zone: row.w2zone, tone: "cyan",   shelfCode: "warehouse2" },
            ].map((s) => {
              const shelfDetail = fmt(sp[s.shelfCode]);
              return (
                <div key={s.label} className={`rounded-lg border p-2 text-center ${s.tone === "violet" ? "bg-violet-50/40 border-violet-200" : "bg-cyan-50/40 border-cyan-200"}`}>
                  <div className={`text-[14px] font-bold ${s.tone === "violet" ? "text-violet-700" : "text-cyan-700"}`}>{s.label}</div>
                  {s.zone && <div className="text-[15px] font-bold text-zinc-500 mt-0.5">{s.zone}</div>}
                  {shelfDetail && (
                    <div className={`text-[12px] font-semibold tabular-nums mt-0.5 ${s.tone === "violet" ? "text-violet-600" : "text-cyan-600"}`}>
                      상세 {shelfDetail}
                    </div>
                  )}
                  <div className={`text-[18px] font-extrabold tabular-nums mt-0.5 ${s.qty != null && s.qty > 0 ? (s.tone === "violet" ? "text-violet-800" : "text-cyan-800") : "text-zinc-300"}`}>{s.qty ?? "-"}</div>
                </div>
              );
            });
          })()}
        </div>
      </div>
      <div className="border-t border-line pt-3 flex items-center justify-between">
        <span className="text-[16px] font-bold text-ink-soft">차이 (ERP − 실재고합계)</span>
        <span className={`text-[20px] font-extrabold tabular-nums ${row.diff > 0 ? "text-rose-600" : row.diff < 0 ? "text-emerald-600" : "text-zinc-400"}`}>
          {row.diff !== 0 ? (row.diff > 0 ? `+${row.diff}` : String(row.diff)) : "0"}
        </span>
      </div>
    </div>
  </Modal>
);
