// ocr/ocr.ts — 배럴 파일 (기존 import 경로 유지)
// 원본 1771줄 → 서브라우터로 분리 · 이 파일은 re-export 전용
// server.ts 의 `import ocrRouter from "./server/routes/ocr/ocr"` 유지
export { default } from "./index";
