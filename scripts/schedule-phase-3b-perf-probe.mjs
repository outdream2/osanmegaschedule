// SCHEDULE V1 · PHASE 3B · PERFORMANCE PROBE
// 2026-10-07 · READ-ONLY · no INSERT/UPDATE/DELETE/DDL
// 측정:
//   · supabase-js 레벨 schedule 월 fetch (narrow vs full-* fallback)
//   · leave_requests all / self / balance 집계
//   · app_settings key get
//   · payload bytes (JSON.stringify length) + round-trip ms
// 결과: tmp/_phase-3b-perf.json
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { writeFileSync, mkdirSync, existsSync } from "fs";

dotenv.config();
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error("env missing"); process.exit(1); }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const SCHEDULE_FIELDS = [
  "id","name","position","rank","employmentType","hireDate","retireDate",
  "description","workplace","gender","phone","address","annual_leave_days",
  "level","employee_number","contract_file_url","break_time_minutes","break_apply_paid",
].join(", ");

function bytes(v) { try { return Buffer.byteLength(JSON.stringify(v ?? null), "utf8"); } catch { return 0; } }
async function timed(label, fn) {
  let warm;
  try { warm = await fn(); } catch (e) { warm = { _err: e.message }; }
  // 3-run median after warm
  const runs = [];
  let sample = null;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    let r;
    try { r = await fn(); } catch (e) { r = { _err: e.message }; }
    const t1 = performance.now();
    runs.push(t1 - t0);
    if (i === 0) sample = r;
  }
  runs.sort((a,b)=>a-b);
  const median = runs[1];
  const payloadBytes = bytes(sample?.data ?? sample);
  return { label, median_ms: Math.round(median), runs_ms: runs.map(x=>Math.round(x)), rows: Array.isArray(sample?.data) ? sample.data.length : (sample?.data ? 1 : null), payload_bytes: payloadBytes, warm_err: warm?._err ?? null };
}

const now = new Date();
const curY = now.getFullYear();
const curM = now.getMonth() + 1;
const curPrefix = `${curY}-${String(curM).padStart(2,"0")}-`;

const results = { generatedAt: new Date().toISOString(), notes: "READ-ONLY · 3-run median after warm-up · supabase-js direct (no HTTP server)" };
results.probes = [];

// 1 · employees narrowed (PHASE 3B baseline)
results.probes.push(await timed("employees · narrowed(18 cols)", () =>
  supabase.from("employees").select(SCHEDULE_FIELDS).order("id")
));
// 2 · employees SELECT * (comparison baseline · what fallback would hit)
results.probes.push(await timed("employees · SELECT *", () =>
  supabase.from("employees").select("*").order("id")
));
// 3 · schedules current month
results.probes.push(await timed(`schedules · like date ${curPrefix}%`, () =>
  supabase.from("schedules").select("*").like("date", `${curPrefix}%`)
));
// 4 · schedules prev month
const prevM = curM === 1 ? 12 : curM - 1;
const prevY = curM === 1 ? curY - 1 : curY;
const prevPrefix = `${prevY}-${String(prevM).padStart(2,"0")}-`;
results.probes.push(await timed(`schedules · like date ${prevPrefix}%`, () =>
  supabase.from("schedules").select("*").like("date", `${prevPrefix}%`)
));
// 5 · schedules next month
const nextM = curM === 12 ? 1 : curM + 1;
const nextY = curM === 12 ? curY + 1 : curY;
const nextPrefix = `${nextY}-${String(nextM).padStart(2,"0")}-`;
results.probes.push(await timed(`schedules · like date ${nextPrefix}%`, () =>
  supabase.from("schedules").select("*").like("date", `${nextPrefix}%`)
));
// 6 · schedules all (table-scan baseline)
results.probes.push(await timed("schedules · all rows", () =>
  supabase.from("schedules").select("*")
));
// 7 · leave_requests all=true (admin)
results.probes.push(await timed("leave_requests · all · select narrow", () =>
  supabase.from("leave_requests").select("id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at").order("created_at", { ascending: false })
));
// 8 · leave_requests employee_id self (sample · id=1)
results.probes.push(await timed("leave_requests · emp=1 · select narrow", () =>
  supabase.from("leave_requests").select("id, employee_id, employee_name, leave_type, start_date, end_date, reason, status, reviewer_note, created_at, reviewed_at").eq("employee_id", 1).order("created_at", { ascending: false })
));
// 9 · leave_requests approved (balance 계산 base)
results.probes.push(await timed("leave_requests · emp=1 approved for balance", () =>
  supabase.from("leave_requests").select("leave_type, start_date, end_date").eq("employee_id", 1).eq("status", "approved")
));
// 10 · leave_requests pending count
results.probes.push(await timed("leave_requests · pending count head", () =>
  supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending")
));
// 11 · schedules upcoming leaves (today~today+14 range · type IN)
const today = `${curY}-${String(curM).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
const to = new Date(now); to.setDate(to.getDate() + 14);
const toYmd = `${to.getFullYear()}-${String(to.getMonth()+1).padStart(2,"0")}-${String(to.getDate()).padStart(2,"0")}`;
results.probes.push(await timed(`schedules · upcoming leaves ${today}..${toYmd}`, () =>
  supabase.from("schedules").select("id, employeeId, date, type").in("type", ["월차","오전반차","오후반차"]).gte("date", today).lte("date", toYmd).order("date", { ascending: true })
));
// 12 · schedules year filter for /api/leave-stats
results.probes.push(await timed(`schedules · year ${curY} 월차 count path`, () =>
  supabase.from("schedules").select("employeeId").like("date", `${curY}-%`).eq("type", "월차")
));
// 13 · app_settings · all_settings key
results.probes.push(await timed("app_settings · key=all_settings", () =>
  supabase.from("app_settings").select("value").eq("key", "all_settings").maybeSingle()
));
// 14 · app_settings · lock key (hot path per month-view)
results.probes.push(await timed(`app_settings · key=schedule_lock_${curY}-${String(curM).padStart(2,"0")}`, () =>
  supabase.from("app_settings").select("value").eq("key", `schedule_lock_${curY}-${String(curM).padStart(2,"0")}`).maybeSingle()
));
// 15 · employees narrowed with "retireDate" filter (F9 batch active check)
results.probes.push(await timed("employees · retireDate (F9 batch)", () =>
  supabase.from("employees").select('id, name, "retireDate", "hireDate"').in("id", [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19])
));

mkdirSync("tmp", { recursive: true });
writeFileSync("tmp/_phase-3b-perf.json", JSON.stringify(results, null, 2));
console.log("WROTE tmp/_phase-3b-perf.json");
for (const p of results.probes) {
  console.log(`  ${p.median_ms.toString().padStart(5)}ms · ${(p.payload_bytes/1024).toFixed(1).padStart(7)}KB · rows=${String(p.rows).padStart(5)} · ${p.label}`);
}
