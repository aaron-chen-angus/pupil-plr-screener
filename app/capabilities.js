// Capability detection for a controlled-stimulus PLR test.
//
// Torch (LED) control from the web requires
// MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] }), which is
// NOT supported by iOS Safari. This returns an optimistic preliminary result;
// the definitive torch check happens once a camera track exists.

export function detectCapabilities() {
  const secureContext = window.isSecureContext === true;
  const hasGetUserMedia = !!(
    navigator.mediaDevices && navigator.mediaDevices.getUserMedia
  );
  const speechSupported = "speechSynthesis" in window;

  const supported = navigator.mediaDevices?.getSupportedConstraints?.();
  const torchSupported = !!(supported && supported.torch);

  let reason = "";
  if (!secureContext) {
    reason =
      "Camera and torch require a secure context (HTTPS). Open this page over HTTPS.";
  } else if (!hasGetUserMedia) {
    reason =
      "This browser does not expose getUserMedia; camera access is unavailable.";
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

/** Definitively probe whether a live video track supports torch control. */
export function probeTorchOnTrack(track) {
  const caps = track.getCapabilities?.() ?? {};
  return caps.torch === true;
}
