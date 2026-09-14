// src/lib/creditCardsApi.ts
// 2026-09-14 · 프레임워크 · 신용카드 API 클라이언트 래퍼
//   · server/routes/purchase/creditCards.ts
//   · 4+ 호출 사이트 통합 · CRUD + summary

import { api } from "./apiClient";
import type {
  CreditCard,
  CreateCreditCardInput,
  UpdateCreditCardInput,
  CardSummary,
} from "../shared/schemas/creditCards";

/** GET /api/credit-cards · 카드 리스트 (active 필터 옵션) */
export async function listCreditCards(params?: { active?: boolean }): Promise<CreditCard[]> {
  const suffix = params?.active ? "?active=1" : "";
  const { data } = await api.get<CreditCard[]>(`/api/credit-cards${suffix}`);
  return Array.isArray(data) ? data : [];
}

/** GET /api/credit-cards/summary · 카드별 월별 결제 집계 + 파생 지표 */
export async function listCreditCardSummary(): Promise<CardSummary[]> {
  const { data } = await api.get<CardSummary[]>("/api/credit-cards/summary");
  return Array.isArray(data) ? data : [];
}

/** POST /api/credit-cards · 신규 등록 */
export async function createCreditCard(input: CreateCreditCardInput): Promise<CreditCard> {
  const { data } = await api.post<CreditCard>("/api/credit-cards", input);
  return data;
}

/** PATCH /api/credit-cards/:id · 수정 */
export async function updateCreditCard(id: number, patch: UpdateCreditCardInput): Promise<CreditCard | null> {
  const { data } = await api.patch<CreditCard>(`/api/credit-cards/${id}`, patch);
  return data ?? null;
}

/** DELETE /api/credit-cards/:id · 삭제 (soft=1 · deactivate) */
export async function deleteCreditCard(id: number, soft = true): Promise<void> {
  await api.del(`/api/credit-cards/${id}${soft ? "?soft=1" : ""}`);
}
