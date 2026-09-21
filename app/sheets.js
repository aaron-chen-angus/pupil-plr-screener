// Optional Google Sheets integration (build-free variant).
//
// This posts a single completed session to a Google Apps Script Web App, which
// appends it as one row in a Google Sheet. It is entirely optional: if
// SHEETS_WEBAPP_URL is empty the results screen hides the button and the app
// stays fully offline.
//
// Design notes / why it works from a static GitHub Pages site:
//   - We POST with Content-Type "text/plain". This is a CORS "simple request",
//     so the browser does NOT send a preflight OPTIONS call — Apps Script Web
//     Apps do not handle OPTIONS, so avoiding the preflight is what makes this
//     work without a proxy or extra server.
//   - The body is JSON text; the Apps Script parses it with JSON.parse.
//   - Nothing here changes the measurement or the on-device record; it only
//     transmits the finished session when the operator taps the button.

/**
 * Flatten a SessionResult into a single flat object — one key per column. This
 * is the exact shape the Apps Script writes as a row, and it matches the header
 * order documented in the README.
 */
export function buildSheetRow(result) {
  const subj = result.subject ?? {};
  const l = result.eyes?.left ?? null;
  const r = result.eyes?.right ?? null;
  const a = result.asymmetry ?? {};

  const round = (v) =>
    v === null || v === undefined || !isFinite(v)
      ? ""
      : Math.round(v * 1000) / 1000;

  return {
    // Subject / demographics
    name: subj.name ?? "",
    age: subj.age === null || subj.age === undefined ? "" : subj.age,
    gender: subj.gender ?? "",
    testTakenAt: subj.testTakenAt ?? "",
    // Session meta
    createdAt: result.createdAt ?? "",
    appVersion: result.appVersion ?? "",
    stimulusDelivered: !!result.stimulusDelivered,
    indicator: a.indicator ?? "",
    asymmetryScore: round(a.score),
    asymmetryThreshold: a.threshold ?? "",
    unreliable: !!result.quality?.unreliable,
    // Right eye
    right_baselineMm: round(r?.baselineMm),
    right_minMm: round(r?.minMm),
    right_percentConstriction: round(r?.percentConstriction),
    right_latencyMs: round(r?.latencyMs),
    right_meanVelocity: round(r?.meanVelocity),
    right_maxVelocity: round(r?.maxVelocity),
    right_reliable: r ? !!r.reliable : "",
    // Left eye
    left_baselineMm: round(l?.baselineMm),
    left_minMm: round(l?.minMm),
    left_percentConstriction: round(l?.percentConstriction),
    left_latencyMs: round(l?.latencyMs),
    left_meanVelocity: round(l?.meanVelocity),
    left_maxVelocity: round(l?.maxVelocity),
    left_reliable: l ? !!l.reliable : "",
  };
}

/**
 * POST one completed session to the configured Apps Script Web App.
 *
 * Because the request uses no-cors, the browser cannot read the response body
 * or status, so this resolves as long as the network request itself was sent.
 * Success is confirmed by checking the Google Sheet. Throws on an empty URL or
 * a network-level failure.
 */
export async function sendToSheets(url, result) {
  if (!url) throw new Error("No Google Sheets Web App URL configured.");
  const row = buildSheetRow(result);
  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(row),
  });
  // no-cors gives an opaque response we cannot inspect; assume sent.
  return true;
}
