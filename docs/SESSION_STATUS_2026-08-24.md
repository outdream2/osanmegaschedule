# 세션 상태 리포트 · 2026-08-24

## 개요
- 사용자 · 오래된 순 자율진행 · 효율·안정 우선
- 원칙 · 회귀 방지 · 프레임워크 우선 · 매우 조심 · UI 대원칙 준수
- 리모트 push · 금지 유지 (사용자 명시 · 로컬 커밋만)

## 최근 세션 완료 태스크

| # | 태스크 | 커밋 |
|---|---|---|
| #89 | DayTimelineModal · settings.positions 그룹핑 | `9bb1a45e` |
| #92 | 회사·브랜드 4탭 → 4섹션 통합 | `ef1ad883` |
| #171 | 랜딩 · 승인대기+결제요청 배지 | `4d55af0c` |
| #178 잔여 | vendorPassword 파생 함수 | `9a5048b5` |
| #180 | 발주이력 · 공급사·상품 별도 검색 | `1be4ac20` |
| #181 P1+P2 | ZoneSettingsPage 제거 + 드래그 재정렬 | `20dca31c`·`037e2923` |
| #188 P5 | AppNavHeader 뷰포트 필터 (기존 확인) | - |
| #191 A | Board·Profile 이미지 프리뷰 Modal 이관 | `4076657f`·`a0da4e7d` |
| #191 확장 | BottomNav BottomSheet 이관 | `382acca2` |
| #193 P1 | useOptimalStockPeriod 훅 + 15일 기본 fix | `885ee110`·`095c03da` |
| #197 | 스캔 미분류 · 페이지 이동 옵션 | `83409c80` |
| #198 P3 | SplitListPanel 확산 완료 확인 | - |
| #204 | 스캔 개별 저장 + 자동 접기 | `261b80a7` |
| #205 | AppFooter 확장 | `c08e0386` |
| #251 | 세션 만료 후 탭 focus 즉시 로그아웃 | `862d9d58` |
| #252 | 세션 만료 시간 · KV 편집 UI | `d69583a2`·`a4ea42c0` |
| #256 | 세션 만료 로그아웃 강제 · forced_logout flag | `45fd4ef2` |
| #257 P1 | 발주필요 실재고 컬럼 삭제 | `768e91bd` |
| #257 P2 | 판매현황 · 이미 구현됨 확인 | - |
| #253 Phase A | 자동 임포트 서버 endpoints (5개) | (방금) |

## 진행중 (Phase 별)

- **#253 Phase A ✅** · 서버 endpoints · KV schema · 5 endpoints · authorize(9)
- 🔲 Phase B · Python 스크립트
- 🔲 Phase C · PyInstaller .exe
- 🔲 Phase D · install.bat + Task Scheduler
- 🔲 Phase E · 웹 UI SystemSettingsPage 신규 탭 · **병렬 착수 가능**
- 🔲 Phase F · 문서

## 대기 (스펙 확정 · 착수 대기)

- **#254** · 세션 보안 강화 · JWT rotation · jti blacklist · rate limit · 2FA
- **#255** · 중복 로그인 방지 · 활성 세션 관리
- **#258** · 발주 리스트 프리미엄 UI 재설계 · 목업 필요
- **#259** · 매입이력 공급사별 상품 확장 기능 복원
- **#191 Phase B/C** · 대형 Modal migration · 승인 대기

## 차단 (사용자 결정/실행 대기)

- **#90** · ContractCategory strict union · 대형 refactor
- **#91** · SchedulePage 필터 탭 UX
- **#178 A/E** · Supabase SQL + xlsx import 실행
- **#190** · ZoneSettings 삭제 여부
- **#192 A** · vendor_approval_flow SQL
- **#193 P2** · 서버 formula 확정 필요

## UI 프리미티브 대량 변경 (일괄 반영)

- **PeriodSelector** · 글씨 +2 · 여백 반 · 8+ 소비처 자동
- **InlineLabel** · 글씨 +2 · 12+ 소비처 자동
- **SplitPanel** · maxWidth 640→1200 · 넓은 화면 UX
- **PurchaseHistoryTab.panels** · maxWidth 1200

## 검증

- 3193 tests · 모두 통과 (+20 신규)
- TS strict · Vite build · Framework audit baseline 통과
- 로컬 커밋 · 40개+ · remote push 금지 유지

## 대원칙 (재확인)

- 회귀 절대 금지 · 매 편집 TS+build+tests
- 프레임워크 우선 · 원-오프 X · 재사용
- 매우 조심 · 인증·보안 로직 신중
- 오래된 태스크 우선 · 효율·안정 위주
- UI · 목업 파일 준수 · Linear/Vercel/Attio · 파스텔 금지
- 폰트 +2 기본 · 40대+ 가독성
- 리모트 push · 사용자 명시 시만
