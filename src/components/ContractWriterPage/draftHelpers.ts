// src/components/ContractWriterPage/draftHelpers.ts
// 임시저장 (draft) 로컬스토리지 헬퍼

import { CARD_COLLAPSE_STORAGE_KEY } from "./constants";
import type { CardCollapsedMap } from "./types";

export function loadCardCollapsedMap(): CardCollapsedMap {
  try {
    const raw = localStorage.getItem(CARD_COLLAPSE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as CardCollapsedMap;
  } catch { /* silent */ }
  return {};
}

export function saveCardCollapsedMap(map: CardCollapsedMap): void {
  try { localStorage.setItem(CARD_COLLAPSE_STORAGE_KEY, JSON.stringify(map)); }
  catch { /* silent */ }
}
