import React, { useEffect } from "react";
import { _zbarScan } from "../zbar";
import {
  toGrayContrast,
  sharpenGray,
  binarize,
  brightenGamma,
  histoStretch,
  adaptiveThreshold,
  vertDilate,
  avgBrightness,
  horzBlur,
  padQuietZone,
  vertBlur,
} from "../imageProcessing";

interface UseZBarLoopParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanKey: number;
  handleResult: (raw: string) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  procCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  rotSrcRef: React.MutableRefObject<HTMLCanvasElement | null>;
  mountedRef: React.MutableRefObject<boolean>;
  scannedRef: React.MutableRefObject<boolean>;
  torchOnRef: React.MutableRefObject<boolean>;
  setDarkHint: (v: boolean) => void;
}

const isAndroid = /android/i.test(navigator.userAgent);

export function useZBarLoop({
  videoRef,
  scanKey,
  handleResult,
  canvasRef,
  procCanvasRef,
  rotSrcRef,
  mountedRef,
  scannedRef,
  torchOnRef,
  setDarkHint,
}: UseZBarLoopParams) {
  // ── ZBar WASM (secondary — better for blurry/screen/e-ink barcodes) ───────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;

    // Android ML Kit BarcodeDetector — 싱글턴으로 1회만 생성.
    // 매 틱마다 new BarcodeDetector() 하면 ML Kit 초기화 비용이 누적되어 파이프라인 블로킹.
    let bdDetector: any = null;
    if (isAndroid && "BarcodeDetector" in window) {
      try {
        bdDetector = new (window as any).BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
        });
      } catch {}
    }

    async function tryZBar(data: ImageData): Promise<boolean> {
      if (!_zbarScan || scannedRef.current || !active) return false;
      try {
        const syms = await _zbarScan!(data);
        if (syms.length > 0) { handleResult(syms[0].decode()); return true; }
      } catch {}
      return false;
    }

    async function tick() {
      if (!active || scannedRef.current) return;
      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        if (active) setTimeout(tick, 250);
        return;
      }

      // ── Android ML Kit fast path (Google Play Services 경유, EAN-13 네이티브 지원) ─
      if (bdDetector) {
        try {
          const codes = await (bdDetector as any).detect(video);
          if (codes.length > 0 && active && !scannedRef.current) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            // 가이드 박스 안에 있는 바코드만 허용 (inset-x-[8%] top-[18%] bottom-[18%])
            // boundingBox 좌표는 videoWidth/videoHeight 기준 픽셀값.
            const hit = codes.find((c: any) => {
              if (!c.rawValue) return false;
              const box = c.boundingBox;
              if (!box || !vw || !vh) return true; // 좌표 정보 없으면 통과
              const cx = box.x + box.width / 2;
              const cy = box.y + box.height / 2;
              return cx >= vw * 0.08 && cx <= vw * 0.92 && cy >= vh * 0.18 && cy <= vh * 0.82;
            });
            if (hit) { handleResult(hit.rawValue); return; }
          }
        } catch {}
      }

      // ZBar WASM이 아직 로드 안 됐으면 250ms 후 재시도
      if (!_zbarScan) {
        if (active && !scannedRef.current) setTimeout(tick, 250);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas!.width  = w;
      canvas!.height = h;
      const ctx = canvas!.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        if (active) setTimeout(tick, 250);
        return;
      }

      // 안드로이드 크롬이 drawImage 시 경계를 회색으로 뭉개는 보간 차단.
      // EAN 바코드 선의 흑/백 경계가 칼같이 유지되어 ZBar 디코딩 정확도 향상.
      ctx.imageSmoothingEnabled = false;
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, w, h);

      // 1. Full frame — Android는 BarcodeDetector가 이미 전체 프레임을 커버하므로 생략.
      //    ZBar full-frame pass가 가이드 박스 밖 바코드를 잡는 오탐 방지.
      const full = ctx.getImageData(0, 0, w, h);
      if (!isAndroid && await tryZBar(full)) return;

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
          pc.imageSmoothingEnabled = false;
          // Dynamic scaleFactor: Target width around 800px.
          // For 1080p width (cw ~ 1612px), scaleFactor will be 1 (preventing 10M pixel memory load).
          // For low-res width (cw ~ 400px), scaleFactor will be 2.
          const scaleFactor = Math.max(1, Math.min(3, Math.floor(800 / cw)));

          proc.width  = cw * scaleFactor;
          proc.height = ch * scaleFactor;
          pc.filter = "none";
          pc.drawImage(canvas!, cx, cy, cw, ch, 0, 0, cw * scaleFactor, ch * scaleFactor);
          upscaled = pc.getImageData(0, 0, cw * scaleFactor, ch * scaleFactor);
          if (await tryZBar(upscaled)) return;

          // ── E-ink / ESL: adaptive threshold + dilation on upscaled ────────
          const dynBlock = Math.floor((cw * scaleFactor) * 0.05) | 1; // ~5% of upscaled width, odd
          if (await tryZBar(adaptiveThreshold(upscaled, dynBlock, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(upscaled, 25, 0.05))) return;

          // Dilation → adaptive threshold
          const dilated = vertDilate(upscaled, 2);
          if (await tryZBar(adaptiveThreshold(dilated, dynBlock, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(dilated, 31, 0.06))) return;

          const muUp = avgBrightness(upscaled);
          if (await tryZBar(toGrayContrast(upscaled, 8, false, muUp))) return;
          if (await tryZBar(toGrayContrast(upscaled, 10, false, muUp))) return;
          if (await tryZBar(toGrayContrast(dilated, 8, false, muUp))) return;
          if (await tryZBar(binarize(toGrayContrast(upscaled, 8, false, muUp), 128))) return;

          // Strategy A: horizontal blur (smooths dot grain) → THEN binarize
          const blurred = horzBlur(upscaled, 2);
          if (await tryZBar(blurred)) return;
          if (await tryZBar(adaptiveThreshold(blurred, dynBlock, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(blurred, 31, 0.06))) return;
          if (await tryZBar(adaptiveThreshold(vertDilate(blurred, 2), dynBlock, 0.08))) return;

          // Vertical blur (1×11 kernel) — closes gaps between column-stacked dots → THEN binarize
          const vblur = vertBlur(upscaled, 5);
          if (await tryZBar(adaptiveThreshold(vblur, dynBlock, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(vblur, 31, 0.06))) return;

          // Large vertical dilation
          const dilated5 = vertDilate(upscaled, 5);
          if (await tryZBar(adaptiveThreshold(dilated5, dynBlock, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(dilated5, 31, 0.06))) return;

          // Combined 2D smoothing: horzBlur + vertBlur → adaptiveThreshold
          const smoothed = vertBlur(blurred, 5);
          if (await tryZBar(adaptiveThreshold(smoothed, dynBlock, 0.08))) return;
          if (await tryZBar(padQuietZone(adaptiveThreshold(smoothed, dynBlock, 0.08), 40))) return;

          // Strategy C: quiet-zone padding on binarized result
          if (await tryZBar(padQuietZone(adaptiveThreshold(upscaled, dynBlock, 0.08), 40))) return;
          if (await tryZBar(padQuietZone(adaptiveThreshold(blurred, dynBlock, 0.08), 40))) return;
          if (await tryZBar(padQuietZone(adaptiveThreshold(dilated5, dynBlock, 0.08), 40))) return;

          // 4. Crop — upscaled + brightness(2.5) contrast(1.3)
          pc.filter = "brightness(2.5) contrast(1.3)";
          pc.drawImage(canvas!, cx, cy, cw, ch, 0, 0, cw * scaleFactor, ch * scaleFactor);
          upscaledBright = pc.getImageData(0, 0, cw * scaleFactor, ch * scaleFactor);
          pc.filter = "none";
          if (await tryZBar(upscaledBright)) return;

          // 5. Crop — upscaled + brightness(3.5)
          pc.filter = "brightness(3.5) contrast(1.5)";
          pc.drawImage(canvas!, cx, cy, cw, ch, 0, 0, cw * scaleFactor, ch * scaleFactor);
          const upscaledMax = pc.getImageData(0, 0, cw * scaleFactor, ch * scaleFactor);
          pc.filter = "none";
          if (await tryZBar(upscaledMax)) return;

          // 6. Center of scan zone
          const ccx = Math.floor(w * 0.15);
          const ccy = Math.floor(h * 0.30);
          const ccw = Math.floor(w * 0.70);
          const cch = Math.floor(h * 0.40);
          proc.width  = ccw * scaleFactor;
          proc.height = cch * scaleFactor;
          pc.filter = "brightness(3) contrast(1.4)";
          pc.drawImage(canvas!, ccx, ccy, ccw, cch, 0, 0, ccw * scaleFactor, cch * scaleFactor);
          const centerBright = pc.getImageData(0, 0, ccw * scaleFactor, cch * scaleFactor);
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
            if (await tryZBar(adaptiveThreshold(upscaledBright, 45, 0.06))) return;
            const muBr = avgBrightness(upscaledBright);
            if (await tryZBar(toGrayContrast(upscaledBright, 8, false, muBr))) return;
          }

          // ── Square crop passes
          const sq  = Math.min(cw, ch);
          const sqx = cx + Math.floor((cw - sq) / 2);
          const sqy = cy + Math.floor((ch - sq) / 2);
          proc.width = sq * 2; proc.height = sq * 2;
          pc.filter = "none";
          pc.drawImage(canvas!, sqx, sqy, sq, sq, 0, 0, sq * 2, sq * 2);
          const sqUp = pc.getImageData(0, 0, sq * 2, sq * 2);
          if (await tryZBar(sqUp)) return;
          pc.filter = "brightness(2) contrast(1.2)";
          pc.drawImage(canvas!, sqx, sqy, sq, sq, 0, 0, sq * 2, sq * 2);
          const sqUpBright = pc.getImageData(0, 0, sq * 2, sq * 2);
          pc.filter = "none";
          if (await tryZBar(sqUpBright)) return;
          if (await tryZBar(adaptiveThreshold(sqUp, 31, 0.08))) return;
          if (await tryZBar(adaptiveThreshold(sqUpBright, 31, 0.06))) return;

          // ── Rotation passes
          const rotSrc = rotSrcRef.current;
          if (rotSrc) {
            rotSrc.width = cw; rotSrc.height = ch;
            rotSrc.getContext("2d")!.putImageData(crop, 0, 0);

            // 안드로이드에서 세로로 들고 스캔할 때 90도 회전된 바코드를 인식하기 위해 직각 회전(90, -90)을 추가합니다.
            // 아이폰은 기본 센서 조향이 브라우저에서 보정되므로 부하 방지를 위해 제외합니다.
            const angles = isAndroid ? [90, -90, 15, -15, 30, -30] : [15, -15, 30, -30];
            for (const deg of angles) {
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
      }

      // 9. Full frame — high contrast
      if (await tryZBar(toGrayContrast(full, 2.5))) return;

      // 10. Crop — strong contrast / inverted
      if (await tryZBar(toGrayContrast(crop, 4))) return;
      if (await tryZBar(toGrayContrast(crop, 3, true))) return;

      // E-ink passes on crop
      if (await tryZBar(adaptiveThreshold(crop, 31, 0.08))) return;
      if (await tryZBar(adaptiveThreshold(crop, 19, 0.05))) return;
      const muCrop = avgBrightness(crop);
      if (await tryZBar(toGrayContrast(crop, 8, false, muCrop))) return;
      if (await tryZBar(toGrayContrast(crop, 10, true, muCrop))) return;

      // Paper-barcode passes
      const grayCrop = toGrayContrast(crop, 2);
      if (await tryZBar(sharpenGray(grayCrop))) return;
      if (await tryZBar(binarize(grayCrop, 128))) return;
      if (await tryZBar(binarize(grayCrop, 100))) return;
      if (await tryZBar(binarize(grayCrop, 160))) return;

      // Dark-environment passes
      const avg = avgBrightness(crop);
      if (mountedRef.current) setDarkHint(!torchOnRef.current && avg < 120);
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

      if (active && !scannedRef.current) {
        setTimeout(tick, 200);
      }
    }

    setTimeout(tick, 250);

    return () => {
      active = false;
    };
  }, [handleResult, videoRef, scanKey]);
}
