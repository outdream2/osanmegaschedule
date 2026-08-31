# STABILITY_TEST_2026-09-01

> 생성: 2026-09-01 · Phase 3 안정성 감사

## 요약

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 에러 0 ✓ |
| `npx vitest run` | 3391/3391 통과 (fix 후) ✓ |
| `npm run build` | 성공 · 경고 2건(import.meta/CJS · 무해) ✓ |
| `audit-framework.cjs` | 위반 1파일 (RawOcrTable.tsx 801L · medium) |

## 수정 버그

### BUG #1 (MEDIUM → FIX) `006e6354`

**stockPeriodUtils.test.ts · UTC/로컬 타임존 불일치**

```
Location: src/lib/stockPeriodUtils.test.ts:110-113
Root Cause: 테스트가 new Date().getMonth() (로컬 KST)으로 달 계산 →
  KST 23시+ 에서 월말 UTC와 달이 달라짐 (2026-08-31 UTC = 로컬 2026-09-01)
  generatePeriods()는 new Date().toISOString().slice(0,10) UTC 사용 →
  테스트가 "2026-09-01" 생성 → 30일 범위(today=2026-08-31) 초과 → 필터 배제
Fix: todayUtc = new Date().toISOString().slice(0,10) 사용 통일
```

## 빌드 경고 분석

```
"import.meta" is not available with "cjs" output format (×2)
```
- `src/supabase/client.ts` · Vite 환경변수 접근
- 서버 번들 대상 · Vite 실행 환경에선 정상 · 런타임 무해

## Framework Audit 결과

| 위반 파일 | 라인 | 위반 |
|---|---:|---|
| src/components/OcrPage/RawOcrTable.tsx | 801 | large-file-warn(1) |

- 이전 감사 대비 위반 수 감소 (2026-08-29 · 3→1)
- RawOcrTable.tsx 는 서브컴포넌트 추가 분리 권장 (801L → 목표 700L 이하)

## 최근 30+ 커밋 회귀 감사

| 커밋 | 변경 | 회귀 여부 |
|---|---|---|
| `b4aff28b` | FlowTab 811→640L 분리 | 없음 (TS clean) |
| `3f38d076` | API.md 자동 문서화 | docs only |
| `105f497f` | warehouse_stock 컬럼 DROP 대응 | 레거시 alias 보존 ✓ |
| `eafc05e5` | BorrowingPage v2 (legacy 백업) | 없음 |
| `9bcf1c99` | zone-category 화살표 좌측 접기 | 없음 |
| `662d92cd` | SegmentedControl 프리미티브 | audit 3→1 위반 감소 ✓ |
| `3740d931` | SalesTrendPage 판매대시보드 탭 | 없음 |
| `a5fdb9ef` | reservations 마이그레이션 | DB only |

## Edge Case 검토

| 시나리오 | 결과 |
|---|---|
| 빈 products 목록 | EmptyState 프리미티브 사용 ✓ |
| null/undefined product.real_map | normalizeProduct.ts 처리 ✓ |
| fetch 실패 | useApiQuery errorBoundary + useToast ✓ |
| 타임존 불일치 (KST 월경계) | 이번 세션 수정 ✓ |
| 인증 만료 401 | useAuth.ts onLogout() 즉시 이동 ✓ |

## 결론

안정성 등급: **A**

- CRITICAL 0 · HIGH 0 · MEDIUM 0 (fix 완료 1건) · LOW 1 (vendors DTO 문서갭)
- 배포 가능 상태
