// src/components/OrderManagePage/OrderManagePage.tabs.ts
// 2026-08-25 · Framework Phase 4 · large-file 분리 · OrderManagePage.tsx 서브탭 정의 이관
//   · 4 그룹 · purchase-order · purchase · payment · statistics
//   · 각 그룹의 key type + SubTabDef 배열 · useSortableTabs 에 주입
//   · 상수화 · useMemo 불필요 (기존 [] deps · 렌더당 재계산 방지)

import {
  ShoppingCart, ClipboardList, AlertTriangle, Package, Building2, ArrowLeftRight, PackageCheck,
  ScanLine, PackagePlus, Info, Wallet, HandCoins, Calculator, TrendingUp, PieChart, Boxes,
  BarChart3, CreditCard, LineChart, LayoutDashboard, ClipboardCheck,
} from "lucide-react";

// 2026-09-25 · #1 · 발주매입 대조 시스템 · 신규 2탭 (사용자 지시)
//   · match     · 발주매입대조 · 자동 매칭 + 사용자 판정 (matched·exception·undo)
//   · exception · 이상목록 · exception_type 별 그룹핑 + 매입완료로 변경
export type PurchaseOrderKey = "order" | "need" | "history" | "match" | "exception" | "critical";
// 2026-08-29 · #193 Phase B · scan · productarrival · productinfo · return 4개 · 매장>상품/반품 서브탭으로 완전 이관 (사용자 지시)
// 2026-10-05 · 사용자 지시 · 재이관 · productinfo · productarrival · scan 3개 매장>상품 → 매입 아래로 복귀 · 거래명세서 숨김 (주석)
export type PurchaseKey = "purchase-history" | "productinfo" | "productarrival" | "scan" | "reconciliation";
// 2026-09-02 · #69 · 사용자 지시 · 카드 결제 관리 · 2탭 신규
//   · card-register · 결제카드등록 (사용할 카드 CRUD)
//   · card-history  · 카드별 결제내역 (대시보드 · 차월 예정)
// 2026-09-14 · #118 · 결제 대시보드 페이지 신규 · 첫 번째 탭
export type PaymentKey = "payment-dashboard" | "payment-input" | "vendor" | "card-register" | "card-history" | "borrowing" | "vat-prepare";
// 2026-09-01 · 사용자 지시 · 판매대시보드 서브탭 신설 (SalesTrendPage 는 그대로 유지 · 매장>판매>통계 에도 추가)
export type StatKey = "dashboard" | "trending" | "category" | "flow" | "diff" | "supplier";

export interface SubTabDef<K extends string> {
  key: K;
  label: string;
  icon: React.ElementType;
  color: string;
}

// 2026-09-23 · #350 · 사용자 지시 재확인 · 탭 순서 · 발주요청 → 발주필요 → 발주이력 → 품절임박(끝)
// 2026-09-25 · #1 · 사용자 지시 · 발주매입대조 · 이상목록 · 발주이력 뒤 · 품절임박 앞 삽입
//   순서 · 발주요청 · 발주필요 · 발주이력 · **발주매입대조** · **이상목록** · 품절임박(끝)
export const PURCHASE_ORDER_DEFAULT_TABS: SubTabDef<PurchaseOrderKey>[] = [
  { key: "order",     label: "발주요청",    icon: ShoppingCart,   color: "sky"     },
  { key: "need",      label: "발주필요",    icon: ClipboardList,  color: "rose"    },
  { key: "history",   label: "발주이력",    icon: Package,        color: "indigo"  },
  { key: "match",     label: "발주매입대조", icon: ClipboardCheck, color: "emerald" },
  { key: "exception", label: "이상목록",    icon: AlertTriangle,  color: "amber"   },
  { key: "critical",  label: "품절임박",    icon: AlertTriangle,  color: "amber"   },
];

// 2026-10-05 · 사용자 지시 · 매장>상품 3개 (상품정보·상품입고·실재고확인) 매입 아래로 재이관
//   · 순서 · 매입이력 → 상품정보 → 상품입고 → 실재고확인 → 유통기한 임박
//   · 거래명세서 (receipt) · 주석처리 · 숨김 (OCR 모듈·route 는 그대로 유지)
export const PURCHASE_DEFAULT_TABS: SubTabDef<PurchaseKey>[] = [
  { key: "purchase-history", label: "매입이력",     icon: Building2,      color: "sky"     },
  { key: "productinfo",      label: "상품정보",     icon: Info,           color: "sky"     },
  { key: "productarrival",   label: "상품입고",     icon: PackagePlus,    color: "violet"  },
  { key: "scan",             label: "실재고확인",   icon: ScanLine,       color: "teal"    },
  // { key: "receipt",          label: "거래명세서",   icon: PackageCheck,   color: "violet"  }, // 2026-10-05 · 사용자 지시 · 숨김
  { key: "reconciliation",   label: "유통기한 임박", icon: AlertTriangle,  color: "amber"   },
];

export const PAYMENT_DEFAULT_TABS: SubTabDef<PaymentKey>[] = [
  // 2026-09-14 · #118 · 결제 대시보드 · 종합 KPI · 미지급·선지급 공급사 Top
  { key: "payment-dashboard", label: "대시보드",     icon: LayoutDashboard, color: "brand" },
  { key: "payment-input", label: "결제입력",        icon: Wallet,      color: "amber"  },
  { key: "vendor",        label: "공급사별결제내역", icon: Building2,   color: "teal"   },
  // 2026-09-02 · #69 · 카드 결제 관리 · 2탭 신규 (사용자 지시)
  // 2026-09-25 · UI-1 · 사용자 지시 · 카드별결제내역 · 결제카드등록 왼쪽으로 (탭 순서 스왑)
  { key: "card-history",  label: "카드별결제내역",  icon: LineChart,   color: "violet" },
  { key: "card-register", label: "결제카드등록",    icon: CreditCard,  color: "sky"    },
  // 2026-08-25 · 사용자 지시 · 차용입력 (공급사↔약국 상품 차용 기록)
  { key: "borrowing",     label: "차용입력",        icon: HandCoins,   color: "indigo" },
  { key: "vat-prepare",   label: "부가세 준비",      icon: Calculator,  color: "rose"   },
];

export const STAT_DEFAULT_TABS: SubTabDef<StatKey>[] = [
  // 2026-09-01 · 사용자 지시 · 판매대시보드 신설 (DashboardTab 재사용 · SalesTrendPage 원본 유지)
  { key: "dashboard", label: "판매대시보드", icon: BarChart3,    color: "teal"    },
  { key: "trending",  label: "급상승",       icon: TrendingUp,    color: "indigo"  },
  { key: "category",  label: "구역현황",     icon: PieChart,      color: "amber"   },
  { key: "flow",      label: "상품현황",     icon: Boxes,         color: "sky"     },
  { key: "supplier",  label: "공급사별현황", icon: Building2,     color: "emerald" },
  { key: "diff",      label: "손실추적",     icon: AlertTriangle, color: "rose"    },
];
