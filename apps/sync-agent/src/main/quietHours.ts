// 2026-10-06 · 야간 동기화 금지 (quiet hours) 순수 helpers
//   · Electron 의존성 없음 → vitest 로 직접 import 가능
//   · config.ts 가 import 해서 사용 · business logic 변경 X

export interface QuietHours {
  enabled: boolean;
  startTime: string;  // "HH:MM" · 포함 (23:00 부터 skip 시작)
  endTime: string;    // "HH:MM" · 제외 (08:00 부터 재개)
}

/** "HH:MM" → 분단위 숫자. 포맷 불량/범위 초과 시 NaN. */
export function parseHM(hm: string | undefined | null): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm ?? "").trim());
  if (!m) return NaN;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return NaN;
  return h * 60 + mm;
}

/**
 * quietHours 설정 기반 "현재 금지 시간인지" 판정.
 *   · enabled=false → false
 *   · 비정상 입력 (NaN · start===end) → false (crash 방지)
 *   · start<end → [start, end) 범위
 *   · start>end → 자정 가로지름 · [start, 24:00) OR [00:00, end)
 */
export function isInQuietHoursPure(qh: QuietHours | undefined, now: Date = new Date()): boolean {
  if (!qh?.enabled) return false;
  const start = parseHM(qh.startTime);
  const end = parseHM(qh.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}
