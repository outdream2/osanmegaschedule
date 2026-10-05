// server/routes/erp/salesStatsRouter.ts
// 2026-10-05 · 매장>매출 페이지 ERP 서버 route
//
//   GET /api/erp/sale-hourly-report?from=YYYY-MM-DD&to=YYYY-MM-DD
//     · ERP Sales_Days_TimeReport (SvcStatisticsBiz)
//     · 응답 9 column: CorpCode, SaleDate, SaleTime, CustomerCnt, ChargeTotal,
//                      AvgChargeTotal, Margin, SaleTotal, MarginRate
//
//   GET /api/erp/sale-monthly-report?year=YYYY
//     · ERP Statistics_Month_DashBoard (SvcStatisticsBiz)
//     · 응답 Table1 (매입): CorpCode, StCode, SaleDate (YYYY-MM), BuyTotal
//     · 응답 Table2 (매출): + CostTotal, SaleTotal, CustomerCnt, Margin, MarginPercent
//
// 구현 전략 (사용자 지시 2026-10-05):
//   · 기존 Fiddler fixture 를 template 으로 사용 (추측 X · 실제 ERP envelope 그대로)
//   · 날짜만 치환 → ERP SOAP POST
//   · base64 gzip 응답은 tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe spawn (Windows 전용)
//   · Render Linux prod 환경에서는 503 반환 (DEV/PROD 분리 · 사용자 명시)
//   · Supabase 저장 X · 매번 ERP 조회 (실시간)

import { Router } from "express";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { asyncHandler } from "../../middleware/asyncHandler";
import logger from "../../lib/logger";

const router = Router();

const PROJECT_ROOT = process.cwd();
const SAMPLES_DIR = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/samples");

// 2026-10-05 · decoder 플랫폼 분기
//   · Windows: 기존 .NET Framework 4.8 decoder (iregen-bridge) 유지
//   · Linux  : System.Formats.Nrbf 기반 cross-platform decoder (iregen-decoder)
//              · self-contained publish → .NET runtime 설치 불필요
//              · 산출물: tools/iregen-decoder/publish/linux-x64/iregen-decoder (ELF binary)
//   · 두 decoder 는 output JSON contract 100% 동일 (byte-level MATCH 확인됨)
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

const ERP_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcStatisticsBiz.asmx";

const HOURLY_SOAP_ACTION = "http://tempuri.org/Sales_Days_TimeReport";
const MONTHLY_SOAP_ACTION = "http://tempuri.org/Statistics_Month_DashBoard";
// 2026-10-05 fix · fixture 분리 · daytime (시간대별) + month (월별) 서로 다른 operation
const HOURLY_FIXTURE = "salestatus_daytime-request.txt";
const MONTHLY_FIXTURE = "salestatus_month-request.txt";

// Decoder 사용 가능 판정 · 플랫폼별 executable 존재만 체크 (platform guard X)
function isDecoderAvailable(): boolean {
  return existsSync(DECODER_EXE);
}

// Fixture (XML body) 로드 · HTTP header 제거 · 메모리 캐시
//   · 2026-10-05 fix · Fiddler request fixture 는 <?xml prolog 없이 바로 <s:Envelope 로 시작
//   · 응답 fixture (XML prolog 포함) 와 다름 · 가능한 모든 SOAP envelope 시작점 체크
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
  if (bodyStart < 0) throw new Error(`fixture SOAP envelope not found · ${filename} (expected <?xml or <s:Envelope)`);
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

// Decoder spawn 직렬화 (output/stdin-full.json 공유 파일 race 방지)
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

// 2026-10-05 · 실측 ERP response schema 반영:
//   · 모든 숫자 field 가 "콤마 포함 문자열" (예: "58,920,300")
//   · CustomerCnt = "거래건수/매출액" 복합 문자열 (예: "1,022/ 57,651") · 앞 부분만 거래건수
//   · MISSING != ZERO · 필수 key 가 없으면 null 유지 (0 fallback 금지)
function parseErpNum(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
// 사용자 ERP 화면 확정 (2026-10-05):
//   · CustomerCnt = "LEFT/RIGHT" 복합 문자열
//   · LEFT = 고객수 (객수) · RIGHT = 객단가 (평균 거래액)
//   · 단일 숫자인 경우 (hourly 응답) LEFT 만 존재 · RIGHT = null
function parseCustomerCnt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const first = s.split("/")[0] ?? s;
  return parseErpNum(first);
}
function parseCustomerAvg(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s || !s.includes("/")) return null;
  const parts = s.split("/");
  return parseErpNum(parts[1] ?? "");
}

// 시간대별 row normalize (문자열 콤마 → Number · MISSING != ZERO)
//   · 2026-10-05 fix · SaleTime 빈값 row (subtotal 등) 제외 · ERP UI 와 동일
//   · ERP 화면 column mapping (사용자 확정):
//      SaleTime        → 시간
//      CustomerCnt     → 고객수 (LEFT · 숫자 or "N/M" LEFT)
//      AvgChargeTotal  → 객단가 (평균 거래액)
//      SaleTotal       → 합계금액 (해당 시간대)
//      ChargeTotal     → 누적합계금액
//      Margin          → 이익
//      MarginRate      → 마진율 (%)
function normalizeHourlyRow(r: Record<string, unknown>): Record<string, unknown> | null {
  // SaleTime 없으면 subtotal/aggregate row · UI 표시 제외
  const saleTime = String(r.SaleTime ?? "").trim();
  if (!saleTime) return null;
  return {
    CorpCode: r.CorpCode ?? null,
    SaleDate: r.SaleDate ?? null,
    SaleTime: saleTime,
    CustomerCnt: parseCustomerCnt(r.CustomerCnt),
    ChargeTotal: parseErpNum(r.ChargeTotal),
    AvgChargeTotal: parseErpNum(r.AvgChargeTotal),
    Margin: parseErpNum(r.Margin),
    SaleTotal: parseErpNum(r.SaleTotal),
    MarginRate: parseErpNum(r.MarginRate),
  };
}

// 월별 매입 row (BuyTotal) · 일별 row 만 (subtotal 제외)
function normalizeMonthlyBuyRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!("SaleDate" in r)) return null;
  const saleDate = String(r.SaleDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return null;
  return {
    CorpCode: r.CorpCode ?? null,
    StCode: r.StCode ?? null,
    SaleDate: saleDate.slice(0, 7),
    SaleDateRaw: saleDate,
    BuyTotal: parseErpNum(r.BuyTotal),
  };
}

// 월별 매출 row · CustomerCnt (LEFT=고객수) + AvgPerCustomer (RIGHT=객단가) 둘 다 보존
function normalizeMonthlySaleRow(r: Record<string, unknown>): Record<string, unknown> | null {
  if (!("SaleDate" in r)) return null;
  const saleDate = String(r.SaleDate ?? "").trim();
  // 일별 row (YYYY-MM-DD) 만 유지 · subtotal/aggregate row 제외
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) return null;
  return {
    CorpCode: r.CorpCode ?? null,
    StCode: r.StCode ?? null,
    SaleDate: saleDate.slice(0, 7),
    SaleDateRaw: saleDate,
    CostTotal: parseErpNum(r.CostTotal),
    SaleTotal: parseErpNum(r.SaleTotal),
    CustomerCnt: parseCustomerCnt(r.CustomerCnt),
    AvgPerCustomer: parseCustomerAvg(r.CustomerCnt),  // 객단가 (RIGHT 값 보존)
    Margin: parseErpNum(r.Margin),
    MarginPercent: parseErpNum(r.MarginPercent),
  };
}

// 월별 집계 (ERP 가 일별 row 반환 → server 에서 YYYY-MM 로 SUM)
//   · maxSaleDateRaw 집계 · UI 에서 "10월 X일까지" 기준일 표시용
function aggregateByMonth(rows: Array<Record<string, unknown>>, numericFields: string[]): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = String(r.SaleDate ?? "");
    if (!key || key.length < 7) continue;
    const dayRaw = String(r.SaleDateRaw ?? "");
    const existing = map.get(key) ?? { CorpCode: r.CorpCode, StCode: r.StCode, SaleDate: key, maxSaleDateRaw: "" };
    for (const f of numericFields) {
      const prev = (existing[f] as number | null | undefined) ?? null;
      const curVal = r[f] as number | null;
      if (curVal === null && prev === null) existing[f] = null;
      else existing[f] = (prev ?? 0) + (curVal ?? 0);
    }
    // 월별 maxSaleDateRaw · 집계 범위 기준일 (예: "2026-10-04")
    if (dayRaw && dayRaw > String(existing.maxSaleDateRaw ?? "")) existing.maxSaleDateRaw = dayRaw;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => String(a.SaleDate).localeCompare(String(b.SaleDate)));
}

async function runDecoder(base64: string): Promise<DecodedPayload> {
  // 2026-10-05 fix · 사용자 "다른 프로세스로" 지시 · 공유 output 파일 완전 격리
  //   · decoder output/stdin-full.json 은 hourly/monthly route 공유 유일 리소스
  //   · 호출 직전 삭제 → decoder 실패시 이전 결과 재사용 가능성 완전 차단
  //   · output 파일 없으면 즉시 error (fresh state 보장)
  if (existsSync(DECODER_OUT_JSON)) {
    try { require("node:fs").unlinkSync(DECODER_OUT_JSON); } catch { /* ignore */ }
  }
  return new Promise<DecodedPayload>((resolve, reject) => {
    const proc = spawn(DECODER_EXE, [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: DECODER_CWD, // Windows: iregen-bridge/bin · Linux: iregen-decoder/publish/linux-x64
    });
    let stderrBuf = "";
    proc.stdout.on("data", () => { /* discard · decoder writes to file */ });
    proc.stderr.on("data", (d) => { stderrBuf += d.toString(); });
    proc.on("error", (err) => reject(new Error(`decoder spawn 실패 · ${err.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`decoder exit ${code} · ${stderrBuf.slice(-500)}`));
      try {
        if (!existsSync(DECODER_OUT_JSON)) {
          return reject(new Error(`decoder output 파일 없음 (fresh state · 이전 결과 재사용 방지 · exit=${code} · ${stderrBuf.slice(-200)})`));
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

// ═════════════════════════════════════════════════════════════════
// GET /api/erp/sale-hourly-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// ═════════════════════════════════════════════════════════════════
router.get("/api/erp/sale-hourly-report", asyncHandler(async (req, res) => {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.json({ ok: false, error: "from/to 날짜 형식 YYYY-MM-DD 필요" });
  }
  if (!isDecoderAvailable()) {
    return res.status(503).json({
      ok: false,
      error: `ERP decoder 실행 파일 없음 (${IS_WIN ? "Windows" : "Linux"}) · ${DECODER_EXE}`,
    });
  }
  try {
    const result = await withDecoderLock(async () => {
      const fixture = await readFixtureBody(HOURLY_FIXTURE);
      const body = substituteTag(substituteTag(fixture, "SaleStartDate", from), "SaleEndDate", to);

      // 2026-10-05 · 사용자 "시간대별/월별 서로 간섭" 해결 · hourly 도 schema validator + retry
      //   · 월별 응답은 tableCount>=2 · 매입(BuyTotal) + 매출(CustomerCnt) · SaleTime 없음
      //   · 시간대별 응답은 tableCount>=1 · columns 안 SaleTime 포함
      //   · hourly route 는 **SaleTime 포함** 응답만 받아야 함 · 월별 응답 받으면 재시도
      const isHourlyShape = (tables: DecodedPayload["tables"]): boolean => {
        if (!tables || tables.length < 1) return false;
        const cols = (tables[0]?.columns ?? []).map((c) => c.name);
        return cols.includes("SaleTime");
      };

      const callOnce = async (attempt: number): Promise<DecodedPayload["tables"]> => {
        logger.info(`[sale-hourly] attempt=${attempt} · 요청 from=${from} to=${to}`);
        const xmlResp = await callSoap(HOURLY_SOAP_ACTION, body);
        const b64 = extractResult(xmlResp, "Sales_Days_TimeReportResult");
        const parsed = await runDecoder(b64);
        const tables = parsed.tables ?? [];
        const cols = (tables[0]?.columns ?? []).map((c) => c.name);
        const schemaOk = isHourlyShape(tables);
        logger.info(`[sale-hourly] attempt=${attempt} tableCount=${tables.length} cols=[${cols.join(",")}] saleTimePresent=${cols.includes("SaleTime")} schemaMismatch=${!schemaOk}`);
        return tables;
      };

      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      let tables = await callOnce(1);
      for (let attempt = 2; attempt <= 10 && !isHourlyShape(tables); attempt++) {
        await sleep(500);
        tables = await callOnce(attempt);
      }
      if (!isHourlyShape(tables)) {
        return { schemaMismatch: true as const };
      }

      const rawRows = tables[0]?.rows ?? [];
      const normalized = rawRows.map(normalizeHourlyRow).filter((r): r is Record<string, unknown> => r !== null);
      logger.info(`[sale-hourly] normalized · rows=${normalized.length} · first=${JSON.stringify(normalized[0] ?? null)}`);
      return { normalized, rawRows, schemaMismatch: false as const };
    });

    if ("schemaMismatch" in result && result.schemaMismatch === true) {
      logger.warn(`[sale-hourly] 10회 schema mismatch 지속 · ERP 시간대별 응답 안 돌려줌`);
      return res.json({
        ok: false,
        schemaMismatch: true,
        error: "ERP 시간대별 데이터를 불러오지 못했습니다 (ERP 응답 비정상 · 잠시 후 다시 조회)",
      });
    }
    return res.json({ ok: true, rows: result.normalized, rawRows: result.rawRows });
  } catch (e) {
    logger.warn(`[sale-hourly-report] 실패: ${(e as Error).message}`);
    return res.json({ ok: false, error: (e as Error).message });
  }
}));

// ═════════════════════════════════════════════════════════════════
// GET /api/erp/sale-monthly-report?year=YYYY&month=MM
// ═════════════════════════════════════════════════════════════════
// 2026-10-05 fix · ERP 서버가 범위 1년 요청 시 "시간대별" 응답 반환 (bug or feature)
//   · 1개월 범위 (YYYY-MM-01 ~ YYYY-MM-말일) 로 좁혀야 월별 응답 (일별 매입/매출 2 테이블) 반환
//   · year 만 받던 기존 호출은 month=현재월 fallback (하위 호환)
router.get("/api/erp/sale-monthly-report", asyncHandler(async (req, res) => {
  const year = Number(req.query.year);
  const nowDate = new Date();
  const month = Number(req.query.month ?? (nowDate.getMonth() + 1));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    return res.json({ ok: false, error: "year 필수 (2020-2100 정수)" });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return res.json({ ok: false, error: "month 필수 (1-12 정수)" });
  }
  if (!isDecoderAvailable()) {
    return res.status(503).json({
      ok: false,
      error: `ERP decoder 실행 파일 없음 (${IS_WIN ? "Windows" : "Linux"}) · ${DECODER_EXE}`,
    });
  }
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const startStr = `${year}-${mm}-01`;
  const endStr = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  try {
    const result = await withDecoderLock(async () => {
      const fixture = await readFixtureBody(MONTHLY_FIXTURE);
      // 2026-10-05 · 사용자 지시 · schema validator + 1회 retry
      //   · 동일 요청에 ERP 가 비결정적으로 시간대별 schema 반환하는 경우 관찰됨
      //   · schema mismatch → 즉시 1회 재호출 (fixture fallback 아님 · ERP 실시간 재호출)
      //   · 2회 모두 mismatch → ERP_RESPONSE_SCHEMA_MISMATCH 로 오류 반환 (0원/0건 fake 데이터 금지)
      let body = substituteTag(fixture, "StartDate", startStr);
      body = substituteTag(body, "EndDate", endStr);

      // 2026-10-05 fix · 조건 완화 · 사용자 "잘 됐던거야 이전 코드 살펴봐" 반영
      //   · 기존: tableCount===2 + 특정 column 필수 (너무 엄격 · 월별 응답 가끔 fail)
      //   · 신규: tableCount>=2 + SaleTime 미포함 (시간대별 응답만 거부)
      //   · 월별 응답은 2 테이블 구조 + SaleTime 없음 · 이 둘만 체크하면 충분
      const isMonthlyShape = (tables: DecodedPayload["tables"]): boolean => {
        if (!tables || tables.length < 2) return false;
        const buyCols = (tables[0]?.columns ?? []).map((c) => c.name);
        const saleCols = (tables[1]?.columns ?? []).map((c) => c.name);
        const noHourly = !buyCols.includes("SaleTime") && !saleCols.includes("SaleTime");
        return noHourly;
      };

      const callOnce = async (attempt: number): Promise<DecodedPayload["tables"]> => {
        logger.info(`[sale-monthly] attempt=${attempt} · 요청 range=${startStr}~${endStr}`);
        const xmlResp = await callSoap(MONTHLY_SOAP_ACTION, body);
        const b64 = extractResult(xmlResp, "Statistics_Month_DashBoardResult");
        const parsed = await runDecoder(b64);
        const tables = parsed.tables ?? [];
        const buyCols = (tables[0]?.columns ?? []).map((c) => c.name);
        const saleCols = (tables[1]?.columns ?? []).map((c) => c.name);
        const saleTimePresent = buyCols.includes("SaleTime") || saleCols.includes("SaleTime");
        const schemaOk = isMonthlyShape(tables);
        logger.info(`[sale-monthly] attempt=${attempt} tableCount=${tables.length} buyCols=[${buyCols.join(",")}] saleCols=[${saleCols.join(",")}] saleTimePresent=${saleTimePresent} schemaMismatch=${!schemaOk}`);
        return tables;
      };

      // 2026-10-05 fix · ERP 비결정적 응답 대응 · 최대 10회 재시도 + 500ms delay
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      let tables = await callOnce(1);
      for (let attempt = 2; attempt <= 10 && !isMonthlyShape(tables); attempt++) {
        await sleep(500);
        tables = await callOnce(attempt);
      }
      if (!isMonthlyShape(tables)) {
        return { schemaMismatch: true as const };
      }

      const buyRaw: Record<string, unknown>[] = tables[0]?.rows ?? [];
      const saleRaw: Record<string, unknown>[] = tables[1]?.rows ?? [];
      // 콤마 문자열 → Number · YYYY-MM-DD → YYYY-MM · server 집계
      const buyNorm = buyRaw.map(normalizeMonthlyBuyRow).filter((r): r is Record<string, unknown> => r !== null);
      const saleNorm = saleRaw.map(normalizeMonthlySaleRow).filter((r): r is Record<string, unknown> => r !== null);
      const buy = aggregateByMonth(buyNorm, ["BuyTotal"]);
      const sale = aggregateByMonth(saleNorm, ["CostTotal", "SaleTotal", "CustomerCnt", "Margin"]);
      // MarginPercent 는 비율 · SUM 금지 · 집계 후 월별 재계산 (Margin / SaleTotal * 100)
      for (const r of sale) {
        const total = Number(r.SaleTotal) || 0;
        const marg = Number(r.Margin) || 0;
        r.MarginPercent = total > 0 ? Math.round((marg / total) * 1000) / 10 : null;
      }
      logger.info(`[sale-monthly] aggregated · buyMonths=${buy.length} · saleMonths=${sale.length} · firstSale=${JSON.stringify(sale[0] ?? null)}`);
      // 2026-10-05 · 사용자 옵션 B · 월 달력 UI 용 daily rows 함께 반환
      //   · buyDaily/saleDaily = normalizeMonthlyBuyRow/saleRow 결과 (SaleDateRaw=YYYY-MM-DD 보존)
      return { buy, sale, buyDaily: buyNorm, saleDaily: saleNorm, schemaMismatch: false as const };
    });
    if ("schemaMismatch" in result && result.schemaMismatch === true) {
      logger.warn(`[sale-monthly] 2회 schema mismatch 지속 · ERP_RESPONSE_SCHEMA_MISMATCH 반환`);
      return res.json({
        ok: false,
        schemaMismatch: true,
        error: "ERP 월별 데이터를 불러오지 못했습니다 (schema mismatch · ERP 응답 비정상)",
      });
    }
    const { buy, sale, buyDaily, saleDaily } = result;
    return res.json({ ok: true, buy, sale, buyDaily: buyDaily ?? [], saleDaily: saleDaily ?? [] });
  } catch (e) {
    logger.warn(`[sale-monthly-report] 실패: ${(e as Error).message}`);
    return res.json({ ok: false, error: (e as Error).message });
  }
}));

export default router;
