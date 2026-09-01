// ocr/index.ts — 배럴 re-export (기존 import 경로 유지)
// 원본 ocr.ts 의 모든 endpoint 를 서브라우터로 분리 후 결합
import { Router } from "express";

import matchRouter          from "./matchRouter";
import synonymsRouter       from "./synonymsRouter";
import aliasesRouter        from "./aliasesRouter";
import templatesRouter      from "./templatesRouter";
import coreRouter           from "./coreRouter";
import parseRouter          from "./parseRouter";
import diagRouter           from "./diagRouter";
import supplierBalancesRouter from "./supplierBalancesRouter";

const router = Router();
router.use(matchRouter);
router.use(synonymsRouter);
router.use(aliasesRouter);
router.use(templatesRouter);
router.use(coreRouter);
router.use(parseRouter);
router.use(diagRouter);
router.use(supplierBalancesRouter);

export default router;
