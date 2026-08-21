// src/components/OrderManagePage/PaymentInfoTab.utils.ts
// 2026-08-21 · Framework Phase 4 · large-file 분리 · PaymentInfoTab 상수/유틸 이관
import type { PayMethod, PaymentRow, PeriodDays } from "./PaymentInfoTab.types";

// ─── Period Filter · Task #103 (2026-08-04) ─────────────────────────────────
//   좌측 리스트 상단 · 매입·결제 집계 기간 chip · 10d/1M/2M/3M · default 1M
//   localStorage: megatown_payment_period · 다음 방문 시 복원
export const PERIOD_STORAGE_KEY = "megatown_payment_period";

export const PERIOD_OPTIONS: Array<{ days: PeriodDays; label: string }> = [
  { days: 10, label: "10일" },
  { days: 30, label: "1개월" },
  { days: 60, label: "2개월" },
  { days: 90, label: "3개월" },
];

export const DEFAULT_PERIOD: PeriodDays = 30;

export function loadPeriodPref(): PeriodDays {
  try {
    const raw = window.localStorage.getItem(PERIOD_STORAGE_KEY);
    const n = Number(raw);
    if ([10, 30, 60, 90].includes(n)) return n as PeriodDays;
  } catch { /* SSR safe */ }
  return DEFAULT_PERIOD;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const CARD_ISSUERS = [
  "신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드",
  "NH농협카드", "하나카드", "우리카드", "BC카드", "씨티카드", "카카오뱅크카드",
];

export const BANKS = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "IBK기업은행",
  "NH농협은행", "SC제일은행", "씨티은행", "카카오뱅크", "토스뱅크", "케이뱅크",
  "SH수협은행", "우체국",
];

// 2026-08-03 · #225 · 결제방법 단순화 · 카드 · 현금 · 기타 3가지
// 기존 저장 데이터(transfer/check/offset) 는 methodLabel 로 표시만 됨 · 새 저장은 3개만
export const METHOD_OPTIONS: Array<{
  key: PayMethod;
  label: string;
}> = [
  { key: "card", label: "카드" },
  { key: "cash", label: "현금" },
  { key: "etc",  label: "기타" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  "위탁":     "bg-violet-500 text-white",
  "선결제":   "bg-rose-500 text-white",
  "60회전": "bg-emerald-500 text-white",
  "90회전": "bg-teal-500 text-white",
  "기타":     "bg-zinc-500 text-white",
  "전체":     "bg-zinc-700 text-white",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const todayYmd = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

// 최근 N개월 · 오래된순 · "YYYY-MM" · 2026-08-04 · #58
// e.g. now=2026-08-04, n=3 → ["2026-06","2026-07","2026-08"]
export function recentMonthKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${d.getFullYear()}-${m}`);
  }
  return out;
}

// "YYYY-MM" → "M월" · 2026-08-04 · #58 · 표 헤더용
export function fmtMonthShort(key: string): string {
  const [_y, m] = key.split("-");
  return `${Number(m)}월`;
}

export function fmtWonShort(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

export function fmtBizNum(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length !== 10) return String(n);
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function fmtPhone(n: string | null | undefined): string {
  if (!n) return "-";
  const d = String(n).replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return String(n);
}

export function methodLabel(m: string | null | undefined): string {
  const map: Record<string, string> = {
    card: "카드", transfer: "이체", cash: "현금",
    check: "어음", offset: "상계", etc: "기타",
  };
  return map[String(m ?? "").toLowerCase()] ?? "-";
}

export function methodTone(m: string | null | undefined): { bg: string; text: string; ring: string } {
  switch (String(m ?? "").toLowerCase()) {
    case "card":     return { bg: "bg-indigo-50",  text: "text-indigo-700",  ring: "ring-indigo-100" };
    case "transfer": return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" };
    case "cash":     return { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-100" };
    case "check":    return { bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-100" };
    case "offset":   return { bg: "bg-teal-50",    text: "text-teal-700",    ring: "ring-teal-100" };
    default:         return { bg: "bg-zinc-50",   text: "text-zinc-600",   ring: "ring-zinc-200" };
  }
}

// memo <-> meta 인코딩 · 백엔드 DDL 변경 없이 확장 필드 저장
// 형식 · "[meta]{"card_issuer":"신한카드",...}[/meta] 사용자메모"
const META_RE = /^\[meta\](\{[\s\S]*?\})\[\/meta\]\s?/;

export function encodeMemo(meta: NonNullable<PaymentRow["meta"]>, note: string): string {
  const cleanMeta: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "" || v === false || (typeof v === "number" && v === 0)) continue;
    cleanMeta[k] = v;
  }
  const hasMeta = Object.keys(cleanMeta).length > 0;
  const trimmedNote = note.trim();
  if (!hasMeta) return trimmedNote;
  return `[meta]${JSON.stringify(cleanMeta)}[/meta]${trimmedNote ? " " + trimmedNote : ""}`;
}

export function decodeMemo(memo: string | null | undefined): { meta: PaymentRow["meta"]; note: string } {
  if (!memo) return { meta: undefined, note: "" };
  const s = String(memo);
  const m = s.match(META_RE);
  if (!m) return { meta: undefined, note: s };
  try {
    const meta = JSON.parse(m[1]) as PaymentRow["meta"];
    const note = s.replace(META_RE, "").trim();
    return { meta, note };
  } catch {
    return { meta: undefined, note: s };
  }
}

// VAT 10% 분리 · vat_included 이면 amount 안에 부가세 포함 → 분리 계산
export function computeVat(amount: number, vatIncluded: boolean): { supply: number; vat: number } {
  if (!Number.isFinite(amount) || amount <= 0) return { supply: 0, vat: 0 };
  if (vatIncluded) {
    const supply = Math.round(amount / 1.1);
    return { supply, vat: amount - supply };
  }
  const vat = Math.round(amount * 0.1);
  return { supply: amount, vat };
}
