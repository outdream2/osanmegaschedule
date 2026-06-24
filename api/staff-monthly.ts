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
 * GET /api/staff-monthly?year=YYYY&month=M
 * Returns Record<date, offStaffNames[]> for employees 1,2,3 in the given month.
 * e.g. { "2026-06-10": ["대표", "이사"], "2026-06-20": ["대표", "이사", "부장"] }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: "year and month query params required" });
  }

  const monthStr = String(month).padStart(2, "0");
  const datePrefix = `${year}-${monthStr}-`;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("schedules")
      .select("employeeId, date, type")
      .like("date", `${datePrefix}%`)
      .in("employeeId", STAFF.map(s => s.id));

    if (error) throw new Error(error.message);

    const result: Record<string, string[]> = {};
    for (const row of (data ?? [])) {
      if (!OFF_TYPES.includes(row.type)) continue;
      const staff = STAFF.find(s => s.id === row.employeeId);
      if (!staff) continue;
      if (!result[row.date]) result[row.date] = [];
      result[row.date].push(staff.name);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("staff-monthly error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
