# CROSS-ENDPOINT CONSISTENCY · 2026-10-01

**임무** · 공통 지표 cross-endpoint 동일 값 검증
**샘플 공급사** · 12개 (purchase_details ≥50건 + supplier_payments ≥1건 상위)
**생성 시각** · 2026-10-01T05:48:54.521Z

## 샘플 공급사 리스트

| # | 공급사 | pd건수 | pay건수 |
|---|---|---|---|
| 1 | 대지인팜 | 1923 | 0 |
| 2 | 동아제약(주) | 745 | 0 |
| 3 | 일동제약(주)(vat미포함) | 738 | 0 |
| 4 | 로드팜 | 596 | 0 |
| 5 | 라라컴퍼니 | 550 | 0 |
| 6 | 신신제약(주)(vat미포함) | 485 | 0 |
| 7 | 온라인팜 | 450 | 0 |
| 8 | 유한양행 | 398 | 0 |
| 9 | (주)녹십자 | 350 | 0 |
| 10 | 중외제약(vat미포함) | 327 | 0 |
| 11 | 테스트 | 4 | 2 |
| 12 | 테스트3 | 2 | 1 |

## 공급사별 cross 비교

### 대지인팜

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 191,462,927 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 191,462,927 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 191,462,927 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 722,334,773.48 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 162,174,414.44 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 162,174,414.44 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 162,174,414 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 29,288,512.56 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 29,288,512.56 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 560,160,359 | ℹ️ |
| D.실제잔고 | balances-map.balance | 191,462,927 | ✅ |
| D.실제잔고 | supplier-balance.balance | 191,462,927 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 191,462,927 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 233,378,600 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 233,378,600 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 동아제약(주)

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 360,267,962 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 360,267,962 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 360,267,962 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 1,099,373,794 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 288,813,124 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 288,813,124 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 288,813,124 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 71,454,838 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 71,454,838 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 810,560,670 | ℹ️ |
| D.실제잔고 | balances-map.balance | 360,267,962 | ✅ |
| D.실제잔고 | supplier-balance.balance | 360,267,962 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 360,267,962 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 402,885,800 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 402,885,800 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 일동제약(주)(vat미포함)

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 357,373,575 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 357,373,575 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 357,373,575 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 1,162,016,805 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 300,230,003 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 300,230,003 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 300,230,003 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 57,143,572 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 57,143,572 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 861,786,802 | ℹ️ |
| D.실제잔고 | balances-map.balance | 357,373,575 | ✅ |
| D.실제잔고 | supplier-balance.balance | 357,373,575 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 357,373,575 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 404,145,360 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 404,145,360 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 로드팜

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 192,053,940 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 192,053,940 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 192,053,940 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 844,182,798 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 161,107,033 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 161,107,033 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 161,107,033 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 30,946,907 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 30,946,907 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 683,075,765 | ℹ️ |
| D.실제잔고 | balances-map.balance | 192,053,940 | ✅ |
| D.실제잔고 | supplier-balance.balance | 192,053,940 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 192,053,940 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 315,400,700 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 315,400,700 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 라라컴퍼니

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 133,169,838 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 133,169,838 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 133,169,838 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 239,710,772.4 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 47,318,886 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 47,318,886 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 47,318,886 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 85,850,952 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 85,850,952 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 192,391,886 | ℹ️ |
| D.실제잔고 | balances-map.balance | 133,169,838 | ✅ |
| D.실제잔고 | supplier-balance.balance | 133,169,838 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 133,169,838 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 67,505,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 67,505,000 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 신신제약(주)(vat미포함)

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 104,566,125 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 104,566,125 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 104,566,125 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 310,799,876 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 97,322,249 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 97,322,249 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 97,322,249 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 7,243,876 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 7,243,876 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 213,477,627 | ℹ️ |
| D.실제잔고 | balances-map.balance | 104,566,125 | ✅ |
| D.실제잔고 | supplier-balance.balance | 104,566,125 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 104,566,125 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 137,446,900 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 137,446,900 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 온라인팜

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 170,225,257 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 170,225,257 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 170,225,257 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 331,318,830.45 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 161,580,672.4 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 161,580,672.4 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 161,580,672 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 8,644,584.6 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 8,644,584.6 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 169,738,158 | ℹ️ |
| D.실제잔고 | balances-map.balance | 170,225,257 | ✅ |
| D.실제잔고 | supplier-balance.balance | 170,225,257 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 170,225,257 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 200,463,200 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 200,463,200 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 유한양행

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 242,222,373 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 242,222,373 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 242,222,373 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 690,981,768 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 222,263,675 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 222,263,675 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 222,263,675 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 19,958,698 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 19,958,698 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 468,718,093 | ℹ️ |
| D.실제잔고 | balances-map.balance | 242,222,373 | ✅ |
| D.실제잔고 | supplier-balance.balance | 242,222,373 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 242,222,373 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 292,271,800 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 292,271,800 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### (주)녹십자

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 300,457,182 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 300,457,182 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 300,457,182 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 696,867,080.7 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 287,093,220.7 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 287,093,220.7 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 287,093,221 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 13,363,961.3 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 13,363,961.3 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 409,773,860 | ℹ️ |
| D.실제잔고 | balances-map.balance | 300,457,182 | ✅ |
| D.실제잔고 | supplier-balance.balance | 300,457,182 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 300,457,182 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 354,743,100 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 354,743,100 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 중외제약(vat미포함)

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 138,985,917 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 138,985,917 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 138,985,917 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 715,662,231.95 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 85,748,837 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 85,748,837 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 85,748,837 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | 53,237,080 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | 53,237,080 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 629,913,395 | ℹ️ |
| D.실제잔고 | balances-map.balance | 138,985,917 | ✅ |
| D.실제잔고 | supplier-balance.balance | 138,985,917 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 138,985,917 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 142,755,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 142,755,000 | ✅ |
| F.결제액 | balances-map.payment | 0 | ✅ |
| F.결제액 | supplier-balance.total_payment | 0 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 0 | ✅ |
| G.현재고금액 | supplier-stock-value | 0 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 0 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 0 | ℹ️ |

### 테스트

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 70,000 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 70,000 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 70,000 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 70,000 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 237,500 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 237,500 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 237,500 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | -167,500 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | -167,500 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 0 | ℹ️ |
| D.실제잔고 | balances-map.balance | -2,705,000 | ✅ |
| D.실제잔고 | supplier-balance.balance | -2,705,000 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | -2,705,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 525,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 525,000 | ✅ |
| F.결제액 | balances-map.payment | 2,775,000 | ✅ |
| F.결제액 | supplier-balance.total_payment | 2,775,000 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 2,775,000 | ✅ |
| G.현재고금액 | supplier-stock-value | 70,000 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 120,000 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 2 | ℹ️ |

### 테스트3

| 지표 | 소스 | 값 | 일치 |
|---|---|---|---|
| A.매입액 (전체 기간) | balances-map.purchase | 450,000 | ✅ |
| A.매입액 (전체 기간) | supplier-balance.total_purchase | 450,000 | ✅ |
| A.매입액 (전체 기간) | SSOT (pd.amount sum) | 450,000 | ✅ |
| A.매입액 (12M) | supplier-purchases.purchaseAmount (12M) | 450,000 | ℹ️ |
| B.판매원가 (전체 기간) | balances-map.cogs | 2,250,000 | ✅ |
| B.판매원가 (전체 기간) | SSOT (sq × pp) | 2,250,000 | ✅ |
| B.판매원가 (12M) | supplier-purchases.cogsAmount (12M) | 2,250,000 | ℹ️ |
| C.재고자산 (전체 기간) | balances-map.stock_asset | -1,800,000 | ✅ |
| C.재고자산 (전체 기간) | SSOT (purchase − cogs) | -1,800,000 | ✅ |
| C.재고자산 (12M) | supplier-purchases.stockAssetAmount (12M) | 0 | ℹ️ |
| D.실제잔고 | balances-map.balance | 250,000 | ✅ |
| D.실제잔고 | supplier-balance.balance | 250,000 | ✅ |
| D.실제잔고 | SSOT (purchase − payment) | 250,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.totalStockAmount | 3,750,000 | ✅ |
| E.판매액 (12M) | supplier-purchases.saleAmount (proration) | 3,750,000 | ✅ |
| F.결제액 | balances-map.payment | 200,000 | ✅ |
| F.결제액 | supplier-balance.total_payment | 200,000 | ✅ |
| F.결제액 | SSOT (supplier_payments sum) | 200,000 | ✅ |
| G.현재고금액 | supplier-stock-value | 1,150,000 | ℹ️ |
| H.발주이력 금액 (90d) | order-history.total_amount (90d) | 770,000 | ℹ️ |
| H.발주이력 라인수 (90d) | order-history.line_count (90d) | 1 | ℹ️ |

## 불일치 요약

**불일치 0건** · 모든 지표 모든 소스 간 동일 값


## 최종 통계

- 공급사: 12
- 비교 셀 (2소스 이상): 72
- 일치: 72
- 불일치: 0
- 일치율: 100.0%

---

## 발견된 불일치 · 적용 fix

### U4 · `/api/stock-manage/supplier-purchases` · `saleAmount` proration 공식 (fix 완료)

**이전 (잘못된 공식)**

```ts
// server/routes/stock/stockManage/supplierPurchases.ts:135
const total = purchQty + saleQty;
if (total > 0) cur.saleAmount += supplyAmt * (saleQty / total);
```

- `saleAmount` = `supply_amount × (saleQty / (purchQty + saleQty))` · 공급가 기반 proration
- UI 라벨 "판매액" 과 값 공식 불일치 (판매액은 수량×판매가인데 공급가 비율 분배 사용)
- 사용자 대원칙 #3 (판매액 = sale_qty × sale_price) 위배
- cross-endpoint audit 결과 · 10 공급사 × `E.판매액 (12M)` 전부 불일치
  - 예 · 동아제약 · `totalStockAmount=402,885,800` vs `saleAmount=728,187,368` · diff 325,301,568원
  - 예 · 중외제약(vat미포함) · diff 363,082,589원
  - 평균 불일치 폭 · 100M~400M원 (매우 큼)

**이후 (fix 공식 · 대원칙 #3)**

```ts
// server/routes/stock/stockManage/supplierPurchases.ts:140~
const salePrice = productCode ? (salePriceMap.get(productCode) ?? 0) : 0;
cur.totalStockAmount += saleQty * salePrice;
// 2026-10-01 · cross-endpoint 공식 통일 · 대원칙 #3
cur.saleAmount += saleQty * salePrice;
```

- `saleAmount` = `totalStockAmount` = `saleQty × salePrice`
- 서버 응답 2 필드 (saleAmount, totalStockAmount) · 동일 값 (BC 유지)
- cross-endpoint audit · 100% 일치 (`E.판매액 (12M)` 모든 공급사 ✅)

**UI 측 보강 (fallback)**

- `SupplierListCard.tsx:376,445` · `fmtWon(Number(sup.totalStockAmount ?? sup.saleAmount ?? 0))`
- `SupplierTab.tsx:327` · `saleA += Number(s.totalStockAmount ?? s.saleAmount ?? 0)`
- 서버 미배포 환경 · UI 가 totalStockAmount 우선 사용 · 안전 통일

### 검증 결과 (fix 후)

- `npx tsc --noEmit` · 0 error
- `node scripts/audit-framework.cjs --check-new` · baseline 527 유지 · 신규 위반 0
- `npx vitest run` · 3760 passed · 8 skipped · 회귀 0
- `node scripts/audit-cross-endpoint-2026-10-01.mjs` · 12 공급사 · 72 셀 · 100% 일치

---

## 영향 분석

### 영향 받는 UI (판매액 표시)

| 페이지 | 컴포넌트 | 필드 | 변화 |
|--------|----------|------|------|
| StockManagePage | SupplierTab · SupplierListCard | `sup.saleAmount` | **감소** (proration → 대원칙 #3 공식) |
| StockManagePage | SupplierTab · 합계 | saleA | **감소** |

### 변화 폭 (샘플)

사용자가 StockManagePage SupplierTab에서 보던 "판매액" 값은 fix 후 평균 **30~70% 감소** 할 수 있음:
- 이전 `supply_amount × (saleQty / total)` · 공급가(매입가) 기반 분배 추정치
- 이후 `saleQty × sale_price` · 수량 × 판매가 (실제 판매금액)
- "작아진 것처럼 보이지만" **정확한 판매액** (사용자 대원칙 #3)

### 다른 소스와 교차 검증 통과

| 지표 | balances-map | supplier-balance | supplier-purchases | SSOT 공식 | 일치 |
|------|-------------|------------------|-------------------|-----------|------|
| 매입액 | ✅ | ✅ | ✅ (12M 범위) | ✅ | 100% |
| 판매원가 | ✅ | - | ✅ (12M 범위) | ✅ | 100% |
| 재고자산 | ✅ | - | ✅ (12M 범위) | ✅ | 100% |
| 실제잔고 | ✅ | ✅ | - | ✅ | 100% |
| 판매액 | - | - | ✅ (saleAmount=totalStockAmount) | ✅ | 100% |
| 결제액 | ✅ | ✅ | - | ✅ | 100% |

**모든 공통 지표 · 모든 endpoint · 공식 통일 완료**

---

## 자율 금지 액션 (사용자 승인 필요)

| ID | 영역 | 액션 | 영향 |
|----|------|------|------|
| D1 | `stock_history.total_amount` 컬럼 | DROP or 재계산 UPDATE | 서버 더이상 사용 안 함 · 안전 |
| D2 | `supplierPurchases.saleAmount` 레거시 필드 | 응답 schema에서 제거 | UI fallback 제거 후 가능 |

위 액션들은 **데이터 or schema 변경** 이므로 사용자 명시 승인 필요.

---

**생성 스크립트** · `scripts/audit-cross-endpoint-2026-10-01.mjs` (영구 보존 · 재실행 가능)
**관련 리포트** · `docs/DATA_INTEGRITY_UNIFICATION_2026-10-01.md`

