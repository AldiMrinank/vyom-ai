import { Search, Star, Briefcase, GraduationCap, Palette, ArrowRight, PenLine, Code2, Plane, FileText, ImagePlus, Lightbulb, X } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import heroImg from "@/assets/explore-hero.jpg";

const categories = [
  { label: "For you", icon: Star },
  { label: "Productivity", icon: Briefcase },
  { label: "Learning", icon: GraduationCap },
  { label: "Creative", icon: Palette },
];

interface Tool { icon: any; title: string; subtitle: string; color: string; prompt: string; cats: string[] }

const tools: Tool[] = [
  { icon: PenLine, title: "Write Like a Pro", subtitle: "Improve your writing style", color: "from-primary to-primary-glow", prompt: "Help me improve this writing: ", cats: ["For you", "Productivity"] },
  { icon: Code2, title: "Code Genius", subtitle: "Debug, optimize, ship", color: "from-secondary to-secondary-glow", prompt: "Help me write code that ", cats: ["For you", "Productivity"] },
  { icon: Plane, title: "Travel Planner", subtitle: "Plan your perfect trip", color: "from-accent to-primary-glow", prompt: "Plan a trip to ", cats: ["For you", "Creative"] },
  { icon: FileText, title: "PDF Summarizer", subtitle: "Summarize anything fast", color: "from-primary-glow to-secondary", prompt: "Summarize this for me: ", cats: ["For you", "Productivity", "Learning"] },
  { icon: GraduationCap, title: "Study Buddy", subtitle: "Explain concepts simply", color: "from-emerald-500 to-emerald-300", prompt: "Explain like I'm 5: ", cats: ["For you", "Learning"] },
  { icon: ImagePlus, title: "Image Ideas", subtitle: "Describe a scene", color: "from-pink-500 to-rose-400", prompt: "Create an image of ", cats: ["For you", "Creative"] },
  { icon: Lightbulb, title: "Brainstorm", subtitle: "Spark new ideas", color: "from-amber-500 to-orange-400", prompt: "Brainstorm ideas for ", cats: ["For you", "Creative", "Productivity"] },
];

const Explore = () => {
  const [active, setActive] = useState("For you");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();

  const filtered = useMemo(
    () => tools.filter((t) =>
      t.cats.includes(active) &&
      (search ? (t.title + " " + t.subtitle).toLowerCase().includes(search.toLowerCase()) : true)
    ),
    [active, search]
  );

  return (
    <div className="px-6 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Explore</h1>
        <button onClick={() => setShowSearch((s) => !s)} className="glass flex h-10 w-10 items-center justify-center rounded-2xl">
          {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
        </button>
      </header>

      {showSearch && (
        <div className="glass-card mt-3 flex items-center gap-2 p-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…" className="flex-1 bg-transparent text-sm focus:outline-none" />
        </div>
      )}

      <div className="scrollbar-hide -mx-6 mt-5 flex gap-2 overflow-x-auto px-6 pb-1">
        {categories.map((c) => (
          <button
            key={c.label}
            onClick={() => setActive(c.label)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition",
              active === c.label ? "bg-gradient-aurora text-primary-foreground shadow-glow" : "glass text-muted-foreground"
            )}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Featured</h2>
        <button
          onClick={() => navigate("/chat?q=" + encodeURIComponent("Be my AI study buddy. Help me learn faster."))}
          className="glass-card relative block aspect-[4/3] w-full overflow-hidden text-left"
        >
          <img src={heroImg} alt="AI Study Buddy" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3 className="font-display text-2xl font-bold leading-tight">AI Study Buddy</h3>
            <p className="mt-1 text-sm text-foreground/80">Get smarter,<br />not harder.</p>
            <span className="mt-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-aurora shadow-glow">
              <ArrowRight className="h-4 w-4 text-primary-foreground" />
            </span>
          </div>
        </button>
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Top tools</h2>
        </div>
        <div className="space-y-2.5">
          {filtered.map((t) => (
            <button
              key={t.title}
              onClick={() => navigate(`/chat?q=${encodeURIComponent(t.prompt)}`)}
              className="glass-card group flex w-full items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-glow active:scale-[0.99]"
            >
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-glow", t.color)}>
                <t.icon className="h-5 w-5 text-primary-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t.subtitle}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary-glow" />
            </button>
          ))}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No tools match.</p>}
        </div>
      </section>
    </div>
  );
};

export default Explore;
