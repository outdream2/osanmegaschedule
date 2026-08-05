# TASKS

**규칙** (사용자 지시 · 2026-08-04):
- 완료 태스크는 이 파일에서 **삭제** (아카이브 X)
- 새 태스크 발생 즉시 이 파일에 추가
- 세션 시작 시 반드시 이 파일 read (토큰 만료로 in-memory TaskList 유실 대비)
- 매 milestone (커밋·이슈 완료) 후 이 파일 update

---

## 🔴 진행 중 · 미완료 (2026-08-05)

### T-CTR-8 · 왼쪽 폼 · 카테고리별 이해·동의·개인정보 섹션 제거 (T-CTR-6 완료 후)

**사용자 요구 (2026-08-05)**: 왼쪽 폼에서 다음 UI 완전 제거 (프리뷰에는 유지 · 자동 반영):
- 카테고리별 이해·동의 (계약서 미리보기 반영)
  - 임금 조항 이해·동의 (단서 5개 전체)
  - 근로시간·휴게 조항 이해·동의
  - 기타사항 이해·동의 (5개 항목 전체)
- 개인정보 · CCTV 동의
  - 수령자 성명 (미입력 시 근로자명 · 자동)
  - 수령자 주소 (미입력 시 근로자 주소 · 자동)
  - 개인정보 수집·이용
  - CCTV 촬영·이용

**주의**:
- 오른쪽 프리뷰 · 그대로 유지 (이해 동의 서명 spot · privacy 서명 spot 유지)
- 관련 state·서명 pad · 자동 default (수령자 = 근로자 · privacy 자동 동의 or 오른쪽 프리뷰에서만 편집)
- 왼쪽 폼 · 카드 or 섹션 자체 삭제 (또는 축소 · 사용자 판단)

### T-CTR-7 · 임금 항목 체크박스 활성화 UI (T-CTR-6 완료 후)

**사용자 요구 (2026-08-05)**: 왼쪽 폼에 각 임금 항목 체크박스 · 체크 시 활성화·계산 반영.

**항목** (기본급은 항상 활성 · 나머지는 체크 옵션):
- [ ] 연장수당 (일 8h 초과 자동 감지 · 체크로 강제 on/off)
- [ ] 휴일수당 (주말 근무 자동 감지 · 체크로 on/off)
- [ ] 야간수당 (22:00~06:00 근무 시 · 체크 시 강제 on)
- [ ] 연차수당 (기본 on · 체크 해제 가능)
- [ ] 식대 (이미 체크박스 있음 · 재확인)
- [ ] 차량유지비 (이미 체크박스 있음 · 재확인)

**동작**:
- 체크 · 해당 항목 · gross-up 재계산 대상에 포함 · 임금구성표에 표시
- 체크 해제 · 항목 금액 0 · 임금구성표에서 숨김 (or grey out)
- 프리뷰 (오른쪽) · 좌우 동일 반영

### T-CTR-6 · 임금 계산 알고리즘 전면 재구현 (리서치 완료 · 구현 대기)

**⚠️ 하드코딩 금지 원칙 (2026-08-05 사용자 강조)**:
- 리서치 리포트의 예제 (300만·500만·700만·1000만 → 각 소득세·통상시급) 는 **검증 케이스**일 뿐 · lookup 배열·맵으로 하드코딩 X
- 실제 로직 · **근로소득세 간이세액표 공식** (홈택스 원칙 · 누진 구간별 계산 함수)
- 4대보험 요율 · 상수 OK (config 파일)
- 최저임금 · 상수 OK (config)
- 세율·비율 외 · 예제 금액 · 반드시 함수로 산출

**상세**: `docs/PAYROLL_ALGORITHM.md` (research-strategist 리포트)

**흐름 (사용자 정본)**:
1. 근무조건 (주중일·h · 주말일·h)
2. 직군별 시급 (주중·주말 · SettingsModal)
3. `희망세후 = 시급 × 시간 합계`
4. gross-up 반복 근사 (3~5회 수렴) · 세전 산출
5. 통상시급 분배 → 기본급·연장·휴일·야간·연차·식대·차량
6. 세전 - 4대보험·소득세·지방세 = 세후 (희망과 100원 이내)

**Todo (ContractWriter 에이전트 완료 후)**:
- [ ] `src/lib/payroll/` 폴더 신설 (7개 파일)
- [ ] `insuranceRates.ts` 2026 요율 상수
- [ ] `simplifiedTax2026.json` 간이세액표 스냅샷 (홈택스 엑셀 파싱)
- [ ] `calcTaxes.ts` · `grossUp.ts` · `buildWageBreakdown.ts`
- [ ] `useWageCalculator.ts` React 훅 (debounce 200ms)
- [ ] `ContractWriterPage` 기존 계산 로직 → 훅 교체
- [ ] 4 케이스 정답 검증 (300만·500만·700만·1000만)
- [ ] 최저임금 위반 UI warning
- [ ] 부양가족 UI 조정 (default 1)

### T-CTR-1 잔여 (ContractWriter 에이전트 진행 중)
- [ ] PDF A4 정확 2장 (현재 5장 · 프리뷰 HTML 분할 필요)
- [ ] 계약유형 드롭다운 short label 저장 (`정규`/`계약N`)
- [ ] 프리뷰 원본 텍스트 vs `DISCIPLINE_REASONS` 등 상수 audit
- [ ] 좌우 임금표 스타일 parity
- [ ] 각 호 설정 CMS → ContractWriterPage 프리뷰 반영 (loadContractClauses 활용)

### T-CTR-3 잔여 · 사용자 액션 대기
- [ ] **[사용자]** Supabase SQL 실행:
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
| Q | Remote push 시점 | Y/N |

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

### T27 · TanStack Query
- 재고관리부터 · 페이지 재방문 <50ms
- 예상 2h

### T29 · TanStack Table
- StockManage · 초기 페인트 2~5초 → 100~200ms
- 예상 3~4h

---

## 🟢 자율 리팩터 · 성능 (진행 가능)

### T24 · P1 dead code (수동 · 에이전트 위임 금지)
- 각 파일 grep 확인 후 삭제
- 완료: StoreMap 1786줄 (`282bac5`)
- 남은: 개별 파일 확인

### T25 · P2 리팩터 (공용 훅·폴더 이동)
- useVendors 공용 훅 (12곳 중복 통합)
- 폴더 정리
- 예상 2~4h

### T26 · select('*') → 명시적 컬럼
- Supabase payload 40~70% 감소
- 20파일 · 예상 1.5~2h

### T30-followup · 훅 점진 채택
- 완료: useSortableTable · StaffManagePage · StockReconciliationTab
- 남은: 20파일 (useSortableTable) · 9모달 (Modal.tsx) · 48파일 (useFilterState)
- 각 파일 15~30분 · 총 8~12h

### T34 · 헤더 자동 정렬 검증
- 완료: StaffManagePage · StockReconciliationTab
- 남은: OrderManagePage · 기타 테이블

### T36 · RawOcrTable 정렬 (deferred · 복잡)
- 3개 dynamic OCR 컬럼 정렬 없음
- 예상 1~1.5h

---

## 세션 관리

- **원칙 문서**: `docs/AGENT_PRINCIPLES.md` · #1~#12 · #7-a~d
- **임금 알고리즘**: `docs/PAYROLL_ALGORITHM.md`
- **contract-master 에이전트**: `.claude/agents/contract-master.md`
- **메모리**: `~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`
- **오늘 세션 커밋**: 다수 로컬 · remote push 사용자 승인됨 · 완료 후 push 예정
