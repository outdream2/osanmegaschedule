// src/lib/formatMargin.ts
// 2026-10-12 · 사용자 지시 · 마진율 색상 대원칙 (feedback_margin_color_rule_2026-10-12.md)
//   · 음수 · text-rose-600 + 명시 "−" 부호 (U+2212)
//   · 양수 · text-emerald-600
//   · 0    · text-slate-500
//   · null · text-slate-400 + "-" dash
//
// 사용:
//   const m = formatMargin(product.marginPct);
//   <span className={m.className}>{m.text}</span>
//
// 전수 적용:
//   · RevenuePage.SalesStatus · 공급사 Scorecard · drawer
//   · StockManagePage/FlowTab · 마진 column
//   · OrderManagePage · 매입/판매 테이블
//   · ScanPage · ProductInfoCard · financial
//   · 각종 상품 drawer / modal · dashboard KPI

export interface FormatMarginResult {
  /** 포맷된 텍스트 · 음수 "−X.X%" · 양수 "X.X%" · null "-" */
  text: string;
  /** Tailwind 클래스 · 색상 + font + tabular */
  className: string;
  /** raw sign · "neg" · "pos" · "zero" · "none" */
  sign: "neg" | "pos" | "zero" | "none";
}

export function formatMargin(pct: number | null | undefined, options?: { digits?: number }): FormatMarginResult {
  const digits = options?.digits ?? 1;
  if (pct === null || pct === undefined || !Number.isFinite(pct)) {
    return { text: "-", className: "text-slate-400 tabular-nums", sign: "none" };
  }
  if (pct < 0) {
    // U+2212 (명시적 minus sign) · hyphen "-" 과 구분 · 세로폭 균일
    return {
      text: `−${Math.abs(pct).toFixed(digits)}%`,
      className: "text-rose-600 font-semibold tabular-nums",
      sign: "neg",
    };
  }
  if (pct > 0) {
    return {
      text: `${pct.toFixed(digits)}%`,
      className: "text-emerald-600 font-semibold tabular-nums",
      sign: "pos",
    };
  }
  return { text: "0%", className: "text-slate-500 tabular-nums", sign: "zero" };
}

/** margin / sale 비율로부터 marginPct 계산 (null-safe) */
export function calcMarginPct(margin: number | null | undefined, sale: number | null | undefined): number | null {
  if (margin === null || margin === undefined || !Number.isFinite(margin)) return null;
  if (sale === null || sale === undefined || !Number.isFinite(sale) || sale === 0) return null;
  return (margin / sale) * 100;
}
