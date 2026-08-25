// src/components/OrderManagePage/OrderManagePage.tabs.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · OrderManagePage.tsx 서브탭 정의 이관
//   · 4 그룹 · purchase-order · purchase · payment · statistics
//   · 각 그룹의 key type + SubTabDef 배열 · useSortableTabs 에 주입
//   · 상수화 · useMemo 불필요 (기존 [] deps · 렌더당 재계산 방지)

import {
  ShoppingCart, ClipboardList, AlertTriangle, Package, Building2, ArrowLeftRight, PackageCheck,
  ScanLine, PackagePlus, Info, Wallet, HandCoins, Calculator, TrendingUp, PieChart, Boxes,
} from "lucide-react";

export type PurchaseOrderKey = "order" | "need" | "critical" | "history";
export type PurchaseKey = "receipt" | "reconciliation" | "scan" | "productarrival" | "productinfo" | "return" | "purchase-history";
export type PaymentKey = "vendor" | "payment-input" | "borrowing" | "vat-prepare";
export type StatKey = "trending" | "category" | "flow" | "diff" | "supplier";

export interface SubTabDef<K extends string> {
  key: K;
  label: string;
  icon: React.ElementType;
  color: string;
}

export const PURCHASE_ORDER_DEFAULT_TABS: SubTabDef<PurchaseOrderKey>[] = [
  { key: "order",    label: "발주요청", icon: ShoppingCart,  color: "sky"    },
  { key: "need",     label: "발주필요", icon: ClipboardList, color: "rose"   },
  { key: "critical", label: "품절임박", icon: AlertTriangle, color: "amber"  },
  { key: "history",  label: "발주이력", icon: Package,       color: "indigo" },
];

export const PURCHASE_DEFAULT_TABS: SubTabDef<PurchaseKey>[] = [
  { key: "purchase-history", label: "매입이력",     icon: Building2,      color: "sky"     },
  { key: "return",           label: "반품필요",     icon: ArrowLeftRight, color: "rose"    },
  { key: "receipt",          label: "거래명세서",   icon: PackageCheck,   color: "violet"  },
  { key: "scan",             label: "실재고입력",   icon: ScanLine,       color: "teal"    },
  { key: "productarrival",   label: "상품입고",     icon: PackagePlus,    color: "blue"    },
  { key: "productinfo",      label: "상품정보",     icon: Info,           color: "indigo"  },
  // 2026-08-25 · 사용자 지시 · 실재고 → 유통기한 임박 (rename + 콘텐츠 교체)
  { key: "reconciliation",   label: "유통기한 임박", icon: AlertTriangle,  color: "amber"   },
];

export const PAYMENT_DEFAULT_TABS: SubTabDef<PaymentKey>[] = [
  { key: "payment-input", label: "결제입력",        icon: Wallet,     color: "amber"  },
  { key: "vendor",        label: "공급사별결제내역", icon: Building2,  color: "teal"   },
  // 2026-08-25 · 사용자 지시 · 차용입력 (공급사↔약국 상품 차용 기록)
  { key: "borrowing",     label: "차용입력",        icon: HandCoins,  color: "indigo" },
  { key: "vat-prepare",   label: "부가세 준비",      icon: Calculator, color: "rose"   },
];

export const STAT_DEFAULT_TABS: SubTabDef<StatKey>[] = [
  { key: "trending", label: "급상승",       icon: TrendingUp,    color: "indigo"  },
  { key: "category", label: "구역현황",     icon: PieChart,      color: "amber"   },
  { key: "flow",     label: "상품현황",     icon: Boxes,         color: "sky"     },
  { key: "supplier", label: "공급사별현황", icon: Building2,     color: "emerald" },
  { key: "diff",     label: "손실추적",     icon: AlertTriangle, color: "rose"    },
];
