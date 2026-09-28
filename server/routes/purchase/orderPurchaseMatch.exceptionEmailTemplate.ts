// server/routes/purchase/orderPurchaseMatch.exceptionEmailTemplate.ts
// 2026-09-28 · 사용자 지시 · 발주이상 요청서 이메일 · KPI Hero 삭제 · 라인 강조 재디자인
//   · "위의 대시보드 필요없고 가장 한눈에 잘 보이게 구성"
//   · KPI Hero (건수·금액·수량) · Eyebrow · breakdown chips · From footer 축소
//   · 각 이상 라인 자체가 즉시 명확 · 카드 스타일 (좌 accent bar · 큰 배지·상품명·Diff)
//   · Diff · "발주 100개 → 매입 80개 (−20개 · 부족)" · 큰 폰트 · 색상 강조
//   · Gmail · Outlook · Apple Mail 호환 · inline style · table 기반
//   · max-width 640px · 폰트 +2 (최소 15px · 상품·Diff 22~24px)

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
  accent: string; // 좌측 accent bar
  chipBg: string;
  chipText: string;
  chipBorder: string;
  diffText: string;
  diffBg: string;
  diffBorder: string;
}
const TONE: Record<string, ToneSpec> = {
  qty_short: {
    accent: "#e11d48", // rose-600 · 수량 부족 · 강한 경고
    chipBg: "#fff1f2",
    chipText: "#9f1239",
    chipBorder: "#fecdd3",
    diffText: "#be123c",
    diffBg: "#fff1f2",
    diffBorder: "#fecdd3",
  },
  qty_over: {
    accent: "#d97706", // amber-600 · 수량 초과
    chipBg: "#fffbeb",
    chipText: "#92400e",
    chipBorder: "#fde68a",
    diffText: "#b45309",
    diffBg: "#fffbeb",
    diffBorder: "#fde68a",
  },
  price_diff: {
    accent: "#ca8a04", // amber-dk · 단가 상이
    chipBg: "#fefce8",
    chipText: "#854d0e",
    chipBorder: "#fde68a",
    diffText: "#a16207",
    diffBg: "#fefce8",
    diffBorder: "#fde68a",
  },
  no_purchase: {
    accent: "#52525b", // zinc-600 · 매입 없음 · 중립
    chipBg: "#f4f4f5",
    chipText: "#3f3f46",
    chipBorder: "#e4e4e7",
    diffText: "#3f3f46",
    diffBg: "#fafafa",
    diffBorder: "#e4e4e7",
  },
  default: {
    accent: "#71717a",
    chipBg: "#f4f4f5",
    chipText: "#3f3f46",
    chipBorder: "#e4e4e7",
    diffText: "#3f3f46",
    diffBg: "#fafafa",
    diffBorder: "#e4e4e7",
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

// ─── Diff · "발주 X → 매입 Y (Δ · 라벨)" · 한 줄 큰 강조 ─────
// exType 따라 실제 비교 축이 달라짐 (수량 vs 단가)
function buildDiffLine(ln: ExceptionLine): string {
  const tone = TONE[ln.exception_type] ?? TONE.default;
  const isPriceDiff = ln.exception_type === "price_diff";

  // 좌우 값
  let leftLabel = "발주";
  let leftValue = "";
  let rightLabel = "매입";
  let rightValue = "";
  let deltaText = "";

  if (isPriceDiff) {
    leftValue = fmtWon(ln.unit_price ?? 0);
    rightValue = fmtWon(ln.purchase_avg_price ?? 0);
    if (ln.unit_price && ln.purchase_avg_price && ln.unit_price > 0) {
      const pct = ((ln.purchase_avg_price - ln.unit_price) / ln.unit_price) * 100;
      const sign = pct > 0 ? "+" : "";
      const dir = pct > 0 ? "높음" : "낮음";
      deltaText = `${sign}${pct.toFixed(1)}% · ${dir}`;
    }
  } else if (ln.exception_type === "no_purchase") {
    leftValue = `${fmtQty(ln.order_qty)}개`;
    rightValue = "매입 이력 없음";
    deltaText = "";
  } else {
    // qty_short / qty_over / default
    leftValue = `${fmtQty(ln.order_qty)}개`;
    rightValue = `${fmtQty(ln.purchase_qty)}개`;
    const qtyDiff = ln.purchase_qty - ln.order_qty;
    if (qtyDiff !== 0) {
      const sign = qtyDiff > 0 ? "+" : "";
      const dir = qtyDiff > 0 ? "초과" : "부족";
      deltaText = `${sign}${qtyDiff.toLocaleString("ko-KR")}개 · ${dir}`;
    }
  }

  const arrow = `<span style="display:inline-block;padding:0 10px;color:${tone.accent};font-weight:800;font-size:20px;vertical-align:middle;line-height:1">&rarr;</span>`;
  const deltaHtml = deltaText
    ? `<div style="display:inline-block;margin-top:8px;padding:6px 12px;background:${tone.diffBg};border:1px solid ${tone.diffBorder};border-radius:6px;font-size:16px;font-weight:800;color:${tone.diffText};letter-spacing:-0.01em;line-height:1.3">${deltaText}</div>`
    : "";

  return `
    <div style="margin-top:10px;font-size:20px;line-height:1.4;color:#09090b;font-weight:700;letter-spacing:-0.01em">
      <span style="font-size:12px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;margin-right:6px;vertical-align:middle">${leftLabel}</span>
      <span style="color:#27272a;vertical-align:middle">${leftValue}</span>
      ${arrow}
      <span style="font-size:12px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;margin-right:6px;vertical-align:middle">${rightLabel}</span>
      <span style="color:${tone.diffText};vertical-align:middle">${rightValue}</span>
    </div>
    ${deltaHtml}
  `;
}

// ─── 이상 라인 카드 · 좌 accent bar + 큰 배지 + 큰 상품명 + 큰 Diff ─────
function renderLineCard(ln: ExceptionLine): string {
  const tone = TONE[ln.exception_type] ?? TONE.default;
  const diffHtml = buildDiffLine(ln);

  // 금액 정보 (있을 때만 · 서브 · 작게)
  const orderAmt = ln.order_amount > 0 ? fmtWon(ln.order_amount) : "";
  const purchaseAmt = ln.purchase_amount > 0 ? fmtWon(ln.purchase_amount) : "";
  const amountLine = (orderAmt || purchaseAmt)
    ? `<div style="margin-top:8px;font-size:13px;color:#71717a;line-height:1.5">
         ${orderAmt ? `발주액 ${orderAmt}` : ""}${orderAmt && purchaseAmt ? " · " : ""}${purchaseAmt ? `매입액 ${purchaseAmt}` : ""}${ln.purchase_date ? ` · 매입일 ${ln.purchase_date}` : ""}
       </div>`
    : (ln.purchase_date ? `<div style="margin-top:8px;font-size:13px;color:#71717a;line-height:1.5">매입일 ${ln.purchase_date}</div>` : "");

  return `
    <tr>
      <td style="padding:0 0 16px 0">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04)">
          <tr>
            <td width="6" style="background:${tone.accent};padding:0" bgcolor="${tone.accent}">&nbsp;</td>
            <td style="padding:18px 22px 20px 22px">
              <!-- Row 1 · 사유 배지 (큰) -->
              <div style="line-height:1">
                <span style="display:inline-block;padding:5px 12px;background:${tone.chipBg};color:${tone.chipText};font-size:15px;font-weight:800;border-radius:6px;border:1px solid ${tone.chipBorder};letter-spacing:-0.01em">${ln.exception_label}</span>
              </div>
              <!-- Row 2 · 상품 코드 · 작게 · secondary -->
              <div style="font-size:12px;color:#a1a1aa;font-family:Menlo,Consolas,monospace;letter-spacing:0.02em;line-height:1.3;margin-top:10px">${ln.product_code || "-"}</div>
              <!-- Row 3 · 상품명 · 크게 (22~24px) · 최우선 정보 -->
              <div style="font-size:22px;color:#09090b;font-weight:800;margin-top:4px;line-height:1.3;letter-spacing:-0.02em">${ln.product_name || "-"}</div>
              <!-- Row 4 · Diff · 발주 → 매입 · 큰 강조 -->
              ${diffHtml}
              <!-- Row 5 · 금액 · secondary -->
              ${amountLine}
              <!-- Row 6 · 메모 -->
              ${ln.exception_note ? `<div style="margin-top:12px;padding:10px 12px;background:#fafafa;border:1px solid #f4f4f5;border-radius:8px;font-size:14px;color:#3f3f46;line-height:1.55"><span style="font-weight:700;color:#18181b">메모</span> · ${ln.exception_note}</div>` : ""}
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
  const totalCount = exceptionLines.length;
  const itemsHtml = exceptionLines.map(renderLineCard).join("");
  const contactGreeting = targetName ? `${targetName} 담당자님` : "담당자님";
  const subject = `[발주이상 요청서] ${supName} · ${totalCount}건 확인 요청`;

  // 발주처 · 회신 정보 (footer block)
  const issuerLines: string[] = [];
  if (issuer.contactName) issuerLines.push(`담당자 · ${issuer.contactName}`);
  if (issuer.orgPhone) issuerLines.push(`약국 · ${issuer.orgPhone}`);
  if (issuer.personPhone) issuerLines.push(`직통 · ${issuer.personPhone}`);
  const issuerLinesHtml = issuerLines
    .map((l) => `<div style="font-size:14px;color:#3f3f46;line-height:1.7">${l}</div>`)
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

          <!-- ═══════ 헤더 · 최소 · 제목만 ═══════ -->
          <tr>
            <td class="body-pad" style="padding:24px 32px 8px 32px;background:#ffffff">
              <div style="font-size:22px;font-weight:800;color:#09090b;line-height:1.3;letter-spacing:-0.02em">발주이상 요청서</div>
              <div style="font-size:15px;color:#3f3f46;margin-top:4px;line-height:1.55">${supName} · ${totalCount}건</div>
            </td>
          </tr>

          <!-- ═══════ 인사 · 2줄 이내 ═══════ -->
          <tr>
            <td class="body-pad" style="padding:14px 32px 0 32px">
              <div style="font-size:15px;color:#27272a;line-height:1.7">
                안녕하세요, <b style="color:#09090b">${contactGreeting}</b>.<br>
                아래 발주 이상 사항 확인·조치를 요청드립니다.
              </div>
            </td>
          </tr>

          <!-- ═══════ 요청 메모 (있을 때만) ═══════ -->
          ${memo ? `
          <tr>
            <td class="body-pad" style="padding:14px 32px 0 32px">
              <div style="padding:14px 16px;background:#fefce8;border:1px solid #fde68a;border-left:4px solid #ca8a04;border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:#854d0e;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">요청 메모</div>
                <div style="font-size:15px;color:#3f3f46;line-height:1.65;margin-top:6px">${String(memo).replace(/\n/g, "<br>")}</div>
              </div>
            </td>
          </tr>` : ""}

          <!-- ═══════ 이상 라인 리스트 · 핵심 콘텐츠 ═══════ -->
          <tr>
            <td class="body-pad" style="padding:22px 32px 8px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                ${itemsHtml}
              </table>
            </td>
          </tr>

          <!-- ═══════ 발주처 정보 · footer ═══════ -->
          <tr>
            <td style="padding:18px 32px 22px 32px;background:#fafafa;border-top:1px solid #e4e4e7">
              <div style="font-size:11px;font-weight:700;color:#a1a1aa;letter-spacing:0.08em;text-transform:uppercase;line-height:1.2">문의 · 회신</div>
              <div style="font-size:16px;font-weight:700;color:#09090b;margin-top:6px;line-height:1.35;letter-spacing:-0.01em">${issuer.name}</div>
              ${issuerLinesHtml ? `<div style="margin-top:6px">${issuerLinesHtml}</div>` : ""}
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;line-height:1.5">본 메일은 발주이상 대조 시스템을 통해 자동 발송되었습니다.</div>
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
