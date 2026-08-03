// src/components/ResignationWriterPage/ResignationWriterPage.tsx
// 사직서 작성 페이지 · 2026-08-03 · #179+#181
// - 좌측: 조건 입력 폼 (직원·부서/직급·입사일·마지막근무일·사유·상세사유·인수인계·서명)
// - 우측: 실시간 표준 사직서 렌더 (한국 표준 양식 · 근로기준법 관례)
// - [사직서 제출·PDF 다운] · POST /api/resignations · 관리자 알림
// - 직원 · 세션 자동 채움 · 자유 편집 가능
// - iOS/Gemini/ContractWriterPage 참조만 · 절대 수정 안 함
// 준수 원칙:
//   - memory feedback_ui_principles · 최소 14px · 3단 위계 · 고급 톤
//   - memory feedback_ui_consult · 통일된 디자인 · slate + rose 팔레트 · rounded-xl · shadow-sm
//   - memory feedback_git_push · remote push 절대 금지
//
// 리서치 · 한국 사직서 표준 항목:
//   회사명·대표자 · 근로자 성명·사번·부서/직급 · 입사일·근속기간
//   · 사직 희망일 · 퇴사 사유 · 인수인계 · 서명·작성일
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SignOut, User, ClipboardText, CalendarBlank, Notepad, Eraser,
  DownloadSimple, ArrowsClockwise, Warning, Check, Buildings, Signature,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import SignaturePad from "react-signature-canvas";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import { AppNavHeader, type AppNavPage } from "../AppNavHeader";
import type { AuthSession, Employee } from "../../types";

type SignatureCanvasType = SignaturePad;

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ResignationWriterPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true · 자체 AppNavHeader skip (BusinessManagePage 임베드용) */
  embedded?: boolean;
}

interface ResignationForm {
  // 근로자
  employeeId: number | null;
  employeeName: string;
  employeeNo: string;         // 사번 (있으면)
  department: string;         // 부서
  position: string;           // 직급/직위
  hireDate: string;           // YYYY-MM-DD (입사일)

  // 사직 정보
  lastWorkDate: string;       // YYYY-MM-DD (마지막 근무일 = 사직 희망일)

  // 사유
  reason: string;             // 표준 사유 (드롭다운 · 자유 입력 가능)
  reasonDetail: string;       // 상세 사유 (textarea)
  handoverNotes: string;      // 인수인계 사항 (textarea)

  // 회사
  employerName: string;       // 대표자
  companyName: string;        // 회사명
}

// ─────────────────────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────────────────────

// 표준 사유 (한국 사직서 관례)
const REASON_OPTIONS = [
  "개인 사정",
  "건강상의 이유",
  "이직",
  "학업",
  "결혼",
  "육아",
  "가족 돌봄",
  "기타",
];

// 회사 기본값 (오산 메가타운 약국)
const DEFAULT_COMPANY = {
  employerName: "강남성",
  companyName: "오산 메가타운 약국",
};

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 오늘 + N일
const addDaysIso = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtKoreanDate = (iso: string): string => {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
};

// 근속기간 계산 (입사일 → 마지막 근무일)
const calcTenure = (hire: string, end: string): string => {
  if (!hire) return "-";
  const hd = new Date(hire);
  const ed = end ? new Date(end) : new Date();
  if (isNaN(hd.getTime()) || isNaN(ed.getTime())) return "-";
  let months = (ed.getFullYear() - hd.getFullYear()) * 12 + (ed.getMonth() - hd.getMonth());
  if (ed.getDate() < hd.getDate()) months -= 1;
  if (months < 0) return "-";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem}개월`;
  if (rem === 0) return `${years}년`;
  return `${years}년 ${rem}개월`;
};

const emptyForm = (): ResignationForm => ({
  employeeId: null,
  employeeName: "",
  employeeNo: "",
  department: "",
  position: "",
  hireDate: "",
  lastWorkDate: addDaysIso(30),
  reason: "개인 사정",
  reasonDetail: "",
  handoverNotes: "",
  employerName: DEFAULT_COMPANY.employerName,
  companyName: DEFAULT_COMPANY.companyName,
});

// ─────────────────────────────────────────────────────────────────────────────
// 재사용 · 필드 레이블
// ─────────────────────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{
  icon?: React.ReactNode;
  children: React.ReactNode;
  required?: boolean;
}> = ({ icon, children, required }) => (
  <label className="text-[12px] font-bold text-slate-600 flex items-center gap-1.5 mb-1.5">
    {icon}
    <span>{children}{required && <span className="text-rose-500 ml-0.5">*</span>}</span>
  </label>
);

// ─────────────────────────────────────────────────────────────────────────────
// 서명 캔버스 (react-signature-canvas)
// ─────────────────────────────────────────────────────────────────────────────

const SignArea: React.FC<{
  label: string;
  padRef: React.MutableRefObject<SignatureCanvasType | null>;
}> = ({ label, padRef }) => {
  const [empty, setEmpty] = useState(true);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 300, h: 110 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const w = Math.max(200, Math.floor(e.contentRect.width) - 2);
        setSize({ w, h: 110 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleEnd = () => {
    if (padRef.current) setEmpty(padRef.current.isEmpty());
  };
  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black flex items-center gap-1 text-rose-700">
          <Signature size={13} weight="fill" />
          {label}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-bold transition-colors cursor-pointer bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200"
          title="서명 지우기"
        >
          <Eraser size={11} />
          지우기
        </button>
      </div>

      <div
        ref={wrapperRef}
        className="relative bg-white border-2 border-dashed border-rose-200 rounded-lg overflow-hidden"
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
          penColor="#0f172a"
          onEnd={handleEnd}
          onBegin={() => setEmpty(false)}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-300 text-xs font-bold select-none">
            여기에 서명해 주세요
          </span>
        )}
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
}>(({ form, employeeSignUrl }, ref) => {
  const tenure = calcTenure(form.hireDate, form.lastWorkDate);
  const reasonText = form.reason === "기타" && form.reasonDetail
    ? form.reasonDetail
    : form.reason;

  return (
    <div
      ref={ref}
      className="bg-white text-slate-900 border border-slate-200 rounded-xl shadow-sm p-6 sm:p-10 mx-auto"
      style={{
        width: "100%",
        maxWidth: "780px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.8,
      }}
    >
      {/* 제목 */}
      <div className="text-center mb-10">
        <h2 className="text-3xl font-black tracking-[0.3em] text-slate-900">
          사&nbsp;직&nbsp;서
        </h2>
      </div>

      {/* 인적사항 표 (2열 · 근로계약서와 통일된 톤) */}
      <table className="w-full text-[14px] mb-8 border-collapse">
        <tbody>
          <tr className="border-t-2 border-slate-800">
            <th className="w-[110px] py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">성명</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.employeeName || "-"}</td>
            <th className="w-[110px] py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">사번</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.employeeNo || "-"}</td>
          </tr>
          <tr>
            <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">부서</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.department || "-"}</td>
            <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">직급</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{form.position || "-"}</td>
          </tr>
          <tr>
            <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">입사일</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{fmtKoreanDate(form.hireDate) || "-"}</td>
            <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b border-slate-200 pl-3">근속기간</th>
            <td className="py-2 px-3 text-slate-800 font-semibold border-b border-slate-200">{tenure}</td>
          </tr>
          <tr>
            <th className="py-2 pr-3 text-left font-bold text-slate-700 bg-slate-50 border-b-2 border-slate-800 pl-3">사직 희망일</th>
            <td className="py-2 px-3 text-slate-800 font-black border-b-2 border-slate-800" colSpan={3}>
              {fmtKoreanDate(form.lastWorkDate) || "-"}
              <span className="text-[12px] text-slate-500 font-semibold ml-2">
                (해당일자를 마지막 근무일로 함)
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 본문 (표준 문구) */}
      <div className="mb-8 text-[14px] text-slate-800 leading-8">
        <p className="mb-4">
          본인은 <span className="font-bold">{reasonText || "개인 사정"}</span>(으)로 인하여{" "}
          <span className="font-bold underline underline-offset-4">{fmtKoreanDate(form.lastWorkDate) || "(사직 희망일)"}</span>{" "}
          자로 사직하고자 하오니 재가하여 주시기 바랍니다.
        </p>
        <p>
          그동안 <span className="font-semibold">{form.companyName || "회사"}</span>에서 근무한 기간 동안 베풀어 주신 배려에 진심으로 감사드리며,
          퇴사일까지 맡은 업무와 인수인계에 최선을 다하겠습니다.
        </p>
      </div>

      {/* 사유 상세 */}
      {form.reasonDetail && form.reason !== "기타" && (
        <div className="mb-6">
          <div className="text-[13px] font-black text-slate-800 mb-1.5 pb-1 border-b border-slate-200">
            사유 상세
          </div>
          <div className="text-[13px] text-slate-700 whitespace-pre-wrap leading-7 pl-1">
            {form.reasonDetail}
          </div>
        </div>
      )}

      {/* 인수인계 사항 */}
      {form.handoverNotes && (
        <div className="mb-8">
          <div className="text-[13px] font-black text-slate-800 mb-1.5 pb-1 border-b border-slate-200">
            인수인계 사항
          </div>
          <div className="text-[13px] text-slate-700 whitespace-pre-wrap leading-7 pl-1">
            {form.handoverNotes}
          </div>
        </div>
      )}

      {/* 작성일 · 서명 */}
      <div className="mt-12">
        <div className="text-center text-[15px] text-slate-800 font-semibold mb-8">
          {fmtKoreanDate(todayIso())}
        </div>

        <div className="flex flex-col items-end gap-3 pr-2">
          <div className="flex items-center gap-3 text-[14px] text-slate-800">
            <span className="font-semibold">신청인</span>
            <span className="font-black">{form.employeeName || "-"}</span>
            <span className="font-semibold">(서명)</span>
            <div className="w-32 h-14 border-b-2 border-slate-800 flex items-end justify-center">
              {employeeSignUrl && (
                <img src={employeeSignUrl} alt="서명" className="max-h-14 max-w-full object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* 수신 · 대표자 */}
        <div className="mt-10 pt-4 border-t-2 border-slate-800 text-center">
          <div className="text-[15px] font-black text-slate-800 tracking-wider">
            {form.companyName || "-"}&nbsp;&nbsp;대표이사 <span className="ml-1">{form.employerName || "-"}</span> 귀하
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
  const [form, setForm] = useState<ResignationForm>(() => emptyForm());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empSearchOpen, setEmpSearchOpen] = useState(false);

  const employeePadRef = useRef<SignatureCanvasType | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [employeeSignUrl, setEmployeeSignUrl] = useState<string | null>(null);

  // ── 직원 목록 로드 ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEmpLoading(true);
      setEmpError(null);
      try {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1;
        const res = await fetch(`/api/schedules?year=${y}&month=${m}`);
        if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data?.employees) ? data.employees : [];
        setEmployees(list);
      } catch (err: any) {
        if (!cancelled) setEmpError(err?.message ?? "직원 목록 불러오기 실패");
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
    }));
  };

  const refreshSignaturePreview = () => {
    try {
      setEmployeeSignUrl(
        employeePadRef.current && !employeePadRef.current.isEmpty()
          ? employeePadRef.current.toDataURL("image/png")
          : null
      );
    } catch {
      // no-op
    }
  };

  const handleReset = () => {
    if (!window.confirm("입력한 모든 내용과 서명을 초기화합니다. 계속하시겠습니까?")) return;
    setForm(emptyForm());
    employeePadRef.current?.clear();
    setEmployeeSignUrl(null);
    setNotice(null);
  };

  // ── PDF 다운로드 (제출과 별도) ────────────────────────────────────────
  const generatePdfBlob = async (): Promise<{ blob: Blob; dataUrl: string } | null> => {
    // 서명 반영
    refreshSignaturePreview();
    await new Promise(r => setTimeout(r, 60));
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
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height * imgW) / canvas.width;
    if (imgH <= pdfH) {
      pdf.addImage(imgData, "PNG", 0, 0, imgW, imgH, undefined, "FAST");
    } else {
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
      heightLeft -= pdfH;
      while (heightLeft > 0) {
        position -= pdfH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
        heightLeft -= pdfH;
      }
    }
    const blob = pdf.output("blob");
    return { blob, dataUrl: imgData };
  };

  const handleDownloadPdf = async () => {
    setNotice(null);
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
    const emptySign = !employeePadRef.current || employeePadRef.current.isEmpty();
    if (emptySign) {
      if (!window.confirm("서명이 비어있습니다. 서명 없이 제출하시겠습니까?")) return;
    }

    // 서명 dataURL (in-DB 저장용 · html2canvas 없이 서명 자체만)
    let signatureDataUrl: string | null = null;
    try {
      if (employeePadRef.current && !employeePadRef.current.isEmpty()) {
        signatureDataUrl = employeePadRef.current.toDataURL("image/png");
      }
    } catch { /* no-op */ }

    setSubmitting(true);
    try {
      const res = await fetch("/api/resignations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `서버 오류 (${res.status})`);
      }
      setNotice({ tone: "ok", text: "사직서가 제출되었습니다. 관리자에게 알림이 전송되었습니다." });
      // 승인대기 배지 즉시 갱신
      window.dispatchEvent(new CustomEvent("approval-count-updated"));
    } catch (err: any) {
      setNotice({ tone: "err", text: err?.message ?? "사직서 제출에 실패했습니다." });
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
    <div className={embedded ? "flex-1 flex flex-col" : "min-h-screen bg-slate-50 flex flex-col"}>
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
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <SignOut size={20} weight="fill" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-800 leading-none">사직서 작성</h1>
              <p className="text-xs text-slate-500 mt-1">
                좌측에서 조건을 입력하면 우측에 표준 사직서가 실시간 생성됩니다. 서명 후 [사직서 제출]하세요.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-colors cursor-pointer"
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
            className={`rounded-lg border px-3 py-2 text-sm font-semibold flex items-center gap-2 ${
              notice.tone === "ok"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
          >
            {notice.tone === "ok" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="fill" />}
            {notice.text}
          </div>
        )}

        {/* 좌우 split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── 좌측: 조건 입력 폼 ─────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 flex flex-col gap-3 order-2 lg:order-1">
            <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
              <ClipboardText size={15} weight="fill" className="text-rose-600" />
              <h2 className="text-[13px] font-black text-slate-800">사직서 조건 입력</h2>
            </div>

            {/* 근로자 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<User size={12} weight="fill" className="text-slate-400" />} required>
                근로자 정보
              </FieldLabel>
              {empError && <div className="text-[12px] text-rose-600">{empError}</div>}
              {/* 성명 + 사번 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
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
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                  />
                  {empSearchOpen && form.employeeName.trim() && (() => {
                    const q = form.employeeName.trim().toLowerCase();
                    const matches = employees
                      .filter(e => (e.name ?? "").toLowerCase().includes(q))
                      .slice(0, 8);
                    if (matches.length === 0) return (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg p-2 text-[12px] text-slate-400 text-center">
                        일치하는 직원 없음 · 직접 입력 가능
                      </div>
                    );
                    return (
                      <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {matches.map(e => (
                          <li key={e.id}>
                            <button
                              type="button"
                              onMouseDown={(ev) => ev.preventDefault()}
                              onClick={() => {
                                onSelectEmployee(String(e.id));
                                setEmpSearchOpen(false);
                              }}
                              className="w-full text-left px-2.5 py-1.5 hover:bg-rose-50 transition-colors flex items-center gap-2"
                            >
                              <span className="text-[13px] font-bold text-slate-800">{e.name}</span>
                              {e.position && (
                                <span className="text-[11px] text-slate-500">{e.position}</span>
                              )}
                              {e.phone && (
                                <span className="text-[11px] text-slate-400 ml-auto tabular-nums">{e.phone}</span>
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
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 부서 + 직급 한 줄 */}
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => upd("department", e.target.value)}
                  placeholder="부서 (예: 매장·창고)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
                <input
                  type="text"
                  value={form.position}
                  onChange={(e) => upd("position", e.target.value)}
                  placeholder="직급 (예: 약사·사원)"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
              {/* 입사일 + 근속기간(자동) */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">입사일</div>
                  <input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) => upd("hireDate", e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-0.5">근속기간 (자동)</div>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-700 font-semibold">
                    {_tenure}
                  </div>
                </div>
              </div>
            </div>

            {/* 사직 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<CalendarBlank size={12} weight="fill" className="text-slate-400" />} required>
                사직 희망일 (마지막 근무일)
              </FieldLabel>
              <input
                type="date"
                value={form.lastWorkDate}
                min={minLastWorkDate}
                onChange={(e) => upd("lastWorkDate", e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition"
              />
              <p className="text-[11px] text-slate-400 leading-snug">
                * 통상 최소 30일 전 통보 관례 · 회사와 협의하여 조정 가능
              </p>
            </div>

            {/* 퇴사 사유 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>퇴사 사유</FieldLabel>
              {/* 사유 버튼 그리드 (모바일 친화) */}
              <div className="grid grid-cols-4 gap-1">
                {REASON_OPTIONS.map(r => {
                  const active = form.reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => upd("reason", r)}
                      className={`px-1.5 py-1.5 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                        active
                          ? "bg-rose-500 text-white border-rose-600"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 사유 상세 (textarea) */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>
                {form.reason === "기타" ? "기타 사유 (자유 입력)" : "사유 상세 (선택)"}
              </FieldLabel>
              <textarea
                value={form.reasonDetail}
                onChange={(e) => upd("reasonDetail", e.target.value)}
                rows={3}
                placeholder={form.reason === "기타"
                  ? "기타 사유를 직접 입력하세요 (본문에 반영됨)"
                  : "사유에 대한 부연 설명이 필요하면 입력하세요"}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 인수인계 사항 */}
            <div className="flex flex-col gap-1">
              <FieldLabel icon={<Notepad size={12} weight="fill" className="text-slate-400" />}>
                인수인계 사항 (선택)
              </FieldLabel>
              <textarea
                value={form.handoverNotes}
                onChange={(e) => upd("handoverNotes", e.target.value)}
                rows={3}
                placeholder="담당 업무 · 인수인계할 파일·연락처·주요 진행상황 등"
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition resize-y placeholder:text-slate-400 placeholder:text-[12px]"
              />
            </div>

            {/* 회사 정보 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel icon={<Buildings size={12} weight="fill" className="text-slate-400" />}>
                회사 정보
              </FieldLabel>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => upd("companyName", e.target.value)}
                  placeholder="회사명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
                <input
                  type="text"
                  value={form.employerName}
                  onChange={(e) => upd("employerName", e.target.value)}
                  placeholder="대표자명"
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[14px] text-slate-800 font-semibold focus:outline-none focus:border-rose-500 focus:shadow-sm transition placeholder:text-slate-400 placeholder:text-[12px]"
                />
              </div>
            </div>

            {/* 서명 영역 */}
            <div className="border-t border-slate-100 pt-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Signature size={13} weight="fill" className="text-slate-400" />
                  <span className="text-[12px] font-bold text-slate-600">서명 (근로자)</span>
                </div>
                <button
                  type="button"
                  onClick={refreshSignaturePreview}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors cursor-pointer"
                  title="우측 사직서에 서명 반영"
                >
                  <ArrowsClockwise size={11} />
                  미리보기 반영
                </button>
              </div>
              <SignArea label="근로자 서명" padRef={employeePadRef} />

              {/* 사직서 제출 · PDF 다운 */}
              <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={generating || submitting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-black shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  title="PDF 다운로드"
                >
                  <DownloadSimple size={16} weight="bold" />
                  <span>{generating ? "생성 중..." : "PDF 다운"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || generating}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-sm font-black shadow-sm transition-colors cursor-pointer"
                  title="사직서 제출 · 관리자 알림"
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                  <span>{submitting ? "제출 중..." : "사직서 제출"}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                * 제출 시 · 관리자에게 알림이 전송되며 · 승인 시 · 자동으로 퇴사일이 반영됩니다.
              </p>
            </div>
          </section>

          {/* ── 우측: 실시간 프리뷰 ─────────────────────────────────── */}
          <section className="order-1 lg:order-2 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 pb-1">
              <SignOut size={16} weight="fill" className="text-rose-600" />
              <h2 className="text-sm font-black text-slate-800">사직서 미리보기</h2>
              <span className="text-[11px] text-slate-400 font-semibold ml-1">
                (우측 화면 그대로 PDF로 저장됩니다)
              </span>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 sm:p-4">
              <ResignationPreview
                ref={previewRef}
                form={form}
                employeeSignUrl={employeeSignUrl}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default ResignationWriterPage;
