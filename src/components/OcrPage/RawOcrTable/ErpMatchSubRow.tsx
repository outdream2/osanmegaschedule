// 2026-07-27 · 1차보정 표 · 각 데이터 행 아래 ERP 매칭 sub-row
//   parent 1차 컬럼 격자에 정확히 정렬 · 각 셀은 해당 컬럼의 ERP 값 (없으면 대시)
//   ERP 만 표시 · OCR 값과의 중복 X · 위 (OCR 행) ↔ 아래 (ERP 행) 매칭
import React from "react";
import { fmt } from "./utils";
import type { CandidateInfo, BarcodeProduct } from "./types";

interface ColEntry { origIdx: number; orderIdx?: number }

interface Props {
  colList: ColEntry[];
  dispHeaders: string[];
  colWidthPx: (origIdx: number) => number | undefined;
  matched: CandidateInfo | null;
  autoSyn?: { code: string; name: string };
  barcode: BarcodeProduct | null;
  ocrQty: number | null;    // ERP 금액 계산용 (masterPrice × ocrQty)
  onCancel?: () => void;
}

/** parent 1차 헤더명 → ERP 값 문자열 매핑 */
function getErpCellValue(
  header: string,
  matched: CandidateInfo | null,
  autoSyn: { code: string; name: string } | undefined,
  barcode: BarcodeProduct | null,
  ocrQty: number | null,
): { text: React.ReactNode; align: "left" | "right" } {
  const dash = <span className="text-slate-300">—</span>;
  const erpName    = matched?.name ?? autoSyn?.name ?? barcode?.name ?? null;
  const erpCode    = matched?.code ?? autoSyn?.code ?? barcode?.code ?? null;
  const erpMasterP = matched?.masterPrice ?? barcode?.masterPrice ?? null;
  const erpSup     = matched?.supplier ?? barcode?.supplier ?? null;
  const erpExp     = matched?.expiryDate ?? barcode?.expiryDate ?? null;
  const erpSpec    = matched?.spec ?? barcode?.spec ?? null;
  const erpAmt = (erpMasterP != null && erpMasterP > 0 && ocrQty != null && ocrQty > 0)
    ? Math.round(erpMasterP * ocrQty) : null;

  switch (header) {
    case "품명":
      if (!erpName && !erpCode) return { text: dash, align: "left" };
      return {
        text: (
          <span className="inline-flex items-center gap-1 min-w-0">
            {erpCode && (
              <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 rounded px-1 py-px shrink-0">
                #{erpCode}
              </span>
            )}
            {erpName ? (
              <span className="font-semibold text-violet-800 truncate">{erpName}</span>
            ) : null}
          </span>
        ),
        align: "left",
      };
    case "공급처":
    case "공급사":
      return { text: erpSup ? <span className="text-violet-800 font-semibold">{erpSup}</span> : dash, align: "left" };
    case "수량":
      return { text: dash, align: "right" };  // ERP 자체 수량 없음
    case "단가":
      return {
        text: erpMasterP != null && erpMasterP > 0
          ? <span className="text-violet-800 font-mono font-bold">{fmt(erpMasterP)}</span>
          : dash,
        align: "right",
      };
    case "금액":
      return {
        text: erpAmt != null
          ? <span className="text-violet-800 font-mono font-bold">{fmt(erpAmt)}</span>
          : dash,
        align: "right",
      };
    case "유통기한":
    case "유효기한":
    case "유통기간":
      return { text: erpExp ? <span className="text-violet-800">{erpExp}</span> : dash, align: "right" };
    case "규격":
      return { text: erpSpec ? <span className="text-violet-700">{erpSpec}</span> : dash, align: "left" };
    default:
      return { text: dash, align: "right" };
  }
}

export const ErpMatchSubRow: React.FC<Props> = ({
  colList, dispHeaders, colWidthPx, matched, autoSyn, barcode, ocrQty, onCancel,
}) => {
  const anyErpInfo = (matched?.name || matched?.code || autoSyn?.name || barcode?.name);
  const nameIdx = dispHeaders.indexOf("품명");

  return (
    <tr className={`border-b border-violet-200/70 ${anyErpInfo ? "bg-violet-50/40" : "bg-slate-50/30"}`}>
      {/* 왼쪽 체크박스 컬럼 자리 · ERP 라벨 + 취소 버튼 */}
      <td className="w-14 px-1 py-1 text-center align-middle">
        <div className="flex items-center justify-center gap-0.5">
          <span className="text-[8px] font-black bg-violet-500 text-white rounded px-1 py-px">ERP</span>
          {anyErpInfo && onCancel && (
            <button type="button" onClick={onCancel}
              className="text-[9px] text-slate-400 hover:text-rose-500 cursor-pointer"
              title="ERP 매칭 취소"
            >✕</button>
          )}
        </div>
      </td>
      {colList.map(({ origIdx }) => {
        const h = dispHeaders[origIdx];
        const w = colWidthPx(origIdx);
        const { text, align } = getErpCellValue(h, matched, autoSyn, barcode, ocrQty);
        const isNameCol = origIdx === nameIdx;
        return (
          <td key={origIdx}
            style={w != null ? { width: w, overflow: "hidden" } : undefined}
            className={`px-1.5 py-1 text-[11px] ${align === "right" ? "text-right" : "text-left"} ${isNameCol ? "" : "truncate"}`}>
            {text}
          </td>
        );
      })}
    </tr>
  );
};
