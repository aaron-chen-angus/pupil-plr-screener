# PLR Screener (pupillary light reflex) — screening & teaching demo

An operator-held **pupillary light reflex (PLR) screener and teaching demonstrator**.
The operator holds the phone and points the **rear camera + LED flash** at a patient's
eyes. A voice-guided "dwell-and-switch" protocol tells the operator which eye to hold on,
verifies (via computer vision) that the correct eye is centered, open, and in focus, then
the **app** fires the LED for a fixed interval and measures each pupil's light reflex. It
reports per-eye metrics and a neutral **symmetric / asymmetric — consider referral**
indicator.

> ## ⚠️ Not a medical device
> **This is a screening and education tool, not a diagnostic test.** It does **not** detect
> or rule out RAPD, optic neuropathy, or any condition, and never outputs a diagnosis. The
> asymmetry threshold is an **unvalidated** screening parameter, not a clinical cutoff. For
> any clinical concern, refer to an ophthalmologist.

> 📖 **Full reference manual:** see **[`DOCUMENTATION.md`](./DOCUMENTATION.md)** for the
> detailed scientific and clinical basis (with peer-reviewed references), the complete technical
> architecture and measurement pipeline, the mathematical metric definitions, and a comprehensive
> **data dictionary** of every variable collected.

## What it does

- Rear-camera capture with **app-controlled LED torch** timing (baseline dark → LED on →
  redilation). Stimulus onset/offset is owned by the app, never derived from operator motion.
- **MediaPipe FaceLandmarker** (iris-refined, 478 landmarks) locates the eye and iris. The
  iris horizontal diameter (~11.7 mm) is the px→mm scale reference.
- The **pupil** is segmented separately inside the iris ROI (dark-region thresholding with
  corneal-glint rejection and an ellipse/area fit) — FaceMesh gives the iris, not the pupil.
- A **CV gate** requires exactly one eye centered, open (not mid-blink), and in focus before
  firing, with a live "ready" indicator.
- **Voice guidance** via the Web Speech API ("hold right" → measure → "now move to left").
- Blink during a window → auto-discard and retest that eye.
- Per-eye metrics: baseline, minimum diameter, % constriction, latency, mean/max constriction
  velocity, redilation trace. Plus an interocular asymmetry summary.
- **Quality flags** per session (exposure locked, frames dropped, blinks retested, focus
  confidence). Low-quality runs are marked **unreliable**, not reported as valid.
- Overlaid pupil-diameter-vs-time plot for both eyes, and **JSON / CSV export**.

## Platform requirements (important)

- **Primary target: Android Chrome.** LED torch control from the web uses
  `MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] })`, which **iOS Safari
  does not support**.
- On devices without torch control the app **detects this at startup** and offers a clearly
  labeled **demo mode (no controlled stimulus)** or explains the limitation — it never
  pretends the LED fired.
- Camera and torch require a **secure context (HTTPS)**. `getUserMedia` is only triggered by
  a **user gesture** (the Start button), never auto-started on load.
- Open the app **over HTTPS on the phone** (e.g. the GitHub Pages URL). Camera and torch will
  not work over plain HTTP or when opened as a local file.

## Run it (no build required)

This app is **build-free**. The deployable site is just static files that run directly in the
browser using native ES modules plus an [import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap)
that resolves MediaPipe from a CDN. **No Node, npm, or bundler is needed to run or deploy.**

The runtime entry points are:

- `index.html` — the page (with the import map and a `<link>` to the stylesheet)
- `app/*.js` — the application ES modules (plain browser JavaScript)
- `src/styles.css` — the stylesheet

Because the camera and torch require a **secure context (HTTPS)**, you must serve the files
over HTTP(S) (opening `index.html` as a `file://` URL will not grant camera access). Any
static server works. Examples:

```bash
# Node (if available)
npx serve .

# Python 3
python -m http.server 8080

# VS Code: right-click index.html -> "Open with Live Server"
```

Then open the served URL. For camera + torch on a phone, use HTTPS — the easiest path is to
deploy to GitHub Pages (below) and open that HTTPS URL on an Android Chrome device.

### Optional: build with Vite

A Vite/TypeScript version of the same app also lives in `src/` for those who prefer a typed,
bundled workflow. It is entirely optional — the build-free `app/` variant is what ships.

```bash
npm install
npm run dev        # typed dev server
npm run build      # bundles src/ to dist/
```

## Deploy to GitHub Pages

This app is a **fully static** client-side site — no backend and **no build step** at runtime.

1. Push the repo to GitHub with the default branch named `main`.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) assembles the static files
   (`index.html`, `app/`, `src/styles.css`) into a `site/` directory and publishes it on every
   push to `main` (and can be run manually via **Actions → Deploy to GitHub Pages → Run
   workflow**). It requires **no Node/npm** — it just copies files.
4. After the first successful run, the app is served at
   `https://<user>.github.io/<repo>/`.

### Why it works under a project subpath

- Every local reference is **relative** (`./app/*.js`, `./src/styles.css`), so it resolves
  correctly under `/<repo>/` regardless of the repository name — no root-domain assumption.
- The MediaPipe bare specifier is resolved by an **import map** in `index.html` to an absolute
  HTTPS CDN URL, so it is unaffected by the subpath.
- A `.nojekyll` file is created in the published site so GitHub Pages does not strip
  files/folders beginning with an underscore.

### MediaPipe model & WASM assets

By default the app loads the MediaPipe **vision WASM** runtime and the **face_landmarker.task**
model from Google's official, HTTPS + CORS-enabled hosts (see `src/config.ts`). This keeps
large binaries out of the repo and works on GitHub Pages out of the box.

**To host fully offline / self-contained**, download the two assets into `public/` and point
`src/config.ts` at relative paths:

```bash
# model (~3–4 MB)
curl -L -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

# wasm runtime: copy the folder shipped with the npm package
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe-wasm
```

Then in `src/config.ts`:

```ts
export const WASM_BASE_PATH = new URL("../mediapipe-wasm", import.meta.url).href;
export const MODEL_ASSET_PATH = new URL("../models/face_landmarker.task", import.meta.url).href;
```

Using `new URL(..., import.meta.url)` keeps these paths valid under the Pages subpath.

## Measurement notes & limitations

- Iris diameter is used as a fixed physical scale (~11.7 mm). Individual variation and eye
  off-axis angle introduce error; treat all millimetre values as approximate.
- Pupil segmentation depends on illumination and focus. Locked exposure/white balance improve
  consistency; when the browser refuses to lock them, this is recorded as a **quality caveat**.
- This is **not** a pupillometer-grade instrument and makes no claim of clinical precision.

## Explicit non-goals

- No swinging-flashlight RAPD "escape phenomenon" detection.
- No diagnosis, condition detection, or clinical grading.
- No front-screen white-flash stimulus (rear LED only; the screen faces the operator).
- No backend service; nothing that breaks static GitHub Pages hosting.
