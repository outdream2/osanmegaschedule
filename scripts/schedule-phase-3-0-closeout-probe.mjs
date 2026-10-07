// SCHEDULE V1 · PHASE 3-0 CLOSEOUT · narrow probes
// READ-ONLY · fallback hit 재현 + P1-B · P1-A 전수 column 비교
// 2026-10-07
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error("env missing"); process.exit(1); }
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const out = { generatedAt: new Date().toISOString() };

// 1 · narrow SELECT 실측 (current code · email 포함) → 실제로 fallback 하는지
async function probeNarrowSelect() {
  const narrowWithEmail = [
    "id","name","position","rank","employmentType","hireDate","retireDate",
    "description","workplace","gender","phone","address","annual_leave_days",
    "level","employee_number","contract_file_url","break_time_minutes",
    "break_apply_paid","email",
  ].join(", ");
  const narrowNoEmail = [
    "id","name","position","rank","employmentType","hireDate","retireDate",
    "description","workplace","gender","phone","address","annual_leave_days",
    "level","employee_number","contract_file_url","break_time_minutes",
    "break_apply_paid",
  ].join(", ");

  const t0 = Date.now();
  const r1 = await supabase.from("employees").select(narrowWithEmail).order("id");
  const t1 = Date.now();
  const r2 = await supabase.from("employees").select(narrowNoEmail).order("id");
  const t2 = Date.now();
  const r3 = await supabase.from("employees").select("*").order("id");
  const t3 = Date.now();

  return {
    narrowWithEmail: {
      error: r1.error ? r1.error.message : null,
      rowCount: r1.data?.length ?? null,
      durationMs: t1 - t0,
    },
    narrowNoEmail: {
      error: r2.error ? r2.error.message : null,
      rowCount: r2.data?.length ?? null,
      durationMs: t2 - t1,
    },
    fallbackStar: {
      error: r3.error ? r3.error.message : null,
      rowCount: r3.data?.length ?? null,
      durationMs: t3 - t2,
    },
  };
}

// 2 · P1-B duplicate · 전체 column 비교
async function probeP1B() {
  const ids = [
    "f5b95457-e31c-4eea-8fb5-fea52db8c61a",
    "f89ec3e1-e142-4d26-8fad-d499beaa836d",
  ];
  const { data, error } = await supabase.from("leave_requests").select("*").in("id", ids);
  if (error) return { error: error.message };
  return { rows: data };
}

// 3 · P1-B · source_leave_id 매칭 schedule 조회
async function probeP1BSchedules() {
  const ids = [
    "f5b95457-e31c-4eea-8fb5-fea52db8c61a",
    "f89ec3e1-e142-4d26-8fad-d499beaa836d",
  ];
  const { data, error } = await supabase.from("schedules").select("*").in("source_leave_id", ids);
  if (error) return { error: error.message };
  return { rows: data };
}

// 4 · P1-A timeline · leave + schedule 전체 column
async function probeP1A() {
  const leaveId = "f81b31b1-1f5a-4c6f-99be-998d0b1e8e0c";
  const { data: lv, error: lvErr } = await supabase.from("leave_requests").select("*").eq("id", leaveId).maybeSingle();
  if (lvErr) return { error: lvErr.message };
  const { data: sch, error: schErr } = await supabase.from("schedules").select("*").eq("id", 1715).maybeSingle();
  if (schErr) return { leave: lv, scheduleError: schErr.message };
  const { data: lock, error: lockErr } = await supabase.from("app_settings").select("*").eq("key", "schedule_lock_2026-06").maybeSingle();
  if (lockErr) return { leave: lv, schedule: sch, lockError: lockErr.message };
  // 2026-06 schedules 다른 row 로 updated_at 흔적 유무 확인
  const { count: locked06Count } = await supabase.from("schedules").select("*", { count: "exact", head: true }).like("date", "2026-06-%");
  return { leave: lv, schedule: sch, lock, locked06Count };
}

// 5 · same (employeeId, date) 중복 schedule 재검증
async function probeDup() {
  // 2026-09-11 강남규
  const { data, error } = await supabase.from("schedules").select("*").eq("employeeId", 2).eq("date", "2026-09-11");
  if (error) return { error: error.message };
  return { rows: data };
}

// 6 · leave_requests 전체 column 재확인
async function probeLeaveColumns() {
  const { data, error } = await supabase.from("leave_requests").select("*").limit(1);
  if (error) return { error: error.message };
  const sample = (data && data[0]) ?? {};
  return { columns: Object.keys(sample), sample };
}

// 7 · attendance 테이블 접근
async function probeAttendance() {
  // HEAD count
  const head = await supabase.from("attendance").select("*", { count: "exact", head: true });
  // SELECT 1
  const sel = await supabase.from("attendance").select("*").limit(1);
  return {
    headStatus: head.status,
    headError: head.error ? head.error.message : null,
    headCount: head.count ?? null,
    selectError: sel.error ? sel.error.message : null,
    selectRows: sel.data?.length ?? null,
  };
}

(async () => {
  try {
    out.probeNarrowSelect = await probeNarrowSelect();
    out.probeP1B = await probeP1B();
    out.probeP1BSchedules = await probeP1BSchedules();
    out.probeP1A = await probeP1A();
    out.probeDup = await probeDup();
    out.probeLeaveColumns = await probeLeaveColumns();
    out.probeAttendance = await probeAttendance();
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error("ERROR", e);
    process.exit(1);
  }
})();
