// src/components/OrderManagePage/ReturnPdfPreview.tsx
// 2026-08-25 · 사용자 지시 · 반품요청서 PDF (A4 · 텍스트 리포트 · 목업 톤)
//   · 오프스크린 A4 (794px @ 96dpi) · html2canvas 캡처 대상
//   · 발주서 PDF 와 동일 패턴 · Pretendard 폰트 · 표 기반 · 로즈 톤 (반품 시그니처)

import React, { forwardRef } from "react";
import type { ReturnLineItem, ReturnReasonKey } from "./ReturnListPanel.types";
// 2026-09-02 · fix · 사업장 이름 하드코딩 제거 · useCompanyInfo (설정 · 회사·브랜드)
import { useCompanyInfo } from "../../hooks/useCompanyInfo";

interface ReturnPdfPreviewProps {
  returnNumber: string;
  requestDate: string;
  expectedDate: string;
  reason: ReturnReasonKey;
  supplierName: string;
  supplierContact?: string | null;
  supplierPhone?:   string | null;
  supplierEmail?:   string | null;
  lines: ReturnLineItem[];
  memo: string;
}

const cell: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "6px 8px",
  fontSize: 12,
  verticalAlign: "middle",
};
const headCell: React.CSSProperties = { ...cell, background: "#f1f5f9", fontWeight: 700, color: "#1e293b" };

export const ReturnPdfPreview = forwardRef<HTMLDivElement, ReturnPdfPreviewProps>((props, ref) => {
  // 2026-09-02 · fix · 회사 이름 · 설정 · 회사·브랜드 (약국이름)
  const { info: company } = useCompanyInfo();
  const companyName = company.name || "약국";
  const { returnNumber, requestDate, expectedDate, reason, supplierName, supplierContact, supplierPhone, supplierEmail, lines, memo } = props;
  const totalQty    = lines.reduce((s, r) => s + (r.return_qty || 0), 0);
  const totalAmount = lines.reduce((s, r) => s + (r.return_qty || 0) * (r.purchase_price || 0), 0);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: -99999,
        top: 0,
        width: 794,
        background: "#ffffff",
        color: "#111827",
        fontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
        padding: 24,
      }}
      aria-hidden
    >
      {/* 헤더 */}
      <div style={{ borderBottom: "3px solid #b91c1c", paddingBottom: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#7f1d1d" }}>
          반 품 요 청 서
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginTop: 4, fontFamily: "monospace" }}>
          #{returnNumber}
        </div>
      </div>

      {/* 기본 정보 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ ...headCell, width: "18%" }}>반품 요청일</td>
            <td style={{ ...cell, width: "32%" }}>{requestDate || "-"}</td>
            <td style={{ ...headCell, width: "18%" }}>반품 예정일</td>
            <td style={{ ...cell, width: "32%" }}>{expectedDate || "-"}</td>
          </tr>
          <tr>
            <td style={headCell}>수신 (공급사)</td>
            <td style={{ ...cell, fontWeight: 700 }}>{supplierName || "-"}</td>
            <td style={headCell}>반품 사유</td>
            <td style={{ ...cell, fontWeight: 600, color: "#b91c1c" }}>{reason}</td>
          </tr>
          {(supplierContact || supplierPhone || supplierEmail) && (
            <tr>
              <td style={headCell}>공급사 연락처</td>
              <td style={cell} colSpan={3}>
                {[supplierContact, supplierPhone, supplierEmail].filter(Boolean).join(" · ") || "-"}
              </td>
            </tr>
          )}
          <tr>
            <td style={headCell}>발신 (약국)</td>
            <td style={cell} colSpan={3}>{companyName}</td>
          </tr>
        </tbody>
      </table>

      {/* 상품 리스트 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={{ ...headCell, width: "5%",  textAlign: "center" }}>#</th>
            <th style={{ ...headCell, width: "18%" }}>상품코드</th>
            <th style={{ ...headCell, width: "32%" }}>상품명</th>
            <th style={{ ...headCell, width: "10%", textAlign: "right"  }}>현재고</th>
            <th style={{ ...headCell, width: "10%", textAlign: "right"  }}>반품수량</th>
            <th style={{ ...headCell, width: "12%", textAlign: "right"  }}>매입가</th>
            <th style={{ ...headCell, width: "13%", textAlign: "right"  }}>반품금액</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((r, iIdx) => {
            const amount = (r.return_qty || 0) * (r.purchase_price || 0);
            return (
              <tr key={`${r.product_code}-${iIdx}`}>
                <td style={{ ...cell, textAlign: "center", color: "#64748b" }}>{iIdx + 1}</td>
                <td style={{ ...cell, fontFamily: "monospace", color: "#475569", fontSize: 11 }}>{r.product_code}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{r.product_name}</td>
                <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", color: "#475569" }}>{r.current_stock.toLocaleString()}</td>
                <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#b91c1c" }}>{(r.return_qty || 0).toLocaleString()}</td>
                <td style={{ ...cell, textAlign: "right", fontFamily: "monospace" }}>{r.purchase_price ? `${r.purchase_price.toLocaleString()}원` : "-"}</td>
                <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#9f1239" }}>
                  {amount > 0 ? `${amount.toLocaleString()}원` : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...headCell, textAlign: "right" }} colSpan={4}>합계</td>
            <td style={{ ...headCell, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{totalQty.toLocaleString()}</td>
            <td style={{ ...headCell, textAlign: "right", color: "#64748b" }}>{lines.length}종</td>
            <td style={{ ...headCell, textAlign: "right", fontFamily: "monospace", color: "#9f1239" }}>
              {totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : "-"}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* 라인 메모 */}
      {lines.some(r => r.memo && r.memo.trim()) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>상품 비고</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {lines.filter(r => r.memo && r.memo.trim()).map((r, i) => (
                <tr key={`memo-${r.product_code}-${i}`}>
                  <td style={{ ...cell, width: "35%", fontWeight: 600 }}>{r.product_name}</td>
                  <td style={cell}>{r.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 특이사항 */}
      {memo && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9f1239", marginBottom: 4 }}>특이사항 · 요청 메모</div>
          <div style={{ fontSize: 12, color: "#111827", whiteSpace: "pre-wrap" }}>{memo}</div>
        </div>
      )}

      {/* 푸터 */}
      <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b" }}>
        <span>발행일: {new Date().toISOString().slice(0, 10)}</span>
        <span>{companyName}</span>
      </div>
    </div>
  );
});

ReturnPdfPreview.displayName = "ReturnPdfPreview";

export default ReturnPdfPreview;
