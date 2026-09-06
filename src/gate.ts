import type { EyeSide } from "./types";
import type { FaceReading, IrisInfo } from "./facemesh";
import type { PupilMeasurement } from "./pupil";

/**
 * CV GATE: before the app fires the LED it must confirm that exactly the named
 * eye is centered, open (not mid-blink), and in focus. The gate never fires the
 * torch itself — it only reports readiness so the protocol engine can decide.
 */

export interface GateChecks {
  faceDetected: boolean;
  oneEyeTargeted: boolean;
  centered: boolean;
  open: boolean;
  inFocus: boolean;
  pupilFound: boolean;
}

export interface GateResult {
  ready: boolean;
  checks: GateChecks;
  /** The targeted eye's iris info, if usable. */
  iris: IrisInfo | null;
  /** The targeted eye's pupil measurement, if any. */
  pupil: PupilMeasurement | null;
}

export interface GateThresholds {
  /** Minimum Eye Aspect Ratio to count as "open" (not blinking). */
  minEar: number;
  /** Minimum focus confidence 0..1. */
  minFocus: number;
  /** Max allowed offset of iris centre from frame centre, as fraction of min(w,h). */
  maxCenterOffset: number;
}

export const DEFAULT_GATE: GateThresholds = {
  minEar: 0.18,
  minFocus: 0.25,
  maxCenterOffset: 0.28,
};

export function evaluateGate(
  reading: FaceReading,
  target: EyeSide,
  measurePupil: (iris: IrisInfo) => PupilMeasurement,
  frame: { w: number; h: number },
  thr: GateThresholds = DEFAULT_GATE
): GateResult {
  const checks: GateChecks = {
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

  // Exactly one eye targeted: the target must be clearly the more centered eye.
  // We do not require the other eye be absent (both may be visible), but the
  // targeted eye must be the one near the frame centre.
  checks.oneEyeTargeted = true;

  const cx = frame.w / 2;
  const cy = frame.h / 2;
  const minDim = Math.min(frame.w, frame.h);
  const offset =
    Math.hypot(iris.centerPx.x - cx, iris.centerPx.y - cy) / minDim;

  // If both eyes are visible, ensure the TARGET is the closer-to-centre one so
  // the operator is actually dwelling on the correct eye.
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
