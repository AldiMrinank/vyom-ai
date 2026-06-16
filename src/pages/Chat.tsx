import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, PenSquare, Copy, ThumbsUp, ThumbsDown, Mic, AudioLines, Plus, ArrowUp, RefreshCw, Share2, Download, ImagePlus, X, Check, ChevronDown, Search, Pencil, FileText, Paperclip } from "lucide-react";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";
import { streamChat, generateTitle, ChatMsg } from "@/lib/chat";
import { haptic } from "@/lib/haptic";
import { parseFile, ParsedFile } from "@/lib/fileReader";
import { toast } from "sonner";
import MarkdownMessage from "@/components/MarkdownMessage";
import Skeleton from "@/components/Skeleton";
import vyomLogo from "@/assets/vyom-logo.png";

interface Msg { id: string; role: "user"|"assistant"; content: string; createdAt?: any; image?: string }

const fmtTime = (ts: any) => {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
};

const Chat = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const initialQ = params.get("q");
  const convParam = params.get("c");

  const [convId, setConvId] = useState<string|null>(convParam);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
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

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const seededQ = useRef<string|null>(null);
  const isFirstMsg = useRef(true);
  const abortRef = useRef<AbortController|null>(null);

  useEffect(() => {
    if (!convId || !user) return;
    isFirstMsg.current = false;
    setLoadingMsgs(true);
    const msgsRef = collection(db, "conversations", convId, "messages");
    getDocs(query(msgsRef, orderBy("createdAt","asc"))).then(snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Msg)));
      setLoadingMsgs(false);
    }).catch(() => { toast.error("Failed to load chat"); setLoadingMsgs(false); });
  }, [convId, user]);

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
    setInput("");
    const img = imagePreview; setImagePreview(null);
    const file = attachedFile; setAttachedFile(null);
    const filePrefix = file ? `[File: ${file.name}]\n\n${file.content}\n\n---\n\nUser question: ` : "";
    const fullText = filePrefix + (text || (img ? "What's in this image?" : "Summarize this file."));
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

    const history: ChatMsg[] = [...msgHistory, userMsg].map(m => ({
      role: m.role,
      content: img && m.id === userRef.id
        ? [{ type:"text" as const, text: fullText }, { type:"image_url" as const, image_url:{ url:img } }]
        : m.id === userRef.id ? fullText : m.content,
    }));

    let acc = "";
    const tempId = "tmp-" + Date.now();
    setMessages(m => [...m, { id:tempId, role:"assistant", content:"" }]);
    abortRef.current = new AbortController();

    try {
      await streamChat({ messages:history, signal:abortRef.current.signal,
        onDelta: chunk => { acc+=chunk; setMessages(m => m.map(x => x.id===tempId ? {...x,content:acc} : x)); },
        onDone: () => {},
      });
    } catch (err) {
      if ((err as Error).name==="AbortError") { setMessages(m => m.filter(x => x.id!==tempId)); setStreaming(false); return; }
      toast.error(err instanceof Error ? err.message : "AI error");
      setMessages(m => m.filter(x => x.id!==tempId)); setStreaming(false); return;
    }

    const aiRef = await addDoc(msgsRef, { role:"assistant", content:acc, userId:user.uid, createdAt:serverTimestamp() });
    setMessages(m => m.map(x => x.id===tempId ? {...x, id:aiRef.id} : x));

    if (isFirstMsg.current) {
      isFirstMsg.current = false;
      generateTitle(text, acc).then(title =>
        updateDoc(doc(db,"conversations",cid), { title, updatedAt:serverTimestamp() })
      );
    } else updateDoc(doc(db,"conversations",cid), { updatedAt:serverTimestamp() });
    setStreaming(false);
  };

  const regenerate = async () => {
    const lastUser = [...messages].reverse().find(m => m.role==="user");
    if (!lastUser) return;
    haptic([10,50,10]);
    const historyUpTo = messages.slice(0, messages.findLastIndex(m => m.role==="user"));
    setMessages(m => m.slice(0, m.findLastIndex(x => x.role==="user")));
    await send(lastUser.content.replace(/\n\n\[Image attached\]$/,""), historyUpTo);
  };

  const saveEdit = async (msg: Msg) => {
    if (!editVal.trim() || !convId) return;
    await updateDoc(doc(db,"conversations",convId,"messages",msg.id), { content:editVal });
    setMessages(m => m.map(x => x.id===msg.id ? {...x,content:editVal} : x));
    setEditingId(null); haptic(10); toast.success("Updated");
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5*1024*1024) { toast.error("Image must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { toast.info("Reading file…"); const p = await parseFile(f); setAttachedFile(p); toast.success(`${p.name} attached`); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Failed to read file"); }
    e.target.value = "";
  };

  const shareChat = async () => {
    haptic(10);
    const text = messages.map(m=>`${m.role==="user"?"You":"Vyom AI"}: ${m.content}`).join("\n\n");
    if (navigator.share) { try { await navigator.share({title:"Vyom AI Chat",text}); return; } catch {} }
    await navigator.clipboard.writeText(text); toast.success("Chat copied");
  };

  const exportChat = () => {
    haptic(10);
    const text = messages.map(m=>`[${m.role==="user"?"You":"Vyom AI"}]\n${m.content}`).join("\n\n---\n\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text],{type:"text/plain"})); a.download="vyom-chat.txt"; a.click();
    toast.success("Chat exported");
  };

  const copy = (t: string) => { haptic(8); navigator.clipboard.writeText(t); toast.success("Copied"); };
  const newChat = () => { setMessages([]); setConvId(null); isFirstMsg.current=true; navigate("/chat"); };
  const maxChars = 4000;
  const visibleMsgs = searchQ.trim() ? messages.filter(m=>m.content.toLowerCase().includes(searchQ.toLowerCase())) : messages;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 pt-5 pb-3 sticky top-0 z-10 bg-background/80 backdrop-blur-md">
        <button onClick={()=>navigate(-1)} className="flex h-10 w-10 items-center justify-center"><ChevronLeft className="h-5 w-5"/></button>
        <button onClick={()=>setShowTimestamps(t=>!t)} className="flex items-center gap-2">
          <img src={vyomLogo} alt="" className="h-6 w-6 object-contain"/>
          <span className="font-display text-base font-semibold">Vyom AI</span>
        </button>
        <div className="flex items-center gap-1">
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
                  <div className="rounded-2xl rounded-tr-sm border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm whitespace-pre-wrap">{m.content.replace(/\n\n\[Image attached\]$/,"")}</div>
                  <button onClick={()=>{setEditingId(m.id);setEditVal(m.content.replace(/\n\n\[Image attached\]$/,""));haptic(8);}} className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition text-muted-foreground"><Pencil className="h-3.5 w-3.5"/></button>
                </div>
              )}
              {showTimestamps&&m.createdAt&&<p className="text-[10px] text-muted-foreground px-1">{fmtTime(m.createdAt)}</p>}
            </div>
          ) : (
            <div key={m.id} className="flex animate-slide-up gap-3">
              <img src={vyomLogo} alt="" className="mt-1 h-7 w-7 shrink-0 object-contain rounded-full bg-white/5 p-0.5"/>
              <div className="flex-1 min-w-0">
                <MarkdownMessage content={m.content} streaming={streaming&&m.id.startsWith("tmp-")}/>
                {showTimestamps&&m.createdAt&&<p className="text-[10px] text-muted-foreground mt-1">{fmtTime(m.createdAt)}</p>}
                {!m.id.startsWith("tmp-")&&(
                  <div className="mt-2 flex items-center gap-3">
                    <button onClick={()=>copy(m.content)} className="text-muted-foreground hover:text-foreground transition"><Copy className="h-3.5 w-3.5"/></button>
                    <button onClick={()=>{haptic(8);setLiked(l=>({...l,[m.id]:!l[m.id]}));}} className={`transition ${liked[m.id]?"text-green-400":"text-muted-foreground hover:text-green-400"}`}>{liked[m.id]?<Check className="h-3.5 w-3.5"/>:<ThumbsUp className="h-3.5 w-3.5"/>}</button>
                    <button className="text-muted-foreground hover:text-red-400 transition"><ThumbsDown className="h-3.5 w-3.5"/></button>
                    {idx===visibleMsgs.length-1&&<button onClick={regenerate} disabled={streaming} className="text-muted-foreground hover:text-cyan-400 transition ml-auto disabled:opacity-40"><RefreshCw className="h-3.5 w-3.5"/></button>}
                  </div>
                )}
              </div>
            </div>
          )
        )}
        <div ref={endRef}/>
      </div>

      {showScrollBtn&&<button onClick={()=>{scrollToBottom();setShowScrollBtn(false);}} className="fixed bottom-36 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 border border-white/20 backdrop-blur-sm shadow-lg animate-fade-in"><ChevronDown className="h-4 w-4"/></button>}

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-3 z-10">
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
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input);}}} placeholder={streaming?"Vyom is thinking…":"Message Vyom"} disabled={streaming} className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-60 min-w-0"/>
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
    </div>
  );
};

export default Chat;
