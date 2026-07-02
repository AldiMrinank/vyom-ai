/**
 * streamingSpeech.ts
 * Sentence-boundary streaming TTS.
 * Starts speaking as soon as the first complete sentence arrives
 * from the LLM stream — reducing perceived latency significantly.
 *
 * Flow:
 *   LLM streams tokens
 *   → push() accumulates them
 *   → When a sentence boundary is detected, that chunk is spoken immediately
 *   → Remaining chunks queue up and play back-to-back without gaps
 *   → flush() speaks any leftover text when stream ends
 */

import { cancelSpeech } from "./speechSynthesis";

const SENTENCE_END = /[.!?।]\s+|[.!?।]$/;
const MIN_CHUNK = 30; // chars — avoid speaking tiny fragments

export interface StreamTTSConfig {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
  voiceURI?: string;
  onStart?: () => void;   // called when first chunk begins playing
  onEnd?: () => void;     // called when all chunks are done
  onChunkEnd?: () => void; // called after each chunk
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/\*(.+?)\*/gs, "$1")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "code snippet")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export class StreamingSpeech {
  private cfg: StreamTTSConfig;
  private buffer = "";
  private queue: string[] = [];
  private speaking = false;
  private cancelled = false;
  private started = false;
  private totalChunks = 0;
  private spokenChunks = 0;

  constructor(cfg: StreamTTSConfig) {
    this.cfg = cfg;
  }

  /** Feed an LLM delta token. Speaks as soon as a sentence is complete. */
  push(token: string) {
    if (this.cancelled) return;
    this.buffer += token;

    // Check for sentence boundary
    const match = this.buffer.search(SENTENCE_END);
    if (match !== -1) {
      const end = match + this.buffer.slice(match).match(SENTENCE_END)![0].length;
      const chunk = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end);
      if (chunk.length >= MIN_CHUNK) {
        this._enqueue(chunk);
      }
    }
  }

  /** Call when the LLM stream ends. Speaks any remaining buffered text. */
  flush() {
    if (this.cancelled) return;
    const remainder = this.buffer.trim();
    this.buffer = "";
    if (remainder.length > 0) this._enqueue(remainder);
  }

  /** Cancel all queued and current speech immediately. */
  cancel() {
    this.cancelled = true;
    this.queue = [];
    cancelSpeech();
    this.speaking = false;
  }

  private _enqueue(text: string) {
    const clean = stripMarkdown(text);
    if (!clean) return;
    this.queue.push(clean);
    this.totalChunks++;
    if (!this.speaking) this._playNext();
  }

  private _playNext() {
    if (this.cancelled || this.queue.length === 0) {
      this.speaking = false;
      if (this.spokenChunks > 0 && this.spokenChunks === this.totalChunks) {
        this.cfg.onEnd?.();
      }
      return;
    }

    this.speaking = true;
    const text = this.queue.shift()!;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate   = this.cfg.rate;
    utter.pitch  = this.cfg.pitch;
    utter.volume = this.cfg.volume;
    utter.lang   = this.cfg.lang;

    if (this.cfg.voiceURI) {
      const voice = window.speechSynthesis.getVoices().find(v => v.voiceURI === this.cfg.voiceURI);
      if (voice) utter.voice = voice;
    }

    utter.onstart = () => {
      if (!this.started) {
        this.started = true;
        this.cfg.onStart?.();
      }
    };

    utter.onend = () => {
      this.spokenChunks++;
      this.cfg.onChunkEnd?.();
      this._playNext();
    };

    utter.onerror = () => {
      this.spokenChunks++;
      this._playNext();
    };

    window.speechSynthesis.speak(utter);
  }
}
