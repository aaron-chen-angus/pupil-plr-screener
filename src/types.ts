// Shared types for the PLR screener.
// This is a screening / education tool, NOT a diagnostic device.

export type EyeSide = "left" | "right";

/** A single per-frame pupil sample during a measurement window. */
export interface PupilSample {
  /** Milliseconds relative to LED onset (negative = baseline / pre-flash). */
  tMs: number;
  /** Pupil diameter in millimetres (via iris scale). NaN if not measurable this frame. */
  diameterMm: number;
  /** Iris horizontal diameter in pixels used for scaling this frame. */
  irisPx: number;
  /** True if this frame was rejected (blink / no measurement). */
  dropped: boolean;
  /** Focus/sharpness confidence 0..1 for the eye ROI this frame. */
  focus: number;
}

/** Metrics computed for one eye from its measurement window. */
export interface EyeMetrics {
  side: EyeSide;
  /** Baseline (pre-flash) pupil diameter, mm. */
  baselineMm: number | null;
  /** Minimum diameter after stimulus, mm. */
  minMm: number | null;
  /** Percent constriction: (baseline - min) / baseline * 100. */
  percentConstriction: number | null;
  /** Latency from LED onset to constriction start, ms. */
  latencyMs: number | null;
  /** Mean constriction velocity, mm/s (during constriction phase). */
  meanVelocity: number | null;
  /** Max constriction velocity, mm/s. */
  maxVelocity: number | null;
  /** Raw samples for plotting / redilation trace. */
  samples: PupilSample[];
  /** Frames dropped in this window. */
  framesDropped: number;
  /** Number of blink-triggered retests before a clean window was captured. */
  retests: number;
  /** Median focus confidence over measured frames. */
  focusConfidence: number;
  /** Whether this eye's window is considered reliable. */
  reliable: boolean;
  /** Human-readable reasons a window was flagged unreliable. */
  reliabilityNotes: string[];
}

export interface AsymmetryResult {
  /** Absolute difference in % constriction between eyes (percentage points). */
  constrictionDeltaPct: number | null;
  /** Absolute difference in mean constriction velocity (mm/s). */
  velocityDelta: number | null;
  /** Composite unitless asymmetry score. */
  score: number | null;
  /** The unvalidated threshold used for the neutral indicator. */
  threshold: number;
  /** Neutral indicator. */
  indicator: "symmetric" | "asymmetric" | "insufficient";
}

export interface SessionQuality {
  exposureLocked: boolean;
  whiteBalanceLocked: boolean;
  focusLocked: boolean;
  torchControlled: boolean;
  /** Total frames dropped across the session. */
  framesDropped: number;
  /** Total blink-triggered retests across the session. */
  blinksRetested: number;
  /** Overall focus confidence 0..1. */
  focusConfidence: number;
  /** True if the run is considered too low-quality to be reported as valid. */
  unreliable: boolean;
  notes: string[];
}

export interface SessionConfig {
  /** Order of eyes to test. */
  order: EyeSide[];
  /** Repeats per eye. */
  repeats: number;
  /** Baseline dark capture before LED, ms. */
  baselineMs: number;
  /** LED-on stimulus duration, ms. */
  stimulusMs: number;
  /** Redilation capture after LED off, ms. */
  redilationMs: number;
  /** Unvalidated asymmetry threshold for the composite score. */
  asymmetryThreshold: number;
  /** Voice guidance enabled. */
  voice: boolean;
  /** Demo mode: torch not controlled, results are illustrative only. */
  demoMode: boolean;
}

export interface SessionResult {
  createdAt: string;
  appVersion: string;
  config: SessionConfig;
  device: {
    userAgent: string;
    torchSupported: boolean;
    secureContext: boolean;
  };
  eyes: Record<EyeSide, EyeMetrics | null>;
  asymmetry: AsymmetryResult;
  quality: SessionQuality;
  /** True when torch was actually fired during measurement. */
  stimulusDelivered: boolean;
}

export interface Capabilities {
  secureContext: boolean;
  hasGetUserMedia: boolean;
  torchSupported: boolean;
  speechSupported: boolean;
  /** True when everything required for a controlled-stimulus test is present. */
  canRunControlledTest: boolean;
  reason: string;
}
