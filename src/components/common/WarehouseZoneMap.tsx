// src/components/common/WarehouseZoneMap.tsx
// 2026-08-26 · 사용자 지시 · 창고1 · 창고2 구역도 · 매장구역도 옆 탭
// 2026-08-27 · 사용자 지시 · Phase 1 편집 UI · KV 저장 · 전역 연동
//   · app_settings.warehouse_zones (KV) · useKvSetting · debounce 저장
//   · 편집 모드 · 라벨 인라인 편집 (안전 · code 불변) · CustomEvent broadcast
//   · 신규 추가/삭제 · Phase 2 (지연)

import React, { useState, useCallback, useMemo } from "react";
import { Warehouse, Package, ZoomIn, ZoomOut, Pencil, Check, X, Save } from "lucide-react";
import warehouseImg from "../../images/warehouse_layout.webp";
import storage1Img from "../../images/storage1.png";
import storage2Img from "../../images/storage2.png";
import { Card } from "./Card";
import { IconTile } from "./IconTile";
import { Spinner } from "./Spinner";
import { StatusPill } from "./StatusPill";
import { useKvSetting } from "../../hooks/useKvSetting";
import {
  DEFAULT_WAREHOUSE_ZONES,
  WAREHOUSE_ZONES_KEY,
  WAREHOUSE_ZONES_UPDATED_EVENT,
  type WarehouseZonesConfig,
  type WarehouseZoneItem,
} from "../../constants/warehouseZoneDefaults";

interface WarehouseZoneMapProps {
  /** 창고 필터 · both · 1 · 2 · 기본 both */
  filter?: "both" | "1" | "2";
  /** 편집 권한 (기본 true · admin 판정은 부모 페이지에서) */
  canEdit?: boolean;
}

type SectionKey = keyof WarehouseZonesConfig;

export const WarehouseZoneMap: React.FC<WarehouseZoneMapProps> = ({ filter = "both", canEdit = true }) => {
  const [imgOpen, setImgOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // 2026-08-27 · KV 로드 · debounce 저장
  const { value: zones, setValue: setZones, loaded, saveState, saveNow } = useKvSetting<WarehouseZonesConfig>({
    key: WAREHOUSE_ZONES_KEY,
    defaultValue: DEFAULT_WAREHOUSE_ZONES,
    debounceMs: 800,
    // 방어 · 스키마 불일치 시 default 로 fallback
    sanitize: (raw): WarehouseZonesConfig => {
      const r = (raw ?? {}) as Partial<WarehouseZonesConfig>;
      const sanitizeArr = (a: unknown, fallback: WarehouseZoneItem[]): WarehouseZoneItem[] =>
        Array.isArray(a) ? a.filter(x => x && typeof (x as any).code === "string") as WarehouseZoneItem[] : fallback;
      return {
        warehouse1:            sanitizeArr(r.warehouse1,           DEFAULT_WAREHOUSE_ZONES.warehouse1),
        warehouse2_inner:      sanitizeArr(r.warehouse2_inner,     DEFAULT_WAREHOUSE_ZONES.warehouse2_inner),
        warehouse2_center:     sanitizeArr(r.warehouse2_center,    DEFAULT_WAREHOUSE_ZONES.warehouse2_center),
        warehouse2_right:      sanitizeArr(r.warehouse2_right,     DEFAULT_WAREHOUSE_ZONES.warehouse2_right),
        warehouse2_cosmetics:  sanitizeArr(r.warehouse2_cosmetics, DEFAULT_WAREHOUSE_ZONES.warehouse2_cosmetics),
      };
    },
  });

  const updateItem = useCallback((section: SectionKey, idx: number, patch: Partial<WarehouseZoneItem>) => {
    setZones(prev => {
      const next: WarehouseZonesConfig = { ...prev, [section]: prev[section].slice() };
      next[section][idx] = { ...next[section][idx], ...patch };
      return next;
    });
  }, [setZones]);

  const handleSaveNow = useCallback(async () => {
    const ok = await saveNow();
    if (ok) {
      // 전역 broadcast · 다른 페이지가 refresh 하도록
      window.dispatchEvent(new CustomEvent(WAREHOUSE_ZONES_UPDATED_EVENT));
      setEditMode(false);
    }
  }, [saveNow]);

  const saveStatePill = useMemo(() => {
    const tone = saveState === "saving" ? "sky" : saveState === "saved" ? "emerald" : saveState === "error" ? "rose" : "zinc";
    const text = saveState === "saving" ? "저장중" : saveState === "saved" ? "저장됨" : saveState === "error" ? "저장실패" : "대기";
    return <StatusPill tone={tone as any} size="sm" dot pulse={saveState === "saving"}>{text}</StatusPill>;
  }, [saveState]);

  if (!loaded) {
    return (
      <Card padding="md"><div className="flex items-center gap-2 text-ink-soft"><Spinner size={14} /> 창고 구역도 로딩중…</div></Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 · 실사진 참조 안내 · 편집 토글 */}
      <Card padding="md" topAccent>
        <div className="flex items-start gap-3 flex-wrap">
          <IconTile icon={<Warehouse size={16} />} tone="amber" size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight leading-tight">창고 구역도</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              창고1 (좌측 6구역) · 창고2 (안쪽 20구역 · 중앙 13섹션 · 오른쪽 28구역 · 화장품 4구역)
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editMode && saveStatePill}
            {canEdit && (
              editMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleSaveNow}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] font-bold shadow-sm transition cursor-pointer"
                    title="변경사항 저장"
                  >
                    <Save size={14} />저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-line hover:bg-zinc-50 text-ink-soft text-[14px] font-bold transition cursor-pointer"
                    title="편집 종료 (변경사항은 자동저장됨)"
                  >
                    <X size={14} />닫기
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-line hover:border-brand-deep/40 hover:text-brand-deep text-ink-soft text-[14px] font-bold transition cursor-pointer"
                  title="구역 라벨 편집"
                >
                  <Pencil size={14} />편집
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setImgOpen(v => !v)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-semibold text-ink-soft bg-white border border-line hover:border-brand-deep/40 hover:text-brand-deep transition cursor-pointer"
              title="원본 이미지 참조"
            >
              {imgOpen ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
              원본 이미지
            </button>
          </div>
        </div>
      </Card>

      {imgOpen && (
        <Card padding="sm">
          <img src={warehouseImg} alt="창고 구역도 원본 (참조용)" className="w-full max-w-[900px] mx-auto rounded-lg border border-line" loading="lazy" />
        </Card>
      )}

      {/* 창고1 */}
      {(filter === "both" || filter === "1") && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[15px] font-bold text-orange-700 tracking-tight">창고 1</span>
            <span className="text-[12px] text-ink-soft ml-auto">{zones.warehouse1.length} 구역</span>
          </div>
          <img src={storage1Img} alt="창고 1 실사진" className="w-full max-w-[720px] mx-auto rounded-lg border border-orange-200 mb-3" loading="lazy" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {zones.warehouse1.map((z, i) => (
              <ZoneBox
                key={`w1-${z.code}-${i}`}
                item={z}
                tone="orange"
                editing={editMode}
                onChange={(patch) => updateItem("warehouse1", i, patch)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* 창고2 */}
      {(filter === "both" || filter === "2") && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-line">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span className="text-[15px] font-bold text-teal-700 tracking-tight">창고 2</span>
            <span className="text-[12px] text-ink-soft ml-auto">
              안쪽 {zones.warehouse2_inner.length} · 중앙 {zones.warehouse2_center.length} · 오른쪽 {zones.warehouse2_right.length} · 화장품 {zones.warehouse2_cosmetics.length}
            </span>
          </div>
          <img src={storage2Img} alt="창고 2 실사진" className="w-full max-w-[720px] mx-auto rounded-lg border border-teal-200 mb-3" loading="lazy" />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ZoneSection title="안쪽" items={zones.warehouse2_inner} onChange={(idx, patch) => updateItem("warehouse2_inner", idx, patch)} editing={editMode} tone="teal" />
            <ZoneSection title="중앙" items={zones.warehouse2_center} onChange={(idx, patch) => updateItem("warehouse2_center", idx, patch)} editing={editMode} tone="teal" />
            <ZoneSection title="오른쪽" items={zones.warehouse2_right} onChange={(idx, patch) => updateItem("warehouse2_right", idx, patch)} editing={editMode} tone="teal" />
          </div>

          <div className="mt-4 pt-3 border-t border-teal-100">
            <ZoneSection title="화장품" items={zones.warehouse2_cosmetics} onChange={(idx, patch) => updateItem("warehouse2_cosmetics", idx, patch)} editing={editMode} tone="teal" tintTitle="pink" cols="grid-cols-2 sm:grid-cols-4" />
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Section wrapper ───────────────────────────────────────────────────
interface ZoneSectionProps {
  title: string;
  items: WarehouseZoneItem[];
  onChange: (idx: number, patch: Partial<WarehouseZoneItem>) => void;
  editing: boolean;
  tone: "orange" | "teal";
  tintTitle?: "teal" | "pink";
  cols?: string;
}
const ZoneSection: React.FC<ZoneSectionProps> = ({ title, items, onChange, editing, tone, tintTitle = "teal", cols }) => {
  const titleColor = tintTitle === "pink" ? "text-pink-700" : "text-teal-700";
  const iconColor = tintTitle === "pink" ? "text-pink-600" : "text-teal-600";
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Package size={12} className={iconColor} />
        <span className={`text-[13px] font-bold ${titleColor} uppercase tracking-wider`}>{title}</span>
        <span className="text-[11px] text-ink-soft ml-auto">{items.length}구역</span>
      </div>
      <div className={`grid ${cols ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-2"} gap-1.5`}>
        {items.map((z, i) => (
          <ZoneBox key={`${title}-${z.code}-${i}`} item={z} tone={tone} editing={editing} onChange={(p) => onChange(i, p)} size="sm" />
        ))}
      </div>
    </div>
  );
};

// ─── Zone Box · 편집/뷰 통합 ────────────────────────────────────────────
const TONE: Record<"orange" | "teal", { bg: string; border: string; num: string; label: string; input: string }> = {
  orange: { bg: "bg-orange-50", border: "border-orange-300", num: "text-orange-800", label: "text-orange-700", input: "focus:border-orange-500 focus:ring-orange-200" },
  teal:   { bg: "bg-teal-50",   border: "border-teal-300",   num: "text-teal-800",   label: "text-teal-700",   input: "focus:border-teal-500 focus:ring-teal-200" },
};

interface ZoneBoxProps {
  item: WarehouseZoneItem;
  tone: "orange" | "teal";
  editing: boolean;
  onChange: (patch: Partial<WarehouseZoneItem>) => void;
  size?: "sm" | "md";
}
const ZoneBox: React.FC<ZoneBoxProps> = ({ item, tone, editing, onChange, size = "md" }) => {
  const t = TONE[tone];
  const isSm = size === "sm";
  const [labelDraft, setLabelDraft] = useState<string | null>(null);
  const [hintDraft, setHintDraft] = useState<string | null>(null);

  const startEditLabel = () => setLabelDraft(item.label ?? "");
  const commitLabel = () => {
    if (labelDraft != null && labelDraft !== item.label) onChange({ label: labelDraft.trim() });
    setLabelDraft(null);
  };
  const startEditHint = () => setHintDraft(item.hint ?? "");
  const commitHint = () => {
    if (hintDraft != null && (hintDraft || "") !== (item.hint || "")) onChange({ hint: hintDraft.trim() || undefined });
    setHintDraft(null);
  };

  return (
    <div className={`${t.bg} ${t.border} border rounded-lg ${isSm ? "px-2 py-1.5" : "px-3 py-2"} flex flex-col items-center justify-center gap-0.5 hover:shadow-sm transition-shadow`}>
      {item.tag && !isSm && (
        <span className="text-[10px] font-bold text-ink-soft px-1 py-0.5 rounded bg-white/70 border border-line mb-0.5">{item.tag}</span>
      )}
      <span className={`${t.num} font-bold ${isSm ? "text-[14px]" : "text-[16px]"} tabular-nums leading-none`}>{item.code}</span>
      {editing && labelDraft != null ? (
        <input
          type="text"
          autoFocus
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLabel(); } if (e.key === "Escape") { e.preventDefault(); setLabelDraft(null); } }}
          className={`w-full ${isSm ? "text-[11px]" : "text-[12px]"} font-semibold text-center bg-white border ${t.border} rounded px-1 py-0.5 outline-none focus:ring-2 ${t.input}`}
        />
      ) : (
        <span
          className={`${t.label} ${isSm ? "text-[11px]" : "text-[12px]"} font-semibold text-center leading-tight whitespace-normal break-keep w-full ${editing ? "cursor-pointer hover:underline" : ""}`}
          onClick={editing ? startEditLabel : undefined}
          title={editing ? "클릭하여 라벨 편집" : item.label}
        >
          {item.label || (editing ? <span className="text-zinc-300 italic">(라벨 없음)</span> : "")}
        </span>
      )}
      {(item.hint || editing) && (
        editing && hintDraft != null ? (
          <input
            type="text"
            autoFocus
            value={hintDraft}
            onChange={(e) => setHintDraft(e.target.value)}
            onBlur={commitHint}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitHint(); } if (e.key === "Escape") { e.preventDefault(); setHintDraft(null); } }}
            className={`w-full text-[10px] text-center bg-white border ${t.border} rounded px-1 py-0.5 outline-none focus:ring-2 ${t.input} mt-0.5`}
            placeholder="힌트 (공급사 등)"
          />
        ) : (
          <span
            className={`text-[10px] text-ink-soft text-center leading-tight whitespace-normal break-keep w-full mt-0.5 ${editing ? "cursor-pointer hover:underline" : ""}`}
            onClick={editing ? startEditHint : undefined}
            title={editing ? "클릭하여 힌트 편집" : item.hint}
          >
            {item.hint || (editing ? <span className="text-zinc-300 italic">(힌트)</span> : "")}
          </span>
        )
      )}
    </div>
  );
};

export default WarehouseZoneMap;
