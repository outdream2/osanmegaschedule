# 직원 상세정보 · 최신 트렌드 조사 + 슬림화 제안

- 조사일: 2026-08-29
- 대상: `StaffDetailPanel.tsx` (404줄) · `StaffConditionsSection.tsx` (258줄) · `StaffContractSection.tsx` (383줄) · `StaffLeaveSection.tsx` (199줄) · `EmployeeProfileCard.tsx` (344줄)
- 목표: "꼭 필요한 것만" 남기기 · 20명 규모 · 오산 메가타운 약국
- 원칙: `docs/FRAMEWORK.md` 준수 · 회귀 절대 X · UI만 정리 (기능·API·훅 시그니처 유지)

---

## 1. 현재 필드 매트릭스 (전수 조사)

### A. `StaffDetailPanel` (상단 헤더 + KPI 바)
| # | 필드 | 위치 | 사용 빈도 (추정) |
|---|---|---|---|
| 1 | 사진 · 이름 · #ID | 헤더 | 상 |
| 2 | 직책 배지 (창고/매장/약사 등) | 헤더 | 상 |
| 3 | 계약유형 자동 배지 (auto) | 헤더 | 중 |
| 4 | 계약유형 수동 배지 | 헤더 | 중 (중복) |
| 5 | 레벨 (Lv.N) | 헤더 | 하 |
| 6 | 근속 (KPI) | 미니바 | 상 |
| 7 | 연차 잔여/총 (KPI + progress) | 미니바 | 상 |
| 8 | 평가 (S/A/B/C) | 미니바 | 하 |
| 9 | 퇴직금 대상 뱃지 | 미니바 | 중 |

**헤더 중복 · 배지 4개** (직책+auto계약+수동계약+레벨) — 시각 노이즈 근원.

### B. §1 인적사항 (`EmployeeInfoForm`)
- phone · email · birthDate · gender · address (5개)

### C. §6 계약·서류 (`StaffContractSection`)
| # | 필드 | 비고 |
|---|---|---|
| 10 | 계약유형 (수동) | 헤더와 중복 |
| 11 | 근속기간 | KPI와 중복 |
| 12 | 계약 시작일 · 종료일 | 계약서 있으면 파생됨 · 중복 |
| 13 | 급여 (문자열) | wage_amount 와 중복 · 레거시 |
| 14 | 인사평가 | KPI와 중복 |
| 15 | 인사 코멘트 (textarea) | memo 와 중복 (§11) |
| 16 | 이력서 URL 업로드 | 유지 |
| 17 | 근로계약서 URL 입력 (편집) | 대체로 §6-1 이력에서 처리 |
| 18 | 계약 이력 리스트 (PDF·상태) | 유지 |

### D. §7 근로조건·임금 (`StaffConditionsSection`)
- working_hours_per_week · break_apply_paid · break_time_minutes · weekly_holiday · work_location · job_duties (6개)
- wage_calc_type · wage_amount · wage_pay_day · wage_pay_method · bank_name · bank_account_no (6개)
- **12개** — 근로계약서가 있으면 사실상 계약서에서 파생 가능

### E. §7-2 연차·유급휴가 (`StaffLeaveSection`)
- KPI 3장 (잔여/총/사용) + 연도 셀렉터 + 사용이력 테이블 (날짜·유형·메모)
- **깔끔 · 유지 권장** (다만 헤더 KPI와 중복 → 헤더 KPI에서 progressbar만 남기고 상세는 여기)

### F. §9 4대보험
- 국민연금·건강보험·고용보험·산재보험 (각 취득일 date) + 제외 대상 checkbox

### G. §10 약국 특수 자격
- 약사 면허번호 · 보건증 만료일

### H. §11 메모
- textarea (인사 코멘트와 100% 중복)

### I. `EmployeeProfileCard` (직원 본인 뷰 · 스케줄 클릭 · 관리 뷰모드)
- 이름 · 사번 · 재직상태 pill · position/employmentType
- 근로조건 요약 (계약서 파생) — 근무·연차·수습·기본급·계약 기간
- 성별·입사일·근무지·연차 (grid) + 전화 (로그인 ID 강조)
- 첨부 3슬롯 (이력서·근계·통장사본)
- 비고 (있을 때만) · 근계 모달

**총 필드 수**: 관리자 상세 패널 기준 **약 40+ 필드**. 중복 8곳 · 레거시 3곳.

---

## 2. 트렌드 요약 (2026 HRIS)

### 공통 패턴 (BambooHR · Rippling · Personio · Gusto · Charlie HR · Deel)
1. **Snapshot 헤더 우선** (BambooHR) — 이름·직책·연락처·재직상태만 상단 고정. 나머지는 "전체 프로필 열기".
2. **Progressive Disclosure** (SaaS UI 2026 최우선 원칙) — 최소 정보만 표시 → 사용자 요청 시 상세 오픈.
3. **Tabbed 구조** (Notion/Linear 톤 · Personio·Rippling도 채택):
   - `Personal` (연락처·주소·비상연락)
   - `Job` (직책·부서·입사일·매니저·재직상태)
   - `Compensation` (계약·급여·계좌·4대보험)
   - `Documents` (이력서·계약서·통장사본·보건증)
   - `Time Off` (연차·휴가)
4. **접근제어 별 필드 노출** (BambooHR) — 관리자는 전체, 직원 본인은 필요한 것만.
5. **AI 데이터 검증** (2026 신 트렌드) — 누락·불일치 자동 표시. 아직 도입 검토 단계.

### 한국 규제 최소선 (근로기준법 · 개인정보보호법)
- **근로자명부 (근기법 §41)**: 성명·성별·생년월일·주소·이력·업무·고용사항·퇴직정보 (9개) · **3년 보관 의무**
- **주민등록번호**: 4대보험 취득신고·연말정산 목적일 때만 수집 가능
- 약국 20인 규모: 안전보건관리담당자 선임 필요 (별도 필드 X, 조직 정보)

### Linear/Notion 2026 상세 패널 톤
- 헤더 sticky · 얇은 gradient accent · glass 배경 (현재 v9 스타일 유지 OK)
- 밀도 높은 정보 배치 · 컬러 최소화 (파스텔 지양)
- 접힘/펼침 카드 (SectionCard) · defaultOpen 은 핵심 2-3개만

---

## 3. 필드 분류 · 3분류 정리

### A. 필수 (항상 노출 · 헤더 + Overview 카드)
| 필드 | 근거 |
|---|---|
| 이름 · 사번 · 사진 | 식별 필수 |
| 직책 · 계약유형 (배지 1개로 통합) | 실무 즉시 판단 |
| 재직상태 (재직/퇴사예정/퇴사) | UX 최우선 |
| 전화 (로그인 ID) | 약국 실무 · 로그인 발급 |
| 입사일 · 근속 | 근로자명부 필수 |
| 연차 잔여/총 (progress) | 매일 조회 |
| 급여 요약 (임금유형 + 금액) | 근계 파생 |
| 근로계약서 링크 | 근계 3년 보관 · 핵심 |

**총 8-9개** — 헤더 + 1개 "요약 카드"로 소화.

### B. 부가 (탭으로 숨김 · 요청 시 펼침)
- **Personal 탭**: email · birth_date · gender · address · 비상연락처 (신규)
- **Job 탭**: level · work_location · job_duties · weekly_holiday · working_hours_per_week · break_time
- **Compensation 탭**: wage_calc_type · wage_amount · wage_pay_day · wage_pay_method · bank_name · bank_account_no · 4대보험 4항목 + 제외
- **Documents 탭**: 이력서 · 근로계약서 (+ 계약 이력) · 통장사본 · 보건증 만료일 · 약사 면허번호
- **Time Off 탭**: 연차 사용이력 (현재 §7-2 그대로 이관)

### C. 제거 후보 (중복 · 레거시 · 저사용)
| 필드 | 사유 | 대응 |
|---|---|---|
| 헤더 "레벨 Lv.N" | 저사용 · Level 필드 자체 재검토 | Job 탭 이동 |
| §6 "계약유형 수동 배지" | 헤더 배지와 중복 | 헤더만 유지 (auto 우선) |
| §6 "근속기간" | 헤더 KPI와 중복 | 제거 |
| §6 "계약 시작/종료일" | 계약서 이력에서 파생 | 계약서 있으면 숨김 |
| §6 "급여 (salary 문자열)" | wage_amount 와 중복 · 레거시 필드 | 제거 (마이그 필요) |
| §6 "인사평가 select" | 헤더 KPI 배지와 중복 | 편집 시만 노출 |
| §6 "인사 코멘트 textarea" | §11 메모와 100% 중복 | §11로 통합 |
| §7 "근무 장소 · 종사 업무" | 근계 파생 (단일 약국 · 고정) | 계약서 없을 때만 |
| §7 "지급 방법" | 사실상 "계좌이체" 고정 | 기본값 · 편집 시만 |
| 헤더 "퇴직금 대상 배지" | 근속 1년+ 자동 산출 · 저사용 | tooltip으로 이동 |

**8-10 필드 제거 · 300라인+ 감량 예상**.

---

## 4. UX 개선 제안 (구체안)

### 4-1. 상단 Snapshot 헤더 (60px · sticky)
```
[사진] 홍길동 #12 [약사] [정규직·활성] [Lv.3]     [편집] [삭제]
       근속 2년 3개월 · 010-1234-5678 (로그인) · 입사 2024-05-15
```
- 배지 3개로 축약 (직책 + 계약유형 auto + 재직상태)
- 사번·근속·전화·입사일 한 줄 압축

### 4-2. Overview 카드 (기본 펼침 · 유일)
- 근로 조건 요약 (계약서 파생 · 4개 값: 근무시간 · 연차 · 기본급 · 계약기간)
- 연차 progress (얇은 gradient bar · 잔여/총)
- 근로계약서 열기 버튼 (primary)
- 이력서·통장사본 (secondary)

### 4-3. Tabs (5개 · Linear 톤 · h-8 · underline active)
```
[Overview] [Personal] [Job & Wage] [Documents] [Time Off]
```
- 각 탭 lazy render · 접힘 카드 없음 (탭이 SectionCard 역할)
- 편집 모드는 탭 안에서만

### 4-4. 편집 UX
- 편집 진입 시 현재 탭 유지 · 필드는 inline
- 저장 · 취소 sticky footer bar (현재 헤더 우상단 → 하단 이동)

### 4-5. 색상 · 톤 (Framework 준수)
- 파스텔·이모지·촌스러움 X
- brand-deep · zinc-* · emerald (성공) · rose (위험) · sky (정보) · amber (경고) 만
- 배지 xs 사이즈 통일 · font +2 원칙 유지

---

## 5. 실행 계획 (권장 순서 · 3단계)

### Phase 1 · 저위험 슬림화 (즉시 · 1-2h)
- §6 "근속기간" 제거 (헤더와 중복)
- §6 "계약유형 수동 배지" 제거 (헤더 auto만)
- §6 "인사 코멘트" → §11 memo 통합 (SectionCard 하나)
- 헤더 "퇴직금 대상" → tooltip
- **결과**: 약 -80 라인 · UI 즉시 깔끔

### Phase 2 · Tab 재구조 (중위험 · 3-4h)
- SectionCard 5개 → Tabs 5개 컴포넌트로 재조립
- 프레임워크 우선: `common/Tabs` 프리미티브 확인 · 있으면 재사용
- 편집 상태·API·훅 시그니처 절대 유지 (`feedback_framework_untouchable`)
- **결과**: 스크롤 → 탭 클릭 · 필요한 것만 노출

### Phase 3 · 레거시 필드 제거 (고위험 · 4-6h · 사용자 확인 필요)
- `salary` 문자열 필드 → `wage_amount` 로 마이그레이션 (백엔드 + shared/schemas)
- `work_location` · `job_duties` 계약서 있으면 파생 (`파생컬럼 사용 금지` 원칙 확인)
- **주의**: `feedback_no_derived_columns` 대원칙 · 사용자 사전 승인 필수

---

## 6. 리스크 · 함정

- ⚠️ `feedback_no_regression_top` — 모든 기능 100% 유지 · 스케줄에서 EmployeeProfileCard 사용처, StaffManagePage 편집·저장 flow 검증 필수
- ⚠️ `feedback_only_instructed` — 사용자가 "슬림화" 지시 · 필드 삭제는 사전 확인 필요
- ⚠️ 근계 파생 필드 (근무장소·업무·급여·연차) — 근계 없을 때 fallback 필수
- ⚠️ Tab 전환 시 편집중 상태 손실 방지 (draft state 유지)
- ⚠️ `EmployeeProfileCard` (스케줄 클릭용) 는 이미 슬림 · 관리자 패널만 대상

---

## 7. 우리 프로젝트 맥락 반영

- **기존 스택** (React + Vite + Tailwind + 프레임워크): common/Tabs · SectionCard · Card · Badge · StatusPill · KpiCard 이미 존재 · 100% 재사용
- **UI 목업 참조** (`docs/UI_MOCKUP_2026-08-21.html`) · 색상/타이포 통일
- **폰트 +2 대원칙** 유지 (40대+ 가독성)
- **말줄임표 금지** (`feedback_no_ellipsis`) — truncate 사용처 재검토
- **위임 X · 직접 편집** (`feedback_ui_direct`)

---

## 결론 (한 줄)

**"헤더 3배지 · Overview 카드 1개 · Tab 5개"** 구조로 재편하면 40+ 필드 → 실제 노출 8-10개 · 나머지는 필요한 탭 클릭 시만. 2026 SaaS Progressive Disclosure + 근기법 최소선 (근로자명부 9항목) 준수.

---

## Sources

- [BambooHR Employee Snapshot](https://www.bamboohr.com/product-updates/employee-snapshot) 🟢
- [Employee Profile Setup: Essential Fields & Best Practices 2026 · ShiftFlow](https://www.shiftflow.app/blog/employee-profile) 🟢
- [Employee Information Form and Guide for 2026 · AIHR](https://www.aihr.com/blog/employee-information-form/) 🟢
- [7 SaaS UI Design Trends for 2026](https://www.saasui.design/blog/7-saas-ui-design-trends-2026) 🟡
- [How we redesigned the Linear UI · Linear](https://linear.app/now/how-we-redesigned-the-linear-ui) 🟢
- [Dashboard Design Patterns 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/) 🟡
- [Top HRIS Trends 2026 · HRLaunch](https://hrlaunchtechnology.com/blog/top-hris-trends-to-watch-in-2026) 🟡
- [인사기록카드 양식과 작성법 · 다우오피스HR](https://hr.daouoffice.com/blog/personnel-record-card-guide) 🟡
- [근로관계에서의 개인정보 보호 체크 포인트 · worklaw](https://www.worklaw.co.kr/view/view.asp?bi_pidx=33364) 🟢
- [개인정보보호 가이드라인 인사·노무 편 · 정책브리핑](https://www.korea.kr/archive/expDocView.do?docId=32438) 🟢
- [인사서류 보관기간 · ZUZU](https://zuzu.network/resource/guide/storage-of-personnel-related-documents/) 🟢
- [Gusto vs Charlie · getguru](https://www.getguru.com/reference/gusto-vs-charlie) 🟡
