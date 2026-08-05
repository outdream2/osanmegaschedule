# 임금 자동 계산 · 세후→세전 역산 알고리즘

**작성**: 2026-08-05 · research-strategist 리서치 기반 · 사용자 정본 흐름
**적용 대상**: `ContractWriterPage` 임금 계산 훅
**후속 구현**: `src/lib/payroll/*` 모듈 분리 + `useWageCalculator` 훅

---

## 1. 사용자 정본 흐름

1. 근무조건 입력 (주중일수·하루h · 주말일수·하루h)
2. 직군별 시급 (주중·주말 별도 · SettingsModal 에서 관리)
3. `희망세후 = (주중일수 × 하루h × 주중시급 + 주말일수 × 하루h × 주말시급) × 4.3452주`
4. **역산** → 세전 → 임금구성표 자동 분배
5. `세전 - 세금 ≈ 희망세후` (오차 100원 이내)

---

## 2. 상수 (2026년 · config 파일 분리)

```typescript
// src/lib/payroll/insuranceRates.ts
export const RATES_2026 = {
  nationalPension: 0.0475,      // 국민연금 (근로자)
  healthInsurance: 0.03595,     // 건강보험 (근로자)
  longTermCare: 0.1295,         // 장기요양 (건강보험료 대비)
  employmentInsurance: 0.009,   // 고용보험 (근로자)
  localTaxRate: 0.10,           // 지방소득세 (소득세 × 10%)
};

export const MONTHLY_STANDARD_HOURS = 209;  // 주 40 + 주휴 8 × 4.3452
export const WEEKS_PER_MONTH = 4.3452;
```

**주의**: 국민연금 2033년까지 매년 0.5%p 인상 로드맵 · 하드코딩 금지 · 반드시 config.

---

## 3. 4대보험 근로자 부담 요율 (2026)

| 항목 | 근로자 부담률 | 산정 기준 |
|---|---|---|
| 국민연금 | 4.75% | 과세 급여 (비과세 제외) |
| 건강보험 | 3.595% | 과세 급여 |
| 장기요양 | 건강보험료 × 12.95% | 건강보험료 |
| 고용보험 | 0.9% | 과세 급여 |
| 산재보험 | 0% (사업주 전액) | — |

---

## 4. 근로소득세 (간이세액표 스냅샷)

- 국세청 홈택스 엑셀 다운로드 → JSON 파싱 → `src/lib/payroll/simplifiedTax2026.json` 저장
- 연 1회 갱신 (매년 3월 지급분부터 개정)
- 부양가족 수·자녀 수 · 별도 컬럼
- 지방소득세 = 소득세 × 10% (고정)

**실무 근사** (부양가족 1인 · 비과세 20만 · 100% 원천징수):
| 월 과세급여 | 소득세 | 지방세 | 합계 (4대+세) |
|---|---|---|---|
| 300만 | ~74,000 | ~7,400 | 약 340,000 (11.3%) |
| 500만 | ~330,000 | ~33,000 | 약 830,000 (16.6%) |
| 700만 | ~650,000 | ~65,000 | 약 1,320,000 (18.9%) |
| 1000만 | ~1,300,000 | ~130,000 | 약 2,240,000 (22.4%) |

---

## 5. 세후→세전 역산 (반복 근사 · Newton-like)

세율이 누진이므로 `gross = net / (1-r)` 부정확 → fixed-point iteration 사용.

```typescript
function grossUp(netTarget: number, nonTaxable: number, dependents: number) {
  let gross = netTarget * 1.25;  // 초기값 (22% overhead 경험치)
  for (let i = 0; i < 20; i++) {
    const taxableGross = gross - nonTaxable;
    const taxes = calcTaxes(gross, taxableGross, dependents);
    const netCalc = gross - taxes.total;
    const error = netTarget - netCalc;
    if (Math.abs(error) < 100) return { gross, taxes, iterations: i + 1 };
    gross += error * 1.3;  // overshoot factor
  }
  throw new Error("gross-up 수렴 실패");
}
```

수렴 · 3~5회 (미국 payroll SW · PaycheckCity 등 동일 방식).

---

## 6. 임금구성표 분배 (통상시급 방식)

### 통상시급 (근기법 시행령 §6)
`통상시급 = (세전 - 비과세) ÷ 임금산정시간`

### 임금산정시간 (equivalent hours)
```
equivalentHours = 209 + (월연장h × 1.5) + (월휴일h × 1.5) + (월야간h × 0.5)
```

### 각 항목 공식
| 수당 | 공식 |
|---|---|
| 기본급 | 통상시급 × 209 |
| 연장 (일 8h 초과 or 주 40h 초과) | 통상시급 × 연장h × 1.5 |
| 휴일 (주휴일·공휴일) | 통상시급 × 휴일h × 1.5 (8h 이내) · × 2.0 (8h 초과) |
| 야간 (22:00~06:00) | 통상시급 × 야간h × 0.5 (가산분만) |
| 연차수당 | 통상시급 × 8h × 미사용일수 (월할 · 연 15일 / 12개월 ≈ 1.25일) |
| 식대 | 최대 20만/월 (비과세) |
| 자가운전보조 | 최대 20만/월 (비과세 · 요건 충족) |

---

## 7. 전체 오케스트레이터 (의사코드)

```typescript
function calculateWage(input: WageInput): WageResult {
  // Step 1 · 희망 세후 = 시급 × 시간 합계
  const weeklyWeekdayH = input.weekdays * input.weekdayHoursPerDay;
  const weeklyWeekendH = input.weekendDays * input.weekendHoursPerDay;
  const desiredNet = Math.round(
    (weeklyWeekdayH * input.weekdayHourlyRate +
     weeklyWeekendH * input.weekendHourlyRate) * WEEKS_PER_MONTH
  );

  // Step 2 · 세후→세전 역산
  const nonTaxable = input.mealAllowance + input.vehicleAllowance;
  const { gross, taxes, iterations } = grossUp(desiredNet, nonTaxable, input.taxDependents);

  // Step 3 · 임금구성표 분배
  const overtimeWeeklyH = Math.max(0, weeklyWeekdayH - 40);
  const monthlyOvertimeH = overtimeWeeklyH * WEEKS_PER_MONTH;
  const monthlyHolidayH = weeklyWeekendH * WEEKS_PER_MONTH;
  const equivalentH = 209 + monthlyOvertimeH * 1.5 + monthlyHolidayH * 1.5;
  const ordinaryHourly = Math.round((gross - nonTaxable) / equivalentH);

  const wageBreakdown = {
    basicSalary:      { hours: 209, rate: ordinaryHourly, amount: ordinaryHourly * 209 },
    overtimePay:      { hours: monthlyOvertimeH, rate: ordinaryHourly * 1.5,
                        amount: Math.round(ordinaryHourly * 1.5 * monthlyOvertimeH) },
    holidayPay:       { hours: monthlyHolidayH, rate: ordinaryHourly * 1.5,
                        amount: Math.round(ordinaryHourly * 1.5 * monthlyHolidayH) },
    nightPay:         { hours: 0, amount: 0 },
    annualLeave:      { hours: 10, amount: ordinaryHourly * 10 },
    mealAllowance:    input.mealAllowance,
    vehicleAllowance: input.vehicleAllowance,
    ordinaryHourly,
  };

  const netFinal = gross - taxes.total;
  return {
    desiredNetSalary: desiredNet,
    grossSalary: gross,
    wageBreakdown,
    taxes,
    netSalary: netFinal,
    reconciliation: { diff: desiredNet - netFinal, iterationCount: iterations },
  };
}
```

---

## 8. 예제 (희망세후 · 부양가족 1인 · 식대 20만 비과세)

| 희망세후 | 세전 | 4대보험 | 소득+지방세 | 반복 | 통상시급 (주 40) |
|---|---|---|---|---|---|
| 300만 | ~3,340,000 | ~300,000 | ~40,000 | 3~4 | ~15,980 |
| 500만 | ~5,830,000 | ~520,000 | ~310,000 | 4 | ~27,900 |
| 700만 | ~8,415,000 | ~750,000 | ~665,000 | 4~5 | ~40,260 |
| 1000만 | ~12,240,000 | ~1,090,000 | ~1,150,000 | 5 | ~58,570 |

---

## 9. 사용자 흐름 vs 노무사 표준 · gap 및 통합

| 관점 | 사용자 요구 | 노무사 표준 | 통합 |
|---|---|---|---|
| 시급 정의 | 주중·주말 각각 | 통상시급 1개 | 사용자 시급 → 희망세후 산출 · 임금구성표는 표준 통상시급으로 분배 |
| 계산 방향 | hours × 시급 = 세후 | 통상시급 × 209 + 가산 = 세전 | 사용자 입력을 목표 net · gross-up 역산 · 표준 분배 |
| 가산 반영 | 시급에 녹아있음 | 명시 1.5·2배 | 임금구성표에 명시 · 사용자 시급은 UI 만 |
| 세금 | 무시 | 원천징수 | 자동 계산 · 표시 |

**핵심**: 사용자 흐름 유지 · 노무사 표준으로 임금구성표 렌더 · 계약서 감사 대비.

---

## 10. 리스크 · 함정

- **최저임금 위반** — 통상시급 < 최저시급이면 근기법 위반 · UI warning
- **세율 개정** — 매년 2월 홈택스 개정 · 3월 지급분 적용 · 알림 or config 자동 갱신
- **자녀 공제** — 2026년 8-20세 자녀 별도 차감 신설
- **부양가족 UI 조정** — 실수령 편차 큼
- **gross-up 발산** — 희망세후 < 최저 × 209 · 수렴 실패 · try-catch fallback
- **주말시급 ≠ 주중** — 표준 위배 · 계약서엔 "휴일근로 가산"으로 표현 (감사 대비)

---

## 11. 프로젝트 적용 파일 구조

```
src/lib/payroll/
  insuranceRates.ts       # 요율 상수 (2026)
  simplifiedTax2026.json  # 홈택스 스냅샷 · 연 1회 갱신
  calcTaxes.ts            # forward: gross → tax
  grossUp.ts              # 반복 근사
  buildWageBreakdown.ts   # 임금구성표 분배
  useWageCalculator.ts    # React 훅 (debounce 200ms)
  index.ts                # 재export
```

`ContractWriterPage` 에서 `useWageCalculator(input)` 훅 사용 · 입력 변경 시 실시간 재계산.

---

## Sources

- 4대보험 요율: asiatop.co.kr · 3o3.co.kr
- 간이세액표: nts.go.kr · policy.ambitstock.com
- 209h 근거: zuzu.network
- 통상임금 계산: nodong.kr · shoplworks.com
- Net 계약 (병의원): help.jobis.co
- Gross-up 알고리즘: ustax.tools
- 비과세 요건: delightlabor.com
