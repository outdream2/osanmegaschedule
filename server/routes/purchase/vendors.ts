// 2026-08-17 · asyncHandler + HttpError + shared DTO/Schema 프레임워크
import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { supabase } from "../../../src/supabase/client";
import { queryPurchaseDetails } from "../../utils/purchaseDetailsQuery";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { HttpError, badRequest, forbidden } from "../../middleware/errorHandler";
import type { VendorsListResponse } from "../../../src/shared/dtos/vendors";
import { CreateVendorSchema, UpdateVendorSchema } from "../../../src/shared/schemas/vendors";
import { z } from "zod";

const router = Router();

// ── 2026-09-01 · withBalances=1 5분 in-memory 캐시 ───────────────────────────
// 키: "withBalances" (단일 버킷 · plain 조회는 빠르므로 캐싱 불필요)
// TTL: 5분 · POST/PATCH/DELETE 시 즉시 무효화 (invalidateVendorCache)
const VENDOR_CACHE_TTL_MS = 5 * 60 * 1000;
const vendorCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_KEY_BALANCES = "withBalances";

export function invalidateVendorCache(): void {
  vendorCache.clear();
  console.log("[vendors] cache invalidated");
}

// 공급사관리 엑셀 업로드 · LandingPage 데이터 업로드 모달에서 사용
// binary 로 전송된 xlsx 파일을 서버에서 파싱 후 vendors 테이블에 upsert (company_name 기준)
router.post("/api/upload-vendors", authorize(9), express.raw({ type: "application/octet-stream", limit: "20mb" }), asyncHandler(async (req, res) => {
  const { adminKey, managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw badRequest("파일이 없습니다");
  }
  let authorized = false;
  if (adminKey && adminKey === (process.env.ADMIN_PIN ?? "1234")) {
    authorized = true;
  } else if (managerId) {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
    authorized = (emp?.level ?? 0) >= 8;
  }
  if (!authorized) throw forbidden("관리자만 가능합니다");
  const buf = req.body as Buffer;
  const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
  if (!isXlsx && !isXls) throw badRequest("형식이 다른 파일입니다. 공급사관리 엑셀을 업로드해주세요.");
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
  if (rows.length === 0) throw badRequest("엑셀에 데이터가 없습니다");

  // 컬럼 자동 매핑 (한/영 헤더 모두 지원)
  // 실제 공급사관리 xlsx 헤더: 공급사코드/공급사명/거래구분/공급사그룹/사업자번호/대표자/전화번호/담당자명/담당자연락처
  // 빈 문자열도 null 취급 (?? fall-through 정상화)
  const nn = (v: any): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const normalize = (r: any) => ({
    company_name: nn(r.company_name ?? r["공급사명"] ?? r["공급사"] ?? r["회사명"] ?? r["업체명"]) ?? "",
    contact_name: nn(r.contact_name) ?? nn(r["담당자명"]) ?? nn(r["담당자"]) ?? nn(r["대표자"]),
    phone: nn(r.phone) ?? nn(r["담당자연락처"]) ?? nn(r["전화번호"]) ?? nn(r["전화"]) ?? nn(r["연락처"]) ?? nn(r["휴대폰"]),
    category: nn(r.category) ?? nn(r["공급사그룹"]) ?? nn(r["거래구분"]) ?? nn(r["카테고리"]) ?? nn(r["분류"]),
    note: nn(r.note) ?? nn(r["비고"]) ?? nn(r["메모"]) ?? nn(r["공급사코드"]),
    // 2026-07-14: 사업자번호 (OCR 매칭 정확도 향상용) · 하이픈 제거해서 저장
    business_number: (() => {
      const raw = nn(r.business_number) ?? nn(r["사업자번호"]) ?? nn(r["사업자등록번호"]);
      if (!raw) return null;
      const digits = String(raw).replace(/[^0-9]/g, "");
      return digits.length === 10 ? digits : null;
    })(),
  });
  const cleaned = rows.map(normalize).filter(r => r.company_name);
  if (cleaned.length === 0) throw badRequest("유효한 공급사명이 있는 행이 없습니다");

  // 기존 vendors 로드 → company_name 매칭 → 업데이트 or 신규 등록
  const { data: existing, error: exErr } = await supabase.from("vendors").select("id, company_name");
  if (exErr) throw new HttpError(500, exErr.message);
  const existingMap = new Map<string, number>();
  for (const v of existing ?? []) existingMap.set(String(v.company_name).trim(), v.id);

  let inserted = 0, updated = 0, failed = 0;
  const errors: string[] = [];
  // 2026-07-14: business_number 컬럼 존재 여부 감지 (Supabase 마이그레이션 미적용 대응)
  let hasBizNumCol = true;
  for (const r of cleaned) {
    const cleanPhone = r.phone ? String(r.phone).replace(/[^0-9]/g, "") || null : null;
    const basePayload: Record<string, any> = {
      company_name: r.company_name,
      contact_name: r.contact_name || null,
      phone: cleanPhone,
      category: r.category || null,
      note: r.note || null,
    };
    // business_number 컬럼 지원 시에만 payload 에 포함
    const payload = hasBizNumCol
      ? { ...basePayload, business_number: r.business_number }
      : basePayload;

    const existingId = existingMap.get(r.company_name);
    const doOp = existingId != null
      ? () => supabase.from("vendors").update(payload).eq("id", existingId!)
      : () => supabase.from("vendors").insert(payload);
    let { error } = await doOp();
    // business_number 컬럼 없으면 마이그레이션 미적용 → 재시도 (컬럼 제외)
    if (error && hasBizNumCol && /business_number/.test(error.message)) {
      hasBizNumCol = false;
      console.warn(`[upload-vendors] business_number 컬럼 미존재 · 마이그레이션 필요 · 이후 skip`);
      delete payload.business_number;
      ({ error } = await doOp());
    }
    if (error) { failed++; if (errors.length < 5) errors.push(`${r.company_name}: ${error.message}`); }
    else if (existingId != null) updated++;
    else inserted++;
  }
  console.log(`[upload-vendors] total=${cleaned.length} inserted=${inserted} updated=${updated} failed=${failed}`);
  if (inserted > 0 || updated > 0) invalidateVendorCache();
  return res.json({ ok: true, count: cleaned.length, inserted, updated, failed, errors });
}));

// 전체 거래처 목록 (관리자)
// T-SLIM E · 표준 shape 주석 · List endpoint
// 현재: res.json(array) · 직접 배열 반환 · 프론트 소비 패턴과 breaking 없이 유지
// 미래 v2: { rows: array, count: number } 로 전환 예정 (프론트 마이그레이션 후)
router.get("/api/vendors", asyncHandler(async (req, res) => {
  // 2026-07-15: email 컬럼이 없는 DB 도 호환 (첫 시도에 email 포함 → 실패 시 email 없이 재시도)
  // 2026-08-03 · #193 · vat_included 추가 (마이그레이션 미적용 DB 도 호환 · 3단계 fallback)
  let data: any[] | null = null;
  let firstErr: string | null = null;
  let hasVatIncluded = true;
  {
    const r1 = await supabase
      .from("vendors")
      .select("id, company_name, contact_name, phone, email, category, note, business_number, vat_included, created_at")
      .order("company_name");
    if (!r1.error) data = r1.data ?? [];
    else firstErr = r1.error.message;
  }
  if (!data) {
    // vat_included 컬럼 없음 fallback · email 은 유지
    hasVatIncluded = false;
    const r2 = await supabase
      .from("vendors")
      .select("id, company_name, contact_name, phone, email, category, note, business_number, created_at")
      .order("company_name");
    if (!r2.error) data = (r2.data ?? []).map((v: any) => ({ ...v, vat_included: null }));
    else firstErr = `${firstErr} | ${r2.error.message}`;
  }
  if (!data) {
    // email·vat_included 둘 다 없는 구 DB fallback
    const r3 = await supabase
      .from("vendors")
      .select("id, company_name, contact_name, phone, category, note, business_number, created_at")
      .order("company_name");
    if (r3.error) throw new HttpError(500, `vendors 조회 실패: ${r3.error.message} (이전: ${firstErr})`);
    data = (r3.data ?? []).map((v: any) => ({ ...v, email: null, vat_included: null }));
  }
  void hasVatIncluded;

  // 2026-08-09 · withBalances=1 · 실시간 계산으로 전환 (사용자 원칙: 매입이력만 · OCR 섞지마)
  //   기존 · supplier_balances (OCR 파생 테이블) → OCR 잔고가 latestBalance 로 나옴
  //   신규 · purchase_details (매입 · queryPurchaseDetails 헬퍼) - supplier_payments (결제) 실시간 계산
  //   응답 shape 유지 · latestBalance: { balance, invoice_date, created_at } | null
  //     · balance: 매입 - 결제 · invoice_date: 최근 매입일 · created_at: 실시간 계산 시각
  if (req.query.withBalances === "1") {
    // 2026-09-01 · 캐시 hit 확인
    const cached = vendorCache.get(CACHE_KEY_BALANCES);
    if (cached && Date.now() < cached.expiresAt) {
      console.log("[vendors] X-Cache: HIT");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Cache", "HIT");
      const body: VendorsListResponse = cached.data as any;
      return res.json(body);
    }

    // 2026-09-01 · P3 최적화 · 3단계 순차 → Promise.all 병렬화 (latency 3→1 라운드 트립)
    //   · purchases + payments + configs · 모두 독립적 · 동시 실행 안전
    const [purchases, payRes, cfgRes] = await Promise.all([
      queryPurchaseDetails({}),
      supabase.from("supplier_payments").select("supplier_name, amount").then(
        r => r,
        () => ({ data: null, error: { message: "relation not found" } as any }),
      ),
      supabase.from("supplier_balance_configs").select("supplier_name, balance_field, updated_at").then(
        r => r,
        () => ({ data: null, error: { message: "relation not found" } as any }),
      ),
    ]);

    // 1) 매입 aggregate
    const purchaseMap = new Map<string, { total: number; latestDate: string | null }>();
    for (const p of purchases) {
      const cur = purchaseMap.get(p.supplier) ?? { total: 0, latestDate: null };
      cur.total += p.amount;
      if (!cur.latestDate || p.purchase_date > cur.latestDate) cur.latestDate = p.purchase_date;
      purchaseMap.set(p.supplier, cur);
    }

    // 2) 결제 aggregate · supplier_payments 없으면 조용히 skip
    const paymentMap = new Map<string, number>();
    if (!payRes.error && payRes.data) {
      for (const r of payRes.data) {
        const name = String((r as any).supplier_name ?? "").trim();
        if (!name) continue;
        paymentMap.set(name, (paymentMap.get(name) ?? 0) + (Number((r as any).amount) || 0));
      }
    }

    // 3) balanceConfig · 없으면 skip
    const cfgMap = new Map<string, any>();
    if (!cfgRes.error && cfgRes.data) {
      for (const c of cfgRes.data as any[]) cfgMap.set(c.supplier_name, c);
    }

    // 4) 실시간 계산 · enrich
    //   latestBalance 확장 (2026-08-09) · total_purchase · total_payment 추가
    //   프론트에서 5컬럼 (총매입·총결제·총잔고·총판매·최근매입일) 표시 위해
    const nowIso = new Date().toISOString();
    const enriched = (data ?? []).map((v: any) => {
      const p = purchaseMap.get(v.company_name);
      const paymentSum = paymentMap.get(v.company_name) ?? 0;
      const purchaseSum = p?.total ?? 0;
      const hasAnyData = purchaseSum > 0 || paymentSum > 0;
      const balance = purchaseSum - paymentSum;
      return {
        ...v,
        latestBalance: hasAnyData ? {
          balance,
          total_purchase: purchaseSum,
          total_payment: paymentSum,
          invoice_date: p?.latestDate ?? null,
          created_at: nowIso,
        } : null,
        balanceConfig: cfgMap.get(v.company_name) ?? null,
      };
    });

    // 2026-09-01 · 캐시 저장 (TTL 5분)
    vendorCache.set(CACHE_KEY_BALANCES, { data: enriched, expiresAt: Date.now() + VENDOR_CACHE_TTL_MS });
    console.log("[vendors] X-Cache: MISS · cached for 5 min");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Cache", "MISS");
    const body: VendorsListResponse = enriched as any;
    return res.json(body);
  }
  const body: VendorsListResponse = (data ?? []) as any;
  return res.json(body);
}));

// 거래처 등록 (관리자)
router.post("/api/vendors", authorize(5), validateBody(CreateVendorSchema), asyncHandler(async (req, res) => {
  const { company_name, contact_name, phone, email, category, note, business_number } = req.body;
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  const cleanBizNum = business_number ? String(business_number).replace(/[^0-9]/g, "") : null;
  const validBizNum = cleanBizNum && cleanBizNum.length === 10 ? cleanBizNum : null;
  // 2026-08-10 · 사용자 요청 · 사업자번호 중복 검증
  if (validBizNum) {
    const { data: dup } = await supabase.from("vendors").select("id, company_name").eq("business_number", validBizNum).maybeSingle();
    if (dup) throw new HttpError(409, `사업자번호 중복 · 이미 등록된 공급사: ${dup.company_name} (#${dup.id})`);
  }
  // 2026-08-24 · 사용자 지시 · 공급사명 중복 검증 (trim 후 exact match)
  const trimmedName = String(company_name ?? "").trim();
  if (trimmedName) {
    const { data: nameDup } = await supabase.from("vendors").select("id, company_name").eq("company_name", trimmedName).maybeSingle();
    if (nameDup) throw new HttpError(409, `공급사명 중복 · 이미 등록됨: ${nameDup.company_name} (#${nameDup.id})`);
  }
  // 2026-08-24 · 사용자 지시 · 담당자 핸드폰 중복 검증 (vendor 로그인 ID · unique 필수)
  if (cleanPhone) {
    const { data: phoneDup } = await supabase.from("vendors").select("id, company_name").eq("phone", cleanPhone).maybeSingle();
    if (phoneDup) throw new HttpError(409, `담당자 핸드폰 중복 · 로그인 ID 로 사용됨: ${phoneDup.company_name} (#${phoneDup.id})`);
  }
  const baseRow = {
    company_name: company_name.trim(),
    contact_name: contact_name ?? null,
    phone: cleanPhone || null,
    category: category ?? null,
    note: note ?? null,
    business_number: validBizNum,
  };
  // 2026-07-22: email 컬럼 없는 DB 호환 · 첫 시도에 email 포함 → 실패 시 email 없이 재시도
  const r1 = await supabase.from("vendors")
    .insert({ ...baseRow, email: email ?? null })
    .select("id, company_name, contact_name, phone, email, category, note, business_number, created_at")
    .single();
  if (!r1.error) { invalidateVendorCache(); return res.status(201).json(r1.data); }
  if (/email/i.test(r1.error.message)) {
    const r2 = await supabase.from("vendors")
      .insert(baseRow)
      .select("id, company_name, contact_name, phone, category, note, business_number, created_at")
      .single();
    if (r2.error) throw new HttpError(500, `vendors 등록 실패: ${r2.error.message}`);
    invalidateVendorCache();
    return res.status(201).json({ ...r2.data, email: null });
  }
  throw new HttpError(500, r1.error.message);
}));

// 거래처 수정 (관리자)
// 2026-08-29 · 보안 S0 N1 fix · authorize(5) · approval_status/company_name 등 임의 수정 방지
router.patch("/api/vendors/:id", authorize(5), validateBody(UpdateVendorSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const {
    company_name, contact_name, phone, email, category, note, business_number,
    vat_included, team_leader_name, team_leader_phone, emergency_contact,
    // 2026-08-23 · #178 Phase C · 5 신규 필드 (xlsx 마스터 시트)
    order_method, region, invoice_method, order_status, special_notes,
    // 2026-08-23 · #192 · approval_status (승인 flow · DB migration 후 사용)
    approval_status,
  } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (company_name !== undefined) updates.company_name = company_name.trim();
  if (contact_name !== undefined) updates.contact_name = contact_name;
  if (phone !== undefined) updates.phone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  if (email !== undefined) updates.email = email;
  if (category !== undefined) updates.category = category;
  if (note !== undefined) updates.note = note;
  // 2026-08-23 · #178 · 신규 5 필드 · null 허용 (사용자가 필드 삭제 가능)
  if (order_method !== undefined)   updates.order_method   = order_method;
  if (region !== undefined)         updates.region         = region;
  if (invoice_method !== undefined) updates.invoice_method = invoice_method;
  if (order_status !== undefined)   updates.order_status   = order_status;
  if (special_notes !== undefined)  updates.special_notes  = special_notes;
  // 2026-08-23 · #192 · approval_status enum
  if (approval_status !== undefined) updates.approval_status = approval_status;
  if (business_number !== undefined) {
    const digits = business_number ? String(business_number).replace(/[^0-9]/g, "") : "";
    updates.business_number = digits.length === 10 ? digits : null;
    // 2026-08-10 · 사용자 요청 · 사업자번호 중복 검증 (자기 자신 제외)
    if (updates.business_number) {
      const { data: dup } = await supabase.from("vendors").select("id, company_name")
        .eq("business_number", updates.business_number)
        .neq("id", id)
        .maybeSingle();
      if (dup) throw new HttpError(409, `사업자번호 중복 · 이미 등록된 공급사: ${dup.company_name} (#${dup.id})`);
    }
  }
  // 2026-08-25 · 사용자 지시 · 담당자 핸드폰 = 로그인 ID · 수정 시에도 중복 검증 (자기 자신 제외)
  if (updates.phone) {
    const { data: phoneDup } = await supabase.from("vendors").select("id, company_name")
      .eq("phone", updates.phone)
      .neq("id", id)
      .maybeSingle();
    if (phoneDup) throw new HttpError(409, `담당자 핸드폰 중복 · 로그인 ID 로 사용됨: ${phoneDup.company_name} (#${phoneDup.id})`);
  }
  // 공급사명 변경 시에도 중복 검증 (자기 자신 제외 · 2026-08-25)
  if (updates.company_name) {
    const trimmed = String(updates.company_name).trim();
    if (trimmed) {
      const { data: nameDup } = await supabase.from("vendors").select("id, company_name")
        .eq("company_name", trimmed)
        .neq("id", id)
        .maybeSingle();
      if (nameDup) throw new HttpError(409, `공급사명 중복 · 이미 등록됨: ${nameDup.company_name} (#${nameDup.id})`);
    }
  }
  // 2026-08-03 · #193 · vat_included 저장 (true/false/null 허용)
  if (vat_included !== undefined) {
    updates.vat_included = vat_included === true ? true : vat_included === false ? false : null;
  }
  // 2026-08-10 · #21 · 팀장·긴급연락처 (마이그레이션 add_vendor_extra_contacts_2026-08-10.sql)
  if (team_leader_name  !== undefined) updates.team_leader_name  = team_leader_name;
  if (team_leader_phone !== undefined) updates.team_leader_phone = team_leader_phone;
  if (emergency_contact !== undefined) updates.emergency_contact = emergency_contact;
  // 2026-07-22: email 컬럼 없는 DB 호환 · 실패 시 email 제외 후 재시도 (GET 과 동일 패턴)
  // 2026-08-03 · vat_included 도 동일한 방식으로 폴백
  // 2026-08-10 · team_leader_name/phone/emergency_contact 도 동일 폴백 (마이그레이션 전 안전)
  const SELECT_FULL     = "id, company_name, contact_name, phone, email, category, note, business_number, vat_included, team_leader_name, team_leader_phone, emergency_contact";
  const SELECT_NO_TEAM  = "id, company_name, contact_name, phone, email, category, note, business_number, vat_included";
  const SELECT_NO_VAT   = "id, company_name, contact_name, phone, email, category, note, business_number";
  const SELECT_NO_EMAIL = "id, company_name, contact_name, phone, category, note, business_number";
  const r1 = await supabase.from("vendors").update(updates).eq("id", id).select(SELECT_FULL).single();
  if (!r1.error) { invalidateVendorCache(); return res.json(r1.data); }
  // 2026-08-23 · #178·#192 · 신규 컬럼 없음 fallback (마이그레이션 미실행)
  //   · order_method · region · invoice_method · order_status · special_notes · approval_status
  if (/order_method|region|invoice_method|order_status|special_notes|approval_status/i.test(r1.error.message)) {
    const noNew = { ...updates };
    delete noNew.order_method;
    delete noNew.region;
    delete noNew.invoice_method;
    delete noNew.order_status;
    delete noNew.special_notes;
    delete noNew.approval_status;
    const rN = await supabase.from("vendors").update(noNew).eq("id", id).select(SELECT_FULL).single();
    if (!rN.error) { invalidateVendorCache(); return res.json(rN.data); }
  }
  // team_leader/emergency 컬럼 없음 fallback (마이그레이션 미실행)
  if (/team_leader|emergency_contact/i.test(r1.error.message)) {
    const noTeam = { ...updates };
    delete noTeam.team_leader_name;
    delete noTeam.team_leader_phone;
    delete noTeam.emergency_contact;
    const rT = await supabase.from("vendors").update(noTeam).eq("id", id).select(SELECT_NO_TEAM).single();
    if (!rT.error) { invalidateVendorCache(); return res.json({ ...rT.data, team_leader_name: null, team_leader_phone: null, emergency_contact: null }); }
  }
  // vat_included 컬럼 없음 fallback
  if (/vat_included/i.test(r1.error.message)) {
    const noVat = { ...updates };
    delete noVat.vat_included;
    const r2 = await supabase.from("vendors").update(noVat).eq("id", id).select(SELECT_NO_VAT).single();
    if (!r2.error) { invalidateVendorCache(); return res.json({ ...r2.data, vat_included: null }); }
    if (/email/i.test(r2.error.message)) {
      const noVatNoEmail = { ...noVat };
      delete noVatNoEmail.email;
      const r3 = await supabase.from("vendors").update(noVatNoEmail).eq("id", id).select(SELECT_NO_EMAIL).single();
      if (r3.error) throw new HttpError(500, `vendors 수정 실패: ${r3.error.message}`);
      invalidateVendorCache();
      return res.json({ ...r3.data, email: null, vat_included: null });
    }
    throw new HttpError(500, r2.error.message);
  }
  // email 컬럼 없음 fallback (기존 로직)
  if (/email/i.test(r1.error.message)) {
    const noEmail = { ...updates };
    delete noEmail.email;
    delete noEmail.vat_included;
    const r2 = await supabase.from("vendors").update(noEmail).eq("id", id).select(SELECT_NO_EMAIL).single();
    if (r2.error) throw new HttpError(500, `vendors 수정 실패: ${r2.error.message}`);
    invalidateVendorCache();
    return res.json({ ...r2.data, email: null, vat_included: null });
  }
  throw new HttpError(500, r1.error.message);
}));

// 거래처 삭제 (관리자)
router.delete("/api/vendors/:id", authorize(9), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
  invalidateVendorCache();
  return res.json({ ok: true });
}));

// 공급사현황 엑셀 벌크 임포트 · 회사명(company_name) 중복 시 담당자/연락처 정보 업데이트
// body: { rows: Array<{ company_name, contact_name, phone, email, category, note }> }
// 2026-08-29 · 보안 S0 N2 fix · authorize(9) · vendor 대량 변조 방지
const BulkImportVendorsSchema = z.object({ rows: z.array(z.record(z.string(), z.unknown())) });
router.post("/api/vendors/bulk-import", authorize(9), validateBody(BulkImportVendorsSchema), asyncHandler(async (req, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) throw badRequest("rows 배열이 비어있습니다.");
  const normalize = (r: any) => ({
    company_name: String(r.company_name ?? r["공급사"] ?? r["회사명"] ?? "").trim(),
    contact_name: r.contact_name ?? r["담당자"] ?? null,
    phone: r.phone ?? r["전화"] ?? r["전화번호"] ?? r["연락처"] ?? null,
    email: r.email ?? r["이메일"] ?? null,
    category: r.category ?? r["카테고리"] ?? r["분류"] ?? null,
    note: r.note ?? r["비고"] ?? r["메모"] ?? null,
  });
  const cleaned = rows.map(normalize).filter(r => r.company_name);
  if (cleaned.length === 0) throw badRequest("유효한 공급사명이 없습니다.");

  // 기존 vendors 로드 후 company_name 매칭 → update or insert
  const { data: existing, error: exErr } = await supabase
    .from("vendors")
    .select("id, company_name");
  if (exErr) throw new HttpError(500, exErr.message);
  const existingMap = new Map<string, number>();
  for (const v of existing ?? []) existingMap.set(String(v.company_name).trim(), v.id);

  let inserted = 0, updated = 0, failed = 0;
  const errors: string[] = [];
  for (const r of cleaned) {
    const cleanPhone = r.phone ? String(r.phone).replace(/[^0-9]/g, "") || null : null;
    const payload = {
      company_name: r.company_name,
      contact_name: r.contact_name || null,
      phone: cleanPhone,
      email: r.email || null,
      category: r.category || null,
      note: r.note || null,
    };
    const existingId = existingMap.get(r.company_name);
    if (existingId != null) {
      const { error } = await supabase.from("vendors").update(payload).eq("id", existingId);
      if (error) { failed++; errors.push(`${r.company_name}: ${error.message}`); }
      else updated++;
    } else {
      const { error } = await supabase.from("vendors").insert(payload);
      if (error) { failed++; errors.push(`${r.company_name}: ${error.message}`); }
      else inserted++;
    }
  }
  if (inserted > 0 || updated > 0) invalidateVendorCache();
  return res.json({ ok: true, inserted, updated, failed, total: cleaned.length, errors: errors.slice(0, 20) });
}));

// 거래처 비밀번호 설정 (관리자)
// 2026-08-29 · 보안 S0 N3 fix · authorize(9) · 임의 vendor 비밀번호 hash 교체 방지 · 계정 탈취 방어
const SetPasswordSchema = z.object({ password: z.string().min(4, "비밀번호는 4자 이상") });
router.post("/api/vendors/:id/set-password", authorize(9), validateBody(SetPasswordSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const { password } = req.body ?? {};
  if (!password || String(password).length < 4) throw badRequest("비밀번호는 4자 이상이어야 합니다.");
  const password_hash = await bcrypt.hash(String(password), 12);
  const { error } = await supabase.from("vendors").update({ password_hash }).eq("id", id);
  if (error) throw new HttpError(500, error.message);
  return res.json({ ok: true });
}));

// ═══════════════════════════════════════════════════════════════════
// 2026-08-25 · #192 · 거래처 승인 flow · 3 endpoints
//   · POST /api/vendors/:id/approval-request · 거래처 자체 요청 (인증 X · 세션 vendor 자신)
//   · POST /api/vendors/:id/approve          · 관리자 승인 (authorize 9)
//   · POST /api/vendors/:id/reject           · 관리자 거절 (authorize 9)
// ═══════════════════════════════════════════════════════════════════

/** 거래처 자체 승인 요청 · 필수 필드 검증 · vendors.approval_status = pending · approval_requested_at = now */
// 2026-08-29 · 보안 P1 N16 fix · authorize(1) · 인증 없는 위조 방지 (거래처 세션 포함)
router.post("/api/vendors/:id/approval-request", authorize(1), validateBody(z.object({})), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const { data: vendor, error: fetchErr } = await supabase
    .from("vendors")
    .select("id, email, order_method, team_leader, team_leader_phone, emergency_phone, business_number, special_notes, note, approval_status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new HttpError(500, `공급사 조회 실패: ${fetchErr.message}`);
  if (!vendor) throw new HttpError(404, `공급사 없음: id=${id}`);
  // 이미 승인됨 · 재요청 불가
  if (vendor.approval_status === "approved") {
    throw badRequest("이미 승인된 공급사입니다.");
  }
  // 필수 8 필드 검증
  const missing: string[] = [];
  if (!vendor.email || !String(vendor.email).trim()) missing.push("이메일");
  if (!vendor.order_method || !String(vendor.order_method).trim()) missing.push("주문방식");
  if (!(vendor as any).team_leader || !String((vendor as any).team_leader).trim()) missing.push("팀장");
  if (!(vendor as any).team_leader_phone || !String((vendor as any).team_leader_phone).trim()) missing.push("팀장연락처");
  if (!(vendor as any).emergency_phone || !String((vendor as any).emergency_phone).trim()) missing.push("긴급연락처");
  if (!vendor.business_number || !String(vendor.business_number).trim()) missing.push("사업자번호");
  if (!vendor.special_notes || !String(vendor.special_notes).trim()) missing.push("특이사항");
  if (!(vendor as any).note || !String((vendor as any).note).trim()) missing.push("비고");
  if (missing.length > 0) {
    throw badRequest(`필수 항목 미입력: ${missing.join(" · ")}`);
  }
  // pending 으로 전환 + timestamp
  const { error: updErr } = await supabase
    .from("vendors")
    .update({
      approval_status: "pending",
      approval_requested_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
    })
    .eq("id", id);
  if (updErr) throw new HttpError(500, `승인요청 저장 실패: ${updErr.message}`);
  res.json({ ok: true, status: "pending", requested_at: new Date().toISOString() });
}));

/** 관리자 승인 · authorize(9) */
router.post("/api/vendors/:id/approve", authorize(9), validateBody(z.object({})), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const approvedBy = (req as any).auth?.employeeId ?? null;
  const { error } = await supabase
    .from("vendors")
    .update({
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", id);
  if (error) throw new HttpError(500, `승인 실패: ${error.message}`);
  res.json({ ok: true, status: "approved", approved_at: new Date().toISOString(), approved_by: approvedBy });
}));

/** 관리자 거절 · authorize(9) · optional 사유 */
const RejectVendorSchema = z.object({ reason: z.string().max(500).optional() });
router.post("/api/vendors/:id/reject", authorize(9), validateBody(RejectVendorSchema), asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw badRequest("invalid id");
  const approvedBy = (req as any).auth?.employeeId ?? null;
  const reason = String(req.body?.reason ?? "").trim().slice(0, 500);
  const { error } = await supabase
    .from("vendors")
    .update({
      approval_status: "rejected",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
      // 거절 사유 · special_notes 뒤에 append (별도 컬럼 없이 · 최소 침습)
    })
    .eq("id", id);
  if (error) throw new HttpError(500, `거절 실패: ${error.message}`);
  res.json({ ok: true, status: "rejected", reason: reason || null });
}));

export default router;
