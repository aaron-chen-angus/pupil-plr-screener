import type { Capabilities } from "./types";

/**
 * Detect the capabilities required to run a controlled-stimulus PLR test.
 *
 * Torch (LED) control from the web requires
 * MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] }), which is
 * NOT supported by iOS Safari. Because this capability can only be confirmed
 * once a camera track exists, this returns an *optimistic* preliminary result;
 * the definitive torch check happens in the CameraController after the stream
 * is opened. See {@link probeTorchOnTrack}.
 */
export function detectCapabilities(): Capabilities {
  const secureContext = window.isSecureContext === true;
  const hasGetUserMedia = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
  const speechSupported = "speechSynthesis" in window;

  // Preliminary torch capability guess. `getSupportedConstraints().torch`
  // reports whether the UA *knows about* the torch constraint. iOS Safari
  // returns false / undefined here. This is refined once a track is live.
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { torch?: boolean })
    | undefined;
  const torchSupported = !!supported?.torch;

  let reason = "";
  if (!secureContext) {
    reason =
      "Camera and torch require a secure context (HTTPS). Open this page over HTTPS.";
  } else if (!hasGetUserMedia) {
    reason = "This browser does not expose getUserMedia; camera access is unavailable.";
  } else if (!torchSupported) {
    reason =
      "This browser/device does not report torch (LED) control. iOS Safari does not support it. You can run demo mode without a controlled stimulus.";
  }

  const canRunControlledTest =
    secureContext && hasGetUserMedia && torchSupported;

  return {
    secureContext,
    hasGetUserMedia,
    torchSupported,
    speechSupported,
    canRunControlledTest,
    reason,
  };
}

/**
 * Definitively probe whether a live video track supports torch control.
 * Reads track.getCapabilities().torch when available.
 */
export function probeTorchOnTrack(track: MediaStreamTrack): boolean {
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
    torch?: boolean;
  };
  return caps.torch === true;
}
