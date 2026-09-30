// src/lib/cardBillingCycle.ts
// 2026-09-30 · #2 · 카드 청구기간 계산 · 최신 트렌드 웹조사 반영 (사용자 지시)
//   · 카드사·결제일 조합별 · 매입분 반영 기간 (이용기간) 계산
//   · 근거 · BC카드 공식 팝업 · 카드사별 신용공여기간 표 (KB·신한·우리·NH·하나·삼성·현대)
//   · 공통 규칙 · 이용기간 종료일 = 결제일 − N일 (N = 카드사별 gap)
//                이용기간 시작일 = 종료일 − 1개월 + 1일
//   · 참고 · https://www.bccard.com/html/individual/mybc/inquiry/pop_credit_giving_*.html

import type { CardIssuer } from "../shared/schemas/creditCards";

/** 카드사별 · 결제일 → 이용기간 종료일까지의 gap (일) · BC카드 공식 표 기반 */
export const CARD_PAYMENT_GAP: Record<CardIssuer, number> = {
  BC:   13,
  국민: 13,   // KB국민
  삼성: 12,
  현대: 11,
  신한: 13,
  롯데: 13,
  하나: 12,
  우리: 13,
  농협: 13,   // NH농협
  씨티: 13,
  기타: 13,   // default
};

export interface BillingPeriod {
  /** ISO 'YYYY-MM-DD' · 이용기간 시작일 */
  startDate: string;
  /** ISO 'YYYY-MM-DD' · 이용기간 종료일 */
  endDate: string;
  /** 다음 결제일 · ISO */
  paymentDate: string;
  /** UI 표시 라벨 · "전월 13일 ~ 당월 12일" */
  label: string;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(d: Date, refYear: number, refMonth: number): string {
  const diff = (d.getFullYear() - refYear) * 12 + (d.getMonth() - refMonth);
  if (diff === -2) return "전전월";
  if (diff === -1) return "전월";
  if (diff === 0) return "당월";
  if (diff === 1) return "다음달";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/**
 * 카드사 + 결제일 + 기준일(오늘) → 다음 결제일에 청구될 이용기간 계산
 *
 * @param carrier - 카드사 (CARD_ISSUERS)
 * @param paymentDay - 결제일 (1~31)
 * @param referenceDate - 기준일 (기본 오늘)
 * @returns { startDate, endDate, paymentDate, label }
 */
export function calcBillingPeriod(
  carrier: CardIssuer,
  paymentDay: number,
  referenceDate: Date = new Date(),
): BillingPeriod {
  const gap = CARD_PAYMENT_GAP[carrier] ?? 13;

  // 1) 다음 결제일 확정 (기준일 이후 가장 가까운 결제일)
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  let paymentDate = new Date(ref.getFullYear(), ref.getMonth(), paymentDay);
  if (paymentDate <= ref) {
    paymentDate = new Date(ref.getFullYear(), ref.getMonth() + 1, paymentDay);
  }

  // 2) 이용기간 종료일 = 결제일 − gap
  const endDate = new Date(paymentDate);
  endDate.setDate(endDate.getDate() - gap);

  // 3) 이용기간 시작일 = 종료일 − 1개월 + 1일
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 1);
  startDate.setDate(startDate.getDate() + 1);

  // 4) UI 라벨 · "전월 13일 ~ 당월 12일" · 기준일 월 기준 상대 표기
  const rMonth = ref.getMonth();
  const rYear = ref.getFullYear();
  const startText = `${monthLabel(startDate, rYear, rMonth)} ${startDate.getDate()}일`;
  const endText = `${monthLabel(endDate, rYear, rMonth)} ${endDate.getDate()}일`;

  return {
    startDate: toISO(startDate),
    endDate: toISO(endDate),
    paymentDate: toISO(paymentDate),
    label: `${startText} ~ ${endText}`,
  };
}
