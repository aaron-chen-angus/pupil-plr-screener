/**
 * Voice-activated trigger via the Web Speech RECOGNITION API.
 *
 * This lets a hands-busy operator start a measurement by speaking a wake word
 * (e.g. "go" / "start" / "capture"). Support is patchy: it works in Chrome
 * (incl. Android Chrome) but is unavailable or unreliable in iOS browsers, so
 * it always degrades gracefully and the on-screen "Capture now" button remains
 * the reliable trigger.
 */

const WAKE_WORDS = ["go", "start", "capture", "now", "fire", "shine"];

export class WakeListener {
  constructor(onWake) {
    this.onWake = onWake;
    this.recognition = null;
    this.active = false;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    if (this.supported) {
      try {
        const r = new SR();
        r.continuous = true;
        r.interimResults = true;
        r.lang = "en-US";
        r.onresult = (e) => this.handleResult(e);
        r.onerror = () => {
          /* ignore; keep the button as fallback */
        };
        r.onend = () => {
          // Auto-restart while active (recognition times out periodically).
          if (this.active) {
            try {
              r.start();
            } catch {
              /* already started or blocked */
            }
          }
        };
        this.recognition = r;
      } catch {
        this.supported = false;
      }
    }
  }

  get isSupported() {
    return this.supported;
  }

  handleResult(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = (e.results[i][0]?.transcript || "").toLowerCase();
      if (WAKE_WORDS.some((w) => transcript.includes(w))) {
        this.onWake();
        return;
      }
    }
  }

  start() {
    if (!this.supported || this.active) return;
    this.active = true;
    try {
      this.recognition.start();
    } catch {
      /* may throw if already running */
    }
  }

  stop() {
    this.active = false;
    if (!this.supported) return;
    try {
      this.recognition.stop();
    } catch {
      /* ignore */
    }
  }
}
