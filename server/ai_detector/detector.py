"""
AI 객체탐지 에이전트 — Detection & Segmentation 지원
ultralytics 기반 (없으면 ONNX Runtime fallback)

지원 모드:
  detect   — YOLOv8/YOLO11 detect 모델 → 바운딩박스 기반 카운팅
  segment  — YOLOv8-seg/YOLO11-seg 모델 → 마스크 기반 카운팅 (겹침 처리 우수)
  classify — (향후 확장) Classification 모델 지원
"""
import sys, os, base64, io, time, logging, json
from abc import ABC, abstractmethod
from typing import Optional

logging.disable(logging.CRITICAL)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

os.environ["YOLO_VERBOSE"] = "False"

import numpy as np
from PIL import Image


# ── 인터페이스 정의 ───────────────────────────────────────────────────────────

class IDetectionAgent(ABC):
    """
    모든 AI 탐지/분류 에이전트의 공통 인터페이스.
    Detection, Segmentation, Classification 모두 이 인터페이스를 구현.
    """

    @abstractmethod
    def detect(self, image: Image.Image, confidence: float = 0.5, iou: float = 0.45) -> dict:
        """
        이미지를 입력받아 탐지 결과 반환.
        반환값:
          {
            "count": int,
            "mode": str,
            "boxes": [{"x": float, "y": float, "w": float, "h": float,
                        "confidence": float, "class_name": str}],
            "masks": [...] | None,  # segment 모드 시
            "class_scores": {...} | None,  # classify 모드 시
            "processing_time_ms": float
          }
        """
        ...

    @abstractmethod
    def is_loaded(self) -> bool:
        """모델이 로드되어 있는지 확인"""
        ...

    @property
    @abstractmethod
    def mode(self) -> str:
        """탐지 모드 (detect | segment | classify)"""
        ...


# ── Detection 에이전트 ────────────────────────────────────────────────────────

class DetectionAgent(IDetectionAgent):
    """
    YOLOv8/YOLO11 detect 모델 기반 객체 탐지 에이전트.
    ultralytics 없으면 ONNX Runtime fallback.
    """

    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._ort_session = None
        self._model_path = model_path
        self._loaded = False
        self._error = ""

        if model_path and os.path.exists(model_path):
            self._load(model_path)

    def _load(self, path: str):
        try:
            from ultralytics import YOLO
            self._model = YOLO(path)
            self._loaded = True
            print(f"[DetectionAgent] ultralytics YOLO 로드 완료: {path}", flush=True)
        except ImportError:
            # ultralytics 없으면 ONNX Runtime fallback
            try:
                import onnxruntime as ort
                self._ort_session = ort.InferenceSession(path)
                self._loaded = True
                print(f"[DetectionAgent] ONNX Runtime fallback 로드 완료: {path}", flush=True)
            except Exception as e:
                self._error = f"ONNX 로드 실패: {e}"
                print(f"[DetectionAgent] 로드 실패: {e}", flush=True)
        except Exception as e:
            self._error = str(e)
            print(f"[DetectionAgent] 로드 실패: {e}", flush=True)

    def load(self, model_path: str):
        """외부에서 모델 경로 지정해 로드"""
        self._model_path = model_path
        self._model = None
        self._ort_session = None
        self._loaded = False
        self._load(model_path)

    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def mode(self) -> str:
        return "detect"

    def detect(self, image: Image.Image, confidence: float = 0.5, iou: float = 0.45) -> dict:
        t0 = time.time()

        if not self._loaded:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": 0,
                "error": self._error or "모델 미로드"
            }

        try:
            if self._model is not None:
                return self._detect_ultralytics(image, confidence, iou, t0)
            elif self._ort_session is not None:
                return self._detect_onnx(image, confidence, iou, t0)
        except Exception as e:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": round((time.time() - t0) * 1000, 1),
                "error": str(e)
            }

        return {"count": 0, "mode": self.mode, "boxes": [], "masks": None, "class_scores": None,
                "processing_time_ms": 0, "error": "알 수 없는 오류"}

    def _detect_ultralytics(self, image: Image.Image, conf: float, iou: float, t0: float) -> dict:
        results = self._model.predict(image, conf=conf, iou=iou, verbose=False)
        r = results[0]
        w, h = image.width, image.height
        boxes_out = []
        names = r.names if hasattr(r, "names") else {}

        for box in r.boxes:
            xyxy = box.xyxy[0].tolist()
            score = float(box.conf[0])
            cls_id = int(box.cls[0]) if hasattr(box, "cls") else 0
            cls_name = names.get(cls_id, str(cls_id)) if names else str(cls_id)
            bx = (xyxy[0] + xyxy[2]) / 2 / w  # center_x normalized
            by = (xyxy[1] + xyxy[3]) / 2 / h  # center_y normalized
            bw = (xyxy[2] - xyxy[0]) / w
            bh = (xyxy[3] - xyxy[1]) / h
            boxes_out.append({
                "x": round(bx, 6), "y": round(by, 6),
                "w": round(bw, 6), "h": round(bh, 6),
                "x1": round(xyxy[0] / w, 6), "y1": round(xyxy[1] / h, 6),
                "x2": round(xyxy[2] / w, 6), "y2": round(xyxy[3] / h, 6),
                "confidence": round(score, 4),
                "class_name": cls_name,
            })

        return {
            "count": len(boxes_out),
            "mode": self.mode,
            "boxes": boxes_out,
            "masks": None,
            "class_scores": None,
            "processing_time_ms": round((time.time() - t0) * 1000, 1),
        }

    def _detect_onnx(self, image: Image.Image, conf: float, iou: float, t0: float) -> dict:
        """ONNX Runtime 직접 추론 (ultralytics 없을 때 fallback)"""
        input_size = 640
        img = image.resize((input_size, input_size))
        arr = np.array(img, dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)[np.newaxis]  # CHW → NCHW

        sess = self._ort_session
        input_name = sess.get_inputs()[0].name
        out = sess.run(None, {input_name: arr})[0]

        # YOLO 출력 후처리 (anchors, 4+classes)
        if out.ndim == 3:
            out = out[0]  # (rows, anchors) or (anchors, rows)
            if out.shape[0] < out.shape[1]:
                out = out.T  # (anchors, rows)

        boxes_raw, scores_raw = [], []
        w, h = image.width, image.height

        for row in out:
            cx, cy, bw, bh = row[0], row[1], row[2], row[3]
            class_scores = row[4:]
            score = float(class_scores.max())
            if score < conf:
                continue
            x1 = (cx - bw / 2) / input_size
            y1 = (cy - bh / 2) / input_size
            x2 = (cx + bw / 2) / input_size
            y2 = (cy + bh / 2) / input_size
            boxes_raw.append([x1, y1, x2, y2])
            scores_raw.append(score)

        # NMS
        kept = _nms(boxes_raw, scores_raw, iou)
        boxes_out = []
        for i in kept:
            x1, y1, x2, y2 = boxes_raw[i]
            bx = (x1 + x2) / 2
            by = (y1 + y2) / 2
            bw = x2 - x1
            bh = y2 - y1
            boxes_out.append({
                "x": round(bx, 6), "y": round(by, 6),
                "w": round(bw, 6), "h": round(bh, 6),
                "x1": round(x1, 6), "y1": round(y1, 6),
                "x2": round(x2, 6), "y2": round(y2, 6),
                "confidence": round(scores_raw[i], 4),
                "class_name": "object",
            })

        return {
            "count": len(boxes_out),
            "mode": self.mode,
            "boxes": boxes_out,
            "masks": None,
            "class_scores": None,
            "processing_time_ms": round((time.time() - t0) * 1000, 1),
        }


# ── Segmentation 에이전트 ─────────────────────────────────────────────────────

class SegmentationAgent(IDetectionAgent):
    """
    YOLOv8-seg/YOLO11-seg 모델 기반 인스턴스 분할 에이전트.
    마스크 기반으로 겹쳐진 물체도 정확히 카운팅.
    """

    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._model_path = model_path
        self._loaded = False
        self._error = ""

        if model_path and os.path.exists(model_path):
            self._load(model_path)

    def _load(self, path: str):
        try:
            from ultralytics import YOLO
            self._model = YOLO(path)
            self._loaded = True
            print(f"[SegmentationAgent] ultralytics YOLO-seg 로드 완료: {path}", flush=True)
        except ImportError:
            self._error = "ultralytics 미설치 — Segmentation은 ultralytics 필수"
            print(f"[SegmentationAgent] ultralytics 없음 (ONNX seg fallback 미지원)", flush=True)
        except Exception as e:
            self._error = str(e)
            print(f"[SegmentationAgent] 로드 실패: {e}", flush=True)

    def load(self, model_path: str):
        self._model_path = model_path
        self._model = None
        self._loaded = False
        self._load(model_path)

    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def mode(self) -> str:
        return "segment"

    def detect(self, image: Image.Image, confidence: float = 0.5, iou: float = 0.45) -> dict:
        t0 = time.time()

        if not self._loaded or self._model is None:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": 0,
                "error": self._error or "세그멘테이션 모델 미로드"
            }

        try:
            results = self._model.predict(image, conf=confidence, iou=iou, verbose=False)
            r = results[0]
            w, h = image.width, image.height
            boxes_out = []
            masks_out = []
            names = r.names if hasattr(r, "names") else {}

            for i, box in enumerate(r.boxes):
                xyxy = box.xyxy[0].tolist()
                score = float(box.conf[0])
                cls_id = int(box.cls[0]) if hasattr(box, "cls") else 0
                cls_name = names.get(cls_id, str(cls_id)) if names else str(cls_id)
                bx = (xyxy[0] + xyxy[2]) / 2 / w
                by = (xyxy[1] + xyxy[3]) / 2 / h
                bw = (xyxy[2] - xyxy[0]) / w
                bh = (xyxy[3] - xyxy[1]) / h
                boxes_out.append({
                    "x": round(bx, 6), "y": round(by, 6),
                    "w": round(bw, 6), "h": round(bh, 6),
                    "x1": round(xyxy[0] / w, 6), "y1": round(xyxy[1] / h, 6),
                    "x2": round(xyxy[2] / w, 6), "y2": round(xyxy[3] / h, 6),
                    "confidence": round(score, 4),
                    "class_name": cls_name,
                })

                # 마스크 데이터 (있을 경우)
                if r.masks is not None and i < len(r.masks.data):
                    mask_arr = r.masks.data[i].cpu().numpy()
                    # 마스크를 축약 버전으로 직렬화 (픽셀 데이터 대신 외곽선 점들)
                    contour_pts = _mask_to_contour(mask_arr, w, h)
                    masks_out.append(contour_pts)

            return {
                "count": len(boxes_out),
                "mode": self.mode,
                "boxes": boxes_out,
                "masks": masks_out if masks_out else None,
                "class_scores": None,
                "processing_time_ms": round((time.time() - t0) * 1000, 1),
            }

        except Exception as e:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": round((time.time() - t0) * 1000, 1),
                "error": str(e)
            }


# ── Classification 에이전트 (확장 예약) ──────────────────────────────────────

class ClassificationAgent(IDetectionAgent):
    """
    향후 확장: YOLOv8-cls/YOLO11-cls 모델 기반 이미지 분류 에이전트.
    현재는 인터페이스만 구현 (stub).
    """

    def __init__(self, model_path: Optional[str] = None):
        self._model = None
        self._model_path = model_path
        self._loaded = False

        if model_path and os.path.exists(model_path):
            try:
                from ultralytics import YOLO
                self._model = YOLO(model_path)
                self._loaded = True
                print(f"[ClassificationAgent] 로드 완료: {model_path}", flush=True)
            except Exception as e:
                print(f"[ClassificationAgent] 로드 실패: {e}", flush=True)

    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def mode(self) -> str:
        return "classify"

    def detect(self, image: Image.Image, confidence: float = 0.5, iou: float = 0.45) -> dict:
        t0 = time.time()
        if not self._loaded or self._model is None:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": 0,
                "error": "분류 모델 미로드"
            }
        try:
            results = self._model.predict(image, verbose=False)
            r = results[0]
            names = r.names if hasattr(r, "names") else {}
            probs = r.probs
            class_scores = {}
            if probs is not None:
                for idx, score in enumerate(probs.data.tolist()):
                    if score >= confidence:
                        class_scores[names.get(idx, str(idx))] = round(score, 4)
            top_class = max(class_scores, key=class_scores.get) if class_scores else None
            return {
                "count": 1 if top_class else 0,
                "mode": self.mode,
                "boxes": [],
                "masks": None,
                "class_scores": class_scores,
                "top_class": top_class,
                "processing_time_ms": round((time.time() - t0) * 1000, 1),
            }
        except Exception as e:
            return {
                "count": 0, "mode": self.mode, "boxes": [],
                "masks": None, "class_scores": None,
                "processing_time_ms": round((time.time() - t0) * 1000, 1),
                "error": str(e)
            }


# ── 에이전트 팩토리 ───────────────────────────────────────────────────────────

class DetectorFactory:
    """모드 문자열로 적절한 에이전트 인스턴스 반환"""

    @staticmethod
    def create(mode: str, model_path: Optional[str] = None) -> IDetectionAgent:
        mode = mode.lower()
        if mode == "segment":
            return SegmentationAgent(model_path)
        elif mode == "classify":
            return ClassificationAgent(model_path)
        else:
            return DetectionAgent(model_path)


# ── 유틸 함수 ─────────────────────────────────────────────────────────────────

def _nms(boxes: list, scores: list, iou_thr: float) -> list:
    """Non-Maximum Suppression"""
    if not boxes:
        return []
    idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    keep = []
    suppressed = set()
    for i in idx:
        if i in suppressed:
            continue
        keep.append(i)
        for j in idx:
            if j != i and j not in suppressed:
                if _iou(boxes[i], boxes[j]) > iou_thr:
                    suppressed.add(j)
    return keep


def _iou(a: list, b: list) -> float:
    x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
    x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1])
    ub = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (ua + ub - inter + 1e-6)


def _mask_to_contour(mask_arr: np.ndarray, orig_w: int, orig_h: int) -> list:
    """마스크 배열에서 외곽선 점들 추출 (정규화된 좌표)"""
    try:
        import cv2
        mask_uint8 = (mask_arr * 255).astype(np.uint8)
        mask_resized = cv2.resize(mask_uint8, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
        contours, _ = cv2.findContours(mask_resized, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return []
        largest = max(contours, key=cv2.contourArea)
        # 점 수 줄이기 (최대 50점)
        epsilon = 0.01 * cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, epsilon, True)
        return [[float(p[0][0]) / orig_w, float(p[0][1]) / orig_h] for p in approx]
    except ImportError:
        # cv2 없으면 단순 bbox 외곽선
        return []
