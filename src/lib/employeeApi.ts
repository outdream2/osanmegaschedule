// 2026-08-10 · 사용자 요청 · 직원정보 수정 관련 공통 모듈
// 사용처 (점진적 마이그레이션):
//   · MyPage · 본인 정보 수정
//   · PermissionsPage · 권한 레벨 수정
//   · SchedulePage / EmployeeFormModal · 관리자 신규/편집/삭제
//   · StaffManagePage · 관리자 편집 + 파일 첨부
//   · EmployeeCalendarModal · info 탭 · 파일 첨부 (이력서·근계·통장사본)
//
// 서버 계약:
//   PUT    /api/employees/:id                    · 전체 필드 payload · 부분 갱신 시 base merge
//   POST   /api/employees                        · 신규 등록
//   DELETE /api/employees/:id                    · 삭제
//   POST   /api/employees/:id/resume             · 이력서 · multipart · Google Drive
//   POST   /api/employees/:id/contract           · 근로계약서 · multipart · Supabase Storage
//   POST   /api/employees/:id/resignation-file   · 사직서 · multipart
//   (통장사본은 별도 엔드포인트 없음 · PUT 로 bankbook_image_url base64 저장)

import type { Employee } from "../types";

/**
 * PUT payload · 서버가 요구하는 필드 subset
 * 부분 갱신 시 · base (기존 employee) 를 병합하고 patch 로 덮어씀
 */
export interface EmployeeUpdatePayload {
  name?: string;
  position?: string;
  rank?: string | null;
  employmentType?: string;
  hireDate?: string;
  retireDate?: string | null;
  description?: string;
  workplace?: string;
  gender?: string | null;
  phone?: string | null;
  annual_leave_days?: number | null;
  level?: number | null;
  address?: string | null;
  email?: string | null;
  bankbook_image_url?: string | null;
}

/**
 * 서버 PUT 은 전체 필드를 기대함 · 안전한 부분 갱신을 위해
 * 기존 employee (base) 를 payload 로 변환한 뒤 patch 를 덮어쓴다.
 */
function mergePayload(base: Employee, patch: EmployeeUpdatePayload): EmployeeUpdatePayload {
  return {
    name: base.name,
    position: base.position,
    rank: base.rank ?? null,
    employmentType: base.employmentType,
    hireDate: base.hireDate,
    retireDate: base.retireDate ?? null,
    description: base.description ?? "",
    workplace: base.workplace,
    gender: base.gender ?? null,
    phone: base.phone ?? null,
    annual_leave_days: base.annual_leave_days ?? null,
    level: base.level ?? null,
    address: base.address ?? null,
    email: base.email ?? null,
    bankbook_image_url: base.bankbook_image_url ?? null,
    ...patch,
  };
}

async function throwIfErr(res: Response, defaultMsg: string): Promise<void> {
  if (res.ok) return;
  const body = await res.json().catch(() => ({} as any));
  const msg = (body as { error?: string }).error ?? res.statusText ?? defaultMsg;
  throw new Error(msg);
}

/**
 * 부분 갱신 · base 필수 (기존 값 병합)
 * 전체 갱신 (신규 · full payload) 은 updateEmployeeFull 사용
 */
export async function updateEmployee(
  base: Employee,
  patch: EmployeeUpdatePayload,
): Promise<Employee> {
  const payload = mergePayload(base, patch);
  const res = await fetch(`/api/employees/${base.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await throwIfErr(res, "직원 정보 저장 실패");
  return { ...base, ...patch } as Employee;
}

export async function updateEmployeeFull(
  id: number,
  payload: EmployeeUpdatePayload,
): Promise<Employee> {
  const res = await fetch(`/api/employees/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await throwIfErr(res, "직원 정보 저장 실패");
  return res.json();
}

export async function createEmployee(payload: EmployeeUpdatePayload): Promise<Employee> {
  const res = await fetch("/api/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await throwIfErr(res, "직원 등록 실패");
  return res.json();
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
  await throwIfErr(res, "직원 삭제 실패");
}

/** 이력서 · POST · Google Drive · returns { url } */
export async function uploadResume(id: number, file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("resume", file);
  const res = await fetch(`/api/employees/${id}/resume`, { method: "POST", body: fd });
  await throwIfErr(res, "이력서 업로드 실패");
  const j = await res.json().catch(() => ({} as any));
  return { url: String(j?.url ?? "") };
}

/** 이력서 삭제 · DELETE */
export async function deleteResume(id: number): Promise<void> {
  const res = await fetch(`/api/employees/${id}/resume`, { method: "DELETE" });
  await throwIfErr(res, "이력서 삭제 실패");
}

/** 근로계약서 · POST · Supabase Storage · returns { url } */
export async function uploadContract(id: number, file: File): Promise<{ url?: string }> {
  const fd = new FormData();
  fd.append("contract", file);
  const res = await fetch(`/api/employees/${id}/contract`, { method: "POST", body: fd });
  await throwIfErr(res, "근로계약서 업로드 실패");
  const j = await res.json().catch(() => ({} as any));
  return { url: j?.url ? String(j.url) : undefined };
}

/**
 * 통장사본 · base64 dataURL 로 인코딩 후 PUT · bankbook_image_url 컬럼
 * 5MB 제한 (ContractWriterPage 관례)
 */
export async function uploadBankbook(emp: Employee, file: File): Promise<{ dataUrl: string }> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`파일 크기 초과 (${(file.size / 1024 / 1024).toFixed(1)}MB > 5MB)`);
  }
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("파일 읽기 실패"));
    r.readAsDataURL(file);
  });
  await updateEmployee(emp, { bankbook_image_url: dataUrl });
  return { dataUrl };
}

/** 사직서 파일 · POST · multipart */
export async function uploadResignationFile(id: number, file: File): Promise<{ url?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/employees/${id}/resignation-file`, { method: "POST", body: fd });
  await throwIfErr(res, "사직서 업로드 실패");
  const j = await res.json().catch(() => ({} as any));
  return { url: j?.url ? String(j.url) : undefined };
}
