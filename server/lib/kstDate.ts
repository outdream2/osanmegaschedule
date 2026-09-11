// server/lib/kstDate.ts
// 2026-09-11 · #116 · KST off-by-one fix · 서버 시간대(UTC/KST) 무관 · 항상 KST 반환

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstYmd(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getKstYmdFrom(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextKstYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  const ny = date.getUTCFullYear();
  const nm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(date.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}
