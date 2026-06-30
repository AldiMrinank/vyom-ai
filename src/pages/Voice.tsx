import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, Mic, MicOff, Loader2, Send, Globe, RefreshCw } from "lucide-react";
import EmotiveOrb, { ORB_STATES } from "@/components/EmotiveOrb";
import type { OrbState } from "@/components/EmotiveOrb";
import Waveform from "@/components/Waveform";
import { streamChat } from "@/lib/chat";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

const LANGS = [
  { code: "en-US", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "ja-JP", label: "Japanese" },
];

const QUICK_PROMPTS = [
  { label: "🔥 Roast me",    prompt: "Roast me in a fun way!" },
  { label: "📅 Study plan",  prompt: "Create a quick study plan for me." },
  { label: "😂 Joke",        prompt: "Tell me a funny joke." },
  { label: "✨ Surprise",    prompt: "Surprise me with something amazing!" },
  { label: "💡 Idea",        prompt: "Give me a creative business idea." },
];

const STATE_BUBBLES: Record<OrbState, string> = {
  idle:       "I'm all ears. Talk to me 💜",
  listening:  "I'm listening… Go on!",
  thinking:   "Let me think… Just a sec 🤔",
  processing: "Got it! Processing everything…",
  responding: "Here's what I found! ✨",
  excited:    "This is so cool! 😍 You'll love it!",
  surprised:  "Whoa! That's surprising! 😮",
  completed:  "All done! ✅ Anything else?",
  error:      "Something went wrong. Tap retry 🔄",
};

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n{2,}/g, ". ")
    .trim();
}

function deriveOrbState(opts: {
  supported: boolean; errorMsg: string; listening: boolean;
  thinking: boolean; justCompleted: boolean; hasReply: boolean;
}): OrbState {
  const { supported, errorMsg, listening, thinking, justCompleted, hasReply } = opts;
  if (!supported || errorMsg) return "error";
  if (thinking) return "thinking";
  if (listening) return "listening";
  if (justCompleted) return "completed";
  if (hasReply) return "responding";
  return "idle";
}

const Voice = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const recogRef = useRef<any>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lang, setLang] = useState("en-US");
  const [showLangs, setShowLangs] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [typeInput, setTypeInput] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (completedTimer.current) clearTimeout(completedTimer.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      try { recogRef.current?.stop(); } catch {}
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const w = window as any;
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      setSupported(false);
      setErrorMsg("Speech recognition isn't supported on this browser.");
      setErrorDetail("Try Chrome or Edge for voice support.");
    }
  }, []);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  const startAmplitude = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!mountedRef.current) return;
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setAmplitude(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setErrorMsg("Microphone permission denied.");
        setErrorDetail("Please allow microphone access in your browser settings.");
      }
    }
  };

  const stopAmplitude = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    setAmplitude(0);
  };

  const buildRecog = (selectedLang: string) => {
    const w = window as any;
    const SRC = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SRC) return null;
    const r = new SRC();
    r.continuous = true;
    r.interimResults = true;
    r.lang = selectedLang;
    r.onresult = (e: any) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) final += e.results[i][0].transcript;
      setTranscript(final);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (final.trim()) submit(final);
      }, 2500);
    };
    r.onerror = (e: any) => {
      const msgs: Record<string, [string, string]> = {
        "not-allowed": ["Microphone permission denied.", "Please allow microphone access in your browser settings."],
        "no-speech":   ["No speech detected.", "Make sure your microphone is working and try again."],
        "network":     ["Network error.", "Check your internet connection and try again."],
        "aborted":     ["Recording stopped.", ""],
      };
      const [msg, detail] = msgs[e.error] || [`Voice error: ${e.error}`, "Please try again."];
      if (e.error !== "aborted") {
        setErrorMsg(msg);
        setErrorDetail(detail);
      }
      setListening(false);
      stopAmplitude();
    };
    r.onend = () => { setListening(false); stopAmplitude(); };
    return r;
  };

  const clearError = useCallback(() => {
    setErrorMsg("");
    setErrorDetail("");
  }, []);

  const start = useCallback(() => {
    haptic([10, 50]);
    clearError();
    setTranscript(""); setReply(""); setSeconds(0); setJustCompleted(false);
    const r = buildRecog(lang);
    if (!r) return;
    recogRef.current = r;
    try { r.start(); setListening(true); startAmplitude(); } catch {}
  }, [lang]);

  const stop = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
    stopAmplitude();
  }, []);

  const reset = useCallback(() => {
    stop();
    clearError();
    setTranscript(""); setReply(""); setJustCompleted(false); setTypeInput("");
    haptic(8);
  }, [stop, clearError]);

  const submit = async (text?: string) => {
    const t = (text ?? (typeInput.trim() || transcript)).trim();
    if (!t || thinking) return;

    if (!user) {
      toast.error("Please sign in to use voice chat.");
      return;
    }

    stop();
    clearError();
    setThinking(true);
    setReply("");
    setJustCompleted(false);
    setTypeInput("");
    haptic(10);

    let acc = "";
    try {
      if (!mountedRef.current) return;
      await streamChat({
        messages: [{ role: "user", content: t }],
        onDelta: c => { acc += c; if (mountedRef.current) setReply(acc); },
        onDone: () => {},
      });
    } catch (e) {
      if (!mountedRef.current) return;
      const msg = e instanceof Error ? e.message : "AI error";
      if ((e as Error).name === "AbortError") { setThinking(false); return; }
      // Show a meaningful error based on the error type
      if (msg.includes("sign") || msg.includes("Session")) {
        setErrorMsg("Session expired.");
        setErrorDetail("Please sign out and sign in again to continue.");
        toast.error("Session expired. Please sign in again.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setErrorMsg("Network error.");
        setErrorDetail("Check your internet connection and try again.");
      } else if (msg.includes("Too many")) {
        setErrorMsg("Too many requests.");
        setErrorDetail("Please wait a moment before trying again.");
      } else {
        setErrorMsg("AI response failed.");
        setErrorDetail(msg);
      }
      setThinking(false);
      return;
    }

    if (!mountedRef.current) return;

    if (acc.trim()) {
      try {
        if (db) {
          const convRef = await addDoc(collection(db, "conversations"), {
            userId: user.uid, title: t.slice(0, 60), starred: false,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
          await addDoc(collection(db, "conversations", convRef.id, "messages"), { role: "user", content: t, userId: user.uid, createdAt: serverTimestamp() });
          await addDoc(collection(db, "conversations", convRef.id, "messages"), { role: "assistant", content: acc, userId: user.uid, createdAt: serverTimestamp() });
        }
      } catch {
        if (mountedRef.current) toast.error("Reply ready, but couldn't save to history.");
      }
      if (!mountedRef.current) return;
      try {
        const clean = stripMarkdown(acc);
        const u = new SpeechSynthesisUtterance(clean);
        u.rate = 1; u.pitch = 1; u.lang = lang;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {}
      setJustCompleted(true);
      if (completedTimer.current) clearTimeout(completedTimer.current);
      completedTimer.current = setTimeout(() => {
        if (mountedRef.current) setJustCompleted(false);
      }, 1600);
    }
    if (mountedRef.current) setThinking(false);
  };

  const orbState = deriveOrbState({ supported, errorMsg, listening, thinking, justCompleted, hasReply: !!reply });
  const cfg = ORB_STATES[orbState];
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const waveAmp = listening ? (0.2 + amplitude * 1.5) : cfg.waveAmp;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden px-5 py-5 bg-[#080810]">
      {/* Animated background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl transition-all duration-1000"
          style={{ background: `radial-gradient(circle, ${cfg.glow[0]}, ${cfg.glow[1]}, transparent 70%)` }}
        />
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex w-full items-center justify-between">
        <button
          onClick={() => { stop(); navigate(-1); }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition"
          aria-label="Go back"
        >
          <X className="h-5 w-5 text-white/80" />
        </button>

        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-semibold text-purple-300">
            ✨ GenZ AI
          </span>
          <p className="font-mono text-sm font-semibold tabular-nums mt-1 text-white/70">{mm}:{ss}</p>
        </div>

        <button
          onClick={() => setShowLangs(s => !s)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition"
          aria-label="Select language"
        >
          <Globe className="h-4 w-4 text-white/80" />
        </button>
      </header>

      {/* Language picker */}
      {showLangs && (
        <div className="absolute top-20 right-5 z-20 rounded-2xl border border-white/10 bg-[#0f0f1a]/90 backdrop-blur-xl p-2 space-y-1 shadow-2xl">
          {LANGS.map(l => (
            <button key={l.code}
              onClick={() => { setLang(l.code); setShowLangs(false); haptic(8); }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition ${lang === l.code ? "bg-purple-500/20 text-purple-300 font-medium" : "text-white/60 hover:bg-white/5"}`}
            >
              {lang === l.code && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />}
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Title */}
      <div className="relative z-10 flex flex-col items-center text-center mt-6 mb-0">
        <h1 className="text-[34px] font-bold leading-none tracking-tight"
          style={{ background: "linear-gradient(90deg,#A78BFA 0%,#60A5FA 55%,#22D3EE 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          AI Voice
        </h1>
        <div className="mt-2 min-h-[24px] flex items-center">
          <p className="text-[13px] text-white/50 animate-fade-in" key={orbState + errorMsg}>
            {errorMsg ? errorMsg : STATE_BUBBLES[orbState]}
          </p>
        </div>
      </div>

      {/* Orb hero */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 -mt-2">
        <div className="flex items-center justify-center gap-3">
          <Waveform side="left" amp={waveAmp} speed={cfg.waveSpeed} color={cfg.glow[0]} />
          <EmotiveOrb state={orbState} size={200} onTap={listening ? stop : start} />
          <Waveform side="right" amp={waveAmp} speed={cfg.waveSpeed} color={cfg.glow[1]} />
        </div>

        {/* State label */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: cfg.dot, boxShadow: `0 0 10px ${cfg.dot}` }} />
          <span className="text-[12px] text-white/60 font-medium">{cfg.label}</span>
        </div>

        {/* Error detail + retry */}
        {errorMsg && (
          <div className="max-w-xs w-full rounded-2xl border border-red-500/20 bg-red-900/20 px-4 py-3 text-center animate-fade-in">
            {errorDetail && <p className="text-xs text-red-300/80 mb-2">{errorDetail}</p>}
            <button
              onClick={() => { clearError(); start(); }}
              disabled={!supported}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-xs text-red-300 font-medium active:scale-95 transition disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        )}

        {/* Transcript card */}
        {transcript && !thinking && !errorMsg && (
          <p className="max-w-xs text-balance rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 animate-fade-in text-center">
            "{transcript}"
          </p>
        )}

        {/* Reply card */}
        {reply && (
          <div className="max-w-xs max-h-36 overflow-y-auto rounded-2xl border border-purple-500/20 bg-purple-900/20 px-4 py-3 text-sm text-white/90 text-left animate-fade-in">
            {reply}
          </div>
        )}
      </div>

      {/* Type input */}
      <div className="relative z-10 mx-0 mb-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-3 py-2">
          <input
            value={typeInput}
            onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && typeInput.trim()) submit(); }}
            placeholder="Reply to AI Voice…"
            className="flex-1 bg-transparent text-sm placeholder:text-white/25 focus:outline-none text-white"
          />
          {typeInput.trim() && (
            <button onClick={() => submit()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 active:scale-90 transition">
              <Send className="h-4 w-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Quick prompts */}
      <div className="relative z-10 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 scrollbar-hide mb-3">
        {QUICK_PROMPTS.map(p => (
          <button key={p.label} onClick={() => submit(p.prompt)} disabled={thinking}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-white/70 active:scale-95 transition disabled:opacity-40 whitespace-nowrap">
            {p.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center justify-center gap-6 pb-2">
        <button onClick={() => navigate("/chat")}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95 transition">
          <span className="text-xs font-bold text-white/80">Aa</span>
        </button>

        {thinking ? (
          <div className="flex h-20 w-20 items-center justify-center rounded-full shadow-[0_0_30px_rgba(139,92,246,0.5)]"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9, #3B82F6)" }}>
            <Loader2 className="h-7 w-7 animate-spin text-white" />
          </div>
        ) : transcript && !listening ? (
          <button onClick={() => submit()}
            className="flex h-20 w-20 items-center justify-center rounded-full active:scale-95 transition shadow-[0_0_30px_rgba(139,92,246,0.5)]"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #6D28D9, #3B82F6)" }}>
            <Send className="h-7 w-7 text-white" />
          </button>
        ) : (
          <button
            onClick={listening ? stop : start}
            disabled={!supported}
            className="flex h-20 w-20 items-center justify-center rounded-full active:scale-95 disabled:opacity-50 transition"
            style={{ background: `linear-gradient(135deg, ${cfg.glow[0]}, ${cfg.glow[1]})`, boxShadow: `0 0 30px ${cfg.glow[0]}50` }}
          >
            {listening ? <MicOff className="h-7 w-7 text-white" /> : <Mic className="h-7 w-7 text-white" />}
          </button>
        )}

        <button onClick={reset}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 active:scale-95 transition">
          <X className="h-5 w-5 text-white/80" />
        </button>
      </div>
    </div>
  );
};

export default Voice;
