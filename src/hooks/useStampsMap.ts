// src/hooks/useStampsMap.ts
// 2026-08-12 · 프레임워크 준비 · stamps_map settings key wrapping
//   · 이름 → 도장 이미지 매핑 · 근로계약서 도장 자동 매칭에 사용
import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type StampMapping, DEFAULT_STAMPS_MAP } from "../types";
import { safeUrl } from "../lib/urlSafe";

function sanitize(raw: unknown): StampMapping[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((it): StampMapping | null => {
      if (!it || typeof it !== "object") return null;
      const r = it as Record<string, unknown>;
      if (typeof r.name !== "string" || !r.name.trim()) return null;
      return {
        name: r.name.trim(),
        imageUrl: safeUrl(r.imageUrl, ""),
        bundledFallback: r.bundledFallback === "sungstamp" || r.bundledFallback === "kyustamp"
          ? r.bundledFallback : undefined,
      };
    })
    .filter((x): x is StampMapping => x !== null);
}

export function useStampsMap() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<StampMapping[]>({
    key: "stamps_map",
    defaultValue: DEFAULT_STAMPS_MAP,
    sanitize,
  });
  /** 이름으로 도장 이미지 조회 · 없으면 undefined */
  const findStamp = useCallback((name: string): StampMapping | undefined => {
    const trimmed = name.trim();
    return value.find(s => s.name === trimmed);
  }, [value]);
  const addStamp = useCallback((s: StampMapping) => {
    setValue(prev => [...prev.filter(x => x.name !== s.name), s]);
  }, [setValue]);
  const removeStamp = useCallback((name: string) => {
    setValue(prev => prev.filter(x => x.name !== name));
  }, [setValue]);
  return { stamps: value, loaded, saveState, findStamp, addStamp, removeStamp, setAll: setValue, reload };
}

export default useStampsMap;
