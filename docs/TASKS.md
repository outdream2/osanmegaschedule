# TASKS

**규칙**:
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 즉시 추가
- 세션 시작 시 반드시 read
- 매 milestone 후 update
- **회귀 절대 금지** · TS + build + test 통과 후 커밋
- **리모트 푸시 · 사용자 명시 승인 시에만** (기본 로컬 커밋)

---

## 🔄 진행 중

### T25 · useVendors 공용 훅 (safe-refactoring-expert 백그라운드)
- 10개 파일 · 각자 vendor fetch → 공용 훅 통합
- 7 파일 수정됨 · 커밋 대기 중
- **자동 검증 프로토콜**: 완료 알림 시 TS+테스트+build → 자동 커밋 → T30-followup 자동 launch

---

## 🟢 대기 · 사용자 승인 후 진행

### T30-followup · useSortableTable · Modal · useFilterState 채택 확대
- 10+ 파일 · 각자 수동 sortKey/sortDir → 통일
- 파일별 순차 마이그레이션 · 회귀 시 파일 단위 revert 가능
- 예상 4~6h · 위험 낮음
- **T25 완료 후 자동 launch 승인 됨**

### T26 · select('*') → 명시 컬럼 (20 파일)
- 보안 부가 · payload 5~30% 축소
- 예상 4~6h · 위험 중

### T-CSS · 공통 CSS 리팩토링 (신규 · 2026-08-05)
- **목적**: 반복되는 Tailwind 클래스 조합을 · 공통 컴포넌트·className 상수·CSS 유틸로 통합
- **후보**:
  - 카드 스타일 (`rounded-2xl border border-slate-200 shadow-sm` 반복)
  - 버튼 톤 (indigo/emerald/rose/violet 그라디언트 · 크기별)
  - 헤더 라벨 (`text-[10px] font-black uppercase tracking-widest text-slate-400`)
  - 상태 배지 (pending/prepared/done · amber/sky/emerald)
  - 입력 필드 (border/focus-ring 조합)
  - 모달 백드롭 (`fixed inset-0 z-[...] bg-slate-900/50 backdrop-blur-sm`)
- **효과**: 코드 -500~1000줄 · 디자인 통일성 · 다크모드 대비 쉬움
- **위험**: 낮음~중 (className 만 변경 · 렌더 결과 동일해야 함)
- **예상**: 6~10h (여러 파일 · 파일별 순차)
- **방식**: mobile-ui-designer 위임 · 파일별 · 회귀 즉시 revert 가능

### T-PERF-5 · 가상 스크롤 (react-window) · 보류
- 5000+ 행 리스트에서 필요 · 현재 페이지네이션으로 렌더 수십 행
- 나중 필요 시 재검토
- 예상 2~3h · 위험 낮음

---

## 🔴 사용자 실 UI 검증 대기 (2026-08-05 커밋)

| 커밋 | 태스크 | 검증 |
|------|-------|-----|
| `2d799bc` | T-C · 근로계약서 CMS 서버 이전 완결 | 설정 페이지 → 조항 편집 저장 → 다른 브라우저 확인 |
| `3f4e57e` | T-C · CMS 서버 이전 초기 | 상동 |
| `f444d21` | T-PERF-1b · 매입이력 페이지네이션 | 매입이력 첫 로드 속도 |
| `480b9e4` | T-PERF-1a · 재고관리 캐시 | 재고관리 재방문 즉시 반영 |
| `bf35419` | YOLO 완전 제거 (-946 lines) | 재고세기 버튼 사라짐 확인 |
| `f5217d9` | T37 · JSON body 10MB | DoS 방어 · 정상 요청 영향 없음 |
| `ecf84b4` | T-SCAN-1 · RequestsPage 진열요청 3단계 표 | 요청 메뉴 진열요청 탭 |
| `9cd8d27` | 스캔 모달 컴팩트 5칸 | 스캔 → 창1/2·매1/2/3 한 화면 |
| `24d57cd` | T-SCAN-4-a · 매장별 [요청] | 매장 슬롯 미니 버튼 |
| `2621b87` | T-SCAN-4-b · 표 재구성 | 요청메뉴 진열요청 표 컬럼 |
| `ff04638` | T-CTR-12 · 세전월급 자동 | 근로계약서 자동 채움 |
| `92a25bb` | T-SCAN-2 · ProductInfoCard | 세로 제목 방지 |
| `9851d10` | T-SCAN-3 · 삑소리 강화 | 2톤 · 진동 |
| `49e34e5` | T-UI-1 · ProductDetailPanel | 태블릿 fullscreen |
| `89612ac` | 매입 서브탭 파이차트+필터 | 원형차트 3종 · 기간필터 |

---

## ✅ 사용자 SQL 실행 완료 (2026-08-05)

- ✅ `contract_clauses` 테이블 생성 (T-C 대응)
- ✅ 인덱스 SQL Block A (재고관리·매입이력·상품·실재고·진열요청)
- ⏳ 인덱스 Block B (pg_trgm + trigram · 상품 검색 5~10배 · 선택)
- ⏳ zone_labels 테이블 생성 (아직 안 하셨으면 · `migrations/create_zone_labels_2026-08-05.sql`)

## ⏸️ 사용자 액션 대기 (Supabase 대시보드)

### T-CTR-3 · Supabase SQL
```sql
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date DATE;
ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
```

| # | 항목 | 액션 |
|---|------|-----|
| J | pharmacist-materials 버킷 | Supabase 대시보드 |
| K | vendors 오학습 정리 (page 6) | vendors 테이블 직접 |
| L | employees.resume_url 컬럼 | `ALTER TABLE employees ADD COLUMN resume_url TEXT;` |

---

## 🚨 T3-defer · Render 배포 직전 재도입

- 원본 T3 (`0bce40e`) 설계 버그 원복 (`7cd406c`)
- 재도입 시 필수: 각 라우터 명시 경로 mount · public 분리 · E2E 테스트
- `server/middleware/requireAuth.ts` · `/api/auth/me` · `issueToken` 유지 중

---

## 세션 관리

- **원칙**: `docs/AGENT_PRINCIPLES.md`
- **임금**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **2026-08-05 세션**: 로컬 커밋 30+ · 리모트 푸시 2회 (`97ef77d` · `ecf84b4`)
- **이후 리모트 push · 명시 승인 시에만**
