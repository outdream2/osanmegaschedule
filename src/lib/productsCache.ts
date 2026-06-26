export interface ProductInfo { code: string; name: string; spec: string; [key: string]: any; }

let _map: Record<string, ProductInfo> | null = null;
let _promise: Promise<Record<string, ProductInfo>> | null = null;

export function prefetchProducts(): void {
  if (_map || _promise) return;
  _promise = fetch("/products.json")
    .then(r => r.json())
    .then((m: Record<string, ProductInfo>) => { _map = m; return m; })
    .catch(() => { _promise = null; return {}; });
}

export function getProductsMap(): Promise<Record<string, ProductInfo>> {
  if (_map) return Promise.resolve(_map);
  if (_promise) return _promise;
  prefetchProducts();
  return _promise!;
}

export function lookupProduct(code: string): ProductInfo | null {
  if (!_map) return null;
  const q = code.trim();
  return _map[q] ?? _map[q.replace(/^0+/, "")] ?? null;
}

export function isProductsLoaded(): boolean {
  return _map !== null;
}
