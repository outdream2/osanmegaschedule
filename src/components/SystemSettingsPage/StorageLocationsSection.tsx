// src/components/SystemSettingsPage/StorageLocationsSection.tsx
// 2026-09-15 · T-SP-MASTER-UI · 매장·창고 마스터 관리 UI
//   · 관리자 (lv9) 전용 · GET·POST /api/settings/storage-locations
//   · 매장4·5 추가 등 · 위치 확장 가능
//   · required_detail=true · 저장 시 상세위치 (3자리) 필수 검증

import React, { useEffect, useState } from "react";
import { Plus, Trash2, Save, ArrowUp, ArrowDown, MapPin } from "lucide-react";
import { api } from "../../lib/apiClient";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { Spinner } from "../common/Spinner";
import { StatusPill } from "../common/StatusPill";
import { Button } from "../common/Button";
import { IconTile } from "../common/IconTile";
import { AccentBar } from "../common/AccentBar";
import { invalidateStorageLocationsCache } from "../../hooks/useStorageLocations";
import type { StorageLocation } from "../../shared/schemas/settings";

const CODE_REGEX = /^[a-z0-9_]{1,20}$/;

export const StorageLocationsSection: React.FC = () => {
  const [items, setItems] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<StorageLocation[]>("/api/settings/storage-locations");
      setItems(Array.isArray(data) ? data : []);
      setDirty(false);
    } catch (err: any) {
      showError(`로드 실패 · ${err?.message ?? "네트워크 오류"}`);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const patch = (idx: number, next: Partial<StorageLocation>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...next } : it));
    setDirty(true);
  };
  const move = (idx: number, dir: -1 | 1) => {
    setItems(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      // sort_order 재계산
      return next.map((it, i) => ({ ...it, sort_order: i + 1 }));
    });
    setDirty(true);
  };
  const add = () => {
    // 기본 · store · required · 다음 sort_order
    const nextSort = items.length + 1;
    const nextCode = `store${items.filter(i => i.kind === "store").length + 1}`;
    setItems(prev => [...prev, {
      code: nextCode,
      name: `매장${items.filter(i => i.kind === "store").length + 1}`,
      kind: "store",
      required_detail: true,
      sort_order: nextSort,
      active: true,
    }]);
    setDirty(true);
  };
  const remove = async (idx: number) => {
    const it = items[idx];
    const ok = await confirm({
      title: "삭제 확인",
      message: `${it.name} (${it.code}) · 삭제하시겠습니까?\n\n실제 재고 데이터는 · shelf_positions JSONB 에 이미 저장됨\n삭제 시 · UI 표시만 사라짐 (데이터 유지)`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = async () => {
    // 검증
    const codes = new Set<string>();
    for (const it of items) {
      if (!CODE_REGEX.test(it.code)) {
        showError(`코드 형식 오류 · ${it.code} · 소문자·숫자·_ · 1~20자`);
        return;
      }
      if (codes.has(it.code)) {
        showError(`코드 중복 · ${it.code}`);
        return;
      }
      codes.add(it.code);
      if (!it.name.trim()) {
        showError(`이름 미입력 · ${it.code}`);
        return;
      }
    }
    setSaving(true);
    try {
      await api.post("/api/settings/storage-locations", { locations: items });
      invalidateStorageLocationsCache();
      showSuccess(`저장 완료 · ${items.length}개 위치`);
      setDirty(false);
      // 다른 컴포넌트 · shelf_positions 리스트 재로드
      window.dispatchEvent(new CustomEvent("storage-locations-updated"));
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "저장 실패";
      showError(msg);
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner tone="brand" label="매장·창고 로딩 중..." labelSize={14} />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <IconTile icon={<MapPin size={18} />} tone="brand" size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <AccentBar />
            <h2 className="text-[18px] font-bold text-ink tracking-tight">매장·창고 마스터</h2>
            {dirty && <StatusPill tone="amber" size="sm">미저장</StatusPill>}
          </div>
          <p className="text-[13px] text-ink-soft mt-1">
            매장·창고 위치 관리 · 상품 상세위치 (3자리 층·칸·순서) 저장 시 참조
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={add}>
            <Plus size={14} className="mr-1" />위치 추가
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving || !dirty}>
            <Save size={14} className="mr-1" />
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-brand-tint/40 border border-brand-deep/15 rounded-lg p-3 text-[13px] text-brand-deep">
        <div className="font-bold mb-1">사용 방법</div>
        <ul className="list-disc list-inside space-y-0.5 text-ink-soft">
          <li><b>코드</b> · 시스템 식별자 (예 · store4 · warehouse3) · 소문자·숫자·언더스코어 · 변경 시 기존 데이터 매핑 재검토 필요</li>
          <li><b>이름</b> · 화면 표시 (예 · 매장4 · 창고3)</li>
          <li><b>종류</b> · 매장 (store · 상세위치 필수) · 창고 (warehouse · 상세위치 선택)</li>
          <li><b>상세필수</b> · 이 위치 · 재고 저장 시 · 3자리 층·칸·순서 강제 (매장 권장)</li>
          <li><b>순서</b> · 위·아래 화살표 · 리스트 표시 순서</li>
          <li><b>활성</b> · off · 신규 저장 불가 (기존 데이터 유지)</li>
        </ul>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-line overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-zinc-50 text-zinc-500 text-[12px] uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 w-10">순서</th>
              <th className="text-left px-3 py-2">코드</th>
              <th className="text-left px-3 py-2">이름</th>
              <th className="text-left px-3 py-2 w-32">종류</th>
              <th className="text-center px-3 py-2 w-24">상세필수</th>
              <th className="text-center px-3 py-2 w-20">활성</th>
              <th className="text-right px-3 py-2 w-32">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((it, idx) => (
              <tr key={`${it.code}_${idx}`} className={!it.active ? "bg-zinc-50/50" : ""}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 cursor-pointer">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                      className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 cursor-pointer">
                      <ArrowDown size={12} />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={it.code} onChange={(e) => patch(idx, { code: e.target.value })}
                    className="w-full px-2 py-1 border border-line rounded text-[13px] font-mono focus:border-brand-deep outline-none"
                    placeholder="store4"
                  />
                </td>
                <td className="px-3 py-2">
                  <input type="text" value={it.name} onChange={(e) => patch(idx, { name: e.target.value })}
                    className="w-full px-2 py-1 border border-line rounded text-[13px] focus:border-brand-deep outline-none"
                    placeholder="매장4"
                  />
                </td>
                <td className="px-3 py-2">
                  <select value={it.kind} onChange={(e) => patch(idx, { kind: e.target.value as "store" | "warehouse" })}
                    className="w-full px-2 py-1 border border-line rounded text-[13px] focus:border-brand-deep outline-none bg-white">
                    <option value="store">매장</option>
                    <option value="warehouse">창고</option>
                  </select>
                </td>
                <td className="text-center px-3 py-2">
                  <input type="checkbox" checked={it.required_detail}
                    onChange={(e) => patch(idx, { required_detail: e.target.checked })}
                    className="w-4 h-4 accent-brand-deep cursor-pointer"
                  />
                </td>
                <td className="text-center px-3 py-2">
                  <input type="checkbox" checked={it.active}
                    onChange={(e) => patch(idx, { active: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 cursor-pointer"
                  />
                </td>
                <td className="text-right px-3 py-2">
                  <button onClick={() => remove(idx)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[12px] text-rose-600 hover:bg-rose-50 border border-rose-200 rounded transition cursor-pointer">
                    <Trash2 size={12} />삭제
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-400 text-[14px]">위치 없음 · [위치 추가] 로 생성</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default StorageLocationsSection;
