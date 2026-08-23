import React from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { DeleteSynonymDialog } from "./DeleteSynonymDialog";
import { SupplierChangeDialog } from "./SupplierChangeDialog";
import { VendorDetailModal, type Vendor } from "../../LandingPage/VendorListEditor";
import type { RawPage, MatchedItem } from "./types";

export interface RawOcrTableOverlaysProps {
  // toast
  saveConfirmedToast: { type: "success" | "error"; msg: string } | null;
  toast: { tone: string; message: string } | null;
  toastClass: (tone: string) => string;

  // 품명 드롭다운
  nameDropdownRect: { top: number; left: number; width: number } | null;
  nameEditResults: any[];
  nameEditSearchDone: boolean;
  editingNameRow: number | null;
  editingNameRowRef: React.MutableRefObject<number | null>;
  autoSynonymMatches: Record<number, { code: string; name: string }>;
  dispRows: (string | number | null)[][];
  nameIdx: number;
  pageNums: number[];
  rawSupplierByPage: Record<number, string>;
  structuredPages: RawPage[];
  globalSupplier: string | null;
  matchItems: MatchedItem[] | null;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
  setCancelledAutoSyn: React.Dispatch<React.SetStateAction<Set<number>>>;
  setCancelledAutoMap: React.Dispatch<React.SetStateAction<Set<number>>>;
  setRawEditValues: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setMatchItems: React.Dispatch<React.SetStateAction<MatchedItem[] | null>>;
  confirm: (opts: { message: string; danger?: boolean }) => Promise<boolean>;
  saveSynonym: (ri: number, nameOld: string, productCode: string, supplierNew?: string, nameNew?: string, supplierOld?: string) => Promise<void>;
  setCellEdits: React.Dispatch<React.SetStateAction<Record<number, Record<number, string | number | null>>>>;
  setEditingNameRow: React.Dispatch<React.SetStateAction<number | null>>;
  setNameEditResults: React.Dispatch<React.SetStateAction<any[]>>;
  setNameEditSearchDone: React.Dispatch<React.SetStateAction<boolean>>;
  setNameDropdownRect: React.Dispatch<React.SetStateAction<{ top: number; left: number; width: number } | null>>;
  handleMatchPage: (pn: number) => Promise<void>;
  matchRawToPurchaseHistory: (pn: number) => Promise<void>;

  // 동의어 삭제
  deleteSynConfirm: { ri: number; origName: string } | null;
  setDeleteSynConfirm: React.Dispatch<React.SetStateAction<{ ri: number; origName: string } | null>>;
  deleteSynonymByName: (origName: string, productCode?: string) => Promise<void>;

  // 공급처 드롭다운
  editingRawSuppRow: number | null;
  suppDropdownRect: { top: number; left: number; width: number } | null;
  suppInputRef: React.RefObject<HTMLInputElement | null>;
  editingRawSuppVal: string;
  vendorNames: string[];
  addSynonymsOnChange: boolean;
  setSupplierConfirm: React.Dispatch<React.SetStateAction<{ pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null>>;
  setSuppDropdownRect: React.Dispatch<React.SetStateAction<{ top: number; left: number; width: number } | null>>;
  setEditingRawSuppRow: React.Dispatch<React.SetStateAction<number | null>>;

  // vendor 모달
  vendorEditModal: Vendor | null;
  setVendorEditModal: React.Dispatch<React.SetStateAction<Vendor | null>>;

  // 공급처 변경 확인
  supplierConfirm: { pageNum: number; newVal: string; rowCount: number; addSynonyms: boolean } | null;
  nameIdxForDialog: number;
  setRawSupplierByPage: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  handleSynonymBulkAdd: (pageNum: number, newSupplier: string) => Promise<void>;
  onReparsePage?: (pageNum: number, supplier: string, approach: string) => Promise<void>;
  setReparseStatus: React.Dispatch<React.SetStateAction<Record<number, "loading" | "done" | "error" | "saved">>>;
  setReparseSupplier: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}

export const RawOcrTableOverlays: React.FC<RawOcrTableOverlaysProps> = ({
  saveConfirmedToast, toast, toastClass,
  nameDropdownRect, nameEditResults, nameEditSearchDone, editingNameRow, editingNameRowRef,
  autoSynonymMatches, dispRows, nameIdx, pageNums, rawSupplierByPage, structuredPages,
  globalSupplier, matchItems, setAutoSynonymMatches, setCancelledAutoSyn, setCancelledAutoMap,
  setRawEditValues, setMatchItems, confirm, saveSynonym, setCellEdits,
  setEditingNameRow, setNameEditResults, setNameEditSearchDone, setNameDropdownRect,
  handleMatchPage, matchRawToPurchaseHistory,
  deleteSynConfirm, setDeleteSynConfirm, deleteSynonymByName,
  editingRawSuppRow, suppDropdownRect, suppInputRef, editingRawSuppVal, vendorNames,
  addSynonymsOnChange, setSupplierConfirm, setSuppDropdownRect, setEditingRawSuppRow,
  vendorEditModal, setVendorEditModal,
  supplierConfirm, nameIdxForDialog, setRawSupplierByPage, handleSynonymBulkAdd,
  onReparsePage, setReparseStatus, setReparseSupplier,
}) => (
  <>
    {/* ── 저장 완료 토스트 ── */}
    {saveConfirmedToast && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 pointer-events-none"
        style={{
          background: saveConfirmedToast.type === "success" ? "#059669" : "#e11d48",
          color: "white",
        }}
      >
        {saveConfirmedToast.type === "success" ? <CheckCircle size={13} /> : <XCircle size={13} />}
        {saveConfirmedToast.msg}
      </div>
    )}

    {/* ── 품명 검색 드롭다운 (position:fixed — overflow 클리핑 우회) ── */}
    {nameDropdownRect && (nameEditResults.length > 0 || nameEditSearchDone) && (
      <div
        style={{ position: "fixed", top: nameDropdownRect.top, left: nameDropdownRect.left, width: nameDropdownRect.width, zIndex: 9999, maxHeight: "70vh" }}
        className="bg-white border border-indigo-200 rounded-xl shadow-2xl overflow-y-auto"
        onMouseDown={e => e.preventDefault()}
      >
        {nameEditResults.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-gray-400 text-center">상품이 없습니다</div>
        ) : nameEditResults.map((p, pi) => (
          <button key={pi}
            onMouseDown={e => e.preventDefault()}
            onClick={async () => {
              const ri = editingNameRow ?? editingNameRowRef.current;
              if (ri == null) { console.warn("[dropdown click] editingNameRow null · 무시"); return; }
              const origName = String(autoSynonymMatches[ri]?.name ?? dispRows[ri]?.[nameIdx] ?? "");
              const pnLocal = pageNums[ri];
              const supplier = rawSupplierByPage[pnLocal] ?? structuredPages.find(pg => pg.page === pnLocal)?.meta.supplier ?? globalSupplier ?? "";
              setAutoSynonymMatches(prev => ({ ...prev, [ri]: { code: p.product_code, name: p.product_name } }));
              setCancelledAutoSyn(prev => { const s = new Set(prev); s.delete(ri); return s; });
              setCancelledAutoMap(prev => { const s = new Set(prev); s.delete(ri); return s; });
              setRawEditValues(prev => { const n = { ...prev }; delete n[ri]; return n; });
              setMatchItems(prev => {
                const next = prev ? [...prev] : dispRows.map(() => ({ input: "", matched: null }));
                next[ri] = {
                  input: origName,
                  matched: {
                    code: String(p.product_code ?? ""),
                    name: String(p.product_name ?? ""),
                    spec: String(p.spec ?? ""),
                    score: 100,
                    masterPrice: p.purchase_price != null ? Number(p.purchase_price) : null,
                    salePrice: p.sale_price != null ? Number(p.sale_price) : null,
                    profitRate: p.profit_rate != null ? Number(p.profit_rate) : null,
                    expiryDate: p.expiry_date ?? null,
                    supplier: p.supplier ?? null,
                  },
                };
                return next;
              });
              if (origName && origName !== p.product_name) {
                if (await confirm({ message: `동의어보정사전에 등록할까요?\n\n· 보정 전: ${origName}\n· 보정 후: ${p.product_name}` })) {
                  saveSynonym(ri, origName, p.product_code, supplier || undefined, p.product_name);
                }
              }
              setCellEdits(prev => {
                if (!prev[ri]) return prev;
                const rowEdits = { ...prev[ri] };
                delete rowEdits[nameIdx];
                if (Object.keys(rowEdits).length === 0) { const n = { ...prev }; delete n[ri]; return n; }
                return { ...prev, [ri]: rowEdits };
              });
              setEditingNameRow(null);
              setNameEditResults([]);
              setNameEditSearchDone(false);
              setNameDropdownRect(null);
              setTimeout(() => {
                (async () => {
                  try {
                    await handleMatchPage(pnLocal);
                    await matchRawToPurchaseHistory(pnLocal);
                  } catch { /* silent */ }
                })();
              }, 100);
            }}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-[12px] border-b border-gray-50 last:border-0">
            <span className="flex-1 font-semibold text-gray-800 break-words">{p.product_name}</span>
            {p.spec && <span className="text-gray-400 shrink-0 max-w-[60px] break-words">{p.spec}</span>}
            {p.supplier && <span className="text-sky-500 shrink-0 max-w-[60px] break-words">{p.supplier}</span>}
          </button>
        ))}
      </div>
    )}

    {/* ── 동의어 삭제 확인 다이얼로그 ── */}
    {deleteSynConfirm && (
      <DeleteSynonymDialog
        deleteSynConfirm={deleteSynConfirm}
        setDeleteSynConfirm={setDeleteSynConfirm}
        deleteSynonymByName={deleteSynonymByName}
        setAutoSynonymMatches={setAutoSynonymMatches}
      />
    )}

    {/* ── 공급처 자동완성 드롭다운 (fixed · 테이블 stacking context 우회) ── */}
    {editingRawSuppRow != null && (() => {
      let rect = suppDropdownRect;
      if (!rect && suppInputRef.current) {
        const r = suppInputRef.current.getBoundingClientRect();
        rect = { top: r.bottom, left: r.left, width: Math.max(220, r.width) };
      }
      if (!rect) return null;
      const q = editingRawSuppVal.trim().toLowerCase().replace(/[\s()（）]/g, "");
      const matches = vendorNames.length === 0 ? [] : (q.length === 0
        ? vendorNames.slice(0, 8)
        : vendorNames.filter(n => n.toLowerCase().replace(/[\s()（）]/g, "").includes(q)).slice(0, 8));
      const commit = (val: string) => {
        const trimmed = val.trim();
        const pn = pageNums[editingRawSuppRow];
        const currentSupp = rawSupplierByPage[pn] ?? structuredPages.find(p => p.page === pn)?.meta.supplier ?? "";
        if (trimmed && trimmed !== currentSupp) {
          const rowCount = pageNums.filter(p => p === pn).length;
          setSupplierConfirm({ pageNum: pn, newVal: trimmed, rowCount, addSynonyms: addSynonymsOnChange });
        }
        setSuppDropdownRect(null);
        setEditingRawSuppRow(null);
      };
      return (
        <div
          className="fixed z-[9999] max-h-52 overflow-y-auto bg-white border border-sky-300 rounded-lg shadow-xl text-xs"
          style={{ top: rect.top + 2, left: rect.left, width: rect.width }}
        >
          <div className="px-2 py-1 text-[10px] text-zinc-500 border-b border-zinc-100 bg-zinc-50 font-bold">
            공급사 DB · {vendorNames.length === 0 ? "⚠ vendors 로드 안 됨 (F5 시도)" : `${matches.length}건${q ? ` ("${q}" 매칭)` : " (전체)"} / 총 ${vendorNames.length}`}
          </div>
          {vendorNames.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-rose-500 text-center">
              공급사 DB 목록이 로드되지 않았어요.<br />/api/vendors 응답 확인 필요.
            </div>
          ) : matches.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-zinc-400 text-center">"{q}" 매칭 없음</div>
          ) : matches.map(name => (
            <button
              key={name}
              type="button"
              onMouseDown={e => { e.preventDefault(); commit(name); }}
              className="w-full text-left px-2 py-1.5 hover:bg-sky-50 text-sky-800 font-semibold border-b border-zinc-50 last:border-0 cursor-pointer"
            >
              {name}
            </button>
          ))}
        </div>
      );
    })()}

    {/* ── 공급사 조회·수정 모달 ── */}
    {vendorEditModal && (
      <VendorDetailModal
        vendor={vendorEditModal}
        onClose={() => setVendorEditModal(null)}
        onSaved={() => { setVendorEditModal(null); }}
      />
    )}

    {/* ── 공급처 변경 확인 다이얼로그 ── */}
    {supplierConfirm && (
      <SupplierChangeDialog
        supplierConfirm={supplierConfirm}
        setSupplierConfirm={setSupplierConfirm}
        nameIdx={nameIdxForDialog}
        structuredPages={structuredPages}
        setRawSupplierByPage={setRawSupplierByPage}
        handleSynonymBulkAdd={handleSynonymBulkAdd}
        onReparsePage={onReparsePage}
        setReparseStatus={setReparseStatus}
        setReparseSupplier={setReparseSupplier}
      />
    )}

    {/* ── 하단 토스트 ── */}
    {toast && (
      <div className="fixed bottom-6 right-6 z-[9999]">
        <div className={toastClass(toast.tone)}>{toast.message}</div>
      </div>
    )}
  </>
);
