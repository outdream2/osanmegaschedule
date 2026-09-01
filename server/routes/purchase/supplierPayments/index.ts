// supplierPayments/index.ts — 배럴 re-export
// 원본 supplierPayments.ts 1009줄 → 서브파일로 분리
import { Router } from "express";

import paymentsRouter       from "./payments";
import balanceRouter        from "./balance";
import purchaseSummaryRouter from "./purchaseSummary";
import purchaseDetailRouter from "./purchaseDetail";

// splitVat re-export (외부 참조 대비)
export { splitVat } from "./helpers";

const router = Router();
router.use(paymentsRouter);
router.use(balanceRouter);
router.use(purchaseSummaryRouter);
router.use(purchaseDetailRouter);

export default router;
