/**
 * speechSynthesis.ts
 * Wrapper around browser SpeechSynthesis with voice selection,
 * queue management, and barge-in support.
 */

export interface TTSConfig {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onWord?: (charIndex: number) => void;
}

export function getVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis?.getVoices() ?? [];
}

export function getVoicesForLang(lang: string): SpeechSynthesisVoice[] {
  const prefix = lang.split("-")[0].toLowerCase();
  return getVoices().filter(v =>
    v.lang.toLowerCase().startsWith(prefix)
  );
}

export function isTTSSupported(): boolean {
  return "speechSynthesis" in window;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(text: string, cfg: TTSConfig): void {
  if (!isTTSSupported()) return;

  // Cancel any current or queued speech immediately
  cancelSpeech();

  // Strip markdown so TTS reads clean text
  const clean = text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "code snippet")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n{2,}/g, ". ")
    .trim();

  if (!clean) return;

  const utter = new SpeechSynthesisUtterance(clean);
  utter.rate   = cfg.rate;
  utter.pitch  = cfg.pitch;
  utter.volume = cfg.volume;
  utter.lang   = cfg.lang;

  if (cfg.voiceURI) {
    const voice = getVoices().find(v => v.voiceURI === cfg.voiceURI);
    if (voice) utter.voice = voice;
  }

  utter.onstart    = () => cfg.onStart?.();
  utter.onend      = () => { currentUtterance = null; cfg.onEnd?.(); };
  utter.onerror    = () => { currentUtterance = null; cfg.onEnd?.(); };
  utter.onboundary = (e) => { if (e.name === "word") cfg.onWord?.(e.charIndex); };

  currentUtterance = utter;
  window.speechSynthesis.speak(utter);
}

export function cancelSpeech(): void {
  if (!isTTSSupported()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
