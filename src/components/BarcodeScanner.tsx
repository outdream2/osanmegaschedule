import React, { useCallback, useEffect, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { X, ScanLine, Zap } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  title?: string;
}

// ── ZBar WASM lazy singleton ───────────────────────────────────────────────────
type ZBarSym = { decode: () => string; typeName: string };
let _zbarScan: ((data: ImageData) => Promise<ZBarSym[]>) | null = null;
let _zbarPromise: Promise<void> | null = null;

function loadZBar(): Promise<void> {
  if (_zbarScan) return Promise.resolve();
  if (_zbarPromise) return _zbarPromise;
  _zbarPromise = import("@undecaf/zbar-wasm")
    .then((mod: any) => { _zbarScan = mod.scanImageData ?? mod.default?.scanImageData ?? null; })
    .catch(() => { /* fallback to ZXing only */ });
  return _zbarPromise;
}

// ── BarcodeDetector format list (react-zxing v3 uses barcode-detector API) ────
const FORMATS = [
  "ean_13", "ean_8", "code_128", "code_39", "code_93",
  "upc_a", "upc_e", "itf", "qr_code", "data_matrix", "codabar",
] as const;

// ── Camera constraints: high-res for better detail pickup ─────────────────────
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width:  { min: 640, ideal: 1920, max: 1920 },
  height: { min: 480, ideal: 1080, max: 1080 },
  // @ts-ignore — non-standard but widely supported
  focusMode: "continuous",
  exposureMode: "continuous",
};

// ── Image preprocessing: grayscale + contrast stretch ─────────────────────────
// Helps with e-ink/ESL price tags (low contrast, thin bars)
function toGrayContrast(src: ImageData, factor: number, invert = false): ImageData {
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const g = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    let v = Math.min(255, Math.max(0, (g - 128) * factor + 128));
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = "바코드 스캔",
}) => {
  const scannedRef    = useRef(false);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval>>();
  const [zbarReady, setZbarReady] = useState(!!_zbarScan);

  // Load ZBar eagerly when component mounts; create offscreen proc canvas
  useEffect(() => {
    loadZBar().then(() => setZbarReady(!!_zbarScan));
    procCanvasRef.current = document.createElement("canvas");
  }, []);

  const handleResult = useCallback((raw: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    clearInterval(intervalRef.current);
    onScan(raw.trim());
  }, [onScan]);

  // ── ZXing via react-zxing (primary — fast on clear codes) ─────────────────
  const { ref: videoRef } = useZxing({
    onDecodeResult(result) { handleResult(result.rawValue); },
    constraints:                   { video: VIDEO_CONSTRAINTS },
    formats:                       FORMATS as unknown as Parameters<typeof useZxing>[0]["formats"],
    trySkew:                       true,
    timeBetweenDecodingAttempts:   150,
  });

  // ── ZBar WASM (secondary — better for blurry/screen/e-ink barcodes) ───────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    async function tryZBar(data: ImageData): Promise<boolean> {
      if (!_zbarScan || scannedRef.current) return false;
      try {
        const syms = await _zbarScan!(data);
        if (syms.length > 0) { handleResult(syms[0].decode()); return true; }
      } catch {}
      return false;
    }

    intervalRef.current = setInterval(async () => {
      if (scannedRef.current || !_zbarScan) return;
      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);

      // 1. Full frame — original (fast path for large, clear codes)
      const full = ctx.getImageData(0, 0, w, h);
      if (await tryZBar(full)) return;

      // 2. Full frame — high contrast (helps with dim screen barcodes)
      if (await tryZBar(toGrayContrast(full, 2.5))) return;

      // Centre crop: matches scan guide box (inset-x-[8%] top-[25%] bottom-[25%])
      const cx = Math.floor(w * 0.08);
      const cy = Math.floor(h * 0.25);
      const cw = Math.floor(w * 0.84);
      const ch = Math.floor(h * 0.50);

      // 3. Crop — original
      const crop = ctx.getImageData(cx, cy, cw, ch);
      if (await tryZBar(crop)) return;

      // 4. Crop — 2x upscaled (gives ZBar more pixels for thin e-ink label bars)
      const proc = procCanvasRef.current;
      if (proc) {
        proc.width  = cw * 2;
        proc.height = ch * 2;
        const pc = proc.getContext("2d", { willReadFrequently: true });
        if (pc) {
          pc.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);
          const upscaled = pc.getImageData(0, 0, cw * 2, ch * 2);
          if (await tryZBar(upscaled)) return;
          // 5. Upscaled + high contrast (ESL/e-ink: low contrast + thin bars)
          if (await tryZBar(toGrayContrast(upscaled, 3))) return;
        }
      }

      // 6. Crop — strong contrast (e-ink price tag labels)
      if (await tryZBar(toGrayContrast(crop, 4))) return;

      // 7. Crop — inverted high contrast (white-on-dark label variants)
      if (await tryZBar(toGrayContrast(crop, 3, true))) return;

    }, 250);

    return () => clearInterval(intervalRef.current);
  }, [handleResult, videoRef]);

  // Esc key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2 text-white">
            <ScanLine size={15} className="text-emerald-400" />
            <span className="text-sm font-bold">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Engine indicator */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700 text-emerald-400 text-[10px] font-bold">
                <Zap size={9} />ZXing
              </div>
              {zbarReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700 text-blue-400 text-[10px] font-bold">
                  <Zap size={9} />ZBar
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Camera */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />

          {/* Dark overlay with hole */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-black/40" />
            {/* Scan window */}
            <div className="absolute inset-x-[8%] top-[25%] bottom-[25%]">
              {/* Clear area */}
              <div className="absolute inset-0 bg-transparent" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
              {/* Corner markers */}
              {[
                "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
                "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
                "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
                "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-emerald-400 ${cls}`} />
              ))}
              {/* Animated scan line */}
              <div
                className="absolute inset-x-0 h-0.5 bg-emerald-400/80"
                style={{ animation: "scanline 2s ease-in-out infinite" }}
              />
            </div>
          </div>

          {/* Hidden canvas for ZBar frame capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Hint */}
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400 font-medium">바코드를 사각형 안에 맞춰주세요</p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            가격표, 화면, 종이, 흐릿한 바코드도 인식됩니다
          </p>
        </div>
      </div>

      <style>{`
        @keyframes scanline {
          0%   { top: 4px;    opacity: 1; }
          48%  { opacity: 1; }
          50%  { top: calc(100% - 4px); opacity: 0.4; }
          52%  { opacity: 1; }
          100% { top: 4px;    opacity: 1; }
        }
      `}</style>
    </div>
  );
};
