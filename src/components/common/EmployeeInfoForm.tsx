// src/components/common/EmployeeInfoForm.tsx
// 직원 인적사항 공통 폼 컴포넌트 · T-EmployeeInfo-Common (2026-08-07)
//
// 사용처:
//   StaffManagePage  · 인적사항 §1 섹션 · 인라인 편집 (editing toggle)
//   ContractWriterPage · 근로자 정보 카드 · 항상 편집 가능
//   향후 · 사직서 · 이력서 등에서도 재활용 가능
//
// 설계 원칙:
//   · 순수 표현(presentation) 컴포넌트 — state 없음 · API 없음
//   · 각 페이지의 form state 는 부모가 유지 (이 컴포넌트는 values + onChange 만 받음)
//   · fields prop 으로 표시할 필드 subset 지정 가능
//   · layout="compact" : ContractWriter 스타일 (항상 편집 · slate 테마)
//   · layout="grid"    : StaffManage 스타일  (view/edit 토글 · indigo 테마)
//   · onSelectEmployee : 성명 검색 드롭다운에서 직원 선택 시 부모 콜백 (계약서 전용)

import React from "react";
import { Phone, Mail, MapPin, Calendar, User, Briefcase } from "lucide-react";
import { matchHangul } from "./hangulSearch";
import { TIMING } from "../../constants/timing";
import { POSITIONS } from "../../constants/jobCategories";
import { useSettings } from "../../hooks/useSettings";

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type EmployeeInfoField =
  | "name"
  | "phone"
  | "address"
  | "birthDate"
  | "gender"
  | "email"
  | "rank"
  | "position"
  | "workplace"
  | "hireDate"
  | "employeeNumber";

/** 공통 인적사항 값 타입 · 모든 필드 optional (사용처마다 subset 사용) */
export interface EmployeeInfoValues {
  name?: string;
  phone?: string;
  address?: string;
  /** 생년월일 · 주민번호 · ISO or "YYMMDD-NNNNNNN" 형식 양쪽 허용 */
  birthDate?: string;
  gender?: string;
  email?: string;
  /** 직급 (사원·팀장·과장·...) */
  rank?: string;
  /** 직군/직책 (약사·매장·창고·...) */
  position?: string;
  /** 근무지 (매장·창고·본사·...) */
  workplace?: string;
  /** 입사일 YYYY-MM-DD */
  hireDate?: string;
  /** 사번 · 숫자만 · EMP- 등 접두 X (예: "1", "100", "2026001") */
  employeeNumber?: string;
}

/** 성명 검색 드롭다운을 위한 최소 직원 정보 */
export interface EmployeeSearchItem {
  id: number;
  name: string;
  position?: string | null;
  phone?: string | null;
}

export interface EmployeeInfoFormProps {
  values: EmployeeInfoValues;
  onChange: (v: EmployeeInfoValues) => void;
  /** 표시할 필드 subset. 미지정 시 전체 필드 표시 */
  fields?: EmployeeInfoField[];
  /**
   * "compact" : ContractWriter 스타일 (항상 편집 가능 · zinc-200 border)
   * "grid"    : StaffManage 스타일  (editing prop 으로 view/edit 전환 · indigo border)
   */
  layout?: "compact" | "grid";
  /** grid 레이아웃 전용 · true 이면 편집 인풋 표시 · false 이면 읽기 전용 표시 */
  editing?: boolean;
  disabled?: boolean;
  /** 성명 검색용 직원 목록 (제공 시 성명 필드에 자동완성 드롭다운 표시) */
  employees?: EmployeeSearchItem[];
  /** 직원 로딩 중 여부 (성명 placeholder 에 사용) */
  empLoading?: boolean;
  /** 드롭다운에서 직원 선택 시 콜백 · 부모가 form.setXxx 처리 */
  onSelectEmployee?: (emp: EmployeeSearchItem) => void;
  /**
   * 주소 검색 버튼 클릭 콜백 (제공 시 주소 필드 옆에 "주소 검색" 버튼 표시)
   * 부모에서 AddressSearchModal 을 열고 결과를 onChange 로 반영
   */
  onAddressSearch?: () => void;
}

// ─── 기본값 ──────────────────────────────────────────────────────────────────

const ALL_FIELDS: EmployeeInfoField[] = [
  "name", "phone", "address", "birthDate", "gender",
  "email", "rank", "position", "workplace", "hireDate",
  "employeeNumber",
];

const GENDERS = ["남", "여"] as const;

// ─── 스타일 토큰 ─────────────────────────────────────────────────────────────

/** compact (ContractWriter) 스타일 */
const CMP = {
  label: "block text-[10.5px] font-bold uppercase tracking-wider text-zinc-500 mb-1",
  input: "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[13px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition placeholder:text-zinc-400 placeholder:font-normal",
  select: "w-full bg-white border border-zinc-200 rounded-lg px-2 py-2 text-[13px] text-zinc-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:border-indigo-400 transition cursor-pointer",
} as const;

/** grid (StaffManage) 스타일 */
const GRD = {
  label: "text-[11px] font-semibold text-zinc-400 flex items-center gap-0.5 leading-none",
  input: "border border-indigo-300 rounded-md px-2 py-0.5 text-[13px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 bg-indigo-50/40 h-7 w-full",
  view: (hasValue: boolean) =>
    `text-[13px] font-semibold leading-snug min-h-[20px] ${hasValue ? "text-zinc-700" : "text-zinc-300 italic"}`,
  select: "border border-indigo-300 rounded-md px-2 text-[13px] bg-white focus:outline-none bg-indigo-50/40 h-7 w-full",
} as const;

// ─── 서브: 성명 필드 (검색 드롭다운 포함) ────────────────────────────────────

interface NameFieldProps {
  value: string;
  onChange: (v: string) => void;
  employees?: EmployeeSearchItem[];
  empLoading?: boolean;
  onSelectEmployee?: (emp: EmployeeSearchItem) => void;
  disabled?: boolean;
  layout: "compact" | "grid";
  editing: boolean;
}

const NameField: React.FC<NameFieldProps> = ({
  value, onChange, employees, empLoading, onSelectEmployee, disabled, layout, editing,
}) => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const hasSearch = !!employees && !!onSelectEmployee;

  const inputCls = layout === "compact" ? CMP.input : GRD.input;
  const labelCls = layout === "compact" ? CMP.label : GRD.label;

  const matches = React.useMemo(() => {
    if (!hasSearch || !employees) return [];
    const q = value.trim();
    return q
      ? employees.filter(e => matchHangul(e.name ?? "", q)).slice(0, 8)
      : employees.slice(0, 8);
  }, [hasSearch, employees, value]);

  if (layout === "grid" && !editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className={labelCls}><User size={9} />성명</span>
        <span className={GRD.view(!!value)}>{value || "(없음)"}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {layout === "compact" && <label className={labelCls}>성명</label>}
      {layout === "grid"    && <span className={labelCls}><User size={9} />성명</span>}
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); if (hasSearch) setSearchOpen(true); }}
        onFocus={() => hasSearch && setSearchOpen(true)}
        onBlur={() => hasSearch && setTimeout(() => setSearchOpen(false), TIMING.DEBOUNCE_INPUT)}
        placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 또는 검색"}
        autoComplete="off"
        disabled={disabled}
        className={inputCls}
      />
      {hasSearch && searchOpen && (
        matches.length === 0 ? (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-zinc-200 rounded-xl shadow-lg p-2.5 text-[12px] text-zinc-400 text-center">
            일치하는 직원 없음 · 직접 입력
          </div>
        ) : (
          <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-52 overflow-y-auto divide-y divide-zinc-100">
            {!value.trim() && (
              <li className="px-3 py-1.5 text-[11px] text-zinc-400 font-semibold bg-zinc-50 border-b border-zinc-100">
                직원 선택 또는 성명 입력
              </li>
            )}
            {matches.map(e => (
              <li key={e.id}>
                <button
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => { onSelectEmployee!(e); setSearchOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-[13px] font-bold text-zinc-800">{e.name}</span>
                  {e.position && <span className="text-[11px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">{e.position}</span>}
                  {e.phone && <span className="text-[11px] text-zinc-400 ml-auto tabular-nums">{e.phone}</span>}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────

export const EmployeeInfoForm: React.FC<EmployeeInfoFormProps> = ({
  values,
  onChange,
  fields = ALL_FIELDS,
  layout = "compact",
  editing = true,
  disabled = false,
  employees,
  empLoading,
  onSelectEmployee,
  onAddressSearch,
}) => {
  const show = (f: EmployeeInfoField) => fields.includes(f);
  const upd = (key: keyof EmployeeInfoValues, val: string) =>
    onChange({ ...values, [key]: val });

  // 2026-08-11 · 직군 옵션: 설정(useSettings.positions) 우선 · 없으면 하드코딩 fallback
  const { positions: settingsPositions } = useSettings();
  const positionOptions = (settingsPositions && settingsPositions.length > 0)
    ? settingsPositions
    : (Array.from(POSITIONS) as string[]);

  const isCompact = layout === "compact";

  // compact 레이아웃 스타일 토큰
  const labelCls = isCompact ? CMP.label : GRD.label;
  const inputCls = isCompact ? CMP.input : GRD.input;
  const selectCls = isCompact ? CMP.select : GRD.select;

  // grid 레이아웃: 읽기 전용 값 렌더
  const ViewValue: React.FC<{ value: string | undefined }> = ({ value }) =>
    !isCompact && !editing ? (
      <span className={GRD.view(!!value)}>{value || "(없음)"}</span>
    ) : null;

  // 2026-08-10 · BUG FIX · SimpleInput 이 컴포넌트 (`React.FC`) 로 정의되면
  //   부모 EmployeeInfoForm 이 리렌더될 때마다 SimpleInput 함수 identity 가 바뀜
  //   → React 가 다른 컴포넌트로 인식 · 매 keystroke 마다 input 언마운트/재마운트
  //   → 전화번호 등 · 글자 하나 치면 포커스가 빠짐
  //   해결 · 컴포넌트 대신 일반 함수 (JSX 반환) · <SimpleInput/> 대신 {simpleInput({...})}
  const simpleInput = (opts: {
    fieldKey: keyof EmployeeInfoValues;
    label: string;
    icon?: React.ReactNode;
    type?: string;
    placeholder?: string;
    colSpan?: boolean;
  }): React.ReactElement => {
    const { fieldKey, label, icon, type = "text", placeholder, colSpan } = opts;
    const val = values[fieldKey] ?? "";
    const active = isCompact || editing;
    return (
      <div key={fieldKey} className={colSpan ? "col-span-2" : ""}>
        {isCompact ? (
          <label className={labelCls}>{label}</label>
        ) : (
          <span className={labelCls}>{icon}{label}</span>
        )}
        {active ? (
          <input
            type={type}
            value={String(val)}
            onChange={(e) => upd(fieldKey, e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={inputCls}
          />
        ) : (
          <ViewValue value={String(val)} />
        )}
      </div>
    );
  };

  // 성별 필드 (compact: 버튼 토글 / grid: select)
  const GenderField: React.FC = () => {
    const val = values.gender ?? "";
    const active = isCompact || editing;
    return (
      <div>
        {isCompact ? (
          <label className={labelCls}>성별</label>
        ) : (
          <span className={labelCls}><User size={9} />성별</span>
        )}
        {!active ? (
          <ViewValue value={val} />
        ) : isCompact ? (
          /* compact: 남/여 토글 버튼 (ContractWriter 스타일) */
          <div className="flex gap-1">
            {GENDERS.map(g => (
              <button
                key={g}
                type="button"
                disabled={disabled}
                onClick={() => upd("gender", val === g ? "" : g)}
                className={`flex-1 py-1.5 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                  val === g
                    ? (g === "남"
                        ? "bg-blue-500 text-white border-blue-500"
                        : "bg-rose-500 text-white border-rose-500")
                    : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300"
                }`}
              >{g}</button>
            ))}
          </div>
        ) : (
          /* grid: select (StaffManage 스타일) */
          <select
            value={val}
            disabled={disabled}
            onChange={(e) => upd("gender", e.target.value)}
            className={selectCls}
          >
            <option value="">선택 안 함</option>
            {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 성명 (검색 드롭다운 포함) */}
      {show("name") && (
        <div className={isCompact ? "col-span-2 relative" : "relative"}>
          <NameField
            value={values.name ?? ""}
            onChange={(v) => upd("name", v)}
            employees={employees}
            empLoading={empLoading}
            onSelectEmployee={onSelectEmployee}
            disabled={disabled}
            layout={layout}
            editing={editing}
          />
        </div>
      )}

      {/* 2026-08-10 · 이름 아래 · 직군 드롭박스 (사용자 요청 #25 · 기존 position 필드 재활용 · 라벨 "직책" → "직군") */}
      {show("position") && (
        <div>
          {isCompact ? (
            <label className={labelCls}>직군</label>
          ) : (
            <span className={labelCls}><Briefcase size={9} />직군</span>
          )}
          {(isCompact || editing) ? (
            <select
              value={values.position ?? ""}
              onChange={(e) => upd("position", e.target.value)}
              disabled={disabled}
              className={selectCls}
            >
              <option value="">선택 안 함</option>
              {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <ViewValue value={values.position} />
          )}
        </div>
      )}

      {/* 생년월일 / 주민번호 */}
      {show("birthDate") && simpleInput({
        fieldKey: "birthDate",
        label: isCompact ? "주민번호" : "생년월일",
        icon: <Calendar size={9} />,
        type: isCompact ? "text" : "date",
        placeholder: isCompact ? "970302-2002227" : undefined,
      })}

      {/* 성별 */}
      {show("gender") && <GenderField />}

      {/* 직급 */}
      {show("rank") && simpleInput({
        fieldKey: "rank",
        label: "직급",
        icon: <User size={9} />,
        placeholder: "사원 · 팀장 · 과장 ...",
      })}

      {/* 근무지 */}
      {show("workplace") && simpleInput({
        fieldKey: "workplace",
        label: "근무지",
        icon: <MapPin size={9} />,
        placeholder: "매장 · 창고 · 본사 ...",
        colSpan: isCompact,
      })}

      {/* 전화번호 */}
      {show("phone") && simpleInput({
        fieldKey: "phone",
        label: "전화번호",
        icon: <Phone size={9} />,
        placeholder: "010-1234-5678",
      })}

      {/* 이메일 */}
      {show("email") && simpleInput({
        fieldKey: "email",
        label: "이메일",
        icon: <Mail size={9} />,
        type: "email",
        placeholder: "email@example.com",
      })}

      {/* 주소 */}
      {show("address") && (
        onAddressSearch && (isCompact || editing) ? (
          /* 주소 검색 버튼 제공 시: 인풋 + 버튼 조합 */
          <div className="col-span-2">
            {isCompact ? (
              <label className={labelCls}>주소</label>
            ) : (
              <span className={labelCls}><MapPin size={9} />주소</span>
            )}
            <div className="flex gap-1.5 items-center">
              <input
                type="text"
                value={values.address ?? ""}
                onChange={(e) => upd("address", e.target.value)}
                placeholder="경기도 오산시 ..."
                disabled={disabled}
                className={`${inputCls} flex-1 min-w-0`}
              />
              <button
                type="button"
                onClick={onAddressSearch}
                disabled={disabled}
                className="shrink-0 h-7 px-2.5 rounded-md border border-indigo-400 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                주소 검색
              </button>
            </div>
          </div>
        ) : (
          simpleInput({
            fieldKey: "address",
            label: "주소",
            icon: <MapPin size={9} />,
            placeholder: "경기도 오산시 ...",
            colSpan: true,
          })
        )
      )}

      {/* 2026-08-10 · #25 · position 필드 · 이름 아래 직군 드롭박스로 위로 이동됨 · 여기 중복 렌더 제거 */}

      {/* 입사일 */}
      {show("hireDate") && simpleInput({
        fieldKey: "hireDate",
        label: "입사일",
        icon: <Calendar size={9} />,
        type: "date",
      })}

      {/* 사번 · 숫자만 · EMP- 접두 X · 관리자 수동 입력 · unique */}
      {show("employeeNumber") && simpleInput({
        fieldKey: "employeeNumber",
        label: "사번",
        icon: <User size={9} />,
        placeholder: "예: 1, 100, 2026001",
      })}
    </div>
  );
};

export default EmployeeInfoForm;
