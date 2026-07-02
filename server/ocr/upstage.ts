export type UpstageOcrResult =
  | { ok: true; headers: string[]; rows: (string | number | null)[][]; meta: Record<string, any>; rawText: string }
  | { ok: false; error: string; quota?: boolean };

function parseMarkdownTable(md: string): { headers: string[]; rows: (string | number | null)[][] } | null {
  const lines = md.split("\n").map(l => l.trim()).filter(l => l.startsWith("|") && l.endsWith("|"));
  if (lines.length < 2) return null;

  const parseRow = (line: string): (string | null)[] =>
    line.split("|").slice(1, -1).map(c => c.trim() || null);

  const sepIdx = lines.findIndex(l => /^\|[\s\-:|]+\|/.test(l));
  if (sepIdx < 1) return null;

  const headers = parseRow(lines[0]).map(h => h ?? "");
  const rows: (string | number | null)[][] = lines.slice(sepIdx + 1).map(line =>
    parseRow(line).map(cell => {
      if (cell === null || cell === "" || cell === "-") return null;
      const n = Number(cell.replace(/,/g, ""));
      return !isNaN(n) && cell.replace(/,/g, "").trim() !== "" ? n : cell;
    })
  );

  return { headers, rows };
}

function extractMeta(text: string): Record<string, any> {
  const meta: Record<string, any> = {};

  const dateM = text.match(/(\d{4})[년\-./]\s*(\d{1,2})[월\-./]\s*(\d{1,2})/);
  if (dateM) meta.date = `${dateM[1]}-${dateM[2].padStart(2, "0")}-${dateM[3].padStart(2, "0")}`;

  const totalM = text.match(/(?:합\s*계|총\s*액|공급가액합계)[^\d]*([0-9,]+)/);
  if (totalM) meta.total = Number(totalM[1].replace(/,/g, ""));

  // 공급자 — 수신처(코스트팜 등) 제외
  const supM = text.match(/공급\s*(?:자|업체|처)?\s*[:：]?\s*([\S]+)/);
  if (supM) meta.supplier = supM[1].replace(/[()]/g, "").trim();

  return meta;
}

export async function callUpstageOcr(b64: string, mimeType: string): Promise<UpstageOcrResult> {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) return { ok: false, error: "UPSTAGE_API_KEY not set" };

  try {
    const buffer = Buffer.from(b64, "base64");
    const ext = mimeType.includes("pdf") ? "pdf" : mimeType.includes("png") ? "png" : "jpg";
    const blob = new Blob([buffer], { type: mimeType });

    const form = new FormData();
    form.append("document", blob, `invoice.${ext}`);
    form.append("model", "document-parse");
    form.append("output_formats", "['markdown']");
    form.append("ocr", "auto");

    const res = await fetch("https://api.upstage.ai/v1/document-digitization", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as any;
      const msg: string = errBody?.message ?? errBody?.error?.message ?? JSON.stringify(errBody);
      console.warn(`[OCR/Upstage] HTTP ${res.status}: ${msg}`);
      return { ok: false, quota: res.status === 429, error: `Upstage ${res.status}: ${msg}` };
    }

    const data = await res.json() as any;

    // 테이블 엘리먼트 중 가장 컬럼 수가 많은 것 선택
    let headers: string[] = [];
    let rows: (string | number | null)[][] = [];

    const tableEls: any[] = (data.elements ?? []).filter((e: any) => e.category === "table");
    for (const tbl of tableEls) {
      const md: string = tbl.content?.markdown ?? "";
      const parsed = parseMarkdownTable(md);
      if (parsed && parsed.headers.length > headers.length) {
        headers = parsed.headers;
        rows = parsed.rows;
      }
    }

    // 테이블 엘리먼트가 없으면 전체 마크다운에서 파싱
    if (headers.length === 0) {
      const fullMd: string = data.content?.markdown ?? "";
      const parsed = parseMarkdownTable(fullMd);
      if (parsed) { headers = parsed.headers; rows = parsed.rows; }
    }

    const fullText: string = data.content?.text ?? data.content?.markdown ?? "";
    const meta = extractMeta(fullText);

    console.log(`[OCR/Upstage] 성공 — 헤더 ${headers.length}개, 행 ${rows.length}개`);
    return { ok: true, headers, rows, meta, rawText: data.content?.markdown ?? fullText };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
