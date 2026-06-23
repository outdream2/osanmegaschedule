import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { targetYear, targetMonth } = req.body;
    if (!targetYear || !targetMonth)
      return res.status(400).json({ error: "Missing targetYear or targetMonth" });

    const ty = parseInt(targetYear);
    const tm = parseInt(targetMonth);
    const prevMonth = tm === 1 ? 12 : tm - 1;
    const prevYear = tm === 1 ? ty - 1 : ty;
    const prevPrefix = `${prevYear}-${String(prevMonth).padStart(2, "0")}-`;
    const targetMonthStr = String(tm).padStart(2, "0");
    const targetMaxDays = new Date(ty, tm, 0).getDate();

    const { data: prevSchedules, error } = await supabase.from("schedules").select("*").like("date", `${prevPrefix}%`);
    if (error) throw new Error(error.message);

    const rows = (prevSchedules ?? [])
      .map((s: any) => {
        const day = parseInt(s.date.slice(8));
        if (isNaN(day) || day > targetMaxDays) return null;
        return { employeeId: s.employeeId, date: `${ty}-${targetMonthStr}-${String(day).padStart(2, "0")}`, type: s.type, workingHours: s.workingHours, actualHours: s.actualHours, memo: s.memo };
      })
      .filter(Boolean);

    if (rows.length === 0) return res.json({ count: 0 });

    const { error: upsertErr } = await supabase.from("schedules").upsert(rows, { onConflict: "employeeId,date" });
    if (upsertErr) throw new Error(upsertErr.message);
    return res.json({ count: rows.length });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
