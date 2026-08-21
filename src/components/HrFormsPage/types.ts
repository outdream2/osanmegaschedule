// src/components/HrFormsPage/types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · HrFormsPage 타입 이관
export type CategoryKey = "contract" | "resignation" | "pledge" | "etc";

export interface HrForm {
  id: number;
  title: string;
  category: CategoryKey;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type?: string | null;
  storage_path?: string | null;
  storage?: string | null;
  uploaded_by: string | null;
  uploaded_by_id: number | null;
  created_at: string;
}

export type SortKey = "title" | "category" | "file_name" | "file_size" | "uploaded_by" | "created_at";
