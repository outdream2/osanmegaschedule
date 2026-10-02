// apps/sync-agent/src/main/iregenSoap.ts
// 2026-10-03 · Iregen ERP SOAP Live Query · Inventory_Status
//   · 검증용 · Supabase WRITE 금지 · 메모리 전용 응답
//   · SOAP 호출 → Base64 → C# decoder (bin/Debug/net48/iregen-decoder.exe) → DataSet JSON
//   · CorpDB_nm 등 민감 값 · renderer/log 노출 금지 (local-only · never serialize)

import { app } from "electron";
import { spawn } from "child_process";
import { join, resolve } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";

export interface IregenSecret {
  corpDbNm: string;
  endpoint?: string;
  soapAction?: string;
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
};

export type ErpInventoryFail = {
  ok: false;
  stage: "config" | "soap" | "xml" | "decoder" | "fs";
  error: string;
};

export type ErpInventoryResult = ErpInventoryOk | ErpInventoryFail;

const DEFAULT_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcInventoryBiz.asmx";
const DEFAULT_SOAP_ACTION = "http://tempuri.org/Inventory_Status";

function secretPath(): string {
  return join(app.getPath("userData"), "iregen-secret.json");
}

function decoderPath(): string {
  // dev · __dirname = apps/sync-agent/out/main → 프로젝트 root/tools/iregen-bridge/bin/Debug/net48/
  return resolve(__dirname, "../../../../tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
}

function loadSecret(): IregenSecret | { error: string } {
  const envValue = process.env["IREGEN_CORP_DB_NM"];
  if (envValue && envValue.trim()) {
    return {
      corpDbNm: envValue.trim(),
      endpoint: process.env["IREGEN_ENDPOINT"] || DEFAULT_ENDPOINT,
      soapAction: process.env["IREGEN_SOAP_ACTION"] || DEFAULT_SOAP_ACTION,
    };
  }
  const sp = secretPath();
  if (!existsSync(sp)) {
    return {
      error:
        "Iregen 비밀 설정 파일 없음 · 생성 필요:\n" +
        sp +
        '\n{"corpDbNm":"<실제 ERP DB 값>","endpoint":"' +
        DEFAULT_ENDPOINT +
        '","soapAction":"' +
        DEFAULT_SOAP_ACTION +
        '"}\n또는 환경변수 IREGEN_CORP_DB_NM 설정',
    };
  }
  try {
    const raw = readFileSync(sp, "utf8");
    const parsed = JSON.parse(raw) as Partial<IregenSecret>;
    if (!parsed.corpDbNm || typeof parsed.corpDbNm !== "string") {
      return { error: "iregen-secret.json · corpDbNm 필드 누락" };
    }
    return {
      corpDbNm: parsed.corpDbNm,
      endpoint: parsed.endpoint || DEFAULT_ENDPOINT,
      soapAction: parsed.soapAction || DEFAULT_SOAP_ACTION,
    };
  } catch (err) {
    return { error: "iregen-secret.json 파싱 실패 · " + (err as Error).message };
  }
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

async function callSoap(endpoint: string, soapAction: string, body: string): Promise<{ ok: true; xml: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${soapAction}"`,
      },
      body,
    });
    const xml = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} ${res.statusText} · ${xml.slice(0, 200)}` };
    }
    return { ok: true, xml };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function runDecoder(responseXmlPath: string, cwd: string): Promise<{ ok: true; stderrTail: string } | { ok: false; error: string }> {
  return new Promise((resolveP) => {
    const exe = decoderPath();
    if (!existsSync(exe)) {
      resolveP({ ok: false, error: `decoder 실행 파일 없음 · ${exe} · build 필요` });
      return;
    }
    const stderrChunks: string[] = [];
    const child = spawn(exe, ["-f", responseXmlPath], { cwd, windowsHide: true });
    child.stdout.on("data", () => {
      // stdout 은 schema 요약 JSON · 전체 데이터는 output/*-full.json 에서 읽음
    });
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

  // 1. 비밀 설정 로드 (CorpDB_nm 등 · 메모리에만 보관 · 로그 X)
  const sec = loadSecret();
  if ("error" in sec) {
    return { ok: false, stage: "config", error: sec.error };
  }

  // 2. SOAP 호출 · body 는 escapeXml 로 secret 처리하지만 전체 body 로그 금지
  const envelope = buildEnvelope(sec.corpDbNm);
  const soapT0 = Date.now();
  console.log("[iregen] SOAP POST 시작 · endpoint:", sec.endpoint, "· body bytes:", envelope.length);
  const soapRes = await callSoap(sec.endpoint!, sec.soapAction!, envelope);
  const soapMs = Date.now() - soapT0;
  if (!soapRes.ok) {
    console.error("[iregen] SOAP 실패 ·", soapMs, "ms ·", soapRes.error);
    return { ok: false, stage: "soap", error: soapRes.error };
  }
  console.log("[iregen] SOAP OK ·", soapMs, "ms · response bytes:", soapRes.xml.length);

  // 3. 작업 디렉토리 · 임시
  const cwd = join(tmpdir(), "iregen-live-" + Date.now());
  try {
    mkdirSync(cwd, { recursive: true });
    // decoder 가 prefix 를 'inventory-response' → 'inventory' 로 치환하므로 파일명 통일
    const xmlPath = join(cwd, "inventory-response.xml");
    writeFileSync(xmlPath, soapRes.xml, "utf8");

    // 4. decoder 실행
    const decT0 = Date.now();
    const dec = await runDecoder(xmlPath, cwd);
    const decoderMs = Date.now() - decT0;
    if (!dec.ok) {
      console.error("[iregen] decoder 실패 ·", decoderMs, "ms ·", dec.error);
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
