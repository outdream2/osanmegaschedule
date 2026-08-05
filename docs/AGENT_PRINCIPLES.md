# AGENT PRINCIPLES

**목적**: 모든 에이전트(및 메인 assistant) 가 이 프로젝트에서 지켜야 할 공통 운영 원칙.
**보관 위치**: `docs/AGENT_PRINCIPLES.md` (git 관리 · 세션 유실 방지 · 토큰 만료 대비)
**작성일**: 2026-08-04 (사용자 지시 · 반복 강조)
**적용 대상**: system-implementer · ocr-master · schedule-master · object-detection-specialist · dead-code-auditor · safe-refactoring-expert · stability-bug-hunter · project-architect · backend-orchestrator · error-catcher · security-architect · performance-optimizer · mobile-ui-designer · research-strategist · Explore · Plan · general-purpose

---

## 1. 회귀 절대 금지 · 철저 테스트

**원칙**: 모든 기능에 문제 생기면 절대 안 됨.

**How to apply**:
- 매 편집 후 → `npx tsc --noEmit` 통과 확인
- 매 커밋 전 → `npm run build` 통과 확인
- 회귀 우려 지점 (import·export·API 계약·프론트↔서버 데이터 형태) 특히 신중
- 문제 발견 시 즉시 revert (`git checkout <file>`) · 재시도 신중

**과거 사례**: dead-code-auditor 에이전트가 `SalesTrendPage.tsx` 오편집 · CategoryTab/LossTrackerTab 삭제 시도 · 다른 모듈에서 참조 중이라 TS 깨짐 · 즉시 revert (2026-08-04)

## 2. 로컬 커밋만 · Remote push 절대 금지

- **사용자 명시 확인 없이 `git push` 절대 안 함**
- 로컬 커밋은 TS+build 통과 시 자동 진행 가능
- 커밋 메시지 · 한글 · Co-Authored-By 포함

**Why**: Render 자동 배포 트리거 · 준비 안 된 코드 방지.

## 3. Destructive 작업 금지

- 파일 삭제 전 · **반드시 grep 으로 참조 확인**
- 파일 삭제·대량 리팩터는 실제 사용여부 확인 후에만
- **에이전트 위임 시**: 조사·리서치만 · destructive 작업 지시 X
- `git checkout` · `git reset --hard` · `rm -rf` 등 사용 전 checkpoint

**Why**: 3시간 작업 유실 사례 (2026-07-XX) · 에이전트 오편집 파일 파괴 (2026-08-04)

## 4. 공통 부분 리팩토링 · 소스 효율

- 3곳 이상 반복 로직·UI 패턴 → 공용 컴포넌트·훅 추출
- 새 컴포넌트·훅 작성 전 · `src/components/common/` · `src/hooks/` 확인
- 새 페이지 · 공통 컴포넌트 (Modal · SplitPanel · TabBar · ListLoading · SortableHeader · KpiCard 등) 우선

## 5. 프로젝트 금지 영역 (Touch X)

- **OCR 코드 미터치** · `server/ocr/gemini.ts` · `callGeminiOcr` · engine=gemini 분기 (feedback_gemini_untouchable)
- **iOS 코드 미터치** · 바코드 스캐너 iOS (feedback_ios_untouchable)
- **재고세기(YOLO)** · 사용자 지시로 현재 비활성 상태 · 재활성 시 사용자 확인 (T39)
- **파생컬럼 사용 금지** · 사용자 허락 후 · 있는 테이블에서 조회 원칙 (feedback_no_derived_columns)

## 6. 태스크 관리

- **태스크 파일**: `docs/TASKS.md` · 세션 유실 방지
- 완료 태스크는 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 등록
- 세션 시작 시 이 파일 read
- 매 milestone (커밋·완료) 후 갱신

## 7. UI 원칙 (feedback_ui_principles)

- 모든 리스트·테이블 · 헤더 클릭 정렬 · asc/desc 토글 · 활성 컬럼 화살표
- 카테고리 색상 분류
- 반응형 (모바일 · 데스크탑)
- 예외 없음

## 8. 계약서 · 이미지 원본 우선

- 근로계약서 렌더링 · **이미지 원본 그대로**
- 법적 추가 조항 (제4조의2 등) 임의 추가 금지 · 사용자 확인 후에만
- 이미지 대비 오타 · 문구 정정만 허용 (`0ec9fa6`)

## 9. 병렬 에이전트 실행 시 주의

- 여러 에이전트 동시 실행 → 같은 파일 편집 시 커밋 경합
- 안전한 병렬: 서로 다른 파일 · 독립 작업만
- 각 에이전트에 명시적 파일 범위 지정
- **destructive 에이전트 (dead-code-auditor 등)** 는 병렬 실행 금지 · 단독 · 사용자 확인 후

## 10. 순차적 작업 처리

- 작업 중 새 요청 들어오면 → 현재 작업 안전 마무리 후 순차 처리
- 갑작스러운 스코프 변경 시 · 현재 in-progress 안전 지점에 저장 후 전환

## 11. 기능 개발 + 테스트/버그 작업 동시 진행 (2026-08-05 · 사용자 추가)

**원칙**: 새 기능 만들 때 · 테스트·버그 확인·수정도 함께 진행. 기능만 만들고 테스트 미비 상태로 넘기지 않는다.

**Why**: 회귀 예방·품질 보장. 기능 완성 후 별도로 테스트 붙이면 늦음.

**How to apply**:
- 새 기능 구현 완료 후 · 즉시 그 기능 관련 엣지 케이스 · 부정 시나리오 확인
- 관련 페이지·API 회귀 여부 grep + 실행 검증
- 발견된 버그 · 그 세션 내에 수정 · 별도 태스크로 미루지 않음
- 매 편집 후 `npx tsc --noEmit` + `npm run build` 통과 (feedback_no_regression_strict)
- UI 변경 시 · 모바일 · 태블릿 · 데스크탑 3 breakpoint 확인
- 시스템 에이전트 (system-implementer 등) 는 이 원칙을 자체 워크플로우로 내장

---

## 사용자 자주 반복하는 원칙 (2026-08-04~05)

- 리모트푸시금지
- 기능에 문제생기면 절대 안돼
- 원칙에 추가 (반복 지시 시 파일에 저장)
- OCR 건드리지마
- 재고세기 일단 주석처리
- 이미지대로 만들어 (근로계약서)
- 태스크 파일로 관리 (세션 유실 대비)
- 공통부분 리팩토링
- 기능만들면 테스트·버그 동시 진행 (2026-08-05)
- 각 에이전트별로 원칙 관리 (agent memory · agent md 파일에 반영)

---

## 관련 문서

- `docs/TASKS.md` — 진행중·대기 태스크 리스트
- `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/MEMORY.md` — 프로젝트 메모리 인덱스
- 개별 feedback 메모리:
  - feedback_git_push.md (push 확인)
  - feedback_no_regression.md · feedback_no_regression_strict.md
  - feedback_common_refactor.md
  - feedback_ios_untouchable.md · feedback_gemini_untouchable.md
  - feedback_ui_principles.md
  - feedback_auto_commit.md
  - feedback_sequential_work.md
  - feedback_no_derived_columns.md
