# PLR Screener — Scientific, Clinical & Technical Reference Manual

**Document class:** Combined scientific rationale, clinical background, and engineering
specification for an operator-held smartphone pupillary light reflex (PLR) **screening and
teaching demonstrator**.
**Software version:** 1.0.0 · **Manual revision:** 1.0
**Intended readership:** clinicians (neurology, ophthalmology, optometry, emergency &
critical care), biomedical/clinical engineers, and software developers.

> ### Regulatory & safety statement (read first)
> This software is a **screening and educational demonstrator**. It is **not** a medical
> device, **not** a diagnostic instrument, and **not** a pupillometer of clinical grade. It
> does **not** detect, quantify, grade, or exclude a relative afferent pupillary defect
> (RAPD), optic neuropathy, third-nerve palsy, raised intracranial pressure, or any other
> condition. It outputs **objective measured values** and a single **neutral, unvalidated**
> interocular indicator ("symmetric / asymmetric — consider clinical referral"). No diagnostic
> cut-off is implied or provided. All clinical decisions must rest on formal examination by a
> qualified clinician. See §8 (Limitations) and §9 (Intended use / non-goals).

---

## Table of contents

1. [Scientific basis — the pupillary light reflex](#1-scientific-basis--the-pupillary-light-reflex)
2. [Clinical basis — what quantitative PLR metrics mean](#2-clinical-basis--what-quantitative-plr-metrics-mean)
3. [Rationale & evidence for smartphone / camera-based pupillometry](#3-rationale--evidence-for-smartphone--camera-based-pupillometry)
4. [System architecture & measurement pipeline](#4-system-architecture--measurement-pipeline)
5. [Landmarks, markers & the pixel-to-millimetre scale](#5-landmarks-markers--the-pixel-to-millimetre-scale)
6. [Signal processing & metric definitions (mathematical)](#6-signal-processing--metric-definitions-mathematical)
7. [Data dictionary](#7-data-dictionary)
8. [Limitations, error sources & quality control](#8-limitations-error-sources--quality-control)
9. [Intended use, indications & explicit non-goals](#9-intended-use-indications--explicit-non-goals)
10. [Development breakdown, toolchain & dependencies](#10-development-breakdown-toolchain--dependencies)
11. [References](#11-references)

---

## 1. Scientific basis — the pupillary light reflex

### 1.1 Physiology

The pupillary light reflex (PLR) is the involuntary constriction of the pupil in response to
increased retinal illumination. It is subserved by a four-neuron arc with an afferent
(sensory) limb and an efferent (parasympathetic motor) limb, and it is **consensual** — light
presented to one eye constricts *both* pupils approximately equally, because the midbrain relay
projects bilaterally [1,2,7].

**Afferent limb.** Light is transduced by rod/cone photoreceptors and, importantly for the
sustained component of the reflex, by intrinsically photosensitive retinal ganglion cells
(ipRGCs) expressing melanopsin. Signals leave the eye via the optic nerve, pass through the
optic chiasm and optic tract, and — instead of continuing to the lateral geniculate nucleus as
the image-forming pathway does — branch to the **pretectal olivary nucleus (PON)** in the
dorsal midbrain, just rostral to the superior colliculus [1,6,7].

**Central relay & bilaterality.** Each pretectal olivary nucleus projects to **both**
Edinger–Westphal (accessory oculomotor) nuclei via intercalated neurons crossing in the
posterior commissure. This bilateral, crossed-and-uncrossed projection is the anatomical basis
of the consensual response and of the interocular linkage exploited by the swinging-flashlight
test [1,3,7].

**Efferent limb.** Preganglionic parasympathetic fibres travel from the Edinger–Westphal
nucleus within the oculomotor nerve (CN III) to the **ciliary ganglion**; postganglionic short
ciliary nerves then innervate the **iris sphincter muscle**, producing miosis (constriction)
[1,2,3,7]. Pupillary **dilation** (mydriasis) is driven by an opposing sympathetic pathway
acting on the iris dilator muscle; redilation after a light stimulus reflects the combined
withdrawal of parasympathetic drive and sympathetic tone [5].

### 1.2 Why the reflex is clinically informative

Because the afferent and efferent limbs traverse well-defined anatomical territory, and because
the response is normally symmetric between the two eyes, **asymmetry or abnormality of the PLR
localizes disease** along the visual and oculomotor pathways. Classical bedside assessment is
qualitative (an examiner observes constriction with a hand light); quantitative pupillometry
replaces subjective observation with measured diameter-versus-time curves [2,10].

---

## 2. Clinical basis — what quantitative PLR metrics mean

### 2.1 Established quantitative PLR parameters

Automated infrared pupillometry characterizes the reflex with a standard parameter set. The
identical conceptual parameters are computed by this application (see §6). Terminology below
follows the pupillometry literature [11,12,13]:

| Parameter | Typical abbrev. | Meaning |
|---|---|---|
| Maximum (baseline) diameter | MAX | Resting/pre-stimulus pupil size |
| Minimum diameter | MIN | Smallest size reached after the light stimulus |
| Constriction percentage | CON / %CON | (MAX − MIN)/MAX × 100 |
| Latency | LAT | Time from stimulus onset to the start of constriction |
| Average constriction velocity | ACV | Mean rate of constriction |
| Maximum constriction velocity | MCV | Peak rate of constriction |
| Average dilation velocity | ADV | Mean rate of redilation after the light is removed |
| 75% recovery time | T75 | Time to recover 75% of the constriction amplitude |

### 2.2 Representative normative values (context, not thresholds)

To give clinical context — **not** to serve as diagnostic cut-offs — published normative
datasets report values of the following order. In a healthy pediatric normative database using
a commercial pupillometer, mean MAX ≈ 6.6 mm, MIN ≈ 4.7 mm, CON ≈ 30%, LAT ≈ 230 ms,
ACV ≈ 3.70 mm/s, ADV ≈ 0.88 mm/s [11]. Normative adult datasets (e.g., service-academy cohorts)
report comparable distributions with expected variation by age, iris pigmentation, ambient
light, arousal, and medication [12]. Physiological resting **anisocoria** (interocular size
difference) of ≤0.5 mm is common, and ≤1.0 mm is seen in a large majority of healthy people
[11]. These figures are cited to frame magnitude and units only; this application **does not**
apply them as decision thresholds.

### 2.3 Interocular asymmetry and the RAPD (why v1 does NOT attempt RAPD)

A **relative afferent pupillary defect (RAPD / Marcus Gunn pupil)** is a sign of *asymmetric*
afferent (retinal/optic-nerve/anterior-chiasmal) dysfunction. It is elicited clinically by the
**swinging-flashlight test**: because the reflex is consensual, an eye with a relatively weaker
afferent signal shows paradoxical dilation when the light swings to it from the healthy eye
[8,14]. Detecting a true RAPD therefore requires **alternating, stimulus-isolated
stimulation** of each eye while observing the *direct* response of the illuminated eye against
its consensual baseline.

This application performs a **dwell-and-switch** protocol (measure one eye, then the other),
which is **fundamentally different** from the swinging-flashlight paradigm and **cannot** detect
the RAPD "escape" phenomenon. Automated/portable pupillography of the swinging-flashlight
response has been studied and can achieve useful sensitivity/specificity for asymmetric optic
neuropathy and glaucoma [15,16,17,18], but that is explicitly **out of scope for v1** (see §9).
Any interocular comparison produced here is a coarse, unvalidated screening signal, not an RAPD
measurement.

---

## 3. Rationale & evidence for smartphone / camera-based pupillometry

Smartphone and consumer-camera pupillometry is an active research area. Multiple peer-reviewed
studies report that smartphone-based pupil measurement can achieve high inter-rater reliability
and meaningful agreement with reference infrared pupillometers:

- Smartphone infrared pupillography showed **excellent** inter-observer agreement for pupil
  size (intraclass correlation 0.982–0.986) [19].
- Application-based smartphone pupillometry (e.g., *PupilScreen*) has been evaluated against the
  clinical gold-standard NeurOptics NPi-200 pupillometer for classifying severe traumatic brain
  injury [20], and independent mobile digital-pupillometry work reports clinician curve-reading
  accuracy in the low-90% range for normal-versus-abnormal PLR curves [21].
- More recent AI-assisted smartphone pupillometry (e.g., *SmartPLR*) reports moderate-to-strong
  correlation with a commercial NPi-300 device for constriction velocity and constriction
  percentage [22].

**Important distinction.** Those studies typically use **infrared** illumination and/or
**dedicated apps with controlled optics**, and they are validation studies. This application
uses the **visible-light rear camera and LED**, browser-based computer vision, and has **not**
been clinically validated. The literature establishes that the *approach* is scientifically
plausible; it does **not** confer validated accuracy on *this* implementation.

---

## 4. System architecture & measurement pipeline

### 4.1 High-level design

The application is a **fully client-side, static web app** (no backend, no data transmission).
All computer vision and signal processing run **on-device in the browser**. The controlled
light stimulus is delivered by the phone's **rear LED (torch)**; the **rear camera** records the
eye. Because the operator holds the phone facing the patient, the operator cannot see the screen
during capture — hence **voice guidance** drives the protocol.

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Capability detection  (secure context, getUserMedia, torch, iOS)          │
 └───────────────┬──────────────────────────────────────────────────────────┘
                 ▼
 ┌──────────────────────────────┐     user gesture (Start)
 │  CameraController (camera.js) │◀──────────────────────────
 │  • rear-camera getUserMedia   │
 │  • exposure/WB/focus lock     │
 │  • LED torch on/off (owned)   │
 └───────────────┬──────────────┘
                 ▼ MediaStream frames (~30 fps)
 ┌──────────────────────────────┐
 │ FaceMeshTracker (facemesh.js) │  MediaPipe FaceLandmarker (478 pts, iris)
 │  → per-eye iris centre,       │
 │    iris diameter (px), EAR,   │
 │    eye ROI                    │
 └───────────────┬──────────────┘
                 ▼ iris ROI
 ┌──────────────────────────────┐
 │  Pupil segmentation (pupil.js)│  dark-region threshold + glint close +
 │  → pupil diameter (px),       │  connected components + bbox/area fit
 │    focus score, size ratio    │
 └───────────────┬──────────────┘
                 ▼ per-frame reading
 ┌──────────────────────────────┐
 │  CV Gate (gate.js)            │  face / one-eye / centred / open / focus /
 │  → ready?                     │  pupil-found  + distance diagnostics
 └───────────────┬──────────────┘
                 ▼ gate held ready
 ┌──────────────────────────────┐
 │  ProtocolEngine (protocol.js) │  app-owned timing:
 │  baseline → stimulus →        │  dark → LED on → LED off → recover
 │  redilation, per eye;         │  blink → discard & retest; countdown cues
 │  voice guidance (voice.js);   │
 │  optional voice trigger       │
 │  (listen.js)                  │
 └───────────────┬──────────────┘
                 ▼ per-eye sample series
 ┌──────────────────────────────┐
 │  Metrics (metrics.js)         │  baseline, min, %constriction, latency,
 │  + asymmetry + reliability    │  velocities; interocular composite score
 └───────────────┬──────────────┘
                 ▼
 ┌──────────────────────────────┐
 │  UI results + plot + export   │  table, diameter-vs-time plot, quality
 │  (main.js, plot.js, export.js)│  flags, JSON/CSV
 └──────────────────────────────┘
```

### 4.2 Protocol state machine (per eye, per repeat)

| Phase | What happens | Timing source |
|---|---|---|
| `prompt` | Voice names the eye ("hold on the … eye"); operator positions the phone | fixed ~1.2 s |
| `gating` | CV gate evaluated every fresh frame; must be **ready** (all checks pass) | until ready + hold |
| `baseline` | Pre-stimulus dark capture; spoken countdown ("3, 2, 1") | `baselineMs` (default 1000 ms) |
| `stimulus` | **App fires the LED** (or prompts external light); pupil measured | `stimulusMs` (default 2500 ms) |
| `redilation` | LED off; recovery captured | `redilationMs` (default 2000 ms) |
| `advance` | Voice cues the switch to the next eye | fixed ~0.8 s |
| `done` | All eyes/repeats complete → results | — |

Key engineering guarantees:

- **The app owns all stimulus timing.** LED onset/offset is scheduled by the engine, never
  derived from operator motion. The stimulus onset timestamp (`ledOnsetTs`) defines t = 0 for
  every metric.
- **Gate before fire.** The window will not begin until the gate is *ready* and (in
  auto mode) has remained ready for a hold interval (`GATE_HOLD_MS`, 400 ms). This debounce is
  applied only to genuinely fresh camera frames, so the faster render loop cannot spuriously
  reset it.
- **Blink handling.** A blink (low eye-openness) during baseline/stimulus discards the window
  and re-tests the eye, up to `MAX_RETESTS` (3), mirroring commercial systems.
- **Honesty about the stimulus.** If the LED cannot fire (e.g., iOS, or torch unsupported), the
  app **never** pretends a stimulus was delivered — it enters a clearly labelled demo mode or an
  external hand-held-light mode (both flagged as uncontrolled / illustrative).

---

## 5. Landmarks, markers & the pixel-to-millimetre scale

### 5.1 Facial/iris landmarks (MediaPipe FaceLandmarker, 478-point model)

The 478-landmark FaceLandmarker model extends the 468-point face mesh with **10 refined iris
landmarks** (MediaPipe Iris) [23,24]. The application uses:

| Marker group | Landmark indices | Use |
|---|---|---|
| Right iris ring | 468–472 (centre 468) | Iris centre & horizontal/vertical iris diameter (subject's right eye) |
| Left iris ring | 473–477 (centre 473) | Iris centre & iris diameter (subject's left eye) |
| Right eye lids/canthi | 33, 133, 159, 145, 158, 153 | Eye-aspect-ratio (openness / blink) and eye ROI |
| Left eye lids/canthi | 362, 263, 386, 374, 385, 380 | Eye-aspect-ratio and eye ROI |

Sidedness ("left"/"right") refers to the **subject's anatomical eyes** and is resolved from
landmark geometry, not screen position, so a non-mirrored rear-camera image is handled correctly.

### 5.2 The physical scale reference (why iris, not pupil, gives millimetres)

FaceMesh localizes the **iris**, not the pupil. The application exploits the fact that the
**horizontal visible iris diameter (HVID)** — clinically the corneal "white-to-white" distance —
is a relatively stable anatomical constant across adults. Population biometry studies report mean
HVID/white-to-white of approximately **11.6–11.8 mm** (e.g., 11.77 ± 0.37 mm in males, 11.64 ±
0.47 mm in females by Orbscan; 11.68 mm in the Tehran Eye Study) [25,26,27]. The application uses
a fixed reference of **`IRIS_DIAMETER_MM = 11.7 mm`**.

The per-frame conversion is:

```
mm_per_pixel  = IRIS_DIAMETER_MM / iris_diameter_px      (measured that frame)
pupil_diameter_mm = pupil_diameter_px × mm_per_pixel
```

Using a **per-frame** iris measurement makes the scale self-correcting for changes in
camera-to-eye distance during a capture. The trade-off is that individual HVID variation
(≈ ±0.4 mm SD) and off-axis foreshortening propagate directly into the millimetre estimates
(see §8).

### 5.3 Pupil segmentation (the marker FaceMesh does not provide)

Within the iris region of interest, the pupil is estimated per frame by:

1. **Restricting analysis to a disc inside the iris** (≈ 0.98 × iris radius) so the pupil blob
   cannot leak into eyelashes or socket shadow.
2. **Adaptive dark thresholding** (the pupil is the darkest structure within the iris).
3. **Corneal-glint handling by morphological closing** — the specular LED reflection is bright
   and typically sits on the pupil; bright glint pixels adjacent to dark pupil pixels are
   *absorbed* back into the pupil mask so the reflection does not fragment the blob.
4. **Connected-component selection** of the dark blob whose centroid is nearest the iris centre.
5. **Diameter estimation** blending the bounding-box extent (robust to an interior glint hole)
   with the equivalent-area circle diameter.
6. **Plausibility check**: accept only if pupil/iris width ratio ∈ (0.08, 0.98).
7. **Focus scoring** via a Tenengrad (gradient-energy) sharpness measure, normalized to 0–1.

---

## 6. Signal processing & metric definitions (mathematical)

Let a per-eye window be a time-ordered set of samples `s_i = (t_i, d_i)`, where `t_i` is
milliseconds relative to LED onset (negative = baseline) and `d_i` is pupil diameter in mm.
Dropped/blink frames are excluded. A **3-point moving median** is applied to `d` to suppress
per-frame segmentation jitter before metric extraction.

- **Baseline diameter** `B` = median of `d_i` for all `t_i < 0`.
- **Minimum diameter** `M` = min of `d_i` for `t_i ≥ 0`; `t_M` = time of that minimum.
- **Constriction percentage** `%CON = (B − M) / B × 100`.
- **Latency** `LAT` = first `t_i ≥ 0` at which `d_i ≤ B − Δ`, where the onset delta
  `Δ = max(0.15 mm, 0.05 × B)` (a small, noise-robust departure from baseline).
- **Instantaneous constriction velocity** between consecutive constriction-phase samples
  (`0 ≤ t ≤ t_M`): `v = (d_{i−1} − d_i) / (Δt in seconds)`, keeping positive values only.
  - **Mean constriction velocity** `ACV` = mean of those `v`.
  - **Max constriction velocity** `MCV` = max of those `v`.
- **Redilation trace** = the raw `d(t)` for `t > t_M` (retained in `samples`; a scalar dilation
  velocity is not summarized in v1).

### 6.1 Interocular asymmetry (unvalidated composite)

```
Δ%CON      = |%CON_left − %CON_right|                       (percentage points)
Δvelocity  = |ACV_left − ACV_right|                          (mm/s, if both present)
score      = Δ%CON + 10 × Δvelocity                          (heuristic composite)
indicator  = "asymmetric"  if score ≥ threshold  (both eyes reliable)
             "symmetric"   if score <  threshold  (both eyes reliable)
             "insufficient" otherwise
```

- The velocity term is scaled ×10 so that ~0.1 mm/s ≈ 1 point, placing it on a comparable
  footing with percentage-point differences. **This scaling and the threshold are heuristic.**
- `threshold` (`asymmetryThreshold`, default **20**) is **user-adjustable** and explicitly
  labelled *"unvalidated screening threshold."* It is **not** a clinical cut-off and no such
  cut-off is implied.

### 6.2 Per-eye reliability logic

A per-eye result is flagged **unreliable** if any of: no usable baseline; no usable
post-stimulus measurement; fewer than 8 measurable frames; median focus confidence < 0.25; or
more frames dropped than measured. A **session** is treated as unreliable (and must not be read
as a valid screening result) if demo mode was used, torch was not actually controlled, either
eye is unreliable/missing, or overall focus confidence is < 0.25.

---

## 7. Data dictionary

All variables are computed and stored **on-device**; nothing is transmitted off the phone.
Exports are user-initiated (JSON / CSV).

### 7.1 Session object (`SessionResult`)

| Field | Type | Unit | Description |
|---|---|---|---|
| `createdAt` | ISO-8601 string | — | Timestamp the result was generated (device local clock, UTC ISO) |
| `appVersion` | string | — | Application version (e.g., "1.0.0") |
| `config` | object | — | The `SessionConfig` used (see §7.4) |
| `device.userAgent` | string | — | Browser user-agent string |
| `device.torchSupported` | boolean | — | Whether the live camera track reported torch capability |
| `device.secureContext` | boolean | — | Whether the page ran in an HTTPS secure context |
| `eyes.left` / `eyes.right` | object \| null | — | Per-eye metrics (`EyeMetrics`, §7.2); null if no data |
| `asymmetry` | object | — | Interocular summary (`AsymmetryResult`, §7.3) |
| `quality` | object | — | Session quality flags (`SessionQuality`, §7.5) |
| `stimulusDelivered` | boolean | — | **True only if a real controlled LED stimulus fired** (false in demo/external-light) |

### 7.2 Per-eye metrics (`EyeMetrics`)

| Field | Type | Unit | Description |
|---|---|---|---|
| `side` | "left" \| "right" | — | Subject's anatomical eye |
| `baselineMm` | number \| null | mm | Pre-stimulus (dark) pupil diameter — median of baseline samples (≡ MAX) |
| `minMm` | number \| null | mm | Minimum diameter reached after stimulus (≡ MIN) |
| `percentConstriction` | number \| null | % | (baseline − min)/baseline × 100 (≡ %CON) |
| `latencyMs` | number \| null | ms | Time from LED onset to detected constriction onset (≡ LAT) |
| `meanVelocity` | number \| null | mm/s | Mean constriction velocity over the constriction phase (≡ ACV) |
| `maxVelocity` | number \| null | mm/s | Peak constriction velocity (≡ MCV) |
| `samples` | array | — | Raw per-frame samples (`PupilSample`, §7.6) incl. the redilation trace |
| `framesDropped` | integer | count | Frames in this window with no usable pupil measurement |
| `retests` | integer | count | Number of blink-triggered re-tests before completion |
| `focusConfidence` | number | 0–1 | Median per-frame sharpness score over measured frames |
| `reliable` | boolean | — | Whether this eye met the per-eye reliability criteria (§6.2) |
| `reliabilityNotes` | string[] | — | Human-readable reasons if unreliable |

### 7.3 Interocular asymmetry (`AsymmetryResult`)

| Field | Type | Unit | Description |
|---|---|---|---|
| `constrictionDeltaPct` | number \| null | percentage points | \|%CON_L − %CON_R\| |
| `velocityDelta` | number \| null | mm/s | \|ACV_L − ACV_R\| |
| `score` | number \| null | unitless | Composite = Δ%CON + 10 × Δvelocity |
| `threshold` | number | unitless | The unvalidated threshold used for the indicator |
| `indicator` | "symmetric" \| "asymmetric" \| "insufficient" | — | Neutral screening indicator (never a diagnosis) |

### 7.4 Configuration (`SessionConfig`)

| Field | Type | Unit | Default | Description |
|---|---|---|---|---|
| `order` | ["right","left"] etc. | — | ["right","left"] | Eye test order |
| `repeats` | integer | count | 1 | Repeats per eye |
| `baselineMs` | integer | ms | 1000 | Pre-stimulus dark capture duration |
| `stimulusMs` | integer | ms | 2500 | LED-on (or external-light-on) duration |
| `redilationMs` | integer | ms | 2000 | Post-stimulus recovery capture duration |
| `asymmetryThreshold` | number | unitless | 20 | **Unvalidated** composite-score threshold |
| `voice` | boolean | — | (device) | Web Speech voice guidance enabled |
| `demoMode` | boolean | — | false | No real controlled stimulus; values illustrative only |
| `externalLight` | boolean | — | false | Operator shines a hand-held torch on voice cue (uncontrolled) |
| `manualStart` | boolean | — | false | Operator triggers the window (tap/voice) instead of auto-start |

### 7.5 Session quality (`SessionQuality`)

| Field | Type | Unit | Description |
|---|---|---|---|
| `exposureLocked` | boolean | — | Camera exposure was locked (manual mode achieved) |
| `whiteBalanceLocked` | boolean | — | White balance was locked |
| `focusLocked` | boolean | — | Focus mode was fixed/continuous as requested |
| `torchControlled` | boolean | — | A real controlled LED stimulus was used |
| `framesDropped` | integer | count | Total unusable frames across the session |
| `blinksRetested` | integer | count | Total blink-triggered re-tests |
| `focusConfidence` | number | 0–1 | Session-level mean focus confidence |
| `unreliable` | boolean | — | True if the run must not be treated as a valid screening result |
| `notes` | string[] | — | Human-readable quality caveats |

### 7.6 Per-frame sample (`PupilSample`)

| Field | Type | Unit | Description |
|---|---|---|---|
| `tMs` | number | ms | Time relative to LED onset (negative = baseline / pre-flash) |
| `diameterMm` | number | mm | Pupil diameter this frame (NaN if not measurable) |
| `irisPx` | number | pixels | Iris horizontal diameter used for the mm scale that frame |
| `dropped` | boolean | — | True if the frame was rejected (blink / no measurement) |
| `focus` | number | 0–1 | Focus/sharpness confidence for the eye ROI that frame |

### 7.7 CSV export layout

The CSV contains: a comment header (`# …` lines: created time, `stimulusDelivered`, indicator,
threshold, score); a **summary** block (`section=summary`) with per-eye metric rows
(`metric,value,unit`); and a **samples** block (`section=samples`) with the raw per-frame series
(`tMs,diameterMm,irisPx,focus,dropped`). The JSON export is the complete `SessionResult` object.

---

## 8. Limitations, error sources & quality control

**This is a screening/teaching demonstrator with material accuracy limitations.**

1. **Visible-light, not infrared.** Clinical pupillometers use IR illumination so the pupil is
   high-contrast and the stimulus is independent of the imaging light. This app images in
   visible light, where iris–pupil contrast is weaker (especially in dark irides) and the LED
   stimulus and imaging illumination interact.
2. **Scale assumption.** The 11.7 mm iris constant ignores individual HVID variation
   (≈ ±0.4 mm SD) and off-axis foreshortening; both bias millimetre values [25,26,27].
3. **Segmentation dependence.** Pupil segmentation depends on focus, lighting, glare, iris
   colour, eyelash occlusion, and framing. Extreme close-ups and glare degrade it.
4. **Timing/framerate.** Metrics are limited by the achievable camera frame rate (target
   ~30 fps) and browser timing; latency/velocity resolution is coarser than dedicated hardware.
5. **Exposure/white-balance locking is best-effort.** When the browser refuses to lock them,
   the illumination step is less controlled — recorded as a quality caveat.
6. **No RAPD detection.** The dwell-and-switch protocol cannot reproduce the swinging-flashlight
   escape phenomenon (§2.3).
7. **Unvalidated indicator.** The asymmetry score and threshold are heuristic and clinically
   unvalidated.

**Quality control in software.** Per-frame focus scoring and pupil plausibility checks;
distance ("too close/too far") diagnostics; blink discard-and-retest; per-eye and session
reliability flags; and explicit surfacing of exposure-lock status, dropped frames, retests, and
focus confidence in the results. Low-quality runs are marked **unreliable** rather than reported
as valid.

---

## 9. Intended use, indications & explicit non-goals

**Intended use.** Education and demonstration of quantitative PLR concepts, and low-stakes
screening/awareness in which measured values and a neutral symmetry indicator may prompt the
user to **seek formal clinical assessment**.

**Explicit non-goals (not built, by design).**

- No true swinging-flashlight RAPD "escape phenomenon" detection (requires simultaneous
  stimulus-isolated bilateral assessment — out of scope for v1).
- No diagnosis, condition detection, or clinical grading of any kind.
- No front-screen white-flash stimulus (rear LED only; the screen faces the operator).
- No claim of pupillometer-grade precision.
- No backend service and no off-device data transmission.

---

## 10. Development breakdown, toolchain & dependencies

### 10.1 Delivery model

- **Build-free runtime.** The shipped app is plain browser **ES modules** (`app/*.js`) loaded by
  `index.html`, with an **import map** resolving the MediaPipe package to a CDN. No Node, bundler,
  or server is required to run or deploy.
- **Optional typed build.** A parallel TypeScript/Vite source tree (`src/`) exists for a typed,
  bundled workflow; it is optional and not required for deployment.
- **Static hosting.** Deployed to GitHub Pages via a GitHub Actions workflow that copies the
  static files (no compilation). Relative asset paths make it work under a project subpath;
  a `.nojekyll` file preserves underscore-prefixed assets.

### 10.2 Third-party components

| Component | Version | Role | License |
|---|---|---|---|
| MediaPipe Tasks-Vision (`@mediapipe/tasks-vision`) | 0.10.14 | FaceLandmarker (478-pt, iris-refined) + WASM runtime | Apache-2.0 |
| `face_landmarker.task` model | float16/1 | Face/iris landmark model asset | (Google model card) |
| Web APIs (browser-native) | — | `getUserMedia`, `MediaStreamTrack` torch/exposure constraints, `speechSynthesis`, `SpeechRecognition`, Canvas 2D | — |
| TypeScript + Vite (`src/`, optional) | TS 5.x / Vite 5.x | Optional typed build | Apache-2.0 / MIT |

The MediaPipe vision WASM runtime and the landmark model are loaded over HTTPS from Google's
CDN/model hosts by default; both may be vendored locally for fully offline hosting (see README).

### 10.3 Module map

| File | Responsibility |
|---|---|
| `app/config.js` | Asset URLs (WASM, model), app version, `IRIS_DIAMETER_MM` constant |
| `app/capabilities.js` | Secure-context / getUserMedia / torch / iOS detection; live-track torch probe |
| `app/camera.js` | Rear-camera stream, exposure/WB/focus locking, **LED torch on/off** |
| `app/facemesh.js` | MediaPipe FaceLandmarker wrapper → per-eye iris centre, iris diameter (px), EAR, ROI |
| `app/pupil.js` | Iris-clamped pupil segmentation (threshold, glint close, components, diameter, focus) |
| `app/gate.js` | CV readiness gate + distance diagnostics |
| `app/protocol.js` | App-owned state machine, timing, blink retest, countdown, voice/manual triggers |
| `app/voice.js` | Voice guidance (speech synthesis) |
| `app/listen.js` | Optional voice-activated trigger (speech recognition; degrades gracefully) |
| `app/metrics.js` | Per-eye metric computation + asymmetry + reliability |
| `app/plot.js` | Pupil-diameter-vs-time plot for both eyes |
| `app/export.js` | JSON / CSV export |
| `app/ui.js` | DOM helpers + the non-dismissable disclaimer |
| `app/main.js` | Screen flow, capability-driven mode selection, wiring, results rendering |

### 10.4 Privacy & data handling

All processing is **local to the browser**. No video, image, or measurement data is uploaded or
stored on any server. Exports (JSON/CSV) are generated in-browser and downloaded by explicit user
action. There is no analytics or telemetry.

---

## 11. References

*Selected peer-reviewed and authoritative sources. Content in this manual has been paraphrased
and summarized for licensing compliance; consult the originals for full detail.*

1. Belliveau AP, Somani AN, Dossani RH. *Neuroanatomy, Pupillary Light Reflexes and Pathway.*
   StatPearls (NCBI Bookshelf, NBK553169). https://www.ncbi.nlm.nih.gov/books/NBK553169/
2. *Pupillary Light Reflex.* StatPearls. https://www.ncbi.nlm.nih.gov/sites/books/n/statpearls/article-28080/
3. *Neuroanatomy, Edinger–Westphal Nucleus.* StatPearls (NBK554555).
   https://www.ncbi.nlm.nih.gov/books/NBK554555/
4. *Neuroanatomy, Pupillary Light Reflexes and Pathway.* StatPearls point-of-care.
   https://www.statpearls.com/point-of-care/890
5. McDougal DH, Gamlin PD, et al. *Functional Organization of the Sympathetic Pathways
   Controlling the Pupil.* Frontiers in Neurology 2018.
   https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2018.01069/full
6. *The Pupillary Light Reflex.* Open Neuroscience (Pressbooks).
   https://uen.pressbooks.pub/neuroscience/chapter/the-pupillary-light-reflex/
7. *Bradley's Neurology in Clinical Practice* — pupillary pathway (afferent/efferent limbs,
   pretectal olivary nucleus, Edinger–Westphal). (Chapter 18.)
8. *Marcus Gunn Pupil (Relative Afferent Pupillary Defect).* StatPearls (NBK557675).
   https://www.ncbi.nlm.nih.gov/books/NBK557675/
9. Ludwig PE, Jessu R, Czyz CN. *The eye: an update from anatomy to physiological functions.*
   Vision (MDPI) 2022. https://www.mdpi.com/2411-5150/6/1/6
10. *The diagnostic significance of pupillary reflex pathways: insights from classical
    examination and advanced pupillometry.* PMC12568719.
    https://pmc.ncbi.nlm.nih.gov/articles/PMC12568719/
11. *Establishing a normative database for quantitative pupillometry in the pediatric
    population.* BMC Ophthalmology 2020;20:121.
    https://link.springer.com/article/10.1186/s12886-020-01389-x (PMC7098071)
12. *Normative Values for Pupillary Light Reflex Metrics Among Healthy Service Academy Cadets.*
    https://pubmed.ncbi.nlm.nih.gov/37522744/
13. *Direct and consensual murine pupillary reflex metrics: establishing normative values.*
    https://pubmed.ncbi.nlm.nih.gov/19683968/
14. Broadway DC. *How to test for a relative afferent pupillary defect (RAPD).* Community Eye
    Health J. PMC5365042. https://pmc.ncbi.nlm.nih.gov/articles/PMC5365042/
15. *Portable pupillography of the swinging-flashlight test.* Ophthalmology.
    http://www.med.upenn.edu/cpob/assets/user-content/documents/PortablePupillographyoftheSwinging.pdf
16. *Detection of asymmetric glaucomatous damage using automated pupillography, the swinging
    flashlight method and the magnified-assisted swinging flashlight method.* Eye 2015.
    https://www.nature.com/articles/eye2015106
17. *Glaucoma Screening Using Relative Afferent Pupillary Defect.* J Glaucoma 2014.
    https://journals.lww.com/glaucomajournal/Abstract/2014/03000/Glaucoma_Screening_Using_Relative_Afferent.8.aspx
18. *Diagnostic accuracy of a modularized, VR-based automated pupillometer for detection of
    RAPD in unilateral optic neuropathies.* Frontiers in Ophthalmology 2024.
    https://www.frontiersin.org/articles/10.3389/fopht.2024.1396511
19. *Pilot Study of Smartphone Infrared Pupillography and Pupillometry.* Clin Ophthalmol
    2022;16:303–310. https://pmc.ncbi.nlm.nih.gov/articles/PMC8840836/
20. *Validation of a Smartphone Pupillometry Application (PupilScreen) in Diagnosing Severe
    Traumatic Brain Injury.* J Neurotrauma 2023.
    https://www.liebertpub.com/doi/abs/10.1089/neu.2022.0516
21. *Mobile Smartphone-Based Digital Pupillometry Curves in the Diagnosis of Traumatic Brain
    Injury.* Frontiers in Neuroscience 2022.
    https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2022.893711/full
22. *SmartPLR: a digital solution for AI-powered smartphone pupillometry.* BMC Ophthalmology
    2025. https://bmcophthalmol.biomedcentral.com/articles/10.1186/s12886-025-04462-5
23. Google Research. *MediaPipe Iris: Real-time Iris Tracking & Depth Estimation.* 2020.
    https://blog.research.google/2020/08/mediapipe-iris-real-time-iris-tracking.html
24. Google AI Edge. *MediaPipe Iris solution documentation.*
    https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/iris.md
25. Rüfer F, Schröder A, Erb C. *White-to-white corneal diameter: normal values in healthy
    humans obtained with the Orbscan II.* Cornea 2005;24(3):259–261.
    https://journals.lww.com/corneajrnl/abstract/2005/04000/white_to_white_corneal_diameter__normal_values_in.3.aspx
26. *White-to-White Corneal Diameter in the Tehran Eye Study.* Cornea 2010.
    https://journals.lww.com/corneajrnl/Abstract/2010/01000/White_to_White_Corneal_Diameter_in_the_Tehran_Eye.3.aspx
27. *Repeatability and agreement of white-to-white measurements* (Orbscan IIz, IOLMaster 700,
    Galilei G2, DRI Triton). PLOS ONE 2021.
    https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0254832

*Content was rephrased for compliance with licensing restrictions.*
