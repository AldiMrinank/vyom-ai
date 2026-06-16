import { ChevronLeft, Clock, ImageIcon, Code2, FileText, Presentation, Network, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import promo from "@/assets/create-promo.png";

const tools = [
  { icon: ImageIcon, title: "Image", subtitle: "Visualize anything", color: "text-emerald-400", prompt: "Create an image of " },
  { icon: Code2, title: "Code", subtitle: "Write anything", color: "text-primary-glow", prompt: "Write code that " },
  { icon: FileText, title: "Document", subtitle: "Draft and edit", color: "text-orange-400", prompt: "Draft a document about " },
  { icon: Presentation, title: "Presentation", subtitle: "Slides in seconds", color: "text-secondary-glow", prompt: "Create a presentation about " },
  { icon: Network, title: "Mind Map", subtitle: "Ideas, connected", color: "text-pink-400", prompt: "Make a mind map for " },
  { icon: MoreHorizontal, title: "More", subtitle: "Coming soon", color: "text-muted-foreground", prompt: "" },
];

const Create = () => {
  const navigate = useNavigate();

  return (
    <div className="px-5 pt-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-lg font-semibold">Create</span>
        <button onClick={() => navigate("/history")} className="flex h-10 w-10 items-center justify-center">
          <Clock className="h-4 w-4" />
        </button>
      </header>

      <h1 className="mt-6 text-center font-display text-2xl font-bold">
        What do you want to <span className="gradient-text">create?</span>
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {tools.map((t) => (
          <button
            key={t.title}
            disabled={!t.prompt}
            onClick={() => t.prompt && navigate(`/chat?q=${encodeURIComponent(t.prompt)}`)}
            className="glass-card group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted/50">
              <t.icon className={`h-5 w-5 ${t.color}`} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t.subtitle}</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/chat?q=A futuristic library in the clouds")}
        className="glass-card relative mt-5 flex w-full items-center overflow-hidden border border-primary/30 p-5 text-left shadow-glow transition active:scale-[0.99]"
      >
        <div className="absolute -right-4 -top-2 h-32 w-24">
          <img src={promo} alt="" loading="lazy" className="h-full w-full object-contain drop-shadow-[0_0_30px_hsl(var(--primary)/0.6)]" />
        </div>
        <div className="relative max-w-[65%]">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-glow">Try something new</p>
          <p className="mt-2 font-display text-base font-semibold leading-snug">
            A futuristic library in the clouds
          </p>
        </div>
      </button>
    </div>
  );
};

export default Create;
