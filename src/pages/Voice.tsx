import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Mic, MicOff, Loader2, Send, Globe } from "lucide-react";
import VyomOrb from "@/components/VyomOrb";
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

const Voice = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const recogRef = useRef<any>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lang, setLang] = useState("en-US");
  const [showLangs, setShowLangs] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
    setTranscript(""); setReply(""); setSeconds(0); setErrorMsg("");
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
    if (!t || thinking || !user) return;
    stop(); setThinking(true); setReply(""); haptic(10);
    const convRef = await addDoc(collection(db,"conversations"), { userId:user.uid, title:t.slice(0,60), starred:false, createdAt:serverTimestamp(), updatedAt:serverTimestamp() }); const conv = { id: convRef.id };
    if (conv) await addDoc(collection(db,"conversations",conv.id,"messages"), { role:"user", content:t, userId:user.uid, createdAt:serverTimestamp() });
    let acc="";
    try {
      await streamChat({ messages:[{role:"user",content:t}], onDelta:c=>{acc+=c;setReply(acc);}, onDone:()=>{} });
    } catch(e) { toast.error(e instanceof Error?e.message:"AI error"); setThinking(false); return; }
    if (conv && acc) {
      await addDoc(collection(db,"conversations",conv.id,"messages"), { role:"assistant", content:acc, userId:user.uid, createdAt:serverTimestamp() });
      try { const u=new SpeechSynthesisUtterance(acc); u.rate=1; u.pitch=1; u.lang=lang; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
    }
    setThinking(false);
  };

  const mm=String(Math.floor(seconds/60)).padStart(2,"0");
  const ss=String(seconds%60).padStart(2,"0");
  const statusText = !supported ? errorMsg || "Not supported"
    : errorMsg ? errorMsg
    : thinking ? "Thinking…"
    : listening ? "Listening… (auto-sends after silence)"
    : transcript ? "Tap send or speak more"
    : "Tap the mic to speak";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-aurora opacity-20 blur-3xl animate-orb-pulse" />
      </div>

      <header className="relative z-10 flex w-full items-center justify-between">
        <button onClick={()=>{stop();navigate(-1);}} className="glass flex h-10 w-10 items-center justify-center rounded-full">
          <X className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-primary-glow">Voice mode</p>
          <p className="font-display text-sm font-semibold tabular-nums">{mm}:{ss}</p>
        </div>
        <button onClick={()=>setShowLangs(s=>!s)} className="glass flex h-10 w-10 items-center justify-center rounded-full">
          <Globe className="h-4 w-4" />
        </button>
      </header>

      {showLangs && (
        <div className="absolute top-20 right-6 z-20 glass-card rounded-2xl p-2 space-y-1 animate-fade-in shadow-neon">
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>{setLang(l.code);setShowLangs(false);haptic(8);}}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${lang===l.code?"bg-cyan-500/20 text-cyan-400":"text-muted-foreground hover:bg-white/5"}`}>
              {lang===l.code && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"/>}
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center text-center gap-4">
        <VyomOrb size={200} active={listening||thinking} />
        <p className="max-w-xs text-balance font-display text-lg font-medium text-foreground/90">{statusText}</p>
        {transcript && <p className="max-w-xs rounded-2xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-muted-foreground">"{transcript}"</p>}
        {reply && (
          <div className="max-w-xs max-h-40 overflow-y-auto rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-foreground/85 text-left">
            {reply}
          </div>
        )}
      </div>

      <div className="relative z-10 flex h-14 items-end gap-1">
        {Array.from({length:20}).map((_,i)=>(
          <span key={i} className="w-1.5 origin-bottom rounded-full bg-gradient-aurora"
            style={{ height:`${14+(i%5)*8}px`, animation:listening?`voice-wave 1.2s ease-in-out infinite`:"none",
              animationDelay:`${i*0.07}s`, opacity:listening?1:0.25 }} />
        ))}
      </div>

      <div className="relative z-10 flex items-center gap-6">
        <button onClick={()=>navigate("/chat")} className="glass flex h-14 w-14 items-center justify-center rounded-full">
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
        <button onClick={()=>{stop();setTranscript("");setReply("");haptic(8);}} className="glass flex h-14 w-14 items-center justify-center rounded-full">
          <X className="h-5 w-5"/>
        </button>
      </div>
    </div>
  );
};

export default Voice;
