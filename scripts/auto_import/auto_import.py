"""
scripts/auto_import/auto_import.py
2026-08-24 · #253 Phase B · 자동 임포트 · 로컬 폴더 감시 → 서버 API 업로드

동작:
1. config.ini 로드 · 서버 URL + 관리자 credential (초기 설치 시 embed)
2. 서버 로그인 (POST /api/auth/login) → JWT cookie
3. 서버 config 조회 (GET /api/auto-import/config)
   - enabled=false → 즉시 종료
4. 4개 폴더 순회 (products·stock·vendors·purchase)
   - 최신 xlsx 감지 · hash 로 중복 임포트 방지 (imported.json)
   - 파일명 그대로 서버 API POST (기존 파싱 규칙 재사용)
   - 성공 → 표준 파일명 rename + after_import 처리 (keep/move/delete)
   - 실패 → _failed/ 이동 + .log
5. heartbeat 리포트 (POST /api/auto-import/heartbeat)
   - 처리 건수·에러·applied_interval

요구사항: Python 3.8+ · pip install requests
"""

import configparser
import hashlib
import json
import logging
import os
import re
import shutil
import socket
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config.ini"
IMPORTED_PATH = SCRIPT_DIR / "imported.json"
LOG_DIR = SCRIPT_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

SCRIPT_VERSION = "1.0.0"


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("auto_import")
    logger.setLevel(logging.INFO)
    if logger.handlers:
        return logger
    stamp = datetime.now().strftime("%Y-%m-%d")
    fh = logging.FileHandler(LOG_DIR / f"auto_import_{stamp}.log", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger


log = setup_logger()


def load_local_config() -> configparser.ConfigParser:
    """로컬 config.ini · 서버 URL + 관리자 credential 만 저장 (폴더·간격 등은 서버 KV)"""
    if not CONFIG_PATH.exists():
        log.error(f"config.ini 없음 · 설치 파일 다운로드 후 재설치 · {CONFIG_PATH}")
        sys.exit(1)
    cfg = configparser.ConfigParser()
    cfg.read(CONFIG_PATH, encoding="utf-8")
    return cfg


def load_imported() -> dict:
    if not IMPORTED_PATH.exists():
        return {}
    try:
        return json.loads(IMPORTED_PATH.read_text(encoding="utf-8"))
    except Exception:
        log.warning("imported.json 파싱 실패 · 빈 이력으로 시작")
        return {}


def save_imported(data: dict) -> None:
    IMPORTED_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def file_hash(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def login(session: requests.Session, url: str, phone: str, password: str) -> None:
    r = session.post(f"{url}/api/auth/login", json={"employee_id": phone, "password": password}, timeout=30)
    r.raise_for_status()
    data = r.json()
    if (data.get("level") or 0) < 9:
        raise RuntimeError(f"관리자 lv9 필요 · 현재 lv={data.get('level')}")
    log.info(f"로그인 성공 · {data.get('name', '?')} · lv={data.get('level', '?')}")


def get_server_config(session: requests.Session, url: str) -> dict:
    r = session.get(f"{url}/api/auto-import/config", timeout=30)
    r.raise_for_status()
    body = r.json()
    return body.get("value") if isinstance(body, dict) else body


def send_heartbeat(session: requests.Session, url: str, payload: dict) -> None:
    try:
        r = session.post(f"{url}/api/auto-import/heartbeat", json=payload, timeout=30)
        r.raise_for_status()
    except Exception as e:
        log.warning(f"heartbeat 전송 실패 · {e}")


def expand_path(p: str) -> Path:
    """환경변수 확장 (%USERPROFILE% 등) + Path 변환"""
    return Path(os.path.expandvars(p))


DATE_RE = re.compile(r"(\d{4})[-_]?(\d{2})[-_]?(\d{2})")


def parse_dates(filename: str) -> Tuple[Optional[str], Optional[str]]:
    """파일명에서 시작~종료 날짜 파싱 · 실패 시 (None, None)"""
    stem = Path(filename).stem
    matches = DATE_RE.findall(stem)
    if not matches:
        return None, None
    if len(matches) >= 2:
        s = matches[0]; e = matches[1]
        return f"{s[0]}-{s[1]}-{s[2]}", f"{e[0]}-{e[1]}-{e[2]}"
    m = matches[0]
    d = f"{m[0]}-{m[1]}-{m[2]}"
    return d, d


def period_type(date_str: str) -> str:
    dd = int(date_str[-2:])
    return "early" if dd <= 10 else "mid" if dd <= 20 else "late"


def latest_xlsx(folder: Path) -> Optional[Path]:
    if not folder.exists():
        return None
    files = [p for p in folder.glob("*.xlsx") if not p.name.startswith("~$") and p.is_file()]
    if not files:
        return None
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files[0]


def standard_name(category: str, dates: Optional[Tuple[str, str]]) -> str:
    """표준 파일명 생성 · products/vendors 는 timestamp · stock/purchase 는 date range"""
    if category in ("stock", "purchase") and dates:
        start = dates[0].replace("-", "") if dates[0] else ""
        end = dates[1].replace("-", "") if dates[1] else ""
        return f"{category}_{start}_{end}.xlsx"
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{category}_{ts}.xlsx"


def apply_after_import(file_path: Path, after: str, new_name: str, auto_rename: bool) -> None:
    """after_import 정책 반영 · keep / move_to_processed / delete"""
    if after == "delete":
        try: file_path.unlink()
        except Exception as e: log.warning(f"삭제 실패 · {file_path.name} · {e}")
        return
    target_name = new_name if auto_rename else file_path.name
    if after == "move_to_processed":
        target_dir = file_path.parent / "_processed"
        target_dir.mkdir(exist_ok=True)
        target = target_dir / target_name
        # 중복 방지 · _2, _3 suffix
        i = 1
        while target.exists():
            i += 1
            stem = Path(target_name).stem
            target = target_dir / f"{stem}_{i}.xlsx"
        shutil.move(str(file_path), str(target))
    elif auto_rename and target_name != file_path.name:
        # keep + rename
        target = file_path.parent / target_name
        if not target.exists():
            file_path.rename(target)


def move_to_failed(file_path: Path, error_msg: str) -> None:
    try:
        failed_dir = file_path.parent / "_failed"
        failed_dir.mkdir(exist_ok=True)
        target = failed_dir / file_path.name
        i = 1
        while target.exists():
            i += 1
            stem = file_path.stem
            target = failed_dir / f"{stem}_{i}{file_path.suffix}"
        shutil.move(str(file_path), str(target))
        (failed_dir / f"{target.stem}.log").write_text(
            f"{datetime.now().isoformat()}\n{error_msg}\n", encoding="utf-8"
        )
    except Exception as e:
        log.warning(f"_failed 이동 실패 · {file_path.name} · {e}")


# 2026-08-24 · 사용자 지시 · 공급사 제외 · 3 카테고리 (상품·재고·매입)
CATEGORY_ENDPOINTS = {
    "products": ("/api/upload-products", False),
    "stock":    ("/api/upload-stock",    True),
    "purchase": ("/api/upload-purchase-details", True),
}


def upload_file(
    session: requests.Session, base_url: str, category: str, file_path: Path,
    manager_id: str, dates: Optional[Tuple[str, str]],
) -> dict:
    endpoint, needs_dates = CATEGORY_ENDPOINTS[category]
    params: dict = {"managerId": manager_id}
    if needs_dates:
        if not dates or not dates[0] or not dates[1]:
            raise ValueError(f"[{category}] 파일명 날짜 파싱 실패 · 예: {category}_YYYYMMDD_YYYYMMDD.xlsx")
        if category == "stock":
            params["snapshot_date"] = dates[1]
            params["start_date"] = dates[0]
            params["period_type"] = period_type(dates[1])
            params["force"] = "true"
        else:  # purchase
            params["filename"] = file_path.name
            params["from"] = dates[0]
            params["to"] = dates[1]
            params["force"] = "true"
    with open(file_path, "rb") as f:
        r = session.post(f"{base_url}{endpoint}", params=params, data=f.read(),
                         headers={"Content-Type": "application/octet-stream"}, timeout=300)
    r.raise_for_status()
    return r.json() if r.headers.get("content-type", "").startswith("application/json") else {}


def process_category(
    session: requests.Session, base_url: str, cfg: dict,
    category: str, imported: dict, manager_id: str,
) -> Tuple[int, Optional[str]]:
    """단일 카테고리 처리 · (신규 처리 건수, 에러메시지)"""
    folder_str = cfg.get("folders", {}).get(category, "").strip()
    if not folder_str:
        return 0, None
    folder = expand_path(folder_str)
    if not folder.exists():
        if cfg.get("folder_auto_create"):
            try:
                folder.mkdir(parents=True, exist_ok=True)
                log.info(f"[{category}] 폴더 자동 생성 · {folder}")
            except Exception as e:
                return 0, f"폴더 생성 실패: {e}"
        else:
            return 0, f"폴더 없음: {folder}"

    latest = latest_xlsx(folder)
    if latest is None:
        return 0, None

    fhash = file_hash(latest)
    key = f"{category}:{fhash}"
    if key in imported:
        return 0, None

    dates = parse_dates(latest.name)
    try:
        result = upload_file(session, base_url, category, latest, manager_id, dates)
        imported[key] = {"file": latest.name, "hash": fhash, "at": datetime.now().isoformat(), "result": result}
        new_name = standard_name(category, dates)
        apply_after_import(latest, cfg.get("after_import", "move_to_processed"), new_name, cfg.get("auto_rename", True))
        log.info(f"[{category}] ✓ {latest.name} 임포트 완료 → {new_name}")
        return 1, None
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        log.error(f"[{category}] 실패 · {latest.name} · {err}")
        move_to_failed(latest, err)
        return 0, err


def main() -> int:
    log.info("=" * 60)
    log.info(f"자동 임포트 시작 · v{SCRIPT_VERSION}")

    local_cfg = load_local_config()
    base_url = local_cfg["server"]["url"].rstrip("/")
    phone = local_cfg["server"]["admin_phone"]
    password = local_cfg["server"]["admin_password"]
    manager_id = local_cfg["server"].get("manager_id", "1")

    session = requests.Session()

    # 로그인
    try:
        login(session, base_url, phone, password)
    except Exception as e:
        log.error(f"로그인 실패 · {e}")
        return 1

    # 서버 config 조회
    try:
        server_cfg = get_server_config(session, base_url) or {}
    except Exception as e:
        log.error(f"config 조회 실패 · {e}")
        return 1

    if not server_cfg.get("enabled"):
        log.info("자동 임포트 비활성 · 종료")
        send_heartbeat(session, base_url, {
            "at": datetime.now().isoformat(),
            "status": "disabled",
            "processed": {},
            "errors": [],
            "script_version": SCRIPT_VERSION,
            "host": socket.gethostname(),
        })
        return 0

    imported = load_imported()
    processed: dict = {}
    errors: list = []

    # 2026-08-24 · 사용자 지시 · 카테고리별 개별 interval · last_check_at 기반 스킵 판정
    last_checks = imported.get("__last_check__", {})
    intervals = server_cfg.get("intervals", {}) or {}
    now_ts = datetime.now().timestamp()

    for category in ("products", "stock", "purchase"):
        # 카테고리별 interval 체크 · 지난 실행 이후 interval 미경과 시 skip
        interval_min = intervals.get(category)
        last_iso = last_checks.get(category)
        if interval_min and last_iso:
            try:
                last_ts = datetime.fromisoformat(last_iso).timestamp()
                elapsed_min = (now_ts - last_ts) / 60
                if elapsed_min < interval_min:
                    log.info(f"[{category}] skip · 마지막 실행 {elapsed_min:.1f}분전 · interval {interval_min}분 미경과")
                    processed[category] = 0
                    continue
            except Exception:
                pass  # 파싱 실패 시 · 처리 진행

        count, err = process_category(session, base_url, server_cfg, category, imported, manager_id)
        processed[category] = count
        # last_check 갱신 (skip 안 한 경우만 · 성공/실패 무관)
        last_checks[category] = datetime.now().isoformat()
        if err:
            errors.append({"category": category, "error": err})

    imported["__last_check__"] = last_checks

    save_imported(imported)

    total = sum(processed.values())
    log.info(f"완료 · 신규 임포트 {total}건 (products={processed.get('products', 0)} stock={processed.get('stock', 0)} purchase={processed.get('purchase', 0)})")

    send_heartbeat(session, base_url, {
        "at": datetime.now().isoformat(),
        "status": "ok" if not errors else "error",
        "processed": processed,
        "errors": errors,
        "applied_interval": server_cfg.get("base_interval_minutes"),
        "script_version": SCRIPT_VERSION,
        "host": socket.gethostname(),
    })
    log.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
