// src/components/SeasonSettingsPage/EventsSection.tsx
// 2026-09-13 · #52·#54 · 이벤트 관리 UI · SeasonSettingsPage 3번째 탭
//   · GET /api/events · POST /api/events · PATCH · DELETE
//   · type · spring/summer/fall/winter/holiday/school/custom
//   · recurring · 매년 반복 (계절·명절 등)

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Calendar, RefreshCw } from "lucide-react";
import { api } from "../../lib/apiClient";
import { getErrorMessage } from "../../lib/errorMessage";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { getKstYmd } from "../../lib/kstDate";

interface EventRow {
  id: number;
  name: string;
  type: string;
  start_date: string | null;
  end_date: string | null;
  recurring: boolean;
}

const TYPE_OPTIONS = [
  { key: "spring",  label: "봄" },
  { key: "summer",  label: "여름" },
  { key: "fall",    label: "가을" },
  { key: "winter",  label: "겨울" },
  { key: "holiday", label: "명절" },
  { key: "school",  label: "수험생" },
  { key: "custom",  label: "이벤트" },
] as const;

const TYPE_TONE: Record<string, { bg: string; text: string }> = {
  spring:  { bg: "bg-pink-50 border-pink-200",   text: "text-pink-700" },
  summer:  { bg: "bg-sky-50 border-sky-200",     text: "text-sky-700" },
  fall:    { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  winter:  { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700" },
  holiday: { bg: "bg-rose-50 border-rose-200",   text: "text-rose-700" },
  school:  { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
  custom:  { bg: "bg-violet-50 border-violet-200", text: "text-violet-700" },
};

const emptyDraft = () => ({ name: "", type: "custom", start_date: "", end_date: "", recurring: false });

export const EventsSection: React.FC = () => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ rows?: EventRow[] }>(`/api/events`);
      setEvents(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      showError(`이벤트 로드 실패: ${getErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { void load(); }, [load]);

  const startEdit = (r: EventRow) => {
    setEditingId(r.id);
    setDraft({
      name: r.name,
      type: r.type,
      start_date: r.start_date ?? "",
      end_date: r.end_date ?? "",
      recurring: r.recurring,
    });
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { showError("이름을 입력하세요"); return; }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        type: draft.type,
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        recurring: draft.recurring,
      };
      if (editingId) {
        await api.patch(`/api/events/${editingId}`, payload);
        showSuccess("이벤트 수정 완료");
      } else {
        await api.post(`/api/events`, payload);
        showSuccess("이벤트 등록 완료");
      }
      cancelEdit();
      await load();
    } catch (e) {
      showError(`저장 실패: ${getErrorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: EventRow) => {
    const ok = await confirm({
      message: `이벤트 "${r.name}" 을(를) 삭제할까요?\n\n매핑된 상품 (event_products) 도 CASCADE 삭제됩니다.`,
      danger: true,
    });
    if (!ok) return;
    setDeletingId(r.id);
    try {
      await api.del(`/api/events/${r.id}`);
      setEvents(prev => prev.filter(x => x.id !== r.id));
      showSuccess("삭제 완료");
    } catch (e) {
      showError(`삭제 실패: ${getErrorMessage(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[16px] font-bold text-zinc-900">이벤트 관리</span>
          <span className="text-[13px] tabular-nums text-zinc-400 font-medium">{events.length}건</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-all cursor-pointer"
            title="새로고침"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          {!showForm && (
            <button
              onClick={() => { setEditingId(null); setDraft({ ...emptyDraft(), start_date: getKstYmd() }); setShowForm(true); }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white text-[13px] font-bold shadow-sm cursor-pointer transition"
            >
              <Plus size={13} strokeWidth={2.5} />
              신규 이벤트
            </button>
          )}
        </div>
      </div>

      {/* 등록·편집 폼 */}
      {showForm && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-bold text-zinc-800">
              {editingId ? "이벤트 수정" : "신규 이벤트"}
            </span>
            <button onClick={cancelEdit} className="text-zinc-400 hover:text-zinc-700 cursor-pointer">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-zinc-600">이름 *</span>
              <input
                lang="ko"
                type="text"
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: 크리스마스"
                className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[14px] outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-zinc-600">유형</span>
              <select
                value={draft.type}
                onChange={e => setDraft({ ...draft, type: e.target.value })}
                className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[14px] outline-none focus:border-brand-deep transition cursor-pointer"
              >
                {TYPE_OPTIONS.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-zinc-600">시작일</span>
              <input
                type="date"
                value={draft.start_date}
                onChange={e => setDraft({ ...draft, start_date: e.target.value })}
                className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[14px] outline-none focus:border-brand-deep transition"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold text-zinc-600">종료일</span>
              <input
                type="date"
                value={draft.end_date}
                onChange={e => setDraft({ ...draft, end_date: e.target.value })}
                min={draft.start_date}
                className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[14px] outline-none focus:border-brand-deep transition"
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.recurring}
              onChange={e => setDraft({ ...draft, recurring: e.target.checked })}
              className="w-4 h-4 accent-brand-deep cursor-pointer"
            />
            <span className="text-[13px] text-zinc-700">
              <span className="font-semibold">매년 반복</span> · 계절·명절 (연도 무관 · 매년 자동 적용)
            </span>
          </label>
          <div className="flex items-center justify-end gap-2 mt-1">
            <button
              onClick={cancelEdit}
              className="h-8 px-4 text-[13px] font-semibold bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg text-zinc-700 cursor-pointer transition"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-8 px-5 text-[13px] font-bold bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-40 text-white rounded-lg shadow-sm cursor-pointer transition"
            >
              {saving ? <Spinner size={12} tone="white" /> : <Check size={12} strokeWidth={2.5} />}
              {editingId ? "수정" : "등록"}
            </button>
          </div>
        </div>
      )}

      {/* 리스트 */}
      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Spinner tone="zinc" label="로딩 중..." labelSize={13} />
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={Calendar} title="등록된 이벤트 없음" hint="신규 이벤트 등록으로 시작하세요" size="compact" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {events.map(r => {
            const tone = TYPE_TONE[r.type] ?? TYPE_TONE.custom;
            const typeLabel = TYPE_OPTIONS.find(t => t.key === r.type)?.label ?? r.type;
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg border ${tone.bg} hover:brightness-95 transition-all`}
              >
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white/70 border border-current/20 shrink-0 ${tone.text}`}>
                  {typeLabel}
                </span>
                <span className="text-[14px] font-bold text-zinc-900 shrink-0">{r.name}</span>
                {(r.start_date || r.end_date) && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-zinc-600 tabular-nums shrink-0">
                    <Calendar size={11} className="text-zinc-400" />
                    {r.start_date ?? "?"}
                    {r.end_date && r.end_date !== r.start_date && ` ~ ${r.end_date}`}
                  </span>
                )}
                {r.recurring && <StatusPill tone="emerald" size="sm">매년</StatusPill>}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => startEdit(r)}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-brand-deep hover:bg-white transition cursor-pointer"
                    title="편집"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(r)}
                    disabled={deletingId === r.id}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-rose-600 hover:bg-white transition cursor-pointer disabled:opacity-40"
                    title="삭제"
                  >
                    <Trash2 size={13} className={deletingId === r.id ? "animate-pulse" : ""} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
};

export default EventsSection;
