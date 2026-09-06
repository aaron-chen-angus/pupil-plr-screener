/**
 * Pupil segmentation within the iris ROI.
 *
 * FaceMesh localises the IRIS, not the pupil. The pupil is (usually) the
 * darkest region near the iris centre. Real phone captures put a bright
 * corneal glint (specular reflection of the light source) right on top of the
 * pupil, which visually SPLITS the dark pupil into pieces. Naively removing
 * bright pixels therefore punches a hole in the pupil and shrinks the measured
 * blob below the size sanity-check.
 *
 * To be robust we:
 *   1. Build a "dark" mask, then morphologically CLOSE it so glint pixels that
 *      are enclosed by / adjacent to dark pupil pixels are absorbed back in.
 *   2. Flood-fill the closed mask to find the dark blob nearest the iris centre.
 *   3. Estimate diameter primarily from the blob's bounding box (which still
 *      spans the full pupil even if the interior had a glint), cross-checked
 *      against equivalent-area diameter.
 *
 * The iris diameter (~11.7 mm) converts pixels to millimetres.
 */

const roiCanvas = document.createElement("canvas");
const roiCtx = roiCanvas.getContext("2d", { willReadFrequently: true });

export function measurePupil(video, iris) {
  const { roi, centerPx, diameterPx: irisPx } = iris;

  const scale = 96 / Math.max(1, roi.w);
  const rw = Math.max(8, Math.round(roi.w * scale));
  const rh = Math.max(8, Math.round(roi.h * scale));
  roiCanvas.width = rw;
  roiCanvas.height = rh;

  try {
    roiCtx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, rw, rh);
  } catch {
    return { diameterPx: NaN, focus: 0, ok: false, glintFraction: 0 };
  }

  const img = roiCtx.getImageData(0, 0, rw, rh);
  const data = img.data;
  const n = rw * rh;

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
    if (y > 235) saturated++;
  }
  const glintFraction = saturated / n;

  const focus = focusScore(lum, rw, rh);
  const thr = darkThreshold(min, max);
  const glintThr = Math.max(200, min + (max - min) * 0.75);

  // --- build dark + glint masks ---
  // dark[i] = 1 for pupil-candidate dark pixels; glint[i] = 1 for very bright
  // specular pixels (candidate to be absorbed into the pupil during closing).
  const dark = new Uint8Array(n);
  const glint = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (lum[i] <= thr) dark[i] = 1;
    else if (lum[i] >= glintThr) glint[i] = 1;
  }

  // --- morphological close: absorb glint pixels that are near dark pixels ---
  // A glint pixel becomes "dark" if it has a dark neighbour within a small
  // radius. Repeating a couple of times bridges the specular blob on the pupil.
  const closeRadius = 2;
  for (let pass = 0; pass < closeRadius; pass++) {
    let changed = false;
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const i = y * rw + x;
        if (dark[i] || !glint[i]) continue;
        // 8-neighbour check for an adjacent dark pixel.
        let touch = false;
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
            if (dark[ny * rw + nx]) {
              touch = true;
              break;
            }
          }
        }
        if (touch) {
          dark[i] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const cxLocal = (centerPx.x - roi.x) * scale;
  const cyLocal = (centerPx.y - roi.y) * scale;
  const irisRadiusLocal = (irisPx * scale) / 2;

  // --- connected-component search over the closed dark mask ---
  const label = new Int32Array(n).fill(-1);
  let bestArea = 0;
  let best = { count: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let bestDist = Infinity;
  const stack = [];

  for (let start = 0; start < n; start++) {
    if (label[start] !== -1) continue;
    if (!dark[start]) {
      label[start] = 0;
      continue;
    }
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
      const p = stack.pop();
      const px = p % rw;
      const py = (p / rw) | 0;
      count++;
      sumX += px;
      sumY += py;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      const neigh = [
        px > 0 ? p - 1 : -1,
        px < rw - 1 ? p + 1 : -1,
        py > 0 ? p - rw : -1,
        py < rh - 1 ? p + rw : -1,
      ];
      for (const q of neigh) {
        if (q < 0) continue;
        if (label[q] !== -1) continue;
        if (!dark[q]) {
          label[q] = 0;
          continue;
        }
        label[q] = 1;
        stack.push(q);
      }
    }

    const bcx = sumX / count;
    const bcy = sumY / count;
    const distToCenter = Math.hypot(bcx - cxLocal, bcy - cyLocal);
    // Blob centroid must be inside the iris and a plausible pupil size.
    if (distToCenter > irisRadiusLocal * 1.2) continue;
    if (count < 4) continue;

    if (
      distToCenter < bestDist - 0.5 ||
      (Math.abs(distToCenter - bestDist) <= 0.5 && count > bestArea)
    ) {
      bestDist = distToCenter;
      bestArea = count;
      best = { count, minX, maxX, minY, maxY };
    }
  }

  if (best.count < 4) {
    return { diameterPx: NaN, focus, ok: false, glintFraction };
  }

  // Diameter: bounding box captures the full pupil extent (robust to an
  // interior glint hole); area diameter is a lower-bound cross-check.
  const bboxW = best.maxX - best.minX + 1;
  const bboxH = best.maxY - best.minY + 1;
  const bboxDia = (bboxW + bboxH) / 2;
  const areaDia = 2 * Math.sqrt(best.count / Math.PI);
  // Trust the bounding box more, since glint holes deflate the area.
  const diaLocal = 0.7 * bboxDia + 0.3 * areaDia;

  const diameterPx = diaLocal / scale;

  // Relaxed size sanity: a real pupil is roughly 8%..98% of the iris width.
  // (In bright light the pupil can be quite small; the iris-width scale can
  // also be a little off when the eye is slightly off-axis.)
  const ratio = diameterPx / irisPx;
  const ok = ratio > 0.08 && ratio < 0.98 && isFinite(diameterPx);

  return { diameterPx, focus, ok, glintFraction, ratio };
}

function darkThreshold(min, max) {
  const range = max - min;
  if (range < 10) return min + 5;
  // Bias toward the darker end; the pupil is the darkest structure present.
  return min + range * 0.38;
}

/**
 * Tenengrad focus measure normalized to ~0..1.
 *
 * The normalization constant was recalibrated for real phone eye ROIs: a
 * comfortably in-focus close-up produces far less average gradient energy than
 * the old /1500 assumed, which made every real frame read as "out of focus".
 */
function focusScore(lum, w, h) {
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
  // Soft knee: ~120 mean gradient-energy maps to ~1.0.
  return Math.max(0, Math.min(1, mean / 120));
}
