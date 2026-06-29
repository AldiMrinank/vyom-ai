import { Menu, Sparkles, ImagePlus, FileText, Lightbulb, Code2, Globe, Mic, Plus, AudioLines, ArrowRight, ChevronRight, Clock, X, Brain } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, FormEvent, useEffect } from "react";
import VyomOrb from "@/components/VyomOrb";
import wallpaper from "@/assets/card-wallpaper.jpg";
import study from "@/assets/card-study.jpg";
import trip from "@/assets/card-trip.jpg";
import { useAuth } from "@/hooks/useAuth";
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { haptic } from "@/lib/haptic";

const DAILY_QUOTES = [
  { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
  { text: "Intelligence is the ability to adapt to change.", author: "Stephen Hawking" },
  { text: "Any sufficiently advanced technology is indistinguishable from magic.", author: "Arthur C. Clarke" },
  { text: "The science of today is the technology of tomorrow.", author: "Edward Teller" },
  { text: "Creativity is intelligence having fun.", author: "Albert Einstein" },
];

const actions = [
  { icon: ImagePlus, label: "Create image", color: "text-emerald-400", prompt: "Create an image of " },
  { icon: FileText,  label: "Summarize",    color: "text-orange-400",  prompt: "Summarize this text: " },
  { icon: Lightbulb, label: "Brainstorm",   color: "text-amber-400",   prompt: "Brainstorm ideas for " },
  { icon: Code2,     label: "Code",         color: "text-violet-400",  prompt: "Write code that " },
];

const tryAsking = [
  { img: wallpaper, title: "Create a wallpaper", subtitle: "for my phone",   prompt: "Describe a stunning futuristic wallpaper for my phone." },
  { img: study,     title: "Help me study",      subtitle: "for my exam",    prompt: "Help me build a study plan for my final exam." },
  { img: trip,      title: "Plan a trip",         subtitle: "to Japan",       prompt: "Plan a 5-day trip to Japan." },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const getDailyQuote = () => DAILY_QUOTES[Math.floor(Date.now() / 86400000) % DAILY_QUOTES.length];

interface RecentChat { id: string; title: string; updated_at: string }

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string|null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [memoryNotif, setMemoryNotif] = useState<string|null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const quote = getDailyQuote();

  useEffect(() => {
    if (!user || !db) return;

    getDoc(doc(db, "users", user.uid)).then(snap => {
      const d = snap.data() as any;
      setName(d?.displayName || user.displayName || user.email?.split("@")[0] || "");
      setAvatar(d?.avatarUrl || user.photoURL || null);
    }).catch(() => {
      setName(user.displayName || user.email?.split("@")[0] || "");
    });

    getDocs(query(
      collection(db, "conversations"),
      where("userId", "==", user.uid),
      orderBy("updatedAt", "desc"),
      limit(3)
    )).then(snap => {
      setRecentChats(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecentChat)));
    }).catch(() => {});

    // Show memory notification if a new memory was saved this session
    const key = `vyom_last_memory_${user.uid}`;
    const raw = sessionStorage.getItem(key);
    if (raw) {
      try {
        const { content, at } = JSON.parse(raw);
        if (Date.now() - at < 10 * 60 * 1000) setMemoryNotif(content);
        sessionStorage.removeItem(key);
      } catch {}
    }

    const t = setTimeout(() => setShowQuote(true), 1800);
    return () => clearTimeout(t);
  }, [user]);

  const send = (text: string) => { if (!text.trim()) return; haptic(8); navigate(`/chat?q=${encodeURIComponent(text)}`); };
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const initial = (name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="px-5 pt-5 pb-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <button onClick={() => navigate("/history")} className="flex h-10 w-10 items-center justify-center rounded-full glass active:scale-95 transition">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="font-display text-lg font-semibold tracking-tight">Vyom AI</span>
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
        </div>
        <Link to="/profile" className="relative">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full p-[2px]"
            style={{ background: "linear-gradient(135deg,#8B5CF6,#3B82F6,#22D3EE)" }}>
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background">
              {avatar
                ? <img src={avatar} alt="" className="h-full w-full object-cover"/>
                : <span className="font-display text-sm font-bold gradient-text">{initial}</span>}
            </div>
          </div>
          {/* Online dot */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-background shadow-[0_0_6px_rgba(74,222,128,0.8)]"/>
        </Link>
      </header>

      {/* Memory notification card */}
      {memoryNotif && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 animate-fade-in">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-lg">🧠</div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-teal-400">Memory Updated ✦</p>
            <p className="truncate text-xs text-white/70 mt-0.5">{memoryNotif}</p>
          </div>
          <button onClick={() => setMemoryNotif(null)} className="text-white/30 hover:text-white/60 transition shrink-0">
            <X className="h-4 w-4"/>
          </button>
        </div>
      )}

      {/* Hero — greeting + larger orb */}
      <section className="relative mt-5">
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-300">
          <Sparkles className="h-3 w-3" /> Vyom
        </div>
        <div className="grid grid-cols-5 items-center gap-2">
          <div className="col-span-3">
            <p className="text-xs text-muted-foreground mb-1">{greeting()},</p>
            <h1 className="font-display text-[30px] font-bold leading-[1.05]">
              {name || "there,"}<br/>
              <span style={{ background:"linear-gradient(90deg,#A78BFA,#60A5FA,#22D3EE)", WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
                what's on<br/>your mind?
              </span>
            </h1>
            <p className="mt-2 text-xs text-white/40">Your AI superpower is one chat away.</p>
          </div>
          <div className="col-span-2 flex justify-end">
            {/* Bigger orb — 160px matches design */}
            <VyomOrb size={165} />
          </div>
        </div>
      </section>

      {/* Recent chats */}
      {recentChats.length > 0 && (
        <section className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resume</h2>
            </div>
            <button onClick={() => navigate("/history")} className="text-xs text-muted-foreground flex items-center gap-0.5">
              All <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5">
            {recentChats.map(c => (
              <button key={c.id} onClick={() => { haptic(8); navigate(`/chat?c=${c.id}`); }}
                className="glass shrink-0 flex items-center gap-2 rounded-2xl px-3 py-2 text-left max-w-[160px] border border-white/[0.06] transition active:scale-95">
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background:"linear-gradient(135deg,#8B5CF6,#22D3EE)" }} />
                <span className="text-xs truncate font-medium">{c.title}</span>
              </button>
            ))}
            <button onClick={() => { haptic(8); navigate("/chat"); }}
              className="glass shrink-0 flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs text-muted-foreground border border-white/[0.06] transition active:scale-95">
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
        </section>
      )}

      {/* Quick action pills */}
      <div className="scrollbar-hide -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {actions.map(a => (
          <button key={a.label} onClick={() => send(a.prompt)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium transition active:scale-95 hover:bg-white/[0.08]">
            <a.icon className={`h-3.5 w-3.5 ${a.color}`} />{a.label}
          </button>
        ))}
      </div>

      {/* Try asking cards */}
      <section className="glass-card mt-5 p-4" style={{ borderTop:"1px solid rgba(255,255,255,0.08)" }}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-base font-semibold">Try asking</h2>
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <button onClick={() => navigate("/explore")} className="flex items-center gap-1 text-xs text-muted-foreground">
            See all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {tryAsking.map(c => (
            <button key={c.title} onClick={() => send(c.prompt)} className="group w-36 shrink-0 text-left transition active:scale-[0.97]">
              <div className="relative aspect-square overflow-hidden rounded-2xl">
                <img src={c.img} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"/>
                <span className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-violet-600/80 backdrop-blur-sm">
                  <ArrowRight className="h-3.5 w-3.5 text-white"/>
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold">{c.title}</p>
              <p className="text-[11px] text-muted-foreground">{c.subtitle}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Daily quote */}
      {showQuote && (
        <div className="mt-5 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-900/20 to-purple-900/10 px-4 py-4 animate-fade-in">
          <p className="text-[11px] font-semibold text-violet-400 mb-2 flex items-center gap-1.5">
            <span className="text-base">💎</span> Daily Quote
          </p>
          <p className="text-sm text-white/80 leading-relaxed italic">"{quote.text}"</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">— {quote.author}</p>
        </div>
      )}

      {/* Inline input */}
      <form onSubmit={handleSubmit} className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3" style={{ boxShadow:"inset 0 1px 0 rgba(139,92,246,0.1)" }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Message Vyom…" className="w-full bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus:outline-none" />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { haptic(8); navigate("/chat"); }} className="flex h-8 w-8 items-center justify-center rounded-full border border-border active:scale-95 transition"><Plus className="h-3.5 w-3.5"/></button>
            <button type="button" onClick={() => send("Search the web for: ")} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium active:scale-95 transition"><Globe className="h-3 w-3"/> Search</button>
            <button type="button" onClick={() => send("Think step by step and reason through: ")} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium active:scale-95 transition"><Lightbulb className="h-3 w-3"/> Reason</button>
          </div>
          <div className="flex items-center gap-2">
            {input.trim() ? (
              <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-full shadow-[0_0_12px_rgba(124,58,237,0.5)] active:scale-95 transition"
                style={{ background:"linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
                <ArrowRight className="h-4 w-4 text-white" />
              </button>
            ) : (
              <>
                <Link to="/voice" className="text-muted-foreground hover:text-white transition"><Mic className="h-4 w-4"/></Link>
                <Link to="/voice" className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground">
                  <AudioLines className="h-4 w-4 text-background"/>
                </Link>
              </>
            )}
          </div>
        </div>
      </form>

      <p className="mt-3 text-center text-[10px] text-muted-foreground/30">⌘K new chat · ⌘H history · ⌘/ explore</p>
    </div>
  );
};

export default Home;
