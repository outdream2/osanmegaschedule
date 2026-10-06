// 2026-10-06 · PHASE 1.5 · schedules / leave_requests / employee_contracts / resignation_requests
// 스키마 (column type · PK · UNIQUE · 기존 FK · INDEX) READ-ONLY 조사.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const INSPECT_SQL = `
SELECT
  t.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_name = c.table_name
WHERE t.table_schema = 'public'
  AND c.table_schema = 'public'
  AND t.table_name IN ('schedules','leave_requests','employee_contracts','resignation_requests','employees')
ORDER BY t.table_name, c.ordinal_position;
`;

const CONSTRAINTS_SQL = `
SELECT
  conname,
  conrelid::regclass::text AS table_name,
  pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid IN (
  'schedules'::regclass,
  'leave_requests'::regclass,
  'employee_contracts'::regclass,
  'resignation_requests'::regclass,
  'employees'::regclass
)
ORDER BY conrelid::regclass::text, conname;
`;

const INDEXES_SQL = `
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.tablename IN ('schedules','leave_requests','employee_contracts','resignation_requests','employees')
ORDER BY i.tablename, i.indexname;
`;

async function run(label, sql) {
  console.log(`\n===== ${label} =====`);
  const { data, error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
    console.log(`exec_sql RPC 없음 or 오류: ${error.message}`);
    return null;
  }
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  // Supabase 는 raw SQL RPC 가 기본 제공되지 않음 → 간접 조사
  // 1. schedules 1 row sample → column 타입 추정
  const { data: schedSample, error: schedErr } = await supabase.from("schedules").select("*").limit(1);
  if (schedErr) console.log("schedules error:", schedErr.message);
  console.log("===== schedules sample row =====");
  console.log(JSON.stringify(schedSample, null, 2));

  const { data: leaveSample, error: leaveErr } = await supabase.from("leave_requests").select("*").limit(1);
  if (leaveErr) console.log("leave_requests error:", leaveErr.message);
  console.log("\n===== leave_requests sample row =====");
  console.log(JSON.stringify(leaveSample, null, 2));

  const { data: empSample, error: empErr } = await supabase.from("employees").select("*").limit(1);
  if (empErr) console.log("employees error:", empErr.message);
  console.log("\n===== employees sample row =====");
  console.log(JSON.stringify(empSample, null, 2));

  // employees.id type 확인 (likely bigint or integer)
  if (empSample && empSample[0]) {
    console.log(`\nemployees.id value=${empSample[0].id} typeof=${typeof empSample[0].id}`);
  }
  if (schedSample && schedSample[0]) {
    console.log(`schedules.employeeId value=${schedSample[0].employeeId} typeof=${typeof schedSample[0].employeeId}`);
  }
  if (leaveSample && leaveSample[0]) {
    console.log(`leave_requests.employee_id value=${leaveSample[0].employee_id} typeof=${typeof leaveSample[0].employee_id}`);
  }

  // (employeeId, date) PK/UNIQUE 를 Supabase REST 로 확인하는 가장 가까운 방법:
  // 중복 insert 시 에러로 알 수 있지만 destructive → 포기
  // 대신 schedules 테이블 창조 migration SQL 이 git 안에 있는지 확인 필요 (사용자 코드 리뷰)
}

main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
