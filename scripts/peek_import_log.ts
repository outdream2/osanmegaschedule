import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
(async () => {
  const { data } = await s.from("app_settings").select("value").eq("key", "stock_import_log").maybeSingle();
  const arr = Array.isArray(data?.value) ? data.value : [];
  console.log(`stock_import_log 전체 엔트리 (${arr.length}건):`);
  for (const e of arr as any[]) console.log(JSON.stringify(e));
})();
