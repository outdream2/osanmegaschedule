// 2026-08-22 · Framework Phase 4 · OcrPage.tsx large-file 분리
// 동의어 관리 탭 (상품명 동의어 + 공급사 별칭 CRUD)
//   · self-contained · 부모 state 의존 없음
//   · mount 시 fetchSynonyms 자동 (기존 useEffect(mainTab==="synonyms") 동작 재현)
//   · 프레임워크 원칙 · Card·apiClient (api.get/post/patch/del) 사용

import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, Building2, Plus, Trash2, Pencil, Check, X, RefreshCw } from "lucide-react";
import { api } from "../../lib/apiClient";
import { Card } from "../common/Card";
import { useToast, toastClass } from "../../hooks/useToast";
import { Spinner } from "../common/Spinner";
import type { ProductSynonym, SupplierAlias, ProdEditState, SuppEditState } from "./OcrPage.types";

const cellCls = "border border-line rounded px-2 py-1 text-xs outline-none focus:border-brand-deep w-full";
const cellClsSky = "border border-line rounded px-2 py-1 text-xs outline-none focus:border-brand-deep w-full";

export const SynonymsTab: React.FC = () => {
  const { toast, showSuccess, showError } = useToast();
  const [synTab, setSynTab] = useState<"product" | "supplier">("product");
  const [prodListView, setProdListView] = useState<"prodname" | "supplier">("prodname");
  const [productSynonyms, setProductSynonyms] = useState<ProductSynonym[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<SupplierAlias[]>([]);
  const [synLoading, setSynLoading] = useState(false);
  const [addProdOld, setAddProdOld] = useState("");
  const [addProdNew, setAddProdNew] = useState("");
  const [addProdCode, setAddProdCode] = useState("");
  const [addProdSuppNew, setAddProdSuppNew] = useState("");
  const [addProdSuppOld, setAddProdSuppOld] = useState("");
  const [addSuppAlias, setAddSuppAlias] = useState("");
  const [addSuppName, setAddSuppName] = useState("");
  const [synSaving, setSynSaving] = useState(false);
  const [editingProdId, setEditingProdId] = useState<number | null>(null);
  const [editingProd, setEditingProd] = useState<ProdEditState | null>(null);
  const [editingSuppId, setEditingSuppId] = useState<number | null>(null);
  const [editingSupp, setEditingSupp] = useState<SuppEditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const fetchSynonyms = useCallback(async () => {
    setSynLoading(true);
    try {
      const [synRes, aliasRes] = await Promise.all([
        api.get<{ synonyms?: ProductSynonym[] }>("/api/ocr-synonyms"),
        api.get<{ aliases?: SupplierAlias[] }>("/api/ocr-supplier-aliases"),
      ]);
      setProductSynonyms(synRes.data.synonyms ?? []);
      setSupplierAliases(aliasRes.data.aliases ?? []);
    } finally { setSynLoading(false); }
  }, []);

  useEffect(() => { fetchSynonyms(); }, [fetchSynonyms]);

  const addProductSynonym = async () => {
    if (!addProdOld.trim() || !addProdCode.trim()) return;
    setSynSaving(true);
    try {
      await api.post("/api/ocr-synonyms", {
        prod_name_old: addProdOld.trim(),
        prod_name_new: addProdNew.trim() || null,
        product_code: addProdCode.trim(),
        supplier_new: addProdSuppNew.trim() || null,
        supplier_old: addProdSuppOld.trim() || null,
      });
      setAddProdOld(""); setAddProdNew(""); setAddProdCode(""); setAddProdSuppNew(""); setAddProdSuppOld("");
      showSuccess("동의어 추가 완료");
      await fetchSynonyms();
    } catch (err) {
      showError(`동의어 추가 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSynSaving(false); }
  };

  const addSupplierAlias = async () => {
    if (!addSuppAlias.trim() || !addSuppName.trim()) return;
    setSynSaving(true);
    try {
      await api.post("/api/ocr-supplier-aliases", { alias: addSuppAlias.trim(), supplier_name: addSuppName.trim() });
      setAddSuppAlias(""); setAddSuppName("");
      showSuccess("공급사 별칭 추가 완료");
      await fetchSynonyms();
    } catch (err) {
      showError(`별칭 추가 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSynSaving(false); }
  };

  const deleteProductSynonym = async (id: number) => {
    await api.del(`/api/ocr-synonyms/${id}`).catch(() => {});
    setProductSynonyms(prev => prev.filter(s => s.id !== id));
  };

  const deleteSupplierAlias = async (id: number) => {
    await api.del(`/api/ocr-supplier-aliases/${id}`).catch(() => {});
    setSupplierAliases(prev => prev.filter(a => a.id !== id));
  };

  const startEditProd = (s: ProductSynonym) => {
    setEditingProdId(s.id);
    setEditingProd({ prod_name_old: s.prod_name_old, prod_name_new: s.prod_name_new ?? "", product_code: s.product_code, supplier_new: s.supplier_new ?? "", supplier_old: s.supplier_old ?? "" });
  };
  const cancelEditProd = () => { setEditingProdId(null); setEditingProd(null); };
  const saveEditProd = async () => {
    if (!editingProd || !editingProdId || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()) return;
    setEditSaving(true);
    try {
      const { data } = await api.patch<{ synonym?: ProductSynonym }>(`/api/ocr-synonyms/${editingProdId}`, {
        prod_name_old: editingProd.prod_name_old.trim(),
        prod_name_new: editingProd.prod_name_new.trim() || null,
        product_code: editingProd.product_code.trim(),
        supplier_new: editingProd.supplier_new.trim() || null,
        supplier_old: editingProd.supplier_old.trim() || null,
      });
      if (data?.synonym) {
        setProductSynonyms(prev => prev.map(s => s.id === editingProdId ? (data.synonym as ProductSynonym) : s));
        showSuccess("동의어 수정 완료");
        cancelEditProd();
      }
    } catch (err) {
      showError(`동의어 수정 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setEditSaving(false); }
  };

  const startEditSupp = (a: SupplierAlias) => { setEditingSuppId(a.id); setEditingSupp({ alias: a.alias, supplier_name: a.supplier_name }); };
  const cancelEditSupp = () => { setEditingSuppId(null); setEditingSupp(null); };
  const saveEditSupp = async () => {
    if (!editingSupp || !editingSuppId || !editingSupp.alias.trim() || !editingSupp.supplier_name.trim()) return;
    setEditSaving(true);
    try {
      const { data } = await api.patch<{ alias?: SupplierAlias }>(`/api/ocr-supplier-aliases/${editingSuppId}`, {
        alias: editingSupp.alias.trim(),
        supplier_name: editingSupp.supplier_name.trim(),
      });
      if (data?.alias) {
        setSupplierAliases(prev => prev.map(a => a.id === editingSuppId ? (data.alias as SupplierAlias) : a));
        showSuccess("공급사 별칭 수정 완료");
        cancelEditSupp();
      }
    } catch (err) {
      showError(`별칭 수정 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setEditSaving(false); }
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className={toastClass(toast.tone)}>{toast.message}</div>
        </div>
      )}
      {/* 동의어 서브 탭 */}
      <Card clip padding="none">
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-100/80">
          <div className="flex flex-wrap bg-zinc-100/70 border border-line/60 rounded-2xl p-1 gap-0.5">
          <button onClick={() => setSynTab("product")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors duration-150 cursor-pointer ${synTab === "product" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}>
            <BookOpen size={12} className={synTab === "product" ? "text-zinc-800" : "text-zinc-400"} /> 상품명 동의어 ({productSynonyms.length})
          </button>
          <button onClick={() => setSynTab("supplier")} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors duration-150 cursor-pointer ${synTab === "supplier" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}>
            <Building2 size={12} className={synTab === "supplier" ? "text-zinc-800" : "text-zinc-400"} /> 공급사 별칭 ({supplierAliases.length})
          </button>
          </div>
          <button onClick={fetchSynonyms} className="ml-auto p-1.5 self-center rounded-lg hover:bg-gray-100 cursor-pointer">
            <RefreshCw size={13} className={`text-gray-400 ${synLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {synTab === "product" ? (
          <div className="p-4 flex flex-col gap-3">
            {/* 추가 폼 */}
            <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5"><Plus size={12} /> 상품명 동의어 추가</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep font-mono" placeholder="상품코드 (필수)" value={addProdCode} onChange={e => setAddProdCode(e.target.value)} onKeyDown={e => e.key === "Enter" && addProductSynonym()} />
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="상품명(OCR) — 필수" value={addProdOld} onChange={e => setAddProdOld(e.target.value)} />
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="상품명(보정후)" value={addProdNew} onChange={e => setAddProdNew(e.target.value)} />
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="공급사명(OCR)" value={addProdSuppOld} onChange={e => setAddProdSuppOld(e.target.value)} />
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="공급사명(보정후)" value={addProdSuppNew} onChange={e => setAddProdSuppNew(e.target.value)} onKeyDown={e => e.key === "Enter" && addProductSynonym()} />
            </div>
            <button onClick={addProductSynonym} disabled={!addProdOld.trim() || !addProdCode.trim() || synSaving} className="self-end px-4 py-1.5 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg transition disabled:opacity-40 cursor-pointer">추가</button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-sky-700 flex items-center gap-1.5"><Plus size={12} /> 공급사 별칭 추가</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="OCR 오인식 공급사명 (필수)" value={addSuppAlias} onChange={e => setAddSuppAlias(e.target.value)} onKeyDown={e => e.key === "Enter" && addSupplierAlias()} />
              <input className="border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand-deep" placeholder="실제 공급사명 (필수)" value={addSuppName} onChange={e => setAddSuppName(e.target.value)} onKeyDown={e => e.key === "Enter" && addSupplierAlias()} />
            </div>
            <button onClick={addSupplierAlias} disabled={!addSuppAlias.trim() || !addSuppName.trim() || synSaving} className="self-end px-4 py-1.5 text-xs font-bold bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a] text-white rounded-lg transition disabled:opacity-40 cursor-pointer">추가</button>
          </div>
        )}
      </Card>

      {/* 리스트 테이블 */}
      {synTab === "product" ? (
        <Card clip padding="none">
          {/* 상품명 / 공급사명 뷰 토글 */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
            <button
              onClick={() => setProdListView("prodname")}
              className={`px-3 py-1 text-[15px] font-bold rounded-lg transition cursor-pointer ${prodListView === "prodname" ? "bg-indigo-100 text-indigo-700" : "text-gray-400 hover:text-gray-700"}`}
            >
              상품명
            </button>
            <button
              onClick={() => setProdListView("supplier")}
              className={`px-3 py-1 text-[15px] font-bold rounded-lg transition cursor-pointer ${prodListView === "supplier" ? "bg-sky-100 text-sky-700" : "text-gray-400 hover:text-gray-700"}`}
            >
              공급사명
            </button>
            <span className="ml-auto text-[15px] text-gray-400">{productSynonyms.length}건</span>
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              {prodListView === "prodname" ? (
                <tr className="bg-indigo-50 border-b border-indigo-100">
                  <th className="px-3 py-2 text-left font-bold text-indigo-800 font-mono w-28">상품코드</th>
                  <th className="px-3 py-2 text-left font-bold text-indigo-800">상품명(OCR)</th>
                  <th className="px-3 py-2 text-left font-bold text-indigo-800">상품명(보정후)</th>
                  <th className="px-2 py-2 w-14" />
                </tr>
              ) : (
                <tr className="bg-sky-50 border-b border-sky-100">
                  <th className="px-3 py-2 text-left font-bold text-sky-800 font-mono w-28">상품코드</th>
                  <th className="px-3 py-2 text-left font-bold text-sky-800">공급사명(OCR)</th>
                  <th className="px-3 py-2 text-left font-bold text-sky-800">공급사명(보정후)</th>
                  <th className="px-2 py-2 w-14" />
                </tr>
              )}
            </thead>
            <tbody>
              {productSynonyms.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">{synLoading ? <Spinner label="불러오는 중..." size={13} tone="zinc" /> : "등록된 상품명 동의어 없음"}</td></tr>
              )}
              {productSynonyms.map(s => {
                const isEditing = editingProdId === s.id && editingProd;
                return (
                  <tr key={s.id} className={`border-t border-gray-50 ${isEditing ? "bg-indigo-50/40" : "hover:bg-gray-50"}`}>
                    {isEditing ? (
                      prodListView === "prodname" ? (
                        <>
                          <td className="px-2 py-1.5"><input className={`${cellCls} font-mono`} value={editingProd.product_code} onChange={e => setEditingProd(p => p && ({ ...p, product_code: e.target.value }))} /></td>
                          <td className="px-2 py-1.5"><input className={cellCls} value={editingProd.prod_name_old} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_old: e.target.value }))} /></td>
                          <td className="px-2 py-1.5"><input className={cellCls} value={editingProd.prod_name_new} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_new: e.target.value }))} placeholder="(없음)" /></td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <button onClick={saveEditProd} disabled={editSaving || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()} className="p-1 text-indigo-500 hover:text-indigo-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                              <button onClick={cancelEditProd} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5"><input className={`${cellClsSky} font-mono`} value={editingProd.product_code} onChange={e => setEditingProd(p => p && ({ ...p, product_code: e.target.value }))} /></td>
                          <td className="px-2 py-1.5"><input className={cellClsSky} value={editingProd.supplier_old} onChange={e => setEditingProd(p => p && ({ ...p, supplier_old: e.target.value }))} placeholder="(없음)" /></td>
                          <td className="px-2 py-1.5"><input className={cellClsSky} value={editingProd.supplier_new} onChange={e => setEditingProd(p => p && ({ ...p, supplier_new: e.target.value }))} placeholder="(없음)" /></td>
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <button onClick={saveEditProd} disabled={editSaving || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()} className="p-1 text-sky-500 hover:text-sky-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                              <button onClick={cancelEditProd} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                            </div>
                          </td>
                        </>
                      )
                    ) : prodListView === "prodname" ? (
                      <>
                        <td className="px-3 py-2.5 text-gray-500 font-mono text-[15px] leading-snug">{s.product_code}</td>
                        <td className="px-3 py-2.5 font-semibold text-gray-700 leading-snug">{s.prod_name_old}</td>
                        <td className="px-3 py-2.5 text-indigo-700 leading-snug">{s.prod_name_new ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => startEditProd(s)} className="p-1 text-gray-300 hover:text-indigo-500 cursor-pointer"><Pencil size={13} /></button>
                            <button onClick={() => deleteProductSynonym(s.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-gray-500 font-mono text-[15px] leading-snug">{s.product_code}</td>
                        <td className="px-3 py-2.5 text-gray-500 leading-snug">{s.supplier_old ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-sky-700 font-semibold leading-snug">{s.supplier_new ?? <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => startEditProd(s)} className="p-1 text-gray-300 hover:text-sky-500 cursor-pointer"><Pencil size={13} /></button>
                            <button onClick={() => deleteProductSynonym(s.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card clip padding="none">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-sky-50 border-b border-sky-100">
                <th className="px-3 py-2 text-left font-bold text-sky-800">OCR 공급사명 (별칭)</th>
                <th className="px-3 py-2 text-left font-bold text-sky-800">실제 공급사명</th>
                <th className="px-3 py-2 text-left font-bold text-sky-800 text-[15px]">등록일</th>
                <th className="px-2 py-2 w-16" />
              </tr>
            </thead>
            <tbody>
              {supplierAliases.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">{synLoading ? <Spinner label="불러오는 중..." size={13} tone="zinc" /> : "등록된 공급사 별칭 없음"}</td></tr>}
              {supplierAliases.map(a => {
                const isEditing = editingSuppId === a.id && editingSupp;
                return (
                  <tr key={a.id} className={`border-t border-gray-50 ${isEditing ? "bg-sky-50/40" : "hover:bg-gray-50"}`}>
                    {isEditing ? (
                      <>
                        <td className="px-2 py-1.5"><input className={cellClsSky} value={editingSupp.alias} onChange={e => setEditingSupp(p => p && ({ ...p, alias: e.target.value }))} /></td>
                        <td className="px-2 py-1.5"><input className={cellClsSky} value={editingSupp.supplier_name} onChange={e => setEditingSupp(p => p && ({ ...p, supplier_name: e.target.value }))} /></td>
                        <td className="px-2 py-1.5 text-gray-400">{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <button onClick={saveEditSupp} disabled={editSaving || !editingSupp.alias.trim() || !editingSupp.supplier_name.trim()} className="p-1 text-sky-500 hover:text-sky-700 cursor-pointer disabled:opacity-40"><Check size={13} /></button>
                            <button onClick={cancelEditSupp} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"><X size={13} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-semibold text-gray-700">{a.alias}</td>
                        <td className="px-3 py-2 text-sky-700 font-bold">{a.supplier_name}</td>
                        <td className="px-3 py-2 text-gray-400 text-[15px]">{new Date(a.created_at).toLocaleDateString("ko-KR")}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => startEditSupp(a)} className="p-1 text-gray-300 hover:text-sky-500 cursor-pointer"><Pencil size={13} /></button>
                            <button onClick={() => deleteSupplierAlias(a.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
