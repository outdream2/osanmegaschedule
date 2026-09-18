// src/components/LeavePage/LeaveRequestPdfPreview.tsx
// 연차신청서 PDF 프리뷰 · A4 · html2canvas-pro + jsPDF 캡처 대상
// 패턴 참조 · OrderPdfPreview.tsx · ContractPreview.tsx

import React, { forwardRef } from "react";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";

export interface LeaveRequestPdfData {
  /** 직원 이름 */
  employeeName: string;
  /** 사번 */
  employeeNumber?: string | null;
  /** 부서/직위 */
  position?: string | null;
  /** 입사일 */
  hireDate?: string | null;
  /** 연락처 */
  phone?: string | null;
  /** 휴가 종류 */
  leaveType: string;
  /** 시작일 YYYY-MM-DD */
  startDate: string;
  /** 종료일 YYYY-MM-DD */
  endDate: string;
  /** 사용 일수 */
  days: number;
  /** 사유 */
  reason?: string;
  /** 신청일 YYYY-MM-DD */
  applyDate: string;
}

interface LeaveRequestPdfPreviewProps {
  data: LeaveRequestPdfData;
  /**
   * "offscreen" (기본) · html2canvas 캡처 전용 · position absolute left:-99999
   * "visible"           · 화면 표시용 (미리보기 카드 안 축소 표시 등)
   */
  variant?: "offscreen" | "visible";
}

const c = {
  ink:      "#111827",
  soft:     "#4b5563",
  muted:    "#9ca3af",
  line:     "#e5e7eb",
  divider:  "#d1d5db",
  brand:    "#0A2E4A",
  accent:   "#1e40af",
  headBg:   "#f8fafc",
  sealBg:   "#f1f5f9",
};

/** YYYY-MM-DD → YYYY년 MM월 DD일 */
function fmtKor(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

const cellStyle: React.CSSProperties = {
  border: `1px solid ${c.divider}`,
  padding: "8px 12px",
  fontSize: 12,
  color: c.ink,
  verticalAlign: "middle",
};

const labelStyle: React.CSSProperties = {
  ...cellStyle,
  background: c.headBg,
  fontWeight: 700,
  color: c.soft,
  whiteSpace: "nowrap",
  width: "22%",
  fontSize: 11.5,
};

/** 결재란 셀 */
const sealHeader: React.CSSProperties = {
  border: `1px solid ${c.divider}`,
  padding: "6px 8px",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 700,
  color: c.soft,
  background: c.headBg,
};

const sealBody: React.CSSProperties = {
  border: `1px solid ${c.divider}`,
  height: 64,
  padding: "6px 8px",
  textAlign: "center",
  verticalAlign: "middle",
  background: "#fff",
  fontSize: 10,
  color: c.muted,
};

export const LeaveRequestPdfPreview = forwardRef<HTMLDivElement, LeaveRequestPdfPreviewProps>(
  ({ data, variant = "offscreen" }, ref) => {
    const { info: company } = useCompanyInfo();
    const companyName = company?.name || "오산 메가타운 약국";

    const startParts = data.startDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const applyParts = data.applyDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    const offscreenStyle: React.CSSProperties = variant === "offscreen"
      ? { position: "absolute", left: -99999, top: 0 }
      : {};

    return (
      <div
        ref={ref}
        style={{
          ...offscreenStyle,
          width: 794,
          minHeight: 1123,
          background: "#ffffff",
          color: c.ink,
          fontFamily: "'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
          padding: "48px 52px",
          boxSizing: "border-box",
        }}
        aria-hidden
      >
        {/* 상단 · 회사명 + 타이틀 */}
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 8, letterSpacing: "0.08em" }}>
            {companyName}
          </div>
          <div style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "0.4em",
            color: c.brand,
            lineHeight: 1.2,
          }}>
            연  차  신  청  서
          </div>
          <div style={{
            height: 2,
            marginTop: 14,
            background: `linear-gradient(90deg, ${c.brand} 0%, ${c.accent} 60%, ${c.brand} 100%)`,
            opacity: 0.9,
          }} />
        </div>

        {/* 결재란 */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <table style={{ borderCollapse: "collapse", width: 260 }}>
            <thead>
              <tr>
                <th style={sealHeader}>결&nbsp;&nbsp;&nbsp;재</th>
                <th style={sealHeader}>팀&nbsp;&nbsp;&nbsp;장</th>
                <th style={sealHeader}>대&nbsp;&nbsp;&nbsp;표</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...sealBody, fontSize: 10, color: c.muted }}></td>
                <td style={sealBody}></td>
                <td style={sealBody}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 신청자 정보 섹션 */}
        <div style={{
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 700,
          color: c.brand,
          borderLeft: `3px solid ${c.brand}`,
          paddingLeft: 10,
        }}>
          ▣ 신청자 정보
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <tbody>
            <tr>
              <td style={labelStyle}>성&nbsp;&nbsp;&nbsp;&nbsp;명</td>
              <td style={cellStyle}>{data.employeeName || ""}</td>
              <td style={labelStyle}>사&nbsp;&nbsp;&nbsp;&nbsp;번</td>
              <td style={cellStyle}>{data.employeeNumber || ""}</td>
            </tr>
            <tr>
              <td style={labelStyle}>직&nbsp;&nbsp;&nbsp;&nbsp;위</td>
              <td style={cellStyle}>{data.position || ""}</td>
              <td style={labelStyle}>연&nbsp;락&nbsp;처</td>
              <td style={cellStyle}>{data.phone || ""}</td>
            </tr>
            <tr>
              <td style={labelStyle}>입&nbsp;사&nbsp;일</td>
              <td style={{ ...cellStyle }} colSpan={3}>
                {data.hireDate ? fmtKor(data.hireDate) : ""}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 신청 내용 섹션 */}
        <div style={{
          marginBottom: 8,
          fontSize: 13,
          fontWeight: 700,
          color: c.brand,
          borderLeft: `3px solid ${c.brand}`,
          paddingLeft: 10,
        }}>
          ▣ 신청 내용
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={labelStyle}>휴가 종류</td>
              <td style={{ ...cellStyle, fontWeight: 700, color: c.brand }} colSpan={3}>
                {data.leaveType}
              </td>
            </tr>
            <tr>
              <td style={labelStyle}>시작일</td>
              <td style={cellStyle}>{data.startDate ? fmtKor(data.startDate) : ""}</td>
              <td style={labelStyle}>종료일</td>
              <td style={cellStyle}>{data.endDate ? fmtKor(data.endDate) : ""}</td>
            </tr>
            <tr>
              <td style={labelStyle}>사용 일수</td>
              <td style={{ ...cellStyle, fontWeight: 700 }} colSpan={3}>
                {data.days}일
              </td>
            </tr>
          </tbody>
        </table>

        {/* 사유 박스 */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
          <tbody>
            <tr>
              <td style={labelStyle}>사&nbsp;&nbsp;&nbsp;&nbsp;유</td>
              <td style={{ ...cellStyle, minHeight: 72, verticalAlign: "top", lineHeight: 1.7 }} colSpan={3}>
                {data.reason || ""}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 신청일자 */}
        <div style={{
          textAlign: "center",
          fontSize: 13,
          color: c.ink,
          marginBottom: 28,
          letterSpacing: "0.05em",
        }}>
          신청일자 :&nbsp;&nbsp;
          {applyParts
            ? `${applyParts[1]}년   ${Number(applyParts[2])}월   ${Number(applyParts[3])}일`
            : data.applyDate}
        </div>

        {/* 신청자 서명란 */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 16,
          marginBottom: 40,
          fontSize: 13,
          color: c.ink,
        }}>
          <span style={{ fontWeight: 700, letterSpacing: "0.05em" }}>신 청 자 :</span>
          <span style={{ minWidth: 80 }}>{data.employeeName}</span>
          <span style={{ color: c.muted, fontSize: 12 }}>(서명)</span>
          <div style={{
            width: 80,
            height: 32,
            borderBottom: `1px solid ${c.divider}`,
          }} />
        </div>

        {/* 위 서식을 제출합니다 */}
        <div style={{
          textAlign: "center",
          fontSize: 12,
          color: c.muted,
          marginBottom: 12,
        }}>
          위와 같이 휴가를 신청합니다.
        </div>

        {/* 푸터 */}
        <div style={{
          marginTop: 32,
          paddingTop: 10,
          borderTop: `1px solid ${c.line}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: c.muted,
          letterSpacing: "0.02em",
        }}>
          <span>Generated {data.applyDate}</span>
          <span>{companyName}</span>
        </div>
      </div>
    );
  }
);

LeaveRequestPdfPreview.displayName = "LeaveRequestPdfPreview";

export default LeaveRequestPdfPreview;
