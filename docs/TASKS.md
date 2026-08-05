# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update
- **회귀 절대 금지** · TS + build 통과 · end-to-end 테스트 후 커밋

---

## 🔴 진행 중 · 사용자 확인 대기

### T-CTR-12 UI 검증 (2026-08-05 · commit `ff04638`)
- 세전월급 자동 흐름 · 근무시간만 입력 → 4단계 완전 자동
- 브라우저에서 근로계약서 페이지 → 직원 선택 → 근무일 클릭 → 세전 자동 채움 확인
- 세전 수동 편집 시 임금구조 재분배 확인

### T-CTR-9 UI 검증 (2026-08-05 · commit `97ef77d`)
- 자동 희망세후 · 케이스: 하루 8h · 주 6일 · 시급 32,083 → 약 6,691,860원

### T-SCAN-2 UI 검증 (2026-08-05 · commit `92a25bb`)
- ProductInfoCard 반응형 정돈 · 상품명 세로 방지 · 스캔해서 확인

### T-SCAN-3 UI 검증 (2026-08-05 · commit `9851d10`)
- 바코드 인식 삑삑 (2톤) · 진동 [80,40,80] 강화
- iOS silent switch 는 Web Audio 도 뮤트 (플랫폼 제약)

### T-UI-1 UI 검증 (2026-08-05 · commit `49e34e5`)
- ProductDetailPanel 태블릿까지 fullscreen 모달 (sm→lg breakpoint)

---

## 🟢 개발 필요 (에이전트·자체 진행 가능)

### T-SCAN-1 · 상품별 진열요청 · ScanPage 모달 팝업 (진행 필요)

**남은 작업** (Backend·DisplayRequestListPage 이미 완성):
- ScanPage · 바코드 스캔 즉시 상품정보 모달 팝업 · 모달 안 [진열요청] 버튼
- 현재는 리스트 행 추가 후 [📢] 버튼 방식
- 사용자 요구: 스캔 → 모달 → [진열요청] → 담당자+관리자+창고담당 알림
- 관리자(auth_level ≥ 8) 알림 · 이미 commit `36a996d` 로 반영됨

### 매입 서브탭 · 3탭 공통 기간 필터 + 원형차트 3종
- 지난 세션 보류 · 아직 미착수 · mobile-ui-designer 위임 예정
- 스펙: 매입이력·상품매입·공급사별 3탭 · 공통 상단 기간 필터 · 각 탭 원형차트

### 바코드 UI 반응형 검토 (리포트)
- 지난 세션 보류 · 문제 특정 없이 리포트 요청

---

## ⏸️ 사용자 액션 대기 (외부)

### T-CTR-3 · Supabase SQL 실행
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

| # | 항목 | 필요 액션 |
|---|------|---------|
| J | pharmacist-materials 버킷 | Supabase 대시보드 |
| K | vendors 오학습 정리 (page 6) | Supabase vendors 직접 |
| L | employees.resume_url 컬럼 | Supabase SQL |

---

## 🚨 T3-defer · Render 배포 직전 재도입 (2026-08-05 원복 · commit `7cd406c`)

**원복 사유**:
- 원본 T3 (`0bce40e`) 설계 버그 · `app.use(requireAuth, router)` 가 `/` 에 mount → SPA·정적자원 401
- 사용자 로그: `[requireAuth 401] GET /` `[requireAuth 401] GET /sw.js`
- 사내 사용 · 외부 유입 없어 당장 보안 리스크 낮음

**재도입 시 필수 사항** (Render 배포 직전 · 별도 세션):
1. 각 라우터마다 명시적 경로 mount: `app.use("/api/staff", requireAuth, staffRouter)`
2. Public 경로 명확히 분리 (`/api/auth/*` · 서비스워커 · SPA)
3. End-to-end 테스트 (로그인 · 각 페이지 · 401 에러 없음)
4. src/App.tsx 부트 세션 체크 (`/api/auth/me`) 함께 복구
5. 로컬 → staging → prod 단계별 검증

**유지 중 (재도입 시 활용)**:
- `server/middleware/requireAuth.ts` · 파일 자체
- `server/routes/auth.ts` · `/api/auth/me` endpoint
- `server/routes/auth.ts` · `issueToken` (로그인 시 쿠키 세팅)

---

## 🟡 대기 · 사용자 승인 필요

| # | 항목 | 필요 액션 |
|---|------|---------|
| R | T27 TanStack Query 도입? | Y/N |
| S | T29 TanStack Table? | Y/N |
| T | T-C 각 호 CMS · 서버 이전 (현재 localStorage)? | Y/N |
| Q | Remote push 시점 | 매번 재확인 (2026-08-05 · "이후로 리모트 푸시 금지") |

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
- **오늘 세션 (2026-08-05)**: 다수 로컬 커밋 · 리모트 푸시 1회 (`97ef77d` · 오후)
- **이후 리모트 push 금지** · 사용자 명시 (2026-08-05)
