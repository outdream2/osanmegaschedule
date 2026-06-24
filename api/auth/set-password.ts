import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables (SUPABASE_URL, SUPABASE_KEY) are not configured");
  }
  _supabase = createClient(url, key);
  return _supabase;
}

/**
 * POST /api/auth/set-password
 * Body: { employeeId: number, password: string }
 * Internal admin tool — no separate auth gating.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { employeeId, password } = (req.body ?? {}) as {
      employeeId?: number | string;
      password?: string;
    };

    const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
    if (!idNum || isNaN(idNum)) {
      return res.status(400).json({ error: "valid employeeId is required" });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: "password must be at least 4 characters" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const supabase = getSupabase();
    const { error } = await supabase
      .from("employees")
      .update({ password_hash })
      .eq("id", idNum);

    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("set-password error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
