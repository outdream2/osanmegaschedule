import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../src/supabase/client";
import { getProductMap, resetProductCache } from "../productCache";
import { COL_KEYS, xlsxToRows } from "../xlsx";
import { sanitizeOrValue } from "../utils/sanitize";

const router = Router();

// 공개 재고확인 API — 로그인 불필요
router.get("/api/stock-check", async (req, res) => {
  const raw = String(req.query.q ?? "").trim().slice(0, 60);
  if (raw.length < 1) return res.json([]);
  const { data, error } = await supabase
    .from("products")
    .select("product_name, spec, current_stock, sale_status, category, real_map, display_location, supplier")
    .eq("hidden", false)
    .ilike("product_name", `%${raw}%`)
    .limit(25);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.get("/api/products-map", async (_req, res) => {
  try {
    const map = await getProductMap();
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(map);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/inventory-latest — 상품코드별 최신 실재고 (warehouse_stock/store_stock/checked_at)
// DisplayPage 구역별 상품 리스트에서 재고관리 페이지처럼 창고/매장/실재고 컬럼을 채우기 위해 사용
// 2026-08-03 · Priority 3 · get_inventory_latest RPC 호출 · 단일 DISTINCT ON 쿼리로 교체
//   fallback: RPC 미생성(does not exist) 시 → 기존 1000건 페이지루프 방식으로 graceful 처리
router.get("/api/inventory-latest", async (_req, res) => {
  type InvRow = { warehouse_stock: number | null; store_stock: number | null; checked_at: string | null };
  const buildMap = (rows: any[]): Record<string, InvRow> => {
    const map: Record<string, InvRow> = {};
    for (const r of rows) {
      const code = String((r as any).product_code ?? "").trim();
      if (!code || map[code]) continue;
      map[code] = {
        warehouse_stock: (r as any).warehouse_stock != null ? Number((r as any).warehouse_stock) : null,
        store_stock:     (r as any).store_stock     != null ? Number((r as any).store_stock)     : null,
        checked_at:      (r as any).checked_at ?? null,
      };
    }
    return map;
  };

  try {
    // 1차 시도: RPC (단일 DISTINCT ON 쿼리 · 빠름)
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_inventory_latest");
    if (!rpcErr) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.json(buildMap(rpcData ?? []));
    }

    // RPC 미생성이 아닌 실제 오류는 즉시 실패
    if (!/function.*does not exist|could not find/i.test(rpcErr.message)) {
      console.error("[inventory-latest] RPC error:", rpcErr.message);
      return res.status(500).json({ error: rpcErr.message });
    }

    // 2차 fallback: 1000건 페이지루프 (RPC 생성 전 구 동작)
    console.warn("[inventory-latest] RPC get_inventory_latest 미생성 · 페이지루프 fallback 사용");
    const PAGE = 1000;
    const allRows: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("inventory_checks")
        .select("product_code, warehouse_stock, store_stock, checked_at")
        .order("checked_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) break;
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(buildMap(allRows));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/products-search", async (req, res) => {
  const rawQ     = String(req.query.q        ?? "").trim();
  const supplier = String(req.query.supplier ?? "").trim();
  const includeHidden = req.query.include_hidden === "1" || req.query.include_hidden === "true";
  if (rawQ.length < 1) return res.json([]);
  // PostgREST or() 특수문자 방어 (쉼표·괄호 등)
  const q = sanitizeOrValue(rawQ);
  if (q.length < 1) return res.json([]);
  try {
    // 상품명 · 검색키워드 · 상품코드 (원본·앞자리0제거·padStart8) 모두 검색
    const stripped = q.replace(/^0+/, "");
    const padded = /^\d+$/.test(q) ? q.padStart(8, "0") : q;
    const buildOr = (includeKeywords: boolean) => [
      `product_name.ilike.%${q}%`,
      ...(includeKeywords ? [`search_keywords.ilike.%${q}%`] : []),
      `product_code.ilike.%${q}%`,
      ...(stripped !== q ? [`product_code.ilike.%${stripped}%`] : []),
      ...(padded !== q ? [`product_code.eq.${padded}`] : []),
    ].join(",");

    const cols = "product_code,product_name,spec,supplier,purchase_price,sale_price,profit_rate,expiry_date,real_map,current_stock,sale_status,hidden";

    // 1차: search_keywords + hidden 필터 포함 시도
    let query = supabase.from("products").select(cols).or(buildOr(true));
    if (!includeHidden) query = query.eq("hidden", false);
    if (supplier.length >= 2) query = query.ilike("supplier", `%${supplier}%`);
    let { data, error } = await query.limit(40);

    // 2차 fallback 1: hidden 컬럼 없으면 제외하고 재시도
    if (error && /"?hidden"?|does not exist|column/i.test(error.message) && /hidden/i.test(error.message)) {
      const cols2 = "product_code,product_name,spec,supplier,purchase_price,sale_price,profit_rate,expiry_date,real_map,current_stock,sale_status";
      let q2 = supabase.from("products").select(cols2).or(buildOr(true));
      if (supplier.length >= 2) q2 = q2.ilike("supplier", `%${supplier}%`);
      const r2 = await q2.limit(40);
      data = r2.data as any; error = r2.error;
    }

    // 3차 fallback: search_keywords 컬럼 없으면 제외하고 재시도
    if (error && /search_keywords|does not exist|column/i.test(error.message)) {
      let q3 = supabase.from("products").select(cols).or(buildOr(false));
      if (!includeHidden) q3 = q3.eq("hidden", false);
      if (supplier.length >= 2) q3 = q3.ilike("supplier", `%${supplier}%`);
      const r3 = await q3.limit(40);
      data = r3.data; error = r3.error;
    }
    if (error) {
      console.error("[products-search] error:", error.message, "q:", q);
      return res.status(500).json({ error: error.message });
    }
    // 실재고 (inventory_checks) · 최근 스냅샷 (stock_history) 병합 조회
    const codes = (data ?? []).map((p: any) => String(p.product_code ?? "").trim()).filter(Boolean);
    let invByCode = new Map<string, { warehouse_stock: number | null; store_stock: number | null; checked_at: string | null }>();
    let histByCode = new Map<string, { last_snapshot: string | null; last_purchase_qty: number | null }>();
    if (codes.length > 0) {
      // inventory_checks — 최신값만
      try {
        const { data: iv } = await supabase
          .from("inventory_checks")
          .select("product_code, warehouse_stock, store_stock, checked_at")
          .in("product_code", codes)
          .order("checked_at", { ascending: false });
        for (const r of iv ?? []) {
          const c = String((r as any).product_code ?? "").trim();
          if (!c || invByCode.has(c)) continue;
          invByCode.set(c, {
            warehouse_stock: (r as any).warehouse_stock != null ? Number((r as any).warehouse_stock) : null,
            store_stock: (r as any).store_stock != null ? Number((r as any).store_stock) : null,
            checked_at: (r as any).checked_at ?? null,
          });
        }
      } catch { /* silent */ }
      // 2026-07-29 · 사용자 원칙: 매입 관련은 매입 테이블(purchase_details) · stock_history fallback 제거
      // last_purchase_date · last_purchase_qty 모두 purchase_details 에서 조회
      try {
        const PAGE = 1000;
        let fromRow = 0;
        while (true) {
          const { data: pd, error: pdErr } = await supabase
            .from("purchase_details")
            .select("product_code, purchase_date, quantity")
            .in("product_code", codes)
            .order("purchase_date", { ascending: false })
            .range(fromRow, fromRow + PAGE - 1);
          if (pdErr) throw new Error(pdErr.message);
          if (!pd || pd.length === 0) break;
          for (const r of pd) {
            const c = String((r as any).product_code ?? "").trim();
            if (!c || histByCode.has(c)) continue;  // 최근 매입일 우선 (desc 정렬)
            histByCode.set(c, {
              last_snapshot: (r as any).purchase_date ?? null,
              last_purchase_qty: (r as any).quantity != null ? Number((r as any).quantity) : null,
            });
          }
          if (pd.length < PAGE) break;
          fromRow += PAGE;
        }
      } catch { /* silent */ }
    }
    const merged = (data ?? []).map((p: any) => {
      const code = String(p.product_code ?? "").trim();
      const inv = invByCode.get(code);
      const hist = histByCode.get(code);
      return {
        ...p,
        warehouse_stock: inv?.warehouse_stock ?? null,
        store_stock: inv?.store_stock ?? null,
        inv_checked_at: inv?.checked_at ?? null,
        // 2026-07-29 · purchase_details 만 신뢰 · products.last_purchase_date fallback 제거
        last_purchase_date: hist?.last_snapshot ?? null,
        last_snapshot_qty: hist?.last_purchase_qty ?? null,
      };
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(merged);
  } catch (err: any) {
    console.error("[products-search] exception:", err?.message);
    res.status(500).json({ error: err.message });
  }
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
      const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
      authorized = (emp?.level ?? 0) >= 9;
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
    // 임포트 완료 후 optimal_stock_backup → optimal_stock 복원 (ERP wipe 방어)
    let restoredCount = 0;
    try {
      const { data: restoreData, error: restoreErr } = await supabase.rpc("restore_optimal_stock_from_backup");
      if (restoreErr) {
        console.warn("[upload] restore_optimal_stock RPC failed:", restoreErr.message);
      } else {
        restoredCount = Number(restoreData ?? 0) || 0;
        console.log(`[upload] restored optimal_stock for ${restoredCount} products from backup`);
      }
    } catch (e: any) {
      console.warn("[upload] restore_optimal_stock exception:", e.message);
    }
    resetProductCache();
    const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
    const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
    const newEntry = { timestamp: new Date().toISOString(), count: rows.length, restored: restoredCount };
    const logs = [newEntry, ...prevLogs].slice(0, 20);
    await supabase.from("app_settings").upsert({ key: "product_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });
    res.json({ ok: true, count: rows.length, restored: restoredCount, timestamp: newEntry.timestamp });
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

// 숨김 처리된 상품 리스트 (숨김 관리 UI 용) — /:code 라우트보다 먼저 등록해야 매칭됨
router.get("/api/products/hidden", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("product_code, product_name, spec, supplier, real_map, current_stock, sale_price")
      .eq("hidden", true)
      .order("product_name", { ascending: true })
      .limit(500);
    if (error) {
      console.error("[hidden GET] error:", error.message);
      return res.status(500).json({ error: error.message });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(Array.isArray(data) ? data : []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/products/:code", async (req, res) => {
  const code = (req.params.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    const PRODUCT_COLS = "product_code, product_name, spec, supplier, purchase_price, sale_price, cost_price, profit_rate, expiry_date, real_map, current_stock, optimal_stock, optimal_stock_backup, category, sale_status, hidden, barcode, brand, manufacturer, memo, note, search_keywords, min_order, warehouse_stock, store_stock";
    let { data, error } = await supabase.from("products").select(PRODUCT_COLS).eq("product_code", code).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data && /^0+/.test(code)) {
      const stripped = code.replace(/^0+/, "");
      const r2 = await supabase.from("products").select(PRODUCT_COLS).eq("product_code", stripped).maybeSingle();
      if (r2.error) throw new Error(r2.error.message);
      data = r2.data;
    }
    if (!data) return res.status(404).json({ error: "상품을 찾을 수 없습니다" });
    const productCode = (data as any).product_code ?? code;

    // inventory_checks 병합 (창고·매장 실재고)
    let warehouseStock: number | null = null;
    let storeStock: number | null = null;
    let invCheckedAt: string | null = null;
    try {
      const { data: iv } = await supabase
        .from("inventory_checks")
        .select("warehouse_stock, store_stock, checked_at")
        .eq("product_code", productCode)
        .order("checked_at", { ascending: false })
        .limit(1);
      if (iv && iv.length > 0) {
        warehouseStock = (iv[0] as any).warehouse_stock != null ? Number((iv[0] as any).warehouse_stock) : null;
        storeStock     = (iv[0] as any).store_stock     != null ? Number((iv[0] as any).store_stock)     : null;
        invCheckedAt   = (iv[0] as any).checked_at ?? null;
      }
    } catch { /* silent */ }

    // 2026-07-29 · 사용자 원칙 · 매입 관련은 purchase_details (매입 테이블)
    //   이전 · products.last_purchase_date → 없으면 stock_history 이중 fallback
    //   현재 · purchase_details 만 조회 · 항상 원본 신뢰
    let lastPurchase: string | null = null;
    try {
      const { data: pd } = await supabase
        .from("purchase_details")
        .select("purchase_date")
        .eq("product_code", productCode)
        .order("purchase_date", { ascending: false })
        .limit(1);
      if (pd && pd.length > 0) {
        lastPurchase = (pd[0] as any).purchase_date ?? null;
      }
    } catch { /* silent */ }

    res.json({
      ...data,
      realMap: (data as any).real_map ?? null,
      // 재고 DB에서 병합
      warehouse_stock: (data as any).warehouse_stock ?? warehouseStock,
      store_stock: (data as any).store_stock ?? storeStock,
      inv_checked_at: invCheckedAt,
      // 매입 · purchase_details 만 신뢰
      last_purchase_date: lastPurchase,
      last_snapshot_date: null,  // deprecated · 하위 호환용
    });
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

// 상품 인라인 편집 · 허용 컬럼만 수정 (부적절 컬럼 차단)
const ALLOWED_INLINE_EDIT = new Set([
  "optimal_stock",
  "sale_price",
  "purchase_price",
  "cost_price",
  "supplier",
  "spec",
  "real_map",
  "brand",
  "manufacturer",
  "barcode",
  "expiry_date",
  "memo",
  "note",
  "hidden",
]);
// 2026-07-28 · 사용자 요청 "적정재고 = 최근 30일 판매량"
//   stock_history · snapshot_date >= today-30d · sale_qty 합산 → products.optimal_stock 일괄 업데이트
//   body · { days?: number }  기본 30
router.post("/api/products/refill-optimal-stock", async (req, res) => {
  const days = Math.max(1, Math.min(365, Number((req.body ?? {}).days ?? 30) || 30));
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  try {
    // stock_history 판매량 집계 (페이지네이션)
    const salesMap = new Map<string, number>();
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("stock_history")
        .select("product_code, sale_qty, snapshot_date")
        .gte("snapshot_date", sinceStr)
        .range(from, from + PAGE - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) {
          return res.status(503).json({ error: "stock_history 테이블 없음" });
        }
        throw new Error(error.message);
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const code = String((r as any).product_code ?? "").trim();
        if (!code) continue;
        const q = Number((r as any).sale_qty ?? 0) || 0;
        if (q <= 0) continue;
        salesMap.set(code, (salesMap.get(code) ?? 0) + q);
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (salesMap.size === 0) {
      return res.json({ ok: true, updated: 0, note: `${days}일 판매 이력 없음` });
    }

    // 일괄 업데이트 (Supabase · 개별 update · 배치 병렬)
    let updated = 0, failed = 0;
    const entries = [...salesMap.entries()];
    const BATCH = 20;
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      await Promise.all(chunk.map(async ([code, qty]) => {
        const rounded = Math.round(qty);
        const { error } = await supabase.from("products")
          .update({ optimal_stock: rounded, optimal_stock_backup: rounded })
          .eq("product_code", code);
        if (error) failed++; else updated++;
      }));
    }
    resetProductCache();
    console.log(`[refill-optimal-stock] days=${days} · ${updated}건 업데이트 · ${failed}건 실패`);
    return res.json({ ok: true, updated, failed, days, from: sinceStr });
  } catch (err: any) {
    console.error(`[refill-optimal-stock] 예외: ${err?.message}`);
    return res.status(500).json({ error: err?.message ?? "실패" });
  }
});

router.patch("/api/products/:code", async (req, res) => {
  const code = (req.params.code ?? "").trim();
  if (!code) return res.status(400).json({ error: "code required" });
  const body = req.body ?? {};
  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_INLINE_EDIT.has(k)) continue;
    // 숫자 필드는 파싱, 빈 문자열은 null
    if (["optimal_stock", "sale_price", "purchase_price", "cost_price"].includes(k)) {
      updates[k] = v === "" || v == null ? null : Number(v);
    } else if (k === "hidden") {
      // boolean 정규화: true/false/"true"/"false"/1/0
      updates[k] = v === true || v === "true" || v === 1 || v === "1";
    } else {
      updates[k] = v === "" ? null : v;
    }
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "수정할 필드가 없습니다" });
  // 적정재고 변경 시 백업 컬럼에 자동 저장 (ERP 임포트로 wipe 되는 것 방어)
  if (Object.prototype.hasOwnProperty.call(updates, "optimal_stock")) {
    updates.optimal_stock_backup = updates.optimal_stock;
  }
  try {
    const { error } = await supabase.from("products").update(updates).eq("product_code", code);
    if (error) {
      console.error("[products PATCH] error:", error.message);
      return res.status(500).json({ error: error.message });
    }
    resetProductCache();
    res.json({ ok: true, updated: Object.keys(updates) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
