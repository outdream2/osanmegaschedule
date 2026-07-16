// server/routes/board.ts
// 이슈공유 게시판 API
// - 게시글 · 댓글 · 이미지 · 반응 · @멘션 알림
// - 이미지 업로드 우선순위:
//   1) Supabase Storage (public 버킷 "board-images") · Render 등 ephemeral FS 환경 필수
//   2) 로컬 서버 uploads/board/YYYY-MM/ 폴더 (dev 환경 fallback)
//   ※ 사용자 액션 필요: Supabase 대시보드 > Storage > 새 public 버킷 "board-images" 생성
//     (public read 정책 · 5MB 정도의 이미지 파일)

import { Router } from "express";
import webpush from "web-push";
import fs from "fs";
import path from "path";
import { supabase } from "../../src/supabase/client";

const router = Router();

// Supabase Storage 버킷 이름 · 환경변수로 오버라이드 가능
const BOARD_BUCKET = process.env.SUPABASE_BOARD_BUCKET || "board-images";

// 이미지 업로드
// - 클라이언트에서 base64 (data:image/...;base64,...) 로 전송
// - 우선 Supabase Storage 시도 · 실패 시 로컬 파일시스템 fallback
router.post("/api/board/upload-image", async (req, res) => {
  try {
    const { data_url, filename } = req.body ?? {};
    if (!data_url || typeof data_url !== "string" || !data_url.startsWith("data:image/")) {
      return res.status(400).json({ error: "data_url (data:image/... base64) 필수" });
    }
    // data:image/webp;base64,XXXX 파싱
    const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(data_url);
    if (!match) return res.status(400).json({ error: "잘못된 data URL" });
    const mime = match[1];
    const b64 = match[2];
    const buffer = Buffer.from(b64, "base64");
    // 크기 제한 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "이미지 크기 초과 (5MB)" });
    }
    const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "bin";
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rand = Math.random().toString(36).slice(2, 8);
    const safeName = String(filename ?? "img").replace(/[^\w.-]+/g, "_").slice(0, 40);
    const fname = `${now.getTime()}_${rand}_${safeName}.${ext}`;
    const objectPath = `${ym}/${fname}`;

    // 1) Supabase Storage 시도
    try {
      const { error: upErr } = await supabase
        .storage
        .from(BOARD_BUCKET)
        .upload(objectPath, buffer, {
          contentType: mime,
          cacheControl: "31536000", // 1년 (파일명 unique)
          upsert: false,
        });
      if (upErr) {
        // 버킷 없음 · 정책 미설정 등 · 로컬 fallback 로 진행
        console.warn(`[board/upload] Supabase Storage 실패 · fallback 로컬 · bucket=${BOARD_BUCKET} · reason=${upErr.message}`);
      } else {
        const { data: pub } = supabase.storage.from(BOARD_BUCKET).getPublicUrl(objectPath);
        const publicUrl = pub?.publicUrl;
        if (publicUrl) {
          console.log(`[board/upload] Supabase Storage · path=${objectPath}`);
          return res.json({
            image_url: publicUrl,
            public_id: `board/${objectPath}`,
            width: null,
            height: null,
            storage: "supabase",
          });
        }
        console.warn(`[board/upload] Supabase getPublicUrl 실패 · fallback 로컬 · path=${objectPath}`);
      }
    } catch (supErr: any) {
      // 네트워크 · SDK 예외 등 · 로컬 fallback
      console.warn(`[board/upload] Supabase Storage 예외 · fallback 로컬 · ${supErr?.message ?? supErr}`);
    }

    // 2) 로컬 파일시스템 fallback (dev · Supabase 미설정 · 오류 상황)
    const dir = path.join(process.cwd(), "uploads", "board", ym);
    fs.mkdirSync(dir, { recursive: true });
    const fpath = path.join(dir, fname);
    fs.writeFileSync(fpath, buffer);
    const publicUrl = `/uploads/board/${ym}/${fname}`;
    console.log(`[board/upload] Local fallback · path=${publicUrl}`);
    return res.json({
      image_url: publicUrl,
      public_id: `board/${ym}/${fname}`,
      width: null,
      height: null,
      storage: "local",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "upload failed" });
  }
});

// 담당자에게 웹푸시 발송 헬퍼 (실패해도 조용히)
async function pushToEmployees(empIds: number[], title: string, body: string, url = "/") {
  if (!empIds.length) return;
  try {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, push_subscription")
      .in("id", empIds);
    if (!emps) return;
    const payload = JSON.stringify({ title, body, url });
    await Promise.all(
      (emps as any[]).map(async (e) => {
        if (!e.push_subscription) return;
        try {
          await webpush.sendNotification(e.push_subscription, payload);
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase.from("employees").update({ push_subscription: null }).eq("id", e.id);
          }
        }
      })
    );
  } catch (err: any) {
    console.warn("[board push] failed:", err?.message);
  }
}

// DB 알림 저장 (실패해도 조용히)
async function saveNotifications(empIds: number[], title: string, body: string, type: string = "info") {
  if (!empIds.length) return;
  try {
    const rows = empIds.map(id => ({
      employee_id: id, title, body, type, read: false,
    }));
    await supabase.from("notifications").insert(rows);
  } catch (err: any) {
    console.warn("[board notifications insert] failed:", err?.message);
  }
}

// ── 게시글 목록
router.get("/api/board/posts", async (req, res) => {
  const type = String(req.query.type ?? "");
  const status = String(req.query.status ?? "");
  const category = String(req.query.category ?? "");
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(200, Number(req.query.limit ?? 50));

  let q = supabase
    .from("board_posts")
    .select("*")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (type) q = q.eq("post_type", type);
  if (status) q = q.eq("status", status);
  if (category) q = q.eq("category", category);
  if (search) q = q.or(`title.ilike.%${search}%,body.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // 이미지 · 댓글 수 조인
  const ids = (data ?? []).map((p: any) => p.id);
  const imagesByPost: Record<number, any[]> = {};
  const commentCounts: Record<number, number> = {};
  if (ids.length) {
    const [imgRes, cmtRes] = await Promise.all([
      supabase.from("board_post_images").select("post_id, image_url, width, height").in("post_id", ids).is("comment_id", null),
      supabase.from("board_post_comments").select("post_id").in("post_id", ids),
    ]);
    for (const img of (imgRes.data ?? []) as any[]) {
      (imagesByPost[img.post_id] ??= []).push(img);
    }
    for (const c of (cmtRes.data ?? []) as any[]) {
      commentCounts[c.post_id] = (commentCounts[c.post_id] ?? 0) + 1;
    }
  }
  const result = (data ?? []).map((p: any) => ({
    ...p,
    images: imagesByPost[p.id] ?? [],
    comment_count: commentCounts[p.id] ?? 0,
  }));
  res.json(result);
});

// ── 게시글 상세 (댓글 + 이미지 포함)
router.get("/api/board/posts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const [postRes, imgRes, cmtRes, cmtImgRes, reactRes] = await Promise.all([
    supabase.from("board_posts").select("*").eq("id", id).maybeSingle(),
    supabase.from("board_post_images").select("*").eq("post_id", id).is("comment_id", null).order("id"),
    supabase.from("board_post_comments").select("*").eq("post_id", id).order("created_at", { ascending: true }),
    supabase.from("board_post_images").select("*").eq("post_id", id).not("comment_id", "is", null),
    supabase.from("board_post_reactions").select("*").eq("post_id", id),
  ]);
  if (postRes.error) return res.status(500).json({ error: postRes.error.message });
  if (!postRes.data) return res.status(404).json({ error: "not found" });

  const cmtImgsByComment: Record<number, any[]> = {};
  for (const img of (cmtImgRes.data ?? []) as any[]) {
    (cmtImgsByComment[img.comment_id] ??= []).push(img);
  }
  const comments = (cmtRes.data ?? []).map((c: any) => ({
    ...c,
    images: cmtImgsByComment[c.id] ?? [],
  }));

  res.json({
    ...postRes.data,
    images: imgRes.data ?? [],
    comments,
    reactions: reactRes.data ?? [],
  });
});

// ── 게시글 생성
router.post("/api/board/posts", async (req, res) => {
  const b = req.body ?? {};
  if (!b.author_id) return res.status(400).json({ error: "author_id required" });
  if (!b.title) return res.status(400).json({ error: "title required" });

  const authorId = Number(b.author_id);
  const mentions: number[] = Array.isArray(b.mentions) ? b.mentions.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n !== authorId) : [];

  const insertRow = {
    author_id: authorId,
    author_name: String(b.author_name ?? ""),
    author_rank: b.author_rank ?? null,
    post_type: String(b.post_type ?? "question"),
    title: String(b.title).slice(0, 300),
    body: String(b.body ?? ""),
    category: b.category ?? null,
    mentions,
  };
  const { data, error } = await supabase.from("board_posts").insert([insertRow]).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  // 이미지 batch insert
  const images: Array<{ image_url: string; public_id?: string; width?: number; height?: number }> = Array.isArray(b.images) ? b.images : [];
  if (images.length) {
    const rows = images.map(img => ({
      post_id: data.id,
      image_url: img.image_url,
      public_id: img.public_id ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
    }));
    await supabase.from("board_post_images").insert(rows);
  }

  // 관리자 전원 알림 + 멘션 대상 알림
  (async () => {
    try {
      const { data: mgrs } = await supabase.from("employees").select("id").gte("level", 2);
      const managerIds = (mgrs ?? []).map((m: any) => m.id).filter((id: number) => id !== authorId);
      const notifyIds = Array.from(new Set([...managerIds, ...mentions]));
      const title = `📝 [${insertRow.post_type === "issue" ? "이슈" : insertRow.post_type === "memo" ? "메모" : "질문"}] ${insertRow.title}`;
      const bodyText = `${insertRow.author_name}${insertRow.author_rank ? " " + insertRow.author_rank : ""}: ${(insertRow.body || "").slice(0, 80)}`;
      await Promise.all([
        saveNotifications(notifyIds, title, bodyText, "info"),
        pushToEmployees(notifyIds, title, bodyText, "/"),
      ]);
    } catch (err: any) {
      console.warn("[board notify create] failed:", err?.message);
    }
  })();

  res.json({ ok: true, id: data.id });
});

// ── 게시글 수정 (작성자·관리자만 · 클라에서 권한 판단, 서버는 author_id 매칭 검사)
router.patch("/api/board/posts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const b = req.body ?? {};
  const editorId = Number(b.editor_id ?? 0);
  const editorLevel = Number(b.editor_level ?? 0);

  const { data: existing, error: fetchErr } = await supabase.from("board_posts").select("author_id").eq("id", id).maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.author_id !== editorId && editorLevel < 2) {
    return res.status(403).json({ error: "권한 없음" });
  }

  const updates: any = {};
  if (typeof b.title === "string") updates.title = b.title.slice(0, 300);
  if (typeof b.body === "string") updates.body = b.body;
  if (typeof b.category === "string") updates.category = b.category;
  if (typeof b.pinned === "boolean" && editorLevel >= 2) updates.pinned = b.pinned;
  if (typeof b.status === "string") {
    updates.status = b.status;
    if (b.status === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = editorId;
    } else {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }
  }
  const imagesUpdate = Array.isArray(b.images) ? (b.images as Array<{ image_url: string; public_id?: string; width?: number; height?: number }>) : null;

  if (Object.keys(updates).length === 0 && imagesUpdate === null) {
    return res.status(400).json({ error: "no updates" });
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("board_posts").update(updates).eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
  }

  // 이미지 갱신: 전체 대체 (게시글 본문 이미지만, 댓글 이미지는 comment_id 로 구분되어 있어 영향 없음)
  if (imagesUpdate !== null) {
    // 기존 본문 이미지 삭제
    const { error: delErr } = await supabase
      .from("board_post_images")
      .delete()
      .eq("post_id", id)
      .is("comment_id", null);
    if (delErr) return res.status(500).json({ error: delErr.message });
    // 새 이미지 insert (배열이 비어있으면 skip)
    if (imagesUpdate.length > 0) {
      const rows = imagesUpdate.map(img => ({
        post_id: id,
        image_url: img.image_url,
        public_id: img.public_id ?? null,
        width: img.width ?? null,
        height: img.height ?? null,
      }));
      const { error: insErr } = await supabase.from("board_post_images").insert(rows);
      if (insErr) return res.status(500).json({ error: insErr.message });
    }
  }

  res.json({ ok: true });
});

// ── 게시글 삭제 (작성자·관리자만)
router.delete("/api/board/posts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const editorId = Number(req.query.editor_id ?? 0);
  const editorLevel = Number(req.query.editor_level ?? 0);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  const { data: existing } = await supabase.from("board_posts").select("author_id").eq("id", id).maybeSingle();
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.author_id !== editorId && editorLevel < 2) {
    return res.status(403).json({ error: "권한 없음" });
  }
  const { error } = await supabase.from("board_posts").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── 댓글 작성
router.post("/api/board/posts/:id/comments", async (req, res) => {
  const postId = Number(req.params.id);
  const b = req.body ?? {};
  if (!Number.isFinite(postId)) return res.status(400).json({ error: "invalid post id" });
  if (!b.author_id) return res.status(400).json({ error: "author_id required" });
  if (!b.body) return res.status(400).json({ error: "body required" });

  const authorId = Number(b.author_id);
  const mentions: number[] = Array.isArray(b.mentions) ? b.mentions.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n !== authorId) : [];

  const { data, error } = await supabase.from("board_post_comments").insert([{
    post_id: postId,
    author_id: authorId,
    author_name: String(b.author_name ?? ""),
    author_rank: b.author_rank ?? null,
    parent_id: b.parent_id ?? null,
    body: String(b.body),
    mentions,
  }]).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  // 이미지 batch (댓글 첨부)
  const images = Array.isArray(b.images) ? b.images : [];
  if (images.length) {
    const rows = images.map((img: any) => ({
      post_id: postId,
      comment_id: data.id,
      image_url: img.image_url,
      public_id: img.public_id ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
    }));
    await supabase.from("board_post_images").insert(rows);
  }

  // 원글 작성자에게 알림 + 멘션 대상 알림 (본인 제외)
  (async () => {
    try {
      const { data: post } = await supabase.from("board_posts").select("author_id, title").eq("id", postId).maybeSingle();
      const notifyIds = new Set<number>();
      if (post && post.author_id !== authorId) notifyIds.add(post.author_id);
      for (const m of mentions) notifyIds.add(m);
      if (notifyIds.size === 0) return;
      const title = `💬 새 댓글`;
      const bodyText = `"${(post?.title ?? "").slice(0, 40)}": ${(b.body ?? "").slice(0, 80)}`;
      await Promise.all([
        saveNotifications([...notifyIds], title, bodyText, "info"),
        pushToEmployees([...notifyIds], title, bodyText, "/"),
      ]);
    } catch (err: any) {
      console.warn("[board comment notify] failed:", err?.message);
    }
  })();

  res.json({ ok: true, id: data.id });
});

// ── 댓글 수정 (작성자만)
router.patch("/api/board/comments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const editorId = Number(b.editor_id ?? 0);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  if (!b.body || typeof b.body !== "string" || !b.body.trim()) return res.status(400).json({ error: "body required" });
  const { data: existing } = await supabase.from("board_post_comments").select("author_id").eq("id", id).maybeSingle();
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.author_id !== editorId) return res.status(403).json({ error: "본인 댓글만 수정 가능" });
  const { error } = await supabase.from("board_post_comments").update({ body: String(b.body).trim() }).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── 댓글 삭제
router.delete("/api/board/comments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const editorId = Number(req.query.editor_id ?? 0);
  const editorLevel = Number(req.query.editor_level ?? 0);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const { data: existing } = await supabase.from("board_post_comments").select("author_id").eq("id", id).maybeSingle();
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.author_id !== editorId && editorLevel < 2) {
    return res.status(403).json({ error: "권한 없음" });
  }
  await supabase.from("board_post_comments").delete().eq("id", id);
  res.json({ ok: true });
});

// ── 답변 채택 · 원글 작성자만
router.post("/api/board/comments/:id/accept", async (req, res) => {
  const id = Number(req.params.id);
  const editorId = Number(req.body?.editor_id ?? 0);
  const { data: cmt } = await supabase.from("board_post_comments").select("post_id, author_id").eq("id", id).maybeSingle();
  if (!cmt) return res.status(404).json({ error: "not found" });
  const { data: post } = await supabase.from("board_posts").select("author_id").eq("id", cmt.post_id).maybeSingle();
  if (!post || post.author_id !== editorId) return res.status(403).json({ error: "채택 권한 없음" });
  // 같은 글 내 기존 채택 해제
  await supabase.from("board_post_comments").update({ is_answer: false }).eq("post_id", cmt.post_id).eq("is_answer", true);
  await supabase.from("board_post_comments").update({ is_answer: true }).eq("id", id);
  // 답변 채택 시 자동 resolved
  await supabase.from("board_posts").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: editorId }).eq("id", cmt.post_id);
  res.json({ ok: true });
});

// ── 반응 (👍 helpful / 👀 seen) 토글
router.post("/api/board/posts/:id/react", async (req, res) => {
  const postId = Number(req.params.id);
  const empId = Number(req.body?.employee_id ?? 0);
  const reaction = String(req.body?.reaction ?? "helpful");
  if (!Number.isFinite(postId) || !Number.isFinite(empId)) return res.status(400).json({ error: "invalid" });
  const { data: existing } = await supabase
    .from("board_post_reactions")
    .select("post_id")
    .eq("post_id", postId).eq("employee_id", empId).eq("reaction", reaction)
    .maybeSingle();
  if (existing) {
    await supabase.from("board_post_reactions").delete().eq("post_id", postId).eq("employee_id", empId).eq("reaction", reaction);
    res.json({ ok: true, toggled: "off" });
  } else {
    await supabase.from("board_post_reactions").insert([{ post_id: postId, employee_id: empId, reaction }]);
    res.json({ ok: true, toggled: "on" });
  }
});

// ── Cloudinary 서명 발급 (클라이언트에서 직접 업로드용)
// 환경변수: CLOUDINARY_CLOUD_NAME · CLOUDINARY_API_KEY · CLOUDINARY_API_SECRET
router.post("/api/board/cloudinary-signature", async (_req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(500).json({ error: "Cloudinary 미설정" });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "megatown/board";
  // 서명: SHA-1 of "folder=X&timestamp=Y" + apiSecret
  const crypto = await import("crypto");
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
  res.json({ cloud_name: cloudName, api_key: apiKey, timestamp, folder, signature });
});

export default router;
