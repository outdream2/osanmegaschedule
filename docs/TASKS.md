# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update

---

## 🔴 진행 중 · 미완료

### T-UI-1 · 공통 · SplitPanel 반응형 · 오른쪽 정보는 모바일에서 모달로 (2026-08-05 · 사용자 제보)
- 증상: **모든 split 화면**에서 · 데스크탑 좌우 분할 → 모바일 세로 스택 (오른쪽이 아래로)
- 요구: **모바일 반응형에서 오른쪽 정보는 아래가 아닌 모달**로 표시
- 공통 작업 · SplitPanel (또는 유사 컴포넌트) 를 사용하는 모든 페이지에 일괄 적용
- 영향 페이지: 재고관리·발주관리·매입관리·직원상세·근로계약서 등 다수
- 담당: **mobile-ui-designer 에이전트** 위임 (T-SCAN-2 완료 후 이어서)

### T-SCAN-3 · 바코드 인식 순간 무조건 삑소리 (2026-08-05 · 사용자 제보)
- 요구: 폰 벨소리·무음모드와 무관하게 · 인식되는 순간 즉시 삑
- 구현: Web Audio API (AudioContext + OscillatorNode) · HTMLAudioElement 회피
  - 사유: iOS/Android · muted 상태에서 `<audio>` 재생 안 됨 · AudioContext 는 재생됨
- 위치: `handleScan` (ScanPage.tsx:287) · 진입 즉시 beep()
- 실패한 접근: audio 태그·mp3 파일 (silent mode 무시됨)

### ✅ T-SCAN-2 완료 · ProductInfoCard 반응형 UI 정돈 (commit `92a25bb`)
- 상품명 헤더 · `flex-wrap` + `break-keep whitespace-normal` · 한글 단어 단위 줄바꿈 · 글자 세로 원천 차단
- 배정구역 · 각 셀 border 분리 · 변경 버튼 `min-h-[44px]` 터치 타겟
- 재고현황 헤더 · 접기 flex-1 min-w-0 · 재고세기 shrink-0 · 좁은 화면 줄바꿈 허용
- 재고현황 접힘 · 완전 숨김 처리 (기존 헤더만 접힘)
- 매입이력 · 상품명 보조 라벨 · line-clamp-1 · 정보 손실 없음
- 사용자 실 UI 검증 대기

### T-SCAN-1 · 상품별 진열요청 3단계 워크플로우 (2026-08-05 · 사용자 확정)

**전체 흐름** (사용자 확정):
```
[1] 실재고확인 (ScanPage) → 바코드 스캔 → 상품정보 모달 팝업
       → 모달 내 [진열요청] 버튼 클릭
       → 담당자(진열) + 관리자에게 알림 발송

[2] 창고 준비: 창고담당이 [창고 준비완료] 버튼 클릭
       → 진열담당에게 픽업 알림

[3] 진열 완료: 진열담당이 [진열완료] 버튼 클릭
       → 관리자 완료 알림
```

**DisplayRequestListPage UI 스펙** (사용자 확정):
- 실시간 진열보충 리스트 · **상품별 진열요청 받은 것들**
- 상품리스트를 **구역별로 묶어서 정렬**
- 컬럼: **구역 · 상품 · 창고준비완료 버튼 · 진열완료 버튼**

**현재 구현 상태 (검증 결과)**:

✅ **이미 완료된 부분** (2026-08-05):
- Backend 3단계 API (`requests.ts`)
  - POST `/api/display-requests` · 창고담당 {창고,물류} 전원 알림 (line 71)
  - PATCH `/prepare` · 진열담당(assigned) 픽업 알림 (line 182)
  - PATCH `/complete` · 관리자(level≥8) 완료 알림 (line 229)
- DisplayRequestListPage (`DisplayRequestListPage.tsx`)
  - 구역별 그룹화 (zoneGroups line 160) ✓
  - 컬럼: 구역 · 상품명 · 담당자 · 창고상황 · 완료 ✓
  - [준비완료] 창고담당 버튼 (line 268) ✓
  - [완료] 진열담당 버튼 (line 299) ✓
  - 실시간 폴링 30초 (line 150) ✓
  - 관리자 강제 완료 버튼 ✓

🔴 **Gap · 남은 작업**:
1. **ScanPage 모달 팝업 방식** — 현재는 리스트에 행 추가 후 [📢] 버튼
   - 사용자 요구: 스캔 즉시 **상품정보 모달 팝업** · 모달 안에 [진열요청] 버튼
2. **알림 대상 통일**: `POST /api/display-requests` 는 창고담당 전원인데
   - 사용자 요구: **담당자(진열) + 관리자(level≥8)** 에게 알림
   - 창고담당 전원 유지 여부 사용자 확인 필요
3. **[진열요청] 버튼 위치** — 상품정보 모달 안에 명시 배치

### T-CTR-12 UI 검증 · 사용자 확인 필요 (2026-08-05 · commit `ff04638`)
- 세전월급 자동 흐름 (근무시간만 입력 → 4단계 완전 자동)
  1. 직원 선택 → settings.wageRates 시급 로드
  2. 시급 × 시간 → 희망세후 (T-CTR-9)
  3. 희망세후 → payrollGrossUp → **세전 자동 채움 (신규)**
  4. 세전 X → 통상시급 = X/296.94 → **임금구조 4항목 분배 (신규)**
- 검증 케이스: 시급 32,083 · 하루 8h · 주 6일 → 희망세후 약 6,691,860원 → 세전 약 X → 임금분배
- 세전월급 입력창 · 통상시급 실시간 표시 · 296.94 힌트 뱃지 확인
- 세전 수동 편집 시 → 임금구조 재분배 확인 (manualGrossSalaryRef)

### T-CTR-9 잔여 확인 · 사용자 검증 필요
- 자동 희망세후 흐름 (Step 2 · 커밋 `97ef77d`) 실 UI 동작 확인
- 케이스: 하루 8h · 주 6일 · 시급 32,083 → 자동 희망세후 약 6,691,860원
- 반영 버튼 · gross-up → 세전 · 임금구성표 자동 채움 확인
- 문제 있으면 · 근본 원인 (form.wageComponents.basicSalary undefined 원인) 재조사

### T-CTR-3 · Supabase SQL 실행 (사용자 액션 대기)
```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_ec_is_active
  ON employee_contracts(employee_id, is_active);
```

### 지난 세션 보류 (유효)
- 매입 서브탭 · 3탭 공통 기간 필터 + 원형차트 3종 (mobile-ui-designer)
- 바코드 UI 반응형 검토 (리포트)

---

## 🟡 대기 · 사용자 승인 필요

| # | 항목 | 필요 액션 |
|---|------|---------|
| P | T3 API 인증 미들웨어 승인? | Y/N |
| R | T27 TanStack Query 도입? | Y/N |
| S | T29 TanStack Table? | Y/N |
| T | T-C 각 호 CMS · 서버 이전 (현재 localStorage)? | Y/N |
| J | pharmacist-materials 버킷 | Supabase 대시보드 |
| K | vendors 오학습 정리 (page 6) | Supabase vendors 직접 |
| Q | Remote push 시점 | 매번 재확인 (2026-08-05 · "이후로 리모트 푸시 금지") |

### T3 · API 인증 미들웨어 (대기)
- requireAuth + authorize(level) · 라우터 적용
- 예상 2~3h · 아키텍처 큰 변경

### T37 · JSON body parser 한도 축소 (DoS)
- 현재 100mb → 일반 API 10mb · 파일 업로드 route-level
- 예상 1~1.5h · rate-limiter 도입 검토

### T39 · YOLO/OCR 모델 분리 (OOM)
- YOLO 재고세기 이미 비활성
- 남은: PaddleOCR 별도 서비스 분리 · Render 실측
- 예상 4~6h

### T27 · TanStack Query · T29 TanStack Table
- 재고관리·StockManage 성능 개선
- 예상 각 2~4h

### T-CTR-6 잔여 · 홈택스 엑셀 파싱 자동 갱신
- 매년 2월 개정치 파싱 · JSON 스냅샷 갱신
- 현재는 19점 근사 · 실제 홈택스 표와 편차 있을 수 있음

---

## 🟢 자율 리팩터 · 성능 (사용자 승인 후 진행 권장 · 회귀 우려)

### T24 · P1 dead code (수동 · 에이전트 위임 금지)
### T25 · P2 리팩터 (useVendors 공용 훅)
### T26 · select('*') → 명시적 컬럼 (20 파일)
### T30-followup · useSortableTable · Modal.tsx · useFilterState 채택
### T36 · RawOcrTable 정렬 (deferred · 복잡)

---

## 세션 관리

- **원칙 문서**: `docs/AGENT_PRINCIPLES.md` · #1~#12 · #7-a~d
- **임금 알고리즘**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master 에이전트**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **오늘 세션**: 다수 로컬 커밋 · 리모트 푸시 1회 (`97ef77d` · 2026-08-05 오후)
- **이후 리모트 push 금지** · 사용자 명시
