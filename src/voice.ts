/**
 * Voice guidance via the Web Speech API (speechSynthesis).
 * Guidance is advisory; the app owns stimulus timing regardless of speech.
 */
export class Voice {
  private enabled: boolean;
  private supported: boolean;

  constructor(enabled: boolean) {
    this.supported = "speechSynthesis" in window;
    this.enabled = enabled && this.supported;
  }

  setEnabled(on: boolean): void {
    this.enabled = on && this.supported;
    if (!on) this.cancel();
  }

  get isSupported(): boolean {
    return this.supported;
  }

  say(text: string): void {
    if (!this.enabled) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch {
      /* non-fatal */
    }
  }

  cancel(): void {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}
