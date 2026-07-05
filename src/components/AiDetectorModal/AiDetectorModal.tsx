/**
 * AI 탐지 에이전트 모달
 * - 카메라 캡처 또는 이미지 업로드
 * - 모드 선택: 탐지(detect) / 세분화(segment)
 * - 신뢰도(confidence) 슬라이더
 * - 결과 표시: 탐지 갯수 + 바운딩박스 canvas 오버레이
 *
 * StockCounterModal과 완전히 별개의 독립 컴포넌트.
 * 기존 /api/stock-count 엔드포인트에 일절 영향 없음.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  X, Camera, RotateCcw, Upload, Loader2, AlertTriangle,
  Scan, SlidersHorizontal, Layers, Box, RefreshCw,
  Warehouse, Store, CheckCircle2,
} from "lucide-react";

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

type DetectMode = "detect" | "segment";
type Phase = "camera" | "detecting" | "result";

interface DetectionBox {
  x: number;   // center_x (normalized 0~1)
  y: number;   // center_y
  w: number;   // width
  h: number;   // height
  x1: number;  // left (normalized)
  y1: number;  // top
  x2: number;  // right
  y2: number;  // bottom
  confidence: number;
  class_name: string;
}

interface AiDetectResult {
  count: number;
  mode: DetectMode;
  boxes: DetectionBox[];
  masks: Array<Array<[number, number]>> | null;
  class_scores: Record<string, number> | null;
  processing_time_ms: number;
}

interface ServerStatus {
  ready: boolean;
  starting?: boolean;
  reason?: string;
  modes?: Record<string, { loaded: boolean }>;
}

interface Props {
  /** 창고 수량 적용 콜백 (선택적 — 없으면 버튼 미표시) */
  onApplyWarehouse?: (count: number) => void;
  /** 매장 수량 적용 콜백 (선택적) */
  onApplyStore?: (count: number) => void;
  onClose: () => void;
}

// ── 색상 팔레트 ───────────────────────────────────────────────────────────────

const BOX_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export const AiDetectorModal: React.FC<Props> = ({
  onApplyWarehouse,
  onApplyStore,
  onClose,
}) => {
  // ESC 키 닫기
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  // refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 상태
  const [phase, setPhase] = useState<Phase>("camera");
  const [mode, setMode] = useState<DetectMode>("detect");
  const [confidence, setConfidence] = useState<number>(0.5);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AiDetectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [applied, setApplied] = useState<"warehouse" | "store" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedBoxIdx, setSelectedBoxIdx] = useState<number | null>(null);

  // ── 카메라 & 상태 초기화 ───────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    // 카메라 스트림
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(e => {
        if (active) setError(`카메라 접근 오류: ${e.message}`);
      });

    // AI 탐지 서버 상태 확인
    fetch("/api/ai-detect/status")
      .then(r => r.json())
      .then((d: ServerStatus) => { if (active) setServerStatus(d); })
      .catch(() => { if (active) setServerStatus({ ready: false, reason: "서버 응답 없음" }); });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── 결과 캔버스 렌더링 ────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "result" || !result || !overlayCanvasRef.current || !capturedDataUrl) return;

    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const lw = Math.max(2, img.naturalWidth / 300);
      const fontSize = Math.max(11, img.naturalWidth / 70);

      // 마스크 (segment 모드)
      if (result.masks && result.masks.length > 0) {
        result.masks.forEach((contour, idx) => {
          if (!contour || contour.length < 3) return;
          const color = BOX_COLORS[idx % BOX_COLORS.length];
          ctx.beginPath();
          ctx.moveTo(contour[0][0] * img.naturalWidth, contour[0][1] * img.naturalHeight);
          for (let i = 1; i < contour.length; i++) {
            ctx.lineTo(contour[i][0] * img.naturalWidth, contour[i][1] * img.naturalHeight);
          }
          ctx.closePath();
          ctx.fillStyle = color + "40";  // 25% 투명도
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.stroke();
        });
      }

      // 바운딩박스
      result.boxes.forEach((box, idx) => {
        const color = BOX_COLORS[idx % BOX_COLORS.length];
        const x = box.x1 * img.naturalWidth;
        const y = box.y1 * img.naturalHeight;
        const w = (box.x2 - box.x1) * img.naturalWidth;
        const h = (box.y2 - box.y1) * img.naturalHeight;

        const isSelected = selectedBoxIdx === idx;

        // 박스 채우기
        ctx.fillStyle = isSelected ? color + "50" : color + "20";
        ctx.fillRect(x, y, w, h);

        // 박스 테두리
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? lw * 2 : lw;
        ctx.strokeRect(x, y, w, h);

        // 라벨 배경
        const label = `${idx + 1} · ${Math.round(box.confidence * 100)}%`;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textW = ctx.measureText(label).width + 6;
        const textH = fontSize + 4;
        ctx.fillStyle = color;
        ctx.fillRect(x, y - textH - 2, textW, textH + 2);

        // 라벨 텍스트
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, x + 3, y - 4);
      });
    };
    img.src = capturedDataUrl;
  }, [phase, result, capturedDataUrl, selectedBoxIdx]);

  // ── 이벤트 핸들러 ────────────────────────────────────────────────────────

  const doDetect = useCallback(async (dataUrl: string) => {
    setPhase("detecting");
    setError(null);
    setApplied(null);
    setSelectedBoxIdx(null);

    try {
      const res = await fetch("/api/ai-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: dataUrl,
          mode,
          confidence,
          iou: 0.45,
        }),
      });

      const body = await res.json() as any;

      if (!res.ok) {
        throw new Error(body.error ?? body.detail ?? `서버 오류 (${res.status})`);
      }

      setResult(body as AiDetectResult);
      setPhase("result");

      // 상태 갱신
      setServerStatus(prev => ({ ...prev, ready: true }));
    } catch (e: any) {
      setError(e.message ?? "분석 실패");
      setPhase("camera");
    }
  }, [mode, confidence]);

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !captureCanvasRef.current) return;
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedDataUrl(dataUrl);
    doDetect(dataUrl);
  }, [doDetect]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      setCapturedDataUrl(dataUrl);
      doDetect(dataUrl);
    };
    reader.readAsDataURL(file);
    // input 초기화 (같은 파일 재업로드 허용)
    e.target.value = "";
  }, [doDetect]);

  const handleRetake = useCallback(() => {
    setCapturedDataUrl(null);
    setResult(null);
    setApplied(null);
    setError(null);
    setSelectedBoxIdx(null);
    setPhase("camera");
  }, []);

  const handleStartServer = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await fetch("/api/ai-detect/start", { method: "POST" });
      // 상태 폴링 (최대 40초)
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const r = await fetch("/api/ai-detect/status");
        const d: ServerStatus = await r.json();
        setServerStatus(d);
        if (d.ready) break;
      }
    } catch (e: any) {
      setError("서버 시작 실패: " + e.message);
    }
    setStarting(false);
  }, []);

  const handleApply = useCallback((target: "warehouse" | "store") => {
    if (!result) return;
    setApplied(target);
    if (target === "warehouse") onApplyWarehouse?.(result.count);
    else onApplyStore?.(result.count);
  }, [result, onApplyWarehouse, onApplyStore]);

  // ── 렌더링 ──────────────────────────────────────────────────────────────

  const isServerReady = serverStatus?.ready === true;
  const canCapture = phase === "camera";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm">

      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Scan size={18} className="text-violet-400" />
          <span className="text-white font-bold text-base">AI 탐지 에이전트</span>
          {serverStatus && (
            <span className={`text-[10px] font-bold ml-1 ${
              isServerReady ? "text-green-400" : "text-orange-400"
            }`}>
              {isServerReady ? "준비됨" : (serverStatus.starting ? "시작 중…" : "미시작")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              showSettings ? "bg-violet-600 text-white" : "text-white/50 hover:text-white hover:bg-white/10"
            }`}
            title="설정"
          >
            <SlidersHorizontal size={17} />
          </button>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition cursor-pointer p-1"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* 설정 패널 */}
      {showSettings && (
        <div className="bg-black/60 border-b border-white/10 px-4 py-3 flex flex-col gap-3">

          {/* 모드 선택 */}
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs font-bold w-16 shrink-0">탐지 모드</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("detect")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  mode === "detect"
                    ? "bg-violet-600 text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                <Box size={12} />
                탐지 (Detect)
              </button>
              <button
                onClick={() => setMode("segment")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  mode === "segment"
                    ? "bg-violet-600 text-white"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                <Layers size={12} />
                세분화 (Segment)
              </button>
            </div>
          </div>

          {/* 신뢰도 슬라이더 */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-xs font-bold w-16 shrink-0">신뢰도</span>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              className="flex-1 accent-violet-500 cursor-pointer"
            />
            <span className="text-violet-300 font-black text-sm w-10 text-right">
              {Math.round(confidence * 100)}%
            </span>
          </div>

          {/* 모드 설명 */}
          <p className="text-white/40 text-[11px] leading-relaxed">
            {mode === "detect"
              ? "탐지 모드: 바운딩박스로 물체 위치와 갯수를 감지합니다. 빠르고 가볍습니다."
              : "세분화 모드: 픽셀 단위 마스크로 물체를 분리합니다. 겹친 물체 처리가 우수하나 seg 모델 필요."}
          </p>
        </div>
      )}

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 gap-4 min-h-0 overflow-y-auto">

        {/* 메인 뷰 영역 */}
        <div className="relative w-full max-w-5xl aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-2xl">

          {/* 카메라 프리뷰 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${phase !== "camera" ? "hidden" : ""}`}
          />

          {/* 감지 중 오버레이 */}
          {phase === "detecting" && capturedDataUrl && (
            <>
              <img
                src={capturedDataUrl}
                alt="촬영된 이미지"
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 size={40} className="text-violet-400 animate-spin" />
                <p className="text-white font-bold text-sm">
                  AI 분석 중… ({mode === "detect" ? "탐지" : "세분화"} 모드)
                </p>
              </div>
            </>
          )}

          {/* 결과 캔버스 */}
          {phase === "result" && (
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full object-contain cursor-crosshair"
            />
          )}

          {/* 숨김 캡처 캔버스 */}
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* 카메라 가이드 프레임 */}
          {phase === "camera" && (
            <div className="absolute inset-4 border-2 border-white/20 rounded-xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-violet-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-violet-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-violet-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-violet-400 rounded-br-xl" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                <p className="text-white/30 text-xs font-bold">
                  {mode === "detect" ? "탐지(Detect)" : "세분화(Segment)"} · 신뢰도 {Math.round(confidence * 100)}%
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-start gap-2 px-4 py-2.5 bg-red-900/60 border border-red-500/60 rounded-xl text-red-300 text-sm font-bold w-full max-w-5xl">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* 서버 미시작 안내 */}
        {serverStatus && !isServerReady && phase === "camera" && (
          <div className="w-full max-w-5xl bg-orange-900/50 border border-orange-500/60 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-orange-300 text-xs font-bold">
                AI 탐지 서버 미시작
              </p>
              <p className="text-orange-400/70 text-[11px] mt-0.5">
                {serverStatus.reason || "pip install ultralytics fastapi uvicorn 설치 후 시작 가능"}
              </p>
            </div>
            <button
              onClick={handleStartServer}
              disabled={starting}
              className="shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg cursor-pointer transition"
            >
              {starting ? (
                <><Loader2 size={11} className="animate-spin" /> 시작 중…</>
              ) : (
                <><RefreshCw size={11} /> 서버 시작</>
              )}
            </button>
          </div>
        )}

        {/* 결과 카운트 패널 */}
        {phase === "result" && result && (
          <div className="w-full max-w-5xl">
            <div className="bg-white/10 border border-white/20 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-1">
                    감지된 수량
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-violet-300 leading-none">
                      {result.count}
                    </span>
                    <span className="text-white/40 text-sm">개</span>
                  </div>
                  <p className="text-white/40 text-xs mt-1">
                    {result.boxes.length}개 박스 · {result.mode === "detect" ? "탐지" : "세분화"} 모드
                    · {result.processing_time_ms.toFixed(0)}ms
                  </p>
                </div>

                {/* 박스 목록 (최대 10개 미리보기) */}
                {result.boxes.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                    {result.boxes.slice(0, 12).map((box, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedBoxIdx(prev => prev === idx ? null : idx)}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${
                          selectedBoxIdx === idx
                            ? "bg-white text-gray-900"
                            : "bg-white/20 text-white/70 hover:bg-white/30"
                        }`}
                        title={`${box.class_name} (${Math.round(box.confidence * 100)}%)`}
                      >
                        #{idx + 1} {Math.round(box.confidence * 100)}%
                      </button>
                    ))}
                    {result.boxes.length > 12 && (
                      <span className="text-[10px] text-white/40 self-center">
                        +{result.boxes.length - 12}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 영역 */}
      <div className="px-4 pb-6 flex flex-col gap-3 max-w-5xl mx-auto w-full">

        {/* 카메라 단계 */}
        {phase === "camera" && (
          <div className="flex gap-3">
            <button
              onClick={handleCapture}
              disabled={!isServerReady}
              className="flex-1 flex items-center justify-center gap-2 py-4 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-600 disabled:opacity-50 text-white font-black text-base rounded-2xl transition shadow-lg cursor-pointer"
            >
              <Camera size={20} />
              촬영 &amp; 분석
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!isServerReady}
              className="flex items-center justify-center gap-2 px-5 py-4 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition cursor-pointer"
              title="이미지 파일 업로드"
            >
              <Upload size={18} />
            </button>
          </div>
        )}

        {/* 결과 단계 */}
        {phase === "result" && result && (
          <>
            {/* 창고/매장 적용 (콜백이 있는 경우만 표시) */}
            {(onApplyWarehouse || onApplyStore) && (
              <div className="flex gap-3">
                {onApplyWarehouse && (
                  <button
                    onClick={() => handleApply("warehouse")}
                    disabled={applied !== null}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition cursor-pointer ${
                      applied === "warehouse"
                        ? "bg-emerald-600 text-white"
                        : "bg-white/90 hover:bg-white text-gray-800 disabled:opacity-50"
                    }`}
                  >
                    {applied === "warehouse" ? <CheckCircle2 size={16} /> : <Warehouse size={16} />}
                    창고에 적용
                  </button>
                )}
                {onApplyStore && (
                  <button
                    onClick={() => handleApply("store")}
                    disabled={applied !== null}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition cursor-pointer ${
                      applied === "store"
                        ? "bg-emerald-600 text-white"
                        : "bg-white/90 hover:bg-white text-gray-800 disabled:opacity-50"
                    }`}
                  >
                    {applied === "store" ? <CheckCircle2 size={16} /> : <Store size={16} />}
                    매장에 적용
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleRetake}
              className="flex items-center justify-center gap-2 w-full py-3 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-2xl transition cursor-pointer"
            >
              <RotateCcw size={15} />
              다시 찍기
            </button>
          </>
        )}
      </div>

      {/* 숨김 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
};
