// SCHEDULE V1 · PHASE 3B · HTTP ENDPOINT PROBE
// 2026-10-07 · READ-ONLY · GET endpoints only · no write path
// 로컬 Express 서버(기본 :3000) 대상 · 3-run median · payload bytes
// JWT 는 SUPABASE_KEY 기반 derived secret 로 즉석 발급 (서버와 동일 알고리즘)
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as dotenv from "dotenv";
import { writeFileSync, mkdirSync } from "fs";

dotenv.config();
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? "";
if (!SUPABASE_KEY) { console.error("SUPABASE_KEY missing"); process.exit(1); }
const JWT_SECRET =
  (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16)
    ? process.env.JWT_SECRET
    : crypto.createHmac("sha256", SUPABASE_KEY).update("mt-jwt-v1").digest("hex");

const BASE = process.env.PERF_BASE_URL || "http://localhost:3000";

// 테스트용 토큰 발급 · lv=9 (바이패스 포함 성능 측정) + lv=1 (narrowing 적용 측정)
function mintToken(level, sub) {
  return jwt.sign({ sub, level, name: `probe-lv${level}` }, JWT_SECRET, { algorithm: "HS256", expiresIn: "10m" });
}
const TOK_ADMIN = mintToken(9, 999999); // 관리자 bypass
const TOK_LV1 = mintToken(1, 1);        // 직원 narrowing 경로 (sub=1 → 본인)

const now = new Date();
const curY = now.getFullYear();
const curM = now.getMonth() + 1;

async function timed(label, url, tok) {
  // 1 warm-up + 3 timed runs
  const headers = tok ? { authorization: `Bearer ${tok}` } : undefined;
  await fetch(url, { headers }).then(r => r.arrayBuffer()).catch(() => null);
  const runs = [];
  let status = null, bytes = 0, ct = "";
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = await fetch(url, { headers }).catch(e => ({ _err: e.message }));
    if (r._err) { runs.push(-1); continue; }
    const buf = await r.arrayBuffer();
    const t1 = performance.now();
    runs.push(t1 - t0);
    if (i === 0) { status = r.status; bytes = buf.byteLength; ct = r.headers.get("content-type") ?? ""; }
  }
  runs.sort((a,b)=>a-b);
  return { label, url, status, median_ms: Math.round(runs[1]), runs_ms: runs.map(x=>Math.round(x)), bytes, content_type: ct };
}

const results = { generatedAt: new Date().toISOString(), base: BASE, notes: "3-run median after warm-up · dev Express server" };
results.probes = [];

// === read endpoints ===
// 1 · schedule current month · lv1 (narrowed)
results.probes.push(await timed("GET /api/schedules current · lv1", `${BASE}/api/schedules?year=${curY}&month=${curM}`, TOK_LV1));
// 2 · schedule current month · lv9 (no narrow)
results.probes.push(await timed("GET /api/schedules current · lv9", `${BASE}/api/schedules?year=${curY}&month=${curM}`, TOK_ADMIN));
// 3 · schedule prev month · lv1
const prevM = curM === 1 ? 12 : curM - 1;
const prevY = curM === 1 ? curY - 1 : curY;
results.probes.push(await timed("GET /api/schedules prev · lv1", `${BASE}/api/schedules?year=${prevY}&month=${prevM}`, TOK_LV1));
// 4 · schedule next month · lv1
const nextM = curM === 12 ? 1 : curM + 1;
const nextY = curM === 12 ? curY + 1 : curY;
results.probes.push(await timed("GET /api/schedules next · lv1", `${BASE}/api/schedules?year=${nextY}&month=${nextM}`, TOK_LV1));
// 5 · leave-stats
results.probes.push(await timed("GET /api/leave-stats", `${BASE}/api/leave-stats?year=${curY}`, TOK_LV1));
// 6 · leave-requests all=true · lv9
results.probes.push(await timed("GET /api/leave-requests all=true · lv9", `${BASE}/api/leave-requests?all=true`, TOK_ADMIN));
// 7 · leave-requests employeeId=1 · lv1 (self)
results.probes.push(await timed("GET /api/leave-requests emp=1 · lv1 self", `${BASE}/api/leave-requests?employeeId=1`, TOK_LV1));
// 8 · leave-balance
results.probes.push(await timed("GET /api/leave-balance emp=1 · lv1 self", `${BASE}/api/leave-balance?employeeId=1`, TOK_LV1));
// 9 · settings all_settings
results.probes.push(await timed("GET /api/settings?key=all_settings · lv1", `${BASE}/api/settings?key=all_settings`, TOK_LV1));
// 10 · lock key
results.probes.push(await timed("GET /api/settings?key=schedule_lock_cur · lv1", `${BASE}/api/settings?key=schedule_lock_${curY}-${String(curM).padStart(2,"0")}`, TOK_LV1));
// 11 · upcoming leaves · lv9 (lv>=2)
results.probes.push(await timed("GET /api/upcoming-leaves · lv9", `${BASE}/api/upcoming-leaves?days=14`, TOK_ADMIN));
// 12 · pending-count · lv9
results.probes.push(await timed("GET /api/leave-requests/pending-count · lv9", `${BASE}/api/leave-requests/pending-count`, TOK_ADMIN));
// 13 · employees list
results.probes.push(await timed("GET /api/employees · lv1", `${BASE}/api/employees`, TOK_LV1));
// 14 · employees :id self detail
results.probes.push(await timed("GET /api/employees/1 · lv1 self", `${BASE}/api/employees/1`, TOK_LV1));
// 15 · settings season-ranges (public)
results.probes.push(await timed("GET /api/settings/season-ranges (public)", `${BASE}/api/settings/season-ranges`, null));
// 16 · unauth baseline (401 fast reject · Express overhead)
results.probes.push(await timed("UNAUTH 401 baseline · /api/schedules", `${BASE}/api/schedules`, null));

mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/_phase-3b-http-perf.json", JSON.stringify(results, null, 2));
console.log("WROTE tmp/_phase-3b-http-perf.json");
for (const p of results.probes) {
  const kb = (p.bytes / 1024).toFixed(1);
  console.log(`  ${String(p.status ?? "ERR").padStart(3)} · ${String(p.median_ms).padStart(5)}ms · ${kb.padStart(7)}KB · ${p.label}`);
}
