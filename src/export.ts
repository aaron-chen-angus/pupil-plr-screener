import type { SessionResult } from "./types";

/** Trigger a client-side download of a text blob. */
function download(filename: string, mime: string, content: string): void {
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

export function exportJSON(result: SessionResult): void {
  const stamp = result.createdAt.replace(/[:.]/g, "-");
  download(
    `plr-session-${stamp}.json`,
    "application/json",
    JSON.stringify(result, null, 2)
  );
}

/**
 * CSV export: one section of per-eye summary metrics, then the raw per-frame
 * samples for both eyes. Kept flat so it opens cleanly in a spreadsheet.
 */
export function exportCSV(result: SessionResult): void {
  const rows: string[] = [];
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

  // Subject/demographic block. One field per row keeps it spreadsheet-friendly.
  const subj = result.subject;
  rows.push("section,field,value");
  rows.push(`subject,name,${csv(subj.name)}`);
  rows.push(
    `subject,age,${subj.age === null || subj.age === undefined ? "" : subj.age}`
  );
  rows.push(`subject,gender,${csv(subj.gender)}`);
  rows.push(`subject,testTakenAt,${csv(subj.testTakenAt)}`);
  rows.push("");
  rows.push("section,eye,metric,value,unit");

  for (const side of ["left", "right"] as const) {
    const m = result.eyes[side];
    if (!m) {
      rows.push(`summary,${side},status,no_data,`);
      continue;
    }
    rows.push(`summary,${side},baseline,${fmt(m.baselineMm)},mm`);
    rows.push(`summary,${side},min,${fmt(m.minMm)},mm`);
    rows.push(
      `summary,${side},percentConstriction,${fmt(m.percentConstriction)},%`
    );
    rows.push(`summary,${side},latency,${fmt(m.latencyMs)},ms`);
    rows.push(`summary,${side},meanVelocity,${fmt(m.meanVelocity)},mm/s`);
    rows.push(`summary,${side},maxVelocity,${fmt(m.maxVelocity)},mm/s`);
    rows.push(`summary,${side},framesDropped,${m.framesDropped},count`);
    rows.push(`summary,${side},retests,${m.retests},count`);
    rows.push(
      `summary,${side},focusConfidence,${fmt(m.focusConfidence)},0..1`
    );
    rows.push(`summary,${side},reliable,${m.reliable},bool`);
  }

  rows.push("");
  rows.push("section,eye,tMs,diameterMm,irisPx,focus,dropped");
  for (const side of ["left", "right"] as const) {
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

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "";
  return (Math.round(v * 1000) / 1000).toString();
}

// Escape a free-text value for a CSV cell: wrap in quotes and double any inner
// quotes when it contains a comma, quote, or newline. Empty for null/undefined.
function csv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
