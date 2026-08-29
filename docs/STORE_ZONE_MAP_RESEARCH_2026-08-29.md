# 매장 구역도 (Store Zone Map) UI 리서치 · 2026-08-29

> **대상**: 오산 메가타운 약국 · `src/components/common/StoreZoneMap.tsx`
> **목적**: 2026 최신 트렌드 반영 · 진열 위치 관리 UX 개선 · Phase 1 (safe) 실행 계획
> **원칙 준수**: `docs/FRAMEWORK.md` · 대원칙 0 (회귀 X) · 프레임워크 우선 · UI 프리미엄

---

## 요약 (Executive Summary)

- **문제 핵심**: 현재 Grid 기반 fixed layout 은 안정적이나 · 2026 트렌드 (heatmap · 인터랙션) 부재 · 판매순위·재고상태·pending 시각화가 배지 나열식
- **권장 방향**: **"Grid 유지 + 데이터 레이어 오버레이"** (SVG canvas 전면 개편 X · 회귀 위험 최대)
- **Top 3 대안**:
  1. **A안 (권장)** · Grid 유지 + 히트맵 오버레이 + 사이드 패널 → 2주 · 회귀 최소
  2. **B안** · 반응형 fluid grid + segmented control (뷰 모드 전환) → 3주
  3. **C안** · React Flow / SVG canvas 전면 재작성 → 6주+ · 회귀 위험 高
- **예상 노력 (A안)**: 3-5일 · 순수 UI + 데이터 hook · handler 변경 X

---

## 1. 문제 분석

### 현재 구조 (`StoreZoneMap.tsx`)
- **Grid 고정 배치**: 상단벽 (21→9) · 중앙 진열대 (22 + 8B/A→1B/A) · 하단벽 (23→34) · 동측 wing (35→46)
- **min-width 720px** · 모바일에서 가로 스크롤 + 별도 테이블 뷰 (`mobileTable`)
- **인터랙션**: hover tooltip · click (상품 모달) · long-press drag 재정렬 (2026-08-23 · #181 Phase 2)
- **시각 표현**: ★BEST 배지 (Top 10) · 카테고리 색상 (A진한 · B연한) · pending StatusPill

### 업계에서 부르는 이름
- **Planogram** (플래노그램) · 상품 진열 시각화 표준 용어 (Blue Yonder · RELEX · DotActiv)
- **Store Heatmap** · 판매/트래픽 색상 밀도 시각화
- **Bin Location UI** · WMS (창고관리) · Zoho Inventory · Fishbowl 용어

### 유사 사례 (5)
1. **Zoho Inventory Bin Locations** (Premium: 2000 bins) · 트리 구조 · 검색 우선 · 시각적 map 없음 (텍스트 리스트) — 🟢 [Zoho 공식](https://www.zoho.com/us/inventory/bin-locations/)
2. **Fishbowl Manufacturing** · 창고 heavy · 파트 레벨 · lot 추적 · 모듈러 setup — 🟢 [SelectHub 비교](https://www.selecthub.com/inventory-management-software/fishbowl-inventory-vs-cin7/)
3. **Ariadne / Contentsquare Retail Heatmap** · 천장 센서 데이터 · warm(red) high · cool(blue) low · daily update — 🟡 [Ariadne 블로그](https://www.ariadne.inc/resources/blogs/heatmap-of-my-store/)
4. **Impact Analytics / DotActiv Planogram** · AI 최적화 · 드래그드롭 shelf + product images + facings · 템플릿 라이브러리 — 🟢 [Guideflow 7 tools 2026](https://www.guideflow.com/blog/retail-space-planning-software)
5. **Planner 5D · Home Designer 2026** · multi-touch pan · pinch-zoom · long-press drag · tap-select · Vision Pro 지원 — 🟡 [Krowdbase 리뷰](https://www.krowdbase.com/best-floor-plan-mobile-apps)

---

## 2. 대안 비교 (기술 스택)

| 스택 | 장점 | 단점 | 비용 | 학습 난이도 | 소스 |
|---|---|---|---|---|---|
| **현재 · CSS Grid + Tailwind** | 안정 · 예측 가능 · 이미 프레임워크 통합 | 자유 배치 X · 회전 불가 | 무료 | 낮음 | 🟢 자체 코드 |
| **dnd-kit** (이미 유사 로직 존재) | TypeScript · lightweight · React 표준 · long-press 지원 | grid layout 은 미지원 | 무료 | 중간 | 🟢 [Puck 2026 Top 5](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) |
| **react-grid-layout** | 리사이즈 지원 · 즉시 사용 | 오래된 API · TS 지원 약함 · dnd-kit 로 대체 추세 | 무료 | 낮음 | 🟡 [dnd-kit discussion #1560](https://github.com/clauderic/dnd-kit/discussions/1560) |
| **react-flow** | node/edge · zoom/pan · minimap 무료 | 워크플로우 특화 · 매장 layout 부적합 (그래프 아님) | 무료 (Pro $) | 高 | 🟡 [DEV react-flow 2026](https://dev.to/azimahmed/react-flow-examples-for-workflow-automation-ai-builders-node-based-ui-2026-edition-3joi) |
| **react-planner (cvdlab)** | 2D→3D · 벽/방 · 완성형 | maintenance 저조 · 약국 스케일 오버킬 | 무료 | 高 | 🔴 [GitHub cvdlab/react-planner](https://github.com/cvdlab/react-planner) |
| **Syncfusion EJ2 Floor Planner** | 상업 · 스텐실 · snap-to-grid | 유료 · 무거움 | $$$ | 중간 | 🟡 [Syncfusion GitHub](https://github.com/syncfusion/ej2-showcase-react-floor-planner) |

### 판단 (기술 스택)
- **약국 규모 (46 셀 고정)** → SVG canvas · react-flow 오버킬 (100+ 노드 렌더링 성능 필요 없음)
- **이미 dnd-kit 유사 long-press 로직 구현됨** → 추가 라이브러리 없이 확장 가능
- **CSS Grid 유지가 정답** · Contentsquare/Ariadne 같은 heatmap 은 grid 위 overlay 로 충분

---

## 3. UX 트렌드 (2026)

### 핵심 패턴 (교차 검증 완료)

| 패턴 | 채택 여부 | 우리 상황 |
|---|---|---|
| **Warm/Cool Heatmap** (red=high · blue=low) | 산업 표준 · Contentsquare · Ariadne 공통 | pending·판매율 시각화에 적용 |
| **Segmented View Toggle** (일반 · 히트맵 · 재고상태) | Impact Analytics · RELEX 표준 | 상단 툴바에 배치 |
| **Side Panel (상품 리스트)** | Zoho · Cin7 표준 (모달 아님) | 클릭 시 우측 슬라이드 |
| **Hover Detail Card** | Planner 5D · 즉시 표시 | **이미 구현 · HoverDetail** |
| **Pinch-Zoom + Pan** (모바일) | Home Designer 2026 표준 | 모바일 grid 은 오버킬 · 테이블 뷰 유지 |
| **Minimap (전체 조망)** | react-flow · Figma 표준 | 46셀 · 불필요 |
| **AI 최적화 제안** | Impact Analytics 2026 신흥 | Phase 3 이상 (지금 X) |

### 40대+ 사용자 관점
- **가독성 최우선** · 색상 대비 확실 · 폰트 +2 원칙 유지
- **파스텔 지양** (`feedback_ui_top_principle.md`) · Linear/Vercel 톤
- **원-탭 액션** · long-press · 두 손 gesture 최소화

---

## 4. Top 3 실행 계획

### 🥇 A안 · Grid 유지 + 히트맵 오버레이 + 사이드 패널 (권장 · Phase 1)

**왜 최고**:
- **회귀 위험 최소** · 기존 `wallCell`/`pairCell`/`centerCell` 구조 100% 유지 · className/스타일만 추가
- **프레임워크 준수** · `StatusPill` · `HoverDetail` 재사용 · 새 컴포넌트 최소화
- **약국 규모 fit** · 46셀 · SVG canvas 불필요 · Grid 오버레이로 충분
- **`FRAMEWORK.md` 원칙 부합** · api.xxx handler 변경 없음 · UI-only

**신규 기능 3종**:
1. **뷰 모드 세그먼티드 컨트롤** (상단) · [기본 · 히트맵 · 재고상태]
   - 히트맵: pending 건수 → warm(red 500)~cool (blue 100) gradient
   - 재고상태: 상품수 0 → 회색 / <5 → amber / >=5 → emerald
2. **사이드 패널** (우측 슬라이드 · sm 이상만) · 클릭 시 상품 리스트
   - 기존 `onZoneClick` 콜백 유지 · 부모가 모달 대신 side panel 로 렌더 (프레임워크 `SplitRight` 재사용 가능)
3. **범례 (Legend) 카드** · 하단 · 색상 의미 명시 · 접이식

**실행 단계**:
1. `src/components/common/StoreZoneMap.tsx` · props 추가 · `viewMode?: 'default' | 'heatmap' | 'stock'` · optional (BC 유지)
2. `wallCell`/`pairCell` · viewMode 에 따라 배경색 오버라이드 (기존 `bg-white` → `bg-red-500/40` 등)
3. `src/components/common/StoreZoneMapLegend.tsx` · 신규 (50줄) · 색상 매핑
4. 세그먼티드 컨트롤 · 기존 헤더 옆 · `role="tablist"` · a11y 준수
5. `DisplayPage` / `SalesTrendPage` 소비처 · `viewMode` 미전달 → default (기존 동작 100% 유지)

**예상 시간**: 3-5일 · TS strict · vitest 커버 (뷰 모드 전환 · props BC)

**롤백**: `viewMode` prop 제거 · 소비처 무변경 (optional prop 이므로)

---

### ⚠️ 사용자 지시 · 2026-08-29
- **재고부족 히트맵 · 제외** (사용자 명시 · "재고부족은 필요없어")
- **BEST 표시 · 유지** (사용자 명시 · "BEST 표시되는건 그대로 놔두고")
- **셀 높이 통일** · min-h 240px (compact 180px) · 완료 · `0517141b`
- **판매율 히트맵** · 사용자 승인 시 후속 진행

---

### 🥈 B안 · 반응형 fluid grid + 뷰 모드 전환 (Phase 2 확장)

**A안 + 추가**:
- `min-w-[720px]` 제거 · CSS `clamp()` + `grid-template-columns: repeat(auto-fit, minmax(60px, 1fr))`
- 모바일 · 테이블 뷰 대신 축소 grid 도 옵션 제공 (사용자 선택)
- Zoom control (75/100/125/150%) · CSS transform scale
- 프린트 CSS (`@media print`) · A4 landscape 최적화

**예상 시간**: 추가 5-7일 · 반응형 회귀 테스트 광범위 (전 브라우저)

**리스크**: 모바일 · 46셀 축소 → 40대+ 가독성 저하 가능 · 기존 테이블 뷰 유지 필수

---

### 🥉 C안 · React Flow / SVG canvas 전면 재작성

**언제 필요**:
- 100+ 구역 · 회전/자유 배치 · 벽 그리기 필요 시
- 지금은 **오버킬** · 회귀 위험 高 · 6주+ 소요

**비추천 이유**:
- 약국 · 46셀 고정 · L-shape · 이미 정의됨
- 사용자 · 40대+ · 새 인터랙션 학습 부담
- `feedback_no_regression_top.md` 대원칙 위반 위험

---

## 5. 리스크 · 함정

- ⚠️ **회귀 절대 금지** (대원칙 0) · A안도 매 단계 TS+build+manual test 필수 · 소비처 5+ 페이지 (`DisplayPage` · `SalesTrendPage` · `OrderManagePage` · `ScanPage` · `App.tsx`)
- ⚠️ **long-press 드래그 (#181 Phase 2)** 와 뷰 모드 전환 상호작용 · 편집 모드에서 히트맵 비활성화 권장
- ⚠️ **모바일 테이블 뷰** · A안 확장 시 히트맵/재고 컬럼 추가 필요 · sm 미만 회귀 검증
- ⚠️ **색상 접근성** · WCAG AA · 색맹 사용자 · 배지+숫자 병행 (색상만 X)
- ⚠️ **`getZoneSubLabel` · `useZoneDefs` 훅** · A안 색상 오버라이드 시 기존 CAT_A/B_COLORS 와 충돌 없어야 함

---

## 6. 추가 학습 자료

- 🟢 [Guideflow · 7 Best Retail Space Planning Software 2026](https://www.guideflow.com/blog/retail-space-planning-software)
- 🟢 [Ariadne · Store Heatmap Guide 2026](https://www.ariadne.inc/resources/blogs/heatmap-of-my-store/)
- 🟢 [Zoho Inventory · Bin Locations 공식](https://www.zoho.com/us/inventory/bin-locations/)
- 🟢 [Puck · Top 5 React D&D Libraries 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)
- 🟢 [Contentsquare · Retail Heatmap UX](https://contentsquare.com/blog/retail-heatmap/)
- 🟡 [Matterport · 8 Best Floor Plan Software 2026](https://matterport.com/blog/best-floor-plan-software)
- 🟡 [Krowdbase · Mobile Floor Plan Apps 2026](https://www.krowdbase.com/best-floor-plan-mobile-apps)
- 🟢 [Syncfusion · React Floor Planner GitHub](https://github.com/syncfusion/ej2-showcase-react-floor-planner)
- 🔴 [cvdlab · react-planner GitHub](https://github.com/cvdlab/react-planner)

---

## 7. 우리 프로젝트 맥락 (megatown-staff-scheduler)

### 기존 스택 호환성
- **React 18 + Vite + Tailwind + TypeScript** · A안 완벽 호환 · 신규 dep 0개
- **프레임워크 컴포넌트** · `StatusPill` · `HoverDetail` · `SplitRight` (사이드패널 재사용 가능)
- **훅** · `useZoneDefs` · `zone-labels-changed` 이벤트 · 기존 그대로 사용

### 소비처 (5)
| 경로 | 사용 방식 | A안 영향 |
|---|---|---|
| `DisplayPage.tsx` | 매장 구역도 fullscreen 모달 · 편집 모드 | `viewMode` optional · 무영향 |
| `SalesTrendPage · ZoneCategoryContent.tsx` | ★BEST 배지 · rank 표시 | `viewMode` optional · 무영향 |
| `OrderManagePage.tsx` | 발주 관리 · 위치 표시 | `viewMode` optional · 무영향 |
| `ScanPage · ProductInfoCard.tsx` | 스캔 상품 위치 · read-only | `viewMode` optional · 무영향 |
| `App.tsx` | 라우팅 | 무영향 |

### Render 배포 계획
- **정적 CSS · JS bundle 증가 최소** (< 5KB · 뷰 모드 로직만)
- **SSR 무영향** · client-side only 컴포넌트
- **CDN 캐싱** · 색상 팔레트 · 코드 스플리팅 불필요

### `feedback_original_table_first.md` (2026-08-29 대원칙)
- 히트맵 데이터 · 신규 파생 테이블 X · **기존 `inventory_checks` · `products.location` · `sales` JOIN** 사용
- pending count · 이미 `zonePendingMap` prop 존재 · 데이터 flow 변경 없음

### 다음 단계 (사용자 승인 시)
1. Phase 1 (A안) · 3-5일 · 뷰 모드 3종 + Legend + 사이드 패널 hook
2. 사용자 데모 · UX 피드백 수집
3. Phase 2 (B안) · 반응형 fluid + Zoom · 필요 시만 착수
4. Phase 3 (AI 최적화 제안) · 최소 6개월 후 · 판매 데이터 축적 후

---

## Sources

- 🟢 [Guideflow · 7 Best Retail Space Planning Software 2026](https://www.guideflow.com/blog/retail-space-planning-software)
- 🟢 [Guideflow · 8 Best Planogram Software 2026](https://www.guideflow.com/blog/planogram-software)
- 🟢 [Pazo · 9 Best Planogram Software 2026](https://www.gopazo.com/blog/best-planogram-software)
- 🟢 [Retail Exec · 10 Best Planogram Software 2026](https://theretailexec.com/tools/best-planogram-software/)
- 🟢 [Puck · Top 5 React D&D Libraries 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)
- 🟢 [dnd-kit 공식](https://dndkit.com/)
- 🟢 [Zoho Inventory · Bin Locations](https://www.zoho.com/us/inventory/bin-locations/)
- 🟢 [SelectHub · Fishbowl vs Cin7 2026](https://www.selecthub.com/inventory-management-software/fishbowl-inventory-vs-cin7/)
- 🟢 [Ariadne · Store Heatmap 2026](https://www.ariadne.inc/resources/blogs/heatmap-of-my-store/)
- 🟢 [Contentsquare · Retail Heatmap](https://contentsquare.com/blog/retail-heatmap/)
- 🟡 [XXIIAI · Video Heat Maps in Retail 2026](https://xxiiai.com/en/le-blog/cartes-de-chaleur-vid%C3%A9o-en-retail-en-2026)
- 🟡 [Shopify · Retail Store Layout Ideas 2026](https://www.shopify.com/blog/the-ultimate-guide-to-retail-store-layouts)
- 🟡 [Matterport · 8 Best Floor Plan Software 2026](https://matterport.com/blog/best-floor-plan-software)
- 🟡 [Krowdbase · Mobile Floor Plan Apps 2026](https://www.krowdbase.com/best-floor-plan-mobile-apps)
- 🟡 [Krowdbase · AI Floor Plan Software 2026](https://www.krowdbase.com/best-ai-floor-plan-software)
- 🟡 [Roomsketcher · 8 Best Floor Plan Tools 2026](https://www.roomsketcher.com/blog/best-floor-plan-software-tools/)
- 🟡 [dnd-kit Discussion #1560](https://github.com/clauderic/dnd-kit/discussions/1560)
- 🟡 [DEV · react-flow 2026 Edition](https://dev.to/azimahmed/react-flow-examples-for-workflow-automation-ai-builders-node-based-ui-2026-edition-3joi)
- 🟡 [Hishabee · Pharmacy Management 2026](https://www.hishabee.io/blog/best-pharmacy-store-management-software-2026)
- 🟢 [Syncfusion · React Floor Planner GitHub](https://github.com/syncfusion/ej2-showcase-react-floor-planner)
- 🔴 [cvdlab · react-planner GitHub](https://github.com/cvdlab/react-planner)
