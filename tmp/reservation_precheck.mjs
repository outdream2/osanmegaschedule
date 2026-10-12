// 2026-10-06 · VISITOR RESERVATION DB FINALIZATION · Phase 1 PRECHECK (READ-ONLY)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(join(__dirname, "..", ".env"), "utf8");
const env = Object.fromEntries(
  envText.split(/\r?\n/)
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return [l.slice(0, i).trim(), v];
    })
);
const url = env.SUPABASE_URL;
const key = env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY missing");
  process.exit(2);
}
const sb = createClient(url, key);

async function rpc(sql) {
  const { data, error } = await sb.rpc("exec_sql", { sql });
  if (error) return { ok: false, error };
  return { ok: true, data };
}

async function selectInfoSchema(table, extra = {}) {
  let q = sb.from("information_schema.columns" + "")
    .select("column_name, data_type, udt_name, is_nullable")
    .eq("table_schema", "public")
    .eq("table_name", table);
  if (extra.column) q = q.eq("column_name", extra.column);
  const { data, error } = await q;
  return { data, error };
}

// Supabase REST does not allow information_schema queries via from() unless RPC exists.
// Fallback: probe tables directly, use SELECT with .limit(0) to inspect, and use SELECT 1 patterns.
// But we need column type. Try using PostgREST-compatible RPC. Supabase does not expose exec_sql by default.
// Try approach: direct SELECT from pg_catalog via a custom RPC may not exist.
// Alt: use the Supabase REST schema endpoint via a crafted call? Simpler: use pg via supabase-js REST only.
// Workaround: fetch a sample row and inspect types / counts.

async function countRows(table) {
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true });
  return { count, error };
}

async function sampleRow(table, select = "*") {
  const { data, error } = await sb.from(table).select(select).limit(1);
  return { data, error };
}

const result = { phase: "PRECHECK", at: new Date().toISOString() };

// ===== A. employees.id type =====
{
  const r = await sampleRow("employees", "id, name");
  result.employees_sample = r;
  if (r.data && r.data.length > 0) {
    const idVal = r.data[0].id;
    result.employees_id_js_type = typeof idVal;
    result.employees_id_sample_value = idVal;
    // Note: JS number vs string hint; actual DB type requires info_schema.
  }
}

// ===== B. reservations schema =====
{
  const r = await sampleRow(
    "reservations",
    "id, date, time, note, purpose, company, contact_name, phone, vendor_id, assigned_employee_id, employee_name_snapshot"
  );
  result.reservations_sample = r;
}

// ===== C. row counts =====
{
  result.reservations_count = await countRows("reservations");
}

// ===== D. legacy note count (via filter) =====
{
  const { count, error } = await sb
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .like("note", "[대상:%");
  result.legacy_note_count = { count, error };
}

// ===== E. detect assigned_employee_id column already exists (via select) =====
{
  const { error } = await sb.from("reservations").select("assigned_employee_id").limit(1);
  result.assigned_employee_id_exists = !error;
  result.assigned_employee_id_error = error ? error.message : null;
}
{
  const { error } = await sb.from("reservations").select("employee_name_snapshot").limit(1);
  result.employee_name_snapshot_exists = !error;
  result.employee_name_snapshot_error = error ? error.message : null;
}

// ===== F. status column detection =====
{
  const { error } = await sb.from("reservations").select("status").limit(1);
  result.status_column_exists = !error;
  result.status_column_error = error ? error.message : null;
}

// ===== G. employees.id probe type via error OR max value =====
{
  const r = await sb.from("employees").select("id").order("id", { ascending: false }).limit(1);
  result.employees_id_max = r.data?.[0]?.id ?? null;
  result.employees_id_max_type_js = typeof result.employees_id_max;
}

// Also try an info_schema RPC-free approach: Supabase exposes `pg_meta` only via Studio. Skip.

console.log(JSON.stringify(result, null, 2));
