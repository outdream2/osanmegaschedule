// src/components/ScanPage/RealMapSelector.tsx
// 2026-09-01 · C안 하이브리드 재설계
//   1) SearchBar + 결과 리스트 · 카테고리·구역·존 실시간 검색
//   2) 드롭박스 계층 (3단 · 존 → 구역 → 카테고리) · 구분선으로 분리
//   3) CollapseCard fallback · StoreZoneMap 지도 · 기본 접힘
//   · onSelect(zoneLabel: string) shape 유지 (회귀 X)

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, X, Check } from "lucide-react";
import { BottomSheet } from "../common/BottomSheet";
import { SearchBar } from "../common/SearchBar";
import { EmptyState } from "../common/EmptyState";
import { StoreZoneMap } from "../common/StoreZoneMap";
import { useZoneDefs, classifyMajorZone, type ZoneDefRaw } from "../../hooks/useZoneDefs";
import { TEXT, CARD_BASE } from "../../styles/tokens";

interface RealMapSelectorProps {
  current: string | null | undefined;
  onSelect: (zoneLabel: string) => void;
  onClose: () => void;
}

// ─── 4대 존 ──────────────────────────────────────────────────────────────────

type MajorZone = "중앙상비약존" | "상담존" | "뷰티식품존" | "카운터테마존";
const MAJOR_ZONES: MajorZone[] = ["중앙상비약존", "상담존", "뷰티식품존", "카운터테마존"];

// ─── 드롭박스 3단 계층 컴포넌트 ───────────────────────────────────────────────

interface DropboxSectionProps {
  zonesRaw: ZoneDefRaw[];
  current: string | null | undefined;
  onSelect: (location: string) => void;
}

const selectCls = [
  "w-full h-10 rounded-lg border border-line bg-white pl-3 pr-8 text-[15px] text-ink",
  "focus:outline-none focus:ring-2 focus:ring-brand-tint focus:border-brand-deep",
  "appearance-none cursor-pointer",
].join(" ");

const DropboxSection: React.FC<DropboxSectionProps> = ({ zonesRaw, current, onSelect }) => {
  const [selZone, setSelZone] = useState<MajorZone | "">("");
  const [selLocation, setSelLocation] = useState<string>("");
  const [selCategory, setSelCategory] = useState<string>("");

  const locationOptions = useMemo<ZoneDefRaw[]>(() => {
    if (!selZone) return [];
    const seen = new Set<string>();
    return zonesRaw
      .filter(z => z.location && classifyMajorZone(z.location) === selZone && !seen.has(z.location) && !!seen.add(z.location))
      .sort((a, b) => (a.location ?? "").localeCompare(b.location ?? "", "ko", { numeric: true }));
  }, [zonesRaw, selZone]);

  const categoryOptions = useMemo<string[]>(() => {
    if (!selLocation) return [];
    return Array.from(new Set(zonesRaw.filter(z => z.location === selLocation && z.category).map(z => z.category!)));
  }, [zonesRaw, selLocation]);

  const handleZoneChange = (v: string) => { setSelZone(v as MajorZone | ""); setSelLocation(""); setSelCategory(""); };
  const handleLocationChange = (v: string) => { setSelLocation(v); setSelCategory(""); };

  const handleApply = () => {
    const target = selLocation;
    if (target) onSelect(target);
  };

  const canApply = !!selLocation;
  const previewLabel = [selLocation, selCategory].filter(Boolean).join(" · ");

  return (
    <div className="space-y-3">
      {/* 1단 · 존 */}
      <div>
        <label className={`block ${TEXT.caption} text-ink-soft mb-1`}>존 (대분류)</label>
        <div className="relative">
          <select value={selZone} onChange={e => handleZoneChange(e.target.value)} className={selectCls}>
            <option value="">존 선택...</option>
            {MAJOR_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* 2단 · 구역 */}
      {selZone && (
        <div>
          <label className={`block ${TEXT.caption} text-ink-soft mb-1`}>구역 (location 코드)</label>
          <div className="relative">
            <select value={selLocation} onChange={e => handleLocationChange(e.target.value)} className={selectCls}>
              <option value="">구역 선택...</option>
              {locationOptions.map(z => (
                <option key={z.location} value={z.location!}>
                  {z.location}{z.zone ? ` · ${z.zone}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* 3단 · 카테고리 */}
      {selLocation && categoryOptions.length > 0 && (
        <div>
          <label className={`block ${TEXT.caption} text-ink-soft mb-1`}>카테고리 (선택)</label>
          <div className="relative">
            <select value={selCategory} onChange={e => setSelCategory(e.target.value)} className={selectCls}>
              <option value="">카테고리 선택...</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* 적용 버튼 */}
      {canApply && (
        <button
          type="button"
          onClick={handleApply}
          className="w-full h-10 rounded-lg bg-brand-deep text-white text-[15px] font-bold hover:bg-brand-deep/90 active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Check size={15} />
          {previewLabel || selLocation} 선택
        </button>
      )}
    </div>
  );
};

/** zonesRaw 단건 → 표시용 라벨 · location 우선 · 없으면 zone 폴백 */
function resolveLocationCode(raw: { location?: string; zone?: string }): string {
  return (raw.location ?? raw.zone ?? "").trim();
}

/** 검색어 · 공백 구분 · 모든 토큰이 대상 문자열 중 하나에 포함되면 매칭 */
function matchesQuery(query: string, targets: string[]): boolean {
  if (!query) return true;
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = targets.map(t => t.toLowerCase()).join(" ");
  return tokens.every(tok => haystack.includes(tok));
}

/** 대분류 존 → 색상 pill className */
const MAJOR_ZONE_COLOR: Record<string, string> = {
  "중앙상비약존": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "상담존":       "bg-teal-50  text-teal-700  border-teal-200",
  "뷰티식품존":   "bg-rose-50  text-rose-700  border-rose-200",
  "카운터테마존": "bg-amber-50 text-amber-700 border-amber-200",
  "(미분류)":     "bg-zinc-50  text-zinc-500  border-zinc-200",
};

export const RealMapSelector: React.FC<RealMapSelectorProps> = ({ current, onSelect, onClose }) => {
  const [query, setQuery] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const { zonesRaw, loading } = useZoneDefs();

  // ── 검색 결과 ──────────────────────────────────────────────────────────────
  const results = useMemo(() => {
    return zonesRaw
      .map(r => {
        const loc      = resolveLocationCode(r);
        const zone     = (r.zone ?? "").trim();
        const cat      = (r.category ?? "").trim();
        const detail   = (r.detailedCategory ?? "").trim();
        const major    = classifyMajorZone(r.location);
        return { raw: r, loc, zone, cat, detail, major };
      })
      .filter(({ loc, zone, cat, detail, major }) =>
        matchesQuery(query, [loc, zone, cat, detail, major])
      )
      // 정렬: 숫자+알파 자연 정렬 (1A < 1B < 2A … < 22 < 23 …)
      .sort((a, b) => a.loc.localeCompare(b.loc, "ko", { numeric: true }));
  }, [zonesRaw, query]);

  const handleSelect = (loc: string) => {
    onSelect(loc);
    onClose();
  };

  const handleClear = () => {
    onSelect("");
    onClose();
  };

  const handleMapZoneClick = (zoneId: string) => {
    if (!zoneId) return;
    onSelect(zoneId);
    onClose();
  };

  // ── 헤더 ───────────────────────────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-zinc-200">
      <MapPin size={15} className="text-indigo-500 shrink-0" />
      <p className={`${TEXT.section} text-gray-900`}>매장구역 선택</p>
      {current && (
        <span className="text-[13px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5 shrink-0">
          현재 · {current}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="ml-auto w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition cursor-pointer shrink-0"
        aria-label="매장구역 선택 닫기"
      >
        <X size={18} />
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      disableHandle
      zIndex={70}
      backdropClass="backdrop-brand"
      header={header}
    >
      <div className="flex flex-col gap-3 p-3 max-h-[80vh] overflow-y-auto">

        {/* 검색바 */}
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="카테고리 or 구역 검색 (예: 감기약 · 3A · 중앙상비약존)"
          resultCount={query ? results.length : undefined}
          widthClass="w-full"
          accent="indigo"
          autoFocus
        />

        {/* 미지정 옵션 */}
        <button
          type="button"
          onClick={handleClear}
          className={[
            "w-full py-2.5 rounded-xl border text-[15px] font-bold transition cursor-pointer text-left px-3",
            !current
              ? "bg-zinc-100 border-zinc-400 text-zinc-800"
              : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300",
          ].join(" ")}
        >
          미지정 (없음)
        </button>

        {/* 결과 리스트 · 최대 10개 항목 표시 · 내부 스크롤 */}
        <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-zinc-200 divide-y divide-zinc-100">
          {loading ? (
            <div className="py-10 text-center text-[14px] text-zinc-400 font-semibold">
              구역 목록 불러오는 중...
            </div>
          ) : results.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="검색 결과 없음"
              hint={`"${query}" 에 해당하는 구역이 없습니다`}
              size="compact"
            />
          ) : (
            results.map(({ raw, loc, zone, cat, detail, major }) => {
              const isSelected = current === loc;
              const pillCls = MAJOR_ZONE_COLOR[major] ?? MAJOR_ZONE_COLOR["(미분류)"];
              return (
                <button
                  key={raw.id}
                  type="button"
                  onClick={() => handleSelect(loc)}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer",
                    isSelected
                      ? "bg-indigo-50"
                      : "bg-white hover:bg-zinc-50",
                  ].join(" ")}
                >
                  {/* 구역 코드 pill */}
                  <span
                    className={[
                      "shrink-0 min-w-[2.75rem] text-center rounded-md px-2 py-0.5 border",
                      "text-[13px] font-black tabular-nums tracking-tight",
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-zinc-100 text-zinc-700 border-zinc-200",
                    ].join(" ")}
                  >
                    {loc || "?"}
                  </span>

                  {/* 카테고리 / 상세카테고리 */}
                  <div className="flex-1 min-w-0">
                    <p className={`${TEXT.body} text-zinc-900 leading-tight break-words whitespace-normal`}>
                      {cat || zone || "(미입력)"}
                    </p>
                    {detail && (
                      <p className={`${TEXT.caption} text-zinc-500 leading-tight break-words whitespace-normal`}>
                        {detail}
                      </p>
                    )}
                  </div>

                  {/* 대분류 존 pill */}
                  {major !== "(미분류)" && (
                    <span
                      className={[
                        "shrink-0 rounded-full px-2 py-0.5 border text-[11px] font-bold whitespace-nowrap",
                        pillCls,
                      ].join(" ")}
                    >
                      {major}
                    </span>
                  )}

                  {/* 선택됨 표시 */}
                  {isSelected && (
                    <MapPin size={14} className="shrink-0 text-indigo-600" fill="currentColor" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* ─── 구분선 + 드롭박스 3단 계층 ─── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-line" />
          <span className={`${TEXT.caption} text-ink-soft whitespace-nowrap`}>또는 단계별 선택</span>
          <div className="flex-1 h-px bg-line" />
        </div>

        {loading ? (
          <div className={`${TEXT.caption} text-ink-soft italic`}>구역 정보 로딩 중...</div>
        ) : (
          <DropboxSection zonesRaw={zonesRaw} current={current} onSelect={handleSelect} />
        )}

        {/* StoreZoneMap fallback · 접이식 */}
        <div className={`${CARD_BASE} overflow-hidden`}>
          <button
            type="button"
            onClick={() => setMapOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-50 transition-colors"
            aria-expanded={mapOpen}
          >
            <span className={`${TEXT.caption} text-zinc-600 flex items-center gap-1.5`}>
              <MapPin size={13} className="text-zinc-400" />
              매장구역도로 선택 (선택 사항)
            </span>
            {mapOpen
              ? <ChevronUp size={14} className="text-zinc-400" />
              : <ChevronDown size={14} className="text-zinc-400" />
            }
          </button>
          {mapOpen && (
            <div className="border-t border-zinc-100 p-2 origin-top scale-[0.82] -mb-6">
              <StoreZoneMap compact onZoneClick={handleMapZoneClick} />
            </div>
          )}
        </div>

      </div>
    </BottomSheet>
  );
};

export default RealMapSelector;
