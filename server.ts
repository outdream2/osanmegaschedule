// server.ts
import "dotenv/config";
// 2026-08-12 · 테넌트별 env 오버라이드 (server/tenant.config.json)
//   dotenv 다음 · supabase client import 전에 로드 · process.env 를 파일 값으로 덮어씀
import { loadTenantConfig } from "./server/lib/tenantConfig";
loadTenantConfig();
// 2026-08-16 · 프레임워크 · 부팅 시 필수 env 검증 (미설정 시 fail-fast)
import { validateEnv } from "./server/lib/envValidation";
validateEnv();
import express from "express";
import http from "http";
import path from "path";
import compression from "compression";
import cookieParser from "cookie-parser";
// 2026-08-16 · #112-A · Helmet 보안 헤더 · #112-C · 로그인 rate-limit
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import webpush from "web-push";
import { createServer as createViteServer } from "vite";
import { supabase } from "./src/supabase/client";
import { getProductMap } from "./server/productCache";

import schedulesRouter   from "./server/routes/schedule/schedules";
import staffRouter       from "./server/routes/staff/staff";
import settingsRouter    from "./server/routes/settings/settings";
import systemConfigRouter from "./server/routes/settings/systemConfig";
import productsRouter    from "./server/routes/stock/products";
import requestsRouter    from "./server/routes/display/requests";
import mismatchesRouter  from "./server/routes/display/mismatches";
import authRouter        from "./server/routes/auth/auth";
import notificationsRouter from "./server/routes/board/notifications";
// 2026-08-16 · 프레임워크 · 클라이언트 에러 수집 (audit 통합)
import clientErrorsRouter from "./server/routes/board/clientErrors";
import leaveRouter       from "./server/routes/daily/leave";
import lunchRouter       from "./server/routes/daily/lunch";
import reservationsRouter from "./server/routes/daily/reservations";
import vendorsRouter     from "./server/routes/purchase/vendors";
import ocrRouter         from "./server/routes/ocr/ocr";
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
// 2026-08-09 · SolAPI 카카오 알림톡 · credentials 미설정 시 status 만 응답 · 향후 확장 (사용자 승인 후)
import { handleSolApiStatus } from "./server/lib/notification/solapiClient";
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
// 2026-08-06 · T-DualStorage-Connect · 5개 도메인 reference 값 조회
import referenceValuesRouter from "./server/routes/reference/referenceValues";
// 2026-07-28 · 재고·판매 통합 메뉴 제거 (사용자 요청) · 파일 보관 · 라우터 등록만 해제
// import inventorySalesRouter from "./server/routes/inventorySales";
// (재고세기 loadStockCountModel · 위에서 함께 제거됨)
import { cleanupStaleLogs } from "./server/utils/logsCleanup";
// 2026-08-16 · #112-G · requireAuth 재활성화 · 공개 라우터 순서 신중 배치
//   · public 라우터 (login·notifications·pharmacist·settings GET·referenceValues) 는 requireAuth 이전 마운트
//   · 이후 · 민감 라우터 (staff·contracts·payments·schedule 등) 는 requireAuth 로 자동 보호
//   · settings/systemConfig · GET public + POST authorize(9) · 내부 authorize 유지 · 이전 마운트
import { requireAuth } from "./server/middleware/requireAuth";
import { errorHandler } from "./server/middleware/errorHandler";

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

  // 2026-08-16 · #112-A · Helmet · HTTP 보안 헤더 (XSS · Clickjacking · MIME sniff 방어)
  //   · contentSecurityPolicy · false (SPA 동적 스크립트 · Vite HMR 호환 · 별도 CSP 정책은 다음 세션)
  //   · crossOriginEmbedderPolicy · false (Cloudinary/Supabase Storage 이미지 CORS 이슈 방지)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // 2026-08-16 · #112-C · 로그인 route · 무차별 대입 방어 (1분 10회)
  //   · vendor-login · change-password · set-password 도 함께 보호
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1분
    max: 10,                    // 10회
    standardHeaders: true,      // RateLimit-* 헤더
    legacyHeaders: false,
    message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    skipSuccessfulRequests: true, // 성공한 로그인은 카운트 X (사용자 편의)
  });

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

  // 2026-08-16 · #112-C · 로그인 무차별 대입 방어 · /api/auth/* 전체에 rate-limit 적용
  app.use("/api/auth", authLimiter);

  // ── 인증 불필요 (public) · requireAuth 이전 마운트 · 최소한만 ──
  app.use(authRouter);            // /api/auth/* · 로그인·비밀번호 변경 · rate-limit 이미 적용
  // 혼합 (GET public + POST 내부 authorize) · 랜딩/브랜드 로딩 필수
  app.use(settingsRouter);        // GET /api/permissions·settings (브랜드·연락처) · POST 는 내부 authorize(9)
  app.use(systemConfigRouter);    // GET /api/system-config · 내부 authorize(9)
  app.use(referenceValuesRouter); // GET /api/reference-values · 포지션/직급/근무지 (로그인 전에도 사용)

  // ── 2026-08-16 · #112-G · requireAuth 재활성화 · 아래 모든 /api/* 는 로그인 필수 ──
  //   · SPA 정적 자원 (/, /assets/*, /sw.js) · 미들웨어 내부 skip (path !startsWith("/api/"))
  //   · /products.json · /api 접두 없음 · 자동 통과
  //   · 이전에 public 이던 notifications·pharmacist-menu-items · POST/PATCH/DELETE 있으므로 · 안전을 위해 이 아래로 이동
  //   · 개별 세밀 레벨 필요 시 · 각 route 에 authorize(N) 추가 (다음 단계)
  app.use(requireAuth);

  // 알림·약사 메뉴 (로그인 필수로 이관)
  app.use(notificationsRouter);
  app.use(clientErrorsRouter);
  app.use(pharmacistMenuItemsRouter);

  // 직원·스케줄 (개인정보 + DELETE 포함)
  app.use(schedulesRouter);
  app.use(staffRouter);

  // 공급사 결제·정산 (금전 데이터)
  app.use(supplierPaymentsRouter);
  app.use(supplierBalanceConfigRouter);

  // 2026-08-09 · SolAPI 알림톡 상태 조회 · UI 배너용 (설정 필요 안내)
  app.get("/api/notification/solapi-status", handleSolApiStatus);

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
  app.use(referenceValuesRouter); // 2026-08-06 · T-DualStorage-Connect
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

  // 2026-08-16 · 프레임워크 · 전역 에러 핸들러 (last middleware)
  app.use(errorHandler);

  // T38 · 부팅 시 오래된 로그 파일 자동 정리 (14일 초과)
  cleanupStaleLogs();

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Megatown schedule service running on http://localhost:${PORT}`);
  });
}

startServer();
