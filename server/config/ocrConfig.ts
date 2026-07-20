/**
 * OCR 파이프라인 통합 설정
 *
 * 2026-07-20: Render env 분기(LOW_MEM/RENDER)로 인한 로컬↔배포 결과 차이 해결.
 *   Render 환경변수를 사용하지 않고 이 파일에서 모든 OCR 동작을 결정한다.
 *   로컬·Render·개발·프로덕션 어디서 실행하든 동일한 값이 나오도록 단일 소스.
 *
 * 값을 바꾸고 싶으면 이 파일을 직접 수정 후 재배포.
 */
export const ocrConfig = {
  // ── 이미지 전처리 ──────────────────────────────────────────────────
  /** 이미지 긴 변 최대 픽셀 (2200 = 로컬 기본 · 인식 품질 우선) */
  maxImageLongSide: 2200,
  /** JPEG 인코딩 품질 (1-100) */
  jpegQuality: 95,
  /** 짧은 변 1200px 미만 이미지 업스케일 활성화 */
  upscaleSmallImages: true,

  // ── OCR 엔진 ──────────────────────────────────────────────────────
  /** SLANet-plus 테이블 구조 인식 (PubTabNet TEDS 76+ · 격자표 95%) */
  useSlanet: true,
  /** TATR 사용 여부 (기본 OFF · SLANet 로 대체됨) */
  useTatr: false,
  /** DocLayout-YOLO 사용 여부 */
  useLayout: true,
  /** PP-OCR 모델 프리셋 */
  ocrModel: "v5_korean_mobile" as const,

  // ── 인식 부족 시 재시도 ───────────────────────────────────────────
  /** 재시도 방법 순서 (empty = 재시도 없음) */
  retryAttempts: ["대비강화", "90°", "180°", "270°"] as const,

  // ── 세션 관리 ──────────────────────────────────────────────────────
  /** 페이지마다 OCR/SLANet 세션 강제 dispose (true = 로컬↔Render 모두 안전 · 페이지당 1-2초 재로드 비용 감수) */
  //   Render 512MB 에서도 peak ~250MB (image + PP-OCR 200MB + SLANet 40MB) 로 안전
  //   dispose 안 하면 상주 300MB+ 로 Render OOM
  disposeSessionsPerPage: true,
  /** dispose 이후 명시적 global.gc() 호출 (--expose-gc 필요) */
  forceGcAfterDispose: true,

  // ── 진단 로그 ──────────────────────────────────────────────────────
  /** rawText 프리뷰 길이 (진단 응답에 포함될 문자 수) */
  logRawTextPreviewLength: 800,
  /** rows 프리뷰 개수 */
  logRowsPreviewCount: 5,
  /** 스테이지 진단 로그 응답 포함 */
  logStageDiagnostics: true,

  // ── 서버 요청 캐시 ────────────────────────────────────────────────
  /** rawText 캐시 최대 항목 수 (요청 간 재추출용) */
  rawCacheMax: 20,
  /** rawText 항목당 문자 캡 (Infinity = 무제한) */
  rawCacheTextCap: Infinity,

  // ── SLANet ONNX Runtime ───────────────────────────────────────────
  /** intraOpNumThreads */
  onnxIntraOpThreads: 2,
  /** graphOptimizationLevel */
  onnxGraphOptimizationLevel: "all" as "all" | "basic" | "extended" | "disabled",
} as const;

export type OcrConfig = typeof ocrConfig;
