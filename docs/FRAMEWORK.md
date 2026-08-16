# megatown-staff-scheduler · 프레임워크 개발자 가이드

**작성 · 2026-08-16 · v1.0** · 협업자용 API 레퍼런스 + 적용 매뉴얼

이 문서는 서버·클라이언트 공용 프레임워크 모듈의 **완전한 API·타입·예제·에러 케이스**를 정리한 협업 가이드다. 신규 코드는 반드시 아래 프레임워크를 사용하고, 3곳 이상 반복되는 새 패턴은 즉시 이 문서에 흡수한다.

## 목차

1. [빠른 시작](#1-빠른-시작)
2. [서버 프레임워크](#2-서버-프레임워크)
   - 2.1 [asyncHandler](#21-asynchandler)
   - 2.2 [errorHandler + HttpError](#22-errorhandler--httperror)
   - 2.3 [zodValidate](#23-zodvalidate)
   - 2.4 [requireAuth · authorize · issueToken · refreshAccessToken · clearToken](#24-requireauth--jwt-체계)
   - 2.5 [checkOwnershipOrAdmin](#25-checkownershipohradmin)
   - 2.6 [auditLogger · audit + auditContext](#26-auditlogger)
   - 2.7 [pagination · parsePagination + paginatedResponse](#27-pagination)
3. [클라이언트 프레임워크](#3-클라이언트-프레임워크)
   - 3.1 [useToast + toastClass](#31-usetoast--toastclass)
   - 3.2 [useApiQuery](#32-useapiquery)
   - 3.3 [usePagePermissions + invalidatePagePermissions](#33-usepagepermissions)
   - 3.4 [useSidebar · useSidebarWidth · useSidebarEnabled](#34-usesidebar-계열)
   - 3.5 [ErrorBoundary](#35-errorboundary)
   - 3.6 [MenuCard](#36-menucard)
   - 3.7 [employeeCategory + employeeApi + contract lib](#37-도메인-lib)
4. [마이그레이션 레시피](#4-마이그레이션-레시피)
5. [안티패턴 · 금지 목록](#5-안티패턴--금지-목록)
6. [파일 구조 규칙](#6-파일-구조-규칙)
7. [테스트 · 검증 체크리스트](#7-테스트--검증-체크리스트)
8. [마이그레이션 상태](#8-마이그레이션-상태)

---

## 1. 빠른 시작

### 새 route 추가 (표준 템플릿)

```ts
// server/routes/example/example.ts
import { Router } from "express";
import { z } from "zod";
import { supabase } from "../../../src/supabase/client";
import { asyncHandler } from "../../middleware/asyncHandler";
import { validateBody } from "../../middleware/zodValidate";
import { requireAuth, getSession, authorize } from "../../middleware/requireAuth";
import { badRequest, HttpError, notFound } from "../../middleware/errorHandler";
import { checkOwnershipOrAdmin } from "../../lib/ownershipCheck";
import { audit, auditContext } from "../../lib/auditLogger";
import { parsePagination, paginatedResponse } from "../../lib/pagination";

const router = Router();

// GET list (페이지네이션)
router.get("/api/examples", asyncHandler(async (req, res) => {
  const p = parsePagination(req, { limit: 20 });
  const { data, count, error } = await supabase
    .from("examples").select("*", { count: "exact" })
    .range(p.from, p.to);
  if (error) throw new HttpError(500, error.message);
  res.json(paginatedResponse(data ?? [], count, p));
}));

// POST · Zod 검증
const CreateExampleSchema = z.object({
  name: z.string().min(1, "이름은 필수"),
  amount: z.number().positive(),
});
router.post("/api/examples",
  requireAuth,
  validateBody(CreateExampleSchema),
  asyncHandler(async (req, res) => {
    const session = getSession(req)!;
    const { data, error } = await supabase.from("examples")
      .insert({ ...req.body, created_by: session.sub }).select().single();
    if (error) throw new HttpError(500, error.message);
    audit("EXAMPLE_CREATED", { ...auditContext(req), actorId: session.sub, id: data.id });
    res.status(201).json(data);
  }),
);

// DELETE · 본인 or 관리자
router.delete("/api/examples/:id", asyncHandler(async (req, res) => {
  const check = await checkOwnershipOrAdmin(req, {
    table: "examples", id: req.params.id, ownerCol: "created_by",
  });
  if (check.ok !== true) throw new HttpError(check.status, check.error);
  const { error } = await supabase.from("examples").delete().eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));

// admin-only endpoint
router.post("/api/examples/rebuild", authorize(9), asyncHandler(async (_req, res) => {
  // ...
  res.json({ ok: true });
}));

export default router;
```

### 새 페이지 추가 (표준 템플릿)

```tsx
// src/components/ExamplePage/ExamplePage.tsx
import { useApiQuery } from "../../hooks/useApiQuery";
import { useToast, toastClass } from "../../hooks/useToast";
import { usePagePermissions } from "../../hooks/usePagePermissions";
import type { AuthSession } from "../../types";

interface Props { session: AuthSession }

export default function ExamplePage({ session }: Props) {
  const { toast, showSuccess, showError } = useToast(2500);
  const { data, loading, error, refetch } = useApiQuery<{ items: Item[] }>("/api/examples");
  const { perms } = usePagePermissions();

  const canEdit = (perms["examples"] ?? 0) <= (session.level ?? 0);

  async function onSave(body: unknown) {
    try {
      const res = await fetch("/api/examples", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장 실패");
      showSuccess("저장되었습니다");
      await refetch();
    } catch (e: any) { showError(e.message); }
  }

  if (loading) return <div>로딩...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div>
      {/* ... */}
      {toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
    </div>
  );
}
```

---

## 2. 서버 프레임워크

### 2.1 asyncHandler

**파일** · `server/middleware/asyncHandler.ts`
**목적** · Express async route 의 try/catch 반복 제거. `throw` 는 자동으로 `errorHandler` 로 전달.

**API**
```ts
export const asyncHandler:
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>)
    => RequestHandler
```

**사용**
```ts
router.get("/api/items", asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from("items").select();
  if (error) throw new HttpError(500, error.message);
  res.json(data ?? []);
}));
```

**주의**
- `return res.json(...)` 은 여전히 유효 (return 값 무시됨)
- `res.status().json()` 직접 호출도 가능 (표준화하려면 `throw`)
- `next(err)` 명시 호출 불필요 · `throw` 하면 catch → next 자동

---

### 2.2 errorHandler + HttpError

**파일** · `server/middleware/errorHandler.ts`
**등록** · `server/index.ts` 최하단 (모든 route 뒤)
**목적** · `ZodError` / `HttpError` / 기타 예외를 표준 응답으로 통일

**타입**
```ts
export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string);
}
```

**Factory 함수 (편의)**
| 함수 | Status | Code | 기본 메시지 |
|---|---|---|---|
| `badRequest(msg, code?)` | 400 | (없음/자유) | (필수) |
| `unauthorized(msg?)` | 401 | `"UNAUTHORIZED"` | "인증이 필요합니다" |
| `forbidden(msg?)` | 403 | `"FORBIDDEN"` | "권한이 부족합니다" |
| `notFound(msg?)` | 404 | `"NOT_FOUND"` | "찾을 수 없습니다" |
| `new HttpError(status, msg, code?)` | 자유 | (자유) | (필수) |

**응답 형태**
```json
{ "error": "메시지", "code": "OPTIONAL_CODE" }
```

**Zod 실패 시** (자동 처리)
```json
{ "error": "첫 issue message", "code": "VALIDATION" }
```

**로깅 규칙**
| Status | Console 레벨 | 개발 모드 stack |
|---|---|---|
| 500+ | `console.error` | ✅ (top 5) |
| 400/401/403/404 | `console.warn` | · |
| 기타 | `console.error` | ✅ |

**사용 예**
```ts
if (!id) throw badRequest("id required");
if (!session) throw unauthorized();
if (level < 9) throw forbidden("관리자 전용");
if (!row) throw notFound("직원을 찾을 수 없습니다");
if (dupExists) throw new HttpError(409, "이미 등록된 전화번호", "DUP_PHONE");
```

---

### 2.3 zodValidate

**파일** · `server/middleware/zodValidate.ts`
**목적** · Zod 스키마로 body/query/params 검증. 통과 시 원본을 parsed data 로 교체 → 타입 안전.

**API**
```ts
export function firstZodError(err: ZodError): string;
export const validateBody: <T>(schema: ZodSchema<T>) => RequestHandler;
export const validateQuery: <T>(schema: ZodSchema<T>) => RequestHandler;
export const validateParams: <T>(schema: ZodSchema<T>) => RequestHandler;
```

**사용**
```ts
import { z } from "zod";

const LoginSchema = z.object({
  phone: z.string().min(1, "전화번호 필수"),
  password: z.string().min(4, "비밀번호는 4자 이상"),
});

router.post("/api/auth/login", validateBody(LoginSchema), asyncHandler(async (req, res) => {
  const { phone, password } = req.body;  // 이미 검증됨 · z.infer 타입
  // ...
}));
```

**실패 시** · `ZodError` → errorHandler 가 `400 { error, code: "VALIDATION" }` 자동 응답 · 첫 issue message 노출.

**주의** · `validateBody` 뒤에 `asyncHandler` 순서 필수. 그래야 async catch 가 걸림.

---

### 2.4 requireAuth · JWT 체계

**파일** · `server/middleware/requireAuth.ts`

**쿠키 체계**
| 쿠키 | 이름 | 수명 | Path | 용도 |
|---|---|---|---|---|
| Access | `mt_auth` | 15분 | `/` | 모든 API 호출 |
| Refresh | `mt_refresh` | 30일 | `/api/auth` | Access 자동 갱신 |

**Payload 타입**
```ts
export interface JwtPayload {
  sub: number;       // employee id
  name: string;
  role: string;
  level: number;
  rememberMe?: boolean;
  typ?: "access" | "refresh";
}
```

**API**
```ts
// 로그인 시 · Access + Refresh 두 쿠키 동시 발급
export function issueToken(res: Response, payload: JwtPayload, rememberMe?: boolean): string;

// Refresh 쿠키로 Access 재발급 (rolling window · Refresh 유지)
export function refreshAccessToken(req: Request, res: Response): JwtPayload | null;

// 로그아웃 시 · 두 쿠키 모두 제거
export function clearToken(res: Response): void;

// 미들웨어 · 인증 검사 (level 무관) · 미로그인 401
export function requireAuth(req: Request, res: Response, next: NextFunction): void;

// 미들웨어 팩토리 · 최소 level 검사 · 미달 시 403
export function authorize(minLevel: number): RequestHandler;

// 요청에서 JWT payload 반환 · null 이면 미인증
export function getSession(req: Request): JwtPayload | null;
```

**사용**
```ts
// 로그인 성공 후
issueToken(res, { sub: emp.id, name: emp.name, role: emp.position, level: emp.level ?? 0 });

// 인증 필수 route
router.get("/api/me", requireAuth, asyncHandler(async (req, res) => {
  const session = getSession(req)!;
  res.json({ me: session });
}));

// 관리자 전용
router.post("/api/permissions", authorize(9), asyncHandler(async (req, res) => {
  // ...
}));

// 로그아웃
router.post("/api/auth/logout", (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});
```

**JWT 전달 방식** (우선순위)
1. `Cookie: mt_auth=<token>` (기본, httpOnly · SPA 자동)
2. `Authorization: Bearer <token>` (API 클라이언트 fallback)

**환경변수 필수** · `JWT_SECRET` · 미설정 시 `issueToken` 실패 (500).

**클라이언트 자동 갱신** · axios interceptor `src/api/authClient.ts` (또는 유사) 가 401 감지 시 `/api/auth/refresh` 자동 호출. `refreshInFlight` 로 중복 호출 방지.

---

### 2.5 checkOwnershipOrAdmin

**파일** · `server/lib/ownershipCheck.ts`
**목적** · DELETE/PUT 에서 "본인 or 관리자" 반복 패턴 통일.

**API**
```ts
export type OwnershipResult =
  | { ok: true; session: JwtPayload; isAdmin: boolean; row: any }
  | { ok: false; status: number; error: string };

interface Options {
  table: string;               // DB 테이블
  id: string | number;         // 리소스 id
  ownerCol?: string;           // ownership 컬럼 (기본 "employee_id")
  select?: string;             // 함께 조회할 컬럼 (기본 owner + status)
  adminLevel?: number;         // admin level (기본 9)
}

export async function checkOwnershipOrAdmin(req: Request, opts: Options): Promise<OwnershipResult>;
```

**결과 status**
| 조건 | status | error |
|---|---|---|
| 세션 없음 | 401 | "인증이 필요합니다" |
| 관리자 (level ≥ adminLevel) | ok · row=null | — |
| 리소스 없음 | 404 | "리소스를 찾을 수 없습니다" |
| 본인 아님 | 403 | "본인 소유만 접근 가능합니다" |
| DB 에러 | 500 | error.message |
| 본인 소유 | ok · row=DB row | — |

**사용**
```ts
router.delete("/api/leave-requests/:id", asyncHandler(async (req, res) => {
  const check = await checkOwnershipOrAdmin(req, {
    table: "leave_requests",
    id: req.params.id,
    // ownerCol 기본 employee_id 사용
  });
  if (check.ok !== true) throw new HttpError(check.status, check.error);
  // check.row · DB row · 추가 조건 판단 가능
  if (!check.isAdmin && check.row?.status !== "pending")
    throw badRequest("승인/거절된 요청은 삭제 불가");
  // ...
}));
```

---

### 2.6 auditLogger

**파일** · `server/lib/auditLogger.ts`
**라이브러리** · `winston` + `winston-daily-rotate-file`

**저장** · `logs/audit-YYYY-MM-DD.log` · 30일 보관 · gzip 압축 · JSON 라인.
**개발 모드 추가** · Console (colorized).

**API**
```ts
export function audit(
  event: string,
  meta?: Record<string, unknown>,
  level?: "info" | "warn" | "error",
): void;

export function auditContext(req: any): { ip: string; ua: string };
```

**사용**
```ts
router.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { phone, password } = req.body;
  const emp = await verifyLogin(phone, password);
  if (!emp) {
    audit("LOGIN_FAIL", { ...auditContext(req), phone, reason: "wrong_password" }, "warn");
    throw unauthorized("전화번호 또는 비밀번호 오류");
  }
  audit("LOGIN_SUCCESS", { ...auditContext(req), userId: emp.id, name: emp.name });
  issueToken(res, { sub: emp.id, name: emp.name, role: emp.position, level: emp.level });
  res.json({ ok: true });
}));
```

**필수 기록 이벤트**
| Event | Level | Meta |
|---|---|---|
| `LOGIN_SUCCESS` | info | userId · name · ip · ua |
| `LOGIN_FAIL` | warn | phone · reason · ip · ua |
| `PASSWORD_SET_BY_ADMIN` | warn | actorId · targetId · targetName |
| `PASSWORD_CHANGED` | info | userId |
| `PERMISSION_CHANGED` | warn | actorId · targetPage · oldLevel · newLevel |
| `EMPLOYEE_DELETED` | warn | actorId · targetId · targetName |
| `CONTRACT_DELETED` | warn | actorId · contractId |

**주의**
- Payload 에 password / token 절대 넣지 마 (마스킹 필요)
- `audit` 자체 실패해도 앱 정상 동작 (내부 try/catch)

---

### 2.7 pagination

**파일** · `server/lib/pagination.ts`

**타입**
```ts
export interface Pagination {
  page: number;    // 1-based
  limit: number;
  offset: number;
  from: number;    // Supabase .range(from, to) 용
  to: number;
}
```

**API**
```ts
export function parsePagination(
  req: Request,
  defaults?: { limit?: number; maxLimit?: number }
): Pagination;

export function paginatedResponse<T>(
  items: T[],
  total: number | null,
  p: Pagination,
): { items: T[]; total: number; page: number; limit: number; hasMore: boolean };
```

**동작**
- `?page=N` · 기본 1 · 최소 1
- `?limit=N` · 기본 `defaults.limit ?? 50` · 최대 `defaults.maxLimit ?? 200`
- Invalid 값은 default 로 대체 (에러 던지지 않음)

**사용**
```ts
router.get("/api/purchase-history", asyncHandler(async (req, res) => {
  const p = parsePagination(req, { limit: 30, maxLimit: 100 });
  const { data, count, error } = await supabase
    .from("purchase_history")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(p.from, p.to);
  if (error) throw new HttpError(500, error.message);
  res.json(paginatedResponse(data ?? [], count, p));
}));
```

**응답 예**
```json
{
  "items": [...],
  "total": 127,
  "page": 2,
  "limit": 30,
  "hasMore": true
}
```

---

## 3. 클라이언트 프레임워크

### 3.1 useToast + toastClass

**파일** · `src/hooks/useToast.ts`

**타입**
```ts
export type ToastTone = "info" | "success" | "error" | "warn";
export interface Toast { message: string; tone: ToastTone }
```

**API**
```ts
export function useToast(defaultMs?: number): {
  toast: Toast | null;
  show: (message: string, ms?: number, tone?: ToastTone) => void;
  showSuccess: (message: string, ms?: number) => void;
  showError: (message: string, ms?: number) => void;    // ms 기본 4000
  showWarn: (message: string, ms?: number) => void;     // ms 기본 3500
  clear: () => void;
};

export function toastClass(tone: ToastTone): string;
```

**동작**
- 내부 `useRef<Timeout>` · unmount 시 자동 clear (누수 없음)
- `show` 재호출 시 이전 timer clearTimeout → 새 timer

**사용 (표준)**
```tsx
const { toast, showSuccess, showError } = useToast(2500);
// ...
try { await api.save(); showSuccess("저장됨"); }
catch (e: any) { showError(e.message); }
// ...
{toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
```

**사용 (레거시 shim 유지)** — 기존 `<Toast message={string} />` 렌더 유지 시
```tsx
const { toast: _toastObj, show: _showToast } = useToast(2200);
const toast = _toastObj?.message ?? null;
const showToast = (msg: string) => _showToast(msg);
// {toast && <Toast message={toast} />}  · 렌더 그대로
```

**toastClass tone 별 색상**
| Tone | 색상 | 배경 |
|---|---|---|
| `info` (기본) | indigo-600 | indigo-50 |
| `success` | emerald-600 | emerald-50 |
| `error` | rose-600 | rose-50 |
| `warn` | amber-600 | amber-50 |

---

### 3.2 useApiQuery

**파일** · `src/hooks/useApiQuery.ts`
**목적** · 경량 React Query 대체. `data / loading / error / refetch` 표준화.

**타입**
```ts
interface Options<T> {
  skip?: boolean;                        // true 면 fetch skip · 조건부
  select?: (raw: unknown) => T;          // 응답 변환
  initialData?: T;                       // fetch 전 초기값
  onUnauthorized?: () => void;           // 401 콜백 (axios interceptor 로 이미 처리 가능)
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApiQuery<T = unknown>(url: string, opts?: Options<T>): QueryResult<T>;
```

**사용**
```tsx
// 단순 GET
const { data, loading, error, refetch } = useApiQuery<Employee[]>("/api/employees");

// 조건부 fetch (인증 준비 대기)
const { data } = useApiQuery("/api/me", { skip: !session });

// 응답 변환
const { data } = useApiQuery("/api/settings?key=brand", {
  select: (raw: any) => raw?.value?.brandName ?? "",
});

// 초기값
const { data } = useApiQuery("/api/counts", { initialData: { total: 0 } });
```

**내부**
- `axios.get(url, { withCredentials: true })` — 쿠키 자동 전달
- `error` · `err.response.data.error ?? err.message` (문자열)
- `unmount` 후 setState skip (alive flag)

---

### 3.3 usePagePermissions

**파일** · `src/hooks/usePagePermissions.ts`
**목적** · `/api/permissions` 응답 · 앱 전역 캐시 · 여러 컴포넌트 공유.

**API**
```ts
export function usePagePermissions(): { perms: PagePermissions; loading: boolean };
export function invalidatePagePermissions(): void;
```

**사용**
```tsx
function SideNav({ session }: Props) {
  const { perms, loading } = usePagePermissions();
  if (loading) return null;
  const visible = SIDE_NAV_GROUPS.filter(g => (perms[g.key] ?? 0) <= (session.level ?? 0));
  return <>{visible.map(...)}</>;
}
```

**Cache 무효화** · PermissionsPage 저장 후
```tsx
await axios.post("/api/permissions", body);
invalidatePagePermissions();  // 캐시 clear + 브로드캐스트
```

**Composite key 지원** · 서브탭별 권한 `${pageKey}:${subTab}` (예: `"purchase:vat"`).

**Fallback** · fetch 실패 시 `DEFAULT_PERMISSIONS` 사용 · 에러 미노출.

---

### 3.4 useSidebar 계열

**파일** · `src/hooks/useSidebar.ts`

#### useSidebar
```ts
export function useSidebar(): {
  collapsed: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
};
```
- `Cmd/Ctrl+B` 키보드 단축키 지원
- localStorage `sidebar.collapsed` 영속화
- 1280px 미만 화면 · 자동 collapse (설정 없을 시)

#### useSidebarWidth
```ts
export function useSidebarWidth(): {
  width: number;
  setWidth: (next: number) => void;
  startResize: (e: React.MouseEvent) => void;
};
```
- 드래그 리사이즈 · 180~380 clamp
- localStorage `sidebar.width` 영속화
- **모듈 shared state** · 모든 인스턴스 동기화 (여러 곳에서 훅 호출해도 리사이즈 시 함께 리렌더)

#### useSidebarEnabled
```ts
export function useSidebarEnabled(): boolean;
export function invalidateSidebarEnabled(): void;
```
- 서버 KV (`/api/settings?key=sidebar_enabled`) 기반
- 관리자가 UI 에서 토글 가능 (재배포 불필요)
- Fallback · `VITE_SIDEBAR_V2` env var (기본 true)

---

### 3.5 ErrorBoundary

**파일** · `src/components/common/ErrorBoundary.tsx`
**목적** · React Suspense 와 함께 · dynamic import(chunk) 실패 시 reload 버튼 제공.

**사용**
```tsx
<ErrorBoundary>
  <Suspense fallback={<Spinner />}>
    <LazyPage />
  </Suspense>
</ErrorBoundary>
```

**동작** · `componentDidCatch` 로 chunk load 에러 감지 · 사용자에게 "새로고침" 버튼 노출.

---

### 3.6 MenuCard

**파일** · `src/components/LandingPage/MenuCard.tsx`
**목적** · 랜딩 페이지 12+ 카드 공용화.

**Props**
```ts
type MenuCardColor = "red" | "violet" | "indigo" | "orange" | "zinc" | "sky" | "amber" | "emerald" | "fuchsia";

interface MenuCardProps {
  color: MenuCardColor;
  icon: ElementType;         // Phosphor icon 컴포넌트
  title: string;
  description: string;
  onClick: () => void;
  orderClass?: string;       // "order-1" 등
  badge?: ReactNode;         // 우측 상단 절대배치 · 있으면 icon mt-5 sm:mt-6
  descClass?: string;        // 설명 크기 override (기본 text-[11px] sm:text-[13px])
}
```

**사용**
```tsx
<MenuCard
  color="red"
  icon={SquaresFour}
  title="매장관리"
  description="매장 · 발주 · 매입 · 결제"
  onClick={() => onNavigate("display", auth)}
  badge={pending > 0 ? <Badge count={pending} /> : undefined}
/>
```

**색상 매핑** (JIT 안전 · static Tailwind classes)
- 각 color · `hoverBorder`, `hoverBg`, `iconText` 3 클래스 매핑
- 색상 추가 시 · `COLOR_MAP` 에 항목 추가 후 타입 union 확장

---

### 3.7 도메인 lib

#### employeeCategory
**파일** · `src/lib/employeeCategory.ts`
```ts
isPharmPosition(position: string): boolean;
isLogisticsPosition(position: string): boolean;
isWarehousePosition(position: string): boolean;
isPartTimeEmployment(employmentType: string): boolean;
isOtherPosition(position: string): boolean;
isPharmEmp(emp: Employee): boolean;
isOtherEmp(emp: Employee): boolean;
isStaffEmp(emp: Employee): boolean;   // 약사 제외 정규직
```

#### employeeApi
**파일** · `src/lib/employeeApi.ts`
```ts
updateEmployee(base: Employee, patch: EmployeeUpdatePayload): Promise<Employee>;   // 부분 갱신 (base merge)
updateEmployeeFull(id: number, payload: EmployeeUpdatePayload): Promise<Employee>;
createEmployee(payload: EmployeeUpdatePayload): Promise<Employee>;
deleteEmployee(id: number): Promise<void>;
uploadResume(id: number, file: File): Promise<{ url: string }>;
deleteResume(id: number): Promise<void>;
uploadContract(id: number, file: File): Promise<{ url?: string }>;
uploadBankbook(emp: Employee, file: File): Promise<{ dataUrl: string }>;     // base64 → PUT
uploadResignationFile(id: number, file: File): Promise<{ url?: string }>;
```

**주의** · `updateEmployee` 은 `base` 필수 (전체 필드 병합 후 PUT 서버 계약 맞춤).

#### contract lib
**파일** · `src/lib/contract/index.ts`
- `loadContractSettings`, `fetchContractWriterSettings`, `loadContractClauses` 등 순수 로직 300+ 라인 추출
- ContractWriterPage · ContractSettingsPage 공용

---

## 4. 마이그레이션 레시피

### 4.1 route → asyncHandler + HttpError

**Before** (금지 패턴)
```ts
router.get("/api/x", async (req, res) => {
  try {
    const { data, error } = await supabase.from("x").select();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "not found" });
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
```

**After**
```ts
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError, notFound } from "../../middleware/errorHandler";

router.get("/api/x", asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from("x").select();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw notFound();
  res.json(data);
}));
```

**변환 매핑**
| Before | After |
|---|---|
| `async (req, res) => { ... }` | `asyncHandler(async (req, res) => { ... })` |
| `try { ... } catch { return res.status(500)... }` | 감싸기만 · try/catch 제거 |
| `res.status(400).json({ error })` | `throw badRequest(msg)` |
| `res.status(401)` | `throw unauthorized(msg)` |
| `res.status(403)` | `throw forbidden(msg)` |
| `res.status(404)` | `throw notFound(msg)` |
| `res.status(500).json({ error })` | `throw new HttpError(500, msg)` |
| `res.status(409/503)` | `throw new HttpError(status, msg, code?)` |

**원본 유지 케이스** (변환 금지)
- fallback 재시도 루프 (예: Storage 실패 → 로컬 저장)
- 특정 status 를 200 { ok:false } 로 유지해야 하는 진단 endpoint
- graceful degradation (테이블 미생성 시 빈 배열 200 반환)
- best-effort cleanup (실패 무시 · `.catch(() => null)`)

### 4.2 form → Zod validateBody

**Before**
```ts
router.post("/api/x", async (req, res) => {
  const { name, price } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name 필수" });
  if (typeof price !== "number") return res.status(400).json({ error: "price 숫자" });
  // ...
});
```

**After**
```ts
import { z } from "zod";
import { validateBody } from "../../middleware/zodValidate";

const CreateSchema = z.object({
  name: z.string().min(1, "name 필수"),
  price: z.number().positive("price 는 양수"),
});

router.post("/api/x", validateBody(CreateSchema), asyncHandler(async (req, res) => {
  const { name, price } = req.body;  // 타입 안전
  // ...
}));
```

### 4.3 useState + setTimeout Toast → useToast

**Before**
```tsx
const [toast, setToast] = useState<string | null>(null);
const showToast = (msg: string) => {
  setToast(msg);
  setTimeout(() => setToast(null), 2200);
};
// ...
{toast && <Toast message={toast} />}
```

**After** (shim 유지 · 기존 렌더 코드 그대로)
```tsx
import { useToast } from "../../hooks/useToast";

const { toast: _toastObj, show: _showToast } = useToast(2200);
const toast = _toastObj?.message ?? null;
const showToast = (msg: string) => _showToast(msg);
// {toast && <Toast message={toast} />}  · 유지
```

**After** (완전 마이그레이션 · tone 사용)
```tsx
const { toast, showSuccess, showError } = useToast(2500);
// ...
{toast && <div className={toastClass(toast.tone)}>{toast.message}</div>}
```

### 4.4 fetch → useApiQuery

**Before**
```tsx
const [items, setItems] = useState<Item[]>([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch("/api/items").then(r => r.json()).then(d => { setItems(d); setLoading(false); });
}, []);
```

**After**
```tsx
const { data: items = [], loading, refetch } = useApiQuery<Item[]>("/api/items");
```

### 4.5 ownership 검사 → checkOwnershipOrAdmin

**Before**
```ts
router.delete("/api/x/:id", requireAuth, async (req, res) => {
  const session = getSession(req)!;
  const isAdmin = (session.level ?? 0) >= 9;
  const { data: row } = await supabase.from("x").select("owner_id").eq("id", req.params.id).single();
  if (!row) return res.status(404).json({ error: "not found" });
  if (!isAdmin && row.owner_id !== session.sub) return res.status(403).json({ error: "본인만" });
  // delete
});
```

**After**
```ts
router.delete("/api/x/:id", asyncHandler(async (req, res) => {
  const check = await checkOwnershipOrAdmin(req, {
    table: "x", id: req.params.id, ownerCol: "owner_id",
  });
  if (check.ok !== true) throw new HttpError(check.status, check.error);
  const { error } = await supabase.from("x").delete().eq("id", req.params.id);
  if (error) throw new HttpError(500, error.message);
  res.json({ ok: true });
}));
```

---

## 5. 안티패턴 · 금지 목록

### 서버
| 금지 | 대체 |
|---|---|
| `try/catch` 로 500 응답 반환 | `asyncHandler` + `throw new HttpError(500, ...)` |
| `res.status(400).json({ error })` 반복 | `throw badRequest(msg)` |
| 수동 body 검증 (`if (!name) ...`) | Zod + `validateBody` |
| requireAuth 없이 세션 접근 | `authorize(N)` 또는 route 내 `getSession` 후 throw |
| 소유자 검사 손코딩 | `checkOwnershipOrAdmin` |
| 로그인/삭제 audit 누락 | `audit(EVENT, ...)` |
| `page`/`limit` 파라미터 수동 파싱 | `parsePagination(req)` |
| `res.status(200).json({ ok: false, error })` (의도 없이) | 진짜 에러면 `throw HttpError` |
| console.log 로 감사 이벤트 기록 | `audit()` 사용 (winston 이 통합) |
| JWT 수명 24h+ | Access 15분 + Refresh 30일 |

### 클라이언트
| 금지 | 대체 |
|---|---|
| `useState + setTimeout` Toast | `useToast` |
| `fetch/axios` 직접 + loading/error 상태 손코딩 | `useApiQuery` |
| 페이지 권한 컴포넌트별 fetch | `usePagePermissions` |
| 랜딩 카드 인라인 button 12번 반복 | `MenuCard` |
| 401 배너 노출 후 대기 | 즉시 `onLogout()` (feedback_session_expiry.md) |
| 파일 500 라인 초과 방치 | `common/`, `lib/`, `hooks/` 로 분리 |
| 반복 3회 이상 로직 인라인 | 즉시 `lib/hooks/common` 추출 |

---

## 6. 파일 구조 규칙

```
server/
  middleware/       ← Express 미들웨어 (asyncHandler, errorHandler, zodValidate, requireAuth)
  lib/              ← 순수 라이브러리 (ownershipCheck, auditLogger, pagination, tenantConfig)
  services/         ← 도메인 서비스 (scheduleService, notificationsService)
  routes/
    daily/          ← 일일 (leave, lunch, reservations)
    display/        ← 진열 (requests, mismatches, zone*)
    purchase/       ← 매입 (vendors, purchase, vat, supplier*)
    stock/          ← 재고 (products, stockManage, productArrivals)
    staff/          ← 직원 (staff, hrForms, contracts, resignations)
    schedule/       ← 스케줄
    settings/       ← 설정
    ocr/            ← OCR
    board/          ← 게시판·알림
    reference/      ← 참조값 (DB DISTINCT)
    auth/           ← 인증

src/
  hooks/            ← 프레임워크급 훅 (useToast, useApiQuery, useSidebar, usePagePermissions, useAuth, useFetch, useConfirm) + 도메인 훅
  lib/              ← 순수 라이브러리 (employeeApi, employeeCategory, contract, wageGrossUp)
  components/
    common/         ← 공용 컴포넌트 (ErrorBoundary, SettingsPageShell, SplitPanel, EmployeeProfileCard, ProductSearchInput)
    LandingPage/    ← 랜딩 (LandingPage, MenuCard, VendorListEditor, VendorStockModal)
    <Page>/         ← 페이지별 폴더 · <Page>.tsx + 하위 컴포넌트
  styles/           ← 디자인 토큰 (tokens.ts)
  constants/        ← 상수 (timing 등)
  types/            ← 타입 정의
```

**500 라인 초과 파일** · `<Page>/types.ts`, `<Page>/utils.ts`, `<Page>/<SubComponent>.tsx` 로 분리.

---

## 7. 테스트 · 검증 체크리스트

**모든 편집 후 필수** (`feedback_test_bugfix_principle.md`)

- [ ] `npx tsc --noEmit` · 에러 0
- [ ] `npx vite build` · 성공
- [ ] 사용처 grep · 변경된 export 이름·시그니처 · 전 사용처 확인
- [ ] UI 변경 시 · 브라우저에서 golden path + edge case 확인
- [ ] API 변경 시 · Postman/curl 로 200/400/401/403/404/500 응답 확인
- [ ] 회귀 없음 · 관련 기능 3개 이상 스팟체크

**커밋 정책**
- TS + build 통과 시 로컬 자동 커밋 (`feedback_auto_commit.md`)
- Remote push · 사용자 명시 지시 있을 때만 (`feedback_remote_push_strict.md`)

---

## 8. 마이그레이션 상태

**작성 시점** · 2026-08-16 (v1.5 최신)

### 서버 route · asyncHandler 100% (37/37 파일 · 완료)

**shared 스키마 · DTO 적용 (5 route)**
- `auth/auth.ts` · 4 스키마 (Login/VendorLogin/SetPassword/ChangePassword) + 4 DTO (Login/VendorLogin/Refresh/AuthOk)
- `daily/leave.ts` · 2 스키마 + LeaveBalance/LeaveStats DTO
- `daily/lunch.ts` · 1 스키마 + LunchRequests/LunchAttendance DTO
- `daily/reservations.ts` · 1 스키마
- `schedule/schedules.ts` · NextEmployeeNumberResponse DTO
- `purchase/vendors.ts` · VendorsListResponse DTO

**shared 미적용 32 route** · asyncHandler 만 · 순차 도입 예정

### 클라이언트 · apiClient 채택 (15 files · 100% · Gemini 예외)

**hooks (11개)**
- useApiQuery · usePagePermissions · useReferenceValues · useVendors
- useSeasonRanges · useSettings · useKvSetting · useHiddenManager
- useProductInfoSearch · usePushSubscription · useLeaveManager · useSidebar

**components (5개)**
- EmployeeFormModal · MyPage · PermissionsPage · LandingPage · SchedulePage · VendorStockModal

**잔여 axios (Gemini 코드 · 규칙 금지)**
- OcrPage · GeminiParseOnlyButton (feedback_gemini_untouchable.md)

### 클라이언트 useToast 채택 (8 컴포넌트)
- MyPage · PermissionsPage · ProductArrivalPage · ScanPage · ZoneLabelsEditor
- VendorStockModal · LunchPage · RequestsPage 등 순차

### shared/ (11 파일)
- `schemas/` · auth · leave · lunch · reservation · employees (5개)
- `dtos/` · common · auth · leave · lunch · employees · vendors · reservations · products (8개 · 40+ 타입)

---

## 부록 · 참고 문서

- `docs/MENU_STRUCTURE.md` · 전체 프로젝트 구조
- `docs/TASKS.md` · 작업 대기 큐
- `docs/PAYROLL_ALGORITHM.md` · 임금 계산 알고리즘
- `docs/DB_SETUP.md` · Supabase 스키마
- 메모리 (`~/.claude/projects/D--antigravity-projects-megatown-staff-scheduler/memory/`)
  - `feedback_framework_principle.md` · 3곳 반복 = 즉시 추출
  - `feedback_code_slim.md` · 주석 최소 · 프레임워크 기반
  - `feedback_logging_principle.md` · try/catch + prefix 로그
  - `feedback_test_bugfix_principle.md` · 매 편집 TS+build
  - `feedback_no_regression_strict.md` · 회귀 절대 금지
  - `feedback_remote_push_strict.md` · 명시 승인 없인 push 금지
  - `feedback_ui_direct.md` · UI 위임 금지 · 직접 편집

---

**문서 개정 이력**
- 2026-08-16 v1.0 · 최초 작성 (Framework 8모듈 · Client 7훅 · Migration 24 routes)
- 2026-08-16 v1.5 · asyncHandler 100% · shared/schemas 5 도메인 · shared/dtos 7 도메인 · apiClient 11 files 채택 · 103 tests
- 2026-08-17 v1.6 · apiClient 100% (Gemini 제외 15 files) · shared/dtos 8 도메인 (40+ 타입) · MyPage/PermissionsPage/LandingPage/SchedulePage/VendorStockModal 마이그레이션 완료
