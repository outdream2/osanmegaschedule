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
// 720p: reduces per-frame pixel load (~half of 1080p), speeds up ZBar ticks
// and AF feedback loop. scaleFactor logic in useZBarLoop compensates if needed.
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width:  { min: 640, ideal: 1280, max: 1920 },
  height: { min: 480, ideal: 720,  max: 1080 },
  // @ts-ignore — non-standard but widely supported
  focusMode: "continuous",
  exposureMode: "continuous",
};
