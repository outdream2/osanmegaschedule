// src/components/common/ZoneCategoryPicker.tsx
// 2026-08-31 · #42 · 카테고리 검색 → 매장구역 선택 프리미티브
//   · 사용자 지시 · 예 · "감기약" 검색 → 상세카테고리 드롭다운 → 구역 선택 → real_map/location 자동 입력
//   · zone_defs 테이블 · category · detailed_category · location · zone 활용
//   · 프리미티브 · ProductCreateModal · ProductArrivalPage · ProductInfoPage 등 사용 가능
//
// 사용 예:
//   const [location, setLocation] = useState<string | null>(null);
//   <ZoneCategoryPicker value={location} onChange={setLocation} />

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, X, Check } from "lucide-react";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { matchHangul } from "../../lib/hangulSearch";

export interface ZoneCategoryPickerProps {
  /** 현재 선택된 location 값 (예: "1A" · "22") */
  value: string | null | undefined;
  /** 선택 시 · location 반환 (또는 null · 미지정) */
  onChange: (location: string | null) => void;
  /** placeholder · 기본 · "카테고리·구역 검색 · 예: 감기약" */
  placeholder?: string;
  /** disabled */
  disabled?: boolean;
  className?: string;
}

interface CategoryMatch {
  category: string | null;
  detailedCategory: string | null;
  zone: string | null;
  location: string | null;
  cellId: number;
}

export const ZoneCategoryPicker: React.FC<ZoneCategoryPickerProps> = ({
  value, onChange, placeholder = "카테고리·구역 검색 · 예: 감기약", disabled = false, className = "",
}) => {
  const { zonesRaw, loading } = useZoneDefs();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부 클릭 · 드롭다운 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // 매칭 · category · detailed_category · zone · location 4개 필드 검색
  const matches = useMemo<CategoryMatch[]>(() => {
    const q = query.trim();
    if (!q) {
      // 검색 없음 · 카테고리 있는 zone 상위 20개
      return zonesRaw
        .filter(z => z.category || z.detailedCategory)
        .slice(0, 20)
        .map(z => ({
          category: z.category ?? null,
          detailedCategory: z.detailedCategory ?? null,
          zone: z.zone ?? null,
          location: z.location ?? null,
          cellId: z.cellId,
        }));
    }
    return zonesRaw
      .filter(z => {
        const cat = z.category ?? "";
        const det = z.detailedCategory ?? "";
        const zone = z.zone ?? "";
        const loc = z.location ?? "";
        return matchHangul(cat, q) || matchHangul(det, q) || matchHangul(zone, q) || loc.toLowerCase().includes(q.toLowerCase());
      })
      .slice(0, 30)
      .map(z => ({
        category: z.category ?? null,
        detailedCategory: z.detailedCategory ?? null,
        zone: z.zone ?? null,
        location: z.location ?? null,
        cellId: z.cellId,
      }));
  }, [zonesRaw, query]);

  const handleSelect = (m: CategoryMatch) => {
    onChange(m.location ?? null);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* 현재 값 표시 + 검색 입력 */}
      <div className={`flex items-center gap-2 rounded-lg border ${open ? "border-brand-deep ring-2 ring-brand-tint" : "border-line hover:border-brand-deep/40"} bg-white px-2 h-10 transition`}>
        <MapPin size={14} className="text-brand-deep shrink-0" />
        {value && !open ? (
          <button
            type="button"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            disabled={disabled}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left cursor-pointer disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center h-6 px-2 rounded-md bg-brand-tint text-brand-deep text-[14px] font-extrabold tabular-nums">
              {value}
            </span>
            <span className="text-[12px] text-ink-soft truncate">클릭하여 변경</span>
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 min-w-0 bg-transparent text-[14px] text-ink focus:outline-none disabled:cursor-not-allowed"
          />
        )}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-400 hover:text-rose-600 cursor-pointer disabled:cursor-not-allowed"
            title="지우기"
          >
            <X size={12} />
          </button>
        )}
        <Search size={13} className="text-zinc-400 shrink-0" />
      </div>

      {/* 드롭다운 · 매칭 리스트 */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-auto bg-white rounded-lg border border-line shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-[13px] text-ink-soft italic">구역 정보 로딩 중...</div>
          ) : matches.length === 0 ? (
            <div className="px-3 py-2 text-[13px] text-zinc-400 italic">
              {query.trim() ? `"${query}" 매칭 없음` : "카테고리 정보 없음"}
            </div>
          ) : (
            <>
              {!query.trim() && (
                <div className="px-3 py-1.5 text-[11px] font-bold text-ink-soft uppercase tracking-wider bg-zinc-50 border-b border-line">
                  전체 카테고리 · 검색어 입력하세요
                </div>
              )}
              {matches.map((m, i) => {
                const isSelected = m.location === value;
                return (
                  <button
                    key={`${m.cellId}-${i}`}
                    type="button"
                    onClick={() => handleSelect(m)}
                    disabled={disabled}
                    className={`
                      w-full text-left px-3 py-2 border-b border-line/60 last:border-b-0
                      hover:bg-brand-tint/40 transition cursor-pointer disabled:cursor-not-allowed
                      ${isSelected ? "bg-brand-tint/60" : ""}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      {isSelected && <Check size={12} className="text-brand-deep shrink-0" />}
                      {m.location && (
                        <span className="inline-flex items-center h-5 px-1.5 rounded bg-brand-deep text-white text-[12px] font-extrabold tabular-nums shrink-0">
                          {m.location}
                        </span>
                      )}
                      {m.category && (
                        <span className="text-[14px] font-bold text-ink truncate">
                          {m.category}
                        </span>
                      )}
                      {m.zone && !m.category && (
                        <span className="text-[14px] font-bold text-ink-soft truncate">
                          {m.zone}
                        </span>
                      )}
                    </div>
                    {m.detailedCategory && (
                      <div className="mt-0.5 text-[12px] text-ink-soft leading-snug break-keep whitespace-pre-wrap line-clamp-2">
                        {m.detailedCategory}
                      </div>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ZoneCategoryPicker;
