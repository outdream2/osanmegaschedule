// src/components/MyPage/MyPage.tsx
// 2026-08-16 · apiClient 마이그레이션
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/apiClient";
import { User, Phone, Briefcase, Calendar, Award, Save, Lock, MapPin, Eye, EyeOff, Check, Mail, IdCard, CreditCard, ScanBarcode } from "lucide-react";
// 2026-08-23 · #197 · 스캔 미분류 처리 방식 · 개인 preference
import { useScanUnregisteredMode } from "../../hooks/useScanUnregisteredMode";
import { Spinner } from "../common/Spinner";
import { Card } from "../common/Card";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession, Employee } from "../../types";
import { updateEmployee } from "../../lib/employeeApi";
import { AddressSearchModal } from "../common/features/AddressSearchModal";
import { useToast, toastClass } from "../../hooks/useToast";

interface MyPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: AppNavPage) => void;
  onLogout: () => void;
}

export const MyPage: React.FC<MyPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [me, setMe] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  // 2026-08-16 · 프레임워크 useToast 사용 · manual setToast 제거
  const { toast, show: showToast, showError } = useToast(2000);
  // 2026-08-23 · #197 · 스캔 미분류 처리 방식 (개인 preference)
  const { mode: scanUnregisteredMode, setMode: setScanUnregisteredMode } = useScanUnregisteredMode();

  const loadMe = useCallback(async () => {
    if (!authSession?.employeeId) return;
    setLoading(true);
    try {
      const now = new Date();
      const { data } = await api.get<any>(`/api/schedules?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      const list: Employee[] = Array.isArray(data?.employees) ? data.employees : Array.isArray(data) ? data : [];
      const found = list.find(e => e.id === authSession.employeeId) ?? null;
      setMe(found);
    } finally {
      setLoading(false);
    }
  }, [authSession?.employeeId]);

  useEffect(() => { loadMe(); }, [loadMe]);

  // ─────────── 주소 편집 ───────────
  const [addressDraft, setAddressDraft] = useState<string>("");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addrModalOpen, setAddrModalOpen] = useState(false); // 2026-08-16 · Daum 우편번호 검색
  useEffect(() => { if (me) setAddressDraft(me.address ?? ""); }, [me]);

  const saveAddress = async () => {
    if (!me) return;
    setSavingAddress(true);
    try {
      await updateEmployee(me, {
        level: authSession?.level ?? null,
        address: addressDraft.trim() || null,
      });
      await loadMe();
      showToast("주소가 저장되었습니다");
    } catch (e: any) {
      showToast(`저장 실패: ${e?.message ?? e}`, 3000);
    } finally {
      setSavingAddress(false);
    }
  };

  // ─────────── 비밀번호 변경 ───────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const changePassword = async () => {
    if (!me || !authSession?.employeeId) return;
    if (!currentPw || !newPw) { showToast("현재/새 비밀번호를 입력하세요", 2500); return; }
    if (newPw.length < 4) { showToast("새 비밀번호는 4자 이상", 2500); return; }
    if (newPw !== confirmPw) { showToast("새 비밀번호 확인이 일치하지 않습니다", 2500); return; }
    if (currentPw === newPw) { showToast("새 비밀번호가 현재와 동일합니다", 2500); return; }
    setSavingPw(true);
    try {
      await api.post("/api/auth/change-password", {
        employeeId: authSession.employeeId,
        currentPassword: currentPw,
        newPassword: newPw,
      });
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      showToast("비밀번호가 변경되었습니다");
    } catch (e: any) {
      showToast(e?.message ?? "비밀번호 변경 실패", 3000);
    } finally {
      setSavingPw(false);
    }
  };

  const addressChanged = (me?.address ?? "") !== addressDraft;

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA]">
      <AppNavHeader activePage={"mypage" as AppNavPage} authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-3">
        {/* 2026-08-17 · 프로필 헤더 v2 · 성씨 initial 제거 (사용자 요청) · User 아이콘 + gradient · 세련 */}
        <div className="bg-white rounded-xl shadow-sm border border-line p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-white/25 shadow-[0_4px_16px_rgba(10,46,74,0.25)]"
              style={{ background: "linear-gradient(135deg, #0A2E4A 0%, #1E5C8E 100%)" }}
            >
              <User size={26} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-brand-deep uppercase tracking-wider">마이페이지</div>
              <div className="text-lg sm:text-xl font-bold text-zinc-800 mt-0.5 truncate">
                {me?.name ?? authSession?.employeeName ?? "-"}
                {me?.rank && <span className="text-sm text-zinc-500 font-bold ml-1">{me.rank}</span>}
              </div>
              <div className="text-[15px] text-zinc-500 mt-0.5">
                {me?.position ?? "-"} · {me?.employmentType ?? "-"} · Level {authSession?.level ?? "-"}
              </div>
            </div>
          </div>
        </div>

        {/* 정보 카드 (읽기 전용) */}
        <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-100 bg-zinc-50/60 text-[14px] font-bold text-zinc-500 uppercase tracking-wider">
            내 정보 (읽기 전용)
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Spinner size={24} tone="brand" /></div>
          ) : !me ? (
            <div className="p-6 text-center text-sm text-zinc-500">직원 정보를 불러올 수 없습니다.</div>
          ) : (
            <>
              <ReadRow icon={<User size={14} />} label="이름" value={me.name} />
              <ReadRow icon={<IdCard size={14} />} label="사원번호" value={(me as any).employee_number ?? "-"} mono />
              <ReadRow icon={<Award size={14} />} label="직급" value={me.rank ?? "-"} />
              <ReadRow icon={<Briefcase size={14} />} label="구분" value={me.position} />
              <ReadRow icon={<Briefcase size={14} />} label="고용형태" value={me.employmentType} />
              <ReadRow icon={<Briefcase size={14} />} label="근무지" value={me.workplace} />
              <ReadRow icon={<Calendar size={14} />} label="입사일" value={me.hireDate} mono />
              <ReadRow icon={<User size={14} />} label="성별" value={me.gender ?? "-"} />
              <ReadRow icon={<Calendar size={14} />} label="생년월일" value={(me as any).birthDate ?? "-"} mono />
              <ReadRow icon={<Phone size={14} />} label="핸드폰번호" value={me.phone ?? "-"} mono />
              <ReadRow icon={<Mail size={14} />} label="이메일" value={(me as any).email ?? "-"} />
              <ReadRow icon={<CreditCard size={14} />} label="계좌" value={(me as any).employeeBankAccount ?? "-"} mono />
              <ReadRow icon={<Calendar size={14} />} label="연차일수" value={`${me.annual_leave_days ?? "-"}일`} mono last />
            </>
          )}
        </div>

        {/* 주소 편집 카드 */}
        <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-100 bg-indigo-50/60 text-[14px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} /> 주소
          </div>
          <div className="p-4 flex flex-col gap-2">
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={addressDraft}
                onChange={e => setAddressDraft(e.target.value)}
                placeholder="예: 경기도 오산시 …"
                className="flex-1 min-w-0 px-3 py-2 text-[15px] border border-zinc-300 rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
              />
              <button
                type="button"
                onClick={() => setAddrModalOpen(true)}
                className="shrink-0 h-9 px-2.5 rounded-lg border border-indigo-400 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[15px] font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                주소 검색
              </button>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={saveAddress}
                disabled={savingAddress || !addressChanged}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white text-[14px] font-bold shadow-sm active:scale-95 transition disabled:opacity-40"
              >
                {savingAddress ? <Spinner size={12} tone="white" /> : <Save size={12} />} 주소 저장
              </button>
            </div>
          </div>
        </div>
        <AddressSearchModal
          open={addrModalOpen}
          onClose={() => setAddrModalOpen(false)}
          onSelect={(data) => setAddressDraft(data.formatted)}
        />

        {/* 비밀번호 변경 카드 */}
        <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
          <div className="px-4 py-2 border-b border-zinc-100 bg-rose-50/60 text-[14px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
            <Lock size={12} /> 비밀번호 변경
          </div>
          <div className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="현재 비밀번호"
                className="flex-1 px-3 py-2 text-[15px] border border-zinc-300 rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="w-9 h-9 rounded-lg bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center text-zinc-500"
                title={showPw ? "숨김" : "표시"}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <input
              type={showPw ? "text" : "password"}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="새 비밀번호 (4자 이상)"
              className="w-full px-3 py-2 text-[15px] border border-zinc-300 rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
              autoComplete="new-password"
            />
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="w-full px-3 py-2 text-[15px] border border-zinc-300 rounded-xl focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint"
              autoComplete="new-password"
            />
            <div className="flex items-center justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={changePassword}
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[14px] font-bold shadow-sm active:scale-95 transition disabled:opacity-40"
              >
                {savingPw ? <Spinner size={12} tone="white" /> : <Lock size={12} />} 비밀번호 변경
              </button>
            </div>
          </div>
        </div>

        {/* 계절 정의 · 2026-08-12 · [설정] > 계절 정의 로 이동 · MyPage 에서 제거 */}

        {/* 2026-08-23 · #197 · 스캔 미분류 상품 처리 방식 (개인 preference) */}
        <Card variant="raw-sm" padding="md" topAccent className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ScanBarcode size={16} className="text-brand-deep" />
            <h3 className="text-[16px] font-bold text-ink tracking-tight">스캔 미분류 상품 · 처리 방식</h3>
          </div>
          <p className="text-[14px] text-ink-soft leading-relaxed">
            바코드 스캔 · 등록되지 않은 상품 감지 시 · 처리 방식을 선택합니다.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScanUnregisteredMode("modal")}
              className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition ${
                scanUnregisteredMode === "modal"
                  ? "bg-brand-tint border-brand-deep text-brand-deep"
                  : "bg-white border-line text-ink-soft hover:brightness-95"
              }`}
              aria-pressed={scanUnregisteredMode === "modal"}
            >
              모달 (즉시 등록)
            </button>
            <button
              type="button"
              onClick={() => setScanUnregisteredMode("page")}
              className={`px-3 py-1.5 rounded-lg text-[14px] font-semibold border cursor-pointer transition ${
                scanUnregisteredMode === "page"
                  ? "bg-brand-tint border-brand-deep text-brand-deep"
                  : "bg-white border-line text-ink-soft hover:brightness-95"
              }`}
              aria-pressed={scanUnregisteredMode === "page"}
            >
              페이지 이동 (상품정보로)
            </button>
          </div>
        </Card>

        {/* 안내 */}
        <Card variant="flat" padding="sm" bg="bg-white/60" className="text-[15px] text-zinc-500 flex items-start gap-2">
          <Check size={12} className="mt-0.5 text-emerald-500 shrink-0" />
          <span>본인이 직접 수정할 수 있는 항목은 <b>비밀번호·주소</b>뿐입니다. 그 외 정보(이름·직급·연차 등) 는 관리자에게 문의하세요.</span>
        </Card>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`${toastClass(toast.tone)} shadow-lg`}>{toast.message}</div>
        </div>
      )}
    </div>
  );
};

const ReadRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean; last?: boolean }> = ({ icon, label, value, mono, last }) => (
  <div className={`grid grid-cols-[110px_1fr] items-center gap-2 sm:gap-4 px-4 py-2.5 ${last ? "" : "border-b border-zinc-100"}`}>
    <div className="flex items-center gap-1.5 text-[15px] font-bold text-zinc-500 uppercase tracking-wider">
      <span className="text-zinc-400">{icon}</span> {label}
    </div>
    {/* 2026-08-29 · UI 감사 U1/U2 · truncate 제거 + font-mono → tabular-nums (Pretendard 통일) */}
    <div className={`text-[15px] font-bold text-zinc-800 break-words whitespace-normal ${mono ? "tabular-nums" : ""}`}>{value || "-"}</div>
  </div>
);

export default MyPage;
