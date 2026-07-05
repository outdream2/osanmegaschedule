"""
AI 탐지 마이크로서버 — FastAPI
포트 8003에서 실행, Node.js 메인 서버가 HTTP로 호출

지원 모드:
  detect   — 기본 객체 탐지 (바운딩박스)
  segment  — 인스턴스 분할 (마스크 + 박스)
  classify — 이미지 분류 (향후 확장)

사전 설치: pip install ultralytics fastapi uvicorn pillow opencv-python numpy
"""
import sys, os, base64, io, logging

logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

os.environ["YOLO_VERBOSE"] = "False"

from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# detector.py를 같은 디렉터리에서 import
sys.path.insert(0, os.path.dirname(__file__))
from detector import DetectorFactory, DetectionAgent, SegmentationAgent, IDetectionAgent

# ── 설정 ─────────────────────────────────────────────────────────────────────

PORT = int(os.environ.get("AI_DETECTOR_PORT", "8003"))

# 모델 경로 (환경변수 또는 기본값)
# detect 모드 기본 모델: 기존 YOLO ONNX 또는 .pt
DEFAULT_DETECT_MODEL = os.environ.get(
    "AI_DETECT_MODEL",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "sku110k-yolo11-n640.pt"))
)
# segment 모드 기본 모델 (없으면 detect 모델로 시도)
DEFAULT_SEGMENT_MODEL = os.environ.get(
    "AI_SEGMENT_MODEL",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "best-seg.pt"))
)

# ── 에이전트 캐시 (모드별 1개 유지) ─────────────────────────────────────────

_agents: dict[str, IDetectionAgent] = {}

def _get_agent(mode: str, model_path: str | None = None) -> IDetectionAgent:
    """모드별 에이전트 캐시. 같은 모드면 재사용."""
    key = f"{mode}:{model_path}"
    if key not in _agents:
        # 기본 모델 경로 결정
        if model_path is None:
            if mode == "segment":
                model_path = DEFAULT_SEGMENT_MODEL if os.path.exists(DEFAULT_SEGMENT_MODEL) else DEFAULT_DETECT_MODEL
            elif mode == "classify":
                model_path = None
            else:
                model_path = DEFAULT_DETECT_MODEL
        _agents[key] = DetectorFactory.create(mode, model_path)
    return _agents[key]


# ── FastAPI 앱 ────────────────────────────────────────────────────────────────

app = FastAPI(title="AI Detector Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    data: str = Field(..., description="base64 인코딩된 이미지 데이터")
    mimeType: str = Field("image/jpeg", description="이미지 MIME 타입")
    mode: str = Field("detect", description="탐지 모드: detect | segment | classify")
    confidence: float = Field(0.5, ge=0.05, le=0.95, description="신뢰도 임계값")
    iou: float = Field(0.45, ge=0.1, le=0.9, description="IOU 임계값 (NMS용)")
    model_path: str | None = Field(None, description="커스텀 모델 경로 (선택)")


class StatusResponse(BaseModel):
    ok: bool
    modes: dict
    default_detect_model: str
    default_segment_model: str
    port: int


@app.get("/health", response_model=StatusResponse)
def health():
    modes = {}
    for mode in ["detect", "segment"]:
        try:
            agent = _get_agent(mode)
            modes[mode] = {
                "loaded": agent.is_loaded(),
                "mode": agent.mode,
            }
        except Exception as e:
            modes[mode] = {"loaded": False, "error": str(e)}

    return StatusResponse(
        ok=any(v.get("loaded", False) for v in modes.values()),
        modes=modes,
        default_detect_model=DEFAULT_DETECT_MODEL,
        default_segment_model=DEFAULT_SEGMENT_MODEL,
        port=PORT,
    )


@app.post("/detect")
def detect(req: DetectRequest):
    try:
        img_bytes = base64.b64decode(req.data)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코드 실패: {e}")

    mode = req.mode.lower()
    if mode not in ("detect", "segment", "classify"):
        raise HTTPException(status_code=400, detail=f"지원하지 않는 모드: {mode}")

    agent = _get_agent(mode, req.model_path)

    if not agent.is_loaded():
        raise HTTPException(
            status_code=503,
            detail=f"모델 미로드 (mode={mode}) — 서버 로그를 확인하세요"
        )

    result = agent.detect(image, confidence=req.confidence, iou=req.iou)

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {"success": True, **result}


@app.post("/reload")
def reload_agents():
    """에이전트 캐시 초기화 후 재로드"""
    _agents.clear()
    # 기본 에이전트 미리 로드
    for mode in ["detect"]:
        _get_agent(mode)
    return {"success": True, "message": "에이전트 재로드 완료"}


if __name__ == "__main__":
    print(f"[AI Detector Server] 시작 중 (port={PORT})", flush=True)
    print(f"[AI Detector Server] detect 모델: {DEFAULT_DETECT_MODEL}", flush=True)
    print(f"[AI Detector Server] segment 모델: {DEFAULT_SEGMENT_MODEL}", flush=True)

    # 서버 시작 시 detect 에이전트 미리 로드
    _get_agent("detect")

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")
