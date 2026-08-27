// 2026-08-16 · asyncHandler + HttpError + shared DTO 프레임워크
import { Router } from "express";
import express from "express";
import XLSX from "xlsx";
import { supabase } from "../../../src/supabase/client";
import { getProductMap, getPublicProductMap, resetProductCache } from "../../productCache";
// 2026-08-23 · 사용자 지시 · 식약처 표준코드 조회 기능 제거 · lookupStandardCode import + 관련 라우터 삭제
import { COL_KEYS, xlsxToRows } from "../../utils/xlsx";
import { sanitizeOrValue } from "../../utils/sanitize";
import { authorize } from "../../middleware/requireAuth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError, badRequest, forbidden } from "../../middleware/errorHandler";
import type { HiddenProductsResponse } from "../../../src/shared/dtos/products";
import { CreateProductSchema } from "../../../src/shared/schemas/products";
// 2026-08-26 · 사용자 지시 · 적정재고 공통 프레임워크 · server/lib/optimalStock.ts
import { refillOptimalStock } from "../../lib/optimalStock";

const router = Router();

// 공개 재고확인 API — 로그인 불필요
// 2026-08-26 · 사용자 지시 · 전역 판매중 설정 반영 · sale_status="판매중" 만 반환
router.get("/api/stock-check", asyncHandler(async (req, res) => {
  const raw = String(req.query.q ?? "").trim().slice(0, 60);
  if (raw.length < 1) return res.json([]);
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "stats.sale_active_only").maybeSingle();
  const saleActive = setting?.value === true;
  let query = supabase
    .from("products")
    .select("product_name, spec, current_stock, sale_status, category, real_map, display_location, supplier")
    .eq("hidden", false)
    .ilike("product_name", `%${raw}%`);
  if (saleActive) query = query.eq("sale_status", "판매중");
  const { data, error } = await query.limit(25);
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));

router.get("/api/products-map", asyncHandler(async (req, res) => {
  // 2026-08-26 · 사용자 지시 · 전역 판매중 설정 반영 · getPublicProductMap 사용
  // 2026-08-27 · 사용자 지시 · 로딩 속도 개선 · ?fields=slim 요청 시 필수 필드만 반환 (~50% 응답 감소)
  const map = await getPublicProductMap();
  const isSlim = String(req.query.fields ?? "") === "slim";
  const payload = isSlim
    ? Object.fromEntries(Object.entries(map).map(([code, p]: [string, any]) => [code, {
        code,
        product_name: p.product_name ?? p.name ?? "",
        supplier: p.supplier ?? null,
        // 2026-08-27 · 사용자 지시 · location 컬럼 통합 (spec+display_location → location)
        location: p.location ?? p.display_location ?? p.spec ?? null,
        spec: p.spec ?? null,  // 하위호환 · 점진 제거 예정
        category: p.category ?? null,
        category_code: p.category_code ?? null,
        real_map: p.real_map ?? p.realMap ?? null,
        current_stock: p.current_stock ?? null,
        sale_status: p.sale_status ?? null,
        barcode: p.barcode ?? null,
        optimal_stock: p.optimal_stock ?? null,
        unit: p.unit ?? null,
      }]))
    : map;
  res.setHeader("Cache-Control", "no-cache");
  res.json(payload);
}));

// GET /api/inventory-latest — 상품코드별 최신 실재고 (warehouse_stock/store_stock/checked_at)
// DisplayPage 구역별 상품 리스트에서 재고관리 페이지처럼 창고/매장/실재고 컬럼을 채우기 위해 사용
// 2026-08-03 · Priority 3 · get_inventory_latest RPC 호출 · 단일 DISTINCT ON 쿼리로 교체
//   fallback: RPC 미생성(does not exist) 시 → 기존 1000건 페이지루프 방식으로 graceful 처리
router.get("/api/inventory-latest", asyncHandler(async (_req, res) => {
  // 2026-08-26 · 사용자 버그 fix · 5-slot 완전 지원
  //   · warehouse1_stock (신규) + warehouse_stock (레거시) · 창고1
  //   · warehouse2_stock (신규) · 창고2
  //   · store_stock (레거시 · 매장1) + store_stock_2 (신규 · 매장2) + store3_stock (신규 · 매장3)
  //   · 지역/구역 컬럼 (store1_zone·store2_zone·store3_zone) 도 포함
  type InvRow = {
    warehouse_stock: number | null;  // 하위호환 · = warehouse1_stock 값
    warehouse1_stock: number | null;
    warehouse2_stock: number | null;
    store_stock: number | null;      // = 매장1
    store_stock_2: number | null;    // = 매장2
    store3_stock: number | null;
    store1_zone: string | null;
    store2_zone: string | null;
    store3_zone: string | null;
    checked_at: string | null;
  };
  const buildMap = (rows: any[]): Record<string, InvRow> => {
    const map: Record<string, InvRow> = {};
    for (const r of rows) {
      const code = String(r.product_code ?? "").trim();
      if (!code || map[code]) continue;
      const w1 = r.warehouse1_stock != null ? Number(r.warehouse1_stock)
                : r.warehouse_stock  != null ? Number(r.warehouse_stock)  : null;
      map[code] = {
        warehouse_stock:  w1,  // 하위 호환 alias
        warehouse1_stock: w1,
        warehouse2_stock: r.warehouse2_stock != null ? Number(r.warehouse2_stock) : null,
        store_stock:      r.store_stock      != null ? Number(r.store_stock)      : null,
        store_stock_2:    r.store_stock_2    != null ? Number(r.store_stock_2)    : null,
        store3_stock:     r.store3_stock     != null ? Number(r.store3_stock)     : null,
        store1_zone:      r.store1_zone ?? null,
        store2_zone:      r.store2_zone ?? null,
        store3_zone:      r.store3_zone ?? null,
        checked_at:       r.checked_at ?? null,
      };
    }
    return map;
  };

  const SELECT_COLS = "product_code, warehouse_stock, warehouse1_stock, warehouse2_stock, store_stock, store_stock_2, store3_stock, store1_zone, store2_zone, store3_zone, checked_at";

  // 1차 시도: RPC (단일 DISTINCT ON 쿼리 · 빠름)
  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_inventory_latest");
  if (!rpcErr) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.json(buildMap(rpcData ?? []));
  }

  // RPC 미생성이 아닌 실제 오류는 즉시 실패
  if (!/function.*does not exist|could not find/i.test(rpcErr.message)) {
    console.error("[inventory-latest] RPC error:", rpcErr.message);
    throw new HttpError(500, rpcErr.message);
  }

  // 2차 fallback: 1000건 페이지루프 (RPC 생성 전 구 동작)
  console.warn("[inventory-latest] RPC get_inventory_latest 미생성 · 페이지루프 fallback 사용");
  const PAGE = 1000;
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("inventory_checks")
      .select(SELECT_COLS)
      .order("checked_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      if (/relation|does not exist/i.test(error.message)) break;
      // 신규 컬럼 미존재 (마이그레이션 안 된 DB) · fallback · 레거시 컬럼만
      if (/column .* does not exist/i.test(error.message)) {
        console.warn("[inventory-latest] 신규 컬럼 없음 · 레거시 fallback · warehouse_stock · store_stock 만");
        const { data: lg } = await supabase
          .from("inventory_checks")
          .select("product_code, warehouse_stock, store_stock, checked_at")
          .order("checked_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (!lg || lg.length === 0) break;
        allRows.push(...lg);
        if (lg.length < PAGE) break;
        from += PAGE;
        continue;
      }
      throw new HttpError(500, error.message);
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.json(buildMap(allRows));
}));

router.get("/api/products-search", asyncHandler(async (req, res) => {
  const rawQ     = String(req.query.q        ?? "").trim();
  const supplier = String(req.query.supplier ?? "").trim();
  const includeHidden = req.query.include_hidden === "1" || req.query.include_hidden === "true";
  if (rawQ.length < 1) return res.json([]);
  // PostgREST or() 특수문자 방어 (쉼표·괄호 등)
  const q = sanitizeOrValue(rawQ);
  if (q.length < 1) return res.json([]);
  {
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

    const cols = "product_code,product_name,spec,supplier,category_code,category,purchase_price,sale_price,profit_rate,expiry_date,real_map,current_stock,sale_status,hidden";

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
      throw new HttpError(500, error.message);
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
          const c = String(r.product_code ?? "").trim();
          if (!c || invByCode.has(c)) continue;
          invByCode.set(c, {
            warehouse_stock: r.warehouse_stock != null ? Number(r.warehouse_stock) : null,
            store_stock: r.store_stock != null ? Number(r.store_stock) : null,
            checked_at: r.checked_at ?? null,
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
            const c = String(r.product_code ?? "").trim();
            if (!c || histByCode.has(c)) continue;  // 최근 매입일 우선 (desc 정렬)
            histByCode.set(c, {
              last_snapshot: r.purchase_date ?? null,
              last_purchase_qty: r.quantity != null ? Number(r.quantity) : null,
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
  }
}));

// 2026-08-23 · 사용자 지시 · 식약처 표준코드 조회 기능 제거
// - /api/products/standard-code-lookup · /api/products/standard-code/:standardCode 라우터 제거
// - server/services/standardCodeLookup.ts · 미커밋 파일 · 원격 없음

router.post("/api/upload-products", express.raw({ type: "application/octet-stream", limit: "100mb" }), asyncHandler(async (req, res) => {
  const { adminKey, managerId } = req.query as Record<string, string>;
  if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw badRequest("파일이 없습니다");
  }
  let authorized = false;
  if (adminKey && adminKey === (process.env.ADMIN_PIN ?? "1234")) {
    authorized = true;
  } else if (managerId) {
    const { data: emp } = await supabase.from("employees").select("level").eq("id", Number(managerId)).maybeSingle();
    authorized = (emp?.level ?? 0) >= 9;
  }
  if (!authorized) throw forbidden("관리자만 가능합니다");
  const buf = req.body as Buffer;
  const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
  if (!isXlsx && !isXls) throw badRequest("형식이 다른 파일입니다. 상품리스트를 업로드해주세요.");
  const wbCheck = XLSX.read(buf, { sheetRows: 1 });
  const wsCheck = wbCheck.Sheets[wbCheck.SheetNames[0]];
  const headerRow = XLSX.utils.sheet_to_json<any[]>(wsCheck, { header: 1 })[0] ?? [];
  if (headerRow.length < COL_KEYS.length) {
    throw badRequest("형식이 다른 파일입니다. 상품리스트를 업로드해주세요.");
  }
  const rows = xlsxToRows(buf);
  if (rows.length === 0) throw badRequest("엑셀에 데이터가 없습니다");
  const t0 = Date.now();
  console.log(`[upload] parsed ${rows.length} rows`);
  // 2026-08-26 · 사용자 버그 fix · ON CONFLICT DO UPDATE cannot affect row twice
  //   · xlsx 안 · 같은 product_code 중복 시 · Postgres upsert 실패
  //   · 해결 · 마지막 값 우선 · Map 으로 dedupe (마지막 등장 값 유지)
  //   · normalizeCode · 공백/전각/보이지 않는 문자 방어 (​ ZWSP · ﻿ BOM ·   NBSP)
  const normalizeCode = (v: unknown): string => String(v ?? "")
    .replace(/[​﻿ ]/g, "")
    .trim();
  const dedupMap = new Map<string, Record<string, any>>();
  let dupCount = 0;
  let emptyCount = 0;
  for (const r of rows) {
    const code = normalizeCode((r as any).product_code);
    if (!code) { emptyCount++; continue; }
    (r as any).product_code = code; // 정규화된 값으로 통일 (chunk 내 dedup 보장)
    // 2026-08-27 · 사용자 지시 (옵션 A) · products.location 물리 컬럼 통합
    //   · 엑셀 진열위치(G열) → 정규화 후 · location + display_location 양쪽 저장
    //   · SQL 마이그레이션 실행 후 (sql/2026-08-27-location-column-migration.sql) · location 컬럼 자동 채워짐
    //   · 컬럼 미존재 시 upsert 에러 방어 · try/catch 로 재시도 (아래 upsert 로직)
    const disp = (r as any).display_location;
    if (disp != null && String(disp).trim() !== "") {
      const trimmed = String(disp).trim();
      (r as any).display_location = trimmed;
      (r as any).location = trimmed;  // DB 컬럼 생성 후 자동 저장 · 없으면 upsert 시 필터 (아래 try/catch)
    }
    if (dedupMap.has(code)) dupCount++;
    dedupMap.set(code, r);
  }
  const dedupedRows = Array.from(dedupMap.values());
  if (dupCount > 0 || emptyCount > 0) {
    console.log(`[upload] dedup · ${rows.length} → ${dedupedRows.length} (중복 ${dupCount} · 빈코드 ${emptyCount} 제외 · 마지막 값 유지)`);
  }
  // 2026-08-26 · 성능 개선 · chunk 500→1000 · PARALLEL 3→5 · Postgres 1KB row 기준 여유
  // 2026-08-27 · location 컬럼 없을 시 방어 · 첫 chunk 실패 시 location 필드 제거 후 재시도
  const CHUNK_SIZE = 1000;
  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < dedupedRows.length; i += CHUNK_SIZE) chunks.push(dedupedRows.slice(i, i + CHUNK_SIZE));
  let stripLocationField = false;
  const upsertOne = async (chunk: Record<string, any>[]) => {
    const payload = stripLocationField ? chunk.map(({ location, ...rest }) => rest) : chunk;
    const r = await supabase.from("products").upsert(payload, { onConflict: "product_code" });
    if (r.error && /column.*location.*(does not exist|schema cache)/i.test(r.error.message) && !stripLocationField) {
      // 첫 감지 · location 컬럼 없음 · 이후 모든 chunk 에서 필터
      console.warn("[upload] location 컬럼 없음 · SQL 마이그레이션 필요 · 이 임포트는 location 제외 진행");
      stripLocationField = true;
      const retryPayload = chunk.map(({ location, ...rest }) => rest);
      return supabase.from("products").upsert(retryPayload, { onConflict: "product_code" });
    }
    return r;
  };
  const PARALLEL = 5;
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = chunks.slice(i, i + PARALLEL);
    const tChunk = Date.now();
    const results = await Promise.all(batch.map(upsertOne));
    for (const { error: upsertErr } of results) {
      if (upsertErr) {
        console.error("[upload] upsert error:", upsertErr);
        throw new HttpError(500, `업서트 실패: ${upsertErr.message}`);
      }
    }
    console.log(`[upload] upserted chunks ${i + 1}~${Math.min(i + PARALLEL, chunks.length)} / ${chunks.length} · ${Date.now() - tChunk}ms`);
  }
  const upsertMs = Date.now() - t0;
  console.log(`[upload] upsert done · 총 ${upsertMs}ms · rows=${dedupedRows.length}`);
  // 2026-08-26 · 성능 조사 · post-upload 단계별 시간 측정
  // 임포트 완료 후 optimal_stock_backup → optimal_stock 복원 (ERP wipe 방어)
  let restoredCount = 0;
  const tRestore = Date.now();
  try {
    const { data: restoreData, error: restoreErr } = await supabase.rpc("restore_optimal_stock_from_backup");
    if (restoreErr) {
      console.warn("[upload] restore_optimal_stock RPC failed:", restoreErr.message);
    } else {
      restoredCount = Number(restoreData ?? 0) || 0;
      console.log(`[upload] restore RPC · ${restoredCount}건 · ${Date.now() - tRestore}ms`);
    }
  } catch (e: any) {
    console.warn("[upload] restore_optimal_stock exception:", e.message);
  }
  const tCache = Date.now();
  resetProductCache();
  const tLog = Date.now();
  console.log(`[upload] resetProductCache · ${tLog - tCache}ms`);
  const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
  const prevLogs: unknown[] = Array.isArray(logData?.value) ? logData.value : [];
  const newEntry = { timestamp: new Date().toISOString(), count: rows.length, restored: restoredCount };
  const logs = [newEntry, ...prevLogs].slice(0, 20);
  await supabase.from("app_settings").upsert({ key: "product_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });
  console.log(`[upload] app_settings log · ${Date.now() - tLog}ms`);
  console.log(`[upload] ==== 전체 소요 ${Date.now() - t0}ms (upsert ${upsertMs}ms + post ${Date.now() - t0 - upsertMs}ms) ====`);
  res.json({ ok: true, count: rows.length, restored: restoredCount, timestamp: newEntry.timestamp });
}));

router.delete("/api/product-import-log", authorize(9), asyncHandler(async (_req, res) => {
  await supabase.from("app_settings").upsert({ key: "product_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
  res.json({ ok: true });
}));

// 2026-08-26 · 사용자 지시 · 전산구역(spec) 값으로 실제구역(real_map) 일괄 통일
//   · spec 있는 모든 상품 · real_map = spec 으로 업데이트
//   · 관리자 lv9 전용 · 대용량 · 청크 배치
router.post("/api/products/sync-real-map-to-spec", authorize(9), asyncHandler(async (_req, res) => {
  const t0 = Date.now();
  // 1. spec 이 있고 real_map 과 다른 상품 조회
  const { data: rows, error: qErr } = await supabase
    .from("products")
    .select("product_code, spec, real_map")
    .not("spec", "is", null)
    .neq("spec", "");
  if (qErr) throw new HttpError(500, qErr.message);
  const targets = (rows ?? []).filter(r => {
    const spec = String(r.spec ?? "").trim();
    const real = String(r.real_map ?? "").trim();
    return spec !== "" && spec !== real;
  });
  console.log(`[sync-real-map] 조회 ${rows?.length ?? 0}건 · 업데이트 대상 ${targets.length}건`);

  // 2. 청크 500씩 · 각 상품 real_map = spec 로 upsert
  let updated = 0;
  const CHUNK = 500;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const payload = chunk.map(r => ({ product_code: r.product_code, real_map: String(r.spec).trim() }));
    const { error: uErr } = await supabase.from("products").upsert(payload, { onConflict: "product_code" });
    if (uErr) {
      console.error("[sync-real-map] upsert 오류:", uErr.message);
      throw new HttpError(500, uErr.message);
    }
    updated += chunk.length;
    console.log(`[sync-real-map] chunk ${i / CHUNK + 1} · ${updated}/${targets.length}`);
  }
  resetProductCache();
  console.log(`[sync-real-map] 완료 · ${updated}건 · ${Date.now() - t0}ms`);
  res.json({ ok: true, checked: rows?.length ?? 0, updated, elapsedMs: Date.now() - t0 });
}));

router.get("/api/products/realmap-check", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from("products").select("real_map").limit(1);
  if (error) {
    // 200 으로 ok:false 응답 (진단 엔드포인트 · 프론트에서 error 필드 감지)
    return res.json({
      ok: false,
      error: error.message,
      fix: "Supabase SQL Editor에서 실행: ALTER TABLE products ADD COLUMN IF NOT EXISTS \"real_map\" TEXT;",
    });
  }
  res.json({ ok: true, sample: data?.[0]?.real_map ?? null });
}));

// 2026-08-25 · 사용자 지시 · 유통기한 임박 상품 리스트 · products.expiry_date IS NOT NULL
//   · 매입 서브탭 (구 "실재고" → "유통기한 임박") · 화면 리스트 소스
//   · /:code 라우트보다 먼저 등록해야 매칭됨
router.get("/api/products/expiry-imminent", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select("product_code, product_name, spec, supplier, real_map, current_stock, expiry_date")
    .not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[expiry-imminent GET] error:", error.message);
    throw new HttpError(500, error.message);
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(Array.isArray(data) ? data : []);
}));

// 숨김 처리된 상품 리스트 (숨김 관리 UI 용) — /:code 라우트보다 먼저 등록해야 매칭됨
router.get("/api/products/hidden", asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from("products")
    .select("product_code, product_name, spec, supplier, real_map, current_stock, sale_price")
    .eq("hidden", true)
    .order("product_name", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[hidden GET] error:", error.message);
    throw new HttpError(500, error.message);
  }
  res.setHeader("Cache-Control", "no-store");
  const body: HiddenProductsResponse = (Array.isArray(data) ? data : []) as any;
  res.json(body);
}));

router.get("/api/products/:code", asyncHandler(async (req, res) => {
  const code = (req.params.code ?? "").trim();
  if (!code) throw badRequest("code required");
  let { data, error } = await supabase.from("products").select("*").eq("product_code", code).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data && /^0+/.test(code)) {
    const stripped = code.replace(/^0+/, "");
    const r2 = await supabase.from("products").select("*").eq("product_code", stripped).maybeSingle();
    if (r2.error) throw new HttpError(500, r2.error.message);
    data = r2.data;
  }
  if (!data) throw new HttpError(404, "상품을 찾을 수 없습니다");
  const productCode = data.product_code ?? code;

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
      warehouseStock = iv[0].warehouse_stock != null ? Number(iv[0].warehouse_stock) : null;
      storeStock     = iv[0].store_stock     != null ? Number(iv[0].store_stock)     : null;
      invCheckedAt   = iv[0].checked_at ?? null;
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
      lastPurchase = pd[0].purchase_date ?? null;
    }
  } catch { /* silent */ }

  res.json({
    ...data,
    realMap: data.real_map ?? null,
    // 재고 DB에서 병합
    warehouse_stock: data.warehouse_stock ?? warehouseStock,
    store_stock: data.store_stock ?? storeStock,
    inv_checked_at: invCheckedAt,
    // 매입 · purchase_details 만 신뢰
    last_purchase_date: lastPurchase,
    last_snapshot_date: null,  // deprecated · 하위 호환용
  });
}));

router.patch("/api/products/:code/realmap", asyncHandler(async (req, res) => {
  const code = (req.params.code ?? "").trim();
  const { realMap } = req.body ?? {};
  if (!code) throw badRequest("code required");
  const { error } = await supabase.from("products").update({ real_map: realMap }).eq("product_code", code);
  if (error) {
    console.error("[realmap PATCH] Supabase error:", error.message, "code:", code);
    throw new HttpError(500, error.message);
  }
  resetProductCache();
  res.json({ ok: true });
}));

// 상품 인라인 편집 · 허용 컬럼만 수정 (부적절 컬럼 차단)
// 2026-08-25 · products 테이블에 없는 컬럼 · cost_price 제거
const ALLOWED_INLINE_EDIT = new Set([
  "optimal_stock",
  "sale_price",
  "purchase_price",
  "supplier",
  "spec",
  "real_map",
  "brand",
  "manufacturer",
  "barcode",
  "expiry_date",
  "memo",
  // 2026-08-25 · products 테이블에 없는 컬럼 · note 제거 (스키마 캐시 에러)
  "hidden",
  // 2026-08-25 · 배치구역 불일치 · 상품명 인라인 편집 허용
  "product_name",
  "category",
]);
// 2026-07-28 · 사용자 요청 "적정재고 = 최근 30일 판매량"
//   stock_history · snapshot_date >= today-30d · sale_qty 합산 → products.optimal_stock 일괄 업데이트
//   body · { days?: number }  기본 30
router.post("/api/products/refill-optimal-stock", asyncHandler(async (req, res) => {
  // 2026-08-26 · 사용자 지시 · 공통 프레임워크 사용 (server/lib/optimalStock.ts)
  //   · 판매 0 상품도 0 으로 명시 설정 (A안 · 기본값)
  //   · fromDate 지정 · 그 날짜부터 오늘까지 판매량 집계 (미지정 시 · 오늘 - days)
  //   · order_requests 자동 동기화 (스냅샷 컬럼도 최신 값)
  const body = req.body ?? {};
  try {
    const result = await refillOptimalStock({
      days: Number(body.days ?? 30),
      fromDate: String(body.fromDate ?? "").trim() || undefined,
      toDate: String(body.toDate ?? "").trim() || undefined,
      zeroIfNoSales: body.zeroIfNoSales !== false, // 기본 true
      syncOrderRequests: body.syncOrderRequests !== false, // 기본 true
    });
    resetProductCache();
    console.log(`[refill-optimal-stock] since=${result.since} until=${result.until} · history=${result.totalHistoryRows} · sales=${result.productsWithSales} · zeroed=${result.productsZeroed} · updated=${result.productsUpdated} · orderReqs=${result.orderRequestsUpdated} · total=${result.elapsedMs}ms (sale ${result.saleMs}ms + product ${result.productMs}ms + order ${result.orderMs}ms)`);
    return res.json({
      ok: true,
      updated: result.productsUpdated,
      failed: result.productsFailed,
      orderUpdated: result.orderRequestsUpdated,
      productsZeroed: result.productsZeroed,
      productsWithSales: result.productsWithSales,
      totalProducts: result.totalProducts,
      from: result.since,
      to: result.until,
      elapsedMs: result.elapsedMs,
    });
  } catch (e: any) {
    if (/stock_history/i.test(e?.message ?? "")) {
      throw new HttpError(503, e.message);
    }
    throw new HttpError(500, e?.message ?? "재계산 실패");
  }
}));

router.patch("/api/products/:code", asyncHandler(async (req, res) => {
  const code = (req.params.code ?? "").trim();
  if (!code) throw badRequest("code required");
  const body = req.body ?? {};
  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_INLINE_EDIT.has(k)) continue;
    // 숫자 필드는 파싱, 빈 문자열은 null
    if (["optimal_stock", "sale_price", "purchase_price"].includes(k)) {
      updates[k] = v === "" || v == null ? null : Number(v);
    } else if (k === "hidden") {
      // boolean 정규화: true/false/"true"/"false"/1/0
      updates[k] = v === true || v === "true" || v === 1 || v === "1";
    } else {
      updates[k] = v === "" ? null : v;
    }
  }
  if (Object.keys(updates).length === 0) throw badRequest("수정할 필드가 없습니다");
  // 적정재고 변경 시 백업 컬럼에 자동 저장 (ERP 임포트로 wipe 되는 것 방어)
  if (Object.prototype.hasOwnProperty.call(updates, "optimal_stock")) {
    updates.optimal_stock_backup = updates.optimal_stock;
  }
  // 2026-08-25 · 사용자 지시 · DB 컬럼 미존재 시 · strip 후 재시도 · POST 와 동일 패턴
  const doUpdate = async (payload: Record<string, any>) =>
    supabase.from("products").update(payload).eq("product_code", code);
  const patchStripped: string[] = [];
  let updErr: { message: string } | null = null;
  {
    const { error } = await doUpdate(updates);
    updErr = error ?? null;
  }
  const MAX_STRIP_RETRIES = 8;
  for (let attempt = 0; attempt < MAX_STRIP_RETRIES && updErr && /Could not find the '([^']+)' column|column "?([^" ]+)"? does not exist|no column named ([^ ]+)|schema cache/i.test(updErr.message); attempt++) {
    const m = updErr.message.match(/Could not find the '([^']+)' column|column "?([^" ]+)"? does not exist|no column named ([^ ]+)/i);
    const colName = m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
    if (!colName || !(colName in updates)) break;
    delete updates[colName];
    patchStripped.push(colName);
    console.warn(`[products PATCH] DB 컬럼 미존재 · strip 후 재시도: ${colName}`);
    if (Object.keys(updates).length === 0) { updErr = null; break; }
    const { error } = await doUpdate(updates);
    updErr = error ?? null;
  }
  if (updErr) {
    console.error("[products PATCH] error:", updErr.message);
    throw new HttpError(500, updErr.message);
  }
  resetProductCache();
  res.json({ ok: true, updated: Object.keys(updates), stripped: patchStripped });
}));

// 2026-08-23 · #177 Phase C · 상품 신규 등록 · 관리자 + 매니저 lv5+ 만 (authorize(5))
//   · Zod · CreateProductSchema · product_code UNIQUE 검사 · 중복 시 409
router.post("/api/products", authorize(5), asyncHandler(async (req, res) => {
  const parsed = CreateProductSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "유효성 오류"}`);
  }
  const input = parsed.data;
  const code = input.product_code.trim();
  if (!code) throw badRequest("product_code required");

  // 중복 검사
  const { data: exist, error: existErr } = await supabase
    .from("products")
    .select("product_code")
    .eq("product_code", code)
    .maybeSingle();
  if (existErr) throw new HttpError(500, existErr.message);
  if (exist) throw new HttpError(409, `상품코드 중복: ${code}`);

  // INSERT · undefined → 컬럼 미포함 · null 명시는 그대로 저장
  const row: Record<string, unknown> = { product_code: code };
  for (const [k, v] of Object.entries(input)) {
    if (k === "product_code") continue;
    if (typeof v === "undefined") continue;
    row[k] = v === "" ? null : v;
  }

  // 2026-08-25 · 사용자 지시 · DB 에 없는 컬럼 자동 strip 후 재시도 (inventory_checks POST 와 동일 패턴)
  //   · Zod 스키마 필드 중 · products 테이블 컬럼 미존재 시 · 에러 메시지 파싱 → 컬럼 제거 → 재시도
  //   · 최대 8회 재시도 · 컬럼 오류 아니면 즉시 중단
  const doInsert = async (payload: Record<string, unknown>) => supabase.from("products").insert(payload);
  const MAX_STRIP_RETRIES = 8;
  const stripped: string[] = [];
  let insErr: { message: string } | null = null;
  {
    const { error } = await doInsert(row);
    insErr = error ?? null;
  }
  for (let attempt = 0; attempt < MAX_STRIP_RETRIES && insErr && /Could not find the '([^']+)' column|column "?([^" ]+)"? does not exist|no column named ([^ ]+)|schema cache/i.test(insErr.message); attempt++) {
    const m = insErr.message.match(/Could not find the '([^']+)' column|column "?([^" ]+)"? does not exist|no column named ([^ ]+)/i);
    const colName = m ? (m[1] ?? m[2] ?? m[3] ?? "").trim() : null;
    if (!colName || !(colName in row)) break;
    delete row[colName];
    stripped.push(colName);
    console.warn(`[products POST] DB 컬럼 미존재 · strip 후 재시도: ${colName}`);
    const { error } = await doInsert(row);
    insErr = error ?? null;
  }
  if (insErr) {
    console.error("[products POST] insert error:", insErr.message);
    throw new HttpError(500, insErr.message);
  }
  if (stripped.length > 0) {
    console.log(`[products POST] 신규 등록 (strip: ${stripped.join(", ")}) · ${code} · ${input.product_name}`);
  } else {
    console.log(`[products POST] 신규 등록 · ${code} · ${input.product_name}`);
  }
  resetProductCache();
  res.status(201).json({ ok: true, product_code: code, stripped });
}));

export default router;
