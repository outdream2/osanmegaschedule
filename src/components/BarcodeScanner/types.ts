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
// focusMode / exposureMode must NOT be here — they are non-standard top-level
// getUserMedia constraints. On Android Chrome they cause OverconstrainedError
// which silently kills the stream (iOS ignores them, so only Android breaks).
// These are applied via applyConstraints() in useCameraControls instead.
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width:  { min: 640, ideal: 1920, max: 1920 },
  height: { min: 480, ideal: 1080, max: 1080 },
};
