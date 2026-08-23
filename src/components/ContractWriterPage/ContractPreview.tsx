// src/components/ContractWriterPage/ContractPreview.tsx
// 근로계약서 이미지 재현 프리뷰 (React.forwardRef · html2canvas-pro 캡처 대상)
// 코스트팜 원본 이미지 기준 · 절대 임의 변경 금지

import React from "react";
import type { ContractForm } from "./types";
import type { SignKey } from "../../hooks/useContractSignatures";
import { DAYS } from "./constants";
import { parseHM, fmtKoreanDate } from "./wageCalc";
import { SpanBox, InlineSignSpot } from "./subcomponents";
import WageComponentsTable from "./WageComponentsTable";
import { fmtWon } from "./wageCalc";
import {
  loadContractClauses,
  fetchContractClauses,
} from "../../lib/contract";
import {
  DISCIPLINE_REASONS, HOLIDAY_CLAUSES, WAGE_CLAUSES, WAGE_CLAUSE_EXTRA, ETC_ITEMS, PRIVACY_ITEMS,
} from "../../constants/contractClauses";

interface ContractPreviewProps {
  form: ContractForm;
  signUrls: Record<SignKey, string | null>;
  employerStampUrl: string | null;
  employeeStampUrl: string | null;
  onOpenSign: (key: SignKey) => void;
  onClearSign: (key: SignKey) => void;
  paymentDayText: string;
}

const ContractPreview = React.forwardRef<HTMLDivElement, ContractPreviewProps>(({
  form, signUrls, employerStampUrl, employeeStampUrl, onOpenSign, onClearSign, paymentDayText,
}, ref) => {
  const workDayText = DAYS.filter(d => form.workDays[d]).join("·") || "(선택 안 됨)";

  const [clauses, setClauses] = React.useState(() => {
    try { return loadContractClauses(); }
    catch { return null; }
  });
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await fetchContractClauses();
        if (!cancelled) setClauses(fresh);
      } catch { /* 서버 오류 · 초기 localStorage 값 유지 */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const wageClauses       = clauses?.wageClauses       ?? WAGE_CLAUSES;
  const holidayClauses    = clauses?.holidayClauses    ?? HOLIDAY_CLAUSES;
  const disciplineClauses = clauses?.disciplineClauses ?? DISCIPLINE_REASONS;
  const etcClauses        = clauses?.etcClauses        ?? ETC_ITEMS;
  const privacyClauses    = clauses?.privacyClauses    ?? PRIVACY_ITEMS;

  const csDate = form.contractSignDate ? form.contractSignDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const csY = csDate ? csDate[1] : "";
  const csM = csDate ? Number(csDate[2]) : "";
  const csD = csDate ? Number(csDate[3]) : "";

  const stDate = form.startDate ? form.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const enDate = form.endDate   ? form.endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;

  const breakDisplay = (() => {
    if (form.breakStart && form.breakEnd) return `${form.breakStart} ~ ${form.breakEnd}`;
    const s = parseHM(form.startTime);
    const bMin = Number(form.breakMinutes) || 0;
    if (!s || bMin <= 0) return null;
    const startMin = s.h * 60 + s.m;
    const e = parseHM(form.endTime);
    if (!e) return null;
    const endMin = e.h * 60 + e.m;
    const midpoint = Math.floor((startMin + endMin - bMin) / 2);
    const bs = midpoint;
    const be = midpoint + bMin;
    const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    return `${hm(bs)} ~ ${hm(be)}`;
  })();

  const HEX = {
    indigoBg:  "#eef2ff",
    indigoBd:  "#c7d2fe",
    amberBg:   "#fef3c7",
    amberSoft: "#fffbeb",
    amberBd:   "#fcd34d",
    slateBd:   "#94a3b8",
    slateSoft: "#f8fafc",
    slateHead: "#e2e8f0",
  } as const;

  const Section: React.FC<{ label: string; children: React.ReactNode; avoidBreak?: boolean }> = ({ label, children, avoidBreak }) => (
    <section
      className="mt-2.5"
      style={avoidBreak ? { pageBreakInside: "avoid", breakInside: "avoid" } : undefined}
    >
      <div className="border-l-[3px] border-zinc-700 pl-3">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-zinc-500 mb-1">
          {label}
        </h3>
        <div className="text-[11.5px] text-zinc-800 leading-snug">
          {children}
        </div>
      </div>
    </section>
  );

  const PartyCell: React.FC<{ partyLabel: string; children: React.ReactNode }> = ({ partyLabel, children }) => (
    <div className="border border-zinc-400 rounded-sm p-3 flex flex-col gap-1.5 bg-white">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-zinc-500 pb-1 border-b border-line">
        {partyLabel}
      </div>
      {children}
    </div>
  );

  const FieldRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex items-baseline gap-2 text-[11.5px]">
      <span className="min-w-[68px] text-zinc-600 font-bold text-[10.5px] tracking-wide">{label}</span>
      <span className="flex-1 border-b border-zinc-300 pb-0.5 text-zinc-900 font-semibold">{value ?? "-"}</span>
    </div>
  );

  return (
    <div
      ref={ref}
      className="bg-white text-zinc-900 shadow-sm p-4 sm:p-6 mx-auto"
      style={{
        width: "100%",
        maxWidth: "820px",
        fontFamily: "'Noto Sans KR', 'Malgun Gothic', system-ui, -apple-system, 'Segoe UI', sans-serif",
        lineHeight: 1.35,
        color: "#0f172a",
      }}
    >
      <header
        className="flex items-center justify-center pb-3 mb-3 relative"
        style={{ borderBottom: "2px solid #1e293b" }}
      >
        <h2 className="text-[24px] font-bold tracking-[0.32em] text-zinc-900 text-center">
          근 로 계 약 서
        </h2>
        <div className="absolute right-0 top-0 bottom-0 flex items-center text-[14px] font-bold text-zinc-800">
          ( <span className="mx-1 min-w-[80px] text-center border-b border-zinc-500 px-2">{form.employeeName || " "}</span> )
        </div>
      </header>

      <p className="text-[14px] text-zinc-700 mb-2 leading-relaxed">
        사용자(이하 '갑'이라 함)와 근로자(이하 '을'이라 함)는 다음과 같이 근로계약을 체결하고 신의에 따라 이를 성실히 이행할 것을 약정한다.
      </p>

      <Section label="근무장소 · 담당업무">
        <div className="font-bold text-zinc-900">
          {form.companyName || "코스트팜(Costpharm)"}
          {form.companyAddress && (
            <span className="text-zinc-700 font-semibold"> ({form.companyAddress})</span>
          )}
          <span className="ml-1">社內 및 관계 현장</span>
        </div>
        <div className="mt-1">
          담당업무: <b className="text-zinc-900">{form.jobDuty || "-"}</b>
        </div>
        <div className="text-[10.5px] text-zinc-600 mt-1">
          단, '갑'의 사정에 따라 근무 장소와 담당 업무를 변경할 수 있으며 '을'은 정당한 사유 없이 이를 거부할 수 없다.
        </div>
      </Section>

      <Section label="근로계약기간">
        <div
          className={`grid gap-x-4 gap-y-0.5 text-[11.5px] mb-1.5 ${
            form.indefinite ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          <div className="flex flex-col">
            <span className="text-[14px] text-zinc-500 font-semibold uppercase tracking-wider">계약체결일</span>
            <span className="font-bold text-zinc-900 tabular-nums">{fmtKoreanDate(form.contractSignDate) || "-"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[14px] text-zinc-500 font-semibold uppercase tracking-wider">근무시작일</span>
            <span className="font-bold text-zinc-900 tabular-nums">{fmtKoreanDate(form.startDate) || "-"}</span>
          </div>
          {!form.indefinite && (
            <div className="flex flex-col">
              <span className="text-[14px] text-zinc-500 font-semibold uppercase tracking-wider">계약종료일</span>
              <span className="font-bold text-zinc-900 tabular-nums">{fmtKoreanDate(form.endDate) || "-"}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-1">
          <SpanBox checked={form.indefinite} />
          <span className="font-bold">기간의 정함이 없음.</span>
          <span className="text-[15px] text-zinc-600">(근로개시일: <b>{fmtKoreanDate(form.startDate) || "-"}</b>)</span>
        </div>
        {!form.indefinite && (
          <>
            <div className="flex items-center flex-wrap gap-1 text-[14px]">
              <SpanBox checked={!form.indefinite} />
              <span className="tabular-nums">
                <b>{stDate ? stDate[1] : "20__"}</b>년{" "}
                <b>{stDate ? Number(stDate[2]) : "__"}</b>월{" "}
                <b>{stDate ? Number(stDate[3]) : "__"}</b>일{" "}
                ~ <b>{enDate ? enDate[1] : "20__"}</b>년{" "}
                <b>{enDate ? Number(enDate[2]) : "__"}</b>월{" "}
                <b>{enDate ? Number(enDate[3]) : "__"}</b>일까지
              </span>
              <span className="text-[10.5px] text-zinc-600 ml-1">(근로개시일: {fmtKoreanDate(form.startDate) || "-"})</span>
            </div>
            <div className="text-[10.5px] text-zinc-600 mt-1">
              계약기간 만료일에 별도의 통보 없이 근로계약은 자동 해지되는 것으로 한다.
            </div>
          </>
        )}
      </Section>

      <Section label="임금" avoidBreak>
        <div className="text-[11.5px] text-zinc-800 mb-1.5 font-semibold">
          1. '을'의 구체적인 임금 구성항목은 아래와 같다.
        </div>
        {form.useWageComponents ? (
          <WageComponentsTable wage={form.wageComponents} />
        ) : (
          <div className="border border-zinc-400 rounded-sm p-2 text-[14px]">
            <div>· 시간급 (주중): <b>{fmtWon(form.weekdayHourly)} 원</b></div>
            <div>· 시간급 (주말): <b>{fmtWon(form.weekendHourly)} 원</b></div>
          </div>
        )}

        <ol className="mt-2 space-y-1 text-[15px] text-zinc-700 leading-snug list-decimal list-inside pl-1">
          {wageClauses.map((clause, i) => (
            <li key={i}><span className="align-middle">{clause}</span></li>
          ))}
        </ol>
        <div className="mt-1 text-[10.5px] text-zinc-600 leading-snug">
          <b>별도:</b> {WAGE_CLAUSE_EXTRA}
        </div>

        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.wage} />
          <span className="text-[11.5px] font-semibold text-zinc-800">
            위의 임금 조항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[15px] font-bold text-zinc-800 border-b border-zinc-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="wageAck"
              signUrl={signUrls.wageAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>

        <div
          className="mt-2 rounded-sm px-2 py-1 text-[11.5px]"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <b>2. 임금지급일:</b> {paymentDayText}
        </div>
      </Section>

      <Section label="근로일 · 근로시간" avoidBreak>
        <div className="text-[11.5px] font-bold mb-1">
          1. 기본 근로일: <b className="text-zinc-900">{workDayText}</b>
        </div>
        <div className="text-[10.5px] text-zinc-600 mb-1 leading-snug">
          ※ 갑의 사정에 따라 근무요일은 변경될 수 있으며, 을은 정당한 사유 없이 이를 거부할 수 없다.
        </div>
        <div className="text-[10.5px] text-zinc-600 mb-2 leading-snug">
          ※ 소정근로일은 주40시간제 내에서 당사자가 정하는 근로일을 의미하며, 무급 휴무일인 토요일에 근로할 경우 연장근로로 보고, 주휴일인 일요일에 근로할 경우 휴일근로로 본다.
        </div>

        <div className="text-[11.5px] font-bold mb-1">2. 기본 근로시간:</div>
        <table className="w-full border-collapse border border-zinc-400 text-[11.5px] mb-1 rounded-sm overflow-hidden">
          <thead>
            <tr style={{ backgroundColor: HEX.slateHead }} className="font-bold">
              <th className="border border-zinc-300 px-2 py-1 text-center w-[35%]">구분</th>
              <th className="border border-zinc-300 px-2 py-1 text-center w-[35%]">기본 근로시간</th>
              <th className="border border-zinc-300 px-2 py-1 text-center w-[30%]">휴게시간(무급)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-zinc-300 px-2 py-1 text-center font-bold">{workDayText}</td>
              <td className="border border-zinc-300 px-2 py-1 text-center tabular-nums">
                {form.startTime || "--:--"} ~ {form.endTime || "--:--"}
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-center tabular-nums">
                {breakDisplay ?? "-"}
                <div className="text-[14px] text-zinc-500 mt-0.5">({form.breakMinutes || 0}분)</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div
          className="mt-2 rounded-sm px-2 py-1.5"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <div className="text-[15px] text-zinc-800 leading-snug">
            ※ 소정근로시간은 휴게시간을 제외한 일단위 법정근로시간(8시간) 내에서 당사자가 정하는 시간이며, '을'은 '갑'의 사정에 따라 필요 시 상기 근로시간 이외에 추가로 연장, 야간, 휴일근로를 수행할 수 있으며 자유로운 의사로 동의한다.
          </div>
        </div>

        <div
          className="mt-2 rounded-sm px-2 py-1.5"
          style={{ backgroundColor: HEX.amberSoft, border: `1px solid ${HEX.amberBd}` }}
        >
          <div className="text-[15px] text-zinc-800 leading-snug">
            ※ 업무형편상 부득이한 경우 상기 휴게 시간을 변경할 수 있고, 제대로 사용하지 못한 휴게시간은 다른 시간 내에서 보충 사용하는 것에 동의한다.
          </div>
          <div className="text-[15px] text-zinc-800 leading-snug mt-1">
            ※ 휴게시간은 갑과 을의 협의에 따라 변경할 수 있다.
          </div>
        </div>

        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.workTime} />
          <span className="text-[11.5px] font-semibold text-zinc-800">
            위의 근로시간·휴게 조항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[15px] font-bold text-zinc-800 border-b border-zinc-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="workTimeAck"
              signUrl={signUrls.workTimeAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>
      </Section>

      <Section label="퇴직금">
        <div className="text-[11.5px]">
          퇴직급여보장법에 따라 퇴직연금제도, 퇴직제도를 설정 및 운영해 법정기준으로 지급한다.
        </div>
      </Section>

      <Section label="연차유급휴가">
        <div className="text-[11.5px]">
          연차유급휴가는 근로기준법에 따른다. 다만, 근로기준법 제62조에 따라 근로자대표와의 서면합의로 연차유급휴가를 갈음하여 특정 근로일에 휴무시킬 수 있다. (상시 근로자 수가 5인 미만인 경우에는 적용을 제외한다.)
          <br />
          기본 부여 연차: <b>연 {form.annualLeaveDays || "15"}일</b>
        </div>
      </Section>

      <Section label="휴일 및 휴무">
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-zinc-800 pl-1">
          {holidayClauses.map((c, i) => <li key={i} className="leading-snug">{c}</li>)}
        </ol>
      </Section>

      <Section label="징계 및 근로계약 해지 사유">
        <div className="text-[15px] font-bold text-zinc-800 mb-1">
          다음 각 호의 어느 하나에 해당하는 경우 사업주는 근로자를 징계 또는 근로계약 해지할 수 있다.
        </div>
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-zinc-800 pl-1">
          {disciplineClauses.map((r, i) => (
            <li key={i} className="leading-snug">{r}</li>
          ))}
        </ol>
      </Section>

      <Section label="기타사항">
        <ol className="list-decimal list-inside space-y-0.5 text-[11.5px] text-zinc-800 pl-1">
          {etcClauses.map((r, i) => (
            <li key={i} className="leading-snug"><span className="align-middle">{r}</span></li>
          ))}
        </ol>
        <div
          className="mt-2 rounded-sm px-2 py-1.5 flex flex-wrap items-center gap-2"
          style={{ backgroundColor: HEX.indigoBg, border: `1px solid ${HEX.indigoBd}` }}
        >
          <SpanBox checked={form.clauseAcks.etc} />
          <span className="text-[11.5px] font-semibold text-zinc-800">
            위의 기타사항 전체 내용을 이해하고 동의함
          </span>
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[15px] font-bold text-zinc-800 border-b border-zinc-500 px-2 min-w-[70px] text-center">
              {form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="etcAck"
              signUrl={signUrls.etcAck}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={110}
              height={28}
              placeholder="(서명)"
            />
          </span>
        </div>
        {form.additionalContent.trim() && (
          <div
            className="mt-2 rounded-sm px-2 py-1"
            style={{ backgroundColor: HEX.slateSoft, border: "1px solid #cbd5e1" }}
          >
            <div className="text-[10.5px] font-bold text-zinc-600 mb-0.5">추가 특약 사항</div>
            <div className="text-[11.5px] whitespace-pre-wrap text-zinc-800">{form.additionalContent}</div>
          </div>
        )}
        {form.socialInsurance && (
          <div className="mt-1.5 text-[15px] text-zinc-700">
            · 4대보험 가입: <SpanBox checked /> 고용보험 <SpanBox checked /> 산재보험 <SpanBox checked /> 국민연금 <SpanBox checked /> 건강보험
          </div>
        )}
        {form.primaryFocus && (form.employeeCategory === "매장" || form.employeeCategory === "창고") && (
          <div className="mt-1 text-[15px] text-zinc-700">
            · 담당 업무의 우선순위: <b>{form.primaryFocus}</b> 관련 업무에 근무시간의 <b>{form.primaryFocusPercent}%</b> 비중.
          </div>
        )}
      </Section>

      <div
        className="mt-4 rounded-sm px-3 py-2 text-[11.5px] flex flex-wrap items-center gap-2"
        style={{ backgroundColor: HEX.slateSoft, border: "1px solid #cbd5e1", pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="flex-1 min-w-[280px] leading-snug">
          본 계약은 당사자 간의 자유로운 의사에 의해 작성되었으며, 을은 작성된 근로계약서 1부를 교부받았음을 확인합니다.
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[15px] font-bold text-zinc-800">수령자 성명:</span>
          <span className="text-[11.5px] font-bold text-zinc-900 border-b border-zinc-500 px-2 min-w-[70px] text-center">
            {form.employeeName || " "}
          </span>
          <InlineSignSpot
            signKey="receipt"
            signUrl={signUrls.receipt}
            onOpen={onOpenSign}
            onClear={onClearSign}
            width={120}
            height={32}
            placeholder="(수령자 서명)"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-[18px] font-bold tracking-widest text-zinc-900">
        <span className="tabular-nums">{csY || "20__"}</span>
        <span>년</span>
        <span className="tabular-nums">{typeof csM === "number" ? csM : "__"}</span>
        <span>월</span>
        <span className="tabular-nums">{typeof csD === "number" ? csD : "__"}</span>
        <span>일</span>
      </div>

      <div
        className="mt-3 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
        style={{ borderTop: "2px solid #1e293b", pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <PartyCell partyLabel="사용자 · 갑">
          <FieldRow label="상호" value={form.companyName || "-"} />
          <FieldRow label="대표" value={form.employerName || "-"} />
          <FieldRow label="주소" value={form.companyAddress || "-"} />
          {form.companyRegNo && (
            <FieldRow label="사업자등록번호" value={form.companyRegNo} />
          )}
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10.5px] text-zinc-500 font-bold mr-2">(도장)</span>
            <InlineSignSpot
              signKey="employer"
              signUrl={signUrls.employer}
              stampUrl={employerStampUrl}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={96}
              height={48}
              placeholder="(도장)"
            />
          </div>
        </PartyCell>

        <PartyCell partyLabel="근로자 · 을">
          <FieldRow label="성명" value={form.employeeName || "-"} />
          <FieldRow label="주민번호" value={<span className="tabular-nums">{form.employeeBirth || "-"}</span>} />
          <FieldRow label="주소" value={form.employeeAddress || "-"} />
          <FieldRow label="전화번호" value={<span className="tabular-nums">{form.employeePhone || "-"}</span>} />
          <FieldRow
            label="은행/계좌"
            value={
              (form.bankName || form.bankAccountNumber)
                ? `${form.bankName ?? ""} ${form.bankAccountNumber ?? ""}`.trim() || "-"
                : (form.employeeBankAccount || "-")
            }
          />
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10.5px] text-zinc-500 font-bold mr-2">(서명)</span>
            <InlineSignSpot
              signKey="employee"
              signUrl={signUrls.employee}
              stampUrl={employeeStampUrl}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={96}
              height={48}
              placeholder="(서명)"
            />
          </div>
        </PartyCell>
      </div>

      <div
        className="mt-5"
        style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
      >
        <div className="border-l-[3px] border-zinc-700 pl-3 mb-2">
          <h3 className="text-[15px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            개인정보 · CCTV 설치 동의
          </h3>
        </div>
        <table className="w-full border-collapse border border-zinc-400 text-[15px] rounded-sm overflow-hidden">
          <tbody>
            <tr>
              <td className="border border-zinc-300 px-2 py-1 text-center font-bold w-[22%]" style={{ backgroundColor: HEX.slateHead }}>
                정보의 수집·이용 목적<br /><span className="text-[14px] text-zinc-600">(CCTV 설치 목적)</span>
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-zinc-800 align-top">
                당사의 인적자원관리, 방범 및 화재예방, 시설안전관리, 사업장내 사고예방 및 범죄예방
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-center font-bold w-[18%]" style={{ backgroundColor: HEX.slateHead }}>
                정보 보유 및 이용기간
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-zinc-800 align-top">
                근로관계가 유지되는 기간. 단, CCTV 화상영상 정보의 경우 일정기간 후 기존 영상정보에서 삭제
              </td>
            </tr>
            <tr>
              <td className="border border-zinc-300 px-2 py-1 text-center font-bold" style={{ backgroundColor: HEX.slateHead }}>
                개인정보의 항목
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-zinc-800 align-top" colSpan={3}>
                <ol className="list-decimal list-inside space-y-0.5 text-[10.5px]">
                  {privacyClauses.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
              </td>
            </tr>
            <tr>
              <td className="border border-zinc-300 px-2 py-1 text-center font-bold" style={{ backgroundColor: HEX.slateHead }}>
                CCTV 촬영시간 및 범위
              </td>
              <td className="border border-zinc-300 px-2 py-1 text-zinc-800 align-top" colSpan={3}>
                촬영시간: 24시간 연속 촬영 및 녹화 · 촬영범위: 출입구 및 복도, 사업장 내 등 건물 내 주요 시설
              </td>
            </tr>
            <tr>
              <td className="border border-zinc-300 px-2 py-1 text-zinc-800 align-top text-[10.5px]" colSpan={4} style={{ backgroundColor: HEX.amberSoft }}>
                회사는 개인정보를 인사관리업무와 관련된 업무(기관)외 다른 목적으로 이용하거나 제3자에게 제공하지 않으며, CCTV 설치도 상기 목적외 다른 목적으로 이용하지 않습니다.
                <br />
                위 내용을 충분히 숙지하고 개인정보의 수집 및 CCTV 설치 이용에 대하여 동의합니다.
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[15px]">
          <label className="inline-flex items-center gap-1">
            <SpanBox checked={form.privacyConsent.agreedCollection && form.privacyConsent.agreedCCTV} />
            <span>동의</span>
          </label>
          <label className="inline-flex items-center gap-1">
            <SpanBox checked={!(form.privacyConsent.agreedCollection && form.privacyConsent.agreedCCTV)} />
            <span>동의하지 않음</span>
          </label>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[15px] text-zinc-700 font-bold">성명:</span>
            <span className="text-[11.5px] font-bold text-zinc-900 border-b border-zinc-500 px-2 min-w-[70px] text-center">
              {form.privacyConsent.recipientName || form.employeeName || " "}
            </span>
            <InlineSignSpot
              signKey="privacy"
              signUrl={signUrls.privacy}
              onOpen={onOpenSign}
              onClear={onClearSign}
              width={120}
              height={30}
              placeholder="(서명)"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
ContractPreview.displayName = "ContractPreview";

export default ContractPreview;
