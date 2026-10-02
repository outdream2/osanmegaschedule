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
  const corpDbNm = getIregenCorpDbNm();
  if (!corpDbNm || !corpDbNm.trim()) {
    return { error: CONFIG_FRIENDLY_ERROR };
  }
  return {
    corpDbNm: corpDbNm.trim(),
    endpoint: cfg.iregen?.endpoint || DEFAULT_IREGEN_ENDPOINT,
    soapAction: cfg.iregen?.soapAction || DEFAULT_IREGEN_SOAP_ACTION,
  };
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
    return { ok: false, stage: "http", error: `HTTP ${res.status} ${res.statusText}` };
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

  // 3. 작업 디렉토리 · 임시
  const cwd = join(tmpdir(), "iregen-live-" + Date.now());
  try {
    mkdirSync(cwd, { recursive: true });
    const xmlPath = join(cwd, "inventory-response.xml");
    writeFileSync(xmlPath, soapRes.xml, "utf8");

    // 4. decoder 실행
    const decT0 = Date.now();
    const dec = await runDecoder(xmlPath, cwd);
    const decoderMs = Date.now() - decT0;
    if (!dec.ok) {
      console.error("[iregen] stage=decoder ·", decoderMs, "ms ·", dec.error);
      return { ok: false, stage: "decoder", error: dec.error };
    }
    console.log("[iregen] decoder OK ·", decoderMs, "ms");

    // 5. output/inventory-full.json 읽기
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
