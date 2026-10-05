// server/routes/stock/salesAutoRecommend.ts
// 2026-09-21 · #326 · 판매추천 자동화 · 공휴일·이벤트·계절 기간별 자동 추천
//   · GET /api/sales-auto-recommend?days=30
//   · 사용자 지시 · 풀 스펙 · Q5=B
//
// **로직**
//   1. events 테이블 · 오늘 ~ D+days 범위 조회 (임박 이벤트)
//   2. 각 이벤트 · EVENT_CATEGORY_RULES 매칭 (eventType 별)
//   3. 규칙의 triggerBefore 이하 · 활성화 (D-N 도래 시점)
//   4. 규칙 categories 부분 매칭 상품 조회 (products WHERE category ILIKE '%키워드%')
//   5. 최근 30일 판매량 (stock_history.sale_qty) 조회 · 부족량 산출
//   6. urgency (high|med|low) · avg_sale · current_stock 기반 정렬
//   7. 반환 · [{ event, product_code, product_name, category, current_stock, avg_sale, recommended_qty, reason, urgency }]
//
// **원칙 준수**
//   · 원본 테이블 (events + products + stock_history) 활용 · 파생 테이블 X
//   · 파괴적 SQL X (READ-ONLY)
//   · no-store (발주 관련 · 캐시 절대 X)
//   · custom 이벤트 · 규칙 없음 → event_products 수동 매핑으로 폴백 (기존 /api/events/today 활용)
//     · 본 엔드포인트는 · 자동 규칙 매칭만 처리
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";
import {
  EVENT_CATEGORY_RULES,
  OFF_SEASON_RANGES,
  matchCategoryWeight,
  type EventCategoryRule,
  type OffSeasonRange,
} from "../../../src/lib/salesRecommendation/eventCategoryRules";
import { EventCategoryRulesPayloadSchema } from "../../../src/shared/schemas/eventCategoryRules";

const router = Router();

// ═══════════════════════════════════════════════════════════
// 2026-09-21 · #330 · KV 우선 규칙 로딩 + 60초 캐시
//   · app_settings.event_category_rules · JSON · null 시 하드코딩 SSOT fallback
//   · dev · NODE_ENV !== 'production' · no-cache (즉시 반영)
//   · POST/DELETE 후 · invalidateEventCategoryRulesCache() 호출
// ═══════════════════════════════════════════════════════════
const RULES_CACHE_TTL = 60 * 1000; // 60s
interface RulesCacheEntry {
  rules: EventCategoryRule[];
  offSeason: OffSeasonRange[];
  source: "kv" | "ssot";
  at: number;
}
let rulesCache: RulesCacheEntry | null = null;

export function invalidateEventCategoryRulesCache(): void {
  rulesCache = null;
}

async function loadRules(): Promise<{
  rules: EventCategoryRule[];
  offSeason: OffSeasonRange[];
  source: "kv" | "ssot";
}> {
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && rulesCache && Date.now() - rulesCache.at < RULES_CACHE_TTL) {
    return { rules: rulesCache.rules, offSeason: rulesCache.offSeason, source: rulesCache.source };
  }
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "event_category_rules")
      .maybeSingle();
    const raw = data?.value;
    if (raw && typeof raw === "object") {
      const parsed = EventCategoryRulesPayloadSchema.safeParse(raw);
      if (parsed.success) {
        const kvRules: EventCategoryRule[] = parsed.data.rules.map(r => ({
          eventType: r.eventType,
          triggerBefore: r.triggerBefore,
          categories: [...r.categories],
          weights: r.weights ? { ...r.weights } : undefined,
          reason: r.reason,
        }));
        const kvOff: OffSeasonRange[] = parsed.data.offSeason.map(o => ({
          monthStart: o.monthStart,
          monthEnd: o.monthEnd,
          dayEnd: o.dayEnd,
          label: o.label,
          reason: o.reason,
        }));
        const entry: RulesCacheEntry = {
          rules: kvRules,
          offSeason: kvOff,
          source: "kv",
          at: Date.now(),
        };
        rulesCache = entry;
        return { rules: entry.rules, offSeason: entry.offSeason, source: "kv" };
      }
      console.warn("[sales-auto-recommend] KV 규칙 · 검증 실패 · SSOT 폴백");
    }
  } catch (e: any) {
    console.warn("[sales-auto-recommend] KV 규칙 조회 실패 · SSOT 폴백 · " + (e?.message ?? "?"));
  }
  const entry: RulesCacheEntry = {
    rules: EVENT_CATEGORY_RULES.filter(r => r.eventType !== "custom"),
    offSeason: OFF_SEASON_RANGES,
    source: "ssot",
    at: Date.now(),
  };
  rulesCache = entry;
  return { rules: entry.rules, offSeason: entry.offSeason, source: "ssot" };
}

/** 저수기 판정 · KV/SSOT 통합 · isOffSeason 대체 */
function isOffSeasonFrom(ranges: OffSeasonRange[], date: Date = new Date()): OffSeasonRange | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const range of ranges) {
    if (month < range.monthStart || month > range.monthEnd) continue;
    if (range.dayEnd != null && day > range.dayEnd) continue;
    return range;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════
interface AutoRecoEvent {
  id: number;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  recurring: boolean;
  d_day: number | null;
  triggerBefore: number;
  reason: string;
}

interface AutoRecoItem {
  event_id: number;
  event_name: string;
  event_type: string;
  event_d_day: number | null;
  product_code: string;
  product_name: string;
  category: string | null;
  current_stock: number;
  optimal_stock: number;
  supplier: string | null;
  sale_status: string | null;
  avg_sale_30d: number;
  shortage: number;         // 적정 대비 부족량
  recommended_qty: number;  // 추천 발주량
  category_weight: number;  // 규칙 가중치
  reason: string;
  urgency: "high" | "med" | "low";
}

interface AutoRecoResponse {
  today: string;
  matched_events: AutoRecoEvent[];
  items: AutoRecoItem[];
  off_season: { label: string; reason: string } | null;
  total_matched: number;
}

// ═══════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════
function dayDiff(d: string | null | undefined): number | null {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(String(d).slice(0, 10) + "T00:00:00");
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  return diff;
}

function computeUrgency(
  current: number,
  optimal: number,
  avgSale30d: number,
): "high" | "med" | "low" {
  const daily = avgSale30d / 30;
  const daysLeft = daily > 0 ? current / daily : Infinity;
  const shortageRatio = optimal > 0 ? Math.max(0, (optimal - current) / optimal) : 0;

  // high · 소진임박 (7일 이내) or 심각한 부족 (부족율 ≥ 70%)
  if (daysLeft <= 7 || shortageRatio >= 0.7) return "high";
  // med · 소진임박 (30일 이내) or 부족 (부족율 ≥ 30%)
  if (daysLeft <= 30 || shortageRatio >= 0.3) return "med";
  return "low";
}

// ═══════════════════════════════════════════════════════════
// GET /api/sales-auto-recommend?days=30
// ═══════════════════════════════════════════════════════════
router.get("/api/sales-auto-recommend", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // 2026-09-21 · #330 · KV 우선 규칙 로딩 (60초 캐시 · dev no-cache)
  const { rules: activeRules, offSeason: offSeasonRanges, source: rulesSource } = await loadRules();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const daysParam = Math.max(1, Math.min(90, parseInt(String(req.query.days ?? "30"), 10) || 30));
  const horizon = new Date(now.getTime() + daysParam * 86400000).toISOString().slice(0, 10);

  // ─── 1. 이벤트 조회 · today ≤ end_date · start_date ≤ horizon · OR recurring 계절 ───
  //   · custom 은 규칙 없으니 · 서버 매칭에서 스킵 · 클라이언트가 event_products 로 처리
  const currentMonth = now.getMonth() + 1;
  const currentSeason =
    currentMonth >= 3 && currentMonth <= 5 ? "spring" :
    currentMonth >= 6 && currentMonth <= 8 ? "summer" :
    currentMonth >= 9 && currentMonth <= 11 ? "fall" : "winter";

  const { data: events, error: eErr } = await supabase
    .from("events")
    .select("*")
    .or(`and(recurring.eq.true,type.eq.${currentSeason}),and(start_date.lte.${horizon},end_date.gte.${today})`)
    .order("start_date", { ascending: true, nullsFirst: false });
  if (eErr) throw new HttpError(500, eErr.message, "DB_ERROR");

  const eventList = events ?? [];

  // ─── 2. 각 이벤트 · 규칙 매칭 · triggerBefore 이하 필터 ───
  const matchedEvents: Array<{ ev: any; rule: EventCategoryRule; d: number | null }> = [];
  for (const ev of eventList) {
    const rule = activeRules.find(r => r.eventType === String(ev.type ?? "").toLowerCase());
    if (!rule) continue; // custom · 매칭 안됨 스킵
    const d = dayDiff(ev.start_date);
    // recurring 계절 · start_date null · 항상 활성화
    // 임박 이벤트 · d ≤ triggerBefore · d ≥ 0 (진행중 포함)
    const isRecurringSeason = ev.recurring === true && ["spring", "summer", "fall", "winter"].includes(ev.type);
    const isTriggered = isRecurringSeason || (d != null && d <= rule.triggerBefore);
    if (!isTriggered) continue;
    matchedEvents.push({ ev, rule, d });
  }

  if (matchedEvents.length === 0) {
    const offSeason = isOffSeasonFrom(offSeasonRanges, now);
    const response: AutoRecoResponse = {
      today,
      matched_events: [],
      items: [],
      off_season: offSeason ? { label: offSeason.label, reason: offSeason.reason } : null,
      total_matched: 0,
    };
    return res.json(response);
  }

  // ─── 3. 매칭된 이벤트들의 카테고리 키워드 UNION · 상품 조회 ───
  const allKeywords = new Set<string>();
  for (const m of matchedEvents) {
    for (const kw of m.rule.categories) allKeywords.add(kw);
  }

  // products 조회 · category ILIKE '%kw%' · UNION
  // Supabase JS · or() 필터 · category.ilike.*kw* 여러 개 조합
  const orClauses = Array.from(allKeywords)
    .map(kw => `category.ilike.%${kw.replace(/[%,]/g, "")}%`)
    .join(",");

  const { data: prodRows, error: pErr } = await supabase
    .from("products")
    .select("product_code, product_name, category, current_stock, optimal_stock, purchase_price, sale_price, supplier, sale_status, hidden")
    .or(orClauses)
    .limit(5000);
  if (pErr) throw new HttpError(500, pErr.message, "DB_ERROR");

  const products = (prodRows ?? []).filter((p: any) => p.hidden !== true && p.sale_status !== "판매중지" && p.sale_status !== "숨김");
  const productCodes = products.map((p: any) => String(p.product_code ?? "").trim()).filter(Boolean);

  // ─── 4. 최근 30일 판매량 (stock_history.sale_qty) 조회 · 코드별 합계 ───
  const saleMap = new Map<string, number>();
  if (productCodes.length > 0) {
    const t = new Date();
    const c = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
    const cutoff = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
    const CHUNK = 500;
    for (let i = 0; i < productCodes.length; i += CHUNK) {
      const chunk = productCodes.slice(i, i + CHUNK);
      // 2026-10-04 · schema rename · sale_qty→sale_stock · snapshot_date→period_end
      const { data: sh, error: sErr } = await supabase
        .from("stock_history")
        .select("product_code, sale_stock, period_end")
        .in("product_code", chunk)
        .gte("period_end", cutoff);
      if (sErr) {
        // 테이블 없거나 접근 실패 · 조용히 스킵 (판매 데이터 없이도 재고 기준 추천 가능)
        console.warn(`[sales-auto-recommend] stock_history 조회 실패 · ${sErr.message}`);
        break;
      }
      for (const r of sh ?? []) {
        const code = String((r as any).product_code ?? "").trim();
        if (!code) continue;
        saleMap.set(code, (saleMap.get(code) ?? 0) + (Number((r as any).sale_stock ?? 0) || 0));
      }
    }
  }

  // ─── 5. 이벤트 × 상품 매칭 · 각 이벤트별 매칭 상품 목록 · urgency 계산 ───
  const items: AutoRecoItem[] = [];
  for (const m of matchedEvents) {
    for (const p of products) {
      const weight = matchCategoryWeight(p.category, m.rule);
      if (weight <= 0) continue;

      const current = Number(p.current_stock ?? 0) || 0;
      const optimal = Number(p.optimal_stock ?? 0) || 0;
      const avgSale30d = saleMap.get(p.product_code) ?? 0;

      // 추천 발주량 · 부족량 × weight · 최소 (optimal - current)
      const shortage = Math.max(0, optimal - current);
      // avg_sale 이 있으면 · 30일치 판매 예상 · 없으면 · 부족량만
      const forecastQty = avgSale30d > 0 ? Math.round(avgSale30d * weight) : shortage;
      const recommendedQty = Math.max(shortage, forecastQty);

      // 부족 없고 판매 없으면 · 스킵 (추천 의미 없음)
      if (recommendedQty <= 0) continue;

      const urgency = computeUrgency(current, optimal, avgSale30d);

      items.push({
        event_id: m.ev.id,
        event_name: m.ev.name,
        event_type: m.ev.type,
        event_d_day: m.d,
        product_code: p.product_code,
        product_name: p.product_name,
        category: p.category ?? null,
        current_stock: current,
        optimal_stock: optimal,
        supplier: p.supplier ?? null,
        sale_status: p.sale_status ?? null,
        avg_sale_30d: avgSale30d,
        shortage,
        recommended_qty: recommendedQty,
        category_weight: weight,
        reason: m.rule.reason,
        urgency,
      });
    }
  }

  // ─── 6. 정렬 · urgency desc · avg_sale desc · current_stock asc ───
  const URGENCY_RANK: Record<string, number> = { high: 3, med: 2, low: 1 };
  items.sort((a, b) => {
    const ur = (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0);
    if (ur !== 0) return ur;
    if (b.avg_sale_30d !== a.avg_sale_30d) return b.avg_sale_30d - a.avg_sale_30d;
    return a.current_stock - b.current_stock;
  });

  // ─── 7. 응답 ───
  const offSeason = isOffSeasonFrom(offSeasonRanges, now);
  const response: AutoRecoResponse = {
    today,
    matched_events: matchedEvents.map(m => ({
      id: m.ev.id,
      name: m.ev.name,
      type: m.ev.type,
      start_date: m.ev.start_date ?? null,
      end_date: m.ev.end_date ?? null,
      recurring: m.ev.recurring === true,
      d_day: m.d,
      triggerBefore: m.rule.triggerBefore,
      reason: m.rule.reason,
    })),
    items,
    off_season: offSeason ? { label: offSeason.label, reason: offSeason.reason } : null,
    total_matched: items.length,
  };

  console.log(`[sales-auto-recommend] today=${today} · matched_events=${matchedEvents.length} · items=${items.length} · off_season=${offSeason?.label ?? "-"} · rules=${rulesSource}`);
  res.json(response);
}));

export default router;
