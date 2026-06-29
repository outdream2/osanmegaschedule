// server.ts
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import express from "express";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { scheduleController } from "./src/controllers/scheduleController";
import { supabase } from "./src/supabase/client";
import bcrypt from "bcryptjs";
import webpush from "web-push";
import XLSX from "xlsx";
import compression from "compression";

// ── Product map cache ─────────────────────────────────────────────────────────
type GeminiResult = { ok: true; text: string } | { ok: false; quota: boolean; error: string };
interface ProductInfo { code: string; name: string; spec: string; [key: string]: any; }
let productMapCache: Record<string, ProductInfo> | null = null;
let productMapPromise: Promise<Record<string, ProductInfo>> | null = null;
let synonymMapCache: Map<string, string> | null = null;
let synonymMapPromise: Promise<Map<string, string>> | null = null;

const COL_KEYS = [
  "product_code","product_name","col_i","product_type","origin","spec",
  "purchase_price","sale_price","profit_rate","delivery_price","delivery_profit_rate",
  "sale_status","app_registered","image_registered","preset_registered","preset_group",
  "promotion_name","promotion_priority","promotion_purchase_price","promotion_sale_price",
  "promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type",
  "current_stock","stock_amount","optimal_stock","last_purchase_date","last_sale_date",
  "category_code","category","operator","last_modified_at","registered_at",
  "min_order","point_rate","sales_commission","delivery_margin_rate","search_keywords",
  "unit","total_volume","unit_volume","unit_price","connection_type","individual_code","individual_quantity",
] as const;

function xlsxToRows(buf: Buffer): Record<string, any>[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) as any[][];
  const result: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const obj: Record<string, any> = {};
    for (let c = 0; c < COL_KEYS.length; c++) {
      const v = row[c];
      obj[COL_KEYS[c]] = (v !== undefined && v !== null && String(v).trim() !== "") ? String(v).trim() : null;
    }
    result.push(obj);
  }
  return result;
}

function rowsToCSV(rows: Record<string, any>[]): string {
  const headers = [...COL_KEYS];
  const esc = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))];
  return lines.join("\n");
}

async function getProductMap(): Promise<Record<string, ProductInfo>> {
  if (productMapCache) return productMapCache;
  if (productMapPromise) return productMapPromise;
  productMapPromise = (async () => {
    const PAGE = 1000;
    const map: Record<string, ProductInfo> = {};
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products").select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const code = String(row.product_code ?? "").trim();
        if (!code) continue;
        const info: ProductInfo = { code, name: row.product_name ?? "", spec: row.spec ?? "", ...row };
        map[code] = info;
        const stripped = code.replace(/^0+/, "");
        if (stripped && stripped !== code && !map[stripped]) map[stripped] = info;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    productMapCache = map;
    return map;
  })();
  return productMapPromise;
}

async function getSynonymMap(): Promise<Map<string, string>> {
  if (synonymMapCache) return synonymMapCache;
  if (synonymMapPromise) return synonymMapPromise;
  synonymMapPromise = (async () => {
    const { data, error } = await supabase.from("ocr_synonyms").select("alias,product_code");
    if (error) { synonymMapPromise = null; return new Map(); }
    const map = new Map<string, string>();
    for (const row of (data ?? [])) {
      map.set(String(row.alias).trim().toLowerCase(), String(row.product_code).trim());
    }
    synonymMapCache = map;
    return map;
  })();
  return synonymMapPromise;
}

// ── Korean invoice text parser (Tesseract raw text → structured data) ────────
function parseKoreanInvoice(text: string): {
  headers: string[]; rows: (string | number | null)[][]; meta: any; rawText?: string;
} {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 1);
  const meta: Record<string, any> = {};

  // Date
  const dateM = text.match(/(\d{4})[년.\-\/]\s*(\d{1,2})[월.\-\/]\s*(\d{1,2})[일]?/);
  if (dateM) meta.date = `${dateM[1]}-${dateM[2].padStart(2,"0")}-${dateM[3].padStart(2,"0")}`;

  // Supplier / Recipient
  const supM = text.match(/공\s*급\s*[자처사]\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (supM) meta.supplier = supM[1].trim().replace(/\s{2,}.*$/, "");
  const recM = text.match(/공\s*급\s*받\s*는\s*자?\s*[:\s]*([가-힣a-zA-Z0-9()（）\s]{2,20})/);
  if (recM) meta.recipient = recM[1].trim().replace(/\s{2,}.*$/, "");

  // Total (max of all candidate amounts)
  const totals: number[] = [];
  for (const pat of [/합\s*계[^\d]*(\d[\d,]+)/, /총\s*금\s*액[^\d]*(\d[\d,]+)/, /공\s*급\s*가\s*액[^\d]*(\d[\d,]+)/]) {
    const m = text.match(pat);
    if (m) totals.push(parseInt(m[1].replace(/,/g, "")));
  }
  if (totals.length > 0) meta.total = Math.max(...totals);

  // Table header detection
  const KW = ["품목","품명","상품명","수량","단가","금액","규격","단위","공급가액","세액","적요","번호","No"];
  let hIdx = -1;
  let headers: string[] = [];
  let useSingleSpaceSplit = false;

  // Try splitting by 2+ spaces or tabs first (preserves single spaces inside column names)
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    const hits = parts.filter(p => KW.some(k => p.includes(k))).length;
    if (hits >= 2 && parts.length >= 3) { hIdx = i; headers = parts; break; }
  }

  // Fallback 1: Try splitting by any whitespace for header line
  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      const hits = parts.filter(p => KW.some(k => p.includes(k))).length;
      if (hits >= 2 && parts.length >= 3) {
        hIdx = i;
        headers = parts;
        useSingleSpaceSplit = true;
        break;
      }
    }
  }

  // Fallback 2: Check lines for any header keywords (more loose check)
  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.some(p => KW.some(k => p.includes(k)))) {
        hIdx = i; headers = parts; break;
      }
    }
  }

  // Fallback 3: Loose check with single space split
  if (hIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3 && parts.some(p => KW.some(k => p.includes(k)))) {
        hIdx = i;
        headers = parts;
        useSingleSpaceSplit = true;
        break;
      }
    }
  }

  if (hIdx === -1 || headers.length === 0) {
    return { headers: ["원문 텍스트"], rows: lines.map(l => [l]), meta, rawText: text };
  }

  // 숫자로 취급하는 헤더 컬럼명
  const NUMERIC_KW = ["번호","수량","단가","금액","공급가액","세액"];
  const numericIdxs = headers.map((h, i) => NUMERIC_KW.some(k => h.includes(k)) ? i : -1).filter(i => i >= 0);
  const textIdxs    = headers.map((_, i) => i).filter(i => !numericIdxs.includes(i));

  const isNumToken = (t: string) => /^[\d,]+(\.\d+)?$/.test(t.trim());

  const toVal = (s: string): string | number | null => {
    if (!s) return null;
    const c = s.replace(/,/g, "");
    const n = parseFloat(c);
    return (!isNaN(n) && /^-?\d+(\.\d+)?$/.test(c)) ? n : s;
  };

  /**
   * 핵심 수정: 숫자 우정렬 스마트 분할
   * 거래명세서 특성상 우측 컬럼(수량·단가·금액)은 숫자,
   * 좌측 컬럼(품명·규격)은 텍스트이므로 토큰을 그 방향으로 배정.
   */
  function smartAlign(tokens: string[], H: number): string[] {
    const result = new Array(H).fill("");
    if (tokens.length === 0) return result;

    // 우측: 숫자처럼 생긴 토큰을 숫자 컬럼에 오른쪽부터 채움
    const numToks = [...tokens].reverse().filter(isNumToken).slice(0, numericIdxs.length).reverse();
    const textToks = tokens.slice(0, tokens.length - numToks.length);

    for (let j = 0; j < numericIdxs.length; j++) {
      result[numericIdxs[j]] = numToks[j] ?? "";
    }
    // 좌측: 텍스트 토큰을 텍스트 컬럼에 배정 (품명이 여러 토큰이면 첫 텍스트 컬럼에 합침)
    if (textIdxs.length > 0) {
      if (textToks.length <= textIdxs.length) {
        textToks.forEach((t, j) => { result[textIdxs[j]] = t; });
      } else {
        // 토큰이 텍스트 컬럼보다 많으면 마지막 텍스트 컬럼 이전까지 1:1, 나머지는 첫 컬럼에 합침
        const overflowCount = textToks.length - textIdxs.length;
        result[textIdxs[0]] = textToks.slice(0, overflowCount + 1).join(" ");
        for (let j = 1; j < textIdxs.length; j++) {
          result[textIdxs[j]] = textToks[overflowCount + j] ?? "";
        }
      }
    }
    return result;
  }

  const rows: (string | number | null)[][] = [];

  for (let i = hIdx + 1; i < lines.length; i++) {
    if (/^[-=*─━]+$/.test(lines[i].trim())) continue;        // 구분선
    if (/합계|소계|총계|합 계/.test(lines[i]) && !/품/.test(lines[i])) continue; // 합계행

    // 1) 엄격 분할 (2+공백/탭)
    let parts = lines[i].split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    // 2) 불충분하면 단일공백 분할로 재시도
    if (parts.length < 2 || useSingleSpaceSplit) {
      const loose = lines[i].split(/\s+/).map(p => p.trim()).filter(Boolean);
      if (loose.length > parts.length) parts = loose;
    }
    if (parts.length < 1) continue;

    const H = headers.length;
    const P = parts.length;
    let alignedParts: string[];

    if (P === H) {
      alignedParts = parts;
    } else if (P > H) {
      alignedParts = smartAlign(parts, H);
    } else {
      // P < H: 숫자 우정렬로 배정 (단순 left-pad 제거)
      alignedParts = smartAlign(parts, H);
    }

    const row = alignedParts.map(toVal);
    if (row.every(v => v === null || v === "")) continue;
    rows.push(row);
  }

  if (rows.length === 0) return { headers: ["원문 텍스트"], rows: lines.map(l => [l]), meta, rawText: text };
  return { headers, rows, meta };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // real_map 컬럼 존재 확인 — 없으면 Supabase 대시보드에서 추가 필요
  (async () => {
    const { error } = await supabase.from("products").select("real_map").limit(1);
    if (error && /column|does not exist/i.test(error.message)) {
      console.warn("[SETUP REQUIRED] Supabase products 테이블에 real_map 컬럼이 없습니다.");
      console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 실행하세요:");
      console.warn("  ALTER TABLE products ADD COLUMN IF NOT EXISTS \"real_map\" TEXT;");
    }
  })();

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@osanmegatown.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  app.use(compression());
  app.use(express.json({ limit: "200mb" }));

  // API router endpoints
  app.get("/api/schedules", (req, res) => scheduleController.getSchedules(req, res));
  app.put("/api/schedules", (req, res) => scheduleController.updateSchedule(req, res));
  app.post("/api/schedules/batch", (req, res) => scheduleController.batchUpdateSchedules(req, res));
  app.post("/api/schedules/copy", (req, res) => scheduleController.copySchedules(req, res));
  app.post("/api/employees", (req, res) => scheduleController.createEmployee(req, res));
  app.put("/api/employees/:id", (req, res) => scheduleController.updateEmployee(req, res));
  app.delete("/api/employees/:id", (req, res) => scheduleController.deleteEmployee(req, res));

  // GET /api/staff-availability?date=YYYY-MM-DD — schedule status for core employees
  // Configure via .env STAFF_IDS=1:대표,2:이사,3:부장
  const STAFF_LIST = (process.env.STAFF_IDS ?? "1:대표,2:이사,3:부장")
    .split(",").map(e => { const [id, name] = e.split(":"); return { id: parseInt(id.trim()), name: name?.trim() ?? "" }; })
    .filter(s => !isNaN(s.id) && s.id > 0);
  const OFF_TYPES = ["휴무", "월차", "지정휴무", "오전반차", "오후반차"];
  app.get("/api/staff-availability", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId, type")
        .eq("date", date)
        .in("employeeId", STAFF_LIST.map(s => s.id));
      if (error) throw new Error(error.message);
      const result = STAFF_LIST.map(({ id, name }) => {
        const row = (data ?? []).find((r: any) => r.employeeId === id);
        const scheduleType: string | null = row?.type ?? null;
        return { employeeId: id, name, scheduleType, isOff: scheduleType ? OFF_TYPES.includes(scheduleType) : false };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/staff-monthly?year=YYYY&month=M — monthly off dates for employees 1,2,3
  app.get("/api/staff-monthly", async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: "year and month required" });
    }
    const monthStr = String(month).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}-`;
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId, date, type")
        .like("date", `${datePrefix}%`)
        .in("employeeId", STAFF_LIST.map(s => s.id));
      if (error) throw new Error(error.message);
      const result: Record<string, string[]> = {};
      for (const row of (data ?? [])) {
        if (!OFF_TYPES.includes(row.type)) continue;
        const staff = STAFF_LIST.find(s => s.id === row.employeeId);
        if (!staff) continue;
        if (!result[row.date]) result[row.date] = [];
        result[row.date].push(staff.name);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/settings?key=xxx — app settings (wages etc.)
  app.get("/api/settings", async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
    try {
      const { data, error } = await supabase
        .from("app_settings").select("value").eq("key", key).maybeSingle();
      if (error) throw new Error(error.message);
      res.json({ value: data?.value ?? null });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/settings — upsert app setting
  app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body ?? {};
    if (!key) return res.status(400).json({ error: "key required" });
    try {
      const { error } = await supabase.from("app_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/zones — zone assignments
  app.get("/api/zones", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("zone_assignments")
        .select("zone_id, employee_id, employee_name, status, products");
      if (error) throw new Error(error.message);
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/zones — upsert zone assignments
  app.post("/api/zones", async (req, res) => {
    const { zones } = req.body ?? {};
    if (!Array.isArray(zones)) return res.status(400).json({ error: "zones array required" });
    try {
      const rows = zones.map((z: any) => ({
        zone_id: String(z.zone_id),
        employee_id: z.employee_id ?? null,
        employee_name: z.employee_name ?? "",
        status: z.status ?? "normal",
        products: z.products ?? "",
      }));
      const { error } = await supabase
        .from("zone_assignments")
        .upsert(rows, { onConflict: "zone_id" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/blocked-slots?date=YYYY-MM-DD
  app.get("/api/blocked-slots", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") return res.status(400).json({ error: "date required" });
    try {
      const { data, error } = await supabase.from("app_settings").select("value")
        .eq("key", `blocked_slots_${date}`).maybeSingle();
      if (error) throw new Error(error.message);
      res.json((data?.value as Record<string, string[]>) ?? {});
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/blocked-slots — toggle a slot blocked/unblocked
  app.post("/api/blocked-slots", async (req, res) => {
    const { date, staffName, time, blocked } = req.body ?? {};
    if (!date || !staffName || !time) {
      return res.status(400).json({ error: "date, staffName, time required" });
    }
    const key = `blocked_slots_${date}`;
    try {
      const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
      const current: Record<string, string[]> = (data?.value as Record<string, string[]>) ?? {};
      if (!current[staffName]) current[staffName] = [];
      if (blocked) {
        if (!current[staffName].includes(time)) current[staffName].push(time);
      } else {
        current[staffName] = current[staffName].filter((t: string) => t !== time);
      }
      const { error } = await supabase.from("app_settings")
        .upsert({ key, value: current, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/products-map — full product map (client caches and searches locally)
  app.get("/api/products-map", async (_req, res) => {
    try {
      const map = await getProductMap();
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/upload-products — manager or superadmin; raw xlsx binary → bulk-imports to products table
  app.post("/api/upload-products", express.raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
    const { adminKey, managerId } = req.query as Record<string, string>;
    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "파일이 없습니다" });
    }
    try {
      let authorized = false;
      if (adminKey && adminKey === (process.env.ADMIN_PIN ?? "1234")) {
        authorized = true;
      } else if (managerId) {
        const { data: emp } = await supabase.from("employees").select("is_manager").eq("id", Number(managerId)).maybeSingle();
        authorized = !!emp?.is_manager;
      }
      if (!authorized) return res.status(403).json({ error: "관리자만 가능합니다" });
      const buf = req.body as Buffer;
      // Validate Excel magic bytes: xlsx=PK\x03\x04, xls=OLE2 D0CF11E0
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
      const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
      if (!isXlsx && !isXls) return res.status(400).json({ error: "형식이 다른 파일입니다. 상품리스트를 업로드해주세요." });
      // Validate column count using header row
      const wbCheck = XLSX.read(buf, { sheetRows: 1 });
      const wsCheck = wbCheck.Sheets[wbCheck.SheetNames[0]];
      const headerRow = (XLSX.utils.sheet_to_json<any[]>(wsCheck, { header: 1 })[0] ?? []) as any[];
      if (headerRow.length < COL_KEYS.length) {
        return res.status(400).json({ error: "형식이 다른 파일입니다. 상품리스트를 업로드해주세요." });
      }
      const rows = xlsxToRows(buf);
      if (rows.length === 0) return res.status(400).json({ error: "엑셀에 데이터가 없습니다" });
      console.log(`[upload] parsed ${rows.length} rows`);
      // Upsert: update existing rows, insert new ones (conflict on product_code)
      console.log(`[upload] upserting ${rows.length} rows in chunks...`);
      const CHUNK_SIZE = 500;
      const chunks: Record<string, any>[][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));
      const PARALLEL = 3;
      for (let i = 0; i < chunks.length; i += PARALLEL) {
        const batch = chunks.slice(i, i + PARALLEL);
        const results = await Promise.all(
          batch.map(chunk => supabase.from("products").upsert(chunk, { onConflict: "product_code" }))
        );
        for (const { error: upsertErr } of results) {
          if (upsertErr) {
            console.error("[upload] upsert error:", upsertErr);
            throw new Error(`업서트 실패: ${upsertErr.message}`);
          }
        }
        console.log(`[upload] upserted chunks ${i + 1}~${Math.min(i + PARALLEL, chunks.length)} / ${chunks.length}`);
      }
      console.log(`[upload] upsert done`);
      productMapCache = null;
      productMapPromise = null;
      // Append to import log (keep last 20)
      const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
      const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
      const newEntry = { timestamp: new Date().toISOString(), count: rows.length };
      const logs = [newEntry, ...prevLogs].slice(0, 20);
      await supabase.from("app_settings").upsert({ key: "product_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });
      res.json({ ok: true, count: rows.length, timestamp: newEntry.timestamp });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/product-import-log — clear import history
  app.delete("/api/product-import-log", async (_req, res) => {
    await supabase.from("app_settings").upsert({ key: "product_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
    res.json({ ok: true });
  });

  // GET /api/products/:code — single product lookup by barcode code
  app.get("/api/products/:code", async (req, res) => {
    const code = (req.params.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code required" });
    try {
      let { data, error } = await supabase.from("products").select("*").eq("product_code", code).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data && /^0+/.test(code)) {
        const stripped = code.replace(/^0+/, "");
        const r2 = await supabase.from("products").select("*").eq("product_code", stripped).maybeSingle();
        if (r2.error) throw new Error(r2.error.message);
        data = r2.data;
      }
      if (!data) return res.status(404).json({ error: "상품을 찾을 수 없습니다" });
      res.json({ ...data, realMap: data.real_map ?? null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/products/realmap-check — real_map 컬럼 존재 여부 진단
  app.get("/api/products/realmap-check", async (_req, res) => {
    const { data, error } = await supabase.from("products").select("real_map").limit(1);
    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message,
        fix: "Supabase SQL Editor에서 실행: ALTER TABLE products ADD COLUMN IF NOT EXISTS \"real_map\" TEXT;",
      });
    }
    res.json({ ok: true, sample: data?.[0]?.real_map ?? null });
  });

  // PATCH /api/products/:code/realmap — update real_map for a product
  app.patch("/api/products/:code/realmap", async (req, res) => {
    const code = (req.params.code ?? "").trim();
    const { realMap } = req.body ?? {};  // 프론트는 realMap 키로 전송
    if (!code) return res.status(400).json({ error: "code required" });
    try {
      const { error } = await supabase.from("products").update({ real_map: realMap }).eq("product_code", code);
      if (error) {
        console.error("[realmap PATCH] Supabase error:", error.message, "code:", code);
        return res.status(500).json({ error: error.message });
      }
      productMapCache = null;
      productMapPromise = null;
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[realmap PATCH] exception:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── requests/pending-counts ───────────────────────────────────────────────────
  app.get("/api/requests/pending-counts", async (_req, res) => {
    const [display, order, mismatch, leave] = await Promise.all([
      supabase.from("display_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("order_requests").select("id", { count: "exact", head: true }),
      supabase.from("zone_mismatches").select("id", { count: "exact", head: true }),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    res.json({
      display:  display.count  ?? 0,
      order:    order.count    ?? 0,
      mismatch: mismatch.count ?? 0,
      leave:    leave.count    ?? 0,
      total: (display.count ?? 0) + (order.count ?? 0) + (mismatch.count ?? 0) + (leave.count ?? 0),
    });
  });

  // ── display_requests ──────────────────────────────────────────────────────────
  app.get("/api/display-requests", async (_req, res) => {
    const { data, error } = await supabase
      .from("display_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/display-requests", async (req, res) => {
    const b = req.body ?? {};
    const { data, error } = await supabase
      .from("display_requests")
      .insert([{
        zone_id: String(b.zone_id ?? ""),
        zone_label: String(b.zone_label ?? ""),
        category: String(b.category ?? ""),
        requested_at: b.requested_at ? new Date(b.requested_at).toISOString() : new Date().toISOString(),
        assigned_staff_id: b.assigned_staff_id ? Number(b.assigned_staff_id) : null,
        assigned_staff_name: String(b.assigned_staff_name ?? ""),
        note: String(b.note ?? ""),
        status: "pending",
      }])
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, id: data?.id });
  });

  app.delete("/api/display-requests/:id", async (req, res) => {
    const { error } = await supabase.from("display_requests").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── order_requests ─────────────────────────────────────────────────────────
  app.get("/api/order-requests", async (_req, res) => {
    const { data, error } = await supabase
      .from("order_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/order-requests", async (req, res) => {
    const b = req.body ?? {};
    const { error } = await supabase.from("order_requests").insert([{
      product_code: String(b.product_code ?? ""),
      product_name: String(b.product_name ?? ""),
      current_stock: b.current_stock != null ? Number(b.current_stock) : null,
      optimal_stock: b.optimal_stock != null ? Number(b.optimal_stock) : null,
      note: String(b.note ?? ""),
    }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  app.delete("/api/order-requests/:id", async (req, res) => {
    const { error } = await supabase.from("order_requests").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── zone_mismatches ────────────────────────────────────────────────────────
  app.get("/api/zone-mismatches", async (_req, res) => {
    const { data, error } = await supabase
      .from("zone_mismatches")
      .select("*")
      .order("registered_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  app.post("/api/zone-mismatches", async (req, res) => {
    const b = req.body ?? {};
    const { error } = await supabase.from("zone_mismatches").upsert([{
      product_code: String(b.product_code ?? ""),
      product_name: String(b.product_name ?? ""),
      spec_zone: String(b.spec_zone ?? ""),
      real_zone: String(b.real_zone ?? ""),
    }], { onConflict: "product_code" });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // more specific route must come before /:id
  app.delete("/api/zone-mismatches/by-code/:code", async (req, res) => {
    const code = decodeURIComponent(req.params.code ?? "").trim();
    if (!code) return res.status(400).json({ error: "code required" });
    const { error } = await supabase.from("zone_mismatches").delete().eq("product_code", code);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  app.delete("/api/zone-mismatches/:id", async (req, res) => {
    const { error } = await supabase.from("zone_mismatches").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { employee_id, password } = req.body ?? {};
    const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
    if (!phone || !password) {
      return res.status(400).json({ error: "전화번호와 비밀번호를 입력해주세요" });
    }
    try {
      const { data: emp, error } = await supabase
        .from("employees")
        .select("id, name, password_hash, is_manager")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!emp) {
        return res.status(401).json({ error: "전화번호를 찾을 수 없습니다", debug: "no_employee" });
      }
      if (!emp.password_hash) {
        return res.status(401).json({ error: "비밀번호가 설정되지 않았습니다", debug: "no_hash" });
      }
      const ok = await bcrypt.compare(password, emp.password_hash);
      if (!ok) return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
      const role = emp.is_manager ? "manager" : "employee";
      return res.status(200).json({ id: emp.id, name: emp.name, role });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/set-password
  app.post("/api/auth/set-password", async (req, res) => {
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

  // POST /api/push-subscribe
  app.post("/api/push-subscribe", async (req, res) => {
    const { employeeId, subscription } = req.body ?? {};
    if (!employeeId || !subscription) return res.status(400).json({ error: "employeeId and subscription are required" });
    try {
      const { error } = await supabase.from("employees").update({ push_subscription: subscription }).eq("id", employeeId);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/push-send
  app.post("/api/push-send", async (req, res) => {
    const { employeeId, title, body, url } = req.body ?? {};
    if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("push_subscription, name")
        .eq("id", employeeId)
        .single();
      if (error || !data) return res.status(404).json({ error: "Employee not found" });
      if (!data.push_subscription) return res.status(200).json({ ok: false, reason: "no_subscription" });
      const payload = JSON.stringify({
        title: title ?? "진열 보충 요청",
        body: body ?? `${data.name}님께 새로운 진열 보충 요청이 도착했습니다.`,
        url: url ?? "/",
        tag: `req-${employeeId}-${Date.now()}`,
      });
      await webpush.sendNotification(data.push_subscription as webpush.PushSubscription, payload);
      return res.json({ ok: true });
    } catch (err: any) {
      if ((err as any).statusCode === 410) {
        await supabase.from("employees").update({ push_subscription: null }).eq("id", employeeId);
        return res.json({ ok: false, reason: "subscription_expired" });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/leave-stats?year=YYYY — count of 월차 per employee for the year
  app.get("/api/leave-stats", async (req, res) => {
    const { year } = req.query;
    if (!year || typeof year !== "string") return res.status(400).json({ error: "year required" });
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId")
        .like("date", `${year}-%`)
        .eq("type", "월차");
      if (error) throw new Error(error.message);
      const counts: Record<number, number> = {};
      for (const row of (data ?? [])) {
        const id = row.employeeId as number;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return res.json(counts);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Leave Requests ────────────────────────────────────────────────────────────
  // GET /api/leave-requests — manager: all, employee: own (requires ?employeeId=N)
  app.get("/api/leave-requests", async (req, res) => {
    const { employeeId, all } = req.query;
    try {
      let q = supabase.from("leave_requests").select("*").order("created_at", { ascending: false });
      if (all !== "true" && employeeId) {
        q = q.eq("employee_id", Number(employeeId));
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return res.json(data ?? []);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/leave-requests/pending-count — for badge display
  app.get("/api/leave-requests/pending-count", async (_req, res) => {
    try {
      const { count, error } = await supabase
        .from("leave_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return res.json({ count: count ?? 0 });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/leave-requests — employee submits
  app.post("/api/leave-requests", async (req, res) => {
    const { employee_id, employee_name, leave_type, start_date, end_date, reason } = req.body ?? {};
    if (!employee_id || !employee_name || !leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
    }
    try {
      const { data, error } = await supabase.from("leave_requests").insert([{
        employee_id: Number(employee_id),
        employee_name,
        leave_type,
        start_date,
        end_date,
        reason: reason ?? "",
        status: "pending",
      }]).select().single();
      if (error) throw new Error(error.message);

      // Push notification → all managers
      const { data: managers } = await supabase
        .from("employees")
        .select("id, push_subscription")
        .eq("is_manager", true);
      if (managers) {
        await Promise.allSettled(managers
          .filter(m => m.push_subscription)
          .map(m => webpush.sendNotification(
            m.push_subscription as webpush.PushSubscription,
            JSON.stringify({
              title: "연차 신청 도착",
              body: `${employee_name}님이 ${leave_type}을(를) 신청했습니다.`,
              url: "/",
              tag: `leave-new-${data?.id}`,
            })
          ).catch(() => null))
        );
      }

      return res.status(201).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/leave-requests/:id — manager approves or rejects
  app.put("/api/leave-requests/:id", async (req, res) => {
    const { status, reviewer_note } = req.body ?? {};
    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
    }
    try {
      const { data, error } = await supabase
        .from("leave_requests")
        .update({ status, reviewer_note: reviewer_note ?? "", reviewed_at: new Date().toISOString() })
        .eq("id", req.params.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ error: "not found" });

      // Push notification → requesting employee
      const { data: emp } = await supabase
        .from("employees")
        .select("push_subscription")
        .eq("id", data.employee_id)
        .maybeSingle();
      if (emp?.push_subscription) {
        const label = status === "approved" ? "승인" : "반려";
        await webpush.sendNotification(
          emp.push_subscription as webpush.PushSubscription,
          JSON.stringify({
            title: `연차 신청 ${label}`,
            body: `${data.leave_type} 신청이 ${label}되었습니다.${reviewer_note ? ` (${reviewer_note})` : ""}`,
            url: "/",
            tag: `leave-reviewed-${data.id}`,
          })
        ).catch(() => null);
      }

      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/leave-requests/:id — employee cancels pending request
  app.delete("/api/leave-requests/:id", async (req, res) => {
    try {
      const { error } = await supabase
        .from("leave_requests")
        .delete()
        .eq("id", req.params.id)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/reservations
  app.get("/api/reservations", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    const { data, error } = await supabase
      .from("reservations")
      .select("time, note, purpose, company, contact_name, phone")
      .eq("date", date);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  });

  // POST /api/reservations
  app.post("/api/reservations", async (req, res) => {
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
      .from("reservations")
      .select("note")
      .eq("date", date)
      .eq("time", time);
    const isAlreadyBooked = (existing ?? []).some((r: any) => getTarget(r.note ?? "") === targetToBook);
    if (isAlreadyBooked) return res.status(409).json({ error: "이미 예약된 시간입니다." });
    const { error } = await supabase.from("reservations").insert({
      date, time, company, contact_name: contactName, phone, purpose, note: note || "",
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  });

  // ── POST /api/ocr — 거래명세서 OCR (Tesseract 무료 / Gemini 유료) ───────────

  // ── 거래명세서 표준 컬럼 정의 ───────────────────────────────────────────────
  const INVOICE_SCHEMA = [
    { name: "번호",  re: /^(번호|no\.?|순번)$/i },
    { name: "일자",  re: /발행\s*일자|전표\s*일자|월\s*일|거래\s*일자|발행\s*일|거래\s*일|^일자$|^날짜$/ },
    { name: "품명",  re: /^품$|^명$|^품목$|품\s*명|품\s*목|상품\s*명|제품\s*명/ },
    { name: "규격",  re: /규\s*격|사양/ },
    { name: "단위",  re: /단\s*위/ },
    { name: "수량",  re: /수\s*량|매수/ },
    { name: "단가",  re: /단\s*가/ },
    { name: "금액",  re: /금\s*액|공급가액|총\s*매출\s*액/ },
    { name: "세액",  re: /세\s*액|부가세/ },
    { name: "비고",  re: /비고|적요/ },
  ] as const;

  // "품"+"명" 처럼 두 셀로 쪼개진 복합 헤더를 병합
  function mergeAdjacentHeaders(
    headers: string[],
    rows: (string | number | null)[][]
  ): { headers: string[]; rows: (string | number | null)[][] } {
    const COMPOUNDS: [string, string, string][] = [
      ["품", "명", "품명"], ["품", "목", "품목"], ["상품", "명", "상품명"],
      ["수", "량", "수량"], ["단", "가", "단가"], ["금", "액", "금액"],
      ["세", "액", "세액"], ["규", "격", "규격"], ["단", "위", "단위"],
      ["비", "고", "비고"],
      ["발행", "일자", "발행일자"], ["전표", "일자", "전표일자"], ["월", "일", "월일"],
      ["거래", "일자", "거래일자"], ["발행", "일", "발행일"],
      ["총매출", "액", "총매출액"],
    ];
    const mergeAt = new Set<number>();
    const merged = [...headers];
    for (let i = 0; i < merged.length - 1; i++) {
      const a = merged[i].trim(), b = merged[i + 1].trim();
      for (const [p1, p2, result] of COMPOUNDS) {
        if (a === p1 && b === p2) { merged[i] = result; mergeAt.add(i + 1); break; }
      }
    }
    if (mergeAt.size === 0) return { headers, rows };
    const keep = headers.map((_, i) => i).filter(i => !mergeAt.has(i));
    const pairs = new Map<number, number>();
    for (const mi of mergeAt) pairs.set(mi - 1, mi);
    const outRows = rows.map(row => {
      const r = [...row];
      for (const [ai, bi] of pairs) {
        if (bi < row.length && row[bi] != null && String(row[bi]).trim()) {
          r[ai] = r[ai] != null ? `${String(r[ai])} ${String(row[bi])}`.trim() : row[bi];
        }
      }
      return keep.map(i => r[i]);
    });
    return { headers: keep.map(i => merged[i]), rows: outRows };
  }

  // OCR이 추출한 컬럼명을 표준 거래명세서 컬럼으로 정규화 + 순서 정렬
  function normalizeInvoiceCols(
    headers: string[],
    rows: (string | number | null)[][]
  ): { headers: string[]; rows: (string | number | null)[][] } {
    const mapping = INVOICE_SCHEMA
      .map(s => ({ std: s.name, oi: headers.findIndex(h => s.re.test(h.trim().replace(/\s+/g, ""))) }))
      .filter(m => m.oi >= 0);

    const usedIdx = new Set(mapping.map(m => m.oi));
    const extra = headers.map((h, i) => ({ h, i })).filter(({ i }) => !usedIdx.has(i));

    const outHeaders = [...mapping.map(m => m.std), ...extra.map(e => e.h)];
    const outRows    = rows.map(row => [
      ...mapping.map(m => row[m.oi]),
      ...extra.map(e => row[e.i]),
    ]);
    return { headers: outHeaders, rows: outRows };
  }

  // ── 품명에서 규격 분리 ───────────────────────────────────────────────────────
  // 단위 정규식: 용량(mg/g/mL/L/IU…), 개수(T/C/정/캡슐/포/개/EA), 크기(NxN mm/cm)
  const SPEC_UNIT_RE =
    /^(\d+(?:[./]\d+)*)\s*(mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?$/i;

  function parseSpecFromName(raw: string): { name: string; spec: string | null } {
    const s = raw.trim();

    // 1. 마지막 괄호/대괄호: "이름(규격)" — 복수 괄호면 마지막만 취함
    const bracketM = s.match(/^(.*?)\s*[(\[]([\d\w./×xX\s%μ]+)[)\]]\s*$/);
    if (bracketM) {
      const cand = bracketM[2].trim();
      if (SPEC_UNIT_RE.test(cand))
        return { name: bracketM[1].trim(), spec: cand };
    }

    // 2. 공백 뒤 규격: "이름 500mg" / "이름 80/5mg" / "이름 50×70mm"
    //    (.+?) 비탐욕적 → 규격 패턴이 시작하는 마지막 공백 기준 분리
    const spaceM = s.match(/^(.+?)\s+(\d[\d./]*\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea)(?:\s*[×xX]\s*\d+\s*(?:mm|cm|m)?)?)$/i);
    if (spaceM) {
      const cand = spaceM[2].trim();
      if (SPEC_UNIT_RE.test(cand))
        return { name: spaceM[1].trim(), spec: cand };
    }

    // 3. 붙임형: "알파리포산600mg" — 이름 끝에 공백 없이 숫자+단위
    //    이름이 숫자로 끝나지 않아야 함 (Q10, 오메가3 같은 케이스 방지)
    const glueM = s.match(/^(.+?)(\d+(?:[./]\d+)?\s*(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|T|C|정|캡슐|포|개|EA|ea))$/i);
    if (glueM && /\D$/.test(glueM[1])) {
      return { name: glueM[1].trim(), spec: glueM[2].trim() };
    }

    return { name: s, spec: null };
  }

  function extractSpecFromName(
    headers: string[],
    rows: (string | number | null)[][]
  ): { headers: string[]; rows: (string | number | null)[][] } {
    const nameI = headers.indexOf("품명");
    if (nameI < 0) return { headers, rows };

    let specI = headers.indexOf("규격");
    let outHeaders = headers;

    // 규격 컬럼이 아예 없으면 품명 바로 뒤에 추가
    if (specI < 0) {
      outHeaders = [...headers.slice(0, nameI + 1), "규격", ...headers.slice(nameI + 1)];
      specI = nameI + 1;
    }

    const outRows = rows.map(row => {
      const nameCellRaw = row[nameI];
      if (typeof nameCellRaw !== "string" || !nameCellRaw.trim()) return row;

      // 규격이 이미 있으면 스킵
      const existing = row[specI];
      if (existing != null && String(existing).trim()) return row;

      const { name, spec } = parseSpecFromName(nameCellRaw);
      if (!spec) return row;

      const r = [...row];
      // 헤더가 늘었으면(규격 컬럼 신규 삽입) 새 슬롯 삽입
      if (r.length < outHeaders.length) r.splice(specI, 0, null);
      r[nameI] = name;
      r[specI] = spec;
      return r;
    });

    return { headers: outHeaders, rows: outRows };
  }

  // 금액 = 수량 × 단가 자동 보정
  function fixAmounts(
    headers: string[],
    rows: (string | number | null)[][]
  ): (string | number | null)[][] {
    const qI = headers.indexOf("수량");
    const pI = headers.indexOf("단가");
    const aI = headers.indexOf("금액");
    if (qI < 0 || pI < 0 || aI < 0) return rows;
    return rows.map(row => {
      const q = typeof row[qI] === "number" ? row[qI] as number : null;
      const p = typeof row[pI] === "number" ? row[pI] as number : null;
      const a = typeof row[aI] === "number" ? row[aI] as number : null;
      if (q != null && p != null && a == null) {
        const r = [...row]; r[aI] = q * p; return r;
      }
      return row;
    });
  }

  // ── Gemini API — 키 순환 ──────────────────────────────────────────────────
  const GEMINI_MODEL = "gemini-2.5-flash-lite";
  let geminiRoundRobinIdx = 0;

  const GEMINI_OCR_PROMPT = `당신은 한국 거래명세서·납품서·세금계산서 전문 OCR 분석 엔진입니다.
이미지에서 품목 표 데이터를 정확히 추출하여 JSON으로 반환하세요.

[문서 구조]
- 상단: 공급자/공급받는자 상호, 날짜, 사업자번호
- 중단: 품목 표 (번호·품명·규격·단위·수량·단가·금액·세액·비고 등)
- 하단: 공급가액 합계, 세액 합계, 총합계

[추출 규칙]
1. 헤더 아래 품목 행만 rows로 추출하세요
2. 합계·소계·총계·총합·계 등이 포함된 행은 rows에서 제외하세요
3. 숫자는 쉼표 제거 후 숫자형으로 반환 (예: "1,500" → 1500, "3개" → 3)
4. 비거나 읽을 수 없는 셀은 null
5. 이미지가 흐리거나 기울어져 있어도 최선을 다해 판독하세요
6. 한글이 뭉개진 경우 문맥으로 추론하세요

[컬럼명 표준화 — 반드시 아래 표준명 사용]
- 품명/품목/상품명/제품명 → "품명"
- 규격/사양/스펙 → "규격"
- 금액/공급가액/총매출액/순매출액/매출액 → "금액"
- 세액/부가세/VAT → "세액"
- 수량/매수/qty → "수량"
- 단가/단위가격/price → "단가"
- 단위/UOM → "단위"
- 비고/적요/메모 → "비고"
- 일자/날짜/발행일/거래일 → "일자"

[규격 분리 규칙 — 중요]
- 문서에 규격 컬럼이 없거나 품명에 규격이 붙어 있으면 분리하여 "규격" 컬럼에 기입하세요
- 규격 패턴: 숫자+단위 (mg·g·ml·L·IU·T·C·정·캡슐·포·EA 등), 분수형 (5/50mg), 크기 (50×70mm)
- 예) "비타민C 500mg" → 품명:"비타민C", 규격:"500mg"
- 예) "아모잘탄정 5/50mg" → 품명:"아모잘탄정", 규격:"5/50mg"
- 예) "포카리스웨트(500ml)" → 품명:"포카리스웨트", 규격:"500ml"
- 예) "홍삼정 60캡슐" → 품명:"홍삼정", 규격:"60캡슐"

[메타데이터]
- date: YYYY-MM-DD 형식 (찾을 수 없으면 null)
- supplier: 거래명세서 왼쪽 박스(공급자/판매자 측) 상호명만 기입. 오른쪽 박스(공급받는자/구매처/약국)는 절대 기입 금지. (없으면 null)
- total: 총합계 숫자 (없으면 null)

마크다운·설명 없이 JSON만 응답:
{"headers":["품명","규격","단위","수량","단가","금액","세액"],"rows":[["비타민C","500mg","EA",10,1500,15000,1500],["아모잘탄정","5/50mg","정",5,2000,10000,1000]],"meta":{"supplier":"(주)공급사","date":"2024-01-15","total":26500}}`;

  // 폴백 키 포함 — env 키 우선, 없으면 하드코딩 키 시도
  function getGeminiKeys(): string[] {
    const seen = new Set<string>();
    const keys: string[] = [];
    const push = (k: string | undefined) => { if (k && !seen.has(k)) { seen.add(k); keys.push(k); } };
    push(process.env.GEMINI_API_KEY);
    for (let i = 1; i <= 20; i++) {
      push(process.env[`GEMINI_API_KEY_${i}`]);   // GEMINI_API_KEY_1
      push(process.env[`GEMINI_API_KEY${i}`]);     // GEMINI_API_KEY1
    }
    return keys;
  }

  function getMistralKeys(): string[] {
    const keys: string[] = [];
    if (process.env.MISTRAL_API_KEY) keys.push(process.env.MISTRAL_API_KEY);
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`MISTRAL_API_KEY_${i}`];
      if (k) keys.push(k);
    }
    return keys;
  }

  async function callMistralOcr(b64: string, mimeType: string, apiKey: string): Promise<GeminiResult> {
    try {
      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "pixtral-12b-2409",
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: `data:${mimeType};base64,${b64}` },
              { type: "text", text: GEMINI_OCR_PROMPT },
            ],
          }],
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as any;
        const msg = err?.message ?? JSON.stringify(err);
        return { ok: false, quota: resp.status === 429, error: `Mistral ${resp.status}: ${msg}` };
      }
      const data = await resp.json() as any;
      const raw = data.choices?.[0]?.message?.content ?? "";
      if (!raw) return { ok: false, quota: false, error: "Mistral 빈 응답" };
      return { ok: true, text: parseGeminiText(raw) };
    } catch (e: any) {
      return { ok: false, quota: false, error: String(e?.message ?? e) };
    }
  }

  function parseGeminiText(raw: string): string {
    let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
    return text;
  }

  function isRetryableError(msg: string): boolean {
    return /429|503|quota|rate.?limit|resource.?exhausted|unavailable|overloaded/i.test(msg);
  }
  function isQuotaError(msg: string): boolean {
    return /429|quota|rate.?limit|resource.?exhausted/i.test(msg);
  }

  function makeGeminiClient(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" }, timeout: 25_000 },
    });
  }

  async function callGeminiOcr(b64: string, mimeType: string, apiKey: string, timeoutMs = 20_000): Promise<GeminiResult> {
    const timeoutPromise: Promise<GeminiResult> = new Promise(resolve =>
      setTimeout(() => resolve({ ok: false, quota: false, error: `Gemini 응답 없음 (${timeoutMs / 1000}s 초과)` }), timeoutMs)
    );
    const callPromise: Promise<GeminiResult> = (async () => {
      let attempts = 3;
      let lastResult: GeminiResult = { ok: false, quota: false, error: "알 수 없는 에러" };
      
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const ai = makeGeminiClient(apiKey);
          const result = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{
              parts: [
                { inlineData: { mimeType: mimeType ?? "image/jpeg", data: b64 } },
                { text: GEMINI_OCR_PROMPT },
              ],
            }],
            config: { temperature: 0, responseMimeType: "application/json" },
          });

          const finishReason = result.candidates?.[0]?.finishReason ?? "STOP";
          if (finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
            lastResult = { ok: false, quota: false, error: `Gemini 응답 차단됨 (${finishReason})` };
            continue;
          }

          const raw = result.text ?? "";
          if (!raw) {
            lastResult = { ok: false, quota: false, error: "Gemini 빈 응답" };
            continue;
          }
          return { ok: true, text: parseGeminiText(raw) };
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          const isQuota = isQuotaError(msg);
          lastResult = { ok: false, quota: isQuota, error: msg };
          
          if (isQuota || msg.includes("503") || msg.includes("UNAVAILABLE")) {
            console.log(`[OCR/Gemini] API 오류로 인해 ${attempt}/${attempts}차 재시도 대기 중...`);
            await new Promise(r => setTimeout(r, 2000 * attempt)); // 2초, 4초 대기 후 시도
            continue;
          }
          break; // 치명적 에러는 즉시 루프 탈출
        }
      }
      return lastResult;
    })();
    return Promise.race([callPromise, timeoutPromise]);
  }

  async function structureWithGemini(rawText: string, apiKey: string): Promise<GeminiResult> {
    const prompt = `당신은 한국 거래명세서·납품서·세금계산서 전문 데이터 추출 엔진입니다.
아래 OCR 텍스트에서 품목 표를 찾아 JSON으로 반환하세요.

[추출 규칙]
1. 표의 헤더 행을 정확히 찾아 실제 컬럼명을 그대로 headers에 넣으세요
2. 헤더 아래 품목 행만 rows로 추출 (합계·소계·총계 행 제외)
3. 숫자 쉼표 제거 후 숫자형 반환 (예: "1,500" → 1500)
4. 비어있거나 없는 셀은 null
5. meta: date(YYYY-MM-DD), supplier(공급자), recipient(수신자), total(합계숫자)

마크다운·설명 없이 JSON만:
{"headers":["번호","품명","규격","단위","수량","단가","금액","세액"],"rows":[[1,"상품A","500ml","EA",10,1500,15000,1500]],"meta":{"supplier":"(주)공급사","recipient":"수신사","date":"2024-01-15","total":16500}}

[OCR 텍스트]
${rawText}`;

    let attempts = 3;
    let lastResult: GeminiResult = { ok: false, quota: false, error: "알 수 없는 에러" };
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const ai = makeGeminiClient(apiKey);
        const result = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ parts: [{ text: prompt }] }],
          config: { temperature: 0 },
        });
        const raw = result.text ?? "";
        if (!raw) {
          lastResult = { ok: false, quota: false, error: "Gemini 빈 응답" };
          continue;
        }
        return { ok: true, text: parseGeminiText(raw) };
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const isQuota = isQuotaError(msg);
        lastResult = { ok: false, quota: isQuota, error: msg };
        
        if (isQuota || msg.includes("503") || msg.includes("UNAVAILABLE")) {
          console.log(`[OCR/Gemini] 구조화 API 오류로 인해 ${attempt}/${attempts}차 재시도 대기 중...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        break;
      }
    }
    return lastResult;
  }

  // ── EasyOCR 영속 서버 (ocr_server.py, port 8001) ────────────────────────────
  const PYTHON = process.platform === "win32" ? "python" : "python3";
  const OCR_SERVER_URL = "http://localhost:8001";
  let ocrServerProc: ReturnType<typeof spawn> | null = null;

  async function ensureOcrServer(): Promise<void> {
    try {
      const r = await fetch(`${OCR_SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { console.log("[OCR Server] 이미 실행 중."); return; }
    } catch {}
    if (ocrServerProc) return;
    console.log("[OCR Server] EasyOCR 서버 시작 중 (ocr_server.py)...");
    ocrServerProc = spawn(PYTHON, ["scripts/ocr_server.py"], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    ocrServerProc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[OCR Server] ${d}`));
    ocrServerProc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[OCR Server] ${d}`));
    ocrServerProc.on("error", (e: Error) => console.error("[OCR Server] 시작 실패:", e.message));
    ocrServerProc.on("exit", () => { ocrServerProc = null; });
  }

  async function callEasyOcrServer(b64: string, mimeType: string): Promise<any> {
    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        const res = await fetch(`${OCR_SERVER_URL}/ocr`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: b64, mimeType }),
          signal: AbortSignal.timeout(60000),
        });
        const json = await res.json() as any;
        if (!json.success) throw new Error(json.error ?? "EasyOCR 실패");
        return json;
      } catch (e: any) {
        const connRefused = e?.cause?.code === "ECONNREFUSED" || e?.code === "ECONNREFUSED" || String(e).includes("ECONNREFUSED");
        if (connRefused && attempt < 44) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw e;
      }
    }
    throw new Error("EasyOCR 서버에 연결할 수 없습니다. ocr_server.py가 실행 중인지 확인하세요.");
  }

  ensureOcrServer().catch(() => {});

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/ocr-ping", (_req, res) => {
    const keys = getGeminiKeys();
    const mKeys = getMistralKeys();
    res.json({ ok: true, gemini: keys.length > 0, geminiKeyCount: keys.length, mistral: mKeys.length > 0, mistralKeyCount: mKeys.length });
  });

  app.post("/api/ocr-match", async (req, res) => {
    try {
      const { names } = req.body ?? {};
      if (!Array.isArray(names)) return res.status(400).json({ error: "names 배열 필요" });

      const map = await getProductMap();
      const products = Object.values(map);
      const synonymMap = await getSynonymMap();

      // ── 한글 자모 분해 + 레벤슈타인 ─────────────────────────────────────────
      const CHOSUNGS  = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
      const JUNGSUNGS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
      const JONGSUNGS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

      function toJamo(s: string): string[] {
        const res: string[] = [];
        for (const ch of s) {
          const code = ch.charCodeAt(0);
          if (code >= 0xAC00 && code <= 0xD7A3) {
            const off  = code - 0xAC00;
            const jong = off % 28;
            const jung = Math.floor(off / 28) % 21;
            const cho  = Math.floor(off / 588);
            res.push(CHOSUNGS[cho], JUNGSUNGS[jung]);
            if (jong > 0) res.push(JONGSUNGS[jong]);
          } else if (ch.trim()) {
            res.push(ch.toLowerCase());
          }
        }
        return res;
      }

      function levenshtein(a: string[], b: string[]): number {
        const m = a.length, n = b.length;
        let prev = Array.from({ length: n + 1 }, (_, j) => j);
        const curr = new Array<number>(n + 1);
        for (let i = 1; i <= m; i++) {
          curr[0] = i;
          for (let j = 1; j <= n; j++) {
            curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
          }
          prev = [...curr];
        }
        return prev[n];
      }

      function jamoSim(a: string, b: string): number {
        const ja = toJamo(a), jb = toJamo(b);
        if (!ja.length || !jb.length) return 0;
        const maxLen = Math.max(ja.length, jb.length);
        return Math.round((1 - levenshtein(ja, jb) / maxLen) * 100);
      }

      // 기본 정규화: 소문자 + 구두점 제거
      const norm = (s: string) =>
        s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』]/g, "");

      // 약제형·규격 제거: 숫자+단위, 제형명(정/캡슐/주 등) 모두 삭제
      const DOSE_FORM = /정|캡슐|연질캡슐|경질캡슐|서방정|필름코팅정|당의정|시럽|건조시럽|주사|주|앰풀|바이알|좌약|크림|겔|젤|로션|패취|패치|점안|점이|흡입|분말|과립|환|액|현탁액|산/g;
      const SPEC_PAT  = /\d+(?:[./×x]\d+)?(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|t|c|tab|cap|ea)/gi;
      const stripMed  = (s: string) => norm(s).replace(SPEC_PAT, "").replace(DOSE_FORM, "").replace(/\d+/g, "");

      // 바이그램 유사도 (길이 비율로 substring 점수 보정)
      const bigramSim = (a: string, b: string): number => {
        if (!a || !b) return 0;
        if (a === b) return 100;
        const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
        if (a.includes(b) || b.includes(a)) return Math.round(90 * (0.35 + 0.65 * ratio));
        const bg = (s: string) => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
        const ag = bg(a); const bs = new Set(bg(b));
        if (!ag.length || !bs.size) return 0;
        return Math.round((ag.filter(g => bs.has(g)).length / Math.max(ag.length, bs.size)) * 100);
      };

      // 거래명세표 특화 점수: 4가지 정규화 조합 + 키워드 + 접두사 보너스
      const invoiceMatchScore = (ocrRaw: string, p: ProductInfo): number => {
        // 앞에 붙은 행번호 제거: "1." "001." "①" 형태
        const ocrClean = ocrRaw.replace(/^\s*[\d①②③④⑤⑥⑦⑧⑨⑩]+[.)]\s*/, "").trim();

        const oc = norm(ocrClean);
        const os = stripMed(ocrClean);
        const dc = norm(p.name ?? "");
        const ds = stripMed(p.name ?? "");

        if (!oc || !dc) return 0;

        const scores = [
          bigramSim(oc, dc),
          bigramSim(os, ds),
          bigramSim(oc, ds),
          bigramSim(os, dc),
          jamoSim(oc, dc),   // OCR 오타 보정: 자모 단위 레벤슈타인
          jamoSim(os, ds),
        ];

        // 검색 키워드로도 비교
        if (p.search_keywords) {
          for (const kw of String(p.search_keywords).split(/[,|;]/)) {
            const k = norm(kw.trim());
            if (k.length >= 2) {
              scores.push(bigramSim(oc, k), bigramSim(os, k));
            }
          }
        }

        return Math.max(...scores, 0);
      };

      const makeResult = (name: string, p: ProductInfo, score: number) => ({
        input: name,
        matched: {
          code: p.code, name: p.name, spec: p.spec, score,
          masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
          salePrice:   p.sale_price     != null ? Number(p.sale_price)     : null,
          profitRate:  p.profit_rate    != null ? Number(p.profit_rate)    : null,
          expiryDate:  p.expiry_date    != null ? String(p.expiry_date)    : null,
        },
      });

      const matches = names.map((name: string) => {
        if (!name?.trim()) return { input: name, matched: null };

        // 1. 동의어 사전 우선 매칭
        const synCode = synonymMap.get(name.trim().toLowerCase());
        if (synCode) {
          const sp = map[synCode] ?? products.find(p => p.code === synCode);
          if (sp) return makeResult(name, sp, 100);
        }

        // 2. 퍼지 매칭
        let best: ProductInfo | null = null;
        let bestScore = 0;
        for (const p of products) {
          const s = invoiceMatchScore(name, p);
          if (s > bestScore) { bestScore = s; best = p; }
        }
        if (!best || bestScore < 25) return { input: name, matched: null, score: bestScore };
        return {
          input: name,
          matched: {
            code: best.code,
            name: best.name,
            spec: best.spec,
            score: bestScore,
            masterPrice:  best.purchase_price != null ? Number(best.purchase_price)  : null,
            salePrice:    best.sale_price      != null ? Number(best.sale_price)      : null,
            profitRate:   best.profit_rate     != null ? Number(best.profit_rate)     : null,
            expiryDate:   best.expiry_date     != null ? String(best.expiry_date)     : null,
          },
        };
      });

      res.json({ matches });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── OCR 동의어 사전 CRUD ─────────────────────────────────────────────────────
  app.get("/api/ocr-synonyms", async (_req, res) => {
    try {
      const { data, error } = await supabase.from("ocr_synonyms").select("*").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      res.json({ synonyms: data ?? [] });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/ocr-synonyms", async (req, res) => {
    try {
      const { alias, product_code, supplier } = req.body ?? {};
      if (!alias?.trim() || !product_code?.trim()) return res.status(400).json({ error: "alias, product_code 필요" });
      const { data, error } = await supabase.from("ocr_synonyms")
        .insert({ alias: alias.trim().toLowerCase(), product_code: product_code.trim(), supplier: supplier?.trim() ?? null })
        .select().single();
      if (error) throw new Error(error.message);
      synonymMapCache = null; synonymMapPromise = null;
      res.json({ synonym: data });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/ocr-synonyms/:id", async (req, res) => {
    try {
      const { error } = await supabase.from("ocr_synonyms").delete().eq("id", Number(req.params.id));
      if (error) throw new Error(error.message);
      synonymMapCache = null; synonymMapPromise = null;
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // 공급받는자(수신인) 상호 목록 — .env OCR_RECIPIENT (쉼표 구분)
  const OCR_RECIPIENTS: string[] = (process.env.OCR_RECIPIENT ?? "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

  function sanitizeOcrMeta(meta: any): any {
    if (!meta || !meta.supplier) return meta;
    const sup = String(meta.supplier).trim().toLowerCase();
    const isRecipient = OCR_RECIPIENTS.some(r => sup.includes(r));
    return isRecipient ? { ...meta, supplier: null } : meta;
  }

  app.post("/api/ocr", async (req, res) => {
    const { images, texts, engine: reqEngine = "gemini" } = req.body ?? {};
    const engine = reqEngine as string;

    if (!Array.isArray(images) || images.length === 0)
      return res.status(400).json({ error: "images 배열이 필요합니다." });
    if (engine === "gemini" && getGeminiKeys().length === 0 && getMistralKeys().length === 0)
      return res.status(400).json({ error: "GEMINI_API_KEY 또는 MISTRAL_API_KEY가 설정되지 않았습니다. .env에 추가하세요." });

    // easyocr 엔진 분기 — 영속 서버로 병렬 처리
    if (engine === "paddle") {
      try {
        await ensureOcrServer();
        const pages = await Promise.all(
          (images as { data: string; mimeType: string }[]).map(async ({ data: b64, mimeType }, i) => {
            console.log(`[OCR/EasyOCR] page ${i + 1}/${images.length}`);
            const raw = await callEasyOcrServer(b64, mimeType);
            const pre  = mergeAdjacentHeaders(raw.headers ?? [], raw.rows ?? []);
            const norm = normalizeInvoiceCols(pre.headers, pre.rows);
            const spec = extractSpecFromName(norm.headers, norm.rows);
            const rows = fixAmounts(spec.headers, spec.rows);
            console.log(`[OCR/EasyOCR] page ${i + 1}: 헤더=${JSON.stringify(spec.headers)}, 행=${rows.length}`);
            return { page: i + 1, headers: spec.headers, rows, meta: sanitizeOcrMeta(raw.meta ?? {}), rawText: raw.rawText ?? "" };
          })
        );
        return res.json({ pages, engine });
      } catch (err: any) {
        console.error("[OCR/EasyOCR] error:", err?.message);
        return res.status(500).json({ error: err?.message ?? "EasyOCR 처리 중 오류" });
      }
    }

    try {
      const pages: any[] = [];

      if (engine === "gemini") {
        const keys = getGeminiKeys();
        const failedKeys = new Set<string>();
        for (let i = 0; i < images.length; i++) {
          const { data: b64, mimeType } = images[i] as { data: string; mimeType: string };
          const startIdx = keys.length > 0 ? geminiRoundRobinIdx % keys.length : 0;
          console.log(`[OCR/Gemini] page ${i + 1}/${images.length} — 키 ${startIdx + 1}번부터 순환 (총 ${keys.length}개)`);

          let rawText = "";
          let quotaCount = 0;
          let lastError = "";

          for (let k = 0; k < keys.length; k++) {
            const ki = (startIdx + k) % keys.length;
            const apiKey = keys[ki];
            if (failedKeys.has(apiKey)) {
              quotaCount++;
              continue;
            }
            const r = await callGeminiOcr(b64, mimeType, apiKey);
            if (r.ok) {
              rawText = r.text;
              geminiRoundRobinIdx = ki; // 성공한 키로 고정!
              console.log(`[OCR/Gemini] page ${i + 1}: 키 ${ki + 1} 성공`);
              break;
            }
            const fail = r as Extract<GeminiResult, { ok: false }>;
            lastError = fail.error;
            if (fail.quota) quotaCount++;
            if (fail.quota || fail.error.includes("API_KEY_INVALID") || fail.error.includes("not valid")) {
              failedKeys.add(apiKey);
            }
            console.warn(`[OCR/Gemini] 키 ${ki + 1}/${keys.length} 실패: ${fail.error}`);
          }

          if (!rawText) {
            const mistralKeys = getMistralKeys();
            for (const mKey of mistralKeys) {
              const r = await callMistralOcr(b64, mimeType, mKey);
              if (r.ok) { rawText = r.text; console.log(`[OCR/Mistral] page ${i + 1}: 성공`); break; }
              console.warn(`[OCR/Mistral] 실패: ${(r as Extract<GeminiResult, { ok: false }>).error}`);
            }
            if (!rawText) {
              const errMsg = quotaCount === keys.length
                ? `Gemini 키 ${keys.length}개 모두 할당량 초과입니다. 내일 다시 시도하거나 새 키를 발급하세요.`
                : `Gemini OCR 실패: ${lastError}`;
              return res.status(500).json({ error: errMsg });
            }
          }

          let parsed: any;
          try { parsed = JSON.parse(rawText); }
          catch {
            pages.push({ page: i + 1, headers: ["원문 응답"], rows: [[rawText]], meta: {}, rawText });
            continue;
          }

          const pre  = mergeAdjacentHeaders(parsed.headers ?? [], parsed.rows ?? []);
          const norm = normalizeInvoiceCols(pre.headers, pre.rows);
          const spec = extractSpecFromName(norm.headers, norm.rows);
          const rows = fixAmounts(spec.headers, spec.rows);
          const cleanMeta = sanitizeOcrMeta(parsed.meta ?? {});
          process.stdout.write(`\n[OCR 결과] page ${i + 1}\n  헤더: ${JSON.stringify(spec.headers)}\n  행 수: ${rows.length}\n  메타: ${JSON.stringify(cleanMeta)}\n`);
          pages.push({ page: i + 1, headers: spec.headers, rows, meta: cleanMeta, rawText });
        }
      }

      return res.json({ pages, engine });
    } catch (err: any) {
      console.error("[OCR] error:", err?.message);
      res.status(500).json({ error: err?.message ?? "OCR 처리 중 오류" });
    }
  });

  const httpServer = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.get("/products.json", async (_req, res) => {
      try {
        const map = await getProductMap();
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.json(map);
      } catch {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.sendFile(path.join(distPath, "products.json"));
      }
    });
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
