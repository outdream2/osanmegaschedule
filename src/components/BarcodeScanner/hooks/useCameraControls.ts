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

  // ── Torch (flashlight) toggle ──────────────────────────────────────────────
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

  // ── Camera ready: kick AF + apply Android-only corrections ────────────────
  useEffect(() => {
    const video = videoRef.current as HTMLVideoElement | null;
    if (!video) return;

    const onReady = () => {
      const track = (video.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;

      // Android: counteract overexposure with CSS filter on the video element.
      // iOS is intentionally left untouched (its AE is already balanced).
      if (isAndroid) {
        video.style.filter = "brightness(0.72) contrast(1.35)";
      }

      // Android needs negative exposure compensation to prevent blown-out paper.
      // iOS: keep at 0.0 (no change from default).
      track.applyConstraints({
        advanced: [{
          focusMode: "continuous",
          exposureMode: "continuous",
          exposureCompensation: isAndroid ? -0.8 : 0.0,
          whiteBalanceMode: "continuous",
        } as any],
      }).catch(() => {});
    };

    video.addEventListener("playing", onReady);
    const t = setTimeout(onReady, 1500);
    return () => { video.removeEventListener("playing", onReady); clearTimeout(t); };
  }, [videoRef, mountedRef, setTorchOn]);

  // ── Tap-to-focus ──────────────────────────────────────────────────────────
  const handleTapFocus = useCallback(() => {
    if (frozenFrame) return;
    const video = videoRef.current as HTMLVideoElement | null;
    const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
    if (!track) return;

    if (isAndroid) {
      // Android: momentarily reset focus mode to force AF re-trigger,
      // then return to continuous so it keeps tracking after the tap.
      track.applyConstraints({ advanced: [{ focusMode: "none" } as any] }).catch(() => {});
      setTimeout(() => {
        track.applyConstraints({
          advanced: [{ focusMode: "continuous", exposureCompensation: -0.8 } as any],
        }).catch(() => {});
      }, 300);
    } else {
      // iOS: nudge continuous AF (works fine without reset)
      track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }).catch(() => {});
    }
  }, [frozenFrame, videoRef]);

  // ── Periodic refocus every 6 s (prevents continuous-mode drift on Android) ─
  useEffect(() => {
    if (frozenFrame) return;
    const id = setInterval(() => {
      if (frozenFrame) return;
      const video = videoRef.current as HTMLVideoElement | null;
      const track = (video?.srcObject as MediaStream | null)?.getVideoTracks?.()[0];
      if (!track) return;
      track.applyConstraints({
        advanced: [{
          focusMode: "continuous",
          ...(isAndroid ? { exposureCompensation: -0.8 } : {}),
        } as any],
      }).catch(() => {});
    }, 6000);
    return () => clearInterval(id);
  }, [frozenFrame, videoRef]);

  return handleTapFocus;
}
