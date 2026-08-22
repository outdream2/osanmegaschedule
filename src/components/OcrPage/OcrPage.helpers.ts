// 2026-08-22 · Framework Phase 4 · OcrPage.tsx large-file 분리
// 이미지 전처리 pure helpers · OCR 파이프라인 지원
//   · detectTextOrientation · 이미지의 텍스트 방향 자동 감지 (0/90/180/270°)
//   · physicallyRotate · 이미지를 지정 각도로 회전한 새 base64 반환
//   · resizeImageForOcr · OCR 전송 전 max 2400px · JPEG q92 리사이징

export async function detectTextOrientation(dataUrl: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 320;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const sw = Math.floor(img.width * scale);
      const sh = Math.floor(img.height * scale);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(0);

      // Render at `deg` CW degrees, return row-projection + variance
      function renderProj(deg: number) {
        const swap = deg === 90 || deg === 270;
        const cw = swap ? sh : sw;
        const ch = swap ? sw : sh;
        canvas.width = cw; canvas.height = ch;
        ctx!.clearRect(0, 0, cw, ch);
        ctx!.save();
        ctx!.translate(cw / 2, ch / 2);
        ctx!.rotate((deg * Math.PI) / 180);
        ctx!.drawImage(img, -sw / 2, -sh / 2, sw, sh);
        ctx!.restore();
        const px = ctx!.getImageData(0, 0, cw, ch).data;
        const proj = new Float64Array(ch);
        for (let y = 0; y < ch; y++) {
          let d = 0;
          for (let x = 0; x < cw; x++) {
            const i = (y * cw + x) * 4;
            if (px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114 < 180) d++;
          }
          proj[y] = d;
        }
        const mean = proj.reduce((a, b) => a + b, 0) / ch;
        const variance = proj.reduce((a, b) => a + (b - mean)**2, 0) / ch;
        return { proj, ch, variance };
      }

      // Ratio of top-quarter dark pixels to bottom-quarter
      // > 1 → text heavier at top (document is right-side-up)
      // < 1 → text heavier at bottom (document is upside-down / needs 180°)
      function topHeavyRatio(proj: Float64Array, ch: number) {
        const slice = Math.max(1, Math.floor(ch * 0.22));
        let top = 0, bot = 0;
        for (let y = 0; y < slice; y++) top += proj[y];
        for (let y = ch - slice; y < ch; y++) bot += proj[y];
        return top / (bot + 1);
      }

      // Step 1: is text horizontal or vertical?
      const r0  = renderProj(0);
      const r90 = renderProj(90);

      let bestDeg: number;
      if (r0.variance >= r90.variance) {
        // Horizontal text — distinguish 0° vs 180° by top-heavy ratio at 0°
        // Documents (invoices): title/supplier at top → topRatio > 1 when upright
        const ratio = topHeavyRatio(r0.proj, r0.ch);
        bestDeg = ratio >= 0.9 ? 0 : 180;
      } else {
        // Vertical text — distinguish 90° vs 270° by top-heavy ratio at 90°
        // At deg=90 rendering: if doc header lands at TOP → topRatio > 1 → bestDeg=90
        // If doc header lands at BOTTOM → topRatio < 1 → bestDeg=270
        const ratio = topHeavyRatio(r90.proj, r90.ch);
        bestDeg = ratio >= 0.9 ? 90 : 270;
      }

      // Convert to UI correction: deg > 180 → wrap to negative
      resolve(bestDeg > 180 ? bestDeg - 360 : bestDeg);
    };
    img.onerror = () => resolve(0);
    img.src = dataUrl;
  });
}

export async function physicallyRotate(
  b64: string,
  mimeType: string,
  degrees: number,
): Promise<{ data: string; mimeType: string }> {
  if (degrees === 0) return { data: b64, mimeType };
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const rad = (degrees * Math.PI) / 180;
      const swap = degrees === 90 || degrees === 270 || degrees === -90 || degrees === -270;
      const canvas = document.createElement("canvas");
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve({ data: canvas.toDataURL("image/jpeg", 0.95).split(",")[1], mimeType: "image/jpeg" });
    };
    img.src = `data:${mimeType};base64,${b64}`;
  });
}

/** OCR 전송 전 이미지 리사이징: 최대 1500px, JPEG 82% — 5MB→~250KB */
export async function resizeImageForOcr(
  b64: string,
  mimeType: string,
): Promise<{ data: string; mimeType: string }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const MAX = 2400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve({ data: dataUrl.split(",")[1], mimeType: "image/jpeg" });
    };
    img.onerror = () => resolve({ data: b64, mimeType });
    img.src = `data:${mimeType};base64,${b64}`;
  });
}
