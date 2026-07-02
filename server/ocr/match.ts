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

// ── 정규화 함수 ────────────────────────────────────────────────────────────────

/** 특수문자·공백 제거, 소문자 변환 */
export const norm = (s: string): string =>
  s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』]/g, "");

/** 공급사명 정규화: 법인 형태 제거 후 norm */
export const normSupplier = (s: string): string =>
  norm(s.replace(/주식회사|유한회사|합자회사|합명회사|농업회사법인|㈜|\(주\)|\(유\)|\(합\)|\(재\)/gi, ""));

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
  const scores: number[] = [
    diceSim(oc, dc),
    diceSim(os, ds),
    diceSim(oc, ds),
    diceSim(os, dc),
    jamoSim(oc, dc),
    jamoSim(os, ds),
  ];

  // 신호 7–8: 브랜드 레벨 (규격+제형 완전 제거 → 순수 브랜드명 비교)
  const ocBrand = parseDrugBrand(ocrClean);
  const dcBrand = parseDrugBrand(p.name ?? "");
  if (ocBrand && dcBrand && ocBrand !== oc) {
    scores.push(diceSim(ocBrand, dcBrand), jamoSim(ocBrand, dcBrand));
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
