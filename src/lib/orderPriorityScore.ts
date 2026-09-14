// src/lib/orderPriorityScore.ts
// 2026-09-14 · #87 · 발주필요 · 스코어 기반 자동 추천 알고리즘
//   · 재고 부족율 · 소진 임박 · 판매 속도 · 이벤트 부스트 · 계절 가중치

export interface PriorityContext {
  /** 현재 재고 */
  current: number;
  /** 적정 재고 */
  optimal: number;
  /** 최근 30일 판매량 */
  saleMonth: number | null;
  /** 최근 90일 판매량 */
  saleQuarter: number | null;
  /** 오늘 이벤트 상품 코드 셋 (부스트) */
  eventCodes: Set<string>;
  /** 계절 상품 코드 셋 (부스트) */
  seasonalCodes: Set<string>;
  /** 상품 코드 · 부스트 판정용 */
  product_code: string;
}

export interface PriorityResult {
  score: number;
  shortage: number;
  urgency: number;
  velocity: number;
  eventBoost: number;
  seasonBoost: number;
  daysLeft: number;
  reason: string;
}

/**
 * 우선순위 스코어 · 0 ~ 200+ (높을수록 우선)
 *
 * factors:
 * - shortage    (0~100) · 부족율 · (optimal - current) / max(1, optimal) × 100
 * - urgency     (0~50)  · 소진 임박도 · clamp(1 - daysLeft/30, 0, 1) × 50
 * - velocity    (0~30)  · 판매 속도 · log(saleMonth+1) × 5
 * - eventBoost  (+30)   · 오늘 이벤트 상품
 * - seasonBoost (+15)   · 계절 상품
 */
export function computePriorityScore(ctx: PriorityContext): PriorityResult {
  const cur = Math.max(0, ctx.current);
  const opt = Math.max(0, ctx.optimal);
  const s30 = ctx.saleMonth != null && Number.isFinite(ctx.saleMonth) ? Math.max(0, ctx.saleMonth) : 0;
  const s90 = ctx.saleQuarter != null && Number.isFinite(ctx.saleQuarter) ? Math.max(0, ctx.saleQuarter) : 0;

  const shortage = opt > 0
    ? Math.max(0, Math.min(100, ((opt - cur) / Math.max(1, opt)) * 100))
    : (cur === 0 ? 50 : 0);

  const daily = s30 > 0 ? s30 / 30 : (s90 > 0 ? s90 / 90 : 0);
  const daysLeft = daily > 0 ? cur / daily : Infinity;
  const urgency = Number.isFinite(daysLeft)
    ? Math.max(0, Math.min(1, 1 - daysLeft / 30)) * 50
    : (cur === 0 && opt > 0 ? 50 : 0);

  const velocity = Math.min(30, Math.log(s30 + 1) * 5);

  const eventBoost = ctx.eventCodes.has(ctx.product_code) ? 30 : 0;
  const seasonBoost = ctx.seasonalCodes.has(ctx.product_code) ? 15 : 0;

  const score = shortage + urgency + velocity + eventBoost + seasonBoost;

  // 사유 요약 (top-1 driver)
  const drivers: Array<{ label: string; v: number }> = [
    { label: "재고 부족", v: shortage },
    { label: "소진 임박", v: urgency },
    { label: "판매 활발", v: velocity },
    { label: "이벤트", v: eventBoost },
    { label: "계절", v: seasonBoost },
  ];
  drivers.sort((a, b) => b.v - a.v);
  const reason = drivers.filter(d => d.v > 0).slice(0, 2).map(d => d.label).join(" · ") || "-";

  return {
    score: Math.round(score * 10) / 10,
    shortage: Math.round(shortage * 10) / 10,
    urgency: Math.round(urgency * 10) / 10,
    velocity: Math.round(velocity * 10) / 10,
    eventBoost,
    seasonBoost,
    daysLeft: Number.isFinite(daysLeft) ? Math.round(daysLeft) : Infinity,
    reason,
  };
}
