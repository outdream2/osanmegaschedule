// src/components/HrFormsPage/constants.tsx
// 2026-08-21 · Framework Phase 4 · large-file 분리 · HrFormsPage 상수 이관
import React from "react";
import { FileSignature, FileEdit, FileText, FileArchive } from "lucide-react";
import type { Comparator } from "../../hooks/useSortableTable";
import type { PillTone } from "../common/StatusPill";
import type { CategoryKey, HrForm, SortKey } from "./types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const CATEGORIES: Array<{
  key: CategoryKey;
  label: string;
  badge: string;
  activeBg: string;
  tone: PillTone; // 2026-08-17 · StatusPill 프레임워크 통일
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    key: "contract",
    label: "근로계약서",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    activeBg: "bg-emerald-600 text-white border-emerald-600",
    tone: "emerald",
    icon: FileSignature,
  },
  {
    key: "resignation",
    label: "사직서",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    activeBg: "bg-rose-600 text-white border-rose-600",
    tone: "rose",
    icon: FileEdit,
  },
  {
    key: "pledge",
    label: "서약서",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    activeBg: "bg-brand-deep text-white border-indigo-600",
    tone: "indigo",
    icon: FileText,
  },
  {
    key: "etc",
    label: "기타",
    badge: "bg-zinc-100 text-zinc-600 border-line",
    activeBg: "bg-zinc-700 text-white border-zinc-700",
    tone: "zinc",
    icon: FileArchive,
  },
];

export const CATEGORY_MAP: Record<CategoryKey, (typeof CATEGORIES)[number]> =
  CATEGORIES.reduce((acc, c) => {
    acc[c.key] = c;
    return acc;
  }, {} as Record<CategoryKey, (typeof CATEGORIES)[number]>);

// HrForm 정렬 비교 함수 (컴포넌트 외부 · 안정 참조)
function hrFormCmp(key: SortKey): Comparator<HrForm> {
  return (a, b) => {
    const av = (a as any)[key];
    const bv = (b as any)[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), "ko");
  };
}

export const HR_FORM_SORT_CMP: Record<SortKey, Comparator<HrForm>> = {
  title:       hrFormCmp("title"),
  category:    hrFormCmp("category"),
  file_name:   hrFormCmp("file_name"),
  file_size:   hrFormCmp("file_size"),
  uploaded_by: hrFormCmp("uploaded_by"),
  created_at:  hrFormCmp("created_at"),
};
