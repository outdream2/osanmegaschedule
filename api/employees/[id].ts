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
  res.setHeader("Access-Control-Allow-Methods", "PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.query.id === undefined || req.query.id === null || req.query.id === "")
    return res.status(400).json({ error: "Employee ID is required" });

  const id = parseInt(req.query.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid employee ID" });

  try {
    const supabase = getSupabase();

    if (req.method === "PUT") {
      const { name, position, rank, employmentType, hireDate, description, workplace, gender } = req.body ?? {};
      if (!name || !position)
        return res.status(400).json({ error: "name and position are required" });
      const { data, error } = await supabase
        .from("employees")
        .update({ name, position, rank: rank || null, employmentType: employmentType || "정직원", hireDate, description: description || "", workplace: workplace || "매장", gender: gender || null })
        .eq("id", id)
        .select().single();
      if (error) throw new Error(error.message);
      return res.json(data);
    }

    if (req.method === "DELETE") {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return res.json({ message: "Employee deleted successfully" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
