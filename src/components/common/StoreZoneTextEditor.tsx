// src/components/common/StoreZoneTextEditor.tsx
// 2026-10-11 · 사용자 지시 · 매장구역도 편집 · 그래픽 폐기 · 텍스트 리스트 (옵션 A)
//   · 홈 랜딩 톤 · CARD rounded-[12px] + border-slate-200 + subtle shadow
//   · 각 row · location (1A·1B·22 등) + category + detailedCategory inline input
//   · 저장 · updateZoneByRowId (PATCH /api/zone-defs/:id · useZoneDefs 재사용)
//   · 모달 wrapper · common/Modal

import React, { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { X, Check, Pencil, FloppyDisk } from "@phosphor-icons/react";
import type { ZoneDefRaw } from "../../hooks/useZoneDefs";

interface StoreZoneTextEditorProps {
  open: boolean;
  onClose: () => void;
  zonesRaw: ZoneDefRaw[];
  onUpdate: (id: number, patch: Partial<Pick<ZoneDefRaw, "category" | "detailedCategory" | "location" | "zone">>) => Promise<boolean>;
}

// 2026-10-11 · 매대 code 분류 (상비약 1-9 · 일반약 10-46)
function groupKey(z: ZoneDefRaw): "emer" | "topWall" | "center" | "bottomWall" | "wing" | "counter" | "other" {
  const loc = String(z.location ?? "").trim().toUpperCase();
  const mPair = /^([1-9])([AB])$/.exec(loc);
  if (mPair) return "emer";
  if (loc === "22") return "center";
  const mNum = /^(\d+)$/.exec(loc);
  if (mNum) {
    const n = Number(mNum[1]);
    if (n >= 10 && n <= 21) return "topWall";
    if (n >= 23 && n <= 27) return "bottomWall";
    if (n >= 28 && n <= 40) return "wing";
    if (n >= 41 && n <= 46) return "counter";
  }
  return "other";
}

const GROUP_LABEL: Record<string, { label: string; subtitle: string; tone: string }> = {
  emer:       { label: "상비약 (중앙 1~9)",      subtitle: "중앙 진열대",       tone: "bg-rose-500"    },
  topWall:    { label: "일반약 · 상단벽 10~21",   subtitle: "벽",                tone: "bg-indigo-500"  },
  center:     { label: "일반약 · 중앙 22",        subtitle: "중앙",              tone: "bg-indigo-500"  },
  bottomWall: { label: "일반약 · 하단벽 23~27",   subtitle: "벽",                tone: "bg-indigo-500"  },
  wing:       { label: "일반약 · 윙 28~40",       subtitle: "윙",                tone: "bg-indigo-500"  },
  counter:    { label: "일반약 · 카운터 41~46",   subtitle: "카운터",            tone: "bg-indigo-500"  },
  other:      { label: "기타",                   subtitle: "미분류",            tone: "bg-slate-400"   },
};

interface EditRowState {
  rowId: number;
  category: string;
  detailedCategory: string;
}

export const StoreZoneTextEditor: React.FC<StoreZoneTextEditorProps> = ({ open, onClose, zonesRaw, onUpdate }) => {
  const [editingRow, setEditingRow] = useState<EditRowState | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ZoneDefRaw[]>();
    for (const z of zonesRaw) {
      const k = groupKey(z);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(z);
    }
    const order: Array<keyof typeof GROUP_LABEL> = ["emer", "topWall", "center", "bottomWall", "wing", "counter", "other"];
    return order
      .filter(k => map.has(k) && (map.get(k) ?? []).length > 0)
      .map(k => ({
        key: k,
        meta: GROUP_LABEL[k],
        rows: (map.get(k) ?? []).slice().sort((a, b) => {
          const la = String(a.location ?? "");
          const lb = String(b.location ?? "");
          return la.localeCompare(lb, "ko", { numeric: true });
        }),
      }));
  }, [zonesRaw]);

  const startEdit = (z: ZoneDefRaw) => {
    setEditingRow({
      rowId: z.id,
      category: z.category ?? "",
      detailedCategory: z.detailedCategory ?? "",
    });
  };

  const cancelEdit = () => setEditingRow(null);

  const commitEdit = async () => {
    if (!editingRow) return;
    const row = zonesRaw.find(z => z.id === editingRow.rowId);
    if (!row) { setEditingRow(null); return; }
    const changed =
      (editingRow.category.trim() !== (row.category ?? "").trim()) ||
      (editingRow.detailedCategory.trim() !== (row.detailedCategory ?? "").trim());
    if (!changed) { setEditingRow(null); return; }
    setSaving(editingRow.rowId);
    try {
      const ok = await onUpdate(editingRow.rowId, {
        category: editingRow.category.trim() || undefined,
        detailedCategory: editingRow.detailedCategory.trim() || undefined,
      });
      if (ok) {
        setSavedFlash(editingRow.rowId);
        setTimeout(() => setSavedFlash(null), 1200);
      }
    } finally {
      setSaving(null);
      setEditingRow(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" closeOnBackdrop={false}>
      <div className="flex flex-col max-h-[80vh]">
        {/* Header · HomeDashboard 공식 톤 (좌측 accent 없음 · subtle) */}
        <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
          <span className="w-[3px] h-[14px] bg-indigo-500 rounded-full" aria-hidden />
          <h2 className="flex-1 text-[15px] md:text-[16px] font-semibold text-ink tracking-tight">매장구역 편집</h2>
          <span className="text-[12px] text-slate-500 font-medium">총 {zonesRaw.length}개 매대 · 매대 code · 카테고리 · 상세분류 매칭</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] text-slate-500 hover:text-ink hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="닫기"
            title="닫기"
          >
            <X size={14} />
          </button>
        </header>

        {/* Content · scroll */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3">
          {grouped.length === 0 && (
            <div className="text-center text-[14px] text-slate-400 py-12">매대 데이터 없음</div>
          )}
          {grouped.map(group => (
            <section
              key={group.key}
              className="bg-white border border-slate-200 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              <header className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
                <span className={`w-[3px] h-[14px] ${group.meta.tone} rounded-full`} aria-hidden />
                <h3 className="text-[14px] font-semibold text-ink tracking-tight">{group.meta.label}</h3>
                <span className="text-[12px] text-slate-500 font-medium tabular-nums">{group.rows.length}개</span>
              </header>
              <div className="divide-y divide-slate-100">
                {group.rows.map(z => {
                  const isEditing = editingRow?.rowId === z.id;
                  const isSaving = saving === z.id;
                  const didSave = savedFlash === z.id;
                  return (
                    <div
                      key={z.id}
                      className="flex items-center gap-2 md:gap-3 px-3 py-2 hover:bg-slate-50/60 transition-colors"
                    >
                      <span className="shrink-0 w-14 inline-flex items-center justify-center h-7 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200 text-[13px] font-bold tabular-nums">
                        {z.location ?? "-"}
                      </span>
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editingRow.category}
                            onChange={e => setEditingRow({ ...editingRow, category: e.target.value })}
                            placeholder="카테고리 (예: 종합감기약)"
                            autoFocus
                            disabled={isSaving}
                            className="flex-1 min-w-0 h-7 px-2 text-[14px] border border-slate-300 rounded-md outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/50 bg-white"
                          />
                          <input
                            type="text"
                            value={editingRow.detailedCategory}
                            onChange={e => setEditingRow({ ...editingRow, detailedCategory: e.target.value })}
                            placeholder="상세분류 (예: 목감기약)"
                            disabled={isSaving}
                            className="flex-1 min-w-0 h-7 px-2 text-[14px] border border-slate-300 rounded-md outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/50 bg-white"
                          />
                          <button
                            type="button"
                            onClick={commitEdit}
                            disabled={isSaving}
                            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-40 transition-colors"
                            title="저장 (Enter)"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isSaving}
                            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 cursor-pointer disabled:opacity-40"
                            title="취소"
                          >
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 min-w-0 text-[14px] font-semibold text-ink truncate">
                            {z.category ?? <span className="text-slate-300 font-medium italic">카테고리 없음</span>}
                          </span>
                          <span className="flex-1 min-w-0 text-[13.5px] text-slate-500 truncate">
                            {z.detailedCategory ?? <span className="text-slate-300 italic">상세 없음</span>}
                          </span>
                          {didSave && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                              <FloppyDisk size={12} weight="fill" />
                              저장됨
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(z)}
                            className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer transition-colors"
                            title="편집"
                          >
                            <Pencil size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-200 bg-slate-50/40 sticky bottom-0">
          <p className="text-[12px] text-slate-500 font-medium">
            각 매대 row 의 <Pencil size={11} className="inline mb-0.5" /> 아이콘 클릭 → 카테고리·상세분류 편집
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 h-8 px-3 text-[13px] font-semibold text-slate-700 hover:text-ink bg-white border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer transition-colors"
          >
            닫기
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default StoreZoneTextEditor;
