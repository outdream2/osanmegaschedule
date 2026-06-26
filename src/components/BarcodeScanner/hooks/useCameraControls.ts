import React, { useCallback, useEffect } from "react";

interface UseCameraControlsParams {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  torchOn: boolean;
  setTorchOn: React.Dispatch<React.SetStateAction<boolean>>;
  torchOnRef: React.MutableRefObject<boolean>;
  mountedRef: React.MutableRefObject<boolean>;
  frozenFrame: string | null;
}

export function useCameraControls({
  videoRef,
  torchOn,
  setTorchOn,
  torchOnRef,
  mountedRef,
  frozenFrame,
}: UseCameraControlsParams) {
  // Keep torchOnRef in sync for use inside intervals (avoids stale closure)
  useEffect(() => { torchOnRef.current = torchOn; }, [torchOn, torchOnRef]);

  // ── Torch (flashlight) toggle — biggest single quality boost for paper ────
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      track.applyConstraints({
        advanced: [{
          torch: torchOn,
          exposureMode: "continuous",
          exposureCompensation: torchOn ? 0.3 : 0.0,
        } as any],
      }).catch(() => {});
    } catch {}
  }, [torchOn, videoRef]);

  // ── Auto-focus + auto-torch on camera ready ────────────────────────────────
  // Torch fires as soon as the camera stream starts (playing event) — no timer.
  // Also kicks Android focus: single-shot → continuous for sharp initial lock.
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;

    const kickFocusAndTorch = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;
      // continuous focus+exposure — "single-shot" is iOS-only and locks focus on Android
      track.applyConstraints({
        advanced: [{ focusMode: "continuous", exposureMode: "continuous", exposureCompensation: 0.0 } as any],
      }).catch(() => {});
    };

    video.addEventListener("playing", kickFocusAndTorch);
    // Fallback: try 1.5 s after mount in case playing event already fired
    const t = setTimeout(kickFocusAndTorch, 1500);
    return () => { video.removeEventListener("playing", kickFocusAndTorch); clearTimeout(t); };
  }, [videoRef, mountedRef, setTorchOn]);

  // ── Tap-to-focus: re-trigger AF on tap (essential on Android) ────────────
  const handleTapFocus = useCallback(() => {
    if (frozenFrame) return;
    const video = videoRef.current as HTMLVideoElement | null;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track) return;
    // Re-apply continuous to nudge AF — single-shot is not supported on Android Chrome
    track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
  }, [frozenFrame, videoRef]);

  // ── Periodic refocus: kick AF every 6 s to prevent continuous-mode drift ──
  useEffect(() => {
    if (frozenFrame) return;
    const id = setInterval(() => {
      if (frozenFrame) return;
      const video = videoRef.current as HTMLVideoElement | null;
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;
      track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
    }, 6000);
    return () => clearInterval(id);
  }, [frozenFrame, videoRef]);

  return handleTapFocus;
}
