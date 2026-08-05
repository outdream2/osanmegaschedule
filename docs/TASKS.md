# TASKS

**규칙** (사용자 지시):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 추가
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본은 로컬 커밋)

---

## 🚀 리스트 속도 개선 (신규 · 우선순위 순 · 사용자 지목 · "리스트 전반적으로 느림")

### T-PERF-2 · DB 인덱스 최적화 ⭐⭐⭐⭐ (권장 1순위 · 즉효)
- 예상: **10~100배 빨라짐** (WHERE·ORDER 컬럼)
- SQL 실행만 · Supabase 대시보드 액션 (사용자)
- 예상 조사 시간 1~2h · SQL 실행 즉시

**조사 완료 · 기존 인덱스 (11개)**:
- notifications: employee_id, created_at
- supplier_balances, purchase_details (supplier/product+date)
- employee_contracts (employee, created)
- resignation_requests (status/employee/created)
- product_arrivals (date/supplier)
- product_arrival_items (arrival/code)
- OCR invoice_date
- employee_contracts (is_active · T-CTR-3 대기)

**추가 필요 · 실사용 쿼리 분석 (122 곳)**:
- 필요 시 · Supabase EXPLAIN 실행 · Seq Scan 감지 · 인덱스 SQL 생성

### T-PERF-1 · 페이지네이션 도입 ⭐⭐⭐⭐⭐ (효과 최대)
- 5000행 → 첫 50행만 · **초기 로딩 90%+ 단축**
- 대상: 재고관리 · 매입이력 · OCR 확정 · 상품 리스트 · 스케줄
- 서버 + 클라이언트 페어 수정
- 무한 스크롤 or 페이지 버튼
- 예상 4~6h · 회귀 중

### T-PERF-3 · N+1 쿼리 제거 · JOIN 활용 ⭐⭐⭐
- 리스트 조회 후 각 행마다 별도 쿼리 하는 곳 통합
- `.select("*, other_table(*)")` Supabase 문법
- 예상 2~3h

### T27 · TanStack Query 캐싱 ⭐⭐⭐
- 재방문 시 캐시 즉시 표시 · 백그라운드 refresh
- 체감 속도 극적 개선
- 예상 3~4h

### T-PERF-5 · 가상 스크롤 (react-window) ⭐⭐
- 5000+ 행 렌더 부드러움
- 예상 2~3h

### T26 · select('*') → 명시 컬럼 ⭐ (보안+부수 성능)
- 20 파일 · 56곳
- Payload 5~30% 축소 · password_hash 등 노출 방지
- 예상 4~6h · 파일별 순차

---

## 🔴 사용자 실 UI 검증 대기 (오늘 커밋 · 브라우저 확인 필요)

| 커밋 | 태스크 | 확인 |
|------|--------|-----|
| `9cd8d27` | 스캔 모달 컴팩트 · 5칸 한 화면 보장 | 스캔 → 창1/2·매1/2/3 · 매장별 [요청] 버튼 |
| `2621b87` | T-SCAN-4-b RequestsPage 표 형태 | 요청메뉴 진열요청 · 표 컬럼 · 창고준비/진열완료 상태 pill |
| `24d57cd` | T-SCAN-4-a 매장별 [진열요청] | 매장 슬롯 미니 버튼 · 구역별 담당자 매칭 |
| `f5217d9` | T37 JSON body 10MB | DoS 방어 |
| `07a4428` | T24 dead code 삭제 | -600 lines |
| `ff04638` | T-CTR-12 세전월급 자동 | 근로계약서 자동 채움 |
| `92a25bb` | T-SCAN-2 ProductInfoCard | 세로 제목 방지 |
| `9851d10` | T-SCAN-3 삑소리 강화 | 2톤 · 진동 |
| `49e34e5` | T-UI-1 ProductDetailPanel | 태블릿 fullscreen |
| `89612ac` | 매입 서브탭 파이차트+필터 | 3종 원형차트 · 기간필터 |

---

## ⏸️ 사용자 액션 대기 (Supabase 대시보드)

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
| J | pharmacist-materials 버킷 | Supabase 대시보드 · 버킷 생성 |
| K | vendors 오학습 정리 (page 6 · 5848801771→앤바이오 등) | vendors 테이블 직접 수정 |
| L | employees.resume_url 컬럼 | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |

---

## 🟡 승인 필요 · 대형 태스크

### T39 · PaddleOCR 분리 (Render OOM 대비 · YOLO 제거 후 축소 범위)
- YOLO 재고세기 · **완전 제거됨** (커밋 `bf35419`)
- 남은: PaddleOCR 별도 Python 서비스 분리 검토
- 대안 · Render Pro 티어 (2GB RAM) 로 분리 불필요할 수 있음
- 예상 3~4h (범위 축소)

### T29 · TanStack Table 도입
- 정렬·필터·페이지네이션·리사이즈 통합
- 예상 2~4h · T27 이후

### T-C · CMS 서버 이전 (localStorage → Supabase)
- 예상 2~3h · 마이그레이션

### T25 · useVendors 공용 훅
- 10+ 파일 통합
- 예상 3~4h · 위험 중

### T30-followup · useSortableTable · Modal · useFilterState 채택
- 10+ 파일 순차 마이그레이션
- 예상 4~6h

### T36 · RawOcrTable 정렬 (deferred · 복잡)

---

## 🚨 T3-defer · Render 배포 직전 재도입 (원복 · `7cd406c`)

**원복 사유**: `app.use(requireAuth, router)` 가 `/` 에 mount → SPA 401

**재도입 시 필수**:
1. 각 라우터 명시 경로 mount: `app.use("/api/staff", requireAuth, staffRouter)`
2. Public 경로 분리
3. End-to-end 테스트
4. src/App.tsx 부트 세션 체크 복구
5. 로컬 → staging → prod 단계

**유지 중**: `requireAuth.ts` · `/api/auth/me` · `issueToken`

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금 알고리즘**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master 에이전트**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **2026-08-05 세션**: 로컬 커밋 20+ · 리모트 푸시 2회 (`97ef77d` · `ecf84b4`)
- **이후 리모트 push · 명시 승인 시에만**
