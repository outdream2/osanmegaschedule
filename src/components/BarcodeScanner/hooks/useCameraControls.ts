import React, { useCallback, useEffect } from "react";

interface UseCameraControlsParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  torchOn: boolean;
  setTorchOn: React.Dispatch<React.SetStateAction<boolean>>;
  torchOnRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  frozenFrame: string | null;
}

const isAndroid = /android/i.test(navigator.userAgent);

// capabilities 조회 후 지원 여부 확인된 항목만 개별 객체로 분리해 배열에 담음.
// advanced 배열의 객체 하나라도 미지원 속성이 섞이면 해당 객체 전체가 기각되는
// All-or-Nothing 규칙 때문에 반드시 속성별로 나눠야 한다.
function buildAdvanced(
  caps: Partial<MediaTrackCapabilities>,
  opts: {
    focusMode?: string;
    exposureMode?: string;
    exposureCompensation?: number;
    whiteBalanceMode?: string;
  }
): object[] {
  const arr: object[] = [];
  if (opts.focusMode && (caps as any).focusMode?.includes(opts.focusMode)) {
    arr.push({ focusMode: opts.focusMode });
  }
  if (opts.exposureMode && (caps as any).exposureMode?.includes(opts.exposureMode)) {
    arr.push({ exposureMode: opts.exposureMode });
  }
  if (
    opts.exposureCompensation !== undefined &&
    (caps as any).exposureCompensation
  ) {
    const ec = (caps as any).exposureCompensation as { min: number; max: number };
    const clamped = Math.max(ec.min, Math.min(ec.max, opts.exposureCompensation));
    arr.push({ exposureCompensation: clamped });
  }
  if (opts.whiteBalanceMode && (caps as any).whiteBalanceMode?.includes(opts.whiteBalanceMode)) {
    arr.push({ whiteBalanceMode: opts.whiteBalanceMode });
  }
  return arr;
}

function getCaps(track: MediaStreamTrack): Partial<MediaTrackCapabilities> {
  return typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
}

export function useCameraControls({
  videoRef,
  torchOn,
  setTorchOn,
  torchOnRef,
  mountedRef,
  frozenFrame,
}: UseCameraControlsParams) {
  useEffect(() => { torchOnRef.current = torchOn; }, [torchOn, torchOnRef]);

  // ── Torch toggle ───────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track) return;
    const caps = getCaps(track);
    // torch는 단독 객체로 분리 — 다른 속성과 묶으면 torch 미지원 기기에서 전체 기각됨
    const advanced: object[] = [{ torch: torchOn }];
    if ((caps as any).exposureMode?.includes("continuous")) {
      advanced.push({ exposureMode: "continuous" });
    }
    if (torchOn && (caps as any).exposureCompensation) {
      advanced.push({ exposureCompensation: 0.3 });
    }
    track.applyConstraints({ advanced } as any).catch(() => {});
  }, [torchOn, videoRef]);

  // ── Camera ready: AF kick + Android 과노출 보정 ────────────────────────────
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;

    const onReady = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;

      // Android 전용 CSS 밝기 보정 (iOS는 자체 AE가 처리하므로 건드리지 않음)
      if (isAndroid) {
        video.style.filter = "brightness(0.72) contrast(1.35)";
      }

      if (!isAndroid) return; // iOS는 focus 제약 자체를 Safari가 무시 → 개입 불필요

      const caps = getCaps(track);
      // 지원 항목만 개별 객체로 분리해 배열에 담음
      const advanced = buildAdvanced(caps, {
        focusMode: "continuous",
        exposureMode: "continuous",
        exposureCompensation: -0.8,
        whiteBalanceMode: "continuous",
      });
      if (advanced.length > 0) {
        track.applyConstraints({ advanced } as any).catch(() => {});
      }
    };

    video.addEventListener("playing", onReady);
    const t = setTimeout(onReady, 1500);
    return () => { video.removeEventListener("playing", onReady); clearTimeout(t); };
  }, [videoRef, mountedRef, setTorchOn]);

  // ── Tap-to-focus ───────────────────────────────────────────────────────────
  const handleTapFocus = useCallback(() => {
    if (frozenFrame) return;
    const video = videoRef.current as HTMLVideoElement | null;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track) return;

    if (!isAndroid) return; // iOS는 JS 개입 없이 자체 AF 동작

    const caps = getCaps(track);
    const supportedModes: string[] = (caps as any).focusMode ?? [];

    if (supportedModes.includes("single-shot")) {
      // single-shot → 한 번 AF 스냅 → continuous 복귀
      // "none" 은 W3C 비표준이라 기각될 수 있으므로 사용 금지
      track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] } as any)
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            const advanced = buildAdvanced(caps, {
              focusMode: "continuous",
              exposureCompensation: -0.8,
            });
            if (advanced.length > 0) {
              track.applyConstraints({ advanced } as any).catch(() => {});
            }
          }, 600);
        });
    } else if (supportedModes.includes("continuous")) {
      // single-shot 미지원 기기: continuous 재적용으로 AF 재트리거
      const advanced = buildAdvanced(caps, {
        focusMode: "continuous",
        exposureCompensation: -0.8,
      });
      if (advanced.length > 0) {
        track.applyConstraints({ advanced } as any).catch(() => {});
      }
    }
  }, [frozenFrame, videoRef]);

  // ── 주기적 refocus — 6초마다 continuous 재적용 (Android drift 방지) ────────
  useEffect(() => {
    if (frozenFrame || !isAndroid) return;
    const id = setInterval(() => {
      if (frozenFrame) return;
      const video = videoRef.current as HTMLVideoElement | null;
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;
      const caps = getCaps(track);
      const advanced = buildAdvanced(caps, {
        focusMode: "continuous",
        exposureCompensation: -0.8,
      });
      if (advanced.length > 0) {
        track.applyConstraints({ advanced } as any).catch(() => {});
      }
    }, 6000);
    return () => clearInterval(id);
  }, [frozenFrame, videoRef]);

  return handleTapFocus;
}
