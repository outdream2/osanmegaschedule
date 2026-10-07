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
//
// 2026-10-07 · 사용자 지시 · OPTION C · compact variant 추가 (DISPLAY ONLY)
//   · formatCompactDisplayLocation(raw) → 대분류+중분류만 "5A" "21" "뷰티1"
//   · 상세 (1열/2열/3단/전체) 제외 · summary/badge/list 전용
//   · 기존 formatDisplayLocation 은 상세 유지 (edit/detail/tooltip)
//   · DB 값·편집 값·상세 위치 값 절대 변경 X

// 전각 영문 → 반각 영문
function toHalfWidthAlpha(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

// 공백·구분자 토큰화: `>` `／` `/` `｜` `|` + 공백
// (compact variant 는 공백 분리도 처리해야 "9매대 A" "벽 21" 모두 매칭)
function splitLoose(s: string): string[] {
  return s.split(/[>／/｜|\s]+/).map((p) => p.trim()).filter(Boolean);
}

export function formatDisplayLocation(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  const parts = s.split(/[>／/｜|]/).map((p) => p.trim());
  const normalized: string[] = [];
  for (const p0 of parts) {
    if (!p0 || p0 === "전체") continue;
    // 전각 영문 → 반각
    let p = toHalfWidthAlpha(p0);
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

// ───────────────────────────────────────────────────────────────────────────
// compact variant · 대분류 + 중분류만 (상세 1열/2열/3단/전체 전부 제거)
// ───────────────────────────────────────────────────────────────────────────
//
// 지원 입력 패턴 (실측 production format):
//   "5매대>Ａ>1열>전체" → "5A"
//   "9매대>A"           → "9A"
//   "9매대 A"           → "9A"
//   "9매대A"            → "9A"
//   "벽>21>전체>전체"   → "21"
//   "벽21"              → "21"
//   "벽 21"             → "21"
//   "벽>21"             → "21"
//   "뷰티>1"            → "뷰티1"
//   "뷰티1"             → "뷰티1"
//   null / "" / "전체>전체>전체>전체" → "-"
//
// 접두어 규칙:
//   · "N매대"      → "N"   (매대 접두어 제거 · 뒤 알파벳과 결합)
//   · "벽"         → ""    (벽 접두어 제거 · 뒤 숫자만)
//   · 이름형 zone  → 그대로 (뷰티1, 건기식1 등)
//
// 상세 부분 (1열/2열/3단/전체 등 "N열" "N단" "전체") 전부 제외.

const DETAIL_SUFFIX_RE = /^(?:\d+\s*[열단층층])$/u;

function stripDetailParts(parts: string[]): string[] {
  return parts.filter((p) => {
    if (p === "전체") return false;
    if (DETAIL_SUFFIX_RE.test(p)) return false;
    return true;
  });
}

// 단일 raw 값 → compact label (empty → "")
function compactOne(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";

  // 1. 전각 영문 → 반각 (전체 문자열 선적용 · 공백 분리 전에)
  const half = toHalfWidthAlpha(s);

  // 2. ">" `/` `|` 로 1차 분리 (공백은 안 자름 · "뷰티 1" 같은 공백 포함 이름 보호)
  const rawParts = half.split(/[>／/｜|]/).map((p) => p.trim()).filter(Boolean);

  // 3. 상세 부분 (전체/N열/N단) 제거
  const majorParts = stripDetailParts(rawParts);
  if (majorParts.length === 0) return "";

  // 4. parts 를 하나로 합친 "normalized" 문자열 생성 후 접두어 매칭
  //    여러 part 가 있으면 공백으로 join 하여 재분석
  //    (ex: ["5매대", "A"] → "5매대 A")
  const joined = majorParts.join(" ").trim();

  // 5. 접두어 패턴 매칭 (우선순위 순)
  //    (a) "N매대 X" or "N매대X" or "N매대>X" → "NX" (X 는 알파벳 1자)
  //    (b) "N매대" 단독 → "N"
  //    (c) "벽 N" or "벽N" or "벽>N" → "N"
  //    (d) "벽" 단독 → ""
  //    (e) 그 외 (이름형 zone) → 공백·구분자 제거 후 join

  // (a) (b) 매대
  const mMadaeWithLetter = joined.match(/^(\d+)\s*매대\s*([A-Za-z])\b/);
  if (mMadaeWithLetter) return `${mMadaeWithLetter[1]}${mMadaeWithLetter[2].toUpperCase()}`;
  const mMadaeAlone = joined.match(/^(\d+)\s*매대\s*$/);
  if (mMadaeAlone) return mMadaeAlone[1];

  // (c) (d) 벽
  const mWallWithNum = joined.match(/^벽\s*(\d+)\b/);
  if (mWallWithNum) return mWallWithNum[1];
  const mWallAlone = joined.match(/^벽\s*$/);
  if (mWallAlone) return "";

  // (e) 이름형 zone (뷰티1, 건기식1 등)
  //    공백·구분자 전부 제거 후 반환
  const cleaned = joined.replace(/\s+/g, "");
  return cleaned;
}

/**
 * 2026-10-07 · 사용자 지시 · 현재 진열위치 compact label (SSOT)
 *
 * - 단일 값 or 배열 입력 (여러 위치)
 * - 대분류 + 중분류만 (1열/2열/3단/전체 제외)
 * - 빈 결과 / null / "" → "-"
 * - 여러 위치: canonical sort + 중복 제거 + " · " 로 join
 *
 * DISPLAY ONLY · DB·편집·상세 데이터 영향 없음
 */
export function formatCompactDisplayLocation(raw: unknown): string {
  // 배열 처리 (여러 위치)
  if (Array.isArray(raw)) {
    const compacts = raw
      .map((v) => compactOne(v))
      .filter((v) => v.length > 0);
    if (compacts.length === 0) return "-";
    // 중복 제거 (순서 보존 X · canonical sort)
    const uniq = Array.from(new Set(compacts));
    // canonical sort: 숫자 접두사 → 사전식, 그 외 → 뒤로
    uniq.sort((a, b) => {
      const na = a.match(/^(\d+)/)?.[1];
      const nb = b.match(/^(\d+)/)?.[1];
      if (na && nb) {
        const diff = parseInt(na, 10) - parseInt(nb, 10);
        if (diff !== 0) return diff;
        return a.localeCompare(b, "ko");
      }
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      return a.localeCompare(b, "ko");
    });
    return uniq.join(" · ");
  }
  // 단일 값
  const one = compactOne(raw);
  return one || "-";
}
