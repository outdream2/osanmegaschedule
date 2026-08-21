// src/components/BoardPage/types.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · BoardPage 타입 이관

export type PostType = "question" | "issue" | "memo";
export type Status = "open" | "in_progress" | "resolved";

export interface BoardImage { id?: number; image_url: string; public_id?: string; width?: number; height?: number; }

export interface BoardComment {
  id: number; post_id: number; author_id: number; author_name: string; author_rank?: string;
  parent_id: number | null; body: string; is_answer: boolean; mentions: number[]; created_at: string;
  images?: BoardImage[];
}

export interface BoardReaction { post_id: number; employee_id: number; reaction: string; }

export interface BoardPost {
  id: number; author_id: number; author_name: string; author_rank?: string;
  post_type: PostType; title: string; body: string; status: Status;
  category?: string; pinned: boolean; resolved_at?: string; resolved_by?: number;
  mentions: number[]; created_at: string; updated_at: string;
  images?: BoardImage[]; comment_count?: number; comments?: BoardComment[]; reactions?: BoardReaction[];
}

export interface Employee { id: number; name: string; rank?: string; level?: number; }
