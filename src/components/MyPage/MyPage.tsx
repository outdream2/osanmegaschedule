// src/components/MyPage/MyPage.tsx
import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { User, Phone, Briefcase, Calendar, Award, Save, Loader2, Lock, MapPin, Eye, EyeOff, Check } from "lucide-react";
import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession, Employee } from "../../types";
import { SeasonRangesEditor } from "./SeasonRangesEditor";

interface MyPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate: (page: AppNavPage) => void;
  onLogout: () => void;
}

export const MyPage: React.FC<MyPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [me, setMe] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string, ms = 2000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const loadMe = useCallback(async () => {
    if (!authSession?.employeeId) return;
    setLoading(true);
    try {
      const now = new Date();
      const res = await axios.get(`/api/schedules?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
      const list: Employee[] = Array.isArray(res.data?.employees) ? res.data.employees : Array.isArray(res.data) ? res.data : [];
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
  useEffect(() => { if (me) setAddressDraft(me.address ?? ""); }, [me]);

  const saveAddress = async () => {
    if (!me) return;
    setSavingAddress(true);
    try {
      // PUT /api/employees/:id 는 전체 필드를 요구하므로 현재 값을 기반으로 address 만 갱신
      const payload = {
        name: me.name,
        position: me.position,
        employmentType: me.employmentType,
        hireDate: me.hireDate,
        retireDate: me.retireDate ?? null,
        description: me.description,
        workplace: me.workplace,
        rank: me.rank ?? null,
        gender: me.gender ?? null,
        phone: me.phone ?? null,
        annual_leave_days: me.annual_leave_days ?? null,
        level: authSession?.level ?? null,
        address: addressDraft.trim() || null,
      };
      const res = await axios.put(`/api/employees/${me.id}`, payload);
      if (res.status === 200) {
        await loadMe();
        showToast("주소가 저장되었습니다");
      }
    } catch (e: any) {
      showToast(`저장 실패: ${e?.response?.data?.error ?? e.message}`, 3000);
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
      const res = await axios.post("/api/auth/change-password", {
        employeeId: authSession.employeeId,
        currentPassword: currentPw,
        newPassword: newPw,
      });
      if (res.status === 200) {
        setCurrentPw(""); setNewPw(""); setConfirmPw("");
        showToast("비밀번호가 변경되었습니다");
      }
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "비밀번호 변경 실패", 3000);
    } finally {
      setSavingPw(false);
    }
  };

  const addressChanged = (me?.address ?? "") !== addressDraft;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #eff6ff 0%, #ede9fe 40%, #fdf4ff 100%)" }}>
      <AppNavHeader activePage={"mypage" as AppNavPage} authSession={authSession} onBack={onBack} onNavigate={onNavigate} onLogout={onLogout} />

      <main className="flex-1 max-w-2xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 space-y-3">
        {/* 프로필 헤더 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-xl sm:text-2xl shadow-md shrink-0">
              {(me?.name ?? authSession?.employeeName ?? "?").slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">마이페이지</div>
              <div className="text-lg sm:text-xl font-black text-slate-800 mt-0.5 truncate">
                {me?.name ?? authSession?.employeeName ?? "-"}
                {me?.rank && <span className="text-sm text-slate-500 font-bold ml-1">{me.rank}</span>}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {me?.position ?? "-"} · {me?.employmentType ?? "-"} · Level {authSession?.level ?? "-"}
              </div>
            </div>
          </div>
        </div>

        {/* 정보 카드 (읽기 전용) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/60 text-[10px] font-black text-slate-500 uppercase tracking-wider">
            내 정보 (읽기 전용)
          </div>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="text-indigo-400 animate-spin" /></div>
          ) : !me ? (
            <div className="p-6 text-center text-sm text-slate-500">직원 정보를 불러올 수 없습니다.</div>
          ) : (
            <>
              <ReadRow icon={<User size={14} />} label="이름" value={me.name} />
              <ReadRow icon={<Award size={14} />} label="직급" value={me.rank ?? "-"} />
              <ReadRow icon={<Briefcase size={14} />} label="구분" value={me.position} />
              <ReadRow icon={<Briefcase size={14} />} label="고용형태" value={me.employmentType} />
              <ReadRow icon={<Calendar size={14} />} label="입사일" value={me.hireDate} mono />
              <ReadRow icon={<User size={14} />} label="성별" value={me.gender ?? "-"} />
              <ReadRow icon={<Phone size={14} />} label="핸드폰번호" value={me.phone ?? "-"} mono />
              <ReadRow icon={<Briefcase size={14} />} label="근무지" value={me.workplace} />
              <ReadRow icon={<Calendar size={14} />} label="연차일수" value={`${me.annual_leave_days ?? "-"}일`} mono last />
            </>
          )}
        </div>

        {/* 주소 편집 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 bg-indigo-50/60 text-[10px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin size={12} /> 주소
          </div>
          <div className="p-4 flex flex-col gap-2">
            <input
              type="text"
              value={addressDraft}
              onChange={e => setAddressDraft(e.target.value)}
              placeholder="예: 경기도 오산시 …"
              className="w-full px-3 py-2 text-[13px] border border-slate-300 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={saveAddress}
                disabled={savingAddress || !addressChanged}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-black shadow-sm active:scale-95 transition disabled:opacity-40"
              >
                {savingAddress ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} 주소 저장
              </button>
            </div>
          </div>
        </div>

        {/* 비밀번호 변경 카드 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 bg-rose-50/60 text-[10px] font-black text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
            <Lock size={12} /> 비밀번호 변경
          </div>
          <div className="p-4 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="현재 비밀번호"
                className="flex-1 px-3 py-2 text-[13px] border border-slate-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
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
              className="w-full px-3 py-2 text-[13px] border border-slate-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              autoComplete="new-password"
            />
            <input
              type={showPw ? "text" : "password"}
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="w-full px-3 py-2 text-[13px] border border-slate-300 rounded-xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
              autoComplete="new-password"
            />
            <div className="flex items-center justify-end gap-2 mt-1">
              <button
                type="button"
                onClick={changePassword}
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[12px] font-black shadow-sm active:scale-95 transition disabled:opacity-40"
              >
                {savingPw ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} 비밀번호 변경
              </button>
            </div>
          </div>
        </div>

        {/* 계절 정의 (관리자 전용 · level >= 9) */}
        {(authSession?.level ?? 0) >= 9 && authSession?.employeeId && (
          <SeasonRangesEditor employeeId={authSession.employeeId} onToast={showToast} />
        )}

        {/* 안내 */}
        <div className="px-3 py-2 bg-white/60 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-start gap-2">
          <Check size={12} className="mt-0.5 text-emerald-500 shrink-0" />
          <span>본인이 직접 수정할 수 있는 항목은 <b>비밀번호·주소</b>뿐입니다. 그 외 정보(이름·직급·연차 등) 는 관리자에게 문의하세요.</span>
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[12px] font-bold shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
};

const ReadRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean; last?: boolean }> = ({ icon, label, value, mono, last }) => (
  <div className={`grid grid-cols-[110px_1fr] items-center gap-2 sm:gap-4 px-4 py-2.5 ${last ? "" : "border-b border-slate-100"}`}>
    <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
      <span className="text-slate-400">{icon}</span> {label}
    </div>
    <div className={`text-[13px] font-bold text-slate-800 truncate ${mono ? "font-mono" : ""}`}>{value || "-"}</div>
  </div>
);

export default MyPage;
