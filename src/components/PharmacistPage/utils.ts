// src/components/PharmacistPage/utils.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PharmacistPage 유틸 이관
import { ZONE_DEFS } from "../../constants/displayZones";
import { getZoneLabel } from "../../constants/zoneLabels";
import type { CategoryItem } from "./constants";

// 파일 → dataURL (신규 카테고리 · 첫 자료 업로드용 · MenuSettings 와 동일 패턴)
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽을 수 없습니다"));
    reader.readAsDataURL(file);
  });
}

/**
 * 교육자료 카테고리 · 매장 구역(ZONE_DEFS) 기반 동적 생성
 *  · 통계 > 카테고리별 현황 · zone key 규칙과 동일 (예: "1A","1B","22","40A","40B","40C","35","36")
 *  · aisle 1~8 · A/B 서브존 개별 카드 · 22 · 계산대 40 A/B/C · 벽면·윙 통합
 *  · 매장 layout 순 정렬 (aisle → 상단벽면 → 하단벽면 → 윙 → 이벤트)
 */
export function buildEducationCategories(): CategoryItem[] {
  const items: CategoryItem[] = [];
  const sectionRank: Record<string, number> = { aisle: 0, top_wall: 1, bottom_wall: 2, wing: 3, left_wall: 4, event: 5 };
  const sorted = [...ZONE_DEFS].sort((a, b) => {
    const sa = sectionRank[a.section] ?? 9;
    const sb = sectionRank[b.section] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.num - b.num;
  });
  for (const z of sorted) {
    const numStr = String(z.num);
    if (z.subA && z.subB && z.subC) {
      items.push({ key: `${numStr}A`, title: `${getZoneLabel(`${numStr}A`)} · ${z.label} A`, subtitle: z.subA });
      items.push({ key: `${numStr}B`, title: `${getZoneLabel(`${numStr}B`)} · ${z.label} B`, subtitle: z.subB });
      items.push({ key: `${numStr}C`, title: `${getZoneLabel(`${numStr}C`)} · ${z.label} C`, subtitle: z.subC });
    } else if (z.subA && z.subB) {
      items.push({ key: `${numStr}A`, title: `${getZoneLabel(`${numStr}A`)} · ${z.label} A`, subtitle: z.subA });
      items.push({ key: `${numStr}B`, title: `${getZoneLabel(`${numStr}B`)} · ${z.label} B`, subtitle: z.subB });
    } else {
      items.push({ key: numStr, title: `${getZoneLabel(numStr)} · ${z.label}`, subtitle: z.category });
    }
  }
  return items;
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
