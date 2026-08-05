# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update

---

## 🔴 진행 중 · 미완료

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
