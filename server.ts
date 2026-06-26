// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { scheduleController } from "./src/controllers/scheduleController";
import { supabase } from "./src/supabase/client";
import bcrypt from "bcryptjs";
import webpush from "web-push";
import XLSX from "xlsx";
import compression from "compression";

// ── Product map cache ─────────────────────────────────────────────────────────
interface ProductInfo { code: string; name: string; spec: string; [key: string]: any; }
let productMapCache: Record<string, ProductInfo> | null = null;
let productMapPromise: Promise<Record<string, ProductInfo>> | null = null;

const COL_KEYS = [
  "product_code","product_name","col_i","product_type","origin","spec",
  "purchase_price","sale_price","profit_rate","delivery_price","delivery_profit_rate",
  "sale_status","app_registered","image_registered","preset_registered","preset_group",
  "promotion_name","promotion_priority","promotion_purchase_price","promotion_sale_price",
  "promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type",
  "current_stock","stock_amount","optimal_stock","last_purchase_date","last_sale_date",
  "category_code","category","operator","last_modified_at","registered_at",
  "min_order","point_rate","sales_commission","delivery_margin_rate","search_keywords",
  "unit","total_volume","unit_volume","unit_price","connection_type","individual_code","individual_quantity",
] as const;

function xlsxToRows(buf: Buffer): Record<string, any>[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 }) as any[][];
  const result: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const obj: Record<string, any> = {};
    for (let c = 0; c < COL_KEYS.length; c++) {
      const v = row[c];
      obj[COL_KEYS[c]] = (v !== undefined && v !== null && String(v).trim() !== "") ? String(v).trim() : null;
    }
    result.push(obj);
  }
  return result;
}

function rowsToCSV(rows: Record<string, any>[]): string {
  const headers = [...COL_KEYS];
  const esc = (v: any): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))];
  return lines.join("\n");
}

async function getProductMap(): Promise<Record<string, ProductInfo>> {
  if (productMapCache) return productMapCache;
  if (productMapPromise) return productMapPromise;
  productMapPromise = (async () => {
    const PAGE = 1000;
    const map: Record<string, ProductInfo> = {};
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from("products").select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const code = String(row.product_code ?? "").trim();
        if (!code) continue;
        const info: ProductInfo = { code, name: row.product_name ?? "", spec: row.spec ?? "", ...row };
        map[code] = info;
        const stripped = code.replace(/^0+/, "");
        if (stripped && stripped !== code && !map[stripped]) map[stripped] = info;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    productMapCache = map;
    return map;
  })();
  return productMapPromise;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@osanmegatown.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  app.use(compression());
  app.use(express.json({ limit: "200mb" }));

  // API router endpoints
  app.get("/api/schedules", (req, res) => scheduleController.getSchedules(req, res));
  app.put("/api/schedules", (req, res) => scheduleController.updateSchedule(req, res));
  app.post("/api/schedules/batch", (req, res) => scheduleController.batchUpdateSchedules(req, res));
  app.post("/api/schedules/copy", (req, res) => scheduleController.copySchedules(req, res));
  app.post("/api/employees", (req, res) => scheduleController.createEmployee(req, res));
  app.put("/api/employees/:id", (req, res) => scheduleController.updateEmployee(req, res));
  app.delete("/api/employees/:id", (req, res) => scheduleController.deleteEmployee(req, res));

  // GET /api/staff-availability?date=YYYY-MM-DD — schedule status for employees 1,2,3
  const STAFF_LIST = [{ id: 1, name: "대표" }, { id: 2, name: "이사" }, { id: 3, name: "부장" }];
  const OFF_TYPES = ["휴무", "월차", "지정휴무", "오전반차", "오후반차"];
  app.get("/api/staff-availability", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId, type")
        .eq("date", date)
        .in("employeeId", STAFF_LIST.map(s => s.id));
      if (error) throw new Error(error.message);
      const result = STAFF_LIST.map(({ id, name }) => {
        const row = (data ?? []).find((r: any) => r.employeeId === id);
        const scheduleType: string | null = row?.type ?? null;
        return { employeeId: id, name, scheduleType, isOff: scheduleType ? OFF_TYPES.includes(scheduleType) : false };
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/staff-monthly?year=YYYY&month=M — monthly off dates for employees 1,2,3
  app.get("/api/staff-monthly", async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: "year and month required" });
    }
    const monthStr = String(month).padStart(2, "0");
    const datePrefix = `${year}-${monthStr}-`;
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId, date, type")
        .like("date", `${datePrefix}%`)
        .in("employeeId", STAFF_LIST.map(s => s.id));
      if (error) throw new Error(error.message);
      const result: Record<string, string[]> = {};
      for (const row of (data ?? [])) {
        if (!OFF_TYPES.includes(row.type)) continue;
        const staff = STAFF_LIST.find(s => s.id === row.employeeId);
        if (!staff) continue;
        if (!result[row.date]) result[row.date] = [];
        result[row.date].push(staff.name);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/settings?key=xxx — app settings (wages etc.)
  app.get("/api/settings", async (req, res) => {
    const { key } = req.query;
    if (!key || typeof key !== "string") return res.status(400).json({ error: "key required" });
    try {
      const { data, error } = await supabase
        .from("app_settings").select("value").eq("key", key).maybeSingle();
      if (error) throw new Error(error.message);
      res.json({ value: data?.value ?? null });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/settings — upsert app setting
  app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body ?? {};
    if (!key) return res.status(400).json({ error: "key required" });
    try {
      const { error } = await supabase.from("app_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/zones — zone assignments
  app.get("/api/zones", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("zone_assignments")
        .select("zone_id, employee_id, employee_name, status, products");
      if (error) throw new Error(error.message);
      res.json(data ?? []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/zones — upsert zone assignments
  app.post("/api/zones", async (req, res) => {
    const { zones } = req.body ?? {};
    if (!Array.isArray(zones)) return res.status(400).json({ error: "zones array required" });
    try {
      const rows = zones.map((z: any) => ({
        zone_id: String(z.zone_id),
        employee_id: z.employee_id ?? null,
        employee_name: z.employee_name ?? "",
        status: z.status ?? "normal",
        products: z.products ?? "",
      }));
      const { error } = await supabase
        .from("zone_assignments")
        .upsert(rows, { onConflict: "zone_id" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/blocked-slots?date=YYYY-MM-DD
  app.get("/api/blocked-slots", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") return res.status(400).json({ error: "date required" });
    try {
      const { data, error } = await supabase.from("app_settings").select("value")
        .eq("key", `blocked_slots_${date}`).maybeSingle();
      if (error) throw new Error(error.message);
      res.json((data?.value as Record<string, string[]>) ?? {});
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/blocked-slots — toggle a slot blocked/unblocked
  app.post("/api/blocked-slots", async (req, res) => {
    const { date, staffName, time, blocked } = req.body ?? {};
    if (!date || !staffName || !time) {
      return res.status(400).json({ error: "date, staffName, time required" });
    }
    const key = `blocked_slots_${date}`;
    try {
      const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
      const current: Record<string, string[]> = (data?.value as Record<string, string[]>) ?? {};
      if (!current[staffName]) current[staffName] = [];
      if (blocked) {
        if (!current[staffName].includes(time)) current[staffName].push(time);
      } else {
        current[staffName] = current[staffName].filter((t: string) => t !== time);
      }
      const { error } = await supabase.from("app_settings")
        .upsert({ key, value: current, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw new Error(error.message);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/products-map — full product map (client caches and searches locally)
  app.get("/api/products-map", async (_req, res) => {
    try {
      const map = await getProductMap();
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(map);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/upload-products — manager or superadmin; raw xlsx binary → bulk-imports to products table
  app.post("/api/upload-products", express.raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
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
      // Validate Excel magic bytes: xlsx=PK\x03\x04, xls=OLE2 D0CF11E0
      const isXlsx = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
      const isXls  = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
      if (!isXlsx && !isXls) return res.status(400).json({ error: "형식이 다른 파일입니다. 상품리스트를 업로드해주세요." });
      const rows = xlsxToRows(buf);
      if (rows.length === 0) return res.status(400).json({ error: "엑셀에 데이터가 없습니다" });
      console.log(`[upload] parsed ${rows.length} rows`);
      // Delete all existing products
      const { error: delErr } = await supabase.from("products").delete().gte("product_code", "");
      if (delErr) {
        console.error("[upload] delete error:", delErr);
        throw new Error(`삭제 실패: ${delErr.message}`);
      }
      console.log(`[upload] table cleared, inserting ${rows.length} rows in chunks...`);
      // Bulk insert via supabase-js client in parallel chunks
      const CHUNK_SIZE = 500;
      const chunks: Record<string, any>[][] = [];
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE));
      const PARALLEL = 3;
      for (let i = 0; i < chunks.length; i += PARALLEL) {
        const batch = chunks.slice(i, i + PARALLEL);
        const results = await Promise.all(batch.map(chunk => supabase.from("products").insert(chunk)));
        for (const { error: insertErr } of results) {
          if (insertErr) {
            console.error("[upload] insert error:", insertErr);
            throw new Error(`삽입 실패: ${insertErr.message}`);
          }
        }
        console.log(`[upload] inserted chunks ${i + 1}~${Math.min(i + PARALLEL, chunks.length)} / ${chunks.length}`);
      }
      console.log(`[upload] insert done`);
      productMapCache = null;
      productMapPromise = null;
      // Append to import log (keep last 20)
      const { data: logData } = await supabase.from("app_settings").select("value").eq("key", "product_import_log").maybeSingle();
      const prevLogs = Array.isArray(logData?.value) ? (logData.value as any[]) : [];
      const newEntry = { timestamp: new Date().toISOString(), count: rows.length };
      const logs = [newEntry, ...prevLogs].slice(0, 20);
      await supabase.from("app_settings").upsert({ key: "product_import_log", value: logs, updated_at: new Date().toISOString() }, { onConflict: "key" });
      res.json({ ok: true, count: rows.length, timestamp: newEntry.timestamp });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/product-import-log — clear import history
  app.delete("/api/product-import-log", async (_req, res) => {
    await supabase.from("app_settings").upsert({ key: "product_import_log", value: [], updated_at: new Date().toISOString() }, { onConflict: "key" });
    res.json({ ok: true });
  });

  // GET /api/products/:code — single product lookup by barcode code
  app.get("/api/products/:code", async (req, res) => {
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
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    const { employee_id, password } = req.body ?? {};
    const phone = String(employee_id ?? "").replace(/[^0-9]/g, "");
    if (!phone || !password) {
      return res.status(400).json({ error: "전화번호와 비밀번호를 입력해주세요" });
    }
    try {
      const { data: emp, error } = await supabase
        .from("employees")
        .select("id, name, password_hash, is_manager")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!emp) {
        return res.status(401).json({ error: "전화번호를 찾을 수 없습니다", debug: "no_employee" });
      }
      if (!emp.password_hash) {
        return res.status(401).json({ error: "비밀번호가 설정되지 않았습니다", debug: "no_hash" });
      }
      const ok = await bcrypt.compare(password, emp.password_hash);
      if (!ok) return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
      const role = emp.is_manager ? "manager" : "employee";
      return res.status(200).json({ id: emp.id, name: emp.name, role });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/auth/set-password
  app.post("/api/auth/set-password", async (req, res) => {
    const { employeeId, password } = req.body ?? {};
    const idNum = typeof employeeId === "string" ? parseInt(employeeId) : employeeId;
    if (!idNum || isNaN(idNum)) return res.status(400).json({ error: "valid employeeId is required" });
    if (!password || password.length < 4) return res.status(400).json({ error: "password must be at least 4 characters" });
    try {
      const password_hash = await bcrypt.hash(password, 10);
      const { error } = await supabase.from("employees").update({ password_hash }).eq("id", idNum);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/push-subscribe
  app.post("/api/push-subscribe", async (req, res) => {
    const { employeeId, subscription } = req.body ?? {};
    if (!employeeId || !subscription) return res.status(400).json({ error: "employeeId and subscription are required" });
    try {
      const { error } = await supabase.from("employees").update({ push_subscription: subscription }).eq("id", employeeId);
      if (error) throw new Error(error.message);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/push-send
  app.post("/api/push-send", async (req, res) => {
    const { employeeId, title, body, url } = req.body ?? {};
    if (!employeeId) return res.status(400).json({ error: "employeeId is required" });
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("push_subscription, name")
        .eq("id", employeeId)
        .single();
      if (error || !data) return res.status(404).json({ error: "Employee not found" });
      if (!data.push_subscription) return res.status(200).json({ ok: false, reason: "no_subscription" });
      const payload = JSON.stringify({
        title: title ?? "진열 보충 요청",
        body: body ?? `${data.name}님께 새로운 진열 보충 요청이 도착했습니다.`,
        url: url ?? "/",
        tag: `req-${employeeId}-${Date.now()}`,
      });
      await webpush.sendNotification(data.push_subscription as webpush.PushSubscription, payload);
      return res.json({ ok: true });
    } catch (err: any) {
      if ((err as any).statusCode === 410) {
        await supabase.from("employees").update({ push_subscription: null }).eq("id", employeeId);
        return res.json({ ok: false, reason: "subscription_expired" });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/leave-stats?year=YYYY — count of 월차 per employee for the year
  app.get("/api/leave-stats", async (req, res) => {
    const { year } = req.query;
    if (!year || typeof year !== "string") return res.status(400).json({ error: "year required" });
    try {
      const { data, error } = await supabase
        .from("schedules")
        .select("employeeId")
        .like("date", `${year}-%`)
        .eq("type", "월차");
      if (error) throw new Error(error.message);
      const counts: Record<number, number> = {};
      for (const row of (data ?? [])) {
        const id = row.employeeId as number;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return res.json(counts);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/reservations
  app.get("/api/reservations", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    const { data, error } = await supabase
      .from("reservations")
      .select("time, note, purpose, company, contact_name, phone")
      .eq("date", date);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data ?? []);
  });

  // POST /api/reservations
  app.post("/api/reservations", async (req, res) => {
    const { date, time, company, contactName, phone, purpose, note } = req.body ?? {};
    if (!date || !time || !company || !contactName || !phone || !purpose) {
      return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
    }
    const getTarget = (n: string) => {
      const match = (n || "").match(/^\[대상:(대표|이사|부장)\]/);
      return match ? match[1] : "대표";
    };
    const targetToBook = getTarget(note || "");
    const { data: existing } = await supabase
      .from("reservations")
      .select("note")
      .eq("date", date)
      .eq("time", time);
    const isAlreadyBooked = (existing ?? []).some((r: any) => getTarget(r.note ?? "") === targetToBook);
    if (isAlreadyBooked) return res.status(409).json({ error: "이미 예약된 시간입니다." });
    const { error } = await supabase.from("reservations").insert({
      date, time, company, contact_name: contactName, phone, purpose, note: note || "",
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ ok: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // products.json: served dynamically so DB-uploaded data takes effect immediately
    app.get("/products.json", async (_req, res) => {
      try {
        const map = await getProductMap();
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.json(map);
      } catch {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.sendFile(path.join(distPath, "products.json"));
      }
    });
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
