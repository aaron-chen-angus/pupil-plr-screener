import { detectCapabilities } from "./capabilities.js";
import { CameraController } from "./camera.js";
import { FaceMeshTracker } from "./facemesh.js";
import { ProtocolEngine } from "./protocol.js";
import { Voice } from "./voice.js";
import { computeAsymmetry } from "./metrics.js";
import { drawPlot, PLOT_COLORS } from "./plot.js";
import { exportCSV, exportJSON } from "./export.js";
import { el, disclaimerBanner } from "./ui.js";
import { WakeListener } from "./listen.js";
import { APP_VERSION } from "./config.js";

const app = document.getElementById("app");

const caps = detectCapabilities();

const config = {
  order: ["right", "left"],
  repeats: 1,
  baselineMs: 1000,
  stimulusMs: 2500,
  redilationMs: 2000,
  asymmetryThreshold: 20, // conservative, UNVALIDATED default
  voice: caps.speechSupported,
  demoMode: false,
  // External hand-held torch mode: operator shines a real light on cue. The
  // app owns timing but the stimulus is UNCONTROLLED (quality caveat).
  externalLight: false,
  // Operator triggers the measurement window (tap / voice) instead of the app
  // auto-starting when the gate is ready. Auto-enabled with externalLight.
  manualStart: false,
};

// --- runtime state ---
let camera = null;
let tracker = null;
let engine = null;
let voice = null;
let listener = null;
let openResult = null;
const eyeResults = { left: null, right: null };

// ---------- Brand header ----------
function brand() {
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

function screen(id) {
  return el("div", { class: "screen", id: `screen-${id}` });
}

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${id}`)?.classList.add("active");
}

// ================= INTRO SCREEN =================
function buildIntro() {
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
            config.externalLight = false;
            config.manualStart = false;
            void startCapture();
          },
        },
        ["Start demo mode (no stimulus)"]
      )
    );
    actions.appendChild(
      el("div", { class: "card" }, [
        el("p", { class: "muted" }, [
          "External-light demo: hold a small torch in your other hand. The app tells you exactly when to shine it and when to switch it off, and measures the pupil response. This is an UNCONTROLLED manual stimulus (a quality caveat) — not the same as the phone's own LED and not pupillometer-grade.",
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
            config.externalLight = true;
            config.manualStart = true;
            // Longer baseline so the spoken "3, 2, 1" countdown fits and the
            // operator has time to ready the hand-held torch.
            config.baselineMs = 3500;
            void startCapture();
          },
        },
        ["Start external-light demo (hold a torch)"]
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
    el("button", { class: "btn secondary", onclick: () => show("settings") }, [
      "Protocol settings",
    ])
  );

  s.appendChild(actions);
  return s;
}

function capBadge(label, ok) {
  return el("div", { class: "field" }, [
    el("label", {}, [label]),
    el("span", { class: `badge ${ok ? "ok" : "bad"}` }, [
      ok ? "available" : "unavailable",
    ]),
  ]);
}

// ================= SETTINGS SCREEN =================
function buildSettings() {
  const s = screen("settings");
  s.appendChild(brand());

  const card = el("div", { class: "card" }, [el("h2", {}, ["Protocol"])]);

  const orderSel = el("select", {
    onchange: (e) => {
      const v = e.target.value;
      config.order = v === "left-first" ? ["left", "right"] : ["right", "left"];
    },
  });
  orderSel.appendChild(el("option", { value: "right-first" }, ["Right, then left"]));
  orderSel.appendChild(el("option", { value: "left-first" }, ["Left, then right"]));
  card.appendChild(field("Eye order", orderSel));

  card.appendChild(
    field("Repeats per eye", numberInput(config.repeats, 1, 5, (v) => (config.repeats = v)))
  );
  card.appendChild(
    field("Baseline dark (ms)", numberInput(config.baselineMs, 300, 3000, (v) => (config.baselineMs = v)))
  );
  card.appendChild(
    field("LED on (ms)", numberInput(config.stimulusMs, 1000, 4000, (v) => (config.stimulusMs = v)))
  );
  card.appendChild(
    field("Redilation (ms)", numberInput(config.redilationMs, 500, 5000, (v) => (config.redilationMs = v)))
  );

  const voiceChk = el("input", {
    type: "checkbox",
    ...(config.voice ? { checked: "checked" } : {}),
    onchange: (e) => (config.voice = e.target.checked),
  });
  card.appendChild(field("Voice guidance", voiceChk));

  s.appendChild(card);

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
    oninput: (e) => {
      config.asymmetryThreshold = Number(e.target.value);
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
      el("button", { class: "btn primary", onclick: () => show("intro") }, ["Done"]),
    ])
  );
  return s;
}

function field(label, control) {
  return el("div", { class: "field" }, [el("label", {}, [label]), control]);
}

function numberInput(value, min, max, onChange) {
  return el("input", {
    type: "number",
    value: String(value),
    min: String(min),
    max: String(max),
    onchange: (e) => {
      let v = Number(e.target.value);
      v = Math.max(min, Math.min(max, v));
      e.target.value = String(v);
      onChange(v);
    },
  });
}

// ================= CAPTURE SCREEN =================
let videoEl;
let overlayEl;
let cueEl;
let statusEl;
let readyEl;
let hintEl;
let gateListEl;
let torchLiveEl;
let captureNowBtn;

function buildCapture() {
  const s = screen("capture");

  const stage = el("div", { class: "stage" });
  videoEl = el("video", { autoplay: "true", playsinline: "true", muted: "true" });
  overlayEl = el("canvas", { class: "overlay" });
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

  // "Why isn't it ready?" hint — names the first failing check + a tip.
  hintEl = el("div", { class: "ready-hint" }, [""]);
  stage.appendChild(hintEl);

  const captureBtns = [];
  if (config.manualStart) {
    captureNowBtn = el(
      "button",
      { class: "btn primary", onclick: () => engine?.requestTrigger() },
      ["Capture now"]
    );
    captureBtns.push(captureNowBtn);
  }
  captureBtns.push(
    el("button", { class: "btn secondary", onclick: () => abortCapture() }, ["Stop"])
  );
  const controls = el("div", { class: "capture-controls" }, captureBtns);
  stage.appendChild(controls);

  s.appendChild(stage);
  s.appendChild(disclaimerBanner());
  statusEl = el("div", { class: "status-line" }, [""]);
  s.appendChild(statusEl);

  return s;
}

async function startCapture() {
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
    statusEl.textContent = "Could not access the rear camera: " + err.message;
    return;
  }

  videoEl.srcObject = openResult.stream;
  await videoEl.play().catch(() => undefined);

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
    statusEl.textContent = "Failed to load the face/iris model: " + err.message;
    return;
  }

  const modeNote = config.demoMode
    ? "DEMO MODE — no real light stimulus is delivered; values are illustrative only."
    : openResult.exposureLocked
    ? "Exposure locked."
    : "Exposure NOT locked (quality caveat).";
  statusEl.textContent = modeNote;

  engine = new ProtocolEngine(camera, tracker, videoEl, voice, config, {
    onState: renderProtocolState,
    onFrame: drawOverlay,
    onEyeComplete: (side, m) => {
      eyeResults[side] = m;
    },
    onComplete: () => finishSession(),
  });

  // Voice-activated trigger for hands-busy (external-light) operation.
  if (config.manualStart) {
    listener = new WakeListener(() => engine?.requestTrigger());
    if (listener.isSupported) {
      listener.start();
      statusEl.textContent =
        statusEl.textContent +
        "  Say \u201cgo\u201d or tap Capture now to start each measurement.";
    } else {
      statusEl.textContent =
        statusEl.textContent +
        "  Voice trigger not supported here — tap Capture now to start each measurement.";
    }
  }

  engine.start();
}

function renderProtocolState(state) {
  cueEl.textContent = state.message;

  const ready = state.gate?.ready ?? false;
  readyEl.classList.toggle("ready", ready);
  readyEl.lastChild.textContent = ready ? "Ready — hold steady" : "Not ready";

  const on = state.torchOn;
  torchLiveEl.classList.toggle("on", on);
  torchLiveEl.textContent = on ? "LED ON" : "LED off";

  // In manual/external mode, "Capture now" only works while gating + ready.
  if (captureNowBtn) {
    const armable = state.phase === "gating" && ready;
    captureNowBtn.disabled = !armable;
    captureNowBtn.textContent = armable ? "Capture now" : "Capture now (align eye first)";
  }

  const c = state.gate?.checks;
  const pupil = state.gate?.pupil;
  if (c) {
    // Live diagnostics so it's transparent what the CV is measuring.
    const focusTxt = pupil ? ` ${pupil.focus.toFixed(2)}` : "";
    const ratioTxt =
      pupil && isFinite(pupil.ratio) ? ` ${(pupil.ratio * 100) | 0}%` : "";
    const items = [
      ["Face", c.faceDetected],
      ["Eye", c.oneEyeTargeted],
      ["Centered", c.centered],
      ["Open", c.open],
      [`Focus${focusTxt}`, c.inFocus],
      [`Pupil${ratioTxt}`, c.pupilFound],
    ];
    gateListEl.innerHTML = "";
    for (const [label, pass] of items) {
      gateListEl.appendChild(el("div", { class: `g ${pass ? "pass" : "fail"}` }, [label]));
    }
  }

  updateReadyHint(state, c, ready);
}

// Show a plain-language "why isn't it ready?" hint that names the first failing
// check (in priority order) and gives an actionable tip. Only during the
// positioning phases; hidden once ready or while a measurement is running.
function updateReadyHint(state, checks, ready) {
  const positioning = state.phase === "prompt" || state.phase === "gating";
  if (!positioning || ready || !checks) {
    hintEl.textContent = "";
    hintEl.classList.remove("show");
    return;
  }

  const gate = state.gate;
  const eye = state.targetEye ? `${state.targetEye} eye` : "eye";
  let msg = "";
  if (!checks.faceDetected) {
    msg = "No face detected — hold the phone ~30 cm away with the whole face in view.";
  } else if (!checks.oneEyeTargeted) {
    msg = `Can't find the ${eye} — aim the camera at it.`;
  } else if (gate?.tooClose) {
    msg = "Too close — move the phone back so the whole face fits in the frame.";
  } else if (gate?.tooFar) {
    msg = `Too far — move a little closer to the ${eye}.`;
  } else if (!checks.centered) {
    msg = `Move the ${eye} into the centre circle.`;
  } else if (!checks.open) {
    msg = "Eye looks closed or mid-blink — hold it open.";
  } else if (!checks.inFocus) {
    msg =
      "Not sharp enough — steady the phone and adjust distance until the eye is crisp.";
  } else if (!checks.pupilFound) {
    msg =
      "Can't isolate the pupil — reduce glare/reflections, avoid extreme close-ups, and hold steady.";
  } else {
    msg = "Almost there — hold steady.";
  }

  hintEl.textContent = "Why not ready: " + msg;
  hintEl.classList.add("show");
}

function drawOverlay(f) {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return;
  if (overlayEl.width !== w || overlayEl.height !== h) {
    overlayEl.width = w;
    overlayEl.height = h;
  }
  const ctx = overlayEl.getContext("2d");
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.16, 0, Math.PI * 2);
  ctx.stroke();

  if (f.iris) {
    ctx.strokeStyle = "#3fb6ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.iris.centerPx.x, f.iris.centerPx.y, f.iris.diameterPx / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function abortCapture() {
  listener?.stop();
  listener = null;
  engine?.stop();
  tracker?.close();
  camera?.stop();
  show("intro");
}

// ================= RESULTS =================
function buildResults() {
  const s = screen("results");
  s.appendChild(brand());
  s.appendChild(disclaimerBanner());
  s.appendChild(el("div", { id: "results-body" }));
  return s;
}

function finishSession() {
  const agg = engine?.getAggregated() ?? { left: null, right: null };
  eyeResults.left = agg.left;
  eyeResults.right = agg.right;

  listener?.stop();
  listener = null;
  tracker?.close();
  camera?.stop();

  const quality = buildQuality();
  const asymmetry = computeAsymmetry(eyeResults.left, eyeResults.right, config);

  const result = {
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

function buildQuality() {
  const l = eyeResults.left;
  const r = eyeResults.right;
  const framesDropped = (l?.framesDropped ?? 0) + (r?.framesDropped ?? 0);
  const blinksRetested = (l?.retests ?? 0) + (r?.retests ?? 0);
  const focusVals = [l?.focusConfidence, r?.focusConfidence].filter(
    (v) => typeof v === "number"
  );
  const focusConfidence = focusVals.length
    ? focusVals.reduce((a, b) => a + b, 0) / focusVals.length
    : 0;

  const notes = [];
  if (openResult) notes.push(...openResult.notes);
  if (config.externalLight) {
    notes.push(
      "External hand-held light: UNCONTROLLED manual stimulus (operator-timed intensity/onset). Illustrative only — not a controlled-LED measurement."
    );
  } else if (config.demoMode) {
    notes.push("Demo mode: no controlled light stimulus delivered.");
  }

  const anyEyeUnreliable = (l && !l.reliable) || (r && !r.reliable) || !l || !r;
  const unreliable =
    config.demoMode ||
    !!anyEyeUnreliable ||
    focusConfidence < 0.25 ||
    !openResult?.torchSupported;

  if (!openResult?.exposureLocked) notes.push("Exposure not locked during capture.");

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

function renderResults(result) {
  const body = document.getElementById("results-body");
  body.innerHTML = "";

  const ind = result.asymmetry.indicator;
  const cls =
    result.quality.unreliable || ind === "insufficient"
      ? "invalid"
      : ind === "asymmetric"
      ? "asymmetric"
      : "symmetric";
  const label = result.quality.unreliable
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
  const rows = [
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

  const plotCard = el("div", { class: "card" }, [el("h2", {}, ["Pupil diameter vs time"])]);
  const plotWrap = el("div", { class: "plot-wrap" });
  const canvas = el("canvas", { class: "plot" });
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
  requestAnimationFrame(() => drawPlot(canvas, result.eyes.left, result.eyes.right));

  const q = result.quality;
  const flags = el("div", { class: "quality-flags" }, [
    flagBadge("Exposure locked", q.exposureLocked),
    flagBadge("White balance locked", q.whiteBalanceLocked),
    flagBadge("Torch controlled", q.torchControlled),
    badge(`Frames dropped: ${q.framesDropped}`, q.framesDropped > 30 ? "warn" : "ok"),
    badge(`Blinks retested: ${q.blinksRetested}`, "ok"),
    badge(`Focus conf: ${q.focusConfidence.toFixed(2)}`, q.focusConfidence < 0.25 ? "bad" : "ok"),
  ]);
  const qcard = el("div", { class: "card" }, [el("h2", {}, ["Session quality"]), flags]);
  if (q.notes.length) {
    const ul = el("ul", { class: "muted" });
    for (const note of Array.from(new Set(q.notes))) {
      ul.appendChild(el("li", {}, [note]));
    }
    qcard.appendChild(ul);
  }
  body.appendChild(qcard);

  body.appendChild(
    el("div", { class: "pad" }, [
      el("div", { class: "row" }, [
        el("button", { class: "btn", onclick: () => exportJSON(result) }, ["Export JSON"]),
        el("button", { class: "btn", onclick: () => exportCSV(result) }, ["Export CSV"]),
      ]),
      el("button", { class: "btn primary", onclick: () => show("intro") }, ["New screening"]),
    ])
  );
}

function kv(k, v) {
  return el("div", { class: "field" }, [el("label", {}, [k]), el("span", {}, [v])]);
}

function flagBadge(label, ok) {
  return badge(`${label}: ${ok ? "yes" : "no"}`, ok ? "ok" : "warn");
}

function badge(text, kind) {
  return el("span", { class: `badge ${kind}` }, [text]);
}

function num(v, dp = 2) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return v.toFixed(dp);
}

// ================= BOOT =================
function boot() {
  app.appendChild(buildIntro());
  app.appendChild(buildSettings());
  app.appendChild(buildCapture());
  app.appendChild(buildResults());
  show("intro");
}

boot();

window.addEventListener("resize", () => {
  const active = document.querySelector("#screen-results.active");
  if (!active) return;
  const canvas = active.querySelector("canvas.plot");
  if (canvas) drawPlot(canvas, eyeResults.left, eyeResults.right);
});
