/**
 * Compute per-eye PLR metrics from a window of pupil samples.
 * tMs is relative to LED onset (negative = baseline / pre-flash).
 *
 * These are OBJECTIVE MEASURED VALUES ONLY. No diagnosis or clinical grading is
 * derived here — the asymmetry indicator is a neutral, unvalidated screening
 * signal.
 */
export function computeEyeMetrics(side, samples, framesDropped, retests) {
  const notes = [];
  const valid = samples.filter((s) => !s.dropped && isFinite(s.diameterMm));

  const smoothed = smoothSamples(valid);

  const baselineSamples = smoothed.filter((s) => s.tMs < 0);
  const stimSamples = smoothed.filter((s) => s.tMs >= 0);

  const baselineMm = baselineSamples.length
    ? median(baselineSamples.map((s) => s.diameterMm))
    : null;

  let minMm = null;
  let minAt = 0;
  for (const s of stimSamples) {
    if (minMm === null || s.diameterMm < minMm) {
      minMm = s.diameterMm;
      minAt = s.tMs;
    }
  }

  const percentConstriction =
    baselineMm && minMm !== null && baselineMm > 0
      ? ((baselineMm - minMm) / baselineMm) * 100
      : null;

  let latencyMs = null;
  if (baselineMm !== null) {
    const delta = Math.max(0.15, baselineMm * 0.05);
    for (const s of stimSamples) {
      if (s.tMs >= 0 && s.diameterMm <= baselineMm - delta) {
        latencyMs = s.tMs;
        break;
      }
    }
  }

  const constrictionPhase = smoothed.filter(
    (s) => s.tMs >= 0 && s.tMs <= minAt
  );
  const velocities = [];
  for (let i = 1; i < constrictionPhase.length; i++) {
    const a = constrictionPhase[i - 1];
    const b = constrictionPhase[i];
    const dt = (b.tMs - a.tMs) / 1000;
    if (dt > 0) {
      const v = (a.diameterMm - b.diameterMm) / dt;
      if (isFinite(v) && v > 0) velocities.push(v);
    }
  }
  const meanVelocity = velocities.length ? mean(velocities) : null;
  const maxVelocity = velocities.length ? Math.max(...velocities) : null;

  const focusConfidence = valid.length
    ? median(valid.map((s) => s.focus))
    : 0;

  let reliable = true;
  if (baselineMm === null) {
    reliable = false;
    notes.push("No usable baseline (pre-flash) measurement.");
  }
  if (minMm === null) {
    reliable = false;
    notes.push("No usable post-stimulus measurement.");
  }
  if (valid.length < 8) {
    reliable = false;
    notes.push("Too few measurable frames.");
  }
  if (focusConfidence < 0.25) {
    reliable = false;
    notes.push("Low focus confidence.");
  }
  if (framesDropped > valid.length) {
    reliable = false;
    notes.push("More frames dropped than measured.");
  }

  return {
    side,
    baselineMm,
    minMm,
    percentConstriction,
    latencyMs,
    meanVelocity,
    maxVelocity,
    samples,
    framesDropped,
    retests,
    focusConfidence,
    reliable,
    reliabilityNotes: notes,
  };
}

/**
 * Interocular asymmetry. Composite score combines normalized differences in
 * % constriction and mean velocity. The threshold is UNVALIDATED and adjustable
 * — it is not a clinical cutoff and does not imply one exists.
 */
export function computeAsymmetry(left, right, config) {
  const threshold = config.asymmetryThreshold;

  const bothReliable = !!(
    left?.reliable &&
    right?.reliable &&
    left.percentConstriction !== null &&
    right.percentConstriction !== null
  );

  if (
    !left ||
    !right ||
    left.percentConstriction === null ||
    right.percentConstriction === null
  ) {
    return {
      constrictionDeltaPct: null,
      velocityDelta: null,
      score: null,
      threshold,
      indicator: "insufficient",
    };
  }

  const constrictionDeltaPct = Math.abs(
    left.percentConstriction - right.percentConstriction
  );

  const velocityDelta =
    left.meanVelocity !== null && right.meanVelocity !== null
      ? Math.abs(left.meanVelocity - right.meanVelocity)
      : null;

  const velTerm = velocityDelta !== null ? velocityDelta * 10 : 0;
  const score = constrictionDeltaPct + velTerm;

  let indicator;
  if (!bothReliable) {
    indicator = "insufficient";
  } else {
    indicator = score >= threshold ? "asymmetric" : "symmetric";
  }

  return { constrictionDeltaPct, velocityDelta, score, threshold, indicator };
}

function smoothSamples(samples) {
  if (samples.length < 3) return samples.slice();
  const sorted = samples.slice().sort((a, b) => a.tMs - b.tMs);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const win = sorted.slice(Math.max(0, i - 1), Math.min(sorted.length, i + 2));
    const d = median(win.map((s) => s.diameterMm));
    out.push({ ...sorted[i], diameterMm: d });
  }
  return out;
}

function median(xs) {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
