import React, { useCallback } from "react";
import { _zbarScan } from "./zbar";
import {
  toGrayContrast,
  sharpenGray,
  binarize,
  histoStretch,
  adaptiveThreshold,
  avgBrightness,
  horzBlur,
  padQuietZone,
  extractBarcodeDigits,
} from "./imageProcessing";

interface UseBarcodeScannerHandlersParams {
  scannedRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ocrWorkerRef: React.MutableRefObject<any>;
  imageInputRef: React.RefObject<HTMLInputElement>;
  setFlashing: React.Dispatch<React.SetStateAction<boolean>>;
  setFrozenFrame: React.Dispatch<React.SetStateAction<string | null>>;
  setScannedCode: React.Dispatch<React.SetStateAction<string | null>>;
  setTorchOn: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDecoding: React.Dispatch<React.SetStateAction<boolean>>;
  setScanKey: React.Dispatch<React.SetStateAction<number>>;
  setDarkHint: React.Dispatch<React.SetStateAction<boolean>>;
  onScan: (result: string) => void;
  onClose: () => void;
  scannedCode: string | null;
}

export function useBarcodeScannerHandlers({
  scannedRef,
  mountedRef,
  videoRef,
  canvasRef,
  ocrWorkerRef,
  imageInputRef,
  setFlashing,
  setFrozenFrame,
  setScannedCode,
  setTorchOn,
  setIsDecoding,
  setScanKey,
  setDarkHint,
  onScan,
  onClose,
  scannedCode,
}: UseBarcodeScannerHandlersParams) {
  const handleResult = useCallback((raw: string) => {
    if (scannedRef.current || !mountedRef.current) return;
    scannedRef.current = true;

    // Turn off torch on recognition
    if (mountedRef.current) setTorchOn(false);

    // Pause video to stop UI rendering overhead
    const video = videoRef.current as HTMLVideoElement | null;
    video?.pause();

    // Capture the scan-guide crop region directly from video so the barcode
    // fills the preview image (not lost in a full wide-angle frame).
    let frameUrl: string | null = null;
    if (video && video.videoWidth > 0) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const cx = Math.floor(vw * 0.08), cy = Math.floor(vh * 0.18);
      const cw = Math.floor(vw * 0.84), ch = Math.floor(vh * 0.64);
      const tc = document.createElement("canvas");
      tc.width = cw; tc.height = ch;
      const tctx = tc.getContext("2d");
      if (tctx) { tctx.drawImage(video, cx, cy, cw, ch, 0, 0, cw, ch); frameUrl = tc.toDataURL("image/jpeg", 0.92); }
    }
    if (!frameUrl) {
      const canvas = canvasRef.current;
      if (canvas && canvas.width > 0) frameUrl = canvas.toDataURL("image/jpeg", 0.92);
    }
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
    setIsDecoding(false);
    if (imageInputRef.current) imageInputRef.current.value = "";

    // Play video again
    const video = videoRef.current as HTMLVideoElement | null;
    video?.play().catch(() => {});

    setScanKey((k) => k + 1);
  }, []);

  // ── Static image decode (gallery / file picker) ────────────────────────────
  const handleImageDecode = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/") || scannedRef.current) return;
    if (mountedRef.current) setIsDecoding(true);

    const decode = async (data: ImageData): Promise<string | null> => {
      if (!_zbarScan) return null;
      try {
        const syms = await _zbarScan(data);
        return syms.length > 0 ? syms[0].decode() : null;
      } catch { return null; }
    };

    let code: string | null = null;
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      URL.revokeObjectURL(url);

      const w = img.naturalWidth, h = img.naturalHeight;
      const tc = document.createElement("canvas");
      tc.width = w; tc.height = h;
      const tctx = tc.getContext("2d", { willReadFrequently: true })!;
      tctx.drawImage(img, 0, 0);
      const imageDataUrl = tc.toDataURL("image/jpeg", 0.92);

      // 1. BarcodeDetector (native Android/Chrome — fastest)
      if ("BarcodeDetector" in window) {
        try {
          const bd = new (window as any).BarcodeDetector();
          const codes = await bd.detect(tc);
          if (codes.length) code = codes[0].rawValue;
        } catch {}
      }

      if (!code) {
        const full = tctx.getImageData(0, 0, w, h);
        code = await decode(full);
        if (!code) code = await decode(adaptiveThreshold(full, 31, 0.08));
        if (!code) code = await decode(adaptiveThreshold(full, 21, 0.05));
        const mu = avgBrightness(full);
        if (!code) code = await decode(toGrayContrast(full, 8, false, mu));
        if (!code) code = await decode(toGrayContrast(full, 10, false, mu));
        if (!code) code = await decode(toGrayContrast(full, 3));
        if (!code) code = await decode(sharpenGray(toGrayContrast(full, 2)));
        if (!code) code = await decode(binarize(toGrayContrast(full, 2, false, mu), 128));
        if (!code) code = await decode(histoStretch(full));

        // 2x upscale
        const up2 = document.createElement("canvas");
        up2.width = w * 2; up2.height = h * 2;
        const up2ctx = up2.getContext("2d", { willReadFrequently: true })!;
        up2ctx.drawImage(tc, 0, 0, w * 2, h * 2);
        const upFull = up2ctx.getImageData(0, 0, w * 2, h * 2);
        if (!code) code = await decode(upFull);
        const dynBlockUp = Math.floor((w * 2) * 0.05) | 1;
        if (!code) code = await decode(adaptiveThreshold(upFull, dynBlockUp, 0.08));
        const muUp = avgBrightness(upFull);
        if (!code) code = await decode(toGrayContrast(upFull, 8, false, muUp));
        // Horizontal blur passes for e-ink (static image)
        const blurUp = horzBlur(upFull, 2);
        if (!code) code = await decode(adaptiveThreshold(blurUp, dynBlockUp, 0.08));
        if (!code) code = await decode(padQuietZone(adaptiveThreshold(blurUp, dynBlockUp, 0.08), 40));

        // Brightened 2x
        up2ctx.filter = "brightness(2.5) contrast(1.3)";
        up2ctx.drawImage(tc, 0, 0, w * 2, h * 2);
        const upBright = up2ctx.getImageData(0, 0, w * 2, h * 2);
        up2ctx.filter = "none";
        if (!code) code = await decode(upBright);
        if (!code) code = await decode(adaptiveThreshold(upBright, 45, 0.06));
        const muBr = avgBrightness(upBright);
        if (!code) code = await decode(toGrayContrast(upBright, 8, false, muBr));
        if (!code) code = await decode(padQuietZone(adaptiveThreshold(horzBlur(upBright, 2), dynBlockUp, 0.08), 40));
      }

      // Quagga fallback
      if (!code) {
        const Quagga = (window as any).__quagga2;
        if (Quagga) {
          code = await new Promise<string | null>((res) => {
            Quagga.decodeSingle({
              src: imageDataUrl, numOfWorkers: 0,
              locator: { halfSample: false, patchSize: "medium" },
              decoder: { readers: ["ean_reader","ean_8_reader","code_128_reader","code_39_reader","upc_reader","upc_e_reader"] },
              locate: true,
            }, (r: any) => res(r?.codeResult?.code ?? null));
          });
        }
      }

      // OCR final fallback — reads the printed digit string below the barcode
      if (!code && ocrWorkerRef.current) {
        try {
          // Try full image first
          const { data: { text: t1 } } = await ocrWorkerRef.current.recognize(tc);
          code = extractBarcodeDigits(t1) ?? null;
          if (!code) {
            // Try lower half where barcode digits typically print
            const halfC = document.createElement("canvas");
            const hy = Math.floor(h * 0.6);
            halfC.width = w * 2; halfC.height = (h - hy) * 2;
            const hctx = halfC.getContext("2d");
            if (hctx) {
              hctx.filter = "grayscale(1) contrast(2.5) brightness(1.1)";
              hctx.drawImage(tc, 0, hy, w, h - hy, 0, 0, halfC.width, halfC.height);
              hctx.filter = "none";
              const { data: { text: t2 } } = await ocrWorkerRef.current.recognize(halfC);
              code = extractBarcodeDigits(t2) ?? null;
            }
          }
        } catch { /* OCR unavailable */ }
      }

      if (code && mountedRef.current && !scannedRef.current) {
        scannedRef.current = true;
        setFlashing(true);
        setTimeout(() => {
          if (!mountedRef.current) return;
          setFlashing(false);
          setFrozenFrame(imageDataUrl);
          setScannedCode(code!.trim());
        }, 220);
      } else if (mountedRef.current) {
        alert("바코드를 인식하지 못했습니다.\n더 선명하거나 가까이 찍은 이미지를 사용해주세요.");
      }
    } catch {
      if (mountedRef.current) alert("이미지를 불러오지 못했습니다.");
    } finally {
      if (mountedRef.current) setIsDecoding(false);
    }
  }, []);

  return { handleResult, handleConfirm, handleRetry, handleImageDecode };
}
