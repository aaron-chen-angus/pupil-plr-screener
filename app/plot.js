const LEFT_COLOR = "#3fb6ff";
const RIGHT_COLOR = "#ffb84a";

export const PLOT_COLORS = { left: LEFT_COLOR, right: RIGHT_COLOR };

/**
 * Draw pupil-diameter-vs-time traces for both eyes on a canvas.
 * x-axis: ms relative to LED onset (0 = onset). y-axis: diameter mm.
 */
export function drawPlot(canvas, left, right) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = canvas.clientHeight || 220;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const plotW = cssW - pad.l - pad.r;
  const plotH = cssH - pad.t - pad.b;

  const series = [
    { m: left, color: LEFT_COLOR },
    { m: right, color: RIGHT_COLOR },
  ].filter((s) => s.m && s.m.samples.length);

  let tMin = Infinity;
  let tMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const { m } of series) {
    for (const s of m.samples) {
      if (s.dropped || !isFinite(s.diameterMm)) continue;
      tMin = Math.min(tMin, s.tMs);
      tMax = Math.max(tMax, s.tMs);
      dMin = Math.min(dMin, s.diameterMm);
      dMax = Math.max(dMax, s.diameterMm);
    }
  }

  if (!isFinite(tMin) || !isFinite(dMin)) {
    ctx.fillStyle = "#93a1b1";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("No plottable data", cssW / 2, cssH / 2);
    return;
  }

  const dRange = Math.max(0.5, dMax - dMin);
  dMin = Math.max(0, dMin - dRange * 0.15);
  dMax = dMax + dRange * 0.15;
  if (tMax === tMin) tMax = tMin + 1;

  const xOf = (t) => pad.l + ((t - tMin) / (tMax - tMin)) * plotW;
  const yOf = (d) => pad.t + (1 - (d - dMin) / (dMax - dMin)) * plotH;

  ctx.strokeStyle = "#26313d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + plotH);
  ctx.lineTo(pad.l + plotW, pad.t + plotH);
  ctx.stroke();

  ctx.fillStyle = "#93a1b1";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  const yticks = 4;
  for (let i = 0; i <= yticks; i++) {
    const d = dMin + ((dMax - dMin) * i) / yticks;
    const y = yOf(d);
    ctx.fillText(d.toFixed(1), pad.l - 5, y + 3);
    ctx.strokeStyle = "#1b242e";
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
  }

  if (tMin <= 0 && tMax >= 0) {
    const x0 = xOf(0);
    ctx.strokeStyle = "#ffd54a";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, pad.t);
    ctx.lineTo(x0, pad.t + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffd54a";
    ctx.textAlign = "left";
    ctx.fillText("LED on", x0 + 3, pad.t + 10);
  }

  ctx.fillStyle = "#93a1b1";
  ctx.textAlign = "center";
  const xticks = 4;
  for (let i = 0; i <= xticks; i++) {
    const t = tMin + ((tMax - tMin) * i) / xticks;
    ctx.fillText(`${Math.round(t)}`, xOf(t), pad.t + plotH + 16);
  }
  ctx.fillText("ms from LED onset", pad.l + plotW / 2, pad.t + plotH + 26);

  for (const { m, color } of series) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    const pts = m.samples
      .filter((s) => !s.dropped && isFinite(s.diameterMm))
      .sort((a, b) => a.tMs - b.tMs);
    for (const s of pts) {
      const x = xOf(s.tMs);
      const y = yOf(s.diameterMm);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
}
