// ocr/diagRouter.ts — GET /api/ocr/last-log · GET /api/ocr/search-balance
import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { HttpError } from "../../middleware/errorHandler";

const router = Router();

// 최신 OCR 결과 조회 (진단용) — logs/ocr-last.json 반환
router.get("/api/ocr/last-log", asyncHandler(async (_req, res) => {
  const fs = await import("fs");
  const path = await import("path");
  const p = path.join(process.cwd(), "logs", "ocr-last.json");
  if (!fs.existsSync(p)) throw new HttpError(404, "저장된 OCR 로그 없음");
  const data = fs.readFileSync(p, "utf-8");
  res.type("application/json").send(data);
}));

// 공급사명 + 금액으로 OCR 결과에서 항목 검색 (진단용)
router.get("/api/ocr/search-balance", asyncHandler(async (req, res) => {
  const supplier = String(req.query.supplier ?? "").trim();
  const amount = req.query.amount ? Number(req.query.amount) : null;
  const fs = await import("fs");
  const path = await import("path");
  const p = path.join(process.cwd(), "logs", "ocr-last.json");
  if (!fs.existsSync(p)) throw new HttpError(404, "저장된 OCR 로그 없음. OCR을 한 번 실행하세요.");
  const data = JSON.parse(fs.readFileSync(p, "utf-8"));
  const matches: any[] = [];
  for (const page of data.pages ?? []) {
    const supp = page.meta?.supplier ?? "";
    if (supplier && !String(supp).includes(supplier)) continue;
    const hits: any = { page: page.page, supplier: supp, hits: [] as any[] };
    (page.headers ?? []).forEach((h: string, hi: number) => {
      if (/합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(String(h ?? ""))) {
        const values = (page.rows ?? []).map((r: any[]) => r?.[hi]).filter((v: any) => v != null);
        hits.hits.push({ type: "header", col: hi, label: h, values });
      }
    });
    (page.rows ?? []).forEach((r: any[], ri: number) => {
      r?.forEach((c: any, ci: number) => {
        if (typeof c === "string" && /합\s*계\s*액|총\s*합\s*계|합\s*계|잔\s*고|잔\s*액|미\s*수|공\s*급\s*가|매\s*입\s*총\s*계/.test(c)) {
          hits.hits.push({ type: "cell", row: ri, col: ci, label: c, rowFull: r });
        }
        if (amount != null && typeof c === "number" && Math.abs(c - amount) < 1) {
          hits.hits.push({ type: "amount-match", row: ri, col: ci, value: c, rowFull: r });
        }
      });
    });
    if (hits.hits.length) matches.push(hits);
  }
  res.json({ query: { supplier, amount }, matches });
}));

export default router;
