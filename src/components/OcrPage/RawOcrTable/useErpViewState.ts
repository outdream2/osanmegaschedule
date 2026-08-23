import React, { useCallback, useEffect, useState } from "react";

const ERP_TABLE_COLS_DEFAULT: Record<string, number> = {
  "ERP 코드": 100,
  "공급사": 88,
  "OCR 품명": 260,
  "ERP 품명": 260,
  "OCR수량": 60,
  "ERP수량": 60,
  "단가": 76,
  "금액": 92,
  "유통기한": 88,
};

export function useErpViewState() {
  const [erpViewTab, setErpViewTab] = useState<"list" | "table">("table");
  const [erpCellEdits, setErpCellEdits] = useState<Record<number, Record<string, string>>>({});
  const [editingErpCell, setEditingErpCell] = useState<{ ri: number; col: string } | null>(null);
  const [editingErpCellVal, setEditingErpCellVal] = useState("");
  const [erpColWidths, setErpColWidths] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem("ocr_erp_col_widths");
      if (raw) return { ...ERP_TABLE_COLS_DEFAULT, ...JSON.parse(raw) };
    } catch { /* empty */ }
    return { ...ERP_TABLE_COLS_DEFAULT };
  });

  useEffect(() => {
    try { localStorage.setItem("ocr_erp_col_widths", JSON.stringify(erpColWidths)); } catch { /* empty */ }
  }, [erpColWidths]);

  const startErpColResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startW = erpColWidths[col] ?? ERP_TABLE_COLS_DEFAULT[col] ?? 100;
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(40, Math.min(600, startW + (ev.clientX - startX)));
      setErpColWidths(prev => ({ ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [erpColWidths]);

  return {
    ERP_TABLE_COLS_DEFAULT,
    erpViewTab, setErpViewTab,
    erpCellEdits, setErpCellEdits,
    editingErpCell, setEditingErpCell,
    editingErpCellVal, setEditingErpCellVal,
    erpColWidths, setErpColWidths,
    startErpColResize,
  };
}
