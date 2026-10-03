// apps/sync-agent/src/main/iregenSoap.ts
// 2026-10-03 · Iregen ERP SOAP Live Query · Inventory_Status
//   · 검증용 · Supabase WRITE 금지 · 메모리 전용 응답
//   · SOAP 호출 → Base64 → C# decoder → DataSet JSON
//   · CorpDB_nm · safeStorage 로 저장된 값만 복호화 (renderer/log 노출 X)
//   · stage 세분화 · config | network | http | decoder | fs

import { spawn } from "child_process";
import { join, resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { BrowserWindow } from "electron";

// 2026-10-03 · Product_List pagination 진행률 UI 전송 (concurrency 지원)
function broadcastProductProgress(payload: {
  page: number;
  rowsAccum: number;
  done?: boolean;
  totalPages?: number;
  totalRowsExpected?: number;
}) {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send("erp:product-progress", payload);
    } catch {
      /* ignore */
    }
  }
}
import {
  loadConfig,
  getIregenCorpDbNm,
  DEFAULT_IREGEN_ENDPOINT,
  DEFAULT_IREGEN_SOAP_ACTION,
} from "./config";

// 2026-10-03 · 사용자 지시 · .env 지원 추가 · dotenv 패키지 없이 간단 파서 사용
//   · 우선순위 · process.env > apps/sync-agent/.env > 프로젝트 root/.env > safeStorage
//   · .env* 는 루트 .gitignore 로 ignore 됨 (리모트 유출 X)
//   · 값 로그 금지 · 파일 발견 여부만 로그
function parseEnvFile(path: string): Record<string, string> {
  try {
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, "utf8");
    const out: Record<string, string> = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

// 2026-10-03 · 캐시 제거 · 매 호출 .env 재읽기 · 재시작 없이 반영
let _dotenvSource: string | null = null;
function loadDotenvFresh(): Record<string, string> {
  // __dirname (dev) = apps/sync-agent/out/main
  const syncAgentEnv = resolve(__dirname, "../../.env");                 // apps/sync-agent/.env
  const projectRootEnv = resolve(__dirname, "../../../../.env");         // project root .env
  const syncAgentMap = parseEnvFile(syncAgentEnv);
  if (Object.keys(syncAgentMap).length > 0) {
    _dotenvSource = syncAgentEnv;
    console.log("[iregen] .env 소스 · apps/sync-agent/.env (" + Object.keys(syncAgentMap).length + " keys)");
    // 2026-10-03 · 디버그 · iregen 관련 키가 포함되었는지 (값 로그 X)
    const iregenKeys = Object.keys(syncAgentMap).filter((k) => /iregen|corpdb/i.test(k));
    if (iregenKeys.length > 0) console.log("[iregen] env 안 iregen 관련 키:", iregenKeys);
    return syncAgentMap;
  }
  const rootMap = parseEnvFile(projectRootEnv);
  if (Object.keys(rootMap).length > 0) {
    _dotenvSource = projectRootEnv;
    console.log("[iregen] .env 소스 · 프로젝트 root .env (" + Object.keys(rootMap).length + " keys)");
    const iregenKeys = Object.keys(rootMap).filter((k) => /iregen|corpdb/i.test(k));
    if (iregenKeys.length > 0) console.log("[iregen] env 안 iregen 관련 키:", iregenKeys);
    return rootMap;
  }
  _dotenvSource = null;
  console.log("[iregen] .env 없음 · safeStorage 로 fallback");
  return {};
}
function envVal(key: string): string | undefined {
  const p = process.env[key];
  if (p && p.trim()) return p.trim();
  const d = loadDotenvFresh()[key];
  return d && d.trim() ? d.trim() : undefined;
}
// 2026-10-03 · 사용자 .env 에 넣은 실제 키 이름 fallback chain
//   · 영문 convention (IREGEN_*) 과 사용자 커스텀 키 (CorpDB_nm 등) 모두 지원
function envCorpDbNm(): string | undefined {
  return envVal("IREGEN_CORP_DB_NM") ?? envVal("CorpDB_nm") ?? envVal("CORPDB_NM");
}
// Phase 2 · 사용자 .env 키 이름 매핑 (공백 포함 키 그대로 사용)
function envCorpCode(): string | undefined {
  return envVal("IREGEN_CORP_CODE") ?? envVal("Iregen  companycode") ?? envVal("Iregen companycode") ?? envVal("CorpCode");
}
function envUserId(): string | undefined {
  return envVal("IREGEN_USER_ID") ?? envVal("Iregen id") ?? envVal("UserID");
}
function envUserName(): string | undefined {
  return envVal("IREGEN_USER_NAME") ?? envVal("Iregen name") ?? envVal("UserName");
}
function envStCode(): string | undefined {
  return envVal("IREGEN_ST_CODE") ?? envVal("Iregen stcode") ?? envVal("StCode");
}
export function iregenSecretSource(): "env" | "safeStorage" | "none" {
  if (envCorpDbNm()) return "env";
  const cfg = loadConfig();
  if (cfg.iregen?.encryptedCorpDbNm) return "safeStorage";
  return "none";
}
export function iregenEnvSourceLabel(): string | null {
  if (!envCorpDbNm()) return null;
  if (process.env.IREGEN_CORP_DB_NM || process.env["CorpDB_nm"] || process.env.CORPDB_NM) return "process.env";
  return _dotenvSource ?? ".env";
}

export type ErpInventoryStage = "config" | "network" | "http" | "decoder" | "fs";

export interface AllTableInfo {
  index: number;
  name: string;
  rowCount: number;
  columnCount: number;
  firstColumns: string[];
  firstRow?: Record<string, unknown>; // 2026-10-03 · metadata 추출용 (rowCount <= 2 때만 담음)
}

export interface ProductListVerification {
  firstPageRows: number;
  lastPage: number;
  lastPageRows: number;
  pagesLoaded: number;
  totalRows: number;
  duplicateCodes: number;
  emptyCodes: number;
  erpExpectedRows: number; // ERP 화면 기준 (예 4007)
  countMatch: boolean;
  verified: boolean;
  firstPageTables: AllTableInfo[]; // 첫 페이지 DataSet 전체 테이블 구조
  primaryTableName: string;
  rootCauseNote?: string; // 발견된 특이사항 (metadata table 등)
  // 2026-10-03 · 성능/안정성 지표 (사용자 지시)
  concurrency: number;
  failedPages: number[];
  totalRetries: number;
  elapsedMs: number;
  metadataColumn1?: number | string | null; // metadata table Column1 raw 값
  totalPagesSource: "metadata" | "sequential-detection"; // totalPages 계산 근거
}

export type ErpInventoryOk = {
  ok: true;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
  meta: {
    soapMs: number;
    decoderMs: number;
    totalMs: number;
    queriedAt: string;
  };
  // 2026-10-03 · Product_List 전용 · 자동 검증 결과
  verification?: ProductListVerification;
};

export type ErpInventoryFail = {
  ok: false;
  stage: ErpInventoryStage;
  error: string;
};

export type ErpInventoryResult = ErpInventoryOk | ErpInventoryFail;

const CONFIG_FRIENDLY_ERROR =
  "Iregen ERP 연결정보가 설정되지 않았습니다.\n설정 > Iregen ERP 연동에서 연결정보를 등록해주세요.";
const DISABLED_FRIENDLY_ERROR =
  "Iregen ERP 연동이 꺼져 있습니다.\n설정 > Iregen ERP 연동 · 「ERP 연동 사용」 을 켜주세요.";

function decoderPath(): string {
  // dev · __dirname = apps/sync-agent/out/main → 프로젝트 root/tools/iregen-bridge/bin/Debug/net48/
  return resolve(__dirname, "../../../../tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
}

// 2026-10-03 · Phase 2 · Fiddler 성공 Request 완전 복제
//   · 118 element · <ent> wrapper · s: prefix · xmlns:i
//   · 민감 값 (CorpDB_nm) 만 env 필수 · 나머지 식별자는 env override 가능 · default = Fiddler 값
interface EnvelopeContext {
  corpDbNm: string;
  corpCode: string;
  userId: string;
  userName: string;
  stCode: string;
  searchType: string;
  startDate: string;
  endDate: string;
}

interface ResolvedConfig {
  envelope: EnvelopeContext;
  endpoint: string;
  soapAction: string;
}

function buildEnvelopeContext(corpDbNm: string, opts?: { startDate?: string; endDate?: string }): EnvelopeContext {
  // 사용자 지시 · UI 에서 기간 입력 받음 · opts 우선 → env → today
  return {
    corpDbNm,
    corpCode: envCorpCode() ?? "30009",
    userId: envUserId() ?? "111",
    userName: envUserName() ?? "강서은",
    stCode: envStCode() ?? "000",
    searchType: envVal("IREGEN_SEARCH_TYPE") ?? "TOTAL",
    startDate: opts?.startDate ?? envVal("IREGEN_START_DATE") ?? todayISO(),
    endDate: opts?.endDate ?? envVal("IREGEN_END_DATE") ?? todayISO(),
  };
}

function loadConfigAndSecret(opts?: { startDate?: string; endDate?: string }): ResolvedConfig | { error: string } {
  const cfg = loadConfig();
  if (!cfg.iregen?.enabled) {
    return { error: DISABLED_FRIENDLY_ERROR };
  }
  const corpDbNm = envCorpDbNm() ?? getIregenCorpDbNm() ?? null;
  if (!corpDbNm || !corpDbNm.trim()) {
    return { error: CONFIG_FRIENDLY_ERROR };
  }
  return {
    envelope: buildEnvelopeContext(corpDbNm.trim(), opts),
    endpoint: envVal("IREGEN_ENDPOINT") ?? cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT,
    soapAction: envVal("IREGEN_SOAP_ACTION") ?? cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION,
  };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

// 2026-10-03 · 날짜 helper · YYYY-MM-DD (KST · ERP 는 KST 기준)
function todayISO(): string {
  const now = new Date();
  // KST (UTC+9) 로 변환 후 YYYY-MM-DD
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 10);
}

// 2026-10-03 · Phase 2 · Fiddler 캡쳐 포맷 완전 복제 · 118 element
//   · <ent> wrapper 필수 · s: prefix · xmlns:i 추가
//   · 민감 값: ctx 로 주입 · 나머지 scalar 는 Fiddler 값 그대로 하드코딩
function buildEnvelope(ctx: EnvelopeContext): string {
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body>` +
    `<Inventory_Status xmlns="http://tempuri.org/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">` +
    `<ent>` +
    `<IsReturnJson>false</IsReturnJson>` +
    `<IsEnc>false</IsEnc>` +
    `<IsCompress>false</IsCompress>` +
    `<CorpCode>${escapeXml(ctx.corpCode)}</CorpCode>` +
    `<CardFee>0</CardFee>` +
    `<Lcate>0</Lcate><Mcate>0</Mcate><Scate>0</Scate><Dcate>0</Dcate>` +
    `<IsStatus>1</IsStatus>` +
    `<IsStoreStatus>1</IsStoreStatus>` +
    `<IsBuyStatus>1</IsBuyStatus>` +
    `<IsSaleStatus>1</IsSaleStatus>` +
    `<IsStock>1</IsStock>` +
    `<GuaranteePrice>0</GuaranteePrice>` +
    `<Subsidy>0</Subsidy>` +
    `<BuyDiscount>0</BuyDiscount>` +
    `<DevCommission>0</DevCommission>` +
    `<SaleCommission>0</SaleCommission>` +
    `<Deadline>0</Deadline>` +
    `<PaymentDate>0</PaymentDate>` +
    `<BankName>0</BankName>` +
    `<EtcIntField1>0</EtcIntField1>` +
    `<EtcIntField2>0</EtcIntField2>` +
    `<EtcIntField3>0</EtcIntField3>` +
    `<IsWeight>0</IsWeight>` +
    `<CRUD>ALL</CRUD>` +
    `<CorpDB_nm>${escapeXml(ctx.corpDbNm)}</CorpDB_nm>` +
    `<PageIdx>0</PageIdx>` +
    `<PageSize>0</PageSize>` +
    `<SearchType>${escapeXml(ctx.searchType)}</SearchType>` +
    `<StartDate>${escapeXml(ctx.startDate)}</StartDate>` +
    `<EndDate>${escapeXml(ctx.endDate)}</EndDate>` +
    `<Cate>0</Cate><pCate>0</pCate>` +
    `<IsLevel>0</IsLevel>` +
    `<Sort>0</Sort>` +
    `<InStock>0</InStock><OutStock>0</OutStock>` +
    `<Idx>0</Idx>` +
    `<IsUseType>0</IsUseType>` +
    `<PLcate>0</PLcate><PMcate>0</PMcate><PScate>0</PScate><PDcate>0</PDcate>` +
    `<SaleTax>0</SaleTax>` +
    `<IsAll>false</IsAll>` +
    `<FileSize>0</FileSize>` +
    `<BuseoCode>-1</BuseoCode>` +
    `<CtContact>0</CtContact>` +
    `<UseStock>0</UseStock><NowStock>0</NowStock>` +
    `<EditStock>0</EditStock><PlusStock>0</PlusStock><MinusStock>0</MinusStock>` +
    `<StCode>${escapeXml(ctx.stCode)}</StCode>` +
    `<InBuseoCode>0</InBuseoCode><OutBuseoCode>0</OutBuseoCode>` +
    `<UserID>${escapeXml(ctx.userId)}</UserID>` +
    `<UserName>${escapeXml(ctx.userName)}</UserName>` +
    `<TotalBuyPrice>0</TotalBuyPrice>` +
    `<TotalPrice>0</TotalPrice>` +
    `<TotalTax>0</TotalTax>` +
    `<TotalExemption>0</TotalExemption>` +
    `<TotalBuyTotal>0</TotalBuyTotal>` +
    `<RLcate>0</RLcate><RMcate>0</RMcate>` +
    `<FolderCode>0</FolderCode>` +
    `<TotalStock>0</TotalStock>` +
    `<ExTotalStock>0</ExTotalStock><ExStockCnt>0</ExStockCnt><ExEaStockCnt>0</ExEaStockCnt>` +
    `<CostPrice>0</CostPrice>` +
    `<CostTax>0</CostTax>` +
    `<TaxExemption>0</TaxExemption>` +
    `<CostTotal>0</CostTotal><SaleTotal>0</SaleTotal>` +
    `<Margin>0</Margin><MarginRate>0</MarginRate>` +
    `<DocPrint>0</DocPrint>` +
    `<UnitStock>0</UnitStock><UnitCost>0</UnitCost><UnitSale>0</UnitSale>` +
    `<StockCnt>0</StockCnt>` +
    `<StorageGubun>A</StorageGubun>` +
    `<MakerCode>0</MakerCode><BrandCode>0</BrandCode>` +
    `<oLcate>0</oLcate><oMcate>0</oMcate><oScate>0</oScate>` +
    `<EaCost>0</EaCost>` +
    `<DocIdx>0</DocIdx>` +
    `<NowStockCount>0</NowStockCount>` +
    `<_UseStockCount>0</_UseStockCount>` +
    `<RotationDays>0</RotationDays>` +
    `<LocationCode>0</LocationCode>` +
    `<table_UpLoad_BuyCustomer_Contact_RowCnt>0</table_UpLoad_BuyCustomer_Contact_RowCnt>` +
    `<table_UpLoad_BuyCustomer_Address_RowCnt>0</table_UpLoad_BuyCustomer_Address_RowCnt>` +
    `<table_UpLoad_BuyCustomer_Image_RowCnt>0</table_UpLoad_BuyCustomer_Image_RowCnt>` +
    `<table_UpLoad_BuyCustomer_JoinStorage_RowCnt>0</table_UpLoad_BuyCustomer_JoinStorage_RowCnt>` +
    `<table_UpLoad_SaleProduct_RowCnt>0</table_UpLoad_SaleProduct_RowCnt>` +
    `<table_UpLoad_Move_Product_RowCnt>0</table_UpLoad_Move_Product_RowCnt>` +
    `<table_UpLoad_Subdivision_In_RowCnt>0</table_UpLoad_Subdivision_In_RowCnt>` +
    `<table_UpLoad_Subdivision_Out_RowCnt>0</table_UpLoad_Subdivision_Out_RowCnt>` +
    `<table_UpLoad_StockAdjustment_Product_RowCnt>0</table_UpLoad_StockAdjustment_Product_RowCnt>` +
    `<table_UpLoad_Stocktaking_Product_RowCnt>0</table_UpLoad_Stocktaking_Product_RowCnt>` +
    `<table_UpLoad_Image_RowCnt>0</table_UpLoad_Image_RowCnt>` +
    `<table_UpLoad_XDock_Product_RowCnt>0</table_UpLoad_XDock_Product_RowCnt>` +
    `<ToUnitStock>0</ToUnitStock><ToStockCnt>0</ToStockCnt>` +
    `<LmCode>0</LmCode>` +
    `<WindowDays>0</WindowDays>` +
    `<MinHistoryDays>0</MinHistoryDays>` +
    `<NewProductDays>0</NewProductDays>` +
    `<DefaultLeadTime>0</DefaultLeadTime>` +
    `<DefaultOrderCycle>0</DefaultOrderCycle>` +
    `<SoldOutDays>0</SoldOutDays>` +
    `<PageIndex>0</PageIndex>` +
    `</ent>` +
    `</Inventory_Status>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

async function callSoap(
  endpoint: string,
  soapAction: string,
  body: string,
  timeoutMs: number = 60_000,
): Promise<{ ok: true; xml: string } | { ok: false; stage: "network" | "http"; error: string }> {
  // 2026-10-03 · hang 방지 · AbortController timeout (기본 60s)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${soapAction}"`,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") {
      return { ok: false, stage: "network", error: `SOAP 호출 타임아웃 · ${timeoutMs}ms 초과` };
    }
    return { ok: false, stage: "network", error: e.message };
  } finally {
    clearTimeout(timer);
  }
  const xml = await res.text().catch(() => "");
  if (!res.ok) {
    // 2026-10-03 · 사용자 지시 · UI 에 응답 body 전체 노출 X · faultstring 요약만
    //   · 개발 로그에만 faultcode/faultstring 기록
    const faultCode = xml.match(/<faultcode[^>]*>([^<]*)<\/faultcode>/)?.[1];
    const faultString = xml.match(/<faultstring[^>]*>([^<]*)<\/faultstring>/)?.[1];
    if (faultCode) console.error("[iregen] faultcode:", faultCode);
    if (faultString) console.error("[iregen] faultstring:", faultString);
    const userMsg = `HTTP ${res.status} · Iregen 서버 처리 오류` + (faultString ? ` (${faultString.slice(0, 80)})` : "");
    return { ok: false, stage: "http", error: userMsg };
  }
  return { ok: true, xml };
}

function runDecoder(
  responseXmlPath: string,
  cwd: string,
): Promise<{ ok: true; stderrTail: string } | { ok: false; error: string }> {
  return new Promise((resolveP) => {
    const exe = decoderPath();
    if (!existsSync(exe)) {
      resolveP({ ok: false, error: `decoder 실행 파일 없음 · ${exe} · build 필요` });
      return;
    }
    const stderrChunks: string[] = [];
    const child = spawn(exe, ["-f", responseXmlPath], { cwd, windowsHide: true });
    child.stdout.on("data", () => {});
    child.stderr.on("data", (buf) => {
      stderrChunks.push(buf.toString("utf8"));
    });
    child.on("error", (err) => {
      resolveP({ ok: false, error: "decoder spawn 실패 · " + err.message });
    });
    child.on("close", (code) => {
      const stderr = stderrChunks.join("");
      const tail = stderr.split("\n").slice(-15).join("\n");
      if (code === 0) {
        resolveP({ ok: true, stderrTail: tail });
      } else {
        resolveP({ ok: false, error: `decoder exit ${code}\n${tail}` });
      }
    });
  });
}

// 2026-10-03 · 공통 decoder · 결과에 전체 테이블 info 포함 (디버깅/검증용)
export type ErpDecodeOk = ErpInventoryOk & { allTables: AllTableInfo[]; primaryIndex: number };
export type ErpDecodeResult = ErpDecodeOk | ErpInventoryFail;

async function decodeResponseToResult(
  soapXml: string,
  t0: number,
  soapMs: number,
): Promise<ErpDecodeResult> {
  const cwd = join(tmpdir(), "iregen-live-" + Date.now());
  try {
    mkdirSync(cwd, { recursive: true });
    const xmlPath = join(cwd, "inventory-response.xml");
    writeFileSync(xmlPath, soapXml, "utf8");

    const decT0 = Date.now();
    const dec = await runDecoder(xmlPath, cwd);
    const decoderMs = Date.now() - decT0;
    if (!dec.ok) {
      console.error("[iregen] stage=decoder ·", decoderMs, "ms ·", dec.error);
      return { ok: false, stage: "decoder", error: dec.error };
    }
    console.log("[iregen] decoder OK ·", decoderMs, "ms");

    const outPath = join(cwd, "output", "inventory-full.json");
    if (!existsSync(outPath)) {
      return { ok: false, stage: "fs", error: "decoder output 파일 없음 · " + outPath };
    }
    let parsed: {
      datasetName: string;
      tableCount: number;
      tables: Array<{ name: string; rowCount: number; columns: Array<{ name: string; type: string }>; rows: Record<string, unknown>[] }>;
    };
    try {
      parsed = JSON.parse(readFileSync(outPath, "utf8"));
    } catch (err) {
      return { ok: false, stage: "fs", error: "output JSON 파싱 실패 · " + (err as Error).message };
    }
    if (!parsed.tables || parsed.tables.length === 0) {
      return { ok: false, stage: "decoder", error: "DataSet 테이블 0개" };
    }
    // 2026-10-03 · Product_List 는 metadata + data 테이블 분리 가능성
    //   · tables[0] 하드코딩 X · rowCount 가장 많은 테이블을 primary 로 선택
    //   · 모든 테이블 요약 로그 + 결과에 포함
    const allTables: AllTableInfo[] = parsed.tables.map((tbl, idx) => ({
      index: idx,
      name: tbl.name,
      rowCount: tbl.rowCount,
      columnCount: tbl.columns.length,
      firstColumns: tbl.columns.slice(0, 8).map((c) => c.name),
      // metadata table (작은 rowCount) 의 첫 row 값 담음 · total count 추출용
      firstRow: tbl.rowCount > 0 && tbl.rowCount <= 2 ? tbl.rows[0] : undefined,
    }));
    console.log(`[iregen] DataSet "${parsed.datasetName}" · ${parsed.tables.length} tables:`);
    allTables.forEach((info) => {
      console.log(`  [${info.index}] name="${info.name}" · ${info.rowCount} rows · ${info.columnCount} cols · cols=${info.firstColumns.join(", ")}${info.columnCount > info.firstColumns.length ? "..." : ""}`);
    });
    // 주 데이터 테이블 = rowCount 가장 많은 것 (metadata 자동 회피)
    //   · tie 시 index 작은 쪽
    let primaryIndex = 0;
    for (let i = 1; i < parsed.tables.length; i++) {
      if (parsed.tables[i].rowCount > parsed.tables[primaryIndex].rowCount) primaryIndex = i;
    }
    const t = parsed.tables[primaryIndex];
    console.log(`[iregen] 주 데이터 테이블 선택: Table[${primaryIndex}] "${t.name}" · ${t.rowCount} rows (전체 ${parsed.tables.length}개 중)`);
    const totalMs = Date.now() - t0;
    console.log("[iregen] 전체 완료 ·", totalMs, "ms · rows:", t.rowCount, "· columns:", t.columns.length);
    return {
      ok: true,
      rowCount: t.rowCount,
      columns: t.columns.map((c) => c.name),
      rows: t.rows,
      meta: { soapMs, decoderMs, totalMs, queriedAt: new Date().toISOString() },
      allTables,
      primaryIndex,
    };
  } finally {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* 정리 실패 무시 */
    }
  }
}

// 2026-10-03 · 사용자 지시 TEST A · diagnostic 모드
//   · 저장된 Fiddler Request (tools/iregen-bridge/samples/request.txt) 를 그대로 전송
//   · CorpDB_nm 만 env/safeStorage 값으로 치환 (hard coding 금지 원칙)
//   · 성공 시 · builder 를 Fiddler 포맷으로 재작성 가능 확인
export async function queryInventoryStatusRaw(): Promise<ErpInventoryResult> {
  const t0 = Date.now();
  const cfg = loadConfig();
  if (!cfg.iregen?.enabled) {
    console.warn("[iregen:raw] stage=config · ERP 연동 OFF");
    return { ok: false, stage: "config", error: DISABLED_FRIENDLY_ERROR };
  }
  const envCorp = envCorpDbNm();
  const corpDbNm = envCorp ?? getIregenCorpDbNm() ?? null;
  if (!corpDbNm || !corpDbNm.trim()) {
    console.warn("[iregen:raw] stage=config · CorpDB_nm 미설정");
    return { ok: false, stage: "config", error: CONFIG_FRIENDLY_ERROR };
  }

  // Fiddler Request 샘플 로드
  const reqPath = resolve(__dirname, "../../../../tools/iregen-bridge/samples/request.txt");
  if (!existsSync(reqPath)) {
    return {
      ok: false,
      stage: "config",
      error: "진단용 Fiddler Request 샘플 파일 없음\ntools/iregen-bridge/samples/request.txt",
    };
  }
  let body: string;
  try {
    body = readFileSync(reqPath, "utf8").trim();
  } catch (err) {
    return { ok: false, stage: "fs", error: "request.txt 읽기 실패 · " + (err as Error).message };
  }
  // CorpDB_nm 만 env 값으로 치환 (파일 내 저장된 token 교체)
  //   · \S* 로 CorpDB_nm 안 비 공백 문자 매칭 (†·base64 등 다 안전)
  const before = body.length;
  body = body.replace(/<CorpDB_nm>[^<]*<\/CorpDB_nm>/, `<CorpDB_nm>${escapeXml(corpDbNm)}</CorpDB_nm>`);
  const replaced = body.length !== before || /<CorpDB_nm>/.test(body);
  if (!replaced) {
    return { ok: false, stage: "config", error: "request.txt 안 <CorpDB_nm> 치환 실패" };
  }

  const endpoint = envVal("IREGEN_ENDPOINT") ?? cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT;
  const soapAction = envVal("IREGEN_SOAP_ACTION") ?? cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION;
  console.log("[iregen:raw] POST · endpoint:", endpoint, "· body bytes:", body.length);
  const soapT0 = Date.now();
  const soapRes = await callSoap(endpoint, soapAction, body);
  const soapMs = Date.now() - soapT0;
  if (!soapRes.ok) {
    console.error("[iregen:raw] stage=" + soapRes.stage + " ·", soapMs, "ms");
    return { ok: false, stage: soapRes.stage, error: soapRes.error };
  }
  console.log("[iregen:raw] SOAP OK ·", soapMs, "ms · response bytes:", soapRes.xml.length);
  return decodeResponseToResult(soapRes.xml, t0, soapMs);
}

export async function queryInventoryStatus(opts?: { startDate?: string; endDate?: string }): Promise<ErpInventoryResult> {
  const t0 = Date.now();

  // 1. 설정 + envelope 컨텍스트 로드 (민감 값 로그 X · 사용자 기간 입력 반영)
  const resolved = loadConfigAndSecret(opts);
  if ("error" in resolved) {
    console.warn("[iregen] stage=config · 연결정보 미설정");
    return { ok: false, stage: "config", error: resolved.error };
  }

  // 2. SOAP 호출 · body 전체 로그 금지
  const envelope = buildEnvelope(resolved.envelope);
  const soapT0 = Date.now();
  console.log("[iregen] SOAP POST · endpoint:", resolved.endpoint, "· body bytes:", envelope.length);
  const soapRes = await callSoap(resolved.endpoint, resolved.soapAction, envelope);
  const soapMs = Date.now() - soapT0;
  if (!soapRes.ok) {
    console.error("[iregen] stage=" + soapRes.stage + " ·", soapMs, "ms ·", soapRes.error);
    return { ok: false, stage: soapRes.stage, error: soapRes.error };
  }
  console.log("[iregen] SOAP OK ·", soapMs, "ms · response bytes:", soapRes.xml.length);
  return decodeResponseToResult(soapRes.xml, t0, soapMs);
}

// ============================================================================
// 2026-10-03 · PHASE 1 · Product_List (사업장 상품관리)
// ============================================================================
// Fiddler Request 기반 · tools/iregen-bridge/samples/products-request.txt
// Endpoint: SvcProductBiz.asmx · SOAPAction: Product_List
// 특징: PageIdx/PageSize 로 server-side pagination · CRUD=DETAIL
// 157 element 완전 복제 · 민감 값만 env 주입

const PRODUCT_LIST_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcProductBiz.asmx";
const PRODUCT_LIST_SOAP_ACTION = "http://tempuri.org/Product_List";

interface ProductListContext {
  corpCode: string;
  userId: string;
  userName: string;
  stCode: string;
  corpDbNm: string;
  pageIdx: number;
  pageSize: number;
}

function buildProductListEnvelope(ctx: ProductListContext): string {
  // 2026-10-03 · Fiddler product-3-request.txt 완전 복제
  //   · 핵심 diff vs 저희 이전 (products-request.txt):
  //     - <CRUD>DETAIL</CRUD> 완전 제거
  //     - <SearchType>TOTAL</SearchType> → <SearchType>0</SearchType>
  //     - <SearchWord/> 신규 추가
  //   · 이 3 가지가 Rows=1 원인 유력 (ERP 가 CRUD=DETAIL 받으면 상세 모드 반환)
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<Product_List xmlns="http://tempuri.org/">` +
    `<ent>` +
    `<IsReturnJson>false</IsReturnJson><IsEnc>false</IsEnc><IsCompress>false</IsCompress>` +
    `<IsStorageGubunOut>false</IsStorageGubunOut><StorageGubun>A</StorageGubun>` +
    `<CorpCode>${escapeXml(ctx.corpCode)}</CorpCode>` +
    `<OutBuseoCode>0</OutBuseoCode><IsProductType>0</IsProductType><IsWeight>0</IsWeight>` +
    `<IsStockEdit>false</IsStockEdit><IsStock>0</IsStock><IsTax>0</IsTax><TaxPercent>0</TaxPercent>` +
    `<CostPrice>0</CostPrice><UnitCost>0</UnitCost><SalePrice>0</SalePrice>` +
    `<Lcate>0</Lcate><Mcate>0</Mcate><Scate>0</Scate><Dcate>0</Dcate><Ecate>0</Ecate><Fcate>0</Fcate>` +
    `<MakerCode>0</MakerCode><BrandCode>0</BrandCode>` +
    `<oLcate>0</oLcate><oMcate>0</oMcate><oScate>0</oScate>` +
    `<CateGubunOne>0</CateGubunOne><CateGubunTwo>0</CateGubunTwo>` +
    `<IsStandingPoint>0</IsStandingPoint><ProductFee>0</ProductFee><IsKeepingRule>0</IsKeepingRule>` +
    `<BottlePrice>0</BottlePrice><SeCode>0</SeCode><BuseoCode>-1</BuseoCode>` +
    `<IsPoint>0</IsPoint><PointAdd>0</PointAdd>` +
    `<IsSalesStore>1</IsSalesStore><IsBuyStatus>0</IsBuyStatus><IsSaleStatus>1</IsSaleStatus>` +
    `<IsBauCheo>2</IsBauCheo><DevDDay>0</DevDDay>` +
    `<IsMakeDayEdit>false</IsMakeDayEdit><IsExpiryDayEdit>false</IsExpiryDayEdit>` +
    `<IsIdentificationEdit>false</IsIdentificationEdit><UniPassDay>0</UniPassDay>` +
    `<SearchWord/>` +
    `<BuyUnitStock>0</BuyUnitStock><SaleUnitStock>0</SaleUnitStock>` +
    `<TotalStockCnt>0</TotalStockCnt><NowStock>0</NowStock><EditStock>0</EditStock>` +
    `<PlusStock>0</PlusStock><MinusStock>0</MinusStock>` +
    `<EtcIntField1>0</EtcIntField1><EtcIntField2>0</EtcIntField2><EtcIntField3>0</EtcIntField3>` +
    `<UserID>${escapeXml(ctx.userId)}</UserID>` +
    `<UserName>${escapeXml(ctx.userName)}</UserName>` +
    `<CorpDB_nm>${escapeXml(ctx.corpDbNm)}</CorpDB_nm>` +
    `<PageIdx>${ctx.pageIdx}</PageIdx>` +
    `<PageSize>${ctx.pageSize}</PageSize>` +
    `<SearchType>0</SearchType>` +
    `<StartDate/><EndDate/>` +
    `<AIdx>0</AIdx><Sort>0</Sort><Idx>0</Idx>` +
    `<UnitStock>0</UnitStock><UnitPrice>0</UnitPrice><SaleTotal>0</SaleTotal>` +
    `<PagCode>0</PagCode>` +
    `<StCode>${escapeXml(ctx.stCode)}</StCode>` +
    `<BlockCode>0</BlockCode><BlockCnt>0</BlockCnt>` +
    `<Cate>0</Cate><pCate>0</pCate>` +
    `<StartPrice>0</StartPrice><EndPrice>0</EndPrice>` +
    `<CateCostMargin>0</CateCostMargin><CateSaleMargin>0</CateSaleMargin>` +
    `<IsLevel>0</IsLevel><IsStatus>1</IsStatus><IsSoldOutShop>0</IsSoldOutShop>` +
    `<FileSize>0</FileSize><TotalStock>0</TotalStock><StockDays>0</StockDays>` +
    `<MinStock>0</MinStock><MaxStock>0</MaxStock><SoldOutCnt>0</SoldOutCnt>` +
    `<SaleDDay>0</SaleDDay><RetentionDate>0</RetentionDate>` +
    `<OptIdx>0</OptIdx><OptionPrice>0</OptionPrice><OptionStock>0</OptionStock>` +
    `<PriceA>0</PriceA><PriceAPercent>0</PriceAPercent>` +
    `<PriceB>0</PriceB><PriceBPercent>0</PriceBPercent>` +
    `<PriceC>0</PriceC><PriceCPercent>0</PriceCPercent>` +
    `<PriceD>0</PriceD><PriceDPercent>0</PriceDPercent>` +
    `<Incentive>0</Incentive><MaxSaleCnt>0</MaxSaleCnt><MinSaleCnt>0</MinSaleCnt>` +
    `<EvCostUnit>0</EvCostUnit><InventoryEvCostUnit>0</InventoryEvCostUnit>` +
    `<EvSaleUnit>0</EvSaleUnit><pIdx>0</pIdx><SetLevel>0</SetLevel>` +
    `<StockCnt>0</StockCnt><AddPrice>0</AddPrice><SetSaleTotal>0</SetSaleTotal>` +
    `<Horizontal>0</Horizontal><Vertical>0</Vertical><Height>0</Height>` +
    `<Volume>0</Volume><Weight>0</Weight>` +
    `<StartEditDate/><EndEditDate/><CtCode/>` +
    `<IsUnitView>2</IsUnitView><IsPriceStatus>1</IsPriceStatus>` +
    `<PrintCnt>0</PrintCnt><TagCode>0</TagCode><FolderCode>0</FolderCode>` +
    `<PcnIdx>0</PcnIdx><CommissionRate>0</CommissionRate>` +
    `<table_UpLoad_Product_Image_RowCnt>0</table_UpLoad_Product_Image_RowCnt>` +
    `<table_UpLoad_Product_Unit_RowCnt>0</table_UpLoad_Product_Unit_RowCnt>` +
    `<table_UpLoad_Product_BarCode_RowCnt>0</table_UpLoad_Product_BarCode_RowCnt>` +
    `<table_UpLoad_Product_OfficialNotiGroup_RowCnt>0</table_UpLoad_Product_OfficialNotiGroup_RowCnt>` +
    `<table_UpLoad_Product_Add_nm_RowCnt>0</table_UpLoad_Product_Add_nm_RowCnt>` +
    `<table_UpLoad_Product_Add_Value_RowCnt>0</table_UpLoad_Product_Add_Value_RowCnt>` +
    `<table_UpLoad_Product_Option_nm_RowCnt>0</table_UpLoad_Product_Option_nm_RowCnt>` +
    `<table_UpLoad_Product_Option_Value_RowCnt>0</table_UpLoad_Product_Option_Value_RowCnt>` +
    `<table_UpLoad_Product_RowCnt>0</table_UpLoad_Product_RowCnt>` +
    `<table_UpLoad_Product_Set_RowCnt>0</table_UpLoad_Product_Set_RowCnt>` +
    `<table_UpLoad_Product_Set_Product_RowCnt>0</table_UpLoad_Product_Set_Product_RowCnt>` +
    `<table_Product_Notice_RowCnt>0</table_Product_Notice_RowCnt>` +
    `<table_Product_Price_Request_RowCnt>0</table_Product_Price_Request_RowCnt>` +
    `<IsBuseoEdit>false</IsBuseoEdit><IsBuyStatusEdit>false</IsBuyStatusEdit>` +
    `<IsSaleStatusEdit>false</IsSaleStatusEdit><IsProductOrderEdit>false</IsProductOrderEdit>` +
    `<IsPointEdit>false</IsPointEdit><IsCostPriceEdit>false</IsCostPriceEdit>` +
    `<IsPriceAEdit>false</IsPriceAEdit><IsPriceBEdit>false</IsPriceBEdit>` +
    `<IsPriceCEdit>false</IsPriceCEdit><IsPriceDEdit>false</IsPriceDEdit>` +
    `<IsBuyDefaultEdit>false</IsBuyDefaultEdit><IsSaleDefaultEdit>false</IsSaleDefaultEdit>` +
    `<IsStatusEdit>false</IsStatusEdit><IsSoldOutShopEdit>false</IsSoldOutShopEdit>` +
    `<IsSoldOutDomeEdit>false</IsSoldOutDomeEdit>` +
    `<IsStatus01Edit>false</IsStatus01Edit><IsStatus02Edit>false</IsStatus02Edit>` +
    `<IsStatus03Edit>false</IsStatus03Edit><IsStatus04Edit>false</IsStatus04Edit>` +
    `<TabStatus>000</TabStatus>` +
    `<OutDcate>0</OutDcate><OutStockCnt>0</OutStockCnt>` +
    `<InDcate>0</InDcate><InStockCnt>0</InStockCnt>` +
    `<MoveStock>0</MoveStock><ProductCnt>0</ProductCnt><DiscountPercent>0</DiscountPercent>` +
    `<EvMaxStock>0</EvMaxStock>` +
    `<table_UpLoad_Store_Price_Tag_Product_RowCnt>0</table_UpLoad_Store_Price_Tag_Product_RowCnt>` +
    `<table_UpLoad_StoreEvent_Product_RowCnt>0</table_UpLoad_StoreEvent_Product_RowCnt>` +
    `<minQuantityByOrder>0</minQuantityByOrder><maxQuantityByOrder>0</maxQuantityByOrder>` +
    `<FontSize>0</FontSize><BorderSize>0</BorderSize><InIdx>0</InIdx>` +
    `<CostV2Add>0</CostV2Add>` +
    `<PriceAAdd>0</PriceAAdd><PriceBAdd>0</PriceBAdd><PriceCAdd>0</PriceCAdd><PriceDAdd>0</PriceDAdd>` +
    `</ent>` +
    `</Product_List>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

// Product_List · 전체 상품 pagination loop · PageIdx 1..N
//   · 마지막 페이지: rows < pageSize 또는 rows=0
//   · MAX_PAGES safety guard = 400 (= 20,000 상품)
//   · 모든 페이지 rows 를 하나의 result 로 합침
// 2026-10-03 · metadata table 에서 totalCount 추출 시도
function tryExtractTotalFromMetadata(tables: AllTableInfo[], primaryIndex: number): { value: number | null; raw: unknown } {
  const metaCandidates = ["Column1", "ProductCnt", "TotalCount", "TotalCnt", "TotalRows", "Total", "RowCount", "Count"];
  for (let i = 0; i < tables.length; i++) {
    if (i === primaryIndex) continue;
    const row = tables[i].firstRow;
    if (!row) continue;
    for (const key of metaCandidates) {
      if (!(key in row)) continue;
      const v = row[key];
      if (v == null) continue;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d-]/g, ""));
      if (!Number.isNaN(n) && n > 0 && n < 10_000_000) return { value: n, raw: v };
    }
  }
  return { value: null, raw: null };
}

type PageOutcome =
  | { ok: true; pageIdx: number; rowCount: number; columns: string[]; rows: Record<string, unknown>[]; allTables: AllTableInfo[]; primaryIndex: number; soapMs: number; decoderMs: number; attempts: number }
  | { ok: false; pageIdx: number; stage: ErpInventoryStage; error: string; attempts: number };

// 2026-10-03 · 단일 페이지 조회 + retry (사용자 지시 1s/2s/포기)
async function fetchProductPageWithRetry(
  pageIdx: number,
  pageSize: number,
  ctx: ProductListContext,
  endpoint: string,
  soapAction: string,
  maxAttempts: number = 3,
): Promise<PageOutcome> {
  let lastStage: ErpInventoryStage = "network";
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const envelope = buildProductListEnvelope({ ...ctx, pageIdx, pageSize });
    const soapT0 = Date.now();
    const soapRes = await callSoap(endpoint, soapAction, envelope);
    const soapMs = Date.now() - soapT0;
    if (!soapRes.ok) {
      const retriable = soapRes.stage === "network" || (soapRes.stage === "http" && /HTTP (429|500|502|503)/.test(soapRes.error));
      lastStage = soapRes.stage;
      lastError = soapRes.error;
      if (!retriable || attempt === maxAttempts) {
        return { ok: false, pageIdx, stage: soapRes.stage, error: soapRes.error, attempts: attempt };
      }
      const delay = attempt * 1000;
      console.warn(`[iregen:product] page ${pageIdx} attempt ${attempt} 실패 (${soapRes.stage}) · ${delay}ms 후 재시도`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    const decT0 = Date.now();
    const decoded = await decodeResponseToResult(soapRes.xml, decT0, 0);
    const decoderMs = Date.now() - decT0;
    if (!decoded.ok) {
      lastStage = decoded.stage;
      lastError = decoded.error;
      if (attempt === maxAttempts) {
        return { ok: false, pageIdx, stage: decoded.stage, error: decoded.error, attempts: attempt };
      }
      const delay = attempt * 1000;
      console.warn(`[iregen:product] page ${pageIdx} attempt ${attempt} decode 실패 · ${delay}ms 후 재시도`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return {
      ok: true,
      pageIdx,
      rowCount: decoded.rowCount,
      columns: decoded.columns,
      rows: decoded.rows,
      allTables: decoded.allTables,
      primaryIndex: decoded.primaryIndex,
      soapMs,
      decoderMs,
      attempts: attempt,
    };
  }
  return { ok: false, pageIdx, stage: lastStage, error: lastError, attempts: maxAttempts };
}

export async function queryProductList(opts?: { pageSize?: number; concurrency?: number; maxPages?: number }): Promise<ErpInventoryResult> {
  const t0 = Date.now();
  const pageSize = opts?.pageSize ?? 50;
  const concurrency = Math.max(1, Math.min(10, opts?.concurrency ?? 5));
  const hardMaxPages = opts?.maxPages ?? 400; // safety guard

  const cfg = loadConfig();
  if (!cfg.iregen?.enabled) return { ok: false, stage: "config", error: DISABLED_FRIENDLY_ERROR };
  const corpDbNm = envCorpDbNm() ?? getIregenCorpDbNm() ?? null;
  if (!corpDbNm || !corpDbNm.trim()) return { ok: false, stage: "config", error: CONFIG_FRIENDLY_ERROR };

  const ctx: ProductListContext = {
    corpCode: envCorpCode() ?? "30009",
    userId: envUserId() ?? "111",
    userName: envUserName() ?? "강서은",
    stCode: envStCode() ?? "000",
    corpDbNm: corpDbNm.trim(),
    pageIdx: 1,
    pageSize,
  };
  const endpoint = envVal("IREGEN_PRODUCT_LIST_ENDPOINT") ?? PRODUCT_LIST_ENDPOINT;
  const soapAction = envVal("IREGEN_PRODUCT_LIST_SOAP_ACTION") ?? PRODUCT_LIST_SOAP_ACTION;

  // ── Step 1 · Page 1 단독 조회 + metadata 분석 ──
  console.log(`[iregen:product] Step 1 · Page 1 단독 조회 · concurrency=${concurrency}`);
  const page1 = await fetchProductPageWithRetry(1, pageSize, ctx, endpoint, soapAction);
  if (!page1.ok) {
    console.error(`[iregen:product] Page 1 실패 · stage=${page1.stage} · ${page1.error}`);
    return { ok: false, stage: page1.stage, error: page1.error };
  }
  const firstPageRows = page1.rowCount;
  const firstPageTables = page1.allTables;
  const primaryTableName = page1.allTables[page1.primaryIndex]?.name ?? "";
  const columns = page1.columns;

  // metadata Column1 로그 (사용자 지시)
  for (const t of firstPageTables) {
    if (t.index === page1.primaryIndex) continue;
    const col1 = t.firstRow?.Column1 ?? Object.values(t.firstRow ?? {})[0] ?? "N/A";
    console.log(`[Product_List Metadata]`);
    console.log(`  Table: ${t.name}`);
    console.log(`  Column: Column1`);
    console.log(`  Value: ${JSON.stringify(col1)}`);
  }

  const metaExtract = tryExtractTotalFromMetadata(firstPageTables, page1.primaryIndex);
  let totalPages: number;
  let totalPagesSource: "metadata" | "sequential-detection";
  if (metaExtract.value && metaExtract.value >= firstPageRows) {
    totalPages = Math.ceil(metaExtract.value / pageSize);
    totalPagesSource = "metadata";
    console.log(`[iregen:product] metadata totalRows=${metaExtract.value} · totalPages=${totalPages} (parallel 가능)`);
  } else {
    totalPages = Math.min(hardMaxPages, 100); // metadata 없을 때 상한
    totalPagesSource = "sequential-detection";
    console.log(`[iregen:product] metadata totalCount 추출 실패 · 순차 fallback (상한 ${totalPages})`);
  }

  // ── Step 2 · Page 2 ~ totalPages 조회 ──
  let allRowsOrdered = [page1];
  let totalSoapMs = page1.soapMs;
  let totalDecoderMs = page1.decoderMs;
  let totalRetries = Math.max(0, page1.attempts - 1);
  const failedPages: number[] = [];
  let lastPageRows = firstPageRows;

  const broadcastWithPercent = (completedPages: number, rowsAccum: number, done = false) => {
    broadcastProductProgress({
      page: completedPages,
      rowsAccum,
      done,
      totalPages: totalPagesSource === "metadata" ? totalPages : undefined,
      totalRowsExpected: metaExtract.value ?? undefined,
    } as any);
  };
  broadcastWithPercent(1, firstPageRows);

  if (totalPagesSource === "metadata" && concurrency > 1) {
    // 병렬 batched 조회
    for (let batchStart = 2; batchStart <= totalPages; batchStart += concurrency) {
      const batchEnd = Math.min(batchStart + concurrency - 1, totalPages);
      const promises: Promise<PageOutcome>[] = [];
      for (let p = batchStart; p <= batchEnd; p++) {
        promises.push(fetchProductPageWithRetry(p, pageSize, ctx, endpoint, soapAction));
      }
      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        allRowsOrdered.push(r as any);
        if (!r.ok) {
          failedPages.push(r.pageIdx);
          console.error(`[iregen:product] page ${r.pageIdx} FAILED · ${r.stage}: ${r.error}`);
        } else {
          totalSoapMs += r.soapMs;
          totalDecoderMs += r.decoderMs;
          totalRetries += Math.max(0, r.attempts - 1);
          lastPageRows = r.rowCount;
        }
      }
      const okCount = allRowsOrdered.filter((p) => p.ok).length;
      const rowsSoFar = allRowsOrdered.reduce((s, p) => s + (p.ok ? p.rowCount : 0), 0);
      console.log(`[iregen:product] batch ${batchStart}~${batchEnd} 완료 · ${okCount} pages · ${rowsSoFar.toLocaleString()} rows 누적`);
      broadcastWithPercent(batchEnd, rowsSoFar);
    }
  } else {
    // 순차 fallback (concurrency=1 또는 metadata 없음)
    for (let p = 2; p <= totalPages; p++) {
      const r = await fetchProductPageWithRetry(p, pageSize, ctx, endpoint, soapAction);
      allRowsOrdered.push(r as any);
      if (!r.ok) {
        failedPages.push(p);
        console.error(`[iregen:product] page ${p} FAILED · ${r.stage}: ${r.error}`);
        // 순차 모드에서 네트워크 실패면 더 진행해도 fail 가능성 큼 · 하지만 끝까지 시도
        continue;
      }
      totalSoapMs += r.soapMs;
      totalDecoderMs += r.decoderMs;
      totalRetries += Math.max(0, r.attempts - 1);
      lastPageRows = r.rowCount;
      const rowsSoFar = allRowsOrdered.reduce((s, pp) => s + (pp.ok ? pp.rowCount : 0), 0);
      broadcastWithPercent(p, rowsSoFar);
      // metadata 없는 경우 · 자동 마지막 페이지 감지
      if (totalPagesSource !== "metadata" && (r.rowCount < pageSize || r.rowCount === 0)) {
        console.log(`[iregen:product] 마지막 페이지 ${p} 감지 (${r.rowCount} < ${pageSize})`);
        break;
      }
    }
  }

  // ── Step 3 · PageIdx 순서로 정렬 후 rows 합치기 ──
  allRowsOrdered.sort((a, b) => a.pageIdx - b.pageIdx);
  const allRows: Record<string, unknown>[] = [];
  for (const p of allRowsOrdered) {
    if (p.ok) allRows.push(...p.rows);
  }
  const pagesLoaded = allRowsOrdered.filter((p) => p.ok).length;
  const totalMs = Date.now() - t0;
  broadcastWithPercent(pagesLoaded, allRows.length, true);

  // ── Step 4 · 자동 검증 ──
  const codeField = "PCode";
  const seenCodes = new Set<string>();
  let duplicateCodes = 0;
  let emptyCodes = 0;
  for (const row of allRows) {
    const str = row[codeField] == null ? "" : String(row[codeField]).trim();
    if (!str) emptyCodes++;
    else if (seenCodes.has(str)) duplicateCodes++;
    else seenCodes.add(str);
  }

  const erpExpectedRows = metaExtract.value ?? Number(envVal("IREGEN_PRODUCT_EXPECTED_ROWS") ?? "4007");
  const countMatch = allRows.length === erpExpectedRows;
  const verified = countMatch && duplicateCodes === 0 && emptyCodes === 0 && failedPages.length === 0;

  // root cause note
  let rootCauseNote: string | undefined;
  if (firstPageTables.length > 1) {
    const others = firstPageTables.filter((_, i) => i !== page1.primaryIndex);
    if (others.some((t) => t.rowCount <= 5)) {
      rootCauseNote = `DataSet 안에 ${firstPageTables.length}개 테이블 · Primary=Table[${page1.primaryIndex}] "${primaryTableName}" (${firstPageRows} rows) · 나머지는 metadata (각 ≤5 rows)`;
    }
  }

  const verification: ProductListVerification = {
    firstPageRows,
    lastPage: totalPages,
    lastPageRows,
    pagesLoaded,
    totalRows: allRows.length,
    duplicateCodes,
    emptyCodes,
    erpExpectedRows,
    countMatch,
    verified,
    firstPageTables,
    primaryTableName,
    rootCauseNote,
    concurrency,
    failedPages,
    totalRetries,
    elapsedMs: totalMs,
    metadataColumn1: metaExtract.raw as any,
    totalPagesSource,
  };

  console.log("");
  console.log("===== PRODUCT_LIST VERIFICATION =====");
  console.log(`Rows: ${allRows.length.toLocaleString()}`);
  console.log(`Pages: ${pagesLoaded} / ${totalPages}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`First Page Rows: ${firstPageRows}`);
  console.log(`Last Page Rows: ${lastPageRows}`);
  console.log(`Failed Pages: ${failedPages.length}${failedPages.length ? ` [${failedPages.join(", ")}]` : ""}`);
  console.log(`Retries: ${totalRetries}`);
  console.log(`Elapsed: ${(totalMs / 1000).toFixed(1)} sec`);
  console.log(`Duplicate PCode: ${duplicateCodes}`);
  console.log(`Empty PCode: ${emptyCodes}`);
  console.log(`ERP Expected: ${erpExpectedRows.toLocaleString()}`);
  console.log(`Count Match: ${countMatch ? "YES" : "NO"}`);
  console.log(`Result: ${verified ? "VERIFIED" : "NOT VERIFIED"}`);
  console.log(`totalPagesSource: ${totalPagesSource}`);
  if (rootCauseNote) console.log(`Root Cause: ${rootCauseNote}`);
  console.log("=====================================");

  return {
    ok: true,
    rowCount: allRows.length,
    columns,
    rows: allRows,
    meta: { soapMs: totalSoapMs, decoderMs: totalDecoderMs, totalMs, queriedAt: new Date().toISOString() },
    verification,
  };
}

// ============================================================================
// 2026-10-03 · PHASE 1 · Buy_Status (매입 현황)
// ============================================================================
// Fiddler Request 기반 · tools/iregen-bridge/samples/buy-request.txt
// Endpoint: SvcBuyBiz.asmx · SOAPAction: Buy_Status
// 특징: DevStartDate/DevEndDate · PageIdx=0/PageSize=0 (전체 조회) · IsStatus=9

const BUY_STATUS_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcBuyBiz.asmx";
const BUY_STATUS_SOAP_ACTION = "http://tempuri.org/Buy_Status";

interface BuyStatusContext {
  corpCode: string;
  userId: string;
  stCode: string;
  corpDbNm: string;
  devStartDate: string;
  devEndDate: string;
}

function buildBuyStatusEnvelope(ctx: BuyStatusContext): string {
  // Fiddler buy-request.txt 완전 복제 · 민감 값/날짜만 동적
  return (
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body>` +
    `<Buy_Status xmlns="http://tempuri.org/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">` +
    `<ent>` +
    `<IsReturnJson>false</IsReturnJson><IsEnc>false</IsEnc><IsCompress>false</IsCompress>` +
    `<IsStorageGubunOut>false</IsStorageGubunOut>` +
    `<CorpCode>${escapeXml(ctx.corpCode)}</CorpCode>` +
    `<CtCode/><CardFee>0</CardFee>` +
    `<Lcate>0</Lcate><Mcate>0</Mcate><Scate>0</Scate><Dcate>0</Dcate>` +
    `<StCode>${escapeXml(ctx.stCode)}</StCode>` +
    `<IsStatus>9</IsStatus>` +
    `<GuaranteePrice>0</GuaranteePrice><Subsidy>0</Subsidy><BuyDiscount>0</BuyDiscount>` +
    `<DevCommission>0</DevCommission><SaleCommission>0</SaleCommission>` +
    `<Deadline>0</Deadline><PaymentDate>0</PaymentDate>` +
    `<EtcIntField1>0</EtcIntField1><EtcIntField2>0</EtcIntField2><EtcIntField3>0</EtcIntField3>` +
    `<UserID>${escapeXml(ctx.userId)}</UserID>` +
    `<CorpDB_nm>${escapeXml(ctx.corpDbNm)}</CorpDB_nm>` +
    `<PageIdx>0</PageIdx><PageSize>0</PageSize>` +
    `<SearchType>TOTAL</SearchType>` +
    `<StartDate/><EndDate/>` +
    `<FolderCode>0</FolderCode>` +
    `<DevStartDate>${escapeXml(ctx.devStartDate)}</DevStartDate>` +
    `<DevEndDate>${escapeXml(ctx.devEndDate)}</DevEndDate>` +
    `<Cate>0</Cate><pCate>0</pCate><IsLevel>0</IsLevel>` +
    `<Sort>0</Sort><Idx>0</Idx><pIdx>0</pIdx>` +
    `<FileSize>0</FileSize><BeCode>0</BeCode>` +
    `<BuseoCode>-1</BuseoCode><OutBuseoCode>0</OutBuseoCode>` +
    `<CtContact>0</CtContact>` +
    `<InStCode>${escapeXml(ctx.stCode)}</InStCode>` +
    `<InBuseoCode>0</InBuseoCode>` +
    `<TotalPrice>0</TotalPrice><TotalTax>0</TotalTax><TotalExemption>0</TotalExemption>` +
    `<TotalBuyTotal>0</TotalBuyTotal>` +
    `<BuyPrice>0</BuyPrice><TaxExemption>0</TaxExemption><BuyTax>0</BuyTax><BuyTotal>0</BuyTotal>` +
    `<UseBuyPrice>0</UseBuyPrice><UseTax>0</UseTax>` +
    `<UseTaxExemption>0</UseTaxExemption><UseTaxExemption2>0</UseTaxExemption2><UseBuyTotal>0</UseBuyTotal>` +
    `<UsedBuyPrice>0</UsedBuyPrice><UsedTax>0</UsedTax>` +
    `<UsedTaxExemption>0</UsedTaxExemption><UsedTaxExemption2>0</UsedTaxExemption2><UsedBuyTotal>0</UsedBuyTotal>` +
    `<DisCountPrice>0</DisCountPrice><DisCountTax>0</DisCountTax>` +
    `<DisCountTaxExemption>0</DisCountTaxExemption><DisCountTaxExemption2>0</DisCountTaxExemption2>` +
    `<DisCountTotal>0</DisCountTotal>` +
    `<TaxType1>0</TaxType1><TaxType2>0</TaxType2>` +
    `<BillType1>0</BillType1><BillType2>0</BillType2><BillType3>0</BillType3><BillType4>0</BillType4>` +
    `<SupportPrice>0</SupportPrice><Payment>0</Payment><SmallMoney>0</SmallMoney>` +
    `<IntDevDDay>0</IntDevDDay>` +
    `<UnitStock>0</UnitStock><ReqUnitStock>0</ReqUnitStock>` +
    `<UnitCost>0</UnitCost><UnitSale>0</UnitSale><StockCnt>0</StockCnt>` +
    `<SaleCommissionTotal>0</SaleCommissionTotal><CardFeeTotal>0</CardFeeTotal>` +
    `<PointFeeTotal>0</PointFeeTotal>` +
    `<SalePrice>0</SalePrice><SaleTax>0</SaleTax>` +
    `<SaleTaxExemption>0</SaleTaxExemption><SaleTotal>0</SaleTotal>` +
    `<TaxPercent>0</TaxPercent>` +
    `<ReqStockCnt>0</ReqStockCnt><InStockCnt>0</InStockCnt><TotalStock>0</TotalStock>` +
    `<NowStock>0</NowStock><ProductWeight>0</ProductWeight>` +
    `<EvCostUnit>0</EvCostUnit><EvSaleUnit>0</EvSaleUnit>` +
    `<distinctCnt>0</distinctCnt><Margin>0</Margin><MarginRate>0</MarginRate>` +
    `<TaxCode>0</TaxCode><OrderCnt>0</OrderCnt>` +
    `<table_UpLoad_BuyCustomer_Commission_RowCnt>0</table_UpLoad_BuyCustomer_Commission_RowCnt>` +
    `<table_UpLoad_BuyCustomer_Contact_RowCnt>0</table_UpLoad_BuyCustomer_Contact_RowCnt>` +
    `<table_UpLoad_BuyCustomer_Address_RowCnt>0</table_UpLoad_BuyCustomer_Address_RowCnt>` +
    `<table_UpLoad_BuyCustomer_Image_RowCnt>0</table_UpLoad_BuyCustomer_Image_RowCnt>` +
    `<table_UpLoad_BuyCustomer_JoinStorage_RowCnt>0</table_UpLoad_BuyCustomer_JoinStorage_RowCnt>` +
    `<table_UpLoad_Product_RowCnt>0</table_UpLoad_Product_RowCnt>` +
    `<table_UpLoad_BuyEvent_Product_RowCnt>0</table_UpLoad_BuyEvent_Product_RowCnt>` +
    `<table_UpLoad_Buy_Product_RowCnt>0</table_UpLoad_Buy_Product_RowCnt>` +
    `<table_UpLoad_Buy_MonthClosing_RowCnt>0</table_UpLoad_Buy_MonthClosing_RowCnt>` +
    `<table_UpLoad_Buy_MonthClosing_Tax_RowCnt>0</table_UpLoad_Buy_MonthClosing_Tax_RowCnt>` +
    `<table_UpLoad_BankList_RowCnt>0</table_UpLoad_BankList_RowCnt>` +
    `<table_UpLoad_Rental_Product_Confirm_Product_RowCnt>0</table_UpLoad_Rental_Product_Confirm_Product_RowCnt>` +
    `<pSmmIdx>0</pSmmIdx><SmmReqUnitStock>0</SmmReqUnitStock><SmmReqStockCnt>0</SmmReqStockCnt>` +
    `<table_UpLoad_Image_RowCnt>0</table_UpLoad_Image_RowCnt>` +
    `<IsFinishUpdate>0</IsFinishUpdate>` +
    `<_IsDevMode>false</_IsDevMode><_IsDBBGMod>false</_IsDBBGMod>` +
    `</ent>` +
    `</Buy_Status>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

export async function queryBuyStatus(opts?: { startDate?: string; endDate?: string }): Promise<ErpInventoryResult> {
  const t0 = Date.now();
  const cfg = loadConfig();
  if (!cfg.iregen?.enabled) {
    return { ok: false, stage: "config", error: DISABLED_FRIENDLY_ERROR };
  }
  const corpDbNm = envCorpDbNm() ?? getIregenCorpDbNm() ?? null;
  if (!corpDbNm || !corpDbNm.trim()) {
    return { ok: false, stage: "config", error: CONFIG_FRIENDLY_ERROR };
  }

  // 날짜 · 사용자 지정 > env > today (Fiddler 캡쳐는 당일만)
  const devStartDate = opts?.startDate ?? envVal("IREGEN_BUY_START_DATE") ?? todayISO();
  const devEndDate = opts?.endDate ?? envVal("IREGEN_BUY_END_DATE") ?? todayISO();

  const ctx: BuyStatusContext = {
    corpCode: envCorpCode() ?? "30009",
    userId: envUserId() ?? "111",
    stCode: envStCode() ?? "000",
    corpDbNm: corpDbNm.trim(),
    devStartDate,
    devEndDate,
  };
  const endpoint = envVal("IREGEN_BUY_ENDPOINT") ?? BUY_STATUS_ENDPOINT;
  const soapAction = envVal("IREGEN_BUY_SOAP_ACTION") ?? BUY_STATUS_SOAP_ACTION;

  const envelope = buildBuyStatusEnvelope(ctx);
  const soapT0 = Date.now();
  console.log("[iregen:buy] SOAP POST · endpoint:", endpoint, "· body bytes:", envelope.length, "· 기간:", devStartDate, "~", devEndDate);
  const soapRes = await callSoap(endpoint, soapAction, envelope);
  const soapMs = Date.now() - soapT0;
  if (!soapRes.ok) {
    console.error("[iregen:buy] stage=" + soapRes.stage + " ·", soapMs, "ms");
    return { ok: false, stage: soapRes.stage, error: soapRes.error };
  }
  console.log("[iregen:buy] SOAP OK ·", soapMs, "ms · response bytes:", soapRes.xml.length);
  return decodeResponseToResult(soapRes.xml, t0, soapMs);
}
