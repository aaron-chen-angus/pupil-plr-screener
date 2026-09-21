// Central asset configuration.
//
// MediaPipe needs two things at runtime:
//   1. The vision WASM runtime (a directory of .wasm/.js files).
//   2. The face_landmarker.task model (478-landmark, iris-refined).
//
// STATIC-HOSTING NOTE: These default to Google's official, CORS-enabled,
// HTTPS-served assets so the app works on GitHub Pages without vendoring large
// binaries into the repo. To host fully offline, download the two assets into
// `public/` (see README) and switch the constants below to the relative paths
// documented there. Relative resolution via import.meta.url keeps them valid
// under a project-page subpath.

const MEDIAPIPE_VERSION = "0.10.14";

/** Directory containing the MediaPipe vision WASM runtime. */
export const WASM_BASE_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** The iris-refined face landmarker model. */
export const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export const APP_VERSION = "1.0.0";

/**
 * Optional Google Sheets integration.
 *
 * Paste the "/exec" URL of a deployed Google Apps Script Web App here to enable
 * the "Send to Google Sheets" button on the results screen. Each completed
 * session is POSTed as one flat row (subject details + summary metrics). Leave
 * this as an empty string to hide the button and keep the app fully offline.
 *
 * See README ("Send results to Google Sheets") for the exact setup steps and
 * the Apps Script code to paste.
 */
export const SHEETS_WEBAPP_URL = "";
