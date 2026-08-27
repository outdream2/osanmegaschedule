# Framework Audit Report (자동 생성)

> 생성 · 2026-08-27 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 722 |
| 위반 파일 | 2 |
| 클린 파일 | 720 (100%) |
| 총 위반 개수 | 2 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `raw-card-wrapper` | 1 | 1 | medium | Card 프리미티브 (padding·variant·clip) |
| `large-file-warn` | 1 | 1 | medium | 800-2000라인 · 서브 컴포넌트 분리 권장 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/OrderManagePage/VendorDetailTabs.tsx` | 819 | 3 | large-file-warn(1) |
| 2 | `src/components/DisplayPage/RealStockTablePage.tsx` | 748 | 2 | raw-card-wrapper(1) |

## 📝 모든 위반 파일 (2개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/OrderManagePage/VendorDetailTabs.tsx` | 819 | 3 |
| `src/components/DisplayPage/RealStockTablePage.tsx` | 748 | 2 |

</details>

## 🎯 다음 액션 (권장)

1. `docs/FRAMEWORK_ROADMAP.md` Phase 2 · ESLint 룰 도입 · pre-commit hook
2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)
3. 주간 재실행 · 진행률 트래킹
