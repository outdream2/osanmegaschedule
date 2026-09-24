// src/components/SeasonSettingsPage/SeasonProductsAccordion.tsx
// 2026-09-18 · 계절 정의 탭 · 계절별 추천 상품 매핑 UI (accordion)
//   · 봄·여름·가을·겨울 · 각 계절 카드 · 접기·펼치기 (localStorage)
//   · 확장 시 · 해당 계절 recurring event 를 EventProductPanel 로 재사용
//   · 매핑 상품 개수 배지 · 실시간
//   · 발주필요 판넬 (GET /api/events/today) 은 자동 반영 (기존 인프라 재사용)
// 2026-09-24 · #353 · [상품추가] 버튼 + ProductSearchMultiAddModal 통합
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Package, RefreshCw, AlertTriangle, Plus } from "lucide-react";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { Spinner } from "../common/Spinner";
import { useToast, toastClass } from "../../hooks/useToast";
import {
  SEASON_EMOJI,
  SEASON_LABEL,
  type SeasonKey,
} from "../../hooks/useSeasonRanges";
import { seasonKeyToEventType, SEASON_KEYS } from "../../lib/seasonEventMap";
import { EventProductPanel, type EventLite } from "./EventProductPanel";
import { ProductSearchMultiAddModal } from "./ProductSearchMultiAddModal";

const SEASON_TONE: Record<SeasonKey, { headerBg: string; text: string; ring: string; accent: string }> = {
  spring: { headerBg: "bg-pink-50",   text: "text-pink-700",   ring: "ring-pink-200",   accent: "bg-pink-500" },
  summer: { headerBg: "bg-amber-50",  text: "text-amber-700",  ring: "ring-amber-200",  accent: "bg-amber-500" },
  autumn: { headerBg: "bg-orange-50", text: "text-orange-700", ring: "ring-orange-200", accent: "bg-orange-500" },
  winter: { headerBg: "bg-sky-50",    text: "text-sky-700",    ring: "ring-sky-200",    accent: "bg-sky-500" },
};

const STORAGE_KEY_PREFIX = "seasonProducts.expanded.";

function readExpanded(season: SeasonKey): boolean {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${season}`);
    return raw === "1";
  } catch { return false; }
}
function writeExpanded(season: SeasonKey, v: boolean) {
  try { localStorage.setItem(`${STORAGE_KEY_PREFIX}${season}`, v ? "1" : "0"); } catch { /* silent */ }
}

interface Props {
  /** 부모에서 계절정의 저장 성공 시 · 이 값을 증가 → 이벤트 재조회 트리거 */
  refreshTick?: number;
}

export const SeasonProductsAccordion: React.FC<Props> = ({ refreshTick = 0 }) => {
  const [events, setEvents] = useState<EventLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<SeasonKey, boolean>>(() => ({
    spring: readExpanded("spring"),
    summer: readExpanded("summer"),
    autumn: readExpanded("autumn"),
    winter: readExpanded("winter"),
  }));
  const [productCounts, setProductCounts] = useState<Record<number, number>>({});
  // #353 · [상품추가] 모달 상태
  const [addModal, setAddModal] = useState<{ season: SeasonKey; eventId: number; eventName: string } | null>(null);
  const { toast, showError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ rows?: EventLite[] }>("/api/events");
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setEvents(rows);
      // 배지용 · 매핑 상품 개수 병렬 조회
      const seasonEventIds = rows
        .filter(e => (e.type === "spring" || e.type === "summer" || e.type === "fall" || e.type === "winter") && e.recurring)
        .map(e => e.id);
      if (seasonEventIds.length > 0) {
        void loadCounts(seasonEventIds);
      }
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      showError(`이벤트 목록 로드 실패: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadCounts = useCallback(async (ids: number[]) => {
    try {
      const results = await Promise.all(
        ids.map(async id => {
          try {
            const { data } = await api.get<{ products?: any[] }>(`/api/events/${id}/products`);
            return [id, (data?.products ?? []).length] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      const map: Record<number, number> = {};
      for (const [id, n] of results) map[id] = n;
      setProductCounts(prev => ({ ...prev, ...map }));
    } catch { /* silent · 배지는 optional */ }
  }, []);

  useEffect(() => { void load(); }, [load, refreshTick]);

  // SeasonKey → 해당 recurring event (첫 번째 · 없으면 null)
  const seasonEventMap = useMemo<Record<SeasonKey, EventLite | null>>(() => {
    const map: Record<SeasonKey, EventLite | null> = {
      spring: null, summer: null, autumn: null, winter: null,
    };
    for (const s of SEASON_KEYS) {
      const targetType = seasonKeyToEventType(s);
      const found = events
        .filter(e => e.type === targetType && e.recurring)
        .sort((a, b) => {
          const sa = a.start_date ?? "";
          const sb = b.start_date ?? "";
          if (sa === sb) return (a.id ?? 0) - (b.id ?? 0);
          return sa.localeCompare(sb);
        })[0] ?? null;
      map[s] = found;
    }
    return map;
  }, [events]);

  const toggleSeason = useCallback(async (season: SeasonKey) => {
    const next = !expanded[season];
    setExpanded(prev => ({ ...prev, [season]: next }));
    writeExpanded(season, next);
    // 확장 시 · 이벤트 없으면 자동 ensure 시도 (관리자가 계절정의 저장 안 한 경우 대비)
    if (next && !seasonEventMap[season]) {
      try {
        await api.post("/api/events/seasons/ensure", {});
        await load();
      } catch (e) {
        showError(`계절 이벤트 생성 실패: ${getErrorMessage(e)}`);
      }
    }
  }, [expanded, load, showError, seasonEventMap]);

  const handleCountChange = useCallback((eventId: number, count: number) => {
    setProductCounts(prev => ({ ...prev, [eventId]: count }));
  }, []);

  // #353 · [상품추가] 버튼 클릭 핸들러
  const handleOpenAddModal = useCallback((
    e: React.MouseEvent,
    season: SeasonKey,
    ev: EventLite,
  ) => {
    // 아코디언 toggle 이벤트 전파 차단
    e.stopPropagation();
    setAddModal({ season, eventId: ev.id, eventName: ev.name });
  }, []);

  // 추가 완료 후 · 해당 계절 카운트 갱신 + 아코디언 자동 확장
  const handleAdded = useCallback(async (season: SeasonKey, eventId: number, codes: string[]) => {
    setProductCounts(prev => ({
      ...prev,
      [eventId]: (prev[eventId] ?? 0) + codes.length,
    }));
    // 해당 계절 accordion 자동 확장
    setExpanded(prev => {
      if (prev[season]) return prev;
      const next = { ...prev, [season]: true };
      writeExpanded(season, true);
      return next;
    });
    setAddModal(null);
    // 정확한 카운트를 위해 해당 이벤트 재조회
    void loadCounts([eventId]);
  }, [loadCounts]);

  const totalMapped = useMemo(() => {
    return SEASON_KEYS.reduce((sum, s) => {
      const ev = seasonEventMap[s];
      if (!ev) return sum;
      return sum + (productCounts[ev.id] ?? 0);
    }, 0);
  }, [seasonEventMap, productCounts]);

  // ── 헤더 안내 ────────────────────────────────────────
  return (
    <section
      className="bg-white rounded-2xl border border-line overflow-hidden mt-4"
      style={{ boxShadow: "0 1px 2px rgba(10,46,74,0.04), 0 4px 12px -4px rgba(10,46,74,0.06)" }}
    >
      <div className="h-1 bg-gradient-to-r from-pink-400 via-amber-400 via-orange-400 to-sky-400" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-[21px] font-extrabold text-ink tracking-tight leading-tight">
              계절별 추천 상품
            </h3>
            <p className="text-[16px] text-ink-soft leading-relaxed mt-1">
              각 계절마다 · 추천 상품 목록을 관리합니다. 발주필요 페이지 우측 판넬에 자동 노출됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 text-[13px] font-bold text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1 tabular-nums">
              <Package size={12} className="text-zinc-400" />
              총 {totalMapped}개 매핑
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="w-8 h-8 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer disabled:opacity-40"
              title="새로고침"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <Spinner tone="zinc" label="로딩 중..." labelSize={13} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[14px] text-rose-700">
            <AlertTriangle size={14} />
            <span>이벤트 목록 로드 실패: {error}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {SEASON_KEYS.map(season => {
              const tone = SEASON_TONE[season];
              const isOpen = expanded[season];
              const ev = seasonEventMap[season];
              const cnt = ev ? (productCounts[ev.id] ?? 0) : 0;
              return (
                <div
                  key={season}
                  className={`rounded-xl border border-zinc-200 bg-white overflow-hidden ${isOpen ? `ring-1 ${tone.ring}` : ""}`}
                >
                  {/* 헤더 · 클릭 · 접기·펼치기 + [상품추가] 버튼 */}
                  <div className={`flex items-center gap-0 ${tone.headerBg}`}>
                    {/* 아코디언 토글 영역 · flex-1 */}
                    <button
                      type="button"
                      onClick={() => void toggleSeason(season)}
                      className="flex-1 flex items-center gap-3 px-4 py-3 hover:brightness-95 transition cursor-pointer text-left min-w-0"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronDown size={18} className={`shrink-0 ${tone.text}`} />
                      ) : (
                        <ChevronRight size={18} className={`shrink-0 ${tone.text}`} />
                      )}
                      <span className="text-[22px] shrink-0" aria-hidden>{SEASON_EMOJI[season]}</span>
                      <span className={`text-[17px] font-extrabold ${tone.text}`}>
                        {SEASON_LABEL[season]}
                      </span>
                      <span className={`ml-auto inline-flex items-center gap-1 text-[13px] font-bold ${tone.text} bg-white/70 border border-current/20 rounded-md px-2 py-0.5 tabular-nums shrink-0`}>
                        <Package size={11} />
                        {cnt}개 추천
                      </span>
                    </button>
                    {/* [상품추가] 버튼 · 우측 분리 */}
                    {ev && (
                      <button
                        type="button"
                        onClick={e => handleOpenAddModal(e, season, ev)}
                        className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 mr-3 text-[12px] font-bold bg-white/80 hover:bg-white border border-current/20 ${tone.text} rounded-lg transition cursor-pointer`}
                        title={`${SEASON_LABEL[season]} · 상품 추가`}
                      >
                        <Plus size={12} strokeWidth={2.5} />
                        상품추가
                      </button>
                    )}
                  </div>

                  {/* 콘텐츠 · 확장 시 · EventProductPanel */}
                  {isOpen && (
                    <div className="border-t border-zinc-100 bg-white">
                      {ev ? (
                        <div className="min-h-[420px] max-h-[70vh] flex">
                          <EventProductPanel
                            event={ev}
                            events={events}
                            onCountChange={handleCountChange}
                          />
                        </div>
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <div className="text-[14px] text-zinc-500 mb-2">
                            이 계절에 연결된 이벤트가 없습니다.
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await api.post("/api/events/seasons/ensure", {});
                                await load();
                              } catch (e) {
                                showError(`계절 이벤트 생성 실패: ${getErrorMessage(e)}`);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 h-8 px-4 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] text-white rounded-lg shadow-sm cursor-pointer transition"
                          >
                            자동 생성
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}

      {/* #353 · 다중 선택 상품 추가 모달 */}
      {addModal && (
        <ProductSearchMultiAddModal
          open
          onClose={() => setAddModal(null)}
          eventId={addModal.eventId}
          eventName={addModal.eventName}
          onAdded={codes => void handleAdded(addModal.season, addModal.eventId, codes)}
          // 이 컴포넌트는 productCounts(개수)만 보유 · 실제 코드 목록은 EventProductPanel 이 가짐
          // 서버 POST 에서 중복 자동 스킵 · 빈 Set 전달 시에도 서버 중복 방지 동작
          alreadyMappedCodes={new Set<string>()}
        />
      )}
    </section>
  );
};

export default SeasonProductsAccordion;
