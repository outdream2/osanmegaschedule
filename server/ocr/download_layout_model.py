"""
DocLayout-YOLO ONNX 모델 다운로드 스크립트 (일회 실행)
문서 레이아웃(표·텍스트·제목·그림) 검출용 · 거래명세서 셀 정렬 개선

모델: juliozhao/DocLayout-YOLO-DocStructBench 또는 wybxc/DocLayout-YOLO-DocStructBench-onnx
클래스: title, plain text, abandon, figure, figure_caption, table, table_caption,
        table_footnote, isolate_formula, formula_caption

사용:
    python server/ai_detector/download_layout_model.py
"""
import os
import sys
from pathlib import Path

MODELS_DIR = Path(__file__).parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

TARGET_PATH = MODELS_DIR / "doclayout_yolo.pt"

def download():
    if TARGET_PATH.exists():
        print(f"[download_layout] 이미 존재: {TARGET_PATH} (크기: {TARGET_PATH.stat().st_size // 1024 // 1024}MB)")
        return str(TARGET_PATH)

    print(f"[download_layout] DocLayout-YOLO 다운로드 시작 → {TARGET_PATH}")

    try:
        from huggingface_hub import hf_hub_download
        # 공식 저자의 pretrained 모델 (~40MB)
        path = hf_hub_download(
            repo_id="juliozhao/DocLayout-YOLO-DocStructBench",
            filename="doclayout_yolo_docstructbench_imgsz1024.pt",
            local_dir=str(MODELS_DIR),
        )
        # 표준 파일명으로 이름 통일
        import shutil
        if path != str(TARGET_PATH):
            shutil.copy(path, TARGET_PATH)
        print(f"[download_layout] 완료: {TARGET_PATH} (크기: {TARGET_PATH.stat().st_size // 1024 // 1024}MB)")
        return str(TARGET_PATH)
    except ImportError:
        print("[download_layout] huggingface_hub 미설치 → pip install huggingface_hub")
        sys.exit(1)
    except Exception as e:
        print(f"[download_layout] 실패: {e}")
        print("[download_layout] 수동 다운로드: https://huggingface.co/juliozhao/DocLayout-YOLO-DocStructBench")
        sys.exit(1)


if __name__ == "__main__":
    download()
