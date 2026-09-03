// server/services/notificationsService.ts
// DB queries for the notifications feature.
// All Supabase access for notifications lives here.
// 2026-08-13 · #107 · 인앱 알림 + web push 통합 helper
//   · notifyAllAdmins / notifyEmployee / notifyEmployees / notifyAllEmployees
//   · 각 helper · pushOptions 지정 시 · webpush.sendNotification 도 함께 발송
//   · 관리자 판별 · level >= 9 통일 (auth.ts 진실의 원천)

import webpush from "web-push";
import { supabase } from "../../src/supabase/client";

export interface Notification {
  id: number;
  employee_id: number;
  title: string;
  body: string | null;
  type: "info" | "success" | "warning" | "alert";
  read: boolean;
  created_at: string;
}

export interface PushOptions {
  /** web push payload · title (별도 지정 시 인앱 title 과 다르게 가능) */
  title?: string;
  body?: string | null;
  url?: string;
  tag?: string;
}

async function sendPushToIds(ids: number[], push: PushOptions): Promise<{ sent: number; skipped: number }> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { sent: 0, skipped: ids.length };
  }
  if (ids.length === 0) return { sent: 0, skipped: 0 };
  try {
    const { data, error } = await supabase
      .from("employees")
      .select("id, push_subscription")
      .in("id", ids)
      .not("push_subscription", "is", null);
    if (error) {
      console.warn("[sendPushToIds] subscription fetch failed:", error.message);
      return { sent: 0, skipped: ids.length };
    }
    // 2026-09-03 · 한글 깨짐 fix · payload · Buffer UTF-8 명시
    //   · 이전 · JSON.stringify → string · web-push 는 자동 UTF-8 이지만 · 일부 환경(브라우저 sw) CP949 fallback 가능
    //   · 이후 · Buffer.from(str, 'utf8') 명시 · 서버 push payload 100% UTF-8 보장
    const payloadStr = JSON.stringify({
      title: push.title ?? "알림",
      body: push.body ?? "",
      url: push.url ?? "/",
      tag: push.tag ?? `notif-${Date.now()}`,
    });
    const payload = Buffer.from(payloadStr, "utf8");
    let sent = 0;
    const expiredIds: number[] = [];
    for (const row of data ?? []) {
      if (!row.push_subscription) continue;
      try {
        await webpush.sendNotification(row.push_subscription as webpush.PushSubscription, payload);
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) expiredIds.push(row.id as number);
        else console.warn(`[sendPushToIds ${row.id}] push failed:`, err.statusCode ?? err.message);
      }
    }
    if (expiredIds.length > 0) {
      await supabase.from("employees").update({ push_subscription: null }).in("id", expiredIds);
    }
    return { sent, skipped: ids.length - sent };
  } catch (err: any) {
    console.warn("[sendPushToIds] unexpected:", err?.message ?? err);
    return { sent: 0, skipped: ids.length };
  }
}

async function insertNotifications(rows: Array<{
  employee_id: number;
  title: string;
  body: string | null;
  type: "info" | "success" | "warning" | "alert";
}>): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.warn("[insertNotifications] insert failed:", error.message);
    return 0;
  }
  return rows.length;
}

export const notificationsService = {
  async getForEmployee(employeeId: number, limit = 30): Promise<Notification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, employee_id, title, body, type, read, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as Notification[];
  },

  async markRead(id: number): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async markAllRead(employeeId: number): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("employee_id", employeeId)
      .eq("read", false);
    if (error) throw new Error(error.message);
  },

  async create(params: {
    employee_id: number;
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
  }): Promise<Notification> {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        employee_id: params.employee_id,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Notification;
  },

  // 2026-08-13 · #107 · 관리자 broadcast · 인앱 + optional web push
  async notifyAllAdmins(params: {
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
    push?: PushOptions;
  }): Promise<{ inApp: number; push: number }> {
    try {
      const { data: admins, error } = await supabase.from("employees").select("id").gte("level", 9);
      if (error) { console.warn("[notifyAllAdmins] admin fetch failed:", error.message); return { inApp: 0, push: 0 }; }
      const ids = (admins ?? []).map((a) => a.id as number).filter((n) => typeof n === "number");
      if (ids.length === 0) return { inApp: 0, push: 0 };
      const inApp = await insertNotifications(ids.map((id) => ({
        employee_id: id,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      })));
      const push = params.push
        ? (await sendPushToIds(ids, { title: params.push.title ?? params.title, body: params.push.body ?? params.body, url: params.push.url, tag: params.push.tag })).sent
        : 0;
      return { inApp, push };
    } catch (err: any) { console.warn("[notifyAllAdmins] unexpected:", err?.message ?? err); return { inApp: 0, push: 0 }; }
  },

  // 2026-08-13 · #107 · 단일 담당자 알림 · 인앱 + optional web push
  async notifyEmployee(params: {
    employeeId: number;
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
    push?: PushOptions;
  }): Promise<{ inApp: boolean; push: boolean }> {
    if (!params.employeeId) return { inApp: false, push: false };
    const inApp = await insertNotifications([{
      employee_id: params.employeeId,
      title: params.title,
      body: params.body ?? null,
      type: params.type ?? "info",
    }]);
    const pushRes = params.push
      ? await sendPushToIds([params.employeeId], { title: params.push.title ?? params.title, body: params.push.body ?? params.body, url: params.push.url, tag: params.push.tag })
      : { sent: 0, skipped: 0 };
    return { inApp: inApp > 0, push: pushRes.sent > 0 };
  },

  // 2026-08-13 · #107 · 여러 담당자 알림 · 인앱 + optional web push
  async notifyEmployees(params: {
    employeeIds: number[];
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
    push?: PushOptions;
  }): Promise<{ inApp: number; push: number }> {
    const ids = params.employeeIds.filter((n) => typeof n === "number" && n > 0);
    if (ids.length === 0) return { inApp: 0, push: 0 };
    const inApp = await insertNotifications(ids.map((id) => ({
      employee_id: id,
      title: params.title,
      body: params.body ?? null,
      type: params.type ?? "info",
    })));
    const push = params.push
      ? (await sendPushToIds(ids, { title: params.push.title ?? params.title, body: params.push.body ?? params.body, url: params.push.url, tag: params.push.tag })).sent
      : 0;
    return { inApp, push };
  },

  // 2026-08-13 · #107 · 전체 직원 broadcast (입고알림 등) · 인앱 + optional web push
  async notifyAllEmployees(params: {
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
    push?: PushOptions;
    /** 퇴사자 제외 (기본 true) */
    activeOnly?: boolean;
  }): Promise<{ inApp: number; push: number }> {
    try {
      let query = supabase.from("employees").select('id, "retireDate"');
      const { data, error } = await query;
      if (error) { console.warn("[notifyAllEmployees] fetch failed:", error.message); return { inApp: 0, push: 0 }; }
      const activeOnly = params.activeOnly !== false;
      const ids = (data ?? [])
        .filter((e: any) => !activeOnly || !e.retireDate)
        .map((e: any) => e.id as number)
        .filter((n) => typeof n === "number");
      if (ids.length === 0) return { inApp: 0, push: 0 };
      const inApp = await insertNotifications(ids.map((id) => ({
        employee_id: id,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      })));
      const push = params.push
        ? (await sendPushToIds(ids, { title: params.push.title ?? params.title, body: params.push.body ?? params.body, url: params.push.url, tag: params.push.tag })).sent
        : 0;
      return { inApp, push };
    } catch (err: any) { console.warn("[notifyAllEmployees] unexpected:", err?.message ?? err); return { inApp: 0, push: 0 }; }
  },
};
