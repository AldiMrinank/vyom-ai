import { Search, Trash2, MessageSquare, Pencil, X, Check, Star, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, limit, startAfter, getCountFromServer } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";
import Skeleton from "@/components/Skeleton";

interface Conv { id: string; title: string; updatedAt: any; starred?: boolean }
const PAGE = 15;
const fmt = (ts: any) => { const d=ts?.toDate?ts.toDate():new Date(ts||0),t=new Date();t.setHours(0,0,0,0);return d>=t?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"short",day:"numeric"}); };
const groupOf = (ts: any) => { const d=ts?.toDate?ts.toDate():new Date(ts||0),t=new Date();t.setHours(0,0,0,0);const y=new Date(t);y.setDate(y.getDate()-1);const w=new Date(t);w.setDate(w.getDate()-7);if(d>=t)return"Today";if(d>=y)return"Yesterday";if(d>=w)return"This week";return"Older"; };

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
  const lastDocRef = useRef<any>(null);
  const touchStart = useRef<number>(0);
  const pullStart = useRef<number>(0);
  const loaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (offset=0) => {
    if (!user) return;
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
    const obs = new IntersectionObserver(entries => { if(entries[0].isIntersecting&&hasMore&&!loadingMore&&!loading) load(items.length); },{threshold:0.1});
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore,loadingMore,loading,load,items.length]);

  const onTouchStartPull=(e:React.TouchEvent)=>{pullStart.current=e.touches[0].clientY;};
  const onTouchEndPull=async(e:React.TouchEvent)=>{const diff=e.changedTouches[0].clientY-pullStart.current;if(diff>70&&(containerRef.current?.scrollTop??0)===0){haptic([10,50,10]);setRefreshing(true);lastDocRef.current=null;await load(0);setRefreshing(false);}};

  const del = async (id:string) => { haptic([10,50,10]);await deleteDoc(doc(db,"conversations",id));setItems(it=>it.filter(c=>c.id!==id));setSwipedId(null);toast.success("Deleted"); };
  const toggleStar = async (it:Conv,e:React.MouseEvent) => { e.stopPropagation();haptic(8);await updateDoc(doc(db,"conversations",it.id),{starred:!it.starred});setItems(prev=>prev.map(c=>c.id===it.id?{...c,starred:!it.starred}:c)); };
  const startRename=(it:Conv,e:React.MouseEvent)=>{e.stopPropagation();haptic(8);setRenamingId(it.id);setRenameVal(it.title);setSwipedId(null);};
  const confirmRename=async(id:string)=>{if(!renameVal.trim()){setRenamingId(null);return;}await updateDoc(doc(db,"conversations",id),{title:renameVal.trim()});setItems(it=>it.map(c=>c.id===id?{...c,title:renameVal.trim()}:c));setRenamingId(null);haptic(10);toast.success("Renamed");};
  const clearAll=async()=>{if(!confirm("Delete all chats?"))return;haptic([10,50,10,50,10]);const snap=await getDocs(query(collection(db,"conversations"),where("userId","==",user?.uid)));await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));setItems([]);toast.success("History cleared");};
  const onTouchStartSwipe=(id:string,e:React.TouchEvent)=>{touchStart.current=e.touches[0].clientX;};
  const onTouchEndSwipe=(id:string,e:React.TouchEvent)=>{const diff=touchStart.current-e.changedTouches[0].clientX;if(diff>60){setSwipedId(id);haptic(8);}else if(diff<-20)setSwipedId(null);};

  const filtered=items.filter(i=>activeTab==="starred"?i.starred:true).filter(i=>i.title.toLowerCase().includes(search.toLowerCase()));
  const groups=Array.from(new Set(filtered.map(i=>groupOf(i.updatedAt))));
  const starredCount=items.filter(i=>i.starred).length;

  return (
    <div ref={containerRef} className="h-screen overflow-y-auto" onTouchStart={onTouchStartPull} onTouchEnd={onTouchEndPull}>
      <div className="px-5 pt-5 pb-28">
        <header className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold">History</h1>
          <div className="flex items-center gap-1">
            <button onClick={async()=>{haptic(8);setRefreshing(true);lastDocRef.current=null;await load(0);setRefreshing(false);}} className={`flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5 ${refreshing?"animate-spin":""}`}><RefreshCw className="h-4 w-4"/></button>
            <button onClick={()=>{haptic(8);setShowSearch(s=>!s);}} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5"><Search className="h-4 w-4"/></button>
            <button onClick={clearAll} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5"><Trash2 className="h-4 w-4"/></button>
          </div>
        </header>
        <div className="flex gap-2 mt-4">
          {(["all","starred"] as const).map(tab=>(
            <button key={tab} onClick={()=>setActiveTab(tab)} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab===tab?"bg-gradient-to-r from-cyan-500 to-purple-600 text-white":"glass text-muted-foreground"}`}>
              {tab==="starred"&&<Star className="h-3 w-3"/>}{tab==="all"?"All Chats":`Starred${starredCount>0?` (${starredCount})`:""}`}
            </button>
          ))}
        </div>
        {showSearch&&<div className="glass-card mt-3 flex items-center gap-2 p-2 animate-fade-in"><Search className="h-4 w-4 text-muted-foreground shrink-0"/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chats…" className="flex-1 bg-transparent text-sm focus:outline-none"/>{search&&<button onClick={()=>setSearch("")}><X className="h-3.5 w-3.5 text-muted-foreground"/></button>}</div>}
        {refreshing&&<div className="text-center py-3 text-xs text-muted-foreground animate-pulse">Refreshing…</div>}
        <div className="mt-5 space-y-5">
          {loading?(<div className="space-y-3">{[1,2,3,4,5].map(i=><div key={i} className="flex gap-3 items-center"><Skeleton className="h-10 w-10 rounded-xl shrink-0"/><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-3/4"/><Skeleton className="h-2.5 w-1/3"/></div></div>)}</div>
          ):groups.length===0?(<div className="py-16 text-center"><MessageSquare className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">{search?"No matches":activeTab==="starred"?"No starred chats":"No chats yet"}</p>{!search&&activeTab==="all"&&<button onClick={()=>navigate("/chat")} className="mt-4 rounded-full bg-gradient-aurora px-5 py-2 text-xs font-semibold text-primary-foreground shadow-glow">Start your first chat</button>}</div>
          ):groups.map(g=>(
            <div key={g}>
              <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{g}</h2>
              <div className="space-y-2">
                {filtered.filter(i=>groupOf(i.updatedAt)===g).map(it=>(
                  <div key={it.id} className="relative overflow-hidden rounded-2xl" onTouchStart={e=>onTouchStartSwipe(it.id,e)} onTouchEnd={e=>onTouchEndSwipe(it.id,e)}>
                    <div className="absolute inset-y-0 right-0 flex">
                      <button onClick={e=>startRename(it,e)} className="flex w-14 items-center justify-center bg-blue-600/80"><Pencil className="h-4 w-4 text-white"/></button>
                      <button onClick={()=>del(it.id)} className="flex w-14 items-center justify-center bg-red-600/80"><Trash2 className="h-4 w-4 text-white"/></button>
                    </div>
                    <div className={`glass-card flex w-full items-center gap-3 p-3 text-left transition-transform duration-200 ${swipedId===it.id?"-translate-x-28":"translate-x-0"}`} onClick={()=>{if(swipedId===it.id){setSwipedId(null);return;}haptic(8);navigate(`/chat?c=${it.id}`);}}>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-glow ${it.starred?"bg-gradient-to-br from-yellow-500 to-orange-500":"bg-gradient-to-br from-primary to-primary-glow"}`}>{it.starred?<Star className="h-4 w-4 text-white fill-white"/>:<MessageSquare className="h-4 w-4 text-primary-foreground"/>}</span>
                      <div className="min-w-0 flex-1">
                        {renamingId===it.id?(<div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}><input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")confirmRename(it.id);if(e.key==="Escape")setRenamingId(null);}} className="flex-1 bg-white/10 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 min-w-0"/><button onClick={()=>confirmRename(it.id)} className="text-green-400 shrink-0"><Check className="h-4 w-4"/></button><button onClick={()=>setRenamingId(null)} className="text-muted-foreground shrink-0"><X className="h-4 w-4"/></button></div>):(<><p className="truncate text-sm font-semibold">{it.title}</p><p className="text-[11px] text-muted-foreground">{fmt(it.updatedAt)}</p></>)}
                      </div>
                      {renamingId!==it.id&&<div className="flex items-center gap-1 shrink-0"><button onClick={e=>toggleStar(it,e)} className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${it.starred?"text-yellow-400":"text-muted-foreground hover:text-yellow-400"}`}><Star className={`h-3.5 w-3.5 ${it.starred?"fill-yellow-400":""}`}/></button><button onClick={e=>startRename(it,e)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition"><Pencil className="h-3.5 w-3.5"/></button><button onClick={e=>{e.stopPropagation();del(it.id);}} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive transition"><Trash2 className="h-3.5 w-3.5"/></button></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {hasMore&&!loading&&<div ref={loaderRef} className="py-4 text-center">{loadingMore&&<div className="text-xs text-muted-foreground animate-pulse">Loading more…</div>}</div>}
      </div>
    </div>
  );
};
export default History;
