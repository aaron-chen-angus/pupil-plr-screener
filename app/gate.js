/**
 * CV GATE: before the app fires the LED it must confirm that exactly the named
 * eye is centered, open (not mid-blink), and in focus. The gate never fires the
 * torch itself — it only reports readiness so the protocol engine can decide.
 */

export const DEFAULT_GATE = {
  minEar: 0.18,
  minFocus: 0.25,
  maxCenterOffset: 0.28,
};

export function evaluateGate(reading, target, measurePupil, frame, thr = DEFAULT_GATE) {
  const checks = {
    faceDetected: reading.present,
    oneEyeTargeted: false,
    centered: false,
    open: false,
    inFocus: false,
    pupilFound: false,
  };

  const iris = target === "left" ? reading.left : reading.right;
  const other = target === "left" ? reading.right : reading.left;

  if (!reading.present || !iris) {
    return { ready: false, checks, iris: null, pupil: null };
  }

  checks.oneEyeTargeted = true;

  const cx = frame.w / 2;
  const cy = frame.h / 2;
  const minDim = Math.min(frame.w, frame.h);
  const offset = Math.hypot(iris.centerPx.x - cx, iris.centerPx.y - cy) / minDim;

  let targetIsCentered = offset <= thr.maxCenterOffset;
  if (other) {
    const otherOffset =
      Math.hypot(other.centerPx.x - cx, other.centerPx.y - cy) / minDim;
    targetIsCentered = targetIsCentered && offset <= otherOffset;
  }
  checks.centered = targetIsCentered;

  checks.open = iris.ear >= thr.minEar;

  const pupil = measurePupil(iris);
  checks.pupilFound = pupil.ok;
  checks.inFocus = pupil.focus >= thr.minFocus;

  const ready =
    checks.faceDetected &&
    checks.oneEyeTargeted &&
    checks.centered &&
    checks.open &&
    checks.inFocus &&
    checks.pupilFound;

  return { ready, checks, iris, pupil };
}
