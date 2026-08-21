# Framework Roadmap · 전체 프레임워크화 (Slice-by-Slice)

> 2026-08-21 · 사용자 결정 · 방식 C (Slice-by-Slice) · 3~6개월 · 위험 中 (관리)
>
> **베이스라인** · `docs/FRAMEWORK_AUDIT.md` (자동 생성 · 매 세션 재실행 가능)
>
> **대원칙** · 14~19 (docs/AGENT_PRINCIPLES.md) · 특히 16 (사전 커밋) · 19 (설계 우선)

---

## 🎯 목적

**모든 페이지 · 프레임워크 준수** · Card·Spinner·StatusPill·Modal·useToast·apiClient·useConfirm·Zod 재사용 · 원-오프 코드 근절.

## 📊 현재 상태 (2026-08-21 최초 감사)

| 지표 | 값 |
|---|---:|
| 스캔 파일 | 458 |
| 위반 파일 | 76 (16.6%) |
| 클린 파일 | 382 (83.4%) |
| 총 위반 | 379 |

**규칙별 위반:**
- `raw-fetch` · 107건 (apiClient 우회) · **34 파일**
- `raw-alert` · 104건 (useToast 우회) · **25 파일**
- `raw-confirm` · 57건 (useConfirm 우회) · **26 파일**
- `raw-card-wrapper` · 65건 (Card 우회) · **20 파일**
- `raw-loader2` · 2건 (Spinner 우회) · **1 파일**
- `large-file` · **44 파일** (500+ 라인)

## 📅 5단계 실행 계획

### ✅ Phase 1 · 인벤토리 (완료 · 2026-08-21 · `e33d3d9`)
- `scripts/audit-framework.cjs` · 자동 감사
- `docs/FRAMEWORK_AUDIT.md` · 리포트 생성
- 6개 규칙 · 위반 파일 우선순위 도출

### 🔜 Phase 2 · 가드레일 (1주 예상)
- **ESLint 룰 신설**
  - `no-restricted-globals` · `fetch`·`alert`·`confirm` 금지
  - `no-restricted-syntax` · `<Loader2 className="animate-spin"`
  - `no-restricted-syntax` · Raw Card wrapper 패턴
- **Pre-commit hook** · husky + lint-staged · 위반 시 커밋 차단
- **PR 체크리스트** · `.github/PULL_REQUEST_TEMPLATE.md`
- **README 업데이트** · "새 페이지 튜토리얼" 섹션

### 🔜 Phase 3 · 페이지 이관 (2~4개월 · 매 페이지 1 커밋 격리)

우선순위 · **감사 결과 + 사용 빈도**:

| 순서 | 파일 | 위반 | 라인 | 위험 | 예상 |
|---:|---|---:|---:|---|---|
| 1 | `src/lib/employeeApi.ts` | 24 | 175 | **低** | 30분 (apiClient 이관 · 8곳) |
| 2 | `PermissionsPage.tsx` | 32 | 1089 | 中 | 2시간 (alert→toast 6·confirm 1·card 1) |
| 3 | `BoardPage.tsx` | 32 | 1167 | 中 | 2시간 |
| 4 | `LunchPage.tsx` | 21 | 564 | 低 | 1시간 (fetch 4·card 2) |
| 5 | `HrFormsPage.tsx` | 19 | 1117 | 中 | 1.5시간 |
| 6 | `PharmacistMenuSettingsPage.tsx` | 21 | 509 | 中 | 1시간 |
| 7 | `ContractSettingsPage.tsx` | 25 | 919 | 中 | 2시간 |
| 8 | `ResignationWriterPage.tsx` | 44 | 1241 | 中 | 3시간 (card 16) |
| 9 | `ScanPage/ProductInfoCard.tsx` | 21 | 1014 | 中 | 2시간 |
| 10 | `LandingPage.tsx` | 65 | 2455 | 中 | 4시간 |
| 11 | `RequestsPage.tsx` | 28 | 1297 | 中 | 2시간 |
| 12 | `OcrPage.tsx` | 47 | 1737 | 中 | 3시간 (**OCR 코드 주의** · 사용자 지시 · 건드리지 마) |
| 13 | `OrderManagePage.tsx` | 49 | 3196 | **中-高** | 5시간 |
| 14 | `SchedulePage.tsx` | 25 | 2379 | **中-高** | 3시간 |
| 15 | `SalesTrendPage.tsx` | 27 | 2675 | **中-高** | 4시간 |
| 16 | `ContractWriterPage.tsx` | 66 | 5465 | **高** | 3일 (서브섹션 분리 + Card 13곳 + alert/confirm) |
| 17 | `DayTimelineModal.tsx` | 75 | 2228 | **中-高** | 3일 (로직 분리) |
| 18 | `DisplayPage.tsx` | 76 | 3134 | **高** | 3일 |
| 19 | `StaffManagePage.tsx` | 77 | 2717 | **中-高** | 2일 (SplitPanel 통합 포함) |
| 20 | `RawOcrTable.tsx` | 137 | 5274 | **高** | **OCR 코드 주의 · 건드리지 마** |

**⚠️ 주의사항:**
- OCR 코드 (`OcrPage`·`RawOcrTable`) · 사용자 지시 (`feedback_ocr_untouchable`) · **건드리지 마**
- iOS 코드 · 마찬가지 (`feedback_ios_untouchable`)
- 매 파일 · 사전 로컬 커밋 (대원칙 16) · 매 단계 TS+test 검증 (대원칙 14)

### 🔜 Phase 4 · 진행률 트래킹 (지속)
- 매 페이지 이관 후 · `node scripts/audit-framework.cjs` 재실행
- 위반 감소량 · 리포트에 자동 반영
- 주간 요약 · 사용자에게 진행률 보고

### 🔜 Phase 5 · 신규 프리미티브 발굴 (지속)
- 3곳+ 반복 패턴 · 자동 감지 (별도 스크립트)
- 후보 · `FormField`·`DataTable`·`PageSection`

## 🛡️ 절대 지켜야 할 것

1. **매 페이지 · 1 커밋 격리** · 롤백 안전 (대원칙 16)
2. **위험 中/高 · 사용자 명시 승인** · 자율 X (대원칙 16)
3. **매 커밋 · TS+build+test PASS** · 회귀 절대 X (대원칙 14)
4. **완료 즉시 · 요약 보고** (대원칙 15)
5. **프레임워크 우선** · 새 코드는 반드시 (대원칙 17·19)
6. **오래된 태스크 순** (대원칙 18)

## 💰 트레이드오프

**감수해야:**
- 신기능 개발 속도 30~50% 감소
- 세션당 처리량 감소 (검증 시간)
- 사용자 UI 변화 미미 (내부 리팩터)

**얻는 것:**
- 유지보수성 · 신규 개발자 온보딩 시간 절반
- 회귀 감소 · 통합 테스트 사전 감지
- 새 기능 개발 속도 · 나중엔 오히려 빨라짐

## 🚀 다음 실행 (지시 대기)

**Phase 2 착수** · ESLint 룰 도입 · pre-commit hook · 가드레일 구축 · **사용자 승인 시 즉시 진행**

**or Phase 3 첫 파일 (employeeApi.ts · 저위험 · 30분)** · **사용자 승인 시 즉시 진행**
