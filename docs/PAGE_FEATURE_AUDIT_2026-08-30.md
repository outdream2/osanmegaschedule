# PAGE 기능 전수 점검 · 2026-08-30

**대상**: 주요 16 페이지 · 렌더링·API·편집·저장·데이터 무결성
**방법**: 정적 분석 (코드 리뷰 · import 체인 · endpoint 매핑)
**오늘 큰 변경**: `zone_defs` 스키마 재편 (id·cellId·zone·category·detailed_category + location 추가) · RLS 전체 활성화 · KV zone_defs 폴백 제거
**참고**: docs/MENU_STRUCTURE.md · src/App.tsx · server.ts

---

## 페이지별 상태 요약

| # | 페이지 | 상태 | 주요 이슈 |
|---|--------|------|----------|
| 1  | LandingPage                | 🟢 | 이슈 없음 (Vendor/Kakao QR/Search 정상) |
| 2  | SchedulePage               | 🟡 | useDisplayZones (구 로컬스토리지 KV) 잔존 → 최신 zone_defs 미반영 |
| 3  | DisplayPage (매장진열)       | 🔴 | zone label 라벨 파싱 회귀 · 아래 TOP1 참조 |
| 4  | OrderManagePage            | 🟢 | 4 서브탭 endpoints 정상 |
| 5  | StockManagePage            | 🟢 | Supplier/Diff/Flow endpoints 정상 |
| 6  | ProductInfoPage            | 🟢 | products-search + PATCH 정상 |
| 7  | ScanPage                   | 🟢 | 실재고 입력 endpoint 정상 · resolveProduct fallback 안정 |
| 8  | RequestsPage               | 🟢 | pending-counts + display/order/mismatch/lunch 모두 매핑 존재 |
| 9  | VendorManageSplit (매장>공급사) | 🟢 | useVendors + VendorDetailModal · 이슈 없음 |
| 10 | BusinessManagePage         | 🟢 | 4 서브탭 lazy 로드 정상 |
| 11 | SystemSettingsPage         | 🟢 | /api/system-config 존재 · Upload/AutoImport 정상 |
| 12 | PermissionsPage            | 🟢 | /api/employees GET (신규 · 01b7d586) · sidebar toggle 정상 |
| 13 | BrandingSettingsPage       | 🟢 | 4섹션 훅 정상 |
| 14 | CompanyInfoSettingsPage    | 🟢 | 4탭 정상 · MobileVisibility PermissionsPage 이관 완료 |
| 15 | BoardPage                  | 🟢 | apiClient 마이그레이션 완료 |
| 16 | PharmacistPage             | 🟡 | ZONE_DEFS 를 `constants/displayZones` 에서 정적 import → zone_defs 편집 반영 안 됨 |

**총계**: 🟢 정상 12 · 🟡 경고 3 · 🔴 크리티컬 1

---

## 🔴 크리티컬 (즉시 조치)

### C1. DisplayStoreMap · 중앙 진열대 셀 라벨 회귀 (2026-08-30)
- **파일**: `src/components/DisplayPage/DisplayStoreMap.tsx:207-208`
- **증상**: 매장 배치도의 진열대 1A ~ 8B 셀 상단 라벨이 이전엔 "진열대 1A" 표시 · 이제 "중앙상비약존" 으로 표시
- **원인**:
  - `sql/2026-08-30f-add-location-column.sql` 실행 후 `zone_defs.zone` 컬럼은 "중앙상비약존/상담존/뷰티식품존/카운터테마존" 로 재분류
  - short 코드 ("1A", "22") 는 새 `location` 컬럼으로 이동
  - 그러나 `DisplayStoreMap.tsx` 는 여전히 `rawB?.zone` (=대분류명) 을 셀 라벨로 사용
  ```tsx
  const zoneLabelB = rawB?.zone ?? `진열대 ${num}B`;  // rawB.zone == "중앙상비약존"
  ```
- **조치안**: `rawB?.location ? '진열대 ' + rawB.location : ...` 또는 `getZoneLabel(num, 'B')` 유틸 사용
- **영향 범위**: 매장진열 > 매장구역도 (모든 사용자) · 중앙 8쌍 · Wing 셀 라벨 오표시

---

## 🟡 경고 (다음 세션)

### W1. SchedulePage · useDisplayZones 는 KV 폴백 (구 스키마 잔존)
- **파일**: `src/components/SchedulePage/useDisplayZones.ts:19-27`
- **원인**: `localStorage.getItem(ZONES_STORAGE_KEY)` 폴백 + `ZONE_DEFS` 정적 import (2026-08-26 이전 카테고리 값). 신규 `useZoneDefs` (DB 기반) 미사용
- **증상**: 스케줄 캘린더 · 물류 직원 담당구역 편집 시 · 서버 (zone_defs) 편집 반영 안됨 · 구 카테고리 표시
- **조치안**: `useZoneDefs()` 로 대체 · 또는 `EmployeeCalendarModal.LogisticsZoneProps` 시그니처만 정적 사용 · 카테고리 라벨은 훅에서

### W2. PharmacistPage · 카테고리 트리 정적 ZONE_DEFS 참조
- **파일**: `src/components/PharmacistPage/PharmacistPage.tsx:18`
  ```ts
  import { ZONE_DEFS } from "../../constants/displayZones";
  ```
- **증상**: 교육자료 카테고리 트리가 정적 구역 정의를 기준 → 사용자가 매장구역도편집에서 category 변경해도 반영 안됨
- **조치안**: `useZoneDefs()` 훅 사용 · `zone-labels-changed` 이벤트 리스너는 이미 있으므로 zonesRaw 갱신 반영

### W3. useZoneDefs · parseZone 는 legacy zone 라벨 fallback (신규 DB 값 미매핑)
- **파일**: `src/hooks/useZoneDefs.ts:92-121`
- **원인**: 마이그레이션 후 `zone` 컬럼은 "중앙상비약존/…" 4종만 남으므로 `parseZone("중앙상비약존")` → `null`. 다행히 `parseLocation(r.location)` 이 우선 시도되므로 정상 케이스는 통과
- **위험**: SQL 마이그레이션이 부분 실행되어 `location IS NULL` 인 row 발생 시 → 해당 셀 완전 사라짐
- **조치안**: DB 무결성 체크 SQL (`SELECT COUNT(*) WHERE location IS NULL`) 을 서버 부팅 시 warn 로그 · 또는 `parseZone` 을 4대 존명 대응하도록 확장

---

## 🟢 정상 확인 사항

- **RLS 활성화 (SQL 2026-08-30c)**: 전체 테이블 RLS default-deny · 서버 `SUPABASE_KEY` = SERVICE_ROLE (rls bypass) 전제 · **주의**: `.env` 실측 검증 필요. anon 키면 모든 API 500
- **프론트 Supabase 직접 접근**: `src/components/common/ImageUploadField.tsx` 만 (storage 업로드) · DB 테이블 미접근 → RLS 영향 없음
- **KV 사용**: `app_settings` 테이블 (season_ranges · page_permissions · zone_groups 등) · server 라우터 통해서만 접근 → 서비스 키로 정상 동작
- **엔드포인트**: 218+ 라우트 모두 `/api/*` prefix + `requireAuth` 뒤 mount · 페이지 API 콜과 서버 라우터 매핑 확인 완료 (products, employees, zone-defs, zone-mismatches, display-requests, order-requests, inventory-checks, pharmacist-menu-items, board, notifications, hr-forms, resignations, employee-contracts, supplier-payments, system-config 모두 존재)
- **TypeScript**: `npx tsc --noEmit` 실행 불가 (권한) · 정적 검토상 import 참조 · 시그니처 오류 없음 (prev commit `662d92cd` 이후 clean)
- **useZoneDefs 훅**: DB 단일 소스 · KV 폴백 제거 완료 · setZones/saveNow 하위 호환 유지 · updateZoneRaw (신규) 정상

---

## TOP 10 · 즉시 조치 우선순위

| # | 항목 | 심각도 | 파일 | 예상 공수 |
|---|------|--------|------|----------|
| 1 | **DisplayStoreMap 중앙 진열대 라벨** rawB.zone → rawB.location 기반 표시 | 🔴 크리티컬 | DisplayStoreMap.tsx:207-208 | 15분 |
| 2 | **SQL 마이그레이션 실행 확인** · `zone_defs` `location` 컬럼 NOT NULL 검증 · 없으면 W3 발생 | 🔴 데이터 | sql/2026-08-30f · Supabase | 5분 |
| 3 | **SUPABASE_KEY = SERVICE_ROLE 검증** · Render env 확인 · anon 이면 모든 서버 API 500 | 🔴 인프라 | server .env · Render dashboard | 5분 |
| 4 | **useZoneDefs · parseZone 확장** · "중앙상비약존" 등 4존명 매칭 케이스 추가 (fallback) | 🟡 견고성 | useZoneDefs.ts:92 | 10분 |
| 5 | **SchedulePage useDisplayZones · zone_defs 훅 통합** | 🟡 통합 | useDisplayZones.ts + EmployeeCalendarModal | 30분 |
| 6 | **PharmacistPage 카테고리 트리 · useZoneDefs 로 교체** | 🟡 통합 | PharmacistPage.tsx:18 + utils.ts | 20분 |
| 7 | **DisplayPage handleZoneReorder · num 스왑 지원 확인** · 새 스키마는 num 개념 없음 (cell_id) · 편집 실패 가능성 | 🟡 편집 | DisplayPage.tsx:95-108 | 15분 |
| 8 | **ZoneEditPanel · saveNow → updateZoneRaw 이관** · 하위호환 saveNow 는 label 파싱 왕복 · 손실 가능 | 🟡 안정성 | ZoneEditPanel.tsx:141-158 | 30분 |
| 9 | **WallZoneCard num 매칭** · 신규 스키마 zonesRaw 에서 location 파싱 후 num 매핑 재검증 | 🟡 표시 | WallZoneCard.tsx:26-28 | 10분 |
| 10 | **RLS SQL 실행 롤백 절차 문서화** · 정책 없이 활성만 하면 서버 이외 접근 완전 차단 · 문제 발생 시 즉시 disable 절차 | 🟡 운영 | docs/TASKS.md + SQL runbook | 10분 |

---

## 참고 노트

- **오늘 커밋** (2026-08-30 순): `zone_defs` 이관 시리즈 (3b5cfdef → 148a5fc9) · 총 20+ 커밋 · 스키마 3회 재정의 (v2·v3 → cell/num → location 추가)
- **아직 미완**: 마이그레이션 SQL 을 Supabase 에서 실행하지 않으면 UI 도 데이터도 이상 · 실행 여부는 코드에서 확인 불가
- **회귀 방지**: 사용자 검증 필수 항목 = 매장진열 페이지 진입 시 · 진열대 1A~8B 라벨이 "진열대 1A" 인지 "중앙상비약존" 인지 육안 확인
- **미검토 (읽기 편의상)**: LeavePage · LunchPage · ReservationPage · MyPage · ApprovalRequestPage · SeasonSettingsPage · StockCheckPage · StockArrivalPage · OcrPage · ZoneLabelsEditor · HrFormsPage · DocumentWriterPage · StaffManagePage · ApprovalCenterPage — 최근 큰 변경 없음 · 자체 endpoint 매핑 필요 시 별도 세션
