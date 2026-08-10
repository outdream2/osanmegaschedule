# TASKS

> 2026-08-10 정리 · 완료 항목 제거 · 대기 큐만 유지

## 🔴 대기 큐 (사용자 결정 필요)

### B · 근계(`employee_contracts`) 근로정보 조회 · 사번 키 (대규모)
사용자 결정: 사번으로 계약서 조회 · 카드에 표시
**Q1 저장할 필드** (근무시간·연차·계약기간·수습기간·기본급/월급/시급·임금 8항목·4대보험·소득세 중 어느?)
**Q2 카드에 표시할 항목** (grid 아래 · 별도 카드 · 접기?)
- 단계: SQL 확장 → GET /api/employees/:number/latest-contract → ContractWriterPage 저장 확장 → EmployeeProfileCard 조회·표시

### C · StaffManagePage 오른쪽 상세 · `EmployeeProfileCard` 통합
- 뷰/편집 병존 방식 확정 필요

### D · CRUD 로직 마이그레이션 (`lib/employeeApi`)
- MyPage · PermissionsPage (안전 · 우선)
- SchedulePage / EmployeeFormModal (크므로 신중)
- StaffManagePage (파일 첨부 로직 포함 · 큼)

### E · SplitPanel 공통 CSS
- Phase 1 (안전) · 4곳 (Display · ContractWriter · PaymentInfo · PurchaseHistory) 잔여 폰트/여백 통일
- Phase 2 (위험) · SplitPanel 미도입 페이지 (StaffManagePage 등) 이관

### F · #34 스캔 실재고 합계 배치
- 스펙 재확인 · "위 기존 합계숫자 · 아래 입력창"
- 위치 (모바일 카드 or PC 테이블 footer) 명확화 필요

### G · #45 스캔 Phase B · StockRow 컴포넌트 분리
- Phase A 는 커밋 `2b68064` 완료 (A1 3열 diff · A3 헤더 뱃지 · A5 localStorage draft)
- Phase B (대규모 refactor) · 별도 세션

### H · #32 SplitPanel 폭 조절 · 실재고입력·상품입고
- ScanPage · ProductArrivalPage · 폭 조절 미구현

### I · #42 · 발주 PDF 생성 + 카카오톡 자동 발송
- SolAPI env · 템플릿 · 사업자 인증 대기

### J · #43 · 프로젝트 전체 버튼 여백 축소
- index.css 부분 반영 (py-2·py-3·px-4·px-5) · 잔여 확인 필요

### A · 스케쥴 [수정] → StaffManagePage 라우팅 (별도 확인 후)
- 지금 SchedulePage.EmployeeFormModal 로 감
- 원함: 경영 > 직원관리 오른쪽 상세로 이동 + 해당 직원 자동 선택
- BusinessManagePage · StaffManagePage 에 initialEmployeeId prop 신설 필요

### Phase 2 · ContractWriterPage 사번 (이번 세션 Phase 1 완료)
- Phase 1: 마이그레이션 (`add_employee_number_2026-08-10.sql`) · Employee 타입 · EmployeeProfileCard 사번 표시
- Phase 2 (별도): ContractWriterPage 사번 필드 · 계약서 저장 시 함께 저장

---

## ⏸️ 사용자 액션 대기 · Supabase SQL Editor

| SQL 파일 | 목적 |
|---------|------|
| `migrations/add_order_dispatch_columns_2026-08-10.sql` | 발주 라이프사이클 컬럼 (status·order_number 등) |
| `migrations/add_vendor_extra_contacts_2026-08-10.sql` | 공급사 팀장·긴급연락처 |
| `migrations/drop_dead_columns_2026-08-10.sql` | dead columns 정리 |
| `migrations/add_employee_bankbook_column_2026-08-10.sql` | employees.bankbook_image_url |
| `migrations/add_employee_number_2026-08-10.sql` | employees·employee_contracts.employee_number |

---

## 📜 이 세션 완료 로그 (2026-08-10)

### `eea333d` · 사번 (employee_number) 컬럼 Phase 1
- SQL · employees·employee_contracts + UNIQUE index · Employee 타입 · EmployeeProfileCard 헤더 표시

### `f96ccca` · 공통 EmployeeProfileCard 추출 · 스케쥴 톤
- `src/components/common/EmployeeProfileCard.tsx` 신설 · 이름 헤더 + subtitle + 정보 grid + 첨부 3슬롯 + 비고 + 근계 뷰어
- EmployeeCalendarModal info 탭 교체 (기존 상단 세션 dead code 정리)
- 파일 업로드 · lib/employeeApi 재사용 · localEmployee state

### `484970a` · 공통 API 모듈 · lib/employeeApi.ts
- updateEmployee (base merge) · createEmployee · deleteEmployee
- uploadResume · uploadContract · uploadBankbook · uploadResignationFile · deleteResume
- mergePayload · throwIfErr 헬퍼
- EmployeeCalendarModal 첨부 3슬롯 도입 · 미등록 시 클릭 업로드

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

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
