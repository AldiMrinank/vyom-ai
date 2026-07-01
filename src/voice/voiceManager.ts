/**
 * voiceManager.ts
 * Singleton coordinator for the voice pipeline.
 * Prevents duplicate listeners, handles cleanup, and
 * coordinates microphone + TTS + screen share state.
 */

import { SpeechRecognizer } from "./speechRecognition";
import { cancelSpeech, isSpeaking } from "./speechSynthesis";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "muted" | "error" | "vision" | "screenshare";

interface VoiceManagerCallbacks {
  onPhaseChange: (phase: Phase) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onAmplitude: (amp: number) => void;
  onError: (msg: string) => void;
}

export class VoiceManager {
  private recognizer: SpeechRecognizer | null = null;
  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrame: number | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private finalBuffer = "";
  private phase: Phase = "idle";
  private mounted = true;
  private callbacks: VoiceManagerCallbacks;
  private lang = "en-US";
  private silenceMs = 2000;
  private interruptOnSpeak = true;
  private onFinalText: ((text: string, image?: string) => void) | null = null;

  constructor(cb: VoiceManagerCallbacks) {
    this.callbacks = cb;
  }

  /* ── Config ── */
  configure(opts: { lang?: string; silenceMs?: number; interruptOnSpeak?: boolean }) {
    if (opts.lang)            this.lang = opts.lang;
    if (opts.silenceMs)       this.silenceMs = opts.silenceMs;
    if (opts.interruptOnSpeak !== undefined) this.interruptOnSpeak = opts.interruptOnSpeak;
  }

  setOnFinalText(fn: (text: string, image?: string) => void) {
    this.onFinalText = fn;
  }

  /* ── Amplitude ── */
  private async startAmplitude() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micStream = stream;
      const ctx = new AudioContext();
      this.audioCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      this.analyser = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.mounted) return;
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        this.callbacks.onAmplitude(Math.min(avg / 100, 1));
        this.animFrame = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        this.callbacks.onError("Microphone permission denied. Please allow microphone access.");
      }
    }
  }

  private stopAmplitude() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.micStream?.getTracks().forEach(t => t.stop());
    this.audioCtx?.close().catch(() => {});
    this.micStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.callbacks.onAmplitude(0);
  }

  /* ── Recognition ── */
  private buildRecognizer() {
    this.recognizer?.stop();
    this.recognizer = new SpeechRecognizer({
      lang: this.lang,
      continuous: true,
      silenceMs: this.silenceMs,
      onEvent: (e) => {
        if (!this.mounted) return;

        if (e.type === "start") {
          this.setPhase("listening");
        }

        if (e.type === "partial") {
          this.finalBuffer = this.finalBuffer.trimEnd() + " " + e.text;
          this.callbacks.onTranscript(e.text, false);
          // Barge-in: cancel TTS if user starts speaking
          if (this.interruptOnSpeak && (this.phase === "speaking" || isSpeaking())) {
            cancelSpeech();
            this.setPhase("listening");
          }
          this.resetSilence();
        }

        if (e.type === "final") {
          this.finalBuffer += e.text + " ";
          this.callbacks.onTranscript(e.text, true);
          this.clearSilence();
          this.silenceTimer = setTimeout(() => {
            const text = this.finalBuffer.trim();
            if (text) {
              this.finalBuffer = "";
              this.onFinalText?.(text);
            }
          }, 700);
        }

        if (e.type === "error" && e.code !== "no-speech" && e.code !== "aborted") {
          this.callbacks.onError(e.message);
          this.setPhase("error");
        }
      },
    });
  }

  private resetSilence() {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => {
      const text = this.finalBuffer.trim();
      if (text && this.phase === "listening") {
        this.finalBuffer = "";
        this.onFinalText?.(text);
      }
    }, this.silenceMs);
  }

  private clearSilence() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.callbacks.onPhaseChange(p);
  }

  getPhase(): Phase { return this.phase; }

  /* ── Public controls ── */
  async start() {
    this.finalBuffer = "";
    await this.startAmplitude();
    this.buildRecognizer();
    this.recognizer?.start();
    this.setPhase("listening");
  }

  stop() {
    this.clearSilence();
    this.recognizer?.stop();
    this.stopAmplitude();
    cancelSpeech();
    this.setPhase("idle");
    this.finalBuffer = "";
  }

  pause() {
    this.recognizer?.pause();
    this.setPhase("muted");
  }

  resume() {
    this.recognizer?.resume();
    this.setPhase("listening");
  }

  setThinking() { this.setPhase("thinking"); }
  setSpeaking() { this.setPhase("speaking"); }
  setVision()   { this.setPhase("vision"); }
  setScreenShare() { this.setPhase("screenshare"); }

  afterSpeaking(continuousMode: boolean, delayMs = 350) {
    setTimeout(() => {
      if (!this.mounted) return;
      if (continuousMode) {
        this.recognizer?.resume();
        this.setPhase("listening");
      } else {
        this.setPhase("idle");
      }
    }, delayMs);
  }

  updateLang(lang: string) {
    this.lang = lang;
    if (this.phase === "listening") {
      this.buildRecognizer();
      this.recognizer?.start();
    }
  }

  sendManualText(text: string, image?: string) {
    this.clearSilence();
    this.finalBuffer = "";
    this.onFinalText?.(text, image);
  }

  destroy() {
    this.mounted = false;
    this.stop();
  }
}
