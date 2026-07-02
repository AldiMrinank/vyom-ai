/**
 * useVoiceMode.ts
 * Central React hook for voice mode.
 * Improvements in this version:
 *   1. Live camera — session stays open, frames captured on-demand
 *   2. Real AudioContext amplitude for mic AND speaker levels
 *   3. Vision memory — last image context persists across turns
 *   4. Quick contextual AI actions (analyze/summarize/explain/translate)
 *   5. Streaming TTS — speaks first sentence the moment it arrives
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceManager } from "@/voice/voiceManager";
import { cancelSpeech, isTTSSupported, getVoicesForLang } from "@/voice/speechSynthesis";
import { StreamingSpeech } from "@/voice/streamingSpeech";
import { LANG_PROFILES, type VoiceLang } from "@/voice/languageDetector";
import {
  startScreenShare, captureScreenFrame,
  isScreenShareSupported, type ScreenShareSession,
} from "@/voice/screenShare";
import { openCameraSession, type LiveCameraSession, fileToDataUrl, compressImage } from "@/voice/cameraManager";
import { streamChat, type ChatMsg } from "@/lib/chat";
import { type OrbPhase } from "@/voice/orbAnimations";

export interface VoiceSettings {
  lang: VoiceLang;
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  continuous: boolean;
  interruptOnSpeak: boolean;
  noiseReduction: boolean;
  streamingTTS: boolean; // new: speak while LLM streams
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  lang: "auto",
  voiceURI: "",
  rate: 1.05,
  pitch: 1.0,
  volume: 0.95,
  autoSpeak: true,
  continuous: true,
  interruptOnSpeak: true,
  noiseReduction: true,
  streamingTTS: true,
};

export interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string;
  ts: number;
}

export type QuickAction = "analyze" | "summarize" | "explain" | "search" | "translate";
export const QUICK_ACTIONS: { id: QuickAction; label: string; icon: string; prompt: string }[] = [
  { id: "analyze",   label: "Analyze",   icon: "📸", prompt: "Analyze this in detail." },
  { id: "summarize", label: "Summarize", icon: "📄", prompt: "Give me a concise summary." },
  { id: "explain",   label: "Explain",   icon: "🧠", prompt: "Explain this clearly and simply." },
  { id: "search",    label: "Search",    icon: "🔍", prompt: "Search for more information on this topic." },
  { id: "translate", label: "Translate", icon: "✨", prompt: "Translate this to English." },
];

export function loadVoiceSettings(): VoiceSettings {
  try { return { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(localStorage.getItem("vyom_voice_settings") || "{}") }; }
  catch { return DEFAULT_VOICE_SETTINGS; }
}
export function saveVoiceSettings(s: VoiceSettings) {
  localStorage.setItem("vyom_voice_settings", JSON.stringify(s));
}

export function useVoiceMode(getToken: () => Promise<string>) {
  const [phase,         setPhase]         = useState<OrbPhase>("idle");
  const [settings,      setSettings]      = useState<VoiceSettings>(loadVoiceSettings);
  const [messages,      setMessages]      = useState<VoiceMessage[]>([]);
  const [partialText,   setPartialText]   = useState("");
  const [transcript,    setTranscript]    = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [error,         setError]         = useState("");
  const [amplitude,     setAmplitude]     = useState(0);
  const [screenActive,  setScreenActive]  = useState(false);
  const [screenTime,    setScreenTime]    = useState(0);
  const [cameraActive,  setCameraActive]  = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);

  const managerRef      = useRef<VoiceManager | null>(null);
  const mountedRef      = useRef(true);
  const abortRef        = useRef<AbortController | null>(null);
  const accRef          = useRef("");
  const settingsRef     = useRef(settings);
  const messagesRef     = useRef(messages);
  const screenRef       = useRef<ScreenShareSession | null>(null);
  const cameraRef       = useRef<LiveCameraSession | null>(null);
  const streamTTSRef    = useRef<StreamingSpeech | null>(null);
  // Vision memory: keep last image context until explicitly cleared
  const visionContextRef = useRef<string | undefined>(undefined);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Screen share timer
  useEffect(() => {
    if (!screenActive) { setScreenTime(0); return; }
    const id = setInterval(() => setScreenTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [screenActive]);

  // ── Real AudioContext amplitude (mic + speaker) ─────────────────────
  // VoiceManager handles mic amplitude internally.
  // We expose it via callback and also hook into TTS via the audio element.

  // ── Build voice system prompt ────────────────────────────────────────
  const buildSystemPrompt = (lp: typeof LANG_PROFILES[0], hasVision: boolean) => {
    const visionNote = hasVision
      ? " The user has shared a visual context (image or screen). Refer to it in your answers and remember it for follow-up questions."
      : "";
    return `You are Vyom AI, a friendly conversational voice assistant. Keep responses SHORT and natural for speaking — 1-3 sentences unless asked for detail. Do NOT use markdown, bullets, headers, or code blocks. Speak plainly.${visionNote} ${lp.systemNote}`;
  };

  // ── Submit to AI with streaming TTS ─────────────────────────────────
  const submitText = useCallback(async (text: string, image?: string) => {
    if (!text.trim() && !image) return;
    if (!mountedRef.current) return;

    // Cancel any ongoing speech/stream
    streamTTSRef.current?.cancel();
    cancelSpeech();
    abortRef.current?.abort();

    const mgr = managerRef.current;
    mgr?.setThinking();
    setPhase("thinking");
    setPartialText(""); setTranscript(""); setStreamingText("");
    accRef.current = "";

    // Vision memory: use provided image or remembered context
    const effectiveImage = image ?? visionContextRef.current;
    if (image) visionContextRef.current = image; // remember for follow-ups

    const userMsg: VoiceMessage = { id: "u-" + Date.now(), role: "user", text, image, ts: Date.now() };
    setMessages(m => [...m, userMsg]);

    // Show quick actions contextually when visual context exists
    if (effectiveImage && !image) setShowQuickActions(true);
    else setShowQuickActions(false);

    const history: ChatMsg[] = messagesRef.current.slice(-10).map(m => ({
      role: m.role,
      content: m.image
        ? [{ type: "text" as const, text: m.text }, { type: "image_url" as const, image_url: { url: m.image } }]
        : m.text,
    }));

    const lp = LANG_PROFILES.find(l => l.id === settingsRef.current.lang) ?? LANG_PROFILES[0];
    const systemPrompt = buildSystemPrompt(lp, !!effectiveImage);

    const userContent: ChatMsg["content"] = effectiveImage
      ? [{ type: "text", text }, { type: "image_url", image_url: { url: effectiveImage } }]
      : text;

    const chatMsgs: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ];

    const s = settingsRef.current;

    // Set up streaming TTS if enabled
    let ttsStarted = false;
    if (s.autoSpeak && s.streamingTTS) {
      streamTTSRef.current = new StreamingSpeech({
        rate: s.rate, pitch: s.pitch, volume: s.volume,
        lang: lp.ttsLang, voiceURI: s.voiceURI || undefined,
        onStart: () => {
          if (!mountedRef.current) return;
          if (!ttsStarted) { ttsStarted = true; mgr?.setSpeaking(); setPhase("speaking"); }
        },
        onEnd: () => {
          if (!mountedRef.current) return;
          mgr?.afterSpeaking(s.continuous, 350);
          setTimeout(() => { if (mountedRef.current) setPhase(s.continuous ? "listening" : "idle"); }, 350);
        },
      });
    }

    abortRef.current = new AbortController();
    try {
      await streamChat({
        messages: chatMsgs,
        getToken,
        signal: abortRef.current.signal,
        onDelta: chunk => {
          accRef.current += chunk;
          if (mountedRef.current) setStreamingText(accRef.current);
          // Feed streaming TTS chunk by chunk
          streamTTSRef.current?.push(chunk);
        },
        onDone: () => {
          // Flush any remaining text to TTS
          streamTTSRef.current?.flush();
        },
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!mountedRef.current) return;
      streamTTSRef.current?.cancel();
      const msg = err instanceof Error ? err.message : "AI error";
      setError(msg);
      setPhase("error");
      setTimeout(() => { if (mountedRef.current) { setError(""); setPhase("idle"); } }, 4000);
      return;
    }

    if (!mountedRef.current) return;

    const finalText = accRef.current.trim();
    setMessages(m => [...m, { id: "a-" + Date.now(), role: "assistant", text: finalText, ts: Date.now() }]);
    setStreamingText("");

    // If streaming TTS was NOT used, fall back to speaking the full response
    if (s.autoSpeak && !s.streamingTTS && finalText) {
      const { speak } = await import("@/voice/speechSynthesis");
      mgr?.setSpeaking(); setPhase("speaking");
      speak(finalText, {
        rate: s.rate, pitch: s.pitch, volume: s.volume,
        lang: lp.ttsLang, voiceURI: s.voiceURI || undefined,
        onStart: () => { if (mountedRef.current) setPhase("speaking"); },
        onEnd: () => {
          if (!mountedRef.current) return;
          mgr?.afterSpeaking(s.continuous, 350);
          setTimeout(() => { if (mountedRef.current) setPhase(s.continuous ? "listening" : "idle"); }, 350);
        },
      });
    } else if (!s.autoSpeak) {
      setPhase(s.continuous ? "listening" : "idle");
    }
    // If streamingTTS is on, TTS onEnd handles the phase transition
  }, [getToken]);

  // ── VoiceManager init ────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const mgr = new VoiceManager({
      onPhaseChange: p => { if (mountedRef.current) setPhase(p as OrbPhase); },
      onTranscript: (text, isFinal) => {
        if (!mountedRef.current) return;
        if (isFinal) setTranscript(text);
        else         setPartialText(text);
      },
      onAmplitude: amp => { if (mountedRef.current) setAmplitude(amp); },
      onError: msg => { if (mountedRef.current) { setError(msg); setPhase("error"); } },
    });
    mgr.setOnFinalText((text, img) => submitText(text, img));
    managerRef.current = mgr;

    return () => {
      mountedRef.current = false;
      mgr.destroy();
      screenRef.current?.stop();
      cameraRef.current?.stop();
      streamTTSRef.current?.cancel();
    };
  }, [submitText]);

  useEffect(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const lp = LANG_PROFILES.find(l => l.id === settings.lang) ?? LANG_PROFILES[0];
    mgr.configure({ lang: lp.bcp47, silenceMs: 2000, interruptOnSpeak: settings.interruptOnSpeak });
    mgr.updateLang(lp.bcp47);
  }, [settings.lang, settings.interruptOnSpeak]);

  // ── Public API ───────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError(""); await managerRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    managerRef.current?.stop();
    streamTTSRef.current?.cancel();
    setPartialText(""); setTranscript(""); setStreamingText("");
  }, []);

  const mute    = useCallback(() => managerRef.current?.pause(), []);
  const unmute  = useCallback(() => managerRef.current?.resume(), []);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    streamTTSRef.current?.cancel();
    cancelSpeech();
    if (settingsRef.current.continuous) {
      managerRef.current?.resume(); setPhase("listening");
    } else { setPhase("idle"); }
  }, []);

  const sendText = useCallback((text: string, image?: string) => {
    managerRef.current?.sendManualText(text, image);
  }, []);

  const triggerQuickAction = useCallback((action: QuickAction) => {
    const qa = QUICK_ACTIONS.find(a => a.id === action);
    if (!qa) return;
    setShowQuickActions(false);
    submitText(qa.prompt);
  }, [submitText]);

  // ── Live Camera ──────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const session = await openCameraSession("environment");
      cameraRef.current = session;
      setCameraActive(true);
      managerRef.current?.setVision();
      setPhase("vision");
    } catch { setError("Could not open camera."); }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    cameraRef.current = null;
    setCameraActive(false);
    setPhase(settingsRef.current.continuous ? "listening" : "idle");
  }, []);

  const captureFromCamera = useCallback((text?: string) => {
    if (!cameraRef.current) return;
    const dataUrl = cameraRef.current.captureFrame(0.82);
    submitText(text || "What do you see?", dataUrl);
  }, [submitText]);

  const switchCameraFacing = useCallback(async () => {
    await cameraRef.current?.switchFacing();
  }, []);

  // ── Screen Share ─────────────────────────────────────────────────────
  const startScreenShareMode = useCallback(async () => {
    if (!isScreenShareSupported()) { setError("Screen sharing not supported in this browser."); return; }
    try {
      const session = await startScreenShare();
      screenRef.current = session;
      setScreenActive(true);
      managerRef.current?.setScreenShare();
      setPhase("screenshare");
      session.stream.getVideoTracks()[0].onended = () => {
        screenRef.current = null;
        setScreenActive(false);
        setPhase(settingsRef.current.continuous ? "listening" : "idle");
      };
      const frame = captureScreenFrame(session.video);
      submitText("I've shared my screen with you. What can you see?", frame);
    } catch (e: any) {
      if (e.name !== "NotAllowedError") setError("Could not start screen share.");
    }
  }, [submitText]);

  const captureAndAsk = useCallback((text?: string) => {
    if (!screenRef.current) return;
    const frame = captureScreenFrame(screenRef.current.video);
    submitText(text || "What do you see on my screen?", frame);
  }, [submitText]);

  const stopScreenShare = useCallback(() => {
    screenRef.current?.stop();
    screenRef.current = null;
    setScreenActive(false); setScreenTime(0);
    setPhase(settingsRef.current.continuous ? "listening" : "idle");
  }, []);

  const clearVisionContext = useCallback(() => {
    visionContextRef.current = undefined;
    setShowQuickActions(false);
  }, []);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings(prev => { const next = { ...prev, ...patch }; saveVoiceSettings(next); return next; });
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]); setPartialText(""); setTranscript(""); setStreamingText("");
    visionContextRef.current = undefined; setShowQuickActions(false);
  }, []);

  const langProfile = LANG_PROFILES.find(l => l.id === settings.lang) ?? LANG_PROFILES[0];

  return {
    phase, settings, messages, partialText, transcript, streamingText,
    error, amplitude, screenActive, screenTime, cameraActive, langProfile,
    showQuickActions,
    start, stop, mute, unmute, interrupt, sendText, triggerQuickAction,
    startCamera, stopCamera, captureFromCamera, switchCameraFacing,
    startScreenShareMode, captureAndAsk, stopScreenShare, clearVisionContext,
    updateSettings, clearHistory,
    isTTSSupported: isTTSSupported(),
    isScreenShareSupported: isScreenShareSupported(),
    availableVoices: getVoicesForLang(langProfile.ttsLang),
    hasVisionContext: !!visionContextRef.current,
    getCameraSession: () => cameraRef.current,
  };
}
