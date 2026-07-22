import type { ProductInfo } from "../productCache";

// ── 한글 자모 분해 테이블 ──────────────────────────────────────────────────────
const CHOSUNGS  = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNGSUNGS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONGSUNGS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/** 문자열을 초·중·종성 자모 배열로 분해 */
export function toJamo(s: string): string[] {
  const res: string[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const off  = code - 0xac00;
      const jong = off % 28;
      const jung = Math.floor(off / 28) % 21;
      const cho  = Math.floor(off / 588);
      res.push(CHOSUNGS[cho], JUNGSUNGS[jung]);
      if (jong > 0) res.push(JONGSUNGS[jong]);
    } else if (ch.trim()) {
      res.push(ch.toLowerCase());
    }
  }
  return res;
}

/** Levenshtein 편집거리 (배열 대상) */
export function levenshtein(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = [...curr];
  }
  return prev[n];
}

/**
 * 자모 레벨 유사도 (0-100)
 * "온라인팜" vs "온라인밤" → 자모 11개 중 1개만 다름 → 91%
 */
export function jamoSim(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  if (!ja.length || !jb.length) return 0;
  const maxLen = Math.max(ja.length, jb.length);
  return Math.round((1 - levenshtein(ja, jb) / maxLen) * 100);
}

// ── OCR 시각적 혼동 쌍 (실측 기반) ────────────────────────────────────────────
// 각 자모가 시각적으로 헷갈리기 쉬운 파트너들.
// 이 쌍끼리 오독된 경우 편집거리 비용을 낮춰 정상 상품에 더 잘 매칭되도록.
const OCR_CONFUSABLE: Record<string, string[]> = {
  // 자음 — 폐곡선 vs 폐곡선/오픈곡선
  "ㅇ": ["ㅁ"],           // 원 vs 사각 (실측 최대 오탐)
  "ㅁ": ["ㅇ", "ㅂ"],     // 사각 vs 원, 사각 vs 위트인
  "ㅂ": ["ㅁ", "ㅃ", "ㅍ"],// 물병 vs 사각, 쌍자음, ㅍ
  "ㅃ": ["ㅂ"],
  "ㅍ": ["ㅂ"],
  // 자음 — 획 방향 유사
  "ㄴ": ["ㄷ", "ㄹ"],
  "ㄷ": ["ㄴ", "ㄸ", "ㄹ"],
  "ㄸ": ["ㄷ"],
  "ㄹ": ["ㄷ", "ㄴ"],
  // 자음 — 파열음/평음
  "ㄱ": ["ㄲ", "ㅋ"],
  "ㄲ": ["ㄱ"],
  "ㅋ": ["ㄱ"],
  "ㅅ": ["ㅆ", "ㅈ", "ㅊ"],
  "ㅆ": ["ㅅ"],
  "ㅈ": ["ㅅ", "ㅉ", "ㅊ"],
  "ㅉ": ["ㅈ"],
  "ㅊ": ["ㅈ", "ㅅ", "ㅇ"],
  // 모음 — 방향/점 개수
  "ㅗ": ["ㅜ", "ㅛ"],
  "ㅜ": ["ㅗ", "ㅠ"],
  "ㅛ": ["ㅗ", "ㅠ"],
  "ㅠ": ["ㅜ", "ㅛ"],
  "ㅏ": ["ㅓ", "ㅑ"],
  "ㅓ": ["ㅏ", "ㅕ"],
  "ㅑ": ["ㅏ", "ㅕ"],
  "ㅕ": ["ㅓ", "ㅑ"],
  "ㅐ": ["ㅔ", "ㅒ"],
  "ㅔ": ["ㅐ", "ㅖ"],
  "ㅒ": ["ㅐ"],
  "ㅖ": ["ㅔ"],
  "ㅡ": ["ㅢ"],
  "ㅣ": ["ㅢ"],
};

/** OCR 혼동 쌍이면 0.3, 아니면 1 (완전 다른 자모) */
function subCostOcr(a: string, b: string): number {
  if (a === b) return 0;
  const pairs = OCR_CONFUSABLE[a];
  if (pairs && pairs.includes(b)) return 0.3;
  return 1;
}

/** 가중 Levenshtein — 치환 비용 커스텀 */
function levenshteinWeighted(
  a: string[],
  b: string[],
  subCost: (x: string, y: string) => number,
): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = subCost(a[i - 1], b[j - 1]);
      curr[j] = Math.min(
        prev[j] + 1,           // 삭제
        curr[j - 1] + 1,       // 삽입
        prev[j - 1] + cost,    // 치환 (가중)
      );
    }
    prev = [...curr];
  }
  return prev[n];
}

/**
 * OCR 오독 인식 자모 유사도 (0-100)
 *
 * ㅇ↔ㅁ, ㅂ↔ㅍ, ㅗ↔ㅜ 같은 시각적 혼동 쌍은 편집거리 0.3만 부과 → 유사도 대폭 상승
 *
 * 예시:
 *   "온라인팜" vs "온라인밤" (ㅁ↔ㅂ) → jamoSim 91% / jamoSimOcr 97%
 *   "댕기머리" vs "덩기머리" (ㅐ↔ㅓ, ㅇ 유지) → 88% / 96%
 *   "이엑스" vs "이역스" (ㄱ자모 없음) → 낮은 유사도 그대로 (진짜 다른 문자)
 */
export function jamoSimOcr(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  if (!ja.length || !jb.length) return 0;
  const maxLen = Math.max(ja.length, jb.length);
  const dist = levenshteinWeighted(ja, jb, subCostOcr);
  return Math.round((1 - dist / maxLen) * 100);
}

// ── 정규화 함수 ────────────────────────────────────────────────────────────────

/**
 * 특수문자·공백 제거, 소문자 변환
 * 확장 (2026-07-09): OCR 오독 대응 위해 @*[]【】~+※'"※+ 및 각종 리딩 심볼 흡수
 * (Gemini 뽑아준 "@댕기머리" prefix 처럼 서비스 마크가 붙어와 매칭 점수 5-10점 손실 방지)
 */
export const norm = (s: string): string =>
  s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』@*※~+【】「」<>《》"'`^!?:;|]/g, "");

/**
 * 공급사명 정규화: 법인 형태 · 회계 태그 · 지역 접미사 제거 후 norm
 * 확장 (2026-07-09): "vat미포함", "vat 미포함", "vat별도", "부가세별도", 지역명 접미사 흡수
 * DB의 "일양약품(vat미포함)", "지오영(용인)" 같은 표기가 supplier hint 매칭에서 튕겨나가지 않도록
 */
export const normSupplier = (s: string): string =>
  norm(s
    .replace(/주식회사|유한회사|합자회사|합명회사|농업회사법인|㈜|\(주\)|\(유\)|\(합\)|\(재\)/gi, "")
    .replace(/\(?\s*vat\s*(미)?\s*포\s*함\s*\)?/gi, "")
    .replace(/\(?\s*vat\s*별\s*도\s*\)?/gi, "")
    .replace(/\(?\s*부\s*가\s*세?\s*(별\s*도|미\s*포\s*함|포\s*함)\s*\)?/gi, "")
    .replace(/\(용인|서울|경기|부산|대구|인천|광주|대전|울산|남양공장|아워팜\)/gi, "")
  );

// ── 의약품 도메인 어휘 사전 ────────────────────────────────────────────────────
// 길이 내림차순 정렬: 긴 형태를 먼저 제거해야 부분 치환 오류 방지
const DOSE_FORM_LIST = [
  "연질캡슐", "경질캡슐", "서방캡슐", "장용캡슐",
  "필름코팅정", "서방정", "장용정", "당의정", "이중정",
  "건조시럽", "현탁시럽", "주사용수", "점안액", "점이액",
  "분말주사", "동결건조", "흡입분말", "흡입액",
  "캡슐", "시럽", "주사", "앰풀", "바이알",
  "좌제", "좌약", "크림", "연고", "겔", "젤",
  "로션", "패취", "패치", "스프레이", "흡입",
  "분말", "과립", "산제", "환제", "포제", "액제",
  "외용액", "점적액", "가글", "구강정", "설하정",
  "정", "산",
];

// 용량·규격 패턴
const SPEC_RE = /\d+(?:[./×x]\d+)?(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|t\b|c\b|tab\b|cap\b|ea\b)/gi;

/**
 * 상품명에서 규격·용량·제형을 제거해 순수 브랜드명에 가깝게 만듦
 * "타이레놀정500mg" → "타이레놀"
 */
export const stripMed = (s: string): string => {
  let r = norm(s).replace(SPEC_RE, "");
  for (const f of DOSE_FORM_LIST) r = r.split(f).join("");
  return r.replace(/\d+/g, "").trim();
};

// 제약사 접미어 (브랜드 추출 시 제거)
const PHARMA_SUFFIX_RE = /제약|바이오|헬스|케어|팜|메디|코리아|코퍼레이션|하우|랩|lab|labs|korea|pharm/gi;

/**
 * 순수 브랜드명만 남기기 (제형 + 규격 + 제약사 접미어 모두 제거)
 * 추가 신호로만 사용 (단독 사용 시 과도한 단순화 주의)
 */
export const parseDrugBrand = (s: string): string =>
  stripMed(s).replace(PHARMA_SUFFIX_RE, "").trim();

// ── Dice Bigram 유사도 (수정된 공식) ──────────────────────────────────────────
/**
 * Dice Coefficient 기반 Bigram 유사도 (0-100)
 *
 * 수정 전: intersection / max(|A|, |B|)  → 크기 차이가 크면 과소평가
 * 수정 후: 2 * intersection / (|A| + |B|) → 더 균형잡힌 평가
 *
 * 추가: 한쪽이 다른 쪽에 포함될 경우 길이 비율 기반 보정
 */
export const diceSim = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 100;

  // 포함 관계: 짧은 쪽이 긴 쪽 안에 완전히 들어있으면 높은 점수
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.includes(shorter)) {
    const ratio = shorter.length / longer.length;
    return Math.round(90 * (0.3 + 0.7 * ratio));
  }

  // Dice bigram (중복 허용 — set이 아닌 배열)
  const bgrams = (s: string) =>
    Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const ag = bgrams(a);
  const bgCopy = bgrams(b);
  if (!ag.length || !bgCopy.length) return 0;

  let matches = 0;
  const bBuf = [...bgCopy];
  for (const g of ag) {
    const idx = bBuf.indexOf(g);
    if (idx !== -1) { matches++; bBuf.splice(idx, 1); }
  }
  return Math.round((2 * matches / (ag.length + bgCopy.length)) * 100);
};

/** 하위 호환성 유지 (bigramSim = diceSim) */
export const bigramSim = diceSim;

// ── Jaro-Winkler 유사도 (2026-07-22) ─────────────────────────────────────────
/**
 * Jaro-Winkler 유사도 (0-100)
 *
 * 회사명 짧은 문자열에서 prefix 가중치 덕에 정확도 우수:
 *   - "(주)엘앤바이오랩" ↔ "앤바이오": bigramSim 은 부분포함으로 오히려 높게 나옴
 *   - jaroWinkler 는 prefix 다름을 페널티 → 다른 회사로 정확 판단
 *
 * 알고리즘:
 *   1. matching window = max(|a|, |b|) / 2 - 1
 *   2. 두 문자열의 매칭 문자 수 m 계산
 *   3. 전치(transposition) t/2 를 감안한 jaro = ((m/|a| + m/|b| + (m-t/2)/m) / 3)
 *   4. prefix 최대 4자까지 공통이면 (1 - jaro) * 0.1 만큼 부스트
 */
export const jaroWinkler = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const la = a.length, lb = b.length;
  const matchDistance = Math.max(la, lb) >> 1 - 1;
  const aMatches = new Array(la).fill(false);
  const bMatches = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, lb);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  // transpositions
  let k = 0, transpositions = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / la + m / lb + (m - transpositions / 2) / m) / 3;
  // Winkler prefix boost (최대 4자)
  let prefix = 0;
  const limit = Math.min(4, la, lb);
  for (let i = 0; i < limit; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  const jw = jaro + prefix * 0.1 * (1 - jaro);
  return Math.round(jw * 100);
};

// ── Token Set Ratio (2026-07-22) ────────────────────────────────────────────
/**
 * Token Set Ratio (0-100) · RapidFuzz 방식
 *
 * 어순 다름·중복 토큰에 강함:
 *   - "(주)광동제약" vs "광동제약 (주)" → 100
 *   - 공백·괄호로 tokenize 후 교집합·차집합 기반 Jaro-Winkler 3개 중 최대
 */
export const tokenSetRatio = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const tokenize = (s: string) =>
    new Set(s.replace(/[()·\s]+/g, " ").trim().split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  const inter = new Set([...setA].filter(x => setB.has(x)));
  const diffA = new Set([...setA].filter(x => !inter.has(x)));
  const diffB = new Set([...setB].filter(x => !inter.has(x)));
  const sortJoin = (s: Set<string>) => [...s].sort().join(" ");
  const t0 = sortJoin(inter);
  const t1 = (t0 + " " + sortJoin(diffA)).trim();
  const t2 = (t0 + " " + sortJoin(diffB)).trim();
  return Math.max(jaroWinkler(t1, t2), jaroWinkler(t0, t1), jaroWinkler(t0, t2));
};

// ── 통합 유사도 (2026-07-22) ────────────────────────────────────────────────
/**
 * 회사명 유사도 종합 판정 (0-100) · vendor-match 용
 *
 * 신호 3개 중 max 채택:
 *   1. diceSim (기존 bigramSim) — 긴 이름·중복 문자 안정
 *   2. jaroWinkler — 짧은 이름·prefix 정확도
 *   3. tokenSetRatio — 어순 다른 케이스
 */
export const supplierSim = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 100;
  return Math.max(diceSim(a, b), jaroWinkler(a, b), tokenSetRatio(a, b));
};

// ── 종합 매칭 점수 ─────────────────────────────────────────────────────────────
/**
 * OCR 인식 상품명과 DB 상품의 매칭 점수 (0-100)
 *
 * 신호 구성:
 *   1. Dice Bigram — 전체 정규화 / 규격 제거 각각 4쌍
 *   2. 자모 Levenshtein — OCR 1글자 오독(ㅍ↔ㅂ 등) 방어
 *   3. 브랜드 레벨 — 규격+제형+제약사 접미어 모두 제거 후 비교
 *   4. search_keywords — DB에 저장된 검색 키워드
 *
 * 최종 점수 = 모든 신호 중 최대값 (단일 강한 신호를 희석하지 않음)
 */
export function invoiceMatchScore(ocrRaw: string, p: ProductInfo): number {
  const ocrClean = ocrRaw.replace(/^\s*[\d①②③④⑤⑥⑦⑧⑨⑩]+[.)]\s*/, "").trim();
  const dc = norm(p.name ?? "");
  if (!ocrClean || !dc) return 0;

  const oc = norm(ocrClean);
  if (oc === dc) return 100;

  const os = stripMed(ocrClean);
  const ds = stripMed(p.name ?? "");

  // 신호 1–4: Dice bigram (4쌍)
  // 신호 5–6: 자모 Levenshtein
  // 신호 7–8: OCR 오독 인식 자모 Levenshtein (ㅇ↔ㅁ 등 시각 혼동 쌍 가중치 낮춤)
  const scores: number[] = [
    diceSim(oc, dc),
    diceSim(os, ds),
    diceSim(oc, ds),
    diceSim(os, dc),
    jamoSim(oc, dc),
    jamoSim(os, ds),
    jamoSimOcr(oc, dc),
    jamoSimOcr(os, ds),
  ];

  // 신호 9–11: 브랜드 레벨 (규격+제형 완전 제거 → 순수 브랜드명 비교)
  const ocBrand = parseDrugBrand(ocrClean);
  const dcBrand = parseDrugBrand(p.name ?? "");
  if (ocBrand && dcBrand && ocBrand !== oc) {
    scores.push(
      diceSim(ocBrand, dcBrand),
      jamoSim(ocBrand, dcBrand),
      jamoSimOcr(ocBrand, dcBrand),
    );
  }

  // 신호 9+: search_keywords (DB에 동의어/별칭 저장)
  if (p.search_keywords) {
    for (const kw of String(p.search_keywords).split(/[,|;]/)) {
      const k = norm(kw.trim());
      if (k.length >= 2) {
        scores.push(diceSim(oc, k), diceSim(os, k));
      }
    }
  }

  return Math.max(...scores, 0);
}

export function makeMatchResult(name: string, p: ProductInfo, score: number) {
  return {
    input: name,
    matched: {
      code: p.code,
      name: p.name,
      spec: p.spec,
      score,
      masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
      salePrice:   p.sale_price     != null ? Number(p.sale_price)     : null,
      profitRate:  p.profit_rate    != null ? Number(p.profit_rate)    : null,
      expiryDate:  p.expiry_date    != null ? String(p.expiry_date)    : null,
    },
  };
}
