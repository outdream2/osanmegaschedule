// src/components/OrderManagePage/OrderPdfPreview.tsx
// 2026-08-25 · 사용자 지시 · 발주서 PDF 저장 (A4 · 텍스트 리포트 형식)
// 2026-08-25 v2 · 사용자 지시 · 단일 "발주서" 제목 · 공간 낭비 없이 · 최신 트렌드
//   · 상단 통합 헤더 (제목 · 발주번호 · 발주일 · 희망입고일 · 발신/수신)
//   · 공급사 반복 없이 · 컴팩트 공급사 섹션 (얇은 divider · 이름·연락처 한줄)
//   · 요약 카드 (공급사·상품·수량·금액) · 최상단 노출
//   · 오프스크린 A4 (794px @ 96dpi) · html2canvas 캡처 대상

import React, { forwardRef } from "react";
import type { OrderModalState } from "./OrderModal";

interface OrderPdfPreviewProps {
  orderModal: OrderModalState;
}

const c = {
  ink:      "#111827",
  soft:     "#4b5563",
  muted:    "#94a3b8",
  line:     "#e2e8f0",
  divider:  "#cbd5e1",
  brand:    "#0A2E4A",
  accent:   "#0369a1",
  headBg:   "#f8fafc",
  supBg:    "#f1f5f9",
  amountFg: "#0f766e",
  qtyFg:    "#b91c1c",
};

const cell: React.CSSProperties = {
  borderBottom: `1px solid ${c.line}`,
  padding: "6px 8px",
  fontSize: 11.5,
  verticalAlign: "middle",
  color: c.ink,
};
const headCell: React.CSSProperties = {
  ...cell,
  background: c.headBg,
  fontWeight: 700,
  color: c.soft,
  fontSize: 11,
  letterSpacing: "0.02em",
  borderBottom: `1px solid ${c.divider}`,
};

export const OrderPdfPreview = forwardRef<HTMLDivElement, OrderPdfPreviewProps>(({ orderModal }, ref) => {
  const totalSuppliers = orderModal.suppliers.length;
  const totalItems     = orderModal.suppliers.reduce((n, s) => n + s.items.length, 0);
  const totalQty       = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0), 0), 0);
  const totalAmount    = orderModal.suppliers.reduce((n, s) => n + s.items.reduce((m, it) => m + (it.order_qty || 0) * (it.unit_price ?? 0), 0), 0);
  const orderNumber    = orderModal.suppliers[0]?.order_number ?? orderModal.orderNumber;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: -99999,
        top: 0,
        width: 794,
        background: "#ffffff",
        color: c.ink,
        fontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
        padding: 28,
      }}
      aria-hidden
    >
      {/* 통합 상단 헤더 · 단일 발주서 타이틀 · Linear/Attio 톤 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: c.brand, lineHeight: 1 }}>발주서</div>
          <div style={{ fontSize: 11, color: c.muted, fontFamily: "monospace" }}>PURCHASE ORDER</div>
          <div style={{ marginLeft: "auto", fontSize: 10.5, color: c.muted, fontFamily: "monospace", tabularNums: "tabular-nums" } as React.CSSProperties}>
            #{orderNumber}
          </div>
        </div>
        <div style={{ height: 2, marginTop: 8, background: `linear-gradient(90deg, ${c.brand} 0%, ${c.accent} 60%, ${c.brand} 100%)`, opacity: 0.9 }} />
      </div>

      {/* 통합 메타 · 발주일 · 희망 입고일 · 발신 · 요약 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {/* 좌 · 발주일자 + 희망 입고일 + 발신 */}
        <table style={{ flex: 1, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ ...headCell, width: "36%" }}>발주일자</td>
              <td style={{ ...cell, fontFamily: "monospace" }}>{orderModal.orderDate || "-"}</td>
            </tr>
            <tr>
              <td style={headCell}>희망 입고일</td>
              <td style={{ ...cell, fontFamily: "monospace" }}>{orderModal.desiredArrival || "-"}</td>
            </tr>
            <tr>
              <td style={headCell}>발신 (약국)</td>
              <td style={cell}>오산 메가타운 약국</td>
            </tr>
          </tbody>
        </table>
        {/* 우 · 요약 카드 (KPI 4개 · 큰 숫자 · Attio 톤) */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            { label: "공급사", value: totalSuppliers, unit: "개" },
            { label: "상품",   value: totalItems, unit: "종" },
            { label: "수량",   value: totalQty, unit: "개", fg: c.qtyFg },
            { label: "금액",   value: totalAmount, unit: "원", fg: c.amountFg, fmt: true },
          ].map((kpi, i) => (
            <div key={i} style={{ border: `1px solid ${c.line}`, borderRadius: 6, padding: "8px 10px", background: "#fff" }}>
              <div style={{ fontSize: 10, color: c.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{kpi.label}</div>
              <div style={{ marginTop: 2, fontSize: 15, fontWeight: 700, fontFamily: "monospace", color: kpi.fg ?? c.ink }}>
                {(kpi.value ?? 0).toLocaleString()}<span style={{ fontSize: 10, marginLeft: 2, color: c.muted, fontWeight: 500 }}>{kpi.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 공급사별 섹션 · 반복 헤더 없이 · 얇은 divider · 컴팩트 */}
      {orderModal.suppliers.map((s, sIdx) => {
        const supTotalQty = s.items.reduce((n, it) => n + (it.order_qty ?? 0), 0);
        const supTotalAmount = s.items.reduce((n, it) => n + (it.order_qty ?? 0) * (it.unit_price ?? 0), 0);
        return (
          <div key={`${s.supplier}-${sIdx}`} style={{ marginTop: sIdx === 0 ? 4 : 16 }}>
            {/* 공급사 라인 · 이름 · 발주번호 · 담당자/연락처 · 소계 */}
            <div style={{
              display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
              padding: "8px 10px", background: c.supBg, borderRadius: 6, border: `1px solid ${c.line}`,
              borderLeft: `3px solid ${c.brand}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: c.brand, letterSpacing: "-0.01em" }}>{s.supplier}</span>
              <span style={{ fontSize: 10.5, color: c.muted, fontFamily: "monospace" }}>#{s.order_number}</span>
              {(s.supplier_contact || s.supplier_phone || s.supplier_email) && (
                <span style={{ fontSize: 11, color: c.soft }}>
                  {[s.supplier_contact, s.supplier_phone, s.supplier_email].filter(Boolean).join(" · ")}
                </span>
              )}
              <span style={{ marginLeft: "auto", fontSize: 11, color: c.muted }}>
                {s.items.length}종 · <span style={{ color: c.qtyFg, fontWeight: 700, fontFamily: "monospace" }}>{supTotalQty.toLocaleString()}</span>개
                {supTotalAmount > 0 && (
                  <>
                    {" · "}
                    <span style={{ color: c.amountFg, fontWeight: 700, fontFamily: "monospace" }}>{supTotalAmount.toLocaleString()}원</span>
                  </>
                )}
              </span>
            </div>

            {/* 상품 표 */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 6 }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, width: "4%",  textAlign: "center" }}>#</th>
                  <th style={{ ...headCell, width: "16%" }}>상품코드</th>
                  <th style={{ ...headCell, width: "38%" }}>상품명</th>
                  <th style={{ ...headCell, width: "10%", textAlign: "right"  }}>수량</th>
                  <th style={{ ...headCell, width: "14%", textAlign: "right"  }}>단가</th>
                  <th style={{ ...headCell, width: "18%", textAlign: "right"  }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it, iIdx) => {
                  const amount = (it.order_qty ?? 0) * (it.unit_price ?? 0);
                  const rowMemo = it.memo && it.memo.trim();
                  return (
                    <React.Fragment key={it.order_request_id}>
                      <tr>
                        <td style={{ ...cell, textAlign: "center", color: c.muted, fontFamily: "monospace", fontSize: 10.5 }}>{iIdx + 1}</td>
                        <td style={{ ...cell, fontFamily: "monospace", color: c.soft, fontSize: 10.5 }}>{it.product_code}</td>
                        <td style={{ ...cell, fontWeight: 600 }}>{it.product_name}</td>
                        <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: c.qtyFg }}>{(it.order_qty ?? 0).toLocaleString()}</td>
                        <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", color: c.soft }}>
                          {it.unit_price != null ? `${it.unit_price.toLocaleString()}` : "-"}
                        </td>
                        <td style={{ ...cell, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: c.amountFg }}>
                          {amount > 0 ? `${amount.toLocaleString()}` : "-"}
                        </td>
                      </tr>
                      {/* 라인 메모 · 상품 아래 얇은 서브 라인 · 중복 표 제거 (통합) */}
                      {rowMemo && (
                        <tr>
                          <td colSpan={2}></td>
                          <td colSpan={4} style={{
                            borderBottom: `1px solid ${c.line}`,
                            padding: "0 8px 6px",
                            fontSize: 10.5,
                            color: c.soft,
                            fontStyle: "italic",
                          }}>
                            <span style={{ color: c.muted, marginRight: 6 }}>비고</span>{it.memo}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* 발주 메모 · 있으면 하단 · rose-소프트 */}
      {orderModal.memo && (
        <div style={{ marginTop: 14, padding: "8px 10px", background: c.headBg, border: `1px solid ${c.line}`, borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: c.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>발주 메모</div>
          <div style={{ fontSize: 11.5, color: c.ink, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{orderModal.memo}</div>
        </div>
      )}

      {/* 푸터 · 단일 · 발행일 + 매장 */}
      <div style={{ marginTop: 18, paddingTop: 8, borderTop: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", fontSize: 10, color: c.muted, letterSpacing: "0.02em" }}>
        <span>Generated {new Date().toISOString().slice(0, 10)}</span>
        <span>오산 메가타운 약국</span>
      </div>
    </div>
  );
});

OrderPdfPreview.displayName = "OrderPdfPreview";

export default OrderPdfPreview;
