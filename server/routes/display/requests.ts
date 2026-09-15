// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import webpush from "web-push";
import { supabase } from "../../../src/supabase/client";
import { notificationsService } from "../../services/notificationsService";
// 2026-08-16 · #112-E1 Phase 2 · 매니저(lv 2+) 만 DELETE
import { authorize, getSession } from "../../middleware/requireAuth";
// 2026-08-05 · T-PERF-1a · inventory-checks 변경 시 low-stock 캐시 무효화
import { clearLowStockCache } from "../stock/stockManage";
// 2026-08-06 · T-LOSS-HISTORY · 실재고 저장 시 · 오늘 손실 스냅샷 fire-and-forget
import { scheduleSnapshotBackground } from "../stock/lossTracking";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError, badRequest, notFound } from "../../middleware/errorHandler";
import { validateBody } from "../../middleware/zodValidate";
import { CreateOrderRequestSchema, BulkSendOrderSchema } from "../../../src/shared/schemas/orderRequests";
import {
  CreateInventoryCheckSchema,
  BulkInventoryCheckSchema,
  PatchInventoryCheckSchema,
} from "../../../src/shared/schemas/inventoryChecks";
// 2026-09-09 · 회귀 복구 · afaf8a65 에서 삭제됐던 · shelf_positions 병합 시 매장 필수 검증용
import { getStorageLocations } from "../settings/settings";
// 2026-09-15 · T-SP-BULK · shelf_positions 병합 · 단건/일괄 공용 헬퍼
import {
  mergeShelfPositions,
  checkShelfPositionConflicts,
  fetchProductDisplayLoc,
} from "./inventoryChecksShelfMerge";
import {
  CreateDisplayRequestSchema,
  PrepareDisplayRequestSchema,
  CompleteDisplayRequestSchema,
  PatchDisplayRequestSchema,
} from "../../../src/shared/schemas/displayRequests";

const router = Router();

router.get("/api/requests/pending-counts", asyncHandler(async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  // 2026-08-21 · #171 Phase 2 · return · resignation 추가 (BC · 신규 필드만)
  //   · relation 미존재 시 · count 0 (fallback · 안전)
  // 2026-08-25 · #192 · vendor 승인 대기 (approval_status=pending)
  // 2026-09-01 · fix · Promise.all → Promise.allSettled · 개별 쿼리 실패 · 전체 endpoint 죽지 않게
  //   · Supabase 는 대체로 { data, error } · 하지만 네트워크·서버 예외 시 throw 가능
  //   · allSettled · 각 fulfilled/rejected 개별 처리 · resilient
  const results = await Promise.allSettled([
    supabase.from("display_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("order_requests").select("id", { count: "exact", head: true }).eq("status", "requested"),
    // 2026-09-04 · real_map 제거 · legacy zone_mismatches 테이블만 사용
    supabase.from("zone_mismatches").select("product_code"),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("lunch_requests").select("id", { count: "exact", head: true }).eq("date", today).eq("eating", false),
    supabase.from("inventory_checks").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("return_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("resignation_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // 2026-09-03 · 4-state · requested (승인 요청) · 하위호환 pending 도 포함
    supabase.from("vendors").select("id", { count: "exact", head: true }).in("approval_status", ["requested", "pending"]),
  ]);
  // 2026-09-01 · fix · allSettled 결과 · rejected → 기본값 · fulfilled → 원본
  const unwrap = <T,>(r: PromiseSettledResult<T>): T | { count: number; data: unknown; error: unknown } => {
    if (r.status === "fulfilled") return r.value;
    console.warn("[pending-counts] query rejected:", r.reason);
    return { count: 0, data: [], error: r.reason };
  };
  const [display, order, legacy, leave, lunch, inventory, ret, resignation, vendor] = results.map(unwrap) as any[];
  const mismatchCount = (legacy.data ?? []).length;
  const lunchCount = lunch.count ?? 0;
  const inventoryCount = inventory.count ?? 0;
  const returnCount = ret.error ? 0 : (ret.count ?? 0);
  const resignationCount = resignation.error ? 0 : (resignation.count ?? 0);
  const vendorCount = vendor.error ? 0 : (vendor.count ?? 0);
  res.json({
    display:     display.count ?? 0,
    order:       order.count   ?? 0,
    mismatch:    mismatchCount,
    leave:       leave.count   ?? 0,
    lunch:       lunchCount,
    inventory:   inventoryCount,
    return:      returnCount,
    resignation: resignationCount,
    vendor:      vendorCount,
    total: (display.count ?? 0) + (order.count ?? 0) + mismatchCount
         + (leave.count ?? 0) + inventoryCount + returnCount + resignationCount + vendorCount,
  });
}));

router.get("/api/display-requests", asyncHandler(async (req, res) => {
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
  if (error) throw new HttpError(500, error.message);

  // 2026-08-10 · 사용자 요청 · 각 요청에 product_name 추가 (products JOIN · 프론트 상품명 컬럼용)
  // 2026-09-09 · stale fix · products.display_location · location 도 함께 조회
  //   · 요청 생성 시 zone_label 스냅샷 저장 · 이후 products 변경되면 진열위치 stale
  //   · 프론트에 최신 display_location 을 별도 필드로 전달 · UI 에서 우선 표시
  const rows = data ?? [];
  const productCodes = Array.from(new Set(
    rows.map((r: any) => String(r.product_code ?? "").trim()).filter(Boolean)
  ));
  if (productCodes.length > 0) {
    try {
      // 2026-09-10 · #51 · 사용자 지시 · 진열요청 · 상세위치 (location_detail) 컬럼 추가
      const { data: prods } = await supabase
        .from("products")
        .select("product_code, product_name, spec, display_location, location, location_detail")
        .in("product_code", productCodes);
      const infoMap = new Map<string, { name: string; spec: string | null; display_location: string | null; location: string | null; location_detail: string | null }>();
      for (const p of prods ?? []) {
        const c = String(p.product_code ?? "").trim();
        if (c) infoMap.set(c, {
          name: String(p.product_name ?? ""),
          spec: p.spec ?? null,
          display_location: (p as any).display_location ?? null,
          location: (p as any).location ?? null,
          location_detail: (p as any).location_detail ?? null,
        });
      }
      for (const r of rows as any[]) {
        const c = String(r.product_code ?? "").trim();
        const info = c ? infoMap.get(c) : null;
        r.product_name = info?.name ?? null;
        r.product_spec = info?.spec ?? null;
        // 최신 진열위치 · display_location 우선 · 없으면 location · 없으면 null
        r.product_display_location = info?.display_location ?? info?.location ?? null;
        r.product_location_detail = info?.location_detail ?? null;
      }
    } catch { /* silent · products 조회 실패해도 요청 응답은 반환 */ }
  }
  res.json(rows);
}));

// 2026-08-05 · 상품별 진열요청 (ScanPage 진입점)
// 2026-09-09 · 상품별 dedup · product_code 필수 · 같은 상품 pending 이미 있으면 · request_count 증가 (신규 insert 하지 않음)
//   · zone_id·zone_label 자동 채움 (products.location 기반)
//   · 담당자(assigned_staff) · 최근 요청자로 덮어씀 · first_requested_at 은 유지
router.post("/api/display-requests", authorize(1), validateBody(CreateDisplayRequestSchema), asyncHandler(async (req, res) => {
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

  // 상품 기반 요청: products 에서 location · category · name 자동 조회
  try {
    const { data: prod } = await supabase
      .from("products")
      .select("product_code, product_name, location, display_location, spec, category")
      .eq("product_code", productCode)
      .maybeSingle();
    if (prod) {
      productName = prod.product_name ?? productCode;
      if (!zoneId) zoneId = String((prod as any).location ?? (prod as any).display_location ?? "").trim();
      if (!zoneLabel && zoneId) zoneLabel = zoneId;
      if (!category) category = String(prod.category ?? "");
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
        assignedStaffId = za.employee_id ?? null;
        assignedStaffName = za.employee_name ?? "";
      }
    } catch { /* silent */ }
  }

  const nowIso = b.requested_at ? new Date(b.requested_at).toISOString() : new Date().toISOString();
  const finalNote = note || (productName ? `${productName} 진열 요청` : "");

  // 2026-09-09 · dedup · 기존 pending 있으면 · request_count++ · 최근 요청자·요청일 갱신
  const { data: existing } = await supabase
    .from("display_requests")
    .select("id, request_count")
    .eq("product_code", productCode)
    .eq("status", "pending")
    .maybeSingle();

  let recordId: string | null = null;
  let isRecount = false;
  let currentCount = 1;

  if (existing) {
    isRecount = true;
    currentCount = (Number((existing as any).request_count) || 1) + 1;
    const { data: updated, error } = await supabase
      .from("display_requests")
      .update({
        request_count: currentCount,
        requested_at: nowIso,
        assigned_staff_id: assignedStaffId,
        assigned_staff_name: assignedStaffName,
        zone_id: zoneId,
        zone_label: zoneLabel,
        category,
        note: finalNote,
      })
      .eq("id", (existing as any).id)
      .select("id").single();
    if (error) throw new HttpError(500, error.message);
    recordId = (updated as any)?.id ?? (existing as any).id;
  } else {
    const { data: inserted, error } = await supabase
      .from("display_requests")
      .insert([{
        zone_id: zoneId,
        zone_label: zoneLabel,
        category,
        requested_at: nowIso,
        first_requested_at: nowIso,
        request_count: 1,
        assigned_staff_id: assignedStaffId,
        assigned_staff_name: assignedStaffName,
        note: finalNote,
        status: "pending",
        product_code: productCode,
      }])
      .select("id").single();
    if (error) throw new HttpError(500, error.message);
    recordId = (inserted as any)?.id ?? null;
  }

  // 2026-08-05 · 신규 3단계 워크플로우 · pending 시 창고담당 전원 알림
  //   · position ∈ {"창고", "물류"} 인 직원 전체
  //   · assigned_staff_id (진열담당) 는 prepared 단계에서 알림 받음 (여기서는 참조만)
  //   · 하위 호환 · assigned_staff_id 만 있고 창고담당 없으면 · 기존처럼 assigned 에게 알림 (zone-only 구 방식)
  (async () => {
    try {
      // 2026-09-09 · 재요청(dedup)이면 · 요청 횟수 표시 · 창고담당 인지 유지
      const title = isRecount ? "🛒 진열 보충 재요청" : "🛒 진열 보충 요청";
      const productLabel = productName ? `${productName} · ` : "";
      const zoneLabelStr = zoneLabel ? `"${zoneLabel}"` : (zoneId ? `"${zoneId}"` : "");
      const countSuffix = isRecount ? ` · 누적 ${currentCount}회` : "";
      const bodyText = `${productLabel}${zoneLabelStr}${category ? ` (${category})` : ""} 진열 보충 요청${note ? ` · ${note}` : ""}${countSuffix}`;
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
      const tagBase = `disp-req-${recordId ?? Date.now()}`;
      const notifiedIds = new Set<number>();
      // 1) 창고담당 (position ∈ 창고/물류) 전원 알림
      if (warehouseStaff && warehouseStaff.length > 0) {
        await Promise.allSettled(warehouseStaff.map(emp => {
          notifiedIds.add((emp as any).id);
          return notifyEmp(emp as any, `${tagBase}-wh-${emp.id}`);
        }));
      } else if (assignedStaffId) {
        // 창고담당 없으면 · 기존 방식 (진열담당 자체) 알림 (하위호환)
        const { data: emp } = await supabase
          .from("employees").select("id, name, push_subscription").eq("id", assignedStaffId).maybeSingle();
        if (emp) {
          notifiedIds.add((emp as any).id);
          await notifyEmp(emp as any, `${tagBase}-fallback`);
        }
      }
      // 2) T-SCAN-1 (2026-08-05) · 관리자 (auth_level ≥ 8) 전원 알림 (사용자 요구)
      //    · 창고담당·진열담당과 별개로 · 요청 발생 시각을 관리자에게 통지
      //    · 이미 알림 받은 사람 skip (중복 방지)
      try {
        const { data: admins } = await supabase
          .from("employees")
          .select("id, name, push_subscription")
          .gte("level", 9);
        if (admins && admins.length > 0) {
          const targetAdmins = admins.filter(a => !notifiedIds.has((a as any).id));
          if (targetAdmins.length > 0) {
            await Promise.allSettled(targetAdmins.map(a =>
              notifyEmp(a as any, `${tagBase}-admin-${(a as any).id}`)
            ));
          }
        }
      } catch (e: any) {
        console.warn("[display-request] 관리자 알림 실패:", e?.message);
      }
    } catch (e: any) {
      console.warn("[display-request] 알림 예외:", e?.message);
    }
  })();

  res.json({ ok: true, id: recordId, request_count: currentCount, recount: isRecount });
}));

// 2026-08-05 · Phase 1 · 창고담당 pending ↔ prepared 토글
//   · pending → prepared (준비 완료)
//   · prepared → pending (되돌리기 · 토글)
router.patch("/api/display-requests/:id/prepare", authorize(3), validateBody(PrepareDisplayRequestSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const preparedById = b.prepared_by ? Number(b.prepared_by) : null;
  const preparedByName = String(b.prepared_by_name ?? "");
  const now = new Date().toISOString();
  const { data: cur } = await supabase.from("display_requests").select("id, status, assigned_staff_id, assigned_staff_name, zone_label, note, product_code").eq("id", req.params.id).maybeSingle();
  if (!cur) throw notFound("요청을 찾을 수 없습니다");

  // 토글: prepared 면 pending 으로 되돌리기 · pending 이면 prepared 로 전진
  //   · done 은 완료 상태 · 토글 X (완료 버튼에서 별도 처리)
  const currentStatus = (cur as any).status;
  if (currentStatus === "prepared") {
    // 되돌리기 · prepared → pending · 준비자 정보 제거
    const { error } = await supabase.from("display_requests").update({
      status: "pending",
      prepared_at: null,
      prepared_by: null,
      prepared_by_name: null,
    }).eq("id", req.params.id);
    if (error) throw new HttpError(500, error.message);
    return res.json({ ok: true, action: "reverted", status: "pending" });
  }
  if (currentStatus !== "pending") {
    throw badRequest(`현재 상태 "${currentStatus}" · pending/prepared 만 토글 가능`);
  }
  const { error } = await supabase.from("display_requests").update({
    status: "prepared",
    prepared_at: now,
    prepared_by: preparedById,
    prepared_by_name: preparedByName,
  }).eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);

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
}));

// 2026-08-05 · Phase 1 · 진열담당 prepared/pending ↔ done 토글
//   · pending or prepared → done (진열 완료)
//   · done → prepared (되돌리기 · 토글 · 완료자 정보 제거)
router.patch("/api/display-requests/:id/complete", authorize(3), validateBody(CompleteDisplayRequestSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const completedById = b.completed_by ? Number(b.completed_by) : null;
  const completedByName = String(b.completed_by_name ?? "");
  const now = new Date().toISOString();
  const { data: cur } = await supabase.from("display_requests").select("id, status, zone_label, prepared_by").eq("id", req.params.id).maybeSingle();
  if (!cur) throw notFound("요청을 찾을 수 없습니다");
  const currentStatus = (cur as any).status;

  // 토글: done 이면 prepared 로 되돌리기 (완료자 정보 제거)
  //   · 창고 준비 기록이 있으면 prepared 로 · 없으면 pending 으로
  if (currentStatus === "done") {
    const hadPrepare = (cur as any).prepared_by != null;
    const { error } = await supabase.from("display_requests").update({
      status: hadPrepare ? "prepared" : "pending",
      completed_at: null,
      completed_by: null,
      completed_by_name: null,
    }).eq("id", req.params.id);
    if (error) throw new HttpError(500, error.message);
    return res.json({ ok: true, action: "reverted", status: hadPrepare ? "prepared" : "pending" });
  }

  if (!["pending", "prepared"].includes(currentStatus)) {
    throw badRequest(`현재 상태 "${currentStatus}" · 완료 처리 불가`);
  }
  const { error } = await supabase.from("display_requests").update({
    status: "done",
    completed_at: now,
    completed_by: completedById,
    completed_by_name: completedByName,
  }).eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);

  // 관리자 (level ≥ 8) 알림 (기존 로직 · auth_level 기준)
  (async () => {
    try {
      const { data: admins } = await supabase
        .from("employees").select("id, push_subscription").gte("level", 9);
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
}));

// 하위 호환 · 기존 클라이언트 (status 만 업데이트) 지원 · pending/prepared/done 모두 허용
router.patch("/api/display-requests/:id", authorize(3), validateBody(PatchDisplayRequestSchema), asyncHandler(async (req, res) => {
  const { status, zone_label, assigned_staff_name } = req.body;
  const { error } = await supabase.from("display_requests").update({ status }).eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);

  if (status === "done") {
    const { data: admins } = await supabase
      .from("employees").select("id, push_subscription").gte("level", 9);
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
}));

router.delete("/api/display-requests/:id", authorize(2), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("display_requests").delete().eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

router.get("/api/order-requests", asyncHandler(async (req, res) => {
  // 2026-09-13 · #115 · 대원칙 · 발주 관련 · 캐시 X · 즉시 업데이트
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  // 2026-09-02 · 사용자 지시 · 발주 완료 (status='ordered') 는 리스트에서 제외
  //   · 기본 · status='requested' 만 반환 · 발주요청 대기 목록
  //   · ?status=all · 모든 상태 반환 · ?status=xxx · 특정 상태 필터
  const statusFilter = String(req.query.status ?? "requested").trim();
  // 2026-09-09 · optimal_stock 스냅샷 제거 · products.optimal_stock JOIN · 사용자 지시 대원칙
  // 2026-09-10 · 사용자 지시 · order_qty 반환 · 발주필요→발주요청 수량 이동
  let q = supabase.from("order_requests").select("id, product_code, product_name, current_stock, order_qty, note, requested_at, status, supplier").order("requested_at", { ascending: false });
  if (req.query.product_code) q = q.eq("product_code", String(req.query.product_code));
  if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  // 2026-09-09 · products JOIN · 최신 optimal_stock 병합
  const rows = data ?? [];
  const codes = Array.from(new Set(rows.map((r: any) => String(r.product_code ?? "").trim()).filter(Boolean)));
  if (codes.length > 0) {
    try {
      const { data: prods } = await supabase.from("products").select("product_code, optimal_stock").in("product_code", codes);
      const optMap = new Map<string, number | null>();
      for (const p of prods ?? []) {
        const opt = (p as any).optimal_stock;
        optMap.set(String((p as any).product_code ?? "").trim(), opt != null ? Number(opt) : null);
      }
      for (const r of rows as any[]) {
        r.optimal_stock = optMap.get(String(r.product_code ?? "").trim()) ?? null;
      }
    } catch { /* silent · products 조회 실패 시 · optimal_stock null */ }
  }
  res.json(rows);
}));

router.post("/api/order-requests", authorize(1), validateBody(CreateOrderRequestSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = b.product_code;
  const now = new Date().toISOString();
  // 2026-09-02 · 사용자 지시 · '발주필요요청 눌러도 발주요청에 안 들어감' fix
  //   · 원인 · 기존 row (ordered 상태) 존재 시 · status 유지 · 리스트 필터 (status=requested) 통과 X
  //   · 이후 · status='requested' 로 리셋 · sent_at·order_number 초기화 · 재요청 flow
  // 2026-09-07 · 사용자 지시 · supplier 필드 반영 (신규·기존 모두 · null 이면 유지)
  const supplierVal = b.supplier != null && String(b.supplier).trim() !== ""
    ? String(b.supplier).trim()
    : null;
  // 2026-09-11 · #63 · 사용자 지시 · 공급사 · vendors 유효성 검증 (자유 입력 금지)
  //   · 발주요청 · supplier 값 있으면 · vendors.company_name 정확 매칭 필수
  if (supplierVal) {
    const { data: matched } = await supabase
      .from("vendors")
      .select("company_name")
      .eq("company_name", supplierVal)
      .maybeSingle();
    if (!matched) {
      throw new HttpError(400, `공급사 "${supplierVal}" 는 등록된 공급사 목록에 없습니다. 공급사 관리에서 먼저 등록해주세요.`, "SUPPLIER_NOT_FOUND");
    }
  }
  // 2026-09-09 · optimal_stock 스냅샷 제거 · products.optimal_stock 단일 소스 (사용자 지시)
  //   · payload 에서 optimal_stock 저장 안 함 · GET 시 · products JOIN 으로 최신값 표시
  const basePayload: Record<string, any> = {
    current_stock: b.current_stock != null ? Number(b.current_stock) : null,
    note: String(b.note ?? ""),
    requested_at: now,
    status: "requested",
    sent_at: null,
    order_number: null,
  };
  if (supplierVal) basePayload.supplier = supplierVal;
  // 2026-09-10 · 사용자 지시 · 발주필요에서 지정한 수량 · 발주요청에 그대로 저장
  if (b.order_qty != null) basePayload.order_qty = Number(b.order_qty);
  const { data: existing } = await supabase.from("order_requests").select("id, status").eq("product_code", code).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("order_requests").update(basePayload).eq("id", existing.id);
    if (error) throw new HttpError(500, error.message);
    return res.json({ ok: true, updated: true, id: existing.id, prevStatus: existing.status });
  }
  const { data, error } = await supabase.from("order_requests").insert([{
    product_code: code,
    product_name: String(b.product_name ?? ""),
    ...basePayload,
  }]).select("id").single();
  if (error) throw new HttpError(500, error.message);
  // 2026-08-13 · #107 · 신규 발주요청 · 관리자 알림
  notificationsService.notifyAllAdmins({
    title: "📦 발주 요청",
    body: `${b.product_name ?? code} · 발주 요청 추가됨.`,
    type: "info",
    push: { url: "/", tag: `order-req-${data?.id ?? code}` },
  }).catch(() => null);
  res.json({ ok: true, updated: false, id: data?.id });
}));

// 2026-08-10 · #15 · 발주이력 조회 · status='ordered' · order_number 로 GROUP
//   마이그레이션 add_order_dispatch_columns_2026-08-10.sql 실행 후 활성
//   컬럼 없으면 gracefully empty 반환
router.get("/api/order-history", asyncHandler(async (req, res) => {
  // 2026-09-13 · #115 · 대원칙 · 발주 관련 · 캐시 X · 즉시 업데이트 (기존 에러 케이스에만 있던 것을 함수 시작으로 이동)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const days = Math.max(1, Math.min(365, parseInt(String(req.query.days ?? "90")) || 90));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const supplier = String(req.query.supplier ?? "").trim();

  // 2026-09-09 · optimal_stock 스냅샷 제거 · products.optimal_stock 단일 소스
  // 2026-09-13 · #117 · status='ordered' + 'matched' 둘 다 이력에 표시 (매입확인 후에도 이력 보임)
  let q = supabase
    .from("order_requests")
    .select("id, order_number, order_date, desired_arrival, supplier, supplier_contact, supplier_email, supplier_phone, product_code, product_name, current_stock, order_qty, unit_price, memo, sent_at, note, status")
    .in("status", ["ordered", "matched"])
    .gte("sent_at", since)
    .order("sent_at", { ascending: false });
  if (supplier) q = q.eq("supplier", supplier);
  const { data, error } = await q;
  if (error) {
    // 컬럼 없음 (마이그레이션 미실행) · gracefully empty
    if (/column|does not exist|status/i.test(error.message)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.json({ orders: [], notice: "마이그레이션 필요: add_order_dispatch_columns_2026-08-10.sql" });
    }
    throw new HttpError(500, error.message);
  }
  // order_number 로 GROUP · 발주서 단위
  const grouped = new Map<string, any>();
  for (const row of (data ?? []) as any[]) {
    const key = String(row.order_number ?? row.id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        order_number: row.order_number,
        order_date: row.order_date,
        desired_arrival: row.desired_arrival,
        supplier: row.supplier,
        supplier_contact: row.supplier_contact,
        supplier_email: row.supplier_email,
        supplier_phone: row.supplier_phone,
        memo: row.memo,
        sent_at: row.sent_at,
        // 2026-09-13 · #117 · status · order_number 그룹의 상태 · 'matched' or 'ordered'
        //   · 여러 라인 중 · 모두 'matched' 면 · 'matched' · 하나라도 'ordered' 면 · 'ordered'
        status: row.status ?? "ordered",
        items: [],
        total_qty: 0,
        total_amount: 0,
      });
    } else {
      // 상태 병합 · 하나라도 ordered 면 · ordered (미매칭 우선)
      const g = grouped.get(key);
      if (row.status === "ordered") g.status = "ordered";
    }
    const g = grouped.get(key);
    const qty = Number(row.order_qty ?? 0);
    const price = Number(row.unit_price ?? 0);
    g.items.push({
      id: row.id,
      product_code: row.product_code,
      product_name: row.product_name,
      order_qty: qty,
      unit_price: price,
      line_amount: qty * price,
      current_stock: row.current_stock,
      // 2026-09-09 · optimal_stock · products JOIN 결과 병합 (아래 loop 후)
    });
    g.total_qty += qty;
    g.total_amount += qty * price;
  }
  // 2026-09-09 · products.optimal_stock 병합 · 발주 이력에도 최신값 표시 (재계산 변동 감수)
  const allCodes = new Set<string>();
  for (const g of grouped.values()) for (const it of g.items) if (it.product_code) allCodes.add(String(it.product_code));
  if (allCodes.size > 0) {
    try {
      const { data: prods } = await supabase.from("products").select("product_code, optimal_stock").in("product_code", [...allCodes]);
      const optMap = new Map<string, number | null>();
      for (const p of prods ?? []) {
        const opt = (p as any).optimal_stock;
        optMap.set(String((p as any).product_code ?? "").trim(), opt != null ? Number(opt) : null);
      }
      for (const g of grouped.values()) {
        for (const it of g.items) {
          it.optimal_stock = optMap.get(String(it.product_code ?? "").trim()) ?? null;
        }
      }
    } catch { /* silent · products 조회 실패 시 · optimal_stock null */ }
  }
  const orders = [...grouped.values()].sort((a, b) => String(b.sent_at ?? "").localeCompare(String(a.sent_at ?? "")));
  // 2026-09-11 · #126 · 사용자 지시 · 발주이력 · 캐시 X · 즉시 DB
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res.json({ orders, count: orders.length });
}));

router.delete("/api/order-requests/:id", authorize(2), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("order_requests").delete().eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// 2026-09-13 · #117 · 발주이력 · [매입확인] 버튼 · order_number 단위 · status='matched'
//   · order_requests · order_number 로 GROUP된 모든 행 · status='matched' 로 업데이트
//   · 발주-매입 매칭 확인 · 이력 리스트에는 유지 · UI 배지로 구분
router.patch("/api/order-history/:orderNumber/match", authorize(2), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const orderNumber = String(req.params.orderNumber ?? "").trim();
  if (!orderNumber) throw badRequest("order_number 필수");
  const { data, error } = await supabase
    .from("order_requests")
    .update({ status: "matched" })
    .eq("order_number", orderNumber)
    .eq("status", "ordered")
    .select("id");
  if (error) throw new HttpError(500, error.message);
  const count = (data ?? []).length;
  if (count === 0) throw new HttpError(404, "해당 발주번호의 ordered 상태 항목 없음");
  console.log(`[ORDER MATCH] order_number=${orderNumber} · ${count}건 · status='matched'`);
  res.json({ ok: true, count, order_number: orderNumber });
}));

// ── 발주서 일괄/개별 발송 ─────────────────────────────────────────────────────
// 공급사별로 그룹핑된 발주 항목을 받아 이메일/문자 발송 시도.
// 실제 SMTP·SMS gateway 설정이 없으면 로그만 남기고 "미구성" 상태 반환.
// order_dispatches 테이블에 발송 기록 저장 (없으면 로그로 대체)
router.post("/api/order-requests/bulk-send", authorize(1), validateBody(BulkSendOrderSchema), asyncHandler(async (req, res) => {
  const {
    order_number,
    order_date,
    desired_arrival,
    memo,
    channels,
    bySupplier,
  } = req.body;

  if (!Array.isArray(bySupplier) || bySupplier.length === 0) {
    throw badRequest("bySupplier가 비어있습니다.");
  }

  const results: any[] = [];
  const now = new Date().toISOString();

  // 2026-09-08 · 사용자 지시 · 이메일 발주서 발주처 정보
  //   · 약국명 (company_info.name) · 담당자 (로그인 직원) · 연락처 (약국 + 담당자 개인 둘 다)
  const session = getSession(req);
  let issuer: {
    name: string;
    contactName: string;
    orgPhone: string;
    personPhone: string;
  } = { name: "약국", contactName: "", orgPhone: "", personPhone: "" };
  try {
    const { data: ciRow } = await supabase.from("app_settings").select("value").eq("key", "company_info").maybeSingle();
    const ci = ciRow?.value as any;
    if (ci && typeof ci === "object") {
      issuer.name = String(ci.name ?? "약국").trim() || "약국";
      issuer.orgPhone = String(ci.phone ?? "").trim();
    }
  } catch { /* silent · fallback default */ }
  if (session) {
    issuer.contactName = String(session.name ?? "").trim();
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("phone")
        .eq("id", session.sub)
        .maybeSingle();
      issuer.personPhone = String(emp?.phone ?? "").trim();
    } catch { /* silent · 담당자 개인 연락처 없으면 · 약국 대표만 표시 */ }
  }

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
      channels: JSON.stringify({ email: !!channels.email, sms: !!channels.sms, kakao: !!channels.kakao }),
      items: JSON.stringify(items),
      dispatched_at: now,
      status: "pending",
    };

    // 채널별 발송 시도 (환경변수 기반 · 없으면 "미구성" 상태)
    const outcomes: string[] = [];
    if (channels.email) {
      if (!targetEmail) {
        outcomes.push("email:no_recipient");
        dispatch.email_status = "no_recipient";
      } else if (!process.env.SMTP_HOST) {
        outcomes.push("email:no_smtp_env");
        dispatch.email_status = "no_smtp_env";
      } else {
        // 2026-09-02 · 사용자 지시 · 이메일 실제 발송 (nodemailer 설치 완료)
        //   · env · SMTP_HOST · SMTP_PORT (default 587) · SMTP_USER · SMTP_PASS · SMTP_FROM
        //   · TLS/STARTTLS 자동 (port 465 = TLS · 그 외 = STARTTLS)
        // 2026-09-08 · fix · package.json "type":"module" (ESM) 환경 · require 는 ReferenceError
        //   · 이전 · require("nodemailer") → 실제 발송 시 crash → outcome=email:error → 사용자 · 발송 실패
        //   · 이후 · await import("nodemailer") · settings/test 엔드포인트와 동일 ESM 방식
        try {
          const nodemailerMod = await import("nodemailer");
          const nodemailer = (nodemailerMod as any).default ?? nodemailerMod;
          const port = Number(process.env.SMTP_PORT ?? 587);
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: process.env.SMTP_USER ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS ?? "",
            } : undefined,
          });
          // 2026-09-11 · #114 · 사용자 지시 · 예쁘게 · 단가·소계·현재고 등 · 정확 표시 · 통화 포맷
          const fmtWon = (n: any) => {
            const v = Number(n);
            if (!Number.isFinite(v) || v === 0) return "-";
            return v.toLocaleString("ko-KR") + "원";
          };
          const fmtQty = (n: any) => {
            const v = Number(n);
            return Number.isFinite(v) ? v.toLocaleString("ko-KR") : "-";
          };
          let grandTotal = 0;
          // 2026-09-11 · 사용자 지시 · 핸드폰 가독성 · 상품코드 아래 · 상품명 줄바꿈 · 상품 셀 통합
          const itemsHtml = items.map((it: any, idx: number) => {
            const qty = Number(it.order_qty ?? 0);
            const price = Number(it.unit_price ?? 0);
            const lineAmt = qty > 0 && price > 0 ? qty * price : 0;
            grandTotal += lineAmt;
            return `<tr style="border-bottom:1px solid #e2e8f0">
              <td style="padding:10px 12px;font-size:13px;color:#64748b;text-align:center;vertical-align:top">${idx + 1}</td>
              <td style="padding:10px 12px;vertical-align:top">
                <div style="font-size:12px;color:#64748b;font-family:monospace;letter-spacing:0.02em">${it.product_code ?? ""}</div>
                <div style="font-size:14px;color:#0f172a;font-weight:700;margin-top:3px;line-height:1.35">${it.product_name ?? ""}</div>
              </td>
              <td style="padding:10px 12px;text-align:right;font-size:14px;color:#0f172a;font-weight:700;vertical-align:top;white-space:nowrap">${fmtQty(qty)}</td>
              <td style="padding:10px 12px;text-align:right;font-size:13px;color:#475569;vertical-align:top;white-space:nowrap">${fmtWon(price)}</td>
              <td style="padding:10px 12px;text-align:right;font-size:14px;color:#0A2E4A;font-weight:700;vertical-align:top;white-space:nowrap">${fmtWon(lineAmt)}</td>
            </tr>`;
          }).join("");
          const subject = `[발주서] ${supName} · ${order_number}`;
          // 2026-09-03 · 한글 인코딩 fix · <meta charset=utf-8> 명시
          //   · 일부 이메일 클라이언트 (Outlook 구버전 등) 는 charset 미명시 시 · CP949 로 해석 · 한글 깨짐
          //   · nodemailer 는 Content-Type charset=utf-8 자동이지만 · HTML body 내부에도 명시하는 게 안전
          // 2026-09-08 · 사용자 지시 · 발주처 정보 (약국명 · 담당자=로그인 직원 · 연락처=약국+담당자 둘 다)
          const issuerBlock = `
            <div style="margin-top:12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
              <div style="font-size:12px;color:#64748b;font-weight:700;letter-spacing:0.05em;margin-bottom:4px">발주처</div>
              <div style="font-size:15px;font-weight:700;color:#0A2E4A">${issuer.name}</div>
              ${issuer.contactName ? `<div style="font-size:13px;color:#334155;margin-top:2px">담당자 · ${issuer.contactName}</div>` : ""}
              ${issuer.orgPhone ? `<div style="font-size:13px;color:#334155;margin-top:2px">약국 · ${issuer.orgPhone}</div>` : ""}
              ${issuer.personPhone ? `<div style="font-size:13px;color:#334155;margin-top:2px">담당자 연락처 · ${issuer.personPhone}</div>` : ""}
            </div>`;
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f1f5f9">
            <div style="max-width:720px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
              <div style="background:linear-gradient(135deg,#0A2E4A 0%,#1e40af 100%);padding:24px;color:#ffffff">
                <div style="font-size:12px;letter-spacing:0.2em;opacity:0.75;font-weight:600">PURCHASE ORDER · 발주서</div>
                <div style="font-size:24px;font-weight:800;margin-top:4px">${supName}</div>
                <div style="font-size:13px;margin-top:6px;opacity:0.9;font-family:monospace">${order_number}</div>
              </div>
              <div style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:32px;flex-wrap:wrap">
                <div>
                  <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">발주일</div>
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px">${order_date ?? new Date().toISOString().slice(0,10)}</div>
                </div>
                <div>
                  <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">희망 입고일</div>
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px">${desired_arrival ?? "-"}</div>
                </div>
                <div>
                  <div style="font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">품목 수</div>
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px">${items.length}건</div>
                </div>
              </div>
              <div style="padding:20px 24px">${issuerBlock}</div>
              <div style="padding:0 24px 20px">
                <table style="border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                  <thead style="background:#f1f5f9">
                    <tr>
                      <th style="padding:10px 12px;text-align:center;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.05em">#</th>
                      <th style="padding:10px 12px;text-align:left;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.05em">상품</th>
                      <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.05em">수량</th>
                      <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.05em">단가</th>
                      <th style="padding:10px 12px;text-align:right;font-size:12px;color:#475569;font-weight:700;letter-spacing:0.05em">소계</th>
                    </tr>
                  </thead>
                  <tbody>${itemsHtml}</tbody>
                  <tfoot>
                    <tr style="background:#f8fafc">
                      <td colspan="4" style="padding:12px;text-align:right;font-size:13px;color:#475569;font-weight:700">합계</td>
                      <td style="padding:12px;text-align:right;font-size:16px;color:#0A2E4A;font-weight:800">${fmtWon(grandTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              ${memo ? `<div style="padding:0 24px 20px"><div style="padding:12px 16px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:6px;font-size:13px;color:#78350f"><b>메모</b> · ${memo}</div></div>` : ""}
              <p style="margin-top:16px;color:#888;font-size:12px">본 메일은 자동 발송되었습니다.</p>
            </div>
          </body></html>`;
          await transporter.sendMail({
            from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
            to: targetEmail,
            subject,
            html,
            textEncoding: "base64", // 한글 헤더 (Subject) · MIME word encoding 강제 · 클라이언트 호환성
          });
          outcomes.push("email:sent");
          dispatch.email_status = "sent";
        } catch (e: any) {
          console.error("[bulk-send] email 발송 실패:", e?.message);
          outcomes.push(`email:error(${e?.message ?? "unknown"})`);
          dispatch.email_status = "error";
        }
      }
    }
    if (channels.sms) {
      // 2026-09-09 · 개발중 · 사업자등록증 승인 · SMS 게이트웨이 계약 후 · 실제 발송 활성화 예정
      //   · 지금은 · env·게이트웨이 미설치 · outcomes 에 skip 명시 · 프론트 UI 도 disabled 처리
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
    // 2026-08-10 · #28 · 카카오톡 알림톡 (SolAPI · env·템플릿·인증 대기)
    // 2026-09-09 · 개발중 · 사업자등록증 승인 · SolAPI 계정·템플릿 인증 후 · 실제 발송 활성화 예정
    //   · 지금은 · getSolApiStatus() · sendAlimtalk 스텁 유지 · 프론트 UI 도 disabled 처리
    if (channels.kakao) {
      if (!targetPhone) {
        outcomes.push("kakao:no_recipient");
        dispatch.kakao_status = "no_recipient";
      } else {
        try {
          const { getSolApiStatus } = await import("../../lib/notification/solapiClient.js");
          const solStatus = getSolApiStatus();
          if (!solStatus.configured) {
            outcomes.push(`kakao:no_env(${solStatus.missing.join(",")})`);
            dispatch.kakao_status = "no_env";
          } else if (!process.env.SOLAPI_KAKAO_TEMPLATE_ORDER) {
            outcomes.push("kakao:no_template");
            dispatch.kakao_status = "no_template";
          } else {
            // 실제 발송 · 템플릿 있으면 sendAlimtalk 호출
            outcomes.push("kakao:skipped(template-not-verified)");
            dispatch.kakao_status = "template_pending";
          }
        } catch (e: any) {
          outcomes.push(`kakao:error(${e?.message ?? "unknown"})`);
          dispatch.kakao_status = "error";
        }
      }
    }

    dispatch.status = outcomes.some(o => /:sent$/.test(o) || /skipped\(/.test(o)) ? "sent" : "dry_run";

    // 2026-09-05 · 사용자 지시 · 실제 전송이 없으면(no_recipient 등) ordered 로 마킹하지 않음
    //   · 발송 채널 미선택(no_channel) = 의도적 DB 저장 → ordered 허용
    //   · 채널 선택 + 적어도 1채널 :sent → ordered 허용
    //   · 채널 선택 + 전부 no_recipient/no_env 등 → ordered 금지 · 발주요청에 그대로 남겨야 함
    // 2026-09-11 · #113 · 사용자 신고 fix · 발주는 됐는데 이력에 안 남음
    //   · 원인 · line 862 · dispatch.status='sent' 는 `skipped()` 도 포함 (line 862 outcomes.some 매치 조건 · sent OR skipped)
    //   · 하지만 · anySentForSupplier 는 · :sent 만 · skipped 제외 → 미스매치 → dispatch=sent 인데 status=requested 유지
    //   · fix · dispatch.status==='sent' 이면 · order_requests.status='ordered' 마킹 (일관성)
    const noChannels = !channels.email && !channels.sms && !channels.kakao;
    const anySentForSupplier = outcomes.some(o => /:sent$/.test(o));
    const dispatchSent = dispatch.status === "sent";
    const shouldMarkOrdered = noChannels || anySentForSupplier || dispatchSent;

    const requestIds: string[] = items
      .map((it: any) => it.order_request_id)
      .filter((id: any) => id != null && id !== "")
      .map((id: any) => String(id));
    // 2026-09-08 · 사용자 지시 · RPC → 직접 쿼리 (LIMIT 1000 이슈 · 유지보수)
    //   bulk_send_order_requests RPC 제거 · 직접 UPDATE 사용
    //   이전 fallback 로직(#77/#79)과 동일 동작 · RPC 분기 제거
    if (requestIds.length > 0 && shouldMarkOrdered) {
      try {
        const { error: updErr } = await supabase
          .from("order_requests")
          .update({ status: "ordered", sent_at: now })
          .in("id", requestIds);
        if (updErr && !/column|does not exist/i.test(updErr.message)) {
          console.error(`[bulk-send] status UPDATE 실패 (${supName}): ${updErr.message}`);
          throw new HttpError(500, `발주 상태 업데이트 실패: ${updErr.message}`);
        }
        // 아이템별 order_qty·unit_price 및 공통 메타 · 개별 UPDATE
        for (const it of items) {
          if (it.order_request_id == null) continue;
          const { error: metaErr } = await supabase
            .from("order_requests")
            .update({
              order_number,
              supplier: supName,
              supplier_contact: targetName,
              supplier_email: targetEmail,
              supplier_phone: targetPhone,
              order_date: order_date ?? now.slice(0, 10),
              desired_arrival: desired_arrival ?? null,
              memo: memo ?? null,
              order_qty: it.order_qty ?? null,
              unit_price: it.unit_price ?? null,
            })
            .eq("id", it.order_request_id);
          if (metaErr && !/column|does not exist/i.test(metaErr.message)) {
            console.warn(`[bulk-send] 메타 UPDATE 실패 (id=${it.order_request_id}): ${metaErr.message}`);
          }
        }
        console.log(`[bulk-send] UPDATE 완료 (${supName}) · ${requestIds.length}건 status=ordered + 메타`);
      } catch (e: any) {
        if (e instanceof HttpError) throw e;
        console.warn(`[bulk-send] UPDATE 예외 (${supName}): ${e?.message}`);
      }
    }

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

  // 2026-08-13 · #107 · 일괄 발주 발송 · 관리자 알림
  // 2026-09-05 · 사용자 지시 · 실제 전송 없으면 알림 미발송
  const anyRealSent = results.some(r => r.outcomes.some((o: string) => /:sent$/.test(o)));
  const noChannelsSend = !channels.email && !channels.sms && !channels.kakao;
  if (anyRealSent || noChannelsSend) {
    notificationsService.notifyAllAdmins({
      title: "🚚 발주 발송",
      body: `${results.length}개 공급사 · ${totalItems}건 발주 발송됨. (${channels.email ? "이메일 " : ""}${channels.sms ? "문자 " : ""}${channels.kakao ? "카톡" : ""})`,
      type: "success",
      push: { url: "/", tag: `bulk-send-${order_number ?? Date.now()}` },
    }).catch(() => null);
  }

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
}));

// ── 실재고 점검 ──────────────────────────────────────────────────────────────

router.get("/api/inventory-checks", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  // 2026-08-05 · T-PERF-1a · select("*") → 명시적 컬럼 지정 (페이로드 최소화)
  //   StockReconciliationTab 사용 컬럼: product_code, product_name, checked_at, checked_by
  //   + 실재고 컬럼 전체 (warehouse1/2, store1/2/3, 레거시)
  // 2026-09-14 · 컬럼명 통일 rename · store_stock → store1_stock · store_stock_2 → store2_stock
  //   · 스키마 · warehouse1_stock · warehouse2_stock · store1_stock · store2_stock · store3_stock
  //   · 응답에서 · 하위호환 위해 store_stock/store_stock_2 도 alias 로 함께 노출
  // 2026-09-09 · CRITICAL 회귀 복구 · afaf8a65 에서 삭제됐던 shelf_positions 컬럼 재추가
  const COLS = [
    "id", "product_code", "product_name", "checked_at", "checked_by",
    "warehouse1_stock", "warehouse2_stock",
    "store1_stock", "store2_stock", "store3_stock",
    "store1_zone", "store2_zone", "store3_zone",
    // 2026-09-09 · optimal_stock 스냅샷 제거 · products.optimal_stock 단일 소스 (사용자 지시)
    "system_stock", "status", "note",
    "shelf_positions",
  ].join(", ");
  let q = supabase.from("inventory_checks").select(COLS).order("checked_at", { ascending: false });
  if (req.query.product_code) q = q.eq("product_code", String(req.query.product_code));
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  // 2026-09-14 · 하위호환 alias · store_stock (=store1_stock) · store_stock_2 (=store2_stock)
  //   · 이전 클라이언트 코드 회귀 방지
  const withAlias = (data ?? []).map((r: any) => ({
    ...r,
    store_stock: r.store1_stock,
    store_stock_2: r.store2_stock,
  }));
  res.json(withAlias);
}));

// 2026-09-08 · 상세 진열위치 중복 실시간 검증
//   · UI ShelfPositionInput · 값 입력 중 debounce 500ms 조회
//   · 규칙 · (storage_key, display_location, detail_3digit) 3중 유일
//   · GET /api/inventory-checks/shelf-conflict
//     query · display_location · key (storage code · store1·warehouse1 등) · value (3자리) · exclude (자기 자신 product_code)
//     응답 · { conflict: boolean, product_code?, product_name? }
// 2026-09-09 · afaf8a65 에서 실수 삭제된 endpoint 복구
router.get("/api/inventory-checks/shelf-conflict", asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const display_location = String(req.query.display_location ?? "").trim();
  const key = String(req.query.key ?? "").trim();
  const value = String(req.query.value ?? "").trim().toUpperCase();
  const exclude = String(req.query.exclude ?? "").trim();
  if (!display_location || !key || !value) {
    return res.json({ conflict: false });
  }
  if (!/^[0-9A-Z]{3}$/.test(value)) {
    return res.json({ conflict: false });
  }
  try {
    // JSONB path 조회 · shelf_positions->>key = value · exclude 자신
    let q = supabase
      .from("inventory_checks")
      .select("product_code")
      .filter("shelf_positions->>" + key, "eq", value);
    if (exclude) q = q.neq("product_code", exclude);
    const { data: candidates } = await q;
    if (!candidates || candidates.length === 0) return res.json({ conflict: false });

    // 각 후보 · display_location 확인 · 동일하면 진짜 중복
    const codes = candidates.map(c => String((c as any).product_code));
    const { data: prods } = await supabase
      .from("products")
      .select("product_code, product_name, display_location, location")
      .in("product_code", codes);
    const dup = (prods ?? []).find(p => {
      const loc = (p as any).display_location ?? (p as any).location ?? null;
      return String(loc ?? "").trim() === display_location;
    });
    if (dup) {
      return res.json({
        conflict: true,
        product_code: (dup as any).product_code,
        product_name: (dup as any).product_name,
      });
    }
    return res.json({ conflict: false });
  } catch (e: any) {
    // 컬럼 미배포 시 · silent · conflict=false
    return res.json({ conflict: false });
  }
}));

router.post("/api/inventory-checks", authorize(1), validateBody(CreateInventoryCheckSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const code = b.product_code;
  const now = new Date().toISOString();
  const hasWarehouse  = Object.prototype.hasOwnProperty.call(b, "warehouse_stock");
  // 2026-09-14 · rename · store_stock → store1_stock · store_stock_2 → store2_stock
  //   · legacy 필드도 함께 수용 (하위호환)
  const hasStore1     = Object.prototype.hasOwnProperty.call(b, "store1_stock");
  const hasStore2New  = Object.prototype.hasOwnProperty.call(b, "store2_stock");
  const hasStoreLegacy   = Object.prototype.hasOwnProperty.call(b, "store_stock");
  const hasStore2Legacy  = Object.prototype.hasOwnProperty.call(b, "store_stock_2");
  const hasWarehouse1 = Object.prototype.hasOwnProperty.call(b, "warehouse1_stock");
  const hasWarehouse2 = Object.prototype.hasOwnProperty.call(b, "warehouse2_stock");
  const hasStore3     = Object.prototype.hasOwnProperty.call(b, "store3_stock");
  const hasZone1      = Object.prototype.hasOwnProperty.call(b, "store1_zone");
  const hasZone2      = Object.prototype.hasOwnProperty.call(b, "store2_zone");
  const hasZone3      = Object.prototype.hasOwnProperty.call(b, "store3_zone");
  const hasExpiryInput = Object.prototype.hasOwnProperty.call(b, "expiry_input_date");
  const hasExpiryDate  = Object.prototype.hasOwnProperty.call(b, "expiry_date");
  // 2026-09-09 · 회귀 복구 · afaf8a65 에서 삭제된 shelf_positions 부분 병합 로직
  const hasShelfPos    = Object.prototype.hasOwnProperty.call(b, "shelf_positions");
  const num = (v: any): number | null => (v != null && v !== "" ? Number(v) : null);
  const str = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  // 2026-09-09 · optimal_stock 스냅샷 제거 · products.optimal_stock 단일 소스 (사용자 지시)
  const payload: Record<string, any> = {
    product_name:  String(b.product_name ?? ""),
    system_stock:  b.system_stock  != null ? Number(b.system_stock)  : null,
    checked_by:    String(b.checked_by ?? ""),
    note:          String(b.note ?? ""),
    checked_at:    now,
    status:        "pending",
  };
  if (hasWarehouse1) payload.warehouse1_stock = num(b.warehouse1_stock);
  if (hasWarehouse && !hasWarehouse1) payload.warehouse1_stock = num(b.warehouse_stock);
  if (hasWarehouse2) payload.warehouse2_stock = num(b.warehouse2_stock);
  // 2026-09-14 · store1/2 · 신규 필드 우선 · legacy 필드 fallback
  if (hasStore1)          payload.store1_stock = num(b.store1_stock);
  else if (hasStoreLegacy)  payload.store1_stock = num(b.store_stock);
  if (hasStore2New)       payload.store2_stock = num(b.store2_stock);
  else if (hasStore2Legacy) payload.store2_stock = num(b.store_stock_2);
  if (hasStore3)     payload.store3_stock     = num(b.store3_stock);
  if (hasZone1)      payload.store1_zone      = str(b.store1_zone);
  if (hasZone2)      payload.store2_zone      = str(b.store2_zone);
  if (hasZone3)      payload.store3_zone      = str(b.store3_zone);
  if (hasExpiryInput) payload.expiry_input_date = str(b.expiry_input_date);
  if (hasExpiryDate)  payload.expiry_date       = str(b.expiry_date);

  // 2026-09-08 · shelf_positions 도 함께 조회 (병합용)
  const { data: existingList } = await supabase
    .from("inventory_checks")
    .select("id, store1_stock, shelf_positions")
    .eq("product_code", code)
    .order("checked_at", { ascending: false })
    .limit(1);
  const existing = existingList?.[0] ?? null;

  // 2026-09-08 · shelf_positions 병합 · 기존 값 보존 + 신규 값 덮어쓰기
  //   · 매장 위치 (required_detail=true) · 값이 명시적으로 들어오면 3자리 강제
  //   · null 은 허용 (미입력 유지) · undefined 는 무시 (부분 업데이트)
  // 2026-09-09 · 중복 방지 규칙 · (storage_key, display_location, detail_3digit) 3중 유일
  // 2026-09-15 · T-SP-BULK · shared helper 로 로직 통일 (단건/일괄 공용)
  if (hasShelfPos && b.shelf_positions && typeof b.shelf_positions === "object") {
    const existingPos = (existing?.shelf_positions ?? {}) as Record<string, string | null>;
    const storageLocs = await getStorageLocations();
    const { merged, dupCheckTargets } = mergeShelfPositions(
      existingPos,
      b.shelf_positions as Record<string, string | null | undefined>,
      storageLocs,
    );
    if (dupCheckTargets.length > 0) {
      const currentDisplayLoc = await fetchProductDisplayLoc(code);
      await checkShelfPositionConflicts(code, currentDisplayLoc, dupCheckTargets);
    }
    payload.shelf_positions = merged;
  }
  const applyPayload = async (): Promise<{ error?: string } | null> => {
    if (existing) {
      const { error } = await supabase.from("inventory_checks").update(payload).eq("id", existing.id);
      if (error) return { error: error.message };
      return null;
    }
    const insertPayload: Record<string, any> = { ...payload, product_code: code };
    if (!("store1_stock" in insertPayload)) insertPayload.store1_stock = null;
    const { error } = await supabase.from("inventory_checks").insert([insertPayload]);
    if (error) return { error: error.message };
    return null;
  };
  let result = await applyPayload();
  const MAX_STRIP_RETRIES = 6;
  for (let attempt = 0; attempt < MAX_STRIP_RETRIES && result?.error && /column .* does not exist|no column named|schema cache/i.test(result.error); attempt++) {
    if (attempt === 0) {
      for (const k of ["warehouse1_stock","warehouse2_stock","store2_stock","store3_stock","store1_zone","store2_zone","store3_zone","expiry_date","expiry_input_date","shelf_positions"]) {
        delete payload[k];
      }
    }
    let colName: string | null = null;
    const tableCol = /column\s+(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/i.exec(result.error);
    if (tableCol?.[1]) colName = tableCol[1];
    if (!colName) {
      const alt = /no column named\s+([a-zA-Z0-9_]+)/i.exec(result.error);
      if (alt?.[1]) colName = alt[1];
    }
    if (colName && colName in payload) {
      console.warn(`[inventory-checks] 컬럼 미존재 · strip 후 재시도: ${colName}`);
      delete payload[colName];
    } else if (attempt > 0) {
      break;
    }
    result = await applyPayload();
  }
  if (result?.error) throw new HttpError(500, result.error);
  clearLowStockCache();
  scheduleSnapshotBackground();
  return res.json({ ok: true, updated: !!existing });
}));

// 2026-07-30 · 사용자 요청 · 실재고 일괄 저장 · 전체 등록 기능
// 2026-08-03 · Phase 3 · 5분리 (창고1·창고2·매장1·매장2·매장3) · 구역 3개
// body: { checked_by, items: [{
//   product_code, product_name,
//   warehouse1_stock, warehouse2_stock, store1_stock, store2_stock, store3_stock,
//   store1_zone, store2_zone, store3_zone
// }] }
// 하위 호환:
//   - warehouse_stock (레거시) → warehouse1_stock 으로 병합 (2026-08-31 DROP 완료)
//   - 구 클라이언트: store_stock / store_stock_2 → store1_stock / store2_stock 로 매핑 (2026-09-14 rename)
//   - 신규 컬럼 미존재 DB · 신규 필드 stripping 후 재시도 (자동 다운그레이드)
router.post("/api/inventory-checks/bulk", authorize(1), validateBody(BulkInventoryCheckSchema), asyncHandler(async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const b = req.body;
  const items: any[] = b.items;
  const checked_by = String(b.checked_by ?? "").trim() || "익명";
  const now = new Date().toISOString();
  const num = (v: any): number | null => (v != null && v !== "" ? Number(v) : null);
  const str = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  // 2026-09-15 · T-SP-BULK · shelf_positions 병합 · storage_locations 마스터를 루프 밖에서 1회 조회
  //   · 각 item · 매장 필수 검증 · required_detail 판정에 재사용
  //   · shelf_positions 없는 item 이 하나라도 있으면 조회 X (lazy)
  const anyHasShelfPos = items.some(it =>
    Object.prototype.hasOwnProperty.call(it, "shelf_positions") && it.shelf_positions && typeof it.shelf_positions === "object"
  );
  const storageLocs = anyHasShelfPos ? await getStorageLocations() : [];
  let saved = 0, failed = 0;
  let downgraded = false; // 신규 컬럼 없는 DB 감지 후 이후 아이템 전부 스트립 처리
  // 2026-09-15 · shelf_positions 검증 실패 (매장 필수 · 3자리 · 중복) 시 · 세부 에러 반환
  //   · item 단위 실패는 failed 카운트에 반영 · 전체 요청 실패 아님
  const errors: Array<{ product_code: string; error: string }> = [];
  for (const it of items) {
    const code = String(it.product_code ?? "").trim();
    if (!code) { failed++; continue; }
    // 창고1 우선 · 없으면 레거시 warehouse_stock 사용
    const wh1 = it.warehouse1_stock !== undefined ? num(it.warehouse1_stock) : num(it.warehouse_stock);
    const wh2 = num(it.warehouse2_stock);
    // 2026-09-14 · rename · store_stock → store1_stock · store_stock_2 → store2_stock
    //   · legacy 필드도 fallback (하위호환)
    const s1  = num(it.store1_stock ?? it.store_stock);       // 매장1
    const s2  = num(it.store2_stock ?? it.store_stock_2);     // 매장2
    const s3  = num(it.store3_stock);                          // 매장3
    const payload: Record<string, any> = {
      product_name: String(it.product_name ?? ""),
      checked_by,
      checked_at: now,
      status: "pending",
      store1_stock: s1,
    };
    // 신규 컬럼
    if (!downgraded) {
      payload.warehouse1_stock = wh1;
      payload.warehouse2_stock = wh2;
      payload.store2_stock     = s2;
      payload.store3_stock     = s3;
      payload.store1_zone      = str(it.store1_zone);
      payload.store2_zone      = str(it.store2_zone);
      payload.store3_zone      = str(it.store3_zone);
    }
    // 2026-08-04 · 사용자 요청 · 날짜별 이력 관리 · 같은 날짜면 update (덮어쓰기) · 다른 날짜면 insert (이력 추가)
    // 2026-09-15 · T-SP-BULK · shelf_positions 병합 위해 · select 확장 (id, checked_at, shelf_positions)
    const todayYmd = now.slice(0, 10);
    const { data: existingList } = await supabase
      .from("inventory_checks")
      .select("id, checked_at, shelf_positions")
      .eq("product_code", code)
      .order("checked_at", { ascending: false })
      .limit(1);
    const existing = existingList?.[0] ?? null;
    const existingYmd = existing?.checked_at ? String(existing.checked_at).slice(0, 10) : null;
    const sameDay = existingYmd === todayYmd;

    // 2026-09-15 · T-SP-BULK · shelf_positions 병합 (단건 POST 와 동일 로직)
    //   · 매장 필수 (required_detail) 검증 · 3자리 강제 · (display_location, key, value) 중복 pre-check
    //   · 실패 시 · 해당 item 만 failed 처리 · 다른 item 계속 진행 (BC · bulk 반복 유지)
    const hasShelfPos = Object.prototype.hasOwnProperty.call(it, "shelf_positions")
      && it.shelf_positions && typeof it.shelf_positions === "object";
    if (hasShelfPos && !downgraded) {
      try {
        const existingPos = ((existing as any)?.shelf_positions ?? {}) as Record<string, string | null>;
        const { merged, dupCheckTargets } = mergeShelfPositions(
          existingPos,
          it.shelf_positions as Record<string, string | null | undefined>,
          storageLocs,
        );
        if (dupCheckTargets.length > 0) {
          const currentDisplayLoc = await fetchProductDisplayLoc(code);
          await checkShelfPositionConflicts(code, currentDisplayLoc, dupCheckTargets);
        }
        payload.shelf_positions = merged;
      } catch (e: any) {
        // badRequest · status/message 보존 · item 단위 실패 처리
        const msg = e?.message ?? "shelf_positions 병합 실패";
        errors.push({ product_code: code, error: msg });
        failed++;
        continue;
      }
    }

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
      for (const k of ["warehouse1_stock","warehouse2_stock","store2_stock","store3_stock","store1_zone","store2_zone","store3_zone","shelf_positions"]) {
        delete payload[k];
      }
      const retry = await doWrite(payload);
      error = retry.error ?? null;
    }
    if (error) {
      failed++;
      errors.push({ product_code: code, error: error.message });
    } else {
      saved++;
    }
  }
  clearLowStockCache(); // 2026-08-05 · T-PERF-1a
  scheduleSnapshotBackground(); // 2026-08-06 · T-LOSS-HISTORY · 오늘 손실 스냅샷 자동
  // 2026-09-07 · 사용자 지시 · 실재고 일괄 저장 알림 제거 (스팸)
  // 2026-09-15 · T-SP-BULK · errors 배열 · item 별 실패 사유 (매장필수·3자리·중복) 노출
  //   · BC · 기존 { ok, saved, failed, total, downgraded } 필드 100% 유지 · errors 는 추가 필드
  res.json({ ok: true, saved, failed, total: items.length, downgraded, errors });
}));

router.patch("/api/inventory-checks/:id", authorize(1), validateBody(PatchInventoryCheckSchema), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status && !["pending", "done"].includes(status)) throw badRequest("invalid status");
  const { error } = await supabase.from("inventory_checks").update({ status }).eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  clearLowStockCache(); // 2026-08-05 · T-PERF-1a
  res.json({ ok: true });
}));

router.delete("/api/inventory-checks/:id", authorize(2), asyncHandler(async (req, res) => {
  const { error } = await supabase.from("inventory_checks").delete().eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  clearLowStockCache(); // 2026-08-05 · T-PERF-1a
  res.json({ ok: true });
}));

export default router;
