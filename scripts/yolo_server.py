"""
YOLO 재고세기 마이크로서버 — FastAPI + ultralytics YOLO
포트 8002에서 실행, Node.js 메인 서버가 HTTP로 호출

사전 설치: pip install ultralytics fastapi uvicorn pillow
"""
import sys, os, base64, io, logging

logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ultralytics verbose 끄기
os.environ["YOLO_VERBOSE"] = "False"

import numpy as np
from PIL import Image
from ultralytics import YOLO
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "server", "models", "best.pt")
MODEL_PATH = os.path.abspath(MODEL_PATH)

print(f"[YOLO Server] 모델 로딩 중: {MODEL_PATH}", flush=True)
model = YOLO(MODEL_PATH)
print("[YOLO Server] 모델 로딩 완료. 포트 8002 대기 중.", flush=True)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CONF_THRESHOLD = 0.25
IOU_THRESHOLD  = 0.45

class InferRequest(BaseModel):
    data: str      # base64 이미지
    mimeType: str = "image/jpeg"
    conf: float = CONF_THRESHOLD
    iou: float  = IOU_THRESHOLD

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/detect")
def detect(req: InferRequest):
    try:
        img_bytes = base64.b64decode(req.data)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        results = model.predict(img, conf=req.conf, iou=req.iou, verbose=False)
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

        return {"success": True, "count": len(boxes_out), "boxes": boxes_out}
    except Exception as e:
        return {"success": False, "error": str(e), "count": 0, "boxes": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="error")
