// src/components/OrderManagePage/SalesAutoRecommendSection.tsx
// 2026-09-21 · #326 · 자동 판매추천 · 이벤트/계절 기간별
//   · SalesRecommendationPanel 에서 분리 (파일 사이즈 관리 · framework audit)
//   · GET /api/sales-auto-recommend?days=30 응답 렌더링
//   · 저수기 경고 배너 + 이벤트 매칭 배지 + 추천 상품 리스트 (Top 15 · urgency)
import React from "react";
import { AlertTriangle, Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
import { StatusPill } from "../common/StatusPill";

// events.type → 색조 매핑 (SalesRecommendationPanel 와 동기 유지)
export const AUTO_RECO_TYPE_TONE: Record<string, { label: string; cls: string }> = {
  spring:  { label: "봄",     cls: "bg-pink-50 border-pink-200 text-pink-700" },
  summer:  { label: "여름",   cls: "bg-sky-50 border-sky-200 text-sky-700" },
  fall:    { label: "가을",   cls: "bg-amber-50 border-amber-200 text-amber-700" },
  winter:  { label: "겨울",   cls: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  holiday: { label: "명절",   cls: "bg-rose-50 border-rose-200 text-rose-700" },
  school:  { label: "수험생", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  custom:  { label: "이벤트", cls: "bg-violet-50 border-violet-200 text-violet-700" },
};

export interface AutoRecoItem {
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
  shortage: number;
  recommended_qty: number;
  category_weight: number;
  reason: string;
  urgency: "high" | "med" | "low";
}
export interface AutoRecoResponse {
  today: string;
  matched_events: Array<{
    id: number;
    name: string;
    type: string;
    start_date: string | null;
    end_date: string | null;
    recurring: boolean;
    d_day: number | null;
    triggerBefore: number;
    reason: string;
  }>;
  items: AutoRecoItem[];
  off_season: { label: string; reason: string } | null;
  total_matched: number;
}

interface Props {
  autoReco: AutoRecoResponse | null;
  requestedCodes?: Set<string>;
  onRequestProduct?: (code: string, name: string) => void;
  topN?: number;
}

/**
 * 판매추천 자동화 · 이벤트/계절 기간별 · 저수기 경고 + 매칭 이벤트 + 추천 상품 리스트
 * autoReco === null · 로딩 실패 or fetch 미완료 · 렌더 X
 * items.length === 0 && off_season === null · 렌더 X
 */
export const SalesAutoRecommendSection: React.FC<Props> = ({
  autoReco,
  requestedCodes,
  onRequestProduct,
  topN = 15,
}) => {
  const [open, setOpen] = React.useState<boolean>(true);

  if (!autoReco) return null;
  const hasItems = autoReco.items.length > 0;
  const hasOffSeason = !!autoReco.off_season;
  if (!hasItems && !hasOffSeason) return null;

  return (
    <>
      {/* 저수기 경고 배너 (amber) */}
      {hasOffSeason && autoReco.off_season && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2.2} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-amber-900">{autoReco.off_season.label}</div>
            <div className="text-[12px] text-amber-800 leading-relaxed mt-0.5">{autoReco.off_season.reason}</div>
          </div>
        </div>
      )}

      {/* 자동 판매추천 리스트 */}
      {hasItems && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-1.5 pb-1.5 border-b border-line w-full text-left hover:bg-brand-tint/10 rounded-t transition"
          >
            <Sparkles size={14} className="text-brand-deep" />
            <span className="text-[14px] font-bold text-ink">자동 판매추천</span>
            <span className="text-[12px] tabular-nums text-zinc-400 font-medium">
              {autoReco.total_matched}건 · 이벤트 {autoReco.matched_events.length}개 매칭
            </span>
            <span className="ml-auto text-brand-deep">
              {open ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
            </span>
          </button>
          {open && (
            <div className="flex flex-col gap-2">
              {/* 매칭 이벤트 배지 · reason */}
              <div className="flex flex-col gap-1">
                {autoReco.matched_events.map(ev => {
                  const tone = AUTO_RECO_TYPE_TONE[ev.type] ?? AUTO_RECO_TYPE_TONE.custom;
                  const d = ev.d_day;
                  return (
                    <div key={ev.id} className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg border ${tone.cls}`}>
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white/60 border border-current/20 shrink-0">
                        {tone.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-bold shrink-0">{ev.name}</span>
                          {d != null && d > 0 && <StatusPill tone="amber" size="xs">D-{d}</StatusPill>}
                          {d != null && d <= 0 && <StatusPill tone="rose" size="xs" dot pulse>진행중</StatusPill>}
                        </div>
                        <div className="text-[11px] mt-0.5 leading-relaxed opacity-90">{ev.reason}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 추천 상품 리스트 · Top N · urgency 색상 */}
              <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1">
                {autoReco.items.slice(0, topN).map(it => {
                  const urgencyTone: "rose" | "amber" | "zinc" =
                    it.urgency === "high" ? "rose" :
                    it.urgency === "med" ? "amber" : "zinc";
                  const urgencyLabel = it.urgency === "high" ? "긴급" : it.urgency === "med" ? "권장" : "여유";
                  const alreadyRequested = requestedCodes?.has(it.product_code) ?? false;
                  const evTone = AUTO_RECO_TYPE_TONE[it.event_type] ?? AUTO_RECO_TYPE_TONE.custom;
                  return (
                    <div key={`${it.event_id}-${it.product_code}`} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-line hover:border-brand-tint hover:shadow-[0_1px_4px_rgba(10,46,74,0.05)] transition-all">
                      <StatusPill tone={urgencyTone} size="xs">{urgencyLabel}</StatusPill>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-bold text-ink truncate">{it.product_name || "-"}</span>
                          <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${evTone.cls} shrink-0`}>{it.event_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-ink-soft tabular-nums mt-0.5">
                          <span>재고 <span className="font-semibold text-ink">{it.current_stock}</span></span>
                          <span>/ 적정 <span className="font-semibold text-ink">{it.optimal_stock}</span></span>
                          {it.avg_sale_30d > 0 && (
                            <span>· 30일 판매 <span className="font-semibold text-ink">{it.avg_sale_30d}</span></span>
                          )}
                          <span className="text-brand-deep font-bold ml-auto">추천 {it.recommended_qty}개</span>
                        </div>
                      </div>
                      {onRequestProduct && !alreadyRequested && (
                        <button
                          type="button"
                          onClick={() => onRequestProduct(it.product_code, it.product_name)}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-deep hover:bg-brand-deep/90 px-2 py-1 text-[11px] font-bold text-white transition shrink-0"
                          title={`발주 필요 리스트에 추가 · 추천 ${it.recommended_qty}개`}
                        >
                          <Check size={11} strokeWidth={2.5} />
                          발주
                        </button>
                      )}
                      {alreadyRequested && (
                        <StatusPill tone="emerald" size="xs" dot>요청됨</StatusPill>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10.5px] text-ink-soft/80 leading-relaxed">
                자동 추천 = 이벤트 카테고리 매칭 × 재고부족 × 30일 판매량 · urgency 정렬
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default SalesAutoRecommendSection;
