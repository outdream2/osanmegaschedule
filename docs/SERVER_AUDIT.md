# 서버 프레임워크 감사 (Phase 1)

- 생성 · 2026-08-27 07:53:51
- 스캔 파일 · 39개
- 총 라우트 · 241개
- 위반 · 146건 (high 55)

## 규칙
- **no-authorize** (high) · POST/PATCH/DELETE/PUT · authorize() 미적용
- **no-validate-body** (medium) · POST/PATCH/PUT · validateBody() 미적용
- **no-async-handler** (medium) · asyncHandler() 미적용

## 위반 상세
### server/routes/board/board.ts (6건)
- 🟡 L31 · **no-validate-body** · POST /api/board/upload-image · validateBody() 미적용 · Zod 검증 없음
- 🟡 L278 · **no-validate-body** · PATCH /api/board/posts/:id · validateBody() 미적용 · Zod 검증 없음
- 🟡 L418 · **no-validate-body** · PATCH /api/board/comments/:id · validateBody() 미적용 · Zod 검증 없음
- 🟡 L448 · **no-validate-body** · POST /api/board/comments/:id/accept · validateBody() 미적용 · Zod 검증 없음
- 🟡 L464 · **no-validate-body** · POST /api/board/posts/:id/react · validateBody() 미적용 · Zod 검증 없음
- 🟡 L485 · **no-validate-body** · POST /api/board/cloudinary-signature · validateBody() 미적용 · Zod 검증 없음

### server/routes/board/clientErrors.ts (1건)
- 🔴 L23 · **no-authorize** · POST /api/client-errors · authorize() 미적용 · 권한 우회 가능

### server/routes/board/notifications.ts (5건)
- 🟡 L12 · **no-validate-body** · POST /api/push-subscribe · validateBody() 미적용 · Zod 검증 없음
- 🟡 L20 · **no-validate-body** · POST /api/push-send · validateBody() 미적용 · Zod 검증 없음
- 🟡 L56 · **no-validate-body** · PATCH /api/notifications/:id/read · validateBody() 미적용 · Zod 검증 없음
- 🟡 L63 · **no-validate-body** · POST /api/notifications/read-all · validateBody() 미적용 · Zod 검증 없음
- 🟡 L70 · **no-validate-body** · POST /api/notifications · validateBody() 미적용 · Zod 검증 없음

### server/routes/board/pharmacistMenuItems.ts (2건)
- 🟡 L136 · **no-validate-body** · POST /api/pharmacist-menu-items · validateBody() 미적용 · Zod 검증 없음
- 🟡 L262 · **no-validate-body** · PATCH /api/pharmacist-menu-items/:id · validateBody() 미적용 · Zod 검증 없음

### server/routes/display/mismatches.ts (1건)
- 🟡 L66 · **no-validate-body** · POST /api/zone-mismatches · validateBody() 미적용 · Zod 검증 없음

### server/routes/display/requests.ts (18건)
- 🔴 L118 · **no-authorize** · POST /api/display-requests · authorize() 미적용 · 권한 우회 가능
- 🟡 L118 · **no-validate-body** · POST /api/display-requests · validateBody() 미적용 · Zod 검증 없음
- 🔴 L258 · **no-authorize** · PATCH /api/display-requests/:id/prepare · authorize() 미적용 · 권한 우회 가능
- 🟡 L258 · **no-validate-body** · PATCH /api/display-requests/:id/prepare · validateBody() 미적용 · Zod 검증 없음
- 🔴 L323 · **no-authorize** · PATCH /api/display-requests/:id/complete · authorize() 미적용 · 권한 우회 가능
- 🟡 L323 · **no-validate-body** · PATCH /api/display-requests/:id/complete · validateBody() 미적용 · Zod 검증 없음
- 🔴 L383 · **no-authorize** · PATCH /api/display-requests/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L383 · **no-validate-body** · PATCH /api/display-requests/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L426 · **no-authorize** · POST /api/order-requests · authorize() 미적용 · 권한 우회 가능
- 🟡 L426 · **no-validate-body** · POST /api/order-requests · validateBody() 미적용 · Zod 검증 없음
- 🔴 L531 · **no-authorize** · POST /api/order-requests/bulk-send · authorize() 미적용 · 권한 우회 가능
- 🟡 L531 · **no-validate-body** · POST /api/order-requests/bulk-send · validateBody() 미적용 · Zod 검증 없음
- 🔴 L750 · **no-authorize** · POST /api/inventory-checks · authorize() 미적용 · 권한 우회 가능
- 🟡 L750 · **no-validate-body** · POST /api/inventory-checks · validateBody() 미적용 · Zod 검증 없음
- 🔴 L868 · **no-authorize** · POST /api/inventory-checks/bulk · authorize() 미적용 · 권한 우회 가능
- 🟡 L868 · **no-validate-body** · POST /api/inventory-checks/bulk · validateBody() 미적용 · Zod 검증 없음
- 🔴 L955 · **no-authorize** · PATCH /api/inventory-checks/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L955 · **no-validate-body** · PATCH /api/inventory-checks/:id · validateBody() 미적용 · Zod 검증 없음

### server/routes/display/zoneAssignments.ts (3건)
- 🟡 L185 · **no-validate-body** · PUT /api/zone-assignments/:dow · validateBody() 미적용 · Zod 검증 없음
- 🟡 L276 · **no-validate-body** · PUT /api/zone-day/:date · validateBody() 미적용 · Zod 검증 없음
- 🟡 L354 · **no-validate-body** · POST /api/zone-day/copy-month · validateBody() 미적용 · Zod 검증 없음

### server/routes/display/zoneLabels.ts (4건)
- 🔴 L47 · **no-authorize** · PUT /api/zone-labels · authorize() 미적용 · 권한 우회 가능
- 🟡 L47 · **no-validate-body** · PUT /api/zone-labels · validateBody() 미적용 · Zod 검증 없음
- 🔴 L71 · **no-authorize** · POST /api/zone-labels · authorize() 미적용 · 권한 우회 가능
- 🟡 L71 · **no-validate-body** · POST /api/zone-labels · validateBody() 미적용 · Zod 검증 없음

### server/routes/ocr/ocr.ts (29건)
- 🟡 L371 · **no-async-handler** · GET /api/health · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🟡 L373 · **no-async-handler** · GET /api/ocr-ping · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L379 · **no-authorize** · POST /api/ocr-match · authorize() 미적용 · 권한 우회 가능
- 🟡 L379 · **no-validate-body** · POST /api/ocr-match · validateBody() 미적용 · Zod 검증 없음
- 🔴 L530 · **no-authorize** · POST /api/ocr-synonyms · authorize() 미적용 · 권한 우회 가능
- 🟡 L530 · **no-validate-body** · POST /api/ocr-synonyms · validateBody() 미적용 · Zod 검증 없음
- 🔴 L562 · **no-authorize** · PATCH /api/ocr-synonyms/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L562 · **no-validate-body** · PATCH /api/ocr-synonyms/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L581 · **no-authorize** · DELETE /api/ocr-synonyms/by-name · authorize() 미적용 · 권한 우회 가능
- 🔴 L594 · **no-authorize** · POST /api/ocr-synonyms/cancel-by-name · authorize() 미적용 · 권한 우회 가능
- 🟡 L594 · **no-validate-body** · POST /api/ocr-synonyms/cancel-by-name · validateBody() 미적용 · Zod 검증 없음
- 🔴 L635 · **no-authorize** · POST /api/ocr-synonyms/restore/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L635 · **no-validate-body** · POST /api/ocr-synonyms/restore/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L658 · **no-authorize** · POST /api/ocr-supplier-aliases · authorize() 미적용 · 권한 우회 가능
- 🟡 L658 · **no-validate-body** · POST /api/ocr-supplier-aliases · validateBody() 미적용 · Zod 검증 없음
- 🔴 L683 · **no-authorize** · PATCH /api/ocr-supplier-aliases/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L683 · **no-validate-body** · PATCH /api/ocr-supplier-aliases/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L708 · **no-authorize** · POST /api/ocr-templates · authorize() 미적용 · 권한 우회 가능
- 🟡 L708 · **no-validate-body** · POST /api/ocr-templates · validateBody() 미적용 · Zod 검증 없음
- 🔴 L730 · **no-authorize** · POST /api/ocr · authorize() 미적용 · 권한 우회 가능
- 🟡 L730 · **no-validate-body** · POST /api/ocr · validateBody() 미적용 · Zod 검증 없음
- 🟡 L730 · **no-async-handler** · POST /api/ocr · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L1545 · **no-authorize** · POST /api/ocr/parse-local · authorize() 미적용 · 권한 우회 가능
- 🟡 L1545 · **no-validate-body** · POST /api/ocr/parse-local · validateBody() 미적용 · Zod 검증 없음
- 🔴 L1614 · **no-authorize** · POST /api/ocr/parse-gemini · authorize() 미적용 · 권한 우회 가능
- 🟡 L1614 · **no-validate-body** · POST /api/ocr/parse-gemini · validateBody() 미적용 · Zod 검증 없음
- 🔴 L1750 · **no-authorize** · POST /api/supplier-balances · authorize() 미적용 · 권한 우회 가능
- 🟡 L1750 · **no-validate-body** · POST /api/supplier-balances · validateBody() 미적용 · Zod 검증 없음
- 🔴 L1761 · **no-authorize** · DELETE /api/supplier-balances/:id · authorize() 미적용 · 권한 우회 가능

### server/routes/payment/borrowings.ts (2건)
- 🟡 L47 · **no-validate-body** · POST /api/borrowings · validateBody() 미적용 · Zod 검증 없음
- 🟡 L74 · **no-validate-body** · PATCH /api/borrowings/:id · validateBody() 미적용 · Zod 검증 없음

### server/routes/purchase/invoiceImages.ts (2건)
- 🔴 L65 · **no-authorize** · POST /api/invoice-images/upload · authorize() 미적용 · 권한 우회 가능
- 🟡 L65 · **no-validate-body** · POST /api/invoice-images/upload · validateBody() 미적용 · Zod 검증 없음

### server/routes/purchase/ocrConfirmed.ts (2건)
- 🔴 L72 · **no-authorize** · POST /api/ocr-confirmed-items · authorize() 미적용 · 권한 우회 가능
- 🟡 L72 · **no-validate-body** · POST /api/ocr-confirmed-items · validateBody() 미적용 · Zod 검증 없음

### server/routes/purchase/supplierBalanceConfig.ts (2건)
- 🔴 L50 · **no-authorize** · PUT /api/supplier-balance-configs · authorize() 미적용 · 권한 우회 가능
- 🟡 L50 · **no-validate-body** · PUT /api/supplier-balance-configs · validateBody() 미적용 · Zod 검증 없음

### server/routes/purchase/supplierPayments.ts (2건)
- 🟡 L216 · **no-validate-body** · POST /api/supplier-payments · validateBody() 미적용 · Zod 검증 없음
- 🟡 L322 · **no-validate-body** · PATCH /api/supplier-payments/:id · validateBody() 미적용 · Zod 검증 없음

### server/routes/purchase/vendors.ts (12건)
- 🔴 L19 · **no-authorize** · POST /api/upload-vendors · authorize() 미적용 · 권한 우회 가능
- 🟡 L19 · **no-validate-body** · POST /api/upload-vendors · validateBody() 미적용 · Zod 검증 없음
- 🔴 L221 · **no-authorize** · POST /api/vendors · authorize() 미적용 · 권한 우회 가능
- 🔴 L268 · **no-authorize** · PATCH /api/vendors/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L268 · **no-validate-body** · PATCH /api/vendors/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L402 · **no-authorize** · POST /api/vendors/bulk-import · authorize() 미적용 · 권한 우회 가능
- 🟡 L402 · **no-validate-body** · POST /api/vendors/bulk-import · validateBody() 미적용 · Zod 검증 없음
- 🔴 L451 · **no-authorize** · POST /api/vendors/:id/set-password · authorize() 미적용 · 권한 우회 가능
- 🟡 L451 · **no-validate-body** · POST /api/vendors/:id/set-password · validateBody() 미적용 · Zod 검증 없음
- 🟡 L470 · **no-validate-body** · POST /api/vendors/:id/approval-request · validateBody() 미적용 · Zod 검증 없음
- 🟡 L512 · **no-validate-body** · POST /api/vendors/:id/approve · validateBody() 미적용 · Zod 검증 없음
- 🟡 L529 · **no-validate-body** · POST /api/vendors/:id/reject · validateBody() 미적용 · Zod 검증 없음

### server/routes/schedule/schedules.ts (20건)
- 🟡 L18 · **no-async-handler** · GET /api/schedules · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L19 · **no-authorize** · PUT /api/schedules · authorize() 미적용 · 권한 우회 가능
- 🟡 L19 · **no-async-handler** · PUT /api/schedules · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L20 · **no-authorize** · POST /api/schedules/batch · authorize() 미적용 · 권한 우회 가능
- 🟡 L20 · **no-async-handler** · POST /api/schedules/batch · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L21 · **no-authorize** · POST /api/schedules/copy · authorize() 미적용 · 권한 우회 가능
- 🟡 L21 · **no-async-handler** · POST /api/schedules/copy · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L22 · **no-authorize** · POST /api/employees · authorize() 미적용 · 권한 우회 가능
- 🟡 L22 · **no-validate-body** · POST /api/employees · validateBody() 미적용 · Zod 검증 없음
- 🟡 L22 · **no-async-handler** · POST /api/employees · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L30 · **no-authorize** · PUT /api/employees/:id · authorize() 미적용 · 권한 우회 가능
- 🟡 L30 · **no-validate-body** · PUT /api/employees/:id · validateBody() 미적용 · Zod 검증 없음
- 🟡 L30 · **no-async-handler** · PUT /api/employees/:id · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🟡 L31 · **no-async-handler** · DELETE /api/employees/:id · asyncHandler() 미적용 · 에러 핸들링 표준 아님
- 🔴 L72 · **no-authorize** · POST /api/employees/:id/contract · authorize() 미적용 · 권한 우회 가능
- 🟡 L72 · **no-validate-body** · POST /api/employees/:id/contract · validateBody() 미적용 · Zod 검증 없음
- 🔴 L96 · **no-authorize** · POST /api/employees/:id/resume · authorize() 미적용 · 권한 우회 가능
- 🟡 L96 · **no-validate-body** · POST /api/employees/:id/resume · validateBody() 미적용 · Zod 검증 없음
- 🔴 L150 · **no-authorize** · POST /api/employees/:id/resignation-file · authorize() 미적용 · 권한 우회 가능
- 🟡 L150 · **no-validate-body** · POST /api/employees/:id/resignation-file · validateBody() 미적용 · Zod 검증 없음

### server/routes/settings/settings.ts (8건)
- 🟡 L84 · **no-validate-body** · POST /api/settings/season-ranges · validateBody() 미적용 · Zod 검증 없음
- 🟡 L103 · **no-validate-body** · POST /api/settings · validateBody() 미적용 · Zod 검증 없음
- 🟡 L119 · **no-validate-body** · POST /api/permissions · validateBody() 미적용 · Zod 검증 없음
- 🟡 L136 · **no-validate-body** · PUT /api/zone-groups · validateBody() 미적용 · Zod 검증 없음
- 🔴 L154 · **no-authorize** · POST /api/blocked-slots · authorize() 미적용 · 권한 우회 가능
- 🟡 L154 · **no-validate-body** · POST /api/blocked-slots · validateBody() 미적용 · Zod 검증 없음
- 🔴 L190 · **no-authorize** · POST /api/zones · authorize() 미적용 · 권한 우회 가능
- 🟡 L190 · **no-validate-body** · POST /api/zones · validateBody() 미적용 · Zod 검증 없음

### server/routes/settings/systemConfig.ts (1건)
- 🟡 L60 · **no-validate-body** · POST /api/system-config · validateBody() 미적용 · Zod 검증 없음

### server/routes/staff/contractClauses.ts (4건)
- 🔴 L110 · **no-authorize** · PUT /api/contract-clauses/:key · authorize() 미적용 · 권한 우회 가능
- 🟡 L110 · **no-validate-body** · PUT /api/contract-clauses/:key · validateBody() 미적용 · Zod 검증 없음
- 🔴 L136 · **no-authorize** · PUT /api/contract-clauses · authorize() 미적용 · 권한 우회 가능
- 🟡 L136 · **no-validate-body** · PUT /api/contract-clauses · validateBody() 미적용 · Zod 검증 없음

### server/routes/staff/employeeContracts.ts (3건)
- 🔴 L231 · **no-authorize** · POST /api/employee-contracts · authorize() 미적용 · 권한 우회 가능
- 🔴 L375 · **no-authorize** · POST /api/employee-contracts/upload · authorize() 미적용 · 권한 우회 가능
- 🟡 L375 · **no-validate-body** · POST /api/employee-contracts/upload · validateBody() 미적용 · Zod 검증 없음

### server/routes/staff/hrForms.ts (1건)
- 🔴 L125 · **no-authorize** · POST /api/hr-forms · authorize() 미적용 · 권한 우회 가능

### server/routes/stock/lossTracking.ts (2건)
- 🔴 L200 · **no-authorize** · POST /api/loss-tracking/snapshot · authorize() 미적용 · 권한 우회 가능
- 🟡 L200 · **no-validate-body** · POST /api/loss-tracking/snapshot · validateBody() 미적용 · Zod 검증 없음

### server/routes/stock/productArrivals.ts (1건)
- 🔴 L21 · **no-authorize** · POST /api/product-arrivals · authorize() 미적용 · 권한 우회 가능

### server/routes/stock/products.ts (9건)
- 🔴 L285 · **no-authorize** · POST /api/upload-products · authorize() 미적용 · 권한 우회 가능
- 🟡 L285 · **no-validate-body** · POST /api/upload-products · validateBody() 미적용 · Zod 검증 없음
- 🟡 L436 · **no-validate-body** · POST /api/products/sync-real-map-to-spec · validateBody() 미적용 · Zod 검증 없음
- 🔴 L580 · **no-authorize** · PATCH /api/products/:code/realmap · authorize() 미적용 · 권한 우회 가능
- 🟡 L580 · **no-validate-body** · PATCH /api/products/:code/realmap · validateBody() 미적용 · Zod 검증 없음
- 🔴 L616 · **no-authorize** · POST /api/products/refill-optimal-stock · authorize() 미적용 · 권한 우회 가능
- 🟡 L616 · **no-validate-body** · POST /api/products/refill-optimal-stock · validateBody() 미적용 · Zod 검증 없음
- 🟡 L652 · **no-validate-body** · PATCH /api/products/:code · validateBody() 미적용 · Zod 검증 없음
- 🟡 L705 · **no-validate-body** · POST /api/products · validateBody() 미적용 · Zod 검증 없음

### server/routes/stock/stockArrivals.ts (5건)
- 🟡 L93 · **no-validate-body** · POST /api/stock-arrivals · validateBody() 미적용 · Zod 검증 없음
- 🟡 L130 · **no-validate-body** · POST /api/stock-arrivals/:id/broadcast · validateBody() 미적용 · Zod 검증 없음
- 🟡 L154 · **no-validate-body** · PATCH /api/stock-arrivals/:id · validateBody() 미적용 · Zod 검증 없음
- 🔴 L190 · **no-authorize** · POST /api/anon-push-subscribe · authorize() 미적용 · 권한 우회 가능
- 🟡 L190 · **no-validate-body** · POST /api/anon-push-subscribe · validateBody() 미적용 · Zod 검증 없음

### server/routes/stock/stockManage.ts (1건)
- 🟡 L1653 · **no-validate-body** · POST /api/upload-stock · validateBody() 미적용 · Zod 검증 없음

## 라우트별 준수 현황
- ⚠ 29 · server/routes/ocr/ocr.ts · 25 라우트
- ⚠ 20 · server/routes/schedule/schedules.ts · 14 라우트
- ⚠ 18 · server/routes/display/requests.ts · 17 라우트
- ⚠ 12 · server/routes/purchase/vendors.ts · 10 라우트
- ⚠ 9 · server/routes/stock/products.ts · 15 라우트
- ⚠ 8 · server/routes/settings/settings.ts · 12 라우트
- ⚠ 6 · server/routes/board/board.ts · 12 라우트
- ⚠ 5 · server/routes/board/notifications.ts · 6 라우트
- ⚠ 5 · server/routes/stock/stockArrivals.ts · 7 라우트
- ⚠ 4 · server/routes/display/zoneLabels.ts · 4 라우트
- ⚠ 4 · server/routes/staff/contractClauses.ts · 3 라우트
- ⚠ 3 · server/routes/display/zoneAssignments.ts · 5 라우트
- ⚠ 3 · server/routes/staff/employeeContracts.ts · 4 라우트
- ⚠ 2 · server/routes/board/pharmacistMenuItems.ts · 4 라우트
- ⚠ 2 · server/routes/payment/borrowings.ts · 4 라우트
- ⚠ 2 · server/routes/purchase/invoiceImages.ts · 2 라우트
- ⚠ 2 · server/routes/purchase/ocrConfirmed.ts · 3 라우트
- ⚠ 2 · server/routes/purchase/supplierBalanceConfig.ts · 3 라우트
- ⚠ 2 · server/routes/purchase/supplierPayments.ts · 12 라우트
- ⚠ 2 · server/routes/stock/lossTracking.ts · 3 라우트
- ⚠ 1 · server/routes/board/clientErrors.ts · 1 라우트
- ⚠ 1 · server/routes/display/mismatches.ts · 4 라우트
- ⚠ 1 · server/routes/settings/systemConfig.ts · 2 라우트
- ⚠ 1 · server/routes/staff/hrForms.ts · 3 라우트
- ⚠ 1 · server/routes/stock/productArrivals.ts · 5 라우트
- ⚠ 1 · server/routes/stock/stockManage.ts · 19 라우트
- ✅ · server/routes/daily/leave.ts · 7 라우트
- ✅ · server/routes/daily/lunch.ts · 4 라우트
- ✅ · server/routes/daily/reservations.ts · 2 라우트