// src/components/ScanPage/ProductInfoCard.types.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · ProductInfoCard.tsx 타입 · 프리셋 이관

import type { ProductInfo } from "../../lib/productsCache";

export type InlineEditableKey = "optimal_stock" | "sale_price" | "purchase_price" | "brand" | "manufacturer" | "barcode" | "expiry_date" | "memo";

// 섹션 표시 여부 (context별로 다르게)
export interface ProductInfoSections {
  header?: boolean;         // 상품명 헤더
  zoneAssignment?: boolean; // 전산/실제배치구역 카드
  stockStatus?: boolean;    // 현재고/적정재고 (인라인 편집 지원)
  actualStockInput?: boolean; // 창고/매장 실재고 입력
  orderRequest?: boolean;   // 발주요청 버튼
  financial?: boolean;      // 매입가/판매가/마진 (신규)
  productMeta?: boolean;    // 상품코드/공급처/판매상태/최근매입일
  extraInfo?: boolean;      // 브랜드·제조사·바코드·유효기간·메모 (신규 · 인라인 편집)
  purchaseHistory?: boolean; // 매입 이력 (접기/펼치기) · 2026-07-16 · 위치 조정용 flag
}

export interface ProductInfoCardProps {
  product: ProductInfo;
  onRealMapUpdate: (newValue: string) => void;
  checkedBy?: string;
  /** 사용 컨텍스트 · 섹션 default 프리셋 자동 선택 */
  context?: "scan" | "stock-manage" | "order-manage";
  /** 섹션별 세밀 조정 (context default를 override) */
  sections?: ProductInfoSections;
  /** 인라인 편집 활성화 여부 (기본: stock-manage에서만 활성) */
  editable?: boolean;
  /** 상품 필드 업데이트 후 콜백 (부모 state 동기화용) */
  onProductUpdate?: (updates: Partial<ProductInfo>) => void;
}

// 컨텍스트별 default 섹션
export const SECTION_PRESETS: Record<NonNullable<ProductInfoCardProps["context"]>, ProductInfoSections> = {
  scan: {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: true, productMeta: true, financial: false, extraInfo: false,
    purchaseHistory: true,
  },
  "stock-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: true, productMeta: true, financial: true, extraInfo: true,
    purchaseHistory: true,
  },
  "order-manage": {
    header: true, zoneAssignment: true, stockStatus: true, actualStockInput: true,
    orderRequest: false, productMeta: true, financial: true, extraInfo: true,
    purchaseHistory: true,
  },
};
