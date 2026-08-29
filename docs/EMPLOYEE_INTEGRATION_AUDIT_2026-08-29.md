# 직원(employees) 연동 · 전 프로젝트 조사 · 2026-08-29

> #185 · 사용자 크리티컬 · 직원↔스케쥴·계약서·근무·인건비 · 전 연동 지점 매트릭스
> 목표 · 회귀 절대 X · 편집 시 모든 연동 지점 자동 반영 · 데이터 정합성

---

## 📊 employees 테이블 · 연동 지점 매트릭스

### 클라이언트 (15 컴포넌트)
| 페이지 | 사용 목적 | 연동 방향 |
|---|---|---|
| **StaffManagePage** | 직원 CRUD · 편집·조회 | rw · 마스터 |
| **SchedulePage** | 스케쥴표 · 직원 리스트 (position 그룹핑) | r |
| **ContractWriterPage** | 근로계약서 작성 · 직원 선택 | r (편집 시 rank·wage 참조) |
| **StaffManagePage/StaffConditionsSection** | 계약서 연동 표시 (D-30 배지 · #182 P B) | r |
| **PermissionsPage** | 직원 · position · level · permissions | rw |
| **BusinessManagePage** | 대표/이사 조회 (거래처방문 스케쥴) | r |
| **MyPage** | 본인 프로필 · 비밀번호 변경 | rw (self) |
| **PharmacistPage** | 약사 리스트 · 스케쥴 | r |
| **LandingPage/LoginModal** | 로그인 (phone → employee_id) | r |
| **BarcodeScanner** (SSO) | JWT payload · employee 정보 | r |
| **BoardPage** | 게시글 작성자 · push notification 대상 | r |
| **ApprovalRequestPage** | 승인 요청자·승인자 | r |
| **DayTimelineModal** | 일일 타임라인 · 직원별 스케쥴 | r |

### 서버 (20+ 라우트 · 60+ 쿼리)
| 라우트 | employees 컬럼 |
|---|---|
| `auth/auth.ts` (로그인) | id · name · phone · password_hash · level · rank |
| `board/board.ts` | id · push_subscription · level |
| `daily/leave.ts` | id · annual_leave_days · push_subscription |
| `daily/lunch.ts` | id · name · position |
| `display/requests.ts` | id · name · position |
| `hr/employees.ts` | 전체 (CRUD) |
| `hr/employeeContracts.ts` | id · name · rank · contract_file_url |
| `hr/employeeWages.ts` | id · wage_calc_type · wage_amount |
| `push/notifications.ts` | id · push_subscription |
| `reservation/*` | id · position (부장 제외 로직 등) |
| `schedule/*` | id · position · workplace |
| `board/notifications.ts` | id · push_subscription |

---

## 🔗 연동 컬럼별 · 편집 시 영향

### position (직군)
- **PermissionsPage** · position별 자동 rename ✅ (기존)
- **SettingsModal 직군 탭** · position별 자동 rename ✅ (#177 P1)
- **팀장 유일성** · position에 "팀장" 포함 시 검증 ✅ (#178)
- **SchedulePage** · position 그룹핑 (약사·물류·매장 등)
- **BusinessManage** · position "대표"·"이사" 필터
- **Reservation** · position "부장" 제외
- 🔴 **주의** · position 삭제 or rename 시 · 위 페이지 모두 반영 필요

### rank (직급)
- **로그인 JWT** · rank 포함 · 새 로그인 시 갱신
- **SettingsModal 직급 탭** · rank 자동 rename ✅ (#177 P2)
- **StaffConditionsSection** · rank 표시
- 🟢 위험 낮음 · rank 는 참조 텍스트 (게이트 로직 없음)

### level (권한)
- **PermissionsPage** · level 편집 · gate 로직 재계산
- **JWT payload** · level 포함 · 로그인 갱신
- **PagePermissions** · level 기반 read/write gate (전 페이지)
- 🔴 **크리티컬** · level 변경 시 · 재로그인 필요 (JWT 갱신)

### retireDate (퇴사일)
- **StaffListRow** · retireDate 있으면 · 회색 처리
- **useSideNavGate** · retireDate 있으면 · 특정 페이지 gate
- **팀장 유일성** · retireDate IS NULL 만 검증 ✅ (#178)
- 🟢 안전 · retireDate 세팅 = 소프트 삭제

### phone (핸드폰번호 = 로그인 ID)
- **로그인** · phone 으로 조회
- **거래처 로그인** · phone + suffix 파생 비밀번호 (다른 테이블)
- 🔴 **주의** · phone 변경 시 · 사용자 재로그인 필요

### contract_file_url · resignation_file_url · resume_url
- **StaffContractSection** · URL 표시·업로드
- **PDF 생성 시 · 자동 갱신** (ContractWriterPage)
- 🟢 안전 · URL 단일 참조

### password_hash
- **로그인** · bcrypt 비교
- **change-password** · 서버 API
- 🟢 절대 클라 노출 안 함

---

## 🔴 회귀 위험 지점 · 우선순위

### P0 · 즉시 검증 필요
1. **position 삭제** → 재직 직원 존재 시 · 프롬프트 확인 후 다른 position 로 이전 ✅ (기존 PermissionsPage 로직)
2. **level 변경** → 재로그인 유도 (현재 · 다음 로그인 시 자동 반영)
3. **phone 변경** → 세션 재발급 필요 (현재 · 로그아웃·재로그인 필수)

### P1 · 개선 여지
1. **rank 삭제** → 재직 직원 rank=null 자동 (#177 P2 · 완료 · confirm 후)
2. **position 삭제 → 팀장 유일성** · 팀장 재직자 있으면 삭제 차단?
3. **JWT payload 갱신** · position/rank/level 변경 시 · 강제 재로그인 or refresh

### P2 · 조사 필요
1. **employee_contracts 연결** · employees.id 참조 · CASCADE?
2. **schedules 연결** · employees.id 참조 · CASCADE?
3. **push_subscription** · 여러 기기 지원? (현재 단일 문자열)

---

## 📋 다음 진행 (승인 후)

### Phase A · P0 검증 (2h · 안전)
- position/level/phone 변경 시 · 사용자 안내 배너 · "재로그인 필요"
- 서버 API · 변경 성공 시 · 관련 세션 강제 만료 (선택)

### Phase B · P1 개선 (2h · 낮음)
- rank rename 시 · 세션 rank 갱신 (auto-refresh)
- position 삭제 · 팀장 유일성 존재 시 · 차단

### Phase C · P2 조사 (1h · doc)
- employee_contracts · schedules · CASCADE 정책 확인
- push_subscription · 다중 기기 지원 여부 확인

---

## ✅ 완료된 연동 (이번 세션)
- #178 · 팀장 유일성 검증 · position별 (`84a98d48`)
- #177 P1 · position 편집 UI · 자동 rename (기존 PermissionsPage 로직 재사용)
- #177 P2 · rank 편집 UI · 자동 rename (`fa5b3dae`)
- #182 Phase B · 계약서 만료 배지 · 재직자 대상 자동 표시 (`5ee222b2`)
- #182 Phase A · shared DTO 확장 · 9 필드 (`2caeb4b1` 이전 세션)

---

## 🎯 결론

- **연동 지점 매우 많음** · 15 컴포넌트 · 20+ 서버 라우트
- **대부분 자동 반영** · JOIN 기반 · 별도 sync 불필요
- **주의 필요** · position/level/phone 변경 시 · 세션 갱신
- **P0 · 재로그인 안내 배너** · 짧고 안전한 개선 (2h)
