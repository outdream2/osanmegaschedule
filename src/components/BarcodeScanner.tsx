import React, { useEffect, useRef } from "react";
import { useZxing } from "react-zxing";
import { X, ScanLine } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  title?: string;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, title = "바코드 스캔" }) => {
  const scannedRef = useRef(false);

  const { ref } = useZxing({
    onDecodeResult(result) {
      if (scannedRef.current) return;
      scannedRef.current = true;
      onScan(result.rawValue);
    },
    constraints: { video: { facingMode: "environment" } },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
          <div className="flex items-center gap-2 text-white">
            <ScanLine size={15} />
            <span className="text-sm font-bold">{title}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Camera view */}
        <div className="relative bg-black aspect-[4/3] overflow-hidden">
          <video ref={ref} className="w-full h-full object-cover" />
          {/* Scan guide overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-56 h-32">
              <div className="absolute inset-0 border-2 border-emerald-400 rounded-lg opacity-80" />
              <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-emerald-400/70 animate-pulse" />
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 py-3 font-medium">
          바코드를 사각형 안에 맞춰주세요
        </p>
      </div>
    </div>
  );
};
