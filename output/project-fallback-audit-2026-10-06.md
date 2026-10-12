# Project Fallback Audit · 2026-10-06

Read-only audit of runtime data fallback patterns against the DB-EXACT-SOURCE-FIRST / IDENTITY-ONE / SOURCE-ONE / CALCULATION-ONE principles.

Scope: `src/`, `server/`, `apps/sync-agent/src/` (excluded: `node_modules`, `dist`, `build`, `coverage`, `output`, `*.test.*`, `*.min.*`, `.framework-baseline.json`).

## Summary
- total findings: ~440 (representative + explicit)
- forbidden: 11
- display: ~310 (grouped — `?? "-"` / `|| "-"` / `|| "(이름없음)"` / `|| "—"` across 70 files)
- historical: 4
- cache: 6
- fail-closed: 15 (representative)
- device: 3
- bootstrap: 8
- test-only: 0 (excluded by scope)
- unknown: 0

## Priority breakdown
- P0: 7
- P1: 7
- P2: ~320 (display-only `-` / `—` / `(이름없음)` and similar)

## RECOMMENDED SAFE FIX LIST (P0/P1 · no schema change · no destructive)

1. **`server/routes/stock/stockManage/salesTrend.ts:154-158,241-243`** · `cur.saleAmount += saleQty × current products.sale_price` — historical sale revenue recomputed from **current** `products.sale_price`.  
   **Fix:** Use `stock_history.supply_amount` / `total_amount` as the historical revenue source (as the row was originally recorded). If the historical total is NULL, return NULL — do not recompute from current prices.

2. **`server/routes/stock/stockManage/salesTrend.ts:170-171`** / **`server/routes/stock/stockManage/supplierPurchases.ts:76-80,155-158`** — same recompute pattern for COGS using **current** `products.purchase_price` × historical qty.  
   **Fix:** Snapshot the per-row price at write time to `stock_history` (schema-level ideal), OR return the recomputed value as a derived `estimated_*` field clearly separated from the historical SSOT value. Short-term: return NULL when a row has no historical price captured; do not silently use current price.

3. **`server/routes/erp/salesStatsRouter.ts:607-611`** · ERP month call failure → `results[m] = { buyTotal:0, saleTotal:0, margin:0, customerCnt:0 }`.  
   **Fix:** On ERP failure, return `results[m] = null` (NOT a zero-filled success record). UI already handles null as '—'; the current zero-fill makes a failed ERP month indistinguishable from a legitimately-zero month and corrupts year totals.

4. **`server/utils/purchaseDetailsQuery.ts:179-202`** (`resolveSupplier`) · 4-tier identity cascade: `supplier_name` → `supplier_code→vendor` → `displayVendorName()` fuzzy → `products.product_code→products.supplier`.  
   **Fix:** Keep ONLY tier 1 (`supplier_name` as recorded) and tier 2 (`supplier_code` ⇒ `vendors.company_name`). Drop tier 3 (normalized-name fuzzy) and tier 4 (product_code→products.supplier) — they infer identity from a different data source, which violates IDENTITY-ONE. Return NULL for unresolved rows.

5. **`server/utils/purchaseDetailsQuery.ts:314-326`** (Step 4) · `supplierFilter` search falls back to joining via `products.supplier` TEXT equality.  
   **Fix:** Remove Step 4 entirely. The filter must only match rows whose own `supplier_code`/`supplier_name` match; inferring membership through products.supplier can pull unrelated rows.

6. **`src/types.ts:104-129` (`DEFAULT_PERMISSIONS`) + `src/hooks/usePagePermissions.ts:26-28`** · Permission API failure → `DEFAULT_PERMISSIONS` which grants `read:1, write:1` to most pages (not fail-closed).  
   **Fix:** On fetch failure, set `loading` state and block routing. Minimum-viable permission on failure should be `{ read: 9, write: 9 }` (admin-only) or render a "permissions unavailable" screen. Do not silently open level-1 access.

7. **`src/components/NotificationBell.tsx:86,127-128`** · `unreadCountServer`가 null (API failed) ⇒ `notifications.filter(!read).length` (limit=30 → undercounts).  
   **Fix:** Show "—" (or hide the badge) when `unreadCountServer == null`. The limited `notifications.length` fallback is explicitly the bug this feature already documented but still ships.

8. **`server/routes/purchase/purchase.ts:634-635`** · `supplier_name: r.supplier_name ?? info.supplier` and `supplier_code: r.supplier_code ?? info.supplier_code` on purchase_details rows.  
   **Fix:** Supplier identity on a historical purchase row must be the row's own captured value. If `r.supplier_name` is NULL, do NOT fill it with the current `products.supplier`. Return NULL and let the UI render "—".

9. **`server/routes/purchase/supplierPayments/balance.ts:171-189`** · `products.purchase_price` NULL ⇒ latest `purchase_details.unit_price` fallback for current-stock asset valuation.  
   **Fix:** Keep the fallback for VALUATION use (acceptable), but surface a flag (`price_source: "products" | "purchase_details"`) in the response so UI can label estimates. Alternatively, require `products.purchase_price` to be populated by ERP sync and return NULL asset value otherwise.

10. **`src/components/SalesTrendPage/DashboardCharts.tsx:123`** · `vendorCategoryMap[sup] || "기타"` for unmapped suppliers.  
    **Fix:** Change to `"미분류"` (explicitly unmapped) rather than `"기타"` (a legitimate category). Prevents a real `"기타"` bucket colliding with the UNMAPPED bucket.

11. **`src/hooks/useKvSetting.ts` (whole module)** · Server failure ⇒ localStorage used as authority for VAT 경비 / 면세매출 / 체크리스트 / 계약서 직군 업무.  
    **Fix:** For financial/legal KV (VAT, contract text), on server failure show "서버 연결 불가 — 재시도" and block edit. Keep localStorage only for pure UI prefs. Separate `useKvUiSetting` (localStorage ok) from `useKvBusinessSetting` (server required).

12. **`server/routes/stock/stockManage/salesTrend.ts:236-237`** · `priceMap.get(code) ?? 0` and `salePriceMap.get(code) ?? 0` for historical COGS.  
    **Fix:** When a `product_code` has no price mapping, exclude the row from the aggregation (don't fold a zero into revenue/cost sums).

## Domain details

### PRODUCT
Hotspots: `product_name ← product_code`, `identity ← product_name`, barcode leading-zero / alias.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/routes/purchase/purchase.ts:637` | `info.product_name` from products | explicit NULL on relation miss | purchase_details → UI | D (canonical cache) | P2 | low | OK — comments confirm snapshot `product_name` is explicitly stripped (good) |
| `src/lib/productsCache.ts:41-45` (`lookupProduct`) | DB `products.json` map | leading-0 variant lookup | all product UI | D | P2 | low | OK — leading-0 is a format-equivalence, not identity substitution |
| `server/productCache.ts:255-269` (`lookupProductByAnyCode`) | canonical map | leading-0 variant | OCR/Scanner | D | P2 | low | OK |
| `server/routes/purchase/purchase.ts:619` | `p.product_name ?? null` | explicit null | UI display | B | P2 | low | OK |
| `server/routes/stock/stockManage/supplierPurchases.ts:76-80` | ERP period total_amount (historical SSOT) | **current** sale_price × qty | 공급사별 매출 | **A** | **P0** | **high** | Use `period_end` row's own total_amount or snapshot price at history write |
| `server/routes/stock/stockManage/salesTrend.ts:243` | `stock_history.supply_amount` / `total_amount` | current sale_price × qty | 매출 trend | **A** | **P0** | **high** | Return historical row amount as recorded; NULL otherwise |
| `src/components/OrderManagePage/PurchaseHistoryTab.tsx:980,983` | server-side canonical | productsCache.current_stock / sale_status | row display | D | P2 | low | OK (cache is UI-only mirror) |
| display-only `product_name || "-"` / `|| "(이름없음)"` across 20+ files | DB product_name | "-" / "(이름없음)" | UI render | B | P2 | low | Keep — pure display; no identity change |

### SUPPLIER
Hotspots: `supplier_code ← supplier_name`, CtCode miss → normalized name, 사업자번호 dummy.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/utils/purchaseDetailsQuery.ts:179-202` (`resolveSupplier`) | `r.supplier_name` as recorded | ctCode → normalizedName → products.supplier via product_code | all purchase_details queries | **A** | **P0** | **high** | Remove tiers 3-4; return NULL when unresolved |
| `server/utils/purchaseDetailsQuery.ts:314-326` | supplier_code IN filter | products.supplier text equality via product_code | supplier filter | **A** | **P0** | **high** | Remove step 4 |
| `server/utils/purchaseDetailsQuery.ts:91-92` | `v.ct_code` | `v.supplier_code` (same map) | identity lookup | D | P1 | mid | OK — both are canonical vendor code fields in same table |
| `server/routes/purchase/purchase.ts:634-635` | `r.supplier_name` on purchase row | `info.supplier` (current products.supplier) | purchase UI | **A** | **P1** | mid | Historical supplier on a transaction must be the recorded value; NULL otherwise |
| `server/routes/purchase/vat.ts:230` | `r.supplier_name` | `"(미상)"` display | VAT UI | B | P2 | low | OK — display only |
| `apps/sync-agent/src/main/vendorSyncService.ts:88` | ERP `CorpBizNo` | normalize-to-null if all-zero | vendor sync | G | P2 | low | OK — explicit normalization to NULL (correct) |
| `src/components/SalesTrendPage/DashboardCharts.tsx:123` | `vendorCategoryMap[sup]` | `"기타"` | pie chart bucket | **A** (identity sink) | **P1** | mid | Change to `"미분류"` to not collide with real `"기타"` category |

### EMPLOYEE
Hotspots: `employee_id ← employee_name`, 동명이인.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/routes/display/requests.ts:280-281` | `za.employee_id` | explicit null | display zone assignment | B | P2 | low | OK |
| `src/components/DisplayPage/DisplayPage.helpers.ts:136-137` | `row.employee_id ?? null` + `employee_name ?? ""` | explicit | UI assignment | B | P2 | low | OK |
| `server/routes/settings/settings.ts:454-455` | `z.employee_id ?? null` + `employee_name ?? ""` | explicit | zone settings | B | P2 | low | OK |
| `server/routes/staff/employeeContracts.ts:490` | `b.employee_name ?? ""` | string normalize | upload file naming | G | P2 | low | OK |
| `src/hooks/useSettings.ts:81-83` (DEFAULT_SETTINGS positions/ranks) | server-stored | bootstrap defaults | first-run only | G | P2 | low | OK — bootstrap only |

No `employee_name` → `employee_id` identity resolution was found. GOOD.

### PURCHASE
Hotspots: `unit_price ← products.purchase_price`, `supplier identity ← supplier_name`.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/routes/purchase/supplierPayments/balance.ts:171-189` | `products.purchase_price` | latest `purchase_details.unit_price` | 재고자산 valuation | **A** | **P1** | mid | Add `price_source` label; or NULL out |
| `server/routes/purchase/supplierPayments/balance.ts:35-36,420-421` | `p.purchase_price ?? 0` | zero-fallback | asset sum | **A** | **P1** | mid | Exclude NULL-priced rows from asset sum rather than treating as 0 |
| `server/routes/vendor/orderHistory.ts:154` | saved `unit_price` for a historical order | `info?.purchase_price ?? 0` (current products price) | order history row | **A** | **P1** | mid | Historical order should display its recorded unit_price; NULL ⇒ "—" |
| `server/routes/display/requests.ts:860` | `it.unit_price ?? 0` | zero | order amount totals | A | P1 | mid | Exclude or NULL |
| `server/routes/purchase/purchaseHistory.ts:62-63` | row-level qty/price | `?? 0` | aggregation | B/A | P2/P1 | low-mid | Zero-fallback for aggregation is standard but should exclude when BOTH null |

### SALES
Hotspots: `price ← current products.sale_price`.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/routes/stock/stockManage/salesTrend.ts:154-158,241-243` | historical `stock_history.supply_amount` | `sqty × current sale_price` | 매출 공식 | **A** | **P0** | **high** | Use historical row's recorded amount only |
| `server/routes/stock/stockManage/supplierPurchases.ts:155-158` | historical | `saleQty × current sale_price` | 공급사별 매출 | **A** | **P0** | **high** | Same |
| `server/routes/erp/salesStatsRouter.ts:607-611` | ERP real-time query | zero-fill on error | 월별 매출 KPI | **A** | **P0** | **high** | Return NULL/skip; UI already supports null |
| `server/routes/erp/salesStatsRouter.ts:574` | `row.buy_total ?? 0` etc on cached row | zero | past-month cache | A/B | P1 | mid | If cache row has NULL field, keep NULL (don't zero) |

### INVENTORY
Hotspots: `current_stock ← inventory_checks` reverse; stock_history mis-used.

Confirmed clean after 2026-10-05 user mandate (3-way separation: `products.current_stock` = ERP SSOT, `inventory_checks.*_stock` = WEB SSOT, `products.optimal_stock` = separate). No cross-table fallback found.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/components/StockManagePage/DiffTab.tsx:115` | row values | `p.current_stock ?? null` etc | diff view | B | P2 | low | OK (explicit null) |
| `server/routes/stock/stockManage/snapshotSummary.ts:59-62` | row | `?? 0` for SUM | aggregation | B/A | P1 | mid | Null rows should be excluded, not zero-folded |
| `server/routes/stock/stockManage/lowStock.ts:20-21` | `optimal_stock - current_stock` with `?? 0` | zero | sort key | B | P2 | low | OK (sort key only, not stored) |

### ORDER
Hotspots: fuzzy name matching in 발주매입 matching.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `server/routes/purchase/orderPurchaseMatch.ts:315,320` | exact product_code IN | — | 발주매입 match | — | — | low | GOOD — purely product_code exact match, no fuzzy fallback |
| `server/routes/purchase/orderPurchaseMatch.ts:297,320` | server-side canonical products map override | — | product_name on response | D | P2 | low | GOOD (snapshot stripped, canonical injected) |

### SCHEDULE
Hotspots: 근무유형 hardcode, 시급 미설정 → 0, 직군 미매핑 → "기타".

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/constants/index.ts:17-78` `DEFAULT_SCHEDULE_TYPES` | server `all_settings.scheduleTypes` | hardcoded 9 types | first-boot UI | G | P2 | low | OK — bootstrap only; `useSettings` fetches from server |
| `src/hooks/useSettings.ts:72-78` `DEFAULT_PHARMACIST_WAGE`, `DEFAULT_STAFF_WAGE` | server-stored wageRates | hardcoded 35,000/40,000 and 10,030/12,000 | 계약서 wage 자동계산 | G | P1 | mid | Bootstrap defaults OK; but used by `defaultWageForPosition()` → if admin forgets to set wageRates for a NEW position, this silently fills contract — surface as "default used" badge |
| `src/hooks/useSettings.ts:200-209` | server | localStorage ⇒ defaults | all settings | **A** (via useKvSetting pattern) | **P1** | mid | wageRates/employeeWageOverrides are financial; server-first discipline enforced in `fetchAllSettings`, but `loadFromLocalStorage` is used before server hydration — ensure callers guard on `settings` state having been fetched |
| `src/types.ts:104-129` DEFAULT_PERMISSIONS | server /api/permissions | wide-open defaults | all route guards | **A** | **P0** | **high** | Fix: fail-closed defaults (`{read:9, write:9}`) when fetch fails |

### RESERVATION
Hotspots: `assigned_employee_id` 없음 → 대표/이사 자동, rank/name identity.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/hooks/useSettings.ts:31-47` `VisitorReservationSettings` | DB `all_settings.visitorReservation.assigneeEmployeeIds` | empty array | reservation page | — | — | — | GOOD — 2026-10-06 migration explicitly removed hardcoded `rank === "대표"` lookup; now settings-driven |
| `src/components/ReservationPage/ReservationPage.tsx:3-7` | `settings.visitorReservation.assigneeEmployeeIds` | 0명 ⇒ "담당자 미설정" UX | reservation | E | P2 | low | GOOD (fail-closed) |
| `server/routes/daily/reservations.ts:68-73` | settings assignee IDs | 503 error if empty | reservation POST | E | P2 | low | GOOD (fail-closed with explicit RESERVATION_DISABLED code) |
| `server/routes/daily/reservations.ts:138` | computed snapshot | `employee_name_snapshot` written at insert | reservation row | C | P2 | low | OK — historical snapshot by design |

### NOTIFICATION
Hotspot: unread-count API 실패 → `notifications.length` fallback.

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/components/NotificationBell.tsx:86,127-128` | `/api/notifications/unread-count` | `notifications.filter(!read).length` (limit=30) | badge count | **A** | **P1** | mid | Documented bug; show "—" when server null instead of silent undercount |

### SETTINGS (localStorage · useSettings · wageRates · scheduleTypes · positions · reservation · locks · approval rules)

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/hooks/useSettings.ts:212-230` | server `all_settings` | `loadFromLocalStorage` → DEFAULT_SETTINGS | all app settings | **A** (if server down during edit) | **P1** | mid | Enforce `settings` from server; show "서버 미연결" during window where only local snapshot is loaded; block edits |
| `src/hooks/useKvSetting.ts:1-80` | server `/api/settings?key=` | localStorage cache + legacy keys | VAT 경비, 면세매출, 체크리스트, 계약서 직군 업무 | **A** | **P1** | mid | Split into `useKvUiSetting` vs `useKvBusinessSetting`; business must fail-stop |
| `src/hooks/useSettings.ts:80-90` DEFAULT_SETTINGS | server | hardcoded positions/ranks/employmentTypes/workplaces | first boot only | G | P2 | low | OK — bootstrap only; immediately overwritten after server fetch |

### AUTH / PERMISSION

| file:line | current primary | fallback | usage | class | priority | risk | recommended action |
|---|---|---|---|---|---|---|---|
| `src/hooks/usePagePermissions.ts:26-28` | server /api/permissions | DEFAULT_PERMISSIONS | all route guards | **A** | **P0** | **high** | Fail-closed |
| `src/lib/permissions.ts:8-16` `deriveUserLevel` | `session.level` | role→level map (`admin/superadmin`=9, `manager`=2, `employee`=1, else 0) | permission checks | B | P2 | low | OK — role is itself a canonical identity string |
| `server/middleware/requireAuth.ts:279` | `payload.level ?? 0` | 0 (deny) | route-level authorize | E | P1 | low | GOOD — fail-closed |
| `server/routes/schedule/schedules.ts:134,163,222` | `session.level ?? 0` | 0 | ownership check | E | P2 | low | GOOD |
| `server/lib/ownershipCheck.ts:32` | `session.level ?? 0` | 0 | admin check | E | P2 | low | GOOD |
| `src/App.tsx` session.rememberMe / lastActiveAt | server session | localStorage persistence | session UX | D | P2 | low | OK |

### Device capability

| file:line | current primary | fallback | usage | class |
|---|---|---|---|---|
| `src/lib/pushNotifications.ts` setAppBadge | native Badge API | web Notification API | notification badge | F |
| `src/components/BarcodeScanner/BarcodeScanner.tsx` | native camera | file picker | scan | F |
| `src/components/common/IosInstallGuide.tsx` | installed PWA | prompt UI | onboarding | F |

### Historical snapshots (expected)

| file:line | field | status |
|---|---|---|
| `server/routes/daily/reservations.ts:138` `employee_name_snapshot` | historical display | C — correct |
| `supabase/migrations/2026-10-06_reservations_assignee.sql` schema | snapshot column | C — correct |
| `server/routes/stock/salesTrend.ts` `period_end`, `period_type` | period snapshot | C — correct |

## Allowlist (what must remain)

**B (DISPLAY_ONLY_FALLBACK)** — all `?? "-"`, `?? "—"`, `?? "(이름없음)"`, `?? "미등록"` in JSX render paths across ~70 files. These are purely visual placeholders when DB value is NULL; no identity, finance, inventory, permission effect. Representative files:
- `src/components/common/ProductBasicInfoPanel.tsx`, `src/components/OrderManagePage/OrderRequestTab.tsx`, `src/components/ProductInfoPage/ProductInfoPage.tsx`, `src/components/OrderManagePage/PurchaseHistoryTab.panels.tsx`, `src/components/common/PurchaseHistoryList.tsx` (keep).

**C (HISTORICAL_SNAPSHOT)** — keep:
- `reservations.employee_name_snapshot` (POST time)
- `purchase_details.supplier_name` / `.product_name` on each historical row (data-at-time-of-insert; display only — never used as current canonical identity; the `purchase.ts:619,637` override to products.product_name correctly replaces the historical name for display with canonical).

**D (LAST_KNOWN_CANONICAL_CACHE)** — keep:
- `src/lib/productsCache.ts` (`lookupProduct`, `addCachedProduct`, `updateCachedProduct`) — browser mirror of /products.json; 60s TTL + `product-mutated` event invalidation. UI-only mirror; never written back.
- `server/productCache.ts` `productMapCache` / `productMapPromise` (30s TTL) — server in-process mirror; invalidated on mutation.
- `server/routes/erp/salesStatsRouter.ts` `erp_monthly_sales_cache` for **past** months (immutable after month-end) — correct architectural caching, not a fallback.

**E (FAIL_CLOSED_DEFAULT)** — keep and extend:
- All `session.level ?? 0` sites in `server/routes/**`, `server/middleware/requireAuth.ts:279`, `server/lib/ownershipCheck.ts:32`.
- `ReservationPage` 담당자 0명 ⇒ "담당자 미설정" explicit disabled UX.
- `server/routes/daily/reservations.ts:68-73` 503 `RESERVATION_DISABLED`.

**F (DEVICE_CAPABILITY)** — keep: Badge API, camera, PWA install, file previews, AudioContext chime.

**G (BOOTSTRAP_DEFAULT)** — keep:
- `src/constants/index.ts` DEFAULT_SCHEDULE_TYPES — overwritten by `useSettings` server fetch on mount.
- `src/hooks/useSettings.ts` DEFAULT_SETTINGS / DEFAULT_PHARMACIST_WAGE / DEFAULT_STAFF_WAGE / DEFAULT_ANNUAL_LEAVE / DEFAULT_VISITOR_RESERVATION — first-boot seed only.
- `apps/sync-agent/src/main/vendorSyncService.ts:88` dummy biz_no → NULL normalization.
- `src/types.ts:156` DEFAULT_COMPANY_INFO — first-run seed.

**H (TEST_ONLY)** — excluded from scan.

## UNCERTAIN

The following need user clarification before classification:

1. **`server/routes/purchase/purchase.ts:619,637`** — current code sets `product_name: info.product_name ?? null` which strips the historical snapshot and uses canonical products.product_name. The comment on L636-637 states this is the explicit canonical rule, but the behavior means a historical row whose underlying product is RENAMED will show the new name retroactively. This is a conscious user design decision (2026-10-06); flagged UNCERTAIN whether this is desired for all consumers (e.g., legal/tax reports typically want the as-sold name).

2. **`server/routes/stock/stockManage/supplierPurchases.ts:91-94`** — architecture comment says "매입 SSOT = purchase_details" but then uses `stock_history.sale_stock × current product price`. The user explicitly said 2026-10-01 the formula is `cogs = sale_stock × purchase_price` — unclear if the intent is "current purchase_price" or "purchase_price at history-row date". Needs confirmation; if the latter, requires schema change to snapshot price into stock_history (not a safe-fix-list item).

3. **`src/components/SalesTrendPage/DashboardCharts.tsx:123`** — `"기타"` as the pie bucket for suppliers missing a category: this collides with any legitimate `"기타"` category admins may define. Flagged UNCERTAIN because the display-only impact is low but it IS a semantic clash.

4. **`src/hooks/useKvSetting.ts`** — the localStorage fallback is documented ("오프라인/서버 다운 시 UX 지속"). For VAT-related keys the user prohibition on cache-as-authority may apply, but it's unclear whether the user considers VAT settings "business data" or "user prefs". Needs explicit user decision.

5. **`server/routes/purchase/supplierPayments/balance.ts:171-189`** — `products.purchase_price` NULL → `purchase_details` latest `unit_price` fallback. Per DB-EXACT-SOURCE-FIRST, products should be sole SSOT; per the comment "#119 사용자 지시 · null 상품 · purchase_details fallback 허용" this was an explicit prior user approval. Needs confirmation whether 2026-10-05 revised principle supersedes.
