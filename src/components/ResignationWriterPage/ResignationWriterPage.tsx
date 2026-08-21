// 2026-08-17 · apiClient 마이그레이션
// src/components/ResignationWriterPage/ResignationWriterPage.tsx
// 사직서 작성 페이지 · 2026-08-03 · #179+#181
// - 좌측: 조건 입력 폼 (직원·부서/직급·입사일·마지막근무일·사유·상세사유·인수인계)
//   · 서명란은 좌측에서 제거 · 오른쪽 프리뷰 안에서 서명 spot 클릭
// - 우측: 실시간 표준 사직서 렌더 (한국 표준 양식 · 근로기준법 관례)
//   · 서명 spot 3개 (신청인·금품·기타) 클릭 → 서명 모달
//   · 프리뷰 하단 · PDF 다운로드 버튼
// - [사직서 제출] · POST /api/resignations · 관리자 알림
// - PDF · A4 세로 1페이지 fit (넘치면 scale down)
// - 직원 · 세션 자동 채움 · 자유 편집 가능
// - iOS/Gemini/ContractWriterPage 참조만 · 절대 수정 안 함
//
// 2026-08-05 · 서명 UX 개편:
//   1) 왼쪽 폼에서 서명 카드 3개 제거
//   2) 프리뷰 안 서명 spot 클릭 → 모달 오픈 → SignaturePad → 저장
//   3) PDF 다운 버튼 오른쪽 프리뷰 하단으로 이동
//   4) PDF A4 1페이지 fit · 넘치면 scale down
//
// 준수 원칙:
//   - memory feedback_ui_principles · 최소 14px · 3단 위계 · 고급 톤
//   - memory feedback_ui_consult · 통일된 디자인 · slate + rose 팔레트 · rounded-xl · shadow-sm
//   - memory feedback_git_push · remote push 절대 금지
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../../lib/apiClient";
import { useConfirm } from "../../hooks/useConfirm";
import {
  SignOut, User, ClipboardText, CalendarBlank, Notepad, Eraser,
  DownloadSimple, ArrowsClockwise, Warning, Check, Buildings, Signature,
  PaperPlaneTilt, Cake, Money, ShieldCheck, X,
} from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
// 2026-08-12 · 공통 SplitPanel · 좌우 폭 드래그 조절
import SplitPanel from "../common/SplitPanel";
import { AccentBar } from "../common/AccentBar";
import { Card } from "../common/Card";
import html2canvas from "html2canvas-pro"; // 2026-08-04 · Tailwind v4 oklch 지원 · drop-in 교체
import jsPDF from "jspdf";

import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import { FieldLabel } from "../common/FieldLabel";
import type { AuthSession, Employee } from "../../types";
import { DEFAULT_COMPANY_INFO } from "../../types";
import { useCompanyInfo } from "../../hooks/useCompanyInfo";

type SignatureCanvasType = SignaturePad;

// 2026-08-21 · Framework Phase 4 · large-file 분리
import type { ResignationForm, SignSlot } from "./types";
import {
  REASON_OPTIONS, DEFAULT_COMPANY, buildDefaultRecipient, DEFAULT_RECIPIENT, SIGN_LABELS,
  todayIso, addDaysIso, addDaysToIso, fmtKoreanDate, calcTenure, emptyForm,
} from "./utils";

interface ResignationWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true · 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

// FieldLabel · 공통 컴포넌트 사용 (../common/FieldLabel) · 2026-08-03 (#199)

// ─────────────────────────────────────────────────────────────────────────────
// 서명 모달 (오른쪽 프리뷰 서명 spot 클릭 시 오픈)
// ─────────────────────────────────────────────────────────────────────────────

const SignatureModal: React.FC<{
  open: boolean;
  slot: SignSlot | null;
  initialDataUrl: string | null;
  onSave: (dataUrl: string | null) => void;
  onClose: () => void;
}> = ({ open, slot, initialDataUrl, onSave, onClose }) => {
  const padRef = useRef<SignatureCanvasType | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 480, h: 200 });
  const [empty, setEmpty] = useState(true);

  // 모달 열릴 때 · 캔버스 초기화 + 이전 서명 로드
  useEffect(() => {
    if (!open) return;
    // 초기 렌더 · resize 후에 initialDataUrl 반영
    const t = setTimeout(() => {
      if (padRef.current) {
        padRef.current.clear();
        if (initialDataUrl) {
          padRef.current.fromDataURL(initialDataUrl);
          setEmpty(false);
        } else {
          setEmpty(true);
        }
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, initialDataUrl]);

  // 반응형 캔버스 사이즈 (모달 폭 기준)
  useEffect(() => {
    if (!open) return;
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(280, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 200 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };
  const handleSave = () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      onSave(null);
      return;
    }
    try {
      const url = padRef.current.toDataURL("image/png");
      onSave(url);
    } catch {
      onSave(null);
    }
  };

  return (
    // 2026-08-17 v2 · Modal 통일
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-brand p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-brand-modal w-full max-w-2xl border border-line flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2.5">
            <AccentBar size="lg" />
            <Signature size={17} weight="fill" className="text-brand-deep" />
            <h3 className="text-[17px] font-bold tracking-tight text-ink">
              {slot ? SIGN_LABELS[slot] : "서명"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-ink-soft hover:bg-zinc-100 flex items-center justify-center cursor-pointer transition-colors"
            title="닫기"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* 캔버스 */}
        <div className="p-5">
          <div
            ref={wrapperRef}
            className="relative bg-white border-2 border-dashed border-brand-tint rounded-xl overflow-hidden"
            style={{ height: size.h + 2 }}
          >
            <SignaturePad
              ref={(el) => { padRef.current = el; }}
              canvasProps={{
                width: size.w,
                height: size.h,
                className: "block bg-white touch-none",
                style: { width: `${size.w}px`, height: `${size.h}px` },
              }}
              penColor="#0A2E4A"
              onEnd={() => { if (padRef.current) setEmpty(padRef.current.isEmpty()); }}
              onBegin={() => setEmpty(false)}
            />
            {empty && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[17px] text-zinc-300 font-bold select-none">
                여기에 서명해 주세요
              </span>
            )}
          </div>
          <p className="text-[17px] text-ink-soft mt-2.5">
            마우스·터치로 서명하세요. 저장 시 오른쪽 사직서에 즉시 반영됩니다.
          </p>
        </div>

        {/* 액션 */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-line bg-zinc-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[17px] font-bold transition-colors cursor-pointer"
          >
            <Eraser size={14} />
            지우기
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[17px] font-bold transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] text-white text-[17px] font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Check size={14} weight="bold" />
              서명 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 실시간 사직서 프리뷰 (우측)
// ─────────────────────────────────────────────────────────────────────────────

const ResignationPreview = React.forwardRef<HTMLDivElement, {
  form: ResignationForm;
  employeeSignUrl: string | null;
  payoutSignUrl: string | null;
  otherSignUrl: string | null;
  onSignClick: (slot: SignSlot) => void;
}>(({ form, employeeSignUrl, payoutSignUrl, otherSignUrl, onSignClick }, ref) => {
  const tenure = calcTenure(form.hireDate, form.lastWorkDate);
  const reasonText = form.reason === "기타" && form.reasonDetail
    ? form.reasonDetail
    : form.reason;

  // 서명 spot 재사용 · 클릭하면 모달 오픈 · 인쇄/PDF 시에는 배경만 사라지고 서명만 보이도록
  const SignSpot: React.FC<{
    slot: SignSlot;
    dataUrl: string | null;
  }> = ({ slot, dataUrl }) => (
    <button
      type="button"
      onClick={() => onSignClick(slot)}
      className="w-32 h-14 border-b-2 border-zinc-800 flex items-end justify-center relative group cursor-pointer transition-colors hover:bg-brand-tint/40 print:hover:bg-transparent"
      title={dataUrl ? "서명 수정" : "클릭하여 서명"}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="서명" className="max-h-14 max-w-full object-contain" />
      ) : (
        <span className="text-[17px] text-zinc-400 font-bold group-hover:text-brand transition-colors">
          클릭하여 서명
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={ref}
      className="bg-white text-zinc-900 border border-line rounded-xl shadow-sm p-6 sm:p-10 mx-auto"
      style={{
        width: "100%",
        maxWidth: "780px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.8,
      }}
    >
      {/* 제목 */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold tracking-[0.3em] text-ink">
          사&nbsp;직&nbsp;서
        </h2>
      </div>

      {/* [1] 사직서 정보 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">사직서 정보</span>
        </div>
        <table className="w-full text-[18px] border-collapse">
          <tbody>
            <tr className="border-t-2 border-zinc-800">
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">성명</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{form.employeeName || "-"}</td>
              <th className="w-[110px] py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">생년월일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.birthDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">부서 / 직급</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">
                {form.department || "-"}{form.position ? ` / ${form.position}` : ""}
              </td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">입사일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.hireDate) || "-"}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">사직일<br/><span className="text-[17px] font-semibold text-ink-soft">(마지막 근무일)</span></th>
              <td className="py-2 px-3 text-ink font-bold border-b border-line">{fmtKoreanDate(form.lastWorkDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">근속기간</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{tenure}</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">사직서 제출일</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{fmtKoreanDate(form.submitDate) || "-"}</td>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b border-line pl-3">수신</th>
              <td className="py-2 px-3 text-ink font-semibold border-b border-line">{form.recipient || "-"} 귀하</td>
            </tr>
            <tr>
              <th className="py-2 pr-3 text-left font-bold text-zinc-700 bg-zinc-50 border-b-2 border-zinc-800 pl-3 align-top">사유</th>
              <td className="py-2 px-3 text-ink font-semibold border-b-2 border-zinc-800 leading-7" colSpan={3}>
                상기자는 <span className="font-bold">{reasonText || "일신상의 사유"}</span>(으)로 사직하고자 하오니 처리하여 주시기 바랍니다.
              </td>
            </tr>
          </tbody>
        </table>

        {/* 사유 상세 (기타 사유가 아닌 경우에만 별도 표시) */}
        {form.reasonDetail && form.reason !== "기타" && (
          <div className="mt-3 pl-3 text-[17px] text-ink-soft whitespace-pre-wrap leading-7">
            <span className="font-bold text-ink-soft">· 상세: </span>
            {form.reasonDetail}
          </div>
        )}

        {/* 인수인계 사항 */}
        {form.handoverNotes && (
          <div className="mt-3 pl-3 text-[17px] text-ink-soft whitespace-pre-wrap leading-7">
            <span className="font-bold text-ink-soft">· 인수인계: </span>
            {form.handoverNotes}
          </div>
        )}
      </div>

      {/* [2] 임금·퇴직금 등 금품 지급기일 동의 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">임금, 퇴직금 등 금품 지급기일 동의</span>
        </div>
        <div className="text-[17px] text-ink leading-7 px-2 py-2">
          상기 본인은 퇴직일 현재 이미 발생한 임금, 퇴직금, 그 밖의 일체의 금품을{" "}
          <span className="font-bold">「{fmtKoreanDate(form.payoutDate) || "지급일"}」</span>에 지급받는 것에 동의합니다.
        </div>
        <div className="flex items-center justify-end gap-3 text-[18px] text-ink mt-2 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-bold">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="payout" dataUrl={payoutSignUrl} />
        </div>
      </div>

      {/* [3] 기타 사항 동의 */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AccentBar h={15} />
          <span className="text-[18px] font-bold tracking-tight text-brand-deep">기타 사항 동의</span>
        </div>
        <ol className="list-decimal pl-6 text-[17px] text-ink leading-7 space-y-2">
          <li>
            상기 본인은 귀사와 근로관계 중 근로에 대한 임금(연장, 야간, 휴일), 퇴직금(발생 시),
            연차미사용수당(발생 시), 휴일 및 휴게시간 등 노동관계법령상 권리를 부여 및 지급 받았음을
            확인하며, 추후 노동관계법령상 권리에 관하여 민사, 형사, 행정상 이의를 제기하지 않을 것을
            동의합니다.
          </li>
          <li>
            귀사와의 근로관계 중 알게된 영업비밀, 고객정보 및 경영상 관련 정보 일체를 누설하지 않을 것을
            동의합니다.
          </li>
        </ol>
        <div className="flex items-center justify-end gap-3 text-[18px] text-ink mt-3 pr-2">
          <span className="font-semibold">동의자</span>
          <span className="font-bold">{form.employeeName || "-"}</span>
          <span className="font-semibold">(서명)</span>
          <SignSpot slot="other" dataUrl={otherSignUrl} />
        </div>
      </div>

      {/* 작성일 · 신청인 서명 */}
      <div className="mt-10">
        <div className="text-center text-[17px] text-ink font-semibold mb-6">
          {fmtKoreanDate(form.submitDate || todayIso())}
        </div>

        <div className="flex flex-col items-end gap-3 pr-2">
          <div className="flex items-center gap-3 text-[18px] text-ink">
            <span className="font-semibold">신청인</span>
            <span className="font-bold">{form.employeeName || "-"}</span>
            <span className="font-semibold">(서명)</span>
            <SignSpot slot="employee" dataUrl={employeeSignUrl} />
          </div>
        </div>

        {/* 수신 · 대표자 */}
        <div className="mt-8 pt-4 border-t-2 border-zinc-800 text-center">
          <div className="text-[17px] font-bold text-ink tracking-wider">
            {form.recipient || `${form.companyName} 대표`} <span className="ml-1">귀하</span>
          </div>
        </div>
      </div>
    </div>
  );
});
ResignationPreview.displayName = "ResignationPreview";

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────

const ResignationWriterPage: React.FC<ResignationWriterPageProps> = ({
  authSession, onBack, onNavigate, onLogout, embedded = false,
}) => {
  const confirm = useConfirm();

  const [form, setForm] = useState<ResignationForm>(() => emptyForm());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [employeeSignUrl, setEmployeeSignUrl] = useState<string | null>(null);
  const [payoutSignUrl, setPayoutSignUrl] = useState<string | null>(null);
  const [otherSignUrl, setOtherSignUrl] = useState<string | null>(null);

  // 서명 모달 state
  const [signModalSlot, setSignModalSlot] = useState<SignSlot | null>(null);

  // ── T-CompanyInfo-Universal (2026-08-07) · 사업장 정보 서버 로드 ─────
  //   · settings.company_info 에서 회사명·대표자·주소·사업자번호 로드
  //   · 로드 완료 시 · form 의 회사 필드가 하드코딩 default 와 동일한 경우만 덮어씀
  //     (사용자가 이미 편집했으면 유지 · ContractWriterPage 와 동일 패턴)
  const { info: companyInfo, loaded: companyInfoLoaded } = useCompanyInfo();
  const companyInfoAppliedRef = useRef(false);
  useEffect(() => {
    if (!companyInfoLoaded) return;
    if (companyInfoAppliedRef.current) return;
    companyInfoAppliedRef.current = true;
    setForm(prev => {
      const isDefaultCompanyName = prev.companyName === DEFAULT_COMPANY.companyName || prev.companyName === "";
      const isDefaultEmployerName = prev.employerName === DEFAULT_COMPANY.employerName || prev.employerName === "";
      // recipient · 기본형(`<회사명> 대표`) 인 경우에만 갱신
      const isDefaultRecipient =
        prev.recipient === DEFAULT_RECIPIENT ||
        prev.recipient === buildDefaultRecipient(DEFAULT_COMPANY.companyName) ||
        prev.recipient === "";
      return {
        ...prev,
        companyName: isDefaultCompanyName ? companyInfo.name : prev.companyName,
        employerName: isDefaultEmployerName ? companyInfo.representativeName : prev.employerName,
        recipient: isDefaultRecipient ? buildDefaultRecipient(companyInfo.name) : prev.recipient,
      };
    });
  }, [companyInfoLoaded, companyInfo]);

  // ── 직원 목록 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1;
        const { data } = await api.get<any>(`/api/schedules?year=${y}&month=${m}`);
        if (cancelled) return;
        const list = Array.isArray(data?.employees) ? data.employees : [];
        setEmployees(list);
      } catch (err: any) {
        if (!cancelled) setEmpError(err instanceof ApiError ? err.message : (err?.message ?? "직원 목록 불러오기 실패"));
      } finally {
        if (!cancelled) setEmpLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 세션 자동 채움 (최초 마운트 · 직원 목록 로드 완료 시) ────────────
  useEffect(() => {
    if (form.employeeId != null) return; // 이미 채워짐
    const sessId = authSession?.employeeId;
    if (!sessId) return;
    const me = employees.find(e => e.id === sessId);
    if (!me) return;
    onSelectEmployee(String(me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, authSession?.employeeId]);

  // ── 필드 업데이트 ────────────────────────────────────────────────────
  const upd = useCallback(<K extends keyof ResignationForm>(key: K, val: ResignationForm[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  // 사직일 변경 시 · 지급일 미변경(자동) 상태면 재계산 (근로기준법 · 14일 이내 관례)
  // → 사용자가 직접 조정한 경우엔 그대로 유지
  useEffect(() => {
    // 별도 자동추적 하지 않음 · 사용자가 자유롭게 조정
  }, [form.lastWorkDate]);

  // ── 직원 선택 · 자동 채움 ─────────────────────────────────────────────
  const onSelectEmployee = (empIdRaw: string) => {
    if (!empIdRaw) {
      upd("employeeId", null);
      return;
    }
    const empId = Number(empIdRaw);
    const emp = employees.find(e => e.id === empId);
    if (!emp) { upd("employeeId", empId); return; }
    setForm(prev => ({
      ...prev,
      employeeId: emp.id,
      employeeName: emp.name || prev.employeeName,
      employeeNo: String(emp.id ?? prev.employeeNo),
      department: (emp as any).workplace || prev.department, // "매장"/"창고"
      position: emp.position || prev.position,               // "약사"/"매장"/"창고"/...
      hireDate: (emp as any).hire_date || (emp as any).hireDate || prev.hireDate,
      birthDate: (emp as any).birth_date || (emp as any).birthDate || prev.birthDate,
    }));
  };

  const handleReset = async () => {
    if (!await confirm({ message: "입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?", danger: true })) return;
    setForm(emptyForm());
    setEmployeeSignUrl(null);
    setPayoutSignUrl(null);
    setOtherSignUrl(null);
    setNotice(null);
  };

  // ── 서명 모달 open/save ───────────────────────────────────────────────
  const currentSignUrl = signModalSlot === "employee" ? employeeSignUrl
    : signModalSlot === "payout" ? payoutSignUrl
    : signModalSlot === "other" ? otherSignUrl
    : null;

  const handleSignSave = (dataUrl: string | null) => {
    if (signModalSlot === "employee") setEmployeeSignUrl(dataUrl);
    else if (signModalSlot === "payout") setPayoutSignUrl(dataUrl);
    else if (signModalSlot === "other") setOtherSignUrl(dataUrl);
    setSignModalSlot(null);
  };

  // ── PDF 다운로드 (A4 풀폭 · 페이지 분할) ─────────────────────────────
  // T-PDF-FullWidth 전략:
  //   1) html2canvas 로 프리뷰 캡처
  //   2) imgW = A4 풀폭(210mm) · margin 없음
  //   3) 세로 비율 계산 후 · 1페이지 초과 시 pdfH 씩 슬라이스 분할
  const generatePdfBlob = async (): Promise<{ blob: Blob } | null> => {
    const node = previewRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pdfW = pdf.internal.pageSize.getWidth();   // 210
    const pdfH = pdf.internal.pageSize.getHeight();  // 297

    // 가로 풀폭 고정 · 세로 비율 계산
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;

    if (imgH <= pdfH) {
      // 1페이지 이내 · 상단 붙임
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      // 다중 페이지 · pdfH 씩 슬라이스
      let yOffset = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(imgData, "PNG", 0, -yOffset, imgW, imgH, undefined, "FAST");
        remaining -= pdfH;
        yOffset += pdfH;
        if (remaining > 0) pdf.addPage();
      }
    }

    const blob = pdf.output("blob");
    return { blob };
  };

  const handleDownloadPdf = async () => {
    setNotice(null);
    // T-PDF-SignatureRequired: 신청인 서명 필수
    if (!employeeSignUrl) {
      setNotice({ tone: "err", text: "서명 후 저장 가능합니다. 신청인 서명이 필요합니다." });
      return;
    }
    setGenerating(true);
    try {
      const out = await generatePdfBlob();
      if (!out) throw new Error("사직서 프리뷰를 찾을 수 없습니다.");
      const safeName = (form.employeeName || "근로자").replace(/[\\/:*?"<>|]/g, "_");
      const safeDate = (form.lastWorkDate || todayIso()).replace(/-/g, "");
      // jsPDF save 대신 · 브라우저 다운로드 (blob URL)
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `사직서_${safeName}_${safeDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice({ tone: "ok", text: "PDF 다운로드가 시작되었습니다." });
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "PDF 생성에 실패했습니다." });
    } finally {
      setGenerating(false);
    }
  };

  // ── 사직서 제출 (DB + 관리자 알림) ────────────────────────────────────
  const handleSubmit = async () => {
    setNotice(null);

    // 검증
    if (!form.employeeId || !form.employeeName.trim()) {
      setNotice({ tone: "err", text: "성명을 선택하거나 입력하세요." });
      return;
    }
    if (!form.lastWorkDate) {
      setNotice({ tone: "err", text: "사직 희망일을 입력하세요." });
      return;
    }
    if (!form.reason.trim()) {
      setNotice({ tone: "err", text: "퇴사 사유를 선택하세요." });
      return;
    }
    // 2026-08-07 · 신청인 서명 필수 (사용자 요청)
    if (!employeeSignUrl) {
      setNotice({ tone: "err", text: "신청인 서명이 필요합니다. 사직서 우측 미리보기에서 서명해 주세요." });
      return;
    }

    // 서명 dataURL (in-DB 저장용 · 신청인 서명)
    const signatureDataUrl: string | null = employeeSignUrl;

    setSubmitting(true);
    try {
      await api.post("/api/resignations", {
        employee_id: form.employeeId,
        employee_name: form.employeeName,
        position: form.position || null,
        hire_date: form.hireDate || null,
        last_work_date: form.lastWorkDate,
        reason: form.reason,
        reason_detail: form.reasonDetail || null,
        handover_notes: form.handoverNotes || null,
        signature_data_url: signatureDataUrl,
        pdf_url: null, // MVP · 별도 스토리지 업로드는 후속 개선
      });
      setNotice({ tone: "ok", text: "사직서가 제출되었습니다. 관리자에게 알림이 전송되었습니다." });
      // 승인대기 배지 즉시 갱신
      window.dispatchEvent(new CustomEvent("approval-count-updated"));
    } catch (err: any) {
      setNotice({ tone: "err", text: err instanceof ApiError ? err.message : (err?.message ?? "사직서 제출에 실패했습니다.") });
    } finally {
      setSubmitting(false);
    }
  };

  // 오늘 이후만 선택 가능
  const minLastWorkDate = todayIso();

  const _tenure = useMemo(
    () => calcTenure(form.hireDate, form.lastWorkDate),
    [form.hireDate, form.lastWorkDate]
  );

  // ── 렌더 ─────────────────────────────────────────────────────────────
  return (
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-zinc-50 flex flex-col"}>
      {!embedded && (
        <AppNavHeader
          activePage={"business-manage" as AppNavPage}
          authSession={authSession}
          onBack={onBack}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-3 sm:px-5 py-5 flex flex-col gap-4">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-tint text-brand-deep flex items-center justify-center flex-shrink-0">
              <SignOut size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-[20px] sm:text-[22px] font-extrabold tracking-tight text-ink leading-none">사직서 작성</h1>
              <p className="text-[17px] text-ink-soft mt-1 leading-snug">
                좌측에서 조건을 입력하면 우측에 표준 사직서가 실시간 생성됩니다. 서명 spot 클릭 후 제출하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-line bg-white text-ink-soft hover:bg-zinc-50 text-[17px] font-semibold transition-colors cursor-pointer"
              title="초기화"
            >
              <ArrowsClockwise size={14} />
              <span className="hidden sm:inline">초기화</span>
            </button>
          </div>
        </div>

        {/* 안내 배너 */}
        {notice && (
          <div
            className={`rounded-lg border px-4 py-2.5 text-[17px] font-semibold flex items-center gap-2 ${
              notice.tone === "ok"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            {notice.tone === "ok" ? <Check size={15} weight="bold" /> : <Warning size={15} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* 2026-08-12 · SplitPanel 공통 컴포넌트 사용 · 좌우 폭 드래그 조절 · localStorage 저장 */}
        <SplitPanel
          storageKey="resignationWriter.listWidth"
          defaultWidth={480}
          minWidth={320}
          maxWidth={900}
          dividerColor="indigo"
          wrapLeft={false}
          wrapRight={false}
          left={
          <Card as="section" padding="none" className="p-4 sm:p-5 flex flex-col gap-4 order-2 lg:order-1">
            {/* 섹션 헤더 */}
            <div className="flex items-center gap-2.5 pb-3 border-b border-line">
              <AccentBar h={17} />
              <ClipboardText size={15} weight="fill" className="text-brand-deep" />
              <h2 className="text-[17px] font-bold tracking-tight text-ink">사직서 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div className="flex flex-col gap-2">
              <FieldLabel icon={<User size={13} weight="fill" className="text-ink-soft" />} required>
                근로자 정보
              </FieldLabel>
              {empError && <div className="text-[17px] text-rose-600">{empError}</div>}
              {/* 성명 + 사번 한 줄 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={form.employeeName}
                    onChange={(e) => {
                      const val = e.target.value;
                      upd("employeeName", val);
                      setEmpSearchOpen(true);
                      if (form.employeeId != null) upd("employeeId", null);
                    }}
                    onFocus={() => setEmpSearchOpen(true)}
                    onBlur={() => setTimeout(() => setEmpSearchOpen(false), 200)}
                    placeholder={empLoading ? "직원 불러오는 중..." : "성명 입력 → 검색"}
                    autoComplete="off"
                    className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                  />
                  {empSearchOpen && form.employeeName.trim() && (() => {
                    const q = form.employeeName.trim().toLowerCase();
                    const matches = employees
                      .filter(e => (e.name ?? "").toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) return (
                      <Card variant="raw-lg" padding="none" className="absolute left-0 right-0 top-full mt-1 z-30 p-2.5 text-[17px] text-ink-soft text-center">
                        일치하는 직원 없음 · 직접 입력 가능
                      </Card>
                    );
                    return (
                      <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-line rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-zinc-100">
                        {matches.map(e => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                onSelectEmployee(String(e.id));
                                setEmpSearchOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-brand-tint transition-colors flex items-center gap-2"
                            >
                              <span className="text-[17px] font-bold text-ink">{e.name}</span>
                              {e.position && (
                                <span className="text-[17px] text-ink-soft">{e.position}</span>
                              )}
                              {e.phone && (
                                <span className="text-[17px] text-ink-soft ml-auto tabular-nums">{e.phone}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
                <input
                  type="text"
                  value={form.employeeNo}
                  onChange={(e) => upd("employeeNo", e.target.value)}
                  placeholder="사번 (자동)"
                  className="bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
              </div>
              {/* 부서 + 직급 한 줄 */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => upd("department", e.target.value)}
                  placeholder="부서 (예: 매장·창고)"
                  className="bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => upd("position", e.target.value)}
                  placeholder="직급 (예: 약사·사원)"
                  className="bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
              </div>
              {/* 생년월일 + 입사일 한 줄 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[17px] text-ink-soft font-semibold mb-1 flex items-center gap-1">
                    <Cake size={12} weight="fill" />생년월일
                  </div>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => upd("birthDate", e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors"
                  />
                </div>
                <div>
                  <div className="text-[17px] text-ink-soft font-semibold mb-1">입사일</div>
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) => upd("hireDate", e.target.value)}
                    className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors"
                  />
                </div>
              </div>
              {/* 근속기간 (자동) */}
              <div>
                <div className="text-[17px] text-ink-soft font-semibold mb-1">근속기간 (자동)</div>
                <div className="w-full bg-zinc-50 border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold">
                  {_tenure}
                </div>
              </div>
            </div>

            {/* 사직 정보 */}
            <div className="flex flex-col gap-2">
              <FieldLabel icon={<CalendarBlank size={13} weight="fill" className="text-ink-soft" />} required>
                사직일 (마지막 근무일)
              </FieldLabel>
              <input
                type="date"
                value={form.lastWorkDate}
                min={minLastWorkDate}
                onChange={(e) => upd("lastWorkDate", e.target.value)}
                className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors"
              />
              <p className="text-[17px] text-ink-soft leading-snug">
                통상 최소 30일 전 통보 관례 · 회사와 협의하여 조정 가능
              </p>
            </div>

            {/* 제출일 + 수신 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel icon={<CalendarBlank size={13} weight="fill" className="text-ink-soft" />}>
                  사직서 제출일
                </FieldLabel>
                <input
                  type="date"
                  value={form.submitDate}
                  onChange={(e) => upd("submitDate", e.target.value)}
                  className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors"
                />
              </div>
              <div>
                <FieldLabel icon={<Buildings size={13} weight="fill" className="text-ink-soft" />}>
                  수신
                </FieldLabel>
                <input
                  type="text"
                  value={form.recipient}
                  onChange={(e) => upd("recipient", e.target.value)}
                  placeholder="예: 코스트팜(Costpharm) 대표"
                  className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
              </div>
            </div>

            {/* 퇴사 사유 (2026-08-05 · 4가지) */}
            <div className="flex flex-col gap-2">
              <FieldLabel required>퇴사 사유</FieldLabel>
              <div className="grid grid-cols-4 gap-1.5">
                {REASON_OPTIONS.map(r => {
                  const active = form.reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => upd("reason", r)}
                      className={`px-2 py-2 rounded-lg border text-[17px] font-bold transition-colors cursor-pointer ${
                        active
                          ? "bg-brand-deep text-white border-brand-deep shadow-sm"
                          : "bg-white border-line text-ink-soft hover:border-brand hover:text-brand"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사유 상세 (textarea) */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Notepad size={13} weight="fill" className="text-ink-soft" />}>
                {form.reason === "기타" ? "기타 사유 (자유 입력)" : "사유 상세 (선택)"}
              </FieldLabel>
              <textarea
                value={form.reasonDetail}
                onChange={(e) => upd("reasonDetail", e.target.value)}
                rows={3}
                placeholder={form.reason === "기타"
                  ? "기타 사유를 직접 입력하세요 (본문에 반영됨)"
                  : "사유에 대한 부연 설명이 필요하면 입력하세요"}
                className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors resize-y placeholder:text-zinc-400 placeholder:text-[17px]"
              />
            </div>

            {/* 인수인계 사항 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Notepad size={13} weight="fill" className="text-ink-soft" />}>
                인수인계 사항 (선택)
              </FieldLabel>
              <textarea
                value={form.handoverNotes}
                onChange={(e) => upd("handoverNotes", e.target.value)}
                rows={3}
                placeholder="담당 업무 · 인수인계할 파일·연락처·주요 진행상황 등"
                className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors resize-y placeholder:text-zinc-400 placeholder:text-[17px]"
              />
            </div>

            {/* 금품 지급기일 */}
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <FieldLabel icon={<Money size={13} weight="fill" className="text-ink-soft" />}>
                금품 지급기일 (임금·퇴직금 등)
              </FieldLabel>
              <input
                type="date"
                value={form.payoutDate}
                onChange={(e) => upd("payoutDate", e.target.value)}
                className="w-full bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors"
              />
              <p className="text-[17px] text-ink-soft leading-snug">
                근로기준법 §36 · 퇴직 후 14일 이내 지급 원칙 · 당사자 합의로 연장 가능
              </p>
            </div>

            {/* 기타 사항 동의 안내 */}
            <div className="flex flex-col gap-2">
              <FieldLabel icon={<ShieldCheck size={13} weight="fill" className="text-ink-soft" />}>
                기타 사항 동의 (권리 확인 · 영업비밀 유지)
              </FieldLabel>
              <div className="bg-brand-tint/60 border border-line rounded-lg px-3 py-2.5 text-[17px] text-ink-soft leading-6">
                <ol className="list-decimal pl-4 space-y-1">
                  <li>노동관계법령상 권리(임금·퇴직금·연차미사용수당·휴게시간 등) 지급 확인 및 이의 미제기</li>
                  <li>재직 중 알게된 영업비밀·고객정보·경영정보 누설 금지</li>
                </ol>
              </div>
            </div>

            {/* 회사 정보 */}
            <div className="flex flex-col gap-2">
              <FieldLabel icon={<Buildings size={13} weight="fill" className="text-ink-soft" />}>
                회사 정보
              </FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => upd("companyName", e.target.value)}
                  placeholder="회사명"
                  className="bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
                <input
                  type="text"
                  value={form.employerName}
                  onChange={(e) => upd("employerName", e.target.value)}
                  placeholder="대표자명"
                  className="bg-white border border-line rounded-lg px-3 py-2 text-[17px] text-ink font-semibold focus:outline-none focus:border-brand-deep focus:ring-2 focus:ring-brand-tint focus:shadow-sm transition-colors placeholder:text-zinc-400 placeholder:text-[17px]"
                />
              </div>
            </div>

            {/* 서명 안내 · 사직서 제출 */}
            <div className="border-t border-line pt-4">
              <div className="bg-brand-tint border border-brand/20 rounded-xl px-4 py-3 text-[17px] text-brand-deep leading-6 mb-4 flex items-start gap-2.5">
                <Signature size={15} weight="fill" className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">서명 안내</span> · 우측 사직서 미리보기의{" "}
                  <span className="font-bold">서명 spot 3곳</span>(신청인·금품 지급기일·기타 사항)을 클릭하여 서명하세요.
                </div>
              </div>

              {/* 사직서 제출 · PDF 다운은 오른쪽으로 이동 */}
              <div className="mt-1 flex flex-col sm:flex-row items-stretch sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || generating}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-brand-deep hover:bg-[#0d3a5c] disabled:opacity-50 text-white text-[17px] font-bold shadow-sm transition-colors cursor-pointer"
                  title="사직서 제출 · 관리자 알림"
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                  <span>{submitting ? "제출 중..." : "사직서 제출"}</span>
                </button>
              </div>
              <p className="text-[17px] text-ink-soft mt-2.5 leading-snug">
                제출 시 관리자에게 알림이 전송되며, 승인 시 자동으로 퇴사일이 반영됩니다.
              </p>
            </div>
          </Card>
          }
          right={
          <section className="order-1 lg:order-2 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 pb-1">
              <AccentBar h={17} />
              <SignOut size={16} weight="fill" className="text-brand-deep" />
              <h2 className="text-[17px] font-bold tracking-tight text-ink">사직서 미리보기</h2>
              <span className="text-[17px] text-ink-soft ml-1">
                서명 spot 클릭 · A4 1페이지 PDF
              </span>
            </div>

            <div className="bg-zinc-100 border border-line rounded-xl p-3 sm:p-4">
              <ResignationPreview
                ref={previewRef}
                form={form}
                employeeSignUrl={employeeSignUrl}
                payoutSignUrl={payoutSignUrl}
                otherSignUrl={otherSignUrl}
                onSignClick={(slot) => setSignModalSlot(slot)}
              />
            </div>

            {/* PDF 다운로드 버튼 · 프리뷰 아래 · T-PDF-SignatureRequired: 신청인 서명 필수 */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={generating || submitting || !employeeSignUrl}
                className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-[17px] font-bold shadow-sm transition-colors
                  ${employeeSignUrl && !generating && !submitting
                    ? "border border-line bg-white hover:bg-zinc-50 text-ink cursor-pointer"
                    : "bg-zinc-200 text-zinc-400 cursor-not-allowed opacity-60"}`}
                title={employeeSignUrl ? "PDF 다운로드 (A4 1페이지)" : "서명 후 저장 가능합니다"}
              >
                <DownloadSimple size={16} weight="bold" />
                <span>{generating ? "생성 중..." : "PDF 다운 (A4 1페이지)"}</span>
              </button>
            </div>
          </section>
          }
        />
      </main>

      {/* 서명 모달 */}
      <SignatureModal
        open={signModalSlot !== null}
        slot={signModalSlot}
        initialDataUrl={currentSignUrl}
        onSave={handleSignSave}
        onClose={() => setSignModalSlot(null)}
      />
    </div>
  );
};

export default ResignationWriterPage;
