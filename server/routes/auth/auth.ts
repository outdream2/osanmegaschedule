// 2026-08-16 · asyncHandler + HttpError + validateBody + shared schema 완전 적용
import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../../../src/supabase/client";
import { issueToken, clearToken, refreshAccessToken, JwtPayload, getSession, authorize, consumeSsoJti } from "../../middleware/requireAuth";
import { audit, auditContext } from "../../lib/auditLogger";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { badRequest, unauthorized, forbidden, notFound, HttpError } from "../../middleware/errorHandler";
// 2026-08-16 · shared 스키마 + 응답 DTO (서버·클라 공유 · 타입 duplicate 제거)
import { LoginSchema, VendorLoginSchema, SetPasswordSchema, ChangePasswordSchema, VendorChangePasswordSchema } from "../../../src/shared/schemas/auth";
import type { LoginResponse, VendorLoginResponse, RefreshResponse, AuthOkResponse } from "../../../src/shared/dtos/auth";

const router = Router();

router.post("/api/auth/login", validateBody(LoginSchema), asyncHandler(async (req, res) => {
  const { employee_id, password, rememberMe } = req.body;
  const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
  if (!phone) throw badRequest("핸드폰번호를 입력해주세요");
  const { data: emp, error } = await supabase
    .from("employees")
    .select("id, name, password_hash, level, rank")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!emp) throw new HttpError(401, "핸드폰번호를 찾을 수 없습니다");
  if (!emp.password_hash) throw new HttpError(401, "비밀번호가 설정되지 않았습니다");
  const ok = await bcrypt.compare(password, emp.password_hash);
  delete (emp as any).password_hash;
  if (!ok) {
    audit("LOGIN_FAIL", { ...auditContext(req), phone, reason: "wrong_password" }, "warn");
    throw unauthorized("핸드폰번호 또는 비밀번호가 올바르지 않습니다");
  }
  const level: number = emp.level ?? 1;
  if (level === 0) throw unauthorized("접근 권한이 없습니다");
  const role = level >= 9 ? "superadmin" : level >= 2 ? "manager" : "employee";
  try {
    issueToken(res, { sub: emp.id, name: emp.name, role, level, rememberMe }, Boolean(rememberMe));
  } catch (err: any) {
    throw new HttpError(500, "인증 시스템 설정 오류 · 관리자에게 문의 (JWT_SECRET 미설정)");
  }
  audit("LOGIN_SUCCESS", { ...auditContext(req), userId: emp.id, name: emp.name, level });
  const body: LoginResponse = { id: emp.id, name: emp.name, role, level, rank: emp.rank ?? null };
  res.status(200).json(body);
}));

// 거래처 로그인 · 직원 로그인과 동일 구조 · vendors.password_hash · bcrypt.compare
// 2026-09-02 · 사용자 지시 · 파생 규칙 (phone+"00") 완전 제거
//   · migration 20260902_vendors_password_hash.sql · password_hash 컬럼 · 기본 bcrypt('1234')
//   · ID 매칭 · manager_phone (담당자) 우선 · phone (대표) 하위호환
router.post("/api/auth/vendor-login", validateBody(VendorLoginSchema), asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const cleanPhone = String(phone).replace(/[^0-9]/g, "");
  if (!cleanPhone) throw badRequest("핸드폰번호를 입력해주세요");
  if (!password) throw badRequest("비밀번호를 입력해주세요");
  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("id, company_name, contact_name, phone, manager_phone, password_hash")
    .or(`manager_phone.eq.${cleanPhone},phone.eq.${cleanPhone}`)
    .limit(1);
  if (error) throw new HttpError(500, error.message);
  const vendor = vendors?.[0] ?? null;
  if (!vendor) throw unauthorized("등록된 거래처를 찾을 수 없습니다");
  if (!vendor.password_hash) throw unauthorized("비밀번호가 설정되지 않았습니다. 관리자에게 문의하세요.");
  const ok = await bcrypt.compare(String(password), vendor.password_hash);
  delete (vendor as any).password_hash;
  if (!ok) {
    audit("VENDOR_LOGIN_FAIL", { ...auditContext(req), phone: cleanPhone, reason: "wrong_password" }, "warn");
    throw unauthorized("핸드폰번호 또는 비밀번호가 올바르지 않습니다");
  }
  try {
    issueToken(res, { sub: vendor.id, name: vendor.company_name, role: "vendor", level: 0 }, false);
  } catch {
    throw new HttpError(500, "인증 시스템 설정 오류 · 관리자에게 문의 (JWT_SECRET 미설정)");
  }
  audit("VENDOR_LOGIN_SUCCESS", { ...auditContext(req), vendorId: vendor.id, name: vendor.company_name });
  const body: VendorLoginResponse = {
    id: vendor.id,
    name: vendor.company_name,
    contactName: vendor.contact_name ?? "",
    role: "vendor",
    level: 0,
  };
  res.status(200).json(body);
}));

// 관리자(lv 9) 만 임의 직원 비밀번호 재설정 가능
// 2026-08-23 · #112-1 · authorize(9) 미들웨어 우선 · 프레임워크 표준 (in-body 게이트 이중 방어 유지)
router.post("/api/auth/set-password", authorize(9), validateBody(SetPasswordSchema), asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) throw unauthorized();
  if ((session.level ?? 0) < 9) throw forbidden("관리자(lv 9) 만 사용 가능합니다");
  const { employeeId, password } = req.body;
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) throw badRequest("유효한 employeeId 가 필요합니다");
  const password_hash = await bcrypt.hash(password, 12);
  const { error } = await supabase.from("employees").update({ password_hash }).eq("id", idNum);
  if (error) throw new HttpError(500, error.message);
  audit("PASSWORD_SET_BY_ADMIN", {
    actorId: session.sub, actorName: session.name,
    targetEmployeeId: idNum,
    ...auditContext(req),
  }, "warn");
  res.status(200).json({ ok: true });
}));

// 2026-08-29 · #174 · SSO · 다른 브라우저로 로그인 상태 이전
//   · POST /api/auth/sso-token · 인증된 세션 · 5분 만료 SSO 토큰 (typ='sso') · JSON 반환
//   · 사용 · window.open(url + '?sso={token}') · 새 브라우저에서 sso-consume 로 정식 쿠키 발급
router.post("/api/auth/sso-token", authorize(1), asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) throw unauthorized("로그인 필요");
  const JWT_SECRET = process.env.JWT_SECRET || "";
  if (!JWT_SECRET) throw new HttpError(500, "JWT_SECRET 미설정");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jwt = require("jsonwebtoken");
  // 2026-09-01 · jti 추가 · 재사용 방지 (consumeSsoJti)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require("crypto") as typeof import("crypto");
  const jti = randomUUID();
  const ssoToken = jwt.sign(
    { sub: session.sub, name: session.name, role: session.role, level: session.level, typ: "sso", jti },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: "5m" },
  );
  audit("SSO_TOKEN_ISSUE", { ...auditContext(req), userId: session.sub, name: session.name, jti });
  res.status(200).json({ token: ssoToken, expiresIn: 300 });
}));

// SSO 토큰 소비 · 새 브라우저에서 · 검증 후 정식 쿠키 발급
router.post("/api/auth/sso-consume", asyncHandler(async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  if (!token) throw badRequest("SSO 토큰 필요");
  const JWT_SECRET = process.env.JWT_SECRET || "";
  if (!JWT_SECRET) throw new HttpError(500, "JWT_SECRET 미설정");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jwt = require("jsonwebtoken");
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
  } catch {
    throw unauthorized("SSO 토큰 만료 또는 무효");
  }
  if (decoded.typ !== "sso") throw unauthorized("SSO 토큰 타입 오류");
  // 2026-09-01 · jti 재사용 방지 · 동일 SSO 토큰 두 번 이상 소비 시 401
  const jti = (decoded as any).jti;
  if (!jti) throw unauthorized("SSO 토큰 형식 오류 (jti 없음)");
  if (consumeSsoJti(String(jti))) {
    audit("SSO_REPLAY_BLOCKED", { ...auditContext(req), jti, userId: decoded.sub }, "warn");
    throw unauthorized("SSO 토큰이 이미 사용되었습니다");
  }
  try {
    issueToken(res, { sub: decoded.sub, name: decoded.name, role: decoded.role, level: decoded.level }, false);
  } catch {
    throw new HttpError(500, "인증 시스템 설정 오류");
  }
  audit("SSO_CONSUME", { ...auditContext(req), userId: decoded.sub, name: decoded.name });
  const body: LoginResponse = { id: decoded.sub, name: decoded.name, role: decoded.role, level: decoded.level, rank: null };
  res.status(200).json(body);
}));

// Refresh · access 만료 시 · refresh 로 새 access 재발급
router.post("/api/auth/refresh", asyncHandler(async (req, res) => {
  const payload = refreshAccessToken(req, res);
  if (!payload) throw new HttpError(401, "refresh 토큰 만료 · 재로그인 필요", "REFRESH_EXPIRED");
  const body: RefreshResponse = { id: payload.sub, name: payload.name, role: payload.role, level: payload.level };
  res.status(200).json(body);
}));

// 로그아웃 · 서버 세션 쿠키 제거
router.post("/api/auth/logout", asyncHandler(async (_req, res) => {
  clearToken(res);
  const body: AuthOkResponse = { ok: true };
  res.status(200).json(body);
}));

// 세션 검증 · 부트 시 JWT 쿠키 유효성 · 401 자동 로그아웃 트리거
router.get("/api/auth/me", asyncHandler(async (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET || "";
  if (!JWT_SECRET) {
    res.status(200).json({ authOff: true });
    return;
  }
  const cookieToken = req.cookies?.["mt_auth"] as string | undefined;
  const authHeader = req.headers["authorization"];
  const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  const token = cookieToken || bearerToken;
  if (!token) throw new HttpError(401, "no_token");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
    res.status(200).json({
      id: decoded.sub,
      name: decoded.name,
      role: decoded.role,
      level: decoded.level,
    });
  } catch {
    throw new HttpError(401, "invalid_token");
  }
}));

// 로그인한 직원 본인이 비밀번호 변경
// 2026-08-29 · S1 · IDOR 방지 · authorize(1) + sub===employeeId 검증 (관리자 lv9 는 예외)
router.post("/api/auth/change-password", authorize(1), validateBody(ChangePasswordSchema), asyncHandler(async (req, res) => {
  const { employeeId, currentPassword, newPassword } = req.body;
  const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
  if (!idNum || isNaN(idNum)) throw badRequest("유효한 직원 ID가 필요합니다");
  // 본인만 변경 가능 · 관리자(lv 9) 는 별도 SetPasswordSchema 경로 사용
  const session = getSession(req);
  if (session && Number(session.sub) !== idNum && (session.level ?? 0) < 9) {
    throw forbidden("본인 계정만 변경 가능");
  }
  if (currentPassword === newPassword) throw badRequest("새 비밀번호가 현재 비밀번호와 동일합니다");
  const { data: emp, error } = await supabase
    .from("employees")
    .select("id, password_hash")
    .eq("id", idNum)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!emp) throw notFound("직원을 찾을 수 없습니다");
  if (!emp.password_hash) throw badRequest("비밀번호가 설정되어 있지 않습니다. 관리자에게 문의하세요.");
  const ok = await bcrypt.compare(currentPassword, emp.password_hash);
  delete (emp as any).password_hash;
  if (!ok) throw unauthorized("현재 비밀번호가 올바르지 않습니다");
  const password_hash = await bcrypt.hash(newPassword, 12);
  const { error: updErr } = await supabase
    .from("employees")
    .update({ password_hash })
    .eq("id", idNum);
  if (updErr) throw new HttpError(500, updErr.message);
  audit("PASSWORD_CHANGED", { ...auditContext(req), userId: idNum }, "info");
  res.status(200).json({ ok: true });
}));

// 2026-09-02 · 거래처 본인 비밀번호 변경 · 직원 change-password 대응
//   · 세션 role=vendor · sub=vendor.id 만 접근 · authorize(0) + role gate
router.post("/api/auth/vendor-change-password", authorize(0), validateBody(VendorChangePasswordSchema), asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) throw unauthorized();
  if (session.role !== "vendor") throw forbidden("거래처 세션만 사용 가능합니다");
  const vendorId = Number(session.sub);
  if (!vendorId || isNaN(vendorId)) throw badRequest("세션 vendor id 오류");
  const { currentPassword, newPassword } = req.body;
  if (currentPassword === newPassword) throw badRequest("새 비밀번호가 현재 비밀번호와 동일합니다");
  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id, password_hash")
    .eq("id", vendorId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!vendor) throw notFound("거래처를 찾을 수 없습니다");
  if (!vendor.password_hash) throw badRequest("비밀번호가 설정되어 있지 않습니다. 관리자에게 문의하세요.");
  const ok = await bcrypt.compare(currentPassword, vendor.password_hash);
  delete (vendor as any).password_hash;
  if (!ok) throw unauthorized("현재 비밀번호가 올바르지 않습니다");
  const password_hash = await bcrypt.hash(newPassword, 12);
  const { error: updErr } = await supabase.from("vendors").update({ password_hash }).eq("id", vendorId);
  if (updErr) throw new HttpError(500, updErr.message);
  audit("VENDOR_PASSWORD_CHANGED", { ...auditContext(req), vendorId }, "info");
  res.status(200).json({ ok: true });
}));

export default router;
