import { Search, Trash2, MessageSquare, Pencil, X, Check, Star, RefreshCw, Filter, Pin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, limit, startAfter, getCountFromServer, writeBatch } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import Skeleton from "@/components/Skeleton";

interface Conv { id: string; title: string; updatedAt: any; starred?: boolean }
const PAGE = 15;
const fmt = (ts: any) => { const d=ts?.toDate?ts.toDate():new Date(ts||0),t=new Date();t.setHours(0,0,0,0);return d>=t?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"}); };
const groupOf = (ts: any) => { const d=ts?.toDate?ts.toDate():new Date(ts||0),t=new Date();t.setHours(0,0,0,0);const y=new Date(t);y.setDate(y.getDate()-1);const w=new Date(t);w.setDate(w.getDate()-7);if(d>=t)return"Today";if(d>=y)return"Yesterday";if(d>=w)return"This week";return"Older"; };

// Auto-assign topic icon based on title keywords
function topicIcon(title: string): string {
  const t = title.toLowerCase();
  if (/code|program|script|function|bug|error|react|python|javascript|typescript|html|css|api|sql|algorithm/.test(t)) return "💻";
  if (/image|photo|picture|design|art|draw|generate|visual|wallpaper/.test(t)) return "🎨";
  if (/study|learn|exam|homework|explain|education|math|science|formula/.test(t)) return "📚";
  if (/trip|travel|plan|japan|visit|tour|flight|hotel|itinerary/.test(t)) return "✈️";
  if (/cook|recipe|food|meal|eat|dish|ingredient/.test(t)) return "🍳";
  if (/music|song|lyric|artist|playlist|beat/.test(t)) return "🎵";
  if (/write|essay|story|blog|poem|draft|content/.test(t)) return "✍️";
  if (/business|startup|marketing|strategy|finance|money|invest/.test(t)) return "📈";
  if (/health|fitness|workout|exercise|diet|mental/.test(t)) return "💪";
  return "💬";
}

// Delete a conversation AND its messages subcollection using a batch
async function deleteConversationFull(id: string) {
  if (!db) return;
  // Firestore JS SDK requires deleting subcollection docs individually
  const msgSnap = await getDocs(collection(db, "conversations", id, "messages"));
  const batch = writeBatch(db);
  msgSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, "conversations", id));
  await batch.commit();
}

const History = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [renamingId, setRenamingId] = useState<string|null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [swipedId, setSwipedId] = useState<string|null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all"|"starred">("all");
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string|null>(null); // for undo
  const lastDocRef = useRef<any>(null);
  const touchStart = useRef<number>(0);
  const pullStart = useRef<number>(0);
  const loaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // Scope last_visit to the current user — fixes the multi-user device bug
  const lastVisitKey = `last_visit_${user?.uid ?? "anon"}`;

  const load = useCallback(async (offset=0) => {
    if (!user || !db) return;
    if (offset===0) setLoading(true); else setLoadingMore(true);
    try {
      let q = query(collection(db,"conversations"), where("userId","==",user.uid), orderBy("updatedAt","desc"), limit(PAGE));
      if (offset>0 && lastDocRef.current) q = query(collection(db,"conversations"), where("userId","==",user.uid), orderBy("updatedAt","desc"), startAfter(lastDocRef.current), limit(PAGE));
      const snap = await getDocs(q);
      const rows = snap.docs.map(d => ({ id:d.id, ...d.data() } as Conv));
      lastDocRef.current = snap.docs[snap.docs.length-1];
      setItems(prev => offset===0 ? rows : [...prev,...rows]);
      setHasMore(rows.length===PAGE);
    } catch { toast.error("Failed to load history"); }
    finally { if(offset===0) setLoading(false); else setLoadingMore(false); }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Mark visited (scoped to user)
    localStorage.setItem(lastVisitKey, new Date().toISOString());
  }, [lastVisitKey]);

  useEffect(() => {
    const obs = new IntersectionObserver(entries => { if(entries[0].isIntersecting&&hasMore&&!loadingMore&&!loading) load(items.length); },{threshold:0.1});
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore,loadingMore,loading,load,items.length]);

  const onTouchStartPull=(e:React.TouchEvent)=>{pullStart.current=e.touches[0].clientY;};
  const onTouchEndPull=async(e:React.TouchEvent)=>{const diff=e.changedTouches[0].clientY-pullStart.current;if(diff>70&&(containerRef.current?.scrollTop??0)===0){haptic([10,50,10]);setRefreshing(true);lastDocRef.current=null;await load(0);setRefreshing(false);}};

  // Soft-delete with undo: remove from UI immediately, hard-delete after 4s
  const del = (id: string) => {
    if (!db) return;
    haptic([10,50,10]);
    const item = items.find(i => i.id === id);
    setItems(it => it.filter(c => c.id !== id));
    setSwipedId(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const toastId = toast("Chat deleted", {
      action: {
        label: "Undo",
        onClick: () => {
          if (undoTimer.current) clearTimeout(undoTimer.current);
          if (item) setItems(it => [item, ...it].sort((a,b) => (b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0)));
          toast.dismiss(toastId);
        }
      },
      duration: 4000,
    });
    undoTimer.current = setTimeout(async () => {
      try { await deleteConversationFull(id); }
      catch { toast.error("Failed to delete chat"); }
    }, 4000);
  };

  const toggleStar = async (it:Conv,e:React.MouseEvent) => { if(!db)return; e.stopPropagation();haptic(8);try{await updateDoc(doc(db,"conversations",it.id),{starred:!it.starred});setItems(prev=>prev.map(c=>c.id===it.id?{...c,starred:!it.starred}:c));}catch{toast.error("Failed to star");} };
  const startRename=(it:Conv,e:React.MouseEvent)=>{e.stopPropagation();haptic(8);setRenamingId(it.id);setRenameVal(it.title);setSwipedId(null);};
  const confirmRename=async(id:string)=>{if(!renameVal.trim()||!db){setRenamingId(null);return;}try{await updateDoc(doc(db,"conversations",id),{title:renameVal.trim()});setItems(it=>it.map(c=>c.id===id?{...c,title:renameVal.trim()}:c));setRenamingId(null);haptic(10);toast.success("Renamed");}catch{toast.error("Failed to rename");}};

  // FIX: clearAll now deletes message subcollections too, in batches of 50
  const clearAll = async () => {
    if (!db || !user) return;
    setConfirmClearAll(false);
    haptic([10,50,10,50,10]);
    try {
      // Paginate to avoid loading thousands of docs at once
      let lastSnap: any = null;
      while (true) {
        let q = query(collection(db,"conversations"), where("userId","==",user.uid), limit(50));
        if (lastSnap) q = query(collection(db,"conversations"), where("userId","==",user.uid), startAfter(lastSnap), limit(50));
        const snap = await getDocs(q);
        if (snap.empty) break;
        for (const d of snap.docs) {
          await deleteConversationFull(d.id);
        }
        if (snap.docs.length < 50) break;
        lastSnap = snap.docs[snap.docs.length-1];
      }
      setItems([]);
      toast.success("History cleared");
    } catch { toast.error("Failed to clear history"); }
  };

  const onTouchStartSwipe=(id:string,e:React.TouchEvent)=>{touchStart.current=e.touches[0].clientX;};
  const onTouchEndSwipe=(id:string,e:React.TouchEvent)=>{const diff=touchStart.current-e.changedTouches[0].clientX;if(diff>60){setSwipedId(id);haptic(8);}else if(diff<-20)setSwipedId(null);};

  const filtered=items.filter(i=>activeTab==="starred"?i.starred:true).filter(i=>i.title.toLowerCase().includes(search.toLowerCase()));
  const groups=Array.from(new Set(filtered.map(i=>groupOf(i.updatedAt))));
  const starredCount=items.filter(i=>i.starred).length;

  return (
    <div ref={containerRef} className="h-dvh overflow-y-auto" onTouchStart={onTouchStartPull} onTouchEnd={onTouchEndPull}>
      <div className="px-5 pt-5 pb-28">

        {/* Header */}
        <header className="flex items-center justify-between mb-1">
          <div>
            <h1 className="font-display text-2xl font-bold">History</h1>
            <p className="text-xs text-muted-foreground">Your conversations</p>
          </div>
          <div className="flex items-center gap-2">
            {refreshing && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground"/>}
            <button onClick={()=>setShowSearch(s=>!s)} className="glass flex h-10 w-10 items-center justify-center rounded-full active:scale-95 transition">
              <Search className="h-4 w-4"/>
            </button>
            <button onClick={()=>setConfirmClearAll(true)} className="glass flex h-10 w-10 items-center justify-center rounded-full active:scale-95 transition text-red-400">
              <Trash2 className="h-4 w-4"/>
            </button>
          </div>
        </header>

        {/* Search */}
        {showSearch && (
          <div className="relative mt-3 mb-4 animate-fade-in">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} autoFocus
              placeholder="Search your chats..." className="w-full rounded-2xl border border-white/10 bg-white/5 pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-purple-500/50"/>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mt-4 mb-4">
          {[{id:"all",label:"All Chats"},{id:"starred",label:`Pinned${starredCount>0?` (${starredCount})`:""}`}].map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${activeTab===tab.id?"bg-purple-600/80 text-white shadow-[0_0_12px_rgba(124,58,237,0.4)]":"glass text-muted-foreground"}`}>
              {tab.id==="starred"&&<Pin className="h-3 w-3"/>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-16 rounded-2xl"/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="text-4xl opacity-30">{search?"🔍":"💬"}</div>
            <p className="text-muted-foreground text-sm">{search?"No chats match your search":"No conversations yet"}</p>
            {!search && <button onClick={()=>navigate("/chat")} className="mt-2 rounded-full bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-2 text-sm font-medium text-white">Start chatting</button>}
          </div>
        ) : (
          <>
            {groups.map(group => (
              <div key={group} className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group}</h3>
                  {group==="Today" && items.length>0 && (
                    <button onClick={()=>setConfirmClearAll(true)} className="text-[11px] text-red-400/70 hover:text-red-400 transition">Clear all</button>
                  )}
                </div>
                <div className="space-y-2">
                  {filtered.filter(i=>groupOf(i.updatedAt)===group).map(item=>(
                    <div key={item.id} className="relative overflow-hidden rounded-2xl"
                      onTouchStart={e=>onTouchStartSwipe(item.id,e)} onTouchEnd={e=>onTouchEndSwipe(item.id,e)}>

                      {/* Swipe actions */}
                      <div className={`absolute right-0 top-0 h-full flex items-center gap-1 px-3 bg-gradient-to-l from-[#1a0533] to-transparent transition-all duration-200 ${swipedId===item.id?"translate-x-0 opacity-100":"translate-x-full opacity-0"}`}>
                        <button onClick={e=>startRename(item,e)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:scale-90"><Pencil className="h-4 w-4 text-blue-300"/></button>
                        <button onClick={()=>del(item.id)} className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20 active:scale-90"><Trash2 className="h-4 w-4 text-red-400"/></button>
                      </div>

                      {/* Main row */}
                      <div className={`glass flex items-center gap-3 rounded-2xl p-3 transition active:scale-[0.98] cursor-pointer border border-white/[0.06] ${swipedId===item.id?"-translate-x-24":""}`}
                        style={{transition:"transform 0.2s ease"}}
                        onClick={()=>{if(swipedId===item.id){setSwipedId(null);return;}haptic(8);navigate(`/chat?c=${item.id}`);}}>

                        {/* Topic icon */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg border border-white/8">
                          {topicIcon(item.title)}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          {renamingId===item.id ? (
                            <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                              <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                                onKeyDown={e=>{if(e.key==="Enter")confirmRename(item.id);if(e.key==="Escape")setRenamingId(null);}}
                                className="flex-1 rounded-lg bg-white/10 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"/>
                              <button onClick={()=>confirmRename(item.id)} className="text-green-400"><Check className="h-4 w-4"/></button>
                              <button onClick={()=>setRenamingId(null)} className="text-muted-foreground"><X className="h-4 w-4"/></button>
                            </div>
                          ) : (
                            <>
                              <p className="truncate text-sm font-semibold">{item.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{fmt(item.updatedAt)}</p>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0" onClick={e=>e.stopPropagation()}>
                          <button onClick={e=>toggleStar(item,e)} className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-90 ${item.starred?"text-amber-400":"text-muted-foreground/40"}`}>
                            <Star className="h-4 w-4" fill={item.starred?"currentColor":"none"}/>
                          </button>
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground/30"/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div ref={loaderRef} className="py-2">
              {loadingMore && <div className="flex justify-center"><div className="h-5 w-5 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin"/></div>}
            </div>
          </>
        )}
      </div>

      {/* Clear All modal */}
      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setConfirmClearAll(false)}>
          <div className="glass-card w-full max-w-md rounded-t-3xl p-6 animate-slide-up" onClick={e=>e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold mb-1">Delete all chats?</h3>
            <p className="text-sm text-muted-foreground mb-5">This will permanently delete all your conversations and their messages. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={()=>setConfirmClearAll(false)} className="flex-1 rounded-xl glass py-2.5 text-sm font-medium">Cancel</button>
              <button onClick={clearAll} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white">Delete all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
