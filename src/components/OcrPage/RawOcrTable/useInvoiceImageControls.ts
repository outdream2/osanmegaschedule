import { useState, useCallback, useRef, useEffect } from "react";
import React from "react";
import { SK_OCR_INVOICE_COL_WIDTH, SK_OCR_PAGE_ZOOM } from "../../../lib/storageKeys";

interface UseInvoiceImageControlsParams {
  pageImages?: string[] | null;
  pageNums: number[];
  dispRows: (string | number | null)[][];
  nameIdx: number;
}

const INV_COL_MIN = 150;
const INV_COL_DEFAULT = 360;
const MIN_DATA_WIDTH = 580;

export function useInvoiceImageControls({
  pageImages, pageNums, dispRows, nameIdx,
}: UseInvoiceImageControlsParams) {
  // ── 이미지 컬럼 폭 (드래그 리사이즈) ──────────────────────────────────────
  const [invoiceColWidth, setInvoiceColWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem(SK_OCR_INVOICE_COL_WIDTH);
      if (!v) return INV_COL_DEFAULT;
      const n = Number(v);
      return Number.isFinite(n) && n >= INV_COL_MIN ? n : INV_COL_DEFAULT;
    } catch { return INV_COL_DEFAULT; }
  });
  const [invColResizing, setInvColResizing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SK_OCR_INVOICE_COL_WIDTH, String(Math.round(invoiceColWidth))); } catch { /* empty */ }
  }, [invoiceColWidth]);

  // ── 페이지별 이미지 줌 (0.5x ~ 3x · 기본 1x · localStorage 저장) + 드래그 팬 ──
  const [pageZoom, setPageZoom] = useState<Record<number, number>>(() => {
    try {
      const v = localStorage.getItem(SK_OCR_PAGE_ZOOM);
      return v ? JSON.parse(v) : {};
    } catch { return {}; }
  });
  const [pagePan, setPagePan] = useState<Record<number, { x: number; y: number }>>({});
  const panDragRef = useRef<{ pn: number; startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(SK_OCR_PAGE_ZOOM, JSON.stringify(pageZoom)); } catch { /* empty */ }
  }, [pageZoom]);

  const zoomIn = useCallback((pn: number) => {
    setPageZoom(prev => ({ ...prev, [pn]: Math.min(3, +((prev[pn] ?? 1) + 0.25).toFixed(2)) }));
  }, []);
  const zoomOut = useCallback((pn: number) => {
    setPageZoom(prev => ({ ...prev, [pn]: Math.max(0.5, +((prev[pn] ?? 1) - 0.25).toFixed(2)) }));
  }, []);
  const zoomReset = useCallback((pn: number) => {
    setPageZoom(prev => { const n = { ...prev }; delete n[pn]; return n; });
    setPagePan(prev => { const n = { ...prev }; delete n[pn]; return n; });
  }, []);
  const onImgPanStart = useCallback((pn: number, e: React.MouseEvent) => {
    const currentZoom = (pageZoom[pn] ?? 1);
    if (currentZoom <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    const currentPan = pagePan[pn] ?? { x: 0, y: 0 };
    panDragRef.current = { pn, startX: e.clientX, startY: e.clientY, startPanX: currentPan.x, startPanY: currentPan.y };
    const onMove = (ev: MouseEvent) => {
      const st = panDragRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      const dy = ev.clientY - st.startY;
      setPagePan(prev => ({ ...prev, [st.pn]: { x: st.startPanX + dx, y: st.startPanY + dy } }));
    };
    const onUp = () => {
      panDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "grabbing";
  }, [pageZoom, pagePan]);

  // ── 테이블 컨테이너 폭 추적 ────────────────────────────────────────────────
  const invTableWrapRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  useEffect(() => {
    const el = invTableWrapRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const invColMax = containerWidth > 0 ? Math.max(INV_COL_MIN, containerWidth - MIN_DATA_WIDTH) : Infinity;
  const isUserAdjusted = Math.abs(invoiceColWidth - INV_COL_DEFAULT) > 5;
  const autoRatio = 0.25;
  const responsiveDefault = containerWidth > 0
    ? Math.max(INV_COL_MIN, Math.min(containerWidth * autoRatio, invColMax))
    : INV_COL_DEFAULT;
  const effectiveInvColWidth = isUserAdjusted
    ? Math.min(Math.max(INV_COL_MIN, invoiceColWidth), invColMax)
    : responsiveDefault;

  const _cw = containerWidth || 700;
  const numCellMinW = _cw < 500 ? 52 : _cw < 700 ? 68 : 90;
  const expCellMinW = _cw < 500 ? 72 : 82;
  const numInputMinW = _cw < 500 ? "4rem" : _cw < 700 ? "5rem" : "5.5rem";
  const expInputMinW = _cw < 500 ? "6rem" : _cw < 700 ? "7rem" : "7.5rem";
  const reextBtnCls = _cw < 500 ? "w-4 h-4 text-[10px]" : "w-5 h-5 text-[12px]";
  const numCellInnerCls = "flex flex-col items-end gap-0.5";

  const onInvColResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = invoiceColWidth;
    setInvColResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      ev.preventDefault();
      const dx = ev.clientX - startX;
      const nextRaw = startW + dx;
      const maxAllowed = containerWidth > 0 ? containerWidth - MIN_DATA_WIDTH : Infinity;
      const bounded = Math.min(maxAllowed, Math.max(INV_COL_MIN, nextRaw));
      setInvoiceColWidth(bounded);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setInvColResizing(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [invoiceColWidth, containerWidth]);

  // ── 이미지 모달 + 줌/패닝 ────────────────────────────────────────────────
  const [modalImg,     setModalImg    ] = useState<string | null>(null);
  const [modalPageNum, setModalPageNum] = useState<number | null>(null);
  const [modalLabel,   setModalLabel  ] = useState("");
  const [zoom,         setZoom        ] = useState(1);
  const [pan,          setPan         ] = useState({ x: 0, y: 0 });
  const [isDragging,   setIsDragging  ] = useState(false);
  const viewportRef   = useRef<HTMLDivElement | null>(null);
  const dragRef       = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const zoomRef       = useRef(1);
  const panRef        = useRef({ x: 0, y: 0 });
  const wheelCleanRef = useRef<(() => void) | null>(null);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current  = pan;  }, [pan]);

  const viewportCbRef = useCallback((el: HTMLDivElement | null) => {
    if (wheelCleanRef.current) { wheelCleanRef.current(); wheelCleanRef.current = null; }
    viewportRef.current = el;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect  = el.getBoundingClientRect();
      const cx    = e.clientX - rect.left - rect.width  / 2;
      const cy    = e.clientY - rect.top  - rect.height / 2;
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      const newZ  = Math.min(6, Math.max(0.5, zoomRef.current + delta));
      const scale = newZ / zoomRef.current;
      const curP  = panRef.current;
      const newP  = { x: cx + (curP.x - cx) * scale, y: cy + (curP.y - cy) * scale };
      zoomRef.current = newZ; panRef.current = newP;
      setZoom(newZ); setPan(newP);
    };
    el.addEventListener("wheel", handler, { passive: false });
    wheelCleanRef.current = () => el.removeEventListener("wheel", handler);
  }, []);

  const closeModal = useCallback(() => {
    setModalImg(null); setModalPageNum(null); setZoom(1); setPan({ x: 0, y: 0 });
  }, []);

  const openModal = useCallback((rowIdx: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNums[rowIdx] ?? 1, pageImages.length));
    const img  = pageImages[pNum - 1] ?? pageImages[0];
    const label = String(dispRows[rowIdx]?.[nameIdx] ?? "");
    if (!img) return;
    setModalImg(img); setModalLabel(label); setModalPageNum(pNum); setZoom(1); setPan({ x: 0, y: 0 });
  }, [pageImages, pageNums, dispRows, nameIdx]);

  const openPageModal = useCallback((pageNum: number) => {
    if (!pageImages?.length) return;
    const pNum = Math.max(1, Math.min(pageNum, pageImages.length));
    const img = pageImages[pNum - 1] ?? pageImages[0];
    if (!img) return;
    setModalImg(img); setModalLabel(`${pageNum}번 명세서`); setModalPageNum(pNum); setZoom(1); setPan({ x: 0, y: 0 });
  }, [pageImages]);

  const gotoModalPage = useCallback((next: number) => {
    if (!pageImages?.length) return;
    const bounded = Math.max(1, Math.min(next, pageImages.length));
    const img = pageImages[bounded - 1];
    if (!img) return;
    setModalImg(img);
    setModalLabel(`${bounded}번 명세서`);
    setModalPageNum(bounded);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [pageImages]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;
    setPan({ x: dragRef.current.px + e.clientX - dragRef.current.sx,
             y: dragRef.current.py + e.clientY - dragRef.current.sy });
  };
  const onMouseUp = () => { setIsDragging(false); dragRef.current = null; };
  const onDblClick = (e: React.MouseEvent) => {
    const el = viewportRef.current; if (!el) return;
    if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
    else {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top  - rect.height / 2;
      const newZ = 2.5; const scale = newZ / zoom;
      setPan({ x: cx + (pan.x - cx) * scale, y: cy + (pan.y - cy) * scale });
      setZoom(newZ);
    }
  };

  return {
    // column resize
    INV_COL_DEFAULT,
    invoiceColWidth, setInvoiceColWidth,
    invColResizing,
    invTableWrapRef,
    containerWidth,
    effectiveInvColWidth,
    _cw,
    numCellMinW, expCellMinW,
    numInputMinW, expInputMinW,
    reextBtnCls, numCellInnerCls,
    onInvColResizeStart,
    // page image zoom/pan
    pageZoom, pagePan, panDragRef,
    zoomIn, zoomOut, zoomReset,
    onImgPanStart,
    // modal
    modalImg, modalPageNum, modalLabel,
    zoom, setZoom,
    pan, setPan,
    isDragging,
    viewportRef, viewportCbRef,
    closeModal, openModal, openPageModal, gotoModalPage,
    onMouseDown, onMouseMove, onMouseUp, onDblClick,
  };
}
