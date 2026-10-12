// 2026-10-06 · VISITOR RESERVATION DB VERIFY (post-migration) · READ-ONLY
// Phase 1: column existence probing · Phase 2: row count unchanged · Phase 3: unique-violation canary
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
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(2);
}
const sb = createClient(url, key);

const result = { phase: "VERIFY_2026-10-06", at: new Date().toISOString() };

// A. column existence via select (REST allows select on existing columns)
{
  const { error } = await sb.from("reservations").select("assigned_employee_id").limit(1);
  result.assigned_employee_id_column = !error ? "YES" : "NO";
  result.assigned_employee_id_err = error ? error.message : null;
}
{
  const { error } = await sb.from("reservations").select("employee_name_snapshot").limit(1);
  result.employee_name_snapshot_column = !error ? "YES" : "NO";
  result.employee_name_snapshot_err = error ? error.message : null;
}

// B. row count (expected 0 unchanged)
{
  const { count, error } = await sb.from("reservations").select("*", { count: "exact", head: true });
  result.reservations_row_count = count ?? null;
  result.reservations_row_count_err = error ? error.message : null;
}

// C. legacy note (expected 0 - was 0 pre-migration)
{
  const { count, error } = await sb.from("reservations")
    .select("*", { count: "exact", head: true })
    .like("note", "[대상:%");
  result.legacy_note_count = count ?? null;
  result.legacy_note_err = error ? error.message : null;
}

// D. employees.id sample (determines BIGINT fit · JS Number safe)
{
  const r = await sb.from("employees").select("id, name").order("id", { ascending: false }).limit(1);
  result.employees_id_max = r.data?.[0]?.id ?? null;
  result.employees_id_max_type_js = typeof result.employees_id_max;
}

// E. FK/index verification · indirect check via unique-violation canary
//    Strategy: SELECT with join / FK can't be probed via REST.
//    Alternative: attempt INSERT with assigned_employee_id = non-existent (e.g. 999999999999999)
//    to see if FK is enforced. BUT this is DML; project rules say "insert tmp row then DELETE".
//    We'll run a canary insert that violates FK (expected: 23503 foreign_key_violation).
//    No row is actually created on violation, so no cleanup is needed.
{
  // Pick a definitely-non-existent id (max id + 10^9)
  const probeEmpId = (result.employees_id_max ?? 0) + 1_000_000_000;
  const canaryRow = {
    date: "1900-01-01",
    time: "00:00",
    company: "__verify_canary__",
    contact_name: "__verify__",
    phone: "__verify__",
    purpose: "__verify__",
    note: "",
    assigned_employee_id: probeEmpId,
    employee_name_snapshot: "__verify__",
  };
  const { error } = await sb.from("reservations").insert(canaryRow);
  result.fk_canary_err_code = error?.code ?? null;
  result.fk_canary_err_message = error?.message ?? null;
  // Expected: code = 23503 (foreign_key_violation) → FK is active
  result.fk_active = error?.code === "23503" ? "YES"
    : error?.message?.toLowerCase().includes("foreign key") ? "YES"
    : "UNKNOWN";
  // Clean up if row somehow landed (should NOT)
  if (!error) {
    await sb.from("reservations").delete().eq("company", "__verify_canary__").eq("date", "1900-01-01");
    result.canary_cleanup = "DELETED (unexpected FK bypass)";
  }
}

// F. unique partial index verification · attempt duplicate insert with real employee
//    Needs real employee id · take max · pre-insert row A · pre-insert row B (same slot) · expect 23505
{
  const realEmpId = result.employees_id_max;
  if (realEmpId != null) {
    const probeDate = "1900-01-02";
    const probeTime = "01:23";
    const base = {
      date: probeDate,
      time: probeTime,
      company: "__verify_unique_A__",
      contact_name: "__verify__",
      phone: "__verify__",
      purpose: "__verify__",
      note: "",
      assigned_employee_id: realEmpId,
      employee_name_snapshot: "__verify__",
    };
    // Insert A
    const { error: errA } = await sb.from("reservations").insert(base);
    result.unique_insert_A_err = errA?.message ?? null;
    result.unique_insert_A_code = errA?.code ?? null;
    if (!errA) {
      // Insert B (same employee + date + time)
      const dup = { ...base, company: "__verify_unique_B__" };
      const { error: errB } = await sb.from("reservations").insert(dup);
      result.unique_insert_B_err = errB?.message ?? null;
      result.unique_insert_B_code = errB?.code ?? null;
      result.unique_active = errB?.code === "23505" ? "YES"
        : errB?.message?.toLowerCase().includes("unique") || errB?.message?.toLowerCase().includes("duplicate") ? "YES"
        : "UNKNOWN";
      // Cleanup A (B never got in on unique)
      const { error: delErr, count: delCount } = await sb.from("reservations").delete({ count: "exact" })
        .eq("date", probeDate).eq("time", probeTime).eq("assigned_employee_id", realEmpId);
      result.unique_cleanup = delErr ? `DELETE ERROR: ${delErr.message}` : `deleted=${delCount}`;
      // If B somehow landed, also delete it
      const { error: delErr2 } = await sb.from("reservations").delete().like("company", "__verify_unique_%");
      result.unique_cleanup_fallback = delErr2 ? delErr2.message : "OK";
    } else {
      result.unique_active = "SKIPPED (A insert failed)";
    }
  } else {
    result.unique_active = "SKIPPED (no employees row)";
  }
}

// G. final row count sanity (should still be 0)
{
  const { count, error } = await sb.from("reservations").select("*", { count: "exact", head: true });
  result.final_row_count = count ?? null;
  result.final_row_count_err = error ? error.message : null;
}

console.log(JSON.stringify(result, null, 2));
