// src/components/ZoneLabelsEditor/ZoneLabelsEditor.tsx
// 구역 라벨 관리 UI · 2026-07-31 (B단계 마무리)
//   - 관리자(level 9) 전용
//   - 서버 fetch → 로컬 편집 → PUT 저장 → setZoneMappings() → 다른 페이지 즉시 반영
//   - 카테고리 그룹 접기/펴기 · 원본 zoneId 는 read-only · 번호/부제만 편집
//   - 번호 중복 검증 · dirty 실시간 감지

// 2026-08-17 · apiClient 마이그레이션
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import {
  Save,
  RotateCcw,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { MapPin } from "@phosphor-icons/react";
import type { AuthSession } from "../../types";
// 2026-08-12 · UI 통일 · 공통 SettingsPageShell + 하단 sticky 액션바 + 타이포
import { SettingsPageShell } from "../common/SettingsPageShell";
import { useToast } from "../../hooks/useToast";
import { SET_ACTION_BAR, SET_BTN_PRIMARY, SET_BTN_SECONDARY, SET_INFO_BADGE } from "../common/settingsTypography";
import type { AppNavPage } from "../layout/AppNavHeader";
import {
  DEFAULT_MAPPINGS,
  getZoneMappings,
  setZoneMappings,
  loadZoneLabelsFromServer,
  type ZoneMapping,
} from "../../constants/zoneLabels";

interface ZoneLabelsEditorProps {
  authSession: AuthSession | null;
  onBack: () => void;
}

// ───────────────────────────────────────────────────────────────
// 카테고리 그룹 정의 · zoneId prefix/pattern 으로 그룹핑
// ───────────────────────────────────────────────────────────────
type CategoryKey = "aisle" | "top" | "center" | "bottom" | "wing" | "spare";
interface CategoryDef {
  key: CategoryKey;
  label: string;
  hint: string;
  color: "sky" | "indigo" | "violet" | "emerald" | "amber" | "rose";
  match: (zoneId: string) => boolean;
}

const CATEGORY_DEFS: CategoryDef[] = [
  {
    key: "aisle",
    label: "진열대 (1~8 pair)",
    hint: "중앙 진열대 · A/B 쌍",
    color: "sky",
    match: (z) => /^[1-8][AB]$/i.test(z),
  },
  {
    key: "top",
    label: "상단 벽면 (9~21)",
    hint: "상단 벽면 진열",
    color: "indigo",
    match: (z) => /^\d+$/.test(z) && Number(z) >= 9 && Number(z) <= 21,
  },
  {
    key: "center",
    label: "중앙 (22)",
    hint: "중앙 단독 진열대",
    color: "violet",
    match: (z) => z === "22",
  },
  {
    key: "bottom",
    label: "하단 벽면 (23~34)",
    hint: "하단 벽면 진열",
    color: "emerald",
    match: (z) => /^\d+$/.test(z) && Number(z) >= 23 && Number(z) <= 34,
  },
  {
    key: "wing",
    label: "수직윙 (35~42)",
    hint: "우측 수직 진열",
    color: "amber",
    match: (z) => /^\d+$/.test(z) && Number(z) >= 35 && Number(z) <= 42,
  },
  {
    key: "spare",
    label: "여유 슬롯 (기타)",
    hint: "위 카테고리에 속하지 않는 zoneId",
    color: "rose",
    match: () => true, // fallback · 마지막에 매칭
  },
];

const COLOR_CLASSES: Record<CategoryDef["color"], {
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentDot: string;
}> = {
  sky:     { headerBg: "bg-sky-50",     headerText: "text-sky-700",     badgeBg: "bg-sky-50",     badgeText: "text-sky-700",     badgeBorder: "border-sky-200",     accentDot: "bg-sky-500"     },
  indigo:  { headerBg: "bg-indigo-50",  headerText: "text-indigo-700",  badgeBg: "bg-indigo-50",  badgeText: "text-indigo-700",  badgeBorder: "border-indigo-200",  accentDot: "bg-brand-deep"  },
  violet:  { headerBg: "bg-violet-50",  headerText: "text-violet-700",  badgeBg: "bg-violet-50",  badgeText: "text-violet-700",  badgeBorder: "border-violet-200",  accentDot: "bg-violet-500"  },
  emerald: { headerBg: "bg-emerald-50", headerText: "text-emerald-700", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700", badgeBorder: "border-emerald-200", accentDot: "bg-emerald-500" },
  amber:   { headerBg: "bg-amber-50",   headerText: "text-amber-800",   badgeBg: "bg-amber-50",   badgeText: "text-amber-800",   badgeBorder: "border-amber-200",   accentDot: "bg-amber-500"   },
  rose:    { headerBg: "bg-rose-50",    headerText: "text-rose-700",    badgeBg: "bg-rose-50",    badgeText: "text-rose-700",    badgeBorder: "border-rose-200",    accentDot: "bg-rose-500"    },
};

function categorize(zoneId: string): CategoryKey {
  for (const c of CATEGORY_DEFS) {
    if (c.key === "spare") continue;
    if (c.match(zoneId)) return c.key;
  }
  return "spare";
}

// 정렬 · 카테고리 내에서 · 원본 순서(진열대는 1A,1B,2A... · 나머지는 숫자 오름차순)
function sortByZoneId(a: ZoneMapping, b: ZoneMapping): number {
  const ax = a.zoneId, bx = b.zoneId;
  const aPair = /^([1-8])([AB])$/i.exec(ax);
  const bPair = /^([1-8])([AB])$/i.exec(bx);
  if (aPair && bPair) {
    const an = Number(aPair[1]) * 10 + (aPair[2].toUpperCase() === "A" ? 0 : 1);
    const bn = Number(bPair[1]) * 10 + (bPair[2].toUpperCase() === "A" ? 0 : 1);
    return an - bn;
  }
  const anum = Number(ax);
  const bnum = Number(bx);
  if (!isNaN(anum) && !isNaN(bnum)) return anum - bnum;
  return ax.localeCompare(bx);
}

// ───────────────────────────────────────────────────────────────
// 컴포넌트
// ───────────────────────────────────────────────────────────────
const ZoneLabelsEditor: React.FC<ZoneLabelsEditorProps> = ({ authSession, onBack }) => {
  const confirm = useConfirm();

  const userLevel = authSession?.level ??
    (authSession?.role === "superadmin" || authSession?.role === "admin" ? 9
      : authSession?.role === "manager" ? 2
      : authSession?.role === "employee" ? 1 : 0);

  const [mappings, setMappings] = useState<ZoneMapping[]>(() => getZoneMappings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // 2026-08-16 · useToast 프레임워크
  const { toast: _toastObj, show: _showToast } = useToast(2200);
  const toast = _toastObj?.message ?? null;
  const [collapsed, setCollapsed] = useState<Record<CategoryKey, boolean>>({
    aisle: false, top: false, center: false, bottom: false, wing: false, spare: false,
  });

  // ── 서버 로드 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadZoneLabelsFromServer(true); // force refresh
        if (!cancelled) setMappings(getZoneMappings());
      } catch {
        // 서버 실패 → 파일 fallback 유지
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 원본(DEFAULT) 값 조회 · dirty 판정용 ──
  const defaultByZoneId = useMemo(() => {
    const m: Record<string, ZoneMapping> = {};
    for (const it of DEFAULT_MAPPINGS) m[it.zoneId] = it;
    return m;
  }, []);

  // ── 로컬 편집 핸들러 ──
  const updateNumber = useCallback((zoneId: string, next: number) => {
    setMappings((prev) => prev.map(m => m.zoneId === zoneId ? { ...m, number: next } : m));
  }, []);
  const updateSubLabel = useCallback((zoneId: string, next: string) => {
    setMappings((prev) => prev.map(m => m.zoneId === zoneId ? {
      ...m,
      subLabel: next.trim() ? next : undefined,
    } : m));
  }, []);
  const resetRow = useCallback((zoneId: string) => {
    const def = defaultByZoneId[zoneId];
    if (!def) return;
    setMappings((prev) => prev.map(m => m.zoneId === zoneId ? { ...def } : m));
  }, [defaultByZoneId]);
  const resetAll = useCallback(async () => {
    if (!await confirm({ message: "모든 구역 라벨을 기본값으로 되돌립니다. 계속할까요?", danger: true })) return;
    setMappings([...DEFAULT_MAPPINGS]);
  }, [confirm]);

  // ── 중복 검증 ──
  const duplicateNumbers = useMemo(() => {
    const count: Record<number, number> = {};
    for (const m of mappings) {
      const n = Number(m.number);
      if (!Number.isFinite(n) || n <= 0) continue;
      count[n] = (count[n] ?? 0) + 1;
    }
    return new Set(Object.keys(count).filter(k => count[Number(k)] > 1).map(Number));
  }, [mappings]);

  const invalidRows = useMemo(() => {
    const bad = new Set<string>();
    for (const m of mappings) {
      const n = Number(m.number);
      if (!Number.isFinite(n) || n < 1 || n > 60) bad.add(m.zoneId);
    }
    return bad;
  }, [mappings]);

  const canSave = duplicateNumbers.size === 0 && invalidRows.size === 0 && !saving && !loading;

  // ── dirty 여부 ──
  const dirtyZoneIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of mappings) {
      const def = defaultByZoneId[m.zoneId];
      if (!def) { s.add(m.zoneId); continue; }
      if (def.number !== m.number || (def.subLabel ?? "") !== (m.subLabel ?? "")) {
        s.add(m.zoneId);
      }
    }
    return s;
  }, [mappings, defaultByZoneId]);

  // ── 저장 ──
  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        mappings: mappings.map(m => ({
          zone_id: m.zoneId,
          number: m.number,
          sub_label: m.subLabel ?? null,
        })),
      };
      await api.put("/api/zone-labels", body);
      setZoneMappings(mappings);
      _showToast("저장되었습니다.");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err as any)?.message ?? "저장 중 오류가 발생했습니다.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }, [mappings, canSave]);

  // ── 그룹화 ──
  const grouped = useMemo(() => {
    const g: Record<CategoryKey, ZoneMapping[]> = {
      aisle: [], top: [], center: [], bottom: [], wing: [], spare: [],
    };
    for (const m of mappings) g[categorize(m.zoneId)].push(m);
    for (const k of Object.keys(g) as CategoryKey[]) g[k].sort(sortByZoneId);
    return g;
  }, [mappings]);

  // ── 권한 체크 ──
  if (userLevel < 9) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={40} className="text-rose-400 mx-auto mb-3" />
          <p className="text-zinc-600 font-semibold">최고관리자(레벨 9)만 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 text-zinc-700 text-[14px] font-bold hover:bg-zinc-200 transition"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  const totalCount = mappings.length;
  const dirtyCount = dirtyZoneIds.size;

  // 2026-08-12 · 배지 슬롯 (rightSlot) · 공통 SET_INFO_BADGE
  const rightBadges = (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`${SET_INFO_BADGE} bg-sky-50 border-sky-200 text-sky-700`}>
        총 {totalCount}건
      </span>
      {dirtyCount > 0 && (
        <span className={`${SET_INFO_BADGE} bg-amber-50 border-amber-200 text-amber-700`}>
          변경 {dirtyCount}건
        </span>
      )}
      {duplicateNumbers.size > 0 && (
        <span className={`${SET_INFO_BADGE} bg-rose-50 border-rose-200 text-rose-700`}>
          <AlertCircle size={11} /> 중복 {duplicateNumbers.size}건
        </span>
      )}
    </div>
  );

  return (
    <SettingsPageShell
      activePage={"zone-labels" as AppNavPage}
      authSession={authSession}
      onBack={onBack}
      icon={MapPin}
      iconColor="text-sky-500"
      title="구역 라벨"
      description="매장 진열 구역 번호와 라벨을 관리합니다. 번호 편집 후 저장 · 모든 페이지 즉시 반영. 원본 zoneId 는 변경 불가 (DB/로직 안전)."
      maxWidth="max-w-4xl"
      rightSlot={rightBadges}
    >
      {/* 본문 */}
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-400 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </div>
        ) : (
          <>
            {saveError && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[14px] flex items-center gap-2">
                <AlertCircle size={13} /> {saveError}
              </div>
            )}
            {duplicateNumbers.size > 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[14px] flex items-center gap-2">
                <AlertCircle size={13} /> 번호가 중복된 항목이 있습니다:
                <span className="font-bold">
                  {Array.from(duplicateNumbers as Set<number>).sort((a, b) => a - b).join(", ")}
                </span>
              </div>
            )}
            {invalidRows.size > 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[14px] flex items-center gap-2">
                <AlertCircle size={13} /> 유효하지 않은 번호 (1~60 범위 필요): {invalidRows.size}건
              </div>
            )}

            <div className="space-y-3">
              {CATEGORY_DEFS.map((cat) => {
                const rows = grouped[cat.key];
                if (!rows || rows.length === 0) return null;
                const cs = COLOR_CLASSES[cat.color];
                const isCollapsed = collapsed[cat.key];
                return (
                  <div key={cat.key} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                    {/* 카테고리 헤더 */}
                    <button
                      type="button"
                      onClick={() => setCollapsed(prev => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 ${cs.headerBg} border-b border-zinc-100 hover:bg-opacity-80 transition cursor-pointer`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full ${cs.accentDot}`} />
                      <span className={`text-[14px] font-bold ${cs.headerText} tracking-tight`}>{cat.label}</span>
                      <span className="text-[15px] text-zinc-400 font-medium">· {cat.hint}</span>
                      <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[15px] font-bold ${cs.badgeBg} ${cs.badgeText} border ${cs.badgeBorder}`}>
                        {rows.length}
                      </span>
                      {isCollapsed
                        ? <ChevronRight size={14} className="text-zinc-400" />
                        : <ChevronDown size={14} className="text-zinc-400" />}
                    </button>

                    {/* 행 목록 */}
                    {!isCollapsed && (
                      <div>
                        {/* 컬럼 헤더 */}
                        <div className="hidden sm:grid grid-cols-[80px_100px_1fr_36px] gap-3 px-4 py-2 bg-zinc-50/60 border-b border-zinc-100 text-[15px] font-bold text-zinc-400 uppercase tracking-wider">
                          <span>원본 ID</span>
                          <span>번호</span>
                          <span>부제 (선택)</span>
                          <span></span>
                        </div>
                        {rows.map((m, i) => {
                          const isDup = duplicateNumbers.has(Number(m.number));
                          const isBad = invalidRows.has(m.zoneId);
                          const isDirty = dirtyZoneIds.has(m.zoneId);
                          const rowBorder = i < rows.length - 1 ? "border-b border-zinc-100" : "";
                          return (
                            <div
                              key={m.zoneId}
                              className={`grid grid-cols-1 sm:grid-cols-[80px_100px_1fr_36px] gap-2 sm:gap-3 px-4 py-2.5 items-center ${rowBorder} ${isDup || isBad ? "bg-rose-50/40" : ""}`}
                            >
                              {/* 원본 zoneId 배지 */}
                              <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-[14px] font-bold`}>
                                  {m.zoneId}
                                </span>
                                {isDirty && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="변경됨" />
                                )}
                              </div>

                              {/* 번호 input */}
                              <div>
                                <label className="sm:hidden block text-[14px] font-bold text-zinc-400 mb-0.5">번호</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={60}
                                  value={m.number}
                                  onChange={(e) => updateNumber(m.zoneId, Number(e.target.value))}
                                  className={`w-full px-2.5 py-1.5 rounded-lg border text-[14px] font-bold text-zinc-800 tabular-nums text-center transition focus:outline-none focus:ring-2 ${
                                    isDup || isBad
                                      ? "border-rose-300 bg-rose-50 focus:ring-rose-200"
                                      : "border-zinc-200 bg-white focus:ring-brand-tint focus:border-brand-deep"
                                  }`}
                                />
                              </div>

                              {/* subLabel input */}
                              <div>
                                <label className="sm:hidden block text-[14px] font-bold text-zinc-400 mb-0.5">부제</label>
                                <input
                                  type="text"
                                  value={m.subLabel ?? ""}
                                  placeholder="(선택) 카테고리·이름 등"
                                  maxLength={40}
                                  onChange={(e) => updateSubLabel(m.zoneId, e.target.value)}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-[14px] text-zinc-700 transition focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep"
                                />
                              </div>

                              {/* 리셋 버튼 */}
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => resetRow(m.zoneId)}
                                  disabled={!isDirty}
                                  title={isDirty ? "이 행을 기본값으로" : "변경 없음"}
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
                                    isDirty
                                      ? "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 cursor-pointer"
                                      : "text-zinc-300 cursor-not-allowed"
                                  }`}
                                >
                                  <RotateCcw size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 하단 sticky 액션바 · 공통 SET_ACTION_BAR + SET_BTN_* */}
      <div className={SET_ACTION_BAR}>
        <button type="button" onClick={resetAll} className={SET_BTN_SECONDARY}>
          <RotateCcw size={13} /> 초기화
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={SET_BTN_PRIMARY}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-[14px] font-bold shadow-lg">
          <Check size={13} /> {toast}
        </div>
      )}
    </SettingsPageShell>
  );
};

export default ZoneLabelsEditor;
