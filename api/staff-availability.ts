import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const STAFF = [
  { id: 1, name: "대표" },
  { id: 2, name: "이사" },
  { id: 3, name: "부장" },
];
const OFF_TYPES = ["휴무", "월차", "지정휴무", "오전반차", "오후반차"];

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * GET /api/staff-availability?date=YYYY-MM-DD
 * Returns schedule info for employees 1, 2, 3 on the given date.
 * Response: Array<{ employeeId, name, scheduleType, isOff }>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { date } = req.query;
  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "date query param required" });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("schedules")
      .select("employeeId, type")
      .eq("date", date)
      .in("employeeId", STAFF.map(s => s.id));

    if (error) throw new Error(error.message);

    const result = STAFF.map(({ id, name }) => {
      const row = (data ?? []).find((r: any) => r.employeeId === id);
      const scheduleType: string | null = row?.type ?? null;
      return {
        employeeId: id,
        name,
        scheduleType,
        isOff: scheduleType ? OFF_TYPES.includes(scheduleType) : false,
      };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("staff-availability error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
