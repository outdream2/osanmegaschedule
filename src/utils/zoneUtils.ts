// src/utils/zoneUtils.ts
// 진열 구역 유틸 · DisplayPage 에서 이동 (god-phase1)
// expandZoneDef · buildDefaultZones · DisplayZone 타입
import { ZONE_DEFS, type ZoneSection } from "../constants/displayZones";

export type ZoneStatus = "normal" | "low" | "empty";
export type DowMap = { [nameKey: string]: number } | null;

export interface DisplayZone {
  id: string;
  num: number;
  label: string;
  category: string;
  section: ZoneSection;
  assignedStaffId: number | null;
  assignedStaffName: string;
  status: ZoneStatus;
  products: string;
  dowMap: DowMap;
}

// 진열대 1~8은 A/B 두 서브존으로 확장 · 계산대 40은 A/B/C 3-way 확장
export const expandZoneDef = (d: typeof ZONE_DEFS[0]): DisplayZone[] => {
  const isAisleWithAB = d.section === "aisle" && d.num >= 1 && d.num <= 8 && (d.subA || d.subB);
  const isCounter3Way = d.num === 40 && d.subA && d.subB && d.subC;
  if (isCounter3Way) {
    return (["A", "B", "C"] as const).map((side) => ({
      id: `${d.num}${side}`, num: d.num, label: `${d.label} ${side}`,
      category: (side === "A" ? d.subA : side === "B" ? d.subB : d.subC) ?? d.category,
      section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal" as ZoneStatus,
      products: "", dowMap: null,
    }));
  }
  if (!isAisleWithAB) {
    return [{
      id: String(d.num),
      num: d.num,
      label: d.label,
      category: d.category,
      section: d.section,
      assignedStaffId: null,
      assignedStaffName: "",
      status: "normal" as ZoneStatus,
      products: "",
      dowMap: null,
    }];
  }
  return [
    {
      id: `${d.num}B`, num: d.num, label: `${d.label} B`,
      category: d.subB ?? d.category, section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal" as ZoneStatus,
      products: "", dowMap: null,
    },
    {
      id: `${d.num}A`, num: d.num, label: `${d.label} A`,
      category: d.subA ?? d.category, section: d.section,
      assignedStaffId: null, assignedStaffName: "", status: "normal" as ZoneStatus,
      products: "", dowMap: null,
    },
  ];
};

export const buildDefaultZones = (): DisplayZone[] =>
  ZONE_DEFS.flatMap(expandZoneDef);
