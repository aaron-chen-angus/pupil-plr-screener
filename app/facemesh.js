import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

import { MODEL_ASSET_PATH, WASM_BASE_PATH, IRIS_DIAMETER_MM } from "./config.js";

export { IRIS_DIAMETER_MM };

/**
 * MediaPipe FaceLandmarker (iris-refined) wrapper.
 *
 * The 478-landmark face model includes refined iris landmarks:
 *   right iris: indices 468-472  (center 468)
 *   left  iris: indices 473-477  (center 473)
 * NOTE: FaceMesh gives the IRIS, not the pupil. The pupil is segmented
 * separately (see pupil.js). The iris diameter is used only as a mm scale ref.
 *
 * "left"/"right" are the SUBJECT's anatomical eyes. Because the operator uses
 * the rear camera, the image is not mirrored; we resolve sidedness from
 * landmark geometry, not screen position.
 */

const RIGHT_IRIS = [468, 469, 470, 471, 472];
const LEFT_IRIS = [473, 474, 475, 476, 477];

const RIGHT_EYE = {
  left: 33,
  right: 133,
  top: 159,
  bottom: 145,
  topInner: 158,
  bottomInner: 153,
};
const LEFT_EYE = {
  left: 362,
  right: 263,
  top: 386,
  bottom: 374,
  topInner: 385,
  bottomInner: 380,
};

export class FaceMeshTracker {
  constructor() {
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  detect(video, tsMs) {
    if (!this.landmarker) {
      return { present: false, faces: 0, right: null, left: null };
    }
    if (video.currentTime === this.lastVideoTime) {
      return { present: false, faces: 0, right: null, left: null };
    }
    this.lastVideoTime = video.currentTime;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return { present: false, faces: 0, right: null, left: null };

    let result;
    try {
      result = this.landmarker.detectForVideo(video, tsMs);
    } catch {
      return { present: false, faces: 0, right: null, left: null };
    }

    const lm = result.faceLandmarks?.[0];
    if (!lm) {
      return {
        present: false,
        faces: result.faceLandmarks?.length ?? 0,
        right: null,
        left: null,
      };
    }

    return {
      present: true,
      faces: result.faceLandmarks.length,
      right: this.irisInfo(lm, RIGHT_IRIS, RIGHT_EYE, w, h),
      left: this.irisInfo(lm, LEFT_IRIS, LEFT_EYE, w, h),
    };
  }

  irisInfo(lm, irisIdx, eye, w, h) {
    const pts = irisIdx.map((i) => lm[i]).filter(Boolean);
    if (pts.length < 5) return null;

    const cx = (pts[0].x ?? 0) * w;
    const cy = (pts[0].y ?? 0) * h;

    const p1 = pts[1];
    const p3 = pts[3];
    const horiz = Math.hypot((p1.x - p3.x) * w, (p1.y - p3.y) * h);
    const p2 = pts[2];
    const p4 = pts[4];
    const vert = Math.hypot((p2.x - p4.x) * w, (p2.y - p4.y) * h);
    const diameterPx = Math.max(horiz, vert);

    const top = lm[eye.top];
    const bottom = lm[eye.bottom];
    const topI = lm[eye.topInner];
    const bottomI = lm[eye.bottomInner];
    const left = lm[eye.left];
    const right = lm[eye.right];
    const vertA = Math.hypot((top.x - bottom.x) * w, (top.y - bottom.y) * h);
    const vertB = Math.hypot(
      (topI.x - bottomI.x) * w,
      (topI.y - bottomI.y) * h
    );
    const horizW = Math.hypot((left.x - right.x) * w, (left.y - right.y) * h);
    const ear = horizW > 0 ? (vertA + vertB) / (2 * horizW) : 0;

    const pad = diameterPx * 0.9;
    const roi = {
      x: Math.max(0, cx - diameterPx / 2 - pad),
      y: Math.max(0, cy - diameterPx / 2 - pad),
      w: Math.min(w, diameterPx + pad * 2),
      h: Math.min(h, diameterPx + pad * 2),
    };

    return { centerPx: { x: cx, y: cy }, diameterPx, ear, roi };
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
