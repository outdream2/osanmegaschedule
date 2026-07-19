import sharp, { type Sharp } from "sharp";

type ZBarSym = { decode: () => string; typeName: string };
type ScanFn = (data: { data: Uint8ClampedArray; width: number; height: number }) => Promise<ZBarSym[]>;

let _scanFn: ScanFn | null = null;

async function getScanFn(): Promise<ScanFn | null> {
  if (_scanFn) return _scanFn;
  try {
    const mod: any = await import("@undecaf/zbar-wasm");
    _scanFn = mod.scanImageData ?? mod.default?.scanImageData ?? null;
  } catch { /* zbar unavailable */ }
  return _scanFn;
}

/** EAN-8/13, UPC-A/E 등 1D 상품 바코드인지 판별 */
function isProductBarcode(typeName: string, value: string): boolean {
  const t = typeName.toUpperCase();
  if (!["EAN-13", "EAN-8", "UPCA", "UPCE", "CODE128", "CODE39"].some(k => t.includes(k))) return false;
  // 8-14자리 숫자 → 상품 바코드로 간주
  return /^\d{8,14}$/.test(value);
}

/**
 * base64 이미지에서 바코드를 스캔합니다.
 * - 빠른 첫 패스: 원본 해상도
 * - 실패 시 폴백: 1.5배 업스케일 (작은 바코드 대응)
 * @returns 고유 바코드 값 배열 (중복 제거)
 */
export async function scanBarcodesFromB64(b64: string, _mimeType: string): Promise<string[]> {
  const scan = await getScanFn();
  if (!scan) return [];

  try {
    const buf = Buffer.from(b64, "base64");
    const results = new Set<string>();

    const trySharp = async (input: Buffer | Sharp) => {
      const { data, info } = await (typeof input === "object" && "raw" in input ? input : sharp(input))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const imageData = { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
      const syms = await scan(imageData);
      for (const s of syms) {
        const val = s.decode();
        if (isProductBarcode(s.typeName, val)) results.add(val);
      }
    };

    // 1패스: 원본 (최대 2000px 제한)
    const img = sharp(buf);
    const meta = await img.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    const MAX = 2000;
    const baseSharp = (w > MAX || h > MAX)
      ? sharp(buf).resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
      : sharp(buf);
    await trySharp(baseSharp);

    // 2패스: 폴백 — 1.5배 업스케일 (바코드가 작을 때)
    if (results.size === 0 && w > 0 && h > 0) {
      const scale = Math.min(1.5, 3000 / Math.max(w, h));
      if (scale > 1.05) {
        await trySharp(sharp(buf).resize(Math.round(w * scale), Math.round(h * scale)));
      }
    }

    return [...results];
  } catch (e: any) {
    console.warn("[OCR/Barcode] 스캔 오류:", e?.message);
    return [];
  }
}
