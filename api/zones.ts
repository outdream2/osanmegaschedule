import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
 * GET  /api/zones         → all zone assignment rows
 * POST /api/zones         → upsert full zone array
 *   body: { zones: Array<{ zone_id, employee_id, employee_name, status, products }> }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("zone_assignments")
      .select("zone_id, employee_id, employee_name, status, products");
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const { zones } = req.body ?? {};
    if (!Array.isArray(zones)) return res.status(400).json({ error: "zones array required" });

    const rows = zones.map((z: any) => ({
      zone_id: String(z.zone_id),
      employee_id: z.employee_id ?? null,
      employee_name: z.employee_name ?? "",
      status: z.status ?? "normal",
      products: z.products ?? "",
    }));

    const { error } = await supabase
      .from("zone_assignments")
      .upsert(rows, { onConflict: "zone_id" });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
