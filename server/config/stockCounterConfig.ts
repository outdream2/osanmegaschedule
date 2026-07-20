/**
 * 재고세기 (Stock Counter) 통합 설정
 *
 * 2026-07-20: env/하드코딩 상수 분산 → 단일 config 파일로 통합.
 *   Python YOLO 서버 · Node ONNX 양쪽 모두 이 파일을 참조.
 */
export const stockCounterConfig = {
  // ── 모델 입력 ──────────────────────────────────────────────────────
  /** YOLO 입력 해상도 (640 = 표준 · SKU110K 는 1024~1280 이 권장 · 메모리 tradeoff) */
  inputSize: 640,
  /** 이미지 fit 모드
   *   "fill":    aspect 왜곡 · 정확도↓ · 좌표 매핑 단순 (레거시 기본)
   *   "contain": letterbox · aspect 유지 · 정확도↑ · 좌표 un-projection 필요 (권장) */
  fitMode: "contain" as "fill" | "contain",

  // ── 검출 임계값 ──────────────────────────────────────────────────
  /** Confidence 최소값 (0-1) · 낮을수록 더 많이 검출하지만 오탐 증가 */
  confThreshold: 0.25,
  /** NMS IoU 임계값 (0-1) · SKU110K 밀집 진열대는 0.5-0.6 권장 · 0.45 = 이웃 병합 위험 */
  iouThreshold: 0.5,

  // ── Python YOLO 서버 ──────────────────────────────────────────────
  /** Python YOLO 서버 URL */
  yoloServerUrl: "http://localhost:8002",
  /** Python YOLO 서버 시작 대기 최대 초 */
  yoloServerStartTimeoutSec: 30,
  /** 요청 timeout (ms) */
  detectRequestTimeoutMs: 60_000,
} as const;

export type StockCounterConfig = typeof stockCounterConfig;
