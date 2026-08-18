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

  // 2026-08-19 · 카메라 상태 · TDZ 방지 · useZxing 전에 선언
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<{ name: string; msg: string } | null>(null);
  const [showRetry, setShowRetry] = useState(false);
  const manualStreamRef = useRef<MediaStream | null>(null);

  // handleResultRef: resolves circular dep between useZxing() (needs callback)
  // and handleResult (needs videoRef from useZxing return). useZxing's
  // onDecodeResult reads .current at call-time, so we get the latest closure.
  const handleResultRef = useRef<(raw: string) => void>(() => {});

  const { ref: videoRef } = useZxing({
    onDecodeResult: useCallback((result: any) => {
      handleResultRef.current(result.rawValue);
    }, []),
    // 2026-08-19 · onError · 침묵 실패 방지 · errorDetail 로 UI 표시
    onError: useCallback((err: any) => {
      const name = String(err?.name || "");
      const msg = String(err?.message || err || "");
      // 콘솔 · 디버깅용 (remote debugging)
      // eslint-disable-next-line no-console
      console.error("[BarcodeScanner] useZxing onError:", name, msg);
      setCameraError({ name, msg });
      setShowRetry(true);
    }, []),
    constraints: { video: videoConstraints, audio: false },
    formats: FORMATS as unknown as Parameters<typeof useZxing>[0]["formats"],
    trySkew: true,
    timeBetweenDecodingAttempts: 300,
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

  // 2026-08-18 · 카메라 켜지게 하는 기능 보강 · useZxing 방해 X · additive only
  //   [1] loadedmetadata · video.play() 명시 호출 (iOS Safari autoplay 정책 우회)
  //   [2] cameraReady state · playing 이벤트 감지 → UI 로딩·오류 상태 노출
  //   [3] 5초 timeout · 재생 실패 시 명시 재시도 버튼 표시
  //   [4] 명시 재시도 · getUserMedia + srcObject attach (useZxing 우회 · 사용자 gesture)
  //   [5] 실패 원인 · errorDetail 표시 (디버깅)
  useEffect(() => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!v) return;
    const onPlaying = () => setCameraReady(true);
    const onMeta = () => {
      // iOS Safari · srcObject 후 play() 안 되는 경우 · 명시 호출
      try { v.play().catch(() => { /* playing 이벤트 대기 */ }); } catch {}
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [videoRef]);

  // 5초 timeout · srcObject 존재 확인 (useZxing 성공 시 없음 · 실패 시 표시)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cameraReady) return;
      const v = videoRef.current as HTMLVideoElement | null;
      const stream = v?.srcObject as MediaStream | null;
      const hasLiveTrack = !!stream && stream.getVideoTracks().some(t => t.readyState === "live");
      if (!hasLiveTrack) setShowRetry(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [cameraReady, videoRef]);

  // 명시 재시도 · 사용자 클릭 · getUserMedia + srcObject attach
  const retryCamera = useCallback(async () => {
    setShowRetry(false);
    setCameraError(null);
    try {
      // 명시 gesture · getUserMedia · iOS 프롬프트 재발생
      const constraints: MediaStreamConstraints = {
        video: isDesktop ? true : { facingMode: "environment" },
      };
      // 보안 컨텍스트 확인
      if (typeof window !== "undefined" && "isSecureContext" in window && !window.isSecureContext) {
        throw new Error("SecureContextRequired: HTTPS 필수");
      }
      // 모던 API + 레거시 fallback
      const md: any = (navigator as any).mediaDevices;
      let stream: MediaStream;
      if (md?.getUserMedia) {
        stream = await md.getUserMedia(constraints);
      } else {
        const legacy = (navigator as any).getUserMedia
          || (navigator as any).webkitGetUserMedia
          || (navigator as any).mozGetUserMedia;
        if (!legacy) throw new Error("MediaDevicesUnavailable: getUserMedia 미지원");
        stream = await new Promise<MediaStream>((res, rej) => legacy.call(navigator, constraints, res, rej));
      }
      // 이전 수동 stream 정리
      if (manualStreamRef.current) {
        manualStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
      }
      manualStreamRef.current = stream;
      // srcObject 수동 attach + play
      const v = videoRef.current as HTMLVideoElement | null;
      if (v) {
        v.srcObject = stream;
        try { await v.play(); } catch { /* playing 이벤트 대기 */ }
      }
      // 스캔 loops 재시작
      state.setScanKey(k => k + 1);
    } catch (err: any) {
      setCameraError({ name: String(err?.name || ""), msg: String(err?.message || "") });
      setShowRetry(true);
    }
  }, [videoRef, state.setScanKey]);

  // unmount · 수동 stream 정리
  useEffect(() => () => {
    if (manualStreamRef.current) {
      manualStreamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
      manualStreamRef.current = null;
    }
  }, []);

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
              {state.ocrReady && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-700 text-purple-400 text-[10px] font-bold">
                  <Zap size={9} />OCR
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
            autoPlay
            muted
            playsInline
            // @ts-ignore · 구형 iOS Safari 인라인 재생 호환
            webkit-playsinline="true"
          />

          {/* 2026-08-18 · 카메라 켜지지 않을 때 fallback UI · 명시 재시도 · useZxing 성공 시 자동 숨김 */}
          {showRetry && !cameraReady && !state.frozenFrame && (
            <div className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center gap-3 px-5 py-6 z-20">
              <div className="w-12 h-12 rounded-full bg-amber-500/[0.15] border border-amber-400/40 flex items-center justify-center">
                <Zap size={22} className="text-amber-300" />
              </div>
              <div className="text-center max-w-[280px]">
                <p className="text-white text-[14px] font-bold tracking-tight">카메라가 켜지지 않습니다</p>
                <p className="text-white/60 text-[12px] mt-1.5 leading-relaxed">
                  {cameraError?.name === "NotAllowedError" || cameraError?.name === "SecurityError"
                    ? "주소창 자물쇠 → 카메라 → 허용 후 다시 시도"
                    : "다시 시도 버튼을 눌러주세요"}
                </p>
                {cameraError && (
                  <p className="text-white/40 text-[10px] mt-2 font-mono break-all">{cameraError.name}: {cameraError.msg}</p>
                )}
              </div>
              <button
                onClick={retryCamera}
                className="px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[14px] font-bold
                  shadow-[0_2px_10px_-2px_rgba(52,211,153,0.5),inset_0_1px_0_rgba(255,255,255,0.15)]
                  transition-colors cursor-pointer inline-flex items-center gap-2"
              >카메라 다시 시도</button>
              <button
                onClick={() => state.imageInputRef.current?.click()}
                className="text-white/50 hover:text-white/80 text-[12px] font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >또는 · 이미지 파일로 스캔</button>
            </div>
          )}

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
