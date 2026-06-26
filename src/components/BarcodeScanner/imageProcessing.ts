// ── Image preprocessing: grayscale + contrast stretch ─────────────────────────
// center=128 default; pass avgBrightness(src) as center for e-ink gray barcodes
export function toGrayContrast(src: ImageData, factor: number, invert = false, center = 128): ImageData {
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const g = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    let v = Math.min(255, Math.max(0, (g - center) * factor + center));
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Sharpening: 3x3 convolution for edge enhancement ──────────────────────────
// Operates on already-grayscale ImageData (R=G=B). Crucial for paper barcodes
// where ink edges blur slightly during print + camera capture.
export function sharpenGray(src: ImageData): ImageData {
  const w = src.width;
  const h = src.height;
  const s = src.data;
  const d = new Uint8ClampedArray(s.length);
  // Copy alpha + initial RGB (border pixels stay original)
  for (let i = 0; i < s.length; i++) d[i] = s[i];

  // kernel [0,-1,0,-1,5,-1,0,-1,0] — apply to interior pixels only
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const top    = s[i - w * 4];
      const left   = s[i - 4];
      const centre = s[i];
      const right  = s[i + 4];
      const bottom = s[i + w * 4];
      const v = Math.min(255, Math.max(0, 5 * centre - top - left - right - bottom));
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── Binarization: pure black/white from grayscale ─────────────────────────────
export function binarize(src: ImageData, threshold: number): ImageData {
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const v = src.data[i] >= threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Gamma correction — brightens dark frames (gamma < 1) ──────────────────────
// LUT-based for speed. gamma=0.4 turns pixel-30 → ~97, making dark barcodes visible.
// toGrayContrast crushes dark pixels to 0; this fixes that by lifting them first.
export function brightenGamma(src: ImageData, gamma = 0.4): ImageData {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 255, gamma));
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const g = Math.round(0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]);
    const v = lut[g];
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Histogram stretch — maps actual min-max to full 0-255 range ───────────────
// Robust to varying room brightness: always uses the full dynamic range available.
export function histoStretch(src: ImageData): ImageData {
  let min = 255, max = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    const v = src.data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max <= min) return src;
  const scale = 255 / (max - min);
  const d = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const v = Math.round((src.data[i] - min) * scale);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  return new ImageData(d, src.width, src.height);
}

// ── Adaptive threshold (integral image Sauvola) — best for e-ink/ESL barcodes ─
// Bars on e-ink are gray (~145) on light-gray background (~210). Global binarize
// fails. Local mean-based threshold handles the gray-on-gray contrast cleanly.
export function adaptiveThreshold(src: ImageData, blockSize = 31, k = 0.08): ImageData {
  const w = src.width, h = src.height;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d4 = i * 4;
    gray[i] = 0.299 * src.data[d4] + 0.587 * src.data[d4 + 1] + 0.114 * src.data[d4 + 2];
  }
  // Build integral image (padded by 1 row/col for clean boundary math)
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      integral[(y + 1) * iw + (x + 1)] = gray[y * w + x]
        + integral[y * iw + (x + 1)]
        + integral[(y + 1) * iw + x]
        - integral[y * iw + x];
    }
  }
  const half = blockSize >> 1;
  const d = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * iw + (x1 + 1)]
                - integral[y0 * iw + (x1 + 1)]
                - integral[(y1 + 1) * iw + x0]
                + integral[y0 * iw + x0];
      const v = gray[y * w + x] < (sum / count) * (1 - k) ? 0 : 255;
      const idx = (y * w + x) * 4;
      d[idx] = d[idx + 1] = d[idx + 2] = v; d[idx + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── Vertical morphological dilation — thickens thin dark bars ─────────────────
// E-ink bars can be broken/faint due to limited dot pitch. Taking the MIN in a
// vertical window expands dark regions downward, filling micro-gaps in bar lines.
export function vertDilate(src: ImageData, radius = 2): ImageData {
  const w = src.width, h = src.height;
  const d = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minV = src.data[(y * w + x) * 4]; // start with own value
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = Math.max(0, Math.min(h - 1, y + dy));
        const v = src.data[(yy * w + x) * 4];
        if (v < minV) minV = v;
      }
      const idx = (y * w + x) * 4;
      d[idx] = d[idx + 1] = d[idx + 2] = minV; d[idx + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── Average brightness of ImageData (0–255) ───────────────────────────────────
export function avgBrightness(src: ImageData): number {
  let sum = 0;
  const n = src.data.length / 4;
  for (let i = 0; i < src.data.length; i += 4)
    sum += 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
  return sum / n;
}

// ── Horizontal box blur — smooths e-ink dot-matrix grain along scanlines ─────
// E-ink bars appear as dotted rows; blurring horizontally merges dots into solid
// strips that ZBar's horizontal scanline decoder handles cleanly.
export function horzBlur(src: ImageData, radius = 2): ImageData {
  const w = src.width, h = src.height;
  const d = new Uint8ClampedArray(src.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        sum += src.data[(y * w + Math.max(0, Math.min(w - 1, x + dx))) * 4];
      }
      const idx = (y * w + x) * 4;
      const v = Math.round(sum / (radius * 2 + 1));
      d[idx] = d[idx + 1] = d[idx + 2] = v; d[idx + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── White quiet-zone padding — adds synthetic left/right margins ───────────
// Barcode decoders require a quiet zone on each side. If the crop is tight,
// padding with white pixels simulates proper quiet zones without re-cropping.
export function padQuietZone(src: ImageData, pad = 30): ImageData {
  const sw = src.width, h = src.height;
  const dw = sw + pad * 2;
  const d = new Uint8ClampedArray(dw * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * 4;
      const di = (y * dw + x + pad) * 4;
      d[di] = src.data[si]; d[di + 1] = src.data[si + 1];
      d[di + 2] = src.data[si + 2]; d[di + 3] = 255;
    }
  }
  return new ImageData(d, dw, h);
}

// ── Vertical box blur — merges vertically-stacked dots into solid bar lines ──
// Complement to horzBlur: blurs only in the column direction so horizontal bar
// boundaries stay sharp while dot gaps in the vertical axis close up.
// Principle: 1D mean filter along Y axis (1×N kernel, N = radius*2+1).
export function vertBlur(src: ImageData, radius = 5): ImageData {
  const w = src.width, h = src.height;
  const d = new Uint8ClampedArray(src.data.length);
  const diam = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        sum += src.data[(Math.max(0, Math.min(h - 1, y + dy)) * w + x) * 4];
      }
      const idx = (y * w + x) * 4;
      const v = Math.round(sum / diam);
      d[idx] = d[idx + 1] = d[idx + 2] = v; d[idx + 3] = 255;
    }
  }
  return new ImageData(d, w, h);
}

// ── OCR digit extraction: pull 6-14 digit sequences from Tesseract output ────
export function extractBarcodeDigits(text: string): string | null {
  const matches = text.replace(/\s/g, "").match(/\d{6,14}/g);
  return matches?.[0] ?? null;
}
