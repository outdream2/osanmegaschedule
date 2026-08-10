# TASKS

> 2026-08-10 정리 · 완료 항목 제거 · 대기 큐만 유지

## 🔴 대기 큐

### A · 스케쥴 [수정] → StaffManagePage 라우팅 (✅ 완료 · 커밋 `6aeefed`)
- App.tsx · navigateInnerWithOptions · bmInitialEmployeeId/FromPage state
- BusinessManagePage · initialEmployeeId prop · staff-manage 강제
- StaffManagePage · initialSelectedId · [← 스케쥴] 버튼
- SchedulePage · onEditEmployeeAtStaffManage prop

### D · CRUD 로직 마이그레이션 (`lib/employeeApi`) (✅ 완료)
- ✅ MyPage (`9bfc858`) · PermissionsPage (`66761d7`)
- ✅ SchedulePage (`61c852b`) · CRUD 5개 함수 교체
- ✅ StaffManagePage (`f6f60dc`) · CRUD + 이력서/통장사본/사직서 업로드

### F · #34 스캔 실재고 합계 배치 (스펙 확정 · G 완료 후 진행)
- **사용자 확정**: **증분 방식** (기존 방식 = 덮어쓰기 → 증분으로 변경)
- 각 셀 (창1·창2·매1·매2·매3) · **3층 구조**:
  - **위**: 기존값 (읽기 전용)
  - **중간**: 추가 입력창 (신규 입고 수량)
  - **아래**: 합계 = 기존 + 추가 (자동 계산)
- 저장 payload · 합계값으로 전송
- 스캔 시 · 이전값 자동 채움 로직 변경 (입력창 비움 · prev 필드만 채움)
- **G · B2 컴포넌트 분리 완료 후 진행** (같은 파일 편집 · 충돌 방지)

### G · #45 스캔 Phase B · StockRow 컴포넌트 분리
- Phase A (커밋 `2b68064`) 완료
- Phase B (대규모 refactor) · 별도 세션

### I · #42 · 발주 PDF 생성 + 카카오톡 자동 발송
- SolAPI env · 템플릿 · 사업자 인증 대기

---

## ✅ 완료 (이번 세션)

### A2 후보 · Progressive Disclosure (모바일) · 사용자 문의 후 미착수
### B · 근계 조회 · 사번 키 (전 4단계)
- ✅ Step 1: SQL `add_contract_work_terms_2026-08-10.sql` (`fdd5226`)
- ✅ Step 2: 서버 `GET /api/employees/latest-contract` (`fdd5226`)
- ✅ Step 3: ContractWriterPage 저장 · payload include (`1e9ea4e`)
- ✅ Step 4: EmployeeProfileCard · 근로 조건 인라인 표시 (`c90365b`)

### C · 취소 (사용자 취소)

### E · SplitPanel Phase 1 (`4589803`) · 4곳 폰트 통일

### H · #32 SplitPanel 폭 조절 (`3b8818d`) · ScanPage · ProductArrivalPage

### J · #43 버튼 여백 축소 (`3cd9c84`) · py-4/5/6 · px-2/3/6

### Phase 1 사번 (`eea333d`)
### Phase 2 사번 · Step 1 (`8f63197`) · EmployeeInfoForm 필드
### Phase 2 사번 · Step 2 (`1e9ea4e`) · ContractWriter 저장 · Employee 동기

---

## ⏸️ 사용자 액션

**SQL 실행 완료** (사용자 확인 완료 · 2026-08-10)

**남은 사용자 액션**: 없음 (SolAPI env 만)

---

## 📜 이 세션 완료 커밋 로그 (2026-08-10)

- `c90365b` B Step 4 · EmployeeProfileCard 근로 조건 표시
- `1e9ea4e` B Step 3 · Phase 2 Step 2 · ContractWriter 사번·근로정보 저장
- `8f63197` Phase 2 사번 Step 1 · EmployeeInfoForm 필드 추가
- `6de3046` DB 감사 · 추가 DROP 대상 없음 확인
- `3cd9c84` J · 버튼 여백 잔여 축소 (py-4/5/6 · px-2/3/6)
- `3b8818d` H · #32 · SplitPanel 폭 드래그 (Scan·ProductArrival)
- `4589803` E · SplitPanel Phase 1 · 4곳 폰트 통일
- `c7df39e` docs · E/H 완료 반영
- `66761d7` D · PermissionsPage 마이그레이션
- `9bfc858` D · MyPage 마이그레이션
- `39ae209` docs · D/Phase 2 스펙 확정
- `65be971` docs · A/B/C 답변 반영
- `fdd5226` B Step 1-2 · 근로정보 5개 컬럼 + latest-contract API
- `eea333d` 사번 Phase 1 · SQL · Employee 타입 · 헤더 표시
- `f96ccca` 공통 EmployeeProfileCard 추출 · 스케쥴 톤
- `484970a` 공통 API 모듈 · lib/employeeApi.ts
- `277088c` fix 성명 셀 폭 회귀 · 90/110/120
- `156b1b7` 성명 셀 hover 편집·삭제 아이콘 제거
- `61b2a11` 성명 body 셀 폭 반감
- `9b3d8bf` 스케쥴표 헤더 폰트·라벨 축약 + AppNavHeader 순서 (홈→스케줄→매장→경영→약사→이슈→요청)
- `8bb915b` 첨부파일 버튼 나란히
- `157cf52` 첨부파일 3슬롯 항상 노출 · 미등록 dashed
- `d09f066` 직원정보 탭 세련화
- `24b5205` 직원 달력 저장 버튼 방식 + info 탭 공통화
- `2b68064` 스캔 재입력 UI Phase A · #45 · A1/A3/A5
- `e4a51da` 전역 그라데이션 제거 · 30 files · 106 gradients
- `66d8e4c` 통장사본 컬럼 정식화 + 버튼 여백 축소

---

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
