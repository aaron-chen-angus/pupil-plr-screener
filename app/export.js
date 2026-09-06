function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJSON(result) {
  const stamp = result.createdAt.replace(/[:.]/g, "-");
  download(
    `plr-session-${stamp}.json`,
    "application/json",
    JSON.stringify(result, null, 2)
  );
}

export function exportCSV(result) {
  const rows = [];
  rows.push("# PLR Screener session — NOT a medical diagnosis");
  rows.push(`# created,${result.createdAt}`);
  rows.push(`# stimulusDelivered,${result.stimulusDelivered}`);
  rows.push(`# indicator,${result.asymmetry.indicator}`);
  rows.push(
    `# unvalidatedThreshold,${result.asymmetry.threshold},score,${fmt(
      result.asymmetry.score
    )}`
  );
  rows.push("");
  rows.push("section,eye,metric,value,unit");

  for (const side of ["left", "right"]) {
    const m = result.eyes[side];
    if (!m) {
      rows.push(`summary,${side},status,no_data,`);
      continue;
    }
    rows.push(`summary,${side},baseline,${fmt(m.baselineMm)},mm`);
    rows.push(`summary,${side},min,${fmt(m.minMm)},mm`);
    rows.push(`summary,${side},percentConstriction,${fmt(m.percentConstriction)},%`);
    rows.push(`summary,${side},latency,${fmt(m.latencyMs)},ms`);
    rows.push(`summary,${side},meanVelocity,${fmt(m.meanVelocity)},mm/s`);
    rows.push(`summary,${side},maxVelocity,${fmt(m.maxVelocity)},mm/s`);
    rows.push(`summary,${side},framesDropped,${m.framesDropped},count`);
    rows.push(`summary,${side},retests,${m.retests},count`);
    rows.push(`summary,${side},focusConfidence,${fmt(m.focusConfidence)},0..1`);
    rows.push(`summary,${side},reliable,${m.reliable},bool`);
  }

  rows.push("");
  rows.push("section,eye,tMs,diameterMm,irisPx,focus,dropped");
  for (const side of ["left", "right"]) {
    const m = result.eyes[side];
    if (!m) continue;
    for (const s of m.samples) {
      rows.push(
        `samples,${side},${fmt(s.tMs)},${fmt(s.diameterMm)},${fmt(
          s.irisPx
        )},${fmt(s.focus)},${s.dropped}`
      );
    }
  }

  const stamp = result.createdAt.replace(/[:.]/g, "-");
  download(`plr-session-${stamp}.csv`, "text/csv", rows.join("\n"));
}

function fmt(v) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  return (Math.round(v * 1000) / 1000).toString();
}
