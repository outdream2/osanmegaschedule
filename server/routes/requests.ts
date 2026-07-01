import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

router.get("/api/requests/pending-counts", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const [display, order, productsWithRealMap, legacy, leave, lunch, inventory] = await Promise.all([
    supabase.from("display_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("order_requests").select("id", { count: "exact", head: true }),
    supabase.from("products").select("product_code, spec, real_map").not("real_map", "is", null).neq("real_map", ""),
    supabase.from("zone_mismatches").select("product_code"),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("lunch_requests").select("id", { count: "exact", head: true }).eq("date", today).eq("eating", true),
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
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "status required" });
  const { error } = await supabase.from("display_requests").update({ status }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete("/api/display-requests/:id", async (req, res) => {
  const { error } = await supabase.from("display_requests").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.get("/api/order-requests", async (_req, res) => {
  const { data, error } = await supabase
    .from("order_requests").select("*").order("requested_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post("/api/order-requests", async (req, res) => {
  const b = req.body ?? {};
  const { error } = await supabase.from("order_requests").insert([{
    product_code: String(b.product_code ?? ""),
    product_name: String(b.product_name ?? ""),
    current_stock: b.current_stock != null ? Number(b.current_stock) : null,
    optimal_stock: b.optimal_stock != null ? Number(b.optimal_stock) : null,
    note: String(b.note ?? ""),
  }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete("/api/order-requests/:id", async (req, res) => {
  const { error } = await supabase.from("order_requests").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── 실재고 점검 ──────────────────────────────────────────────────────────────

router.get("/api/inventory-checks", async (_req, res) => {
  const { data, error } = await supabase
    .from("inventory_checks").select("*").order("checked_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post("/api/inventory-checks", async (req, res) => {
  const b = req.body ?? {};
  const { error } = await supabase.from("inventory_checks").insert([{
    product_code:    String(b.product_code ?? ""),
    product_name:    String(b.product_name ?? ""),
    warehouse_stock: b.warehouse_stock != null ? Number(b.warehouse_stock) : null,
    store_stock:     b.store_stock     != null ? Number(b.store_stock)     : null,
    system_stock:    b.system_stock    != null ? Number(b.system_stock)    : null,
    optimal_stock:   b.optimal_stock   != null ? Number(b.optimal_stock)   : null,
    checked_by:      String(b.checked_by ?? ""),
    note:            String(b.note ?? ""),
    status:          "pending",
  }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.patch("/api/inventory-checks/:id", async (req, res) => {
  const { status } = req.body ?? {};
  if (!status) return res.status(400).json({ error: "status required" });
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
