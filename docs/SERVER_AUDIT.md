# 서버 프레임워크 감사 (Phase 1)

- 생성 · 2026-09-01 11:50:39
- 스캔 파일 · 71개
- 총 라우트 · 249개
- 위반 · 0건 (high 0)

## 규칙
- **no-authorize** (high) · POST/PATCH/DELETE/PUT · authorize() 미적용
- **no-validate-body** (medium) · POST/PATCH/PUT · validateBody() 미적용
- **no-async-handler** (medium) · asyncHandler() 미적용

## 위반 상세
_없음 · 모든 라우트 준수_
## 라우트별 준수 현황
- ✅ · server/routes/board/board.ts · 12 라우트
- ✅ · server/routes/board/clientErrors.ts · 1 라우트
- ✅ · server/routes/board/notifications.ts · 6 라우트
- ✅ · server/routes/board/pharmacistMenuItems.ts · 4 라우트
- ✅ · server/routes/daily/leave.ts · 7 라우트
- ✅ · server/routes/daily/lunch.ts · 4 라우트
- ✅ · server/routes/daily/reservations.ts · 2 라우트
- ✅ · server/routes/display/mismatches.ts · 4 라우트
- ✅ · server/routes/display/requests.ts · 17 라우트
- ✅ · server/routes/display/zoneAssignments.ts · 5 라우트
- ✅ · server/routes/display/zoneDefs.ts · 5 라우트
- ✅ · server/routes/display/zoneLabels.ts · 4 라우트
- ✅ · server/routes/ocr/aliasesRouter.ts · 4 라우트
- ✅ · server/routes/ocr/coreRouter.ts · 1 라우트
- ✅ · server/routes/ocr/diagRouter.ts · 2 라우트
- ✅ · server/routes/ocr/matchRouter.ts · 3 라우트
- ✅ · server/routes/ocr/parseRouter.ts · 2 라우트
- ✅ · server/routes/ocr/supplierBalancesRouter.ts · 3 라우트
- ✅ · server/routes/ocr/synonymsRouter.ts · 7 라우트
- ✅ · server/routes/ocr/templatesRouter.ts · 3 라우트
- ✅ · server/routes/payment/borrowings.ts · 9 라우트
- ✅ · server/routes/purchase/invoiceImages.ts · 2 라우트
- ✅ · server/routes/purchase/ocrConfirmed.ts · 3 라우트
- ✅ · server/routes/purchase/purchase.ts · 5 라우트