import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

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
    const { date, time, company, contactName, phone, purpose, note } = req.body;
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
