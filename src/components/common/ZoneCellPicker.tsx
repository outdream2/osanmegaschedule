// src/components/common/ZoneCellPicker.tsx
// 2026-08-30 · 매장구역도 셀 클릭 → popover · zone_defs 편집
//   · 4개 필드 (zone · category · detailedCategory · cellId)
//   · 편집 즉시 · PATCH /api/zone-defs/:id · DB 반영
//   · Radix Popover · WAI-ARIA · headless

import React, { useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, MapPin, Layers, Tag as TagIcon, X, Users } from "lucide-react";
import { useZoneDefs, type ZoneDefRaw } from "../../hooks/useZoneDefs";
import { useToast, toastClass } from "../../hooks/useToast";
// 2026-08-30 · 사용자 지시 · 매장구역도에서 담당자 직접 배정 가능 · AssigneeEditor 프리미티브
import { AssigneeEditor } from "./AssigneeEditor";

interface Props {
  /** 대상 zone_defs.cellId · 편집 대상 셀 */
  cellId: number;
  /** 편집 권한 (lv≥9) */
  canEdit?: boolean;
  /** trigger element · 셀 자체 · button 등 */
  trigger: React.ReactNode;
  /** popover align */
  align?: "start" | "center" | "end";
}

export const ZoneCellPicker: React.FC<Props> = ({ cellId, canEdit = false, trigger, align = "center" }) => {
  const { zonesRaw, updateZoneRaw, saveState } = useZoneDefs();
  const { toast, showSuccess, showError } = useToast();
  const [open, setOpen] = useState(false);

  const zone = useMemo(() => zonesRaw.find(z => z.cellId === cellId), [zonesRaw, cellId]);
  const currentZone = zone?.zone ?? "";
  const currentCat = zone?.category ?? "";
  const currentDetail = zone?.detailedCategory ?? "";
  const currentAssignee = zone?.assignee ?? [];

  // 카테고리 프리셋 · zone_defs 전체 category 중복 제거
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const z of zonesRaw) if (z.category) set.add(z.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [zonesRaw]);
  const detailOptions = useMemo(() => {
    const set = new Set<string>();
    for (const z of zonesRaw) if (z.detailedCategory) set.add(z.detailedCategory);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [zonesRaw]);

  const apply = async (patch: Partial<Omit<ZoneDefRaw, "id">>, successMsg: string) => {
    if (!zone || !canEdit) return;
    const ok = await updateZoneRaw(zone.id, patch);
    if (ok) showSuccess(successMsg);
    else showError("저장 실패 · 콘솔 확인");
  };

  return (
    <>
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align={align}
            sideOffset={8}
            className="z-[9999] w-[360px] max-h-[70vh] overflow-hidden bg-white rounded-xl border border-line shadow-[0_10px_40px_-10px_rgba(10,46,74,0.35),0_4px_12px_-4px_rgba(10,46,74,0.15)] flex flex-col"
          >
            {/* Header · 3px gradient accent */}
            <div className="relative px-4 pt-3 pb-2 border-b border-line bg-gradient-to-b from-brand-tint/40 to-white">
              <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-brand-deep shrink-0" />
                <span className="text-[15px] font-extrabold text-ink tracking-tight">
                  셀 {cellId} · {currentZone || "(미등록)"}
                </span>
                <PopoverPrimitive.Close asChild>
                  <button
                    type="button"
                    className="ml-auto w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-100 text-zinc-500 cursor-pointer"
                    aria-label="닫기"
                  >
                    <X size={13} />
                  </button>
                </PopoverPrimitive.Close>
              </div>
              {!canEdit && (
                <div className="mt-1.5 text-[11px] font-bold text-rose-600">관리자(lv 9) 만 편집 가능 · 조회만</div>
              )}
              {saveState === "saving" && (
                <div className="mt-1.5 text-[11px] font-bold text-brand-deep">저장 중...</div>
              )}
            </div>

            <div className="flex-1 overflow-auto p-3 space-y-3">
              {!zone && (
                <div className="text-[13px] text-rose-600 font-semibold">셀 {cellId} · zone_defs 에 없음 (조회 실패)</div>
              )}

              {/* 구역 (zone) */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <TagIcon size={11} /> 구역
                </div>
                <input
                  type="text"
                  defaultValue={currentZone}
                  disabled={!canEdit || !zone}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== currentZone) apply({ zone: v }, `구역명 저장`); }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full h-9 px-2.5 text-[14px] font-semibold rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50"
                  placeholder="구역 (예: 진열대 1A)"
                />
              </section>

              {/* 카테고리 (category) · 자유 입력 + 프리셋 */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Layers size={11} /> 카테고리
                </div>
                <input
                  type="text"
                  defaultValue={currentCat}
                  disabled={!canEdit || !zone}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== currentCat) apply({ category: v }, `카테고리 저장`); }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full h-9 px-2.5 text-[13px] rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50 mb-2"
                  placeholder="카테고리 직접 입력"
                />
                {categoryOptions.length > 0 && (
                  <div className="max-h-[180px] overflow-auto rounded-md border border-line bg-zinc-50/40 divide-y divide-zinc-100">
                    {categoryOptions.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled={!canEdit || !zone}
                        onClick={() => apply({ category: opt }, `카테고리 저장`)}
                        className={`w-full text-left px-2.5 py-1.5 text-[13px] font-medium hover:bg-brand-tint/30 hover:text-brand-deep transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${opt === currentCat ? "bg-brand-tint/50 text-brand-deep font-bold" : "text-ink"}`}
                      >
                        <Check size={11} className={opt === currentCat ? "text-brand-deep" : "text-transparent"} />
                        <span className="flex-1 min-w-0 break-keep">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 상세카테고리 (detailedCategory) */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MapPin size={11} /> 상세 카테고리 (hover 표시)
                </div>
                <textarea
                  defaultValue={currentDetail}
                  disabled={!canEdit || !zone}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== currentDetail) apply({ detailedCategory: v || undefined }, `상세카테고리 저장`); }}
                  className="w-full min-h-[60px] max-h-[160px] px-2.5 py-1.5 text-[13px] rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50 mb-2 resize-y"
                  placeholder="상세 설명 직접 입력 (긴 텍스트 · hover 시 표시)"
                />
                {detailOptions.length > 0 && (
                  <div className="max-h-[140px] overflow-auto rounded-md border border-line bg-zinc-50/40 divide-y divide-zinc-100">
                    {detailOptions.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled={!canEdit || !zone}
                        onClick={() => apply({ detailedCategory: opt }, `상세카테고리 저장`)}
                        className={`w-full text-left px-2.5 py-1.5 text-[12px] font-medium hover:bg-brand-tint/30 hover:text-brand-deep transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-start gap-2 ${opt === currentDetail ? "bg-brand-tint/50 text-brand-deep font-bold" : "text-ink-soft"}`}
                      >
                        <Check size={11} className={`mt-0.5 shrink-0 ${opt === currentDetail ? "text-brand-deep" : "text-transparent"}`} />
                        <span className="flex-1 min-w-0 break-keep whitespace-pre-wrap leading-relaxed">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 2026-08-30 · 사용자 지시 · 담당자 · 매장구역도에서 직접 배정 · AssigneeEditor 프리미티브 */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Users size={11} /> 담당자
                </div>
                <AssigneeEditor
                  value={currentAssignee}
                  canEdit={canEdit && !!zone}
                  onSave={async (next) => { if (zone) await updateZoneRaw(zone.id, { assignee: next }); }}
                />
              </section>
            </div>

            <div className="px-3 py-2 border-t border-line bg-zinc-50/60 flex items-center gap-2 text-[11px] text-ink-soft">
              변경 후 Tab 또는 다른 필드 클릭 시 자동 저장 · 프리셋 클릭도 즉시 저장
            </div>

            <PopoverPrimitive.Arrow className="fill-white drop-shadow-sm" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
};

export default ZoneCellPicker;
