import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../src/supabase/client";
import { notificationsService } from "../../src/services/notificationsService";

const router = Router();

router.get("/api/requests/pending-counts", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const [display, order, productsWithRealMap, legacy, leave, lunch, inventory] = await Promise.all([
    supabase.from("display_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("order_requests").select("id", { count: "exact", head: true }),
    supabase.from("products").select("product_code, spec, real_map").not("real_map", "is", null).neq("real_map", ""),
    supabase.from("zone_mismatches").select("product_code"),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("lunch_requests").select("id", { count: "exact", head: true }).eq("date", today).eq("eating", false),
    supabase.from("inventory_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const computedCodes = new Set(
    (productsWithRealMap.data ?? [])
      .filter(p => (p.real_map ?? "").trim() !== (p.spec ?? "").trim())
      .map(p => p.product_code)
  );
  const legacyCodes = (legacy.data ?? []).filter(r => !computedCodes.has(r.product_code));
  const mismatchCount = computedCodes.size + legacyCodes.length;
  const lunchCount = lunch.count ?? 0;
  const inventoryCount = inventory.count ?? 0;
  res.json({
    display:   display.count ?? 0,
    order:     order.count   ?? 0,
    mismatch:  mismatchCount,
    leave:     leave.count   ?? 0,
    lunch:     lunchCount,
    inventory: inventoryCount,
    total: (display.count ?? 0) + (order.count ?? 0) + mismatchCount + (leave.count ?? 0) + inventoryCount,
  });
});

router.get("/api/display-requests", async (_req, res) => {
  const { data, error } = await supabase
    .from("display_requests").select("*").order("requested_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post("/api/display-requests", async (req, res) => {
  const b = req.body ?? {};
  const { data, error } = await supabase
    .from("display_requests")
    .insert([{
      zone_id: String(b.zone_id ?? ""),
      zone_label: String(b.zone_label ?? ""),
      category: String(b.category ?? ""),
      requested_at: b.requested_at ? new Date(b.requested_at).toISOString() : new Date().toISOString(),
      assigned_staff_id: b.assigned_staff_id ? Number(b.assigned_staff_id) : null,
      assigned_staff_name: String(b.assigned_staff_name ?? ""),
      note: String(b.note ?? ""),
      status: "pending",
    }])
    .select("id").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, id: data?.id });
});

router.patch("/api/display-requests/:id", async (req, res) => {
  const { status, zone_label, assigned_staff_name } = req.body ?? {};
  if (!["pending", "done"].includes(status)) return res.status(400).json({ error: "invalid status" });
  const { error } = await supabase.from("display_requests").update({ status }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (status === "done") {
    const { data: admins } = await supabase
      .from("employees").select("id, push_subscription").eq("auth_level", 9);
    if (admins?.length) {
      const title = "✅ 진열 완료";
      const body = zone_label
        ? `${assigned_staff_name || "담당자"}가 "${zone_label}" 진열을 완료했습니다`
        : "진열 요청이 완료되었습니다";
      await Promise.allSettled([
        ...admins.map(a => notificationsService.create({ employee_id: a.id, title, body, type: "alert" as const })),
        ...admins.filter(a => a.push_subscription).map(a =>
          webpush.sendNotification(
            a.push_subscription as webpush.PushSubscription,
            JSON.stringify({ title, body, url: "/", tag: `disp-done-${req.params.id}` })
          ).catch(() => null)
        ),
      ]);
    }
  }

  res.json({ ok: true });
});

router.delete("/api/display-requests/:id", async (req, res) => {
  const { error } = await supabase.from("display_requests").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get("/api/order-requests", async (req, res) => {
  let q = supabase.from("order_requests").select("*").order("requested_at", { ascending: false });
  if (req.query.product_code) q = q.eq("product_code", String(req.query.product_code));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post("/api/order-requests", async (req, res) => {
  const b = req.body ?? {};
  const code = String(b.product_code ?? "");
  const now = new Date().toISOString();
  const payload = {
    current_stock: b.current_stock != null ? Number(b.current_stock) : null,
    optimal_stock: b.optimal_stock != null ? Number(b.optimal_stock) : null,
    note: String(b.note ?? ""),
    requested_at: now,
  };
  const { data: existing } = await supabase.from("order_requests").select("id").eq("product_code", code).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("order_requests").update(payload).eq("id", existing.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, updated: true, id: existing.id });
  }
  const { data, error } = await supabase.from("order_requests").insert([{
    product_code: code,
    product_name: String(b.product_name ?? ""),
    ...payload,
  }]).select("id").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, updated: false, id: data?.id });
});

router.delete("/api/order-requests/:id", async (req, res) => {
  const { error } = await supabase.from("order_requests").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── 실재고 점검 ──────────────────────────────────────────────────────────────

router.get("/api/inventory-checks", async (req, res) => {
  let q = supabase.from("inventory_checks").select("*").order("checked_at", { ascending: false });
  if (req.query.product_code) q = q.eq("product_code", String(req.query.product_code));
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post("/api/inventory-checks", async (req, res) => {
  const b = req.body ?? {};
  const code = String(b.product_code ?? "");
  const now = new Date().toISOString();
  // 부분 업데이트: 요청에 포함된 필드만 업데이트 (창고/매장 각각 독립 저장 지원)
  const hasWarehouse = Object.prototype.hasOwnProperty.call(b, "warehouse_stock");
  const hasStore     = Object.prototype.hasOwnProperty.call(b, "store_stock");
  const payload: Record<string, any> = {
    product_name:  String(b.product_name ?? ""),
    system_stock:  b.system_stock  != null ? Number(b.system_stock)  : null,
    optimal_stock: b.optimal_stock != null ? Number(b.optimal_stock) : null,
    checked_by:    String(b.checked_by ?? ""),
    note:          String(b.note ?? ""),
    checked_at:    now,
    status:        "pending",
  };
  if (hasWarehouse) payload.warehouse_stock = b.warehouse_stock != null && b.warehouse_stock !== "" ? Number(b.warehouse_stock) : null;
  if (hasStore)     payload.store_stock     = b.store_stock     != null && b.store_stock     !== "" ? Number(b.store_stock)     : null;

  const { data: existingList } = await supabase.from("inventory_checks").select("id, warehouse_stock, store_stock").eq("product_code", code).order("checked_at", { ascending: false }).limit(1);
  const existing = existingList?.[0] ?? null;
  if (existing) {
    // 요청에 없는 필드는 기존값 유지
    const { error } = await supabase.from("inventory_checks").update(payload).eq("id", existing.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, updated: true });
  }
  // 신규 삽입: 요청에 없는 창고/매장은 null 로 시작
  const insertPayload: Record<string, any> = { ...payload, product_code: code };
  if (!hasWarehouse) insertPayload.warehouse_stock = null;
  if (!hasStore)     insertPayload.store_stock     = null;
  const { error } = await supabase.from("inventory_checks").insert([insertPayload]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, updated: false });
});

router.patch("/api/inventory-checks/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!["pending", "done"].includes(status)) return res.status(400).json({ error: "invalid status" });
  const { error } = await supabase.from("inventory_checks").update({ status }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete("/api/inventory-checks/:id", async (req, res) => {
  const { error } = await supabase.from("inventory_checks").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
