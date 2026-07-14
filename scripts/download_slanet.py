"""
SLANet-plus 모델 다운로드 (Python 대체 스크립트)

Node fetch 가 방화벽/네트워크로 실패할 때 사용.
huggingface_hub 로 안정적 다운로드.

실행:
    pip install huggingface_hub
    python scripts/download_slanet.py
"""
import os
from pathlib import Path

MODELS_DIR = Path(__file__).parent.parent / "server" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = [
    ("slanet-plus.onnx", [
        ("RapidAI/RapidTable", "slanet-plus.onnx"),
        ("PaddlePaddle/SLANet_plus", "SLANet_plus.onnx"),
    ]),
    ("slanet-vocab.txt", [
        ("RapidAI/RapidTable", "dict.txt"),
        ("PaddlePaddle/SLANet_plus", "table_structure_dict.txt"),
    ]),
]


def download():
    from huggingface_hub import hf_hub_download
    import shutil

    for target_name, sources in TARGETS:
        target_path = MODELS_DIR / target_name
        if target_path.exists() and target_path.stat().st_size > 100:
            print(f"✓ {target_name} 이미 존재 ({target_path.stat().st_size // 1024} KB)")
            continue

        for repo, filename in sources:
            try:
                print(f"  다운로드 시도: {repo}/{filename}")
                path = hf_hub_download(repo_id=repo, filename=filename, local_dir=str(MODELS_DIR))
                if Path(path).exists() and Path(path).stat().st_size > 100:
                    if Path(path) != target_path:
                        shutil.copy(path, target_path)
                    print(f"✓ {target_name} 완료 ({target_path.stat().st_size // 1024} KB)")
                    break
            except Exception as e:
                print(f"  실패: {e}")
        else:
            print(f"✗ {target_name} 모든 소스 실패")
            return False
    return True


if __name__ == "__main__":
    print("SLANet-plus 다운로드 시작")
    print(f"저장 위치: {MODELS_DIR}\n")
    ok = download()
    if ok:
        print("\n완료. 서버 재시작 후 AI 모델 OCR 실행 시 자동 로드됩니다.")
    else:
        print("\n실패. 수동 다운로드 안내: https://huggingface.co/RapidAI/RapidTable")
