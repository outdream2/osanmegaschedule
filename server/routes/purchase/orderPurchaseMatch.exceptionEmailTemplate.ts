// server/routes/purchase/orderPurchaseMatch.exceptionEmailTemplate.ts
// 2026-09-28 · 사용자 지시 · 발주이상 요청서 이메일 · 최신 트렌드 재디자인
//   · Linear · Stripe · Vercel · Notion · Attio 2026 톤
//   · KPI hero (이상 건수 · 금액 차이 · 수량 차이) · 한눈에 파악
//   · 이상 라인 · left accent bar + Diff-first hierarchy
//   · 색상 · 사유별 semantic tone (rose · amber · zinc)
//   · 인라인 style HTML · table 기반 · Outlook/Gmail/Apple Mail 호환
//   · max-width 640px · 단일 컬럼 · 모바일 반응형
//   · Pretendard fallback · 이모지 X · 파스텔 X

export interface Issuer {
  name: string;
  contactName: string;
  orgPhone: string;
  personPhone: string;
}

export interface PurchaseRowLite {
  quantity: number;
  amount: number;
  purchase_date: string | null;
}

export interface ExceptionLine {
  product_code: string;
  product_name: string;
  order_qty: number;
  unit_price: number | null;
  order_amount: number;
  purchase_qty: number;
  purchase_avg_price: number | null;
  purchase_amount: number;
  purchase_date: string | null;
  exception_type: string;
  exception_label: string;
  diff_desc: string;
  exception_note: string;
}

const EXCEPTION_LABEL: Record<string, string> = {
  qty_short: "수량 부족",
  qty_over: "수량 초과",
  price_diff: "단가 상이",
  no_purchase: "매입 없음",
};

// 사유별 semantic tone · Linear/Vercel 2026 · 뉴트럴 base + accent
interface ToneSpec {
  accent: string; // 좌측 accent bar · 헤더 dot
  chipBg: string;
  chipText: string;
  chipBorder: string;
  diffText: string;
}
const TONE: Record<string, ToneSpec> = {
  qty_short: {
    accent: "#e11d48", // rose-600 · 수량 부족 · 강한 경고
    chipBg: "#fff1f2",
    chipText: "#9f1239",
    chipBorder: "#fecdd3",
    diffText: "#be123c",
  },
  qty_over: {
    accent: "#d97706", // amber-600 · 수량 초과
    chipBg: "#fffbeb",
    chipText: "#92400e",
    chipBorder: "#fde68a",
    diffText: "#b45309",
  },
  price_diff: {
    accent: "#ca8a04", // amber-dk · 단가 상이
    chipBg: "#fefce8",
    chipText: "#854d0e",
    chipBorder: "#fde68a",
    diffText: "#a16207",
  },
  no_purchase: {
    accent: "#52525b", // zinc-600 · 매입 없음 · 중립
    chipBg: "#f4f4f5",
    chipText: "#3f3f46",
    chipBorder: "#e4e4e7",
    diffText: "#52525b",
  },
  default: {
    accent: "#71717a",
    chipBg: "#f4f4f5",
    chipText: "#3f3f46",
    chipBorder: "#e4e4e7",
    diffText: "#52525b",
  },
};

export const fmtWon = (n: unknown): string => {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return "-";
  return v.toLocaleString("ko-KR") + "원";
};
export const fmtQty = (n: unknown): string => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("ko-KR") : "-";
};

// 부호 있는 금액 · KPI hero 용
const fmtWonSigned = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0원";
  const sign = n > 0 ? "+" : "";
  return sign + Math.round(n).toLocaleString("ko-KR") + "원";
};
const fmtQtySigned = (n: number): string => {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n > 0 ? "+" : "";
  return sign + n.toLocaleString("ko-KR");
};

export function buildExceptionLines(
  orders: ReadonlyArray<Record<string, unknown>>,
  purchasesByCode: Map<string, PurchaseRowLite[]>,
): ExceptionLine[] {
  return orders.map((o) => {
    const orderQty = Number(o.order_qty ?? 0);
    const orderPrice = o.unit_price != null ? Number(o.unit_price) : null;
    const matches = purchasesByCode.get(String(o.product_code ?? "")) ?? [];
    const purchaseTotalQty = matches.reduce((s, m) => s + Number(m.quantity ?? 0), 0);
    const purchaseTotalAmt = matches.reduce((s, m) => s + Number(m.amount ?? 0), 0);
    const purchaseAvgPrice = purchaseTotalQty > 0 ? purchaseTotalAmt / purchaseTotalQty : null;
    const purchaseDate = matches[0]?.purchase_date ?? null;
    const qtyDiff = purchaseTotalQty - orderQty;
    let diffDesc = "";
    if (matches.length === 0) diffDesc = "매입 이력 없음";
    else if (qtyDiff !== 0) diffDesc = `수량 차이 ${qtyDiff > 0 ? "+" : ""}${qtyDiff}개`;
    else if (orderPrice && purchaseAvgPrice && orderPrice > 0) {
      const pct = ((purchaseAvgPrice - orderPrice) / orderPrice) * 100;
      if (Math.abs(pct) > 0.5) diffDesc = `단가 차이 ${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
    }
    const exType = String(o.exception_type ?? "");
    const exLabel = EXCEPTION_LABEL[exType] ?? "이상";
    return {
      product_code: String(o.product_code ?? ""),
      product_name: String(o.product_name ?? ""),
      order_qty: orderQty,
      unit_price: orderPrice,
      order_amount: orderPrice ? orderQty * orderPrice : 0,
      purchase_qty: purchaseTotalQty,
      purchase_avg_price: purchaseAvgPrice,
      purchase_amount: purchaseTotalAmt,
      purchase_date: purchaseDate,
      exception_type: exType,
      exception_label: exLabel,
      diff_desc: diffDesc,
      exception_note: String(o.exception_note ?? ""),
    };
  });
}

// ─── 이상 라인 카드 (line item) · left accent bar + Diff-first ─────
function renderLineCard(ln: ExceptionLine): string {
  const tone = TONE[ln.exception_type] ?? TONE.default;
  const orderStr = `${fmtQty(ln.order_qty)}개 · ${fmtWon(ln.unit_price ?? 0)}`;
  const orderTotal = fmtWon(ln.order_amount);
  const purchaseStr = ln.purchase_qty > 0
    ? `${fmtQty(ln.purchase_qty)}개 · ${fmtWon(ln.purchase_avg_price)}`
    : "매입 이력 없음";
  const purchaseTotal = ln.purchase_qty > 0 ? fmtWon(ln.purchase_amount) : "-";

  return `
    <tr>
      <td style="padding:0 0 10px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden">
          <tr>
            <td width="4" style="background:${tone.accent};padding:0" bgcolor="${tone.accent}">&nbsp;</td>
            <td style="padding:14px 16px">
              <!-- Row 1 · product code + chip -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td style="vertical-align:top">
                    <div style="font-size:11px;color:#71717a;font-family:Menlo,Consolas,monospace;letter-spacing:0.02em;line-height:1.3">${ln.product_code || "-"}</div>
                  </td>
                  <td style="vertical-align:top;text-align:right;white-space:nowrap">
                    <span style="display:inline-block;padding:3px 9px;background:${tone.chipBg};color:${tone.chipText};font-size:11px;font-weight:700;border-radius:4px;border:1px solid ${tone.chipBorder};letter-spacing:0.02em">${ln.exception_label}</span>
                  </td>
                </tr>
              </table>
              <!-- Row 2 · product name -->
              <div style="font-size:16px;color:#18181b;font-weight:700;margin-top:4px;line-height:1.35;letter-spacing:-0.01em">${ln.product_name || "-"}</div>
              <!-- Row 3 · Diff · one-liner · 강조 -->
              ${ln.diff_desc ? `<div style="font-size:14px;color:${tone.diffText};font-weight:700;margin-top:6px;line-height:1.4">${ln.diff_desc}</div>` : ""}
              <!-- Row 4 · compact 2-col compare -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:10px">
                <tr>
                  <td width="50%" style="padding:8px 10px 8px 0;vertical-align:top;border-right:1px solid #f4f4f5">
                    <div style="font-size:10px;color:#a1a1aa;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">발주</div>
                    <div style="font-size:13px;color:#27272a;font-weight:600;margin-top:3px;line-height:1.4">${orderStr}</div>
                    <div style="font-size:12px;color:#71717a;margin-top:2px;line-height:1.4">${orderTotal}</div>
                  </td>
                  <td width="50%" style="padding:8px 0 8px 10px;vertical-align:top">
                    <div style="font-size:10px;color:#a1a1aa;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">매입</div>
                    <div style="font-size:13px;color:#27272a;font-weight:600;margin-top:3px;line-height:1.4">${purchaseStr}</div>
                    <div style="font-size:12px;color:#71717a;margin-top:2px;line-height:1.4">${purchaseTotal}${ln.purchase_date ? " · " + ln.purchase_date : ""}</div>
                  </td>
                </tr>
              </table>
              ${ln.exception_note ? `<div style="margin-top:10px;padding:8px 10px;background:#fafafa;border:1px solid #f4f4f5;border-radius:6px;font-size:12px;color:#3f3f46;line-height:1.5"><span style="font-weight:700;color:#18181b">메모</span> · ${ln.exception_note}</div>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

export function buildExceptionEmail(
  supName: string,
  targetName: string | null,
  memo: string | null | undefined,
  exceptionLines: ExceptionLine[],
  issuer: Issuer,
): { subject: string; html: string } {
  // ── KPI 계산 ─────────────────────────────────────────────
  const totalCount = exceptionLines.length;
  const orderAmountSum = exceptionLines.reduce((s, l) => s + (l.order_amount || 0), 0);
  const purchaseAmountSum = exceptionLines.reduce((s, l) => s + (l.purchase_amount || 0), 0);
  const amountDiff = purchaseAmountSum - orderAmountSum;
  const qtyDiffSum = exceptionLines.reduce(
    (s, l) => s + ((l.purchase_qty || 0) - (l.order_qty || 0)),
    0,
  );

  // 사유별 count breakdown
  const byType = exceptionLines.reduce<Record<string, number>>((m, l) => {
    m[l.exception_type] = (m[l.exception_type] || 0) + 1;
    return m;
  }, {});
  const breakdownChips = Object.entries(byType)
    .map(([type, cnt]) => {
      const tone = TONE[type] ?? TONE.default;
      const label = EXCEPTION_LABEL[type] ?? "이상";
      return `<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 9px;background:${tone.chipBg};color:${tone.chipText};font-size:11px;font-weight:700;border-radius:4px;border:1px solid ${tone.chipBorder}">${label} ${cnt}</span>`;
    })
    .join("");

  const itemsHtml = exceptionLines.map(renderLineCard).join("");

  const contactGreeting = targetName ? `${targetName} 담당자님` : "담당자님";
  const subject = `[발주이상 요청서] ${supName} · ${totalCount}건 확인 요청`;

  // 금액 차이 tone (신호등 억제 · 뉴트럴 base)
  const amountDiffTone = amountDiff === 0
    ? { text: "#3f3f46", bg: "#fafafa", border: "#e4e4e7" }
    : amountDiff > 0
      ? { text: "#b45309", bg: "#fffbeb", border: "#fde68a" }
      : { text: "#be123c", bg: "#fff1f2", border: "#fecdd3" };
  const qtyDiffTone = qtyDiffSum === 0
    ? { text: "#3f3f46", bg: "#fafafa", border: "#e4e4e7" }
    : qtyDiffSum > 0
      ? { text: "#b45309", bg: "#fffbeb", border: "#fde68a" }
      : { text: "#be123c", bg: "#fff1f2", border: "#fecdd3" };

  // 발주처 · 회신 정보 (footer block)
  const issuerLines: string[] = [];
  if (issuer.contactName) issuerLines.push(`담당자 · ${issuer.contactName}`);
  if (issuer.orgPhone) issuerLines.push(`약국 · ${issuer.orgPhone}`);
  if (issuer.personPhone) issuerLines.push(`직통 · ${issuer.personPhone}`);
  const issuerLinesHtml = issuerLines
    .map((l) => `<div style="font-size:13px;color:#3f3f46;line-height:1.7">${l}</div>`)
    .join("");

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${subject}</title>
  <style>
    @media only screen and (max-width:640px) {
      .container { width:100% !important; padding:0 12px !important }
      .kpi-cell { display:block !important; width:100% !important; padding:0 0 8px 0 !important }
      .hero-pad { padding:24px 20px !important }
      .body-pad { padding:20px !important }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f4f5">발주이상 ${totalCount}건 · ${supName} · 확인·조치 요청 · ${issuer.name}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f4f4f5">
    <tr>
      <td align="center" style="padding:24px 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="container" style="width:640px;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden">
          <!-- ═══════ HERO · Eyebrow + Title ═══════ -->
          <tr>
            <td class="hero-pad" style="padding:28px 32px 20px 32px;background:#ffffff;border-bottom:1px solid #f4f4f5">
              <div style="font-size:11px;font-weight:700;color:#a1a1aa;letter-spacing:0.12em;text-transform:uppercase;line-height:1.2">Exception Request · 발주이상 요청서</div>
              <div style="font-size:24px;font-weight:800;color:#09090b;margin-top:8px;line-height:1.25;letter-spacing:-0.02em">${supName}</div>
              <div style="font-size:14px;color:#52525b;margin-top:6px;line-height:1.55">${totalCount}건의 발주 - 매입 불일치가 발견되어 확인·조치를 요청드립니다.</div>
              ${breakdownChips ? `<div style="margin-top:12px">${breakdownChips}</div>` : ""}
            </td>
          </tr>

          <!-- ═══════ KPI HERO · 3 metrics ═══════ -->
          <tr>
            <td style="padding:20px 32px 0 32px" class="body-pad">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                <tr>
                  <td class="kpi-cell" width="33.33%" style="padding:0 8px 0 0;vertical-align:top">
                    <div style="padding:14px 14px 12px 14px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
                      <div style="font-size:10px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">이상 건수</div>
                      <div style="font-size:22px;font-weight:800;color:#09090b;margin-top:6px;line-height:1.1;letter-spacing:-0.02em">${totalCount}<span style="font-size:13px;font-weight:700;color:#71717a;margin-left:2px">건</span></div>
                    </div>
                  </td>
                  <td class="kpi-cell" width="33.33%" style="padding:0 4px 0 4px;vertical-align:top">
                    <div style="padding:14px 14px 12px 14px;background:${amountDiffTone.bg};border:1px solid ${amountDiffTone.border};border-radius:10px">
                      <div style="font-size:10px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">매입 - 발주 금액</div>
                      <div style="font-size:20px;font-weight:800;color:${amountDiffTone.text};margin-top:6px;line-height:1.15;letter-spacing:-0.02em">${fmtWonSigned(amountDiff)}</div>
                    </div>
                  </td>
                  <td class="kpi-cell" width="33.33%" style="padding:0 0 0 8px;vertical-align:top">
                    <div style="padding:14px 14px 12px 14px;background:${qtyDiffTone.bg};border:1px solid ${qtyDiffTone.border};border-radius:10px">
                      <div style="font-size:10px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">수량 차이 합계</div>
                      <div style="font-size:22px;font-weight:800;color:${qtyDiffTone.text};margin-top:6px;line-height:1.1;letter-spacing:-0.02em">${fmtQtySigned(qtyDiffSum)}<span style="font-size:13px;font-weight:700;color:#71717a;margin-left:2px">개</span></div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══════ 인사 ═══════ -->
          <tr>
            <td class="body-pad" style="padding:20px 32px 0 32px">
              <div style="font-size:14px;color:#27272a;line-height:1.65">
                안녕하세요, <b style="color:#09090b">${contactGreeting}</b>.<br>
                <b style="color:#09090b">${issuer.name}</b> 매장의 발주 - 매입 대조 결과 아래 사항에 이상이 발견되어 확인·조치를 요청드립니다.
              </div>
            </td>
          </tr>

          <!-- ═══════ 요청 메모 (있을 때만) ═══════ -->
          ${memo ? `
          <tr>
            <td class="body-pad" style="padding:16px 32px 0 32px">
              <div style="padding:14px 16px;background:#fefce8;border:1px solid #fde68a;border-left:3px solid #ca8a04;border-radius:8px">
                <div style="font-size:10px;font-weight:700;color:#854d0e;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">요청 메모</div>
                <div style="font-size:14px;color:#3f3f46;line-height:1.65;margin-top:6px">${String(memo).replace(/\n/g, "<br>")}</div>
              </div>
            </td>
          </tr>` : ""}

          <!-- ═══════ 이상 라인 리스트 ═══════ -->
          <tr>
            <td class="body-pad" style="padding:24px 32px 8px 32px">
              <div style="font-size:11px;font-weight:700;color:#71717a;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2;margin-bottom:12px">Line items · ${totalCount}건</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- ═══════ 요청 사항 (CTA-lite) ═══════ -->
          <tr>
            <td class="body-pad" style="padding:8px 32px 24px 32px">
              <div style="padding:16px 18px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
                <div style="font-size:13px;font-weight:700;color:#09090b;letter-spacing:-0.01em">요청 사항</div>
                <div style="font-size:13px;color:#3f3f46;line-height:1.7;margin-top:6px">
                  · 위 이상 사항 확인 후 정정 · 재매입 · 반품 등 필요한 조치를 부탁드립니다.<br>
                  · 조치 결과는 <b style="color:#09090b">${issuer.contactName || issuer.name}</b> 앞으로 회신 부탁드립니다.
                </div>
              </div>
            </td>
          </tr>

          <!-- ═══════ 발주처 정보 · footer ═══════ -->
          <tr>
            <td style="padding:20px 32px 24px 32px;background:#fafafa;border-top:1px solid #e4e4e7">
              <div style="font-size:10px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">From</div>
              <div style="font-size:15px;font-weight:700;color:#09090b;margin-top:6px;line-height:1.35;letter-spacing:-0.01em">${issuer.name}</div>
              ${issuerLinesHtml ? `<div style="margin-top:6px">${issuerLinesHtml}</div>` : ""}
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;line-height:1.5">본 메일은 발주이상 대조 시스템을 통해 자동 발송되었습니다.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { subject, html };
}
