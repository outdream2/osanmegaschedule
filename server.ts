// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { scheduleController } from "./src/controllers/scheduleController";
import { supabase } from "./src/supabase/client";
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Memory cache for reservations in local dev
  let mockReservations: Array<{ date: string; time: string; company: string; contactName: string; phone: string; purpose: string; note: string }> = [];

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

  // GET /api/reservations for local dev fallback
  app.get("/api/reservations", (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date query param required" });
    }
    const filtered = mockReservations.filter((r) => r.date === date);
    res.json(
      filtered.map((r) => ({
        time: r.time,
        note: r.note,
        purpose: r.purpose,
        company: r.company,
        contact_name: r.contactName,
        phone: r.phone,
      }))
    );
  });

  // POST /api/reservations for local dev fallback
  app.post("/api/reservations", (req, res) => {
    const { date, time, company, contactName, phone, purpose, note } = req.body ?? {};
    if (!date || !time || !company || !contactName || !phone || !purpose) {
      return res.status(400).json({ error: "필수 항목이 누락되었습니다." });
    }

    const getTarget = (n: string) => {
      const match = (n || "").match(/^\[대상:(대표|이사|부장)\]/);
      return match ? match[1] : "대표";
    };
    const targetToBook = getTarget(note || "");
    const isAlreadyBooked = mockReservations.some(
      (r) => r.date === date && r.time === time && getTarget(r.note) === targetToBook
    );

    if (isAlreadyBooked) {
      return res.status(409).json({ error: "이미 예약된 시간입니다." });
    }

    mockReservations.push({ date, time, company, contactName, phone, purpose, note: note || "" });
    res.status(201).json({ ok: true });
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
