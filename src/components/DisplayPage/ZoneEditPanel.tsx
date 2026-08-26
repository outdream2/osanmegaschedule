// src/components/DisplayPage/ZoneEditPanel.tsx
// 2026-08-26 · 사용자 지시 · 매장진열 · "매장구역도 편집" 신규 탭
//   · 2컬럼 (구역 · 상세설명) · 둘다 인라인 편집 · Enter/blur 자동 저장
//   · 서브존 별도 행 · 1A · 1B · 2A · 2B ... 8A · 8B · 9 · 10 · ... · 40A/B/C · 41 · 42
//   · useZoneDefs (KV) · 관리자 (lv 9) 전용

import React, { useState, useEffect, useRef } from "react";
import { Save, RotateCcw, Pencil, Check, X } from "lucide-react";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { useZoneDefs, type ZoneDef } from "../../hooks/useZoneDefs";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { ZONE_DEFS as DEFAULT_ZONES } from "../../constants/displayZones";

interface Props {
  canEdit?: boolean;
}

type EditField = "category" | "subA" | "subB" | "subC" | "description" | "descriptionA" | "descriptionB" | "descriptionC";
type SubKey = "A" | "B" | "C" | null;

interface FlatRow {
  zone: ZoneDef;
  code: string;
  sub: SubKey;
  catField: "category" | "subA" | "subB" | "subC";
  descField: "description" | "descriptionA" | "descriptionB" | "descriptionC";
  catValue?: string;
  descValue?: string;
}

// zone 을 서브존별 행으로 확장 · aisle 1-8 · 계산대 40 · 나머지 단일 행
function expandZoneToRows(z: ZoneDef): FlatRow[] {
  const hasA = !!z.subA;
  const hasB = !!z.subB;
  const hasC = !!z.subC;
  if (hasA && hasB && hasC) {
    return [
      { zone: z, code: `${z.num}A`, sub: "A", catField: "subA", descField: "descriptionA", catValue: z.subA, descValue: z.descriptionA },
      { zone: z, code: `${z.num}B`, sub: "B", catField: "subB", descField: "descriptionB", catValue: z.subB, descValue: z.descriptionB },
      { zone: z, code: `${z.num}C`, sub: "C", catField: "subC", descField: "descriptionC", catValue: z.subC, descValue: z.descriptionC },
    ];
  }
  if (hasA && hasB) {
    return [
      { zone: z, code: `${z.num}A`, sub: "A", catField: "subA", descField: "descriptionA", catValue: z.subA, descValue: z.descriptionA },
      { zone: z, code: `${z.num}B`, sub: "B", catField: "subB", descField: "descriptionB", catValue: z.subB, descValue: z.descriptionB },
    ];
  }
  return [
    { zone: z, code: String(z.num), sub: null, catField: "category", descField: "description", catValue: z.category, descValue: z.description },
  ];
}

const codeToneCls = (sub: SubKey): { badge: string; row: string } => {
  if (sub === "A") return { badge: "bg-violet-100 text-violet-800 border-violet-300", row: "bg-violet-50/25" };
  if (sub === "B") return { badge: "bg-sky-100 text-sky-800 border-sky-300",           row: "bg-sky-50/25" };
  if (sub === "C") return { badge: "bg-amber-100 text-amber-800 border-amber-300",     row: "bg-amber-50/25" };
  return { badge: "bg-brand-tint/60 text-brand-deep border-brand-deep/30",             row: "" };
};

// 2026-08-26 · 사용자 지시 · 3 대분류 존 · num 기준 그룹핑
type MajorZone = "central-otc" | "consult" | "beauty-food" | "other";

const MAJOR_ZONE_LABEL: Record<MajorZone, string> = {
  "central-otc": "중앙상비약존",
  "consult":     "상담존",
  "beauty-food": "뷰티식품존",
  "other":       "기타 · 시설",
};
const MAJOR_ZONE_RANGE: Record<MajorZone, string> = {
  "central-otc": "1A – 8B",
  "consult":     "9 – 27",
  "beauty-food": "28 – 40",
  "other":       "41 – 42",
};
const MAJOR_ZONE_ORDER: MajorZone[] = ["central-otc", "consult", "beauty-food", "other"];
const MAJOR_ZONE_TONE: Record<MajorZone, { bar: string; bg: string; badge: string }> = {
  "central-otc": { bar: "bg-brand-deep",     bg: "from-brand-tint/40",   badge: "bg-brand-tint text-brand-deep border-brand-deep/40" },
  "consult":     { bar: "bg-emerald-500",    bg: "from-emerald-50",      badge: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  "beauty-food": { bar: "bg-rose-500",       bg: "from-rose-50",         badge: "bg-rose-100 text-rose-700 border-rose-300" },
  "other":       { bar: "bg-zinc-400",       bg: "from-zinc-50",         badge: "bg-zinc-100 text-zinc-600 border-zinc-300" },
};

function classifyZone(num: number): MajorZone {
  if (num >= 1 && num <= 8)   return "central-otc";
  if (num >= 9 && num <= 27)  return "consult";
  if (num >= 28 && num <= 40) return "beauty-food";
  return "other";
}

export const ZoneEditPanel: React.FC<Props> = ({ canEdit = false }) => {
  const { zones, setZones, loading, saveNow, saveState } = useZoneDefs();
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ num: number; field: EditField } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => { setEditing(null); setDraft(""); }, [zones.length]);

  const startEdit = (zone: ZoneDef, field: EditField) => {
    if (!canEdit) return;
    setEditing({ num: zone.num, field });
    const cur = ((): string => {
      switch (field) {
        case "category":      return zone.category;
        case "subA":          return zone.subA ?? "";
        case "subB":          return zone.subB ?? "";
        case "subC":          return zone.subC ?? "";
        case "description":   return zone.description  ?? "";
        case "descriptionA":  return zone.descriptionA ?? "";
        case "descriptionB":  return zone.descriptionB ?? "";
        case "descriptionC":  return zone.descriptionC ?? "";
      }
    })();
    setDraft(cur);
  };
  const cancelEdit = () => { setEditing(null); setDraft(""); };
  const commitEdit = async () => {
    if (!editing || savingRef.current) return;
    const cleaned = draft.trim();
    // optional 필드 · 빈 값 → undefined · required (category) 는 빈 문자열
    const isOptional = editing.field !== "category";
    const nextValue: string | undefined = cleaned || (isOptional ? undefined : "");
    savingRef.current = true;
    setSaving(true);
    setZones((prev: ZoneDef[]) => prev.map(z => z.num === editing.num ? { ...z, [editing.field]: nextValue } : z));
    setTimeout(async () => {
      const ok = await saveNow();
      savingRef.current = false;
      setSaving(false);
      if (ok) { showSuccess(`구역 ${editing.num}번 저장 완료`); cancelEdit(); }
      else showError("구역 저장 실패 · 관리자 lv≥9 필요");
    }, 50);
  };

  const resetToDefault = async () => {
    if (!canEdit) return;
    const ok = await confirm({
      title: "구역 정의 기본값 복원",
      message: `모든 매장 구역 정의를 zonecategory.png 기본값으로 되돌립니다.\n\n현재 편집한 내용은 사라집니다. 진행할까요?`,
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    setZones(DEFAULT_ZONES);
    setTimeout(async () => {
      const ok = await saveNow();
      setSaving(false);
      if (ok) showSuccess("기본값 복원 완료");
      else showError("기본값 복원 실패");
    }, 50);
  };

  // 2026-08-26 · 사용자 지시 · section 대신 3 대분류 존 (num 기준) 로 그룹핑
  const grouped: Record<MajorZone, ZoneDef[]> = { "central-otc": [], "consult": [], "beauty-food": [], "other": [] };
  for (const z of zones) grouped[classifyZone(z.num)].push(z);
  for (const k of MAJOR_ZONE_ORDER) grouped[k].sort((a, b) => a.num - b.num);

  const inputCls = "flex-1 min-w-0 h-9 px-2.5 rounded-md border border-brand-deep bg-white text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint";
  const textareaCls = "flex-1 min-w-0 min-h-[36px] max-h-[160px] px-2.5 py-1.5 rounded-md border border-brand-deep bg-white text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint resize-y";

  const renderEdit = (zone: ZoneDef, field: EditField, display: React.ReactNode, multiline = false) => {
    const isEditing = editing?.num === zone.num && editing?.field === field;
    if (isEditing) {
      const Input = multiline ? "textarea" : "input";
      return (
        <div className="flex items-start gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft((e.target as HTMLInputElement | HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (!multiline && e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              if (multiline && (e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); commitEdit(); }
            }}
            onBlur={() => { if (!savingRef.current) commitEdit(); }}
            className={multiline ? textareaCls : inputCls}
            disabled={saving}
          />
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={commitEdit} disabled={saving} className="shrink-0 w-8 h-9 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-40" title={multiline ? "저장 (Ctrl+Enter)" : "저장 (Enter)"}>
            {saving ? <Spinner size={11} tone="white" /> : <Check size={13} />}
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancelEdit} disabled={saving} className="shrink-0 w-8 h-9 flex items-center justify-center rounded-md bg-white border border-line hover:bg-zinc-50 text-zinc-500 cursor-pointer disabled:opacity-40" title="취소 (Esc)">
            <X size={13} />
          </button>
        </div>
      );
    }
    if (!canEdit) return <span className="text-[14px] text-ink">{display}</span>;
    return (
      <button
        type="button"
        onClick={() => startEdit(zone, field)}
        className="group inline-flex items-start gap-1.5 text-left text-[14px] font-semibold text-ink hover:bg-brand-tint/40 rounded-md px-1.5 py-1 cursor-pointer transition w-full max-w-full break-keep whitespace-normal"
        title="클릭하여 편집"
      >
        <span className="flex-1 min-w-0">{display}</span>
        <Pencil size={12} className="text-zinc-300 group-hover:text-brand-deep transition opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}

      <Card padding="md" topAccent>
        <div className="flex items-start gap-3">
          <IconTile icon={<Pencil size={16} />} tone="violet" size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight">매장구역도 편집</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              구역명 · 상세설명 직접 편집 · 서브존 (1A/1B ...) 별도 행 · Enter 즉시 저장
              {!canEdit && <span className="ml-2 text-rose-500 font-bold">· 관리자 (lv 9) 전용</span>}
            </div>
          </div>
          <StatusPill tone={saveState === "saved" ? "emerald" : saveState === "saving" ? "amber" : "zinc"} size="sm">
            {saveState === "saved" ? "저장됨" : saveState === "saving" ? "저장 중..." : `${zones.length}구역`}
          </StatusPill>
          {canEdit && (
            <button
              type="button"
              onClick={resetToDefault}
              disabled={saving}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-bold text-zinc-600 bg-white border border-line hover:bg-zinc-50 hover:border-brand-deep hover:text-brand-deep transition cursor-pointer disabled:opacity-40"
              title="zonecategory.png 기본값으로 복원"
            >
              <RotateCcw size={13} /> 기본값 복원
            </button>
          )}
        </div>
      </Card>

      {loading ? (
        <Card padding="md" className="flex items-center justify-center py-12">
          <Spinner size={16} tone="violet" label="구역 정의 로딩 중..." labelSize={14} />
        </Card>
      ) : zones.length === 0 ? (
        <Card padding="none" className="py-12">
          <EmptyState icon={Save} title="구역 정의 없음" hint="[기본값 복원] 클릭" size="normal" />
        </Card>
      ) : (
        MAJOR_ZONE_ORDER.filter(mz => grouped[mz].length > 0).map(mz => {
          const flatRows = grouped[mz].flatMap(expandZoneToRows);
          const mzTone = MAJOR_ZONE_TONE[mz];
          return (
            <Card key={mz} padding="md" className={`bg-gradient-to-b ${mzTone.bg} to-transparent`}>
              <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-line">
                <span className={`w-2 h-6 rounded-full ${mzTone.bar}`} />
                <span className="text-[17px] font-extrabold text-ink tracking-tight">{MAJOR_ZONE_LABEL[mz]}</span>
                <span className={`inline-flex items-center h-6 px-2 rounded-md border text-[12px] font-bold tabular-nums ${mzTone.badge}`}>{MAJOR_ZONE_RANGE[mz]}</span>
                <span className="text-[12px] text-zinc-400 ml-auto tabular-nums">{grouped[mz].length}구역 · {flatRows.length}행</span>
              </div>
              <table className="w-full text-[13px] table-fixed">
                <thead>
                  <tr className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-2 py-1.5" style={{ width: "45%" }}>구역</th>
                    <th className="text-left px-2 py-1.5" style={{ width: "55%" }}>상세 설명 (매장구역도 hover)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {flatRows.map((fr) => {
                    const z = fr.zone;
                    const tone = codeToneCls(fr.sub);
                    return (
                      <tr key={`${z.section}-${fr.code}`} className={`hover:bg-white/60 transition ${tone.row} align-top`}>
                        {/* 왼쪽 · 구역 = 코드 뱃지 + 카테고리 텍스트 (편집) */}
                        <td className="px-2 py-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className={`shrink-0 inline-flex items-center justify-center min-w-[38px] h-7 px-2 rounded-md border font-extrabold tabular-nums text-[14px] ${tone.badge}`}>
                              {fr.code}
                            </span>
                            <div className="flex-1 min-w-0">
                              {renderEdit(z, fr.catField, fr.catValue || <span className="text-zinc-300 italic">(비어있음 · 클릭하여 입력)</span>, false)}
                            </div>
                          </div>
                        </td>
                        {/* 오른쪽 · 상세설명 (편집 · multiline) */}
                        <td className="px-2 py-2">
                          {renderEdit(z, fr.descField, fr.descValue
                            ? <span className="text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">{fr.descValue}</span>
                            : <span className="text-zinc-300 italic">(설명 없음 · 클릭하여 입력)</span>, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default ZoneEditPanel;
