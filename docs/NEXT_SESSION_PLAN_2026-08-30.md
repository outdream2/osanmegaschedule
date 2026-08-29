# 다음 세션 진행 계획 · 2026-08-30

## 📊 이전 세션 · 총 36 로컬 커밋 · Remote push 대기 70+

---

## ✅ 완료된 태스크 (14건)

| # | 태스크 | 대표 커밋 |
|---|-----|-----|
| **#178** | 팀장 유일성 (B안 · position별) | `84a98d48` |
| **#177 P1** | SettingsModal 직군 탭 노출 | `6ab3af8e` |
| **#177 P2** | SettingsModal 직급 탭 · 자유 텍스트 · 자동 rename | `fa5b3dae` |
| **#154 P1** | SaleStatusFilter · Unassigned + ZoneMismatch (server join) | `a3c1bb0a` |
| **#154 P2** | ExpiryImminentTab · SaleStatusFilter (server sale_status join) | `7da7a795` |
| **#165 P1** | 상품 검색·리스트 · 19페이지 전수 조사 doc | `c4ff4618` |
| **#165 A** | SearchBar 프리미티브 확산 · 8 페이지 | 8 커밋 |
| **#186 A안** | ProductDetailHero · Attio Sticky Hero | `f8dbb3a9` |
| **#186 후속** | SectionCard · 메타 정보 섹션 (Attio Section Stack) | `d3b5ba8c` |
| **#122 P1·4·6** | SectionCard · GradientAccent · ActionBar 프리미티브 신설 | 3 커밋 |
| **#122 P2·3** | CompanyInfoSettingsPage · SystemSettingsPage · SectionCard 적용 | 2 커밋 |
| **#148** | 매장구역도 셀 높이 통일 · 종료 | `0517141b` |
| **#174** | 바코드 SSO · 다른 브라우저 열기 | `6040a079` |
| **#182 Phase A** | shared DTO 확장 · 9 필드 (이전 세션) | `2caeb4b1` |
| **#182 Phase B** | 근로계약서 만료 임박 배지 (상세 + 리스트) | `5ee222b2`·`dcd3bd10` |
| **#79 v4** | 발주 리스트 row-critical/row-short gradient | `5ece1b94` |
| **#185 Phase A** | 재로그인 필요 안내 toast (position/level/phone) | `3ff53945` |
| **#185 Phase B** | SettingsModal rank rename · confirm 재로그인 안내 | `08f60273` |
| **#185 Phase C** | employees FK · CASCADE 정책 조사 · 안전 판정 | `de3ecb47` |

---

## 🎯 남은 pending

### 🟡 사용자 확인 필요 (진행 불가)
| # | 태스크 | 대기 사유 |
|---|-----|--------|
| **#130** | 차용등록 재설계 (양방향 화살표·서명·별도 DB) | 목업 승인 대기 |
| **#122 P5** | 시스템설정 shell 전체 목업 | 사용자 확인 |
| **#79/#107** | 발주 리스트 GroupedListPanel 카드 프리미엄 | v3 목업 승인 대기 (row-critical 이미 반영 · 대부분 완료) |

### 🟠 대형 · 별도 세션
| # | 태스크 | 예상 |
|---|-----|-----|
| **#253** | 자동 임포트 · Python · 웹 UI · 원클릭 설치 | 8-16h |
| **#185** | 직원 연동 · Phase D·E (자동 세션 refresh · JWT 재발급 API) | 4-6h |

### 🟢 낮은 위험 · 자율 진행 가능
| # | 태스크 | 예상 |
|---|-----|-----|
| **#165 A** | SearchBar · 남은 페이지 (OcrPage/SynonymsTab 등 소수) | 30m |
| **#154 P2** | SaleStatusFilter · 남은 페이지 (server sale_status join 필요) | 2h |

---

## 🔴 사용자 대기 · 미실행

- **Remote push · 70+ 로컬 커밋** (a0640613 이후 · 후속 세션 36 커밋 추가) · 명시 지시 시만 · `git push origin main`
- **터미널 한글 깨짐** · CC 재시작 필요 (Node 프로세스 CP949 고정)

---

## 📁 신규 프리미티브 (재사용 base)

- `common/GradientAccent.tsx` (P4) · 상단 3px 브랜드 gradient
- `common/SectionCard.tsx` (P1) · 목업 section-card (head + body)
- `common/ActionBar.tsx` (P6) · sticky bottom 액션 바
- `common/ProductDetailHero.tsx` (#186 A안) · Attio Sticky Hero

## 📁 신규 조사 리포트

- `docs/PRODUCT_SEARCH_AUDIT_2026-08-29.md` · 19 페이지 상품 검색 매트릭스
- `docs/STORE_ZONE_MAP_RESEARCH_2026-08-29.md` · 매장구역도 2026 트렌드 · Top 3 대안
- `docs/EMPLOYEE_INTEGRATION_AUDIT_2026-08-29.md` · 직원 연동 · 15 컴포넌트 + 60+ 쿼리 매트릭스

---

## 🎯 대원칙 준수 (memory)

- **회귀 절대 X** · `feedback_no_regression_top.md`
- **원본 테이블 우선** · `feedback_original_table_first.md`
- **프레임워크 필수** · `feedback_framework_mandatory.md`
- **Remote push · 명시 지시 시만** · `feedback_remote_push_strict_2026-08-28.md`
- **모든 태스크 · 테스트 필수** (사용자 지시 · 2026-08-29)

---

## 📋 참조 파일

- `docs/TASKS.md` · 태스크 전체 현황
- `docs/NEXT_SESSION_PLAN_2026-08-29.md` · 이전 계획
- `docs/FRAMEWORK_AUDIT.md` · 프레임워크 audit 현황 (baseline 10 위반)
- `docs/UI_MOCKUP_SETTINGS_SHELL_V2_2026-08-26.html` · #122 목업
- `docs/UI_MOCKUP_2026-08-21.html` · 프리미티브 표준
- `docs/UI_MOCKUP_ORDER_LIST_V4_2026-08-26.html` · #79 v4 목업
