// server.ts
import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import compression from "compression";
import cookieParser from "cookie-parser";
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
// 2026-08-04 · 사용자 요청 · 재고세기(YOLO) 일단 주석처리 · OOM 방어 (T39)
// import stockCountRouter  from "./server/routes/stockCount";
import stockManageRouter from "./server/routes/stockManage";
import purchaseRouter    from "./server/routes/purchase";
import stockArrivalsRouter from "./server/routes/stockArrivals";
import productArrivalsRouter from "./server/routes/productArrivals";
import returnRequestsRouter from "./server/routes/returnRequests";
import zoneLabelsRouter from "./server/routes/zoneLabels";
import zoneAssignmentsRouter from "./server/routes/zoneAssignments";
import supplierBalanceConfigRouter from "./server/routes/supplierBalanceConfig";
import supplierPaymentsRouter from "./server/routes/supplierPayments";
import ocrConfirmedRouter from "./server/routes/ocrConfirmed";
import { ocrDeletedRowsRouter } from "./server/routes/ocrDeletedRows";
import boardRouter from "./server/routes/board";
import invoiceImagesRouter from "./server/routes/invoiceImages";
import purchaseHistoryRouter from "./server/routes/purchaseHistory";
import hrFormsRouter from "./server/routes/hrForms";
import pharmacistMenuItemsRouter from "./server/routes/pharmacistMenuItems";
import resignationsRouter from "./server/routes/resignations";
import employeeContractsRouter from "./server/routes/employeeContracts";
import vatRouter from "./server/routes/vat";
// 2026-07-28 · 재고·판매 통합 메뉴 제거 (사용자 요청) · 파일 보관 · 라우터 등록만 해제
// import inventorySalesRouter from "./server/routes/inventorySales";
// 2026-08-04 · 사용자 요청 · 재고세기(YOLO) 주석처리 · loadStockCountModel 도 비활성 (T39)
// import { loadStockCountModel } from "./server/stockCounter";
import { cleanupStaleLogs } from "./server/utils/logsCleanup";
import { requireAuth, authorize } from "./server/middleware/requireAuth";

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
  // 2026-07-20: env 분기 제거 · 로컬↔Render 통일 · 페이지마다 dispose+gc 로 peak 안전
  //   100MB 는 다중 페이지 base64 배치를 충분히 허용하면서 Render OOM 도 피하는 절충치
  app.use(express.json({ limit: "100mb" }));
  // 2026-08-05 T3 · JWT httpOnly 쿠키 파싱
  app.use(cookieParser());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── 인증 불필요 (public) ──
  app.use(authRouter);            // /api/auth/* — 로그인·비밀번호 변경
  app.use(notificationsRouter);   // 푸시 알림 구독 (서비스워커)
  app.use(pharmacistMenuItemsRouter); // 약사 메뉴 표시 (공개 읽기)

  // ── 2026-08-05 T3 · 인증 필요 라우터 ──────────────────────────────────
  // Phase 1: 민감 라우터 우선 보호 (직원·스케줄·계약·급여·설정·HR)
  // Phase 2: 나머지 라우터도 순차 적용 예정 (후속 세션)

  // 직원·스케줄 (개인정보 + DELETE 포함)
  app.use(requireAuth, schedulesRouter);
  app.use(requireAuth, staffRouter);

  // 설정 (앱 전역 설정 변경)
  app.use(requireAuth, settingsRouter);

  // 공급사 결제·정산 (금전 데이터)
  app.use(requireAuth, supplierPaymentsRouter);
  app.use(requireAuth, supplierBalanceConfigRouter);

  // HR 서류 (근로계약서·사직서 등)
  app.use(requireAuth, hrFormsRouter);
  app.use(requireAuth, resignationsRouter);
  app.use(requireAuth, employeeContractsRouter);

  // OCR·매입 (사업 데이터)
  app.use(requireAuth, ocrRouter);
  app.use(requireAuth, ocrConfirmedRouter);
  app.use(ocrDeletedRowsRouter);    // Phase 2 예정
  app.use(requireAuth, purchaseRouter);
  app.use(requireAuth, purchaseHistoryRouter);
  app.use(requireAuth, invoiceImagesRouter);

  // 재고·상품
  app.use(requireAuth, stockManageRouter);
  app.use(requireAuth, stockArrivalsRouter);
  app.use(requireAuth, productArrivalsRouter);
  app.use(requireAuth, returnRequestsRouter);
  app.use(requireAuth, zoneLabelsRouter);
  app.use(requireAuth, zoneAssignmentsRouter);

  // 기타 (로그인 사용자 대상)
  app.use(requireAuth, productsRouter);
  app.use(requireAuth, requestsRouter);
  app.use(requireAuth, mismatchesRouter);
  app.use(requireAuth, leaveRouter);
  app.use(requireAuth, lunchRouter);
  app.use(requireAuth, reservationsRouter);
  app.use(requireAuth, vendorsRouter);
  app.use(requireAuth, boardRouter);
  app.use(requireAuth, vatRouter);
  // app.use(requireAuth, stockCountRouter); // 2026-08-04 · YOLO 비활성 (T39)
  // app.use(requireAuth, inventorySalesRouter);

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

  // loadStockCountModel(); // 2026-08-04 · YOLO 비활성 (T39 · OOM 방어)

  // T38 · 부팅 시 오래된 로그 파일 자동 정리 (14일 초과)
  cleanupStaleLogs();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
