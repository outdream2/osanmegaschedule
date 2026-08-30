// src/components/DisplayPage/ZoneEditPanel.tsx
// 2026-08-26 · 사용자 지시 · 매장진열 · "매장구역도 편집" 신규 탭
//   · SplitPanel · 왼쪽 = 전체 매장 구역도 (StoreZoneMap) · 오른쪽 = 탭메뉴 (3 대분류 존) + 편집 테이블
//   · 3컬럼 (구역·카테고리·상세카테고리) · 인라인 편집 · Enter/blur 자동 저장
//   · 서브존 별도 행 · 1A·1B·2A·2B ... 8A·8B · 9·10 ... · 40A/B/C · 41·42
//   · useZoneDefs (KV) · DB 즉시 반영 · 관리자 (lv 9) 전용

import React, { useState, useEffect, useRef } from "react";
import { Save, RotateCcw, Pencil, Check, X } from "lucide-react";
import { api } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { IconTile } from "../common/IconTile";
import { StatusPill } from "../common/StatusPill";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { SplitPanel } from "../common/SplitPanel";
import { StoreZoneMap } from "../common/StoreZoneMap";
import { PanZoomImage } from "../common/PanZoomImage";
import { useZoneDefs, type ZoneDef, type ZoneDefRaw, type ZoneDefWithRowIds } from "../../hooks/useZoneDefs";
// 2026-08-26 · 사용자 지시 · 원본 매장구역도 이미지 (pan/zoom viewer)
import zoneCategoryImg from "../../sample/zonecategory.png";
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
  /** 2026-08-30 · 담당자 편집 · 필드 및 rowId 매핑 · updateZoneRaw 직접 호출 */
  rowId?: number;
  assignee: string[];
  /** 2026-08-30 · 사용자 지시 · 구역 badge 는 DB location 컬럼 값 */
  location?: string;
}

// 2026-08-26 · 사용자 지시 · 구역 구조는 절대 사라지지 않음
//   · DEFAULT_ZONES 기준으로 서브 존재 여부 결정 · 편집값 (subA/B/C) 은 텍스트만 담당
//   · 서브 카테고리 비워도 · 지워도 · 행은 항상 표시
const DEFAULT_SUB_STRUCTURE: Map<number, { hasA: boolean; hasB: boolean; hasC: boolean }> = (() => {
  const m = new Map<number, { hasA: boolean; hasB: boolean; hasC: boolean }>();
  for (const z of DEFAULT_ZONES) {
    m.set(z.num, { hasA: !!z.subA, hasB: !!z.subB, hasC: !!z.subC });
  }
  return m;
})();

function expandZoneToRows(z: ZoneDef): FlatRow[] {
  // 구조는 DEFAULT_ZONES 기준 · 편집값이 undefined/빈문자열이어도 행은 유지
  const structure = DEFAULT_SUB_STRUCTURE.get(z.num) ?? { hasA: !!z.subA, hasB: !!z.subB, hasC: !!z.subC };
  const { hasA, hasB, hasC } = structure;
  const zz = z as ZoneDefWithRowIds;
  if (hasA && hasB && hasC) {
    return [
      { zone: z, code: zz.__locationA ?? `${z.num}A`, sub: "A", catField: "subA", descField: "descriptionA", catValue: z.subA ?? "", descValue: z.descriptionA, rowId: zz.__rowIdA, assignee: zz.__assigneeA ?? [], location: zz.__locationA },
      { zone: z, code: zz.__locationB ?? `${z.num}B`, sub: "B", catField: "subB", descField: "descriptionB", catValue: z.subB ?? "", descValue: z.descriptionB, rowId: zz.__rowIdB, assignee: zz.__assigneeB ?? [], location: zz.__locationB },
      { zone: z, code: zz.__locationC ?? `${z.num}C`, sub: "C", catField: "subC", descField: "descriptionC", catValue: z.subC ?? "", descValue: z.descriptionC, rowId: zz.__rowIdC, assignee: zz.__assigneeC ?? [], location: zz.__locationC },
    ];
  }
  if (hasA && hasB) {
    return [
      { zone: z, code: zz.__locationA ?? `${z.num}A`, sub: "A", catField: "subA", descField: "descriptionA", catValue: z.subA ?? "", descValue: z.descriptionA, rowId: zz.__rowIdA, assignee: zz.__assigneeA ?? [], location: zz.__locationA },
      { zone: z, code: zz.__locationB ?? `${z.num}B`, sub: "B", catField: "subB", descField: "descriptionB", catValue: z.subB ?? "", descValue: z.descriptionB, rowId: zz.__rowIdB, assignee: zz.__assigneeB ?? [], location: zz.__locationB },
    ];
  }
  return [
    { zone: z, code: zz.__location ?? String(z.num), sub: null, catField: "category", descField: "description", catValue: z.category, descValue: z.description, rowId: zz.__rowId, assignee: zz.__assignee ?? [], location: zz.__location },
  ];
}

const codeToneCls = (sub: SubKey): { badge: string; row: string } => {
  if (sub === "A") return { badge: "bg-violet-100 text-violet-800 border-violet-300", row: "bg-violet-50/25" };
  if (sub === "B") return { badge: "bg-sky-100 text-sky-800 border-sky-300",           row: "bg-sky-50/25" };
  if (sub === "C") return { badge: "bg-amber-100 text-amber-800 border-amber-300",     row: "bg-amber-50/25" };
  return { badge: "bg-brand-tint/60 text-brand-deep border-brand-deep/30",             row: "" };
};

type MajorZone = "central-otc" | "consult" | "beauty-food" | "counter";

const MAJOR_ZONE_LABEL: Record<MajorZone, string> = {
  "central-otc": "중앙상비약존",
  "consult":     "상담존",
  "beauty-food": "뷰티식품존",
  "counter":     "카운터테마존",
};
const MAJOR_ZONE_RANGE: Record<MajorZone, string> = {
  "central-otc": "1A – 8B",
  "consult":     "9 – 27",
  "beauty-food": "28 – 40",
  "counter":     "41 – 46",
};
const MAJOR_ZONE_ORDER: MajorZone[] = ["central-otc", "consult", "beauty-food", "counter"];
const MAJOR_ZONE_TONE: Record<MajorZone, { bar: string; badge: string; tab: string; tabActive: string }> = {
  "central-otc": { bar: "bg-brand-deep",  badge: "bg-brand-tint text-brand-deep border-brand-deep/40", tab: "hover:text-brand-deep hover:bg-brand-tint/30", tabActive: "text-brand-deep bg-brand-tint/60 border-brand-deep" },
  "consult":     { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 border-emerald-300", tab: "hover:text-emerald-700 hover:bg-emerald-50", tabActive: "text-emerald-700 bg-emerald-100 border-emerald-500" },
  "beauty-food": { bar: "bg-rose-500",    badge: "bg-rose-100 text-rose-700 border-rose-300",           tab: "hover:text-rose-700 hover:bg-rose-50", tabActive: "text-rose-700 bg-rose-100 border-rose-500" },
  "counter":     { bar: "bg-amber-500",   badge: "bg-amber-100 text-amber-700 border-amber-300",       tab: "hover:text-amber-700 hover:bg-amber-50", tabActive: "text-amber-700 bg-amber-100 border-amber-500" },
};

function classifyZone(num: number): MajorZone {
  if (num >= 1 && num <= 8)   return "central-otc";
  if (num >= 9 && num <= 27)  return "consult";
  if (num >= 28 && num <= 40) return "beauty-food"; // 40 (계산대) 포함
  return "counter"; // 카운터테마존 · 41 – 46 (총 6개 · 43=물약)
}

// 2026-08-30 · 담당자 편집기 · 직원명 자동완성 드롭다운 · 배지 다중 선택
//   · 사용자 지시 · 직원 이름 검색 → 아래 드롭다운 → 선택 → 배지 추가
//   · 각 add/remove 즉시 저장 (사용자 원칙 · "바뀔 때마다 저장")
//   · 직원 리스트 · GET /api/employees · 인스턴스 최초 1회 캐시
type EmpItem = { id: number; name: string };
let _empCache: EmpItem[] | null = null;
let _empPromise: Promise<EmpItem[]> | null = null;
async function fetchEmployeesCached(): Promise<EmpItem[]> {
  if (_empCache) return _empCache;
  if (_empPromise) return _empPromise;
  _empPromise = (async () => {
    try {
      const { data } = await api.get<EmpItem[]>("/api/employees");
      _empCache = Array.isArray(data) ? data.map(e => ({ id: e.id, name: e.name })) : [];
      return _empCache;
    } catch { return []; }
  })();
  return _empPromise;
}

const AssigneeEditor: React.FC<{
  rowId?: number;
  value: string[];
  canEdit: boolean;
  onSave: (rowId: number, patch: { assignee: string[] }) => Promise<boolean>;
}> = ({ rowId, value, canEdit, onSave }) => {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [emps, setEmps] = useState<EmpItem[]>(_empCache ?? []);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchEmployeesCached().then(list => setEmps(list));
  }, [open]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const addName = async (name: string) => {
    if (!rowId || !name || value.includes(name) || saving) return;
    setSaving(true);
    await onSave(rowId, { assignee: [...value, name] });
    setSaving(false);
    setQuery("");
    inputRef.current?.focus();
  };
  const removeName = async (name: string) => {
    if (!rowId || saving) return;
    setSaving(true);
    await onSave(rowId, { assignee: value.filter(n => n !== name) });
    setSaving(false);
  };

  const filtered = query.trim()
    ? emps.filter(e => e.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : emps.slice(0, 8);

  if (!canEdit && value.length === 0) return <span className="text-[12px] text-zinc-300">-</span>;
  if (!canEdit) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((n, i) => (
          <span key={i} className="inline-flex items-center h-6 px-2 rounded-full bg-brand-tint text-brand-deep text-[12px] font-bold border border-brand-deep/30">{n}</span>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex flex-wrap gap-1 items-center min-h-[32px] rounded-md border ${open ? "border-brand-deep ring-2 ring-brand-tint" : "border-transparent hover:border-line"} px-1.5 py-1 transition`}>
        {value.map((n, i) => (
          <span key={i} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-brand-tint text-brand-deep text-[12px] font-bold border border-brand-deep/30">
            {n}
            <button type="button" onClick={() => removeName(n)} disabled={saving} className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-deep hover:text-white transition cursor-pointer disabled:opacity-40" title="담당자 제거">
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && filtered.length > 0) { e.preventDefault(); addName(filtered[0].name); }
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); setQuery(""); }
            if (e.key === "Backspace" && !query && value.length > 0) { e.preventDefault(); removeName(value[value.length - 1]); }
          }}
          placeholder={value.length === 0 ? "직원명 검색·선택" : ""}
          className="flex-1 min-w-[80px] h-6 px-1 bg-transparent text-[13px] text-ink focus:outline-none placeholder:text-zinc-300 placeholder:italic"
          disabled={saving}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-52 overflow-auto bg-white rounded-lg border border-line shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-zinc-400 italic">일치하는 직원 없음</div>
          ) : filtered.map(e => {
            const already = value.includes(e.name);
            return (
              <button
                key={e.id}
                type="button"
                onMouseDown={ev => { ev.preventDefault(); if (!already) addName(e.name); }}
                disabled={already || saving}
                className={`w-full text-left px-3 py-1.5 text-[13px] font-semibold transition cursor-pointer ${already ? "bg-zinc-50 text-zinc-300 cursor-not-allowed" : "text-ink hover:bg-brand-tint/50"}`}
              >
                {e.name}{already ? " · 이미 선택됨" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ZoneEditPanel: React.FC<Props> = ({ canEdit = false }) => {
  const { zones, setZones, loading, saveNow, saveState, updateZoneRaw } = useZoneDefs();
  const { toast, showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ num: number; field: EditField } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<MajorZone>("central-otc");

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
  // 2026-08-30 · 사용자 버그 리포트 · "저장됨" 표시되나 카테고리 비어있음
  //   원인: setTimeout(saveNow) stale closure · dirtyZones=null 캡처 · 즉시 return true
  //   수정: updateZoneRaw(rowId, patch) 직접 호출 · 편집 필드 → 정확한 DB row 매핑
  const commitEdit = async () => {
    if (!editing || savingRef.current) return;
    const cleaned = draft.trim();
    const isDescField = editing.field.startsWith("description");
    const nextValue: string | undefined = cleaned || (isDescField ? undefined : "");
    const zone = zones.find(z => z.num === editing.num) as (ZoneDef & { __rowId?: number; __rowIdA?: number; __rowIdB?: number; __rowIdC?: number }) | undefined;
    if (!zone) { showError(`구역 ${editing.num} 찾기 실패`); return; }
    // 편집 필드 → row id + DB 컬럼 매핑
    let rowId: number | undefined;
    let patch: Partial<Omit<ZoneDefRaw, "id">> = {};
    switch (editing.field) {
      case "category":     rowId = zone.__rowId;  patch = { category: nextValue ?? "" }; break;
      case "subA":         rowId = zone.__rowIdA; patch = { category: nextValue ?? "" }; break;
      case "subB":         rowId = zone.__rowIdB; patch = { category: nextValue ?? "" }; break;
      case "subC":         rowId = zone.__rowIdC; patch = { category: nextValue ?? "" }; break;
      case "description":  rowId = zone.__rowId;  patch = { detailedCategory: nextValue }; break;
      case "descriptionA": rowId = zone.__rowIdA; patch = { detailedCategory: nextValue }; break;
      case "descriptionB": rowId = zone.__rowIdB; patch = { detailedCategory: nextValue }; break;
      case "descriptionC": rowId = zone.__rowIdC; patch = { detailedCategory: nextValue }; break;
    }
    if (!rowId) {
      showError(`구역 ${editing.num}번 · DB row 없음 · 관리자에게 문의 (zone_defs 신규 row 필요)`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    // 로컬 즉시 반영 (optimistic)
    setZones((prev: ZoneDef[]) => prev.map(z => z.num === editing.num ? { ...z, [editing.field]: nextValue } : z));
    const ok = await updateZoneRaw(rowId, patch);
    savingRef.current = false;
    setSaving(false);
    if (ok) { showSuccess(`구역 ${editing.num}번 저장 완료`); cancelEdit(); }
    else showError("구역 저장 실패 · 관리자 lv≥9 필요");
  };
  // 미사용 · 하위호환 saveNow 유지 (기본값 복원용)
  void saveNow;

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

  // 2026-08-30 · DB zone 컬럼 (대분류 존 명) 우선 · 없으면 num 기준 fallback
  //   · 중앙상비약존 → central-otc · 상담존 → consult · 뷰티식품존 → beauty-food · 카운터테마존 → counter
  const majorZoneNameToKey: Record<string, MajorZone> = {
    "중앙상비약존": "central-otc",
    "상담존":       "consult",
    "뷰티식품존":   "beauty-food",
    "카운터테마존": "counter",
  };
  const classifyByDb = (z: ZoneDef): MajorZone => {
    const zz = z as ZoneDefWithRowIds;
    const dbZone = zz.__majorZone ?? zz.__majorZoneA ?? zz.__majorZoneB ?? zz.__majorZoneC;
    if (dbZone && majorZoneNameToKey[dbZone]) return majorZoneNameToKey[dbZone];
    return classifyZone(z.num);
  };
  const grouped: Record<MajorZone, ZoneDef[]> = { "central-otc": [], "consult": [], "beauty-food": [], "counter": [] };
  for (const z of zones) grouped[classifyByDb(z)].push(z);
  for (const k of MAJOR_ZONE_ORDER) grouped[k].sort((a, b) => a.num - b.num);

  const inputCls = "flex-1 min-w-0 h-9 px-2.5 rounded-md border border-brand-deep bg-white text-[14px] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint";
  const textareaCls = "flex-1 min-w-0 min-h-[36px] max-h-[180px] px-2.5 py-1.5 rounded-md border border-brand-deep bg-white text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-brand-tint resize-y";

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

  // ── 좌측 · 상단 = 원본 zonecategory.png (pan/zoom) · 하단 = 공통 StoreZoneMap ────
  //   · zonecategory · 원본 참조 이미지 · 마우스 hover · wheel 줌 · 드래그 이동 · 더블클릭 초기화
  //   · StoreZoneMap · 공통 프레임워크 모듈 · zone_defs (KV) 실시간 반영 · 편집 즉시 갱신
  const leftPanel = (
    <div className="flex flex-col gap-3 p-2 min-h-full">
      {/* 원본 zonecategory 참조 이미지 · pan/zoom */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 px-1">
          <span className="w-1.5 h-4 rounded-full bg-rose-500" />
          <span className="text-[15px] font-bold text-ink">원본 구역 카테고리 (zonecategory)</span>
          <span className="text-[12px] text-zinc-400 ml-auto">스크롤 · 줌 · 드래그 · 이동</span>
        </div>
        <PanZoomImage
          src={zoneCategoryImg}
          alt="zonecategory · 매장 원본 구역 카테고리 참조"
          className="min-h-[280px] max-h-[420px]"
          initialScale={1}
          minScale={0.5}
          maxScale={8}
        />
      </div>

      {/* 공통 프레임워크 · 전체 매장 구역도 (실시간 편집 반영) */}
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-2 px-1">
          <span className="w-1.5 h-4 rounded-full bg-brand-deep" />
          <span className="text-[15px] font-bold text-ink">전체 매장 구역도</span>
          <span className="text-[12px] text-zinc-400 ml-auto">공통 모듈 · 편집 즉시 반영</span>
        </div>
        <div className="flex-1 overflow-auto">
          {/* 2026-08-30 · 사용자 지시 · 셀 클릭 → picker popover · zone_defs 직접 편집 */}
          <StoreZoneMap compact enableCellPicker cellPickerCanEdit={canEdit} />
        </div>
      </div>
    </div>
  );

  // ── 우측 · 탭메뉴 + 편집 테이블 ────────────────────────────────
  const activeFlatRows = grouped[activeTab].flatMap(expandZoneToRows);
  const activeTone = MAJOR_ZONE_TONE[activeTab];

  const rightPanel = (
    <div className="flex flex-col gap-3">
      {toast && <div className={`fixed bottom-4 right-4 z-[9999] ${toastClass(toast.tone)}`}>{toast.message}</div>}

      <Card padding="md" topAccent>
        <div className="flex items-start gap-3">
          <IconTile icon={<Pencil size={16} />} tone="violet" size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-bold text-ink tracking-tight">매장구역도 편집</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              탭으로 존 선택 · 구역별 카테고리·상세카테고리 인라인 편집 · Enter 즉시 저장 (DB 반영)
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
        <>
          {/* 탭메뉴 · 3 대분류 존 (+ 기타) */}
          <div className="flex items-stretch gap-1.5 flex-wrap">
            {MAJOR_ZONE_ORDER.filter(mz => grouped[mz].length > 0).map(mz => {
              const t = MAJOR_ZONE_TONE[mz];
              const isActive = activeTab === mz;
              const total = grouped[mz].flatMap(expandZoneToRows).length;
              return (
                <button
                  key={mz}
                  type="button"
                  onClick={() => setActiveTab(mz)}
                  className={`inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border-2 text-[14px] font-bold transition cursor-pointer ${isActive ? `${t.tabActive} shadow-sm` : `bg-white border-line text-ink-soft ${t.tab}`}`}
                >
                  <span className={`w-2 h-2 rounded-full ${t.bar}`} />
                  <span>{MAJOR_ZONE_LABEL[mz]}</span>
                  <span className={`inline-flex items-center h-5 px-1.5 rounded border text-[11px] font-bold tabular-nums ${t.badge}`}>{MAJOR_ZONE_RANGE[mz]}</span>
                  <span className="text-[11px] text-zinc-500 tabular-nums">{total}행</span>
                </button>
              );
            })}
          </div>

          {/* 선택 존 · 편집 테이블 */}
          <Card padding="md">
            <div className="flex items-center gap-2.5 mb-3 pb-2 border-b border-line">
              <span className={`w-2 h-6 rounded-full ${activeTone.bar}`} />
              <span className="text-[17px] font-extrabold text-ink tracking-tight">{MAJOR_ZONE_LABEL[activeTab]}</span>
              <span className={`inline-flex items-center h-6 px-2 rounded-md border text-[12px] font-bold tabular-nums ${activeTone.badge}`}>{MAJOR_ZONE_RANGE[activeTab]}</span>
              <span className="text-[12px] text-zinc-400 ml-auto tabular-nums">{grouped[activeTab].length}구역 · {activeFlatRows.length}행</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] table-fixed">
                <thead>
                  <tr className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider">
                    <th className="text-left px-2 py-1.5" style={{ width: 76 }}>구역</th>
                    <th className="text-left px-2 py-1.5" style={{ width: "32%" }}>카테고리</th>
                    <th className="text-left px-2 py-1.5">상세카테고리</th>
                    <th className="text-left px-2 py-1.5" style={{ width: 180 }}>담당자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {activeFlatRows.map((fr) => {
                    const z = fr.zone;
                    const tone = codeToneCls(fr.sub);
                    return (
                      <tr key={`${z.section}-${fr.code}`} className={`hover:bg-white/60 transition ${tone.row} align-top`}>
                        <td className="px-2 py-2">
                          <span className={`inline-flex items-center justify-center min-w-[48px] h-8 px-2.5 rounded-md border font-extrabold tabular-nums text-[15px] ${tone.badge}`}>
                            {fr.code}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {renderEdit(z, fr.catField, fr.catValue || <span className="text-zinc-300 italic">(비어있음 · 클릭하여 입력)</span>, false)}
                        </td>
                        <td className="px-2 py-2">
                          {renderEdit(z, fr.descField, fr.descValue
                            ? <span className="text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">{fr.descValue}</span>
                            : <span className="text-zinc-300 italic">(비어있음 · 클릭하여 입력)</span>, true)}
                        </td>
                        <td className="px-2 py-2">
                          <AssigneeEditor rowId={fr.rowId} value={fr.assignee} canEdit={canEdit} onSave={updateZoneRaw} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );

  return (
    <SplitPanel
      storageKey="zoneEdit.leftWidth"
      defaultWidth={520}
      minWidth={360}
      maxWidth={820}
      dividerColor="violet"
      mobileRightAsModal={false}
      left={leftPanel}
      right={rightPanel}
    />
  );
};

export default ZoneEditPanel;
