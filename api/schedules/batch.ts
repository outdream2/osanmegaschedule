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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const supabase = getSupabase();
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "items must be a non-empty array" });

    for (const item of items) {
      if (!item || item.employeeId === undefined || item.employeeId === null || !item.date || item.type === undefined)
        return res.status(400).json({ error: "Each item requires employeeId, date, and type" });
    }

    const rows = items.map((item: any) => ({
      employeeId: item.employeeId,
      date: item.date,
      type: item.type,
      workingHours: item.workingHours || "",
      actualHours: item.actualHours || "",
      memo: item.memo ?? "",
    }));

    const { error } = await supabase.from("schedules").upsert(rows, { onConflict: "employeeId,date" });
    if (error) throw new Error(error.message);
    return res.json({ count: rows.length });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
