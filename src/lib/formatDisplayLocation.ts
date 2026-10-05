// src/lib/formatDisplayLocation.ts
// 2026-10-05 · 사용자 지시 · 진열구역 라벨 축약 공용 포매터
//
// ERP LocationName 원문은 ">" 로 구분된 4 레벨:
//   예 1 · "벽>22>전체>전체"         → "벽 22"
//   예 2 · "5매대>Ａ>1열>전체"        → "5A 1열"
//   예 3 · "3매대>Ｂ>2열>3단"         → "3B 2열 3단"
//   예 4 · "전체>전체>전체>전체"      → "" (빈 라벨)
//
// 규칙:
//   1. ">" 로 split
//   2. 각 part trim
//   3. "전체" 는 제거
//   4. 전각 영문 (Ａ-Ｚ · ａ-ｚ) → 반각 (A-Z · a-z)
//   5. "N매대" → "N" (매대 글자 제거 · 뒤 알파벳과 결합)
//   6. 숫자 + 알파벳 1자 연속 → 붙여서 "5A"
//   7. " " 공백으로 join
//
// SQL 가져오자마자 적용 · 서버 / 클라 어디서든 호출 가능 (pure)

export function formatDisplayLocation(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const parts = s.split(/[>／/｜|]/).map((p) => p.trim());
  const normalized: string[] = [];
  for (const p0 of parts) {
    if (!p0 || p0 === "전체") continue;
    // 전각 영문 → 반각
    let p = p0.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // "N매대" → "N"
    const mMadae = p.match(/^(\d+)\s*매대$/);
    if (mMadae) p = mMadae[1];
    normalized.push(p);
  }
  // 숫자 + 단일 알파벳 연속 → 결합 (예: ["5", "A", "1열"] → ["5A", "1열"])
  const out: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const cur = normalized[i];
    const next = normalized[i + 1];
    if (cur && /^\d+$/.test(cur) && next && /^[A-Za-z]$/.test(next)) {
      out.push(cur + next);
      i++;
    } else if (cur) {
      out.push(cur);
    }
  }
  return out.join(" ");
}
