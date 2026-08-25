// src/components/OrderManagePage/OrderPdfPreview.tsx
// 2026-08-25 · 사용자 지시 · 발주서 PDF 저장 (A4 · 텍스트 리포트 형식)
//   · 오프스크린 A4 렌더 · html2canvas 캡처 대상 · 공급사별 페이지
//   · 텍스트 기반 (배경/그라디언트 최소) · 프린트 프렌들리
//   · 화면 노출 없음 (left: -9999) · ref 로 접근

import React, { forwardRef } from "react";
import type { OrderModalState } from "./OrderModal";

interface OrderPdfPreviewProps {
  orderModal: OrderModalState;
}

const cell: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  padding: "6px 8px",
  fontSize: 12,
  verticalAlign: "middle",
};
const headCell: React.CSSProperties = {
  ...cell,
  background: "#f1f5f9",
  fontWeight: 700,
  color: "#1e293b",
};

export const OrderPdfPreview = forwardRef<HTMLDivElement, OrderPdfPreviewProps>(({ orderModal }, ref) => {
  return (
    <div
      ref={ref}
      // 오프스크린 · A4 폭 794px (96 DPI · 210mm)
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
      {orderModal.suppliers.map((s, sIdx) => {
        const totalQty = s.items.reduce((n, it) => n + (it.order_qty ?? 0), 0);
        const totalAmount = s.items.reduce((n, it) => n + (it.order_qty ?? 0) * (it.unit_price ?? 0), 0);
        const totalKinds = s.items.length;
        return (
          <div
            key={`${s.supplier}-${sIdx}`}
            style={{
              // 다중 공급사 · 각 공급사마다 새 페이지 시도 (html2canvas 로 캡처 시 · jsPDF 에서 페이지 분할)
              pageBreakAfter: sIdx < orderModal.suppliers.length - 1 ? "always" : "auto",
              breakAfter: sIdx < orderModal.suppliers.length - 1 ? "page" : "auto",
              marginBottom: sIdx < orderModal.suppliers.length - 1 ? 32 : 0,
            }}
          >
            {/* 헤더 */}
            <div style={{ borderBottom: "3px solid #0A2E4A", paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "#0A2E4A" }}>
                발 주 서
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4, fontFamily: "monospace" }}>
                #{s.order_number}
              </div>
            </div>

            {/* 기본 정보 · 2x2 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <tbody>
                <tr>
                  <td style={{ ...headCell, width: "18%" }}>발주일자</td>
                  <td style={{ ...cell, width: "32%" }}>{orderModal.orderDate || "-"}</td>
                  <td style={{ ...headCell, width: "18%" }}>희망 입고일</td>
                  <td style={{ ...cell, width: "32%" }}>{orderModal.desiredArrival || "-"}</td>
                </tr>
                <tr>
                  <td style={headCell}>수신 (공급사)</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{s.supplier}</td>
                  <td style={headCell}>발신 (약국)</td>
                  <td style={cell}>오산 메가타운 약국</td>
                </tr>
                {(s.supplier_contact || s.supplier_phone || s.supplier_email) && (
                  <tr>
                    <td style={headCell}>공급사 연락처</td>
                    <td style={cell} colSpan={3}>
                      {[s.supplier_contact, s.supplier_phone, s.supplier_email].filter(Boolean).join(" · ") || "-"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* 상품 리스트 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, width: "5%", textAlign: "center" }}>#</th>
                  <th style={{ ...headCell, width: "18%" }}>상품코드</th>
                  <th style={{ ...headCell, width: "35%" }}>상품명</th>
                  <th style={{ ...headCell, width: "10%", textAlign: "right" }}>수량</th>
                  <th style={{ ...headCell, width: "14%", textAlign: "right" }}>단가</th>
                  <th style={{ ...headCell, width: "18%", textAlign: "right" }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, iIdx) => {
                  const amount = (it.order_qty ?? 0) * (it.unit_price ?? 0);
                  return (
                    <tr key={it.order_request_id}>
                      <td style={{ ...cell, textAlign: "center", color: "#64748b" }}>{iIdx + 1}</td>
                      <td style={{ ...cell, fontFamily: "monospace", color: "#475569", fontSize: 11 }}>{it.product_code}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{it.product_name}</td>
                      <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#b91c1c" }}>{(it.order_qty ?? 0).toLocaleString()}</td>
                      <td style={{ ...cell, textAlign: "right", fontFamily: "monospace" }}>
                        {it.unit_price != null ? `${it.unit_price.toLocaleString()}원` : "-"}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#0f766e" }}>
                        {amount > 0 ? `${amount.toLocaleString()}원` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...headCell, textAlign: "right" }} colSpan={3}>합계</td>
                  <td style={{ ...headCell, textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>{totalQty.toLocaleString()}</td>
                  <td style={{ ...headCell, textAlign: "right", color: "#64748b" }}>{totalKinds}종</td>
                  <td style={{ ...headCell, textAlign: "right", fontFamily: "monospace", color: "#0f766e" }}>
                    {totalAmount > 0 ? `${totalAmount.toLocaleString()}원` : "-"}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* 아이템별 메모가 있으면 별도 섹션 */}
            {s.items.some(it => it.memo && it.memo.trim()) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>비고</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {s.items.filter(it => it.memo && it.memo.trim()).map((it, i) => (
                      <tr key={`memo-${it.order_request_id}-${i}`}>
                        <td style={{ ...cell, width: "35%", fontWeight: 600 }}>{it.product_name}</td>
                        <td style={{ ...cell }}>{it.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 발주 메모 */}
            {orderModal.memo && (
              <div style={{ marginBottom: 12, padding: 10, background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 4 }}>발주 메모</div>
                <div style={{ fontSize: 12, color: "#111827", whiteSpace: "pre-wrap" }}>{orderModal.memo}</div>
              </div>
            )}

            {/* 푸터 */}
            <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b" }}>
              <span>발행일: {new Date().toISOString().slice(0, 10)}</span>
              <span>오산 메가타운 약국</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

OrderPdfPreview.displayName = "OrderPdfPreview";

export default OrderPdfPreview;
