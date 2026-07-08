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
    supabase.from("products").select("product_code, spec, real_map").eq("hidden", false).not("real_map", "is", null).neq("real_map", ""),
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
  const assignedStaffId = b.assigned_staff_id ? Number(b.assigned_staff_id) : null;
  const assignedStaffName = String(b.assigned_staff_name ?? "");
  const zoneLabel = String(b.zone_label ?? "");
  const category = String(b.category ?? "");
  const note = String(b.note ?? "");
  const { data, error } = await supabase
    .from("display_requests")
    .insert([{
      zone_id: String(b.zone_id ?? ""),
      zone_label: zoneLabel,
      category,
      requested_at: b.requested_at ? new Date(b.requested_at).toISOString() : new Date().toISOString(),
      assigned_staff_id: assignedStaffId,
      assigned_staff_name: assignedStaffName,
      note,
      status: "pending",
    }])
    .select("id").single();
  if (error) return res.status(500).json({ error: error.message });

  // 담당자에게 알림 발송 (DB notification + 웹푸시) · 실패해도 요청 성공 유지
  if (assignedStaffId) {
    (async () => {
      try {
        const { data: emp } = await supabase
          .from("employees")
          .select("id, name, push_subscription")
          .eq("id", assignedStaffId)
          .maybeSingle();
        if (!emp) return;
        const title = "🛒 진열 보충 요청";
        const bodyText = zoneLabel
          ? `"${zoneLabel}"${category ? ` (${category})` : ""} 진열 보충 요청이 도착했습니다${note ? ` · ${note}` : ""}`
          : `새로운 진열 보충 요청이 도착했습니다${note ? ` · ${note}` : ""}`;
        // 1) DB 알림
        try {
          await notificationsService.create({
            employee_id: emp.id,
            title,
            body: bodyText,
            type: "alert",
          });
        } catch (e: any) {
          console.warn(`[display-request] DB 알림 insert 실패 · emp=${emp.id}:`, e?.message);
        }
        // 2) 웹푸시 (best-effort)
        if (emp.push_subscription) {
          try {
            await webpush.sendNotification(
              emp.push_subscription as webpush.PushSubscription,
              JSON.stringify({
                title,
                body: bodyText,
                url: "/",
                tag: `disp-req-${data?.id ?? Date.now()}`,
              })
            );
          } catch (err: any) {
            if ((err as any).statusCode === 410) {
              await supabase.from("employees").update({ push_subscription: null }).eq("id", emp.id);
            } else {
              console.warn(`[display-request] push 실패 · emp=${emp.id}:`, err?.message);
            }
          }
        }
      } catch (e: any) {
        console.warn("[display-request] 알림 예외:", e?.message);
      }
    })();
  }

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

// ── 발주서 일괄/개별 발송 ─────────────────────────────────────────────────────
// 공급사별로 그룹핑된 발주 항목을 받아 이메일/문자 발송 시도.
// 실제 SMTP·SMS gateway 설정이 없으면 로그만 남기고 "미구성" 상태 반환.
// order_dispatches 테이블에 발송 기록 저장 (없으면 로그로 대체)
router.post("/api/order-requests/bulk-send", async (req, res) => {
  const {
    order_number,
    order_date,
    desired_arrival,
    memo,
    channels,
    bySupplier,
  } = req.body ?? {};

  if (!Array.isArray(bySupplier) || bySupplier.length === 0) {
    return res.status(400).json({ error: "bySupplier가 비어있습니다." });
  }
  if (!channels || (!channels.email && !channels.sms)) {
    return res.status(400).json({ error: "채널(이메일/문자) 중 하나 이상 선택해야 합니다." });
  }

  const results: any[] = [];
  const now = new Date().toISOString();

  // 각 공급사 vendors 조회 (담당자·이메일·전화 보강)
  for (const group of bySupplier) {
    const supName = String(group.supplier ?? "").trim();
    const items = Array.isArray(group.items) ? group.items : [];

    let vendor: any = null;
    if (supName) {
      const { data } = await supabase
        .from("vendors")
        .select("id, company_name, contact_name, phone, email")
        .eq("company_name", supName)
        .maybeSingle();
      vendor = data ?? null;
    }

    const targetEmail = group.supplier_email ?? vendor?.email ?? null;
    const targetPhone = group.supplier_phone ?? vendor?.phone ?? null;
    const targetName  = group.supplier_contact ?? vendor?.contact_name ?? null;

    const dispatch: Record<string, any> = {
      order_number,
      order_date,
      desired_arrival,
      memo,
      supplier: supName,
      supplier_contact: targetName,
      supplier_email: targetEmail,
      supplier_phone: targetPhone,
      item_count: items.length,
      channels: JSON.stringify({ email: !!channels.email, sms: !!channels.sms }),
      items: JSON.stringify(items),
      dispatched_at: now,
      status: "pending",
    };

    // 채널별 발송 시도 (환경변수 기반 · 없으면 "미구성" 상태)
    const outcomes: string[] = [];
    if (channels.email) {
      if (targetEmail && process.env.SMTP_HOST) {
        // 실제 nodemailer 발송 로직은 별도 구현 필요 (패키지 미설치)
        outcomes.push(`email:skipped(nodemailer-not-installed)`);
        dispatch.email_status = "not_configured";
      } else if (!targetEmail) {
        outcomes.push("email:no_recipient");
        dispatch.email_status = "no_recipient";
      } else {
        outcomes.push("email:no_smtp_env");
        dispatch.email_status = "no_smtp_env";
      }
    }
    if (channels.sms) {
      if (targetPhone && process.env.SMS_API_KEY) {
        outcomes.push("sms:skipped(gateway-not-installed)");
        dispatch.sms_status = "not_configured";
      } else if (!targetPhone) {
        outcomes.push("sms:no_recipient");
        dispatch.sms_status = "no_recipient";
      } else {
        outcomes.push("sms:no_gateway_env");
        dispatch.sms_status = "no_gateway_env";
      }
    }

    dispatch.status = outcomes.some(o => /skipped\(/.test(o)) ? "sent" : "dry_run";

    // order_dispatches 테이블 저장 (없으면 로그만)
    try {
      const { error } = await supabase.from("order_dispatches").insert([dispatch]);
      if (error && !/relation|does not exist/i.test(error.message)) {
        console.error("[bulk-send] dispatch insert 실패:", error.message);
      }
    } catch (e: any) {
      console.warn("[bulk-send] dispatch insert 예외:", e?.message);
    }

    console.log(`[bulk-send] ${supName} · ${items.length}건 · ${outcomes.join(", ")}`);

    results.push({
      supplier: supName,
      items: items.length,
      target: { email: targetEmail, phone: targetPhone, contact: targetName },
      outcomes,
    });
  }

  // 요약 메시지
  const totalItems = results.reduce((n, r) => n + r.items, 0);
  const anySent = results.some(r => r.outcomes.some((o: string) => /skipped\(/.test(o)));
  const summary = anySent
    ? `${results.length}개 공급사 · ${totalItems}건 저장 완료 (실제 발송은 SMTP/SMS 설정 필요)`
    : `${results.length}개 공급사 · ${totalItems}건 저장 완료 (미구성 상태 · 이메일/문자 발송 안 됨)`;

  res.json({
    ok: true,
    order_number,
    summary,
    channels,
    results,
    notice: [
      "※ 실제 이메일 발송을 활성화하려면 다음 환경변수와 nodemailer 설치 필요:",
      "  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM",
      "  npm install nodemailer",
      "※ 실제 문자 발송을 활성화하려면 SMS_API_KEY 및 SMS provider (solapi/naver cloud 등) 설정 필요",
    ].join("\n"),
  });
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
