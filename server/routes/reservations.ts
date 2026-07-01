import { Router } from "express";
import { supabase } from "../../src/supabase/client";

const router = Router();

router.get("/api/reservations", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") return res.status(400).json({ error: "date query param required" });
  const { data, error } = await supabase
    .from("reservations").select("time, note, purpose, company, contact_name, phone").eq("date", date);
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

router.post("/api/reservations", async (req, res) => {
  const { date, time, company, contactName, phone, purpose, note } = req.body ?? {};
  if (!date || !time || !company || !contactName || !phone || !purpose) {
    return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
  }
  const getTarget = (n: string) => {
    const match = (n || "").match(/^\[대상:(대표|이사|부장)\]/);
    return match ? match[1] : "대표";
  };
  const targetToBook = getTarget(note || "");
  const { data: existing } = await supabase
    .from("reservations").select("note").eq("date", date).eq("time", time);
  const isAlreadyBooked = (existing ?? []).some((r: any) => getTarget(r.note ?? "") === targetToBook);
  if (isAlreadyBooked) return res.status(409).json({ error: "이미 예약된 시간입니다." });
  const { error } = await supabase.from("reservations").insert({
    date, time, company, contact_name: contactName, phone, purpose, note: note || "",
  });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ ok: true });
});

export default router;
