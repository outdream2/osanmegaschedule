import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  _supabase = createClient(url, key);
  return _supabase;
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? "mailto:admin@osanmegatown.com",
  process.env.VAPID_PUBLIC_KEY ?? "",
  process.env.VAPID_PRIVATE_KEY ?? "",
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { employeeId, title, body, url } = req.body ?? {};
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("employees")
      .select("push_subscription, name")
      .eq("id", employeeId)
      .single();

    if (error || !data) return res.status(404).json({ error: "Employee not found" });
    if (!data.push_subscription) {
      return res.status(200).json({ ok: false, reason: "no_subscription" });
    }

    const payload = JSON.stringify({
      title: title ?? "진열 보충 요청",
      body: body ?? `${data.name}님께 새로운 진열 보충 요청이 도착했습니다.`,
      url: url ?? "/",
      tag: `req-${employeeId}-${Date.now()}`,
    });

    await webpush.sendNotification(data.push_subscription as webpush.PushSubscription, payload);
    return res.json({ ok: true });
  } catch (err: any) {
    // 410 Gone = subscription expired → clear it
    if (err.statusCode === 410) {
      const supabase = getSupabase();
      await supabase.from("employees").update({ push_subscription: null }).eq("id", employeeId);
      return res.json({ ok: false, reason: "subscription_expired" });
    }
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
