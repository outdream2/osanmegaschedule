import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables (SUPABASE_URL, SUPABASE_KEY) are not configured");
  }
  _supabase = createClient(url, key);
  return _supabase;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const supabase = getSupabase();
    if (req.method === "GET") {
      const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
      const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12)
        return res.status(400).json({ error: "Invalid year or month" });

      const monthStr = String(month).padStart(2, "0");
      const datePrefix = `${year}-${monthStr}-`;

      const { data: employees, error: empErr } = await supabase.from("employees").select("*").order("id");
      if (empErr) throw new Error(empErr.message);

      const { data: schedules, error: schedErr } = await supabase.from("schedules").select("*").like("date", `${datePrefix}%`);
      if (schedErr) throw new Error(schedErr.message);

      const employeesWithSchedules = (employees ?? []).map((emp) => ({
        ...emp,
        schedules: (schedules ?? []).filter((s: any) => s.employeeId === emp.id),
      }));

      const totalDays = new Date(year, month, 0).getDate();
      const summaryList = [];
      for (let day = 1; day <= totalDays; day++) {
        const dayStr = String(day).padStart(2, "0");
        const currentDate = `${year}-${monthStr}-${dayStr}`;
        const daySchedules = (schedules ?? []).filter((s: any) => s.date === currentDate);
        const openCount = daySchedules.filter((s: any) => s.type === "오픈").length;
        const closeCount = daySchedules.filter((s: any) => s.type === "마감").length;
        summaryList.push({ day, date: currentDate, openCount, closeCount, totalCount: openCount + closeCount });
      }

      return res.json({ employees: employeesWithSchedules, summary: summaryList });
    }

    if (req.method === "PUT") {
      const { employeeId, date, type, workingHours, actualHours, memo } = req.body ?? {};
      if (employeeId === undefined || employeeId === null || !date || type === undefined)
        return res.status(400).json({ error: "Missing required fields" });

      const employeeIdNum = parseInt(employeeId as string);
      if (isNaN(employeeIdNum))
        return res.status(400).json({ error: "Invalid employeeId" });

      const { data, error } = await supabase
        .from("schedules")
        .upsert({ employeeId: employeeIdNum, date, type, workingHours: workingHours || "", actualHours: actualHours || "", memo: memo ?? "" }, { onConflict: "employeeId,date" })
        .select().single();
      if (error) throw new Error(error.message);
      return res.json(data);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
