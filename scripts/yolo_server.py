"""
YOLO 재고세기 마이크로서버 — FastAPI + ultralytics YOLO
포트 8002에서 실행, Node.js 메인 서버가 HTTP로 호출

사전 설치: pip install ultralytics fastapi uvicorn pillow

멀티 모델 지원:
- server/models/ 폴더의 .pt / .onnx 파일을 자동 감지
- 한 번에 1개 모델만 메모리 유지 (Render 512MB 제약)
- 클라이언트가 model 파라미터로 원하는 모델 지정
- 스위칭 시 이전 모델 언로드 + gc + malloc_trim으로 OS 메모리 반납
- asyncio.Lock으로 동시 추론/모델 스위칭 직렬화 (race condition 방지)
"""
import sys, os, base64, io, logging, gc, asyncio

logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ultralytics verbose 끄기
os.environ["YOLO_VERBOSE"] = "False"

# Linux glibc의 malloc arena 반납을 강제하기 위한 ctypes (Render 리눅스 환경 대응)
_malloc_trim = None
try:
    import ctypes
    _libc = ctypes.CDLL("libc.so.6", use_errno=False)
    _malloc_trim = _libc.malloc_trim
except Exception:
    _malloc_trim = None

import numpy as np
from PIL import Image
from ultralytics import YOLO
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
import glob

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "models"))
DEFAULT_MODEL = os.environ.get("YOLO_DEFAULT_MODEL", "best.pt")

# ── 모델 캐시 (한 번에 1개만 유지) ────────────────────────────────────────────
_model = None
_model_key = None  # 현재 로드된 파일명 (예: "best.pt")

def list_models():
    """server/models/ 안의 .pt / .onnx 파일 목록 반환"""
    if not os.path.isdir(MODELS_DIR):
        return []
    files = []
    for ext in ("*.pt", "*.onnx"):
        for p in glob.glob(os.path.join(MODELS_DIR, ext)):
            fname = os.path.basename(p)
            try:
                size = os.path.getsize(p)
            except OSError:
                size = 0
            files.append({"file": fname, "size": size})
    files.sort(key=lambda f: f["file"])
    return files

def load_model(name: Optional[str] = None):
    """
    지정된 파일명 모델을 로드. 이미 로드된 모델이면 재사용.
    새 모델을 로드할 때는 이전 모델을 언로드 (메모리 절약).
    """
    global _model, _model_key
    key = (name or DEFAULT_MODEL).strip()
    if not key:
        key = DEFAULT_MODEL
    if _model is not None and _model_key == key:
        return _model, _model_key
    path = os.path.join(MODELS_DIR, key)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"모델 파일을 찾을 수 없습니다: {key}")

    # 이전 모델 언로드 (OS 메모리까지 반납 시도)
    if _model is not None:
        print(f"[YOLO Server] 이전 모델 언로드: {_model_key}", flush=True)
        try:
            del _model
        except Exception:
            pass
        _model = None
        _model_key = None
        gc.collect()
        # PyTorch/ultralytics는 gc.collect() 후에도 내부 텐서 버퍼를 arena에 보관 →
        # Linux glibc malloc_trim(0)으로 강제 반납해 RSS 최대한 축소
        if _malloc_trim is not None:
            try: _malloc_trim(0)
            except Exception: pass

    print(f"[YOLO Server] 모델 로딩: {key} ({path})", flush=True)
    _model = YOLO(path)
    _model_key = key
    print(f"[YOLO Server] 모델 로딩 완료: {key}", flush=True)
    return _model, _model_key

# 기본 모델 preload (실패해도 서버는 계속 동작)
try:
    load_model(DEFAULT_MODEL)
except Exception as e:
    print(f"[YOLO Server] 기본 모델 로드 실패 (계속 진행): {e}", flush=True)

print("[YOLO Server] 포트 8002 대기 중.", flush=True)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CONF_THRESHOLD = 0.25
IOU_THRESHOLD  = 0.45

class InferRequest(BaseModel):
    data: str
    mimeType: str = "image/jpeg"
    conf: float = CONF_THRESHOLD
    iou: float  = IOU_THRESHOLD
    model: Optional[str] = None  # 파일명 (예: "sku110k-yolo11-s640.onnx"). None이면 현재 로드된 모델 유지

@app.get("/health")
def health():
    return {"ok": True, "loaded": _model_key}

@app.get("/models")
def models():
    return {"models": list_models(), "current": _model_key, "default": DEFAULT_MODEL}

# 동시 요청 직렬화 — ultralytics YOLO는 thread-safe 아님, 모델 스위칭도 race 위험
_inference_lock = asyncio.Lock()

@app.post("/detect")
async def detect(req: InferRequest):
    async with _inference_lock:
        try:
            # 요청에 model이 있고 현재와 다르면 스위칭
            if req.model and req.model != _model_key:
                load_model(req.model)
            elif _model is None:
                load_model(DEFAULT_MODEL)

            img_bytes = base64.b64decode(req.data)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

            results = _model.predict(img, conf=req.conf, iou=req.iou, verbose=False)
            r = results[0]

            boxes_out = []
            w, h = img.width, img.height
            for box in r.boxes:
                xyxy  = box.xyxy[0].tolist()
                score = float(box.conf[0])
                boxes_out.append({
                    "x1": xyxy[0] / w,
                    "y1": xyxy[1] / h,
                    "x2": xyxy[2] / w,
                    "y2": xyxy[3] / h,
                    "score": round(score * 100),
                })

            return {"success": True, "count": len(boxes_out), "boxes": boxes_out, "model": _model_key}
        except Exception as e:
            return {"success": False, "error": str(e), "count": 0, "boxes": [], "model": _model_key}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="error")
