import { useEffect, useRef, useState } from "react";
import { _zbarScan, loadZBar } from "../zbar";

export function useEngineState() {
  const scannedRef    = useRef(false);
  const mountedRef    = useRef(true);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotSrcRef     = useRef<HTMLCanvasElement | null>(null);
  const quaggaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ocrCanvasRef  = useRef<HTMLCanvasElement | null>(null);
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
  const [isDecoding,   setIsDecoding]  = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load ZBar eagerly; create offscreen canvases; set mounted flag
  useEffect(() => {
    mountedRef.current = true;
    loadZBar().then(() => { if (mountedRef.current) setZbarReady(!!_zbarScan); });
    procCanvasRef.current = document.createElement("canvas");
    rotSrcRef.current    = document.createElement("canvas");
    quaggaCanvasRef.current = document.createElement("canvas");
    ocrCanvasRef.current = document.createElement("canvas");
    return () => { mountedRef.current = false; };
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
        const { createWorker } = await import(/* @vite-ignore */ "tesseract.js");
        const worker = await createWorker("eng", 1, {
          workerBlobURL: false,
          logger: () => {},
        } as any);
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789",
          tessedit_pageseg_mode: "11", // SPARSE_TEXT — best for scattered digit rows
        } as any);
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

  // Cleanup OCR worker on unmount
  useEffect(() => {
    return () => {
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate().catch(() => {});
        ocrWorkerRef.current = null;
      }
    };
  }, []);

  return {
    // refs
    scannedRef, mountedRef, canvasRef, procCanvasRef, rotSrcRef,
    quaggaCanvasRef, ocrCanvasRef, ocrWorkerRef, torchOnRef, imageInputRef,
    // state + setters
    zbarReady, setZbarReady,
    quaggaReady, setQuaggaReady,
    ocrReady, setOcrReady,
    torchOn, setTorchOn,
    frozenFrame, setFrozenFrame,
    scannedCode, setScannedCode,
    darkHint, setDarkHint,
    scanKey, setScanKey,
    flashing, setFlashing,
    isDecoding, setIsDecoding,
  };
}
