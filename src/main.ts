import "./styles.css";
import { detectCapabilities } from "./capabilities";
import { CameraController, type CameraOpenResult } from "./camera";
import { FaceMeshTracker } from "./facemesh";
import { ProtocolEngine, type ProtocolState } from "./protocol";
import { Voice } from "./voice";
import { computeAsymmetry } from "./metrics";
import { drawPlot, PLOT_COLORS } from "./plot";
import { exportCSV, exportJSON } from "./export";
import { el, disclaimerBanner } from "./ui";
import { APP_VERSION } from "./config";
import type {
  EyeMetrics,
  EyeSide,
  SessionConfig,
  SessionQuality,
  SessionResult,
} from "./types";

const app = document.getElementById("app")!;

const caps = detectCapabilities();

const config: SessionConfig = {
  order: ["right", "left"],
  repeats: 1,
  baselineMs: 1000,
  stimulusMs: 2500,
  redilationMs: 2000,
  asymmetryThreshold: 20, // conservative, UNVALIDATED default
  voice: caps.speechSupported,
  demoMode: false,
};

// --- runtime state ---
let camera: CameraController | null = null;
let tracker: FaceMeshTracker | null = null;
let engine: ProtocolEngine | null = null;
let voice: Voice | null = null;
let openResult: CameraOpenResult | null = null;
const eyeResults: Record<EyeSide, EyeMetrics | null> = {
  left: null,
  right: null,
};

// ---------- Brand header ----------
function brand(): HTMLElement {
  return el("div", { class: "brand" }, [
    el("div", { class: "dot" }),
    el("div", {}, [
      el("div", { class: "title" }, ["PLR Screener"]),
      el("div", { class: "sub" }, [
        "Screening & teaching demo — not a diagnostic device",
      ]),
    ]),
  ]);
}

// ---------- Screen container ----------
function screen(id: string): HTMLElement {
  const s = el("div", { class: "screen", id: `screen-${id}` });
  return s;
}

function show(id: string): void {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${id}`)?.classList.add("active");
}

// ================= INTRO SCREEN =================
function buildIntro(): HTMLElement {
  const s = screen("intro");
  s.appendChild(brand());
  s.appendChild(disclaimerBanner());

  const capCard = el("div", { class: "card" }, [
    el("h2", {}, ["Device capabilities"]),
    capBadge("Secure context (HTTPS)", caps.secureContext),
    capBadge("Camera (getUserMedia)", caps.hasGetUserMedia),
    capBadge("LED torch control", caps.torchSupported),
    capBadge("Voice guidance", caps.speechSupported),
  ]);
  s.appendChild(capCard);

  const info = el("div", { class: "card" }, [
    el("h2", {}, ["How it works"]),
    el("p", { class: "muted" }, [
      "The operator holds the phone and points the REAR camera and LED at the patient's eyes. Voice guidance says which eye to hold on. The app verifies the eye is centered, open, and in focus, then fires the LED and measures the pupil light reflex for each eye. It reports per-eye values and a neutral symmetric / asymmetric indicator.",
    ]),
  ]);
  s.appendChild(info);

  // Capability-driven start options.
  const actions = el("div", { class: "pad" });

  if (!caps.secureContext || !caps.hasGetUserMedia) {
    actions.appendChild(
      el("div", { class: "card" }, [
        el("p", {}, [caps.reason]),
        el("p", { class: "muted" }, [
          "Open this page over HTTPS on a phone (for example the GitHub Pages URL) to enable the camera.",
        ]),
      ])
    );
  } else if (!caps.torchSupported) {
    // Torch unavailable: offer clearly-labeled demo mode OR block.
    actions.appendChild(
      el("div", { class: "card" }, [
        el("p", {}, [caps.reason]),
        el("p", { class: "muted" }, [
          "Without LED control there is no controlled light stimulus, so a real PLR measurement cannot be performed. You can run a clearly-labeled demo (no stimulus) to see the workflow, or use an Android Chrome device with torch support for a real screening.",
        ]),
      ])
    );
    actions.appendChild(
      el(
        "button",
        {
          class: "btn secondary",
          onclick: () => {
            config.demoMode = true;
            void startCapture();
          },
        },
        ["Start demo mode (no controlled stimulus)"]
      )
    );
  } else {
    actions.appendChild(
      el(
        "button",
        {
          class: "btn primary",
          onclick: () => {
            config.demoMode = false;
            void startCapture();
          },
        },
        ["Start screening"]
      )
    );
  }

  actions.appendChild(
    el(
      "button",
      { class: "btn secondary", onclick: () => show("settings") },
      ["Protocol settings"]
    )
  );

  s.appendChild(actions);
  return s;
}

function capBadge(label: string, ok: boolean): HTMLElement {
  return el("div", { class: "field" }, [
    el("label", {}, [label]),
    el("span", { class: `badge ${ok ? "ok" : "bad"}` }, [
      ok ? "available" : "unavailable",
    ]),
  ]);
}

// ================= SETTINGS SCREEN =================
function buildSettings(): HTMLElement {
  const s = screen("settings");
  s.appendChild(brand());

  const card = el("div", { class: "card" }, [el("h2", {}, ["Protocol"])]);

  // Eye order.
  const orderSel = el("select", {
    onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      config.order = v === "left-first" ? ["left", "right"] : ["right", "left"];
    },
  }) as HTMLSelectElement;
  orderSel.appendChild(el("option", { value: "right-first" }, ["Right, then left"]));
  orderSel.appendChild(el("option", { value: "left-first" }, ["Left, then right"]));
  card.appendChild(field("Eye order", orderSel));

  // Repeats.
  const repeats = numberInput(config.repeats, 1, 5, (v) => (config.repeats = v));
  card.appendChild(field("Repeats per eye", repeats));

  // Timings.
  card.appendChild(
    field(
      "Baseline dark (ms)",
      numberInput(config.baselineMs, 300, 3000, (v) => (config.baselineMs = v))
    )
  );
  card.appendChild(
    field(
      "LED on (ms)",
      numberInput(config.stimulusMs, 1000, 4000, (v) => (config.stimulusMs = v))
    )
  );
  card.appendChild(
    field(
      "Redilation (ms)",
      numberInput(config.redilationMs, 500, 5000, (v) => (config.redilationMs = v))
    )
  );

  // Voice.
  const voiceChk = el("input", {
    type: "checkbox",
    ...(config.voice ? { checked: "checked" } : {}),
    onchange: (e: Event) => (config.voice = (e.target as HTMLInputElement).checked),
  });
  card.appendChild(field("Voice guidance", voiceChk));

  s.appendChild(card);

  // Threshold — clearly labeled unvalidated.
  const thrCard = el("div", { class: "card" }, [
    el("h2", {}, ["Asymmetry threshold"]),
    el("p", { class: "muted" }, [
      "Unvalidated screening threshold. This is NOT a clinically validated cutoff and no such cutoff is implied. Higher = less sensitive. Adjust with care; the default is conservative.",
    ]),
  ]);
  const thrVal = el("span", { class: "badge" }, [String(config.asymmetryThreshold)]);
  const thrRange = el("input", {
    type: "range",
    min: "5",
    max: "60",
    step: "1",
    value: String(config.asymmetryThreshold),
    oninput: (e: Event) => {
      config.asymmetryThreshold = Number((e.target as HTMLInputElement).value);
      thrVal.textContent = String(config.asymmetryThreshold);
    },
  });
  thrCard.appendChild(
    el("div", { class: "field" }, [
      el("label", {}, ["Composite score threshold"]),
      el("div", {}, [thrRange, thrVal]),
    ])
  );
  s.appendChild(thrCard);

  s.appendChild(
    el("div", { class: "pad" }, [
      el("button", { class: "btn primary", onclick: () => show("intro") }, [
        "Done",
      ]),
    ])
  );
  return s;
}

function field(label: string, control: Node): HTMLElement {
  return el("div", { class: "field" }, [el("label", {}, [label]), control as Node]);
}

function numberInput(
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void
): HTMLElement {
  return el("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    onchange: (e: Event) => {
      let v = Number((e.target as HTMLInputElement).value);
      v = Math.max(min, Math.min(max, v));
      (e.target as HTMLInputElement).value = String(v);
      onChange(v);
    },
  });
}

// ================= CAPTURE SCREEN =================
let videoEl: HTMLVideoElement;
let overlayEl: HTMLCanvasElement;
let cueEl: HTMLElement;
let statusEl: HTMLElement;
let readyEl: HTMLElement;
let gateListEl: HTMLElement;
let torchLiveEl: HTMLElement;

function buildCapture(): HTMLElement {
  const s = screen("capture");

  const stage = el("div", { class: "stage" });
  videoEl = el("video", {
    autoplay: "true",
    playsinline: "true",
    muted: "true",
  }) as HTMLVideoElement;
  overlayEl = el("canvas", { class: "overlay" }) as HTMLCanvasElement;
  stage.appendChild(videoEl);
  stage.appendChild(overlayEl);

  torchLiveEl = el("div", { class: "torch-live" }, ["LED off"]);
  stage.appendChild(torchLiveEl);

  const hud = el("div", { class: "hud" });
  cueEl = el("div", { class: "pill cue" }, ["Preparing…"]);
  hud.appendChild(cueEl);
  stage.appendChild(hud);

  gateListEl = el("div", { class: "gate-list" });
  stage.appendChild(gateListEl);

  readyEl = el("div", { class: "ready-indicator" }, [
    el("span", { class: "light" }),
    el("span", {}, ["Not ready"]),
  ]);
  stage.appendChild(readyEl);

  const controls = el("div", { class: "capture-controls" }, [
    el(
      "button",
      { class: "btn secondary", onclick: () => abortCapture() },
      ["Stop"]
    ),
  ]);
  stage.appendChild(controls);

  s.appendChild(stage);

  // Persistent disclaimer on capture screen.
  s.appendChild(disclaimerBanner());
  statusEl = el("div", { class: "status-line" }, [""]);
  s.appendChild(statusEl);

  return s;
}

async function startCapture(): Promise<void> {
  show("capture");
  cueEl.textContent = "Requesting camera…";
  eyeResults.left = null;
  eyeResults.right = null;

  camera = new CameraController();
  voice = new Voice(config.voice);

  try {
    openResult = await camera.open();
  } catch (err) {
    cueEl.textContent = "Camera error";
    statusEl.textContent =
      "Could not access the rear camera: " + (err as Error).message;
    return;
  }

  videoEl.srcObject = openResult.stream;
  await videoEl.play().catch(() => undefined);

  // Re-confirm torch availability on the live track. If it vanished and we're
  // not already in demo mode, do not pretend the LED can fire.
  if (!openResult.torchSupported && !config.demoMode) {
    statusEl.textContent =
      "Torch control unavailable on this stream — switching to labeled demo mode (no controlled stimulus).";
    config.demoMode = true;
  }

  cueEl.textContent = "Loading eye model…";
  tracker = new FaceMeshTracker();
  try {
    await tracker.init();
  } catch (err) {
    cueEl.textContent = "Model error";
    statusEl.textContent =
      "Failed to load the face/iris model: " + (err as Error).message;
    return;
  }

  const modeNote = config.demoMode
    ? "DEMO MODE — no real light stimulus is delivered; values are illustrative only."
    : openResult.exposureLocked
    ? "Exposure locked."
    : "Exposure NOT locked (quality caveat).";
  statusEl.textContent = modeNote;

  engine = new ProtocolEngine(
    camera,
    tracker,
    videoEl,
    voice,
    config,
    {
      onState: renderProtocolState,
      onFrame: drawOverlay,
      onEyeComplete: (side, m) => {
        eyeResults[side] = m;
      },
      onComplete: () => finishSession(),
    }
  );
  engine.start();
}

function renderProtocolState(state: ProtocolState): void {
  cueEl.textContent = state.message;

  // Ready indicator.
  const ready = state.gate?.ready ?? false;
  readyEl.classList.toggle("ready", ready);
  (readyEl.lastChild as HTMLElement).textContent = ready
    ? "Ready — hold steady"
    : "Not ready";

  // Torch live indicator (honest: only shows on when the LED actually fired).
  const on = state.torchOn;
  torchLiveEl.classList.toggle("on", on);
  torchLiveEl.textContent = on ? "LED ON" : "LED off";

  // Gate checklist.
  const c = state.gate?.checks;
  if (c) {
    const items: [string, boolean][] = [
      ["Face", c.faceDetected],
      ["Eye", c.oneEyeTargeted],
      ["Centered", c.centered],
      ["Open", c.open],
      ["Focus", c.inFocus],
      ["Pupil", c.pupilFound],
    ];
    gateListEl.innerHTML = "";
    for (const [label, pass] of items) {
      gateListEl.appendChild(
        el("div", { class: `g ${pass ? "pass" : "fail"}` }, [label])
      );
    }
  }
}

function drawOverlay(f: {
  iris: { centerPx: { x: number; y: number }; diameterPx: number } | null;
  target: EyeSide | null;
}): void {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return;
  if (overlayEl.width !== w || overlayEl.height !== h) {
    overlayEl.width = w;
    overlayEl.height = h;
  }
  const ctx = overlayEl.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  // Center target reticle.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.16, 0, Math.PI * 2);
  ctx.stroke();

  if (f.iris) {
    ctx.strokeStyle = "#3fb6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      f.iris.centerPx.x,
      f.iris.centerPx.y,
      f.iris.diameterPx / 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
}

function abortCapture(): void {
  engine?.stop();
  tracker?.close();
  camera?.stop();
  show("intro");
}

// ================= RESULTS =================
function buildResults(): HTMLElement {
  const s = screen("results");
  s.appendChild(brand());
  s.appendChild(disclaimerBanner());
  s.appendChild(el("div", { id: "results-body" }));
  return s;
}

function finishSession(): void {
  const agg = engine?.getAggregated() ?? { left: null, right: null };
  eyeResults.left = agg.left;
  eyeResults.right = agg.right;

  tracker?.close();
  camera?.stop();

  const quality = buildQuality();
  const asymmetry = computeAsymmetry(
    eyeResults.left,
    eyeResults.right,
    config
  );

  const result: SessionResult = {
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    config: { ...config },
    device: {
      userAgent: navigator.userAgent,
      torchSupported: !!openResult?.torchSupported,
      secureContext: caps.secureContext,
    },
    eyes: { left: eyeResults.left, right: eyeResults.right },
    asymmetry,
    quality,
    stimulusDelivered: !config.demoMode && !!openResult?.torchSupported,
  };

  renderResults(result);
  show("results");
}

function buildQuality(): SessionQuality {
  const l = eyeResults.left;
  const r = eyeResults.right;
  const framesDropped = (l?.framesDropped ?? 0) + (r?.framesDropped ?? 0);
  const blinksRetested = (l?.retests ?? 0) + (r?.retests ?? 0);
  const focusVals = [l?.focusConfidence, r?.focusConfidence].filter(
    (v): v is number => typeof v === "number"
  );
  const focusConfidence = focusVals.length
    ? focusVals.reduce((a, b) => a + b, 0) / focusVals.length
    : 0;

  const notes: string[] = [];
  if (openResult) notes.push(...openResult.notes);
  if (config.demoMode)
    notes.push("Demo mode: no controlled light stimulus delivered.");

  const anyEyeUnreliable =
    (l && !l.reliable) || (r && !r.reliable) || !l || !r;
  const unreliable =
    config.demoMode ||
    !!anyEyeUnreliable ||
    focusConfidence < 0.25 ||
    !openResult?.torchSupported;

  if (!openResult?.exposureLocked)
    notes.push("Exposure not locked during capture.");

  return {
    exposureLocked: !!openResult?.exposureLocked,
    whiteBalanceLocked: !!openResult?.whiteBalanceLocked,
    focusLocked: !!openResult?.focusLocked,
    torchControlled: !!openResult?.torchSupported && !config.demoMode,
    framesDropped,
    blinksRetested,
    focusConfidence,
    unreliable,
    notes,
  };
}

function renderResults(result: SessionResult): void {
  const body = document.getElementById("results-body")!;
  body.innerHTML = "";

  // Neutral indicator (never a diagnosis or condition name).
  const ind = result.asymmetry.indicator;
  const cls =
    result.quality.unreliable || ind === "insufficient"
      ? "invalid"
      : ind === "asymmetric"
      ? "asymmetric"
      : "symmetric";
  const label =
    result.quality.unreliable
      ? "Low-quality run — unreliable"
      : ind === "insufficient"
      ? "Insufficient data"
      : ind === "asymmetric"
      ? "Asymmetric — consider clinical referral"
      : "Symmetric";
  body.appendChild(
    el("div", { class: `indicator ${cls}` }, [
      label,
      el("div", { class: "sub" }, [
        result.quality.unreliable
          ? "This capture did not meet quality criteria and must not be treated as a valid screening result."
          : "Neutral screening indicator only. Not a diagnosis.",
      ]),
    ])
  );

  // Per-eye metric table.
  const table = el("table", {}, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", {}, ["Metric"]),
        el("th", {}, ["Right eye"]),
        el("th", {}, ["Left eye"]),
      ]),
    ]),
  ]);
  const tb = el("tbody");
  const rows: [string, (m: EyeMetrics | null) => string][] = [
    ["Baseline (mm)", (m) => num(m?.baselineMm)],
    ["Min diameter (mm)", (m) => num(m?.minMm)],
    ["% constriction", (m) => num(m?.percentConstriction)],
    ["Latency (ms)", (m) => num(m?.latencyMs, 0)],
    ["Mean velocity (mm/s)", (m) => num(m?.meanVelocity)],
    ["Max velocity (mm/s)", (m) => num(m?.maxVelocity)],
    ["Frames dropped", (m) => (m ? String(m.framesDropped) : "—")],
    ["Retests", (m) => (m ? String(m.retests) : "—")],
    ["Focus conf.", (m) => num(m?.focusConfidence)],
    ["Reliable", (m) => (m ? (m.reliable ? "yes" : "no") : "—")],
  ];
  for (const [label, fn] of rows) {
    tb.appendChild(
      el("tr", {}, [
        el("td", {}, [label]),
        el("td", {}, [fn(result.eyes.right)]),
        el("td", {}, [fn(result.eyes.left)]),
      ])
    );
  }
  table.appendChild(tb);
  body.appendChild(el("div", { class: "card" }, [el("h2", {}, ["Per-eye metrics"]), table]));

  // Asymmetry summary.
  const a = result.asymmetry;
  body.appendChild(
    el("div", { class: "card" }, [
      el("h2", {}, ["Interocular asymmetry"]),
      kv("Δ % constriction (pts)", num(a.constrictionDeltaPct)),
      kv("Δ mean velocity (mm/s)", num(a.velocityDelta)),
      kv("Composite score", num(a.score)),
      kv("Unvalidated threshold", String(a.threshold)),
    ])
  );

  // Plot.
  const plotCard = el("div", { class: "card" }, [
    el("h2", {}, ["Pupil diameter vs time"]),
  ]);
  const plotWrap = el("div", { class: "plot-wrap" });
  const canvas = el("canvas", { class: "plot" }) as HTMLCanvasElement;
  plotWrap.appendChild(canvas);
  plotCard.appendChild(plotWrap);
  plotCard.appendChild(
    el("div", { class: "legend" }, [
      el("span", {}, [
        el("span", { class: "sw", style: `background:${PLOT_COLORS.right}` }),
        "Right eye",
      ]),
      el("span", {}, [
        el("span", { class: "sw", style: `background:${PLOT_COLORS.left}` }),
        "Left eye",
      ]),
    ])
  );
  body.appendChild(plotCard);
  // Draw after layout.
  requestAnimationFrame(() =>
    drawPlot(canvas, result.eyes.left, result.eyes.right)
  );

  // Quality flags.
  const q = result.quality;
  const flags = el("div", { class: "quality-flags" }, [
    flagBadge("Exposure locked", q.exposureLocked),
    flagBadge("White balance locked", q.whiteBalanceLocked),
    flagBadge("Torch controlled", q.torchControlled),
    badge(`Frames dropped: ${q.framesDropped}`, q.framesDropped > 30 ? "warn" : "ok"),
    badge(`Blinks retested: ${q.blinksRetested}`, "ok"),
    badge(
      `Focus conf: ${q.focusConfidence.toFixed(2)}`,
      q.focusConfidence < 0.25 ? "bad" : "ok"
    ),
  ]);
  const qcard = el("div", { class: "card" }, [
    el("h2", {}, ["Session quality"]),
    flags,
  ]);
  if (q.notes.length) {
    const ul = el("ul", { class: "muted" });
    for (const nnote of Array.from(new Set(q.notes))) {
      ul.appendChild(el("li", {}, [nnote]));
    }
    qcard.appendChild(ul);
  }
  body.appendChild(qcard);

  // Actions.
  body.appendChild(
    el("div", { class: "pad" }, [
      el("div", { class: "row" }, [
        el("button", { class: "btn", onclick: () => exportJSON(result) }, [
          "Export JSON",
        ]),
        el("button", { class: "btn", onclick: () => exportCSV(result) }, [
          "Export CSV",
        ]),
      ]),
      el(
        "button",
        {
          class: "btn primary",
          onclick: () => {
            show("intro");
          },
        },
        ["New screening"]
      ),
    ])
  );
}

function kv(k: string, v: string): HTMLElement {
  return el("div", { class: "field" }, [
    el("label", {}, [k]),
    el("span", {}, [v]),
  ]);
}

function flagBadge(label: string, ok: boolean): HTMLElement {
  return badge(`${label}: ${ok ? "yes" : "no"}`, ok ? "ok" : "warn");
}

function badge(text: string, kind: "ok" | "warn" | "bad"): HTMLElement {
  return el("span", { class: `badge ${kind}` }, [text]);
}

function num(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return v.toFixed(dp);
}

// ================= BOOT =================
function boot(): void {
  app.appendChild(buildIntro());
  app.appendChild(buildSettings());
  app.appendChild(buildCapture());
  app.appendChild(buildResults());
  show("intro");
}

boot();

// Re-draw plot on resize when results are visible.
window.addEventListener("resize", () => {
  const active = document.querySelector("#screen-results.active");
  if (!active) return;
  const canvas = active.querySelector("canvas.plot") as HTMLCanvasElement | null;
  if (canvas) drawPlot(canvas, eyeResults.left, eyeResults.right);
});
