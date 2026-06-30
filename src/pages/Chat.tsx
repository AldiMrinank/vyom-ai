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
import { useMemory } from "@/hooks/useMemory";
import { detectArtifact } from "@/components/artifacts/ArtifactDetector";
import type { DetectedArtifact } from "@/components/artifacts/ArtifactDetector";
import { shouldSearch, webSearch, formatSourcesForPrompt } from "@/lib/search";
import type { SearchResult } from "@/lib/search";
import { saveToLibrary } from "@/lib/library";

const ArtifactPanel = lazy(() => import("@/components/artifacts/ArtifactPanel"));
const MemoryManager = lazy(() => import("@/components/memory/MemoryManager"));

interface Msg { id: string; role: "user"|"assistant"; content: string; createdAt?: any; image?: string; failed?: boolean }

const fmtTime = (ts: any) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
};

const FILE_PREFIX_RE = /^\[File: [^\]]+\]\n\n[\s\S]*?\n\n---\n\nUser question: /;
const stripMeta = (content: string) =>
  content.replace(FILE_PREFIX_RE, "").replace(/\n\n\[Image attached\]$/, "");

// Stable model label — read settings once, not on every render
const { model: initialModel } = loadSettings();
const MODELS_MAP: Record<string,string> = {
  "vyom-auto":                              "⚡ Smart Route",
  "google/gemini-2.0-flash-exp:free":       "Gemini Flash",
  "google/gemma-3-12b-it:free":             "Gemma 3",
  "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3",
  "openrouter/auto":                        "Auto",
  "deepseek/deepseek-r1:free":              "DeepSeek R1",
  "microsoft/phi-4-reasoning:free":         "Phi-4",
};
const getModelLabel = (m: string) => MODELS_MAP[m] ?? m.split("/").pop()?.split(":")[0] ?? "AI";

const Chat = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const initialQ = params.get("q");
  const convParam = params.get("c");

  const [convId, setConvId] = useState<string|null>(convParam);
  const [messages, setMessages] = useState<Msg[]>([]);
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
  const [artifact, setArtifact] = useState<DetectedArtifact | null>(null);
  const [showArtifact, setShowArtifact] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [searchSources, setSearchSources] = useState<SearchResult[]>([]);
  const [modelLabel, setModelLabel] = useState(() => getModelLabel(initialModel));

  // FIX: DRAFT_KEY in a ref so send() and the onChange handler always see the
  // current value without needing to be in the dependency array.
  const draftKeyRef = useRef(`vyom_draft_${convId ?? "new"}`);
  useEffect(() => {
    draftKeyRef.current = `vyom_draft_${convId ?? "new"}`;
  }, [convId]);

  const [input, setInput] = useState(() => {
    try { return localStorage.getItem(`vyom_draft_${convParam ?? "new"}`) ?? ""; } catch { return ""; }
  });

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
  // Keep streaming state in a ref for use inside send() callbacks
  const streamingRef = useRef(false);
  const PAGE = 50;

  // FIX: track mounted state so async Firestore calls don't setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const { memoryContext, tryExtractMemory } = useMemory();

  // Load messages when convId changes
  useEffect(() => {
    if (!convId || !user || !db) return;
    setLoadingMsgs(true);
    const msgsRef = collection(db, "conversations", convId, "messages");
    getDocs(query(msgsRef, orderBy("createdAt","desc"), limit(PAGE))).then(snap => {
      if (!mountedRef.current) return;
      const loaded = snap.docs.reverse().map(d => ({ id: d.id, ...d.data() } as Msg));
      setMessages(loaded);
      msgCountAtLoad.current = loaded.length;
      firstDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasOlderMsgs(snap.docs.length === PAGE);
      setLoadingMsgs(false);
    }).catch(() => {
      if (!mountedRef.current) return;
      toast.error("Failed to load chat");
      setLoadingMsgs(false);
    });
  }, [convId, user]);

  const loadOlderMessages = useCallback(async () => {
    if (!convId || !firstDocRef.current || loadingOlder || !db) return;
    setLoadingOlder(true);
    try {
      const msgsRef = collection(db, "conversations", convId, "messages");
      const snap = await getDocs(query(msgsRef, orderBy("createdAt","desc"), startAfter(firstDocRef.current), limit(PAGE)));
      if (!mountedRef.current) return;
      const older = snap.docs.reverse().map(d => ({ id: d.id, ...d.data() } as Msg));
      firstDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasOlderMsgs(snap.docs.length === PAGE);
      setMessages(m => [...older, ...m]);
      msgCountAtLoad.current += older.length;
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [convId, loadingOlder]);

  const scrollToBottom = useCallback(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), []);
  useEffect(() => { if (!searchMode) scrollToBottom(); }, [messages, scrollToBottom, searchMode]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  // FIX: ensureConv wrapped in useCallback with stable deps
  const convIdRef = useRef(convId);
  const paramsRef = useRef(params);
  useEffect(() => { convIdRef.current = convId; }, [convId]);
  useEffect(() => { paramsRef.current = params; }, [params]);

  const ensureConv = useCallback(async (firstMsg: string): Promise<string | null> => {
    if (convIdRef.current) return convIdRef.current;
    if (!user) return null;
    if (!db) {
      const localId = "local-" + Date.now();
      setConvId(localId); convIdRef.current = localId;
      return localId;
    }
    try {
      const ref = await addDoc(collection(db, "conversations"), {
        userId: user.uid, title: firstMsg.slice(0,60),
        starred: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      if (!mountedRef.current) return null;
      setConvId(ref.id);
      const np = new URLSearchParams(paramsRef.current); np.set("c", ref.id);
      setParams(np, { replace: true });
      return ref.id;
    } catch {
      const localId = "local-" + Date.now();
      setConvId(localId); convIdRef.current = localId;
      toast.error("Couldn't save chat history — but you can still chat!");
      return localId;
    }
  }, [user, setParams]);

  // FIX: send wrapped in useCallback, reads DRAFT_KEY from ref not closure
  const send = useCallback(async (text: string, retryHistory?: Msg[]) => {
    if (streamingRef.current || !user) return;
    if (!text.trim() && !imagePreview && !attachedFile) return;
    if (text.length > maxChars) { toast.error(`Message too long (max ${maxChars} chars)`); return; }
    haptic(8);

    setInput("");
    try { localStorage.removeItem(draftKeyRef.current); } catch {}
    setSearchSources([]);

    const img = imagePreview; setImagePreview(null);
    const file = attachedFile; setAttachedFile(null);
    const filePrefix = file ? `[File: ${file.name}]\n\n${file.content}\n\n---\n\nUser question: ` : "";

    // Web search if appropriate
    const searchQuery = shouldSearch(text);
    let searchContext = "";
    if (searchQuery && !img && !file) {
      toast.info("Searching the web…", { duration: 2000 });
      const searchResp = await webSearch(searchQuery, 5);
      if (searchResp.results.length && mountedRef.current) {
        setSearchSources(searchResp.results);
        searchContext = formatSourcesForPrompt(searchResp.results);
      }
    }

    const fullText = filePrefix + (text || (img ? "What's in this image?" : "Summarize this file.")) + searchContext;
    const displayText = text || (file ? `📄 ${file.name}` : "Image");

    const cid = await ensureConv(displayText);
    if (!cid || !mountedRef.current) return;

    const isLocal = cid.startsWith("local-");
    const msgsRef = (!isLocal && db) ? collection(db, "conversations", cid, "messages") : null;
    const dbContent = img ? `${displayText}\n\n[Image attached]` : displayText;

    let userRefId: string = "local-u-" + Date.now();
    if (msgsRef) {
      try {
        const userRef = await addDoc(msgsRef, { role:"user", content:dbContent, userId:user.uid, createdAt:serverTimestamp() });
        userRefId = userRef.id;
      } catch {
        // Non-fatal: still show the message, just won't be in history
      }
    }

    const userMsg: Msg = { id: userRefId, role:"user", content:dbContent, image: img||undefined };
    const msgHistory = retryHistory ?? [...messages];
    if (!mountedRef.current) return;
    setMessages(m => [...m, userMsg]);

    streamingRef.current = true;
    setStreaming(true);

    const memoryInjection = memoryContext;
    const history: ChatMsg[] = [...msgHistory, userMsg].map(m => ({
      role: m.role,
      content: img && m.id === userRefId
        ? [{ type:"text" as const, text: fullText + memoryInjection }, { type:"image_url" as const, image_url:{ url:img } }]
        : m.id === userRefId ? fullText + memoryInjection : m.content,
    }));

    tryExtractMemory(text).catch(() => {});

    let acc = "";
    const tempId = "tmp-" + Date.now();
    if (mountedRef.current) setMessages(m => [...m, { id:tempId, role:"assistant", content:"" }]);

    abortRef.current = new AbortController();
    let lastRender = 0;
    const flushAcc = () => {
      if (!mountedRef.current) return;
      setMessages(m => m.map(x => x.id===tempId ? {...x, content:acc} : x));
      lastRender = Date.now();
    };

    try {
      await streamChat({
        messages: history,
        getToken: () => user!.getIdToken(true),
        signal: abortRef.current.signal,
        onDelta: chunk => {
          acc += chunk;
          if (Date.now() - lastRender > 60) flushAcc();
        },
        onDone: () => { flushAcc(); },
      });
    } catch (err) {
      if (!mountedRef.current) return;
      if ((err as Error).name === "AbortError") {
        setMessages(m => m.filter(x => x.id !== tempId));
        streamingRef.current = false;
        setStreaming(false);
        return;
      }
      toast.error(err instanceof Error ? err.message : "AI error");
      setMessages(m => m.filter(x => x.id !== tempId).map(x => x.id === userRefId ? {...x, failed:true} : x));
      streamingRef.current = false;
      setStreaming(false);
      return;
    }

    if (!mountedRef.current) return;

    let aiSaved = false;
    if (acc.trim()) {
      const detected = detectArtifact(acc);
      if (detected) { setArtifact(detected); setShowArtifact(true); }
      const { model } = loadSettings();
      setModelLabel(getModelLabel(model));
      if (msgsRef) {
        try {
          const aiRef = await addDoc(msgsRef, { role:"assistant", content:acc, userId:user.uid, createdAt:serverTimestamp() });
          if (!mountedRef.current) return;
          aiSaved = true;
          setMessages(m => m.map(x => x.id===tempId ? {...x, id:aiRef.id} : x));
        } catch { /* non-fatal */ }
      } else {
        // No Firestore — just assign a local ID
        setMessages(m => m.map(x => x.id===tempId ? {...x, id:"local-a-"+Date.now()} : x));
        aiSaved = true;
      }
    } else {
      setMessages(m => m.filter(x => x.id !== tempId));
    }

    const isFirstExchange = msgCountAtLoad.current === 0 && (retryHistory ?? messages).length === 0;
    if (isFirstExchange && aiSaved && db) {
      msgCountAtLoad.current = 2;
      generateTitle(text, acc, () => user!.getIdToken(true)).then(title => {
        if (db) updateDoc(doc(db, "conversations", cid), { title, updatedAt: serverTimestamp() });
      }).catch(() => {});
    } else if (db) {
      updateDoc(doc(db, "conversations", cid), { updatedAt:serverTimestamp() }).catch(() => {});
    }

    streamingRef.current = false;
    if (mountedRef.current) setStreaming(false);
  }, [user, imagePreview, attachedFile, memoryContext, tryExtractMemory, ensureConv, messages]);

  // Seed from URL ?q= param — now that send is stable we can safely depend on it
  useEffect(() => {
    if (!user || !initialQ || seededQ.current === initialQ) return;
    seededQ.current = initialQ;
    send(initialQ);
    const np = new URLSearchParams(params); np.delete("q");
    setParams(np, { replace: true });
  }, [user, initialQ, send, params, setParams]);

  const regenerate = useCallback(async () => {
    const lastUser = [...messages].reverse().find(m => m.role==="user");
    if (!lastUser) return;
    haptic([10,50,10]);
    const historyUpTo = messages.slice(0, messages.findLastIndex(m => m.role==="user"));
    setMessages(m => m.slice(0, m.findLastIndex(x => x.role==="user")));
    await send(stripMeta(lastUser.content), historyUpTo);
  }, [messages, send]);

  const retryFailed = useCallback(async (msg: Msg) => {
    if (!convId || streamingRef.current || !db) return;
    haptic(10);
    const idx = messages.findIndex(m => m.id === msg.id);
    const historyBefore = messages.slice(0, idx);
    setMessages(m => m.filter(x => x.id !== msg.id));
    try { await deleteDoc(doc(db, "conversations", convId, "messages", msg.id)); } catch {}
    await send(stripMeta(msg.content), historyBefore);
  }, [convId, messages, send]);

  const saveEdit = useCallback(async (msg: Msg) => {
    if (!editVal.trim() || !convId || !db) return;
    await updateDoc(doc(db, "conversations", convId, "messages", msg.id), { content:editVal });
    if (!mountedRef.current) return;
    setMessages(m => m.map(x => x.id===msg.id ? {...x,content:editVal} : x));
    setEditingId(null); haptic(10); toast.success("Updated");
  }, [editVal, convId]);

  // FIX: save-to-library extracted from inline JSX to stable useCallback
  const saveMessage = useCallback(async (msgContent: string, msgIdx: number) => {
    if (!user) return;
    haptic(8);
    const prevUserMsg = messages.slice(0, msgIdx).reverse().find(m => m.role === "user");
    await saveToLibrary(user.uid, {
      type: "answer",
      title: prevUserMsg?.content?.slice(0,80) || "Saved answer",
      content: msgContent,
      tags: [],
    });
    toast.success("Saved to Library");
  }, [user, messages]);

  // FIX: artifact detection memoized per message, not called on every render
  const artifactMap = useMemo(() => {
    const map = new Map<string, DetectedArtifact | null>();
    for (const m of messages) {
      if (m.role === "assistant" && !m.id.startsWith("tmp-")) {
        map.set(m.id, detectArtifact(m.content));
      }
    }
    return map;
  }, [messages]);

  const handleImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 20*1024*1024) { toast.error("Image must be under 20MB"); return; }
    const imgEl = new Image();
    const url = URL.createObjectURL(f);
    imgEl.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(imgEl.width, imgEl.height));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(imgEl.width  * scale);
      canvas.height = Math.round(imgEl.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      if (mountedRef.current) setImagePreview(canvas.toDataURL("image/jpeg", 0.8));
    };
    imgEl.src = url;
    e.target.value = "";
  }, []);

  const handleDoc = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      toast.info("Reading file…");
      const p = await parseFile(f);
      if (mountedRef.current) { setAttachedFile(p); toast.success(`${p.name} attached`); }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read file");
    }
    e.target.value = "";
  }, []);

  const shareChat = useCallback(async () => {
    haptic(10);
    const text = messages.map(m=>`${m.role==="user"?"You":"Vyom AI"}: ${stripMeta(m.content)}`).join("\n\n");
    if (navigator.share) { try { await navigator.share({title:"Vyom AI Chat",text}); return; } catch {} }
    await navigator.clipboard.writeText(text); toast.success("Chat copied");
  }, [messages]);

  const exportChat = useCallback(() => {
    haptic(10);
    const text = messages.map(m=>`[${m.role==="user"?"You":"Vyom AI"}]\n${stripMeta(m.content)}`).join("\n\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text],{type:"text/plain"}));
    a.download = "vyom-chat.txt"; a.click();
    toast.success("Chat exported");
  }, [messages]);

  const copy = useCallback((t: string) => { haptic(8); navigator.clipboard.writeText(t); toast.success("Copied"); }, []);
  const newChat = useCallback(() => { setMessages([]); setConvId(null); msgCountAtLoad.current=0; navigate("/chat"); }, [navigate]);

  const maxChars = 4000;
  const visibleMsgs = useMemo(
    () => searchQ.trim() ? messages.filter(m => m.content.toLowerCase().includes(searchQ.toLowerCase())) : messages,
    [messages, searchQ]
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Accessible live region for screen readers */}
      <div aria-live="polite" aria-atomic="false" className="sr-only" id="chat-live-region" />

      <header className="flex items-center justify-between px-4 pt-5 pb-3 sticky top-0 z-10 bg-background/80 backdrop-blur-md">
        <button onClick={()=>navigate(-1)} aria-label="Go back" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5 transition active:scale-95">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button onClick={()=>setShowTimestamps(t=>!t)} className="flex flex-col items-center gap-0" aria-label="Toggle timestamps">
          <div className="flex items-center gap-2">
            <svg width="24" height="24" viewBox="0 0 40 40" fill="none" aria-hidden>
              <defs><linearGradient id="chatLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22D3EE"/><stop offset="50%" stopColor="#8B5CF6"/><stop offset="100%" stopColor="#EC4899"/></linearGradient></defs>
              <path d="M4 8L14 30L20 16L26 30L36 8" stroke="url(#chatLogoGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M20 13L20.5 15L22.5 15L21 16L21.5 17.5L20 16.5L18.5 17.5L19 16L17.5 15L19.5 15Z" fill="white" opacity="0.9"/>
            </svg>
            <span className="font-display text-base font-semibold">Vyom AI</span>
          </div>
          <span className="text-[10px] text-muted-foreground/60">{modelLabel}</span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={()=>setShowMemory(true)} aria-label="Open memory manager" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition">
            <Brain className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
          {artifact && (
            <button onClick={()=>setShowArtifact(v=>!v)} aria-label="Toggle artifact canvas"
              className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition ${showArtifact?"text-cyan-400":"text-muted-foreground"}`}>
              <Layers className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button onClick={()=>{setSearchMode(s=>!s);setSearchQ("");}} aria-label="Search messages" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
          {messages.length>0 && (
            <>
              <button onClick={shareChat} aria-label="Share chat" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition">
                <Share2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>
              <button onClick={exportChat} aria-label="Export chat" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition">
                <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
              </button>
            </>
          )}
          <button onClick={newChat} aria-label="New chat" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5 transition">
            <PenSquare className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      {searchMode && (
        <div className="px-4 pb-2 animate-fade-in" role="search">
          <div className="glass-card flex items-center gap-2 p-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <input autoFocus value={searchQ} onChange={e=>setSearchQ(e.target.value)}
              placeholder="Search messages…" aria-label="Search messages"
              className="flex-1 bg-transparent text-sm focus:outline-none"/>
            {searchQ && <button onClick={()=>setSearchQ("")} aria-label="Clear search"><X className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /></button>}
          </div>
          {searchQ && <p className="text-[11px] text-muted-foreground mt-1 px-1" aria-live="polite">{visibleMsgs.length} result{visibleMsgs.length!==1?"s":""}</p>}
        </div>
      )}

      <main ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 px-4 py-2 pb-40 overflow-y-auto"
        aria-label="Conversation" role="log">
        {hasOlderMsgs && !searchMode && (
          <div className="flex justify-center pt-2">
            <button onClick={loadOlderMessages} disabled={loadingOlder}
              className="text-[11px] text-muted-foreground border border-white/10 rounded-full px-4 py-1.5 bg-white/5 hover:bg-white/10 transition disabled:opacity-50">
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {loadingMsgs ? (
          <div className="space-y-4 pt-4" aria-label="Loading messages" aria-busy="true">
            {[1,2,3].map(i=>(
              <div key={i} className={`flex gap-3 ${i%2===0?"justify-end":""}`}>
                {i%2!==0 && <Skeleton className="h-8 w-8 rounded-full shrink-0"/>}
                <Skeleton className={`h-16 rounded-2xl ${i%2===0?"w-3/4":"w-4/5"}`}/>
              </div>
            ))}
          </div>
        ) : visibleMsgs.length===0 && !streaming ? (
          searchQ ? (
            <p className="text-center text-sm text-muted-foreground py-12">No messages match "{searchQ}"</p>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-20 w-20 mb-4 opacity-40">
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <defs><linearGradient id="emptyLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22D3EE"/><stop offset="50%" stopColor="#8B5CF6"/><stop offset="100%" stopColor="#EC4899"/></linearGradient></defs>
                  <path d="M4 8L14 30L20 16L26 30L36 8" stroke="url(#emptyLogoGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M20 13L20.5 15L22.5 15L21 16L21.5 17.5L20 16.5L18.5 17.5L19 16L17.5 15L19.5 15Z" fill="white" opacity="0.9"/>
                </svg>
              </div>
              <p className="font-display text-lg font-semibold">Ask Vyom anything</p>
              <p className="text-xs text-muted-foreground mt-1">Your conversation starts here.</p>
            </div>
          )
        ) : null}

        {visibleMsgs.map((m, idx) =>
          m.role==="user" ? (
            <div key={m.id} className="flex flex-col items-end gap-1 animate-slide-up">
              {m.image && <img src={m.image} alt="Uploaded image" className="max-w-[60%] rounded-2xl object-cover max-h-48"/>}
              {editingId===m.id ? (
                <div className="w-full max-w-[85%] space-y-2">
                  <textarea autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} rows={3}
                    aria-label="Edit message"
                    className="w-full rounded-2xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 resize-none"/>
                  <div className="flex gap-2 justify-end">
                    <button onClick={()=>setEditingId(null)} className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10">Cancel</button>
                    <button onClick={()=>saveEdit(m)} className="px-3 py-1.5 rounded-xl text-xs bg-gradient-to-r from-violet-600 to-purple-700 text-white">Save</button>
                  </div>
                </div>
              ) : (
                <div className="group relative max-w-[82%]">
                  {/* Deep purple user bubble — matches the design */}
                  <div className="msg-user rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
                    {stripMeta(m.content)}
                  </div>
                  <button onClick={()=>{setEditingId(m.id);setEditVal(stripMeta(m.content));haptic(8);}}
                    aria-label="Edit message"
                    className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              )}
              {showTimestamps && m.createdAt && <p className="text-[10px] text-muted-foreground px-1">{fmtTime(m.createdAt)}</p>}
              {m.failed && (
                <button onClick={()=>retryFailed(m)} disabled={streaming}
                  className="flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-[11px] text-red-400 disabled:opacity-50">
                  <RefreshCw className="h-3 w-3" aria-hidden /> Failed to send — tap to retry
                </button>
              )}
            </div>
          ) : (
            <div key={m.id} className="flex animate-slide-up gap-3">
              {/* VA avatar with gradient border */}
              <div className="mt-1 h-8 w-8 shrink-0 rounded-full p-[2px] flex-shrink-0"
                style={{ background:"linear-gradient(135deg,#8B5CF6,#3B82F6,#22D3EE)" }}>
                <div className="h-full w-full rounded-full bg-[#1a0d2e] flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 40 40" fill="none">
                    <defs><linearGradient id="avGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#22D3EE"/><stop offset="100%" stopColor="#A78BFA"/></linearGradient></defs>
                    <path d="M4 8L14 30L20 16L26 30L36 8" stroke="url(#avGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <MarkdownMessage content={m.content} streaming={streaming && m.id.startsWith("tmp-")}/>
                {showTimestamps && m.createdAt && <p className="text-[10px] text-muted-foreground mt-1">{fmtTime(m.createdAt)}</p>}
                {!m.id.startsWith("tmp-") && (
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <button onClick={()=>copy(m.content)} aria-label="Copy message" className="text-muted-foreground hover:text-foreground transition">
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button onClick={()=>{haptic(8);setLiked(l=>({...l,[m.id]:!l[m.id]}));}}
                      aria-label={liked[m.id] ? "Unlike" : "Like"}
                      aria-pressed={liked[m.id]}
                      className={`transition ${liked[m.id]?"text-green-400":"text-muted-foreground hover:text-green-400"}`}>
                      {liked[m.id] ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ThumbsUp className="h-3.5 w-3.5" aria-hidden />}
                    </button>
                    <button aria-label="Dislike" className="text-muted-foreground hover:text-red-400 transition">
                      <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button onClick={()=>saveMessage(m.content, idx)} aria-label="Save to Library"
                      className="text-muted-foreground hover:text-amber-400 transition">
                      <Bookmark className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {artifactMap.get(m.id) && (
                      <button onClick={()=>{const a=artifactMap.get(m.id);if(a){setArtifact(a);setShowArtifact(true);haptic(8);}}}
                        aria-label="Open in canvas"
                        className="text-muted-foreground hover:text-cyan-400 transition">
                        <Layers className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    {idx===visibleMsgs.length-1 && (
                      <button onClick={regenerate} disabled={streaming} aria-label="Regenerate response"
                        className="text-muted-foreground hover:text-cyan-400 transition ml-auto disabled:opacity-40">
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                )}
                {idx===visibleMsgs.length-1 && searchSources.length>0 && !streaming && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Sources</p>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                      {searchSources.slice(0,5).map((s,si)=>(
                        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 glass border border-white/8 rounded-xl px-2.5 py-1.5 max-w-[180px] hover:border-white/20 transition">
                          {s.favicon && <img src={s.favicon} alt="" aria-hidden className="h-3.5 w-3.5 rounded shrink-0"/>}
                          <div className="min-w-0">
                            <p className="text-[10px] font-medium truncate">[{si+1}] {s.title}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{new URL(s.url).hostname}</p>
                          </div>
                          <Globe className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden />
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
      </main>

      {showScrollBtn && (
        <button onClick={()=>{scrollToBottom();setShowScrollBtn(false);}} aria-label="Scroll to bottom"
          className="fixed bottom-36 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/20 backdrop-blur-sm shadow-lg animate-fade-in">
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      )}

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 z-10"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        {(imagePreview||attachedFile) && (
          <div className="flex gap-2 mb-2 ml-1">
            {imagePreview && (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Image to send" className="h-16 w-16 rounded-xl object-cover border border-white/10"/>
                <button onClick={()=>setImagePreview(null)} aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-white/20 flex items-center justify-center">
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            )}
            {attachedFile && (
              <div className="relative flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-3 py-2">
                <FileText className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate max-w-[140px]">{attachedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(attachedFile.size/1024).toFixed(0)}KB</p>
                </div>
                <button onClick={()=>setAttachedFile(null)} aria-label="Remove file" className="ml-1 text-muted-foreground">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="glass-card" role="region" aria-label="Message input">
          <div className="flex items-center gap-2 p-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} aria-hidden />
            <input ref={docRef} type="file" accept=".pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css" className="hidden" onChange={handleDoc} aria-hidden />
            <div className="flex gap-1 shrink-0">
              <button type="button" onClick={()=>fileRef.current?.click()} aria-label="Attach image"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-cyan-500/50 transition">
                <ImagePlus className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={()=>docRef.current?.click()} aria-label="Attach document"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:border-purple-500/50 transition">
                <Paperclip className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <input
              value={input}
              onChange={e => {
                setInput(e.target.value);
                try { localStorage.setItem(draftKeyRef.current, e.target.value); } catch {}
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && loadSettings().sendOnEnter) {
                  e.preventDefault(); send(input);
                }
              }}
              placeholder={streaming ? "Vyom is thinking…" : "Message Vyom"}
              disabled={streaming}
              aria-label="Message input"
              aria-disabled={streaming}
              className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-60 min-w-0"
            />
            {streaming ? (
              <button type="button" onClick={()=>abortRef.current?.abort()} aria-label="Stop generation"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40 shrink-0">
                <X className="h-4 w-4 text-red-400" aria-hidden />
              </button>
            ) : input.trim() || imagePreview || attachedFile ? (
              <button type="button" onClick={()=>send(input)} aria-label="Send message"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-purple-700 shrink-0 active:scale-95 transition">
                <ArrowUp className="h-4 w-4 text-white" aria-hidden />
              </button>
            ) : (
              <>
                <button type="button" aria-label="Voice input" className="text-muted-foreground shrink-0">
                  <Mic className="h-4 w-4" aria-hidden />
                </button>
                <Link to="/voice" aria-label="Open voice mode"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground shrink-0">
                  <AudioLines className="h-4 w-4 text-background" aria-hidden />
                </Link>
              </>
            )}
          </div>
          {input.length > maxChars*0.7 && (
            <div className="px-3 pb-2 flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full bg-white/10">
                <div className="h-1 rounded-full transition-all" style={{
                  width:`${Math.min(input.length/maxChars*100,100)}%`,
                  background: input.length>maxChars ? "#ef4444" : "#06b6d4"
                }}/>
              </div>
              <span className={`text-[10px] ${input.length>maxChars?"text-red-400":"text-muted-foreground"}`}>
                {input.length}/{maxChars}
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5 opacity-50">Tap title to toggle timestamps · Enter to send</p>
      </div>

      {showArtifact && artifact && (
        <div className="fixed inset-0 z-40 animate-fade-in">
          <Suspense fallback={<div className="flex items-center justify-center h-full bg-background"><div className="text-sm text-muted-foreground">Loading canvas…</div></div>}>
            <ArtifactPanel artifact={artifact} onClose={() => setShowArtifact(false)} />
          </Suspense>
        </div>
      )}

      {showMemory && (
        <Suspense fallback={null}>
          <MemoryManager onClose={() => setShowMemory(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default Chat;
