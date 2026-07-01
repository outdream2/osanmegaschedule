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

export default router;
