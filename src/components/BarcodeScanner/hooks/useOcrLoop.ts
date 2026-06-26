import React, { useEffect } from "react";
import { extractBarcodeDigits } from "../imageProcessing";

interface UseOcrLoopParams {
  ocrReady: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanKey: number;
  handleResult: (raw: string) => void;
  scannedRef: React.MutableRefObject<boolean>;
  ocrWorkerRef: React.MutableRefObject<any>;
  ocrCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function useOcrLoop({
  ocrReady,
  videoRef,
  scanKey,
  handleResult,
  scannedRef,
  ocrWorkerRef,
  ocrCanvasRef,
}: UseOcrLoopParams) {
  // ── Tesseract OCR (final fallback — reads printed digit string on label) ──
  useEffect(() => {
    if (!ocrReady) return;

    let active = true;
    let ocrBusy = false;

    async function tick() {
      if (!active || scannedRef.current || ocrBusy || !ocrWorkerRef.current) return;
      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        if (active) setTimeout(tick, 1000);
        return;
      }

      ocrBusy = true;
      try {
        const w = video.videoWidth, h = video.videoHeight;
        const cx = Math.floor(w * 0.08), cy = Math.floor(h * 0.18);
        const cw = Math.floor(w * 0.84), ch = Math.floor(h * 0.64);

        const regions = [
          { sx: cx, sy: cy + Math.floor(ch * 0.65), sw: cw, sh: Math.floor(ch * 0.35) },
          { sx: cx, sy: cy, sw: cw, sh: ch },
        ];

        for (const r of regions) {
          if (scannedRef.current || !active) break;
          const scale = 2; // Reduce scale from 4 to 2 to minimize memory & processing load
          const oc = ocrCanvasRef.current;
          if (!oc) continue;
          oc.width = r.sw * scale; oc.height = r.sh * scale;
          const octx = oc.getContext("2d");
          if (!octx) continue;
          octx.filter = "grayscale(1) contrast(2.5) brightness(1.1)";
          octx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, oc.width, oc.height);
          octx.filter = "none";
          const { data: { text } } = await ocrWorkerRef.current.recognize(oc);
          const digits = extractBarcodeDigits(text);
          if (digits && !scannedRef.current && active) {
            handleResult(digits);
            break;
          }
        }
      } catch {
        /* OCR error */
      } finally {
        ocrBusy = false;
      }

      if (active && !scannedRef.current) {
        setTimeout(tick, 1200);
      }
    }

    setTimeout(tick, 1000);

    return () => {
      active = false;
    };
  }, [ocrReady, handleResult, videoRef, scanKey]);
}
