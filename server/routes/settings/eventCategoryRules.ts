// server/routes/settings/eventCategoryRules.ts
// 2026-09-21 · #330 · 발주·판매 추천 관리자 편집 UI · KV 저장 + CRUD
//   · GET    /api/settings/event-category-rules · 조회 · 로그인 필요 (관리자·매니저 UI 노출)
//   · POST   /api/settings/event-category-rules · 저장 · authorize(9)
//   · DELETE /api/settings/event-category-rules · 원본 SSOT 복원 · authorize(9)
//
// **저장 형태**
//   · app_settings.event_category_rules · JSONB
//   · { rules: [...], offSeason: [...] } · null 이면 · 하드코딩 SSOT 사용
//
// **정합성 원칙**
//   · Zod 검증 (server/shared/schemas/eventCategoryRules)
//   · KV upsert · onConflict: "key"
//   · POST/DELETE 후 · sales-auto-recommend 캐시 무효화 (invalidateRulesCache)
//
// **주의**
//   · rules 배열은 eventType 중복 불가 (서버측 dedupe · 뒤에 온 값 우선)
//   · 하드코딩 SSOT · 언제나 fallback · KV null·error 시 자동 복귀
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authorize } from "../../middleware/requireAuth";
import { HttpError } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import {
  EventCategoryRulesPayloadSchema,
  type EventCategoryRulesPayload,
} from "../../../src/shared/schemas/eventCategoryRules";
import {
  EVENT_CATEGORY_RULES,
  OFF_SEASON_RANGES,
} from "../../../src/lib/salesRecommendation/eventCategoryRules";
import { invalidateEventCategoryRulesCache } from "../stock/salesAutoRecommend";

const router = Router();

export const EVENT_RULES_KV_KEY = "event_category_rules";

/** 하드코딩 SSOT · 응답용 payload */
function ssotPayload(): EventCategoryRulesPayload {
  return {
    rules: EVENT_CATEGORY_RULES.map(r => ({
      eventType: r.eventType as any,
      triggerBefore: r.triggerBefore,
      categories: [...r.categories],
      weights: r.weights ? { ...r.weights } : undefined,
      reason: r.reason,
    })).filter(r => r.eventType !== "custom") as EventCategoryRulesPayload["rules"],
    offSeason: OFF_SEASON_RANGES.map(o => ({
      monthStart: o.monthStart,
      monthEnd: o.monthEnd,
      dayEnd: o.dayEnd,
      label: o.label,
      reason: o.reason,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// GET /api/settings/event-category-rules
//   · KV 조회 · 없으면 하드코딩 SSOT 반환
//   · source · "kv" | "ssot"
// ─────────────────────────────────────────────────────────────
router.get(
  "/api/settings/event-category-rules",
  asyncHandler(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value, updated_at")
        .eq("key", EVENT_RULES_KV_KEY)
        .maybeSingle();
      if (error) throw new HttpError(500, error.message, "DB_ERROR");
      const raw = data?.value;
      if (raw && typeof raw === "object") {
        const parsed = EventCategoryRulesPayloadSchema.safeParse(raw);
        if (parsed.success) {
          return res.json({
            source: "kv" as const,
            updated_at: data?.updated_at ?? null,
            ...parsed.data,
          });
        }
        console.warn("[event-category-rules] KV 저장값 검증 실패 · SSOT 폴백 · " + parsed.error.message);
      }
      // KV 미설정 or 검증 실패 · 하드코딩 SSOT
      return res.json({
        source: "ssot" as const,
        updated_at: null,
        ...ssotPayload(),
      });
    } catch (e: any) {
      console.error("[event-category-rules GET] " + (e?.message ?? "unknown"));
      // 마지막 안전망 · 하드코딩 SSOT
      return res.json({
        source: "ssot" as const,
        updated_at: null,
        ...ssotPayload(),
      });
    }
  }),
);

// ─────────────────────────────────────────────────────────────
// POST /api/settings/event-category-rules · authorize(9)
//   · body · { rules: [...], offSeason: [...] }
//   · Zod validate + eventType dedupe
//   · 캐시 무효화
// ─────────────────────────────────────────────────────────────
router.post(
  "/api/settings/event-category-rules",
  authorize(9),
  validateBody(EventCategoryRulesPayloadSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as EventCategoryRulesPayload;

    // eventType 중복 제거 · 뒤에 온 값 우선 (last-write-wins)
    const map = new Map<string, EventCategoryRulesPayload["rules"][number]>();
    for (const r of body.rules) map.set(r.eventType, r);
    const rules = Array.from(map.values());

    const value: EventCategoryRulesPayload = {
      rules,
      offSeason: body.offSeason,
    };

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: EVENT_RULES_KV_KEY,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new HttpError(500, error.message, "DB_ERROR");

    invalidateEventCategoryRulesCache();
    console.log(
      `[event-category-rules POST] rules=${rules.length} · offSeason=${value.offSeason.length}`,
    );
    res.json({ ok: true, source: "kv" as const, ...value });
  }),
);

// ─────────────────────────────────────────────────────────────
// DELETE /api/settings/event-category-rules · authorize(9)
//   · KV row 삭제 → 하드코딩 SSOT 로 자동 복귀
// ─────────────────────────────────────────────────────────────
router.delete(
  "/api/settings/event-category-rules",
  authorize(9),
  asyncHandler(async (_req, res) => {
    const { error } = await supabase
      .from("app_settings")
      .delete()
      .eq("key", EVENT_RULES_KV_KEY);
    if (error) throw new HttpError(500, error.message, "DB_ERROR");

    invalidateEventCategoryRulesCache();
    console.log("[event-category-rules DELETE] KV row 삭제 · SSOT 복귀");
    res.json({ ok: true, source: "ssot" as const, ...ssotPayload() });
  }),
);

export default router;
