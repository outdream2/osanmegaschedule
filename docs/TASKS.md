# TASKS

**규칙** (사용자 지시 · 2026-08-04 · 2026-08-05):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read
- 매 milestone 후 이 파일 update
- **회귀 절대 금지** · TS + build 통과 · end-to-end 테스트 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (로컬 커밋 자유)

---

## 🔴 진행 중 (2026-08-05 사용자 추가)

### T-SCAN-4 · 진열요청 구역별 · 리스트 표형태
- **스캔 모달**: 매장1/2/3 **구역마다 별도 [진열요청] 버튼** (창고 제외)
  · 각 매장 구역의 store*Zone 을 zone_id 로 전송
  · requestDisplay 함수 · zoneOverride 파라미터 추가 (진행중)
- **RequestsPage 진열요청**: 리스트 → **표 형태** 재구성
  · 컬럼 순서: 상품명 · 진열구역 · 담당자 · **창고준비** · **진열완료** · 날짜
  · 창고준비 컬럼 · 상태 버튼 (대기 ↔ 완료) · 클릭시 /prepare
  · 진열완료 컬럼 · 상태 버튼 (대기 ↔ 완료) · 클릭시 /complete
  · 상태 반영 · 즉시 UI 업데이트

---

## 🔴 사용자 실 UI 검증 대기 (2026-08-05 커밋 · 브라우저 확인 필요)

| 커밋 | 태스크 | 검증 포인트 |
|------|--------|-----------|
| `ff04638` | T-CTR-12 세전월급 자동 흐름 | 근로계약서 → 직원선택·근무일 클릭 → 세전 자동 · 통상시급 표시 · 세전 수동편집 시 임금구조 재분배 |
| `97ef77d` | T-CTR-9 자동 희망세후 | 시급 32,083 · 하루 8h · 주 6일 → 약 6,691,860원 |
| `92a25bb` | T-SCAN-2 ProductInfoCard 반응형 | 좁은 화면 · 상품명 세로 방지 · 헤더 정렬 |
| `9851d10` | T-SCAN-3 삑소리 강화 | 바코드 인식 즉시 삑삑 (2톤) · 진동 |
| `49e34e5` | T-UI-1 ProductDetailPanel | 태블릿(640~1023px) 우측 정보 fullscreen 모달 |
| `89612ac` | 매입 서브탭 파이차트+필터 | 매입관리 → by-product · 파이차트 3종 · 기간필터 |
| `e7e058e` `36a996d` `ecf84b4` | T-SCAN-1 진열요청 3단계 | 실재고확인 → 스캔 → 모달 [진열요청] → 요청메뉴 진열요청 탭 → [준비완료] → [완료] · 알림 |

---

## ⏸️ 사용자 액션 대기 (외부 · Supabase)

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
| K | vendors 오학습 정리 (page 6 · 5848801771→앤바이오 등) | Supabase vendors 테이블 직접 수정 |
| L | employees.resume_url 컬럼 | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |

---

## 🟡 사용자 승인 필요 · 순차 진행 (Y/N)

### 1️⃣ T37 · JSON body parser 한도 축소 (DoS 방어)
- 현재: `express.json({ limit: "100mb" })` 전역
- 개선: 일반 API 10MB · 파일 업로드 route-level 100MB · rate-limiter 검토
- 예상 1~1.5h · 위험 낮음

### 2️⃣ T-CTR-6 · 홈택스 엑셀 파싱 자동 갱신
- 매년 2월 개정치 파싱 · JSON 스냅샷 갱신
- 현재는 19점 근사 · 실제 홈택스 표와 편차 있을 수 있음
- 예상 3~4h · 스크립트 작성 (수동 트리거)

### 3️⃣ T39 · YOLO/OCR 모델 분리 (OOM 방어)
- YOLO 재고세기 이미 비활성
- 남은: PaddleOCR 별도 서비스 분리 · Render 실측
- 예상 4~6h · Render 배포 대비

### 4️⃣ T27 · TanStack Query 도입
- 재고관리·StockManage · 캐싱·refetch·낙관적 업데이트
- 예상 2~4h · 위험 중 (큰 훅 변경)

### 5️⃣ T29 · TanStack Table 도입
- 재고관리 · 정렬·필터·페이지네이션·컬럼 리사이즈 통합
- 예상 2~4h · T27 이후 진행

### 6️⃣ T-C · 각 호 CMS 서버 이전
- 현재 localStorage → Supabase 이전
- 예상 2~3h · 데이터 마이그레이션 필요

---

## 🟢 자율 리팩터 · 성능 (승인 후 진행)

| # | 항목 | 방식 | 위험 |
|---|------|------|------|
| T24 | P1 dead code 정리 | 수동 · 에이전트 위임 금지 | 중 |
| T25 | useVendors 공용 훅 (P2) | 3+ 페이지 통합 | 낮음 |
| T26 | select('*') → 명시 컬럼 (20 파일) | 순차 · 파일별 검증 | 낮음 |
| T30-followup | useSortableTable · Modal · useFilterState 채택 | 페이지별 마이그레이션 | 낮음 |
| T36 | RawOcrTable 정렬 | deferred · 복잡 | 높음 |

---

## 🚨 T3-defer · Render 배포 직전 재도입 (원복 · `7cd406c`)

**원복 사유**: 원본 T3 (`0bce40e`) 설계 버그 · `app.use(requireAuth, router)` 가 `/` 에 mount → SPA·정적자원 401

**재도입 시 필수** (Render 배포 직전 · 별도 세션):
1. 각 라우터 명시 경로 mount: `app.use("/api/staff", requireAuth, staffRouter)`
2. Public 경로 명확히 분리 (`/api/auth/*` · 서비스워커 · SPA)
3. End-to-end 테스트 (로그인 → 각 페이지 → 401 없음)
4. src/App.tsx 부트 세션 체크 (`/api/auth/me`) 함께 복구
5. 로컬 → staging → prod 단계별 검증

**유지 중**: `server/middleware/requireAuth.ts` · `/api/auth/me` endpoint · `issueToken`

---

## 📌 지난 세션 보류 · 미확정

- 바코드 UI 반응형 검토 (리포트 요청 · 구체 이슈 미특정)

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금 알고리즘**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master 에이전트**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **2026-08-05 세션**: 로컬 커밋 17+ · 리모트 푸시 2회 (`97ef77d` · `ecf84b4`)
- **이후 리모트 push · 명시 승인 시에만** (사용자 강조)
