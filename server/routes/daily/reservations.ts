import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
// 2026-08-13 · #107 · 거래처 예약 · 관리자 알림
import { notificationsService } from "../../services/notificationsService";

const router = Router();

router.get("/api/reservations", async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") return res.status(400).json({ error: "date query param required" });
  const { data, error } = await supabase
    .from("reservations").select("time, note, purpose, company, contact_name, phone, vendor_id").eq("date", date);
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

router.post("/api/reservations", async (req, res) => {
  const { date, time, company, contactName, phone, purpose, note, vendorId } = req.body ?? {};
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
    ...(vendorId ? { vendor_id: vendorId } : {}),
  });
  if (error) return res.status(500).json({ error: error.message });
  // 2026-08-13 · #107 · 관리자 broadcast · 거래처 예약 (대상=대표/이사/부장 태그 유지)
  notificationsService.notifyAllAdmins({
    title: `📅 거래처 예약 [${targetToBook}]`,
    body: `${date} ${time} · ${company} · ${contactName} (${phone}) · ${purpose}`,
    type: "info",
    push: { url: "/", tag: `resv-${date}-${time}` },
  }).catch(() => null);
  return res.status(201).json({ ok: true });
});

export default router;
