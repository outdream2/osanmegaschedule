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

import schedulesRouter   from "./server/routes/schedule/schedules";
import staffRouter       from "./server/routes/staff/staff";
import settingsRouter    from "./server/routes/settings/settings";
import productsRouter    from "./server/routes/stock/products";
import requestsRouter    from "./server/routes/display/requests";
import mismatchesRouter  from "./server/routes/display/mismatches";
import authRouter        from "./server/routes/auth/auth";
import notificationsRouter from "./server/routes/board/notifications";
import leaveRouter       from "./server/routes/daily/leave";
import lunchRouter       from "./server/routes/daily/lunch";
import reservationsRouter from "./server/routes/daily/reservations";
import vendorsRouter     from "./server/routes/purchase/vendors";
import ocrRouter         from "./server/routes/ocr";
// 2026-08-05 · 재고세기(YOLO) 기능 완전 제거 · stockCount·stockCounter·stockCounterConfig 파일 삭제됨
import stockManageRouter from "./server/routes/stock/stockManage";
// 2026-08-06 · T-LOSS-HISTORY · 손실추적 (DiffTab) 날짜별 스냅샷·이력·집계
import lossTrackingRouter from "./server/routes/stock/lossTracking";
import purchaseRouter    from "./server/routes/purchase/purchase";
import stockArrivalsRouter from "./server/routes/stock/stockArrivals";
import productArrivalsRouter from "./server/routes/stock/productArrivals";
import returnRequestsRouter from "./server/routes/purchase/returnRequests";
import zoneLabelsRouter from "./server/routes/display/zoneLabels";
import zoneAssignmentsRouter from "./server/routes/display/zoneAssignments";
import supplierBalanceConfigRouter from "./server/routes/purchase/supplierBalanceConfig";
import supplierPaymentsRouter from "./server/routes/purchase/supplierPayments";
import ocrConfirmedRouter from "./server/routes/purchase/ocrConfirmed";
import { ocrDeletedRowsRouter } from "./server/routes/purchase/ocrDeletedRows";
import boardRouter from "./server/routes/board/board";
import invoiceImagesRouter from "./server/routes/purchase/invoiceImages";
import purchaseHistoryRouter from "./server/routes/purchase/purchaseHistory";
import hrFormsRouter from "./server/routes/staff/hrForms";
import pharmacistMenuItemsRouter from "./server/routes/board/pharmacistMenuItems";
import resignationsRouter from "./server/routes/staff/resignations";
import employeeContractsRouter from "./server/routes/staff/employeeContracts";
import contractClausesRouter from "./server/routes/staff/contractClauses";
import vatRouter from "./server/routes/purchase/vat";
// 2026-07-28 · 재고·판매 통합 메뉴 제거 (사용자 요청) · 파일 보관 · 라우터 등록만 해제
// import inventorySalesRouter from "./server/routes/inventorySales";
// (재고세기 loadStockCountModel · 위에서 함께 제거됨)
import { cleanupStaleLogs } from "./server/utils/logsCleanup";
// 2026-08-05 · T3 인증 미들웨어 · 사내 사용 중에는 미적용 (원복)
//   · Render 클라우드 배포 직전 · 별도 세션에서 재도입 예정 · docs/TASKS.md 참조
// import { requireAuth, authorize } from "./server/middleware/requireAuth";

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
  // 2026-08-05 T37 · DoS 방어 · 일반 API 는 10MB · 이미지 route 는 route-level 100MB
  //   body-parser 는 req._body 플래그로 재파싱 skip · 앞의 파서가 실행되면 뒤 파서는 자동 skip
  //   이미지·PDF·OCR 등 대용량 경로 를 먼저 100MB 로 파싱 · 나머지는 10MB 로 제한
  const largeJson = express.json({ limit: "100mb" });
  const LARGE_BODY_PATHS = [
    "/api/ocr",                    // OCR base64 이미지 배치
    "/api/invoice-images",         // 거래명세서 이미지 업로드
    "/api/hr-forms",               // HR 서류 이미지·PDF
    "/api/resignations",           // 사직서 서명 이미지
    "/api/board",                  // 게시판 이미지 첨부
    "/api/pharmacist-menu-items",  // 약사 자료 이미지
    "/api/employee-contracts",     // 근로계약서 서명·통장사본 이미지
    "/api/schedules",              // 스케줄 엑셀 대용량 (batch)
  ];
  for (const p of LARGE_BODY_PATHS) {
    app.use(p, largeJson);
  }
  app.use(express.json({ limit: "10mb" })); // 나머지 API · DoS 방어
  // 2026-08-05 T3 · JWT httpOnly 쿠키 파싱
  app.use(cookieParser());
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── 인증 불필요 (public) ──
  app.use(authRouter);            // /api/auth/* — 로그인·비밀번호 변경
  app.use(notificationsRouter);   // 푸시 알림 구독 (서비스워커)
  app.use(pharmacistMenuItemsRouter); // 약사 메뉴 표시 (공개 읽기)

  // ── 2026-08-05 · 인증 미들웨어 원복 (사내 사용 · 문제 발생으로 롤백) ──
  // Render 배포 직전 · 별도 세션에서 재도입 (docs/TASKS.md T3-defer)

  // 직원·스케줄 (개인정보 + DELETE 포함)
  app.use(schedulesRouter);
  app.use(staffRouter);

  // 설정 (앱 전역 설정 변경)
  app.use(settingsRouter);

  // 공급사 결제·정산 (금전 데이터)
  app.use(supplierPaymentsRouter);
  app.use(supplierBalanceConfigRouter);

  // HR 서류 (근로계약서·사직서 등)
  app.use(hrFormsRouter);
  app.use(resignationsRouter);
  app.use(employeeContractsRouter);
  app.use(contractClausesRouter);   // T-C · 근로계약서 각 호 CMS (서버 저장)

  // OCR·매입 (사업 데이터)
  app.use(ocrRouter);
  app.use(ocrConfirmedRouter);
  app.use(ocrDeletedRowsRouter);    // Phase 2 예정
  app.use(purchaseRouter);
  app.use(purchaseHistoryRouter);
  app.use(invoiceImagesRouter);

  // 재고·상품
  app.use(stockManageRouter);
  app.use(lossTrackingRouter);       // T-LOSS-HISTORY · 손실추적 이력
  app.use(stockArrivalsRouter);
  app.use(productArrivalsRouter);
  app.use(returnRequestsRouter);
  app.use(zoneLabelsRouter);
  app.use(zoneAssignmentsRouter);

  // 기타 (로그인 사용자 대상)
  app.use(productsRouter);
  app.use(requestsRouter);
  app.use(mismatchesRouter);
  app.use(leaveRouter);
  app.use(lunchRouter);
  app.use(reservationsRouter);
  app.use(vendorsRouter);
  app.use(boardRouter);
  app.use(vatRouter);
  // (재고세기 라우터 · 2026-08-05 파일 삭제됨)
  // app.use(inventorySalesRouter);

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

  // (loadStockCountModel · 2026-08-05 파일 삭제됨)

  // T38 · 부팅 시 오래된 로그 파일 자동 정리 (14일 초과)
  cleanupStaleLogs();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
