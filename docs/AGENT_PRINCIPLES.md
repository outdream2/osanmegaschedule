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

### 7-b. **하위 탭 · long-press 재정렬** (2026-08-05 · 사용자 원칙 · 반복 지시)

**원칙**: 메인메뉴 아래 · **모든 하위 탭 메뉴** · 꾹 누르면 (long-press) 드래그로 순서 이동 가능. **공통 기능**으로 구현하여 · 전 페이지 자동 적용.

**How to apply**:
- 공용 컴포넌트 · `src/components/common/ReorderableTabs.tsx` (or 기존 TabBar 확장) · long-press 감지 + drag-drop + localStorage 순서 저장
- 신규·기존 탭바 · 이 컴포넌트로 통일
- 저장 key · 페이지별 unique (예: `tabOrder:staffManage`)
- 마우스: 300ms hold → drag mode · 터치: 500ms hold → drag mode
- 순서 초기화 · 컨텍스트 메뉴 or 우클릭 · "탭 순서 초기화"

**금지**:
- 개별 페이지마다 재구현 (반드시 공통 훅·컴포넌트)
- localStorage 없이 세션 종료 시 순서 초기화

### 7-a. **정보 밀도 · 컴팩트 배치** (2026-08-05 · 사용자 원칙 추가)

**원칙**: 한 줄에 나타낼 수 있으면 · **한 줄에 나타냄**. 보기 좋게 · 컴팩트하게. PC 뷰에서 특히.

**How to apply**:
- 폼 필드 · 관련 정보 그룹핑 · 한 flex row 로 배치
- 각 필드 · flex-1 or shrink-0 · min-w 로 조정
- 반응형 · sm 미만만 세로 스택 (flex-col) · sm 이상 · 한 줄 (flex-row)
- 여백 · gap-1 or gap-2 (넘치지 않게)
- 라벨·값 · 위아래 배치 or 좌우 배치 (컨텍스트에 따라)
- 정보 밀도 vs. 가독성 · 균형 · 너무 압박하지 X · 컴팩트하되 시각적으로 여유

**금지**:
- 한 줄에 넣을 수 있는데 · 별도 줄로 나눔 (공간 낭비)
- 여백 과다 (py-3, mt-4 등 · 필드 사이 큰 여백)
- PC 뷰에서 모바일 스택 layout 유지 (반응형 부재)

## 7-c. **파생컬럼 금지 · 기존 테이블 활용** (2026-08-05 · 사용자 원칙 · 반복 강조)

**원칙**: 파생컬럼 절대 금지. **정합성을 위해 · 웬만하면 · 기존 테이블 활용**하여 JOIN 으로 조회. 근로계약서 정보는 `employee_contracts` 에서 취합하여 표시.

**Why**: 파생컬럼 · 원본 스냅샷과 최신값 사이 정합성 붕괴 원인. 이력 관리 필요한 경우만 예외 (계약 시점 이름 보존 등 · db_audit 리스트 참고).

**How to apply**:
- 신규 컬럼 추가 전 · 기존 테이블 JOIN 으로 조회 가능한지 우선 검토
- 사용자 요청 예시: "직원리스트 계약유형 컬럼" → **파생컬럼 X · employee_contracts JOIN** 으로 표시
- 사용자 요청 예시: "직원정보는 근로계약서 부분 그대로 읽어와서 보여주고" → employee_contracts 최신 row · JOIN or 서브쿼리
- 신규 컬럼 필요 판단 시 · **반드시 사용자 확인** (memory/project_db_audit_2026-08-05.md 유지 파생컬럼 리스트 참조)
- 성능 문제 시 · view · materialized view · index · JOIN 최적화 우선 (컬럼 복제 X)

**금지**:
- "표시 편의를 위해" 컬럼 복제 (파생컬럼)
- 사용자 허락 없이 신규 컬럼 추가
- 최신 관계형 데이터가 있는데 · snapshot 컬럼을 만드는 것

## 7-d. **임금 계산 · 노무사 표준 계산법 준수** (2026-08-05 · 사용자 정본)

**원칙**: 근로기준법 §50 (근로시간) · §56 (연장·야간·휴일 가산) · 노무사 표준 산정. 자체 판단 금지 · 아래 공식 그대로.

**표준 공식**:
- 하루 소정근로시간 상한 · **최대 8h** (초과분 → 고정연장수당)
- 주 40h 한도 · 주휴 8h (1주 만근 · 40h 이상 시)
- 월 환산 계수 · **4.3452주** (52.1786주 / 12개월)
- 연장 (일 8h 초과 or 주 40h 초과) · **×1.5배 가산**
- 휴일 (주휴일·공휴일 근로) · **×1.5배 가산**
- 휴일 8h 초과 · **×2.0배 가산** (휴일+연장)
- 야간 (22:00~06:00) · **×0.5배 추가 가산**

**케이스별 (주 5일)**:
| 일근무 | 월 기본급h | 월 연장(실) | 월 연장(가산×1.5) | 총 인정h |
|---|---|---|---|---|
| 7.5h | 195.5 | 0 | 0 | 195.5 |
| 8.0h | 209 | 0 | 0 | 209 |
| 8.5h | 209 | 10.86 | 16.29 | 225.29 |
| 9.0h | 209 | 21.73 | 32.59 | 241.59 |
| 10.0h | 209 | 43.45 | 65.18 | 274.18 |

**공식 코드**:
```typescript
const WEEK_PER_MONTH = 4.3452;
const DAILY_LIMIT = 8;

function calcMonthlyHours(dailyH: number, workDays: number = 5, weekendDays: number = 0) {
  const dailyBasic = Math.min(dailyH, DAILY_LIMIT);
  const weeklyBasic = dailyBasic * workDays;              // 일 기본
  const weeklyHoliday = weeklyBasic >= 40 ? 8 : dailyBasic; // 주휴
  const weeklyOvertime = Math.max(0, (dailyH - DAILY_LIMIT) * workDays); // 일 초과
  
  const monthlyBasic = (weeklyBasic + weeklyHoliday) * WEEK_PER_MONTH;
  const monthlyOvertimeReal = weeklyOvertime * WEEK_PER_MONTH;
  const monthlyOvertimeGained = monthlyOvertimeReal * 1.5; // 가산
  
  const monthlyHoliday = weekendDays * dailyH * WEEK_PER_MONTH; // 실
  const monthlyHolidayGained = monthlyHoliday * 1.5;
  
  return { monthlyBasic, monthlyOvertimeGained, monthlyHolidayGained };
}
```

**금지**:
- 하루 8h 초과분을 기본급에 산입
- 296.94h · 335.91h 등 · 고정 divisor 하드코딩 (특정 케이스만 유효)
- 자체 계산법 · 사용자 확인 없이 수정

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

## 12. 병렬 진행 · 서로 영향 없을 때만 (2026-08-05 · 사용자 추가)

**원칙**: 기능 간 서로 영향 안 주면 **병렬 진행** · 문제 있을 것 같으면 **순차 진행** (안전 우선)

**Why**: 시간 절약 vs 안전. 사용자의 최우선 가치 = 안전. 조금이라도 회귀 우려 있으면 순차.

**How to apply**:
- 병렬 가능 판단 · 아래 모두 만족 시
  - 편집 파일 겹침 X (같은 파일 편집 X)
  - API 계약 겹침 X (동일 라우터·엔드포인트 X)
  - state·훅 공유 없음 (동일 컴포넌트 state 편집 X)
  - DB 스키마 · 마이그레이션 겹침 X
- 병렬 실행 방법 · 한 메시지에 여러 Agent 툴 호출 (multiple tool_use blocks)
- 병렬 X 상황 (반드시 순차)
  - 같은 파일 · 같은 함수 편집
  - 서로 의존 관계 (A 결과가 B 입력)
  - destructive 작업 (파일 삭제 · 대량 리팩터) — 단독 · 사용자 확인 필수
  - 회귀 위험 큰 변경 (import·export·API 계약 등)
- 애매하면 순차 (안전 우선)

**과거 사례**:
- dead-code-auditor 백그라운드 실행 중 · 다른 작업 병행 · SalesTrendPage 파괴 발생 (2026-08-04)
- 이후 destructive 에이전트 병렬 실행 금지 원칙 확립

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

## 13. 지시 없는 UI 변경 절대 금지 (2026-08-20 · 재확인)

**원칙**: 사용자 명시 지시 없이 UI 를 바꾸면 안 됨. 옛 리포트·이전 요청을 근거로 임의 실행 금지.

**과거 사례**: `c3d7e9d` · LandingPage dots 4색 → blue 단일 통일 · 사용자 새 지시 없이 옛 리포트 기반 실행 → `b2634ee` 즉시 revert 필요 (2026-08-20)

**금지**:
- 이전 세션 잔여 리포트를 사용자 재확인 없이 그대로 실행
- "이전에 말한 것" 으로 추정하여 UI 변경
- "개선이 될 것 같아서" 임의 추가·수정

**허용**:
- 사용자가 이번 세션에 명시적으로 요청한 것만
- 애매하면 물어볼 것

---

## 14. 프레임워크·기능 무영향 · 매 단계 테스트/버그 (2026-08-21 · 사용자 원칙 추가)

**원칙 (3단 강화)**:
1. **프레임워크에 절대 영향 주지 않음** · props/state/hooks/API 시그니처 · 공용 컴포넌트 구조 · 그대로 유지
2. **기능에 문제 생기지 않게** · 사용자 flow · 모든 handler·비즈니스 로직 · 회귀 X
3. **매 단계마다 테스트 · 버그 잡기** · 단순 커밋도 · `npx tsc --noEmit` + `npx vitest run` + 필요시 `npx vite build`

**적용 · 모든 작업 (특히 리팩터·이동·확산)**:
- Card·Spinner 확산 · className/element 만 변경 · handler/state/API/props X
- 파일 이동 (Phase A/B/C/D) · import 경로만 · 로직 X
- 테스트 추가 · 기존 소스 변경 X (버그 발견 시 별도 커밋)

**확인 절차 (각 단계)**:
1. 변경 전 · `git status` clean 확인
2. 변경 후 · `npx tsc --noEmit` · 에러 0 확인
3. 필요시 · `npx vite build` · 에러 0 확인
4. `npx vitest run` · **개수 유지** or 증가 · 감소 시 원인 조사·복구
5. 문제 없으면 커밋

**금지**:
- 여러 파일 뭉쳐 검증 없이 커밋
- 병렬 에이전트 완료 후 · 검증 없이 다음 지시
- 테스트 실패·감소를 "무관"으로 넘기기

**과거 사례**: 
- 병렬 3-에이전트 · common/features/ProductSearchInput 이동 · ScanPage import 미갱신 → vite build 실패 (별도 세션에서 발견) → 매 단계 검증 원칙 준수 필요

---

## 15. 작업 완료 즉시 · 로컬 커밋 + 요약 보고 (2026-08-21 · 사용자 원칙 추가)

**원칙 (3항)**:
1. **태스크 완성 → 즉시 로컬 커밋** · `git add <file(s)> && git commit -m "..."` · 축적 금지
2. **매 단계 · 테스트 + 버그 잡기** · `npx tsc --noEmit` + `npx vitest run` (변경 없으면 skip) · 발견 시 즉시 수정
3. **완료 시 · 요약 보고** · 무엇을·왜·결과 정리 · 사용자가 다음 결정할 수 있게

**적용**:
- 자율진행 중에도 · 각 파일/기능 완료 시 · 개별 커밋 · 그 자리에서 짧게 리포트
- 병렬 에이전트 결과 · 종합해서 사용자에게 요약 · TS+build+test 결과 명시
- 리모트 push 는 별도 · 사용자 명시 승인 필요 (feedback_remote_push_strict)

**금지**:
- 여러 파일 뭉쳐서 한 번에 대량 커밋 (원인 추적 어려움)
- 완료 후 다음 지시 대기 · 무엇이 끝났는지 요약 X
- 테스트 실패·개수 감소를 "무관"으로 넘기기

**형식 (완료 보고 예시)**:
```
## X 완료 · 커밋 Y개

| 작업 | 결과 | 커밋 |
|---|---|---|
| A · N곳 | TS+test 통과 | `hash` |

- TS: PASS · Build: PASS · Tests: N/M · 회귀 없음
- 다음 후보: ... (or) 지시 대기
```

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
