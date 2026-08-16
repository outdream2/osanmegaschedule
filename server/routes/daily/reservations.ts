// 2026-08-16 · asyncHandler + HttpError 프레임워크 적용
import { Router } from "express";
import { supabase } from "../../../src/supabase/client";
// 2026-08-13 · #107 · 거래처 예약 · 관리자 알림
import { notificationsService } from "../../services/notificationsService";
import { asyncHandler } from "../../middleware/asyncHandler";
import { badRequest, HttpError } from "../../middleware/errorHandler";

const router = Router();

router.get("/api/reservations", asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== "string") throw badRequest("date query param required");
  const { data, error } = await supabase
    .from("reservations").select("time, note, purpose, company, contact_name, phone, vendor_id").eq("date", date);
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

router.post("/api/reservations", asyncHandler(async (req, res) => {
  const { date, time, company, contactName, phone, purpose, note, vendorId } = req.body ?? {};
  if (!date || !time || !company || !contactName || !phone || !purpose) throw badRequest("필수 항목이 누락되었습니다.");
  const getTarget = (n: string) => {
    const match = (n || "").match(/^\[대상:(대표|이사|부장)\]/);
    return match ? match[1] : "대표";
  };
  const targetToBook = getTarget(note || "");
  const { data: existing } = await supabase
    .from("reservations").select("note").eq("date", date).eq("time", time);
  const isAlreadyBooked = (existing ?? []).some((r: any) => getTarget(r.note ?? "") === targetToBook);
  if (isAlreadyBooked) throw new HttpError(409, "이미 예약된 시간입니다.", "CONFLICT");
  const { error } = await supabase.from("reservations").insert({
    date, time, company, contact_name: contactName, phone, purpose, note: note || "",
    ...(vendorId ? { vendor_id: vendorId } : {}),
  });
  if (error) throw new HttpError(500, error.message);
  // 관리자 broadcast
  notificationsService.notifyAllAdmins({
    title: `📅 거래처 예약 [${targetToBook}]`,
    body: `${date} ${time} · ${company} · ${contactName} (${phone}) · ${purpose}`,
    type: "info",
    push: { url: "/", tag: `resv-${date}-${time}` },
  }).catch(() => null);
  res.status(201).json({ ok: true });
}));

export default router;
