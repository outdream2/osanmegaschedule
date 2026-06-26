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
// center=128 default; pass avgBrightness(src) as center for e-ink gray barcodes
function toGrayContrast(src: ImageData, factor: number, invert = false, center = 128): ImageData {
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const g = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    let v = Math.min(255, Math.max(0, (g - center) * factor + center));
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

// ── Adaptive threshold (integral image Sauvola) — best for e-ink/ESL barcodes ─
// Bars on e-ink are gray (~145) on light-gray background (~210). Global binarize
// fails. Local mean-based threshold handles the gray-on-gray contrast cleanly.
function adaptiveThreshold(src: ImageData, blockSize = 31, k = 0.08): ImageData {
  const w = src.width, h = src.height;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d4 = i * 4;
    gray[i] = 0.299 * src.data[d4] + 0.587 * src.data[d4 + 1] + 0.114 * src.data[d4 + 2];
  }
  // Build integral image (padded by 1 row/col for clean boundary math)
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      integral[(y + 1) * iw + (x + 1)] = gray[y * w + x]
        + integral[y * iw + (x + 1)]
        + integral[(y + 1) * iw + x]
        - integral[y * iw + x];
    }
  }
  const half = blockSize >> 1;
  const d = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * iw + (x1 + 1)]
                - integral[y0 * iw + (x1 + 1)]
                - integral[(y1 + 1) * iw + x0]
                + integral[y0 * iw + x0];
      const v = gray[y * w + x] < (sum / count) * (1 - k) ? 0 : 255;
      const idx = (y * w + x) * 4;
      d[idx] = d[idx + 1] = d[idx + 2] = v; d[idx + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
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
  const [scanKey,      setScanKey]     = useState(0);
  const [flashing,     setFlashing]    = useState(false);

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

    // Capture frame now (canvas may change before timeout fires)
    const canvas = canvasRef.current;
    const frameUrl = (canvas && canvas.width > 0) ? canvas.toDataURL("image/jpeg", 0.92) : null;
    const code = raw.trim();

    // Flash renders first; photo + code appear after flash peaks
    setFlashing(true);
    setTimeout(() => {
      setFlashing(false);
      if (frameUrl) setFrozenFrame(frameUrl);
      setScannedCode(code);
    }, 220);
  }, []);

  const handleConfirm = useCallback(() => {
    if (scannedCode) { onScan(scannedCode); onClose(); }
  }, [scannedCode, onScan, onClose]);

  const handleRetry = useCallback(() => {
    scannedRef.current = false;
    setFrozenFrame(null);
    setScannedCode(null);
    setDarkHint(false);
    setScanKey((k) => k + 1); // restarts all scan intervals via useEffect deps
  }, []);

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
          exposureCompensation: 2.0,
          brightness: 100,
        } as any],
      }).catch(() => {});
    } catch {}
  }, [torchOn, videoRef]);

  // ── Android auto-focus: trigger single-shot→continuous on stream start ───
  // Android Chrome often starts with fixed focus — needs an explicit AF kick.
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;

    const kickFocus = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;
      // Max exposure compensation from the start
      track.applyConstraints({
        advanced: [{ exposureMode: "continuous", exposureCompensation: 2.5 } as any],
      }).catch(() => {});
      // Single-shot resets AF, then continuous keeps it sharp
      track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as any] }).catch(() => {});
      setTimeout(() => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
      }, 600);
    };

    video.addEventListener("playing", kickFocus);
    // Fallback: also try 1.5 s after mount in case event already fired
    const t = setTimeout(kickFocus, 1500);
    return () => { video.removeEventListener("playing", kickFocus); clearTimeout(t); };
  }, [videoRef]);

  // ── Tap-to-focus: re-trigger AF on tap (essential on Android) ────────────
  const handleTapFocus = useCallback(() => {
    if (frozenFrame) return;
    const video = videoRef.current as HTMLVideoElement | null;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track) return;
    track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as any] }).catch(() => {});
    setTimeout(() => {
      track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
    }, 600);
  }, [frozenFrame, videoRef]);

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

      // Normal draw — main canvas stays clean for freeze-frame capture
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, w, h);

      // 1. Full frame — original (fast path for large, clear codes)
      const full = ctx.getImageData(0, 0, w, h);
      if (await tryZBar(full)) return;

      // Centre crop: matches scan guide box (inset-x-[8%] top-[18%] bottom-[18%])
      const cx = Math.floor(w * 0.08);
      const cy = Math.floor(h * 0.18);
      const cw = Math.floor(w * 0.84);
      const ch = Math.floor(h * 0.64);

      // 2. Crop — original
      const crop = ctx.getImageData(cx, cy, cw, ch);
      if (await tryZBar(crop)) return;

      const proc = procCanvasRef.current;
      let upscaled: ImageData | null = null;
      let upscaledBright: ImageData | null = null;

      if (proc) {
        const pc = proc.getContext("2d", { willReadFrequently: true });
        if (pc) {
          // 3. Crop — 3x upscaled normal (more pixels for thin e-ink label bars)
          proc.width  = cw * 3;
          proc.height = ch * 3;
          pc.filter = "none";
          pc.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * 3, ch * 3);
          upscaled = pc.getImageData(0, 0, cw * 3, ch * 3);
          if (await tryZBar(upscaled)) return;

          // ── E-ink / ESL: adaptive threshold on 3x upscaled ──────────────────
          // E-ink bars are gray (~145) on light gray (~210) — not true black/white.
          // adaptiveThreshold uses local mean so it's immune to the global gray offset.
          if (await tryZBar(adaptiveThreshold(upscaled, 45, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(upscaled, 25, 0.05))) return;
          // Mean-centered high contrast: center at image mean, factor=8 → bars→black
          const muUp = avgBrightness(upscaled);
          if (await tryZBar(toGrayContrast(upscaled, 8, false, muUp))) return;
          if (await tryZBar(toGrayContrast(upscaled, 10, false, muUp))) return;
          if (await tryZBar(binarize(toGrayContrast(upscaled, 8, false, muUp), 128))) return;

          // 4. Crop — 3x upscaled + brightness(2.5) contrast(1.3)
          // ctx.filter on drawImage affects actual getImageData pixels (unlike CSS filter on video)
          pc.filter = "brightness(2.5) contrast(1.3)";
          pc.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * 3, ch * 3);
          upscaledBright = pc.getImageData(0, 0, cw * 3, ch * 3);
          pc.filter = "none";
          if (await tryZBar(upscaledBright)) return;

          // 5. Crop — 3x upscaled + brightness(3.5) (dim / dark environments)
          pc.filter = "brightness(3.5) contrast(1.5)";
          pc.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw * 3, ch * 3);
          const upscaledMax = pc.getImageData(0, 0, cw * 3, ch * 3);
          pc.filter = "none";
          if (await tryZBar(upscaledMax)) return;

          // 6. Center of scan zone — extra-bright + 3x (tightest focus on barcode area)
          const ccx = Math.floor(w * 0.15);
          const ccy = Math.floor(h * 0.30);
          const ccw = Math.floor(w * 0.70);
          const cch = Math.floor(h * 0.40);
          proc.width  = ccw * 3;
          proc.height = cch * 3;
          pc.filter = "brightness(3) contrast(1.4)";
          pc.drawImage(canvas, ccx, ccy, ccw, cch, 0, 0, ccw * 3, cch * 3);
          const centerBright = pc.getImageData(0, 0, ccw * 3, cch * 3);
          pc.filter = "none";
          if (await tryZBar(centerBright)) return;

          // 7. Upscaled + high contrast
          if (upscaled && await tryZBar(toGrayContrast(upscaled, 3))) return;
          // 8. Upscaled bright + contrast + sharpen
          if (upscaledBright) {
            const gcBright = toGrayContrast(upscaledBright, 2);
            if (await tryZBar(sharpenGray(gcBright))) return;
            if (await tryZBar(binarize(gcBright, 128))) return;
            if (await tryZBar(binarize(gcBright, 100))) return;
            if (await tryZBar(binarize(gcBright, 160))) return;
            // E-ink on brightened upscale
            if (await tryZBar(adaptiveThreshold(upscaledBright, 45, 0.06))) return;
            const muBr = avgBrightness(upscaledBright);
            if (await tryZBar(toGrayContrast(upscaledBright, 8, false, muBr))) return;
          }

          // ── Rotation passes (curved / tilted barcodes on cylinders, bottles) ──
          // Put crop onto a temp canvas once; rotate proc canvas multiple ways.
          const rotSrc = document.createElement("canvas");
          rotSrc.width = cw; rotSrc.height = ch;
          rotSrc.getContext("2d")!.putImageData(crop, 0, 0);

          for (const deg of [12, -12, 24, -24, 36, -36]) {
            const rad = (deg * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
            const rw = Math.ceil(cw * cos + ch * sin);
            const rh = Math.ceil(cw * sin + ch * cos);
            proc.width = rw; proc.height = rh;
            pc.filter = "none";
            pc.save();
            pc.translate(rw / 2, rh / 2);
            pc.rotate(rad);
            pc.drawImage(rotSrc, -cw / 2, -ch / 2);
            pc.restore();
            const rotated = pc.getImageData(0, 0, rw, rh);
            if (await tryZBar(rotated)) return;
            if (await tryZBar(adaptiveThreshold(rotated, 31, 0.08))) return;
            if (await tryZBar(toGrayContrast(rotated, 3))) return;
          }
        }
      }

      // 9. Full frame — high contrast (dim screen barcodes)
      if (await tryZBar(toGrayContrast(full, 2.5))) return;

      // 10. Crop — strong contrast / inverted
      if (await tryZBar(toGrayContrast(crop, 4))) return;
      if (await tryZBar(toGrayContrast(crop, 3, true))) return;

      // E-ink passes on crop (fallback if proc canvas unavailable)
      if (await tryZBar(adaptiveThreshold(crop, 31, 0.08))) return;
      if (await tryZBar(adaptiveThreshold(crop, 19, 0.05))) return;
      const muCrop = avgBrightness(crop);
      if (await tryZBar(toGrayContrast(crop, 8, false, muCrop))) return;
      if (await tryZBar(toGrayContrast(crop, 10, true, muCrop))) return;

      // Paper-barcode passes (ESL price tags, printed stickers)
      const grayCrop = toGrayContrast(crop, 2);
      if (await tryZBar(sharpenGray(grayCrop))) return;
      if (await tryZBar(binarize(grayCrop, 128))) return;
      if (await tryZBar(binarize(grayCrop, 100))) return;
      if (await tryZBar(binarize(grayCrop, 160))) return;

      // Dark-environment passes (threshold broadened: avg < 120)
      const avg = avgBrightness(crop);
      setDarkHint(!torchOnRef.current && avg < 120);
      // Auto-enable torch when extremely dark (avg < 40) — user can turn off if unwanted
      if (avg < 40 && !torchOnRef.current) setTorchOn(true);
      if (avg < 120) {
        const gamma40 = brightenGamma(crop, 0.4);
        const gamma55 = brightenGamma(crop, 0.55);
        if (await tryZBar(gamma40)) return;
        if (await tryZBar(toGrayContrast(gamma40, 2.5))) return;
        if (await tryZBar(binarize(gamma40, 100))) return;
        if (await tryZBar(binarize(gamma40, 128))) return;
        if (await tryZBar(histoStretch(gamma55))) return;
        const stretched = histoStretch(toGrayContrast(crop, 1));
        if (await tryZBar(stretched)) return;
        if (await tryZBar(sharpenGray(stretched))) return;
      }

    }, 250);

    return () => clearInterval(intervalRef.current);
  }, [handleResult, videoRef, scanKey]);

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
      const cy = Math.floor(h * 0.18);
      const cw = Math.floor(w * 0.84);
      const ch = Math.floor(h * 0.64);

      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width  = cw;
      tmpCanvas.height = ch;
      const tmpCtx = tmpCanvas.getContext("2d");
      if (!tmpCtx) return;
      tmpCtx.filter = "brightness(2) contrast(1.3)";
      tmpCtx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
      tmpCtx.filter = "none";

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
  }, [quaggaReady, handleResult, videoRef, scanKey]);

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
  }, [ocrReady, handleResult, videoRef, scanKey]);

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
        <div
          className="relative bg-black cursor-pointer"
          style={{ aspectRatio: "4/3" }}
          onClick={handleTapFocus}
        >
          {/* Live video — hidden when frozen */}
          <video ref={videoRef} className={`w-full h-full object-cover ${frozenFrame ? "invisible" : ""}`} style={{ filter: "brightness(1.5)" }} autoPlay muted playsInline />

          {/* Snapshot confirmation overlay */}
          {frozenFrame && (
            <div className="absolute inset-0" style={{ animation: "photoSnap 0.28s ease-out forwards" }}>
              <img src={frozenFrame} alt="snap" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pt-10 pb-3 flex flex-col gap-2.5">
                <p className="text-white font-mono text-sm font-bold tracking-widest text-center drop-shadow-lg">{scannedCode}</p>
                <div className="flex gap-2.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-white/15 border border-white/30 active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                  >
                    다시 스캔
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 border border-emerald-500 active:scale-95 transition-transform shadow-lg cursor-pointer"
                  >
                    ✓ 확인
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shutter flash — always fires via state timing separation */}
          {flashing && (
            <div className="absolute inset-0 pointer-events-none" style={{ animation: "shutterFlash 0.35s ease-out forwards" }} />
          )}

          {/* Scan guide overlay (live only) */}
          {!frozenFrame && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-x-[8%] top-[18%] bottom-[18%]">
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
        <div className="px-4 py-3 text-center flex flex-col items-center gap-1.5">
          {darkHint && !torchOn ? (
            <button
              onClick={() => setTorchOn(true)}
              className="flex items-center gap-1.5 text-xs text-yellow-300 font-bold bg-yellow-400/15 border border-yellow-400/40 px-3 py-1.5 rounded-lg animate-pulse active:scale-95 transition-transform cursor-pointer"
            >
              <Zap size={12} /> 어둡습니다 — 여기를 눌러 손전등 켜기
            </button>
          ) : (
            <p className="text-xs text-gray-400 font-medium">바코드를 사각형 안에 맞춰주세요</p>
          )}
          <p className="text-[10px] text-gray-500">화면을 탭하면 초점 조정 · 종이 바코드는 5~10cm 거리</p>
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
        @keyframes photoSnap {
          0%   { opacity: 0; transform: scale(1.07); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes shutterFlash {
          0%   { background: rgba(255,255,255,0.95); }
          100% { background: rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
};
