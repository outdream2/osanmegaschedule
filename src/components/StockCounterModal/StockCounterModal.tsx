import React, { useEffect, useRef, useState } from "react";
import { X, Camera, RotateCcw, Warehouse, Store, Loader2, AlertTriangle, CheckCircle2, Scan } from "lucide-react";

interface Box {
  x1: number; y1: number; x2: number; y2: number; score: number;
}

interface DetectionResult {
  count: number;
  boxes: Box[];
}

interface Props {
  onApplyWarehouse: (count: number) => void;
  onApplyStore: (count: number) => void;
  onClose: () => void;
}

export const StockCounterModal: React.FC<Props> = ({ onApplyWarehouse, onApplyStore, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<"camera" | "detecting" | "result">("camera");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [modelReason, setModelReason] = useState<string>("");
  const [applied, setApplied] = useState<"warehouse" | "store" | null>(null);
  const [reloading, setReloading] = useState(false);

  // 카메라 스트림 시작
  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } })
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

    // 모델 준비 상태 확인
    fetch("/api/stock-count/status")
      .then(r => r.json())
      .then(d => { if (active) { setModelReady(!!d.ready); setModelReason(d.reason ?? ""); } })
      .catch(() => { if (active) setModelReady(false); });

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // 결과 이미지에 박스 오버레이 그리기
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
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = Math.max(2, img.naturalWidth / 200);
      ctx.fillStyle = "rgba(34,197,94,0.15)";
      for (const box of result.boxes) {
        const x = box.x1 * img.naturalWidth;
        const y = box.y1 * img.naturalHeight;
        const w = (box.x2 - box.x1) * img.naturalWidth;
        const h = (box.y2 - box.y1) * img.naturalHeight;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        // 점수 라벨
        const label = `${box.score}%`;
        ctx.font = `bold ${Math.max(12, img.naturalWidth / 60)}px sans-serif`;
        ctx.fillStyle = "#16a34a";
        ctx.fillText(label, x + 2, y - 4);
        ctx.fillStyle = "rgba(34,197,94,0.15)";
      }
    };
    img.src = capturedDataUrl;
  }, [phase, result, capturedDataUrl]);

  const handleCapture = async () => {
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
    setPhase("detecting");
    setError(null);
    setApplied(null);

    try {
      const res = await fetch("/api/stock-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `서버 오류 (${res.status})`);
      setResult(body as DetectionResult);
      setPhase("result");
    } catch (e: any) {
      setError(e.message ?? "분석 실패");
      setPhase("camera");
    }
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setResult(null);
    setApplied(null);
    setError(null);
    setPhase("camera");
  };

  const handleReloadModel = async () => {
    setReloading(true);
    setError(null);
    try {
      const r = await fetch("/api/stock-count/reload", { method: "POST" });
      const d = await r.json();
      setModelReady(!!d.ready);
      setModelReason(d.reason ?? "");
      if (!d.ready) setError(d.reason || "모델 로드 실패 — server/models/best.pt를 확인하세요");
    } catch (e: any) {
      setError("재로드 실패: " + e.message);
    }
    setReloading(false);
  };

  const handleApply = (target: "warehouse" | "store") => {
    if (!result) return;
    setApplied(target);
    if (target === "warehouse") onApplyWarehouse(result.count);
    else onApplyStore(result.count);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <div className="flex items-center gap-2">
          <Scan size={18} className="text-green-400" />
          <span className="text-white font-bold text-base">AI 재고 세기</span>
          {modelReady === false && (
            <span className="text-[10px] text-orange-400 font-bold ml-1">모델 미로드</span>
          )}
          {modelReady === true && (
            <span className="text-[10px] text-green-400 font-bold ml-1">모델 준비됨</span>
          )}
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition cursor-pointer">
          <X size={22} />
        </button>
      </div>

      {/* 본문 */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 gap-4 min-h-0">
        {/* 카메라 / 결과 뷰 */}
        <div className="relative w-full max-w-5xl aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-2xl">
          {/* 카메라 프리뷰 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${phase !== "camera" ? "hidden" : ""}`}
          />

          {/* 촬영 직후 감지 중 */}
          {phase === "detecting" && capturedDataUrl && (
            <>
              <img src={capturedDataUrl} alt="captured" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 size={36} className="text-green-400 animate-spin" />
                <p className="text-white font-bold text-sm">AI 분석 중...</p>
              </div>
            </>
          )}

          {/* 결과 오버레이 */}
          {phase === "result" && (
            <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full object-contain" />
          )}

          {/* 캡처 캔버스 (숨김) */}
          <canvas ref={captureCanvasRef} className="hidden" />

          {/* 카메라 프레임 가이드 */}
          {phase === "camera" && (
            <div className="absolute inset-4 border-2 border-white/30 rounded-xl pointer-events-none">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-green-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-green-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-green-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-green-400 rounded-br-lg" />
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-900/60 border border-red-500 rounded-xl text-red-300 text-sm font-bold w-full max-w-md">
            <AlertTriangle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {/* 결과 카운트 */}
        {phase === "result" && result && (
          <div className="w-full max-w-5xl bg-white/10 border border-white/20 rounded-2xl px-5 py-4 text-center">
            <p className="text-white/60 text-[11px] font-bold uppercase tracking-wide mb-1">감지된 수량</p>
            <p className="text-5xl font-black text-green-400 leading-none mb-1">{result.count}</p>
            <p className="text-white/50 text-xs">개 ({result.boxes.length}개 박스 검출)</p>
          </div>
        )}

        {/* 모델 미로드 안내 */}
        {modelReady === false && phase === "camera" && (
          <div className="w-full max-w-5xl bg-orange-900/50 border border-orange-500 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-orange-300 text-xs font-bold">{modelReason || "모델 미로드 — 재로드를 눌러주세요"}</span>
            <button
              onClick={handleReloadModel}
              disabled={reloading}
              className="shrink-0 text-[11px] font-bold px-3 py-1 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg cursor-pointer transition">
              {reloading ? "로드중…" : "모델 재로드"}
            </button>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="px-4 pb-6 flex flex-col gap-3 max-w-5xl mx-auto w-full">
        {phase === "camera" && (
          <button
            onClick={handleCapture}
            disabled={modelReady === false}
            className="flex items-center justify-center gap-2 w-full py-4 bg-green-500 hover:bg-green-400 disabled:bg-gray-600 disabled:opacity-60 text-white font-black text-base rounded-2xl transition shadow-lg cursor-pointer"
          >
            <Camera size={20} />
            촬영 &amp; 분석
          </button>
        )}

        {phase === "result" && result && (
          <>
            <div className="flex gap-3">
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
            </div>
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
    </div>
  );
};
