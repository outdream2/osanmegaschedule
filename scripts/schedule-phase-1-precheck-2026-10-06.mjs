// 2026-10-06 · PHASE 1 DB CLOSEOUT · PRECHECK (READ-ONLY)
//
// 목적:
//   DB write 시작 전 fresh 상태 확인:
//     - orphan 2건 exact 확인 (999 테스트 / 3 박부장)
//     - schedules.source_leave_id 컬럼 존재 여부
//     - approve_leave_request RPC 존재 여부
//
// 안전 규칙: READ-ONLY. INSERT/UPDATE/DELETE 금지.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY missing");
  process.exit(1);
}
const supabase = createClient(url, key);

async function queryColumnExists(table, column) {
  const { data, error } = await supabase.rpc("exec_sql_readonly", {
    sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
  }).catch(() => ({ data: null, error: { message: "exec_sql_readonly missing" } }));
  if (error && !/exec_sql_readonly/.test(error.message ?? "")) {
    return { ok: false, err: error.message };
  }
  if (data && Array.isArray(data) && data.length > 0) {
    return { ok: true, exists: true, info: data[0] };
  }
  return { ok: true, exists: null, info: null, note: "exec_sql_readonly RPC not present; use direct probe" };
}

async function probeColumnBySelect(table, column) {
  const { data, error } = await supabase.from(table).select(`id, ${column}`).limit(1);
  if (error) {
    if (/column .* does not exist/i.test(error.message)) {
      return { exists: false };
    }
    return { exists: null, err: error.message };
  }
  return { exists: true, sample: data?.[0] ?? null };
}

async function probeRpcExists(name) {
  // call RPC with dummy args that will trigger NOT_FOUND or BAD_PARAM but not run writes
  const { data, error } = await supabase.rpc(name, {
    p_request_id: "00000000-0000-0000-0000-000000000000",
    p_reviewer_id: 0,
    p_reviewer_note: "",
    p_bypass_lock: false,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/function .* does not exist/i.test(msg)) return { exists: false };
    if (/LEAVE_NOT_FOUND/.test(msg)) return { exists: true, note: "RPC present (returned LEAVE_NOT_FOUND)" };
    return { exists: "likely", note: msg };
  }
  return { exists: true, data };
}

async function main() {
  console.log("===== SCHEDULE PHASE 1 DB CLOSEOUT · PRECHECK · 2026-10-06 =====\n");

  // [1] counts
  const { count: empCount, error: eErr } = await supabase.from("employees").select("id", { count: "exact", head: true });
  if (eErr) throw new Error("employees count · " + eErr.message);
  console.log(`[1] employees.count = ${empCount}`);

  const { count: lrCount, error: lErr } = await supabase.from("leave_requests").select("id", { count: "exact", head: true });
  if (lErr) throw new Error("leave_requests count · " + lErr.message);
  console.log(`    leave_requests.count = ${lrCount}`);

  const { count: schCount, error: sErr } = await supabase.from("schedules").select("id", { count: "exact", head: true });
  if (sErr) throw new Error("schedules count · " + sErr.message);
  console.log(`    schedules.count = ${schCount}\n`);

  // [2] exact orphan rows
  console.log("[2] orphan row exact check:");
  const { data: o999, error: o999err } = await supabase
    .from("leave_requests")
    .select("id, employee_id, employee_name, leave_type, start_date, end_date, status")
    .eq("id", "30277299-9ff9-4bfb-844d-75ac96b5f81b")
    .maybeSingle();
  if (o999err) throw new Error("o999 · " + o999err.message);
  console.log(`    999 row:`, o999 ?? "(missing)");

  const { data: o3, error: o3err } = await supabase
    .from("leave_requests")
    .select("id, employee_id, employee_name, leave_type, start_date, end_date, status")
    .eq("id", "297371b0-c0fb-4706-b783-7a42414c299c")
    .maybeSingle();
  if (o3err) throw new Error("o3 · " + o3err.message);
  console.log(`    3 row:`, o3 ?? "(missing)");
  console.log("");

  // [3] column exists probe
  console.log("[3] schedules.source_leave_id column probe:");
  const colProbe = await probeColumnBySelect("schedules", "source_leave_id");
  console.log("    probe =", colProbe);
  console.log("");

  // [4] RPC exists probe
  console.log("[4] approve_leave_request RPC probe:");
  const rpcProbe = await probeRpcExists("approve_leave_request");
  console.log("    probe =", rpcProbe);
  console.log("");

  // [5] evaluate stop conditions
  const expected = {
    empCount: 19,
    lrCount: 14,
    schCount: 3279,
    o999_emp: 999,
    o999_name: "테스트",
    o3_emp: 3,
    o3_name: "박부장",
  };
  const stops = [];
  if (empCount !== expected.empCount) stops.push(`employees count mismatch (got ${empCount}, expected ${expected.empCount})`);
  if (lrCount !== expected.lrCount) stops.push(`leave_requests count mismatch (got ${lrCount}, expected ${expected.lrCount})`);
  if (schCount !== expected.schCount) stops.push(`schedules count mismatch (got ${schCount}, expected ${expected.schCount})`);
  if (!o999 || o999.employee_id !== expected.o999_emp) stops.push(`999 orphan not matching exact employee_id`);
  if (!o3 || o3.employee_id !== expected.o3_emp) stops.push(`3 orphan not matching exact employee_id`);

  // name match tolerant to mojibake (DB may store KSX-1001)
  if (o999 && o999.employee_name !== expected.o999_name) {
    console.log(`    note: 999 name on DB = "${o999.employee_name}" (expected ${expected.o999_name}) · tolerate mojibake`);
  }
  if (o3 && o3.employee_name !== expected.o3_name) {
    console.log(`    note: 3 name on DB = "${o3.employee_name}" (expected ${expected.o3_name}) · tolerate mojibake`);
  }

  console.log("===== PRECHECK SUMMARY =====");
  console.log(`  counts: emp=${empCount} lr=${lrCount} sch=${schCount}`);
  console.log(`  orphan 999 present=${!!o999} · emp=${o999?.employee_id}`);
  console.log(`  orphan 3 present=${!!o3} · emp=${o3?.employee_id}`);
  console.log(`  source_leave_id column exists=${colProbe.exists}`);
  console.log(`  approve_leave_request RPC exists=${rpcProbe.exists}`);
  if (stops.length > 0) {
    console.log("");
    console.log("[STOP] fresh state differs from phase 1.5 audit:");
    for (const s of stops) console.log(`  - ${s}`);
    process.exit(2);
  } else {
    console.log("");
    console.log("[OK] fresh state matches phase 1.5 audit · proceed to section 1");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("[FATAL]", err?.message ?? err);
  process.exit(1);
});
