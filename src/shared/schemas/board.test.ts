// 2026-08-20 · board · Zod 스키마
import { describe, it, expect } from "vitest";
import { CreatePostSchema, CreateCommentSchema } from "./board";

describe("CreatePostSchema", () => {
  const valid = {
    author_id: 1,
    author_name: "홍길동",
    title: "질문있습니다",
  };

  it("최소 · title + author 만 · 성공 (post_type/body defaults)", () => {
    const r = CreatePostSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.post_type).toBe("question");
      expect(r.data.body).toBe("");
    }
  });

  it("author_id · string 도 허용", () => {
    const r = CreatePostSchema.safeParse({ ...valid, author_id: "u1" });
    expect(r.success).toBe(true);
  });

  it("title 없음 · 실패", () => {
    const { title, ...rest } = valid;
    const r = CreatePostSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("title · 빈 · 실패", () => {
    const r = CreatePostSchema.safeParse({ ...valid, title: "" });
    expect(r.success).toBe(false);
  });

  it("title · 300자 초과 · 실패", () => {
    const r = CreatePostSchema.safeParse({ ...valid, title: "x".repeat(301) });
    expect(r.success).toBe(false);
  });

  it("author_name · 50자 초과 · 실패", () => {
    const r = CreatePostSchema.safeParse({ ...valid, author_name: "가".repeat(51) });
    expect(r.success).toBe(false);
  });

  it("body · 20000자 초과 · 실패", () => {
    const r = CreatePostSchema.safeParse({ ...valid, body: "x".repeat(20001) });
    expect(r.success).toBe(false);
  });

  it("author_rank · null 허용", () => {
    const r = CreatePostSchema.safeParse({ ...valid, author_rank: null });
    expect(r.success).toBe(true);
  });

  it("mentions · number/string array 허용", () => {
    const r = CreatePostSchema.safeParse({ ...valid, mentions: [1, "user2", 3] });
    expect(r.success).toBe(true);
  });

  it("images · 배열", () => {
    const r = CreatePostSchema.safeParse({
      ...valid,
      images: [{ image_url: "https://x.com/1.png", public_id: "id1", width: 800, height: 600 }],
    });
    expect(r.success).toBe(true);
  });

  it("images · image_url 만 필수", () => {
    const r = CreatePostSchema.safeParse({
      ...valid,
      images: [{ image_url: "https://x.com/1.png" }],
    });
    expect(r.success).toBe(true);
  });

  it("post_type · 30자 초과 · 실패", () => {
    const r = CreatePostSchema.safeParse({ ...valid, post_type: "x".repeat(31) });
    expect(r.success).toBe(false);
  });
});

describe("CreateCommentSchema", () => {
  const valid = {
    author_id: 1,
    author_name: "홍길동",
    body: "댓글 내용입니다",
  };

  it("정상 · 성공", () => {
    const r = CreateCommentSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("body 없음 · 실패", () => {
    const { body, ...rest } = valid;
    const r = CreateCommentSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("body · 빈 · 실패", () => {
    const r = CreateCommentSchema.safeParse({ ...valid, body: "" });
    expect(r.success).toBe(false);
  });

  it("body · 5000자 초과 · 실패", () => {
    const r = CreateCommentSchema.safeParse({ ...valid, body: "x".repeat(5001) });
    expect(r.success).toBe(false);
  });

  it("parent_id · null 허용 (최상위 댓글)", () => {
    const r = CreateCommentSchema.safeParse({ ...valid, parent_id: null });
    expect(r.success).toBe(true);
  });

  it("parent_id · number/string 허용 (대댓글)", () => {
    expect(CreateCommentSchema.safeParse({ ...valid, parent_id: 42 }).success).toBe(true);
    expect(CreateCommentSchema.safeParse({ ...valid, parent_id: "c42" }).success).toBe(true);
  });

  it("mentions · 옵셔널 배열", () => {
    const r = CreateCommentSchema.safeParse({ ...valid, mentions: [1, 2] });
    expect(r.success).toBe(true);
  });

  it("images · 옵셔널 배열", () => {
    const r = CreateCommentSchema.safeParse({
      ...valid,
      images: [{ image_url: "https://x/1.png" }],
    });
    expect(r.success).toBe(true);
  });
});
