// server/routes/returnRequests.ts
// 반품요청 저장·조회 · 2026-07-30 (사용자 요청)
//   - POST   /api/return-requests               · 반품요청 생성
//   - GET    /api/return-requests               · 리스트 (?supplier=X · ?status=X · ?days=N · ?limit=N)
//   - GET    /api/return-requests/by-supplier   · 공급사별 그룹 요약 (?days=N)
//   - PATCH  /api/return-requests/:id           · status·qty·reason 수정
//   - DELETE /api/return-requests/:id           · 삭제
//   - POST   /api/return-requests/bulk-send     · 선택 반품요청 · 공급사별 그룹 발송 (이메일·문자)

import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

// POST /api/return-requests
// body: { product_code, product_name, supplier, qty, current_stock, purchase_price, reason?, requested_by?, requested_by_id? }
router.post("/api/return-requests", async (req, res) => {
  try {
    const b = req.body ?? {};
    const product_code = String(b.product_code ?? "").trim();
    if (!product_code) return res.status(400).json({ error: "product_code 필수" });
    const row = {
      product_code,
      product_name: String(b.product_name ?? "").trim() || null,
      supplier: String(b.supplier ?? "").trim() || null,
      qty: Number(b.qty ?? 0) || 0,
      current_stock: Number(b.current_stock ?? 0) || 0,
      purchase_price: Number(b.purchase_price ?? 0) || 0,
      reason: String(b.reason ?? "").trim() || null,
      requested_by: String(b.requested_by ?? "").trim() || null,
      requested_by_id: Number(b.requested_by_id ?? 0) || null,
      status: "pending",   // pending | sent | done | cancelled
    };
    const { data, error } = await supabase
      .from("return_requests")
      .insert([row])
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, row: data });
  } catch (err: any) {
    console.error("[return-requests POST]", err?.message);
    res.status(500).json({ error: err?.message ?? "반품요청 저장 실패" });
  }
});

// GET /api/return-requests?supplier=X&status=X&days=30&limit=200
router.get("/api/return-requests", async (req, res) => {
  try {
    const supplier = String(req.query.supplier ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "60"), 10) || 60));
    const limit = Math.max(1, Math.min(2000, parseInt(String(req.query.limit ?? "200"), 10) || 200));
    const since = new Date(); since.setDate(since.getDate() - days);
    let q = supabase
      .from("return_requests")
      .select("*")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (supplier) q = q.ilike("supplier", `%${supplier}%`);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return res.json({ rows: [], warning: "return_requests 테이블 없음" });
      throw new Error(error.message);
    }
    res.json({ rows: data ?? [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "반품요청 조회 실패" });
  }
});

// GET /api/return-requests/by-supplier?days=60
// 공급사별 요약 · [{ supplier, count, total_qty, total_amount, statuses: {pending, sent, done, cancelled} }]
router.get("/api/return-requests/by-supplier", async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "60"), 10) || 60));
    const since = new Date(); since.setDate(since.getDate() - days);
    const { data, error } = await supabase
      .from("return_requests")
      .select("*")
      .gte("created_at", since.toISOString());
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return res.json({ groups: [] });
      throw new Error(error.message);
    }
    const map = new Map<string, { supplier: string; count: number; total_qty: number; total_amount: number; statuses: Record<string, number>; latest_at: string; items: any[] }>();
    for (const r of (data ?? [])) {
      const sup = String((r as any).supplier ?? "미지정");
      const cur = map.get(sup) ?? { supplier: sup, count: 0, total_qty: 0, total_amount: 0, statuses: {}, latest_at: "", items: [] };
      cur.count++;
      cur.total_qty += Number((r as any).qty ?? 0) || 0;
      cur.total_amount += (Number((r as any).qty ?? 0) || 0) * (Number((r as any).purchase_price ?? 0) || 0);
      const st = String((r as any).status ?? "pending");
      cur.statuses[st] = (cur.statuses[st] ?? 0) + 1;
      const ca = String((r as any).created_at ?? "");
      if (!cur.latest_at || ca > cur.latest_at) cur.latest_at = ca;
      cur.items.push(r);
      map.set(sup, cur);
    }
    const groups = [...map.values()].sort((a, b) => b.total_amount - a.total_amount);
    res.json({ days, groups });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "공급사별 조회 실패" });
  }
});

// PATCH /api/return-requests/:id
// body: { qty?, reason?, status?  }
router.patch("/api/return-requests/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const b = req.body ?? {};
    const patch: any = {};
    if (b.qty != null) patch.qty = Number(b.qty) || 0;
    if (b.reason != null) patch.reason = String(b.reason).trim() || null;
    if (b.status != null) patch.status = String(b.status).trim();
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "수정 필드 없음" });
    const { data, error } = await supabase
      .from("return_requests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    res.json({ ok: true, row: data });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "반품요청 수정 실패" });
  }
});

// DELETE /api/return-requests/:id
router.delete("/api/return-requests/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    const { error } = await supabase.from("return_requests").delete().eq("id", id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "반품요청 삭제 실패" });
  }
});

// POST /api/return-requests/bulk-send
// body: { ids: number[], channels: { email: boolean, sms: boolean }, sender_note?: string }
// 공급사별로 그룹핑 · 각 공급사 담당자에게 반품요청 발송 · 발송된 요청은 status=sent 로 업데이트
router.post("/api/return-requests/bulk-send", async (req, res) => {
  try {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map((n: any) => Number(n)).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(400).json({ error: "ids 필수" });
    // 대상 조회
    const { data: rows, error } = await supabase
      .from("return_requests")
      .select("*")
      .in("id", ids);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "대상 없음" });
    // 공급사별 그룹핑 · 발송 로직 (별도 이메일/문자 서비스 연동은 후속)
    const bySup = new Map<string, any[]>();
    for (const r of rows) {
      const sup = String((r as any).supplier ?? "미지정");
      const arr = bySup.get(sup) ?? [];
      arr.push(r);
      bySup.set(sup, arr);
    }
    // status=sent 로 업데이트 (실제 발송 채널 연동은 후속)
    const { error: uErr } = await supabase
      .from("return_requests")
      .update({ status: "sent" })
      .in("id", ids);
    if (uErr) throw new Error(uErr.message);
    const groups = [...bySup.entries()].map(([supplier, items]) => ({
      supplier,
      count: items.length,
      total_qty: items.reduce((s, x) => s + (Number(x.qty ?? 0) || 0), 0),
    }));
    res.json({ ok: true, sent_count: rows.length, groups });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "일괄 발송 실패" });
  }
});

export default router;
