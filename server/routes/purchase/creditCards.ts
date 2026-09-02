// server/routes/purchase/creditCards.ts
// 2026-09-02 · #69 · 카드 결제 관리 · CRUD + summary
//   · GET  /api/credit-cards           · 리스트 (active 필터 옵션)
//   · POST /api/credit-cards           · 신규 등록 (매니저+)
//   · PATCH /api/credit-cards/:id      · 수정
//   · DELETE /api/credit-cards/:id     · 삭제 (soft: active=false 권장 · 실삭제도 지원)
//   · GET  /api/credit-cards/summary   · 카드별 · 월별 결제 aggregation · 차월 예정
//   · 프레임워크 · asyncHandler + validateBody + HttpError

import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { HttpError, badRequest } from "../../middleware/errorHandler";
import {
  CreateCreditCardSchema,
  UpdateCreditCardSchema,
  type CreditCard,
  type CardSummary,
  type CardMonthlyEntry,
} from "../../../src/shared/schemas/creditCards";

const router = Router();

const SELECT_COLS = "id, issuer, alias, last4, billing_day, active, note, created_at, updated_at";

// ── GET /api/credit-cards ─────────────────────────────────────────
router.get("/api/credit-cards", authorize(1), asyncHandler(async (req, res) => {
  const onlyActive = req.query.active === "1";
  let q = supabase.from("credit_cards").select(SELECT_COLS).order("issuer").order("id");
  if (onlyActive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw new HttpError(500, `credit_cards 조회 실패: ${error.message}`);
  res.json(data ?? []);
}));

// ── POST /api/credit-cards ────────────────────────────────────────
router.post("/api/credit-cards", authorize(5), validateBody(CreateCreditCardSchema), asyncHandler(async (req, res) => {
  const body = req.body;
  const insert = {
    issuer:      String(body.issuer).trim(),
    alias:       body.alias ? String(body.alias).trim() : null,
    last4:       body.last4 && String(body.last4).length === 4 ? body.last4 : null,
    billing_day: Number(body.billing_day),
    active:      body.active !== false,
    note:        body.note ? String(body.note).trim() : null,
  };
  const { data, error } = await supabase.from("credit_cards").insert(insert).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, `카드 등록 실패: ${error.message}`);
  res.status(201).json(data);
}));

// ── PATCH /api/credit-cards/:id ───────────────────────────────────
router.patch("/api/credit-cards/:id", authorize(5), validateBody(UpdateCreditCardSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const body = req.body;
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.issuer      !== undefined) updates.issuer      = String(body.issuer).trim();
  if (body.alias       !== undefined) updates.alias       = body.alias ? String(body.alias).trim() : null;
  if (body.last4       !== undefined) updates.last4       = body.last4 && String(body.last4).length === 4 ? body.last4 : null;
  if (body.billing_day !== undefined) updates.billing_day = Number(body.billing_day);
  if (body.active      !== undefined) updates.active      = Boolean(body.active);
  if (body.note        !== undefined) updates.note        = body.note ? String(body.note).trim() : null;
  const { data, error } = await supabase.from("credit_cards").update(updates).eq("id", id).select(SELECT_COLS).single();
  if (error) throw new HttpError(500, `카드 수정 실패: ${error.message}`);
  res.json(data);
}));

// ── DELETE /api/credit-cards/:id ──────────────────────────────────
// soft=1 : active=false 만 (권장 · 결제 이력 유지)
// soft=0 : 실 삭제 (supplier_payments.card_id → NULL cascade)
router.delete("/api/credit-cards/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const soft = req.query.soft !== "0";
  if (soft) {
    const { error } = await supabase.from("credit_cards").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new HttpError(500, `카드 비활성화 실패: ${error.message}`);
    res.json({ ok: true, softDeleted: true });
  } else {
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) throw new HttpError(500, `카드 삭제 실패: ${error.message}`);
    res.json({ ok: true, hardDeleted: true });
  }
}));

// ── GET /api/credit-cards/summary · 카드별 aggregation ─────────────
//   · 최근 12개월 결제 · 카드별 monthly + 차월 예정 계산
//   · 차월 예정 = 결제일 D 기준 · (전월 D+1) ~ (이번 D) 사이 결제 = 다음 D에 청구
router.get("/api/credit-cards/summary", authorize(1), asyncHandler(async (_req, res) => {
  const { data: cards, error: cardsErr } = await supabase.from("credit_cards").select(SELECT_COLS).eq("active", true);
  if (cardsErr) throw new HttpError(500, `카드 조회 실패: ${cardsErr.message}`);

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);   // 12개월 전 1일
  const { data: pays, error: paysErr } = await supabase
    .from("supplier_payments")
    .select("id, card_id, amount, payment_date")
    .not("card_id", "is", null)
    .gte("payment_date", start.toISOString().slice(0, 10));
  if (paysErr) throw new HttpError(500, `결제 조회 실패: ${paysErr.message}`);

  const payList = (pays ?? []) as Array<{ card_id: number; amount: number; payment_date: string }>;

  // 카드별 · 월별 aggregation
  const summaries: CardSummary[] = (cards ?? []).map((c: any) => {
    const card = c as CreditCard;
    const cardPays = payList.filter(p => p.card_id === card.id);
    const monthly = new Map<string, CardMonthlyEntry>();
    // seed 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly.set(key, { month: key, amount: 0, count: 0 });
    }
    let totalAmount = 0;
    for (const p of cardPays) {
      const key = String(p.payment_date).slice(0, 7);
      const cur = monthly.get(key);
      if (cur) { cur.amount += Number(p.amount) || 0; cur.count += 1; }
      totalAmount += Number(p.amount) || 0;
    }

    // 결제일 window 계산
    // - 이번달 결제 예정 · 결제일 D · 아직 도래 안 함 · 매입일 (prev D+1 ~ 이번 D)
    // - 차월 결제 예정 · 매입일 (이번 D+1 ~ 다음 D)
    const day  = card.billing_day;
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-index
    const thisD = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
    const nextD = new Date(y, m + 1, Math.min(day, new Date(y, m + 2, 0).getDate()));
    const prevD = new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate()));

    const currentAmt = cardPays.filter(p => {
      const pd = p.payment_date;
      return pd > prevD.toISOString().slice(0, 10) && pd <= thisD.toISOString().slice(0, 10);
    }).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const nextAmt = cardPays.filter(p => {
      const pd = p.payment_date;
      return pd > thisD.toISOString().slice(0, 10) && pd <= nextD.toISOString().slice(0, 10);
    }).reduce((s, p) => s + (Number(p.amount) || 0), 0);

    return {
      card,
      totalAmount,
      totalCount: cardPays.length,
      monthly: Array.from(monthly.values()),
      currentBillingAmount: currentAmt,
      currentBillingDate: thisD.toISOString().slice(0, 10),
      nextBillingAmount: nextAmt,
      nextBillingDate: nextD.toISOString().slice(0, 10),
    };
  });

  res.json(summaries);
}));

export default router;
