// scripts/diagnose_notifications.ts
// READ-ONLY diagnostic — reports on notification system state.
// Run: npx tsx scripts/diagnose_notifications.ts

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error("SUPABASE env missing"); process.exit(1); }
const supabase = createClient(url, key);

function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

async function main() {
  console.log("\n=== VAPID env ===");
  console.log(" VAPID_PUBLIC_KEY:", !!process.env.VAPID_PUBLIC_KEY ? "SET" : "MISSING");
  console.log(" VAPID_PRIVATE_KEY:", !!process.env.VAPID_PRIVATE_KEY ? "SET" : "MISSING");
  console.log(" VAPID_SUBJECT:", process.env.VAPID_SUBJECT ?? "(fallback: mailto:admin@osanmegatown.com)");
  console.log(" VITE_VAPID_PUBLIC_KEY:", !!process.env.VITE_VAPID_PUBLIC_KEY ? "SET" : "MISSING");

  console.log("\n=== notifications table ===");
  try {
    const { data, count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true });
    if (error) console.log(" ERROR:", error.message);
    else console.log(" total rows:", count);
  } catch (e: any) { console.log(" EXC:", e.message); }

  const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recErr } = await supabase
    .from("notifications")
    .select("id, employee_id, title, body, type, read, created_at")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(20);
  if (recErr) console.log(" recent err:", recErr.message);
  else {
    console.log(` last-24h count: ${recent?.length ?? 0}`);
    for (const n of recent ?? []) {
      console.log(`  #${n.id} emp=${n.employee_id} [${n.type}] ${pad(n.title, 30)} @ ${n.created_at}`);
    }
  }

  console.log("\n=== employees push_subscription ===");
  const { data: emps, error: empsErr } = await supabase
    .from("employees")
    .select("id, name, push_subscription");
  if (empsErr) { console.log(" ERR:", empsErr.message); }
  else {
    const withSub = (emps ?? []).filter(e => e.push_subscription != null);
    console.log(` total employees: ${emps?.length ?? 0}, subscribed: ${withSub.length}`);
    for (const e of emps ?? []) {
      const sub: any = e.push_subscription;
      const ep = sub?.endpoint ? String(sub.endpoint).slice(0, 70) + "…" : "(null)";
      const hasKeys = !!(sub?.keys?.p256dh && sub?.keys?.auth);
      console.log(`  emp #${e.id} ${pad(e.name ?? "?", 12)} sub=${!!sub ? "YES" : "no "} keys=${hasKeys ? "ok" : "?? "} ${ep}`);
    }
  }

  console.log("\n=== display_requests (last 24h) ===");
  const { data: dr } = await supabase
    .from("display_requests")
    .select("id, zone_label, assigned_staff_id, assigned_staff_name, status, requested_at")
    .gte("requested_at", oneDayAgo)
    .order("requested_at", { ascending: false })
    .limit(10);
  console.log(` last-24h: ${dr?.length ?? 0}`);
  for (const r of dr ?? []) {
    console.log(`  #${r.id} zone=${r.zone_label} staff=${r.assigned_staff_id}/${r.assigned_staff_name} status=${r.status}`);
  }

  console.log("\n=== zone_day_assignments (recent) ===");
  const { data: zd, error: zdErr } = await supabase
    .from("zone_day_assignments")
    .select("date, is_confirmed, updated_at, zone_slots")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (zdErr) console.log(" ERR:", zdErr.message);
  else for (const r of zd ?? []) {
    const emps = new Set<number>();
    for (const zone of Object.values((r.zone_slots ?? {}) as any)) {
      for (const arr of Object.values((zone ?? {}) as any)) {
        if (Array.isArray(arr)) for (const id of arr) emps.add(Number(id));
      }
    }
    console.log(`  date=${r.date} confirmed=${r.is_confirmed} updated=${r.updated_at} assigned=${emps.size} emps`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
