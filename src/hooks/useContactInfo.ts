// src/hooks/useContactInfo.ts
// 2026-08-12 · 프레임워크 준비 · contact_info settings key wrapping
import { useCallback } from "react";
import { useKvSetting } from "./useKvSetting";
import { type ContactInfo, DEFAULT_CONTACT_INFO } from "../types";
import { safeUrl, safeLinkUrl } from "../lib/urlSafe";

function sanitize(raw: unknown): ContactInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, fb: string) => typeof v === "string" ? v : fb;
  return {
    phone:            s(r.phone,           DEFAULT_CONTACT_INFO.phone),
    email:            s(r.email,           DEFAULT_CONTACT_INFO.email),
    website:          safeLinkUrl(r.website, DEFAULT_CONTACT_INFO.website),
    businessHours:    s(r.businessHours,   DEFAULT_CONTACT_INFO.businessHours),
    copyrightText:    s(r.copyrightText,   DEFAULT_CONTACT_INFO.copyrightText),
    kakaoChannelUrl:  safeLinkUrl(r.kakaoChannelUrl, DEFAULT_CONTACT_INFO.kakaoChannelUrl),
    kakaoQrImageUrl:  safeUrl(r.kakaoQrImageUrl, "") || undefined,
  };
}

export function useContactInfo() {
  const { value, setValue, loaded, saveState, reload } = useKvSetting<ContactInfo>({
    key: "contact_info",
    defaultValue: DEFAULT_CONTACT_INFO,
    sanitize,
  });
  const setContact = useCallback((patch: Partial<ContactInfo>) => {
    setValue(prev => ({ ...prev, ...patch }));
  }, [setValue]);
  return { contact: value, loaded, saveState, setContact, setAll: setValue, reload };
}

export default useContactInfo;
