import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../../src/supabase/client";

const router = Router();

// 전체 거래처 목록 (관리자)
router.get("/api/vendors", async (_req, res) => {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, company_name, contact_name, phone, category, note, created_at")
    .order("company_name");
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

// 거래처 등록 (관리자)
router.post("/api/vendors", async (req, res) => {
  const { company_name, contact_name, phone, category, note } = req.body ?? {};
  if (!company_name?.trim()) return res.status(400).json({ error: "거래처명은 필수입니다." });
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  const { data, error } = await supabase
    .from("vendors")
    .insert({ company_name: company_name.trim(), contact_name: contact_name ?? null, phone: cleanPhone || null, category: category ?? null, note: note ?? null })
    .select("id, company_name, contact_name, phone, category, note, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// 거래처 수정 (관리자)
router.patch("/api/vendors/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
  const { company_name, contact_name, phone, category, note } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (company_name !== undefined) updates.company_name = company_name.trim();
  if (contact_name !== undefined) updates.contact_name = contact_name;
  if (phone !== undefined) updates.phone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  if (category !== undefined) updates.category = category;
  if (note !== undefined) updates.note = note;
  const { data, error } = await supabase.from("vendors").update(updates).eq("id", id)
    .select("id, company_name, contact_name, phone, category, note").single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// 거래처 삭제 (관리자)
router.delete("/api/vendors/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// 거래처 비밀번호 설정 (관리자)
router.post("/api/vendors/:id/set-password", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
  const { password } = req.body ?? {};
  if (!password || String(password).length < 4) return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다." });
  const password_hash = await bcrypt.hash(String(password), 10);
  const { error } = await supabase.from("vendors").update({ password_hash }).eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
