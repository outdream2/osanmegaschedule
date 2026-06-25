import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  _supabase = createClient(url, key);
  return _supabase;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { employee_id, password } = (req.body ?? {}) as {
      employee_id?: string | number;
      password?: string;
    };

    const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
    if (!phone || !password) {
      return res.status(400).json({ error: "전화번호와 비밀번호를 입력해주세요" });
    }

    const supabase = getSupabase();
    const { data: emp, error } = await supabase
      .from("employees")
      .select("id, name, password_hash, is_manager")
      .eq("phone", phone)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!emp || !emp.password_hash) {
      return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
    }

    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
    }

    const role = emp.is_manager ? "manager" : "employee";
    return res.status(200).json({ id: emp.id, name: emp.name, role });
  } catch (err: any) {
    console.error("login error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
