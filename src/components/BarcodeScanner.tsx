import React, { useCallback, useEffect, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { X, ScanLine, Zap, Flame } from "lucide-react";

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

// ── Sharpening: 3x3 convolution for edge enhancement ──────────────────────────
// Operates on already-grayscale ImageData (R=G=B). Crucial for paper barcodes
// where ink edges blur slightly during print + camera capture.
function sharpenGray(src: ImageData): ImageData {
  const w = src.width;
  const h = src.height;
  const s = src.data;
  const d = new Uint8ClampedArray(s.length);
  // Copy alpha + initial RGB (border pixels stay original)
  for (let i = 0; i < s.length; i++) d[i] = s[i];

  // kernel [0,-1,0,-1,5,-1,0,-1,0] — apply to interior pixels only
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const top    = s[i - w * 4];
      const left   = s[i - 4];
      const centre = s[i];
      const right  = s[i + 4];
      const bottom = s[i + w * 4];
      const v = Math.min(255, Math.max(0, 5 * centre - top - left - right - bottom));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── Binarization: pure black/white from grayscale ─────────────────────────────
function binarize(src: ImageData, threshold: number): ImageData {
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const v = src.data[i] >= threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Gamma correction — brightens dark frames (gamma < 1) ──────────────────────
// LUT-based for speed. gamma=0.4 turns pixel-30 → ~97, making dark barcodes visible.
// toGrayContrast crushes dark pixels to 0; this fixes that by lifting them first.
function brightenGamma(src: ImageData, gamma = 0.4): ImageData {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const g = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
    const v = lut[g];
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Histogram stretch — maps actual min-max to full 0-255 range ───────────────
// Robust to varying room brightness: always uses the full dynamic range available.
function histoStretch(src: ImageData): ImageData {
  let min = 255, max = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    const v = src.data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max <= min) return src;
  const scale = 255 / (max - min);
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const v = Math.round((src.data[i] - min) * scale);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Average brightness of ImageData (0–255) ───────────────────────────────────
function avgBrightness(src: ImageData): number {
  let sum = 0;
  const n = src.data.length / 4;
  for (let i = 0; i < src.data.length; i += 4)
    sum += 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
  return sum / n;
}

// ── OCR digit extraction: pull 8-14 digit sequences from Tesseract output ─────
function extractBarcodeDigits(text: string): string | null {
  const matches = text.replace(/\s/g, "").match(/\d{8,14}/g);
  return matches?.[0] ?? null;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = "바코드 스캔",
}) => {
  const scannedRef    = useRef(false);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval>>();
  const quaggaIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const ocrIntervalRef    = useRef<ReturnType<typeof setInterval>>();
  const ocrWorkerRef      = useRef<any>(null);
  const torchOnRef        = useRef(false);

  const [zbarReady,    setZbarReady]   = useState(!!_zbarScan);
  const [quaggaReady,  setQuaggaReady] = useState(false);
  const [ocrReady,     setOcrReady]    = useState(false);
  const [torchOn,      setTorchOn]     = useState(false);
  const [frozenFrame,  setFrozenFrame] = useState<string | null>(null);
  const [scannedCode,  setScannedCode] = useState<string | null>(null);
  const [darkHint,     setDarkHint]    = useState(false);

  // Load ZBar eagerly; create offscreen proc canvas
  useEffect(() => {
    loadZBar().then(() => setZbarReady(!!_zbarScan));
    procCanvasRef.current = document.createElement("canvas");
  }, []);

  // ── Quagga2 lazy load ────────────────────────────────────────────────────────
  useEffect(() => {
    import("@ericblade/quagga2")
      .then((mod) => {
        const Quagga = (mod as any).default ?? mod;
        (window as any).__quagga2 = Quagga;
        setQuaggaReady(true);
      })
      .catch(() => { /* Quagga unavailable, ZXing+ZBar still run */ });
  }, []);

  // ── Tesseract OCR worker initialization (lazy, once) ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, {
          workerBlobURL: false,
          logger: () => {},
        } as any);
        await worker.setParameters({ tessedit_char_whitelist: "0123456789" } as any);
        if (!cancelled) {
          ocrWorkerRef.current = worker;
          setOcrReady(true);
        } else {
          await worker.terminate();
        }
      } catch {
        /* OCR unavailable — barcode engines still handle scanning */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleResult = useCallback((raw: string) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    clearInterval(intervalRef.current);
    clearInterval(quaggaIntervalRef.current);
    clearInterval(ocrIntervalRef.current);

    // ZBar interval already drew the last frame onto canvasRef — reuse it
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 0) {
      setFrozenFrame(canvas.toDataURL("image/jpeg", 0.8));
    }
    setScannedCode(raw.trim());
    setTimeout(() => onScan(raw.trim()), 1500);
  }, [onScan]);

  // ── ZXing via react-zxing (primary — fast on clear codes) ─────────────────
  const { ref: videoRef } = useZxing({
    onDecodeResult(result) { handleResult(result.rawValue); },
    constraints:                   { video: VIDEO_CONSTRAINTS },
    formats:                       FORMATS as unknown as Parameters<typeof useZxing>[0]["formats"],
    trySkew:                       true,
    timeBetweenDecodingAttempts:   150,
  });

  // Keep torchOnRef in sync for use inside intervals (avoids stale closure)
  useEffect(() => { torchOnRef.current = torchOn; }, [torchOn]);

  // ── Torch (flashlight) toggle — biggest single quality boost for paper ────
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      track.applyConstraints({
        advanced: [{
          torch: torchOn,
          exposureCompensation: 2.0,  // hint: prefer brighter exposure in dark rooms
          brightness: 100,
        } as any],
      }).catch(() => { /* unsupported on this device */ });
    } catch { /* unsupported */ }
  }, [torchOn, videoRef]);

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

      // ── Paper-barcode focused passes (ESL price tags, printed stickers) ──
      // 8. Crop — gray+contrast then sharpening (edge enhancement on thin ink bars)
      const grayCrop = toGrayContrast(crop, 2);
      if (await tryZBar(sharpenGray(grayCrop))) return;

      // 9. Crop — binarized at mid threshold (normal printed paper)
      if (await tryZBar(binarize(grayCrop, 128))) return;

      // 10. Crop — binarized low threshold (dim / dark ink underexposed)
      if (await tryZBar(binarize(grayCrop, 100))) return;

      // 11. Crop — binarized high threshold (bright / overexposed paper)
      if (await tryZBar(binarize(grayCrop, 160))) return;

      // ── Dark-environment passes (avg brightness < 80) ──────────────────────
      const avg = avgBrightness(crop);
      setDarkHint(!torchOnRef.current && avg < 70);
      if (avg < 80) {
        const gamma40 = brightenGamma(crop, 0.4);   // aggressive lift
        const gamma55 = brightenGamma(crop, 0.55);  // moderate lift
        // 12. Gamma 0.4 — raw lifted
        if (await tryZBar(gamma40)) return;
        // 13. Gamma 0.4 + high contrast (substitute for toGrayContrast on dark img)
        if (await tryZBar(toGrayContrast(gamma40, 2.5))) return;
        // 14. Gamma 0.4 + binarize (ink-on-dark-paper)
        if (await tryZBar(binarize(gamma40, 100))) return;
        if (await tryZBar(binarize(gamma40, 128))) return;
        // 15. Gamma 0.55 + histogram stretch (room with mixed lighting)
        if (await tryZBar(histoStretch(gamma55))) return;
        // 16. Histogram stretch alone (maximize whatever contrast exists)
        const stretched = histoStretch(toGrayContrast(crop, 1));
        if (await tryZBar(stretched)) return;
        if (await tryZBar(sharpenGray(stretched))) return;
      }

    }, 250);

    return () => clearInterval(intervalRef.current);
  }, [handleResult, videoRef]);

  // ── Quagga2 (third engine — good at 1D codes on paper/screens) ───────────
  useEffect(() => {
    if (!quaggaReady) return;

    quaggaIntervalRef.current = setInterval(() => {
      if (scannedRef.current) return;
      const Quagga = (window as any).__quagga2;
      if (!Quagga) return;

      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const w = video.videoWidth;
      const h = video.videoHeight;

      const cx = Math.floor(w * 0.08);
      const cy = Math.floor(h * 0.25);
      const cw = Math.floor(w * 0.84);
      const ch = Math.floor(h * 0.50);

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width  = cw;
      tmpCanvas.height = ch;
      const tmpCtx = tmpCanvas.getContext("2d");
      if (!tmpCtx) return;
      tmpCtx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);

      try {
        Quagga.decodeSingle(
          {
            src: tmpCanvas.toDataURL("image/jpeg", 0.92),
            numOfWorkers: 0,
            locator: {
              halfSample: false,
              patchSize: "medium",
            },
            decoder: {
              readers: [
                "ean_reader",
                "ean_8_reader",
                "code_128_reader",
                "code_39_reader",
                "upc_reader",
                "upc_e_reader",
              ],
            },
            locate: true,
          },
          (result: any) => {
            if (result?.codeResult?.code) {
              handleResult(result.codeResult.code);
            }
          },
        );
      } catch {
        /* Quagga error — other engines continue */
      }
    }, 300);

    return () => clearInterval(quaggaIntervalRef.current);
  }, [quaggaReady, handleResult, videoRef]);

  // ── Tesseract OCR (final fallback — reads printed digit string on label) ──
  useEffect(() => {
    if (!ocrReady) return;

    let ocrBusy = false;

    ocrIntervalRef.current = setInterval(async () => {
      if (scannedRef.current || ocrBusy || !ocrWorkerRef.current) return;
      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      ocrBusy = true;
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;

        // Bottom strip of the scan window where printed digits live
        const cx = Math.floor(w * 0.08);
        const cy = Math.floor(h * 0.60);
        const cw = Math.floor(w * 0.84);
        const ch = Math.floor(h * 0.15);

        const ocrCanvas = document.createElement("canvas");
        ocrCanvas.width  = cw * 2;
        ocrCanvas.height = ch * 2;
        const ocrCtx = ocrCanvas.getContext("2d");
        if (!ocrCtx) return;
        ocrCtx.drawImage(video, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);

        const { data: { text } } = await ocrWorkerRef.current.recognize(ocrCanvas);
        const digits = extractBarcodeDigits(text);
        if (digits) {
          handleResult(digits);
        }
      } catch {
        /* OCR error — barcode engines still handle scanning */
      } finally {
        ocrBusy = false;
      }
    }, 800);

    return () => clearInterval(ocrIntervalRef.current);
  }, [ocrReady, handleResult, videoRef]);

  // Cleanup OCR worker on unmount
  useEffect(() => {
    return () => {
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate().catch(() => {});
        ocrWorkerRef.current = null;
      }
    };
  }, []);

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
            {/* Engine indicators */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700 text-emerald-400 text-[10px] font-bold">
                <Zap size={9} />ZXing
              </div>
              {zbarReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700 text-blue-400 text-[10px] font-bold">
                  <Zap size={9} />ZBar
                </div>
              )}
              {quaggaReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-700 text-amber-400 text-[10px] font-bold">
                  <Zap size={9} />Q2
                </div>
              )}
              {ocrReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-700 text-purple-400 text-[10px] font-bold">
                  <Zap size={9} />OCR
                </div>
              )}
            </div>
            <button
              onClick={() => setTorchOn((v) => !v)}
              title={torchOn ? "손전등 끄기" : "손전등 켜기"}
              className={`p-1 rounded-md transition cursor-pointer ${
                torchOn
                  ? "text-yellow-400 bg-yellow-400/10 hover:text-yellow-300"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              <Zap size={16} />
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Camera / Freeze frame */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {/* Live video — hidden when frozen */}
          <video ref={videoRef} className={`w-full h-full object-cover ${frozenFrame ? "invisible" : ""}`} autoPlay muted playsInline />

          {/* Frozen frame + success overlay */}
          {frozenFrame && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <img src={frozenFrame} className="w-full h-full object-cover" alt="scan" />
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 text-white fill-none stroke-white stroke-[2.5] stroke-linecap-round stroke-linejoin-round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-white font-black text-sm tracking-wider">인식 완료</p>
                <p className="text-emerald-300 font-mono text-xs px-3 py-1 bg-black/40 rounded-lg">{scannedCode}</p>
              </div>
            </div>
          )}

          {/* Scan guide overlay (live only) */}
          {!frozenFrame && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-x-[8%] top-[25%] bottom-[25%]">
                <div className="absolute inset-0 bg-transparent" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
                {[
                  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
                  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
                  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
                  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-6 h-6 border-emerald-400 ${cls}`} />
                ))}
                <div className="absolute inset-x-0 h-0.5 bg-emerald-400/80" style={{ animation: "scanline 2s ease-in-out infinite" }} />
              </div>
            </div>
          )}

          {/* Hidden canvas for ZBar frame capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Hint */}
        <div className="px-4 py-3 text-center">
          {darkHint ? (
            <p className="text-xs text-yellow-400 font-bold animate-pulse">
              ⚡ 어둡습니다 — 오른쪽 상단 손전등을 켜주세요
            </p>
          ) : (
            <p className="text-xs text-gray-400 font-medium">바코드를 사각형 안에 맞춰주세요</p>
          )}
          <p className="text-[10px] text-gray-600 mt-0.5">종이 바코드는 5~10cm 거리에서 스캔해주세요</p>
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
