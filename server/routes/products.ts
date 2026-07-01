import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../src/supabase/client";
import { getProductMap, resetProductCache } from "../productCache";
import { COL_KEYS, xlsxToRows } from "../xlsx";

const router = Router();

router.get("/api/products-map", async (_req, res) => {
  try {
    const map = await getProductMap();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/api/upload-products", express.raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
  const { adminKey, managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "파일이 없습니다" });
  }
  try {
    let authorized = false;
    if (adminKey && adminKey === (process.env.ADMIN_PIN ?? "1234")) {
      authorized = true;
    } else if (managerId) {
      const { data: emp } = await supabase.from("employees").select("is_manager").eq("id", Number(managerId)).maybeSingle();
      authorized = !!emp?.is_manager;
    }
    if (!authorized) return res.status(403).json({ error: "관리자만 가능합니다" });
    const buf = req.body as Buffer;
    const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
    const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
    if (!isXlsx && !isXls) return res.status(400).json({ error: "형식이 다른 파일입니다. 상품리스트를 업로드해주세요." });
    const wbCheck = XLSX.read(buf, { sheetRows: 1 });
    const wsCheck = wbCheck.Sheets[wbCheck.SheetNames[0]];
    const headerRow = (XLSX.utils.sheet_to_json<any[]>(wsCheck, { header: 1 })[0] ?? []) as any[];
    if (headerRow.length < COL_KEYS.length) {
      return res.status(400).json({ error: "형식이 다른 파일입니다. 상품리스트를 업로드해주세요." });
    }
    const rows = xlsxToRows(buf);
    if (rows.length === 0) return res.status(400).json({ error: "엑셀에 데이터가 없습니다" });
    console.log(`[upload] parsed ${rows.length} rows`);
    const CHUNK_SIZE = 500;
    const chunks: Record<string, any>[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));
    const PARALLEL = 3;
    for (let i = 0; i < chunks.length; i += PARALLEL) {
      const batch = chunks.slice(i, i + PARALLEL);
      const results = await Promise.all(
        batch.map(chunk => supabase.from("products").upsert(chunk, { onConflict: "product_code" }))
      );
      for (const { error: upsertErr } of results) {
        if (upsertErr) {
          console.error("[upload] upsert error:", upsertErr);
          throw new Error(`업서트 실패: ${upsertErr.message}`);
        }
      }
      console.log(`[upload] upserted chunks ${i + 1}~${Math.min(i + PARALLEL, chunks.length)} / ${chunks.length}`);
    }
    console.log("[upload] upsert done");
    resetProductCache();
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
    const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
    const newEntry = { timestamp: new Date().toISOString(), count: rows.length };
    const logs = [newEntry, ...prevLogs].slice(0, 20);
    await supabase.from("app_settings").upsert({ key: "product_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });
    res.json({ ok: true, count: rows.length, timestamp: newEntry.timestamp });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/api/product-import-log", async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "product_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
});

router.get("/api/products/realmap-check", async (_req, res) => {
  const { data, error } = await supabase.from("products").select("real_map").limit(1);
  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      fix: "Supabase SQL Editor에서 실행: ALTER TABLE products ADD COLUMN IF NOT EXISTS \"real_map\" TEXT;",
    });
  }
  res.json({ ok: true, sample: data?.[0]?.real_map ?? null });
});

router.get("/api/products/:code", async (req, res) => {
  const code = (req.params.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    let { data, error } = await supabase.from("products").select("*").eq("product_code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data && /^0+/.test(code)) {
      const stripped = code.replace(/^0+/, "");
      const r2 = await supabase.from("products").select("*").eq("product_code", stripped).maybeSingle();
      if (r2.error) throw new Error(r2.error.message);
      data = r2.data;
    }
    if (!data) return res.status(404).json({ error: "상품을 찾을 수 없습니다" });
    res.json({ ...data, realMap: data.real_map ?? null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/api/products/:code/realmap", async (req, res) => {
  const code = (req.params.code ?? "").trim();
  const { realMap } = req.body ?? {};
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    const { error } = await supabase.from("products").update({ real_map: realMap }).eq("product_code", code);
    if (error) {
      console.error("[realmap PATCH] Supabase error:", error.message, "code:", code);
      return res.status(500).json({ error: error.message });
    }
    resetProductCache();
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[realmap PATCH] exception:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
