// ── 공유 타입 정의 ──────────────────────────────────────────────────────────

export interface ConfirmedItem {
  supplier: string;
  product_name: string;
  product_code?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  balance?: number;
  expiry_date?: string;
  memo?: string;
  confirmed_at?: string;  // 2차보정 확정 버튼 누른 작업일 (YYYY-MM-DD)
  invoice_date?: string;  // 거래명세서 원본 날짜 (meta.date) — saved_at과 별개
  raw_json?: Record<string, unknown>;
  image_url?: string;     // Cloudinary 명세서 원본 이미지 URL
  image_public_id?: string; // Cloudinary public_id (삭제 시 사용)
}

export interface RawPage {
  page: number;
  headers: string[];
  rows: (string | number | null)[][];
  meta: {
    supplier?: string | null;
    recipient?: string | null;
    date?: string | null;
    total?: number | null;
    summary_rows?: Array<{ label: string; amount: number }>;
    [key: string]: unknown;
  };
  rawText?: string;
  rawOcrHeaders?: string[];
  rawOcrSample?: (string | number | null)[][];
}

export interface MatchedItem {
  input: string;
  matched: {
    code: string; name: string; spec: string; score: number;
    masterPrice: number | null;
    salePrice:   number | null;
    profitRate:  number | null;
    expiryDate:  string | null;
    supplier:    string | null;
  } | null;
  score?: number;
}

export type CandidateInfo = NonNullable<MatchedItem["matched"]>;

export interface BarcodeProduct {
  barcode: string;
  code: string;
  name: string;
  spec: string | null;
  supplier: string | null;
  masterPrice: number | null;
  salePrice: number | null;
  profitRate: number | null;
  expiryDate: string | null;
}

export interface RawOcrTableProps {
  pages: RawPage[];
  pageImages?: string[]; // dataURL per page (index = page-1)
  rotation?: number;     // CSS rotation applied in PageImageViewer (degrees)
  // approach (2026-07-19 · 순환 재파싱): default | rearrange | high-contrast | gemini
  onReparsePage?: (pageNum: number, supplier: string, approach?: "default" | "rearrange" | "high-contrast" | "gemini") => Promise<any>;
  barcodeMatches?: BarcodeProduct[];
  balanceConfig?: Record<string, string>;
  onSaveConfirmed?: (items: ConfirmedItem[]) => Promise<void>;
}
