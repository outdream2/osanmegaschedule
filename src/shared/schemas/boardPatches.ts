// 2026-09-01 · 서버·클라 공유 · 게시판 PATCH Zod 스키마
import { z } from "zod";

/** PATCH /api/board/comments/:id */
export const PatchCommentSchema = z.object({
  editor_id: z.number({ error: "editor_id 필수" }),
  body: z.string().min(1, "body 필수").max(5000),
});
export type PatchCommentInput = z.infer<typeof PatchCommentSchema>;

/** POST /api/board/comments/:id/accept */
export const AcceptCommentSchema = z.object({
  editor_id: z.number({ error: "editor_id 필수" }),
});
export type AcceptCommentInput = z.infer<typeof AcceptCommentSchema>;

/** POST /api/board/posts/:id/react */
export const ReactPostSchema = z.object({
  employee_id: z.number({ error: "employee_id 필수" }),
  reaction: z.string().min(1).max(50).default("helpful"),
});
export type ReactPostInput = z.infer<typeof ReactPostSchema>;
