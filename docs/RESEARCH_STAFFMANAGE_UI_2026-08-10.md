# StaffManage UI 개선 리서치 (2026-08-10)

**대상**: `src/components/StaffManagePage/StaffManagePage.tsx` (2759 lines) · `src/components/common/EmployeeInfoForm.tsx`
**목적**: 최신 HR SaaS 벤치마킹 · 실행 가능한 개선안 도출

---

## Executive Summary

- **핵심 문제**: 2759-line 단일 컴포넌트 · `flex-1 min-h-0` 3중첩 스크롤 컨테이너 (main → split-container → 인사카드) → 세로 스크롤 상위에 잡아먹힘
- **저장 UX**: "편집 → 저장" 모달형 · dirty check 없음
- **폰트**: 10~13px · dashboard 표준 (14~16px) 보다 작음
- **권장 방향**: Personio/BambooHR 방식 · 좌측 섹션 nav + 우측 단일 컬럼 폼 + **inline autosave** (필드 blur 자동 저장)

---

## Part A · 벤치마크

### 1) Rippling
- 2024~2026 · **Configurable Profiles** · 관리자가 탭·필드·순서·권한 커스텀
- 필드별 인라인 클릭 → 즉시 편집 (모달 지양)
- 우리 프로젝트 · long-press reorder 이미 있음 → 섹션 순서 커스텀 확장 가능

### 2) BambooHR
- 탭 기반 · Personal / Job / Compensation / Documents / Notes
- "Edit Fields" 버튼 · 필드 그룹 인라인/모달 편집
- "Customize Layout" 관리자 · 필드 순서/custom field
- 2026 · Employee Community UI 개편 (Profile+Personal Settings 통합)

### 3) Personio (우리 구조와 가장 유사)
- 좌측 섹션 nav (Personal data / Address / Bank / Emergency) + 우측 필드 그룹
- **폼 자체는 항상 단일 컬럼**
- 섹션 = 권한 단위 · role-based badge
- **우리 페이지에 최적** · 아코디언 4그룹 → Personio 스타일 anchor nav 로 개선

### 4) flex.team (한국 · 노동법 도메인)
- 6개 탭 분리: 인사 / 개인 / 근로계약 / 임금계약 / 급여지급 / 수상·징계
- 디자인 철학: "기능보다 사용자 · 복잡 도메인을 얼마나 쉽게 전달하는가"
- 한국 4대보험·주휴수당·퇴직금 컨텍스트 정통 → 우리에 참고 최우선

---

## Part B · 개선 제안 (우선순위)

### P1. 세로 스크롤 컨테이너 정리 (30분 · 회귀 낮음)
- **왜**: 3중첩 flex + `min-h-0` 하나만 빠져도 스크롤 소실 · BusinessManagePage embed 시 부모 높이 불안정
- **어떻게**:
  1. devtools 로 `.split-container` 실제 height 확인
  2. `main` 에 `h-[calc(100vh-Xpx)]` 임시 복원 · 원인이 flex 체인인지 확인
  3. 상세영역 wrapper 에 `max-h-[calc(100vh-260px)]` fallback
- **리스크**: iOS 안전영역 · BusinessManagePage embed 컨텍스트 · 양쪽 테스트

### P2. 저장 UX · inline autosave (2시간)
- **왜**: "저장 안됨" 리포트 근본원인 · 편집 모드 토글이 모달성 · disabled state 미확실 · 버튼 헤더 우측 숨음
- **어떻게**:
  - blur 시 debounced(500ms) PATCH
  - "저장됨 · 방금 전" 인디케이터 (Notion·Rippling 패턴)
  - 헤더 편집/저장 버튼 제거 · "모두 저장됨/저장 중" 글로벌 인디케이터
  - 필드별 micro-check 아이콘
- **리스크**: race condition · 빈값 저장 위험 → **3초 Undo toast** 필수

### P3. "직책" → "직군" 드롭박스 (15분)
- 이미 `POSITIONS = ["약사","창고","매장","매니저","기타"]` 존재 (L195)
- 라벨만 "직군" 으로 변경
- 리스크 없음

### P4. 근무타입 필드 이동 (30분)
- §1 인적사항 → §2 근무·계약 그룹
- flex.team "근로계약" 섹션 하위 배치 참고
- 아이콘 `Clock`

### P5. 폰트 스케일 업그레이드 (30분 · 시각 크게 개선)
- 현재 라벨 10~11px · 값 13px
- 표준 라벨 12~13px · 값 14~16px
- `styles/tokens.ts` · `FIELD_LABEL` / `FIELD_VALUE` 토큰 신설
- `InlineField` · KPI 바 전체 치환
- **리스크**: 카드 높이 증가 → P1 함께 필수

### P6. 근속·연차·평가 KPI 바 → 텍스트 (1시간)
- 현재 (L1720) grid divide-x 카드 · 다른 섹션과 시각적 튐
- **한 줄 인라인 메타**: `근속 3년 2개월 · 연차 잔여 8일 / 15 · 평가 A · 탁월`
- 색상은 값만 emerald/amber 강조 · Notion People 스타일
- hover 툴팁으로 상세 대체

### P7. 폼 레이아웃 2-col → 단일 컬럼 (1시간)
- 접근성 리서치 (Foxit · Effortmark · gov.uk): 단일 컬럼이 스크린리더·확대·모바일 모두 우수
- 좁은 우측 패널에 2컬럼 눌림
- 짧은 필드 쌍 (성별+생년월일) 만 same-row 예외

---

## Part C · Phase 로드맵

### Phase A · 즉시 개선 (4~5시간 · 회귀 낮음)
1. P1 스크롤 fix (진단 + 수정)
2. P3 직책 → 직군
3. P4 근무타입 섹션 이동
4. P5 폰트 스케일 토큰화
5. P6 KPI 바 → 텍스트

각 단계 · build + iOS + BusinessManagePage embed 컨텍스트 테스트 · 로컬 커밋. **remote push X**.

### Phase B · 구조 리팩토링 (8~12시간)
1. P2 inline autosave · 편집 모드 완전 제거
2. P7 단일 컬럼 폼 · EmployeeInfoForm v2
3. StaffManagePage 2759 라인 → 섹션 컴포넌트 분리 (SectionPersonal / SectionWork / SectionWage / SectionCareer)
4. 좌측 섹션 anchor nav (Personio)

### Phase C · 신기능 (선택)
1. Configurable Profiles (Rippling) · localStorage
2. 탭 분리 (flex.team) · 인사 / 근로계약 / 임금 / 급여지급 / 자격
3. 문서 탭 (BambooHR) · 계약서·통장·이력서·건강진단서
4. 활동 이력 · 편집 로그 · 급여 조정 · 인사평가

---

## 리스크·함정

- **회귀 위험 최상**: 2759 라인 · BusinessManagePage embed + iOS + 데스크톱 · Phase B 착수 전 스냅샷 커밋 · 컴포넌트 단위 검증 필수
- **autosave 함정**: 빈값 저장은 confirm 또는 3초 Undo toast 필수
- **anchor nav**: 모바일 하단 스티키 세그먼트로 대체 필요 · desktop-only 시 모바일 부서짐

---

## 프로젝트 맥락

- 기존 스택 활용: `useConfirm` · `useLeaveManager` · `CARD_BASE` · 새 라이브러리 최소화
- Render 배포 계획: Phase A 순수 프론트 · 배포 영향 무
- 한국 약국 도메인: flex.team 참고 최우선 · Rippling/BambooHR UI 패턴만 차용
- 파생컬럼 금지: KPI 텍스트화 시 근속·연차 계산 client-side · DB 컬럼 추가 X

---

## 관련 파일

- `src/components/StaffManagePage/StaffManagePage.tsx` (2759 lines · 대수술 대상)
- `src/components/common/EmployeeInfoForm.tsx` (재사용 폼)
- `src/styles/tokens.ts` (P5 폰트 토큰 추가)

---

## Sources

**🟢 공식**
- [Personio: Employee Profile Overview](https://support.personio.de/hc/en-us/articles/28163575995933)
- [Rippling: Configurable Profiles](https://www.rippling.com/blog/configurable-profiles-launch)
- [BambooHR: Employee Community UI](https://www.bamboohr.com/product-updates/new-employee-community-user-interface)
- [flex.team: 인사관리](https://flex.team/landing/service/personnel-management)
- [flex 블로그 · 기능보다 사용자 (2025-07)](https://flex.team/blog/2025/07/02/2025-07-02-design/)

**🟡 전문 매체**
- [Monterail: HR Tech UX/UI 2026](https://www.monterail.com/blog/good-practices-in-hr-apps-design)
- [Foxit: Single-Column Beats Multi-Column](https://www.foxit.com/blog/elements-of-good-form-design-single-column-beats-multi-column-forms/)
- [Effortmark: Two-column forms best avoided](https://www.effortmark.co.uk/two-column-forms-best-avoided/)
- [gov.uk: typography scale accessibility](https://designnotes.blog.gov.uk/2022/12/12/making-the-gov-uk-frontend-typography-scale-more-accessible)
- [Font Size in UI/UX Design](https://medium.com/design-bootcamp/font-size-usage-in-ui-ux-design-web-mobile-tablet-52a9e17c16ce)
- [Medium: Autosaving Forms in React](https://medium.com/@ziadziadeh_89696/autosaving-forms-in-react-with-react-hook-form-autosave-49ba3dbadceb)
- [UI Patterns: Autosave](https://ui-patterns.com/patterns/autosave)
- [Tailwind: overflow docs](https://tailwindcss.com/docs/overflow)
