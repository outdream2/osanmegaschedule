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
    const { name, position, rank, employmentType, hireDate, description, workplace, gender } = req.body ?? {};
    if (!name || !position)
      return res.status(400).json({ error: "name and position are required" });

    const { data, error } = await supabase
      .from("employees")
      .insert({
        name, position,
        rank: rank || null,
        employmentType: employmentType || "정직원",
        hireDate: hireDate || new Date().toISOString().split("T")[0],
        description: description || "",
        workplace: workplace || "매장",
        gender: gender || null,
      })
      .select().single();
    if (error) throw new Error(error.message);
    return res.status(214).json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
