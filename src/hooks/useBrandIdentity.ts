// src/hooks/useBrandIdentity.ts
// 2026-08-12 · 프레임워크 준비 · brand_identity settings key wrapping
import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type BrandIdentity, DEFAULT_BRAND_IDENTITY } from "../types";

function sanitize(raw: unknown): BrandIdentity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, fb: string) => typeof v === "string" ? v : fb;
  return {
    shortName:       s(r.shortName,       DEFAULT_BRAND_IDENTITY.shortName),
    brandNameEn:     s(r.brandNameEn,     DEFAULT_BRAND_IDENTITY.brandNameEn),
    brandAccentWord: s(r.brandAccentWord, DEFAULT_BRAND_IDENTITY.brandAccentWord),
    appTitle:        s(r.appTitle,        DEFAULT_BRAND_IDENTITY.appTitle),
    logoUrl:         typeof r.logoUrl    === "string" ? r.logoUrl    : undefined,
    faviconUrl:      typeof r.faviconUrl === "string" ? r.faviconUrl : undefined,
  };
}

export function useBrandIdentity() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<BrandIdentity>({
    key: "brand_identity",
    defaultValue: DEFAULT_BRAND_IDENTITY,
    sanitize,
  });
  const setBrand = useCallback((patch: Partial<BrandIdentity>) => {
    setValue(prev => ({ ...prev, ...patch }));
  }, [setValue]);
  return { brand: value, loaded, saveState, setBrand, setAll: setValue, reload };
}

export default useBrandIdentity;
