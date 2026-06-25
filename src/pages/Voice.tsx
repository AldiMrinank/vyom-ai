import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Mic, MicOff, Loader2, Send, Globe } from "lucide-react";
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
  { code:"en-US", label:"English" },
  { code:"hi-IN", label:"Hindi" },
  { code:"es-ES", label:"Spanish" },
  { code:"fr-FR", label:"French" },
  { code:"de-DE", label:"German" },
  { code:"ja-JP", label:"Japanese" },
];

// Maps the screen's real interaction state to an EmotiveOrb visual state.
// "excited" / "surprised" aren't reachable from this real flow (no signal
// in the data to trigger them) — they exist in EmotiveOrb for other screens
// or future use (e.g. reacting to a particularly enthusiastic AI reply).
function deriveOrbState(opts: {
  supported: boolean;
  errorMsg: string;
  listening: boolean;
  thinking: boolean;
  justCompleted: boolean;
  hasReply: boolean;
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
  const silenceTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const completedTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lang, setLang] = useState("en-US");
  const [showLangs, setShowLangs] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    const w = window as any;
    const SRC = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SRC) { setSupported(false); setErrorMsg("Speech recognition isn't supported on this browser. Try Chrome."); return; }
    return () => { try { recogRef.current?.stop(); } catch {} };
  }, []);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setSeconds(s => s+1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  useEffect(() => () => { if (completedTimer.current) clearTimeout(completedTimer.current); }, []);

  // Fix: clear silenceTimer on unmount to prevent it firing after component is gone
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (completedTimer.current) clearTimeout(completedTimer.current);
      try { recogRef.current?.stop(); } catch {}
    };
  }, []);

  const buildRecog = (selectedLang: string) => {
    const w = window as any;
    const SRC = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SRC) return null;
    const r = new SRC();
    r.continuous = true; r.interimResults = true; r.lang = selectedLang;
    r.onresult = (e: any) => {
      let final = "";
      for (let i=e.resultIndex;i<e.results.length;i++) final += e.results[i][0].transcript;
      setTranscript(final);
      // Auto-submit after 2.5s silence
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => { if (final.trim()) submit(final); }, 2500);
    };
    r.onerror = (e: any) => {
      const msgs: Record<string,string> = { "not-allowed":"Microphone permission denied.", "no-speech":"No speech detected.", "network":"Network error." };
      setErrorMsg(msgs[e.error] || `Error: ${e.error}`);
      setListening(false);
    };
    r.onend = () => setListening(false);
    return r;
  };

  const start = () => {
    haptic([10,50]);
    setTranscript(""); setReply(""); setSeconds(0); setErrorMsg(""); setJustCompleted(false);
    const r = buildRecog(lang);
    if (!r) return;
    recogRef.current = r;
    try { r.start(); setListening(true); } catch {}
  };

  const stop = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    try { recogRef.current?.stop(); } catch {}
    setListening(false);
  };

  const submit = async (text?: string) => {
    const t = (text ?? transcript).trim();
    if (!t || thinking || !user || !db) return;
    stop(); setThinking(true); setReply(""); setJustCompleted(false); haptic(10);

    let acc = "";
    try {
      await streamChat({
        messages:[{role:"user",content:t}],
        onDelta: c => { acc+=c; if (mountedRef.current) setReply(acc); },
        onDone: () => {},
      });
    } catch(e) {
      if (!mountedRef.current) return;
      if ((e as Error).name === "AbortError") { setThinking(false); return; }
      toast.error(e instanceof Error?e.message:"AI error");
      setErrorMsg(e instanceof Error ? e.message : "AI error");
      setThinking(false);
      return;
    }

    if (!mountedRef.current) return;

    if (acc.trim()) {
      try {
        const convRef = await addDoc(collection(db,"conversations"), { userId:user.uid, title:t.slice(0,60), starred:false, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
        await addDoc(collection(db,"conversations",convRef.id,"messages"), { role:"user", content:t, userId:user.uid, createdAt:serverTimestamp() });
        await addDoc(collection(db,"conversations",convRef.id,"messages"), { role:"assistant", content:acc, userId:user.uid, createdAt:serverTimestamp() });
      } catch {
        if (mountedRef.current) toast.error("Reply ready, but couldn't save it to your history.");
      }
      if (!mountedRef.current) return;
      try { const u=new SpeechSynthesisUtterance(acc); u.rate=1; u.pitch=1; u.lang=lang; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
      setJustCompleted(true);
      if (completedTimer.current) clearTimeout(completedTimer.current);
      completedTimer.current = setTimeout(() => { if (mountedRef.current) setJustCompleted(false); }, 1600);
    }
    if (mountedRef.current) setThinking(false);
  };

  const orbState = deriveOrbState({ supported, errorMsg, listening, thinking, justCompleted, hasReply: !!reply });
  const cfg = ORB_STATES[orbState];

  const mm=String(Math.floor(seconds/60)).padStart(2,"0");
  const ss=String(seconds%60).padStart(2,"0");
  const statusText = !supported ? errorMsg || "Not supported"
    : errorMsg ? errorMsg
    : thinking ? "Thinking…"
    : listening ? "Listening… (auto-sends after silence)"
    : transcript ? "Tap send or speak more"
    : "Tap the mic to speak";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden px-5 py-5">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-aurora opacity-20 blur-3xl animate-orb-pulse" />
      </div>

      {/* Header — matches the reference's glass icon button layout */}
      <header className="relative z-10 flex w-full items-center justify-between">
        <button onClick={()=>{stop();navigate(-1);}} className="glass flex h-11 w-11 items-center justify-center rounded-full active:scale-95 transition">
          <X className="h-4.5 w-4.5" />
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary-glow">Voice mode</p>
          <p className="font-display text-sm font-semibold tabular-nums">{mm}:{ss}</p>
        </div>
        <button onClick={()=>setShowLangs(s=>!s)} className="glass flex h-11 w-11 items-center justify-center rounded-full active:scale-95 transition">
          <Globe className="h-4 w-4" />
        </button>
      </header>

      {showLangs && (
        <div className="absolute top-20 right-5 z-20 glass-card rounded-2xl p-2 space-y-1 animate-fade-in shadow-neon">
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>{setLang(l.code);setShowLangs(false);haptic(8);}}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${lang===l.code?"bg-cyan-500/20 text-cyan-400":"text-muted-foreground hover:bg-white/5"}`}>
              {lang===l.code && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"/>}
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Hero — small badge + gradient title, matching the reference */}
      <div className="relative z-10 flex flex-col items-center text-center mt-6 mb-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1 text-[11px] font-medium text-white/80 mb-3">
          ✨ GenZ AI
        </span>
        <h1 className="text-[30px] font-bold leading-none font-display"
          style={{ background: "linear-gradient(90deg, #A78BFA 0%, #60A5FA 55%, #22D3EE 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          AI Voice
        </h1>
        <p className="text-[13px] text-white/50 mt-1.5">{statusText}</p>
      </div>

      {/* Orb + waveforms */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 -mt-4">
        <div className="flex items-center justify-center gap-1">
          <Waveform side="left" amp={cfg.waveAmp} speed={cfg.waveSpeed} color="#8B5CF6" />
          <EmotiveOrb state={orbState} size={200} onTap={listening ? stop : start} />
          <Waveform side="right" amp={cfg.waveAmp} speed={cfg.waveSpeed} color="#22D3EE" />
        </div>

        <div className="flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot, boxShadow: `0 0 8px ${cfg.dot}` }} />
          <span className="text-[12px] text-white/60 font-medium">{cfg.label}</span>
        </div>

        {transcript && (
          <p className="max-w-xs text-balance rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-muted-foreground animate-fade-in">
            "{transcript}"
          </p>
        )}
        {reply && (
          <div className="max-w-xs max-h-40 overflow-y-auto rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-foreground/85 text-left animate-fade-in">
            {reply}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 flex items-center justify-center gap-6 pb-2">
        <button onClick={()=>navigate("/chat")} className="glass flex h-14 w-14 items-center justify-center rounded-full active:scale-95 transition">
          <span className="text-xs font-semibold">Aa</span>
        </button>
        {thinking ? (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-aurora shadow-neon">
            <Loader2 className="h-7 w-7 animate-spin text-primary-foreground" />
          </div>
        ) : transcript && !listening ? (
          <button onClick={()=>submit()} className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-aurora shadow-neon active:scale-95">
            <Send className="h-7 w-7 text-primary-foreground" />
          </button>
        ) : (
          <button onClick={listening?stop:start} disabled={!supported}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-aurora shadow-neon active:scale-95 disabled:opacity-50">
            {listening?<MicOff className="h-7 w-7 text-primary-foreground"/>:<Mic className="h-7 w-7 text-primary-foreground"/>}
          </button>
        )}
        <button onClick={()=>{stop();setTranscript("");setReply("");setErrorMsg("");setJustCompleted(false);haptic(8);}} className="glass flex h-14 w-14 items-center justify-center rounded-full active:scale-95 transition">
          <X className="h-5 w-5"/>
        </button>
      </div>
    </div>
  );
};

export default Voice;
