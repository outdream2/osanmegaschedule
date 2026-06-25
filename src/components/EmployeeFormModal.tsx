// src/components/EmployeeFormModal.tsx
import React from "react";
import { X, Users, Briefcase, Calendar, MapPin } from "lucide-react";
import { ZONE_DEFS, SECTION_LABEL } from "../constants/displayZones";

interface EmployeeFormModalProps {
  empModalMode: "create" | "edit";
  empName: string;
  setEmpName: React.Dispatch<React.SetStateAction<string>>;
  empPosition: string;
  setEmpPosition: React.Dispatch<React.SetStateAction<string>>;
  empCustomPosition: string;
  setEmpCustomPosition: React.Dispatch<React.SetStateAction<string>>;
  empEmploymentType: string;
  setEmpEmploymentType: React.Dispatch<React.SetStateAction<string>>;
  empHireDate: string;
  setEmpHireDate: React.Dispatch<React.SetStateAction<string>>;
  empDescription: string;
  setEmpDescription: React.Dispatch<React.SetStateAction<string>>;
  empWorkplace: string;
  setEmpWorkplace: React.Dispatch<React.SetStateAction<string>>;
  empGender: "남" | "여" | "";
  setEmpGender: React.Dispatch<React.SetStateAction<"남" | "여" | "">>;
  empRank: string;
  setEmpRank: React.Dispatch<React.SetStateAction<string>>;
  empAnnualLeave: number;
  setEmpAnnualLeave: React.Dispatch<React.SetStateAction<number>>;
  empZoneNums: number[];
  setEmpZoneNums: React.Dispatch<React.SetStateAction<number[]>>;
  employmentTypes: string[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  empModalMode,
  empName,
  setEmpName,
  empPosition,
  setEmpPosition,
  empCustomPosition,
  setEmpCustomPosition,
  empEmploymentType,
  setEmpEmploymentType,
  empHireDate,
  setEmpHireDate,
  empDescription,
  setEmpDescription,
  empWorkplace,
  setEmpWorkplace,
  empGender,
  setEmpGender,
  empRank,
  setEmpRank,
  empAnnualLeave,
  setEmpAnnualLeave,
  empZoneNums,
  setEmpZoneNums,
  employmentTypes,
  onSubmit,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full sm:max-w-md bg-white sm:rounded-lg rounded-t-2xl shadow-2xl p-4 sm:p-6 border border-[#e2e8f0] transform scale-100 transition animate-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 border-b pb-3 mb-4">
          <Users className="text-[#2563eb]" size={20} />
          <h3 className="text-sm font-bold text-slate-900">{empModalMode === "edit" ? "직원 정보 수정" : "새로운 직원 등록"}</h3>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Highlighted, prominent Description (상세 설명) at the very beginning */}
          <div className="bg-slate-50 p-3 rounded-lg border border-[#cbd5e1] space-y-1">
            <label className="block text-xs font-extrabold text-[#1e293b] flex items-center gap-1">
              <span>💡 상세 설명 (근무 패턴 / 클래스)</span> <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="예: 주6일 일 휴무, 금일, 주5일 (수목휴무) 등"
              value={empDescription}
              onChange={(e) => setEmpDescription(e.target.value)}
              className="w-full text-sm font-bold rounded-md border border-[#94a3b8] focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10 p-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all duration-150"
            />

            {/* Visual Quick Recommendation Patterns to extremely simplify user interaction */}
            <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-[#e2e8f0]">
              <span className="text-[10px] text-slate-500 font-bold self-center mr-1">추천 패턴:</span>
              {["주6일 일 휴무", "수목 휴무", "토일", "금일", "일월", "3주 목<->토", "월화", "화수", "평일마감 주말오픈"].map((pat) => (
                <button
                  key={pat}
                  type="button"
                  onClick={() => setEmpDescription(pat)}
                  className="px-1.5 py-0.5 text-[9px] bg-white hover:bg-slate-100 border border-[#cbd5e1] hover:border-slate-400 rounded text-slate-700 font-semibold cursor-pointer transition duration-100"
                >
                  {pat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                <span>직원 성명</span> <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="예: 홍길동"
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
              />
            </div>
          </div>

          {/* ── 구분 (Classification) — used for filters ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Briefcase size={13} /> 구분 <span className="text-rose-500">*</span>
              <span className="text-[10px] font-normal text-slate-400 normal-case ml-1">업무 분류 (필터에 사용)</span>
            </label>
            <div className="flex flex-wrap gap-1">
              {(["약사", "캐셔", "물류"] as const).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => { setEmpPosition(pos); setEmpCustomPosition(""); if (pos !== "물류") setEmpZoneNums([]); }}
                  className={`px-2.5 py-1 text-[11px] rounded-lg transition font-bold cursor-pointer border ${
                    empPosition === pos
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {pos}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEmpPosition("기타")}
                className={`px-2.5 py-1 text-[11px] rounded-lg transition font-bold cursor-pointer border ${
                  !["약사", "캐셔", "물류"].includes(empPosition) && empPosition !== ""
                    ? "bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                기타
              </button>
            </div>
            {(empPosition === "기타" || (!["약사", "캐셔", "물류", ""].includes(empPosition))) && (
              <input
                type="text"
                placeholder="직접 입력"
                value={empCustomPosition}
                onChange={(e) => setEmpCustomPosition(e.target.value)}
                className="w-full mt-1.5 text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
              />
            )}
          </div>

          {/* ── 구역 배정 (물류 직원 전용) ── */}
          {(empPosition === "물류") && (
            <div className="border border-violet-200 bg-violet-50/40 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-violet-800 flex items-center gap-1.5">
                  <MapPin size={13} className="text-violet-600" />
                  담당 구역 배정
                  <span className="text-[10px] font-normal text-violet-500">(복수 선택 가능)</span>
                </label>
                <div className="flex items-center gap-2">
                  {empZoneNums.length > 0 && (
                    <span className="text-[10px] font-black text-violet-700 bg-violet-100 border border-violet-200 px-2 py-0.5 rounded-full">
                      {empZoneNums.length}개 선택
                    </span>
                  )}
                  {empZoneNums.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEmpZoneNums([])}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer transition"
                    >
                      전체 해제
                    </button>
                  )}
                </div>
              </div>

              {/* 섹션별 구역 목록 */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                {(["top_wall", "aisle", "left_wall", "bottom_wall", "wing"] as const).map((section) => {
                  const zones = ZONE_DEFS.filter(z => z.section === section);
                  return (
                    <div key={section}>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">
                        {SECTION_LABEL[section]}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {zones.map((z) => {
                          const isOn = empZoneNums.includes(z.num);
                          return (
                            <button
                              key={z.num}
                              type="button"
                              onClick={() =>
                                setEmpZoneNums(prev =>
                                  isOn ? prev.filter(n => n !== z.num) : [...prev, z.num]
                                )
                              }
                              className={`px-1.5 py-1 rounded-lg border text-left transition-all cursor-pointer active:scale-[0.96] ${
                                isOn
                                  ? "bg-violet-100 border-violet-400 shadow-sm"
                                  : "bg-white border-slate-200 hover:border-violet-300 hover:bg-violet-50"
                              }`}
                              title={z.category}
                            >
                              <span className={`text-[10px] font-black leading-none ${isOn ? "text-violet-800" : "text-slate-600"}`}>
                                {z.num}
                              </span>
                              <span className={`text-[8px] ml-0.5 ${isOn ? "text-violet-600" : "text-slate-400"}`}>
                                {z.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 직급 (Rank) — separate, independent field ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              직급
              <span className="text-[10px] font-normal text-slate-400 normal-case ml-1">직위/직책 (선택)</span>
            </label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {(["대표", "이사", "부장", "팀장", "과장", "사원", "알바"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setEmpRank(prev => prev === r ? "" : r)}
                  className={`px-2.5 py-1 text-[11px] rounded-lg transition font-bold cursor-pointer border ${
                    empRank === r
                      ? "bg-amber-50 text-amber-700 border-amber-300 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="직접 입력 또는 위 버튼 선택"
              value={empRank}
              onChange={(e) => setEmpRank(e.target.value)}
              className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              연간 월차
              <span className="text-[10px] font-normal text-slate-400 normal-case ml-1">총 부여 일수 (0 = 미설정)</span>
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={empAnnualLeave || ""}
              onChange={(e) => setEmpAnnualLeave(parseInt(e.target.value) || 0)}
              placeholder="예: 15"
              className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Calendar size={13} /> 입사일
            </label>
            <input
              type="date"
              value={empHireDate}
              onChange={(e) => setEmpHireDate(e.target.value)}
              className="w-full text-xs rounded border border-[#e2e8f0] focus:border-[#2563eb] p-2 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              근무 형태 <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-3 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg flex-wrap">
              {employmentTypes.map((et) => (
                <label key={et} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                  <input
                    type="radio"
                    name="empEmploymentType"
                    value={et}
                    checked={empEmploymentType === et}
                    onChange={() => setEmpEmploymentType(et)}
                    className="cursor-pointer"
                  />
                  <span>{et === "정직원" ? "🟢 정직원" : et === "계약직" ? "🔵 계약직" : "🟡 알바"}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              성별
            </label>
            <div className="flex gap-3 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg">
              {(["남", "여"] as const).map((g) => (
                <label key={g} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                  <input
                    type="radio"
                    name="empGender"
                    value={g}
                    checked={empGender === g}
                    onChange={() => setEmpGender(g)}
                    className="cursor-pointer"
                  />
                  <span>{g === "남" ? "♂ 남자" : "♀ 여자"}</span>
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-500">
                <input
                  type="radio"
                  name="empGender"
                  value=""
                  checked={empGender === ""}
                  onChange={() => setEmpGender("")}
                  className="cursor-pointer"
                />
                <span>미지정</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1 flex items-center gap-1">
              근무부서 / 근무지 <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-4 p-2 bg-slate-50 border border-[#e2e8f0] rounded-lg">
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                <input
                  type="radio"
                  name="empWorkplace"
                  value="매장"
                  checked={empWorkplace === "매장"}
                  onChange={() => setEmpWorkplace("매장")}
                  className="cursor-pointer"
                />
                <span>🏬 매장 (기본)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-slate-700">
                <input
                  type="radio"
                  name="empWorkplace"
                  value="창고"
                  checked={empWorkplace === "창고"}
                  onChange={() => setEmpWorkplace("창고")}
                  className="cursor-pointer"
                />
                <span>📦 창고 (물류)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-slate-50 hover:bg-slate-100 rounded border border-[#e2e8f0] text-slate-650 text-slate-600 transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold bg-[#2563eb] hover:bg-blue-700 text-white rounded transition cursor-pointer"
            >
              {empModalMode === "edit" ? "수정 완료" : "등록 완료"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
