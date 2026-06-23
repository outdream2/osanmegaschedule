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
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "items must be a non-empty array" });

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
