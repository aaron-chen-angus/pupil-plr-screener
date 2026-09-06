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
  const constraintTorch = !!(supported && supported.torch);

  // Detect iOS / iPadOS (incl. iPadOS reporting as Mac with touch). iOS Safari
  // and ALL iOS browsers (they use WebKit) cannot control the torch from the
  // web, regardless of what getSupportedConstraints() claims.
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);

  // Torch is only plausibly controllable off iOS AND when the constraint is
  // advertised. The definitive answer still comes from the live track.
  const torchSupported = constraintTorch && !isIOS;

  let reason = "";
  if (!secureContext) {
    reason =
      "Camera and torch require a secure context (HTTPS). Open this page over HTTPS.";
  } else if (!hasGetUserMedia) {
    reason =
      "This browser does not expose getUserMedia; camera access is unavailable.";
  } else if (isIOS) {
    reason =
      "This is an iPhone/iPad. iOS browsers cannot control the camera LED from the web, so a real light stimulus can't be delivered. Use demo mode here, or an Android Chrome phone for a real screening.";
  } else if (!torchSupported) {
    reason =
      "This browser/device does not report torch (LED) control. You can run demo mode without a controlled stimulus.";
  }

  const canRunControlledTest =
    secureContext && hasGetUserMedia && torchSupported;

  return {
    secureContext,
    hasGetUserMedia,
    torchSupported,
    speechSupported,
    isIOS,
    canRunControlledTest,
    reason,
  };
}

/** Definitively probe whether a live video track supports torch control. */
export function probeTorchOnTrack(track) {
  const caps = track.getCapabilities?.() ?? {};
  return caps.torch === true;
}
