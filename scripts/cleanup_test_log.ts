import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
(async () => {
  const { data } = await s.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  const filtered = arr.filter((e: any) => e.snapshot_date !== "2026-08-10");
  await s.from("app_settings").upsert(
    { key: "stock_import_log", value: filtered, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  console.log(`삭제 전: ${arr.length}건 → 삭제 후: ${filtered.length}건`);
})();
