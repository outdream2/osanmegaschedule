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
  pageSupplier?: string;    // ERP 매칭에서 supplier 못 얻을 때 페이지 공급사 폴백 (2026-07-28)
  onCancel?: () => void;
}

/** parent 1차 헤더명 → ERP 값 문자열 매핑 */
function getErpCellValue(
  header: string,
  matched: CandidateInfo | null,
  autoSyn: { code: string; name: string } | undefined,
  barcode: BarcodeProduct | null,
  ocrQty: number | null,
  pageSupplier?: string,
): { text: React.ReactNode; align: "left" | "right" | "center" } {
  const dash = <span className="text-slate-300">—</span>;
  const erpName    = matched?.name ?? autoSyn?.name ?? barcode?.name ?? null;
  const erpCode    = matched?.code ?? autoSyn?.code ?? barcode?.code ?? null;
  const erpMasterP = matched?.masterPrice ?? barcode?.masterPrice ?? null;
  const erpSaleP   = matched?.salePrice ?? barcode?.salePrice ?? null;
  // 2026-07-28 · 사용자 요청 "판매가와 단가값 계산해서" · 이익률 = (판매가 - 사입단가) / 판매가 × 100 (%)
  const erpProfit  = (erpSaleP != null && erpSaleP > 0 && erpMasterP != null && erpMasterP > 0)
    ? ((erpSaleP - erpMasterP) / erpSaleP) * 100
    : null;
  // 2026-07-28 · 공급사 · ERP 매칭 결과 없으면 페이지 공급사(=OCR/사용자 확인) 로 폴백
  const erpSup     = matched?.supplier ?? barcode?.supplier ?? pageSupplier ?? null;
  const erpExp     = matched?.expiryDate ?? barcode?.expiryDate ?? null;
  const erpSpec    = matched?.spec ?? barcode?.spec ?? null;
  const erpAmt = (erpMasterP != null && erpMasterP > 0 && ocrQty != null && ocrQty > 0)
    ? Math.round(erpMasterP * ocrQty) : null;

  switch (header) {
    case "품명":
      // 2026-07-28 · 사용자 요청 · 상품코드 → 줄바꿈 → 상품명 (두 줄)
      if (!erpName && !erpCode) return { text: dash, align: "left" };
      return {
        text: (
          <span className="inline-flex flex-col leading-tight gap-0.5 items-start">
            {erpCode && (
              <span className="font-mono text-[10px] font-bold text-slate-500">#{erpCode}</span>
            )}
            {erpName && (
              <span className="font-semibold text-violet-800 text-[12px] leading-snug break-words">{erpName}</span>
            )}
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
      // 2026-07-28 · 사용자 요청 · "ERP 단가" 라벨 명시 (사입가/OCR단가와 구분)
      return {
        text: erpMasterP != null && erpMasterP > 0
          ? <span className="inline-flex flex-col leading-tight items-center">
              <span className="text-[9px] text-violet-500 font-bold">ERP단가</span>
              <span className="text-violet-800 font-mono font-bold">{fmt(erpMasterP)}</span>
            </span>
          : dash,
        align: "center" as const,
      };
    case "금액":
      // 2026-07-28 · 사용자 요청 "ERP 에서 가져온 값만" · ERP에는 금액 필드 없음 · 대시
      return { text: dash, align: "right" };
    case "유통기한":
    case "유효기한":
    case "유통기간":
      // 2026-07-28 · 사용자 요청 · 유통기한 자리에 이익률 (소수점 1자리 · 버림)
      return {
        text: erpProfit != null && Number.isFinite(erpProfit)
          ? <span className="inline-flex flex-col leading-tight items-center">
              <span className="text-[9px] text-emerald-500 font-bold">이익률</span>
              <span className={`font-bold ${erpProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {Math.trunc(erpProfit)}%
              </span>
            </span>
          : dash,
        align: "center" as const,
      };
    case "규격":
      return { text: erpSpec ? <span className="text-violet-700">{erpSpec}</span> : dash, align: "left" };
    // 2026-07-28 · 사용자 요청 · 단가와 금액 사이 VAT 자리 아래에 · ERP 판매가
    case "VAT":
      return {
        text: erpSaleP != null && erpSaleP > 0
          ? <span className="inline-flex flex-col leading-tight items-center">
              <span className="text-[9px] text-sky-500 font-bold">판매가</span>
              <span className="text-sky-700 font-mono font-bold">{fmt(erpSaleP)}</span>
            </span>
          : dash,
        align: "center" as const,
      };
    default:
      return { text: dash, align: "right" };
  }
}

export const ErpMatchSubRow: React.FC<Props> = ({
  colList, dispHeaders, colWidthPx, matched, autoSyn, barcode, ocrQty, pageSupplier, onCancel,
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
        const { text, align } = getErpCellValue(h, matched, autoSyn, barcode, ocrQty, pageSupplier);
        const isNameCol = origIdx === nameIdx;
        return (
          <td key={origIdx}
            style={w != null ? { width: w, overflow: "hidden" } : undefined}
            className={`px-1.5 py-1 text-[11px] ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${isNameCol ? "" : "truncate"}`}>
            {text}
          </td>
        );
      })}
    </tr>
  );
};
