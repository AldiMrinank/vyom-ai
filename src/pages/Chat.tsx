import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, PenSquare, Copy, ThumbsUp, ThumbsDown, Mic, AudioLines, Plus, ArrowUp, RefreshCw, Share2, Download, ImagePlus, X, Check, ChevronDown, Search, Pencil, FileText, Paperclip, Bookmark, Globe, Brain, Layers } from "lucide-react";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc, limit, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { streamChat, generateTitle, ChatMsg } from "@/lib/chat";
import { loadSettings } from "@/lib/settings";
import { haptic } from "@/lib/haptic";
import { parseFile, ParsedFile } from "@/lib/fileReader";
import { toast } from "sonner";
import MarkdownMessage from "@/components/MarkdownMessage";
import Skeleton from "@/components/Skeleton";
import vyomLogo from "@/assets/vyom-logo.png";
import { useMemory } from "@/hooks/useMemory";
import { detectArtifact } from "@/components/artifacts/ArtifactDetector";
import type { DetectedArtifact } from "@/components/artifacts/ArtifactDetector";
import { shouldSearch, webSearch, formatSourcesForPrompt } from "@/lib/search";
import type { SearchResult } from "@/lib/search";
import { saveToLibrary } from "@/lib/library";

// Lazy-load heavy panels so they don't add to Chat's initial bundle
const ArtifactPanel = lazy(() => import("@/components/artifacts/ArtifactPanel"));
const MemoryManager = lazy(() => import("@/components/memory/MemoryManager"));

interface Msg { id: string; role: "user"|"assistant"; content: string; createdAt?: any; image?: string; failed?: boolean }

const fmtTime = (ts: any) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
};

// Strips both the internal [Image attached] suffix and the [File: name]...
// prefix that get added to stored message content, so neither leaks back
// into the AI context on regenerate, nor shows up in the UI or exports.
const FILE_PREFIX_RE = /^\[File: [^\]]+\]\n\n[\s\S]*?\n\n---\n\nUser question: /;
const stripMeta = (content: string) =>
  content.replace(FILE_PREFIX_RE, "").replace(/\n\n\[Image attached\]$/, "");

const Chat = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const initialQ = params.get("q");
  const convParam = params.get("c");

  const [convId, setConvId] = useState<string|null>(convParam);
  const [messages, setMessages] = useState<Msg[]>([]);
  const DRAFT_KEY = `vyom_draft_${convId ?? "new"}`;
  const [input, setInput] = useState(() => {
    try { return localStorage.getItem(`vyom_draft_${convId ?? "new"}`) ?? ""; } catch { return ""; }
  });
  const [streaming, setStreaming] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const [attachedFile, setAttachedFile] = useState<ParsedFile|null>(null);
  const [liked, setLiked] = useState<Record<string,boolean>>({});
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [editVal, setEditVal] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  // Artifact canvas
  const [artifact, setArtifact] = useState<DetectedArtifact | null>(null);
  const [showArtifact, setShowArtifact] = useState(false);
  // Memory panel
  const [showMemory, setShowMemory] = useState(false);
  // Web search sources shown alongside a response
  const [searchSources, setSearchSources] = useState<SearchResult[]>([]);
  // Memory hook — injects user memories into system prompt
  const { memoryContext, tryExtractMemory } = useMemory();

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const seededQ = useRef<string|null>(null);
  const msgCountAtLoad = useRef<number>(0);
  const abortRef = useRef<AbortController|null>(null);
  const firstDocRef = useRef<QueryDocumentSnapshot|null>(null);
  const [hasOlderMsgs, setHasOlderMsgs] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const PAGE = 50;

  useEffect(() => {
    if (!convId || !user) return;
    setLoadingMsgs(true);
    const msgsRef = collection(db, "conversations", convId, "messages");
    // Load only the most recent PAGE messages instead of the entire history.
    // For most conversations this is the entire chat; for very long ones it
    // avoids loading hundreds of messages the user may never scroll to.
    getDocs(query(msgsRef, orderBy("createdAt","desc"), limit(PAGE))).then(snap => {
      const loaded = snap.docs.reverse().map(d => ({ id: d.id, ...d.data() } as Msg));
      setMessages(loaded);
      msgCountAtLoad.current = loaded.length;
      firstDocRef.current = snap.docs[snap.docs.length - 1] ?? null; // oldest in this page
      setHasOlderMsgs(snap.docs.length === PAGE);
      setLoadingMsgs(false);
    }).catch(() => { toast.error("Failed to load chat"); setLoadingMsgs(false); });
  }, [convId, user]);

  const loadOlderMessages = useCallback(async () => {
    if (!convId || !firstDocRef.current || loadingOlder) return;
    setLoadingOlder(true);
    const msgsRef = collection(db, "conversations", convId, "messages");
    const snap = await getDocs(query(msgsRef, orderBy("createdAt","desc"), startAfter(firstDocRef.current), limit(PAGE)));
    const older = snap.docs.reverse().map(d => ({ id: d.id, ...d.data() } as Msg));
    firstDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
    setHasOlderMsgs(snap.docs.length === PAGE);
    setMessages(m => [...older, ...m]);
    msgCountAtLoad.current += older.length;
    setLoadingOlder(false);
  }, [convId, loadingOlder]);

  useEffect(() => {
    if (!user || !initialQ || seededQ.current === initialQ) return;
    seededQ.current = initialQ;
    send(initialQ);
    const np = new URLSearchParams(params); np.delete("q");
    setParams(np, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, initialQ]);

  const scrollToBottom = useCallback(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  useEffect(() => { if (!searchMode) scrollToBottom(); }, [messages, scrollToBottom, searchMode]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };

  const ensureConv = async (firstMsg: string): Promise<string|null> => {
    if (convId) return convId;
    if (!user) return null;
    try {
      const ref = await addDoc(collection(db, "conversations"), {
        userId: user.uid, title: firstMsg.slice(0,60),
        starred: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setConvId(ref.id);
      const np = new URLSearchParams(params); np.set("c", ref.id);
      setParams(np, { replace: true });
      return ref.id;
    } catch { toast.error("Could not start chat"); return null; }
  };

  const send = async (text: string, retryHistory?: Msg[]) => {
    if ((!text.trim() && !imagePreview && !attachedFile) || streaming || !user) return;
    haptic(8);
    setInput(""); try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setSearchSources([]);
    const img = imagePreview; setImagePreview(null);
    const file = attachedFile; setAttachedFile(null);
    const filePrefix = file ? `[File: ${file.name}]\n\n${file.content}\n\n---\n\nUser question: ` : "";

    // 1. Check if this needs a live web search
    const searchQuery = shouldSearch(text);
    let searchContext = "";
    if (searchQuery && !img && !file) {
      toast.info("Searching the web…", { duration: 2000 });
      const searchResp = await webSearch(searchQuery, 5);
      if (searchResp.results.length) {
        setSearchSources(searchResp.results);
        searchContext = formatSourcesForPrompt(searchResp.results);
      }
    }

    // 2. Build full text with search context appended
    const fullText = filePrefix + (text || (img ? "What's in this image?" : "Summarize this file.")) + searchContext;
    const displayText = text || (file ? `📄 ${file.name}` : "Image");

    const cid = await ensureConv(displayText);
    if (!cid) return;

    const msgsRef = collection(db, "conversations", cid, "messages");
    const dbContent = img ? `${displayText}\n\n[Image attached]` : displayText;
    const userRef = await addDoc(msgsRef, { role:"user", content:dbContent, userId:user.uid, createdAt:serverTimestamp() });
    const userMsg: Msg = { id: userRef.id, role:"user", content:dbContent, image: img||undefined };

    const msgHistory = retryHistory ?? [...messages];
    setMessages(m => [...m, userMsg]);
    setStreaming(true);

    // 3. Inject memory context as a system-level addition
    const memoryInjection = memoryContext;

    const history: ChatMsg[] = [...msgHistory, userMsg].map(m => ({
      role: m.role,
      content: img && m.id === userRef.id
        ? [{ type:"text" as const, text: fullText + memoryInjection }, { type:"image_url" as const, image_url:{ url:img } }]
        : m.id === userRef.id ? fullText + memoryInjection : m.content,
    }));

    // 4. Try to extract a memory from what the user said (background, non-blocking)
    tryExtractMemory(text).catch(() => {});

    let acc = "";
    const tempId = "tmp-" + Date.now();
    setMessages(m => [...m, { id:tempId, role:"assistant", content:"" }]);
    abortRef.current = new AbortController();

    // Throttle UI updates to ~60ms so mobile doesn't re-render on every
    // individual token — the content still accumulates in `acc` at full
    // streaming speed, we just batch how often React sees the update.
    let lastRender = 0;
    const flushAcc = () => {
      setMessages(m => m.map(x => x.id===tempId ? {...x, content:acc} : x));
      lastRender = Date.now();
    };

    try {
      await streamChat({ messages:history, signal:abortRef.current.signal,
        onDelta: chunk => {
          acc += chunk;
          if (Date.now() - lastRender > 60) flushAcc();
        },
        onDone: () => { flushAcc(); },
      });
    } catch (err) {
      if ((err as Error).name==="AbortError") { setMessages(m => m.filter(x => x.id!==tempId)); setStreaming(false); return; }
      toast.error(err instanceof Error ? err.message : "AI error");
      // The user's message was already saved to Firestore before the AI call
      // ran, so it can't just be removed from the UI on failure — it's
      // already part of the conversation history on reload. Mark it as
      // failed instead, so the person can see what happened and retry,
      // rather than being left with an unexplained message with no reply.
      setMessages(m => m.filter(x => x.id!==tempId).map(x => x.id===userRef.id ? {...x, failed:true} : x));
      setStreaming(false); return;
    }

    // Only persist an assistant message if we actually received content —
    // an error thrown right after the stream finishes shouldn't leave a
    // blank assistant message sitting in Firestore.
    let aiSaved = false;
    if (acc.trim()) {
      aiSaved = true;
      const aiRef = await addDoc(msgsRef, { role:"assistant", content:acc, userId:user.uid, createdAt:serverTimestamp() });
      setMessages(m => m.map(x => x.id===tempId ? {...x, id:aiRef.id} : x));
      // Detect artifacts (HTML, SVG, code, markdown) and show the canvas panel
      const detected = detectArtifact(acc);
      if (detected) {
        setArtifact(detected);
        setShowArtifact(true);
      }
    } else {
      setMessages(m => m.filter(x => x.id!==tempId));
    }

    // Whether this was the first exchange in the conversation, derived from
    // actual message counts rather than a ref that could go stale across
    // new-chat vs loaded-chat transitions.
    const isFirstExchange = msgCountAtLoad.current === 0 && (retryHistory ?? messages).length === 0;
    if (isFirstExchange && aiSaved) {
      msgCountAtLoad.current = 2;
      generateTitle(text, acc).then(title =>
        updateDoc(doc(db,"conversations",cid), { title, updatedAt:serverTimestamp() })
      );
    } else {
      updateDoc(doc(db,"conversations",cid), { updatedAt:serverTimestamp() });
    }
    setStreaming(false);
  };

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role==="user");
    if (!lastUser) return;
    haptic([10,50,10]);
    const historyUpTo = messages.slice(0, messages.findLastIndex(m => m.role==="user"));
    setMessages(m => m.slice(0, m.findLastIndex(x => x.role==="user")));
    // Strip both the image suffix and the file prefix before re-sending, so
    // re-sent file content doesn't get wrapped in another [File: ...] prefix.
    await send(stripMeta(lastUser.content), historyUpTo);
  };

  // Retries a message that was saved but never got an AI reply (the AI call
  // failed after the user's message was already written to Firestore). The
  // failed message is safe to delete outright here, unlike a normal edit/
  // regenerate — it never got a reply, so no other client could be relying
  // on it being part of an already-completed exchange.
  const retryFailed = async (msg: Msg) => {
    if (!convId || streaming) return;
    haptic(10);
    const idx = messages.findIndex(m => m.id === msg.id);
    const historyBefore = messages.slice(0, idx);
    setMessages(m => m.filter(x => x.id !== msg.id));
    try { await deleteDoc(doc(db, "conversations", convId, "messages", msg.id)); } catch {}
    await send(stripMeta(msg.content), historyBefore);
  };

  const saveEdit = async (msg: Msg) => {
    if (!editVal.trim() || !convId) return;
    await updateDoc(doc(db,"conversations",convId,"messages",msg.id), { content:editVal });
    setMessages(m => m.map(x => x.id===msg.id ? {...x,content:editVal} : x));
    setEditingId(null); haptic(10); toast.success("Updated");
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 20*1024*1024) { toast.error("Image must be under 20MB"); return; }
    // Resize to max 1024px and re-encode at 80% quality before storing in
    // state. Vision models don't benefit from higher resolution, and this
    // turns a typical 4-5MB phone photo into ~200-400KB, which is much
    // lighter on memory and OpenRouter payload size.
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setImagePreview(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = url;
    e.target.value = "";
  };

  const handleDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { toast.info("Reading file…"); const p = await parseFile(f); setAttachedFile(p); toast.success(`${p.name} attached`); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to read file"); }
    e.target.value = "";
  };

  const shareChat = async () => {
    haptic(10);
    const text = messages.map(m=>`${m.role==="user"?"You":"Vyom AI"}: ${stripMeta(m.content)}`).join("\n\n");
    if (navigator.share) { try { await navigator.share({title:"Vyom AI Chat",text}); return; } catch {} }
    await navigator.clipboard.writeText(text); toast.success("Chat copied");
  };

  const exportChat = () => {
    haptic(10);
    const text = messages.map(m=>`[${m.role==="user"?"You":"Vyom AI"}]\n${stripMeta(m.content)}`).join("\n\n---\n\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text],{type:"text/plain"})); a.download="vyom-chat.txt"; a.click();
    toast.success("Chat exported");
  };

  const copy = (t: string) => { haptic(8); navigator.clipboard.writeText(t); toast.success("Copied"); };
  const newChat = () => { setMessages([]); setConvId(null); msgCountAtLoad.current=0; navigate("/chat"); };
  const maxChars = 4000;
  const visibleMsgs = useMemo(
    () => searchQ.trim() ? messages.filter(m => m.content.toLowerCase().includes(searchQ.toLowerCase())) : messages,
    [messages, searchQ]
  );

  // Model label shown in the header — updated after each send so the user
  // can see which model Smart Route picked for their last message.
  const { model: settingsModel } = loadSettings();
  const MODELS_MAP: Record<string,string> = {
    "vyom-auto":                              "⚡ Smart Route",
    "google/gemini-2.0-flash-exp:free":       "Gemini Flash",
    "google/gemma-3-12b-it:free":             "Gemma 3",
    "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3",
    "openrouter/auto":                        "Auto",
    "deepseek/deepseek-r1:free":              "DeepSeek R1",
    "microsoft/phi-4-reasoning:free":         "Phi-4",
  };
  const modelLabel = MODELS_MAP[settingsModel] ?? settingsModel.split("/").pop()?.split(":")[0] ?? "AI";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 pt-5 pb-3 sticky top-0 z-10 bg-background/80 backdrop-blur-md">
        <button onClick={()=>navigate(-1)} className="flex h-10 w-10 items-center justify-center"><ChevronLeft className="h-5 w-5"/></button>
        <button onClick={()=>setShowTimestamps(t=>!t)} className="flex flex-col items-center gap-0">
          <div className="flex items-center gap-2">
            <img src={vyomLogo} alt="" className="h-6 w-6 object-contain"/>
            <span className="font-display text-base font-semibold">Vyom AI</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">{modelLabel}</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={()=>setShowMemory(true)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5" title="Memory"><Brain className="h-4 w-4 text-muted-foreground"/></button>
          {artifact && <button onClick={()=>setShowArtifact(v=>!v)} className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 ${showArtifact?"text-cyan-400":"text-muted-foreground"}`} title="Artifact Canvas"><Layers className="h-4 w-4"/></button>}
          <button onClick={()=>{setSearchMode(s=>!s);setSearchQ("");}} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5"><Search className="h-4 w-4 text-muted-foreground"/></button>
          {messages.length>0&&<><button onClick={shareChat} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5"><Share2 className="h-4 w-4 text-muted-foreground"/></button><button onClick={exportChat} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5"><Download className="h-4 w-4 text-muted-foreground"/></button></>}
          <button onClick={newChat} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5"><PenSquare className="h-4 w-4"/></button>
        </div>
      </header>

      {searchMode && (
        <div className="px-4 pb-2 animate-fade-in">
          <div className="glass-card flex items-center gap-2 p-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0"/>
            <input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search messages…" className="flex-1 bg-transparent text-sm focus:outline-none"/>
            {searchQ&&<button onClick={()=>setSearchQ("")}><X className="h-3.5 w-3.5 text-muted-foreground"/></button>}
          </div>
          {searchQ&&<p className="text-[11px] text-muted-foreground mt-1 px-1">{visibleMsgs.length} result{visibleMsgs.length!==1?"s":""}</p>}
        </div>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 px-4 py-2 pb-40 overflow-y-auto">
        {hasOlderMsgs && !searchMode && (
          <div className="flex justify-center pt-2">
            <button onClick={loadOlderMessages} disabled={loadingOlder}
              className="text-[11px] text-muted-foreground border border-white/10 rounded-full px-4 py-1.5 bg-white/5 hover:bg-white/10 transition disabled:opacity-50">
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {loadingMsgs ? (
          <div className="space-y-4 pt-4">{[1,2,3].map(i=><div key={i} className={`flex gap-3 ${i%2===0?"justify-end":""}`}>{i%2!==0&&<Skeleton className="h-8 w-8 rounded-full shrink-0"/>}<Skeleton className={`h-16 rounded-2xl ${i%2===0?"w-3/4":"w-4/5"}`}/></div>)}</div>
        ) : visibleMsgs.length===0&&!streaming ? (
          searchQ ? <p className="text-center text-sm text-muted-foreground py-12">No messages match "{searchQ}"</p> : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <img src={vyomLogo} alt="" className="h-16 w-16 object-contain opacity-50 mb-4"/>
              <p className="font-display text-lg font-semibold">Ask Vyom anything</p>
              <p className="text-xs text-muted-foreground mt-1">Your conversation starts here.</p>
            </div>
          )
        ) : null}

        {visibleMsgs.map((m,idx) =>
          m.role==="user" ? (
            <div key={m.id} className="flex flex-col items-end gap-1 animate-slide-up">
              {m.image&&<img src={m.image} alt="uploaded" className="max-w-[60%] rounded-2xl object-cover max-h-48"/>}
              {editingId===m.id ? (
                <div className="w-full max-w-[85%] space-y-2">
                  <textarea autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} rows={3} className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"/>
                  <div className="flex gap-2 justify-end">
                    <button onClick={()=>setEditingId(null)} className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10">Cancel</button>
                    <button onClick={()=>saveEdit(m)} className="px-3 py-1.5 rounded-xl text-xs bg-gradient-to-r from-cyan-500 to-purple-600 text-white">Save</button>
                  </div>
                </div>
              ) : (
                <div className="group relative max-w-[82%]">
                  <div className="rounded-2xl rounded-tr-sm border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm whitespace-pre-wrap">{stripMeta(m.content)}</div>
                  <button onClick={()=>{setEditingId(m.id);setEditVal(stripMeta(m.content));haptic(8);}} className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition text-muted-foreground"><Pencil className="h-3.5 w-3.5"/></button>
                </div>
              )}
              {showTimestamps&&m.createdAt&&<p className="text-[10px] text-muted-foreground px-1">{fmtTime(m.createdAt)}</p>}
              {m.failed && (
                <button onClick={()=>retryFailed(m)} disabled={streaming}
                  className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-[11px] text-red-400 disabled:opacity-50">
                  <RefreshCw className="h-3 w-3"/> Failed to send — tap to retry
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex animate-slide-up gap-3">
              <img src={vyomLogo} alt="" className="mt-1 h-7 w-7 shrink-0 object-contain rounded-full bg-white/5 p-0.5"/>
              <div className="flex-1 min-w-0">
                <MarkdownMessage content={m.content} streaming={streaming&&m.id.startsWith("tmp-")}/>
                {showTimestamps&&m.createdAt&&<p className="text-[10px] text-muted-foreground mt-1">{fmtTime(m.createdAt)}</p>}
                {!m.id.startsWith("tmp-")&&(
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button onClick={()=>copy(m.content)} className="text-muted-foreground hover:text-foreground transition"><Copy className="h-3.5 w-3.5"/></button>
                    <button onClick={()=>{haptic(8);setLiked(l=>({...l,[m.id]:!l[m.id]}));}} className={`transition ${liked[m.id]?"text-green-400":"text-muted-foreground hover:text-green-400"}`}>{liked[m.id]?<Check className="h-3.5 w-3.5"/>:<ThumbsUp className="h-3.5 w-3.5"/>}</button>
                    <button className="text-muted-foreground hover:text-red-400 transition"><ThumbsDown className="h-3.5 w-3.5"/></button>
                    <button onClick={async()=>{
                      if(!user)return; haptic(8);
                      await saveToLibrary(user.uid,{type:"answer",title:messages.find(x=>x.role==="user"&&messages.indexOf(x)<messages.indexOf(m))?.content?.slice(0,80)||"Saved answer",content:m.content,tags:[]});
                      toast.success("Saved to Library");
                    }} className="text-muted-foreground hover:text-amber-400 transition" title="Save to Library"><Bookmark className="h-3.5 w-3.5"/></button>
                    {detectArtifact(m.content)&&<button onClick={()=>{const a=detectArtifact(m.content);if(a){setArtifact(a);setShowArtifact(true);haptic(8);}}} className="text-muted-foreground hover:text-cyan-400 transition" title="Open in Canvas"><Layers className="h-3.5 w-3.5"/></button>}
                    {idx===visibleMsgs.length-1&&<button onClick={regenerate} disabled={streaming} className="text-muted-foreground hover:text-cyan-400 transition ml-auto disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5"/></button>}
                  </div>
                )}
                {/* Web search sources shown after a search-grounded response */}
                {idx===visibleMsgs.length-1&&searchSources.length>0&&!streaming&&(
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sources</p>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {searchSources.slice(0,5).map((s,si)=>(
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 glass border border-white/8 rounded-xl px-2.5 py-1.5 max-w-[180px] hover:border-white/20 transition">
                          {s.favicon&&<img src={s.favicon} alt="" className="h-3.5 w-3.5 rounded shrink-0"/>}
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium truncate">[{si+1}] {s.title}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{new URL(s.url).hostname}</p>
                          </div>
                          <Globe className="h-3 w-3 text-muted-foreground shrink-0"/>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
        <div ref={endRef}/>
      </div>

      {showScrollBtn&&<button onClick={()=>{scrollToBottom();setShowScrollBtn(false);}} className="fixed bottom-36 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/20 backdrop-blur-sm shadow-lg animate-fade-in"><ChevronDown className="h-4 w-4"/></button>}

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 z-10" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        {(imagePreview||attachedFile)&&(
          <div className="flex gap-2 mb-2 ml-1">
            {imagePreview&&<div className="relative inline-block"><img src={imagePreview} alt="" className="h-16 w-16 rounded-xl object-cover border border-white/10"/><button onClick={()=>setImagePreview(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-white/20 flex items-center justify-center"><X className="h-3 w-3"/></button></div>}
            {attachedFile&&<div className="relative flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-3 py-2"><FileText className="h-5 w-5 text-cyan-400 shrink-0"/><div className="min-w-0"><p className="text-xs font-medium truncate max-w-[140px]">{attachedFile.name}</p><p className="text-[10px] text-muted-foreground">{(attachedFile.size/1024).toFixed(0)}KB</p></div><button onClick={()=>setAttachedFile(null)} className="ml-1 text-muted-foreground"><X className="h-3.5 w-3.5"/></button></div>}
          </div>
        )}
        <div className="glass-card">
          <div className="flex items-center gap-2 p-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage}/>
            <input ref={docRef} type="file" accept=".pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css" className="hidden" onChange={handleDoc}/>
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={()=>fileRef.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-cyan-500/50 transition"><ImagePlus className="h-4 w-4"/></button>
              <button type="button" onClick={()=>docRef.current?.click()} className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-purple-500/50 transition"><Paperclip className="h-4 w-4"/></button>
            </div>
            <input value={input} onChange={e=>{setInput(e.target.value);try{localStorage.setItem(DRAFT_KEY,e.target.value);}catch{}}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input);}}} placeholder={streaming?"Vyom is thinking…":"Message Vyom"} disabled={streaming} className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-60 min-w-0"/>
            {streaming ? (
              <button type="button" onClick={()=>abortRef.current?.abort()} className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 shrink-0"><X className="h-4 w-4 text-red-400"/></button>
            ) : input.trim()||imagePreview||attachedFile ? (
              <button type="button" onClick={()=>send(input)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-purple-600 shrink-0"><ArrowUp className="h-4 w-4 text-white"/></button>
            ) : (
              <><button type="button" className="text-muted-foreground shrink-0"><Mic className="h-4 w-4"/></button><Link to="/voice" className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground shrink-0"><AudioLines className="h-4 w-4 text-background"/></Link></>
            )}
          </div>
          {input.length>maxChars*0.7&&<div className="px-3 pb-2 flex items-center gap-2"><div className="flex-1 h-1 rounded-full bg-white/10"><div className="h-1 rounded-full transition-all" style={{width:`${Math.min(input.length/maxChars*100,100)}%`,background:input.length>maxChars?"#ef4444":"#06b6d4"}}/></div><span className={`text-[10px] ${input.length>maxChars?"text-red-400":"text-muted-foreground"}`}>{input.length}/{maxChars}</span></div>}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5 opacity-50">Tap title to toggle timestamps · Enter to send</p>
      </div>

      {/* Artifact Canvas — slides in from the right as a full-screen overlay on mobile */}
      {showArtifact && artifact && (
        <div className="fixed inset-0 z-40 animate-fade-in">
          <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-sm text-muted-foreground">Loading canvas…</div></div>}>
            <ArtifactPanel artifact={artifact} onClose={() => setShowArtifact(false)} />
          </Suspense>
        </div>
      )}

      {/* Memory Manager — full-screen overlay */}
      {showMemory && (
        <Suspense fallback={null}>
          <MemoryManager onClose={() => setShowMemory(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default Chat;
