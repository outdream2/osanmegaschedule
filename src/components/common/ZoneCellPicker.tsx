// src/components/common/ZoneCellPicker.tsx
// 2026-08-30 · 사용자 지시 · 매장구역도 셀 클릭 → popover 로 구역·카테고리·상세카테고리 선택
//   · 소스 · zone_defs 테이블 (매장구역편집과 동일)
//   · 3 섹션 · 구역(라벨) · 카테고리(main) · 상세카테고리(sub 또는 description)
//   · 선택 즉시 · PATCH /api/zone-defs/:num · DB 반영 · useZoneDefs 자동 갱신
//   · Radix Popover · 2026 트렌드 · WAI-ARIA · headless
//
// 사용 예:
//   <ZoneCellPicker
//     zoneNum={1}
//     subKey="A"          // "A" | "B" | "C" | null (null = 단독)
//     canEdit={canEdit}
//     trigger={<button>클릭</button>}
//   />

import React, { useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, MapPin, Layers, Tag as TagIcon, X } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useZoneDefs, type ZoneDef } from "../../hooks/useZoneDefs";
import { useToast, toastClass } from "../../hooks/useToast";

export type ZoneSubKey = "A" | "B" | "C" | null;

interface Props {
  /** 대상 zone_defs.num · 편집 대상 zone */
  zoneNum: number;
  /** 서브존 · A/B/C · null 이면 단독 zone */
  subKey?: ZoneSubKey;
  /** 편집 권한 · false 면 popover 열려도 편집 disabled */
  canEdit?: boolean;
  /** trigger element · 셀 자체 · button 등 */
  trigger: React.ReactNode;
  /** popover align · 기본 center */
  align?: "start" | "center" | "end";
}

/** category 필드 결정 · sub 지정 시 subA/subB/subC · 아니면 main category */
function catField(sub: ZoneSubKey): "category" | "subA" | "subB" | "subC" {
  if (sub === "A") return "subA";
  if (sub === "B") return "subB";
  if (sub === "C") return "subC";
  return "category";
}
function descField(sub: ZoneSubKey): "description" | "descriptionA" | "descriptionB" | "descriptionC" {
  if (sub === "A") return "descriptionA";
  if (sub === "B") return "descriptionB";
  if (sub === "C") return "descriptionC";
  return "description";
}

export const ZoneCellPicker: React.FC<Props> = ({ zoneNum, subKey = null, canEdit = false, trigger, align = "center" }) => {
  const { zones, setZones } = useZoneDefs();
  const { toast, showSuccess, showError } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const zone = useMemo(() => zones.find(z => z.num === zoneNum), [zones, zoneNum]);
  const cf = catField(subKey);
  const df = descField(subKey);
  const currentCat  = (zone as any)?.[cf] ?? "";
  const currentDesc = (zone as any)?.[df] ?? "";
  const zoneLabel   = zone?.label ?? String(zoneNum);

  // 모든 zone_defs 의 category / sub 값 · 중복 제거 · 옵션 리스트
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const z of zones) {
      if (z.category) set.add(z.category);
      if (z.subA)     set.add(z.subA);
      if (z.subB)     set.add(z.subB);
      if (z.subC)     set.add(z.subC);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [zones]);

  const descriptionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const z of zones) {
      if (z.description)  set.add(z.description);
      if (z.descriptionA) set.add(z.descriptionA);
      if (z.descriptionB) set.add(z.descriptionB);
      if (z.descriptionC) set.add(z.descriptionC);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [zones]);

  const applyCategory = async (val: string) => {
    if (!zone || !canEdit) return;
    setSaving(true);
    try {
      await api.patch(`/api/zone-defs/${zoneNum}`, { [cf]: val || null });
      setZones(prev => prev.map(z => z.num === zoneNum ? { ...z, [cf]: val || undefined } as ZoneDef : z));
      showSuccess(`${zoneLabel}${subKey ? subKey : ""} 카테고리 저장`);
    } catch (e) {
      showError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };
  const applyDescription = async (val: string) => {
    if (!zone || !canEdit) return;
    setSaving(true);
    try {
      await api.patch(`/api/zone-defs/${zoneNum}`, { [df]: val || null });
      setZones(prev => prev.map(z => z.num === zoneNum ? { ...z, [df]: val || undefined } as ZoneDef : z));
      showSuccess(`${zoneLabel}${subKey ? subKey : ""} 상세카테고리 저장`);
    } catch (e) {
      showError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  };
  const applyLabel = async (val: string) => {
    if (!zone || !canEdit) return;
    setSaving(true);
    try {
      await api.patch(`/api/zone-defs/${zoneNum}`, { label: val });
      setZones(prev => prev.map(z => z.num === zoneNum ? { ...z, label: val } : z));
      showSuccess(`구역 라벨 저장`);
    } catch (e) {
      showError(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
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
            {/* Header · 상단 gradient accent + title + close */}
            <div className="relative px-4 pt-3 pb-2 border-b border-line bg-gradient-to-b from-brand-tint/40 to-white">
              <span aria-hidden className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-deep via-brand to-[#3E7CB1]" />
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-brand-deep shrink-0" />
                <span className="text-[15px] font-extrabold text-ink tracking-tight">
                  {zoneNum}{subKey ?? ""} · {zoneLabel}
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
            </div>

            {/* Body · 스크롤 */}
            <div className="flex-1 overflow-auto p-3 space-y-3">
              {/* 섹션 1 · 구역 라벨 (단독 zone 만 노출 · 서브 zone 은 부모 label 사용) */}
              {subKey === null && (
                <section>
                  <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <TagIcon size={11} /> 구역 라벨
                  </div>
                  <input
                    type="text"
                    defaultValue={zoneLabel}
                    disabled={!canEdit || saving}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== zoneLabel) applyLabel(v); }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="w-full h-9 px-2.5 text-[14px] font-semibold rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50"
                    placeholder="구역 라벨 (예: 진열대 1)"
                  />
                </section>
              )}

              {/* 섹션 2 · 카테고리 선택 · 기존 옵션 리스트 + 커스텀 입력 */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Layers size={11} /> 카테고리 {subKey && <span className="text-brand-deep">({subKey})</span>}
                </div>
                {/* 커스텀 입력 · 자유 텍스트 */}
                <input
                  type="text"
                  defaultValue={currentCat}
                  disabled={!canEdit || saving}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== currentCat) applyCategory(v); }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-full h-9 px-2.5 text-[13px] rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50 mb-2"
                  placeholder="카테고리 직접 입력"
                />
                {/* 프리셋 리스트 · 클릭 → 즉시 저장 */}
                {categoryOptions.length > 0 && (
                  <div className="max-h-[180px] overflow-auto rounded-md border border-line bg-zinc-50/40 divide-y divide-zinc-100">
                    {categoryOptions.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled={!canEdit || saving}
                        onClick={() => applyCategory(opt)}
                        className={`w-full text-left px-2.5 py-1.5 text-[13px] font-medium hover:bg-brand-tint/30 hover:text-brand-deep transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${opt === currentCat ? "bg-brand-tint/50 text-brand-deep font-bold" : "text-ink"}`}
                      >
                        <Check size={11} className={opt === currentCat ? "text-brand-deep" : "text-transparent"} />
                        <span className="flex-1 min-w-0 break-keep">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* 섹션 3 · 상세카테고리 (description) · 커스텀 + 프리셋 */}
              <section>
                <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <MapPin size={11} /> 상세 카테고리 (hover 표시){subKey && <span className="text-brand-deep">({subKey})</span>}
                </div>
                <textarea
                  defaultValue={currentDesc}
                  disabled={!canEdit || saving}
                  onBlur={e => { const v = e.target.value.trim(); if (v !== currentDesc) applyDescription(v); }}
                  className="w-full min-h-[60px] max-h-[160px] px-2.5 py-1.5 text-[13px] rounded-md border border-line focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep disabled:bg-zinc-50 mb-2 resize-y"
                  placeholder="상세 설명 직접 입력 (긴 텍스트 · hover 시 표시)"
                />
                {descriptionOptions.length > 0 && (
                  <div className="max-h-[140px] overflow-auto rounded-md border border-line bg-zinc-50/40 divide-y divide-zinc-100">
                    {descriptionOptions.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled={!canEdit || saving}
                        onClick={() => applyDescription(opt)}
                        className={`w-full text-left px-2.5 py-1.5 text-[12px] font-medium hover:bg-brand-tint/30 hover:text-brand-deep transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-start gap-2 ${opt === currentDesc ? "bg-brand-tint/50 text-brand-deep font-bold" : "text-ink-soft"}`}
                      >
                        <Check size={11} className={`mt-0.5 shrink-0 ${opt === currentDesc ? "text-brand-deep" : "text-transparent"}`} />
                        <span className="flex-1 min-w-0 break-keep whitespace-pre-wrap leading-relaxed">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Footer · 저장 상태 · 도움말 */}
            <div className="px-3 py-2 border-t border-line bg-zinc-50/60 flex items-center gap-2 text-[11px] text-ink-soft">
              {saving ? <span className="text-brand-deep font-bold">저장 중...</span> : <span>변경 후 Tab 또는 다른 필드 클릭 시 자동 저장 · 프리셋 클릭도 즉시 저장</span>}
            </div>

            <PopoverPrimitive.Arrow className="fill-white drop-shadow-sm" />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
};

export default ZoneCellPicker;
