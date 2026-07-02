import type { ProductInfo } from "../productCache";

const CHOSUNGS  = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNGSUNGS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONGSUNGS = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

export function toJamo(s: string): string[] {
  const res: string[] = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const off  = code - 0xAC00;
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

export function levenshtein(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    prev = [...curr];
  }
  return prev[n];
}

export function jamoSim(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  if (!ja.length || !jb.length) return 0;
  const maxLen = Math.max(ja.length, jb.length);
  return Math.round((1 - levenshtein(ja, jb) / maxLen) * 100);
}

export const norm = (s: string) =>
  s.toLowerCase().replace(/[\s\-_()（）,·./[\]{}「」『』]/g, "");

// 공급사명 정규화: (주)·㈜·주식회사·유한회사 제거 후 공백·특수문자 제거
// OCR 오독("광동 제 약(주)" → "광동제약")이나 법인 표기 차이를 흡수
export const normSupplier = (s: string): string =>
  norm(s.replace(/주식회사|유한회사|합자회사|합명회사|농업회사법인|㈜|\(주\)|\(유\)|\(합\)|\(재\)/gi, ""));

const DOSE_FORM = /정|캡슐|연질캡슐|경질캡슐|서방정|필름코팅정|당의정|시럽|건조시럽|주사|주|앰풀|바이알|좌약|크림|겔|젤|로션|패취|패치|점안|점이|흡입|분말|과립|환|액|현탁액|산/g;
const SPEC_PAT  = /\d+(?:[./×x]\d+)?(?:mg|mcg|μg|ug|g|kg|ml|mL|L|IU|mEq|%|t|c|tab|cap|ea)/gi;
export const stripMed = (s: string) => norm(s).replace(SPEC_PAT, "").replace(DOSE_FORM, "").replace(/\d+/g, "");

export const bigramSim = (a: string, b: string): number => {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  if (a.includes(b) || b.includes(a)) return Math.round(90 * (0.35 + 0.65 * ratio));
  const bg = (s: string) => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const ag = bg(a); const bs = new Set(bg(b));
  if (!ag.length || !bs.size) return 0;
  return Math.round((ag.filter(g => bs.has(g)).length / Math.max(ag.length, bs.size)) * 100);
};

export function invoiceMatchScore(ocrRaw: string, p: ProductInfo): number {
  const ocrClean = ocrRaw.replace(/^\s*[\d①②③④⑤⑥⑦⑧⑨⑩]+[.)]\s*/, "").trim();

  const oc = norm(ocrClean);
  const os = stripMed(ocrClean);
  const dc = norm(p.name ?? "");
  const ds = stripMed(p.name ?? "");

  if (!oc || !dc) return 0;

  const scores = [
    bigramSim(oc, dc),
    bigramSim(os, ds),
    bigramSim(oc, ds),
    bigramSim(os, dc),
    jamoSim(oc, dc),
    jamoSim(os, ds),
  ];

  if (p.search_keywords) {
    for (const kw of String(p.search_keywords).split(/[,|;]/)) {
      const k = norm(kw.trim());
      if (k.length >= 2) {
        scores.push(bigramSim(oc, k), bigramSim(os, k));
      }
    }
  }

  return Math.max(...scores, 0);
}

export function makeMatchResult(name: string, p: ProductInfo, score: number) {
  return {
    input: name,
    matched: {
      code: p.code, name: p.name, spec: p.spec, score,
      masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
      salePrice:   p.sale_price     != null ? Number(p.sale_price)     : null,
      profitRate:  p.profit_rate    != null ? Number(p.profit_rate)    : null,
      expiryDate:  p.expiry_date    != null ? String(p.expiry_date)    : null,
    },
  };
}
