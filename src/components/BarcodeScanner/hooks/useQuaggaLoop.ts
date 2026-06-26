import React, { useEffect } from "react";

interface UseQuaggaLoopParams {
  quaggaReady: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanKey: number;
  handleResult: (raw: string) => void;
  scannedRef: React.MutableRefObject<boolean>;
  quaggaCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

export function useQuaggaLoop({
  quaggaReady,
  videoRef,
  scanKey,
  handleResult,
  scannedRef,
  quaggaCanvasRef,
}: UseQuaggaLoopParams) {
  // ── Quagga2 (third engine — good at 1D codes on paper/screens) ───────────
  useEffect(() => {
    if (!quaggaReady) return;

    let active = true;

    async function tick() {
      if (!active || scannedRef.current) return;
      const Quagga = (window as any).__quagga2;
      if (!Quagga) {
        if (active) setTimeout(tick, 300);
        return;
      }

      const video = videoRef.current as HTMLVideoElement | null;
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        if (active) setTimeout(tick, 300);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;

      const cx = Math.floor(w * 0.08);
      const cy = Math.floor(h * 0.18);
      const cw = Math.floor(w * 0.84);
      const ch = Math.floor(h * 0.64);

      const tmpCanvas = quaggaCanvasRef.current;
      if (!tmpCanvas) {
        if (active) setTimeout(tick, 300);
        return;
      }
      tmpCanvas.width  = cw;
      tmpCanvas.height = ch;
      const tmpCtx = tmpCanvas.getContext("2d");
      if (!tmpCtx) {
        if (active) setTimeout(tick, 300);
        return;
      }
      tmpCtx.filter = "brightness(2) contrast(1.3)";
      tmpCtx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch);
      tmpCtx.filter = "none";

      try {
        await new Promise<void>((resolve) => {
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
              if (result?.codeResult?.code && active && !scannedRef.current) {
                handleResult(result.codeResult.code);
              }
              resolve();
            },
          );
        });
      } catch {
        /* Quagga error — other engines continue */
      }

      if (active && !scannedRef.current) {
        setTimeout(tick, 300);
      }
    }

    setTimeout(tick, 300);

    return () => {
      active = false;
    };
  }, [quaggaReady, handleResult, videoRef, scanKey]);
}
