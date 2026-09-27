// server/routes/purchase/orderPurchaseMatch.exceptionEmailTemplate.ts
// 2026-09-27 · 사용자 지시 · 발주이상 요청서 이메일 템플릿 · Diff 계산
//   · 인라인 style HTML (Outlook 등 호환)
//   · orderPurchaseMatch.exceptionBulkSend.ts 에서 사용

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
      exception_label: exLabel,
      diff_desc: diffDesc,
      exception_note: String(o.exception_note ?? ""),
    };
  });
}

export function buildExceptionEmail(
  supName: string,
  targetName: string | null,
  memo: string | null | undefined,
  exceptionLines: ExceptionLine[],
  issuer: Issuer,
): { subject: string; html: string } {
  const itemsHtml = exceptionLines.map((ln) => `
    <tr style="border-bottom:1px solid #fde68a">
      <td style="padding:12px 14px;vertical-align:top">
        <div style="font-size:11px;color:#92400e;font-family:monospace;letter-spacing:0.02em">${ln.product_code}</div>
        <div style="font-size:15px;color:#78350f;font-weight:700;margin-top:3px;line-height:1.35">${ln.product_name}</div>
        <div style="margin-top:6px;display:inline-block;padding:2px 8px;background:#fbbf24;color:#78350f;font-size:12px;font-weight:700;border-radius:4px">${ln.exception_label}</div>
        ${ln.diff_desc ? `<div style="margin-top:4px;font-size:13px;color:#b45309;font-weight:600">${ln.diff_desc}</div>` : ""}
      </td>
      <td style="padding:12px 14px;text-align:right;vertical-align:top;white-space:nowrap">
        <div style="font-size:13px;color:#78350f">발주 · <b>${fmtQty(ln.order_qty)}</b>개</div>
        <div style="font-size:12px;color:#b45309;margin-top:2px">${fmtWon(ln.unit_price ?? 0)} = ${fmtWon(ln.order_amount)}</div>
      </td>
      <td style="padding:12px 14px;text-align:right;vertical-align:top;white-space:nowrap">
        <div style="font-size:13px;color:#78350f">매입 · <b>${ln.purchase_qty > 0 ? fmtQty(ln.purchase_qty) : "-"}</b>${ln.purchase_qty > 0 ? "개" : ""}</div>
        <div style="font-size:12px;color:#b45309;margin-top:2px">${ln.purchase_avg_price ? fmtWon(ln.purchase_avg_price) + " = " + fmtWon(ln.purchase_amount) : "매입 없음"}</div>
        ${ln.purchase_date ? `<div style="font-size:11px;color:#a16207;margin-top:2px">${ln.purchase_date}</div>` : ""}
      </td>
    </tr>
    ${ln.exception_note ? `<tr style="border-bottom:1px solid #fde68a"><td colspan="3" style="padding:0 14px 10px 14px;font-size:13px;color:#78350f;background:#fffbeb"><b>메모</b> · ${ln.exception_note}</td></tr>` : ""}
  `).join("");

  const issuerBlock = `
    <div style="margin-top:12px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
      <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:6px">발주처</div>
      <div style="font-size:15px;font-weight:700;color:#0A2E4A">${issuer.name}</div>
      ${issuer.contactName ? `<div style="font-size:13px;color:#334155;margin-top:2px">담당자 · ${issuer.contactName}</div>` : ""}
      ${issuer.orgPhone ? `<div style="font-size:13px;color:#334155;margin-top:2px">약국 · ${issuer.orgPhone}</div>` : ""}
      ${issuer.personPhone ? `<div style="font-size:13px;color:#334155;margin-top:2px">담당자 연락처 · ${issuer.personPhone}</div>` : ""}
    </div>`;

  const contactGreeting = targetName ? `${targetName} 담당자님` : "담당자님";
  const subject = `[발주이상 요청서] ${supName} · ${exceptionLines.length}건`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9">
    <div style="max-width:760px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
      <div style="background:linear-gradient(135deg,#b45309 0%,#d97706 100%);padding:24px;color:#ffffff">
        <div style="font-size:12px;letter-spacing:0.2em;opacity:0.9;font-weight:600">EXCEPTION REQUEST · 발주이상 요청서</div>
        <div style="font-size:24px;font-weight:800;margin-top:6px">${supName}</div>
        <div style="font-size:13px;margin-top:6px;opacity:0.9">${exceptionLines.length}건 · 확인·조치 요청</div>
      </div>
      <div style="padding:20px 24px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:14px;line-height:1.6;color:#78350f">
        안녕하세요, ${contactGreeting}.<br>
        <b>${issuer.name}</b> 매장의 발주 - 매입 대조 결과, 아래 사항에 이상이 발견되어 확인 · 조치 요청드립니다.
      </div>
      <div style="padding:0 24px 20px">${issuerBlock}</div>
      <div style="padding:0 24px 20px">
        <div style="font-size:13px;font-weight:700;color:#78350f;margin:8px 0 12px;letter-spacing:0.02em">▶ 이상 라인 · ${exceptionLines.length}건</div>
        <table style="border-collapse:collapse;width:100%;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;overflow:hidden">
          <thead style="background:#fef3c7">
            <tr>
              <th style="padding:10px 14px;text-align:left;font-size:12px;color:#78350f;font-weight:700;letter-spacing:0.05em">상품 · 이상 사유</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;color:#78350f;font-weight:700;letter-spacing:0.05em">발주</th>
              <th style="padding:10px 14px;text-align:right;font-size:12px;color:#78350f;font-weight:700;letter-spacing:0.05em">매입</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
      </div>
      ${memo ? `<div style="padding:0 24px 20px"><div style="padding:12px 16px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:13px;color:#78350f;line-height:1.6"><b>요청 메모</b><br>${String(memo).replace(/\n/g, "<br>")}</div></div>` : ""}
      <div style="padding:0 24px 20px">
        <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;color:#334155;line-height:1.7">
          <b style="color:#0A2E4A">▶ 요청 사항</b><br>
          · 위 이상 사항 확인 후 · 정정 · 재매입 · 반품 등 필요한 조치 부탁드립니다.<br>
          · 조치 결과는 ${issuer.contactName || issuer.name} 앞으로 회신 요청드립니다.
        </div>
      </div>
      <p style="margin:0;padding:16px 24px;color:#94a3b8;font-size:12px;background:#f8fafc;border-top:1px solid #e2e8f0">본 메일은 자동 발송되었습니다. · ${issuer.name}</p>
    </div>
  </body></html>`;
  return { subject, html };
}
