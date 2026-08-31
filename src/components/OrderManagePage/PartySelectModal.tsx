// src/components/OrderManagePage/PartySelectModal.tsx
// 2026-08-31 · #9 차용등록 재설계 Phase C · 당사자 선택 모달
//
//   · BorrowingPartyCard 클릭 시 오픈 · 검색 자동완성 + 신규 등록 인라인 폼
//   · Modal 프리미티브 (size="lg-narrow", align="center")
//   · borrowingsApi.searchParties / createParty 호출
//   · onSelect(party) 콜백으로 선택 결과 전달
//
//   대원칙:
//     1. 프레임워크 프리미티브 우선 (Modal · SearchBar · Spinner · InlineLabel)
//     2. 회귀 절대 X · 신규 파일 · 원본 무영향
//     3. 폰트 +2 · 말줄임표 금지
//     4. try/catch + prefix 로그 + toast 에러 표시
//     5. iOS 코드 무수정

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { UserPlus, Users, Building2, Store, Check, Plus, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { SearchBar } from "../common/SearchBar";
import { Spinner } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { StatusPill } from "../common/StatusPill";
import { SegmentedControl, type SegmentedOption } from "../common/SegmentedControl";
import {
  searchParties,
  createParty,
  type BorrowingParty,
  type CreatePartyInput,
} from "../../lib/borrowingsApi";
import { useToast, toastClass } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";

// ═══════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════

export interface PartySelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (party: BorrowingParty) => void;
  /** 대여자/차용자 롤 · 모달 헤더·톤 힌트 (실제 로직엔 영향 X) */
  role?: "lender" | "borrower";
  /** 초기 필터 (party_type · 미지정 시 전체) */
  initialType?: BorrowingParty["party_type"] | "all";
}

// party_type 필터
type TypeFilter = "all" | "self" | "vendor" | "external";

const TYPE_OPTIONS: SegmentedOption<TypeFilter>[] = [
  { value: "all",      label: "전체" },
  { value: "self",     label: "약국",   tone: "sky" },
  { value: "vendor",   label: "공급사", tone: "violet" },
  { value: "external", label: "외부",   tone: "amber" },
];

const TYPE_ICON: Record<BorrowingParty["party_type"], React.ComponentType<{ size?: number; className?: string }>> = {
  self:     Store,
  vendor:   Building2,
  external: Users,
};

const TYPE_LABEL: Record<BorrowingParty["party_type"], string> = {
  self:     "약국",
  vendor:   "공급사",
  external: "외부",
};

// ═══════════════════════════════════════════════════════
// 신규 등록 인라인 폼 상태
// ═══════════════════════════════════════════════════════

interface NewFormState {
  party_type: BorrowingParty["party_type"];
  name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  memo: string;
}

const EMPTY_NEW: NewFormState = {
  party_type: "external",
  name: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
  memo: "",
};

// ═══════════════════════════════════════════════════════
// 모달 본체
// ═══════════════════════════════════════════════════════

export const PartySelectModal: React.FC<PartySelectModalProps> = ({
  open, onClose, onSelect, role = "lender", initialType = "all",
}) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [rows, setRows] = useState<BorrowingParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 신규 등록 폼 상태
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<NewFormState>(EMPTY_NEW);
  const [saving, setSaving] = useState(false);

  const { toast, showError, showSuccess } = useToast();

  // ── 검색 · debounce 250ms · searchParties(q) ──────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const q = search.trim();
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchParties(q || undefined)
        .then((rs) => { if (!cancelled) setRows(rs); })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
          setError(msg);
          console.error("[PartySelectModal] searchParties 실패:", msg);
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, search]);

  // ── 모달 닫기 시 상태 초기화 ────────────────────────────
  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowNewForm(false);
      setNewForm(EMPTY_NEW);
      setError(null);
    } else {
      setTypeFilter(initialType);
    }
  }, [open, initialType]);

  // ── party_type 필터 (클라이언트 사이드) ────────────────
  const filtered = useMemo(() => {
    if (typeFilter === "all") return rows;
    return rows.filter((p) => p.party_type === typeFilter);
  }, [rows, typeFilter]);

  // ── 선택 핸들러 ──────────────────────────────────────
  const handleSelect = useCallback((party: BorrowingParty) => {
    onSelect(party);
    onClose();
  }, [onSelect, onClose]);

  // ── 신규 등록 submit ────────────────────────────────
  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newForm.name.trim();
    if (!name) { showError("이름을 입력하세요"); return; }
    setSaving(true);
    try {
      const input: CreatePartyInput = {
        party_type: newForm.party_type,
        name,
        contact_name:  newForm.contact_name.trim()  || null,
        contact_phone: newForm.contact_phone.trim() || null,
        contact_email: newForm.contact_email.trim() || null,
        memo:          newForm.memo.trim()          || null,
      };
      const created = await createParty(input);
      showSuccess(`당사자 등록 완료 · ${created.name}`);
      handleSelect(created);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : (e as { message?: string })?.message ?? "네트워크 오류";
      showError(`등록 실패: ${msg}`);
      console.error("[PartySelectModal] createParty 실패:", msg);
    } finally {
      setSaving(false);
    }
  }, [newForm, showError, showSuccess, handleSelect]);

  const inputCls = "w-full h-9 px-2.5 rounded-lg border border-line bg-white text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition";
  const labelCls = "text-[13px] font-bold text-ink-soft";
  const roleLabel = role === "lender" ? "대여자" : "차용자";

  const setNew = <K extends keyof NewFormState>(k: K, v: NewFormState[K]) =>
    setNewForm((prev) => ({ ...prev, [k]: v }));

  return (
    <>
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[10001] ${toastClass(toast.tone)}`}>{toast.message}</div>
      )}
      <Modal
        open={open}
        onClose={onClose}
        size="lg-narrow"
        icon={<Users size={18} />}
        title={`${roleLabel} 선택`}
        titleAccent
        headerRight={
          <StatusPill tone={role === "lender" ? "violet" : "emerald"} size="xs">
            {roleLabel}
          </StatusPill>
        }
        bodyPadding="none"
      >
        <div className="flex flex-col gap-3 p-4">
          {/* 검색 + 필터 */}
          {!showNewForm && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <SearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="이름 · 담당자 · 연락처 검색"
                  widthClass="flex-1 min-w-[200px]"
                  resultCount={filtered.length}
                  resultUnit="명"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] hover:from-[#0d3a5c] hover:to-[#08253a] shadow-sm ring-1 ring-brand-deep/30 cursor-pointer transition"
                >
                  <UserPlus size={14} />
                  신규 등록
                </button>
              </div>
              <SegmentedControl<TypeFilter>
                value={typeFilter}
                onChange={setTypeFilter}
                options={TYPE_OPTIONS}
                size="sm"
                variant="pills"
                ariaLabel="당사자 유형 필터"
              />

              {/* 리스트 */}
              <div className="min-h-[240px] max-h-[420px] overflow-y-auto rounded-lg border border-line bg-zinc-50/50 p-1.5">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size={14} tone="brand" label="검색 중..." labelSize={13} />
                  </div>
                ) : error ? (
                  <EmptyState
                    icon={X}
                    title="검색 실패"
                    hint={error}
                    size="normal"
                  />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title={search ? "검색 결과 없음" : "등록된 당사자 없음"}
                    hint={search ? "다른 검색어로 시도하거나 · [신규 등록] 을 눌러 추가하세요" : "우측 상단 [신규 등록] 으로 첫 당사자를 만드세요"}
                    size="normal"
                  />
                ) : (
                  <ul className="flex flex-col gap-1">
                    {filtered.map((p) => {
                      const Icon = TYPE_ICON[p.party_type];
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect(p)}
                            className="w-full flex items-start gap-3 p-2.5 rounded-lg bg-white border border-line hover:border-brand-deep hover:bg-brand-tint/40 cursor-pointer transition text-left"
                          >
                            <div className="shrink-0 w-9 h-9 rounded-lg bg-zinc-100 text-ink-soft flex items-center justify-center">
                              <Icon size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[15px] font-bold text-ink tracking-tight break-keep">{p.name}</span>
                                <StatusPill tone={p.party_type === "vendor" ? "violet" : p.party_type === "self" ? "sky" : "amber"} size="xs">
                                  {TYPE_LABEL[p.party_type]}
                                </StatusPill>
                              </div>
                              {(p.contact_name || p.contact_phone) && (
                                <div className="text-[12px] text-ink-soft mt-0.5 break-keep">
                                  {p.contact_name && <span>{p.contact_name}</span>}
                                  {p.contact_name && p.contact_phone && <span className="mx-1">·</span>}
                                  {p.contact_phone && <span className="tabular-nums">{p.contact_phone}</span>}
                                </div>
                              )}
                            </div>
                            <Check size={14} className="shrink-0 text-transparent group-hover:text-brand-deep mt-2" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}

          {/* 신규 등록 인라인 폼 */}
          {showNewForm && (
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-line">
                <Plus size={16} className="text-brand-deep" />
                <span className="text-[15px] font-bold text-ink tracking-tight">신규 당사자 등록</span>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  disabled={saving}
                  className="ml-auto text-[13px] text-ink-soft hover:text-brand-deep cursor-pointer disabled:opacity-40"
                >
                  ← 목록으로
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <span className={labelCls}>유형 *</span>
                <SegmentedControl<BorrowingParty["party_type"]>
                  value={newForm.party_type}
                  onChange={(v) => setNew("party_type", v)}
                  options={[
                    { value: "self",     label: "약국",   tone: "sky" },
                    { value: "vendor",   label: "공급사", tone: "violet" },
                    { value: "external", label: "외부",   tone: "amber" },
                  ]}
                  size="sm"
                  variant="pills"
                  ariaLabel="당사자 유형"
                />
              </div>

              <label className="flex flex-col gap-1">
                <span className={labelCls}>이름 <span className="text-rose-600">*</span></span>
                <input
                  type="text"
                  value={newForm.name}
                  onChange={(e) => setNew("name", e.target.value)}
                  className={inputCls}
                  placeholder="예: 홍길동 약국 · 코스트팜"
                  required
                  autoFocus
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>담당자</span>
                  <input
                    type="text"
                    value={newForm.contact_name}
                    onChange={(e) => setNew("contact_name", e.target.value)}
                    className={inputCls}
                    placeholder="(선택)"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>연락처</span>
                  <input
                    type="tel"
                    value={newForm.contact_phone}
                    onChange={(e) => setNew("contact_phone", e.target.value)}
                    className={inputCls + " tabular-nums"}
                    placeholder="010-0000-0000"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className={labelCls}>이메일</span>
                <input
                  type="email"
                  value={newForm.contact_email}
                  onChange={(e) => setNew("contact_email", e.target.value)}
                  className={inputCls}
                  placeholder="(선택)"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelCls}>메모</span>
                <textarea
                  value={newForm.memo}
                  onChange={(e) => setNew("memo", e.target.value)}
                  rows={2}
                  className="w-full px-2.5 py-2 rounded-lg border border-line bg-white text-[15px] text-ink placeholder:text-zinc-400 focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint transition resize-y"
                  placeholder="(선택)"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  disabled={saving}
                  className="h-9 px-4 rounded-lg text-[14px] font-semibold text-ink-soft bg-white border border-line hover:bg-zinc-50 disabled:opacity-40 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving || !newForm.name.trim()}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[14px] font-bold text-white bg-gradient-to-br from-brand-deep to-[#0d3a5c] hover:from-[#0d3a5c] hover:to-[#08253a] shadow-sm ring-1 ring-brand-deep/30 disabled:opacity-40 cursor-pointer"
                >
                  {saving ? <Spinner size={13} tone="white" /> : <Plus size={13} />}
                  {saving ? "저장 중..." : "등록 · 선택"}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  );
};

export default PartySelectModal;
