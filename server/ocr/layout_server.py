"""
OCR 문서 레이아웃 검출 마이크로서버 (DocLayout-YOLO 전용)
포트 8004 · Node.js 메인 서버가 HTTP 로 호출

** 재고세기(ai_detector, 포트 8003)와 완전히 분리 **
   - 학습 데이터 다름 (문서 vs 상품)
   - 모델 파일 다름 (doclayout_yolo.pt vs sku110k.pt)
   - 프로세스 다름 (독립 lifecycle)

지원 모드: detect (표·텍스트·제목 bbox 반환)

클래스 (DocStructBench):
  title, plain text, abandon, figure, figure_caption,
  table, table_caption, table_footnote,
  isolate_formula, formula_caption

사전 다운로드: python server/ocr/download_layout_model.py
사전 설치: pip install ultralytics fastapi uvicorn pillow doclayout-yolo
"""
import sys, os, base64, io, time, logging
from pathlib import Path

logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
os.environ["YOLO_VERBOSE"] = "False"

from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn


PORT = int(os.environ.get("OCR_LAYOUT_PORT", "8004"))
MODEL_PATH = os.environ.get(
    "OCR_LAYOUT_MODEL",
    str(Path(__file__).parent.parent / "models" / "doclayout_yolo.pt")
)

# ── 모델 로드 (전역 · 한번만) ────────────────────────────────────────────────
_model = None
_model_error = ""

def _load_model():
    global _model, _model_error
    if _model is not None:
        return
    if not os.path.exists(MODEL_PATH):
        _model_error = f"모델 파일 없음: {MODEL_PATH} — python server/ocr/download_layout_model.py 실행"
        print(f"[OCR-Layout] {_model_error}", flush=True)
        return
    try:
        # DocLayout-YOLO 는 doclayout_yolo 패키지의 커스텀 YOLOv10 사용
        try:
            from doclayout_yolo import YOLOv10
            _model = YOLOv10(MODEL_PATH)
            print(f"[OCR-Layout] doclayout_yolo YOLOv10 로드: {MODEL_PATH}", flush=True)
        except ImportError:
            # doclayout_yolo 미설치 → 일반 ultralytics YOLO 로 시도 (호환 안 될 수도)
            from ultralytics import YOLO
            _model = YOLO(MODEL_PATH)
            print(f"[OCR-Layout] ultralytics YOLO 로드 (doclayout_yolo 미설치 · 호환성 주의): {MODEL_PATH}", flush=True)
    except Exception as e:
        _model_error = f"모델 로드 실패: {e}"
        print(f"[OCR-Layout] {_model_error}", flush=True)


# ── FastAPI ──────────────────────────────────────────────────────────────────
app = FastAPI(title="OCR Layout Server (DocLayout-YOLO)", version="1.0.0")


class DetectRequest(BaseModel):
    data: str = Field(..., description="base64 이미지")
    mimeType: str = Field("image/jpeg")
    confidence: float = Field(0.4, ge=0.05, le=0.95)


@app.get("/health")
def health():
    _load_model()
    return {
        "ok": _model is not None,
        "model_path": MODEL_PATH,
        "model_exists": os.path.exists(MODEL_PATH),
        "error": _model_error if _model is None else None,
        "port": PORT,
    }


@app.post("/detect")
def detect(req: DetectRequest):
    _load_model()
    if _model is None:
        raise HTTPException(status_code=503, detail=_model_error or "모델 미로드")

    try:
        img_bytes = base64.b64decode(req.data)
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"이미지 디코드 실패: {e}")

    t0 = time.time()
    try:
        # doclayout_yolo YOLOv10: predict(image, imgsz=1024, conf, ...)
        results = _model.predict(image, imgsz=1024, conf=req.confidence, device="cpu", verbose=False)
        r = results[0]
        w, h = image.width, image.height
        boxes_out = []
        names = getattr(r, "names", {}) or {}

        for box in r.boxes:
            xyxy = box.xyxy[0].tolist()
            score = float(box.conf[0])
            cls_id = int(box.cls[0]) if hasattr(box, "cls") else 0
            cls_name = names.get(cls_id, str(cls_id)) if names else str(cls_id)
            boxes_out.append({
                "x1": round(xyxy[0] / w, 6),
                "y1": round(xyxy[1] / h, 6),
                "x2": round(xyxy[2] / w, 6),
                "y2": round(xyxy[3] / h, 6),
                "confidence": round(score, 4),
                "class_name": cls_name,
            })

        return {
            "success": True,
            "count": len(boxes_out),
            "boxes": boxes_out,
            "processing_time_ms": round((time.time() - t0) * 1000, 1),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"레이아웃 검출 실패: {e}")


if __name__ == "__main__":
    print(f"[OCR-Layout] 시작 중 (port={PORT})", flush=True)
    print(f"[OCR-Layout] 모델: {MODEL_PATH}", flush=True)
    _load_model()
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")
