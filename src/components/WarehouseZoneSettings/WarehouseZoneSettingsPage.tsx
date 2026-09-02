// src/components/WarehouseZoneSettings/WarehouseZoneSettingsPage.tsx
// 2026-09-02 · #74 · 창고 구역 설정 (사용자 지시)
//   · zone_defs.warehouse 편집 · 창고1·창고2·미할당 3 컬럼
//   · 클릭 즉시 서버 저장 · 상품입고·실재고 페이지 자동 필터 반영

import React, { useMemo, useState } from "react";
import { Buildings, MapPin } from "@phosphor-icons/react";
import { Warehouse, Store, Check, MapPin as MapPinLucide } from "lucide-react";
import { Card } from "../common/Card";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { SettingsPageShell } from "../common/SettingsPageShell";
import { useZoneDefs } from "../../hooks/useZoneDefs";
import { useToast, toastClass } from "../../hooks/useToast";
import type { ZoneDefRaw } from "../../hooks/useZoneDefs";
import type { AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";

interface Props {
  onBack: () => void;
  authSession: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

type WarehouseKey = "창고1" | "창고2" | null;

const META = {
  창고1: { bg: "bg-cyan-600",  ring: "ring-cyan-300",  text: "text-cyan-700",  softBg: "bg-cyan-50",  label: "창고 1" },
  창고2: { bg: "bg-teal-600",  ring: "ring-teal-300",  text: "text-teal-700",  softBg: "bg-teal-50",  label: "창고 2" },
  un:    { bg: "bg-zinc-500", ring: "ring-zinc-300", text: "text-zinc-600", softBg: "bg-zinc-100", label: "미할당" },
} as const;

const WarehouseZoneSettingsPage: React.FC<Props> = ({ onBack, authSession, onNavigate, onLogout }) => {
  const zd = useZoneDefs() as any;
  const zonesRaw: ZoneDefRaw[] = zd.zonesRaw ?? [];
  const { loading, error, updateZoneRaw, saveState } = zd;
  const { toast, showSuccess, showError } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const w1: ZoneDefRaw[] = [];
    const w2: ZoneDefRaw[] = [];
    const un: ZoneDefRaw[] = [];
    for (const z of zonesRaw) {
      if (!z.location) continue;
      if (z.warehouse === "창고1") w1.push(z);
      else if (z.warehouse === "창고2") w2.push(z);
      else un.push(z);
    }
    const sortByLoc = (a: ZoneDefRaw, b: ZoneDefRaw) => String(a.location).localeCompare(String(b.location), "ko", { numeric: true });
    return { w1: w1.sort(sortByLoc), w2: w2.sort(sortByLoc), un: un.sort(sortByLoc) };
  }, [zonesRaw]);

  const handleAssign = async (row: ZoneDefRaw, target: WarehouseKey) => {
    if (row.warehouse === target) return;
    setBusyId(row.id);
    try {
      const ok = await updateZoneRaw(row.id, { warehouse: target });
      if (ok) showSuccess(`${row.location} → ${target ?? "미할당"} 저장`);
      else showError("저장 실패");
    } catch (e: any) {
      showError(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setBusyId(null);
    }
  };

  const rightSlot = saveState === "saving" ? (
    <span className="inline-flex items-center gap-1.5 text-[14px] text-brand-deep">
      <Spinner size={12} tone="brand" /> 저장 중
    </span>
  ) : saveState === "saved" ? (
    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-emerald-600">
      <Check size={13} strokeWidth={3} /> 저장됨
    </span>
  ) : null;

  return (
    <SettingsPageShell
      activePage="warehouse-zones"
      authSession={authSession}
      onBack={onBack}
      onNavigate={onNavigate}
      onLogout={onLogout}
      icon={Buildings}
      title="창고 구역"
      description="구역을 창고1·창고2로 지정 · 상품입고·실재고 페이지 자동 필터 반영"
      rightSlot={rightSlot}
    >
      {/* 안내 */}
      <Card padding="md" topAccent className="mb-4">
        <div className="text-[15px] text-zinc-700 leading-relaxed">
          <span className="font-bold">사용법 </span>· 각 zone (구역) 을 <b className="text-cyan-700">창고1</b> 또는 <b className="text-teal-700">창고2</b> 로 지정하세요.
          <br />
          · 클릭 즉시 자동 저장 · 실재고 바코드 스캔 · 상품입고 바코드 스캔 UI 에서 즉시 창고 자동 필터.
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size={18} tone="brand" label="구역 로드 중..." labelSize={15} />
        </div>
      ) : error ? (
        <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="md" className="text-[15px] text-rose-700">
          ⚠ {error}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Column title="창고 1" targetKey="창고1" zones={grouped.w1} busyId={busyId} onAssign={handleAssign} meta={META["창고1"]} />
          <Column title="창고 2" targetKey="창고2" zones={grouped.w2} busyId={busyId} onAssign={handleAssign} meta={META["창고2"]} />
          <Column title="미할당" targetKey={null} zones={grouped.un} busyId={busyId} onAssign={handleAssign} meta={META.un} />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10002] pointer-events-none">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
    </SettingsPageShell>
  );
};

interface ColProps {
  title: string;
  targetKey: WarehouseKey;
  zones: ZoneDefRaw[];
  busyId: number | null;
  onAssign: (row: ZoneDefRaw, target: WarehouseKey) => void;
  meta: typeof META[keyof typeof META];
}

const Column: React.FC<ColProps> = ({ title, targetKey, zones, busyId, onAssign, meta }) => {
  return (
    <Card padding="md" topAccent className="flex flex-col">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-100">
        <span className={`w-8 h-8 rounded-lg text-white flex items-center justify-center ${meta.bg} shadow-sm`}>
          {targetKey ? <Warehouse size={18} /> : <MapPin size={18} />}
        </span>
        <div className="text-[18px] font-bold text-ink">{title}</div>
        <StatusPill tone="zinc">{`${zones.length}개`}</StatusPill>
      </div>
      {zones.length === 0 ? (
        <EmptyState
          icon={targetKey ? Warehouse : MapPinLucide}
          title={targetKey ? "지정된 구역 없음" : "미할당 구역 없음"}
          hint={targetKey ? "다른 열에서 구역을 옮겨오세요" : ""}
          size="normal"
        />
      ) : (
        <ul className="space-y-1.5 overflow-y-auto max-h-[560px]">
          {zones.map(z => (
            <li key={z.id} className={`rounded-xl border ${meta.softBg} border-line px-3 py-2 flex items-center gap-2`}>
              <span className={`inline-flex items-center font-mono font-bold ${meta.text} text-[15px] shrink-0 min-w-[3rem]`}>
                {z.location}
              </span>
              <span className="text-[14px] text-zinc-600 truncate flex-1 min-w-0" title={z.zone ?? ""}>
                {z.zone ?? "-"}
              </span>
              {z.category && (
                <span className="text-[13px] text-zinc-400 truncate max-w-[140px]" title={z.category}>{z.category}</span>
              )}
              <span className="ml-auto flex items-center gap-1 shrink-0">
                {busyId === z.id ? (
                  <Spinner size={11} tone="brand" />
                ) : (
                  (["창고1", "창고2", null] as WarehouseKey[]).filter(k => k !== targetKey).map(k => (
                    <button
                      key={String(k)}
                      type="button"
                      onClick={() => onAssign(z, k)}
                      className={`inline-flex items-center h-7 px-2 rounded-md text-[13px] font-semibold cursor-pointer border transition ${
                        k === "창고1" ? "border-cyan-300 text-cyan-700 hover:bg-cyan-100" :
                        k === "창고2" ? "border-teal-300 text-teal-700 hover:bg-teal-100" :
                        "border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                      }`}
                      title={`${z.location} → ${k ?? "미할당"} 이동`}
                    >
                      {k === "창고1" ? <><Warehouse size={11} className="mr-0.5" /> 창1</> :
                       k === "창고2" ? <><Warehouse size={11} className="mr-0.5" /> 창2</> :
                       <><Store size={11} className="mr-0.5" /> 미할당</>}
                    </button>
                  ))
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default WarehouseZoneSettingsPage;
