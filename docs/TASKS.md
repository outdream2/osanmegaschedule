# TASKS

> 2026-08-10 정리 · 완료 항목 제거 · 대기 큐만 유지

## 🔴 대기 큐 (사용자 결정 완료·미완)

### A · 스케쥴 [수정] → StaffManagePage 라우팅 (스펙 확정 · 진행 대기)
- 지금 SchedulePage.EmployeeFormModal 로 감
- 원함: 경영 > 직원관리 오른쪽 상세로 이동 + 해당 직원 자동 선택
- **Q1 확정 (A)**: 스케쥴의 EmployeeFormModal 완전 제거 · 편집은 StaffManagePage 에서만
- **Q2 확정 (A)**: StaffManagePage 에서 [스케쥴로 돌아가기] 버튼 · 자동 이전 탭 복귀
- 작업: BusinessManagePage `initialEmployeeId` prop · StaffManagePage `initialSelectedId` prop · onNavigate 시그니처 확장 · SchedulePage 콜백 · EmployeeFormModal 제거

### B · 근계 조회 · 사번 키 (Step 1-2 완료 · Step 3-4 대기)
- **Q1 확정 (A · 최소 5개)**: working_hours · annual_leave_days · probation_end_date · base_wage_type · base_wage_amount
- **Q2 확정 (A · grid 아래 인라인)**: 새 섹션 "근로 조건"
- ✅ Step 1: SQL `add_contract_work_terms_2026-08-10.sql` (커밋 `fdd5226`)
- ✅ Step 2: 서버 `GET /api/employees/latest-contract` (사번 키 · fallback employeeId)
- ⏳ Step 3: ContractWriterPage 저장 시 payload include (working_hours·annual_leave_days·probation_end_date·base_wage_type·base_wage_amount·employee_number)
- ⏳ Step 4: EmployeeProfileCard · 사번으로 fetch · grid 아래 인라인 표시

### D · CRUD 로직 마이그레이션 (`lib/employeeApi`) · 순서 확정
- ✅ MyPage 완료 (커밋 `9bfc858`)
- ✅ PermissionsPage 완료 (커밋 `66761d7`)
- **Q1 확정 (B · SchedulePage 먼저 · A 무관 순수 리팩토링)**
- **Q2 함수별 하나씩** · updateEmployee → createEmployee → deleteEmployee → uploadContract 각각 커밋
- ⏳ SchedulePage · axios.put(수정)·axios.post(신규)·axios.delete(삭제)·axios.post(contract 업로드)
- ⏳ StaffManagePage · fetch(편집/삭제/신규)·이력서·통장사본·사직서 (파일 첨부 · 큼)

### E · SplitPanel 공통 CSS
- Phase 1 (에이전트 실행 중) · 4곳 (Display · ContractWriter · PaymentInfo · PurchaseHistory) 잔여 폰트/여백 통일
- Phase 2 (위험) · SplitPanel 미도입 페이지 (StaffManagePage 등) 이관

### F · #34 스캔 실재고 합계 배치
- 스펙 재확인 · "위 기존 합계숫자 · 아래 입력창"
- Phase A 로 이미 유사 기능 있음 (셀 아래 마이크로텍스트 · 헤더 총 diff 뱃지)
- 사용자 원본 의도 재확인 필요 · 사용자 답변 대기

### G · #45 스캔 Phase B · StockRow 컴포넌트 분리
- Phase A 는 커밋 `2b68064` 완료 (A1 3열 diff · A3 헤더 뱃지 · A5 localStorage draft)
- Phase B (대규모 refactor) · 별도 세션

### H · #32 SplitPanel 폭 조절 · 실재고입력·상품입고
- 에이전트 실행 중 · ScanPage · ProductArrivalPage · useResizablePanel 도입

### I · #42 · 발주 PDF 생성 + 카카오톡 자동 발송
- SolAPI env · 템플릿 · 사업자 인증 대기

### J · #43 · 프로젝트 전체 버튼 여백 축소
- index.css 부분 반영 (py-2·py-3·px-4·px-5) · 잔여 확인 필요

### Phase 2 · ContractWriterPage 사번 (스펙 확정 · 진행 대기)
- Phase 1: 마이그레이션 (`add_employee_number_2026-08-10.sql`) · Employee 타입 · EmployeeProfileCard 사번 표시
- **Q1 확정 (C · 인적사항 폼 통합)**: `EmployeeInfoForm` 에 사번 필드 추가 · ContractWriter·StaffManage 모두 자동 반영
- **Q2 확정 (번호만 저장)**: EMP- 접두 없이 · 숫자만 (예: "1", "100", "2026001") · 자유 형식 · 관리자 수동 입력
- 작업: EmployeeInfoForm 에 employee_number 필드 · ContractWriterPage 저장 payload include · employees·employee_contracts 둘 다 갱신

---

## ⏸️ 사용자 액션 대기 · Supabase SQL Editor

| SQL 파일 | 목적 |
|---------|------|
| `migrations/add_order_dispatch_columns_2026-08-10.sql` | 발주 라이프사이클 컬럼 (status·order_number 등) |
| `migrations/add_vendor_extra_contacts_2026-08-10.sql` | 공급사 팀장·긴급연락처 |
| `migrations/drop_dead_columns_2026-08-10.sql` | dead columns 정리 |
| `migrations/add_employee_bankbook_column_2026-08-10.sql` | employees.bankbook_image_url |
| `migrations/add_employee_number_2026-08-10.sql` | employees·employee_contracts.employee_number |
| `migrations/add_contract_work_terms_2026-08-10.sql` | employee_contracts · 근로정보 5개 컬럼 |

**주의**: SQL 파일 복사 시 · 라인 번호·git diff `+` 접두 함께 복사 X · 파일 raw 내용만.

---

## 📜 이 세션 완료 로그 (2026-08-10)

### `66761d7` · PermissionsPage · lib/employeeApi.updateEmployee 로 교체
- axios.put 13개 필드 payload → `updateEmployee(target, { level })` 1줄
- Optimistic·revert·saved fade 로직 유지

### `9bfc858` · MyPage · 주소 저장 lib/employeeApi 로 교체
- 12개 필드 수동 payload → updateEmployee(me, patch)

### `fdd5226` · 근로정보 5개 컬럼 + latest-contract API (B Step 1-2)
- SQL: employee_contracts working_hours·annual_leave_days·probation_end_date·base_wage_type·base_wage_amount
- GET /api/employees/latest-contract · 사번 우선 · fallback employeeId

### `eea333d` · 사번 (employee_number) 컬럼 Phase 1
- SQL · employees·employee_contracts + UNIQUE index · Employee 타입 · EmployeeProfileCard 헤더 표시

### `f96ccca` · 공통 EmployeeProfileCard 추출 · 스케쥴 톤
- `src/components/common/EmployeeProfileCard.tsx` 신설
- EmployeeCalendarModal info 탭 교체

### `484970a` · 공통 API 모듈 · lib/employeeApi.ts
- updateEmployee (base merge) · createEmployee · deleteEmployee
- uploadResume · uploadContract · uploadBankbook · uploadResignationFile · deleteResume

### `277088c` · fix 성명 셀 폭 회귀 · 90/110/120 조정
### `156b1b7` · 성명 셀 hover 편집·삭제 아이콘 제거 (직원정보 탭 [수정] 로 대체)
### `61b2a11` · 성명 body 셀 폭 반감
### `9b3d8bf` · 스케쥴표 헤더 폰트·라벨 축약·성명컬럼 여백 반감 + AppNavHeader 순서 (홈→스케줄→매장→경영→약사→이슈→요청)
### `8bb915b` · 첨부파일 버튼 나란히 (flex-nowrap)
### `157cf52` · 첨부파일 3슬롯 항상 노출 · 미등록 dashed
### `d09f066` · 직원정보 탭 세련화 · 첨부파일 3종 · 중복 제거
### `24b5205` · 직원 달력 저장 버튼 방식 (pendingChanges + batch 저장) + info 탭 공통화
### `2b68064` · 스캔 재입력 UI Phase A · #45 · A1 3열 diff · A3 헤더 뱃지 · A5 localStorage draft
### `e4a51da` · 전역 그라데이션 제거 · 30 files · 106 gradients → solid
### `66d8e4c` · 통장사본 컬럼 정식화 + 버튼 여백 축소 (px 컴팩트)

---

## ❌ 취소된 항목
- **C · StaffManagePage 오른쪽 상세 · EmployeeProfileCard 통합** (2026-08-10 사용자 취소)

---

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
