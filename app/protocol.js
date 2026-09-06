import { IRIS_DIAMETER_MM } from "./config.js";
import { measurePupil } from "./pupil.js";
import { DEFAULT_GATE, evaluateGate } from "./gate.js";
import { computeEyeMetrics } from "./metrics.js";

const BLINK_EAR = DEFAULT_GATE.minEar;
const GATE_HOLD_MS = 400; // gate must stay ready this long before firing
const MAX_RETESTS = 3;

/**
 * App-controlled protocol engine. Human controls positioning; the APP controls
 * onset/offset of the LED and all timing. Stimulus timing is NEVER derived from
 * operator motion. A blink during a window auto-discards and retests that eye.
 */
export class ProtocolEngine {
  constructor(camera, tracker, video, voice, config, cb) {
    this.camera = camera;
    this.tracker = tracker;
    this.video = video;
    this.voice = voice;
    this.config = config;
    this.cb = cb;

    this.raf = 0;
    this.running = false;
    this.samples = [];
    this.framesDropped = 0;
    this.retests = 0;
    this.phaseStart = 0;
    this.ledOnsetTs = 0;
    this.gateReadySince = 0;
    this.queue = [];
    this.repeatCounters = new Map();
    this.collectedByEye = new Map();

    this.state = {
      phase: "idle",
      targetEye: null,
      repeatIndex: 0,
      totalForEye: config.repeats,
      gate: null,
      torchOn: false,
      message: "Ready.",
      phaseElapsedMs: 0,
      phaseDurationMs: 0,
    };

    this.loop = this.loop.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.queue = [];
    for (let r = 0; r < this.config.repeats; r++) {
      for (const eye of this.config.order) this.queue.push(eye);
    }
    for (const eye of this.config.order) this.repeatCounters.set(eye, 0);
    this.nextTarget();
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    void this.camera.setTorch(false);
    this.voice.cancel();
  }

  setPhase(phase, durationMs = 0, message = "") {
    this.state.phase = phase;
    this.phaseStart = performance.now();
    this.state.phaseDurationMs = durationMs;
    this.state.phaseElapsedMs = 0;
    if (message) this.state.message = message;
    this.emit();
  }

  emit() {
    this.state.torchOn = this.camera.torchOn;
    this.cb.onState({ ...this.state });
  }

  nextTarget() {
    const next = this.queue.shift();
    if (!next) {
      this.finish();
      return;
    }
    this.state.targetEye = next;
    this.state.repeatIndex = this.repeatCounters.get(next) ?? 0;
    this.samples = [];
    this.framesDropped = 0;
    this.retests = 0;
    this.gateReadySince = 0;
    const side = next;
    this.setPhase("prompt", 1200, `Hold on the patient's ${side} eye`);
    this.voice.say(`Hold on the ${side} eye. Keep the phone steady.`);
  }

  beginWindow() {
    this.samples = [];
    this.framesDropped = 0;
    this.setPhase("baseline", this.config.baselineMs, "Measuring baseline (dark)");
  }

  async fireStimulus() {
    const applied = await this.camera.setTorch(true);
    if (!applied && !this.config.demoMode) {
      this.state.message =
        "LED failed to fire — discarding window. Not a valid stimulus.";
      this.emit();
      this.retestOrAdvance("torch-failed");
      return;
    }
    this.ledOnsetTs = performance.now();
    this.setPhase(
      "stimulus",
      this.config.stimulusMs,
      this.config.demoMode ? "DEMO: no real stimulus" : "LED on — measuring"
    );
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    const now = performance.now();
    this.state.phaseElapsedMs = now - this.phaseStart;

    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    if (!w || !h) {
      this.emit();
      return;
    }

    const reading = this.tracker.detect(this.video, now);
    const target = this.state.targetEye;

    const gate =
      target && reading.present
        ? evaluateGate(
            reading,
            target,
            (iris) => measurePupil(this.video, iris),
            { w, h }
          )
        : null;
    this.state.gate = gate;

    this.cb.onFrame?.({ iris: gate?.iris ?? null, gate, target });

    switch (this.state.phase) {
      case "prompt":
        if (this.state.phaseElapsedMs >= this.state.phaseDurationMs) {
          this.setPhase("gating", 0, "Center the eye and hold steady");
        }
        break;

      case "gating": {
        if (gate?.ready) {
          if (!this.gateReadySince) this.gateReadySince = now;
          const held = now - this.gateReadySince;
          if (held >= GATE_HOLD_MS) {
            this.gateReadySince = 0;
            this.beginWindow();
          }
        } else {
          this.gateReadySince = 0;
        }
        break;
      }

      case "baseline": {
        this.recordSample(gate, now);
        if (this.detectBlink(gate)) {
          this.retestOrAdvance("blink");
          break;
        }
        if (this.state.phaseElapsedMs >= this.state.phaseDurationMs) {
          void this.fireStimulus();
        }
        break;
      }

      case "stimulus": {
        this.recordSample(gate, now);
        if (this.detectBlink(gate)) {
          void this.camera.setTorch(false);
          this.retestOrAdvance("blink");
          break;
        }
        if (this.state.phaseElapsedMs >= this.state.phaseDurationMs) {
          void this.camera.setTorch(false);
          this.setPhase(
            "redilation",
            this.config.redilationMs,
            "LED off — measuring recovery"
          );
        }
        break;
      }

      case "redilation": {
        this.recordSample(gate, now);
        if (this.state.phaseElapsedMs >= this.state.phaseDurationMs) {
          this.completeEye();
        }
        break;
      }

      default:
        break;
    }

    this.emit();
  }

  recordSample(gate, now) {
    const tMs =
      this.state.phase === "baseline"
        ? -(this.state.phaseDurationMs - this.state.phaseElapsedMs)
        : now - this.ledOnsetTs;

    const iris = gate?.iris ?? null;
    const pupil = gate?.pupil ?? null;

    if (!iris || !pupil || !pupil.ok || !isFinite(pupil.diameterPx)) {
      this.framesDropped++;
      this.samples.push({
        tMs,
        diameterMm: NaN,
        irisPx: iris?.diameterPx ?? NaN,
        dropped: true,
        focus: pupil?.focus ?? 0,
      });
      return;
    }

    const mmPerPx = IRIS_DIAMETER_MM / iris.diameterPx;
    const diameterMm = pupil.diameterPx * mmPerPx;
    this.samples.push({
      tMs,
      diameterMm,
      irisPx: iris.diameterPx,
      dropped: false,
      focus: pupil.focus,
    });
  }

  detectBlink(gate) {
    if (!gate || !gate.iris) return true;
    return gate.iris.ear < BLINK_EAR;
  }

  retestOrAdvance() {
    this.retests++;
    if (this.retests <= MAX_RETESTS) {
      this.voice.say("Blink detected. Let's retest this eye.");
      this.state.message = "Blink — retesting this eye";
      this.samples = [];
      this.framesDropped = 0;
      this.gateReadySince = 0;
      this.setPhase("gating", 0, "Retest: center the eye and hold steady");
    } else {
      this.voice.say("Could not get a clean capture. Moving on.");
      this.completeEye();
    }
  }

  completeEye() {
    const side = this.state.targetEye;
    const metrics = computeEyeMetrics(
      side,
      this.samples,
      this.framesDropped,
      this.retests
    );
    const arr = this.collectedByEye.get(side) ?? [];
    arr.push(metrics);
    this.collectedByEye.set(side, arr);
    this.repeatCounters.set(side, (this.repeatCounters.get(side) ?? 0) + 1);

    this.cb.onEyeComplete(side, metrics);

    const upcoming = this.queue[0];
    if (upcoming && upcoming !== side) {
      this.voice.say(`Now move to the ${upcoming} eye.`);
    }
    this.setPhase("advance", 800, "Advancing…");
    window.setTimeout(() => {
      if (this.running) this.nextTarget();
    }, 800);
  }

  finish() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    void this.camera.setTorch(false);
    this.setPhase("done", 0, "Session complete");
    this.voice.say("Screening complete.");
    this.cb.onComplete();
  }

  getAggregated() {
    const pick = (side) => {
      const all = this.collectedByEye.get(side) ?? [];
      if (!all.length) return null;
      const reliable = all.filter((m) => m.reliable);
      const pool = reliable.length ? reliable : all;
      return pool.reduce((best, m) =>
        m.samples.filter((s) => !s.dropped).length >
        best.samples.filter((s) => !s.dropped).length
          ? m
          : best
      );
    };
    return { left: pick("left"), right: pick("right") };
  }
}
