// server.ts
import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import compression from "compression";
import webpush from "web-push";
import { createServer as createViteServer } from "vite";
import { supabase } from "./src/supabase/client";
import { getProductMap } from "./server/productCache";

import schedulesRouter   from "./server/routes/schedules";
import staffRouter       from "./server/routes/staff";
import settingsRouter    from "./server/routes/settings";
import productsRouter    from "./server/routes/products";
import requestsRouter    from "./server/routes/requests";
import mismatchesRouter  from "./server/routes/mismatches";
import authRouter        from "./server/routes/auth";
import notificationsRouter from "./server/routes/notifications";
import leaveRouter       from "./server/routes/leave";
import lunchRouter       from "./server/routes/lunch";
import reservationsRouter from "./server/routes/reservations";
import vendorsRouter     from "./server/routes/vendors";
import ocrRouter         from "./server/routes/ocr";
import stockCountRouter  from "./server/routes/stockCount";
import stockArrivalsRouter from "./server/routes/stockArrivals";
import zoneAssignmentsRouter from "./server/routes/zoneAssignments";
import supplierBalanceConfigRouter from "./server/routes/supplierBalanceConfig";
import ocrConfirmedRouter from "./server/routes/ocrConfirmed";
import { loadStockCountModel } from "./server/stockCounter";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // real_map 컬럼 존재 확인
  (async () => {
    const { error } = await supabase.from("products").select("real_map").limit(1);
    if (error && /column|does not exist/i.test(error.message)) {
      console.warn("[SETUP REQUIRED] Supabase products 테이블에 real_map 컬럼이 없습니다.");
      console.warn("[SETUP REQUIRED] Supabase SQL Editor에서 실행하세요:");
      console.warn("  ALTER TABLE products ADD COLUMN IF NOT EXISTS \"real_map\" TEXT;");
    }
  })();

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@osanmegatown.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  }

  app.use(compression());
  app.use(express.json({ limit: "200mb" }));
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.use(schedulesRouter);
  app.use(staffRouter);
  app.use(settingsRouter);
  app.use(productsRouter);
  app.use(requestsRouter);
  app.use(mismatchesRouter);
  app.use(authRouter);
  app.use(notificationsRouter);
  app.use(leaveRouter);
  app.use(lunchRouter);
  app.use(reservationsRouter);
  app.use(vendorsRouter);
  app.use(ocrRouter);
  app.use(stockCountRouter);
  app.use(stockArrivalsRouter);
  app.use(zoneAssignmentsRouter);
  app.use(supplierBalanceConfigRouter);
  app.use(ocrConfirmedRouter);

  // /products.json — 항상 DB에서 동적으로 제공 (브라우저 캐시 없음, 서버 메모리 캐시만 사용)
  app.get("/products.json", async (_req, res) => {
    try {
      const map = await getProductMap();
      res.setHeader("Cache-Control", "no-cache");
      res.json(map);
    } catch (err: any) {
      console.error("[products.json] error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  loadStockCountModel();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
