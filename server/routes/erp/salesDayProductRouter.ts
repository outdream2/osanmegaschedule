// server/routes/erp/salesDayProductRouter.ts
// 2026-10-07 · 매장>매출 > 월달력 > 날짜 셀 click → 날짜별 상품 판매내역 모달
//
//   GET /api/erp/sale-day-products?date=YYYY-MM-DD
//     · ERP Sale_Status (SvcSaleBiz) · CRUD=DETAIL · IsStatus=9
//     · fixture (sale_dayproduct-request.txt) template · StartDate/EndDate 치환
//     · 응답: Table1 (상품 단건 row) · columns BuyerCorpNameView/PCode/ProductName/UnitCost/UnitSale/
//              SaleMonth/SaleDate/PosNo + DataColumns SaleTotal/Margin/TotalStock
//
// 구현 원칙 (사용자 지시 2026-10-07):
//   · ERP 실시간 조회 (Supabase sales 테이블 fallback 금지)
//   · products JOIN · pcode → location → classifyProduct() 서버 적용 (상비약/일반약/미분류)
//   · DB fallback 없음 · ERP 실패 시 명확한 error 반환
//
// decoder spawn / fixture 로딩 / withDecoderLock / callSoap / extractResult 는
// salesStatsRouter.ts 와 동일 패턴 복제 (export 분리 없이 self-contained · 변경 영향 최소)
//
// 2026-10-05 fallback 금지 대원칙:
//   · 숫자 field 는 parseErpNum (콤마 포함 문자열 → number · 실패시 null)
//   · ?? "(이름없음)" 같은 문자열 fallback 금지 · ERP 가 준 값 그대로 (null 은 null)

import { Router } from "express";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { asyncHandler } from "../../middleware/asyncHandler";
import logger from "../../lib/logger";
import { supabase } from "../../../src/supabase/client";
import { classifyProduct, type ProductClass } from "../../../src/utils/productClassify";

const router = Router();

// ─────────────────────────────────────────────────────────────────
// Decoder / fixture 경로 · salesStatsRouter 와 동일 소스 (반드시 동기 유지)
// ─────────────────────────────────────────────────────────────────
const PROJECT_ROOT = process.cwd();
const SAMPLES_DIR = path.resolve(PROJECT_ROOT, "server/resources/erp");
const IS_WIN = process.platform === "win32";
const WIN_DECODER_EXE = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
const WIN_DECODER_CWD = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/bin");
const WIN_DECODER_OUT = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/bin/output/stdin-full.json");
const LIN_DECODER_EXE = path.resolve(PROJECT_ROOT, "tools/iregen-decoder/publish/linux-x64/iregen-decoder");
const LIN_DECODER_CWD = path.resolve(PROJECT_ROOT, "tools/iregen-decoder/publish/linux-x64");
const LIN_DECODER_OUT = path.resolve(PROJECT_ROOT, "tools/iregen-decoder/publish/linux-x64/output/stdin-full.json");
const DECODER_EXE = IS_WIN ? WIN_DECODER_EXE : LIN_DECODER_EXE;
const DECODER_CWD = IS_WIN ? WIN_DECODER_CWD : LIN_DECODER_CWD;
const DECODER_OUT_JSON = IS_WIN ? WIN_DECODER_OUT : LIN_DECODER_OUT;

const ERP_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcSaleBiz.asmx";
const SOAP_ACTION = "http://tempuri.org/Sale_Status";
const FIXTURE_FILE = "sale_dayproduct-request.txt";

function isDecoderAvailable(): boolean {
  return existsSync(DECODER_EXE);
}

const fixtureCache = new Map<string, string>();
async function readFixtureBody(filename: string): Promise<string> {
  const cached = fixtureCache.get(filename);
  if (cached) return cached;
  const raw = await readFile(path.join(SAMPLES_DIR, filename), "utf8");
  const markers = ["<?xml", "<s:Envelope", "<soap:Envelope", "<soap12:Envelope", "<Envelope"];
  let bodyStart = -1;
  for (const m of markers) {
    const idx = raw.indexOf(m);
    if (idx >= 0 && (bodyStart < 0 || idx < bodyStart)) bodyStart = idx;
  }
  if (bodyStart < 0) throw new Error(`fixture SOAP envelope not found · ${filename}`);
  const body = raw.slice(bodyStart).trim();
  fixtureCache.set(filename, body);
  return body;
}

function substituteTag(envelope: string, tag: string, val: string): string {
  const re = new RegExp(`<${tag}>[^<]*<\\/${tag}>`);
  return envelope.replace(re, `<${tag}>${val}</${tag}>`);
}

async function callSoap(soapAction: string, body: string): Promise<string> {
  const r = await fetch(ERP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"${soapAction}"`,
    },
    body,
  });
  if (!r.ok) throw new Error(`ERP SOAP HTTP ${r.status}`);
  return await r.text();
}

function extractResult(xmlResp: string, tag: string): string {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const s = xmlResp.indexOf(openTag);
  const e = xmlResp.indexOf(closeTag);
  if (s < 0 || e < 0) throw new Error(`${tag} 응답 element 없음`);
  return xmlResp.slice(s + openTag.length, e).trim();
}

// decoder spawn 직렬화 · salesStatsRouter 와 공유 output 파일 race 방지용
// (각 router 가 자체 lock 을 가지지만 output 파일은 전역 공유 · 추후 공통모듈화 과제)
let decoderQueue: Promise<unknown> = Promise.resolve();
function withDecoderLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = decoderQueue;
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  decoderQueue = next;
  return (async () => {
    try { await prev; return await fn(); }
    finally { release(); }
  })();
}

interface DecodedPayload {
  datasetName?: string;
  tableCount?: number;
  tables?: Array<{
    name: string;
    rowCount: number;
    columns: Array<{ name: string; type: string }>;
    rows: Record<string, unknown>[];
  }>;
}

async function runDecoder(base64: string): Promise<DecodedPayload> {
  if (existsSync(DECODER_OUT_JSON)) {
    try { unlinkSync(DECODER_OUT_JSON); } catch { /* ignore */ }
  }
  return new Promise<DecodedPayload>((resolve, reject) => {
    const proc = spawn(DECODER_EXE, [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: DECODER_CWD,
    });
    let stderrBuf = "";
    proc.stdout.on("data", () => { /* discard */ });
    proc.stderr.on("data", (d) => { stderrBuf += d.toString(); });
    proc.on("error", (err) => reject(new Error(`decoder spawn 실패 · ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`decoder exit ${code} · ${stderrBuf.slice(-500)}`));
      try {
        if (!existsSync(DECODER_OUT_JSON)) {
          return reject(new Error(`decoder output 파일 없음 · exit=${code} · ${stderrBuf.slice(-200)}`));
        }
        const parsed = JSON.parse(readFileSync(DECODER_OUT_JSON, "utf8")) as DecodedPayload;
        resolve(parsed);
      } catch (e) {
        reject(new Error(`decoder output JSON 파싱 실패 · ${(e as Error).message}`));
      }
    });
    proc.stdin.write(base64);
    proc.stdin.end();
  });
}

// MISSING != ZERO · 콤마 포함 문자열 → number · 실패시 null
function parseErpNum(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/erp/sale-day-products?date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────
interface DaySaleProductItem {
  pcode: string | null;
  productName: string | null;
  buyerCorpName: string | null;
  unitCost: number | null;
  unitSale: number | null;
  totalStock: number | null;   // 수량 (판매 수량 · ERP 응답 사용)
  saleTotal: number | null;
  margin: number | null;
  marginPct: number | null;
  location: string | null;     // products.location (JOIN · 없으면 null)
  class: ProductClass;         // classifyProduct(location)
}

interface ClassGroupStats {
  quantity: number | null;
  saleTotal: number | null;
  margin: number | null;
  marginPct: number | null;
  count: number;
}

// 숫자 집계 helper · 모든 입력이 null 이면 null · 하나라도 숫자면 sum
function sumNullable(vals: Array<number | null>): number | null {
  let any = false;
  let total = 0;
  for (const v of vals) {
    if (v === null) continue;
    any = true;
    total += v;
  }
  return any ? total : null;
}

function computeMarginPct(margin: number | null, saleTotal: number | null): number | null {
  if (margin === null || saleTotal === null) return null;
  if (saleTotal <= 0) return null;
  return Math.round((margin / saleTotal) * 1000) / 10;
}

function aggregateGroup(items: DaySaleProductItem[]): ClassGroupStats {
  const quantity = sumNullable(items.map((i) => i.totalStock));
  const saleTotal = sumNullable(items.map((i) => i.saleTotal));
  const margin = sumNullable(items.map((i) => i.margin));
  return {
    quantity,
    saleTotal,
    margin,
    marginPct: computeMarginPct(margin, saleTotal),
    count: items.length,
  };
}

router.get("/api/erp/sale-day-products", asyncHandler(async (req, res) => {
  const date = String(req.query.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.json({ ok: false, error: "date 필수 (YYYY-MM-DD)" });
  }
  if (!isDecoderAvailable()) {
    return res.status(503).json({
      ok: false,
      error: `ERP decoder 실행 파일 없음 (${IS_WIN ? "Windows" : "Linux"}) · ${DECODER_EXE}`,
    });
  }

  try {
    const rawRows: Record<string, unknown>[] = await withDecoderLock(async () => {
      const fixture = await readFixtureBody(FIXTURE_FILE);
      let body = substituteTag(fixture, "StartDate", date);
      body = substituteTag(body, "EndDate", date);

      // ERP 응답 schema validator · 상품 테이블 (PCode + ProductName column 존재)
      const isProductShape = (tables: DecodedPayload["tables"]): boolean => {
        if (!tables || tables.length < 1) return false;
        const cols = (tables[0]?.columns ?? []).map((c) => c.name);
        return cols.includes("PCode") && cols.includes("ProductName");
      };

      const callOnce = async (attempt: number): Promise<DecodedPayload["tables"]> => {
        logger.info(`[sale-day-products] attempt=${attempt} · date=${date}`);
        const xmlResp = await callSoap(SOAP_ACTION, body);
        const b64 = extractResult(xmlResp, "Sale_StatusResult");
        const parsed = await runDecoder(b64);
        const tables = parsed.tables ?? [];
        const cols = (tables[0]?.columns ?? []).map((c) => c.name);
        logger.info(`[sale-day-products] attempt=${attempt} tableCount=${tables.length} cols=[${cols.join(",")}]`);
        return tables;
      };

      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      let tables = await callOnce(1);
      for (let attempt = 2; attempt <= 10 && !isProductShape(tables); attempt++) {
        await sleep(500);
        tables = await callOnce(attempt);
      }
      if (!isProductShape(tables)) {
        throw new Error("ERP_RESPONSE_SCHEMA_MISMATCH");
      }
      const safeTables = tables ?? [];
      return safeTables[0]?.rows ?? [];
    });

    // 상품 row normalize · subtotal/aggregate row 제외 (PCode 없는 것)
    //   · PCode 있으면 상품 row · 없으면 subtotal → skip
    const normalizedRows: Array<Omit<DaySaleProductItem, "location" | "class">> = [];
    for (const r of rawRows) {
      const pcode = (r.PCode === undefined || r.PCode === null) ? null : String(r.PCode).trim() || null;
      const productName = (r.ProductName === undefined || r.ProductName === null)
        ? null
        : String(r.ProductName).trim() || null;
      if (!pcode && !productName) continue;  // subtotal row skip
      normalizedRows.push({
        pcode,
        productName,
        buyerCorpName: (r.BuyerCorpNameView === undefined || r.BuyerCorpNameView === null)
          ? null
          : String(r.BuyerCorpNameView).trim() || null,
        unitCost: parseErpNum(r.UnitCost),
        unitSale: parseErpNum(r.UnitSale),
        totalStock: parseErpNum(r.TotalStock),
        saleTotal: parseErpNum(r.SaleTotal),
        margin: parseErpNum(r.Margin),
        marginPct: null,  // row 레벨 marginPct = Margin/SaleTotal (compute 후 setter)
      });
    }

    // products JOIN · pcode → 진열위치
    //   · 2026-10-05 PCode primary identity · products.pcode 1:1
    //   · 2026-10-07 (fix) · Supabase products 테이블 실측 결과 location/real_map 컬럼 **존재하지 않음**
    //     · 유일한 진열위치 컬럼 = display_location (82.7% populated · 포맷 예: "6매대>Ａ>3열>전체")
    //     · 이전 코드 (location/real_map fallback) 는 .select() 에러로 전체 JOIN 실패 → 분류 미동작
    //     · 아래로 수정 · display_location 만 조회 · classifyProduct() 가 첫 segment 숫자 파싱
    //   · 매치 안 되는 pcode (서버-ERP 불일치) 는 location=null → class="unknown" (fallback 생성 금지)
    const pcodes = Array.from(new Set(normalizedRows.map((r) => r.pcode).filter((p): p is string => !!p)));
    const locationMap = new Map<string, string | null>();
    let joinMatched = 0;
    if (pcodes.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < pcodes.length; i += CHUNK) {
        const chunk = pcodes.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("products")
          .select("pcode, display_location")
          .in("pcode", chunk);
        if (error) {
          logger.warn(`[sale-day-products] products JOIN 실패 (chunk ${i}) · ${error.message}`);
          continue;
        }
        for (const row of data ?? []) {
          if (!row.pcode) continue;
          const d = (row.display_location ?? null) as string | null;
          const resolved = d && String(d).trim() ? String(d).trim() : null;
          locationMap.set(String(row.pcode), resolved);
          joinMatched++;
        }
      }
    }
    logger.info(`[sale-day-products] products JOIN · requested=${pcodes.length} matched=${joinMatched}`);

    const items: DaySaleProductItem[] = normalizedRows.map((r) => {
      const location = r.pcode ? (locationMap.get(r.pcode) ?? null) : null;
      return {
        ...r,
        marginPct: computeMarginPct(r.margin, r.saleTotal),
        location,
        class: classifyProduct(location),
      };
    });

    // 2026-10-07 사용자 지시 · 조회 default = 마진율 desc · 매출 보조 · null 은 뒤로
    items.sort((a, b) => {
      const amPct = a.marginPct ?? -Infinity;
      const bmPct = b.marginPct ?? -Infinity;
      if (amPct !== bmPct) return bmPct - amPct;
      const asVal = a.saleTotal ?? -Infinity;
      const bsVal = b.saleTotal ?? -Infinity;
      return bsVal - asVal;
    });

    // 전체 totals · class group 집계
    const totals = aggregateGroup(items);
    const stationery = aggregateGroup(items.filter((i) => i.class === "stationery"));
    const general = aggregateGroup(items.filter((i) => i.class === "general"));
    const unknown = aggregateGroup(items.filter((i) => i.class === "unknown"));

    logger.info(`[sale-day-products] date=${date} · items=${items.length} · stationery=${stationery.count} general=${general.count} unknown=${unknown.count}`);

    return res.json({
      ok: true,
      date,
      totals,
      byClass: { stationery, general, unknown },
      items,
    });
  } catch (e) {
    const msg = (e as Error).message;
    logger.warn(`[sale-day-products] 실패 · date=${date} · ${msg}`);
    return res.json({ ok: false, error: msg });
  }
}));

export default router;
