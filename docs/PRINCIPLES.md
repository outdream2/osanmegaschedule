# 프로젝트 대원칙 · 종합 (2026-08-23)

> **모든 작업 · 반드시 준수** · 대원칙 위배 발견 즉시 재작업
>
> **원본 위치**: 사용자 memory (`~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`)
>
> **동기화**: 이 파일 · 세션 재개 시 참조용 사본 · memory 원본이 진짜 기준

---

## 🛑 최상위 대원칙 (예외 없음)

### 대원칙 0 · 회귀 절대 금지 (`feedback_no_regression_top.md`)
- 모든 원칙 위 · 현재 기능 100% 유지 · 사용자 flow 변경 X
- 예외 없음 · 회귀 발견 시 즉시 revert · 재작업

### 대원칙 · 최신 기술·트렌드·인기 코드 (2026-08-23 · `feedback_latest_tech_trend.md`)
- React 최신 패턴 (Hooks · Suspense · Custom Hook 분리)
- TypeScript strict + satisfies + discriminated union
- 최신 라이브러리 (lucide-react · @phosphor-icons/react · zod · tailwind v3)
- 지양 · jQuery · class 컴포넌트 · Moment.js · window.alert · 직접 fetch

---

## 🎨 UI 대원칙

### UI 목업 파일 기준 필수 (2026-08-23 재강조 · `feedback_ui_mockup_2026-08-17.md`)
- **최우선 참조** · `docs/UI_MOCKUP_2026-08-21.html` (872 라인 · 최신)
- 보조 · `docs/UI_MOCKUP_PC_2026-08-17.html` · `docs/UI_MOCKUP_MOBILE_2026-08-17.html`
- 모든 UI 작업 · 목업 파일 먼저 확인 · 대응 섹션 톤·간격·색상·타이포 참조
- 신규 UI 요소 · 목업 톤 확장 적용 · 원-오프 스타일 금지

### UI 최신 트렌드 · 전체 통일 (`feedback_ui_top_principle.md`)
- Linear/Vercel/Notion/Attio 2026 톤
- 파스텔·이모지·배지·촌스러움 · 화려한 그라디언트 지양
- 딥네이비 accent (`brand-deep` · #0A2E4A) · flat card · subtle shadow

### UI 변경 시 · 기능 절대 유지 (`feedback_ui_only_no_func_change.md`)
- className 만 변경 · handler·state·API·훅 시그니처 절대 X
- UI 리팩터링 시 · 결과 픽셀 동일

### 폰트 +2 기본 (`feedback_font_plus2_default.md`)
- Claude 는 폰트 작게 하는 경향 · 항상 +2 · 40대+ 가독성
- 목업 12 → 14 · 13 → 15 · 14.5 → 16 · 23 → 25

### 글씨·그림·화면 또렷·부드러움 (`feedback_render_smoothness.md`)
- Pretendard + antialiasing + image-rendering + GPU 가속

### UI 작업 직접 처리 (`feedback_ui_direct.md`)
- mobile-ui-designer 등 UI 에이전트 위임 금지 · 직접 편집

---

## 🧱 프레임워크 원칙

### 프레임워크 우선 · 43+ 프리미티브 (`feedback_framework_first_priority.md`)
- 신규 작업 · 프레임워크 완료 후 · 프리미티브 우선 사용
- 확장 시 프레임워크 관점 · 원-오프 코드 금지

### 프레임워크 위배 X (`feedback_framework_compliance.md`)
- 모든 신규·수정 소스 · asyncHandler·HttpError·Zod·apiClient·useToast 필수

### 프레임워크 기반 코딩 · 구조 유지 (`feedback_framework_first_coding.md`)
- api.xxx · useToast · shared/schemas 최우선 · 회귀 시 즉시 재작업

### 병렬 처리 안전 (`feedback_parallel_safe.md`)
- 파일 겹침 없으면 병렬 · 회귀·영향 절대 금지 · 통합 TS 검증

### 프레임워크 · 절대 건드리지 마 (`feedback_framework_untouchable.md`)
- UI 작업 중 props/state/effect/API/훅 시그니처 절대 X · className 만

### 기능 추가 · 프레임 구조 설계 후 구현 (`feedback_framework_first_design.md`)
- 구현 전 프레임워크 설계 필수 · 재사용성·확장성·BC 검토 · 단발성 코드 금지

### 공통 부분 리팩토링 (`feedback_common_refactor.md`)
- 3곳 이상 반복 · 공용 컴포넌트·훅 추출 · 회귀 없이

### 프레임워크·기능 무영향 · 매 단계 검증 (`feedback_framework_no_impact.md`)
- Card/Spinner/이동 시 · TS+build+test 매 단계 · 개수 감소 원인 조사 필수

---

## 💾 Git · 커밋 원칙

### 중요 지점 자동 로컬 커밋 (`feedback_auto_commit.md`)
- TS+build 통과 시 사용자 확인 없이 로컬 커밋 · remote 절대 X

### 위험 작업 전 · 로컬 커밋 (`feedback_pre_commit_safe.md`)
- working tree clean · 매 단계 검증 · 롤백 안전 · 자율 진입 금지

### 리모트 push · 명시 승인 필수 (`feedback_remote_push_strict.md`)
- 사용자가 명시적으로 "푸시" 말해야만 · 그 외 절대 금지 (2026-08-05 재강조)

### Git Push 확인 (`feedback_git_push.md`)
- push 전에 반드시 사용자에게 먼저 물어볼 것

---

## 🔍 로그·테스트 원칙

### try/catch + 자세한 로그 (`feedback_logging_principle.md`)
- 모든 API·비동기 · try/catch + prefix 로그 + 원인별 status

### 태스크 관련 모든 기능 항상 테스트 + 버그 수정 (`feedback_test_bugfix_principle.md`)
- TS+build 필수 · 사용처 grep · 발견 즉시 수정

### 회귀·간섭 방지 (`feedback_no_regression.md`)
- destructive 명령 전 checkpoint · 에이전트 위임 전 커밋 · 인코딩 fix 는 부분수정으로

### 회귀 절대 금지 · 철저 테스트 (`feedback_no_regression_strict.md`)
- 모든 기능 문제 X · 매 편집 TS+build · 에이전트 파괴 작업 금지 (2026-08-04)

---

## 📝 코드 스타일 원칙

### 코드 슬림화 · 리팩터링 · 효율 (`feedback_code_slim.md`)
- 주석 최소 · 중복 제거 · 프레임워크 기반 · 500라인 초과 분리

### 프레임워크화 · 재사용 구조 (`feedback_framework_principle.md`)
- 3곳 반복 = 즉시 추출 · lib/hooks/common 활용

### 파생컬럼 사용 금지 (`feedback_no_derived_columns.md`)
- 파생컬럼은 사용자 허락 후 · 있는 테이블에서 조회하는게 원칙

### 지시한 것만 할 것 (`feedback_only_instructed.md`)
- 사용자 요청 원문 그대로 · 확대·재해석·임의 추가 금지 (2026-08-09)

---

## 📋 태스크 처리 원칙

### 태스크 파일 위치 (`project_tasks_file.md`)
- `docs/TASKS.md` 로 관리 · 완료 시 삭제 · 신규 등록

### 오래된 태스크 우선 (`feedback_oldest_task_first.md`)
- # 낮은 것 우선 · 최신 자율 진입 금지 · 명시 지시만 예외

### 순차적 작업 처리 (`feedback_sequential_work.md`)
- 작업 중 새 요청 들어오면 현재 작업 완료 후 순차 처리

### 작업 완료 · 로컬 커밋 + 요약 보고 (`feedback_task_completion_report.md`)
- 축적 X · 완료 즉시 커밋 · 표/리스트 요약 · 사용자 다음 결정 지원

---

## ⛔ Untouchable · 절대 편집 금지

### iOS 코드 수정 금지 (`feedback_ios_untouchable.md`)
- 바코드 스캐너 작업 시 iOS 코드 절대 건드리지 말 것

### Gemini 코드 수정 금지 (`feedback_gemini_untouchable.md`)
- OCR 작업 시 Gemini 관련 코드 건드리지 말 것 (ONNX 쪽만)

### OCR 엔진 검증 실패 목록 (`feedback_ocr_failed_engines.md`)
- multilingual-purejs-ocr 등 재시도 금지 엔진

---

## 🔐 세션·인증 원칙

### 세션 만료 · 즉시 로그인 화면 이동 (`feedback_session_expiry.md`)
- 401 감지 시 배너 X · onLogout() 즉시 · JWT 1h (2026-08-16)

---

## 🎯 UI 추가 원칙

### 탭 순서 · long press 재정렬 (`feedback_tab_reorder.md`)
- 메뉴 아래 하위 탭 · 꾹 누르면 드래그 재정렬 · localStorage 저장 · 전체 적용

### 리스트 UI 원칙 (`feedback_ui_principles.md`)
- 모든 리스트 · 헤더 자동 정렬 · 컬럼 폭 조정 · 카테고리 색깔 분류

### UI 대원칙 · 초고해상도·깔끔·세련·최신 (`feedback_ui_design_principles.md`)
- UI 에이전트 프롬프트에 4대 원칙 항상 포함 · 파스텔·그라디언트·다색 지양 (2026-08-13)

### 새 디자인 · UI 에이전트 상의 (`feedback_ui_consult.md`)
- 새 UI 디자인 · mobile-ui-designer 위임 · 통일성 유지 (**단, feedback_ui_direct.md 로 override 됨**)

### UI 목업 톤 세부 (`feedback_ui_mockup_2026-08-17.md`)
- teal/amber/coral/sky · Hero · Sidebar deep teal
- 색상 토큰 (blue 톤 전환 · 2026-08-17) · brand-deep #0A2E4A

### UI 최신 트렌드 · 프레임워크화 (`feedback_ui_latest_trend_framework.md`)
- 파스텔 지양 · Linear/Notion/Vercel 톤 · 버튼·카드·아이콘 통일 · common/* 프레임워크

---

## 📊 참조 · 관련 파일

- `docs/TASKS.md` · 태스크 관리 (완료/대기)
- `docs/FRAMEWORK_AUDIT.md` · 프레임워크 감사 리포트
- `docs/.framework-baseline.json` · 감사 baseline
- `docs/SESSION_STATUS_2026-08-23.md` · 현재 세션 진행 상황
- `docs/UI_MOCKUP_*.html` · UI 목업 (2026-08-21 최신)
- `scripts/audit-framework.cjs` · 감사 스크립트
- `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/` · Memory 원본 (진짜 기준)
