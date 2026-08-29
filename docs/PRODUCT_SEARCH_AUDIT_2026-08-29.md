# 상품 검색·리스트 · 전수 조사 · 2026-08-29

> #165 · 사용자 지시 · 상품 검색·리스트 페이지별 · 현재 UI · 통일 계획
> 목표 · 프리미티브화 (SearchBar · ProductSearchInput · SaleStatusFilter) + 통일 UX

---

## 📊 페이지별 · 상품 검색 input · 사용 프리미티브 조사

| 페이지 · 컴포넌트 | 사용 프리미티브 | 검색 대상 | 초성 · 스캔코드 | 판매중필터 | 비고 |
|---|---|---|:-:|:-:|---|
| **common/SearchBar** | (프리미티브) | 공통 · 재사용 | — | — | 표준 검색 input |
| **common/features/ProductSearchInput** | (프리미티브) | product_code·name | 초성 X · code O | X | 스캔·입고 등록 전용 · [확인] 버튼 |
| DisplayPage/RealStockTablePage | native input | 상품명·코드·구역 | 초성 X | ✅ SaleStatusFilter | v2 목업 · 자체 헤더 |
| DisplayPage/UnassignedProductsTab | native input | 상품명·공급사·코드 | X | ✅ SaleStatusFilter | 2026-08-29 P1 확산 |
| DisplayPage/ZoneMismatchTab | native input | 상품명·코드·구역 | X | ✅ SaleStatusFilter | 2026-08-29 P1 확산 |
| DisplayPage/ZoneProductsModal | native input | 모달 내 상품 | X | X | 모달 전용 |
| LandingPage/VendorStockModal | native input | 공급사 상품 재고 | X | X | 모달 · 소형 |
| OcrPage/SynonymsTab | native input | 동의어 관리 | X | X | 검색 대상 다름 |
| OrderManagePage/BorrowingPage | native input | 차용 리스트 | X | X | 차용 상품 |
| OrderManagePage/ExpiryImminentTab | native input | 유통기한 임박 | X | X | 리스트 필터 |
| OrderManagePage/OrderHistoryTab | native input | 발주 이력 | X | X | 리스트 필터 |
| OrderManagePage/ReturnConfirmedPanel | native input | 반품 확정 | X | X | 리스트 필터 |
| OrderManagePage/ReturnListPanel.panels | native input | 반품 필요 | X | X | 리스트 필터 |
| OrderManagePage/VendorDetailTabs | native input | 거래처 상세 | X | X | 탭 내 검색 |
| ProductArrivalPage | **ProductSearchInput** ✅ | product 등록용 | 초성 O (훅) | X | 프리미티브 사용 |
| ProductInfoPage/ProductCreateModal | native input | 신규 등록 | X | X | 모달 · 코드 자동생성 |
| SalesTrendPage/StockFlowPanel | native input | 통계 상품 | X | X | 트렌드 |
| ScanPage.panels | **ProductSearchInput** ✅ | 스캔 · 실재고 | 초성 O (훅) | X | 프리미티브 사용 |
| StockManagePage/StockReconciliationTab | native input | 재고 조정 | X | X | 서브탭 |

---

## 🎯 통일 계획

### Phase A · SearchBar 프리미티브 확산 (안전 · 낮음)
- **대상 · 14 페이지 · native `<input>` 사용 중**
- 라벨 · placeholder · 아이콘 · 스타일 통일
- 검색 로직 · 페이지별 유지 (input 시각만 통일)
- 위험 극저 · UI 만 변경

### Phase B · SaleStatusFilter 확산 (진행중)
- 완료 · UnassignedProductsTab · ZoneMismatchTab (2026-08-29 P1)
- 대상 · 상품 리스트 페이지 중 판매중 필터 유용한 곳:
  - OrderManagePage/OrderHistoryTab
  - OrderManagePage/ExpiryImminentTab
  - SalesTrendPage/StockFlowPanel
  - DisplayPage/ZoneProductsModal
- 사용자 확인 후 확산

### Phase C · ProductSearchInput 확장 (선택 · 위험 있음)
- 현재 · ScanPage · ProductArrivalPage · **자동 onSelect + 리셋** UX 전용
- 일반 리스트 필터 (OrderManagePage 등) 는 · 다른 UX 필요 · **별도 프리미티브** 신설 검토
- 예: `ProductFilterInput` (검색 → 리스트 필터만 · onSelect X · 리셋 X)

### Phase D · 초성 검색 통일 (조사 필요)
- 현재 · `matchHangul` · `useProductInfoSearch` 훅에서 초성 지원
- 서버 · `search_keywords` 컬럼 · 초성 사전 계산 (2026-08-29 rebuild)
- 사용 페이지 · ProductInfoPage · ProductSearchInput · 통일
- 미사용 페이지 · client-side matchHangul 도입 or 서버 API 이관

---

## ⚠️ 위험 지점

1. **초성 검색 사용/미사용 혼재** · UX 불일치 (사용자 · 페이지마다 다르면 혼란)
2. **판매중 필터 지원/미지원 혼재** · 초도물량·판매중지 노이즈
3. **native input 20+곳** · 스타일 편차 (border · font · padding)

---

## 📋 다음 진행 (승인 후)

1. Phase A · SearchBar 확산 · 페이지 1개씩 · 회귀 없이
2. Phase B 확장 · 사용자 확인 후 페이지별 진행
3. Phase C · ProductFilterInput 신설 여부 · 사용자 결정
4. Phase D · 초성 검색 · 전 페이지 통일 여부 · 사용자 결정

---

## ✅ 완료 (2026-08-29 · 사용자 지시 "상품명 검색은 모두 같은 로직")

### matchesProductQuery 유틸 신설 (`src/lib/productMatch.ts`)
- **초성 매칭** · `ㅌㅇㄹㄴ` → 타이레놀 (product_name · supplier)
- **부분 일치** · 대소문자 무시
- **코드 · 바코드** · 대소문자 무시 부분일치
- **null 안전** · OR 조건
- **vitest 13/13 pass**

### 확산 100% 완료 (14 페이지)
1. UnassignedProductsTab · matchesProductQuery
2. ZoneMismatchTab · matchesProductQuery + spec_zone/real_zone
3. ExpiryImminentTab · saleMatches AND matchesProductQuery + real_map
4. BorrowingPage · matchesProductQuery
5. ReturnConfirmedPanel · matchesProductQuery
6. OrderHistoryTab · items 배열 · matchesProductQuery
7. StockReconciliationTab · matchesProductQuery + supplierFilter
8. VendorStockModal · 필드 매핑 (name→product_name · code→product_code)
9. StockFlowPanel · matchesProductQuery
10. VendorDetailTabs (2곳) · productStats + allRows
11. ReturnListPanel · matchesProductQuery + categoryFilter
12. RealStockTablePage · matchesProductQuery + location
13. OrderManagePage · orderReqsFiltered · matchesProductQuery
14. PurchaseHistoryTab · filteredProducts · matchesProductQuery

### 남은 · 0건
- `product_name.*includes` grep · **0건**
- 모든 상품 리스트 · 동일 매칭 · 일관 UX 확보
