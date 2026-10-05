// scripts/dump-erp-raw-hourly.ts
// 2026-10-05 · 사용자 지시 · ERP Sales_Days_TimeReport RAW DECODED 값 확인용 1-shot 스크립트
//   · salesStatsRouter 로직 그대로 복사 (SOAP 호출 + decoder spawn)
//   · tables[0].rows 를 가공/정규화 없이 그대로 출력
//   · 2026-10-04 ~ 2026-10-05 (Fiddler golden working condition)
//
// 실행: npx tsx scripts/dump-erp-raw-hourly.ts

import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

const PROJECT_ROOT = process.cwd();
const SAMPLES_DIR = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/samples");
const DECODER_EXE = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/bin/Debug/net48/iregen-decoder.exe");
const DECODER_OUT = path.resolve(PROJECT_ROOT, "tools/iregen-bridge/output/stdin-full.json");
const ERP_ENDPOINT = "http://soap.iregen.co.kr/App_Service/Irm/SvcStatisticsBiz.asmx";
const SOAP_ACTION = "http://tempuri.org/Sales_Days_TimeReport";
// 2026-10-05 fix · fixture 분리됨 · salestatus_daytime (시간대별) + salestatus_month (월별)
const FIXTURE = process.argv[4] ?? "salestatus_daytime-request.txt";

const FROM = process.argv[2] ?? "2026-10-04";
const TO = process.argv[3] ?? "2026-10-05";

async function readFixtureBody(filename: string): Promise<string> {
  const raw = await readFile(path.join(SAMPLES_DIR, filename), "utf8");
  const markers = ["<?xml", "<s:Envelope", "<soap:Envelope", "<soap12:Envelope", "<Envelope"];
  let s = -1;
  for (const m of markers) {
    const i = raw.indexOf(m);
    if (i >= 0 && (s < 0 || i < s)) s = i;
  }
  if (s < 0) throw new Error(`fixture envelope not found · ${filename}`);
  return raw.slice(s).trim();
}

function substituteTag(env: string, tag: string, val: string): string {
  return env.replace(new RegExp(`<${tag}>[^<]*<\\/${tag}>`), `<${tag}>${val}</${tag}>`);
}

function extractResult(xml: string, tag: string): string {
  const o = `<${tag}>`;
  const c = `</${tag}>`;
  const si = xml.indexOf(o);
  const ei = xml.indexOf(c);
  if (si < 0 || ei < 0) throw new Error(`${tag} element 없음`);
  return xml.slice(si + o.length, ei).trim();
}

async function runDecoder(b64: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const p = spawn(DECODER_EXE, [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: path.dirname(path.dirname(path.dirname(DECODER_EXE))),
    });
    let stderrBuf = "";
    p.stdout.on("data", () => {});
    p.stderr.on("data", (d) => { stderrBuf += d.toString(); });
    p.on("error", (e) => reject(new Error(`spawn 실패 · ${e.message}`)));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`decoder exit ${code} · ${stderrBuf.slice(-500)}`));
      if (!existsSync(DECODER_OUT)) return reject(new Error(`decoder output 없음`));
      try { resolve(JSON.parse(readFileSync(DECODER_OUT, "utf8"))); }
      catch (e) { reject(new Error(`JSON parse 실패 · ${(e as Error).message}`)); }
    });
    p.stdin.write(b64);
    p.stdin.end();
  });
}

async function main() {
  // 2026-10-05 fix · fixture 자동 분기 (SOAPAction + 날짜 tag)
  const fullRaw = await readFile(path.join(SAMPLES_DIR, FIXTURE), "utf8");
  const soapActionMatch = fullRaw.match(/SOAPAction:\s*"([^"]+)"/i);
  if (!soapActionMatch) throw new Error("fixture 안 SOAPAction 헤더 없음");
  const soapAction = soapActionMatch[1]!;
  const opMatch = soapAction.match(/\/([A-Za-z_]+)$/);
  if (!opMatch) throw new Error(`SOAPAction operation 추출 실패 · ${soapAction}`);
  const resultTag = `${opMatch[1]}Result`;

  const fixture = await readFixtureBody(FIXTURE);
  const startTag = /<SaleStartDate>/.test(fixture) ? "SaleStartDate" : "StartDate";
  const endTag = /<SaleEndDate>/.test(fixture) ? "SaleEndDate" : "EndDate";

  console.log(`=== ERP ${opMatch[1]} RAW DECODED ===`);
  console.log(`fixture: ${FIXTURE}`);
  console.log(`SOAPAction: ${soapAction}`);
  console.log(`date tags: ${startTag}=${FROM} · ${endTag}=${TO}`);
  console.log(``);

  let body = substituteTag(fixture, startTag, FROM);
  body = substituteTag(body, endTag, TO);

  const resp = await fetch(ERP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": `"${soapAction}"` },
    body,
  });
  if (!resp.ok) throw new Error(`SOAP HTTP ${resp.status}`);
  const xml = await resp.text();
  console.log(`SOAP response bytes: ${xml.length}`);

  const b64 = extractResult(xml, resultTag);
  console.log(`base64 bytes: ${b64.length}`);

  const parsed = await runDecoder(b64);
  const tables = parsed.tables ?? [];
  console.log(`tables: ${tables.length}`);

  for (let ti = 0; ti < tables.length; ti++) {
    const t = tables[ti];
    console.log(``);
    console.log(`──────── Table[${ti}] ────────`);
    console.log(`name: ${t.name}`);
    console.log(`columns (${(t.columns ?? []).length}): ${(t.columns ?? []).map((c: any) => c.name).join(", ")}`);
    console.log(`rowCount: ${t.rowCount}`);
    console.log(``);
    console.log(`전체 rows (가공 없음):`);
    const rows = t.rows ?? [];
    for (let i = 0; i < rows.length; i++) {
      console.log(`[${i}] ${JSON.stringify(rows[i])}`);
    }
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
