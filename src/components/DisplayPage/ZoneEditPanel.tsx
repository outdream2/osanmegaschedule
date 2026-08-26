// src/components/DisplayPage/ZoneEditPanel.tsx
// 2026-08-26 · 사용자 지시 · 매장진열 · "매장구역도 편집" 신규 탭
//   · useZoneDefs (KV) · label · category · num · subA · subB 편집
//   · 관리자 (lv 9) 전용 · 저장 시 saveNow · 토스트 피드백
//   · 프리미엄 톤 · Card · Table · TextInput

import React, { useState, useEffect } from "react";
import { Save, RotateCcw, Pencil, Check, X } from "lucide-react";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { useZoneDefs, SECTION_LABEL, type ZoneDef, type ZoneSection } from "../../hooks/useZoneDefs";
import { useToast, toastClass } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { ZONE_DEFS as DEFAULT_ZONES } from "../../constants/displayZones";

interface Props {
  canEdit?: boolean;
}

// 2026-08-26 · 사용자 지시 · 번호 → 구역 · aisle 1-8 (subA/subB 있음) · "{num}A / {num}B"
//   · 계산대 40 (subC 있음) · "40A / 40B / 40C"
//   · 나머지 · 단순 num (예: 벽면 9-34)
function formatZoneCode(z: ZoneDef): React.ReactNode {
  const hasA = !!z.subA;
  const hasB = !!z.subB;
  const hasC = !!(z as any).subC;
  if (hasA && hasB && hasC) return <span>{z.num}A · {z.num}B · {z.num}C</span>;
  if (hasA && hasB)         return <span>{z.num}A · {z.num}B</span>;
  return <span>{z.num}</span>;
}

export const ZoneEditPanel: React.FC<Props> = ({ canEdit = false }) => {
  const { zones, setZones, loading, saveNow, saveState } = useZoneDefs();
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ num: number; field: "label" | "category" | "subA" | "subB" | "description" } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEditing(null); setDraft(""); }, [zones.length]);

  const startEdit = (zone: ZoneDef, field: "label" | "category" | "subA" | "subB" | "description") => {
    if (!canEdit) return;
    setEditing({ num: zone.num, field });
    const cur = field === "label"       ? zone.label
              : field === "category"    ? zone.category
              : field === "subA"        ? (zone.subA ?? "")
              : field === "subB"        ? (zone.subB ?? "")
              :                           (zone.description ?? "");
    setDraft(cur);
  };
  const cancelEdit = () => { setEditing(null); setDraft(""); };
  const commitEdit = async () => {
    if (!editing) return;
    const cleaned = draft.trim();
    setSaving(true);
    setZones((prev: ZoneDef[]) => prev.map(z => z.num === editing.num ? { ...z, [editing.field]: cleaned || (editing.field === "subA" || editing.field === "subB" || editing.field === "description" ? undefined : "") } : z));
    setTimeout(async () => {
      const ok = await saveNow();
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

  const grouped: Record<ZoneSection, ZoneDef[]> = { top_wall: [], aisle: [], left_wall: [], bottom_wall: [], wing: [], event: [] };
  for (const z of zones) grouped[z.section].push(z);

  const inputCls = "flex-1 min-w-0 h-8 px-2 rounded-md border border-brand-deep bg-white text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint";

  const renderEdit = (zone: ZoneDef, field: "label" | "category" | "subA" | "subB" | "description", display: React.ReactNode) => {
    const isEditing = editing?.num === zone.num && editing?.field === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            className={inputCls}
            disabled={saving}
          />
          <button type="button" onClick={commitEdit} disabled={saving} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-40" title="저장 (Enter)">
            {saving ? <Spinner size={11} tone="white" /> : <Check size={12} />}
          </button>
          <button type="button" onClick={cancelEdit} disabled={saving} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-white border border-line hover:bg-zinc-50 text-zinc-500 cursor-pointer disabled:opacity-40" title="취소 (Esc)">
            <X size={12} />
          </button>
        </div>
      );
    }
    if (!canEdit) return <span className="text-[14px] text-ink">{display}</span>;
    return (
      <button
        type="button"
        onClick={() => startEdit(zone, field)}
        className="group inline-flex items-center gap-1.5 text-left text-[14px] font-semibold text-ink hover:bg-brand-tint/40 rounded-md px-1.5 py-0.5 cursor-pointer transition w-full max-w-full"
        title="클릭하여 편집"
      >
        <span className="truncate">{display}</span>
        <Pencil size={11} className="text-zinc-300 group-hover:text-brand-deep transition opacity-0 group-hover:opacity-100 shrink-0" />
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
              구역 라벨·카테고리·서브존 (A/B) 편집 · 저장 즉시 반영
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
        (Object.keys(grouped) as ZoneSection[]).filter(sec => grouped[sec].length > 0).map(sec => (
          <Card key={sec} padding="md">
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-line">
              <span className="w-1.5 h-4 rounded-full bg-brand-deep" />
              <span className="text-[15px] font-bold text-ink">{SECTION_LABEL[sec]}</span>
              <span className="text-[12px] text-zinc-400 ml-auto">{grouped[sec].length}구역</span>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="text-left px-2 py-1.5 w-20">구역</th>
                  <th className="text-left px-2 py-1.5" style={{ minWidth: 140 }}>라벨</th>
                  <th className="text-left px-2 py-1.5" style={{ minWidth: 220 }}>카테고리</th>
                  <th className="text-left px-2 py-1.5" style={{ minWidth: 160 }}>서브 A</th>
                  <th className="text-left px-2 py-1.5" style={{ minWidth: 160 }}>서브 B</th>
                  <th className="text-left px-2 py-1.5" style={{ minWidth: 260 }}>상세 설명 (매장구역도 hover)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {grouped[sec].map(z => (
                  <tr key={z.num} className="hover:bg-zinc-50/60 transition">
                    {/* 2026-08-26 · 사용자 지시 · 번호 대신 구역 (zonecategory.png) · aisle 1-8 은 A/B 두 줄 · 나머지는 xx */}
                    <td className="px-2 py-1.5 font-extrabold text-brand-deep tabular-nums text-[15px] whitespace-nowrap">{formatZoneCode(z)}</td>
                    <td className="px-2 py-1.5">{renderEdit(z, "label", z.label || <span className="text-zinc-300">(비어있음)</span>)}</td>
                    <td className="px-2 py-1.5 break-keep whitespace-normal">{renderEdit(z, "category", z.category || <span className="text-zinc-300">(비어있음)</span>)}</td>
                    <td className="px-2 py-1.5 break-keep whitespace-normal">{renderEdit(z, "subA", z.subA ?? <span className="text-zinc-300 italic">-</span>)}</td>
                    <td className="px-2 py-1.5 break-keep whitespace-normal">{renderEdit(z, "subB", z.subB ?? <span className="text-zinc-300 italic">-</span>)}</td>
                    <td className="px-2 py-1.5 break-keep whitespace-normal">{renderEdit(z, "description", z.description ?? <span className="text-zinc-300 italic">-</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  );
};

export default ZoneEditPanel;
