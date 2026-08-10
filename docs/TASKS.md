# TASKS

> 2026-08-10 세션 마감 · 대기 큐 정리 · 완료 항목은 로그만

## 🔴 대기 큐

### #42 · 발주 · PDF 생성 + 카카오톡 자동 발송 (⏸ 사용자 대기)
- **재개 조건**: 사업자등록증 발급 → SolAPI 계정 세팅 (사업자 인증 · 카카오 채널 · 알림톡 템플릿 · API 키·env 5개)
- **완료 시**: 서버 코드 연결 (제가 진행)

---

## ❌ 취소된 항목
- **C** · StaffManagePage 오른쪽 상세 · EmployeeProfileCard 통합 (사용자 취소)
- **E Phase 2** · SplitPanel 미도입 페이지 이관 (사용자 취소 · 이미 유사 구조 · 회귀 8지점)

---

## 📜 이 세션 완료 커밋 로그 (2026-08-10)

### 신규 인프라
- `484970a` 공통 API 모듈 · `src/lib/employeeApi.ts` (CRUD + 파일 업로드)
- `f96ccca` 공통 EmployeeProfileCard 추출 · 스케쥴 톤

### 사번 · 근계 조회 (B · Phase 2)
- `eea333d` 사번 Phase 1 · SQL · Employee 타입 · 헤더 표시
- `8f63197` Phase 2 사번 Step 1 · EmployeeInfoForm 필드
- `1e9ea4e` Phase 2 사번 Step 2 · ContractWriter 저장 · Employee 동기
- `fdd5226` B Step 1-2 · 근로정보 5개 컬럼 + latest-contract API
- `c90365b` B Step 4 · EmployeeProfileCard 근로 조건 표시

### 스케쥴 [수정] 라우팅 (A)
- `6aeefed` A · 스케쥴 [수정] → 경영/직원관리 자동 선택

### CRUD 마이그레이션 (D)
- `9bfc858` D-1 · MyPage
- `66761d7` D-2 · PermissionsPage
- `61c852b` D-3 · SchedulePage
- `f6f60dc` D-4 · StaffManagePage

### 스캔 페이지 재편 (F · G)
- `2b68064` 스캔 Phase A · A1/A3/A5 (3열 diff · 헤더 뱃지 · localStorage draft)
- `3702416` G · B2 · StockRow 컴포넌트 4개 분리
- `42bb282` F · 증분 방식 3층 구조
- `40e6c1a` G · A2 · Progressive Disclosure 모바일
- `3f47479` G · A4 · 중복 스캔 자동 +1 opt-in
- `01ba6d1` G · B1 · 검토 시트 (Cin7 3단)

### 스케쥴표 개선
- `9b3d8bf` 스케쥴표 헤더 폰트·라벨 축약 + AppNavHeader 순서
- `24b5205` 직원 달력 저장 버튼 방식 + info 탭 공통화
- `d09f066` 직원정보 탭 세련화
- `157cf52` 첨부파일 3슬롯 항상 노출
- `8bb915b` 첨부파일 버튼 나란히
- `156b1b7` 성명 셀 hover 편집·삭제 아이콘 제거
- `61b2a11` 성명 body 셀 폭 반감
- `277088c` fix 성명 셀 폭 회귀

### UI 개선
- `e4a51da` 전역 그라데이션 제거 (30 files · 106 gradients)
- `66d8e4c` 통장사본 컬럼 정식화 + 버튼 여백 축소
- `3cd9c84` J · 버튼 여백 잔여 축소
- `4589803` E Phase 1 · SplitPanel 4곳 폰트 통일
- `3b8818d` H · #32 · SplitPanel 폭 드래그 (Scan · ProductArrival)

### DB
- `6de3046` DB 감사 · 추가 DROP 대상 없음 확인

### fix
- `423fe55` 종합 점검 3건 (bankbook·employee_number PUT · 검토시트 상품명 · nav 잔재)
- `eaec171` cleanup · scanModal dead code · StockRowMobile zone 항상 노출

---

## ⏸️ 사용자 액션
- **SQL 6개 실행 완료** (2026-08-10)
- **남은 액션**: SolAPI 사업자 인증 (I 항목 · #42)

---

## 세션 관리
- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
