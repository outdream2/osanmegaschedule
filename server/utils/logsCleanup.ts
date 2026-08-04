// 서버 부팅 시 오래된 로그 파일 자동 정리 (T38 · 디스크 누수 방어)
// ocr-<timestamp>.json 등 · 14일 초과 파일 삭제.
// OCR 라우터 내부 30개 유지 로직과 별개로 · OCR 미실행 기간에도 강제 정리.

import fs from "fs";
import path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CLEAN_PATTERNS = [
  /^ocr-\d/,       // ocr-2026-07-27T...json (timestamped)
];

export async function cleanupStaleLogs(): Promise<void> {
  try {
    const files = await fs.promises.readdir(LOGS_DIR).catch(() => [] as string[]);
    if (files.length === 0) return;
    const cutoff = Date.now() - MAX_AGE_MS;
    let removed = 0;
    for (const f of files) {
      if (!CLEAN_PATTERNS.some(re => re.test(f))) continue;
      const p = path.join(LOGS_DIR, f);
      const stat = await fs.promises.stat(p).catch(() => null);
      if (!stat) continue;
      if (stat.mtimeMs < cutoff) {
        await fs.promises.unlink(p).catch(() => { /* noop */ });
        removed++;
      }
    }
    if (removed > 0) console.log(`[logs-cleanup] ${removed}개 오래된 로그 파일 삭제 (>${MAX_AGE_MS / (24 * 60 * 60 * 1000)}일)`);
  } catch (e: any) {
    console.warn("[logs-cleanup] 실패 (무시):", e?.message);
  }
}
