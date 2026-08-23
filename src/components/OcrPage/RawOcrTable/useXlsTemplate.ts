import { useEffect, useRef, useState } from "react";

export function useXlsTemplate() {
  const [xlsTemplate,     setXlsTemplate    ] = useState<ArrayBuffer | null>(null);
  const [xlsTemplateName, setXlsTemplateName] = useState<string | null>(null);
  const [xlsTemplateHdrs, setXlsTemplateHdrs] = useState<string[] | null>(null);
  const [xlsTemplateSaved, setXlsTemplateSaved] = useState(false);
  const xlsInputRef = useRef<HTMLInputElement | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ocr_xls_template");
      if (!raw) return;
      const { name, hdrs, data } = JSON.parse(raw);
      const buf = Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer;
      setXlsTemplate(buf);
      setXlsTemplateName(name);
      setXlsTemplateHdrs(hdrs);
      setXlsTemplateSaved(true);
    } catch { /* 손상된 캐시 무시 */ }
  }, []);

  return {
    xlsTemplate, setXlsTemplate,
    xlsTemplateName, setXlsTemplateName,
    xlsTemplateHdrs, setXlsTemplateHdrs,
    xlsTemplateSaved, setXlsTemplateSaved,
    xlsInputRef,
  };
}
