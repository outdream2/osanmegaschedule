# API Documentation

**생성일:** 2026-09-01
**소스:** `server.ts` + `server/routes/**` (40 라우트 파일 · 자동 스캔)
**총 endpoint:** 268개 (`router.METHOD` 263 + `stockCheckPublicRouter`·`ocrDeletedRowsRouter` 4 + 인라인 1)

---

## 목차

1. [프레임워크 개요](#프레임워크-개요)
2. [인증 · 세션](#1-인증--세션-auth)
3. [상품 · 조회 · 관리](#2-상품-products)
4. [공급사](#3-공급사-vendors)
5. [발주 · 요청 · 진열](#4-발주--진열-요청-display--orders)
6. [반품 요청](#5-반품-요청-return-requests)
7. [매입 (Purchase Details)](#6-매입-purchase-details)
8. [매입 이력 · 상품별](#7-매입-이력-purchase-history)
9. [OCR (이미지 텍스트 인식)](#8-ocr-이미지-텍스트-인식)
10. [OCR 확정 · 삭제 이력](#9-ocr-확정--삭제-이력)
11. [거래명세서 이미지](#10-거래명세서-이미지-invoice-images)
12. [부가세 (VAT)](#11-부가세-vat)
13. [공급사 결제 · 정산](#12-공급사-결제--잔액-payments--balance)
14. [차용 (Borrowings)](#13-차용-borrowings)
15. [재고 관리 · 조회](#14-재고-관리-stock-manage)
16. [재고 입고 · 알림](#15-재고-입고-알림-stock-arrivals)
17. [상품 도착 (Product Arrivals)](#16-상품-도착-product-arrivals)
18. [손실 추적 (Loss Tracking)](#17-손실-추적-loss-tracking)
19. [판매 추이 (Sales Trend)](#18-판매-추이-sales-trend)
20. [직원 · 스케줄](#19-직원--스케줄-employees--schedules)
21. [직원 부속: 근로계약서 / HR 서류 / 사직서 / 조항 CMS](#20-hr--직원-부속-hr-forms--contracts--resignations--clauses)
22. [일일: 연차 · 점심 · 예약](#21-일일-데이터-leave--lunch--reservations)
23. [매장 배치: Zones · Assignments · Mismatches](#22-매장-배치-display-zones--assignments--mismatches)
24. [게시판 · 알림 · 약사 자료](#23-게시판--알림--약사-자료-board--notifications--pharmacist)
25. [카카오 알림톡](#24-카카오-알림톡-kakao)
26. [설정 (Settings · SystemConfig · AutoImport)](#25-설정-settings)
27. [Reference Values · 기타](#26-reference-values--기타)

---

## 프레임워크 개요

### 미들웨어 (`server/middleware/`)
| 미들웨어 | 역할 | 강제 여부 |
|---|---|---|
| `asyncHandler(fn)` | try/catch 자동 · errorHandler 로 위임 | 대원칙 · 모든 async 핸들러 필수 |
| `errorHandler` | 표준 에러 응답 · `HttpError`, `badRequest`, `unauthorized`, `forbidden`, `notFound` | 마지막 미들웨어 (server.ts) |
| `requireAuth` | JWT 쿠키 · `mt_auth` 검증 · `req.authUser` 주입 | `/api/*` 대부분 (public 라우터 제외) |
| `authorize(level)` | level 기반 RBAC · session.level >= N | 세밀 권한 요구 endpoint |
| `validateBody(ZodSchema)` | Zod 스키마 검증 → 400 자동 | 신규 endpoint 원칙 |

### RBAC 레벨 (level)
| Level | Role | 설명 |
|---|---|---|
| 0 | vendor | 거래처 로그인 (제한) |
| 1 | employee | 일반 직원 |
| 2 | senior | 시니어 · 삭제 등 |
| 3 | supervisor | 물류/배송 |
| 5 | manager | 매니저 · 스케줄·발주·CRUD |
| 9 | superadmin | 관리자 · 시스템 설정 · 업로드 |

### 준수 프레임워크 (server.ts 라우터 등록 순서)
1. **Public (requireAuth 이전):** `authRouter`, `settingsRouter` (GET), `systemConfigRouter` (GET), `autoImportRouter` (내부 authorize 9), `referenceValuesRouter`, `stockArrivalsRouter`, `stockCheckPublicRouter`
2. **인증 필수 (requireAuth 이후):** 이하 모든 라우터

### 대용량 body 경로 (100MB)
`/api/ocr`, `/api/invoice-images`, `/api/hr-forms`, `/api/resignations`, `/api/board`, `/api/pharmacist-menu-items`, `/api/employee-contracts`, `/api/schedules` — 나머지는 10MB 제한

### Rate Limit
`/api/auth/*` · 1분 10회 (성공 로그인 제외)

---

## 1. 인증 · 세션 (auth)

**파일:** `server/routes/auth/auth.ts` · **9 endpoints**
**Public:** 모두 (rate-limit 적용) · **Zod:** ✓ 4/9 · **asyncHandler:** ✓ 9/9

| METHOD | Path | authorize | Zod Schema | 설명 |
|---|---|---|---|---|
| POST | `/api/auth/login` | – | `LoginSchema` | 핸드폰번호 + PW · JWT 쿠키 발급 · `LoginResponse` |
| POST | `/api/auth/vendor-login` | – | `VendorLoginSchema` | 거래처 로그인 · `manager_phone`/`phone` 매칭 · level=0 |
| POST | `/api/auth/set-password` | 9 | `SetPasswordSchema` | 관리자 · 임의 직원 PW 재설정 |
| POST | `/api/auth/sso-token` | 1 | – | 5분 만료 SSO 토큰 발급 (다른 브라우저 이전) |
| POST | `/api/auth/sso-consume` | – | – | SSO 토큰 소비 · 정식 쿠키 발급 |
| POST | `/api/auth/refresh` | – | – | Refresh 토큰으로 access 재발급 |
| POST | `/api/auth/logout` | – | – | 쿠키 제거 |
| GET | `/api/auth/me` | – | – | 세션 검증 · 401 시 자동 로그아웃 트리거 |
| POST | `/api/auth/change-password` | 1 | `ChangePasswordSchema` | 본인 PW 변경 (S1 IDOR fix · 본인·lv9 만) |

**공유 스키마:** `src/shared/schemas/auth.ts` · DTO: `src/shared/dtos/auth.ts`
**사용처:** `src/apis/authApi.ts`, `src/pages/LoginPage.tsx`

---

## 2. 상품 (products)

**파일:** `server/routes/stock/products.ts` (798 라인) · **15 endpoints**
**asyncHandler:** ✓ 15/15 · **Zod:** ✗ 인라인 검증

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/stock-check` | **PUBLIC** | (별도 라우터 `stockCheckPublicRouter`) · saleActive 필터 · 스캔 페이지 |
| GET | `/api/products-map` | – | 전체 상품 map (code → product) |
| GET | `/api/inventory-latest` | – | 최근 재고 스냅샷 |
| GET | `/api/products-by-category` | – | 카테고리별 상품 목록 |
| GET | `/api/products-search` | – | 상품 검색 (name·code·barcode) |
| POST | `/api/upload-products` | 9 | xlsx binary → products 테이블 upsert (100MB) |
| DELETE | `/api/product-import-log` | 9 | 임포트 로그 삭제 |
| POST | `/api/products/sync-real-map-to-spec` | 9 | real_map → spec 컬럼 동기 |
| GET | `/api/products/realmap-check` | – | real_map 무결성 검사 |
| GET | `/api/products/expiry-imminent` | – | 유통기한 임박 상품 |
| GET | `/api/products/hidden` | – | 숨김 처리된 상품 |
| GET | `/api/products/:code` | – | 상품 단건 상세 |
| PATCH | `/api/products/:code/realmap` | 1 | real_map (배정구역) 편집 |
| POST | `/api/products/refill-optimal-stock` | 9 | 적정재고 재계산 배치 |
| PATCH | `/api/products/:code` | 1 | 상품 정보 patch (hidden, price 등) |
| POST | `/api/products` | 5 | 신규 상품 생성 |

**사용처:** `src/apis/productApi.ts`, `src/pages/ScanPage.tsx`, `src/pages/StockManagePage.tsx`

---

## 3. 공급사 (vendors)

**파일:** `server/routes/purchase/vendors.ts` · **10 endpoints**
**asyncHandler:** ✓ 10/10 · **Zod:** ✓ 부분 (`CreateVendorSchema`)

| METHOD | Path | authorize | Zod Schema | 설명 |
|---|---|---|---|---|
| POST | `/api/upload-vendors` | 9 | – | xlsx 벤더 마스터 업로드 (20MB · 첫 시트만) |
| GET | `/api/vendors` | – | – | 리스트 (검색·필터) |
| POST | `/api/vendors` | 5 | `CreateVendorSchema` | 신규 벤더 |
| PATCH | `/api/vendors/:id` | 5 | – | 벤더 정보 patch |
| DELETE | `/api/vendors/:id` | 9 | – | 삭제 |
| POST | `/api/vendors/bulk-import` | 9 | – | JSON 배치 임포트 |
| POST | `/api/vendors/:id/set-password` | 9 | – | 벤더 로그인 PW 설정 |
| POST | `/api/vendors/:id/approval-request` | 1 | – | 담당자 검토·승인 요청 |
| POST | `/api/vendors/:id/approve` | 9 | – | 관리자 승인 |
| POST | `/api/vendors/:id/reject` | 9 | – | 관리자 반려 |

**로그인 규칙:** ID=담당자 핸드폰(`manager_phone`) · PW=핸드폰+ENV VENDOR_PW_SUFFIX (DB 저장 X · 서버 파생)
**사용처:** `src/apis/vendorApi.ts`, `src/pages/VendorPage.tsx`

---

## 4. 발주 · 진열 요청 (display · orders)

**파일:** `server/routes/display/requests.ts` · **17 endpoints**
**asyncHandler:** ✓ 17/17

### Display Requests (매장 배치)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/requests/pending-counts` | – | 대기 개수 (배지용) |
| GET | `/api/display-requests` | – | 진열 요청 리스트 |
| POST | `/api/display-requests` | 1 | 요청 생성 |
| PATCH | `/api/display-requests/:id/prepare` | 3 | 준비 상태 |
| PATCH | `/api/display-requests/:id/complete` | 3 | 완료 상태 |
| PATCH | `/api/display-requests/:id` | 3 | 일반 patch |
| DELETE | `/api/display-requests/:id` | 2 | 삭제 |

### Order Requests (발주)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/order-requests` | – | 발주 리스트 |
| POST | `/api/order-requests` | 1 | 신규 발주 |
| GET | `/api/order-history` | – | 발주 이력 |
| DELETE | `/api/order-requests/:id` | 2 | 취소 |
| POST | `/api/order-requests/bulk-send` | 3 | 일괄 전송 (물류) |

### Inventory Checks
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/inventory-checks` | – | 재고 확인 리스트 |
| POST | `/api/inventory-checks` | 1 | 단건 확인 |
| POST | `/api/inventory-checks/bulk` | 1 | 일괄 저장 |
| PATCH | `/api/inventory-checks/:id` | 1 | patch |
| DELETE | `/api/inventory-checks/:id` | 2 | 삭제 |

**사용처:** `src/apis/requestsApi.ts`, `src/pages/DisplayRequestsPage.tsx`, `src/pages/OrderRequestsPage.tsx`

---

## 5. 반품 요청 (return-requests)

**파일:** `server/routes/purchase/returnRequests.ts` · **6 endpoints**
**asyncHandler:** ✓ 6/6 · **Zod:** ✓ 3/6

| METHOD | Path | authorize | Zod Schema | 설명 |
|---|---|---|---|---|
| POST | `/api/return-requests` | 5 | `ReturnRequestCreateSchema` | 반품 요청 생성 |
| GET | `/api/return-requests` | – | – | 리스트 |
| GET | `/api/return-requests/by-supplier` | – | – | 공급사별 그룹 |
| PATCH | `/api/return-requests/:id` | 5 | `ReturnRequestUpdateSchema` | 상태 patch |
| DELETE | `/api/return-requests/:id` | 5 | – | 취소 |
| POST | `/api/return-requests/bulk-send` | 5 | `ReturnRequestBulkSendSchema` | 벤더에 일괄 발송 |

---

## 6. 매입 (purchase-details)

**파일:** `server/routes/purchase/purchase.ts` (698 라인) · **6 endpoints**
**asyncHandler:** ✓ 6/6 · **Zod:** ✗

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/upload-purchase-details` | 인라인 lv9 | xlsx 매입상세 업로드 (50MB · 병합헤더 파서) |
| GET | `/api/purchase-details/import-log` | – | 임포트 로그 |
| DELETE | `/api/purchase-details/import-log` | 9 | 로그 삭제 |
| GET | `/api/purchase-details/coverage` | – | 기간·공급사 커버리지 통계 |
| GET | `/api/purchase-details` | – | 상세 조회 (필터·페이지네이션) |
| GET | `/api/purchase-details/summary` | – | 요약 (공급사·기간) |

**미준수:** `upload-purchase-details` · `managerId` query 로 인라인 권한 검사 · `authorize(9)` 미들웨어 대체 후보

---

## 7. 매입 이력 (purchase-history)

**파일:** `server/routes/purchase/purchaseHistory.ts` · **1 endpoint**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/products/purchase-history` | – | 상품 코드별 매입 이력 |

---

## 8. OCR (이미지 텍스트 인식)

**파일:** `server/routes/ocr/ocr.ts` (1,767 라인 · 최대 파일) · **25 endpoints**
**asyncHandler:** ✓ 24/25 (`/api/ocr` POST 만 raw async · try/catch 인라인) · **Zod:** ✗

### 매칭 · 코어
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/health` | – | 서버 헬스 체크 |
| GET | `/api/ocr-ping` | – | Gemini/Mistral 키 상태 |
| POST | `/api/ocr-match` | 5 | 상품명 → 코드 매칭 (배열 또는 candidate mode) |
| POST | `/api/ocr` | – (raw) | 이미지 → 텍스트 (Gemini/Mistral 페일오버) |
| POST | `/api/ocr/parse-local` | 5 | 로컬 파싱 (ONNX 등) |
| POST | `/api/ocr/parse-gemini` | 5 | Gemini 파싱 |
| GET | `/api/ocr/last-log` | – | 마지막 OCR 로그 |
| GET | `/api/ocr/search-balance` | – | 잔액 검색 |

### Synonyms (동의어)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/ocr-synonyms` | – | 리스트 |
| POST | `/api/ocr-synonyms` | 5 | 신규 |
| PATCH | `/api/ocr-synonyms/:id` | 5 | 수정 |
| DELETE | `/api/ocr-synonyms/by-name` | 5 | 이름으로 삭제 |
| POST | `/api/ocr-synonyms/cancel-by-name` | 5 | 취소 |
| POST | `/api/ocr-synonyms/restore/:id` | 5 | 복구 |
| DELETE | `/api/ocr-synonyms/:id` | 9 | 영구 삭제 |

### Supplier Aliases
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/ocr-supplier-aliases` | – | 리스트 |
| POST | `/api/ocr-supplier-aliases` | 5 | 신규 |
| PATCH | `/api/ocr-supplier-aliases/:id` | 5 | 수정 |
| DELETE | `/api/ocr-supplier-aliases/:id` | 9 | 삭제 |

### Templates
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/ocr-templates` | – | 리스트 |
| POST | `/api/ocr-templates` | 5 | 저장 |
| DELETE | `/api/ocr-templates/:supplier_name` | 9 | 삭제 |

### Supplier Balances (OCR 기준)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/supplier-balances` | – | 잔액 리스트 |
| POST | `/api/supplier-balances` | 5 | 저장 |
| DELETE | `/api/supplier-balances/:id` | 5 | 삭제 |

---

## 9. OCR 확정 · 삭제 이력

### `/api/ocr-confirmed-items` (`ocrConfirmed.ts` · 3 endpoints)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/ocr-confirmed-items` | 2 | 확정 저장 |
| GET | `/api/ocr-confirmed-items` | – | 리스트 |
| DELETE | `/api/ocr-confirmed-items/:id` | 2 | 취소 |

### `/api/ocr-deleted-rows` (`ocrDeletedRows.ts` · 3 endpoints)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/ocr-deleted-rows` | – | 삭제된 행 서명 조회 |
| POST | `/api/ocr-deleted-rows` | – | 삭제 등록 (upsert on signature) |
| DELETE | `/api/ocr-deleted-rows/:id` | – | 복구 |

**미준수:** `ocr-deleted-rows` 전부 authorize 없음 · authRouter 이후이므로 최소 lv1 자동 · 명시 후보

---

## 10. 거래명세서 이미지 (invoice-images)

**파일:** `server/routes/purchase/invoiceImages.ts` · **2 endpoints**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/invoice-images/upload` | 2 | Cloudinary 업로드 |
| DELETE | `/api/invoice-images/:public_id(*)` | 9 | 이미지 삭제 |

---

## 11. 부가세 (VAT)

**파일:** `server/routes/purchase/vat.ts` · **4 endpoints**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/vat/summary` | – | 기간별 요약 |
| GET | `/api/vat/vendor-breakdown` | – | 공급사별 분석 |
| GET | `/api/vat/vendor-detail` | – | 공급사 상세 |
| GET | `/api/vat/monthly-summary` | – | 월별 |

---

## 12. 공급사 결제 · 잔액 (payments · balance)

### `supplierPayments.ts` · **11 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/supplier-payments` | – | 결제 리스트 |
| GET | `/api/supplier-payments/latest-per-supplier` | – | 공급사별 최신 결제 |
| GET | `/api/supplier-payments/pending-count` | – | 대기 개수 |
| POST | `/api/supplier-payments` | 5 | 결제 등록 |
| PATCH | `/api/supplier-payments/:id` | 5 | 수정 |
| DELETE | `/api/supplier-payments/:id` | 9 | 삭제 |
| GET | `/api/supplier-balance/:supplier` | – | 특정 공급사 잔액 |
| GET | `/api/supplier-ledger` | – | 원장 (거래 이력) |
| GET | `/api/supplier-open-invoices` | – | 미결제 계산서 |
| GET | `/api/supplier-purchase-summary` | – | 매입 요약 (공급사별) |
| GET | `/api/supplier-purchase-detail` | – | 매입 상세 |

### `supplierBalanceConfig.ts` · **3 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/supplier-balance-configs` | – | 잔액 설정 리스트 |
| PUT | `/api/supplier-balance-configs` | 5 | 저장 |
| DELETE | `/api/supplier-balance-configs/:name` | 9 | 삭제 |

---

## 13. 차용 (borrowings)

**파일:** `server/routes/payment/borrowings.ts` · **9 endpoints**
**전부 authorize · 재사용 서명 signatures 별도 endpoint**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/borrowings` | 1 | 리스트 |
| POST | `/api/borrowings` | 5 | 신규 |
| GET | `/api/borrowings/parties` | 1 | 당사자 마스터 |
| POST | `/api/borrowings/parties` | 5 | 당사자 등록 |
| POST | `/api/borrowings/:id/signatures` | 5 | 서명 저장 |
| GET | `/api/borrowings/:id/signatures` | 1 | 서명 조회 |
| PATCH | `/api/borrowings/:id` | 5 | 수정 |
| PATCH | `/api/borrowings/:id/return` | 5 | 반환 처리 |
| DELETE | `/api/borrowings/:id` | 5 | 삭제 |

---

## 14. 재고 관리 (stock-manage)

**파일:** `server/routes/stock/stockManage.ts` (2,400+ 라인) · **17 endpoints**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/stock-manage/top-products` | – | 매출 상위 상품 |
| GET | `/api/stock-manage/supplier-purchases` | – | 공급사별 매입 |
| GET | `/api/stock-manage/snapshot-summary` | – | 스냅샷 요약 |
| GET | `/api/sales-trend/product` | – | 상품별 판매 추이 |
| GET | `/api/sales-trend/supplier` | – | 공급사별 판매 |
| GET | `/api/sales-trend/overview` | – | 전체 개요 |
| GET | `/api/stock-manage/top-sales` | – | 판매 상위 |
| GET | `/api/stock-manage/low-stock` | – | 저재고 |
| GET | `/api/stock-manage/raw` | – | 원본 재고 데이터 |
| GET | `/api/stock-manage/product-history` | – | 상품별 이력 |
| POST | `/api/upload-stock` | 9 | xlsx 재고 업로드 (50MB · octet-stream) |
| GET | `/api/stock-import-log` | – | 임포트 로그 |
| DELETE | `/api/stock-import-log` | 9 | 로그 삭제 |
| GET | `/api/stock-manage/period-coverage` | – | 기간 커버리지 |
| GET | `/api/stock-manage/purchase-info-batch` | – | 매입 정보 배치 조회 |
| GET | `/api/stock-manage/trending` | – | 트렌드 |
| GET | `/api/stock-manage/trending-period` | – | 기간별 트렌드 |

---

## 15. 재고 입고 알림 (stock-arrivals)

**파일:** `server/routes/stock/stockArrivals.ts` · **7 endpoints** (public 라우터 · 랜딩용)

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/vapid-public-key` | – | Web Push VAPID 공개키 |
| GET | `/api/stock-arrivals` | – | 입고알림 목록 (public · 랜딩) |
| POST | `/api/stock-arrivals` | 3 | 알림 생성 |
| POST | `/api/stock-arrivals/:id/broadcast` | 5 | Web Push 브로드캐스트 |
| PATCH | `/api/stock-arrivals/:id` | 3 | 수정 |
| DELETE | `/api/stock-arrivals/:id` | 2 | 삭제 |
| POST | `/api/anon-push-subscribe` | – | 비로그인 push 구독 |

---

## 16. 상품 도착 (product-arrivals)

**파일:** `server/routes/stock/productArrivals.ts` · **5 endpoints**
**Zod:** ✓ `CreateProductArrivalSchema`

| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| POST | `/api/product-arrivals` | 3 | ✓ | 신규 도착 |
| GET | `/api/product-arrivals` | – | – | 리스트 |
| GET | `/api/product-arrivals/compare/orders` | – | – | 발주 대비 비교 |
| GET | `/api/product-arrivals/:id` | – | – | 상세 |
| DELETE | `/api/product-arrivals/:id` | 2 | – | 삭제 |

---

## 17. 손실 추적 (loss-tracking)

**파일:** `server/routes/stock/lossTracking.ts` · **3 endpoints**

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/loss-tracking/snapshot` | 9 | 스냅샷 생성 |
| GET | `/api/loss-tracking` | – | 리스트 |
| GET | `/api/loss-tracking/summary` | – | 요약 |

---

## 18. 판매 추이 (sales-trend)

`/api/sales-trend/*` — [Section 14 참조](#14-재고-관리-stock-manage) (stockManage.ts 내 정의)

---

## 19. 직원 · 스케줄 (employees · schedules)

**파일:** `server/routes/schedule/schedules.ts` · **15 endpoints**
**Zod:** ✓ 3/15 (`UpsertScheduleSchema`, `BatchScheduleSchema`, `CopyScheduleSchema`)

### 스케줄
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/schedules` | – | – | 스케줄 조회 (controller) |
| PUT | `/api/schedules` | 5 | ✓ | 단건 upsert |
| POST | `/api/schedules/batch` | 5 | ✓ | 일괄 갱신 |
| POST | `/api/schedules/copy` | 5 | ✓ | 복사 |

### 직원
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/employees` | 9 | 신규 (S0 보안 fix) |
| GET | `/api/employees/next-number` | – | 신규 사번 (MAX+1) |
| PUT | `/api/employees/:id` | 9 | 수정 (S0 · privilege escalation 방지) |
| DELETE | `/api/employees/:id` | 9 | 삭제 |
| GET | `/api/employees` | 1 | 재직 직원 리스트 (@멘션·useEmployees 통일 소스) |
| GET | `/api/employees/:id` | – (인라인) | 본인 or lv9 만 (S0 · IDOR) |
| POST | `/api/employees/:id/contract` | 1 | 계약서 파일 업로드 (multer · 20MB · 본인·lv9) |
| POST | `/api/employees/:id/resume` | 1 | 이력서 (Google Drive · 10MB · 본인·lv9) |
| DELETE | `/api/employees/:id/resume` | 9 | 이력서 삭제 |
| POST | `/api/employees/:id/resignation-file` | 1 | 사직서 파일 (Supabase Storage · 20MB) |
| GET | `/api/drive-status` | – | Google Drive 상태 |

### 스탭 (별도 파일 `staff.ts`)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/staff-availability` | – | 예약 대상 (대표·이사) 일별 가용성 |
| GET | `/api/staff-monthly` | – | 월별 휴무 표시 |

---

## 20. HR · 직원 부속 (hr-forms · contracts · resignations · clauses)

### `employeeContracts.ts` · **4 endpoints** · Zod ✓ 1/4
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/employees/latest-contract` | – | – | employee_number 우선 최신 계약 |
| GET | `/api/employee-contracts` | – | – | 이력 리스트 |
| POST | `/api/employee-contracts` | 9 | ✓ `CreateEmployeeContractSchema` | PDF data-url 저장 (Storage or 로컬 fallback) |
| POST | `/api/employee-contracts/upload` | 9 | – | multer PDF · Google Drive 업로드 |

### `resignations.ts` · **5 endpoints** · Zod ✓ 2/5
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/resignations` | – | – | 리스트 |
| GET | `/api/resignations/pending-count` | – | – | 대기 개수 |
| POST | `/api/resignations` | 1 | ✓ `CreateResignationSchema` | 신청 |
| PATCH | `/api/resignations/:id` | 5 | ✓ `ReviewResignationSchema` | 승인/반려 |
| DELETE | `/api/resignations/:id` | 9 | – | 삭제 |

### `hrForms.ts` · **3 endpoints** · Zod ✓ 1/3
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/hr-forms` | – | HR 서류 리스트 |
| POST | `/api/hr-forms` | 5 | `CreateHrFormSchema` |
| DELETE | `/api/hr-forms/:id` | 9 | 삭제 |

### `contractClauses.ts` · **3 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/contract-clauses` | – | 각 호 CMS 조회 |
| PUT | `/api/contract-clauses/:key` | 9 | 단건 저장 |
| PUT | `/api/contract-clauses` | 9 | 전체 저장 |

---

## 21. 일일 데이터 (leave · lunch · reservations)

### `leave.ts` · **7 endpoints** · Zod ✓ 2/7
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/leave-stats` | – | – | 통계 |
| GET | `/api/leave-requests` | – | – | 리스트 |
| GET | `/api/leave-balance` | – | – | 잔여 연차 |
| GET | `/api/leave-requests/pending-count` | – | – | 대기 |
| POST | `/api/leave-requests` | 1 | ✓ `CreateLeaveRequestSchema` | 신청 |
| PUT | `/api/leave-requests/:id` | 5 | ✓ `ReviewLeaveRequestSchema` | 승인/반려 |
| DELETE | `/api/leave-requests/:id` | 5 | – | 삭제 |

### `lunch.ts` · **4 endpoints** · Zod ✓ 1/4
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/lunch-attendance` | – | – | 점심 참석 |
| GET | `/api/lunch-requests` | – | – | 리스트 |
| PUT | `/api/lunch-requests` | 1 | ✓ `UpsertLunchRequestSchema` | upsert |
| DELETE | `/api/lunch-requests` | 1 | – | 삭제 |

### `reservations.ts` · **2 endpoints** · Zod ✓ 1/2
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/reservations` | – | – | 리스트 |
| POST | `/api/reservations` | 5 | ✓ `CreateReservationSchema` | 신규 |

---

## 22. 매장 배치: display zones · assignments · mismatches

### `zoneDefs.ts` · **5 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/zone-defs` | – | 구역 정의 (정식 DB · KV 이관) |
| PATCH | `/api/zone-defs/:id` | 9 | 개별 patch |
| PUT | `/api/zone-defs` | 9 | 전체 upsert |
| POST | `/api/zone-defs` | 9 | 신규 구역 |
| DELETE | `/api/zone-defs/:id` | 9 | 삭제 |

### `zoneLabels.ts` · **4 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/zone-labels` | – | 라벨 조회 |
| PUT | `/api/zone-labels` | 9 | 일괄 저장 |
| POST | `/api/zone-labels` | 9 | 신규 |
| DELETE | `/api/zone-labels/:zoneId` | 9 | 삭제 |

### `zoneAssignments.ts` · **5 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/zone-assignments/:dow` | – | 요일별 배정 |
| PUT | `/api/zone-assignments/:dow` | 5 | 저장 |
| GET | `/api/zone-day/:date` | – | 특정 날짜 배정 |
| PUT | `/api/zone-day/:date` | 5 | 저장 |
| POST | `/api/zone-day/copy-month` | 5 | 월별 복사 |

### `mismatches.ts` · **4 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/zone-mismatches` | – | 불일치 리스트 |
| POST | `/api/zone-mismatches` | 1 | 등록 |
| DELETE | `/api/zone-mismatches/by-code/:code` | 1 | 코드로 삭제 |
| DELETE | `/api/zone-mismatches/:id` | 2 | id 로 삭제 |

---

## 23. 게시판 · 알림 · 약사 자료 (board · notifications · pharmacist)

### `board.ts` · **12 endpoints** · Zod ✓ 2/12
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| POST | `/api/board/upload-image` | 1 | – | Cloudinary 업로드 |
| GET | `/api/board/posts` | – | – | 게시글 리스트 |
| GET | `/api/board/posts/:id` | – | – | 상세 |
| POST | `/api/board/posts` | 1 | ✓ `CreatePostSchema` | 신규 |
| PATCH | `/api/board/posts/:id` | 1 | – | 수정 (본인/lv9) |
| DELETE | `/api/board/posts/:id` | 9 | – | 삭제 |
| POST | `/api/board/posts/:id/comments` | 1 | ✓ `CreateCommentSchema` | 댓글 |
| PATCH | `/api/board/comments/:id` | 1 | – | 댓글 수정 |
| DELETE | `/api/board/comments/:id` | 2 | – | 삭제 |
| POST | `/api/board/comments/:id/accept` | 1 | – | 채택 |
| POST | `/api/board/posts/:id/react` | 1 | – | 이모지 반응 |
| POST | `/api/board/cloudinary-signature` | 1 | – | 직접 업로드 서명 |

### `notifications.ts` · **6 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/push-subscribe` | 1 | Web Push 구독 |
| POST | `/api/push-send` | 5 | 브로드캐스트 |
| GET | `/api/notifications` | – | 목록 |
| PATCH | `/api/notifications/:id/read` | 1 | 읽음 |
| POST | `/api/notifications/read-all` | 1 | 전체 읽음 |
| POST | `/api/notifications` | 5 | 알림 발송 |

### `pharmacistMenuItems.ts` · **4 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/pharmacist-menu-items` | – | 약사 자료 |
| POST | `/api/pharmacist-menu-items` | 5 | 등록 |
| PATCH | `/api/pharmacist-menu-items/:id` | 5 | 수정 |
| DELETE | `/api/pharmacist-menu-items/:id` | 9 | 삭제 |

### `clientErrors.ts` · **1 endpoint** · Zod ✓
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| POST | `/api/client-errors` | – | ✓ `ClientErrorSchema` | 클라 에러 수집 (audit 로그) |

---

## 24. 카카오 알림톡 (kakao)

**파일:** `server/routes/notification/kakaoSend.ts` · **2 endpoints**
**Zod:** ✓ 인라인 (safeParse) · **authorize(3):** ✓ 2/2

| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| POST | `/api/notifications/kakao-send` | 3 | 알림톡 전송 (미구성 시 ok:false) |
| GET | `/api/notifications/kakao-send/status` | 3 | 설정 여부 (UI 배너용) |

**추가 인라인 endpoint (server.ts):**
- `GET /api/notification/solapi-status` · `handleSolApiStatus` (SolAPI 상태)

---

## 25. 설정 (settings)

### `settings.ts` · **12 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/settings/season-ranges` | – | 계절 정의 |
| POST | `/api/settings/season-ranges` | 9 | 계절 저장 |
| GET | `/api/settings` | – | KV 조회 (key 필수) |
| POST | `/api/settings` | 9 | KV 저장 (특정 key 캐시 무효화) |
| GET | `/api/permissions` | – | 페이지 권한 |
| POST | `/api/permissions` | 9 | 페이지 권한 저장 |
| GET | `/api/zone-groups` | – | 구역 그룹 |
| PUT | `/api/zone-groups` | 9 | 저장 |
| GET | `/api/blocked-slots` | – | 차단 시간대 |
| POST | `/api/blocked-slots` | – | 차단 저장 |
| GET | `/api/zones` | – | zone_assignments |
| POST | `/api/zones` | – | 저장 |

### `systemConfig.ts` · **2 endpoints**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/system-config` | 9 | 시스템 config |
| POST | `/api/system-config` | 9 | 저장 |

### `autoImport.ts` · **7 endpoints** · Zod ✓ 2/7
| METHOD | Path | authorize | Zod | 설명 |
|---|---|---|---|---|
| GET | `/api/auto-import/config` | 9 | – | 설정 조회 (KV 손상 시 DEFAULT fallback) |
| POST | `/api/auto-import/config` | 9 | ✓ `AutoImportConfigSchema` | 저장 |
| POST | `/api/auto-import/heartbeat` | 9 | ✓ `AutoImportHeartbeatSchema` | Python 리포트 (log + 관리자 알림) |
| GET | `/api/auto-import/status` | 9 | – | 최신 heartbeat |
| GET | `/api/auto-import/installer` | 9 | – | 설치 파일 목록 |
| GET | `/api/auto-import/installer/file` | 9 | – | 개별 파일 다운로드 |
| GET | `/api/auto-import/one-click-installer` | 9 | – | 원클릭 설치 배치 |

---

## 26. Reference Values · 기타

### `referenceValues.ts` · **1 endpoint**
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/api/reference-values` | – | vendors.category + employees(position·rank·employmentType·workplace) DISTINCT · 5분 캐시 |

### `products.json` (server.ts 인라인)
| METHOD | Path | authorize | 설명 |
|---|---|---|---|
| GET | `/products.json` | – | 스캔용 상품 map (memory cache · 판매중 필터 반영) |

---

## 프레임워크 준수율 (Compliance)

| 항목 | 준수 | 미준수 | 준수율 |
|---|---|---|---|
| **asyncHandler** | 262 / 268 | 6 | **97.8%** |
| **HttpError 사용** | 260 / 268 | 8 | **97.0%** |
| **Zod validateBody** | 26 / 268 | 242 | **9.7%** ⚠ |
| **authorize(level)** | 152 / 268 | 116 | **56.7%** (GET 다수는 requireAuth 만) |

### 주요 미준수 · 개선 후보

1. **`POST /api/upload-purchase-details`** · authorize 미들웨어 대신 `managerId` query 로 인라인 lv9 검사 → `authorize(9)` 대체 후보
2. **`ocr-deleted-rows/*`** (3 endpoints) · authorize 명시 없음 · 최소 `authorize(1)` 후보
3. **`POST /api/ocr`** · asyncHandler 없이 raw async · try/catch 인라인 (대용량 페일오버 로직 복잡성 · 리팩터 필요 시 검토)
4. **`stock-manage/*`** 17 endpoints · 모두 GET · authorize 없음 (재무·매출 데이터) · 검토 후보
5. **Zod 확산 필요:** OCR (25) · stockManage (17) · purchase-details · payments (11) · vendors (일부) · 대규모 확장 여지
6. **중복 · 통합 후보:**
   - `/api/products/purchase-history` vs `/api/supplier-purchase-detail` · 유사 데이터 (상품 vs 공급사 관점)
   - `/api/sales-trend/*` (3) + `/api/stock-manage/top-*` (2) · 판매 분석 통합 여지
   - `/api/push-subscribe` + `/api/anon-push-subscribe` · 통합 후보 (익명 여부 flag)

### 도메인별 endpoint 개수

| 도메인 | Endpoints |
|---|---|
| Auth | 9 |
| Products | 16 (public 1 포함) |
| Vendors | 10 |
| Display Requests · Orders · Inventory | 17 |
| Return Requests | 6 |
| Purchase Details | 6 |
| Purchase History | 1 |
| OCR (매칭·synonym·template·balance) | 25 |
| OCR Confirmed + Deleted | 6 |
| Invoice Images | 2 |
| VAT | 4 |
| Supplier Payments + Balance Config | 14 |
| Borrowings | 9 |
| Stock Manage | 17 |
| Stock Arrivals | 7 |
| Product Arrivals | 5 |
| Loss Tracking | 3 |
| Schedules + Employees | 15 |
| Staff | 2 |
| Employee Contracts | 4 |
| Resignations | 5 |
| HR Forms | 3 |
| Contract Clauses | 3 |
| Leave | 7 |
| Lunch | 4 |
| Reservations | 2 |
| Zone Defs / Labels / Assignments / Mismatches | 18 |
| Board | 12 |
| Notifications | 6 |
| Pharmacist Menu Items | 4 |
| Client Errors | 1 |
| Kakao Send + SolAPI | 3 |
| Settings | 12 |
| System Config | 2 |
| Auto Import | 7 |
| Reference Values | 1 |
| products.json | 1 |
| **총계** | **268** |

---

*이 문서는 `server.ts` + `server/routes/**` 정적 스캔으로 생성되었습니다. 소스 파일이 정본이며, 이 문서는 참고용입니다.*
