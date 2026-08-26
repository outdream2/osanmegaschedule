// src/hooks/useSaleActiveOnly.ts
// 2026-08-26 · #118 · 판매중 상품만 필터 전역 설정
//   · KV setting · key="stats.sale_active_only" · boolean · 기본 false
//   · 관리자 통계설정 페이지에서 편집 · 모든 상품 검색/통계 API 에 반영
//   · true · products.sale_status='판매중' 만 · false · 전체
import { useKvSetting } from "./useKvSetting";

const KEY = "stats.sale_active_only";

export function useSaleActiveOnly() {
  const { value, setValue, loaded } = useKvSetting<boolean>({
    key: KEY,
    defaultValue: false,
    sanitize: (raw) => typeof raw === "boolean" ? raw : null,
  });
  return { saleActiveOnly: value, setSaleActiveOnly: setValue, loaded };
}
