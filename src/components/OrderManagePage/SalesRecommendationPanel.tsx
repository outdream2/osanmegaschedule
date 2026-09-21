// src/components/OrderManagePage/SalesRecommendationPanel.tsx
// 2026-09-10 · #46 · 사용자 지시 · 발주필요 우측 · 판매 추천 정보 패널
//   · 30일 판매 요약 · 예상 소진일 · 시나리오 (30/45/90일치) 발주량 [적용]
//   · 상품 상세 정보는 별도 모달 (onOpenDetail 트리거)
// 2026-09-13 · #55 · 상품 선택 무관 · 임박 이벤트 배너 (GET /api/events/today)
import React, { useEffect, useMemo, useState } from "react";
import { Package, TrendingUp, Info, X, Check, Sparkles, Calendar, AlertTriangle, Plus, ChevronDown, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { Card } from "../common/Card";
import { StatusPill } from "../common/StatusPill";
import { api } from "../../lib/apiClient";
// 2026-09-14 · 사용자 지시 · 유통기한 임박 상품 · 우측 판넬 표시 (여전히 안 나옴 → 신규 섹션)
import { listExpiryImminentProducts } from "../../lib/productsApi";
import type { ProductInfo } from "./OrderManagePage.types";
// 2026-09-18 · 사용자 지시 · (주)·주식회사 표시 정제
import { displayVendorName } from "../../utils/vendorNameNormalize";
// 2026-09-21 · #326 · 자동 판매추천 · 서브컴포넌트 (파일 사이즈 관리)
import { SalesAutoRecommendSection, type AutoRecoResponse } from "./SalesAutoRecommendSection";

// 2026-09-13 · #55 · 임박 이벤트 · GET /api/events/today
// 2026-09-14 · #85 · products 배열 · [발주 추가] 액션
interface EventProduct {
  product_code: string;
  product_name: string;
  current_stock: number | null;
  optimal_stock: number | null;
  supplier: string | null;
  category: string | null;
  sale_price: number | null;
  purchase_price: number | null;
  sale_status?: string | null;
}
interface EventToday {
  id: number;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  recurring: boolean;
  product_count?: number;
  products?: EventProduct[];
  d_day?: number | null;
}

// 2026-09-14 · 유통기한 임박 상품 · GET /api/products/expiry-imminent
interface ExpiryImminentProduct {
  product_code: string;
  product_name: string;
  spec: string | null;
  supplier: string | null;
  current_stock: number | null;
  expiry_date: string | null;
  sale_status?: string | null;
}

// 2026-09-21 · #326 · 자동 판매추천 · 타입은 SalesAutoRecommendSection 에서 import

const TYPE_TONE: Record<string, { label: string; cls: string }> = {
  spring:   { label: "봄",   cls: "bg-pink-50 border-pink-200 text-pink-700" },
  summer:   { label: "여름", cls: "bg-sky-50 border-sky-200 text-sky-700" },
  fall:     { label: "가을", cls: "bg-amber-50 border-amber-200 text-amber-700" },
  winter:   { label: "겨울", cls: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  holiday:  { label: "명절", cls: "bg-rose-50 border-rose-200 text-rose-700" },
  school:   { label: "수험생", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  custom:   { label: "이벤트", cls: "bg-violet-50 border-violet-200 text-violet-700" },
};

const dayDiff = (d: string | null): number | null => {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(String(d).slice(0, 10) + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / 86400000);
};

// 2026-09-18 · Phase 2 · accordion 상태 localStorage · key = salesRecPanel.expanded.{eventId}
const EXPAND_LS_PREFIX = "salesRecPanel.expanded.";
const loadExpandedFromLS = (ids: number[]): Set<number> => {
  const next = new Set<number>();
  try {
    for (const id of ids) {
      if (localStorage.getItem(`${EXPAND_LS_PREFIX}${id}`) === "1") next.add(id);
    }
  } catch { /* SSR·private-mode · 무시 */ }
  return next;
};
const persistExpandedLS = (id: number, expanded: boolean): void => {
  try {
    if (expanded) localStorage.setItem(`${EXPAND_LS_PREFIX}${id}`, "1");
    else localStorage.removeItem(`${EXPAND_LS_PREFIX}${id}`);
  } catch { /* 무시 */ }
};

// 2026-09-18 · Phase 1 · 오늘 날짜 · 한국식 표기 (2026년 9월 18일 금요일)
const formatKoreanDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  return `${y}년 ${m}월 ${day}일 ${weekdays[d.getDay()]}`;
};

/** 2026-09-14 · #87 · 스코어 기반 · 자동 추천 상품 */
export interface RecommendedProduct {
  product_code: string;
  product_name: string;
  current: number;
  optimal: number;
  score: number;
  reason: string;
  daysLeft: number;
  supplier: string | null;
}

interface Props {
  product: ProductInfo | null;
  saleMonth: number | null;
  saleQuarter: number | null;
  loading?: boolean;
  onApplyQty: (code: string, qty: number) => void;
  onOpenDetail: () => void;
  onClose: () => void;
  /** 2026-09-14 · #85 · 이벤트 상품 · [발주 추가] 버튼 · 콜백 */
  onRequestProduct?: (product_code: string, product_name: string) => void;
  /** 이미 발주 요청된 상품 코드 · 배지 표시용 */
  requestedCodes?: Set<string>;
  /** 2026-09-14 · #87 · 스코어 기반 · 자동 추천 상품 · Top N */
  recommendations?: RecommendedProduct[];
}

function formatQty(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "-";
}

export const SalesRecommendationPanel: React.FC<Props> = ({
  product, saleMonth, saleQuarter, loading, onApplyQty, onOpenDetail, onClose,
  onRequestProduct, requestedCodes, recommendations,
}) => {
  // 2026-09-13 · #55 · 임박 이벤트 · product 무관 · 상단 배너 (product null 시에도 표시)
  const [eventsToday, setEventsToday] = useState<EventToday[]>([]);
  // 2026-09-14 · #86 · 오늘 날짜 기준 · 계절 자동 판정 (서버 응답)
  const [currentSeason, setCurrentSeason] = useState<string>("");
  // 2026-09-14 · #85 · 이벤트별 · 상품 리스트 확장 상태 (accordion)
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  // 2026-09-14 · 사용자 지시 · 유통기한 임박 상품 · 우측 판넬 신규 섹션
  const [expiryImminent, setExpiryImminent] = useState<ExpiryImminentProduct[]>([]);
  // 2026-09-21 · #326 · 자동 판매추천 · 이벤트/계절 기간별
  const [autoReco, setAutoReco] = useState<AutoRecoResponse | null>(null);
  // 2026-09-14 · 사용자 지시 · 이벤트 추가 · 사용자가 이벤트 리스트에서 선택 가능
  //   · GET /api/events · 전체 이벤트 (지난·현재·향후) · 사용자 pick → eventsToday 에 병합
  //   · 원래 오늘 이벤트 (auto) 는 originalEventIds 로 추적 · 수동 추가된 것만 해제 가능
  const [allEvents, setAllEvents] = useState<EventToday[]>([]);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<string>("");
  const originalEventIdsRef = React.useRef<Set<number>>(new Set());
  const loadAllEvents = React.useCallback(async () => {
    try {
      const { data } = await api.get<{ rows?: EventToday[] }>(`/api/events`);
      setAllEvents(Array.isArray(data?.rows) ? data.rows : []);
    } catch {
      setAllEvents([]);
    }
  }, []);
  const openPicker = React.useCallback(() => {
    setShowEventPicker(true);
    if (allEvents.length === 0) void loadAllEvents();
  }, [allEvents.length, loadAllEvents]);
  const addPickedEvent = React.useCallback(async (ev: EventToday) => {
    if (eventsToday.some(e => e.id === ev.id)) return; // 이미 표시 중
    try {
      const { data } = await api.get<{ products?: EventProduct[] }>(`/api/events/${ev.id}/products`);
      const products = Array.isArray(data?.products) ? data.products : [];
      setEventsToday(prev => [...prev, { ...ev, products, product_count: products.length }]);
    } catch {
      setEventsToday(prev => [...prev, { ...ev, products: [], product_count: 0 }]);
    }
  }, [eventsToday]);
  const removePickedEvent = React.useCallback((id: number) => {
    // 원래 오늘 이벤트 (auto) 는 제거 불가 · 수동 추가된 것만 제거
    if (originalEventIdsRef.current.has(id)) return;
    setEventsToday(prev => prev.filter(e => e.id !== id));
  }, []);
  // 날짜별 필터 · pickerDate 있으면 · 그 날짜에 걸치는 이벤트만
  const filteredPickerEvents = useMemo(() => {
    if (!pickerDate) return allEvents;
    return allEvents.filter(e => {
      if (!e.start_date && !e.end_date) return false;
      const s = e.start_date ? String(e.start_date).slice(0, 10) : "";
      const en = e.end_date ? String(e.end_date).slice(0, 10) : s;
      return s <= pickerDate && pickerDate <= en;
    });
  }, [allEvents, pickerDate]);
  const toggleEventExpand = React.useCallback((id: number) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); persistExpandedLS(id, false); }
      else { next.add(id); persistExpandedLS(id, true); }
      return next;
    });
  }, []);
  // 2026-09-18 · Phase 2 · 편의 · 전체 펼치기·접기
  const expandAllEvents = React.useCallback(() => {
    setExpandedEvents(() => {
      const next = new Set<number>();
      for (const ev of eventsToday) {
        if ((ev.products?.length ?? ev.product_count ?? 0) > 0) {
          next.add(ev.id);
          persistExpandedLS(ev.id, true);
        }
      }
      return next;
    });
  }, [eventsToday]);
  const collapseAllEvents = React.useCallback(() => {
    setExpandedEvents(prev => {
      for (const id of prev) persistExpandedLS(id, false);
      return new Set<number>();
    });
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ events?: EventToday[]; current_season?: string }>(`/api/events/today`);
        if (alive) {
          const initEvents = Array.isArray(data?.events) ? data.events : [];
          setEventsToday(initEvents);
          setCurrentSeason(String(data?.current_season ?? ""));
          // 2026-09-14 · 원래 오늘 이벤트 ID 기록 · 수동 추가된 것과 구분 (제거 버튼 표시)
          originalEventIdsRef.current = new Set(initEvents.map(e => e.id));
          // 2026-09-18 · Phase 2 · 이전 세션 accordion 상태 복원
          setExpandedEvents(loadExpandedFromLS(initEvents.map(e => e.id)));
        }
      } catch {
        if (alive) { setEventsToday([]); setCurrentSeason(""); }
      }
      // 2026-09-14 · 유통기한 임박 상품 fetch · 병렬 · 실패 무시
      try {
        const list = await listExpiryImminentProducts<ExpiryImminentProduct[]>();
        if (alive) setExpiryImminent(Array.isArray(list) ? list : []);
      } catch {
        if (alive) setExpiryImminent([]);
      }
      // 2026-09-21 · #326 · 자동 판매추천 fetch · 실패 무시 (안전)
      try {
        const { data } = await api.get<AutoRecoResponse>(`/api/sales-auto-recommend?days=30`);
        if (alive) setAutoReco(data ?? null);
      } catch {
        if (alive) setAutoReco(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!product) {
    return (
      <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
        <Card padding="md" rounded="xl" className="flex-1 min-h-[400px] flex flex-col gap-3 overflow-y-auto">
          {/* 2026-09-18 · Phase 1 · 안내형 문구 · 오늘 날짜 + 진행 이벤트 요약 + 힌트 · 계절 배너 통합 */}
          <div className="flex flex-col gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-brand-tint/30 via-white to-emerald-50/30 border border-brand-tint/50">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-brand-deep shrink-0" strokeWidth={2.2} />
              <span className="text-[14px] font-bold text-ink tracking-tight">
                오늘은 <span className="tabular-nums">{formatKoreanDate(new Date())}</span>입니다
              </span>
            </div>
            <div className="text-[13px] text-ink-soft leading-relaxed">
              {(() => {
                const chips: React.ReactNode[] = [];
                if (currentSeason) {
                  const t = TYPE_TONE[currentSeason] ?? TYPE_TONE.custom;
                  chips.push(
                    <span key="season" className={`inline-flex items-center text-[12px] font-bold px-1.5 py-0.5 rounded-md ${t.cls}`}>
                      {t.label} 시즌
                    </span>
                  );
                }
                for (const ev of eventsToday) {
                  const t = TYPE_TONE[ev.type] ?? TYPE_TONE.custom;
                  const d = dayDiff(ev.start_date);
                  const suffix = d != null && d > 0 ? ` D-${d}` : "";
                  chips.push(
                    <span key={`ev-${ev.id}`} className={`inline-flex items-center text-[12px] font-bold px-1.5 py-0.5 rounded-md ${t.cls}`}>
                      {ev.name}{suffix}
                    </span>
                  );
                }
                if (chips.length === 0) {
                  return <span className="text-ink-soft">이 기간에 등록된 이벤트가 없습니다. 아래 [이벤트 추가] 로 선택할 수 있습니다.</span>;
                }
                return (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>이 기간은</span>
                    {chips.map((chip, i) => (
                      <React.Fragment key={i}>
                        {chip}
                        {i < chips.length - 1 && <span className="text-ink-soft/60">·</span>}
                      </React.Fragment>
                    ))}
                    <span>이벤트가 있습니다.</span>
                  </span>
                );
              })()}
            </div>
            {eventsToday.length > 0 && (
              <div className="flex items-center gap-1.5 text-[12px] text-brand-deep font-semibold">
                <ChevronDown size={12} strokeWidth={2.5} className="animate-pulse" />
                아래 이벤트를 클릭하면 추천 상품이 표시됩니다
              </div>
            )}
          </div>
          {/* 임박 이벤트 리스트 · 상단 (#55) */}
          {eventsToday.length > 0 && (() => {
            const expandableCount = eventsToday.filter(ev => (ev.products?.length ?? ev.product_count ?? 0) > 0).length;
            const allExpanded = expandableCount > 0 && expandedEvents.size >= expandableCount;
            return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 pb-1.5 border-b border-line">
                <Sparkles size={14} className="text-brand-deep" />
                <span className="text-[14px] font-bold text-ink">진행중·임박 이벤트</span>
                <span className="text-[12px] tabular-nums text-zinc-400 font-medium">{eventsToday.length}건</span>
                {expandableCount > 0 && (
                  <button
                    type="button"
                    onClick={allExpanded ? collapseAllEvents : expandAllEvents}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-line hover:border-brand-deep hover:bg-brand-tint/20 px-2 py-0.5 text-[11.5px] font-bold text-ink-soft hover:text-brand-deep transition"
                    title={allExpanded ? "전체 접기" : "전체 펼치기"}
                  >
                    {allExpanded ? <Minimize2 size={11} strokeWidth={2.5} /> : <Maximize2 size={11} strokeWidth={2.5} />}
                    {allExpanded ? "전체 접기" : "전체 펼치기"}
                  </button>
                )}
              </div>
              {eventsToday.map(ev => {
                const tone = TYPE_TONE[ev.type] ?? TYPE_TONE.custom;
                const d = dayDiff(ev.start_date);
                const isSoon = d != null && d > 0 && d <= 30;
                const isNow = d != null && d <= 0;
                const evProducts = ev.products ?? [];
                const productCount = evProducts.length || ev.product_count || 0;
                const isExpanded = expandedEvents.has(ev.id);
                const canExpand = productCount > 0;
                return (
                  <div key={ev.id} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => canExpand && toggleEventExpand(ev.id)}
                      disabled={!canExpand}
                      className={`flex items-center gap-2 flex-wrap px-2.5 py-1.5 rounded-lg border ${tone.cls} ${canExpand ? "cursor-pointer hover:brightness-95 transition" : "cursor-default"}`}
                    >
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white/60 border border-current/20 shrink-0">
                        {tone.label}
                      </span>
                      <span className="text-[14px] font-bold shrink-0">{ev.name}</span>
                      {ev.start_date && (
                        <span className="inline-flex items-center gap-1 text-[12px] shrink-0">
                          <Calendar size={11} />
                          {ev.start_date}
                          {ev.end_date && ev.end_date !== ev.start_date && ` ~ ${ev.end_date}`}
                        </span>
                      )}
                      {isNow && <StatusPill tone="rose" size="sm" dot pulse>진행중</StatusPill>}
                      {isSoon && <StatusPill tone="amber" size="sm">D-{d}</StatusPill>}
                      {productCount > 0 && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums">
                          상품 {productCount}개
                          {canExpand && (
                            isExpanded
                              ? <ChevronDown size={13} strokeWidth={2.5} className="transition-transform duration-200" />
                              : <ChevronRight size={13} strokeWidth={2.5} className="transition-transform duration-200" />
                          )}
                        </span>
                      )}
                    </button>
                    {/* 2026-09-14 · #85 · 이벤트 상품 리스트 · 확장 시 표시 · [발주 추가] 액션 */}
                    {isExpanded && evProducts.length > 0 && (
                      <div className="flex flex-col gap-1 pl-2 border-l-2 border-brand-tint/60 ml-2">
                        {evProducts.map(p => {
                          const cur = Number(p.current_stock ?? 0) || 0;
                          const opt = Number(p.optimal_stock ?? 0) || 0;
                          const shortage = Math.max(0, opt - cur);
                          const alreadyRequested = requestedCodes?.has(p.product_code) ?? false;
                          const isInactive = p.sale_status === "판매중지" || p.sale_status === "숨김";
                          return (
                            <div key={p.product_code} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-line hover:border-brand-tint hover:shadow-[0_1px_4px_rgba(10,46,74,0.05)] transition-all">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[13px] font-bold text-ink truncate">{p.product_name || p.product_code}</span>
                                  {isInactive && <StatusPill tone="zinc" size="xs">{p.sale_status}</StatusPill>}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-ink-soft tabular-nums mt-0.5">
                                  <span>재고 <span className="font-semibold text-ink">{cur}</span></span>
                                  <span>/ 적정 <span className="font-semibold text-ink">{opt}</span></span>
                                  {shortage > 0 && (
                                    <span className="text-rose-600 font-bold">부족 {shortage}</span>
                                  )}
                                  {p.supplier && <span className="truncate max-w-[80px]">· {displayVendorName(p.supplier) || p.supplier}</span>}
                                </div>
                              </div>
                              {onRequestProduct && !alreadyRequested && !isInactive && (
                                <button
                                  type="button"
                                  onClick={() => onRequestProduct(p.product_code, p.product_name)}
                                  className="inline-flex items-center gap-1 rounded-md bg-brand-deep hover:bg-brand-deep/90 px-2 py-1 text-[11px] font-bold text-white transition shrink-0"
                                  title="발주 필요 리스트에 추가"
                                >
                                  <Check size={11} strokeWidth={2.5} />
                                  발주
                                </button>
                              )}
                              {alreadyRequested && (
                                <StatusPill tone="emerald" size="xs" dot>요청됨</StatusPill>
                              )}
                              {isInactive && (
                                <StatusPill tone="zinc" size="xs">-</StatusPill>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 2026-09-14 · 사용자 지시 · 이벤트 추가 · 리스트에서 선택 (날짜 필터 포함) */}
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-brand-tint/60 hover:border-brand-deep hover:bg-brand-tint/10 px-2.5 py-1.5 text-[12px] font-bold text-brand-deep transition self-start"
                title="다른 이벤트 선택해서 추가"
              >
                <Plus size={12} strokeWidth={2.5} />
                이벤트 추가
              </button>
            </div>
            );
          })()}
          {/* 2026-09-14 · 사용자 지시 · 이벤트 추가 · 오늘 이벤트 없을 때도 · 버튼 표시 */}
          {eventsToday.length === 0 && (
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-brand-tint/60 hover:border-brand-deep hover:bg-brand-tint/10 px-2.5 py-1.5 text-[12px] font-bold text-brand-deep transition self-start"
              title="이벤트 리스트에서 선택"
            >
              <Plus size={12} strokeWidth={2.5} />
              이벤트 추가
            </button>
          )}
          {/* 2026-09-14 · 이벤트 선택 패널 · showEventPicker · 날짜 필터 + 이벤트 리스트 */}
          {showEventPicker && (
            <div className="flex flex-col gap-2 p-3 rounded-lg border border-brand-tint/60 bg-brand-tint/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-ink inline-flex items-center gap-1">
                  <Calendar size={12} className="text-brand-deep" />
                  이벤트 선택
                </span>
                <button
                  type="button"
                  onClick={() => setShowEventPicker(false)}
                  className="inline-flex items-center justify-center rounded-md hover:bg-white p-1 text-zinc-500 transition"
                  title="닫기"
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] font-semibold text-ink-soft">날짜 필터</label>
                <input
                  type="date"
                  value={pickerDate}
                  onChange={(e) => setPickerDate(e.target.value)}
                  className="text-[12px] rounded-md border border-line bg-white px-2 py-1 focus:outline-none focus:border-brand-deep"
                />
                {pickerDate && (
                  <button
                    type="button"
                    onClick={() => setPickerDate("")}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-700"
                  >
                    지우기
                  </button>
                )}
                <span className="ml-auto text-[11px] tabular-nums text-zinc-500">{filteredPickerEvents.length}건</span>
              </div>
              <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto pr-1">
                {filteredPickerEvents.length === 0 ? (
                  <div className="text-[12px] text-ink-soft text-center py-4">
                    {pickerDate ? "해당 날짜 이벤트 없음" : "등록된 이벤트 없음"}
                  </div>
                ) : (
                  filteredPickerEvents.map(ev => {
                    const isAdded = eventsToday.some(e => e.id === ev.id);
                    const isOriginal = originalEventIdsRef.current.has(ev.id);
                    const tone = TYPE_TONE[ev.type] ?? TYPE_TONE.custom;
                    return (
                      <div
                        key={ev.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-white border border-line hover:border-brand-tint transition-all ${
                          isAdded ? "opacity-60" : ""
                        }`}
                      >
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${tone.cls} shrink-0`}>
                          {tone.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-bold text-ink truncate">{ev.name}</div>
                          {(ev.start_date || ev.end_date) && (
                            <div className="text-[10.5px] tabular-nums text-ink-soft">
                              {ev.start_date ?? "?"} {ev.end_date && ev.end_date !== ev.start_date && `~ ${ev.end_date}`}
                            </div>
                          )}
                        </div>
                        {isAdded ? (
                          isOriginal ? (
                            <StatusPill tone="zinc" size="xs">진행중</StatusPill>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removePickedEvent(ev.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 hover:bg-zinc-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-zinc-600 transition"
                              title="제거"
                            >
                              <X size={10} strokeWidth={2.5} />
                              제거
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => void addPickedEvent(ev)}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-deep hover:bg-brand-deep/90 px-1.5 py-0.5 text-[10.5px] font-bold text-white transition"
                            title="추가"
                          >
                            <Plus size={10} strokeWidth={2.5} />
                            추가
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {/* 2026-09-21 · #326 · 자동 판매추천 (저수기 경고 + 이벤트 매칭 + 추천 상품 리스트) */}
          <SalesAutoRecommendSection
            autoReco={autoReco}
            requestedCodes={requestedCodes}
            onRequestProduct={onRequestProduct}
          />

          {/* 2026-09-14 · 사용자 지시 · 유통기한 임박 상품 · 발주필요 우측 판넬 · [발주 추가] 액션 */}
          {expiryImminent.length > 0 && (() => {
            const filtered = expiryImminent
              .filter(p => p.sale_status !== "판매중지" && p.sale_status !== "숨김")
              .map(p => ({ ...p, dLeft: dayDiff(p.expiry_date) }))
              .filter(p => p.dLeft != null && p.dLeft <= 60)
              .sort((a, b) => (a.dLeft ?? 999) - (b.dLeft ?? 999))
              .slice(0, 10);
            if (filtered.length === 0) return null;
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 pb-1.5 border-b border-line">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span className="text-[14px] font-bold text-ink">유통기한 임박</span>
                  <span className="text-[12px] tabular-nums text-zinc-400 font-medium">{filtered.length}건 · D-60 이내</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto pr-1">
                  {filtered.map(p => {
                    const d = p.dLeft ?? 999;
                    const isExpired = d <= 0;
                    const isSoon = d > 0 && d <= 14;
                    const tone: "rose" | "amber" | "zinc" = isExpired ? "rose" : isSoon ? "amber" : "zinc";
                    const alreadyRequested = requestedCodes?.has(p.product_code) ?? false;
                    const cur = Number(p.current_stock ?? 0) || 0;
                    return (
                      <div key={p.product_code} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white border border-line hover:border-brand-tint hover:shadow-[0_1px_4px_rgba(10,46,74,0.05)] transition-all">
                        <StatusPill tone={tone} size="xs">
                          {isExpired ? `D+${Math.abs(d)}` : `D-${d}`}
                        </StatusPill>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-bold text-ink truncate">{p.product_name || p.product_code}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-ink-soft tabular-nums mt-0.5">
                            <span>{p.expiry_date ? String(p.expiry_date).slice(0, 10) : "-"}</span>
                            <span>· 재고 <span className="font-semibold text-ink">{cur}</span></span>
                            {p.supplier && <span className="truncate max-w-[100px]">· {displayVendorName(p.supplier) || p.supplier}</span>}
                          </div>
                        </div>
                        {onRequestProduct && !alreadyRequested && (
                          <button
                            type="button"
                            onClick={() => onRequestProduct(p.product_code, p.product_name)}
                            className="inline-flex items-center gap-1 rounded-md bg-brand-deep hover:bg-brand-deep/90 px-2 py-1 text-[11px] font-bold text-white transition shrink-0"
                            title="발주 필요 리스트에 추가"
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
              </div>
            );
          })()}
          {/* 2026-09-14 · #87 · 스코어 기반 · 자동 추천 발주 Top N */}
          {recommendations && recommendations.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 pb-1.5 border-b border-line">
                <TrendingUp size={14} className="text-brand-deep" />
                <span className="text-[14px] font-bold text-ink">우선 발주 추천</span>
                <span className="text-[12px] tabular-nums text-zinc-400 font-medium">Top {recommendations.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {recommendations.map((r, idx) => {
                  const rankTone = idx === 0 ? "bg-rose-500 text-white" : idx === 1 ? "bg-amber-500 text-white" : idx === 2 ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-700";
                  const alreadyRequested = requestedCodes?.has(r.product_code) ?? false;
                  return (
                    <div key={r.product_code} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-line hover:border-brand-tint hover:shadow-[0_1px_4px_rgba(10,46,74,0.05)] transition-all">
                      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums ${rankTone}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-ink truncate">{r.product_name || r.product_code}</div>
                        <div className="flex items-center gap-2 text-[11px] text-ink-soft tabular-nums mt-0.5">
                          <span>재고 <span className="font-semibold text-ink">{r.current}</span></span>
                          <span>/ 적정 <span className="font-semibold text-ink">{r.optimal}</span></span>
                          {Number.isFinite(r.daysLeft) && r.daysLeft <= 30 && (
                            <span className="text-rose-600 font-bold">D{r.daysLeft <= 0 ? "-0" : `-${r.daysLeft}`}</span>
                          )}
                          <span className="text-brand-deep font-semibold ml-auto">{r.reason}</span>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-brand-deep tabular-nums bg-brand-tint/50 px-1.5 py-0.5 rounded-md" title="스코어">
                        {Math.round(r.score)}
                      </span>
                      {onRequestProduct && !alreadyRequested && (
                        <button
                          type="button"
                          onClick={() => onRequestProduct(r.product_code, r.product_name)}
                          className="inline-flex items-center gap-1 rounded-md bg-brand-deep hover:bg-brand-deep/90 px-2 py-1 text-[11px] font-bold text-white transition shrink-0"
                          title="발주 필요 리스트에 추가"
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
                스코어 = 재고부족율 + 소진임박 + 판매속도 + 이벤트 부스트
              </div>
            </div>
          )}
          {/* 상품 미선택 안내 · 추천/이벤트/유통기한 임박/자동추천 모두 없을 때만 */}
          {(!recommendations || recommendations.length === 0)
            && eventsToday.length === 0
            && expiryImminent.length === 0
            && (!autoReco || (autoReco.items.length === 0 && !autoReco.off_season)) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center min-h-[240px]">
              <TrendingUp size={40} className="text-zinc-300" strokeWidth={1.5} />
              <div className="text-[16px] font-bold text-ink">판매 추천 정보</div>
              <div className="text-[14px] text-ink-soft">상품을 선택하면<br/>추천 발주량이 표시됩니다</div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const code = String((product as any).product_code ?? (product as any).code ?? "");
  const name = String((product as any).product_name ?? (product as any).name ?? code);
  const cur = Number(product.current_stock ?? 0) || 0;
  const opt = Number(product.optimal_stock ?? 0) || 0;

  const s30 = typeof saleMonth === "number" && Number.isFinite(saleMonth) ? Math.max(0, saleMonth) : null;
  const s90 = typeof saleQuarter === "number" && Number.isFinite(saleQuarter) ? Math.max(0, saleQuarter) : null;
  const daily = s30 != null && s30 > 0 ? s30 / 30 : (s90 != null && s90 > 0 ? s90 / 90 : 0);
  const daysLeft = daily > 0 ? cur / daily : Infinity;

  const qty30 = s30 != null ? Math.max(0, Math.round(s30 - cur)) : Math.max(0, opt - cur);
  const qty45 = s30 != null ? Math.max(0, Math.round(s30 * 1.5 - cur)) : Math.max(0, Math.round((opt - cur) * 1.5));
  const qty90 = s90 != null ? Math.max(0, Math.round(s90 - cur)) : (s30 != null ? Math.max(0, Math.round(s30 * 3 - cur)) : Math.max(0, (opt - cur) * 3));

  const scenarios = [
    { label: "30일치", qty: qty30, tone: "zinc" as const, note: "안전 재고" },
    { label: "45일치", qty: qty45, tone: "amber" as const, note: "권장" },
    { label: "90일치", qty: qty90, tone: "emerald" as const, note: "여유 재고" },
  ];

  const toneBg = { zinc: "bg-zinc-50 border-zinc-200", amber: "bg-amber-50 border-amber-300", emerald: "bg-emerald-50 border-emerald-200" };
  const toneRing = { zinc: "hover:ring-zinc-300", amber: "hover:ring-amber-400", emerald: "hover:ring-emerald-300" };
  const toneBtn = { zinc: "bg-zinc-800 hover:bg-zinc-900", amber: "bg-amber-500 hover:bg-amber-600", emerald: "bg-emerald-600 hover:bg-emerald-700" };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1 min-w-0 lg:relative lg:p-0">
      <Card padding="md" rounded="xl" className="flex-1 min-h-[400px] flex flex-col gap-3">
        {/* 헤더 · 상품명 + [상세정보] · [닫기] */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
          <div className="min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight truncate">{name}</div>
            <div className="text-[13px] font-mono text-ink-soft mt-0.5">#{code}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenDetail}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 px-3 py-1.5 text-[13px] font-bold text-ink transition"
              title="상품 상세 정보"
            >
              <Package size={14} strokeWidth={2.2} />
              상세 정보
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg hover:bg-zinc-100 p-1.5 text-zinc-500 transition"
              title="닫기"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* 판매 요약 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-white px-3 py-2.5">
            <div className="text-[12px] font-bold text-ink-soft">최근 30일 판매</div>
            <div className="text-[20px] font-bold tabular-nums text-ink mt-0.5">{s30 != null ? s30.toLocaleString() : "-"}<span className="text-[13px] font-medium text-ink-soft ml-1">개</span></div>
            <div className="text-[12px] text-ink-soft mt-0.5">일평균 {daily > 0 ? daily.toFixed(1) : "-"}개</div>
          </div>
          <div className="rounded-lg border border-line bg-white px-3 py-2.5">
            <div className="text-[12px] font-bold text-ink-soft">예상 소진</div>
            <div className="text-[20px] font-bold tabular-nums text-ink mt-0.5">
              {Number.isFinite(daysLeft) ? Math.round(daysLeft).toLocaleString() : "-"}<span className="text-[13px] font-medium text-ink-soft ml-1">일 후</span>
            </div>
            <div className="text-[12px] text-ink-soft mt-0.5">현재고 {cur.toLocaleString()} / 적정 {opt.toLocaleString()}</div>
          </div>
        </div>

        {/* 시나리오 · 3개 */}
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
            <TrendingUp size={14} strokeWidth={2.2} />
            추천 발주량
          </div>
          {scenarios.map(s => (
            <div
              key={s.label}
              className={`rounded-lg border ${toneBg[s.tone]} px-3 py-2.5 flex items-center justify-between gap-3 hover:ring-2 ${toneRing[s.tone]} transition`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-bold text-ink">{s.label}</span>
                  <StatusPill tone={s.tone === "amber" ? "amber" : s.tone === "emerald" ? "emerald" : "zinc"} size="xs">{s.note}</StatusPill>
                </div>
                <div className="text-[12px] text-ink-soft mt-0.5">발주량 {s.qty.toLocaleString()}개</div>
              </div>
              <button
                type="button"
                onClick={() => onApplyQty(code, s.qty)}
                disabled={s.qty <= 0}
                className={`inline-flex items-center gap-1.5 rounded-lg ${toneBtn[s.tone]} disabled:bg-zinc-300 disabled:cursor-not-allowed px-3 py-1.5 text-[13px] font-bold text-white transition`}
                title={s.qty > 0 ? `수량 ${s.qty}로 적용` : "발주 필요 없음"}
              >
                <Check size={14} strokeWidth={2.5} />
                {formatQty(s.qty)} 적용
              </button>
            </div>
          ))}
        </div>

        {loading && (
          <div className="text-[12px] text-ink-soft italic">불러오는 중…</div>
        )}

        {s30 == null && s90 == null && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 text-[13px] text-amber-900">
            <Info size={14} strokeWidth={2.2} className="shrink-0 mt-0.5" />
            <div>최근 판매 데이터가 없어 · 적정재고 기준으로 계산합니다.</div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SalesRecommendationPanel;
