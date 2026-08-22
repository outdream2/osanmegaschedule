// src/components/OrderManagePage/OrderManagePage.utils.ts
// 2026-08-22 · Framework Phase 4 · OrderManagePage 대형 파일 분리 · constants + helpers 이관
import type {
  NeedCategoryFilterKey, OrderNeedShortageBasis, OrderNeedDefaultSortKey,
  OrderNeedFilterConfig,
} from "./OrderManagePage.types";

// ─── 발주필요 탭 · 필터 저장 (localStorage) ──────────────────────────────
export const ORDER_NEED_CONFIG_KEY = "megatown_orderNeedFilterConfig";

export const DEFAULT_ORDER_NEED_CONFIG: OrderNeedFilterConfig = {
  shortageBasis: "optimal",
  defaultCategory: "all",
  includeMissingRealStock: true,
  minShortage: 1,
  minMonthlySales: 0,
  // 2026-08-03 (#189) · 기본 정렬 · 최근 한달 판매량 desc (많이 팔린 상품 우선)
  defaultSortKey: "sale_month",
  defaultSortDir: "desc",
};

export const loadOrderNeedConfig = (): OrderNeedFilterConfig => {
  try {
    const raw = localStorage.getItem(ORDER_NEED_CONFIG_KEY);
    if (!raw) return DEFAULT_ORDER_NEED_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_ORDER_NEED_CONFIG;
    const validBasis: OrderNeedShortageBasis[] = ["optimal", "min", "realStock"];
    const validCat: NeedCategoryFilterKey[] = ["all", "위탁", "선결제", "60회전", "90회전", "기타"];
    const validSortKey: OrderNeedDefaultSortKey[] = [
      "supplier", "contact", "name", "current", "inv", "optimal", "short",
      "sale_month",
    ];
    return {
      shortageBasis: validBasis.includes(parsed.shortageBasis) ? parsed.shortageBasis : DEFAULT_ORDER_NEED_CONFIG.shortageBasis,
      defaultCategory: validCat.includes(parsed.defaultCategory) ? parsed.defaultCategory : DEFAULT_ORDER_NEED_CONFIG.defaultCategory,
      includeMissingRealStock: typeof parsed.includeMissingRealStock === "boolean" ? parsed.includeMissingRealStock : DEFAULT_ORDER_NEED_CONFIG.includeMissingRealStock,
      minShortage: (typeof parsed.minShortage === "number" && parsed.minShortage >= 1) ? Math.floor(parsed.minShortage) : DEFAULT_ORDER_NEED_CONFIG.minShortage,
      // 2026-08-03 (#189) · 새 필드 · 하위 호환 · fallback = DEFAULT
      minMonthlySales: (typeof parsed.minMonthlySales === "number" && parsed.minMonthlySales >= 0) ? Math.floor(parsed.minMonthlySales) : DEFAULT_ORDER_NEED_CONFIG.minMonthlySales,
      defaultSortKey: validSortKey.includes(parsed.defaultSortKey) ? parsed.defaultSortKey : DEFAULT_ORDER_NEED_CONFIG.defaultSortKey,
      defaultSortDir: (parsed.defaultSortDir === "asc" || parsed.defaultSortDir === "desc") ? parsed.defaultSortDir : DEFAULT_ORDER_NEED_CONFIG.defaultSortDir,
    };
  } catch { return DEFAULT_ORDER_NEED_CONFIG; }
};

// ─── 시간 포맷 · 'N분 전' · 'N시간 전' · 'N일 전' ───────────────────────
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 60) return `${diff}분 전`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
  return `${Math.floor(diff / (60 * 24))}일 전`;
};
