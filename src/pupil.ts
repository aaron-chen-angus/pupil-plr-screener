import type { IrisInfo } from "./facemesh";

/**
 * Pupil segmentation within the iris ROI.
 *
 * FaceMesh localises the IRIS, not the pupil. Under the controlled LED
 * illumination the pupil is the darkest connected region near the iris centre.
 * We threshold the ROI, reject the bright corneal glint (specular blob), keep
 * the dark blob closest to the iris centre, and fit an ellipse to estimate the
 * pupil's horizontal diameter. The iris diameter (known ~11.7 mm) converts
 * pixels to millimetres.
 */

export interface PupilMeasurement {
  /** Pupil diameter in pixels (major-ish axis, robustified). */
  diameterPx: number;
  /** Focus/sharpness confidence 0..1 for the ROI. */
  focus: number;
  /** True if a plausible pupil was found. */
  ok: boolean;
  /** Fraction of ROI that was saturated/glint (diagnostic). */
  glintFraction: number;
}

/** Reusable offscreen canvas for ROI sampling. */
const roiCanvas = document.createElement("canvas");
const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true })!;

export function measurePupil(
  video: HTMLVideoElement,
  iris: IrisInfo
): PupilMeasurement {
  const { roi, centerPx, diameterPx: irisPx } = iris;

  // Sample the ROI at a fixed working resolution for stable thresholds.
  const scale = 96 / Math.max(1, roi.w);
  const rw = Math.max(8, Math.round(roi.w * scale));
  const rh = Math.max(8, Math.round(roi.h * scale));
  roiCanvas.width = rw;
  roiCanvas.height = rh;

  try {
    roiCtx.drawImage(
      video,
      roi.x,
      roi.y,
      roi.w,
      roi.h,
      0,
      0,
      rw,
      rh
    );
  } catch {
    return { diameterPx: NaN, focus: 0, ok: false, glintFraction: 0 };
  }

  const img = roiCtx.getImageData(0, 0, rw, rh);
  const data = img.data;
  const n = rw * rh;

  // Luminance buffer.
  const lum = new Float32Array(n);
  let min = 255;
  let max = 0;
  let saturated = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;
    if (y < min) min = y;
    if (y > max) max = y;
    if (y > 240) saturated++;
  }
  const glintFraction = saturated / n;

  // Focus confidence via normalized gradient energy (Tenengrad-like).
  const focus = focusScore(lum, rw, rh);

  // Adaptive dark threshold: pupil is the darkest cluster. Use a low percentile.
  const thr = darkThreshold(lum, min, max);

  // Iris centre in ROI-local scaled coordinates.
  const cxLocal = (centerPx.x - roi.x) * scale;
  const cyLocal = (centerPx.y - roi.y) * scale;

  // Connected-component search for the dark blob nearest the iris centre,
  // excluding glint pixels (very bright) and tiny specks.
  const label = new Int32Array(n).fill(-1);
  let bestArea = 0;
  let best = { cx: 0, cy: 0, count: 0, sumX: 0, sumY: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let bestDist = Infinity;

  const stack: number[] = [];
  const irisRadiusLocal = (irisPx * scale) / 2;

  for (let start = 0; start < n; start++) {
    if (label[start] !== -1) continue;
    if (lum[start] > thr) {
      label[start] = 0;
      continue;
    }
    // BFS/DFS flood fill of dark region.
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = rw,
      maxX = 0,
      minY = rh,
      maxY = 0;
    stack.length = 0;
    stack.push(start);
    label[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % rw;
      const py = (p / rw) | 0;
      count++;
      sumX += px;
      sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      // 4-neighbours.
      const neigh = [
        px > 0 ? p - 1 : -1,
        px < rw - 1 ? p + 1 : -1,
        py > 0 ? p - rw : -1,
        py < rh - 1 ? p + rw : -1,
      ];
      for (const q of neigh) {
        if (q < 0) continue;
        if (label[q] !== -1) continue;
        if (lum[q] > thr) {
          label[q] = 0;
          continue;
        }
        label[q] = 1;
        stack.push(q);
      }
    }

    const bcx = sumX / count;
    const bcy = sumY / count;
    // Must be reasonably inside the iris and a plausible size.
    const distToCenter = Math.hypot(bcx - cxLocal, bcy - cyLocal);
    if (distToCenter > irisRadiusLocal * 1.1) continue;
    if (count < 6) continue;

    // Prefer the blob closest to the iris centre; break ties by area.
    if (
      distToCenter < bestDist - 0.5 ||
      (Math.abs(distToCenter - bestDist) <= 0.5 && count > bestArea)
    ) {
      bestDist = distToCenter;
      bestArea = count;
      best = { cx: bcx, cy: bcy, count, sumX, sumY, minX, maxX, minY, maxY };
    }
  }

  if (best.count < 6) {
    return { diameterPx: NaN, focus, ok: false, glintFraction };
  }

  // Estimate diameter two ways and combine:
  //  (a) equivalent-area circle diameter (robust to glint holes)
  //  (b) bounding-box mean side (captures elongation)
  const areaDia = 2 * Math.sqrt(best.count / Math.PI);
  const bboxDia = ((best.maxX - best.minX + 1) + (best.maxY - best.minY + 1)) / 2;
  const diaLocal = 0.5 * areaDia + 0.5 * bboxDia;

  // Convert back to full-image pixels.
  const diameterPx = diaLocal / scale;

  // Sanity: pupil should be smaller than the iris and not vanishingly small.
  const ok = diameterPx > 0.15 * irisPx && diameterPx < 0.95 * irisPx;

  return { diameterPx, focus, ok, glintFraction };
}

/** Low-percentile dark threshold, guarded against low-contrast ROIs. */
function darkThreshold(lum: Float32Array, min: number, max: number): number {
  const range = max - min;
  if (range < 12) return min + 6; // very low contrast; be conservative
  // Otsu-lite: threshold at min + fraction of range, biased dark.
  return min + range * 0.32;
}

/** Tenengrad focus measure normalized to ~0..1. */
function focusScore(lum: Float32Array, w: number, h: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i + 1] - lum[i - 1];
      const gy = lum[i + w] - lum[i - w];
      sum += gx * gx + gy * gy;
      count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  // Map gradient energy to 0..1 with a soft knee. Empirical scale.
  return Math.max(0, Math.min(1, mean / 1500));
}
