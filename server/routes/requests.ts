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

router.get("/api/display-requests", async (req, res) => {
  // scope=mine · employeeId 지정 시 담당자 본인 요청만 필터 (직원용 뷰)
  const scope = String(req.query.scope ?? "");
  const employeeIdRaw = req.query.employeeId;
  const employeeId = employeeIdRaw != null && employeeIdRaw !== "" ? Number(employeeIdRaw) : null;

  // 자동 정리: 완료(done) + 요청일 7일 지난 항목 삭제 (백그라운드 · 응답에 영향 X)
  (async () => {
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("display_requests")
        .delete()
        .eq("status", "done")
        .lt("requested_at", cutoff);
    } catch { /* silent */ }
  })();

  // 최신 요청이 항상 위로 (requested_at DESC)
  let query = supabase.from("display_requests").select("*").order("requested_at", { ascending: false });
  if (scope === "mine" && employeeId && Number.isFinite(employeeId)) {
    query = query.eq("assigned_staff_id", employeeId);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// 2026-08-05 · 상품별 진열요청 지원 (ScanPage 진입점)
//   · product_code 전달 시 · products 에서 real_map/spec/category/product_name 자동 조회
//   · zone_id·zone_label 자동 채움 (real_map 기반)
//   · 하위 호환 · 기존 zone_id 기반 요청 (zone-only) 그대로 지원
router.post("/api/display-requests", async (req, res) => {
  const b = req.body ?? {};
  const productCode = String(b.product_code ?? "").trim();
  const assignedStaffIdRaw = b.assigned_staff_id;
  let assignedStaffId = assignedStaffIdRaw != null && assignedStaffIdRaw !== "" ? Number(assignedStaffIdRaw) : null;
  let assignedStaffName = String(b.assigned_staff_name ?? "");
  let zoneId = String(b.zone_id ?? "");
  let zoneLabel = String(b.zone_label ?? "");
  let category = String(b.category ?? "");
  const note = String(b.note ?? "");
  let productName: string | null = null;

  // 상품 기반 요청: products 에서 real_map · category · name 자동 조회
  if (productCode) {
    try {
      const { data: prod } = await supabase
        .from("products")
        .select("product_code, product_name, real_map, spec, category")
        .eq("product_code", productCode)
        .maybeSingle();
      if (prod) {
        productName = (prod as any).product_name ?? productCode;
        if (!zoneId) zoneId = String((prod as any).real_map ?? "").trim();
        if (!zoneLabel && zoneId) zoneLabel = zoneId;
        if (!category) category = String((prod as any).category ?? "");
      }
    } catch { /* products 조회 실패는 요청 자체 실패시키지 않음 */ }
    // 담당자 자동 매칭 · zone_assignments · assignedStaffId 미지정 시
    if (zoneId && (!assignedStaffId || Number.isNaN(assignedStaffId))) {
      try {
        const { data: za } = await supabase
          .from("zone_assignments")
          .select("employee_id, employee_name")
          .eq("zone_id", zoneId)
          .maybeSingle();
        if (za) {
          assignedStaffId = (za as any).employee_id ?? null;
          assignedStaffName = (za as any).employee_name ?? "";
        }
      } catch { /* silent */ }
    }
  }

  const { data, error } = await supabase
    .from("display_requests")
    .insert([{
      zone_id: zoneId,
      zone_label: zoneLabel,
      category,
      requested_at: b.requested_at ? new Date(b.requested_at).toISOString() : new Date().toISOString(),
      assigned_staff_id: assignedStaffId,
      assigned_staff_name: assignedStaffName,
      note: note || (productName ? `${productName} 진열 요청` : ""),
      status: "pending",
      product_code: productCode || null,
    }])
    .select("id").single();
  if (error) return res.status(500).json({ error: error.message });

  // 2026-08-05 · 신규 3단계 워크플로우 · pending 시 창고담당 전원 알림
  //   · position ∈ {"창고", "물류"} 인 직원 전체
  //   · assigned_staff_id (진열담당) 는 prepared 단계에서 알림 받음 (여기서는 참조만)
  //   · 하위 호환 · assigned_staff_id 만 있고 창고담당 없으면 · 기존처럼 assigned 에게 알림 (zone-only 구 방식)
  (async () => {
    try {
      const title = "🛒 진열 보충 요청";
      const productLabel = productName ? `${productName} · ` : "";
      const zoneLabelStr = zoneLabel ? `"${zoneLabel}"` : (zoneId ? `"${zoneId}"` : "");
      const bodyText = `${productLabel}${zoneLabelStr}${category ? ` (${category})` : ""} 진열 보충 요청${note ? ` · ${note}` : ""}`;
      // 창고담당 전원 알림
      const { data: warehouseStaff } = await supabase
        .from("employees")
        .select("id, name, position, push_subscription")
        .in("position", ["창고", "물류"]);
      const notifyEmp = async (emp: { id: number; push_subscription: any }, tag: string) => {
        try {
          await notificationsService.create({ employee_id: emp.id, title, body: bodyText, type: "alert" });
        } catch (e: any) {
          console.warn(`[display-request] DB 알림 실패 emp=${emp.id}:`, e?.message);
        }
        if (emp.push_subscription) {
          try {
            await webpush.sendNotification(
              emp.push_subscription as webpush.PushSubscription,
              JSON.stringify({ title, body: bodyText, url: "/", tag })
            );
          } catch (err: any) {
            if ((err as any).statusCode === 410) {
              await supabase.from("employees").update({ push_subscription: null }).eq("id", emp.id);
            }
          }
        }
      };
      const tagBase = `disp-req-${data?.id ?? Date.now()}`;
      if (warehouseStaff && warehouseStaff.length > 0) {
        await Promise.allSettled(warehouseStaff.map(emp => notifyEmp(emp as any, `${tagBase}-wh-${emp.id}`)));
      } else if (assignedStaffId) {
        // 창고담당 없으면 · 기존 방식 (진열담당 자체) 알림 (하위호환)
        const { data: emp } = await supabase
          .from("employees").select("id, name, push_subscription").eq("id", assignedStaffId).maybeSingle();
        if (emp) await notifyEmp(emp as any, `${tagBase}-fallback`);
      }
    } catch (e: any) {
      console.warn("[display-request] 알림 예외:", e?.message);
    }
  })();

  res.json({ ok: true, id: data?.id });
});

// 2026-08-05 · Phase 1 · 신규 · 창고담당 pending → prepared (준비 완료)
router.patch("/api/display-requests/:id/prepare", async (req, res) => {
  const b = req.body ?? {};
  const preparedById = b.prepared_by ? Number(b.prepared_by) : null;
  const preparedByName = String(b.prepared_by_name ?? "");
  const now = new Date().toISOString();
  // 상태 확인 (idempotency · pending 만 허용)
  const { data: cur } = await supabase.from("display_requests").select("id, status, assigned_staff_id, assigned_staff_name, zone_label, note, product_code").eq("id", req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: "요청을 찾을 수 없습니다" });
  if ((cur as any).status !== "pending") return res.status(400).json({ error: `현재 상태 "${(cur as any).status}" · pending 만 준비완료 가능` });
  const { error } = await supabase.from("display_requests").update({
    status: "prepared",
    prepared_at: now,
    prepared_by: preparedById,
    prepared_by_name: preparedByName,
  }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  // 진열담당(assigned_staff_id) 에게 픽업 알림
  const assignedId = (cur as any).assigned_staff_id ? Number((cur as any).assigned_staff_id) : null;
  if (assignedId) {
    (async () => {
      try {
        const { data: emp } = await supabase.from("employees").select("id, push_subscription").eq("id", assignedId).maybeSingle();
        if (!emp) return;
        const title = "📦 창고 준비 완료 · 픽업해주세요";
        const body = `${(cur as any).zone_label ? `"${(cur as any).zone_label}" ` : ""}상품이 창고에 준비됐습니다${preparedByName ? ` (준비: ${preparedByName})` : ""}`;
        try { await notificationsService.create({ employee_id: emp.id, title, body, type: "alert" }); } catch { /* silent */ }
        if ((emp as any).push_subscription) {
          try {
            await webpush.sendNotification(
              (emp as any).push_subscription as webpush.PushSubscription,
              JSON.stringify({ title, body, url: "/", tag: `disp-prepared-${req.params.id}` })
            );
          } catch (err: any) {
            if ((err as any).statusCode === 410) {
              await supabase.from("employees").update({ push_subscription: null }).eq("id", emp.id);
            }
          }
        }
      } catch (e: any) { console.warn("[display-request/prepare] 알림 실패:", e?.message); }
    })();
  }

  res.json({ ok: true });
});

// 2026-08-05 · Phase 1 · 신규 · 진열담당 prepared → done (진열 완료)
router.patch("/api/display-requests/:id/complete", async (req, res) => {
  const b = req.body ?? {};
  const completedById = b.completed_by ? Number(b.completed_by) : null;
  const completedByName = String(b.completed_by_name ?? "");
  const now = new Date().toISOString();
  const { data: cur } = await supabase.from("display_requests").select("id, status, zone_label").eq("id", req.params.id).maybeSingle();
  if (!cur) return res.status(404).json({ error: "요청을 찾을 수 없습니다" });
  // prepared 뿐 아니라 pending 에서도 완료 가능 (관리자 fallback · 빠른 방식 요청 등)
  if (!["pending", "prepared"].includes((cur as any).status)) {
    return res.status(400).json({ error: `현재 상태 "${(cur as any).status}" · 완료 처리 불가` });
  }
  const { error } = await supabase.from("display_requests").update({
    status: "done",
    completed_at: now,
    completed_by: completedById,
    completed_by_name: completedByName,
  }).eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  // 관리자 (level ≥ 8) 알림 (기존 로직 · auth_level 기준)
  (async () => {
    try {
      const { data: admins } = await supabase
        .from("employees").select("id, push_subscription").eq("auth_level", 9);
      if (!admins?.length) return;
      const title = "✅ 진열 완료";
      const body = (cur as any).zone_label
        ? `${completedByName || "담당자"}가 "${(cur as any).zone_label}" 진열을 완료했습니다`
        : "진열 요청이 완료되었습니다";
      await Promise.allSettled([
        ...admins.map(a => notificationsService.create({ employee_id: a.id, title, body, type: "alert" as const })),
        ...admins.filter(a => (a as any).push_subscription).map(a =>
          webpush.sendNotification(
            (a as any).push_subscription as webpush.PushSubscription,
            JSON.stringify({ title, body, url: "/", tag: `disp-done-${req.params.id}` })
          ).catch(() => null)
        ),
      ]);
    } catch (e: any) { console.warn("[display-request/complete] 관리자 알림 실패:", e?.message); }
  })();

  res.json({ ok: true });
});

// 하위 호환 · 기존 클라이언트 (status 만 업데이트) 지원 · pending/prepared/done 모두 허용
router.patch("/api/display-requests/:id", async (req, res) => {
  const { status, zone_label, assigned_staff_name } = req.body ?? {};
  if (!["pending", "prepared", "done"].includes(status)) return res.status(400).json({ error: "invalid status" });
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
  // 2026-07-30 · 사용자 요청 · store_stock_2 (매장2) 지원 · real_map "/" 분할
  // 2026-08-03 · Phase 3 · 5분리 (창고1·창고2·매장1·매장2·매장3) · 구역 3개 추가
  //   - warehouse1_stock / warehouse2_stock / store3_stock / store1_zone / store2_zone / store3_zone
  //   - 레거시 하위 호환: warehouse_stock = warehouse1_stock, store_stock = store1_stock (== store_stock)
  const hasWarehouse  = Object.prototype.hasOwnProperty.call(b, "warehouse_stock");
  const hasStore      = Object.prototype.hasOwnProperty.call(b, "store_stock");
  const hasStore2     = Object.prototype.hasOwnProperty.call(b, "store_stock_2");
  const hasWarehouse1 = Object.prototype.hasOwnProperty.call(b, "warehouse1_stock");
  const hasWarehouse2 = Object.prototype.hasOwnProperty.call(b, "warehouse2_stock");
  const hasStore3     = Object.prototype.hasOwnProperty.call(b, "store3_stock");
  const hasZone1      = Object.prototype.hasOwnProperty.call(b, "store1_zone");
  const hasZone2      = Object.prototype.hasOwnProperty.call(b, "store2_zone");
  const hasZone3      = Object.prototype.hasOwnProperty.call(b, "store3_zone");
  const num = (v: any): number | null => (v != null && v !== "" ? Number(v) : null);
  const str = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const payload: Record<string, any> = {
    product_name:  String(b.product_name ?? ""),
    system_stock:  b.system_stock  != null ? Number(b.system_stock)  : null,
    optimal_stock: b.optimal_stock != null ? Number(b.optimal_stock) : null,
    checked_by:    String(b.checked_by ?? ""),
    note:          String(b.note ?? ""),
    checked_at:    now,
    status:        "pending",
  };
  // 레거시 · 신규 컬럼 mirror 처리 · warehouse1 → warehouse (없으면 warehouse 값 그대로)
  if (hasWarehouse1) {
    payload.warehouse1_stock = num(b.warehouse1_stock);
    payload.warehouse_stock  = payload.warehouse1_stock; // 레거시 mirror
  } else if (hasWarehouse) {
    payload.warehouse_stock  = num(b.warehouse_stock);
    payload.warehouse1_stock = payload.warehouse_stock;   // 신규 mirror (하위 호환)
  }
  if (hasWarehouse2) payload.warehouse2_stock = num(b.warehouse2_stock);
  if (hasStore)      payload.store_stock      = num(b.store_stock);
  if (hasStore2)     payload.store_stock_2    = num(b.store_stock_2);
  if (hasStore3)     payload.store3_stock     = num(b.store3_stock);
  if (hasZone1)      payload.store1_zone      = str(b.store1_zone);
  if (hasZone2)      payload.store2_zone      = str(b.store2_zone);
  if (hasZone3)      payload.store3_zone      = str(b.store3_zone);

  const { data: existingList } = await supabase.from("inventory_checks").select("id, warehouse_stock, store_stock, store_stock_2").eq("product_code", code).order("checked_at", { ascending: false }).limit(1);
  const existing = existingList?.[0] ?? null;
  const applyPayload = async (): Promise<{ error?: string } | null> => {
    if (existing) {
      const { error } = await supabase.from("inventory_checks").update(payload).eq("id", existing.id);
      if (error) return { error: error.message };
      return null;
    }
    const insertPayload: Record<string, any> = { ...payload, product_code: code };
    if (!("warehouse_stock" in insertPayload))  insertPayload.warehouse_stock  = null;
    if (!("store_stock" in insertPayload))      insertPayload.store_stock      = null;
    if (!("store_stock_2" in insertPayload))    insertPayload.store_stock_2    = null;
    const { error } = await supabase.from("inventory_checks").insert([insertPayload]);
    if (error) return { error: error.message };
    return null;
  };
  // 신규 컬럼 미존재 DB 하위 호환 · 실패 시 신규 필드 stripping 후 재시도
  let result = await applyPayload();
  if (result?.error && /column .* does not exist|no column named|schema cache/i.test(result.error)) {
    for (const k of ["warehouse1_stock","warehouse2_stock","store3_stock","store1_zone","store2_zone","store3_zone"]) {
      delete (payload as any)[k];
    }
    result = await applyPayload();
  }
  if (result?.error) return res.status(500).json({ error: result.error });
  return res.json({ ok: true, updated: !!existing });
});

// 2026-07-30 · 사용자 요청 · 실재고 일괄 저장 · 전체 등록 기능
// 2026-08-03 · Phase 3 · 5분리 (창고1·창고2·매장1·매장2·매장3) · 구역 3개
// body: { checked_by, items: [{
//   product_code, product_name,
//   warehouse1_stock, warehouse2_stock, store_stock (=store1), store_stock_2 (=store2), store3_stock,
//   store1_zone, store2_zone, store3_zone
// }] }
// 하위 호환:
//   - warehouse_stock (레거시 · 단일 창고) → warehouse1_stock 미지정 시 fallback
//   - 구 클라이언트: warehouse_stock / store_stock / store_stock_2 만 보내는 경우 그대로 저장
//   - 신규 컬럼 미존재 DB · 신규 필드 stripping 후 재시도 (자동 다운그레이드)
router.post("/api/inventory-checks/bulk", async (req, res) => {
  try {
    const b = req.body ?? {};
    const items: any[] = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) return res.status(400).json({ error: "items 필수" });
    const checked_by = String(b.checked_by ?? "").trim() || "익명";
    const now = new Date().toISOString();
    const num = (v: any): number | null => (v != null && v !== "" ? Number(v) : null);
    const str = (v: any): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    let saved = 0, failed = 0;
    let downgraded = false; // 신규 컬럼 없는 DB 감지 후 이후 아이템 전부 스트립 처리
    for (const it of items) {
      const code = String(it.product_code ?? "").trim();
      if (!code) { failed++; continue; }
      // 창고1 우선 · 없으면 레거시 warehouse_stock 사용
      const wh1 = it.warehouse1_stock !== undefined ? num(it.warehouse1_stock) : num(it.warehouse_stock);
      const wh2 = num(it.warehouse2_stock);
      const s1  = num(it.store_stock);       // 매장1
      const s2  = num(it.store_stock_2);     // 매장2
      const s3  = num(it.store3_stock);      // 매장3
      const payload: Record<string, any> = {
        product_name: String(it.product_name ?? ""),
        checked_by,
        checked_at: now,
        status: "pending",
        // 레거시 mirror · 기존 소비자 (LowStockPanel · DisplayPage · RequestsPage) 하위 호환
        warehouse_stock: wh1,
        store_stock:     s1,
        store_stock_2:   s2,
      };
      // 신규 컬럼
      if (!downgraded) {
        payload.warehouse1_stock = wh1;
        payload.warehouse2_stock = wh2;
        payload.store3_stock     = s3;
        payload.store1_zone      = str(it.store1_zone);
        payload.store2_zone      = str(it.store2_zone);
        payload.store3_zone      = str(it.store3_zone);
      }
      // 2026-08-04 · 사용자 요청 · 날짜별 이력 관리 · 같은 날짜면 update (덮어쓰기) · 다른 날짜면 insert (이력 추가)
      const todayYmd = now.slice(0, 10);
      const { data: existingList } = await supabase
        .from("inventory_checks")
        .select("id, checked_at")
        .eq("product_code", code)
        .order("checked_at", { ascending: false })
        .limit(1);
      const existing = existingList?.[0] ?? null;
      const existingYmd = existing?.checked_at ? String(existing.checked_at).slice(0, 10) : null;
      const sameDay = existingYmd === todayYmd;
      const doWrite = async (p: Record<string, any>) => {
        if (existing && sameDay) {
          // 같은 날 재저장 · UPDATE (덮어쓰기)
          return supabase.from("inventory_checks").update(p).eq("id", existing.id);
        }
        // 다른 날 or 신규 · INSERT (이력 추가 · 상품별 시계열 보존)
        return supabase.from("inventory_checks").insert([{ ...p, product_code: code }]);
      };
      let { error } = await doWrite(payload);
      if (error && /column .* does not exist|no column named|schema cache/i.test(error.message)) {
        // 신규 컬럼 미존재 DB → 스트립 후 재시도 · 이후 아이템도 스트립
        downgraded = true;
        for (const k of ["warehouse1_stock","warehouse2_stock","store3_stock","store1_zone","store2_zone","store3_zone"]) {
          delete (payload as any)[k];
        }
        const retry = await doWrite(payload);
        error = retry.error ?? null;
      }
      if (error) { failed++; } else { saved++; }
    }
    res.json({ ok: true, saved, failed, total: items.length, downgraded });
  } catch (err: any) {
    console.error("[inventory-checks/bulk POST]", err?.message);
    res.status(500).json({ error: err?.message ?? "일괄 저장 실패" });
  }
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
