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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let supabase: SupabaseClient;
  try {
    supabase = getSupabase();
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }

  // GET /api/reservations?date=YYYY-MM-DD  → booked time strings for that date
  if (req.method === "GET") {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    const { data, error } = await supabase
      .from("reservations")
      .select("time")
      .eq("date", date);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json((data ?? []).map((r: { time: string }) => r.time));
  }

  // POST /api/reservations  → create reservation
  if (req.method === "POST") {
    const { date, time, company, contactName, phone, purpose, note } = req.body ?? {};
    if (!date || !time || !company || !contactName || !phone || !purpose) {
      return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
    }

    // Check slot not already taken
    const { data: existing } = await supabase
      .from("reservations")
      .select("id")
      .eq("date", date)
      .eq("time", time)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: "이미 예약된 시간입니다." });
    }

    const { error } = await supabase.from("reservations").insert({
      date,
      time,
      company,
      contact_name: contactName,
      phone,
      purpose,
      note: note || "",
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
