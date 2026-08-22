# Framework Audit Report (자동 생성)

> 생성 · 2026-08-22 · `scripts/audit-framework.cjs` · 매 세션 재실행
>
> **로드맵 · `docs/FRAMEWORK_ROADMAP.md` Phase 1 (인벤토리)**

## 📊 요약

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 537 |
| 위반 파일 | 8 |
| 클린 파일 | 529 (99%) |
| 총 위반 개수 | 8 |

## 🚨 규칙별 위반 현황

| 규칙 | 총 위반 | 파일 수 | severity | 수정 방향 |
|---|---:|---:|---|---|
| `large-file-critical` | 7 | 7 | high | 2000+라인 · 시급 · 서브 컴포넌트/훅 분리 필수 |
| `large-file-warn` | 1 | 1 | medium | 800-2000라인 · 서브 컴포넌트 분리 권장 |

## 🔥 우선순위 파일 (weight 순 · TOP 30)

| # | 파일 | 라인 | 총 위반 | 위반 상세 |
|---:|---|---:|---:|---|
| 1 | `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 48 | large-file-critical(1) |
| 2 | `src/components/OcrPage/RawOcrTable.tsx` | 5260 | 48 | large-file-critical(1) |
| 3 | `src/components/OrderManagePage/OrderManagePage.tsx` | 3090 | 32 | large-file-critical(1) |
| 4 | `src/components/DisplayPage/DisplayPage.tsx` | 2714 | 24 | large-file-critical(1) |
| 5 | `src/components/LandingPage/LandingPage.tsx` | 2320 | 24 | large-file-critical(1) |
| 6 | `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2502 | 24 | large-file-critical(1) |
| 7 | `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 24 | large-file-critical(1) |
| 8 | `src/components/StaffManagePage/StaffManagePage.tsx` | 1917 | 6 | large-file-warn(1) |

## 📝 모든 위반 파일 (8개)

<details><summary>펼치기 · 파일 리스트</summary>

| 파일 | 라인 | 위반 |
|---|---:|---:|
| `src/components/ContractWriterPage/ContractWriterPage.tsx` | 5483 | 48 |
| `src/components/OcrPage/RawOcrTable.tsx` | 5260 | 48 |
| `src/components/OrderManagePage/OrderManagePage.tsx` | 3090 | 32 |
| `src/components/DisplayPage/DisplayPage.tsx` | 2714 | 24 |
| `src/components/LandingPage/LandingPage.tsx` | 2320 | 24 |
| `src/components/SalesTrendPage/SalesTrendPage.tsx` | 2502 | 24 |
| `src/components/SchedulePage/SchedulePage.tsx` | 2379 | 24 |
| `src/components/StaffManagePage/StaffManagePage.tsx` | 1917 | 6 |

</details>

## 🎯 다음 액션 (권장)

1. `docs/FRAMEWORK_ROADMAP.md` Phase 2 · ESLint 룰 도입 · pre-commit hook
2. TOP 5 파일 · 대원칙 준수 이관 (매 커밋 격리 · TS+test 검증)
3. 주간 재실행 · 진행률 트래킹
