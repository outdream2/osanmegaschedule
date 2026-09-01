// supplierPayments.ts — 배럴 파일 (기존 import 경로 유지)
// 원본 1009줄 → 서브라우터로 분리 · 이 파일은 re-export 전용
// server.ts 의 `import supplierPaymentsRouter from ".../supplierPayments"` 유지
export { default, splitVat } from "./supplierPayments/index";
