import React, { useCallback, useEffect, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { X, ScanLine, Zap, ImageIcon } from "lucide-react";

const isAndroid = /android/i.test(navigator.userAgent);
const isDesktop = !/android|iphone|ipad|ipod/i.test(navigator.userAgent);
import type { BarcodeScannerProps } from "./types";
import { FORMATS, VIDEO_CONSTRAINTS } from "./types";

// PC 웹캠용 — facingMode 없이 요청 (데스크탑 카메라는 facing 개념이 없음)
const DESKTOP_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width:  { ideal: 1280 },
  height: { ideal: 720 },
};
import { useEngineState } from "./hooks/useEngineState";
import { useCameraControls } from "./hooks/useCameraControls";
import { useZBarLoop } from "./hooks/useZBarLoop";
import { useQuaggaLoop } from "./hooks/useQuaggaLoop";
import { useOcrLoop } from "./hooks/useOcrLoop";
import { useBarcodeScannerHandlers } from "./handlers";

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = "바코드 스캔",
}) => {
  const state = useEngineState();
  // Android 기본 2x — 스캔 시작 즉시 줌 적용. iOS는 1x (변경 없음)
  const [zoomLevel, setZoomLevel] = useState(isAndroid ? 2 : 1);

  // Android: 이전 세션에서 선택한 최적 카메라 ID가 있으면 바로 사용 — 전환 지연 제거.
  // ideal 사용 시 ID가 유효하지 않아도 graceful fallback.
  // Desktop: facingMode 없이 기본 웹캠 사용.
  const [videoConstraints, setVideoConstraints] = useState<MediaTrackConstraints>(() => {
    if (isDesktop) return DESKTOP_VIDEO_CONSTRAINTS;
    if (!isAndroid) return VIDEO_CONSTRAINTS; // iOS: unchanged
    try {
      const saved = localStorage.getItem("android_best_camera_id");
      if (saved) return { ...VIDEO_CONSTRAINTS, deviceId: { ideal: saved } };
    } catch {}
    return VIDEO_CONSTRAINTS;
  });

  // handleResultRef: resolves circular dep between useZxing() (needs callback)
  // and handleResult (needs videoRef from useZxing return). useZxing's
  // onDecodeResult reads .current at call-time, so we get the latest closure.
  const handleResultRef = useRef<(raw: string) => void>(() => {});

  const { ref: videoRef } = useZxing({
    onDecodeResult: useCallback((result: any) => {
      handleResultRef.current(result.rawValue);
    }, []),
    constraints: { video: videoConstraints },
    formats: FORMATS as unknown as Parameters<typeof useZxing>[0]["formats"],
    trySkew: true,
    timeBetweenDecodingAttempts: 150,
  });

  const { handleResult, handleConfirm, handleRetry, handleImageDecode } =
    useBarcodeScannerHandlers({
      scannedRef: state.scannedRef,
      mountedRef: state.mountedRef,
      videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
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

  // Sync handleResultRef on every render — guarantees scan loops + useZxing
  // callback observe the latest handler closure.
  handleResultRef.current = handleResult;

  const handleTapFocus = useCameraControls({
    videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
    torchOn: state.torchOn,
    setTorchOn: state.setTorchOn,
    torchOnRef: state.torchOnRef,
    mountedRef: state.mountedRef,
    frozenFrame: state.frozenFrame,
    zoomLevel,
  });

  useZBarLoop({
    videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
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
    videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
    scanKey: state.scanKey,
    handleResult,
    scannedRef: state.scannedRef,
    quaggaCanvasRef: state.quaggaCanvasRef,
  });

  useOcrLoop({
    ocrReady: state.ocrReady,
    videoRef: videoRef as React.RefObject<HTMLVideoElement | null>,
    scanKey: state.scanKey,
    handleResult,
    scannedRef: state.scannedRef,
    ocrWorkerRef: state.ocrWorkerRef,
    ocrCanvasRef: state.ocrCanvasRef,
  });

  // 2026-07-30 · 사용자 요청 · 바코드 스캔 삑 소리 · iOS Audio unlock
  //   iOS 는 user gesture 후 · silent audio 재생하여 AudioContext 활성화 필요
  //   스캐너 오픈 (user gesture) 시점 · 무음 오디오 재생 후 즉시 stop · unlock 유지
  // 2026-07-30 (3rd) · beep 프리로드 · 첫 인식 즉시 재생 · 지연·실패 방지
  useEffect(() => {
    // 1) Web Audio unlock (silent) · shared ctx 전역 저장 · handleResult 에서 재사용
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
        // ⚠ ctx.close() 하지 말 것 · handlers.ts 에서 재사용 (unlock 상태 유지)
      }
    } catch { /* silent */ }
    // 2) beep.wav 프리로드 · 무음 재생 → unlock 유지 · handleResult 즉시 재생 가능
    try {
      const audio = new Audio("/beep.wav");
      audio.volume = 0;   // 무음 재생 (unlock only)
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1.0;
        // window 에 전역 캐시 · handleResult 에서 재사용
        (window as any).__beepAudio = audio;
      }).catch(() => { /* silent */ });
    } catch { /* silent */ }
  }, []);

  // Android: playing 이벤트 시점에 최적 카메라 자동 선택.
  // 캐시된 deviceId가 현재 스트림과 일치하면 enumerateDevices 생략 — 불필요한 async 비용 제거.
  // facingMode:"environment"는 초광각 렌즈를 선택할 수 있어 1D 바코드 초점이 안 잡힘.
  useEffect(() => {
    if (!isAndroid) return;
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;
    let switched = false;

    const trySelect = async () => {
      if (switched) return;

      // Fast path: 현재 스트림이 이미 캐시된 최적 카메라라면 enumeration 없이 즉시 완료.
      const currentDeviceId = (videoRef.current?.srcObject as MediaStream)
        ?.getVideoTracks()[0]?.getSettings?.()?.deviceId;
      try {
        const cached = localStorage.getItem("android_best_camera_id");
        if (cached && currentDeviceId && currentDeviceId === cached) {
          switched = true;
          return;
        }
      } catch {}

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === "videoinput" && d.label);
        if (inputs.length === 0) return; // 권한 없으면 label 없음 — playing 재발생 시 재시도
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
          switched = true;
          setVideoConstraints({ ...VIDEO_CONSTRAINTS, deviceId: { ideal: best.deviceId } });
          // 카메라 전환 후 줌 정착 대기 후 스캔 루프 재시작
          setTimeout(() => state.setScanKey(k => k + 1), 600);
        }
      } catch {}
    };

    video.addEventListener("playing", trySelect);
    // 1500ms 폴백 — playing이 이미 발생한 경우 대비
    const t = setTimeout(trySelect, 1500);
    return () => { video.removeEventListener("playing", trySelect); clearTimeout(t); };
  }, [videoRef, state.setScanKey]);

  // Esc key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // 2026-08-18 · 카메라 권한 · 모바일에서 자동 시작 안 될 때 fallback 감지
  //   · 3초 후 · srcObject 없거나 video paused → 권한/장치 오류로 판단
  //   · 재시도 버튼 · getUserMedia 명시 호출 → 브라우저 권한 프롬프트 재발생
  //   · iOS 특수 코드 경로는 건드리지 않음 (일반 감지만)
  const [cameraError, setCameraError] = useState<null | "denied" | "notfound" | "timeout" | "other">(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      const v = videoRef.current as HTMLVideoElement | null;
      const stream = v?.srcObject as MediaStream | null | undefined;
      if (!stream) {
        // srcObject 아직 미할당 · 권한 프롬프트 대기 or 거부
        setCameraError("timeout");
      } else if (stream.getVideoTracks().length === 0) {
        setCameraError("notfound");
      }
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [videoRef]);

  const retryCamera = useCallback(async () => {
    setRetrying(true);
    setCameraError(null);
    try {
      // 브라우저 권한 프롬프트 재발생 · getUserMedia 명시 호출
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isDesktop ? true : { facingMode: "environment" }
      });
      // 즉시 stop · useZxing 이 다시 setup 하도록 scanKey bump
      stream.getTracks().forEach(t => t.stop());
      state.setScanKey(k => k + 1);
      setCameraError(null);
    } catch (err: any) {
      const name = String(err?.name || "");
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError("denied");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("notfound");
      } else {
        setCameraError("other");
      }
    } finally {
      setRetrying(false);
    }
  }, [state.setScanKey]);

  return (
    <div
      // 2026-08-18 · UI 재설계 · 프리미엄 dark · frosted backdrop · 초고해상도 shadow
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6
        bg-[rgba(3,7,18,0.72)] backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden
          bg-[#0B0F17] border border-white/[0.08]
          shadow-[0_20px_60px_-12px_rgba(0,0,0,0.55),0_8px_24px_-8px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.06)]"
        onClick={(e) => e.stopPropagation()}
        style={{ WebkitFontSmoothing: "antialiased", MozOsxFontSmoothing: "grayscale" }}
      >
        {/* 상단 액센트 stripe · brand identity · 프리미엄 톤 */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-400/0 via-emerald-400/60 to-emerald-400/0 pointer-events-none" />

        {/* Header · 2026 · frosted + tight typography */}
        <div className="flex items-center justify-between px-4 py-3 gap-2
          bg-[rgba(255,255,255,0.02)] border-b border-white/[0.06] backdrop-blur-sm">
          <div className="flex items-center gap-2 text-white shrink-0 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg
              bg-emerald-500/[0.14] border border-emerald-400/25
              shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <ScanLine size={14} className="text-emerald-300" />
            </span>
            <span className="text-[14px] font-bold whitespace-nowrap tracking-tight truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end min-w-0">
            {/* Engine indicators · 세련된 pill · 미묘한 border-glow */}
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
                bg-emerald-500/[0.14] border border-emerald-400/25 text-emerald-300 text-[10px] font-bold tracking-tight">
                <span className="w-1 h-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />ZX
              </span>
              {state.zbarReady && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
                  bg-sky-500/[0.14] border border-sky-400/25 text-sky-300 text-[10px] font-bold tracking-tight">
                  <span className="w-1 h-1 rounded-full bg-sky-400" />ZB
                </span>
              )}
              {state.quaggaReady && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
                  bg-amber-500/[0.14] border border-amber-400/25 text-amber-300 text-[10px] font-bold tracking-tight">
                  <span className="w-1 h-1 rounded-full bg-amber-400" />Q
                </span>
              )}
              {state.ocrReady && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
                  bg-violet-500/[0.14] border border-violet-400/25 text-violet-300 text-[10px] font-bold tracking-tight">
                  <span className="w-1 h-1 rounded-full bg-violet-400" />OCR
                </span>
              )}
            </div>
            <button
              onClick={() => state.imageInputRef.current?.click()}
              title="갤러리에서 이미지 선택"
              className="w-7 h-7 flex items-center justify-center rounded-lg
                text-white/50 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]
                transition-colors cursor-pointer"
              aria-label="이미지 열기"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={() => state.setTorchOn((v) => !v)}
              title={state.torchOn ? "손전등 끄기" : "손전등 켜기"}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
                state.torchOn
                  ? "text-amber-300 bg-amber-400/[0.15] hover:text-amber-200 hover:bg-amber-400/[0.20] shadow-[0_0_10px_rgba(251,191,36,0.20)]"
                  : "text-white/50 hover:text-white hover:bg-white/[0.08]"
              }`}
              aria-label="손전등"
            >
              <Zap size={14} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg
                text-white/50 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]
                transition-colors cursor-pointer"
              aria-label="닫기"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Camera / Freeze frame */}
        <div
          className="relative bg-black cursor-pointer"
          style={{ aspectRatio: isAndroid ? "16/9" : "4/3" }}
          onClick={handleTapFocus}
        >
          {/* Live video — hidden when frozen. No CSS filter: camera's own auto-exposure
              is more accurate than JS post-processing (avoids banding/color shift) */}
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${state.frozenFrame ? "invisible" : ""}`}
            autoPlay muted playsInline
          />

          {/* Snapshot confirmation overlay */}
          {state.frozenFrame && (
            <div className="absolute inset-0">
              <img src={state.frozenFrame} alt="snap" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pt-10 pb-3 flex flex-col gap-2.5">
                <p className="text-white font-mono text-sm font-bold tracking-widest text-center drop-shadow-lg">{state.scannedCode}</p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="px-3 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-600/80 border border-rose-500 active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                    title="스캔 취소 · 창 닫기"
                  >
                    ✕ 취소
                  </button>
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
          {state.flashing && (
            <div className="absolute inset-0 pointer-events-none" style={{ animation: "shutterFlash 0.35s ease-out forwards" }} />
          )}

          {/* Scan guide overlay (live only) */}
          {!state.frozenFrame && (
            <div className="absolute inset-0 pointer-events-none">
              {/* No base overlay — scan area shows at full brightness. boxShadow darkens surrounds only. */}
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
                {/* QR / 2D support indicator */}
                <div className="absolute bottom-1.5 right-2 flex flex-col gap-[2px]">
                  {[0,1,2].map(r => (
                    <div key={r} className="flex gap-[2px]">
                      {[0,1,2].map(c => (
                        <div key={c} className={`w-[4px] h-[4px] ${(r===0&&c===0)||(r===0&&c===2)||(r===2&&c===0)||(r===1&&c===1) ? "bg-emerald-400/70" : "bg-transparent"}`} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Android 전용 줌 버튼 — iOS 코드 경로 완전 분리 */}
          {isAndroid && !state.frozenFrame && (
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
                >
                  {z}×
                </button>
              ))}
            </div>
          )}

          {/* 2026-08-18 · 카메라 권한/오류 오버레이 · 모바일 fallback */}
          {cameraError && !state.frozenFrame && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 px-5 py-6 z-20">
              <div className="w-12 h-12 rounded-full bg-amber-500/[0.15] border border-amber-400/40 flex items-center justify-center">
                <Zap size={22} className="text-amber-300" />
              </div>
              <div className="text-center max-w-[260px]">
                <p className="text-white text-[14px] font-bold tracking-tight">
                  {cameraError === "denied"   && "카메라 접근이 거부되었습니다"}
                  {cameraError === "notfound" && "카메라를 찾을 수 없습니다"}
                  {cameraError === "timeout"  && "카메라 응답이 없습니다"}
                  {cameraError === "other"    && "카메라 오류가 발생했습니다"}
                </p>
                <p className="text-white/60 text-[12px] mt-1.5 leading-relaxed">
                  {cameraError === "denied"
                    ? "브라우저 주소창의 자물쇠 → 카메라 · 허용으로 변경 후 다시 시도"
                    : "다시 시도 버튼을 눌러 권한 요청을 재시도해보세요"}
                </p>
              </div>
              <button
                onClick={retryCamera}
                disabled={retrying}
                className="mt-1 px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                  text-white text-[14px] font-bold shadow-[0_2px_10px_-2px_rgba(52,211,153,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]
                  disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer
                  inline-flex items-center gap-2"
              >
                {retrying ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    권한 요청 중...
                  </>
                ) : (
                  <>다시 허용 요청</>
                )}
              </button>
              <button
                onClick={onClose}
                className="text-white/40 hover:text-white/70 text-[12px] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >
                닫기
              </button>
            </div>
          )}

          {/* Image decoding spinner */}
          {state.isDecoding && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-9 h-9 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-xs font-medium tracking-wide">이미지 인식 중...</p>
            </div>
          )}

          {/* Hidden canvas for ZBar frame capture */}
          <canvas ref={state.canvasRef} className="hidden" />

          {/* Hidden file input for gallery/image decode */}
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
