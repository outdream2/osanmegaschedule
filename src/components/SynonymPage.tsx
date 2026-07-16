import React, { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, BookOpen, Building2, RefreshCw, Pencil, Check, X, Loader2 } from "lucide-react";
import type { AuthSession } from "../types";
import { AppNavHeader, type AppNavPage } from "./AppNavHeader";

interface SynonymPageProps {
  authSession: AuthSession | null;
  onBack: () => void;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
}

interface ProductSynonym {
  id: number;
  prod_name_old: string;
  prod_name_new: string | null;
  product_code: string;
  supplier_old: string | null;
  supplier_new: string | null;
  created_at: string;
}

interface SupplierAlias {
  id: number;
  alias: string;
  supplier_name: string;
  created_at: string;
}

interface ProdEditState {
  prod_name_old: string;
  prod_name_new: string;
  product_code: string;
  supplier_new: string;
  supplier_old: string;
}

interface SuppEditState {
  alias: string;
  supplier_name: string;
}

export const SynonymPage: React.FC<SynonymPageProps> = ({ authSession, onBack, onNavigate, onLogout }) => {
  const [tab, setTab] = useState<"product" | "supplier">("product");
  const [productSynonyms, setProductSynonyms] = useState<ProductSynonym[]>([]);
  const [supplierAliases, setSupplierAliases] = useState<SupplierAlias[]>([]);
  const [loading, setLoading] = useState(false);

  const [addProdOld,     setAddProdOld    ] = useState("");
  const [addProdNew,     setAddProdNew    ] = useState("");
  const [addProdCode,    setAddProdCode   ] = useState("");
  const [addProdSuppNew, setAddProdSuppNew] = useState("");
  const [addProdSuppOld, setAddProdSuppOld] = useState("");
  const [addSuppAlias,   setAddSuppAlias  ] = useState("");
  const [addSuppName,    setAddSuppName   ] = useState("");
  const [saving, setSaving] = useState(false);

  // Inline edit state
  const [editingProdId, setEditingProdId] = useState<number | null>(null);
  const [editingProd, setEditingProd] = useState<ProdEditState | null>(null);
  const [editingSuppId, setEditingSuppId] = useState<number | null>(null);
  const [editingSupp, setEditingSupp] = useState<SuppEditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [synRes, aliasRes] = await Promise.all([
        fetch("/api/ocr-synonyms"),
        fetch("/api/ocr-supplier-aliases"),
      ]);
      const synData   = await synRes.json();
      const aliasData = await aliasRes.json();
      setProductSynonyms(synData.synonyms ?? []);
      setSupplierAliases(aliasData.aliases ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deleteProductSynonym = async (id: number) => {
    await fetch(`/api/ocr-synonyms/${id}`, { method: "DELETE" });
    setProductSynonyms(prev => prev.filter(s => s.id !== id));
  };

  const deleteSupplierAlias = async (id: number) => {
    await fetch(`/api/ocr-supplier-aliases/${id}`, { method: "DELETE" });
    setSupplierAliases(prev => prev.filter(a => a.id !== id));
  };

  const startEditProd = (s: ProductSynonym) => {
    setEditingProdId(s.id);
    setEditingProd({
      prod_name_old: s.prod_name_old,
      prod_name_new: s.prod_name_new ?? "",
      product_code: s.product_code,
      supplier_new: s.supplier_new ?? "",
      supplier_old: s.supplier_old ?? "",
    });
  };

  const cancelEditProd = () => { setEditingProdId(null); setEditingProd(null); };

  const saveEditProd = async () => {
    if (!editingProd || !editingProdId) return;
    if (!editingProd.prod_name_old.trim() || !editingProd.product_code.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/ocr-synonyms/${editingProdId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prod_name_old: editingProd.prod_name_old.trim(),
          prod_name_new: editingProd.prod_name_new.trim() || null,
          product_code: editingProd.product_code.trim(),
          supplier_new: editingProd.supplier_new.trim() || null,
          supplier_old: editingProd.supplier_old.trim() || null,
        }),
      });
      if (res.ok) {
        const { synonym } = await res.json();
        setProductSynonyms(prev => prev.map(s => s.id === editingProdId ? synonym : s));
        cancelEditProd();
      }
    } finally { setEditSaving(false); }
  };

  const startEditSupp = (a: SupplierAlias) => {
    setEditingSuppId(a.id);
    setEditingSupp({ alias: a.alias, supplier_name: a.supplier_name });
  };

  const cancelEditSupp = () => { setEditingSuppId(null); setEditingSupp(null); };

  const saveEditSupp = async () => {
    if (!editingSupp || !editingSuppId) return;
    if (!editingSupp.alias.trim() || !editingSupp.supplier_name.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/ocr-supplier-aliases/${editingSuppId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: editingSupp.alias.trim(), supplier_name: editingSupp.supplier_name.trim() }),
      });
      if (res.ok) {
        const { alias: updated } = await res.json();
        setSupplierAliases(prev => prev.map(a => a.id === editingSuppId ? updated : a));
        cancelEditSupp();
      }
    } finally { setEditSaving(false); }
  };

  const addProductSynonym = async () => {
    if (!addProdOld.trim() || !addProdCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ocr-synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prod_name_old: addProdOld.trim(),
          prod_name_new: addProdNew.trim() || null,
          product_code:  addProdCode.trim(),
          supplier_new:  addProdSuppNew.trim() || null,
          supplier_old:  addProdSuppOld.trim() || null,
        }),
      });
      if (res.ok) {
        setAddProdOld(""); setAddProdNew(""); setAddProdCode("");
        setAddProdSuppNew(""); setAddProdSuppOld("");
        await fetchAll();
      }
    } finally { setSaving(false); }
  };

  const addSupplierAlias = async () => {
    if (!addSuppAlias.trim() || !addSuppName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ocr-supplier-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias: addSuppAlias.trim(), supplier_name: addSuppName.trim() }),
      });
      if (res.ok) {
        setAddSuppAlias(""); setAddSuppName("");
        await fetchAll();
      }
    } finally { setSaving(false); }
  };

  const cellCls = "border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 w-full";
  const cellClsSky = "border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-sky-400 w-full";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavHeader
        activePage="synonyms"
        authSession={authSession}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
        rightSlot={
          <button onClick={fetchAll} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            <RefreshCw size={14} className={`text-gray-400 ${loading ? "animate-spin" : ""}`} />
          </button>
        }
      />
      {/* Sub-tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 flex gap-0">
          <button
            onClick={() => setTab("product")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${tab === "product" ? "border-indigo-500 text-indigo-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            <BookOpen size={12} /> 상품명 동의어 ({productSynonyms.length})
          </button>
          <button
            onClick={() => setTab("supplier")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${tab === "supplier" ? "border-sky-500 text-sky-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            <Building2 size={12} /> 공급사 별칭 ({supplierAliases.length})
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-4">
        {tab === "product" ? (
          <>
            <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                <Plus size={12} /> 상품명 동의어 추가
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="col-span-2 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  placeholder="OCR 오인식 상품명 (필수)"
                  value={addProdOld}
                  onChange={e => setAddProdOld(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addProductSynonym()}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  placeholder="보정 상품명"
                  value={addProdNew}
                  onChange={e => setAddProdNew(e.target.value)}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  placeholder="상품코드 (필수)"
                  value={addProdCode}
                  onChange={e => setAddProdCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addProductSynonym()}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  placeholder="공급사명 (보정 후)"
                  value={addProdSuppNew}
                  onChange={e => setAddProdSuppNew(e.target.value)}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  placeholder="공급사명 (OCR 인식)"
                  value={addProdSuppOld}
                  onChange={e => setAddProdSuppOld(e.target.value)}
                />
              </div>
              <button
                onClick={addProductSynonym}
                disabled={!addProdOld.trim() || !addProdCode.trim() || saving}
                className="self-end px-4 py-1.5 text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition disabled:opacity-40 cursor-pointer"
              >
                추가
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-1.5">
                  <BookOpen size={14} className="text-indigo-600" />
                  <span className="text-sm font-black text-slate-700">상품명 동의어</span>
                  <span className="text-[10px] font-mono text-slate-400">({productSynonyms.length}건)</span>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
              {loading && productSynonyms.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-indigo-600 font-bold py-1.5 bg-indigo-50 border-b border-indigo-200 sticky top-0 z-10">
                  <Loader2 size={11} className="animate-spin" /> 새로 불러오는 중...
                </div>
              )}
              {loading && productSynonyms.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
              ) : !loading && productSynonyms.length === 0 ? (
                <div className="text-center text-[11px] text-slate-300 py-6">등록된 상품명 동의어 없음</div>
              ) : (
              <table className={`w-full text-xs border-collapse ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <thead>
                  <tr className="bg-indigo-50 border-b border-indigo-100">
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">OCR 상품명</th>
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">보정 상품명</th>
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">상품코드</th>
                    <th className="px-3 py-2 text-left font-bold text-indigo-800">공급사</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {productSynonyms.map(s => {
                    const isEditing = editingProdId === s.id && editingProd;
                    return (
                      <tr key={s.id} className={`border-t border-gray-50 ${isEditing ? "bg-indigo-50/40" : "hover:bg-gray-50"}`}>
                        {isEditing ? (
                          <>
                            <td className="px-2 py-1.5">
                              <input className={cellCls} value={editingProd.prod_name_old} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_old: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={cellCls} value={editingProd.prod_name_new} onChange={e => setEditingProd(p => p && ({ ...p, prod_name_new: e.target.value }))} placeholder="(없음)" />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={cellCls} value={editingProd.product_code} onChange={e => setEditingProd(p => p && ({ ...p, product_code: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={`${cellCls} mb-1`} value={editingProd.supplier_new} onChange={e => setEditingProd(p => p && ({ ...p, supplier_new: e.target.value }))} placeholder="보정 공급사" />
                              <input className={cellCls} value={editingProd.supplier_old} onChange={e => setEditingProd(p => p && ({ ...p, supplier_old: e.target.value }))} placeholder="OCR 공급사" />
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <button onClick={saveEditProd} disabled={editSaving || !editingProd.prod_name_old.trim() || !editingProd.product_code.trim()} className="p-1 text-indigo-500 hover:text-indigo-700 cursor-pointer disabled:opacity-40 transition-colors">
                                  <Check size={13} />
                                </button>
                                <button onClick={cancelEditProd} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                                  <X size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-semibold text-gray-700">{s.prod_name_old}</td>
                            <td className="px-3 py-2 text-indigo-700">{s.prod_name_new ?? <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-[11px]">{s.product_code}</td>
                            <td className="px-3 py-2 text-[11px]">
                              {s.supplier_new
                                ? <span className="text-sky-600 font-semibold">{s.supplier_new}</span>
                                : <span className="text-gray-300">—</span>}
                              {s.supplier_old && (
                                <span className="text-gray-300 ml-1">← {s.supplier_old}</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-0.5">
                                <button onClick={() => startEditProd(s)} className="p-1 text-gray-300 hover:text-indigo-500 cursor-pointer transition-colors">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => deleteProductSynonym(s.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white border border-sky-100 rounded-2xl p-4 flex flex-col gap-3">
              <p className="text-xs font-bold text-sky-700 flex items-center gap-1.5">
                <Plus size={12} /> 공급사 별칭 추가
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400"
                  placeholder="OCR 오인식 공급사명 (필수)"
                  value={addSuppAlias}
                  onChange={e => setAddSuppAlias(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSupplierAlias()}
                />
                <input
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-sky-400"
                  placeholder="실제 공급사명 (필수)"
                  value={addSuppName}
                  onChange={e => setAddSuppName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSupplierAlias()}
                />
              </div>
              <button
                onClick={addSupplierAlias}
                disabled={!addSuppAlias.trim() || !addSuppName.trim() || saving}
                className="self-end px-4 py-1.5 text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition disabled:opacity-40 cursor-pointer"
              >
                추가
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-1.5">
                  <Building2 size={14} className="text-sky-600" />
                  <span className="text-sm font-black text-slate-700">공급사 별칭</span>
                  <span className="text-[10px] font-mono text-slate-400">({supplierAliases.length}건)</span>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
              {loading && supplierAliases.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-sky-600 font-bold py-1.5 bg-sky-50 border-b border-sky-200 sticky top-0 z-10">
                  <Loader2 size={11} className="animate-spin" /> 새로 불러오는 중...
                </div>
              )}
              {loading && supplierAliases.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-bold gap-2"><Loader2 size={14} className="animate-spin" />로딩 중...</div>
              ) : !loading && supplierAliases.length === 0 ? (
                <div className="text-center text-[11px] text-slate-300 py-6">등록된 공급사 별칭 없음</div>
              ) : (
              <table className={`w-full text-xs border-collapse ${loading ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}`}>
                <thead>
                  <tr className="bg-sky-50 border-b border-sky-100">
                    <th className="px-3 py-2 text-left font-bold text-sky-800">OCR 공급사명 (별칭)</th>
                    <th className="px-3 py-2 text-left font-bold text-sky-800">실제 공급사명</th>
                    <th className="px-3 py-2 text-left font-bold text-sky-800 text-[11px]">등록일</th>
                    <th className="px-2 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {supplierAliases.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">등록된 공급사 별칭 없음</td></tr>
                  )}
                  {supplierAliases.map(a => {
                    const isEditing = editingSuppId === a.id && editingSupp;
                    return (
                      <tr key={a.id} className={`border-t border-gray-50 ${isEditing ? "bg-sky-50/40" : "hover:bg-gray-50"}`}>
                        {isEditing ? (
                          <>
                            <td className="px-2 py-1.5">
                              <input className={cellClsSky} value={editingSupp.alias} onChange={e => setEditingSupp(p => p && ({ ...p, alias: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1.5">
                              <input className={cellClsSky} value={editingSupp.supplier_name} onChange={e => setEditingSupp(p => p && ({ ...p, supplier_name: e.target.value }))} />
                            </td>
                            <td className="px-2 py-1.5 text-gray-400">
                              {new Date(a.created_at).toLocaleDateString("ko-KR")}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <button onClick={saveEditSupp} disabled={editSaving || !editingSupp.alias.trim() || !editingSupp.supplier_name.trim()} className="p-1 text-sky-500 hover:text-sky-700 cursor-pointer disabled:opacity-40 transition-colors">
                                  <Check size={13} />
                                </button>
                                <button onClick={cancelEditSupp} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                                  <X size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-semibold text-gray-700">{a.alias}</td>
                            <td className="px-3 py-2 text-sky-700 font-bold">{a.supplier_name}</td>
                            <td className="px-3 py-2 text-gray-400 text-[11px]">
                              {new Date(a.created_at).toLocaleDateString("ko-KR")}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-0.5">
                                <button onClick={() => startEditSupp(a)} className="p-1 text-gray-300 hover:text-sky-500 cursor-pointer transition-colors">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => deleteSupplierAlias(a.id)} className="p-1 text-gray-300 hover:text-rose-500 cursor-pointer transition-colors">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
