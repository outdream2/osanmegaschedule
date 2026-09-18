// src/components/LeavePage/LeaveRequestPdfPreview.tsx
// 연차신청서 PDF 프리뷰 · A4 · html2canvas-pro + jsPDF 캡처 대상
// 2026-09-18 · 재재설계 · 결재란/도장/그라디언트/아이콘 완전 제거 · 텍스트 위주 미니멀

import React, { forwardRef } from "react";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";

export interface LeaveRequestPdfData {
  employeeName: string;
  employeeNumber?: string | null;
  position?: string | null;
  hireDate?: string | null;
  phone?: string | null;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  applyDate: string;
}

interface LeaveRequestPdfPreviewProps {
  data: LeaveRequestPdfData;
  variant?: "offscreen" | "visible";
}

const c = {
  ink:     "#111827",
  soft:    "#374151",
  muted:   "#6b7280",
  faint:   "#9ca3af",
  line:    "#d1d5db",
  divider: "#e5e7eb",
};

/** YYYY-MM-DD → YYYY년 MM월 DD일 */
function fmtKor(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  padding: "10px 0",
  borderBottom: `1px solid ${c.divider}`,
};

const labelStyle: React.CSSProperties = {
  width: 110,
  flexShrink: 0,
  fontSize: 12.5,
  fontWeight: 700,
  color: c.soft,
  letterSpacing: "0.03em",
  paddingTop: 1,
};

const valueStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: c.ink,
  lineHeight: 1.6,
};

const dividerLine: React.CSSProperties = {
  border: "none",
  borderTop: `1px solid ${c.line}`,
  margin: "24px 0",
};

export const LeaveRequestPdfPreview = forwardRef<HTMLDivElement, LeaveRequestPdfPreviewProps>(
  ({ data, variant = "offscreen" }, ref) => {
    const { info: company } = useCompanyInfo();
    const companyName = company?.name || "오산 메가타운 약국";

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
          padding: "72px 80px",
          boxSizing: "border-box",
        }}
        aria-hidden
      >
        {/* 제목 */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: "0.5em",
            color: c.ink,
            lineHeight: 1.3,
          }}>
            연  차  신  청  서
          </div>
          <div style={{
            width: 40,
            height: 2,
            background: c.soft,
            margin: "16px auto 0",
          }} />
        </div>

        {/* 신청자 정보 */}
        <div style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: c.faint,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            신청자 정보
          </div>

          <div style={{ ...rowStyle, borderTop: `1px solid ${c.divider}` }}>
            <div style={labelStyle}>성    명</div>
            <div style={valueStyle}>{data.employeeName || ""}</div>
            <div style={{ ...labelStyle, marginLeft: 32 }}>사    번</div>
            <div style={{ ...valueStyle }}>{data.employeeNumber || ""}</div>
          </div>
          <div style={rowStyle}>
            <div style={labelStyle}>부    서</div>
            <div style={valueStyle}>{data.position || ""}</div>
            <div style={{ ...labelStyle, marginLeft: 32 }}>직    위</div>
            <div style={{ ...valueStyle }}>{data.position || ""}</div>
          </div>
          <div style={rowStyle}>
            <div style={labelStyle}>입 사 일</div>
            <div style={valueStyle}>{data.hireDate ? fmtKor(data.hireDate) : ""}</div>
            <div style={{ ...labelStyle, marginLeft: 32 }}>연 락 처</div>
            <div style={{ ...valueStyle }}>{data.phone || ""}</div>
          </div>
        </div>

        <hr style={dividerLine} />

        {/* 신청 내용 */}
        <div style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: c.faint,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 12,
          }}>
            신청 내용
          </div>

          <div style={{ ...rowStyle, borderTop: `1px solid ${c.divider}` }}>
            <div style={labelStyle}>휴가 종류</div>
            <div style={{ ...valueStyle, fontWeight: 700 }}>{data.leaveType}</div>
          </div>
          <div style={rowStyle}>
            <div style={labelStyle}>시 작 일</div>
            <div style={valueStyle}>{data.startDate ? fmtKor(data.startDate) : ""}</div>
            <div style={{ ...labelStyle, marginLeft: 32 }}>종 료 일</div>
            <div style={{ ...valueStyle }}>{data.endDate ? fmtKor(data.endDate) : ""}</div>
          </div>
          <div style={rowStyle}>
            <div style={labelStyle}>사용 일수</div>
            <div style={{ ...valueStyle, fontWeight: 700 }}>{data.days}일</div>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none", alignItems: "flex-start" }}>
            <div style={{ ...labelStyle, paddingTop: 0 }}>사    유</div>
            <div style={{ ...valueStyle, minHeight: 60, whiteSpace: "pre-wrap" }}>
              {data.reason || ""}
            </div>
          </div>
        </div>

        <hr style={dividerLine} />

        {/* 신청일자 */}
        <div style={{
          textAlign: "center",
          fontSize: 13.5,
          color: c.ink,
          marginBottom: 32,
          letterSpacing: "0.06em",
        }}>
          {applyParts
            ? `신청일자 :  ${applyParts[1]}년   ${Number(applyParts[2])}월   ${Number(applyParts[3])}일`
            : `신청일자 : ${data.applyDate}`}
        </div>

        {/* 신청자 */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 16,
          fontSize: 13.5,
          color: c.ink,
          marginBottom: 64,
          letterSpacing: "0.05em",
        }}>
          <span style={{ fontWeight: 700 }}>신 청 자 :</span>
          <span style={{ minWidth: 80 }}>{data.employeeName}</span>
          <div style={{
            width: 100,
            borderBottom: `1px solid ${c.line}`,
            marginLeft: 8,
          }} />
        </div>

        {/* 푸터 */}
        <div style={{
          position: "absolute",
          bottom: 52,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10.5,
          color: c.faint,
          borderTop: `1px solid ${c.divider}`,
          paddingTop: 8,
        }}>
          <span>{data.applyDate}</span>
          <span>{companyName}</span>
        </div>
      </div>
    );
  }
);

LeaveRequestPdfPreview.displayName = "LeaveRequestPdfPreview";

export default LeaveRequestPdfPreview;
