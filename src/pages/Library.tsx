import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, FileText, Sparkles, StickyNote, Search as SearchIcon, Trash2, ChevronLeft, BookOpen, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getLibrary, deleteFromLibrary } from "@/lib/library";
import type { LibraryItem, LibraryItemType } from "@/lib/library";
import MarkdownMessage from "@/components/MarkdownMessage";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

const TABS: { id: LibraryItemType | "all"; label: string; icon: any }[] = [
  { id: "all",      label: "All",      icon: BookOpen },
  { id: "answer",   label: "Answers",  icon: Bookmark },
  { id: "artifact", label: "Artifacts",icon: Sparkles },
  { id: "note",     label: "Notes",    icon: StickyNote },
  { id: "research", label: "Research", icon: FileText },
];

const TYPE_COLORS: Record<string, string> = {
  answer:   "text-cyan-400 bg-cyan-400/10",
  artifact: "text-purple-400 bg-purple-400/10",
  note:     "text-amber-400 bg-amber-400/10",
  research: "text-emerald-400 bg-emerald-400/10",
  file:     "text-blue-400 bg-blue-400/10",
};

export default function Library() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<LibraryItemType | "all">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getLibrary(user.uid)
      .then(data => setItems(data))
      .catch(() => toast.error("Failed to load library"))
      .finally(() => setLoading(false));
  }, [user]);

  const remove = async (item: LibraryItem) => {
    if (!user) return;
    haptic([8, 50, 8]);
    await deleteFromLibrary(user.uid, item.id);
    setItems(i => i.filter(x => x.id !== item.id));
    toast.success("Removed from library");
  };

  const visible = items.filter(i => {
    if (tab !== "all" && i.type !== tab) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase()) &&
        !i.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center glass rounded-full active:scale-95 transition">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="font-display text-xl font-bold">Library</h1>
          <p className="text-[11px] text-muted-foreground">{items.length} saved items</p>
        </div>
        {/* FIX: Plus button was imported but never rendered — now shows note creation */}
        <button onClick={() => { haptic(8); navigate("/chat?q=Create a note: "); }}
          className="glass flex h-10 w-10 items-center justify-center rounded-full border border-violet-500/30 text-violet-400 active:scale-95 transition"
          title="Add note">
          <Plus className="h-4 w-4"/>
        </button>
      </header>

      {/* Search */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 glass rounded-2xl px-3 py-2.5">
          <SearchIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search library…" className="flex-1 bg-transparent text-sm focus:outline-none" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 pb-4 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { haptic(8); setTab(t.id); }}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium border transition ${
              tab === t.id ? "bg-primary/20 border-primary/40 text-primary-glow" : "glass border-white/10 text-muted-foreground"
            }`}>
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 px-5 pb-24 space-y-3">
        {loading ? (
          Array.from({length: 4}).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
          ))
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Bookmark className="h-12 w-12 text-white/15" />
            <p className="text-sm text-muted-foreground">
              {search ? `No results for "${search}"` : "Nothing saved yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              Tap the bookmark icon on any AI response to save it here.
            </p>
            <button onClick={() => navigate("/chat")}
              className="flex items-center gap-2 mt-2 glass border border-white/10 rounded-full px-4 py-2 text-sm">
              <Plus className="h-3.5 w-3.5" /> Start a chat
            </button>
          </div>
        ) : (
          visible.map(item => (
            <div key={item.id} className="glass-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type]}`}>
                      {item.type}
                    </span>
                    {item.tags.map(tag => (
                      <span key={tag} className="text-[10px] text-muted-foreground border border-white/10 rounded-full px-1.5 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="font-medium text-sm leading-snug">{item.title}</p>
                </div>
                <button onClick={() => remove(item)} className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expandable content */}
              <button onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition">
                {expanded === item.id ? "▲ Collapse" : "▼ Show content"}
              </button>
              {expanded === item.id && (
                <div className="mt-3 pt-3 border-t border-white/8 max-h-64 overflow-y-auto">
                  <MarkdownMessage content={item.content} />
                </div>
              )}

              {item.sourceConvId && (
                <button onClick={() => navigate(`/chat?c=${item.sourceConvId}`)}
                  className="mt-2 text-[11px] text-cyan-400/70 hover:text-cyan-400 transition block">
                  → View original conversation
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
