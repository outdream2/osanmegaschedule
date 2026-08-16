import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabase } from "../../../src/supabase/client";
import { issueToken, clearToken, JwtPayload, getSession } from "../../middleware/requireAuth";

const router = Router();

// 2026-08-16 · #112-S7 · Zod 스키마 · Input Validation
//   · employee_id 필드 = 실제로는 핸드폰번호 (로그인 ID 로 사용) · 하위호환 유지
const LoginSchema = z.object({
  employee_id: z.union([z.string(), z.number()]).optional(), // 실제: 핸드폰번호
  password: z.string().min(1, "비밀번호를 입력해주세요").max(200),
  rememberMe: z.boolean().optional(),
});
const VendorLoginSchema = z.object({
  phone: z.string().min(1, "핸드폰번호를 입력해주세요").max(30),
  password: z.string().min(1, "비밀번호를 입력해주세요").max(50),
});
const SetPasswordSchema = z.object({
  employeeId: z.union([z.string(), z.number()]),
  password: z.string().min(4, "비밀번호는 최소 4자 이상이어야 합니다").max(200),
});
const ChangePasswordSchema = z.object({
  employeeId: z.union([z.string(), z.number()]),
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요").max(200),
  newPassword: z.string().min(4, "새 비밀번호는 최소 4자 이상이어야 합니다").max(200),
});

/** Zod 검증 실패 · 사용자용 첫 에러 메시지 반환 */
function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "잘못된 요청 형식";
}

router.post("/api/auth/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstZodError(parsed.error) });
  const { employee_id, password } = parsed.data;
  const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
  if (!phone) return res.status(400).json({ error: "핸드폰번호를 입력해주세요" });
  try {
    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, name, password_hash, level, rank")
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!emp) return res.status(401).json({ error: "핸드폰번호를 찾을 수 없습니다", debug: "no_employee" });
    if (!emp.password_hash) return res.status(401).json({ error: "비밀번호가 설정되지 않았습니다", debug: "no_hash" });
    const ok = await bcrypt.compare(password, emp.password_hash);
    // password_hash 는 bcrypt 비교 후 즉시 제거 — 응답 객체에 절대 포함되지 않도록 방어
    delete (emp as any).password_hash;
    if (!ok) return res.status(401).json({ error: "핸드폰번호 또는 비밀번호가 올바르지 않습니다" });
    const level: number = emp.level ?? 1;
    if (level === 0) return res.status(401).json({ error: "접근 권한이 없습니다", debug: "level_0" });
    const role = level >= 9 ? "superadmin" : level >= 2 ? "manager" : "employee";
    const rememberMe = Boolean(req.body?.rememberMe);
    // 서버 세션 토큰 발급 (httpOnly 쿠키)
    // 2026-08-16 · JWT_SECRET 미설정 시 · silent 실패 → 명시 500 (로그인 성공한 것처럼 잘못 응답 방지)
    try {
      issueToken(res, { sub: emp.id, name: emp.name, role, level, rememberMe }, rememberMe);
    } catch (err: any) {
      return res.status(500).json({ error: "인증 시스템 설정 오류 · 관리자에게 문의 (JWT_SECRET 미설정)", detail: err?.message });
    }
    return res.status(200).json({ id: emp.id, name: emp.name, role, level, rank: emp.rank ?? null });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 거래처 로그인 · 2026-08-09 규칙 기반 · 2026-08-16 사용자 재확정 · 핸드폰번호 + "00" 유지
//   · 관리자 비번 설정 필요 없음 · vendor.password_hash 조회·비교 X (규칙 기반)
//   · 예: phone "010-1234-5678" · 로그인 비번 = "0101234567800"
router.post("/api/auth/vendor-login", async (req, res) => {
  const parsed = VendorLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstZodError(parsed.error) });
  const { phone, password } = parsed.data;
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  const cleanPassword = String(password).replace(/[^0-9]/g, "");
  if (!cleanPhone) return res.status(400).json({ error: "핸드폰번호를 입력해주세요" });
  if (!cleanPassword) return res.status(400).json({ error: "비밀번호를 입력해주세요" });
  try {
    const { data: vendor, error } = await supabase
      .from("vendors")
      .select("id, company_name, contact_name")
      .eq("phone", cleanPhone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!vendor) return res.status(401).json({ error: "등록된 거래처를 찾을 수 없습니다" });
    const expected = cleanPhone + "00";
    if (cleanPassword !== expected) {
      return res.status(401).json({ error: "핸드폰번호 또는 비밀번호가 올바르지 않습니다" });
    }
    try {
      issueToken(res, { sub: vendor.id, name: vendor.company_name, role: "vendor", level: 0 }, false);
    } catch (err: any) {
      return res.status(500).json({ error: "인증 시스템 설정 오류 · 관리자에게 문의 (JWT_SECRET 미설정)", detail: err?.message });
    }
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

// 2026-08-16 · 보안 fix · 관리자(lv 9) 만 임의 직원 비밀번호 재설정 가능
//   이전: 인증 없이 employeeId 만 알면 누구든 · 심각한 취약점
//   현재: JWT 세션 · lv ≥ 9 필수 · 본인 비밀번호 변경은 change-password 사용
router.post("/api/auth/set-password", async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "인증이 필요합니다" });
  if ((session.level ?? 0) < 9) return res.status(403).json({ error: "관리자(lv 9) 만 사용 가능합니다" });
  const parsed = SetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstZodError(parsed.error) });
  const { employeeId, password } = parsed.data;
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) return res.status(400).json({ error: "유효한 employeeId 가 필요합니다" });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { error } = await supabase.from("employees").update({ password_hash }).eq("id", idNum);
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 로그아웃 — 서버 세션 쿠키 제거
router.post("/api/auth/logout", (_req, res) => {
  clearToken(res);
  return res.status(200).json({ ok: true });
});

// 2026-08-05 T3 · 세션 검증 · 부트 시 JWT 쿠키 유효성 체크용 (401 자동 로그아웃 트리거)
//   · JWT 있으면 { id, name, role, level } 반환 · 없거나 만료면 401
//   · 클라이언트 · 앱 부트 시 이 endpoint 호출 → 401 이면 localStorage 클리어 + LandingPage
router.get("/api/auth/me", (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET || "";
  if (!JWT_SECRET) {
    // JWT_SECRET 미설정 · 인증 시스템 비활성 · 세션 유지 (하위호환)
    return res.status(200).json({ authOff: true });
  }
  const cookieToken = req.cookies?.["mt_auth"] as string | undefined;
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  const token = cookieToken || bearerToken;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
    return res.status(200).json({
      id: decoded.sub,
      name: decoded.name,
      role: decoded.role,
      level: decoded.level,
    });
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
});

// 로그인한 직원 본인이 비밀번호 변경
router.post("/api/auth/change-password", async (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: firstZodError(parsed.error) });
  const { employeeId, currentPassword, newPassword } = parsed.data;
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) return res.status(400).json({ error: "유효한 직원 ID가 필요합니다" });
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
    // password_hash 는 bcrypt 비교 후 즉시 제거 — 이후 코드에서 실수로 직렬화되지 않도록 방어
    delete (emp as any).password_hash;
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
