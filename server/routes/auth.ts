import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../../src/supabase/client";

const router = Router();

router.post("/api/auth/login", async (req, res) => {
  const { employee_id, password } = req.body ?? {};
  const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
  if (!phone || !password) {
    return res.status(400).json({ error: "전화번호와 비밀번호를 입력해주세요" });
  }
  try {
    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, name, password_hash, level, rank")
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp) return res.status(401).json({ error: "전화번호를 찾을 수 없습니다", debug: "no_employee" });
    if (!emp.password_hash) return res.status(401).json({ error: "비밀번호가 설정되지 않았습니다", debug: "no_hash" });
    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
    const level: number = emp.level ?? 1;
    if (level === 0) return res.status(401).json({ error: "접근 권한이 없습니다", debug: "level_0" });
    const role = level >= 9 ? "superadmin" : level >= 2 ? "manager" : "employee";
    return res.status(200).json({ id: emp.id, name: emp.name, role, level, rank: emp.rank ?? null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/vendor-login", async (req, res) => {
  const { phone, password } = req.body ?? {};
  const cleanPhone = String(phone ?? "").replace(/[^0-9]/g, "");
  if (!cleanPhone || !password) {
    return res.status(400).json({ error: "전화번호와 비밀번호를 입력해주세요" });
  }
  try {
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("id, company_name, contact_name, password_hash")
      .eq("phone", cleanPhone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!vendor) return res.status(401).json({ error: "등록된 거래처를 찾을 수 없습니다" });
    if (!vendor.password_hash) return res.status(401).json({ error: "비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요." });
    const ok = await bcrypt.compare(password, vendor.password_hash);
    if (!ok) return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
    return res.status(200).json({
      id: vendor.id,
      name: vendor.company_name,
      contactName: vendor.contact_name ?? "",
      role: "vendor",
      level: 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/api/auth/set-password", async (req, res) => {
  const { employeeId, password } = req.body ?? {};
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) return res.status(400).json({ error: "valid employeeId is required" });
  if (!password || password.length < 4) return res.status(400).json({ error: "password must be at least 4 characters" });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from("employees").update({ password_hash }).eq("id", idNum);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 로그인한 직원 본인이 비밀번호 변경
router.post("/api/auth/change-password", async (req, res) => {
  const { employeeId, currentPassword, newPassword } = req.body ?? {};
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) return res.status(400).json({ error: "유효한 직원 ID가 필요합니다" });
  if (!currentPassword || typeof currentPassword !== "string")
    return res.status(400).json({ error: "현재 비밀번호를 입력해주세요" });
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4)
    return res.status(400).json({ error: "새 비밀번호는 최소 4자 이상이어야 합니다" });
  if (currentPassword === newPassword)
    return res.status(400).json({ error: "새 비밀번호가 현재 비밀번호와 동일합니다" });
  try {
    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, password_hash")
      .eq("id", idNum)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp) return res.status(404).json({ error: "직원을 찾을 수 없습니다" });
    if (!emp.password_hash)
      return res.status(400).json({ error: "비밀번호가 설정되어 있지 않습니다. 관리자에게 문의하세요." });
    const ok = await bcrypt.compare(currentPassword, emp.password_hash);
    if (!ok) return res.status(401).json({ error: "현재 비밀번호가 올바르지 않습니다" });
    const password_hash = await bcrypt.hash(newPassword, 10);
    const { error: updErr } = await supabase
      .from("employees")
      .update({ password_hash })
      .eq("id", idNum);
    if (updErr) throw new Error(updErr.message);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
