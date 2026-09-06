import { probeTorchOnTrack } from "./capabilities";

export interface CameraOpenResult {
  stream: MediaStream;
  track: MediaStreamTrack;
  torchSupported: boolean;
  exposureLocked: boolean;
  whiteBalanceLocked: boolean;
  focusLocked: boolean;
  notes: string[];
}

/**
 * Extended constraint set covering vendor/imaging controls that the standard
 * DOM lib does not yet type (torch, exposure/white-balance/focus modes). These
 * are part of the MediaStream Image Capture spec and are supported by Chrome.
 */
interface ImagingConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  exposureMode?: string;
  whiteBalanceMode?: string;
  focusMode?: string;
}

interface ImagingCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  exposureMode?: string[];
  whiteBalanceMode?: string[];
  focusMode?: string[];
}

interface ImagingSettings extends MediaTrackSettings {
  torch?: boolean;
  exposureMode?: string;
  whiteBalanceMode?: string;
  focusMode?: string;
}

/**
 * Owns the rear camera stream and the LED torch.
 *
 * The app controls torch onset/offset explicitly (never derived from operator
 * motion). If the browser cannot lock exposure / white-balance / focus, that is
 * recorded as a quality caveat rather than silently ignored.
 */
export class CameraController {
  private track: MediaStreamTrack | null = null;
  private stream: MediaStream | null = null;
  private _torchSupported = false;
  private _torchOn = false;

  get torchSupported(): boolean {
    return this._torchSupported;
  }
  get torchOn(): boolean {
    return this._torchOn;
  }
  get videoTrack(): MediaStreamTrack | null {
    return this.track;
  }

  /** Must be called from a user gesture (Start button). */
  async open(): Promise<CameraOpenResult> {
    const constraints: MediaStreamConstraints = {
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

    const notes: string[] = [];
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
  private async applyLocks(
    track: MediaStreamTrack,
    notes: string[]
  ): Promise<{
    exposureLocked: boolean;
    whiteBalanceLocked: boolean;
    focusLocked: boolean;
  }> {
    const caps = (track.getCapabilities?.() ?? {}) as ImagingCapabilities;

    const advanced: ImagingConstraintSet[] = [];
    let wantExposure = false;
    let wantWb = false;
    let wantFocus = false;

    if (caps.exposureMode?.includes("manual")) {
      advanced.push({ exposureMode: "manual" });
      wantExposure = true;
    } else if (caps.exposureMode?.includes("continuous")) {
      // Best effort: at least avoid single-shot re-metering.
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
        const settings = (track.getSettings?.() ?? {}) as ImagingSettings;
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
  async setTorch(on: boolean): Promise<boolean> {
    if (!this.track || !this._torchSupported) return false;
    try {
      const advanced: ImagingConstraintSet[] = [{ torch: on }];
      await this.track.applyConstraints({ advanced });
      this._torchOn = on;
      return true;
    } catch {
      // Torch failed to apply — do NOT pretend it fired.
      this._torchOn = false;
      return false;
    }
  }

  stop(): void {
    if (this._torchOn) {
      // Best-effort torch off.
      void this.setTorch(false);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this._torchOn = false;
  }
}
