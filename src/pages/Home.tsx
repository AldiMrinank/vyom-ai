import { Menu, Sparkles, ImagePlus, FileText, Lightbulb, Code2, Globe, Mic, Plus, AudioLines, ArrowRight, ChevronRight, Clock } from "lucide-react";
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

const actions = [
  { icon: ImagePlus, label: "Create image", color: "text-emerald-400", prompt: "Create an image of " },
  { icon: FileText,  label: "Summarize",    color: "text-orange-400",  prompt: "Summarize this text: " },
  { icon: Lightbulb, label: "Brainstorm",   color: "text-amber-400",   prompt: "Brainstorm ideas for " },
  { icon: Code2,     label: "Code",         color: "text-primary-glow",prompt: "Write code that " },
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

interface RecentChat { id: string; title: string; updated_at: string }

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string|null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);

  useEffect(() => {
    if (!user) return;
  useEffect(() => {
    if (!user) return;
    // Profile
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const d = snap.data() as any;
      setName(d?.displayName || user.displayName || user.email?.split("@")[0] || "");
      setAvatar(d?.avatarUrl || user.photoURL || null);
    }).catch(() => {
      setName(user.displayName || user.email?.split("@")[0] || "");
    });
    // Recent chats
    getDocs(query(
      collection(db, "conversations"),
      where("userId", "==", user.uid),
      orderBy("updatedAt", "desc"),
      limit(3)
    )).then(snap => {
      setRecentChats(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecentChat)));
    }).catch(() => {});
  }, [user]);

  const send = (text: string) => { if (!text.trim()) return; haptic(8); navigate(`/chat?q=${encodeURIComponent(text)}`); };
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const initial = (name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="px-5 pt-5 pb-4">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate("/history")} className="flex h-10 w-10 items-center justify-center">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5">
          <span className="font-display text-lg font-semibold">Vyom AI</span>
          <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
        </div>
        <Link to="/profile" className="relative">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-aurora p-[2px]">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-background">
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover"/> : <span className="font-display text-sm font-bold gradient-text">{initial}</span>}
            </div>
          </div>
        </Link>
      </header>

      <section className="relative mt-6">
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1 rounded-full glass px-2.5 py-1 text-[10px] font-semibold">
          <Sparkles className="h-3 w-3 text-primary-glow" /> Vyom
        </div>
        <div className="grid grid-cols-5 items-center gap-2">
          <div className="col-span-3">
            <p className="text-xs text-muted-foreground mb-0.5">{greeting()},</p>
            <h1 className="font-display text-[28px] font-bold leading-[1.05]">
              {name ? `${name}` : "there,"}<br/>
              <span className="gradient-text">what's on<br/>your mind?</span>
            </h1>
          </div>
          <div className="col-span-2 flex justify-end">
            <VyomOrb size={150} />
          </div>
        </div>
      </section>

      {/* Quick resume recent chats */}
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
                className="glass shrink-0 flex items-center gap-2 rounded-2xl px-3 py-2 text-left max-w-[160px] transition active:scale-95">
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500 shrink-0" />
                <span className="text-xs truncate font-medium">{c.title}</span>
              </button>
            ))}
            <button onClick={() => { haptic(8); navigate("/chat"); }}
              className="glass shrink-0 flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs text-muted-foreground transition active:scale-95">
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
        </section>
      )}

      <div className="scrollbar-hide -mx-5 mt-5 flex gap-2 overflow-x-auto px-5">
        {actions.map(a => (
          <button key={a.label} onClick={() => send(a.prompt)}
            className="glass flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2.5 text-xs font-medium transition active:scale-95">
            <a.icon className={`h-4 w-4 ${a.color}`} />{a.label}
          </button>
        ))}
      </div>

      <section className="glass-card mt-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-base font-semibold">Try asking</h2>
            <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
          </div>
          <button onClick={() => navigate("/explore")} className="flex items-center gap-1 text-xs text-muted-foreground">
            See all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {tryAsking.map(c => (
            <button key={c.title} onClick={() => send(c.prompt)} className="group w-36 shrink-0 text-left transition active:scale-[0.98]">
              <div className="relative aspect-square overflow-hidden rounded-2xl">
                <img src={c.img} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              </div>
              <p className="mt-2 text-xs font-semibold">{c.title}</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{c.subtitle}</p>
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 text-primary-glow">
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="glass-card mt-5 p-3 neon-border">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Message Vyom" className="w-full bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground focus:outline-none" />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-border"><Plus className="h-3.5 w-3.5"/></button>
            <button type="button" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium"><Globe className="h-3 w-3"/> Search</button>
            <button type="button" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium"><Lightbulb className="h-3 w-3"/> Reason</button>
          </div>
          <div className="flex items-center gap-2">
            {input.trim() ? (
              <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-aurora shadow-glow active:scale-95">
                <ArrowRight className="h-4 w-4 text-primary-foreground" />
              </button>
            ) : (
              <>
                <Link to="/voice" className="text-muted-foreground"><Mic className="h-4 w-4"/></Link>
                <Link to="/voice" className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground">
                  <AudioLines className="h-4 w-4 text-background"/>
                </Link>
              </>
            )}
          </div>
        </div>
      </form>

      <p className="mt-3 text-center text-[10px] text-muted-foreground/40">⌘K new chat · ⌘H history · ⌘/ explore</p>
    </div>
  );
};

export default Home;
