// ── ZBar WASM lazy singleton ───────────────────────────────────────────────────
export type ZBarSym = { decode: () => string; typeName: string };

// ESM live binding: importers see latest value after loadZBar() assigns mod.scanImageData
export let _zbarScan: ((data: ImageData) => Promise<ZBarSym[]>) | null = null;
let _zbarPromise: Promise<void> | null = null;

export function loadZBar(): Promise<void> {
  if (_zbarScan) return Promise.resolve();
  if (_zbarPromise) return _zbarPromise;
  _zbarPromise = import("@undecaf/zbar-wasm")
    .then((mod: any) => { _zbarScan = mod.scanImageData ?? mod.default?.scanImageData ?? null; })
    .catch(() => { /* fallback to ZXing only */ });
  return _zbarPromise;
}
