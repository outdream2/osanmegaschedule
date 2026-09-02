// src/shared/schemas/creditCards.ts
// 2026-09-02 · #69 · 카드 결제 관리 · 서버/클라 공유 Zod 스키마 + DTO
//   · 사용 · 매장>결제>결제카드등록 · 카드별 결제내역
import { z } from "zod";

/** 지원 카드사 · issuer enum · 확장 시 여기 추가 */
export const CARD_ISSUERS = [
  "BC", "국민", "삼성", "현대", "신한", "롯데", "하나", "우리", "농협", "씨티", "기타",
] as const;
export type CardIssuer = typeof CARD_ISSUERS[number];

export const CreateCreditCardSchema = z.object({
  issuer:      z.string().min(1, "카드사 선택").max(20),
  alias:       z.string().max(60).nullable().optional(),
  last4:       z.string().regex(/^\d{4}$|^$/, "숫자 4자리").nullable().optional(),
  billing_day: z.number().int().min(1).max(31),
  active:      z.boolean().optional().default(true),
  note:        z.string().max(500).nullable().optional(),
});
export type CreateCreditCardInput = z.infer<typeof CreateCreditCardSchema>;

export const UpdateCreditCardSchema = CreateCreditCardSchema.partial();
export type UpdateCreditCardInput = z.infer<typeof UpdateCreditCardSchema>;

/** GET /api/credit-cards · 응답 */
export interface CreditCard {
  id: number;
  issuer: string;
  alias: string | null;
  last4: string | null;
  billing_day: number;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export type CreditCardsListResponse = CreditCard[];

/** GET /api/credit-cards/summary · 결제 aggregation 응답 · 카드별 월별 */
export interface CardMonthlyEntry {
  month: string;         // "2026-08"
  amount: number;        // 해당 월 카드로 결제된 총 금액
  count: number;         // 결제 건수
}
export interface CardSummary {
  card: CreditCard;
  totalAmount: number;
  totalCount: number;
  monthly: CardMonthlyEntry[];             // 최근 12개월
  nextBillingAmount: number;               // 차월 결제 예정액
  nextBillingDate: string;                 // YYYY-MM-DD 예정 결제일
  currentBillingAmount: number;            // 이번달 결제 예정액 (아직 안 나감)
  currentBillingDate: string;              // YYYY-MM-DD
}
export type CardsSummaryResponse = CardSummary[];
