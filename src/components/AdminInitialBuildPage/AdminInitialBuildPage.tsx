// src/components/AdminInitialBuildPage/AdminInitialBuildPage.tsx
// 2026-10-03 저녁 · Phase 2 · ERP Initial Data Build Preview (DRY-RUN ONLY)
//   · 관리자 lv≥9
//   · GET /api/admin/initial-build/preview · 실제 DB WRITE 없음
//   · "실행" 버튼 명시 lock · Phase 3 사용자 승인 후 활성화 예정
import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useToast, toastClass } from "../../hooks/useToast";
import { SectionCard } from "../common/SectionCard";
import { KpiCard } from "../common/KpiCard";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { Button } from "../common/Button";
import type { AuthSession } from "../../types";
import type { AppNavPage } from "../layout/AppNavHeader";
import {
  Database, ShieldCheck, Package, MapPin, CurrencyKrw, ShoppingCart,
  Warehouse, Shield, Warning, ListChecks, ArrowsClockwise, Lock,
} from "@phosphor-icons/react";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface DryRunPreview {
  generatedAt: string;
  dryRunOnly: true;
  snapshots: {
    productList: { path: string; rows: number; fetchedAt?: string } | null;
    buyStatus: { path: string; rows: number; fetchedAt?: string } | null;
  };
  erpConfig: { present: boolean; source: string };
  product: {
    erpCount: number; dbCount: number;
    matched: number; newInsert: number; dbOnly: number; conflict: number;
    protectedMutation: 0;
  };
  fieldLevel: Record<string, { same: number; change: number; db_empty_erp_has: number; erp_empty_db_has: number; both_empty: number }>;
  location: {
    autoApply: number; keep: number; review: number;
    reviewByFlag: { LOCATION_REVIEW_BEAUTY: number; LOCATION_REVIEW_FRIDGE: number; LOCATION_REVIEW_REAR_FRONT: number };
    erpMissingKeepDb: number;
    warehouseClassFlip: number;
  };
  price: {
    saleMatch: number; saleDbEmptyErpHas: number; saleDifferent: number; saleBothEmpty: number;
    purchaseMatch: number; purchaseDbEmptyErpHas: number; purchaseDifferent: number; purchaseBothEmpty: number;
    userDecisionRequired: number;
  };
  purchase: {
    buyStatusRows: number; mapped: number; unmapped: number;
    uniqueKey: string;
    migrationStatus: { bmCodeColumn: string; existingBmCodeRows: number; totalPurchaseRows: number };
  };
  protectedData: {
    productsFields: string[]; purchaseFields: string[];
    vendorsNote: string; inventoryChecksNote: string; stockHistoryNote: string;
  };
  criticalBlockers: string[];
  userDecisions: string[];
  readyForWrite: false;
}

export default function AdminInitialBuildPage(_props: Props): React.ReactElement {
  const { toast, show } = useToast();
  const [preview, setPreview] = useState<DryRunPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<DryRunPreview>("/api/admin/initial-build/preview");
      setPreview(data);
      setLastFetchedAt(new Date().toLocaleString("ko-KR"));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runDryRun();
  }, [runDryRun]);

  const criticalCount = preview?.criticalBlockers.length ?? 0;
  const canExecute = false; // 2026-10-03 Phase 2 · 명시 lock · 사용자 승인 전 활성화 금지

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">

        {/* 상단 헤더 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Database size={24} className="text-brand-deep" />
            <div>
              <h1 className="text-xl font-bold text-slate-900">ERP 초기 데이터 구축</h1>
              <p className="text-sm text-slate-500">DRY-RUN Preview · READ ONLY · 실제 DB WRITE 없음</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone="amber">DRY-RUN ONLY</StatusPill>
            <Button variant="secondary" onClick={runDryRun} disabled={loading}>
              <ArrowsClockwise size={16} />
              <span className="ml-1">{loading ? "분석 중..." : "DRY-RUN 재실행"}</span>
            </Button>
          </div>
        </div>

        {lastFetchedAt && (
          <p className="text-xs text-slate-400">최근 분석: {lastFetchedAt}{preview?.snapshots.productList?.fetchedAt ? ` · snapshot ${new Date(preview.snapshots.productList.fetchedAt).toLocaleString("ko-KR")}` : ""}</p>
        )}

        {error && (
          <SectionCard title="오류" icon={<Warning size={16} />} tone="danger">
            <div className="text-sm text-rose-700 whitespace-pre-wrap">{error}</div>
            <p className="text-xs text-slate-500 mt-2">
              Product_List snapshot 가 없거나 Supabase 조회 실패 가능성. sync-agent 로 Product_List 를 1회 조회해주세요.
            </p>
          </SectionCard>
        )}

        {loading && !preview && (
          <SectionCard title="분석 중" icon={<Spinner size={16} />}>
            <p className="text-sm text-slate-600">ERP snapshot + Supabase 비교 중...</p>
          </SectionCard>
        )}

        {preview && (
          <>
            {/* ERP 연결 상태 + Snapshot */}
            <SectionCard title="ERP 연결 상태" icon={<ShieldCheck size={16} />}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="text-sm">
                  <div className="text-slate-500">ERP 설정</div>
                  <div className="font-medium text-slate-900">
                    {preview.erpConfig.present ? "✓ 활성" : "✗ 설정 필요"} · <span className="text-xs text-slate-400">{preview.erpConfig.source}</span>
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Product_List snapshot</div>
                  <div className="font-medium text-slate-900">
                    {preview.snapshots.productList ? `${preview.snapshots.productList.rows.toLocaleString()} rows` : "없음"}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Buy_Status snapshot</div>
                  <div className="font-medium text-slate-900">
                    {preview.snapshots.buyStatus ? `${preview.snapshots.buyStatus.rows.toLocaleString()} rows` : "없음"}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Products KPI */}
            <SectionCard title="상품" icon={<Package size={16} />} description={`ERP ${preview.product.erpCount.toLocaleString()} · DB ${preview.product.dbCount.toLocaleString()}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KpiCard icon={<Package size={16} />} label="ERP MATCHED" value={preview.product.matched} unit="개" tone="emerald" hint="UPDATE 대상" />
                <KpiCard icon={<Package size={16} />} label="ERP NEW" value={preview.product.newInsert} unit="개" tone="sky" hint="INSERT 대상" />
                <KpiCard icon={<Package size={16} />} label="DB ONLY" value={preview.product.dbOnly} unit="개" tone="violet" hint="KEEP · 자동 DELETE 금지" />
                <KpiCard icon={<Warning size={16} />} label="BARCODE CONFLICT" value={preview.product.conflict} unit="개" tone={preview.product.conflict > 0 ? "rose" : "emerald"} hint={preview.product.conflict === 0 ? "✓ 완벽" : "blocker"} />
                <KpiCard icon={<Shield size={16} />} label="PROTECTED 변경" value={preview.product.protectedMutation} unit="개" tone="emerald" hint="반드시 0" />
              </div>
            </SectionCard>

            {/* Field-Level Diff */}
            <SectionCard title="Field 변경 집계 (ERP_MATCHED 상품)" icon={<ListChecks size={16} />}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">Field</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Same</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Change</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">DB Empty + ERP Has</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">ERP Empty + DB Has (KEEP)</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600">Both Empty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(preview.fieldLevel).map(([field, stats]) => (
                      <tr key={field} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">{field}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{stats.same.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium text-sky-700">{stats.change.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{stats.db_empty_erp_has.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{stats.erp_empty_db_has.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{stats.both_empty.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {/* Location */}
            <SectionCard title="진열위치" icon={<MapPin size={16} />} description="ERP 대분류+중분류 → display_location/location (ERP_DERIVED · 전각→반각 정규화)">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard icon={<MapPin size={16} />} label="Auto Apply (벽·매대)" value={preview.location.autoApply} unit="개" tone="emerald" />
                <KpiCard icon={<MapPin size={16} />} label="KEEP (ERP empty + DB has)" value={preview.location.erpMissingKeepDb} unit="개" tone="amber" hint="NULL overwrite 금지" />
                <KpiCard icon={<ListChecks size={16} />} label="REVIEW" value={preview.location.review} unit="개" tone="violet" hint="사용자 결정 대기" />
                <KpiCard icon={<Warehouse size={16} />} label="창고 class Flip" value={preview.location.warehouseClassFlip} unit="개" tone="sky" hint="shelf_positions 재배정" />
              </div>
              <div className="mt-3 text-xs text-slate-600 space-y-1">
                <div>REVIEW · 뷰티: <strong>{preview.location.reviewByFlag.LOCATION_REVIEW_BEAUTY}</strong></div>
                <div>REVIEW · 냉장고: <strong>{preview.location.reviewByFlag.LOCATION_REVIEW_FRIDGE}</strong></div>
                <div>REVIEW · 매대+뒤/앞: <strong>{preview.location.reviewByFlag.LOCATION_REVIEW_REAR_FRONT}</strong></div>
              </div>
            </SectionCard>

            {/* Price */}
            <SectionCard title="가격" icon={<CurrencyKrw size={16} />} description="sale_price ↔ PriceA · purchase_price ↔ CostPrice · DIFFERENT 는 USER DECISION">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard icon={<CurrencyKrw size={16} />} label="SALE Match" value={preview.price.saleMatch} unit="개" tone="emerald" />
                <KpiCard icon={<CurrencyKrw size={16} />} label="SALE DB Empty + ERP Has" value={preview.price.saleDbEmptyErpHas} unit="개" tone="sky" />
                <KpiCard icon={<CurrencyKrw size={16} />} label="SALE DIFFERENT" value={preview.price.saleDifferent} unit="개" tone="rose" hint="USER DECISION" />
                <KpiCard icon={<CurrencyKrw size={16} />} label="PURCHASE DIFFERENT" value={preview.price.purchaseDifferent} unit="개" tone="rose" hint="USER DECISION" />
              </div>
            </SectionCard>

            {/* Purchase */}
            <SectionCard title="매입 (Buy_Status)" icon={<ShoppingCart size={16} />} description={`unique key = ${preview.purchase.uniqueKey}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard icon={<ShoppingCart size={16} />} label="Buy_Status rows" value={preview.purchase.buyStatusRows} unit="개" tone="sky" />
                <KpiCard icon={<ShoppingCart size={16} />} label="Mapped (Barcode)" value={preview.purchase.mapped} unit="개" tone="emerald" />
                <KpiCard icon={<Warning size={16} />} label="Unmapped" value={preview.purchase.unmapped} unit="개" tone={preview.purchase.unmapped > 0 ? "amber" : "emerald"} />
                <KpiCard icon={<Database size={16} />} label="기존 purchase_details" value={preview.purchase.migrationStatus.totalPurchaseRows} unit="rows" tone="violet" hint="KEEP · 과거 분석 백본" />
              </div>
              <div className="mt-3 text-xs text-slate-600">
                <div>Migration (bm_code · row_num): <strong className={preview.purchase.migrationStatus.bmCodeColumn === "present" ? "text-emerald-700" : "text-rose-700"}>{preview.purchase.migrationStatus.bmCodeColumn}</strong></div>
                <div className="text-slate-400">migration SQL 파일: <code>supabase/migrations/future_phase2_bm_code_row_num.sql</code> (수동 승인 후 실행)</div>
              </div>
            </SectionCard>

            {/* Protected Data */}
            <SectionCard title="보호 데이터" icon={<Shield size={16} />} description="ERP sync 가 절대 overwrite 하지 않는 field/table">
              <div className="space-y-2 text-sm">
                <div>
                  <strong className="text-slate-700">products:</strong>{" "}
                  <span className="text-slate-500 font-mono text-xs">{preview.protectedData.productsFields.join(" · ")}</span>
                </div>
                <div>
                  <strong className="text-slate-700">purchase_details:</strong>{" "}
                  <span className="text-slate-500 font-mono text-xs">{preview.protectedData.purchaseFields.join(" · ")}</span>
                </div>
                <div><strong className="text-slate-700">vendors:</strong> <span className="text-slate-500 text-xs">{preview.protectedData.vendorsNote}</span></div>
                <div><strong className="text-slate-700">inventory_checks:</strong> <span className="text-slate-500 text-xs">{preview.protectedData.inventoryChecksNote}</span></div>
                <div><strong className="text-slate-700">stock_history:</strong> <span className="text-slate-500 text-xs">{preview.protectedData.stockHistoryNote}</span></div>
              </div>
            </SectionCard>

            {/* Critical Blockers */}
            <SectionCard title="Critical Blockers" icon={<Warning size={16} />} tone={criticalCount > 0 ? "danger" : "default"}>
              {criticalCount === 0 ? (
                <div className="text-sm text-emerald-700">✓ 0 blocker · 데이터 레벨 technical blocker 없음</div>
              ) : (
                <ul className="list-disc pl-5 space-y-1 text-sm text-rose-700">
                  {preview.criticalBlockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </SectionCard>

            {/* User Decisions */}
            <SectionCard title="사용자 결정 대기" icon={<ListChecks size={16} />}>
              {preview.userDecisions.length === 0 ? (
                <div className="text-sm text-slate-500">결정 대기 항목 없음</div>
              ) : (
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                  {preview.userDecisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </SectionCard>

            {/* 실행 버튼 (명시 lock) */}
            <SectionCard title="실행" icon={<Lock size={16} />} tone="info">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  <div className="font-medium">Phase 2 · DRY-RUN 전용 단계</div>
                  <div className="text-xs text-slate-500 mt-1">
                    실제 Initial Data Build WRITE 는 사용자 명시 승인 후 Phase 3 에서 활성화됩니다.
                    현재는 데이터를 변경하지 않습니다.
                  </div>
                </div>
                <Button variant="primary" disabled={!canExecute} onClick={() => show("Phase 2 DRY-RUN 전용 · 실제 실행은 Phase 3 에서.", 3000, "warn")}>
                  <Lock size={16} />
                  <span className="ml-1">Initial Build 실행 (잠김)</span>
                </Button>
              </div>
            </SectionCard>

            {/* Footer meta */}
            <div className="text-xs text-slate-400 text-center py-2">
              generatedAt: {preview.generatedAt} · dryRunOnly: {String(preview.dryRunOnly)} · readyForWrite: {String(preview.readyForWrite)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
