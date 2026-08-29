import React, { useCallback, useEffect, useRef, useState } from "react";
import { useZxing } from "react-zxing";
import { X, ScanLine, Zap, ImageIcon, Info, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
// 2026-08-29 · #174 · SSO 다른 브라우저 열기
import { api } from "../../lib/apiClient";

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
// 2026-08-21 · Framework Phase 3 · alert → useToast · handlers onError 콜백
import { useToast, toastClass } from "../../hooks/useToast";

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan, onClose, title = "바코드 스캔",
}) => {
  // 2026-08-21 · Framework Phase 3 · handlers onError → toast
  const { toast, showError } = useToast();
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

  // 2026-08-19 · 진단로그 · UI 전용 · 카메라 로직 무관 (관찰만)
  const [camError, setCamError] = useState<string>("");
  const [diagOpen, setDiagOpen] = useState<boolean>(false);
  const [videoState, setVideoState] = useState<string>("init");

  // handleResultRef: resolves circular dep between useZxing() (needs callback)
  // and handleResult (needs videoRef from useZxing return). useZxing's
  // onDecodeResult reads .current at call-time, so we get the latest closure.
  const handleResultRef = useRef<(raw: string) => void>(() => {});

  const { ref: videoRef } = useZxing({
    onDecodeResult: useCallback((result: any) => {
      handleResultRef.current(result.rawValue);
    }, []),
    // 2026-08-19 · 진단 · onError · 카메라 로직 불변 · 관찰용 (additive)
    onError: useCallback((e: unknown) => {
      const err = e as any;
      const name = err?.name || "Error";
      const msg = err?.message || String(e);
      // eslint-disable-next-line no-console
      console.error("[BarcodeScanner] useZxing error:", name, msg);
      setCamError(`${name}: ${msg}`);
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
      onError: showError,
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

  // 2026-08-19 · 진단로그 · video 이벤트 관찰 (카메라 로직 무관 · 상태 표시만)
  useEffect(() => {
    const v = videoRef.current as HTMLVideoElement | null;
    if (!v) return;
    const upd = (label: string) => () => setVideoState(label);
    const onLoad = upd("loadedmetadata");
    const onPlay = upd("playing");
    const onPause = upd("paused");
    const onWait = upd("waiting");
    const onStall = upd("stalled");
    const onError = () => setVideoState("error");
    v.addEventListener("loadedmetadata", onLoad);
    v.addEventListener("playing", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWait);
    v.addEventListener("stalled", onStall);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("loadedmetadata", onLoad);
      v.removeEventListener("playing", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("stalled", onStall);
      v.removeEventListener("error", onError);
    };
  }, [videoRef]);

  // Esc key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // 2026-08-19 · 진단 정보 · 실시간 계산 (관찰만)
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const isSafariMain = /Safari\//.test(ua) && /Version\//.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  const inApp = /KAKAOTALK|NAVER|FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|Gmail|EdgiOS/i.test(ua);
  const standaloneFlag = typeof window !== "undefined" && (
    !!(window.navigator as any).standalone ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
  );
  const secure = typeof window !== "undefined" && (window as any).isSecureContext;
  const hasMD = typeof navigator !== "undefined" && !!(navigator as any).mediaDevices;
  const hasGUM = hasMD && !!(navigator as any).mediaDevices.getUserMedia;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-950 rounded-3xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.65)] w-full max-w-sm ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header · 2026 Linear/Vercel · minimal glass · engine dots refined */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-white/5 gap-2">
          <div className="flex items-center gap-2 text-white shrink-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/40 flex items-center justify-center">
              <ScanLine size={14} className="text-emerald-400" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">{title}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            {/* Engine dots · minimal refined */}
            <div className="flex items-center gap-1.5" title="활성 엔진">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              {state.zbarReady && <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />}
              {state.quaggaReady && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />}
              {state.ocrReady && <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.7)]" />}
            </div>
            <button
              onClick={() => state.imageInputRef.current?.click()}
              title="갤러리에서 이미지 선택"
              className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition flex items-center justify-center cursor-pointer"
            >
              <ImageIcon size={16} />
            </button>
            <button
              onClick={() => state.setTorchOn((v) => !v)}
              title={state.torchOn ? "손전등 끄기" : "손전등 켜기"}
              className={`w-8 h-8 rounded-lg transition flex items-center justify-center cursor-pointer ${
                state.torchOn
                  ? "text-amber-300 bg-amber-400/15 ring-1 ring-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.35)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Zap size={16} />
            </button>
            <button
              onClick={onClose}
              title="닫기"
              className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition flex items-center justify-center cursor-pointer"
            >
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
            autoPlay muted playsInline
          />

          {/* 2026-08-19 · 진단 오버레이 · 실시간 · 상단 우측 · 항상 접근 가능 */}
          {!state.frozenFrame && (
            <div className="absolute top-2 left-2 z-30" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setDiagOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold backdrop-blur-md transition cursor-pointer ${
                  camError
                    ? "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/50"
                    : videoState === "playing"
                      ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40"
                      : "bg-white/10 text-white/80 ring-1 ring-white/20"
                }`}
                title="진단 로그 · 탭하여 열기/닫기"
              >
                <Info size={12} />
                <span>{camError ? "ERROR" : videoState}</span>
                {diagOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {diagOpen && (
                <div className="mt-1.5 w-[280px] p-3 rounded-xl bg-black/85 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl">
                  <div className="text-[10px] font-mono text-white/90 space-y-1 leading-relaxed break-all">
                    <div className="text-white/50 uppercase tracking-wider mb-1 text-[9px]">진단 정보</div>
                    <div><span className="text-white/50">URL:</span> {typeof window !== "undefined" ? window.location.host : "?"}</div>
                    <div><span className="text-white/50">secure:</span> <span className={secure ? "text-emerald-300" : "text-rose-300"}>{String(secure)}</span></div>
                    <div><span className="text-white/50">mediaDevices:</span> <span className={hasMD ? "text-emerald-300" : "text-rose-300"}>{hasMD ? "yes" : "NO"}</span></div>
                    <div><span className="text-white/50">getUserMedia:</span> <span className={hasGUM ? "text-emerald-300" : "text-rose-300"}>{hasGUM ? "yes" : "NO"}</span></div>
                    <div><span className="text-white/50">videoState:</span> <span className="text-amber-200">{videoState}</span></div>
                    <div><span className="text-white/50">ios:</span> {String(ios)} <span className="text-white/50">safari:</span> {String(isSafariMain)}</div>
                    <div><span className="text-white/50">standalone:</span> {String(standaloneFlag)} <span className="text-white/50">inApp:</span> {String(inApp)}</div>
                    <div><span className="text-white/50">UA:</span> {ua.substring(0, 90)}</div>
                    {camError && (
                      <div className="mt-2 pt-2 border-t border-rose-400/30 text-rose-200">
                        <div className="text-rose-300/70 uppercase tracking-wider mb-0.5 text-[9px]">에러</div>
                        <div>{camError}</div>
                      </div>
                    )}
                    {ios && !isSafariMain && (
                      <div className="mt-2 pt-2 border-t border-amber-400/30 text-amber-200">
                        <div className="text-amber-300/70 uppercase tracking-wider mb-0.5 text-[9px]">iOS 웹앱 감지</div>
                        <div>홈화면 웹앱 · Apple 정책상 카메라 제한 (WebKit Bug 185448)</div>
                        <div className="text-white/70 mt-1">→ Safari 앱에서 직접 열기</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2026-08-29 · #174 · 카메라 실패 시 · 다른 브라우저 열기 (SSO · 로그인 유지) */}
          {!state.frozenFrame && camError && (
            <div className="absolute inset-x-4 top-16 z-30 flex flex-col items-stretch gap-3">
              <div className="rounded-xl bg-rose-500/95 text-white p-4 shadow-2xl ring-1 ring-rose-400 backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <X size={22} strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-bold leading-tight mb-1">카메라를 열 수 없습니다</div>
                    <div className="text-[12px] text-white/85 leading-snug break-words">
                      {camError}
                      {ios && !isSafariMain && <><br />iOS 홈화면 웹앱은 카메라 제한.</>}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const { data } = await api.post<{ token: string }>("/api/auth/sso-token", {});
                      const url = new URL(window.location.href);
                      url.searchParams.set("sso", data.token);
                      // 새 브라우저 · 새 창 · 사용자가 원하는 브라우저에서 열도록 target='_blank'
                      window.open(url.toString(), "_blank", "noopener,noreferrer");
                    } catch (err: any) {
                      alert(`SSO 토큰 발급 실패: ${err?.message ?? "네트워크 오류"}\n\n수동으로 URL 을 다른 브라우저에서 열어주세요:\n${window.location.href}`);
                    }
                  }}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-white text-rose-700 text-[14px] font-bold hover:bg-rose-50 active:scale-[0.98] transition cursor-pointer shadow-md"
                >
                  <ExternalLink size={16} strokeWidth={2.5} />
                  다른 브라우저로 열기 (로그인 유지)
                </button>
                <div className="mt-2 text-[11px] text-white/75 text-center leading-relaxed">
                  새 탭이 열리면 · 원하는 브라우저에 URL 복사·붙여넣기 하세요 (5분 내 유효)
                </div>
              </div>
            </div>
          )}

          {/* Snapshot confirmation overlay */}
          {state.frozenFrame && (
            <div className="absolute inset-0">
              <img src={state.frozenFrame} alt="snap" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent px-4 pt-12 pb-4 flex flex-col gap-3">
                <p className="text-white font-mono text-[15px] font-bold tracking-widest text-center drop-shadow-lg">{state.scannedCode}</p>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="px-3.5 py-3 rounded-xl text-[13px] font-semibold text-white bg-rose-500/85 hover:bg-rose-500 ring-1 ring-rose-400/70 active:scale-[0.97] transition backdrop-blur-md cursor-pointer"
                    title="스캔 취소 · 창 닫기"
                  >
                    취소
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                    className="flex-1 py-3 rounded-xl text-[13px] font-semibold text-white bg-white/10 hover:bg-white/15 ring-1 ring-white/25 active:scale-[0.97] transition backdrop-blur-md cursor-pointer"
                  >
                    다시 스캔
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    className="flex-1 py-3 rounded-xl text-[13px] font-semibold text-white bg-emerald-500 hover:bg-emerald-400 ring-1 ring-emerald-400 active:scale-[0.97] transition shadow-[0_8px_24px_rgba(16,185,129,0.35)] cursor-pointer"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Shutter flash — always fires via state timing separation */}
          {state.flashing && (
            <div className="absolute inset-0 pointer-events-none" style={{ animation: "shutterFlash 0.35s ease-out forwards" }} />
          )}

          {/* Scan guide overlay (live only) · 2026 최신 트렌드 · 확대 (Apple Wallet/Google Lens 참고)
              · inset-x 8% → 4% (거의 화면 전체 폭 · 90% 넓이)
              · top 18% → 8% · bottom 18% → 12% (수직 확대 · 80%)
              · corners w-7/h-7 → w-10/h-10 · thickness 2px → 3px (선명 강조)
              · 최신 스캐너 (Amazon/PayPal/Apple Wallet) · full-width edge-to-edge 트렌드 반영 */}
          {!state.frozenFrame && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-x-[4%] top-[8%] bottom-[12%]">
                <div className="absolute inset-0 bg-transparent" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }} />
                {[
                  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl",
                  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl",
                  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl",
                  "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl",
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-10 h-10 border-emerald-400 ${cls}`} style={{ boxShadow: "0 0 10px rgba(52,211,153,0.6)" }} />
                ))}
                <div className="absolute inset-x-0 h-0.5 bg-emerald-400" style={{ animation: "scanline 2s ease-in-out infinite", boxShadow: "0 0 10px 1.5px rgba(52,211,153,0.95)" }} />
                {/* 중앙 focus dot · Google Lens 톤 · 얇은 원 */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-emerald-400/60 pointer-events-none" style={{ boxShadow: "0 0 8px rgba(52,211,153,0.4)" }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                </div>
                {/* QR / 2D support indicator · 우측 하단 (그대로 유지 · 크기 up) */}
                <div className="absolute bottom-2 right-2.5 flex flex-col gap-[2px] opacity-70">
                  {[0,1,2].map(r => (
                    <div key={r} className="flex gap-[2px]">
                      {[0,1,2].map(c => (
                        <div key={c} className={`w-[5px] h-[5px] ${(r===0&&c===0)||(r===0&&c===2)||(r===2&&c===0)||(r===1&&c===1) ? "bg-emerald-400" : "bg-transparent"}`} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Android 전용 줌 버튼 — iOS 코드 경로 완전 분리 · 2026 refined */}
          {isAndroid && !state.frozenFrame && (
            <div
              className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-2 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {[1, 2, 3].map((z) => (
                <button
                  key={z}
                  onClick={() => setZoomLevel(z)}
                  className={`w-10 h-10 rounded-full text-[12px] font-bold transition-all active:scale-90 cursor-pointer backdrop-blur-md ${
                    zoomLevel === z
                      ? "bg-white text-black ring-2 ring-white shadow-[0_4px_16px_rgba(255,255,255,0.4)]"
                      : "bg-black/40 text-white ring-1 ring-white/25"
                  }`}
                >
                  {z}×
                </button>
              ))}
            </div>
          )}

          {/* Image decoding spinner · 2026 refined */}
          {state.isDecoding && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 pointer-events-none">
              <div className="w-10 h-10 border-[3px] border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-white text-[13px] font-medium tracking-wide">이미지 인식 중</p>
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

        {/* Hint · 2026 refined typography */}
        <div className="px-4 py-4 text-center flex flex-col items-center gap-2 bg-gradient-to-b from-zinc-950 to-black">
          {state.darkHint && !state.torchOn ? (
            <button
              onClick={() => state.setTorchOn(true)}
              className="flex items-center gap-2 text-[13px] text-amber-200 font-semibold bg-amber-400/12 ring-1 ring-amber-400/40 px-4 py-2 rounded-xl animate-pulse active:scale-95 transition cursor-pointer"
            >
              <Zap size={14} /> 어둡습니다 · 여기를 눌러 손전등 켜기
            </button>
          ) : (
            <p className="text-[13px] text-zinc-300 font-medium">바코드를 사각형 안에 맞춰주세요</p>
          )}
          <p className="text-[11px] text-zinc-500">화면을 탭하면 초점 조정 · 종이 바코드는 5~10cm 거리</p>
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
      {/* 2026-08-21 · Framework Phase 3 · toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9999]">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};
