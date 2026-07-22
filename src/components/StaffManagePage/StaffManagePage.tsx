// src/components/StaffManagePage/StaffManagePage.tsx
// 직원관리 페이지 — 마스터-디테일 레이아웃 (이력서 스타일 우측 패널)
// 좌측: 슬림 원라인 리스트 / 우측: 이력서 형식 상세 + 인라인 편집
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Briefcase,
  Building,
  Calendar,
  Camera,
  ClipboardList,
  Edit2,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface Employee {
  id: number;
  name: string;
  position?: string | null;
  phone?: string | null;
  email?: string | null;
  level?: number | null;
  role?: string | null;
  contract_file_url?: string | null;
  photo_url?: string | null;
  hire_date?: string | null;
  memo?: string | null;
  // ── 이력서 · 인사기록카드 확장 필드 (DB 없으면 undefined 처리) ──
  // 인적사항
  birth_date?: string | null;
  gender?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_rel?: string | null;
  // 근무 정보
  schedule_type?: string | null; // 오픈/미들/마감/클로징/자유
  work_area?: string | null;     // 담당 구역
  // 계약 정보
  contract_type?: string | null;  // regular/fixed_term/part_time/daily/intern
  contract_start?: string | null;
  contract_end?: string | null;
  probation_end_date?: string | null;
  work_location?: string | null;
  job_duties?: string | null;
  // 근로조건
  working_hours_per_week?: number | null;
  break_time_minutes?: number | null;
  weekly_holiday?: string | null;  // 일요일 등
  annual_leave_days?: number | null;
  // 임금
  wage_calc_type?: string | null; // hourly/daily/monthly/annual
  wage_amount?: number | null;
  wage_pay_day?: string | null;   // 매월 10일 등
  wage_pay_method?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  salary?: string | null; // 하위 호환 (레거시)
  // 4대보험
  insurance_nps_date?: string | null;   // 국민연금
  insurance_nhis_date?: string | null;  // 건강보험
  insurance_ei_date?: string | null;    // 고용보험
  insurance_wcia_date?: string | null;  // 산재보험
  insurance_excluded?: boolean | null;
  // 자격 (약국 특수)
  pharmacist_license_no?: string | null;
  health_check_expiry?: string | null;
  // 경력·학력·자격증 (배열)
  careers?: CareerItem[] | null;
  educations?: EducationItem[] | null;
  certifications?: CertItem[] | null;
  [key: string]: unknown;
}

/**
 * 인사기록카드 관련 DB 컬럼 추가 SQL (Supabase에서 한 번 실행):
 *
 * ALTER TABLE employees
 *   ADD COLUMN IF NOT EXISTS birth_date date,
 *   ADD COLUMN IF NOT EXISTS gender text,
 *   ADD COLUMN IF NOT EXISTS address text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_name text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
 *   ADD COLUMN IF NOT EXISTS emergency_contact_rel text,
 *   ADD COLUMN IF NOT EXISTS schedule_type text,
 *   ADD COLUMN IF NOT EXISTS work_area text,
 *   ADD COLUMN IF NOT EXISTS contract_type text,
 *   ADD COLUMN IF NOT EXISTS contract_start date,
 *   ADD COLUMN IF NOT EXISTS contract_end date,
 *   ADD COLUMN IF NOT EXISTS probation_end_date date,
 *   ADD COLUMN IF NOT EXISTS work_location text,
 *   ADD COLUMN IF NOT EXISTS job_duties text,
 *   ADD COLUMN IF NOT EXISTS working_hours_per_week numeric(4,1),
 *   ADD COLUMN IF NOT EXISTS break_time_minutes integer,
 *   ADD COLUMN IF NOT EXISTS weekly_holiday text DEFAULT '일요일',
 *   ADD COLUMN IF NOT EXISTS annual_leave_days integer DEFAULT 15,
 *   ADD COLUMN IF NOT EXISTS wage_calc_type text,
 *   ADD COLUMN IF NOT EXISTS wage_amount integer,
 *   ADD COLUMN IF NOT EXISTS wage_pay_day text,
 *   ADD COLUMN IF NOT EXISTS wage_pay_method text DEFAULT '계좌이체',
 *   ADD COLUMN IF NOT EXISTS bank_name text,
 *   ADD COLUMN IF NOT EXISTS bank_account_no text,
 *   ADD COLUMN IF NOT EXISTS insurance_nps_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_nhis_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_ei_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_wcia_date date,
 *   ADD COLUMN IF NOT EXISTS insurance_excluded boolean DEFAULT false,
 *   ADD COLUMN IF NOT EXISTS pharmacist_license_no text,
 *   ADD COLUMN IF NOT EXISTS health_check_expiry date,
 *   ADD COLUMN IF NOT EXISTS careers jsonb DEFAULT '[]'::jsonb,
 *   ADD COLUMN IF NOT EXISTS educations jsonb DEFAULT '[]'::jsonb,
 *   ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb;
 */

interface CareerItem {
  id: string;
  company: string;
  period: string;
  desc?: string;
}

interface EducationItem {
  id: string;
  school: string;
  major?: string;
  grad?: string;
}

interface CertItem {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
}

type EditDraft = Pick<
  Employee,
  | "name" | "position" | "phone" | "email" | "level" | "role"
  | "hire_date" | "memo" | "contract_file_url" | "photo_url"
  | "birth_date" | "gender" | "address" | "schedule_type" | "work_area"
  | "salary" | "contract_start" | "contract_end"
  // 신규 · 인사기록카드 확장
  | "emergency_contact_name" | "emergency_contact_phone" | "emergency_contact_rel"
  | "contract_type" | "probation_end_date" | "work_location" | "job_duties"
  | "working_hours_per_week" | "break_time_minutes" | "weekly_holiday" | "annual_leave_days"
  | "wage_calc_type" | "wage_amount" | "wage_pay_day" | "wage_pay_method" | "bank_name" | "bank_account_no"
  | "insurance_nps_date" | "insurance_nhis_date" | "insurance_ei_date" | "insurance_wcia_date" | "insurance_excluded"
  | "pharmacist_license_no" | "health_check_expiry"
>;

// ─── 상수 ───────────────────────────────────────────────────────────────────
const POSITIONS = ["약사", "물류", "캐셔", "진열", "매니저", "기타"] as const;
const SCHEDULE_TYPES = ["오픈", "미들", "마감", "클로징", "자유", "풀타임"] as const;
const GENDERS = ["남", "여"] as const;

// ─── 헬퍼: 직책 컬러 ────────────────────────────────────────────────────────
function positionColor(pos: string | null | undefined) {
  if (!pos) return "bg-slate-100 text-slate-500 border-slate-200";
  if (pos.includes("약사"))   return "bg-violet-100 text-violet-700 border-violet-200";
  if (pos.includes("물류"))   return "bg-orange-100 text-orange-700 border-orange-200";
  if (pos.includes("캐셔"))   return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (pos.includes("진열"))   return "bg-sky-100 text-sky-700 border-sky-200";
  if (pos.includes("매니저")) return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function scheduleTypeColor(t: string | null | undefined) {
  if (!t) return "bg-slate-100 text-slate-400 border-slate-200";
  if (t === "오픈")    return "bg-amber-100 text-amber-700 border-amber-200";
  if (t === "미들")    return "bg-teal-100 text-teal-700 border-teal-200";
  if (t === "마감")    return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (t === "클로징")  return "bg-purple-100 text-purple-700 border-purple-200";
  if (t === "풀타임")  return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

// ─── 헬퍼: 아바타 그라디언트 ────────────────────────────────────────────────
const AVATAR_GRADIENTS = [
  "from-indigo-400 to-violet-500",
  "from-sky-400 to-indigo-500",
  "from-emerald-400 to-teal-500",
  "from-orange-400 to-amber-500",
  "from-rose-400 to-pink-500",
  "from-violet-400 to-purple-500",
] as const;

function avatarGradient(name: string) {
  const code = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name ? name.charAt(0) : "?";
}

// ─── 서브컴포넌트: 아바타 ────────────────────────────────────────────────────
const Avatar: React.FC<{
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "lg";
}> = ({ name, photoUrl, size = "sm" }) => {
  const dim =
    size === "lg" ? "w-20 h-20 text-2xl"
    : size === "xs" ? "w-8 h-8 text-xs"
    : "w-9 h-9 text-sm";
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${dim} rounded-full object-cover ring-2 ring-white shadow shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} rounded-full bg-gradient-to-br ${avatarGradient(name)} flex items-center justify-center text-white font-black shadow shrink-0 select-none`}
    >
      {initials(name)}
    </div>
  );
};

// ─── 서브컴포넌트: 인라인 텍스트 필드 ──────────────────────────────────────
const InlineField: React.FC<{
  label: string;
  value: string;
  editing: boolean;
  icon?: React.ReactNode;
  type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  onChange: (v: string) => void;
  monospace?: boolean;
  wide?: boolean;
}> = ({ label, value, editing, icon, type = "text", placeholder, onChange, monospace, wide }) => (
  <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
      {icon}
      {label}
    </span>
    {editing ? (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-indigo-50/40 ${monospace ? "font-mono" : ""}`}
      />
    ) : (
      <span
        className={`text-sm py-1 min-h-[26px] ${monospace ? "font-mono" : ""} ${!value ? "text-slate-300 italic" : "text-slate-800"}`}
      >
        {value || "(등록 없음)"}
      </span>
    )}
  </div>
);

// ─── 서브컴포넌트: 섹션 카드 (아코디언) ─────────────────────────────────────
const SectionCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 bg-white hover:bg-slate-50 border-b border-slate-100 flex items-center justify-between cursor-pointer transition-colors"
      >
        <span className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase tracking-widest">
          <span className="text-indigo-400">{icon}</span>
          {title}
        </span>
        <span className={`text-slate-300 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
};

// ─── 서브컴포넌트: 빈 상태 행 ───────────────────────────────────────────────
const EmptyRow: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-[12px] text-slate-300 italic py-1">{label}</p>
);

// ─── 서브컴포넌트: 신규 등록 모달 ────────────────────────────────────────────
const CreateModal: React.FC<{
  onClose: () => void;
  onSave: (data: Partial<Employee>) => Promise<void>;
  saving: boolean;
}> = ({ onClose, onSave, saving }) => {
  const [draft, setDraft] = useState<Partial<Employee>>({ name: "", position: "물류" });
  const set = (k: keyof Employee, v: unknown) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-violet-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
              <UserPlus size={15} className="text-white" />
            </div>
            <span className="text-sm font-black text-slate-800">직원 신규 등록</span>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="text-slate-400 hover:text-slate-700 w-8 h-8 rounded-lg hover:bg-white/70 cursor-pointer flex items-center justify-center disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {(
            [
              { label: "이름 *", key: "name", type: "text", placeholder: "" },
              { label: "연락처", key: "phone", type: "text", placeholder: "010-0000-0000" },
              { label: "이메일", key: "email", type: "email", placeholder: "name@example.com" },
              { label: "입사일", key: "hire_date", type: "date", placeholder: "" },
            ] as { label: string; key: keyof Employee; type: string; placeholder: string }[]
          ).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-wide block mb-1">{label}</label>
              <input
                type={type}
                value={String(draft[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          ))}
          <div>
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-wide block mb-1">직책</label>
            <select
              value={String(draft.position ?? "")}
              onChange={(e) => set("position", e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="">선택 안 함</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-wide block mb-1">메모</label>
            <textarea
              value={String(draft.memo ?? "")}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="(선택) 근무 특이사항 · 알러지 등"
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 rounded-lg px-4 py-1.5 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
          >
            취소
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="text-[12px] font-black text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-lg px-5 py-1.5 cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 서브컴포넌트: 직원 없음 (우측 빈 상태) ─────────────────────────────────
const EmptyDetail: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300 select-none">
    <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
      <Users size={36} className="text-slate-300" />
    </div>
    <div className="text-center">
      <p className="text-sm font-bold text-slate-400">직원을 선택하세요</p>
      <p className="text-xs text-slate-300 mt-1">좌측 목록에서 직원을 클릭하면 이력서가 표시됩니다</p>
    </div>
  </div>
);

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
const StaffManagePage: React.FC = () => {
  // ── 상태 ──
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState<EditDraft | null>(null);
  const [saving, setSaving]   = useState(false);

  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen]     = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── 데이터 로드 ──
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth() + 1;
      const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
      if (!res.ok) throw new Error(`서버 오류 ${res.status}`);
      const data = await res.json();
      const list: Employee[] = Array.isArray(data?.employees) ? data.employees : [];
      setEmployees(list);
      if (selectedId != null && !list.find((e) => e.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadEmployees(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 필터링 ──
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (filterPosition && !(e.position ?? "").includes(filterPosition)) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          e.name?.toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q) ||
          (e.phone ?? "").toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [employees, search, filterPosition]);

  const selectedEmp = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId]
  );

  // ── 선택 ──
  const handleSelect = (emp: Employee) => {
    if (editing && !window.confirm("편집 중인 내용이 있습니다. 이동할까요?")) return;
    setSelectedId(emp.id);
    setEditing(false);
    setDraft(null);
    setMobileDetail(true);
  };

  // ── 편집 시작 ──
  const startEdit = (emp: Employee) => {
    setDraft({
      name: emp.name ?? "",
      position: emp.position ?? "",
      phone: emp.phone ?? "",
      email: emp.email ?? "",
      level: emp.level ?? null,
      role: emp.role ?? "",
      hire_date: emp.hire_date ?? "",
      memo: emp.memo ?? "",
      contract_file_url: emp.contract_file_url ?? "",
      photo_url: emp.photo_url ?? "",
      birth_date: emp.birth_date ?? "",
      gender: emp.gender ?? "",
      address: emp.address ?? "",
      schedule_type: emp.schedule_type ?? "",
      work_area: emp.work_area ?? "",
      salary: emp.salary ?? "",
      contract_start: emp.contract_start ?? "",
      contract_end: emp.contract_end ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setDraft(null); };

  // ── 저장 ──
  const saveEdit = async () => {
    if (!selectedEmp || !draft) return;
    if (!draft.name?.trim()) { alert("이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/employees/${selectedEmp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selectedEmp, ...draft }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`저장 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      setEditing(false);
      setDraft(null);
      setEmployees((prev) => prev.map((e) => e.id === selectedEmp.id ? { ...e, ...draft } : e));
    } catch (err: unknown) {
      alert(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  // ── 삭제 ──
  const deleteEmployee = async (emp: Employee) => {
    if (!window.confirm(`직원 [${emp.name}] 삭제할까요?\n\n관련 스케줄·배정 데이터도 영향을 받을 수 있습니다.`)) return;
    try {
      const res = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`삭제 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      if (selectedId === emp.id) setSelectedId(null);
      loadEmployees();
    } catch (err: unknown) {
      alert(`삭제 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── 신규 등록 ──
  const createEmployee = async (data: Partial<Employee>) => {
    if (!data.name?.trim()) { alert("이름을 입력해주세요."); return; }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(`저장 실패: ${(b as { error?: string }).error ?? res.statusText}`);
        return;
      }
      const created: Employee = await res.json();
      setCreateOpen(false);
      await loadEmployees();
      setSelectedId(created?.id ?? null);
    } catch (err: unknown) {
      alert(`저장 오류: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreateSaving(false);
    }
  };

  const setField = <K extends keyof EditDraft>(k: K, v: EditDraft[K]) => {
    setDraft((p) => (p ? { ...p, [k]: v } : p));
  };

  const displayEmp = editing && draft ? { ...selectedEmp!, ...draft } : selectedEmp;

  // ── 좌측 리스트 아이템 ──────────────────────────────────────────────────────
  const ListRow: React.FC<{ emp: Employee }> = ({ emp }) => {
    const isSelected = emp.id === selectedId;
    const schedType = emp.schedule_type;
    return (
      <button
        onClick={() => handleSelect(emp)}
        className={`w-full text-left flex items-center h-14 px-3 gap-2.5 relative transition-colors cursor-pointer group ${
          isSelected
            ? "bg-rose-50/50"
            : "hover:bg-orange-50/30"
        }`}
      >
        {/* 선택 강조선 */}
        <span
          className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-opacity ${
            isSelected ? "bg-indigo-500 opacity-100" : "opacity-0"
          }`}
        />
        {/* 아바타 32px */}
        <div className="shrink-0 ml-1">
          <Avatar name={emp.name} photoUrl={emp.photo_url} size="xs" />
        </div>
        {/* 이름 + 메타 */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <span className="text-[14px] font-medium text-slate-800 leading-tight truncate">
            {emp.name}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {emp.role && (
              <span className="text-[9px] font-bold text-slate-400 truncate max-w-[44px]">{emp.role}</span>
            )}
            {emp.position && (
              <span className={`text-[9px] font-bold px-1 py-px rounded border leading-tight ${positionColor(emp.position)}`}>
                {emp.position}
              </span>
            )}
            {schedType && (
              <span className={`text-[9px] font-bold px-1 py-px rounded border leading-tight ${scheduleTypeColor(schedType)}`}>
                {schedType}
              </span>
            )}
            {emp.level != null && (
              <span className="text-[9px] text-slate-300 font-mono">Lv.{emp.level}</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ── 렌더링 ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 py-4 flex flex-col gap-0 min-h-0">
      {/* 페이지 헤더 */}
      <div className="bg-white border border-slate-200 rounded-t-xl border-b-0 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={17} className="text-indigo-500" />
          <h2 className="text-sm font-black text-slate-800">직원관리</h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
            총 {employees.length}명
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={loadEmployees}
            disabled={loading}
            title="새로고침"
            className="text-[11px] font-bold text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="text-[11px] font-black text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-lg px-3 py-1.5 cursor-pointer flex items-center gap-1 shadow-sm"
          >
            <UserPlus size={12} /> 신규 등록
          </button>
        </div>
      </div>

      {/* 마스터-디테일 */}
      <div
        className="flex flex-col lg:flex-row flex-1 bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden"
        style={{ minHeight: "calc(100vh - 160px)" }}
      >
        {/* ════ 좌측: 슬림 원라인 리스트 ════ */}
        <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col bg-white max-h-[40vh] lg:max-h-none">
          {/* 검색 + 필터 */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="이름 · 직책 · 연락처 검색"
                className="w-full pl-7 pr-2 py-1.5 text-[12px] border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-slate-50"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setFilterPosition("")}
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                  filterPosition === "" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-400 border-slate-200 hover:border-indigo-300"
                }`}
              >
                전체
              </button>
              {POSITIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPosition(filterPosition === p ? "" : p)}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    filterPosition === p
                      ? `${positionColor(p)} border-current`
                      : "bg-white text-slate-400 border-slate-200 hover:border-indigo-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 직원 목록 */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading && filtered.length > 0 && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 mx-3 mb-1 bg-sky-50 border border-sky-200 rounded-md shrink-0">
                <Loader2 size={11} className="animate-spin text-sky-600" />
                <span className="text-[10px] font-bold text-sky-700">조건 변경 · 새로 불러오는 중...</span>
              </div>
            )}
            {loading && filtered.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2">
                <Loader2 size={14} className="animate-spin" />로딩 중...
              </div>
            ) : error ? (
              <div className="m-3 p-3 text-[11px] text-red-600 font-bold bg-red-50 rounded-lg border border-red-200">
                {error}
                <button onClick={loadEmployees} className="ml-2 underline cursor-pointer">재시도</button>
              </div>
            ) : !loading && filtered.length === 0 ? (
              <div className="text-center text-[11px] text-slate-300 py-6">해당 조건의 직원이 없습니다</div>
            ) : (
              <div className={loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}>
                {filtered.map((emp) => <ListRow key={emp.id} emp={emp} />)}
              </div>
            )}
          </div>

          {/* 하단 신규 등록 */}
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full text-[11px] font-black text-indigo-600 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50 cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus size={12} /> 신규 직원 등록
            </button>
          </div>
        </aside>

        {/* ════ 우측: 이력서 패널 ════ */}
        <section className="flex-1 flex flex-col min-w-0 bg-slate-50/40">
          {!displayEmp ? (
            <EmptyDetail />
          ) : (
            <>
              {/* ── 프로필 헤더 ── */}
              <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="flex items-start gap-4">
                  {/* 사진 */}
                  <div className="relative group shrink-0">
                    <Avatar name={displayEmp.name} photoUrl={displayEmp.photo_url} size="lg" />
                    {editing && (
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        title="사진 변경"
                        className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Camera size={18} className="text-white" />
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setField("photo_url", URL.createObjectURL(file));
                      }}
                    />
                  </div>

                  {/* 이름 · 뱃지 */}
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <input
                        value={draft?.name ?? ""}
                        onChange={(e) => setField("name", e.target.value)}
                        className="text-xl font-black text-slate-800 border-b-2 border-indigo-400 bg-transparent focus:outline-none w-full mb-2"
                      />
                    ) : (
                      <h3 className="text-xl font-black text-slate-800 leading-tight mb-2">{displayEmp.name}</h3>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 직책 */}
                      {editing ? (
                        <select
                          value={draft?.position ?? ""}
                          onChange={(e) => setField("position", e.target.value)}
                          className="text-[12px] border border-slate-300 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:border-indigo-400"
                        >
                          <option value="">직책 없음</option>
                          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${positionColor(displayEmp.position)}`}>
                          {displayEmp.position || "직책 없음"}
                        </span>
                      )}
                      {/* 근무타입 */}
                      {editing ? (
                        <select
                          value={draft?.schedule_type ?? ""}
                          onChange={(e) => setField("schedule_type", e.target.value)}
                          className="text-[12px] border border-slate-300 rounded-lg px-2 py-0.5 bg-white focus:outline-none focus:border-indigo-400"
                        >
                          <option value="">근무타입 없음</option>
                          {SCHEDULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : displayEmp.schedule_type ? (
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${scheduleTypeColor(displayEmp.schedule_type)}`}>
                          {displayEmp.schedule_type}
                        </span>
                      ) : null}
                      {/* 레벨 */}
                      {displayEmp.level != null && (
                        <span className="text-[11px] font-bold text-slate-400 flex items-center gap-0.5">
                          <Award size={10} /> Lv.{editing ? draft?.level : displayEmp.level}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-300 font-mono ml-auto">ID #{displayEmp.id}</span>
                    </div>
                  </div>

                  {/* 편집 / 저장 / 삭제 버튼 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {editing ? (
                      <>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="text-[12px] font-bold text-slate-600 bg-white border border-slate-300 rounded-xl px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-1 disabled:opacity-40"
                        >
                          <X size={13} /> 취소
                        </button>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="text-[12px] font-black text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 rounded-xl px-4 py-1.5 cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-40"
                        >
                          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          {saving ? "저장 중..." : "저장"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => selectedEmp && startEdit(selectedEmp)}
                          className="text-[12px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 hover:bg-indigo-100 cursor-pointer flex items-center gap-1"
                        >
                          <Edit2 size={13} /> 편집
                        </button>
                        <button
                          onClick={() => selectedEmp && deleteEmployee(selectedEmp)}
                          className="text-[12px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 hover:bg-red-100 cursor-pointer flex items-center gap-1"
                        >
                          <Trash2 size={13} /> 삭제
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 이력서 섹션들 ── */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">

                {/* §1 인적사항 */}
                <SectionCard title="인적사항" icon={<User size={12} />} defaultOpen>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="연락처" value={editing ? (draft?.phone ?? "") : (displayEmp.phone ?? "")}
                      editing={editing} icon={<Phone size={10} />} placeholder="010-0000-0000" monospace
                      onChange={(v) => setField("phone", v)}
                    />
                    <InlineField
                      label="이메일" value={editing ? (draft?.email ?? "") : (displayEmp.email ?? "")}
                      editing={editing} icon={<Mail size={10} />} type="email" placeholder="name@example.com"
                      onChange={(v) => setField("email", v)}
                    />
                    <InlineField
                      label="생년월일" value={editing ? (draft?.birth_date ?? "") : (displayEmp.birth_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("birth_date", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <User size={10} /> 성별
                      </span>
                      {editing ? (
                        <select
                          value={draft?.gender ?? ""}
                          onChange={(e) => setField("gender", e.target.value)}
                          className="border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-indigo-500 bg-indigo-50/40"
                        >
                          <option value="">선택 안 함</option>
                          {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <span className={`text-sm py-1 ${displayEmp.gender ? "text-slate-800" : "text-slate-300 italic"}`}>
                          {displayEmp.gender || "(등록 없음)"}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="주소" value={editing ? (draft?.address ?? "") : (displayEmp.address ?? "")}
                      editing={editing} icon={<MapPin size={10} />} placeholder="주소 입력"
                      onChange={(v) => setField("address", v)} wide
                    />
                  </div>
                </SectionCard>

                {/* §2 근무 정보 */}
                <SectionCard title="근무 정보" icon={<Building size={12} />} defaultOpen>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="직책" value={editing ? (draft?.position ?? "") : (displayEmp.position ?? "")}
                      editing={editing} icon={<Award size={10} />} placeholder="직책 입력"
                      onChange={(v) => setField("position", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Users size={10} /> 구분 / 역할
                      </span>
                      {editing ? (
                        <div className="flex gap-2">
                          <input
                            type="number" min={1} max={9}
                            value={draft?.level ?? ""}
                            onChange={(e) => setField("level", e.target.value === "" ? null : Number(e.target.value))}
                            placeholder="Lv"
                            className="w-14 border border-indigo-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none bg-indigo-50/40"
                          />
                          <input
                            type="text" value={draft?.role ?? ""}
                            onChange={(e) => setField("role", e.target.value)}
                            placeholder="역할 (예: admin)"
                            className="flex-1 border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none bg-indigo-50/40"
                          />
                        </div>
                      ) : (
                        <span className="text-sm py-1 text-slate-800">
                          {displayEmp.level != null ? `Lv.${displayEmp.level}` : ""}
                          {displayEmp.role && <span className="text-slate-500 ml-1">({displayEmp.role})</span>}
                          {displayEmp.level == null && !displayEmp.role && <span className="text-slate-300 italic">(등록 없음)</span>}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="입사일" value={editing ? (draft?.hire_date ?? "") : (displayEmp.hire_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("hire_date", v)}
                    />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <ClipboardList size={10} /> 근무 타입
                      </span>
                      {editing ? (
                        <select
                          value={draft?.schedule_type ?? ""}
                          onChange={(e) => setField("schedule_type", e.target.value)}
                          className="border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none bg-indigo-50/40"
                        >
                          <option value="">선택 안 함</option>
                          {SCHEDULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      ) : (
                        <span className={`text-sm py-1 ${displayEmp.schedule_type ? "text-slate-800" : "text-slate-300 italic"}`}>
                          {displayEmp.schedule_type || "(등록 없음)"}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="담당 구역" value={editing ? (draft?.work_area ?? "") : (displayEmp.work_area ?? "")}
                      editing={editing} icon={<MapPin size={10} />} placeholder="예: 1구역 / 냉장"
                      onChange={(v) => setField("work_area", v)} wide
                    />
                  </div>
                </SectionCard>

                {/* §3 경력 */}
                <SectionCard title="경력" icon={<Briefcase size={12} />} defaultOpen={false}>
                  {Array.isArray(displayEmp.careers) && displayEmp.careers.length > 0 ? (
                    <ul className="space-y-2">
                      {displayEmp.careers.map((c: CareerItem) => (
                        <li key={c.id} className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                          <Briefcase size={13} className="text-indigo-300 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">{c.company}</p>
                            <p className="text-[11px] text-slate-400">{c.period}{c.desc ? ` · ${c.desc}` : ""}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyRow label="(등록 없음) — 편집 모드에서 DB에 careers 배열을 추가하세요" />
                  )}
                </SectionCard>

                {/* §4 학력 */}
                <SectionCard title="학력" icon={<GraduationCap size={12} />} defaultOpen={false}>
                  {Array.isArray(displayEmp.educations) && displayEmp.educations.length > 0 ? (
                    <ul className="space-y-2">
                      {displayEmp.educations.map((edu: EducationItem) => (
                        <li key={edu.id} className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                          <GraduationCap size={13} className="text-violet-300 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-slate-800">{edu.school}</p>
                            <p className="text-[11px] text-slate-400">
                              {[edu.major, edu.grad].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyRow label="(등록 없음) — DB에 educations 배열이 없습니다" />
                  )}
                </SectionCard>

                {/* §5 자격증 */}
                <SectionCard title="자격증 · 면허" icon={<Award size={12} />} defaultOpen={false}>
                  {Array.isArray(displayEmp.certifications) && displayEmp.certifications.length > 0 ? (
                    <ul className="space-y-2">
                      {displayEmp.certifications.map((cert: CertItem) => (
                        <li key={cert.id} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                          <Award size={13} className="text-amber-300 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-slate-800">{cert.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {[cert.issuer, cert.date].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyRow label="(등록 없음) — DB에 certifications 배열이 없습니다" />
                  )}
                </SectionCard>

                {/* §6 계약 · 서류 */}
                <SectionCard title="계약 · 서류" icon={<FileText size={12} />} defaultOpen>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="계약 시작일" value={editing ? (draft?.contract_start ?? "") : (displayEmp.contract_start ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("contract_start", v)}
                    />
                    <InlineField
                      label="계약 종료일" value={editing ? (draft?.contract_end ?? "") : (displayEmp.contract_end ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("contract_end", v)}
                    />
                    <InlineField
                      label="급여" value={editing ? (draft?.salary ?? "") : (displayEmp.salary ?? "")}
                      editing={editing} placeholder="예: 시급 10,030원"
                      onChange={(v) => setField("salary", v)} wide
                    />
                    {/* 계약서 링크 */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <FileText size={10} /> 계약서 파일
                      </span>
                      {editing ? (
                        <input
                          type="url"
                          value={draft?.contract_file_url ?? ""}
                          onChange={(e) => setField("contract_file_url", e.target.value)}
                          placeholder="계약서 URL 입력 (https://...)"
                          className="border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-500 bg-indigo-50/40"
                        />
                      ) : displayEmp.contract_file_url ? (
                        <a
                          href={displayEmp.contract_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-indigo-600 hover:underline py-1 truncate"
                        >
                          계약서 다운로드
                        </a>
                      ) : (
                        <span className="text-sm text-slate-300 italic py-1">(등록 없음)</span>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* §7 근로조건 (근기법 §17 서면교부 대상) */}
                <SectionCard title="근로조건" icon={<Calendar size={12} />} defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="주 소정근로시간"
                      value={editing ? String(draft?.working_hours_per_week ?? "") : String(displayEmp.working_hours_per_week ?? "")}
                      editing={editing} type="number" placeholder="40"
                      onChange={(v) => setField("working_hours_per_week", v === "" ? null : Number(v))}
                    />
                    <InlineField
                      label="휴게시간 (분/일)"
                      value={editing ? String(draft?.break_time_minutes ?? "") : String(displayEmp.break_time_minutes ?? "")}
                      editing={editing} type="number" placeholder="60"
                      onChange={(v) => setField("break_time_minutes", v === "" ? null : Number(v))}
                    />
                    <InlineField
                      label="유급 주휴일"
                      value={editing ? (draft?.weekly_holiday ?? "") : (displayEmp.weekly_holiday ?? "")}
                      editing={editing} placeholder="일요일"
                      onChange={(v) => setField("weekly_holiday", v)}
                    />
                    <InlineField
                      label="연차유급휴가 (일)"
                      value={editing ? String(draft?.annual_leave_days ?? "") : String(displayEmp.annual_leave_days ?? "")}
                      editing={editing} type="number" placeholder="15"
                      onChange={(v) => setField("annual_leave_days", v === "" ? null : Number(v))}
                    />
                    <InlineField
                      label="근무 장소"
                      value={editing ? (draft?.work_location ?? "") : (displayEmp.work_location ?? "")}
                      editing={editing} placeholder="오산 메가타운 약국" wide
                      onChange={(v) => setField("work_location", v)}
                    />
                    <InlineField
                      label="종사 업무"
                      value={editing ? (draft?.job_duties ?? "") : (displayEmp.job_duties ?? "")}
                      editing={editing} placeholder="조제보조·POS·진열" wide
                      onChange={(v) => setField("job_duties", v)}
                    />
                  </div>
                </SectionCard>

                {/* §8 임금 정보 (민감 - 관리자만 편집) */}
                <SectionCard title="임금 정보" icon={<Briefcase size={12} />} defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">임금 유형</span>
                      {editing ? (
                        <select
                          value={draft?.wage_calc_type ?? ""}
                          onChange={(e) => setField("wage_calc_type", e.target.value || null)}
                          className="border border-indigo-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-500 bg-indigo-50/40"
                        >
                          <option value="">선택 안 함</option>
                          <option value="hourly">시급</option>
                          <option value="daily">일급</option>
                          <option value="monthly">월급</option>
                          <option value="annual">연봉</option>
                        </select>
                      ) : (
                        <span className="text-sm text-slate-800 py-1">
                          {({ hourly: "시급", daily: "일급", monthly: "월급", annual: "연봉" } as any)[displayEmp.wage_calc_type ?? ""] ?? <span className="text-slate-300 italic">(미지정)</span>}
                        </span>
                      )}
                    </div>
                    <InlineField
                      label="임금액 (원)"
                      value={editing ? String(draft?.wage_amount ?? "") : String(displayEmp.wage_amount ?? "")}
                      editing={editing} type="number" placeholder="10030"
                      monospace
                      onChange={(v) => setField("wage_amount", v === "" ? null : Number(v))}
                    />
                    <InlineField
                      label="지급일"
                      value={editing ? (draft?.wage_pay_day ?? "") : (displayEmp.wage_pay_day ?? "")}
                      editing={editing} placeholder="매월 10일"
                      onChange={(v) => setField("wage_pay_day", v)}
                    />
                    <InlineField
                      label="지급 방법"
                      value={editing ? (draft?.wage_pay_method ?? "") : (displayEmp.wage_pay_method ?? "")}
                      editing={editing} placeholder="계좌이체"
                      onChange={(v) => setField("wage_pay_method", v)}
                    />
                    <InlineField
                      label="은행"
                      value={editing ? (draft?.bank_name ?? "") : (displayEmp.bank_name ?? "")}
                      editing={editing} placeholder="국민은행"
                      onChange={(v) => setField("bank_name", v)}
                    />
                    <InlineField
                      label="계좌번호"
                      value={editing ? (draft?.bank_account_no ?? "") : (displayEmp.bank_account_no ?? "")}
                      editing={editing} placeholder="123-45-6789012"
                      monospace
                      onChange={(v) => setField("bank_account_no", v)}
                    />
                  </div>
                </SectionCard>

                {/* §9 4대보험 */}
                <SectionCard title="4대보험" icon={<ClipboardList size={12} />} defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="국민연금 취득일"
                      value={editing ? (draft?.insurance_nps_date ?? "") : (displayEmp.insurance_nps_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("insurance_nps_date", v)}
                    />
                    <InlineField
                      label="건강보험 취득일"
                      value={editing ? (draft?.insurance_nhis_date ?? "") : (displayEmp.insurance_nhis_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("insurance_nhis_date", v)}
                    />
                    <InlineField
                      label="고용보험 취득일"
                      value={editing ? (draft?.insurance_ei_date ?? "") : (displayEmp.insurance_ei_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("insurance_ei_date", v)}
                    />
                    <InlineField
                      label="산재보험 취득일"
                      value={editing ? (draft?.insurance_wcia_date ?? "") : (displayEmp.insurance_wcia_date ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("insurance_wcia_date", v)}
                    />
                    <div className="col-span-2 flex items-center gap-2 mt-1">
                      {editing ? (
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!draft?.insurance_excluded}
                            onChange={(e) => setField("insurance_excluded", e.target.checked)}
                            className="w-4 h-4 rounded"
                          />
                          4대보험 제외 대상
                        </label>
                      ) : displayEmp.insurance_excluded ? (
                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">⚠ 4대보험 제외 대상</span>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>

                {/* §10 약국 특수 자격 */}
                <SectionCard title="약국 특수 자격" icon={<Award size={12} />} defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <InlineField
                      label="약사 면허번호"
                      value={editing ? (draft?.pharmacist_license_no ?? "") : (displayEmp.pharmacist_license_no ?? "")}
                      editing={editing} placeholder="약사 면허번호"
                      monospace
                      onChange={(v) => setField("pharmacist_license_no", v)}
                    />
                    <InlineField
                      label="보건증 만료일"
                      value={editing ? (draft?.health_check_expiry ?? "") : (displayEmp.health_check_expiry ?? "")}
                      editing={editing} icon={<Calendar size={10} />} type="date"
                      onChange={(v) => setField("health_check_expiry", v)}
                    />
                  </div>
                </SectionCard>

                {/* §11 메모 */}
                <SectionCard title="메모" icon={<ClipboardList size={12} />} defaultOpen>
                  {editing ? (
                    <textarea
                      value={draft?.memo ?? ""}
                      onChange={(e) => setField("memo", e.target.value)}
                      placeholder="근무 특이사항 · 알러지 · 기타 참고 사항"
                      rows={3}
                      className="w-full border border-indigo-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-indigo-50/40 resize-none"
                    />
                  ) : (
                    <p className={`text-sm whitespace-pre-wrap ${displayEmp.memo ? "text-slate-700" : "text-slate-300 italic"}`}>
                      {displayEmp.memo || "(등록 없음)"}
                    </p>
                  )}
                </SectionCard>

                <div className="h-4" />
              </div>
            </>
          )}
        </section>
      </div>

      {/* ── 모바일 상세 시트 ── */}
      {mobileDetail && selectedEmp && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setMobileDetail(false)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-t-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <Avatar name={selectedEmp.name} photoUrl={selectedEmp.photo_url} size="xs" />
                <div>
                  <span className="text-sm font-black text-slate-800">{selectedEmp.name}</span>
                  <span className={`ml-2 text-[10px] font-bold px-1.5 py-px rounded border ${positionColor(selectedEmp.position)}`}>
                    {selectedEmp.position || "직책 없음"}
                  </span>
                </div>
              </div>
              <button onClick={() => setMobileDetail(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-white rounded-xl border border-slate-200 p-4">
                {(
                  [
                    ["연락처", selectedEmp.phone],
                    ["이메일", selectedEmp.email],
                    ["입사일", selectedEmp.hire_date],
                    ["권한레벨", selectedEmp.level != null ? `Lv.${selectedEmp.level}` : null],
                    ["근무타입", selectedEmp.schedule_type],
                    ["담당구역", selectedEmp.work_area],
                  ] as [string, string | null | undefined][]
                ).map(([label, val]) =>
                  val ? (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                      <span className="text-xs text-slate-800">{val}</span>
                    </div>
                  ) : null
                )}
              </div>
              {selectedEmp.memo && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">메모</span>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{selectedEmp.memo}</p>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-200 bg-white flex gap-2">
              <button
                onClick={() => { setMobileDetail(false); startEdit(selectedEmp); }}
                className="flex-1 text-[12px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl py-2 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit2 size={13} /> 편집
              </button>
              <button
                onClick={() => { setMobileDetail(false); deleteEmployee(selectedEmp); }}
                className="text-[12px] font-black text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={13} /> 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 신규 등록 모달 ── */}
      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSave={createEmployee}
          saving={createSaving}
        />
      )}
    </main>
  );
};

export default StaffManagePage;
