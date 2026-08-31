import React, { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_CONTAINER_CLS } from "../../styles/tokens";
import axios from "axios";
import { Upload, X, Zap, AlertCircle, Images, BookOpen, FileText } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PageImageViewer } from "./PageImageViewer";
import { RawOcrTable, type ConfirmedItem } from "./RawOcrTable";
import type { OcrPageResult } from "./types";
import { AppNavHeader, type AppNavPage } from "../layout/AppNavHeader";
import type { AuthSession } from "../../types";
import { IconTile } from "../common/IconTile";
import { Spinner } from "../common/Spinner";
// 2026-08-20 · #149 · Card 프리미티브 확산 · bg-white border border-line rounded-xl shadow-sm overflow-hidden 반복 통합
import { Card } from "../common/Card";

pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(
  new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
  { type: "module" }
);

interface OcrPageProps {
  onBack: () => void;
  authSession?: AuthSession | null;
  onNavigate?: (page: AppNavPage) => void;
  onLogout?: () => void;
  /** true 이면 헤더/전체 페이지 셸 없이 OCR 컨텐츠만 렌더 (다른 페이지에 임베드용) */
  embedded?: boolean;
}

// 2026-08-21 · Framework Phase 4 · large-file 분리
import { ConfirmedRecordsTab } from "./ConfirmedRecordsTab";
import { BalanceConfigTab } from "./BalanceConfigTab";
// 2026-08-22 · Framework Phase 4 · helpers + SynonymsTab 분리
import { detectTextOrientation, physicallyRotate, resizeImageForOcr } from "./OcrPage.helpers";
import { SynonymsTab } from "./SynonymsTab";

// 2026-08-21 · ConfirmedRecord · fmtNum · toNum 는 ./OcrPage.types 로 이관


export const OcrPage: React.FC<OcrPageProps> = ({ onBack, authSession, onNavigate, onLogout, embedded = false }) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imagesDataRef = useRef<{ data: string; mimeType: string }[]>([]);

  const [fileName, setFileName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  // 2026-07-22 · 클릭한 버튼만 로딩 표시 · 반대편 버튼 로딩 오해 방지
  const [activeParser, setActiveParser] = useState<"local" | "gemini" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  // 2026-07-23 · 사용자 편집 감지 · 새 SSE/Gemini 결과가 편집 덮어쓰지 않도록
  //   ref 사용 · useCallback deps 안바뀜 · 편집 트리거는 handleUserEdit 호출로
  const hasUserEditsRef = useRef(false);
  const handleUserEdit = useCallback(() => { hasUserEditsRef.current = true; }, []);
  // OCR 엔진 선택 · 2가지
  //   onnx   = PP-OCRv5 한국어 Node ONNX · Render 배포 · 완전 무료 · 셀프호스팅
  //   gemini = Gemini 비전 API · 정확도 최상 · 다중 키 로테이션 · Render 배포
  type OcrEngine = "onnx" | "gemini";
  const [ocrEngine, setOcrEngine] = useState<OcrEngine>(() => {
    try {
      const v = localStorage.getItem("megatown_ocr_engine");
      if (v === "onnx" || v === "gemini") return v;
    } catch { /* ignore */ }
    return "gemini";
  });
  useEffect(() => { try { localStorage.setItem("megatown_ocr_engine", ocrEngine); } catch { /* ignore */ } }, [ocrEngine]);
  const engineToBackend = (e: OcrEngine): string => e;
  // 바코드 매칭 기능 제거됨 (사용자 요청) · 관련 state 유지 안 함
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [pingStatus, setPingStatus] = useState<{ ok: boolean; gemini: boolean; geminiKeyCount: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [detectingOrient, setDetectingOrient] = useState(false);

  // Balance config (per-vendor balance field, stored in DB)
  const [balanceConfig, setBalanceConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    axios.get("/api/supplier-balance-configs")
      .then(r => {
        const cfg: Record<string, string> = {};
        for (const row of r.data as { supplier_name: string; balance_field: string }[]) {
          if (row.balance_field) cfg[row.supplier_name] = row.balance_field;
        }
        setBalanceConfig(cfg);
      })
      .catch(() => {});
  }, []);

  const handleSaveConfirmed = useCallback(async (items: ConfirmedItem[]) => {
    const today = new Date().toISOString().slice(0, 10);
    await axios.post("/api/ocr-confirmed-items", { items, saved_at: today });
  }, []);

  const handleBalanceConfigChange = useCallback((vendor: string, label: string) => {
    setBalanceConfig(prev => {
      const next = { ...prev };
      if (label === "(없음)") {
        delete next[vendor];
      } else {
        next[vendor] = label;
      }
      return next;
    });
    axios.put("/api/supplier-balance-configs", { supplier_name: vendor, balance_field: label === "(없음)" ? "" : label })
      .catch(console.error);
  }, []);

  // Tab state
  const [mainTab, setMainTab] = useState<"ocr" | "synonyms" | "balance" | "records">("ocr");

  useEffect(() => {
    axios.get("/api/ocr-ping")
      .then(r => setPingStatus(r.data))
      .catch(() => setPingStatus({ ok: false, gemini: false, geminiKeyCount: 0 }));
  }, []);

  const renderPdfToImages = useCallback(async (file: File): Promise<{ data: string; mimeType: string }[]> => {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const imgs: { data: string; mimeType: string }[] = [];
    setPageCount(pdf.numPages);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      // 이미지 업로드와 동일한 처리 위해 scale 은 크게 렌더 후 resizeImageForOcr 로 통일
      // (기존 scale 2.0 은 사이즈 캡 없어서 A3 이상 PDF 는 3000px+ 로 나옴)
      const vp = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(`페이지 ${i} Canvas를 초기화할 수 없습니다.`);
      await page.render({ canvasContext: ctx as any, viewport: vp, canvas } as any).promise;
      // 1차 렌더링 → base64 (품질 q95, 이후 resize 에서 손실 최소화)
      const rawDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const rawB64 = rawDataUrl.split(",")[1];
      // 이미지 업로드 경로와 동일한 resize 파이프라인 (max 2400px · JPEG q92)
      const resized = await resizeImageForOcr(rawB64, "image/jpeg");
      const previewUrl = `data:${resized.mimeType};base64,${resized.data}`;
      setPageImages(prev => [...prev, previewUrl]);
      imgs.push(resized);
    }
    return imgs;
  }, []);

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setError(null); setPages([]); setProcessed(0); setPageCount(0); setStatusMsg(""); hasUserEditsRef.current = false;
    setPageImages([]); setCurrentPageIdx(0);
    // 자동 회전 감지 결과가 도착하기 전까지는 원본 그대로 (0) 표시
    setLoading(true); setRotation(0);
    imagesDataRef.current = [];

    const isPdf = files.length === 1 &&
      (files[0].type === "application/pdf" || files[0].name.toLowerCase().endsWith(".pdf"));

    setFileName(isPdf ? files[0].name : files.length === 1 ? files[0].name : `이미지 ${files.length}장`);

    try {
      let imgs: { data: string; mimeType: string }[];

      if (isPdf) {
        imgs = await renderPdfToImages(files[0]);
      } else {
        setPageCount(files.length);
        imgs = [];
        for (const file of files) {
          const dataUrl = await new Promise<string>(res => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(file);
          });
          const rawB64 = dataUrl.split(",")[1];
          const rawMime = file.type || "image/jpeg";
          const resized = await resizeImageForOcr(rawB64, rawMime);
          const previewUrl = `data:${resized.mimeType};base64,${resized.data}`;
          setPageImages(prev => [...prev, previewUrl]);
          imgs.push(resized);
        }
      }
      imagesDataRef.current = imgs;

      // Auto-detect text orientation · 2026-07-27 개선
      //   사용자 요청 "이미지 로딩 시 가로 글씨 읽는 방향으로 회전"
      //   1) detectTextOrientation 결과 다수결 (5장 확대)
      //   2) 감지 실패·0° 반환이지만 이미지가 세로형(portrait) 이면 aspect ratio 폴백 · -90° 로 가로화
      if (imgs.length > 0) {
        setDetectingOrient(true);
        try {
          const sampleCount = Math.min(5, imgs.length);
          const samples = imgs.slice(0, sampleCount);
          // 이미지 크기 · aspect ratio (portrait/landscape) 감지 병렬
          const measured = await Promise.all(samples.map((img, idx) => new Promise<{ idx: number; deg: number; portrait: boolean }>(resolve => {
            const dataUrl = `data:${img.mimeType};base64,${img.data}`;
            const el = new Image();
            el.onload = async () => {
              const portrait = el.naturalHeight > el.naturalWidth * 1.15;
              try {
                const d = await detectTextOrientation(dataUrl);
                resolve({ idx, deg: d, portrait });
              } catch { resolve({ idx, deg: 0, portrait }); }
            };
            el.onerror = () => resolve({ idx, deg: 0, portrait: false });
            el.src = dataUrl;
          })));
          console.log(`[auto-rotation] ${sampleCount}장 감지:`, measured.map(m => `p${m.idx + 1}=${m.deg}°${m.portrait ? "(세로)" : ""}`).join(" · "));
          // 다수결
          const counts = new Map<number, number>();
          for (const m of measured) counts.set(m.deg, (counts.get(m.deg) ?? 0) + 1);
          let bestDeg = 0;
          let bestCount = 0;
          for (const [deg, c] of counts) {
            if (c > bestCount || (c === bestCount && deg !== 0 && bestDeg === 0)) {
              bestDeg = deg;
              bestCount = c;
            }
          }
          // Aspect-ratio fallback · 감지가 0° 인데 · 다수가 세로형이면 -90° 로 강제 가로화
          if (bestDeg === 0) {
            const portraitCount = measured.filter(m => m.portrait).length;
            if (portraitCount > sampleCount / 2) {
              bestDeg = -90;
              console.log(`[auto-rotation] → 폴백 · ${portraitCount}/${sampleCount} 세로형 · -90° 로 강제 가로화`);
            }
          }
          console.log(`[auto-rotation] → 최종 채택 ${bestDeg}° (다수결 ${bestCount}/${sampleCount})`);
          setRotation(bestDeg);
        } catch (e: any) {
          console.warn("[auto-rotation] 실패:", e?.message);
        } finally {
          setDetectingOrient(false);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [renderPdfToImages]);

  // 2026-07-22 · ONNX 파싱 선택 · null=원래 (Gemini 엔진 기본 흐름) · "local"=로컬 파이프라인 · "gemini"=Gemini 텍스트 파싱
  //   Gemini 엔진(⚡)은 항상 null (원래 흐름 · 미변경)
  const handleExtract = useCallback(async (onnxParser: "local" | "gemini" | null = null) => {
    const images = imagesDataRef.current;
    if (images.length === 0 || extracting) return;
    setExtracting(true); setPages([]); setProcessed(0); setError(null); hasUserEditsRef.current = false;
    setActiveParser(onnxParser);
    setStatusMsg(images.length > 1 ? `${images.length}장 처리 시작...` : "처리 중...");
    // 2026-07-22 · Gemini 파싱만 raw 모드 (rawText만 뽑고 Gemini 에 텍스트 전송)
    //   로컬 파싱은 raw 모드 안 씀 → 어제 그대로 전체 파이프라인 실행
    const useRawMode = ocrEngine === "onnx" && onnxParser === "gemini";
    try {
      const rotatedImages = rotation === 0
        ? images
        : await Promise.all(images.map(img => physicallyRotate(img.data, img.mimeType, rotation)));

      const pageErrors: string[] = [];
      const total = rotatedImages.length;
      const collectedPages: OcrPageResult[] = [];  // SSE 결과 로컬 누적 (파싱 체인용)

      const res = await fetch("/api/ocr?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({
          images: rotatedImages,
          engine: engineToBackend(ocrEngine),
          ...(useRawMode ? { parseMode: "raw" } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        // 서버가 SSE 응답을 시작하기 전 400/500 반환 시 JSON 파싱 시도
        let errMsg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          errMsg = j?.error ?? errMsg;
        } catch { /* body 가 SSE 이거나 비어 있음 */ }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let doneFlag = false;

      // SSE 이벤트 파서 · 빈 줄로 구분되는 블록마다 event/data 분리
      const processBlock = (block: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split("\n")) {
          if (!line || line.startsWith(":")) continue;   // comment/keepalive
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;
        let payload: any = null;
        try { payload = JSON.parse(dataLines.join("\n")); } catch { return; }
        if (eventName === "start") {
          setStatusMsg(`0 / ${payload?.total ?? total} 페이지 처리 중...`);
        } else if (eventName === "page") {
          const pg = payload?.page;
          if (pg && typeof pg.page === "number") {
            // 2026-07-24 · 사용자 요청 "이미 로딩된 페이지 리로드 금지"
            //   collectedPages 는 Gemini 재파싱 chain 을 위해 최신 버전 유지 (내부용)
            //   setPages 는 · 이미 있는 페이지는 SKIP (dispRows 재계산 방지 · 편집 보존)
            const existIdx = collectedPages.findIndex(p => p.page === pg.page);
            if (existIdx >= 0) collectedPages[existIdx] = pg as OcrPageResult;
            else collectedPages.push(pg as OcrPageResult);
            setPages(prev => {
              if (prev.some(p => p.page === pg.page)) {
                console.log(`[SSE page ${pg.page}] 이미 로딩됨 · setPages skip (편집 보존)`);
                return prev;
              }
              return [...prev, pg as OcrPageResult];
            });
          }
          setProcessed(prev => {
            const next = prev + 1;
            setStatusMsg(`${next} / ${payload?.total ?? total} 페이지 처리 중...`);
            return next;
          });
          if (payload?.error) pageErrors.push(`${(payload?.index ?? 0) + 1}페이지: ${payload.error}`);
        } else if (eventName === "error") {
          const msg = payload?.error ?? "OCR 실패";
          const p = payload?.page ? `${payload.page}페이지: ` : "";
          pageErrors.push(`${p}${msg}`);
        } else if (eventName === "done") {
          doneFlag = true;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE 이벤트 구분자: 빈 줄 (\n\n)
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          processBlock(block);
        }
        if (doneFlag) break;
      }
      // 잔여 flush
      if (buf.trim()) processBlock(buf);

      if (pageErrors.length > 0) setError(pageErrors.join(" / "));

      // 2026-07-22 · Gemini 파싱 체인 (raw 모드일 때만) · rawText 를 Gemini 에 텍스트 전송
      if (useRawMode && onnxParser === "gemini" && collectedPages.length > 0) {
        setStatusMsg(`Gemini 파싱 중...`);
        try {
          const payload = { pages: collectedPages.map(p => ({ page: p.page, rawText: p.rawText ?? "" })) };
          const resp = await axios.post("/api/ocr/parse-gemini", payload);
          const parsed = resp.data.pages as OcrPageResult[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            // 2026-07-23 · 사용자 편집 감지 시 · Gemini 재파싱 결과로 덮어쓰지 않음
            if (hasUserEditsRef.current) {
              console.warn("[Gemini reparse] 사용자 편집 감지 · setPages 스킵 (편집 보존)");
              setStatusMsg(`Gemini 파싱 완료 · 편집중이라 표는 유지 (${parsed.length}페이지)`);
            } else {
              setPages(parsed);
              const diag = resp.data?._diag?.summaries;
              if (Array.isArray(diag)) {
                const bad = diag.filter((d: any) => d.status && d.status !== "OK");
                setStatusMsg(bad.length > 0
                  ? `Gemini 파싱 부분성공 · 실패 ${bad.length}개 (서버 로그 확인)`
                  : `Gemini 파싱 완료 (${parsed.length}페이지)`);
              } else {
                setStatusMsg(`Gemini 파싱 완료 (${parsed.length}페이지)`);
              }
            }
          }
        } catch (e: any) {
          setError(`Gemini 파싱 실패: ${e?.response?.data?.error ?? e?.message ?? "unknown"}`);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setExtracting(false);
      setActiveParser(null);
      if (!useRawMode) setStatusMsg("");
    }
  }, [extracting, rotation, ocrEngine]);

// ── 재추출 approach 순환 (2026-07-19) ────────────────────────────────────
//   같은 명세서를 반복 재추출 시 매번 다른 접근 방식으로 시도.
//   순환: default → rearrange → high-contrast → gemini → default ...
type ReparseApproach = "default" | "rearrange" | "high-contrast" | "gemini";
const REPARSE_APPROACH_CYCLE: ReparseApproach[] = ["default", "rearrange", "high-contrast", "gemini"];

const handleReparsePage = useCallback(async (
  pageNum: number,
  supplierHint: string,
  approach: ReparseApproach = "default",
): Promise<any> => {
  const images = imagesDataRef.current;
  const img = images[pageNum - 1];
  if (!img) return null;
  const rotImg = rotation !== 0 ? await physicallyRotate(img.data, img.mimeType, rotation) : img;
  // rearrange 모드: 이미지 대신 이전 rawText 를 body 로 전달 · 서버가 OCR 스킵
  const currentPage = pages.find(p => p.page === pageNum);
  const cachedRawText = (currentPage?.rawText ?? "") as string;
  const body: any = {
    images: [rotImg],
    engine: engineToBackend(ocrEngine),
    supplierHints: [supplierHint],
  };
  if (approach === "rearrange") {
    body.cachedRawTexts = [cachedRawText];
  }
  const url = approach === "default" ? "/api/ocr" : `/api/ocr?approach=${encodeURIComponent(approach)}`;
  const res = await axios.post(url, body);
  const newPage = res.data.pages?.[0];
  if (newPage) {
    setPages(prev => prev.map(p => p.page === pageNum ? { ...newPage, page: pageNum } : p));
  }
  return newPage ?? null;
}, [rotation, ocrEngine, pages]);

const rotDeg = ((rotation % 360) + 360) % 360;

const clearFiles = () => {
  setFileName(null); setPages([]); setPageImages([]); hasUserEditsRef.current = false;
  setCurrentPageIdx(0); imagesDataRef.current = [];
  setPageCount(0); setError(null); setRotation(0);
};

return (
  <div className={embedded ? "flex-1 flex flex-col min-h-0 bg-gray-50" : "min-h-screen bg-gray-50 flex flex-col"}>
    {/* Shared App Nav Header · 임베드 모드에선 숨김 (부모 페이지의 헤더 사용) */}
    {!embedded && (
      <AppNavHeader
        activePage="ocr"
        authSession={authSession ?? null}
        onBack={onBack}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />
    )}

    {/* Tab bar */}
    <div className="bg-white/90 backdrop-blur-sm border-b border-line/70 sticky top-0 z-10">
      <div className={`${PAGE_CONTAINER_CLS} px-2 sm:px-4 py-2`}>
        <div className="flex flex-wrap bg-zinc-100/70 border border-line/60 rounded-2xl p-1 gap-0.5">
          <button
            onClick={() => setMainTab("ocr")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg shrink-0 transition-colors duration-150 cursor-pointer ${mainTab === "ocr" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}
          >
            <Upload size={13} className={mainTab === "ocr" ? "text-zinc-800" : "text-zinc-400"} /> OCR 추출
          </button>
          <button
            onClick={() => setMainTab("synonyms")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg shrink-0 transition-colors duration-150 cursor-pointer ${mainTab === "synonyms" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}
          >
            <BookOpen size={13} className={mainTab === "synonyms" ? "text-zinc-800" : "text-zinc-400"} /> 동의어 관리
          </button>
          <button
            onClick={() => setMainTab("balance")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg shrink-0 transition-colors duration-150 cursor-pointer ${mainTab === "balance" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}
          >
            잔고항목 지정
          </button>
          <button
            onClick={() => setMainTab("records")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg shrink-0 transition-colors duration-150 cursor-pointer ${mainTab === "records" ? "bg-white text-zinc-900 ring-1 ring-zinc-200/70 shadow-sm" : "text-zinc-500 hover:text-zinc-800 hover:bg-white/50"}`}
          >
            <FileText size={13} className={mainTab === "records" ? "text-zinc-800" : "text-zinc-400"} /> 거래명세서 조회
          </button>
        </div>
      </div>
    </div>

    {mainTab === "records" ? (
      /* ── 거래명세서 조회 탭 ── */
      <ConfirmedRecordsTab />
    ) : mainTab === "balance" ? (
      /* ── 잔고항목 지정 탭 ── */
      <BalanceConfigTab pages={pages} config={balanceConfig} onConfigChange={handleBalanceConfigChange} />
    ) : mainTab === "synonyms" ? (
      /* ── 동의어 관리 탭 ── */
      <SynonymsTab />
    ) : (
    /* ── OCR 추출 탭 ── */
    <div className={`flex-1 flex flex-col px-4 py-6 gap-5 ${PAGE_CONTAINER_CLS}`}>

      {/* 파일 업로드 + 이미지 뷰어 */}
      <Card clip padding="none" className="w-full">

        {pageImages.length === 0 ? (
          <div
            className="p-3 m-2"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length > 0) handleFiles(files);
            }}
          >
            <div className="flex gap-3">
              {/* PDF 업로드 */}
              <div
                onClick={() => pdfInputRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2.5 py-6 px-3 border-2 border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/40 rounded-xl cursor-pointer transition-colors"
              >
                {/* 2026-08-18 · IconTile 확산 · xl · rounded-xl */}
                <IconTile icon={<Upload size={20} />} tone="amber" size="xl" shape="rounded-xl" />

                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">PDF 업로드</p>
                  <p className="text-gray-400 text-[15px] mt-0.5">1개 파일</p>
                </div>
              </div>
              {/* 이미지 여러 장 */}
              <div
                onClick={() => imageInputRef.current?.click()}
                className="flex-1 flex flex-col items-center gap-2.5 py-6 px-3 border-2 border-dashed border-gray-300 hover:border-emerald-400 hover:bg-emerald-50/40 rounded-xl cursor-pointer transition-colors"
              >
                {/* 2026-08-18 · IconTile 확산 · xl · rounded-xl */}
                <IconTile icon={<Images size={20} />} tone="emerald" size="xl" shape="rounded-xl" />

                <div className="text-center">
                  <p className="font-bold text-gray-800 text-sm">이미지 업로드</p>
                  <p className="text-gray-400 text-[15px] mt-0.5">여러 장 선택 가능</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Upload size={13} className="text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 break-all">{fileName}</span>
              {loading && pageImages.length < pageCount && (
                <span className="text-[14px] text-amber-500 font-bold">
                  · {pageImages.length}/{pageCount} 로딩 중...
                </span>
              )}
              {detectingOrient && (
                <span className="flex items-center gap-1">
                  <Spinner size={10} tone="sky" label="방향 감지 중..." labelSize={14} />
                </span>
              )}
              {!loading && !detectingOrient && pageCount > 1 && (
                <span className="text-[14px] text-gray-400">{pageCount}장</span>
              )}
            </div>
            <button onClick={clearFiles} className="text-gray-400 hover:text-gray-700 cursor-pointer p-1">
              <X size={14} />
            </button>
          </div>
        )}

        {loading && pageImages.length === 0 && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Spinner size={28} tone="amber" />
            <p className="text-sm font-bold text-gray-700">
              {pageCount > 0 ? `${pageImages.length} / ${pageCount} 로딩 중...` : "파일 읽는 중..."}
            </p>
            {pageCount > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${(pageImages.length / pageCount) * 100}%` }} />
              </div>
            )}
          </div>
        )}

        <PageImageViewer
          key={fileName ?? ""}
          images={pageImages}
          totalPages={pageCount}
          loading={loading}
          currentIdx={currentPageIdx}
          onChangeIdx={setCurrentPageIdx}
          rotation={rotation}
          onRotate={setRotation}
        />
      </Card>

      {/* Hidden inputs */}
      <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFiles([f]); e.target.value = ""; } }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { const fs = Array.from(e.target.files ?? []); if (fs.length) { handleFiles(fs); e.target.value = ""; } }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFiles([f]); e.target.value = ""; } }} />

      {/* 엔진 선택 + 추출 */}
      {pageImages.length > 0 && !loading && (
        <>
          {pingStatus && !pingStatus.ok && (
            <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" padding="sm" className="w-full flex items-center gap-2 text-rose-700 text-xs font-semibold">
              <AlertCircle size={14} />
              서버가 OCR을 지원하지 않습니다. <code className="font-mono bg-rose-100 px-1 rounded">npx tsx server.ts</code> 로 재시작하세요.
            </Card>
          )}
          {pingStatus?.ok && !pingStatus.gemini && (
            <Card variant="flat" bg="bg-amber-50" borderColor="border-amber-200" padding="sm" className="w-full flex items-center gap-2 text-amber-700 text-xs font-semibold">
              <AlertCircle size={14} />
              GEMINI_API_KEY가 없습니다. .env에 키를 추가하세요.
            </Card>
          )}

          {/* OCR 엔진 선택 · 2-way (AI 모델 · Gemini) · 2026-08-24 · v9 topAccent */}
          <Card padding="sm" topAccent className="w-full flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[15px] font-bold text-zinc-600">
              <span>OCR 엔진</span>
              <span className="text-[14px] font-mono text-zinc-400">
                ({ocrEngine === "onnx" ? "AI 모델 (ONNX) · 완전 무료 · Render OK"
                  : "Gemini · 정확도 최상"})
              </span>
            </div>
            <div className="inline-flex bg-zinc-100 border border-line rounded-lg p-0.5 gap-0.5 w-full">
              <button type="button" onClick={() => setOcrEngine("onnx")}
                disabled={extracting}
                className={`flex-1 px-2 py-1.5 text-[15px] font-bold rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  ocrEngine === "onnx"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-white"
                }`}
                title="PP-OCRv5 한국어 AI 모델 (ONNX · ppu-paddle-ocr) · 완전 무료 · Render 배포 · 셀프호스팅">
                🤖 AI 모델
              </button>
              <button type="button" onClick={() => setOcrEngine("gemini")}
                disabled={extracting}
                className={`flex-1 px-2 py-1.5 text-[15px] font-bold rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  ocrEngine === "gemini"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 hover:bg-white"
                }`}
                title="Gemini 비전 API · 정확도 최상 · 다중 키 로테이션">
                ⚡ Gemini
              </button>
            </div>
            {ocrEngine === "onnx" && (
              <p className="text-[14px] text-emerald-600 leading-tight">
                🤖 AI 모델 (PP-OCRv5 한국어 ONNX) · 첫 요청 시 모델 초기화 5~10초 · <b>Render 배포 무료</b> · Apache 2.0
              </p>
            )}
            {ocrEngine === "gemini" && (
              <p className="text-[14px] text-amber-600 leading-tight">
                ⚡ Gemini · 표 구조 인식 최상 · 다중 키 로테이션 (GEMINI_API_KEY_1/2/3...) · quota 시 자동 전환
              </p>
            )}
          </Card>

          {/* 2026-07-28 · 사용자 요청 "ONNX → Gemini 파싱 기능 제거" · 로컬 파싱만 유지 */}
          {ocrEngine === "onnx" ? (
            <button onClick={() => handleExtract("local")} disabled={extracting}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white active:scale-[0.98] disabled:cursor-not-allowed transition cursor-pointer shadow-sm ${
                activeParser === "local"
                  ? "bg-emerald-600 ring-2 ring-emerald-300"
                  : extracting
                    ? "bg-emerald-300"
                    : "bg-brand-deep hover:bg-[#0d3a5c] active:bg-[#08253a]"
              }`}
              title="ONNX (PP-OCRv5) 로 rawText 추출 → 로컬 파이프라인 (vendor-match·normalize·verify) 으로 파싱/매칭">
              {activeParser === "local"
                ? <><Spinner size={15} />{statusMsg || `로컬 파싱 중... (${processed}/${pageCount || "?"})`}</>
                : <><Zap size={15} />ONNX → 🔧 로컬 파싱/매칭{rotDeg !== 0 ? ` · ${rotDeg}° 회전` : ""}</>}
            </button>
          ) : (
            <button onClick={() => handleExtract(null)} disabled={extracting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-sm">
              {extracting
                ? <><Spinner size={15} />{statusMsg || `OCR 추출 중... (${processed}/${pageCount || "?"})`}</>
                : <><Zap size={15} />OCR 추출 (Gemini){rotDeg !== 0 ? ` · ${rotDeg}° 회전` : ""}</>}
            </button>
          )}
        </>
      )}

      {extracting && pageCount > 0 && (
        <Card className="w-full py-3">
          <div className="w-full bg-zinc-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full transition-all bg-amber-500"
              style={{ width: `${(processed / pageCount) * 100}%` }} />
          </div>
        </Card>
      )}

      {error && (
        <Card variant="flat" bg="bg-rose-50" borderColor="border-rose-200" rounded="2xl" padding="md" className="w-full text-rose-700 text-sm font-semibold">
          {error}
        </Card>
      )}

      {pages.length > 0 && <RawOcrTable pages={pages} pageImages={pageImages} rotation={rotation} onReparsePage={handleReparsePage} balanceConfig={balanceConfig} onSaveConfirmed={handleSaveConfirmed} onUserEdit={handleUserEdit} />}
    </div>
    )}
  </div>
);
};
