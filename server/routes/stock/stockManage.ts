// 2026-09-01 · P1 대형 파일 분리 · 각 endpoint 를 stockManage/ 서브 디렉토리로 분리
// 이 파일은 하위 호환 re-export 레이어로만 사용 (기존 import 경로 유지)
// 실제 구현: server/routes/stock/stockManage/index.ts + 각 서브 파일

export { default, clearOcrAggCache, clearLowStockCache, clearSalesTrendCache } from "./stockManage/index";
