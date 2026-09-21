// src/components/SystemSettingsPage/EventCategoryRulesEditor.tsx
// 2026-09-21 · #330 · 발주·판매 추천 관리자 편집 UI
//   · GET/POST/DELETE · /api/settings/event-category-rules
//   · 이벤트 타입별 (spring/summer/fall/winter/holiday/school) 규칙 편집
//   · 저수기 (2월·8월 초) 편집
//   · SSOT 복원 버튼 (KV row 삭제 → 하드코딩 SSOT 로 복귀)
//
// 프레임워크 준수
//   · api / ApiError · useToast · useConfirm · SectionCard
//   · SET_INPUT · SET_TEXTAREA · SET_LABEL · SET_BTN_* · SET_NOTICE_*
//   · KO_INPUT_PROPS · 한글 IME 우선
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash, ArrowsClockwise, FloppyDisk, Warning, X } from "@phosphor-icons/react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { SectionCard } from "../common/SectionCard";
import { Spinner } from "../common/Spinner";
import {
  SET_INPUT,
  SET_TEXTAREA,
  SET_LABEL,
  SET_BTN_PRIMARY,
  SET_BTN_SECONDARY,
  SET_NOTICE_ROSE,
  SET_NOTICE_EMERALD,
} from "../../lib/settingsTypography";
import { KO_INPUT_PROPS } from "../../lib/koreanInput";
import {
  SALES_RECO_EVENT_TYPES,
  type EventCategoryRuleInput,
  type OffSeasonRangeInput,
  type EventCategoryRulesPayload,
} from "../../shared/schemas/eventCategoryRules";

type EventType = (typeof SALES_RECO_EVENT_TYPES)[number];

interface ApiResponse extends EventCategoryRulesPayload {
  source: "kv" | "ssot";
  updated_at: string | null;
}

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  spring: "봄 (spring)",
  summer: "여름 (summer)",
  fall: "가을 (fall)",
  winter: "겨울 (winter)",
  holiday: "명절 (holiday)",
  school: "학생·수험생 (school)",
};

const EMPTY_RULE = (eventType: EventType): EventCategoryRuleInput => ({
  eventType,
  triggerBefore: 14,
  categories: [],
  weights: {},
  reason: "",
});

const EMPTY_OFF: OffSeasonRangeInput = {
  monthStart: 1,
  monthEnd: 1,
  dayEnd: undefined,
  label: "",
  reason: "",
};

// ═════════════════════════════════════════════════════════════
// 개별 이벤트 규칙 편집 카드
// ═════════════════════════════════════════════════════════════
interface RuleCardProps {
  rule: EventCategoryRuleInput;
  onChange: (next: EventCategoryRuleInput) => void;
  onRemove: () => void;
}

const RuleCard: React.FC<RuleCardProps> = React.memo(({ rule, onChange, onRemove }) => {
  const [categoriesText, setCategoriesText] = useState<string>(rule.categories.join(", "));
  // rule.categories 외부 변경 시 (SSOT 복원 등) · 텍스트 동기화
  useEffect(() => {
    setCategoriesText(rule.categories.join(", "));
  }, [rule.categories]);

  const commitCategories = useCallback(
    (raw: string) => {
      const list = raw
        .split(/[,，]/)
        .map(s => s.trim())
        .filter(Boolean)
        .slice(0, 30);
      onChange({ ...rule, categories: list });
    },
    [onChange, rule],
  );

  const weightKeys = useMemo(() => Object.keys(rule.weights ?? {}), [rule.weights]);

  const setWeight = useCallback(
    (key: string, next: number | null) => {
      const w = { ...(rule.weights ?? {}) };
      if (next == null || Number.isNaN(next)) {
        delete w[key];
      } else {
        w[key] = next;
      }
      onChange({ ...rule, weights: Object.keys(w).length > 0 ? w : undefined });
    },
    [onChange, rule],
  );

  const renameWeightKey = useCallback(
    (oldKey: string, newKey: string) => {
      const trimmed = newKey.trim();
      const w = { ...(rule.weights ?? {}) };
      const value = w[oldKey];
      delete w[oldKey];
      if (trimmed) w[trimmed] = value;
      onChange({ ...rule, weights: Object.keys(w).length > 0 ? w : undefined });
    },
    [onChange, rule],
  );

  const addWeight = useCallback(() => {
    const w = { ...(rule.weights ?? {}) };
    let idx = 1;
    let key = `키워드${idx}`;
    while (w[key] != null) {
      idx += 1;
      key = `키워드${idx}`;
    }
    w[key] = 1.2;
    onChange({ ...rule, weights: w });
  }, [onChange, rule]);

  return (
    <div className="rounded-xl border border-line bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-tint text-brand-deep text-[12px] font-bold">
            {EVENT_TYPE_LABEL[rule.eventType]}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-600 hover:bg-rose-50 rounded-md p-1"
          title="이 규칙 삭제"
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={SET_LABEL}>
            <span>이벤트 타입</span>
          </label>
          <select
            value={rule.eventType}
            onChange={e => onChange({ ...rule, eventType: e.target.value as EventType })}
            className={SET_INPUT}
          >
            {SALES_RECO_EVENT_TYPES.map(t => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={SET_LABEL}>
            <span>D-N (며칠 전부터 활성화)</span>
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={rule.triggerBefore}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...rule, triggerBefore: Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 1 });
            }}
            className={SET_INPUT}
          />
        </div>
      </div>

      <div>
        <label className={SET_LABEL}>
          <span>추천 카테고리 (콤마 구분)</span>
          <span className="text-[11px] text-ink-soft font-normal">
            · 예: 감기, 종합감기, 기침
          </span>
        </label>
        <textarea
          {...KO_INPUT_PROPS}
          rows={2}
          value={categoriesText}
          onChange={e => setCategoriesText(e.target.value)}
          onBlur={e => commitCategories(e.target.value)}
          placeholder="감기, 종합감기, 기침"
          className={SET_TEXTAREA}
        />
        <p className="text-[11px] text-ink-soft mt-1">
          products.category ILIKE '%키워드%' · 부분 매칭 · 최대 30개
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] font-bold text-ink">가중치 (선택 · 특정 키워드 부스트)</span>
          <button
            type="button"
            onClick={addWeight}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-deep hover:bg-brand-tint px-2 py-1 rounded-md"
          >
            <Plus size={12} weight="bold" /> 추가
          </button>
        </div>
        {weightKeys.length === 0 ? (
          <p className="text-[12px] text-ink-soft italic">가중치 없음 · 매칭 카테고리 · 기본 1.0</p>
        ) : (
          <div className="flex flex-col gap-2">
            {weightKeys.map(k => (
              <div key={k} className="flex items-center gap-2">
                <input
                  {...KO_INPUT_PROPS}
                  type="text"
                  value={k}
                  onChange={e => renameWeightKey(k, e.target.value)}
                  placeholder="키워드"
                  className={`${SET_INPUT} flex-1`}
                />
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={10}
                  value={rule.weights?.[k] ?? 1}
                  onChange={e => {
                    const n = parseFloat(e.target.value);
                    setWeight(k, Number.isFinite(n) ? n : null);
                  }}
                  className={`${SET_INPUT} w-24`}
                />
                <button
                  type="button"
                  onClick={() => setWeight(k, null)}
                  className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                  title="이 가중치 삭제"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={SET_LABEL}>
          <span>사용자 안내 문구 (reason)</span>
        </label>
        <textarea
          {...KO_INPUT_PROPS}
          rows={2}
          value={rule.reason}
          onChange={e => onChange({ ...rule, reason: e.target.value })}
          placeholder="예: 명절/황금연휴 · 여행 상비약 수요 급증 · 재고 확보 권장"
          className={SET_TEXTAREA}
        />
      </div>
    </div>
  );
});
RuleCard.displayName = "RuleCard";

// ═════════════════════════════════════════════════════════════
// 저수기 편집 카드
// ═════════════════════════════════════════════════════════════
interface OffCardProps {
  item: OffSeasonRangeInput;
  onChange: (next: OffSeasonRangeInput) => void;
  onRemove: () => void;
}

const OffSeasonCard: React.FC<OffCardProps> = React.memo(({ item, onChange, onRemove }) => {
  return (
    <div className="rounded-xl border border-line bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-bold">
          {item.label || "저수기"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-rose-600 hover:bg-rose-50 rounded-md p-1"
          title="이 저수기 삭제"
        >
          <Trash size={14} weight="bold" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={SET_LABEL}>
            <span>시작 월</span>
          </label>
          <input
            type="number"
            min={1}
            max={12}
            value={item.monthStart}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...item, monthStart: Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : 1 });
            }}
            className={SET_INPUT}
          />
        </div>
        <div>
          <label className={SET_LABEL}>
            <span>종료 월</span>
          </label>
          <input
            type="number"
            min={1}
            max={12}
            value={item.monthEnd}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              onChange({ ...item, monthEnd: Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : 1 });
            }}
            className={SET_INPUT}
          />
        </div>
        <div>
          <label className={SET_LABEL}>
            <span>종료 일 (선택)</span>
          </label>
          <input
            type="number"
            min={1}
            max={31}
            value={item.dayEnd ?? ""}
            onChange={e => {
              const v = e.target.value.trim();
              if (v === "") {
                onChange({ ...item, dayEnd: undefined });
                return;
              }
              const n = parseInt(v, 10);
              onChange({ ...item, dayEnd: Number.isFinite(n) ? Math.max(1, Math.min(31, n)) : undefined });
            }}
            placeholder="예: 10"
            className={SET_INPUT}
          />
        </div>
      </div>

      <div>
        <label className={SET_LABEL}>
          <span>라벨</span>
        </label>
        <input
          {...KO_INPUT_PROPS}
          type="text"
          value={item.label}
          onChange={e => onChange({ ...item, label: e.target.value })}
          placeholder="예: 2월 저수기"
          className={SET_INPUT}
        />
      </div>

      <div>
        <label className={SET_LABEL}>
          <span>사용자 안내 문구</span>
        </label>
        <textarea
          {...KO_INPUT_PROPS}
          rows={2}
          value={item.reason}
          onChange={e => onChange({ ...item, reason: e.target.value })}
          placeholder="예: 설 명절 이후 · 약국 매출 저점 · 발주량 감축 권장"
          className={SET_TEXTAREA}
        />
      </div>
    </div>
  );
});
OffSeasonCard.displayName = "OffSeasonCard";

// ═════════════════════════════════════════════════════════════
// 메인 · Editor
// ═════════════════════════════════════════════════════════════
interface Props {
  /** 저장 권한 (level ≥ 9) · false 면 · 편집 UI 숨김 */
  canEdit: boolean;
}

export const EventCategoryRulesEditor: React.FC<Props> = ({ canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"kv" | "ssot" | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [rules, setRules] = useState<EventCategoryRuleInput[]>([]);
  const [offSeason, setOffSeason] = useState<OffSeasonRangeInput[]>([]);
  const { toast, showSuccess, showError, showWarn } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.get<ApiResponse>("/api/settings/event-category-rules");
      setRules(data.rules);
      setOffSeason(data.offSeason);
      setSource(data.source);
      setUpdatedAt(data.updated_at);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "불러오기 실패";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    // 클라이언트 사전 검증 · 카테고리 최소 1 · reason 3자 이상
    for (const r of rules) {
      if (r.categories.length === 0) {
        showWarn(`${EVENT_TYPE_LABEL[r.eventType]} · 카테고리를 1개 이상 입력하세요`);
        return;
      }
      if ((r.reason ?? "").trim().length < 3) {
        showWarn(`${EVENT_TYPE_LABEL[r.eventType]} · 안내 문구를 3자 이상 입력하세요`);
        return;
      }
    }
    for (const o of offSeason) {
      if ((o.label ?? "").trim().length < 1) {
        showWarn("저수기 · 라벨을 입력하세요");
        return;
      }
      if ((o.reason ?? "").trim().length < 3) {
        showWarn("저수기 · 안내 문구를 3자 이상 입력하세요");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const payload: EventCategoryRulesPayload = { rules, offSeason };
      const { data } = await api.post<ApiResponse>("/api/settings/event-category-rules", payload);
      setRules(data.rules);
      setOffSeason(data.offSeason);
      setSource(data.source);
      setUpdatedAt((data as any).updated_at ?? new Date().toISOString());
      showSuccess("저장되었습니다 · 캐시 무효화됨");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "저장 실패";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  }, [rules, offSeason, showSuccess, showError, showWarn]);

  const restore = useCallback(async () => {
    const ok = await confirm({
      title: "원본 SSOT 복원",
      message: "관리자 편집 규칙을 삭제하고 · 하드코딩 원본 규칙으로 되돌립니다. 계속할까요?",
      danger: true,
      confirmLabel: "복원",
    });
    if (ok !== true) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.del<ApiResponse>("/api/settings/event-category-rules");
      setRules(data.rules);
      setOffSeason(data.offSeason);
      setSource(data.source);
      setUpdatedAt(null);
      showSuccess("원본 SSOT 로 복원되었습니다");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "복원 실패";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  }, [confirm, showSuccess, showError]);

  const addRule = useCallback(() => {
    // 아직 없는 이벤트 타입 우선 · 다 있으면 · spring 로 신규
    const used = new Set(rules.map(r => r.eventType));
    const nextType = SALES_RECO_EVENT_TYPES.find(t => !used.has(t)) ?? "spring";
    setRules(prev => [...prev, EMPTY_RULE(nextType)]);
  }, [rules]);

  const addOffSeason = useCallback(() => {
    setOffSeason(prev => [...prev, { ...EMPTY_OFF }]);
  }, []);

  if (loading) {
    return (
      <SectionCard title="추천 규칙" description="이벤트별 카테고리·D-N·가중치·저수기 편집">
        <div className="flex justify-center py-8">
          <Spinner label="불러오는 중..." size={14} tone="zinc" labelSize={14} />
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 정보 · source · updated_at · 액션 */}
      <SectionCard
        title="추천 규칙"
        description="발주·판매 추천 배너 규칙 · 이벤트별 카테고리 매칭 · D-N triggerBefore · 가중치 · 저수기"
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={load}
                disabled={saving}
                className={SET_BTN_SECONDARY}
                title="다시 불러오기"
              >
                <ArrowsClockwise size={14} /> 다시 불러오기
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className={SET_BTN_PRIMARY}
              >
                <FloppyDisk size={14} weight="fill" />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span
            className={
              source === "kv"
                ? "inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold"
                : "inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold"
            }
          >
            소스 · {source === "kv" ? "관리자 편집 (KV)" : "원본 SSOT (하드코딩)"}
          </span>
          {updatedAt && (
            <span className="text-ink-soft">최종 저장 · {new Date(updatedAt).toLocaleString("ko-KR")}</span>
          )}
        </div>
        {error && <div className={SET_NOTICE_ROSE + " mt-3"}>{error}</div>}
        {!canEdit && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-[12px] text-amber-800">
            <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
            <span>편집은 관리자(level ≥ 9) 전용입니다. 조회 전용 모드입니다.</span>
          </div>
        )}
      </SectionCard>

      {/* 이벤트 규칙 목록 */}
      <SectionCard
        title="이벤트별 규칙"
        description="계절·명절·수험생 등 · 이벤트 타입별 · 추천 카테고리·가중치·D-N 편집"
        actions={
          canEdit ? (
            <button type="button" onClick={addRule} className={SET_BTN_SECONDARY}>
              <Plus size={14} weight="bold" /> 규칙 추가
            </button>
          ) : null
        }
      >
        {rules.length === 0 ? (
          <p className="text-[13px] text-ink-soft italic">등록된 규칙이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rules.map((rule, idx) => (
              <RuleCard
                key={`${rule.eventType}-${idx}`}
                rule={rule}
                onChange={next => {
                  if (!canEdit) return;
                  setRules(prev => prev.map((r, i) => (i === idx ? next : r)));
                }}
                onRemove={() => {
                  if (!canEdit) return;
                  setRules(prev => prev.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 저수기 목록 */}
      <SectionCard
        title="저수기 (매출 저점 구간)"
        description="2월·8월 초 등 · 발주량 감축 배너 · 매출 저점 시기 편집"
        actions={
          canEdit ? (
            <button type="button" onClick={addOffSeason} className={SET_BTN_SECONDARY}>
              <Plus size={14} weight="bold" /> 저수기 추가
            </button>
          ) : null
        }
      >
        {offSeason.length === 0 ? (
          <p className="text-[13px] text-ink-soft italic">등록된 저수기가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {offSeason.map((item, idx) => (
              <OffSeasonCard
                key={`off-${idx}`}
                item={item}
                onChange={next => {
                  if (!canEdit) return;
                  setOffSeason(prev => prev.map((r, i) => (i === idx ? next : r)));
                }}
                onRemove={() => {
                  if (!canEdit) return;
                  setOffSeason(prev => prev.filter((_, i) => i !== idx));
                }}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* 원본 복원 · danger */}
      {canEdit && source === "kv" && (
        <SectionCard tone="danger" title="위험 영역" description="관리자 편집 규칙을 삭제하고 원본 SSOT (하드코딩) 로 복귀합니다.">
          <button
            type="button"
            onClick={restore}
            disabled={saving}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-[10px] bg-rose-600 hover:bg-rose-700 text-white text-[14px] font-bold shadow-sm transition disabled:opacity-50"
          >
            <ArrowsClockwise size={14} weight="bold" />
            원본 SSOT 복원
          </button>
        </SectionCard>
      )}

      {/* Success toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>
            {toast.tone === "success" && "✓"}
            <span>{toast.message}</span>
          </div>
        </div>
      )}
      {source === "kv" && !error && !toast && (
        <div className={SET_NOTICE_EMERALD}>
          관리자 편집 규칙 활성 · /api/sales-auto-recommend · KV 우선 (60초 서버 캐시)
        </div>
      )}
    </div>
  );
};

export default EventCategoryRulesEditor;
