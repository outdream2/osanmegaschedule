import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import bcrypt from "bcryptjs";
import { supabase } from "../../src/supabase/client";

const router = Router();

// 공급사관리 엑셀 업로드 · LandingPage 데이터 업로드 모달에서 사용
// binary 로 전송된 xlsx 파일을 서버에서 파싱 후 vendors 테이블에 upsert (company_name 기준)
router.post("/api/upload-vendors", express.raw({ type: "application/octet-stream", limit: "20mb" }), async (req, res) => {
  const { adminKey, managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "파일이 없습니다" });
  }
  try {
    let authorized = false;
    if (adminKey && adminKey === (process.env.ADMIN_PIN ?? "1234")) {
      authorized = true;
    } else if (managerId) {
      const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
      authorized = (emp?.level ?? 0) >= 8;
    }
    if (!authorized) return res.status(403).json({ error: "관리자만 가능합니다" });
    const buf = req.body as Buffer;
    const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
    if (!isXlsx && !isXls) return res.status(400).json({ error: "형식이 다른 파일입니다. 공급사관리 엑셀을 업로드해주세요." });
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
    if (rows.length === 0) return res.status(400).json({ error: "엑셀에 데이터가 없습니다" });

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
    if (cleaned.length === 0) return res.status(400).json({ error: "유효한 공급사명이 있는 행이 없습니다" });

    // 기존 vendors 로드 → company_name 매칭 → 업데이트 or 신규 등록
    const { data: existing, error: exErr } = await supabase.from("vendors").select("id, company_name");
    if (exErr) throw new Error(exErr.message);
    const existingMap = new Map<string, number>();
    for (const v of (existing ?? []) as any[]) existingMap.set(String(v.company_name).trim(), v.id);

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
        delete (payload as any).business_number;
        ({ error } = await doOp());
      }
      if (error) { failed++; if (errors.length < 5) errors.push(`${r.company_name}: ${error.message}`); }
      else if (existingId != null) updated++;
      else inserted++;
    }
    console.log(`[upload-vendors] total=${cleaned.length} inserted=${inserted} updated=${updated} failed=${failed}`);
    return res.json({ ok: true, count: cleaned.length, inserted, updated, failed, errors });
  } catch (err: any) {
    console.error("[upload-vendors] error:", err.message);
    return res.status(500).json({ error: err.message ?? "업로드 실패" });
  }
});

// 전체 거래처 목록 (관리자)
router.get("/api/vendors", async (req, res) => {
  const { data, error } = await supabase
    .from("vendors")
    .select("id, company_name, contact_name, phone, email, category, note, business_number, created_at")
    .order("company_name");
  if (error) return res.status(500).json({ error: error.message });

  // 2026-07-14: withBalances=1 파라미터 · vendors 에 잔액/잔고 정보 첨부
  //   supplier_balances (최신값) + supplier_balance_configs (잔고 컬럼 지정) 조인
  if (req.query.withBalances === "1") {
    const [{ data: balances }, { data: configs }] = await Promise.all([
      supabase.from("supplier_balances").select("supplier_name, balance, invoice_date, created_at").order("created_at", { ascending: false }),
      supabase.from("supplier_balance_configs").select("supplier_name, balance_field, updated_at"),
    ]);
    // supplier_name → 최신 balance 매핑 (첫 등장이 최신)
    const latestBalMap = new Map<string, any>();
    for (const b of balances ?? []) {
      if (!latestBalMap.has(b.supplier_name)) latestBalMap.set(b.supplier_name, b);
    }
    const cfgMap = new Map<string, any>();
    for (const c of configs ?? []) cfgMap.set(c.supplier_name, c);

    const enriched = (data ?? []).map((v: any) => ({
      ...v,
      latestBalance: latestBalMap.get(v.company_name) ?? null,
      balanceConfig: cfgMap.get(v.company_name) ?? null,
    }));
    return res.json(enriched);
  }
  return res.json(data ?? []);
});

// 거래처 등록 (관리자)
router.post("/api/vendors", async (req, res) => {
  const { company_name, contact_name, phone, email, category, note, business_number } = req.body ?? {};
  if (!company_name?.trim()) return res.status(400).json({ error: "거래처명은 필수입니다." });
  const cleanPhone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  const cleanBizNum = business_number ? String(business_number).replace(/[^0-9]/g, "") : null;
  const validBizNum = cleanBizNum && cleanBizNum.length === 10 ? cleanBizNum : null;
  const { data, error } = await supabase
    .from("vendors")
    .insert({ company_name: company_name.trim(), contact_name: contact_name ?? null, phone: cleanPhone || null, email: email ?? null, category: category ?? null, note: note ?? null, business_number: validBizNum })
    .select("id, company_name, contact_name, phone, email, category, note, business_number, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

// 거래처 수정 (관리자)
router.patch("/api/vendors/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "invalid id" });
  const { company_name, contact_name, phone, email, category, note, business_number } = req.body ?? {};
  const updates: Record<string, any> = {};
  if (company_name !== undefined) updates.company_name = company_name.trim();
  if (contact_name !== undefined) updates.contact_name = contact_name;
  if (phone !== undefined) updates.phone = phone ? String(phone).replace(/[^0-9]/g, "") : null;
  if (email !== undefined) updates.email = email;
  if (category !== undefined) updates.category = category;
  if (note !== undefined) updates.note = note;
  if (business_number !== undefined) {
    const digits = business_number ? String(business_number).replace(/[^0-9]/g, "") : "";
    updates.business_number = digits.length === 10 ? digits : null;
  }
  const { data, error } = await supabase.from("vendors").update(updates).eq("id", id)
    .select("id, company_name, contact_name, phone, email, category, note, business_number").single();
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

// 공급사현황 엑셀 벌크 임포트 · 회사명(company_name) 중복 시 담당자/연락처 정보 업데이트
// body: { rows: Array<{ company_name, contact_name, phone, email, category, note }> }
router.post("/api/vendors/bulk-import", async (req, res) => {
  const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ error: "rows 배열이 비어있습니다." });
  const normalize = (r: any) => ({
    company_name: String(r.company_name ?? r["공급사"] ?? r["회사명"] ?? "").trim(),
    contact_name: r.contact_name ?? r["담당자"] ?? null,
    phone: r.phone ?? r["전화"] ?? r["전화번호"] ?? r["연락처"] ?? null,
    email: r.email ?? r["이메일"] ?? null,
    category: r.category ?? r["카테고리"] ?? r["분류"] ?? null,
    note: r.note ?? r["비고"] ?? r["메모"] ?? null,
  });
  const cleaned = rows.map(normalize).filter(r => r.company_name);
  if (cleaned.length === 0) return res.status(400).json({ error: "유효한 공급사명이 없습니다." });

  // 기존 vendors 로드 후 company_name 매칭 → update or insert
  const { data: existing, error: exErr } = await supabase
    .from("vendors")
    .select("id, company_name");
  if (exErr) return res.status(500).json({ error: exErr.message });
  const existingMap = new Map<string, number>();
  for (const v of (existing ?? []) as any[]) existingMap.set(String(v.company_name).trim(), v.id);

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
  return res.json({ ok: true, inserted, updated, failed, total: cleaned.length, errors: errors.slice(0, 20) });
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
