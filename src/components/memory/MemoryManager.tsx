import { useState, useEffect, useCallback, useRef } from "react";
import { Brain, Plus, Trash2, Pin, PinOff, X, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMemories, addMemory, updateMemory, deleteMemory } from "@/lib/memory";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import type { Memory } from "@/lib/memory";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

const TYPE_COLORS: Record<string, string> = {
  fact:       "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  preference: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  goal:       "text-amber-400 bg-amber-400/10 border-amber-400/20",
  project:    "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  skill:      "text-blue-400 bg-blue-400/10 border-blue-400/20",
  context:    "text-rose-400 bg-rose-400/10 border-rose-400/20",
};

const TYPE_ICONS: Record<string, string> = {
  fact: "👤", preference: "⚙️", goal: "🎯", project: "🚀", skill: "💡", context: "📌",
};

interface Props { onClose: () => void }

export default function MemoryManager({ onClose }: Props) {
  const { user } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<Memory["type"]>("fact");
  const [search, setSearch] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    getMemories(user.uid)
      .then(m => { if (mountedRef.current) setMemories(m); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [user]);

  const addNew = useCallback(async () => {
    if (!user || !newContent.trim()) return;
    haptic(10);
    const id = await addMemory(user.uid, {
      type: newType, content: newContent.trim(), tags: [], source: "user", pinned: false,
    });
    if (!mountedRef.current) return;
    const newMem: Memory = {
      id, userId: user.uid, type: newType, content: newContent.trim(),
      tags: [], source: "user", pinned: false, createdAt: new Date(), updatedAt: new Date(),
    };
    setMemories(m => [newMem, ...m]);
    setNewContent(""); setAdding(false);
    toast.success("Memory saved");
  }, [user, newType, newContent]);

  const remove = useCallback(async (m: Memory) => {
    if (!user) return;
    haptic(8);
    await deleteMemory(user.uid, m.id);
    if (!mountedRef.current) return;
    setMemories(ms => ms.filter(x => x.id !== m.id));
    toast.success("Memory removed");
  }, [user]);

  // Fix CRITICAL: no longer uses dynamic import() — uses already-imported updateDoc/doc/db
  const togglePin = useCallback(async (m: Memory) => {
    if (!user || !db) return;
    haptic(8);
    const newPinned = !m.pinned;
    await updateDoc(doc(db, "users", user.uid, "memories", m.id), { pinned: newPinned });
    if (!mountedRef.current) return;
    setMemories(ms => ms.map(x => x.id === m.id ? { ...x, pinned: newPinned } : x));
  }, [user]);

  const visible = memories.filter(m =>
    !search || m.content.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = {
    pinned: visible.filter(m => m.pinned),
    rest: visible.filter(m => !m.pinned),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-fade-in">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          <h1 className="font-display text-lg font-bold">Memory</h1>
          <span className="text-[11px] text-muted-foreground bg-white/8 rounded-full px-2 py-0.5">{memories.length}</span>
        </div>
        <button onClick={onClose} aria-label="Close memory manager"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/8">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 py-3">
        <div className="flex items-center gap-2 glass rounded-2xl px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search memories…" aria-label="Search memories"
            className="flex-1 bg-transparent text-sm focus:outline-none" />
        </div>
      </div>

      {adding ? (
        <div className="px-5 pb-3 space-y-2">
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Memory type">
            {(["fact","preference","goal","project","skill","context"] as Memory["type"][]).map(t => (
              <button key={t} onClick={() => setNewType(t)} aria-pressed={newType === t}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${newType === t ? TYPE_COLORS[t] : "border-white/10 text-muted-foreground"}`}>
                {TYPE_ICONS[t]} {t}
              </button>
            ))}
          </div>
          <textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={2}
            placeholder="What should Vyom remember?" aria-label="Memory content"
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)}
              className="flex-1 rounded-xl bg-white/5 py-2 text-sm border border-white/10">Cancel</button>
            <button onClick={addNew} disabled={!newContent.trim()}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 py-2 text-sm font-medium text-white disabled:opacity-50">
              Save Memory
            </button>
          </div>
        </div>
      ) : (
        <div className="px-5 pb-3">
          <button onClick={() => { setAdding(true); haptic(8); }}
            className="flex items-center gap-2 w-full glass rounded-2xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition border border-dashed border-white/15">
            <Plus className="h-4 w-4" aria-hidden /> Add a memory…
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3" role="list" aria-label="Your memories">
        {loading ? (
          <div className="text-center text-sm text-muted-foreground pt-8" aria-live="polite">Loading memories…</div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-12 text-center gap-3">
            <Brain className="h-12 w-12 text-white/20" aria-hidden />
            <p className="text-sm text-muted-foreground">No memories yet</p>
            <p className="text-xs text-muted-foreground/60 max-w-xs">
              Tell Vyom things about yourself and it will remember across all conversations.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {["I'm studying for EAMCET","I prefer concise answers","I'm building a React app"].map(ex => (
                <button key={ex} onClick={() => { setNewContent(ex); setAdding(true); }}
                  className="text-[11px] glass border border-white/10 rounded-full px-3 py-1.5 text-muted-foreground hover:text-white transition">
                  <Sparkles className="h-3 w-3 inline mr-1" aria-hidden />{ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {grouped.pinned.length > 0 && (
              <section aria-label="Pinned memories">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Pinned</p>
                <div className="space-y-2">
                  {grouped.pinned.map(m => <MemoryCard key={m.id} m={m} onDelete={remove} onPin={togglePin} />)}
                </div>
              </section>
            )}
            <section aria-label="All memories">
              {grouped.pinned.length > 0 && <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 mt-4">All memories</p>}
              <div className="space-y-2">
                {grouped.rest.map(m => <MemoryCard key={m.id} m={m} onDelete={remove} onPin={togglePin} />)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const MemoryCard = ({ m, onDelete, onPin }: { m: Memory; onDelete: (m: Memory) => void; onPin: (m: Memory) => void }) => (
  <div role="listitem"
    className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${m.pinned ? "border-white/20 bg-white/8" : "border-white/8 bg-white/4"}`}>
    <span className="text-base mt-0.5 shrink-0" aria-hidden>{TYPE_ICONS[m.type]}</span>
    <div className="flex-1 min-w-0">
      <p className="text-sm leading-snug">{m.content}</p>
      <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border ${TYPE_COLORS[m.type]}`}>{m.type}</span>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => onPin(m)} aria-label={m.pinned ? "Unpin memory" : "Pin memory"}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/8 text-muted-foreground hover:text-foreground transition">
        {m.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => onDelete(m)} aria-label="Delete memory"
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);
