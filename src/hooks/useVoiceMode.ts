/**
 * useVoiceMode.ts — central React hook for voice mode.
 * Uses VoiceManager for all audio coordination.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceManager } from "@/voice/voiceManager";
import { speak, cancelSpeech, isTTSSupported, getVoicesForLang } from "@/voice/speechSynthesis";
import { LANG_PROFILES, type VoiceLang } from "@/voice/languageDetector";
import { startScreenShare, captureScreenFrame, isScreenShareSupported, type ScreenShareSession } from "@/voice/screenShare";
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
};

export interface VoiceMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string;
  ts: number;
}

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
  const [screenSession, setScreenSession] = useState<ScreenShareSession | null>(null);
  const [screenActive,  setScreenActive]  = useState(false);
  const [screenTime,    setScreenTime]    = useState(0);

  const managerRef  = useRef<VoiceManager | null>(null);
  const mountedRef  = useRef(true);
  const abortRef    = useRef<AbortController | null>(null);
  const accRef      = useRef("");
  const settingsRef = useRef(settings);
  const messagesRef = useRef(messages);
  const lastImageRef = useRef<string | undefined>(undefined); // vision context memory

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Screen share timer
  useEffect(() => {
    if (!screenActive) { setScreenTime(0); return; }
    const id = setInterval(() => setScreenTime(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [screenActive]);

  // ── Submit text (+ optional image) to AI ──────────────────────────────
  const submitText = useCallback(async (text: string, image?: string) => {
    if (!text.trim() && !image) return;
    if (!mountedRef.current) return;

    const mgr = managerRef.current;
    cancelSpeech();
    mgr?.setThinking();
    setPhase("thinking");
    setPartialText("");
    setTranscript("");
    setStreamingText("");
    accRef.current = "";

    // Vision context: reuse last image if none provided
    const effectiveImage = image ?? lastImageRef.current;
    if (image) lastImageRef.current = image;

    const userMsg: VoiceMessage = { id: "u-" + Date.now(), role: "user", text, image, ts: Date.now() };
    setMessages(m => [...m, userMsg]);

    // Build context window (last 10 msgs)
    const history: ChatMsg[] = messagesRef.current.slice(-10).map(m => ({
      role: m.role,
      content: m.image
        ? [{ type: "text" as const, text: m.text }, { type: "image_url" as const, image_url: { url: m.image } }]
        : m.text,
    }));

    const s = settingsRef.current;
    const langProfile = LANG_PROFILES.find(l => l.id === s.lang) ?? LANG_PROFILES[0];
    const systemPrompt = `You are Vyom AI, a friendly conversational voice assistant. Keep responses SHORT and natural for speaking — 1-3 sentences max unless asked for detail. Do NOT use markdown, bullets, headers, or code blocks. Speak plainly. ${langProfile.systemNote}`;

    const userContent: ChatMsg["content"] = effectiveImage
      ? [{ type: "text", text }, { type: "image_url", image_url: { url: effectiveImage } }]
      : text;

    const chatMsgs: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent },
    ];

    abortRef.current = new AbortController();
    try {
      await streamChat({
        messages: chatMsgs,
        getToken,
        signal: abortRef.current.signal,
        onDelta: chunk => {
          accRef.current += chunk;
          if (mountedRef.current) setStreamingText(accRef.current);
        },
        onDone: () => {},
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      if (!mountedRef.current) return;
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

    if (s.autoSpeak && finalText) {
      mgr?.setSpeaking();
      setPhase("speaking");
      speak(finalText, {
        rate: s.rate, pitch: s.pitch, volume: s.volume,
        lang: langProfile.ttsLang,
        voiceURI: s.voiceURI || undefined,
        onStart: () => { if (mountedRef.current) { mgr?.setSpeaking(); setPhase("speaking"); } },
        onEnd: () => {
          if (!mountedRef.current) return;
          // Natural 350ms pause before listening again
          mgr?.afterSpeaking(s.continuous, 350);
          setTimeout(() => {
            if (!mountedRef.current) return;
            setPhase(s.continuous ? "listening" : "idle");
          }, 350);
        },
      });
    } else {
      setPhase(s.continuous ? "listening" : "idle");
    }
  }, [getToken]);

  // ── Init VoiceManager ──────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    const mgr = new VoiceManager({
      onPhaseChange: p => { if (mountedRef.current) setPhase(p as OrbPhase); },
      onTranscript:  (text, isFinal) => {
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
      screenSession?.stop();
    };
  }, [submitText]);

  // Sync settings to manager
  useEffect(() => {
    const mgr = managerRef.current;
    if (!mgr) return;
    const lp = LANG_PROFILES.find(l => l.id === settings.lang) ?? LANG_PROFILES[0];
    mgr.configure({
      lang: lp.bcp47,
      silenceMs: 2000,
      interruptOnSpeak: settings.interruptOnSpeak,
    });
    mgr.updateLang(lp.bcp47);
  }, [settings.lang, settings.interruptOnSpeak]);

  // ── Public API ─────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setError("");
    await managerRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    managerRef.current?.stop();
    setPartialText(""); setTranscript(""); setStreamingText("");
  }, []);

  const mute   = useCallback(() => managerRef.current?.pause(), []);
  const unmute = useCallback(() => managerRef.current?.resume(), []);

  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    cancelSpeech();
    if (settingsRef.current.continuous) {
      managerRef.current?.resume();
      setPhase("listening");
    } else {
      setPhase("idle");
    }
  }, []);

  const sendText = useCallback((text: string, image?: string) => {
    managerRef.current?.sendManualText(text, image);
  }, []);

  const startVisionMode = useCallback(async () => {
    managerRef.current?.setVision();
    setPhase("vision");
  }, []);

  const startScreenShareMode = useCallback(async () => {
    if (!isScreenShareSupported()) {
      setError("Screen sharing is not supported in this browser.");
      return;
    }
    try {
      const session = await startScreenShare();
      setScreenSession(session);
      setScreenActive(true);
      managerRef.current?.setScreenShare();
      setPhase("screenshare");
      // Stop handler
      session.stream.getVideoTracks()[0].onended = () => {
        setScreenSession(null);
        setScreenActive(false);
        setPhase(settingsRef.current.continuous ? "listening" : "idle");
      };
      // Send initial context
      const frame = captureScreenFrame(session.video);
      submitText("I've shared my screen with you. Please acknowledge it and wait for my questions about it.", frame);
    } catch (err: any) {
      if (err.name !== "NotAllowedError") setError("Could not start screen share.");
    }
  }, [submitText]);

  const captureAndAsk = useCallback((text?: string) => {
    if (!screenSession) return;
    const frame = captureScreenFrame(screenSession.video);
    submitText(text || "What do you see on my screen?", frame);
  }, [screenSession, submitText]);

  const stopScreenShare = useCallback(() => {
    screenSession?.stop();
    setScreenSession(null);
    setScreenActive(false);
    setScreenTime(0);
    setPhase(settingsRef.current.continuous ? "listening" : "idle");
  }, [screenSession]);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveVoiceSettings(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]); setPartialText(""); setTranscript(""); setStreamingText("");
    lastImageRef.current = undefined;
  }, []);

  const langProfile = LANG_PROFILES.find(l => l.id === settings.lang) ?? LANG_PROFILES[0];

  return {
    phase, settings, messages, partialText, transcript, streamingText,
    error, amplitude, screenActive, screenTime, langProfile,
    start, stop, mute, unmute, interrupt, sendText,
    startVisionMode, startScreenShareMode, captureAndAsk, stopScreenShare,
    updateSettings, clearHistory,
    isTTSSupported: isTTSSupported(),
    isScreenShareSupported: isScreenShareSupported(),
    availableVoices: getVoicesForLang(langProfile.ttsLang),
  };
}
