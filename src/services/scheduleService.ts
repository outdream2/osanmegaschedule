import { supabase } from "../supabase/client";

export class ScheduleService {
  async getMonthlySchedule(year: number, month: number) {
    const monthStr = String(month).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}-`;

    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("*")
      .order("id");
    if (empErr) throw new Error(empErr.message);

    const { data: schedules, error: schedErr } = await supabase
      .from("schedules")
      .select("*")
      .like("date", `${datePrefix}%`);
    if (schedErr) throw new Error(schedErr.message);

    const employeesWithSchedules = (employees ?? []).map((emp) => ({
      ...emp,
      schedules: (schedules ?? []).filter((s) => s.employeeId === emp.id),
    }));

    const totalDays = new Date(year, month, 0).getDate();
    const summaryList = [];
    for (let day = 1; day <= totalDays; day++) {
      const dayStr = String(day).padStart(2, "0");
      const currentDate = `${year}-${monthStr}-${dayStr}`;
      const daySchedules = (schedules ?? []).filter((s) => s.date === currentDate);
      const openCount = daySchedules.filter((s) => s.type === "오픈").length;
      const closeCount = daySchedules.filter((s) => s.type === "마감").length;
      summaryList.push({ day, date: currentDate, openCount, closeCount, totalCount: openCount + closeCount });
    }

    return { employees: employeesWithSchedules, summary: summaryList };
  }

  async updateOrCreateSchedule(data: {
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }) {
    const { data: result, error } = await supabase
      .from("schedules")
      .upsert(
        {
          employeeId: data.employeeId,
          date: data.date,
          type: data.type,
          workingHours: data.workingHours,
          actualHours: data.actualHours,
          memo: data.memo ?? "",
        },
        { onConflict: "employeeId,date" }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  }

  async copySchedulesFromPreviousMonth(targetYear: number, targetMonth: number) {
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}-`;
    const targetMonthStr = String(targetMonth).padStart(2, "0");
    const targetMaxDays = new Date(targetYear, targetMonth, 0).getDate();

    const { data: prevSchedules, error } = await supabase
      .from("schedules")
      .select("*")
      .like("date", `${prevPrefix}%`);
    if (error) throw new Error(error.message);

    const rows = (prevSchedules ?? [])
      .map((sched) => {
        const day = parseInt(sched.date.slice(8));
        if (isNaN(day) || day > targetMaxDays) return null;
        return {
          employeeId: sched.employeeId,
          date: `${targetYear}-${targetMonthStr}-${String(day).padStart(2, "0")}`,
          type: sched.type,
          workingHours: sched.workingHours,
          actualHours: sched.actualHours,
          memo: sched.memo,
        };
      })
      .filter(Boolean) as object[];

    if (rows.length === 0) return { count: 0 };

    const { error: upsertErr } = await supabase
      .from("schedules")
      .upsert(rows, { onConflict: "employeeId,date" });
    if (upsertErr) throw new Error(upsertErr.message);

    return { count: rows.length };
  }

  async batchUpdateSchedules(items: Array<{
    employeeId: number;
    date: string;
    type: string;
    workingHours: string;
    actualHours: string;
    memo?: string;
  }>) {
    if (items.length === 0) return { count: 0 };
    const rows = items.map(item => ({
      employeeId: item.employeeId,
      date: item.date,
      type: item.type,
      workingHours: item.workingHours,
      actualHours: item.actualHours,
      memo: item.memo ?? "",
    }));
    const { error } = await supabase
      .from("schedules")
      .upsert(rows, { onConflict: "employeeId,date" });
    if (error) throw new Error(error.message);
    return { count: rows.length };
  }

  async createEmployee(data: { name: string; position: string; hireDate: string; description: string; workplace?: string }) {
    const { data: result, error } = await supabase
      .from("employees")
      .insert({ ...data, workplace: data.workplace ?? "매장" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  }

  async updateEmployee(id: number, data: { name: string; position: string; hireDate: string; description: string; workplace?: string }) {
    const { data: result, error } = await supabase
      .from("employees")
      .update({ ...data, workplace: data.workplace ?? "매장" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return result;
  }

  async deleteEmployee(id: number) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export const scheduleService = new ScheduleService();
