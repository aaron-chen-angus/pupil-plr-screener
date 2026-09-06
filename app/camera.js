import { probeTorchOnTrack } from "./capabilities.js";

/**
 * Owns the rear camera stream and the LED torch.
 *
 * The app controls torch onset/offset explicitly (never derived from operator
 * motion). If the browser cannot lock exposure / white-balance / focus, that is
 * recorded as a quality caveat rather than silently ignored.
 */
export class CameraController {
  constructor() {
    this.track = null;
    this.stream = null;
    this._torchSupported = false;
    this._torchOn = false;
  }

  get torchSupported() {
    return this._torchSupported;
  }
  get torchOn() {
    return this._torchOn;
  }
  get videoTrack() {
    return this.track;
  }

  /** Must be called from a user gesture (Start button). */
  async open() {
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("No video track available from the camera.");
    }

    this.stream = stream;
    this.track = track;
    this._torchSupported = probeTorchOnTrack(track);

    const notes = [];
    const locks = await this.applyLocks(track, notes);

    return {
      stream,
      track,
      torchSupported: this._torchSupported,
      exposureLocked: locks.exposureLocked,
      whiteBalanceLocked: locks.whiteBalanceLocked,
      focusLocked: locks.focusLocked,
      notes,
    };
  }

  /**
   * Attempt to lock exposure and white balance (and focus) so the LED stimulus
   * produces a consistent, measurable illumination step. Records caveats when
   * the browser refuses or does not expose a given control.
   */
  async applyLocks(track, notes) {
    const caps = track.getCapabilities?.() ?? {};

    const advanced = [];
    let wantExposure = false;
    let wantWb = false;
    let wantFocus = false;

    if (caps.exposureMode?.includes("manual")) {
      advanced.push({ exposureMode: "manual" });
      wantExposure = true;
    } else if (caps.exposureMode?.includes("continuous")) {
      advanced.push({ exposureMode: "continuous" });
    }

    if (caps.whiteBalanceMode?.includes("manual")) {
      advanced.push({ whiteBalanceMode: "manual" });
      wantWb = true;
    }

    if (caps.focusMode?.includes("continuous")) {
      advanced.push({ focusMode: "continuous" });
      wantFocus = true;
    } else if (caps.focusMode?.includes("manual")) {
      advanced.push({ focusMode: "manual" });
      wantFocus = true;
    }

    let exposureLocked = false;
    let whiteBalanceLocked = false;
    let focusLocked = false;

    if (advanced.length) {
      try {
        await track.applyConstraints({ advanced });
        const settings = track.getSettings?.() ?? {};
        exposureLocked = wantExposure && settings.exposureMode === "manual";
        whiteBalanceLocked = wantWb && settings.whiteBalanceMode === "manual";
        focusLocked =
          wantFocus &&
          (settings.focusMode === "manual" ||
            settings.focusMode === "continuous");
      } catch {
        notes.push(
          "Camera refused exposure/white-balance/focus lock; measurements are best-effort under variable auto-exposure."
        );
      }
    }

    if (!exposureLocked) notes.push("Exposure not locked (quality caveat).");
    if (!whiteBalanceLocked)
      notes.push("White balance not locked (quality caveat).");

    return { exposureLocked, whiteBalanceLocked, focusLocked };
  }

  /** Turn the LED torch on/off. Returns true if the requested state was applied. */
  async setTorch(on) {
    if (!this.track || !this._torchSupported) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      this._torchOn = on;
      return true;
    } catch {
      // Torch failed to apply — do NOT pretend it fired.
      this._torchOn = false;
      return false;
    }
  }

  stop() {
    if (this._torchOn) {
      void this.setTorch(false);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this._torchOn = false;
  }
}
