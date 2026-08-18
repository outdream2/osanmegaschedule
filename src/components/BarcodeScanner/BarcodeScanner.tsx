// src/components/BarcodeScanner/BarcodeScanner.tsx
// 2026-08-18 · B안 · 직접 getUserMedia + 네이티브 BarcodeDetector (react-zxing 폐기)
//   · iOS/Android 모두 안정적 · 최소 constraints · gesture 스코프 안 트리거
//   · Native BarcodeDetector API (Android Chrome, Safari 17+) 우선
//   · ZBar/Quagga/OCR 루프 · fallback 그대로 유지 (같은 videoRef)
//   · 기존 UI · handlers.ts · zoom · torch 모두 보존

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, ScanLine, Zap, ImageIcon } from "lucide-react";
import type { BarcodeScannerProps } from "./types";
import { VIDEO_CONSTRAINTS } from "./types";
import { useEngineState } from "./hooks/useEngineState";
import { useCameraControls } from "./hooks/useCameraControls";
import { useZBarLoop } from "./hooks/useZBarLoop";
import { useQuaggaLoop } from "./hooks/useQuaggaLoop";
import { useOcrLoop } from "./hooks/useOcrLoop";
import { useBarcodeScannerHandlers } from "./handlers";

const isAndroid = /android/i.test(navigator.userAgent);
const isDesktop = !/android|iphone|ipad|ipod/i.test(navigator.userAgent);

// PC 웹캠 · facingMode 없이 요청
const DESKTOP_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width:  { ideal: 1280 },
  height: { ideal: 720 },
};

// Native BarcodeDetector · 지원 포맷 (Android Chrome + Safari 17+)
const NATIVE_FORMATS = [
  "ean_13", "ean_8", "code_128", "code_39", "code_93",
  "upc_a", "upc_e", "itf", "qr_code", "data_matrix", "codabar",
  "aztec", "pdf417",
] as const;

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = "바코드 스캔",
}) => {
  const state = useEngineState();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeDetectorRef = useRef<any>(null);
  const nativeRafRef = useRef<number | null>(null);

  // Android 기본 2x
  const [zoomLevel, setZoomLevel] = useState(isAndroid ? 2 : 1);

  // 카메라 상태 · UI 표시용
  const [cameraStatus, setCameraStatus] = useState<"init" | "playing" | "denied" | "notfound" | "failed">("init");
  const [errorDetail, setErrorDetail] = useState<string>("");

  // handleResult · ref로 최신 클로저 유지 (loops 에서 사용)
  const handleResultRef = useRef<(raw: string) => void>(() => {});

  // Handlers (beep · frozen frame · retry · image decode)
  const { handleResult, handleConfirm, handleRetry, handleImageDecode } =
    useBarcodeScannerHandlers({
      scannedRef: state.scannedRef,
      mountedRef: state.mountedRef,
      videoRef,
      canvasRef: state.canvasRef,
      ocrWorkerRef: state.ocrWorkerRef,
      imageInputRef: state.imageInputRef,
      setFlashing: state.setFlashing,
      setFrozenFrame: state.setFrozenFrame,
      setScannedCode: state.setScannedCode,
      setTorchOn: state.setTorchOn,
      setIsDecoding: state.setIsDecoding,
      setScanKey: state.setScanKey,
      setDarkHint: state.setDarkHint,
      onScan,
      onClose,
      scannedCode: state.scannedCode,
    });
  handleResultRef.current = handleResult;

  // ── 카메라 시작 · 직접 getUserMedia · 마운트 즉시 (gesture 스코프 안) ────────
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: isDesktop
            ? DESKTOP_VIDEO_CONSTRAINTS
            : (isAndroid && localStorage.getItem("android_best_camera_id"))
              ? { ...VIDEO_CONSTRAINTS, deviceId: { ideal: localStorage.getItem("android_best_camera_id")! } }
              : VIDEO_CONSTRAINTS,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          // iOS Safari · autoplay 정책 · 명시 play() (사용자 gesture 스코프 안이므로 성공)
          try { await v.play(); } catch { /* 무시 · loadedmetadata 이벤트에서 재시도 */ }
        }
        if (mounted) setCameraStatus("playing");
      } catch (err: any) {
        if (!mounted) return;
        const name = String(err?.name || "");
        const msg = String(err?.message || "");
        setErrorDetail(`${name}: ${msg}`);
        if (name === "NotAllowedError" || name === "SecurityError") setCameraStatus("denied");
        else if (name === "NotFoundError" || name === "DevicesNotFoundError") setCameraStatus("notfound");
        else setCameraStatus("failed");
      }
    };
    start();
    return () => {
      mounted = false;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
        streamRef.current = null;
      }
      if (nativeRafRef.current) {
        try { cancelAnimationFrame(nativeRafRef.current); } catch {}
        nativeRafRef.current = null;
      }
    };
  }, []);

  // ── Native BarcodeDetector 스캔 루프 (Android Chrome + Safari 17+) ──────────
  useEffect(() => {
    if (cameraStatus !== "playing") return;
    if (!("BarcodeDetector" in window)) return;
    if (state.frozenFrame) return;
    try {
      nativeDetectorRef.current = new (window as any).BarcodeDetector({
        formats: NATIVE_FORMATS,
      });
    } catch { return; }

    let running = true;
    const detectorTick = async () => {
      if (!running) return;
      if (state.scannedRef.current) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.paused) {
        nativeRafRef.current = requestAnimationFrame(detectorTick);
        return;
      }
      try {
        const codes = await nativeDetectorRef.current.detect(v);
        if (codes && codes.length > 0 && codes[0].rawValue) {
          handleResultRef.current(codes[0].rawValue);
          return;
        }
      } catch { /* silent · 다음 tick 재시도 */ }
      nativeRafRef.current = requestAnimationFrame(detectorTick);
    };
    detectorTick();

    return () => {
      running = false;
      if (nativeRafRef.current) {
        try { cancelAnimationFrame(nativeRafRef.current); } catch {}
        nativeRafRef.current = null;
      }
    };
  }, [cameraStatus, state.frozenFrame, state.scanKey]);

  // Camera controls (torch · AF · zoom) · Android 만 개입
  const handleTapFocus = useCameraControls({
    videoRef,
    torchOn: state.torchOn,
    setTorchOn: state.setTorchOn,
    torchOnRef: state.torchOnRef,
    mountedRef: state.mountedRef,
    frozenFrame: state.frozenFrame,
    zoomLevel,
  });

  // Fallback scan loops · Native 실패 시 대비 (같은 videoRef · 병렬 실행)
  useZBarLoop({
    videoRef,
    scanKey: state.scanKey,
    handleResult,
    canvasRef: state.canvasRef,
    procCanvasRef: state.procCanvasRef,
    rotSrcRef: state.rotSrcRef,
    mountedRef: state.mountedRef,
    scannedRef: state.scannedRef,
    torchOnRef: state.torchOnRef,
    setDarkHint: state.setDarkHint,
  });

  useQuaggaLoop({
    quaggaReady: state.quaggaReady,
    videoRef,
    scanKey: state.scanKey,
    handleResult,
    scannedRef: state.scannedRef,
    quaggaCanvasRef: state.quaggaCanvasRef,
  });

  useOcrLoop({
    ocrReady: state.ocrReady,
    videoRef,
    scanKey: state.scanKey,
    handleResult,
    scannedRef: state.scannedRef,
    ocrWorkerRef: state.ocrWorkerRef,
    ocrCanvasRef: state.ocrCanvasRef,
  });

  // ── beep 프리로드 · iOS Audio unlock ────────────────────────────────────────
  useEffect(() => {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        let ctx: AudioContext = (window as any).__beepAudioCtx;
        if (!ctx || (ctx as any).state === "closed") {
          ctx = new AC();
          (window as any).__beepAudioCtx = ctx;
        }
        if (ctx.state === "suspended") { try { ctx.resume(); } catch {} }
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {}
    try {
      const audio = new Audio("/beep.wav");
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1.0;
        (window as any).__beepAudio = audio;
      }).catch(() => {});
    } catch {}
  }, []);

  // ── Android 최적 카메라 재선택 · playing 후 1회 ────────────────────────────
  useEffect(() => {
    if (!isAndroid) return;
    if (cameraStatus !== "playing") return;
    const v = videoRef.current;
    if (!v) return;
    let done = false;

    const trySelect = async () => {
      if (done) return;
      done = true;
      const currentDeviceId = (v.srcObject as MediaStream | null)
        ?.getVideoTracks()[0]?.getSettings?.()?.deviceId;
      try {
        const cached = localStorage.getItem("android_best_camera_id");
        if (cached && currentDeviceId === cached) return;
      } catch {}
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === "videoinput" && d.label);
        if (inputs.length === 0) return;
        const backCams = inputs.filter(d => /back|rear|facing back/i.test(d.label));
        const pool = backCams.length > 0 ? backCams : inputs;
        const standard = pool.filter(d =>
          !/ultra.?wide|wide.?angle|telephoto|\btele\b|macro|\bdepth\b|\bir\b/i.test(d.label)
        );
        const best = (standard.length > 0 ? standard : pool)
          .sort((a, b) => a.label.localeCompare(b.label))[0];
        if (!best) return;
        try { localStorage.setItem("android_best_camera_id", best.deviceId); } catch {}
        if (currentDeviceId !== best.deviceId) {
          // 새 카메라로 재시작 · 기존 stream stop + 새 getUserMedia
          const old = streamRef.current;
          if (old) old.getTracks().forEach(t => { try { t.stop(); } catch {} });
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { ...VIDEO_CONSTRAINTS, deviceId: { ideal: best.deviceId } },
            });
            streamRef.current = stream;
            v.srcObject = stream;
            try { await v.play(); } catch {}
            setTimeout(() => state.setScanKey(k => k + 1), 400);
          } catch { /* 실패 시 · 기존 stream 없음 · UI 처리 */ }
        }
      } catch {}
    };
    // playing 상태 500ms 후 · label 노출 시간 확보
    const t = setTimeout(trySelect, 500);
    return () => { done = true; clearTimeout(t); };
  }, [cameraStatus, state.setScanKey]);

  // Esc key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // ── 재시도 · getUserMedia 재호출 · srcObject 재부착 ─────────────────────────
  const retryCamera = useCallback(async () => {
    setCameraStatus("init");
    setErrorDetail("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isDesktop ? true : { facingMode: "environment" },
      });
      const old = streamRef.current;
      if (old) old.getTracks().forEach(t => { try { t.stop(); } catch {} });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        try { await v.play(); } catch {}
      }
      setCameraStatus("playing");
      state.setScanKey(k => k + 1);
    } catch (err: any) {
      const name = String(err?.name || "");
      const msg = String(err?.message || "");
      setErrorDetail(`${name}: ${msg}`);
      if (name === "NotAllowedError" || name === "SecurityError") setCameraStatus("denied");
      else if (name === "NotFoundError" || name === "DevicesNotFoundError") setCameraStatus("notfound");
      else setCameraStatus("failed");
    }
  }, [state.setScanKey]);

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
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 gap-2">
          <div className="flex items-center gap-2 text-white shrink-0">
            <ScanLine size={15} className="text-emerald-400" />
            <span className="text-sm font-bold whitespace-nowrap">{title}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            <div className="flex items-center gap-1.5">
              {"BarcodeDetector" in window && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700 text-emerald-400 text-[10px] font-bold">
                  <Zap size={9} />Native
                </div>
              )}
              {state.zbarReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700 text-blue-400 text-[10px] font-bold">
                  <Zap size={9} />ZBar
                </div>
              )}
              {state.quaggaReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/60 border border-amber-700 text-amber-400 text-[10px] font-bold">
                  <Zap size={9} />Q2
                </div>
              )}
            </div>
            <button
              onClick={() => state.imageInputRef.current?.click()}
              title="갤러리에서 이미지 선택"
              className="p-1 rounded-md text-gray-500 hover:text-white transition cursor-pointer"
            >
              <ImageIcon size={16} />
            </button>
            <button
              onClick={() => state.setTorchOn((v) => !v)}
              title={state.torchOn ? "손전등 끄기" : "손전등 켜기"}
              className={`p-1 rounded-md transition cursor-pointer ${
                state.torchOn
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

        {/* Camera */}
        <div
          className="relative bg-black cursor-pointer"
          style={{ aspectRatio: isAndroid ? "16/9" : "4/3" }}
          onClick={handleTapFocus}
        >
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${state.frozenFrame ? "invisible" : ""}`}
            autoPlay
            muted
            playsInline
            // @ts-ignore · iOS 구형 Safari
            webkit-playsinline="true"
          />

          {/* Snapshot confirmation */}
          {state.frozenFrame && (
            <div className="absolute inset-0">
              <img src={state.frozenFrame} alt="snap" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pt-10 pb-3 flex flex-col gap-2.5">
                <p className="text-white font-mono text-sm font-bold tracking-widest text-center drop-shadow-lg">{state.scannedCode}</p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="px-3 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600/80 border border-rose-500 active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                    title="스캔 취소"
                  >✕ 취소</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-white/15 border border-white/30 active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                  >다시 스캔</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 border border-emerald-500 active:scale-95 transition-transform shadow-lg cursor-pointer"
                  >✓ 확인</button>
                </div>
              </div>
            </div>
          )}

          {/* Shutter flash */}
          {state.flashing && (
            <div className="absolute inset-0 pointer-events-none" style={{ animation: "shutterFlash 0.35s ease-out forwards" }} />
          )}

          {/* Scan guide */}
          {!state.frozenFrame && cameraStatus === "playing" && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-[8%] top-[18%] bottom-[18%]">
                <div className="absolute inset-0 bg-transparent" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)" }} />
                {[
                  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md",
                  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md",
                  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md",
                  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-6 h-6 border-emerald-400 ${cls}`} />
                ))}
                <div className="absolute inset-x-0 h-0.5 bg-red-500" style={{ animation: "scanline 2s ease-in-out infinite", boxShadow: "0 0 6px 1px rgba(239,68,68,0.8)" }} />
              </div>
            </div>
          )}

          {/* Android 줌 */}
          {isAndroid && !state.frozenFrame && cameraStatus === "playing" && (
            <div
              className="absolute bottom-2.5 inset-x-0 flex justify-center items-center gap-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {[1, 2, 3].map((z) => (
                <button
                  key={z}
                  onClick={() => setZoomLevel(z)}
                  className={`w-9 h-9 rounded-full text-[11px] font-bold border transition-all active:scale-90 cursor-pointer ${
                    zoomLevel === z
                      ? "bg-yellow-400/90 text-black border-yellow-300 shadow-lg"
                      : "bg-black/50 text-white border-white/30 backdrop-blur-sm"
                  }`}
                >{z}×</button>
              ))}
            </div>
          )}

          {/* 카메라 초기화 중 */}
          {cameraStatus === "init" && !state.frozenFrame && (
            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-9 h-9 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-xs font-medium tracking-wide">카메라 초기화...</p>
            </div>
          )}

          {/* 카메라 실패 오버레이 */}
          {(cameraStatus === "denied" || cameraStatus === "notfound" || cameraStatus === "failed") && !state.frozenFrame && (
            <div className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center gap-3 px-5 py-6 z-20">
              <div className="w-12 h-12 rounded-full bg-amber-500/[0.15] border border-amber-400/40 flex items-center justify-center">
                <Zap size={22} className="text-amber-300" />
              </div>
              <div className="text-center max-w-[280px]">
                <p className="text-white text-[14px] font-bold tracking-tight">
                  {cameraStatus === "denied"   && "카메라 접근이 거부되었습니다"}
                  {cameraStatus === "notfound" && "카메라를 찾을 수 없습니다"}
                  {cameraStatus === "failed"   && "카메라를 시작할 수 없습니다"}
                </p>
                <p className="text-white/60 text-[11px] mt-1.5 leading-relaxed">
                  {cameraStatus === "denied"
                    ? "주소창 자물쇠 → 카메라 → 허용"
                    : "잠시 후 다시 시도해주세요"}
                </p>
                {errorDetail && (
                  <p className="text-white/40 text-[10px] mt-2 font-mono break-all">{errorDetail}</p>
                )}
              </div>
              <button
                onClick={retryCamera}
                className="mt-1 px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[14px] font-bold shadow-[0_2px_10px_-2px_rgba(52,211,153,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors cursor-pointer inline-flex items-center gap-2"
              >다시 시도</button>
              <button
                onClick={() => state.imageInputRef.current?.click()}
                className="text-white/50 hover:text-white/80 text-[12px] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >또는 · 이미지 파일로 스캔</button>
              <button
                onClick={onClose}
                className="text-white/30 hover:text-white/60 text-[11px] font-medium transition-colors cursor-pointer mt-1"
              >닫기</button>
            </div>
          )}

          {/* Image decoding spinner */}
          {state.isDecoding && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 pointer-events-none z-30">
              <div className="w-9 h-9 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-xs font-medium tracking-wide">이미지 인식 중...</p>
            </div>
          )}

          <canvas ref={state.canvasRef} className="hidden" />
          <input
            ref={state.imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageDecode(file);
            }}
          />
        </div>

        {/* Hint */}
        <div className="px-4 py-3 text-center flex flex-col items-center gap-1.5">
          {state.darkHint && !state.torchOn ? (
            <button
              onClick={() => state.setTorchOn(true)}
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
        @keyframes shutterFlash {
          0%   { background: rgba(255,255,255,0.95); }
          100% { background: rgba(255,255,255,0); }
        }
      `}</style>
    </div>
  );
};
