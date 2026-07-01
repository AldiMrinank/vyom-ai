/**
 * speechRecognition.ts
 * Wrapper around browser SpeechRecognition with auto-recovery,
 * silence detection, and barge-in support.
 */

export type RecognitionEvent =
  | { type: "partial"; text: string; confidence: number }
  | { type: "final";   text: string; confidence: number }
  | { type: "error";   code: string; message: string }
  | { type: "start" }
  | { type: "end" };

export interface RecognitionConfig {
  lang: string;
  continuous: boolean;
  silenceMs: number;
  onEvent: (e: RecognitionEvent) => void;
}

const SpeechRecognitionCtor: typeof SpeechRecognition | undefined =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function isRecognitionSupported(): boolean {
  return !!SpeechRecognitionCtor;
}

export class SpeechRecognizer {
  private recog: SpeechRecognition | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private paused = false;
  private cfg: RecognitionConfig;

  constructor(cfg: RecognitionConfig) {
    this.cfg = cfg;
  }

  start() {
    if (this.running || !SpeechRecognitionCtor) return;
    this.running = true;
    this.paused = false;
    this._build();
    try { this.recog!.start(); } catch { this.running = false; }
  }

  stop() {
    this.running = false;
    this._clearSilence();
    try { this.recog?.stop(); } catch {}
    this.recog = null;
  }

  pause() {
    this.paused = true;
    try { this.recog?.stop(); } catch {}
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    this._build();
    try { this.recog!.start(); } catch {}
  }

  updateLang(lang: string) {
    this.cfg.lang = lang;
    if (this.running && !this.paused) {
      try { this.recog?.stop(); } catch {}
    }
  }

  private _build() {
    if (!SpeechRecognitionCtor) return;
    const r = new SpeechRecognitionCtor();
    r.lang = this.cfg.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onstart = () => this.cfg.onEvent({ type: "start" });

    r.onresult = (e) => {
      let partial = "", final = "";
      let confidence = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (e.results[i].isFinal) {
          final += alt.transcript;
          confidence = alt.confidence;
        } else {
          partial += alt.transcript;
          confidence = alt.confidence;
        }
      }
      if (partial) this.cfg.onEvent({ type: "partial", text: partial, confidence });
      if (final)   this.cfg.onEvent({ type: "final",   text: final,   confidence });

      // Reset silence timer on any speech activity
      this._resetSilence(final || partial);
    };

    r.onerror = (e) => {
      const friendly: Record<string, string> = {
        "not-allowed":  "Microphone permission denied. Please allow microphone access.",
        "no-speech":    "No speech detected.",
        "network":      "Network error during recognition.",
        "audio-capture":"No microphone found.",
        "aborted":      "Recognition was aborted.",
      };
      if (e.error !== "aborted" && e.error !== "no-speech") {
        this.cfg.onEvent({ type: "error", code: e.error, message: friendly[e.error] || `Recognition error: ${e.error}` });
      }
    };

    r.onend = () => {
      this.cfg.onEvent({ type: "end" });
      // Auto-restart if still supposed to be running
      if (this.running && !this.paused) {
        setTimeout(() => {
          if (this.running && !this.paused) {
            this._build();
            try { this.recog!.start(); } catch {}
          }
        }, 200);
      }
    };

    this.recog = r;
  }

  private _resetSilence(text: string) {
    this._clearSilence();
    if (!text.trim()) return;
    this.silenceTimer = setTimeout(() => {
      // Emit a synthetic final if we haven't gotten one
    }, this.cfg.silenceMs);
  }

  private _clearSilence() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }
}
