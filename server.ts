// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { scheduleController } from "./src/controllers/scheduleController";
import { supabase } from "./src/supabase/client";
import bcrypt from "bcryptjs";
import webpush from "web-push";

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

  app.use(express.json());

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
        .select("id, name, password_hash")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!emp || !emp.password_hash) {
        return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
      }
      const ok = await bcrypt.compare(password, emp.password_hash);
      if (!ok) return res.status(401).json({ error: "전화번호 또는 비밀번호가 올바르지 않습니다" });
      return res.status(200).json({ id: emp.id, name: emp.name });
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
