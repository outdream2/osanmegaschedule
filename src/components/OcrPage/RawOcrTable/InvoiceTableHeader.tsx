import React from "react";

interface InvoiceTableHeaderProps {
  dispHeaders: string[];
  showRawDetail: boolean;
  RAW_ESSENTIAL_COLS: string[];
  NUM_COLS: Set<string>;
  pageImages?: string[];
  effectiveInvColWidth: number;
  invColResizing: boolean;
  INV_COL_DEFAULT: number;
  containerWidth: number;
  numCellMinW: number;
  expCellMinW: number;
  colWidths: Record<number, number>;
  resizeRef: React.MutableRefObject<{ ci: number; startX: number; startW: number } | null>;
  onInvColResizeStart: (e: React.MouseEvent) => void;
  setInvoiceColWidth: (w: number) => void;
}

const COL_WEIGHTS: Record<string, number> = {
  품명: 4.5,
  금액: 2.2, 유통기한: 2.0, 유효기한: 2.0, 유통기간: 2.0,
  단가: 1.6, 규격: 1.5, 세액: 1.4, 배치번호: 1.4, "Batch.No": 1.4,
  수량: 1.0, 비고: 1.0, 단위: 1.0,
  번호: 0.6, 순번: 0.6,
};

const TEXT_COL_MIN: Record<string, number> = {
  품명: 160, 공급처: 90, 규격: 60, 비고: 50, 단위: 40, 번호: 40, 순번: 40,
  배치번호: 80, "Batch.No": 80, 거래일: 82, 일자: 82, 날짜: 82,
};

function buildColList(dispHeaders: string[], showRawDetail: boolean, RAW_ESSENTIAL_COLS: string[]) {
  const baseOrder = dispHeaders.map((_, i) => i);
  if (showRawDetail) return baseOrder.map((origIdx, orderIdx) => ({ origIdx, orderIdx }));
  const list: { origIdx: number; orderIdx: number }[] = [];
  for (const name of RAW_ESSENTIAL_COLS) {
    let idx = dispHeaders.indexOf(name);
    if (idx < 0 && name === "유통기한") {
      for (const a of ["유효기한", "유통기간"]) { idx = dispHeaders.indexOf(a); if (idx >= 0) break; }
    }
    if (idx >= 0) list.push({ origIdx: idx, orderIdx: baseOrder.indexOf(idx) });
  }
  return list;
}

export const InvoiceTableHeader: React.FC<InvoiceTableHeaderProps> = ({
  dispHeaders, showRawDetail, RAW_ESSENTIAL_COLS, NUM_COLS,
  pageImages, effectiveInvColWidth, invColResizing, INV_COL_DEFAULT,
  containerWidth, numCellMinW, expCellMinW, colWidths, resizeRef,
  onInvColResizeStart, setInvoiceColWidth,
}) => {
  const colList = buildColList(dispHeaders, showRawDetail, RAW_ESSENTIAL_COLS);
  const fixedUsed = (pageImages?.length ? effectiveInvColWidth : 0) + 56;
  const totalAvail = Math.max((containerWidth || 700) - fixedUsed, 60);
  const userFixedTotal = colList.reduce((sum, { origIdx }) => {
    const w = colWidths[origIdx];
    return w != null ? sum + w : sum;
  }, 0);
  const autoColList = colList.filter(({ origIdx }) => colWidths[origIdx] == null);
  const autoAvail = Math.max(totalAvail - userFixedTotal, 0);
  const totalWeight = autoColList.reduce((sum, { origIdx }) => {
    const h = dispHeaders[origIdx];
    return sum + (COL_WEIGHTS[h] ?? 1.0);
  }, 0);

  return (
    <thead>
      <tr className="bg-amber-50 border-b-2 border-amber-200">
        {pageImages?.length ? (
          <th
            className="p-0 text-center bg-gray-50 border-r border-line text-[10px] font-bold text-gray-500 whitespace-nowrap select-none"
            style={{ width: effectiveInvColWidth, minWidth: effectiveInvColWidth, maxWidth: effectiveInvColWidth, position: "relative", boxSizing: "border-box" }}
          >
            <div style={{ padding: "8px 4px", textAlign: "center" }}>
              <span>거래명세서</span>
            </div>
            <div
              role="separator"
              aria-label="이미지 폭 조절"
              onMouseDown={onInvColResizeStart}
              onDoubleClick={() => setInvoiceColWidth(INV_COL_DEFAULT)}
              onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
              draggable={false}
              title="드래그하여 이미지 폭 조절 · 더블클릭 초기화"
              style={{
                position: "absolute",
                top: 0, right: 0, bottom: 0, width: 4,
                cursor: "col-resize", zIndex: 50,
                backgroundColor: invColResizing ? "#10b981" : "transparent",
                transition: "background-color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#10b981"; }}
              onMouseLeave={(e) => { if (!invColResizing) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
            />
          </th>
        ) : null}
        <th className="px-1 py-2 text-center" style={{ width: 56 }} title="선택 · 재추출">
          <span className="text-[10px] font-bold text-amber-700">선택 · 🔄</span>
        </th>
        {colList.map(({ origIdx }) => {
          const h = dispHeaders[origIdx];
          const ci = origIdx;
          const explicitW = colWidths[ci];
          const weight = COL_WEIGHTS[h] ?? 1.0;
          const computedW = totalWeight > 0
            ? Math.round((weight / totalWeight) * autoAvail)
            : Math.round(autoAvail / Math.max(autoColList.length, 1));
          const isExpCol = h === "유통기한" || h === "유효기한" || h === "유통기간";
          const isCompactCell = NUM_COLS.has(h) || isExpCol;
          const minGuard = explicitW == null
            ? (isExpCol ? expCellMinW : isCompactCell ? numCellMinW : (TEXT_COL_MIN[h] ?? 40))
            : 0;
          const colW = explicitW ?? Math.max(computedW, minGuard);
          return (
            <th key={origIdx}
              style={{ width: colW, position: 'relative', overflow: 'hidden' }}
              className={`px-1.5 py-1.5 font-bold text-amber-900 select-none text-[11px] ${NUM_COLS.has(h) ? "text-right" : "text-left"} truncate`}>
              {`OCR ${h}`}
              <div
                style={{ position: 'absolute', right: 0, top: 4, bottom: 4, width: 4, cursor: 'col-resize', zIndex: 2 }}
                className="bg-amber-300/40 hover:bg-amber-600/80 active:bg-amber-700 transition-colors rounded-sm"
                title="드래그하여 컬럼 폭 조절"
                draggable={false}
                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                onMouseDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  const th = (e.currentTarget as HTMLElement).parentElement as HTMLTableCellElement;
                  resizeRef.current = { ci, startX: e.clientX, startW: th.offsetWidth };
                }}
              />
            </th>
          );
        })}
      </tr>
    </thead>
  );
};

