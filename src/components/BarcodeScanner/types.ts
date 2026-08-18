export interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  title?: string;
}

// ── BarcodeDetector format list (react-zxing v3 uses barcode-detector API) ────
export const FORMATS = [
  "ean_13", "ean_8", "code_128", "code_39", "code_93",
  "upc_a", "upc_e", "itf", "qr_code", "data_matrix", "codabar",
  "aztec", "pdf417",
] as const;

// ── Camera constraints ────────────────────────────────────────────────────────
// 2026-08-18 · B안 최소 constraints · iOS OverconstrainedError 방지
//   · focusMode/exposureMode/aspectRatio 모두 top-level 제거 (Android OverconstrainedError 유발)
//   · width/height 는 ideal 만 (min/max 없음 · 기기별 실패 방지)
//   · applyConstraints() 는 useCameraControls 에서 별도 처리
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width:  { ideal: 1920 },
  height: { ideal: 1080 },
};
