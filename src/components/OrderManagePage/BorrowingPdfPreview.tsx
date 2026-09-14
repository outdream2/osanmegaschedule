// src/components/OrderManagePage/BorrowingPdfPreview.tsx
// 2026-09-14 · #101 · 차용계약 PDF 프리뷰 · 오프스크린 렌더용
//   · 근로계약서 PDF 패턴 (ContractPreview) 참고 · html2canvas + jsPDF
//   · A4 세로 · 공급사↔약국 상품 차용/대여 계약서

import React from "react";
import type { BorrowingRow } from "../../lib/borrowingsApi";

interface Props {
  row: BorrowingRow;
  selfLabel: string;
  pharmacyLabel?: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
}

const fmtWon = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  return `₩${v.toLocaleString()}`;
};

const fmtDate = (s: string | null | undefined): string => {
  if (!s) return "";
  return String(s).slice(0, 10).replace(/-/g, ". ") + ".";
};

const todayKst = (): string => {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}. ${m}. ${day}.`;
};

export const BorrowingPdfPreview = React.forwardRef<HTMLDivElement, Props>(({
  row,
  selfLabel,
  pharmacyLabel = "메가타운 약국",
  pharmacyAddress = "오산시",
  pharmacyPhone = "",
}, ref) => {
  const supplier = row.supplier ?? "-";
  const isLend = row.direction === "lend";
  const lenderName = isLend ? supplier : (selfLabel || pharmacyLabel);
  const borrowerName = isLend ? (selfLabel || pharmacyLabel) : supplier;
  const totalAmount = (row.qty ?? 0) * (row.unit_price ?? 0);

  return (
    <div
      ref={ref}
      style={{
        width: "794px",
        minHeight: "1123px",
        padding: "40px 50px",
        backgroundColor: "#ffffff",
        color: "#111",
        fontFamily: '"Pretendard", "Noto Sans KR", -apple-system, sans-serif',
        fontSize: "14px",
        lineHeight: 1.6,
      }}
    >
      {/* 제목 */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>
          상품 차용 계약서
        </h1>
        <div style={{ fontSize: "12px", color: "#666", marginTop: "6px" }}>
          {row.contract_no ? `계약번호 · ${row.contract_no}` : `계약일 · ${fmtDate(row.created_at) || todayKst()}`}
        </div>
      </div>

      {/* 당사자 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", fontSize: "14px" }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", width: "20%", fontWeight: 700 }}>대여자 (甲)</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", width: "30%" }}>{lenderName}</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", width: "20%", fontWeight: 700 }}>차용자 (乙)</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", width: "30%" }}>{borrowerName}</td>
          </tr>
        </tbody>
      </table>

      {/* 상품 내역 */}
      <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px", borderLeft: "4px solid #0A2E4A", paddingLeft: "10px" }}>
        1. 차용 상품 내역
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#0A2E4A", color: "#fff" }}>
            <th style={{ border: "1px solid #0A2E4A", padding: "10px 8px", textAlign: "left", width: "40%" }}>상품명</th>
            <th style={{ border: "1px solid #0A2E4A", padding: "10px 8px", textAlign: "left", width: "18%" }}>상품코드</th>
            <th style={{ border: "1px solid #0A2E4A", padding: "10px 8px", textAlign: "right", width: "12%" }}>수량</th>
            <th style={{ border: "1px solid #0A2E4A", padding: "10px 8px", textAlign: "right", width: "15%" }}>단가</th>
            <th style={{ border: "1px solid #0A2E4A", padding: "10px 8px", textAlign: "right", width: "15%" }}>금액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #333", padding: "10px 8px" }}>{row.product_name ?? "-"}</td>
            <td style={{ border: "1px solid #333", padding: "10px 8px", fontFamily: "monospace" }}>{row.product_code ?? "-"}</td>
            <td style={{ border: "1px solid #333", padding: "10px 8px", textAlign: "right" }}>{(row.qty ?? 0).toLocaleString()}</td>
            <td style={{ border: "1px solid #333", padding: "10px 8px", textAlign: "right" }}>{fmtWon(row.unit_price)}</td>
            <td style={{ border: "1px solid #333", padding: "10px 8px", textAlign: "right", fontWeight: 700 }}>{fmtWon(totalAmount)}</td>
          </tr>
          <tr>
            <td colSpan={4} style={{ border: "1px solid #333", padding: "10px 8px", textAlign: "right", background: "#f5f5f5", fontWeight: 700 }}>
              합계
            </td>
            <td style={{ border: "1px solid #333", padding: "10px 8px", textAlign: "right", background: "#f5f5f5", fontWeight: 800, color: "#0A2E4A" }}>
              {fmtWon(totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 반환·정산 조건 */}
      <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px", borderLeft: "4px solid #0A2E4A", paddingLeft: "10px" }}>
        2. 반환·정산 조건
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", fontSize: "14px" }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", width: "25%", fontWeight: 700 }}>계약 체결일</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", width: "25%" }}>{fmtDate(row.created_at) || todayKst()}</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", width: "25%", fontWeight: 700 }}>반환 예정일</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", width: "25%" }}>{fmtDate(row.due_date) || "협의"}</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", fontWeight: 700 }}>상태</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px" }}>
              {row.status === "settled" ? "정산완료" : row.status === "cancelled" ? "취소" : "미해결"}
            </td>
            <td style={{ border: "1px solid #333", padding: "10px 14px", background: "#f5f5f5", fontWeight: 700 }}>정산일</td>
            <td style={{ border: "1px solid #333", padding: "10px 14px" }}>{fmtDate(row.settled_at) || "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* 특약사항 */}
      {(row.note || row.return_note) && (
        <>
          <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px", borderLeft: "4px solid #0A2E4A", paddingLeft: "10px" }}>
            3. 특약사항
          </div>
          <div style={{ border: "1px solid #333", padding: "14px", marginBottom: "24px", minHeight: "80px", fontSize: "13px", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {row.note && <div>· 계약 특약: {row.note}</div>}
            {row.return_note && <div>· 반환 특약: {row.return_note}</div>}
          </div>
        </>
      )}

      {/* 일반 조항 */}
      <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "10px", borderLeft: "4px solid #0A2E4A", paddingLeft: "10px" }}>
        {row.note || row.return_note ? "4" : "3"}. 일반 조항
      </div>
      <ol style={{ paddingLeft: "24px", marginBottom: "40px", fontSize: "13px", lineHeight: 1.8 }}>
        <li>차용자는 위 상품을 선량한 관리자의 주의로 보관·사용한다.</li>
        <li>차용자는 반환 예정일까지 대여자에게 상품을 반환하거나 정산한다.</li>
        <li>반환 지연 시 · 양 당사자 협의로 정산금액을 조정할 수 있다.</li>
        <li>본 계약에 명시되지 않은 사항은 상관례 · 상호 신의 성실에 따라 처리한다.</li>
      </ol>

      {/* 서명란 */}
      <div style={{ textAlign: "center", marginBottom: "30px", fontSize: "15px", fontWeight: 700 }}>
        위 계약을 성실히 이행할 것을 약정하며 서명·날인합니다.
      </div>
      <div style={{ textAlign: "center", marginBottom: "40px", fontSize: "14px" }}>
        {todayKst()}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #333", padding: "20px 14px", background: "#f5f5f5", width: "15%", fontWeight: 700, verticalAlign: "top" }}>대여자 (甲)</td>
            <td style={{ border: "1px solid #333", padding: "20px 14px", width: "35%", verticalAlign: "top" }}>
              <div style={{ marginBottom: "8px" }}>회사명: <strong>{lenderName}</strong></div>
              <div style={{ marginBottom: "30px" }}>주소: {isLend ? "" : pharmacyAddress}</div>
              <div style={{ textAlign: "right" }}>
                (서명 또는 날인)&nbsp;<span style={{ display: "inline-block", width: "60px", height: "60px", border: "1px dashed #999", verticalAlign: "middle" }}></span>
              </div>
            </td>
            <td style={{ border: "1px solid #333", padding: "20px 14px", background: "#f5f5f5", width: "15%", fontWeight: 700, verticalAlign: "top" }}>차용자 (乙)</td>
            <td style={{ border: "1px solid #333", padding: "20px 14px", width: "35%", verticalAlign: "top" }}>
              <div style={{ marginBottom: "8px" }}>회사명: <strong>{borrowerName}</strong></div>
              <div style={{ marginBottom: "30px" }}>주소: {isLend ? pharmacyAddress : ""}</div>
              <div style={{ textAlign: "right" }}>
                (서명 또는 날인)&nbsp;<span style={{ display: "inline-block", width: "60px", height: "60px", border: "1px dashed #999", verticalAlign: "middle" }}></span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {pharmacyPhone && (
        <div style={{ marginTop: "40px", fontSize: "11px", color: "#888", textAlign: "center" }}>
          문의 · {pharmacyLabel} {pharmacyPhone}
        </div>
      )}
    </div>
  );
});

BorrowingPdfPreview.displayName = "BorrowingPdfPreview";

export default BorrowingPdfPreview;
