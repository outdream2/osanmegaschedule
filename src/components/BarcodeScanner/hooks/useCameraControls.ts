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
          exposureCompensation: 2.0,
          brightness: 100,
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
      // Max exposure compensation from the start
      track.applyConstraints({
        advanced: [{ exposureMode: "continuous", exposureCompensation: 2.5 } as any],
      }).catch(() => {});
      // Single-shot resets AF, then continuous keeps it sharp
      track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as any] }).catch(() => {});
      setTimeout(() => {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
      }, 600);
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
    track.applyConstraints({ advanced: [{ focusMode: "single-shot" } as any] }).catch(() => {});
    setTimeout(() => {
      track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
    }, 600);
  }, [frozenFrame, videoRef]);

  return handleTapFocus;
}
