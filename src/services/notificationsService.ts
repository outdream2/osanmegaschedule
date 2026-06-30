// src/services/notificationsService.ts
// DB queries for the notifications feature.
// All Supabase access for notifications lives here.

import { supabase } from "../supabase/client";

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
      .select("*")
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
};
