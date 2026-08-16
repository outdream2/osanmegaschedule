// 2026-08-17 · 서버·클라 공유 · 게시판 Zod 스키마
import { z } from "zod";

/** POST /api/board/posts · 새 게시글 */
export const CreatePostSchema = z.object({
  employee_id: z.number(),
  employee_name: z.string().min(1).max(50),
  title: z.string().min(1, "제목은 필수입니다").max(200),
  content: z.string().min(1, "내용은 필수입니다").max(10000),
  category: z.string().max(50).optional(),
  images: z.array(z.string()).optional(),
  assignee_id: z.number().nullable().optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

/** POST /api/board/posts/:id/comments · 댓글 */
export const CreateCommentSchema = z.object({
  employee_id: z.number(),
  employee_name: z.string().min(1).max(50),
  content: z.string().min(1, "댓글 내용은 필수입니다").max(2000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
