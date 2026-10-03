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

interface ResolvedSecret {
  corpDbNm: string;
  endpoint: string;
  soapAction: string;
}

function decoderPath(): string {
  // dev · __dirname = apps/sync-agent/out/main → 프로젝트 root/tools/iregen-bridge/bin/Debug/net48/
  return resolve(__dirname, "../../../../tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
}

function loadSecret(): ResolvedSecret | { error: string } {
  const cfg = loadConfig();
  if (!cfg.iregen?.enabled) {
    return { error: DISABLED_FRIENDLY_ERROR };
  }
  // 우선순위 · process.env > sync-agent/.env > root/.env > safeStorage (Settings UI)
  //   · env 키 이름 · IREGEN_CORP_DB_NM / CorpDB_nm / CORPDB_NM 모두 지원
  const envCorp = envCorpDbNm();
  const corpDbNm = envCorp ?? getIregenCorpDbNm() ?? null;
  if (!corpDbNm || !corpDbNm.trim()) {
    return { error: CONFIG_FRIENDLY_ERROR };
  }
  // Endpoint · SOAP Action 도 env 우선 (설정 UI 가 평문 저장 가능 영역) · fallback = config
  const endpoint = envVal("IREGEN_ENDPOINT") ?? cfg.iregen?.endpoint ?? DEFAULT_IREGEN_ENDPOINT;
  const soapAction = envVal("IREGEN_SOAP_ACTION") ?? cfg.iregen?.soapAction ?? DEFAULT_IREGEN_SOAP_ACTION;
  return { corpDbNm: corpDbNm.trim(), endpoint, soapAction };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;",
  );
}

function buildEnvelope(corpDbNm: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<Inventory_Status xmlns="http://tempuri.org/">` +
    `<CorpDB_nm>${escapeXml(corpDbNm)}</CorpDB_nm>` +
    `<IsReturnJson>false</IsReturnJson>` +
    `<IsEnc>false</IsEnc>` +
    `<IsCompress>false</IsCompress>` +
    `</Inventory_Status>` +
    `</soap:Body>` +
    `</soap:Envelope>`
  );
}

async function callSoap(
  endpoint: string,
  soapAction: string,
  body: string,
): Promise<{ ok: true; xml: string } | { ok: false; stage: "network" | "http"; error: string }> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${soapAction}"`,
      },
      body,
    });
  } catch (err) {
    return { ok: false, stage: "network", error: (err as Error).message };
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

// 2026-10-03 · 공통 decoder 처리 (SOAP 응답 XML → DataSet JSON · 메모리 전용)
async function decodeResponseToResult(
  soapXml: string,
  t0: number,
  soapMs: number,
): Promise<ErpInventoryResult> {
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
    const t = parsed.tables[0];
    const totalMs = Date.now() - t0;
    console.log("[iregen] 전체 완료 ·", totalMs, "ms · rows:", t.rowCount, "· columns:", t.columns.length);
    return {
      ok: true,
      rowCount: t.rowCount,
      columns: t.columns.map((c) => c.name),
      rows: t.rows,
      meta: { soapMs, decoderMs, totalMs, queriedAt: new Date().toISOString() },
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

export async function queryInventoryStatus(): Promise<ErpInventoryResult> {
  const t0 = Date.now();

  // 1. 설정 로드 (CorpDB_nm · 메모리에만 보관 · 로그 X)
  const sec = loadSecret();
  if ("error" in sec) {
    console.warn("[iregen] stage=config · 연결정보 미설정");
    return { ok: false, stage: "config", error: sec.error };
  }

  // 2. SOAP 호출 · body 전체 로그 금지
  const envelope = buildEnvelope(sec.corpDbNm);
  const soapT0 = Date.now();
  console.log("[iregen] SOAP POST · endpoint:", sec.endpoint, "· body bytes:", envelope.length);
  const soapRes = await callSoap(sec.endpoint, sec.soapAction, envelope);
  const soapMs = Date.now() - soapT0;
  if (!soapRes.ok) {
    console.error("[iregen] stage=" + soapRes.stage + " ·", soapMs, "ms ·", soapRes.error);
    return { ok: false, stage: soapRes.stage, error: soapRes.error };
  }
  console.log("[iregen] SOAP OK ·", soapMs, "ms · response bytes:", soapRes.xml.length);
  return decodeResponseToResult(soapRes.xml, t0, soapMs);
}
