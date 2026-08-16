// 2026-08-17 · 서버·클라 공유 · 게시판 Zod 스키마
// 실제 서버 API field 명 (author_id/author_name) 매칭
import { z } from "zod";

/** POST /api/board/posts · 새 게시글 */
export const CreatePostSchema = z.object({
  author_id: z.union([z.string(), z.number()]),
  author_name: z.string().min(1).max(50),
  author_rank: z.string().nullable().optional(),
  post_type: z.string().max(30).optional().default("question"),
  title: z.string().min(1, "제목은 필수입니다").max(300),
  body: z.string().max(20000).optional().default(""),
  category: z.string().max(50).nullable().optional(),
  mentions: z.array(z.union([z.string(), z.number()])).optional(),
  images: z.array(z.object({
    image_url: z.string(),
    public_id: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).optional(),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

/** POST /api/board/posts/:id/comments · 댓글 */
export const CreateCommentSchema = z.object({
  author_id: z.union([z.string(), z.number()]),
  author_name: z.string().min(1).max(50),
  author_rank: z.string().nullable().optional(),
  parent_id: z.union([z.string(), z.number()]).nullable().optional(),
  body: z.string().min(1, "댓글 내용은 필수입니다").max(5000),
  mentions: z.array(z.union([z.string(), z.number()])).optional(),
  images: z.array(z.object({
    image_url: z.string(),
    public_id: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  })).optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
