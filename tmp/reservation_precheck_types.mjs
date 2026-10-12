// Deeper type probe: use pg_catalog via a lightweight RPC trick.
// Supabase does not expose exec_sql by default. Fall back to probing related tables
// that we know for sure use INTEGER FK to employees(id) — if they exist and work,
// employees.id must be INTEGER-compatible.
//
// Best signal: notifications.employee_id is INTEGER REFERENCES employees(id). If
// we can select it, FK exists → employees.id is INTEGER.

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
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const out = {};

// probe tables known from migrations to have INTEGER REFERENCES employees(id)
const probes = ["notifications", "push_tokens", "seasonal_events"];
for (const t of probes) {
  const { data, error } = await sb.from(t).select("*").limit(1);
  out[t] = { ok: !error, error: error?.message ?? null, sample_keys: data?.[0] ? Object.keys(data[0]) : null };
}

// Attempt to introspect via Supabase REST schema (OpenAPI)
try {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/?select=*`, {
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      Accept: "application/openapi+json",
    },
  });
  const spec = await resp.json();
  // Find employees.id and reservations fields
  const empProps = spec?.definitions?.employees?.properties ?? spec?.components?.schemas?.employees?.properties;
  const resvProps = spec?.definitions?.reservations?.properties ?? spec?.components?.schemas?.reservations?.properties;
  out.employees_id_spec = empProps?.id ?? null;
  out.reservations_columns = resvProps ? Object.keys(resvProps) : null;
  out.reservations_assigned_employee_id = resvProps?.assigned_employee_id ?? null;
  out.reservations_employee_name_snapshot = resvProps?.employee_name_snapshot ?? null;
  out.reservations_status = resvProps?.status ?? null;
  out.reservations_id_spec = resvProps?.id ?? null;
  out.reservations_vendor_id_spec = resvProps?.vendor_id ?? null;
  out.reservations_date_spec = resvProps?.date ?? null;
  out.reservations_time_spec = resvProps?.time ?? null;
  out.reservations_note_spec = resvProps?.note ?? null;
} catch (e) {
  out.openapi_error = String(e);
}

console.log(JSON.stringify(out, null, 2));
