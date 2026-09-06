// Central asset configuration (build-free ES module variant).
//
// MediaPipe needs two things at runtime:
//   1. The vision WASM runtime (a directory of .wasm/.js files).
//   2. The face_landmarker.task model (478-landmark, iris-refined).
//
// These default to Google's official, CORS-enabled, HTTPS-served assets so the
// app works on GitHub Pages (and this build-free variant) without vendoring
// large binaries. See README for optional offline vendoring.

const MEDIAPIPE_VERSION = "0.10.14";

/** Directory containing the MediaPipe vision WASM runtime. */
export const WASM_BASE_PATH = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** The iris-refined face landmarker model. */
export const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export const APP_VERSION = "1.0.0";

/** Anatomical iris horizontal diameter used as the px->mm scale reference. */
export const IRIS_DIAMETER_MM = 11.7;
