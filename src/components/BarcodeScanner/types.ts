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
// 2026-08-19 · iOS 17+ 침묵 실패 fix (html5-qrcode #846 · WebKit 179363)
//   · aspectRatio 제거 · iOS17+ 에서 stream negotiation 침묵 실패 유발
//   · 해상도 1280x720 로 축소 · 모바일에서 1920x1080 은 decode 비용 증가 · black video 유발
//   · facingMode ideal (exact 금지)
//   · focusMode/exposureMode top-level 금지 (Android OverconstrainedError)
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width:  { ideal: 1280 },
  height: { ideal: 720 },
};
