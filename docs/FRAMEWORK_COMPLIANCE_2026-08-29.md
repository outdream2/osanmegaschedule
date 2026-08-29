# 프레임워크 준수도 감사 · 2026-08-29

> 생성 · 2026-08-29 · 수동 분석 (audit-framework.cjs + 패턴 grep 병행)

---

## 1. 프리미티브 사용률

| 프리미티브 | 채택 파일 수 | 상태 |
|---|---:|---|
| Card | 137 | 완전 확산 |
| Spinner | 133 | 완전 확산 |
| SectionCard | 9 (본체+테스트 제외) | 채택중 |
| SignaturePad | 3 (ContractWriter/Resignation) | 정상 채택 |
| SplitListPanel | 5 | 정상 채택 |
| BottomSheet | 5 | 정상 채택 |
| GradientAccent | 1 (ProductDetailHero 내부만) | **미확산** |
| ActionBar | 0 (테스트만) | **미채택** |
| ProductDetailHero | 1 (ProductInfoPage) | **저채택** |

**audit 기준 (scripts/audit-framework.cjs)**
- 스캔 731 파일 · 위반 6 파일 (8건) · 클린 99%
- 이전 세션 대비 위반 증가 없음 · baseline 유지

---

## 2. 추가 추출 후보 Top 5

### P0 · GradientAccent 미확산 (36개 인라인 잔존)

`from-brand-deep via-sky-500 to-brand-deep` + `h-[3px]` 조합이 36개 파일에 인라인으로 잔존.
GradientAccent 프리미티브가 이번 세션에 생성되었으나 실제 교체가 진행되지 않음.
대상 상위: `SplitListPanel.tsx`, `SplitRightHeader.tsx`, `Modal.tsx`, `Card.tsx`, `ListRow.tsx`, `AccentBar.tsx` 등.
**조치**: 기존 AccentBar와 역할 중복 여부 확인 후 통합 또는 순차 교체 필요.

### P0 · ActionBar 미채택 (sticky bottom 패턴 67개 파일 잔존)

`sticky bottom-0` + `border-t` + `flex justify-between/end` 조합이 67개 파일에 인라인.
ActionBar 프리미티브가 생성되었으나 단 한 곳도 교체되지 않음.
상위 대상: `ContractWriterPage.tsx`, `ResignationWriterPage.tsx`, `PaymentInputPage.tsx`, `settingsTypography.ts`.
**조치**: P0 · 고빈도 페이지부터 순차 교체 (세션 1회당 5-10개).

### P1 · FormRow / LabeledField 패턴 (38개 파일 · font-medium + label + input 조합)

`text-[12px] font-medium text-zinc-600` + 입력 필드 조합이 38개 파일에 산재.
FieldLabel + InlineLabel 프리미티브가 있으나 래핑 컨테이너(`flex flex-col gap-1`)는 인라인.
**추출 후보**: `FormRow` 프리미티브 · `<label>` + `<input/select>` 수직 레이아웃 통일.

### P1 · SectionHeader 패턴 (미추출)

`flex justify-between items-center` + 섹션 제목 + 우측 액션 버튼 패턴이 다수 페이지에 반복.
PageToolbar(페이지 레벨)와 달리 카드/섹션 내부 소형 헤더 역할.
SectionCard와 결합하면 `SectionCard title="..." action={<Button/>}>` 로 단일화 가능.
**추출 후보**: SectionCard의 `title` + `action` prop 확장으로 흡수.

### P2 · 숫자 포맷 유틸 인라인 반복

`toLocaleString()` · `Math.round()` · `(n * 100 / total).toFixed(1)` 조합이 여러 컴포넌트에서 개별 정의.
`src/lib/` 에 `formatNumber.ts` 유틸 부재.
**추출 후보**: `formatKrw(n)` · `formatPct(n, total)` · `formatCount(n)` 3개 함수로 통합.

---

## 3. 원-오프 코드 (재사용 불가 · 특화 컴포넌트)

| 파일 | 성격 | 판단 |
|---|---|---|
| `src/components/common/SaleStatusFilter.tsx:63` | common 폴더 내 도메인 특화 필터 | common이 아닌 DisplayPage/ 로 이동 권장 |
| `src/components/common/InventoryEditPanel.tsx` | 재고 편집 · 재사용성 낮음 | common/features/ 이동 권장 |
| `src/components/common/PurchaseHistoryList.tsx` | 매입이력 특화 리스트 | common/features/ 이동 권장 |
| `src/components/OrderManagePage/VendorInfoHeader.tsx` | VendorInfoHeader 중복 (common에도 존재) | 통합 또는 삭제 필요 |

---

## 4. 개선 우선순위

### P0 · 즉시 (이번 세션 내)

1. **ActionBar 교체 개시** · `ContractWriterPage` · `ResignationWriterPage` · `PaymentInputPage` 3개 파일부터 시작 · 측정 가능한 진척
2. **GradientAccent 교체 개시** · `SplitRightHeader.tsx` · `SplitListPanel.tsx` 2개부터 · AccentBar와 역할 분리 명확화

### P1 · 다음 세션 내

3. **SettingsModal.tsx 분리** · 911라인 · `raw-confirm` 2건 · `useConfirm` 교체 + 서브컴포넌트 분리 (-300라인 목표)
4. **BarcodeScanner.tsx raw-alert** · 593라인 · `window.alert` 1건 → `useToast` 교체 (iOS 코드 절대 미수정)
5. **SaleStatusFilter 이동** · `common/` → 도메인 폴더 · 책임 분리

### P2 · 중기

6. **SectionCard의 `title`/`action` prop 확장** · SectionHeader 패턴 흡수
7. **FormRow 프리미티브 추출** · FieldLabel 계층 정비
8. **common/VendorInfoHeader 중복 정리** · OrderManagePage 버전 통합

---

## 5. 아키텍처 이슈

- **GradientAccent vs AccentBar 역할 중복**: `AccentBar.tsx`(기존)와 `GradientAccent.tsx`(신규)가 비슷한 역할. AccentBar는 세로 좌측 accent, GradientAccent는 상단 가로 accent로 역할은 다르나 명칭 혼선 가능. 문서화 필요.
- **common/ 폴더 비대화**: 110개+ 파일. 도메인 특화 컴포넌트(SaleStatusFilter, InventoryEditPanel, PurchaseHistoryList)가 common/ 에 혼재. `common/features/` 로 분리 원칙 적용 미완.
- **순환 참조 위험 없음**: lib/ → hooks/ → components/ 단방향 확인됨.

---

## 6. 요약

**현재 준수도**: audit 기준 99% (731파일 중 6파일 위반 · 8건). baseline 대비 신규 위반 0건으로 회귀 없음.

**핵심 과제**: 이번 세션에 추가된 GradientAccent · ActionBar 2개 프리미티브가 생성만 되고 실제 인라인 코드 교체가 0건으로 미완. 프리미티브 생성 직후 최소 3개 이상 사용처 교체를 원칙으로 삼아야 "추출 후 방치" 기술부채를 방지할 수 있음.

**즉시 조치 권장**: ActionBar 3건 · GradientAccent 2건 교체 → audit baseline 갱신.
