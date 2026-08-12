// server/services/notificationsService.ts
// DB queries for the notifications feature.
// All Supabase access for notifications lives here.
// 2026-08-13 · #107 · 알림 helper 추가 · notifyAllAdmins / notifyEmployee / notifyEmployees
//   · 관리자 판별 · level >= 9 통일 (auth.ts 진실의 원천)
//   · 각 요청 라우터에서 호출 · try/catch 로 감싸 알림 실패 시 요청 자체는 성공

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

  // 2026-08-13 · #107 · 관리자 전체 broadcast · level >= 9 (auth.ts 진실의 원천)
  //   · 실패 시 로그만 · throw 안 함 (요청 자체는 성공하도록)
  async notifyAllAdmins(params: {
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
  }): Promise<{ sent: number; skipped: number }> {
    try {
      const { data: admins, error } = await supabase
        .from("employees")
        .select("id")
        .gte("level", 9);
      if (error) {
        console.warn("[notifyAllAdmins] admin fetch failed:", error.message);
        return { sent: 0, skipped: 0 };
      }
      const ids = (admins ?? []).map((a) => a.id as number).filter((n) => typeof n === "number");
      if (ids.length === 0) return { sent: 0, skipped: 0 };
      const rows = ids.map((id) => ({
        employee_id: id,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      }));
      const { error: insErr } = await supabase.from("notifications").insert(rows);
      if (insErr) {
        console.warn("[notifyAllAdmins] insert failed:", insErr.message);
        return { sent: 0, skipped: ids.length };
      }
      return { sent: ids.length, skipped: 0 };
    } catch (err: any) {
      console.warn("[notifyAllAdmins] unexpected error:", err?.message ?? err);
      return { sent: 0, skipped: 0 };
    }
  },

  // 2026-08-13 · #107 · 단일 직원 알림 (담당자 지정) · 실패 시 조용히
  async notifyEmployee(params: {
    employeeId: number;
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
  }): Promise<boolean> {
    try {
      const { error } = await supabase.from("notifications").insert({
        employee_id: params.employeeId,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      });
      if (error) {
        console.warn(`[notifyEmployee ${params.employeeId}] insert failed:`, error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn(`[notifyEmployee ${params.employeeId}] unexpected:`, err?.message ?? err);
      return false;
    }
  },

  // 2026-08-13 · #107 · 여러 직원 알림 (직군·역할 지정) · 실패 시 개별 skip
  async notifyEmployees(params: {
    employeeIds: number[];
    title: string;
    body?: string | null;
    type?: "info" | "success" | "warning" | "alert";
  }): Promise<{ sent: number; skipped: number }> {
    const ids = params.employeeIds.filter((n) => typeof n === "number" && n > 0);
    if (ids.length === 0) return { sent: 0, skipped: 0 };
    try {
      const rows = ids.map((id) => ({
        employee_id: id,
        title: params.title,
        body: params.body ?? null,
        type: params.type ?? "info",
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) {
        console.warn("[notifyEmployees] insert failed:", error.message);
        return { sent: 0, skipped: ids.length };
      }
      return { sent: ids.length, skipped: 0 };
    } catch (err: any) {
      console.warn("[notifyEmployees] unexpected:", err?.message ?? err);
      return { sent: 0, skipped: ids.length };
    }
  },
};
