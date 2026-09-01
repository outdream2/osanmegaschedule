// stockManage/index.ts — re-exports all sub-routers as a combined router
// External callers that import from "../stock/stockManage" will get the same exports:
//   · default export: combined router (same as before)
//   · clearOcrAggCache / clearLowStockCache / clearSalesTrendCache (named exports used by other routes)
import { Router } from "express";

// sub-routers
import topProductsRouter        from "./topProducts";
import supplierPurchasesRouter  from "./supplierPurchases";
import snapshotSummaryRouter    from "./snapshotSummary";
import salesTrendRouter         from "./salesTrend";
import topSalesRouter           from "./topSales";
import lowStockRouter           from "./lowStock";
import stockRawRouter           from "./stockRaw";
import productHistoryRouter     from "./productHistory";
import uploadStockRouter        from "./uploadStock";
import periodCoverageRouter     from "./periodCoverage";
import purchaseInfoBatchRouter  from "./purchaseInfoBatch";
import trendingRouter           from "./trending";

// re-export cache clear functions (imported by requests.ts and ocrConfirmed.ts)
export { clearOcrAggCache }     from "./helpers";
export { clearLowStockCache }   from "./helpers";
export { clearSalesTrendCache } from "./helpers";

const router = Router();
router.use(topProductsRouter);
router.use(supplierPurchasesRouter);
router.use(snapshotSummaryRouter);
router.use(salesTrendRouter);
router.use(topSalesRouter);
router.use(lowStockRouter);
router.use(stockRawRouter);
router.use(productHistoryRouter);
router.use(uploadStockRouter);
router.use(periodCoverageRouter);
router.use(purchaseInfoBatchRouter);
router.use(trendingRouter);

export default router;
