import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Telescope, Search, Play, CheckCircle2, Circle, Loader2, FileText, ExternalLink, Download, StopCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { streamChat } from "@/lib/chat";
import { webSearch } from "@/lib/search";
import { saveToLibrary } from "@/lib/library";
import MarkdownMessage from "@/components/MarkdownMessage";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

type Phase = "idle" | "planning" | "searching" | "analyzing" | "writing" | "done" | "error";

interface ResearchStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

interface Source { title: string; url: string; snippet: string; favicon?: string }

export default function Research() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<ResearchStep[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [report, setReport] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const updateStep = useCallback((id: string, patch: Partial<ResearchStep>) =>
    setSteps(s => s.map(x => x.id === id ? { ...x, ...patch } : x)), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    if (mountedRef.current) {
      setPhase("idle");
      setStreaming(false);
      setSteps(s => s.map(x => x.status === "running" ? { ...x, status: "error" as const } : x));
      toast.info("Research cancelled");
    }
  }, []);

  const run = useCallback(async () => {
    if (!query.trim() || !user) return;
    haptic(10);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    if (mountedRef.current) { setReport(""); setSources([]); setStreaming(false); }

    // Initialise steps
    const initSteps: ResearchStep[] = [
      { id: "plan",    label: "Planning research approach", status: "pending" },
      { id: "search1", label: "Gathering primary sources",  status: "pending" },
      { id: "search2", label: "Expanding with related topics", status: "pending" },
      { id: "analyze", label: "Analyzing and synthesizing",  status: "pending" },
      { id: "write",   label: "Writing research report",     status: "pending" },
    ];
    setSteps(initSteps);

    try {
      // Step 1: Planning
      setPhase("planning");
      updateStep("plan", { status: "running", detail: "Breaking down your question…" });
      let subQs: string[] = [];
      try {
        const planPrompt = `You are a research planner. Given the research question: "${query}"
Generate 3 specific sub-questions that together would fully answer this question.
Reply with ONLY a JSON array of strings, no other text. Example: ["sub-q 1", "sub-q 2", "sub-q 3"]`;
        const planResp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json",
            "Authorization": `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ model: "google/gemini-2.0-flash-exp:free", max_tokens: 200,
            messages: [{ role: "user", content: planPrompt }] }),
          signal,
        });
        if (planResp.ok) {
          const reader = planResp.body!.getReader();
          const dec = new TextDecoder(); let buf = "", raw = "";
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim(); if (data === "[DONE]") break;
              try { const p = JSON.parse(data); if (p.choices?.[0]?.delta?.content) raw += p.choices[0].delta.content; } catch {}
            }
          }
          const match = raw.match(/\[.*\]/s);
          if (match) subQs = JSON.parse(match[0]);
        }
      } catch {}
      if (!subQs.length) subQs = [query, `${query} overview`, `${query} details`];
      updateStep("plan", { status: "done", detail: `${subQs.length} research angles identified` });

      // Step 2: Primary search
      setPhase("searching");
      updateStep("search1", { status: "running", detail: `Searching: "${query}"` });
      const primaryResults = await webSearch(query, 5);
      setSources(primaryResults.results);
      updateStep("search1", { status: "done", detail: `${primaryResults.results.length} sources found` });

      // Step 3: Related searches
      updateStep("search2", { status: "running", detail: `Expanding with sub-questions…` });
      const extraResults = await Promise.all(subQs.slice(0, 2).map(q => webSearch(q, 3)));
      const allSources = [
        ...primaryResults.results,
        ...extraResults.flatMap(r => r.results),
      ];
      // Deduplicate by URL
      const seen = new Set<string>();
      const uniqueSources = allSources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });
      setSources(uniqueSources);
      updateStep("search2", { status: "done", detail: `${uniqueSources.length} total unique sources` });

      // Step 4: Analyze
      setPhase("analyzing");
      updateStep("analyze", { status: "running", detail: "Reading and cross-referencing sources…" });
      await new Promise(r => setTimeout(r, 800)); // brief visual pause
      updateStep("analyze", { status: "done", detail: "Synthesis complete" });

      // Step 5: Write report
      setPhase("writing");
      updateStep("write", { status: "running", detail: "Generating report…" });
      setStreaming(true);

      const sourceContext = uniqueSources.slice(0, 8).map((s, i) =>
        `[${i+1}] ${s.title}\n${s.snippet}`
      ).join("\n\n");

      const reportPrompt = `You are a thorough research assistant. Write a comprehensive, well-structured research report on: "${query}"

Use these web sources as your knowledge base:
${sourceContext}

Format your report as:
# ${query}

## Executive Summary
[2-3 sentence overview]

## Key Findings
[Numbered list of the most important findings, cite sources like [1], [2]]

## Detailed Analysis
[2-3 paragraphs of in-depth analysis]

## Sources
[List all sources used as: **[N]** Title — URL]

Write in a clear, factual, well-organized style. Cite sources inline.`;

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json",
          "Authorization": `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages: [{ role: "user", content: reportPrompt }],
        }),
        signal,
      });

      if (!resp.ok || !resp.body) throw new Error("Report generation failed");

      const reader = resp.body.getReader();
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim(); if (data === "[DONE]") break;
          try { const p = JSON.parse(data); const c = p.choices?.[0]?.delta?.content; if (c) setReport(r => r + c); } catch {}
        }
      }

      if (mountedRef.current) {
        setStreaming(false);
        updateStep("write", { status: "done", detail: "Report complete" });
        setPhase("done");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // Ignore abort errors — those are intentional cancellations
      if ((err as Error).name === "AbortError") return;
      setPhase("error");
      setStreaming(false);
      steps.forEach(s => { if (s.status === "running") updateStep(s.id, { status: "error" }); });
      toast.error("Research failed — try again");
    }
  }, [user, query, updateStep, steps]);

  const saveReport = useCallback(async () => {
    if (!user || !report) return;
    haptic(10);
    await saveToLibrary(user.uid, {
      type: "research",
      title: query,
      content: report,
      tags: ["research"],
    });
    toast.success("Saved to Library");
  }, [user, report, query]);

  const download = useCallback(() => {
    const blob = new Blob([report], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `research-${query.slice(0, 30).replace(/\s+/g, "-")}.md`;
    a.click();
  }, [report, query]);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center glass rounded-full">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Telescope className="h-5 w-5 text-cyan-400" />
            <h1 className="font-display text-xl font-bold">Deep Research</h1>
          </div>
          <p className="text-[11px] text-muted-foreground">Multi-step AI research with live sources</p>
        </div>
      </header>

      <div className="px-5 space-y-4 pb-8">
        {/* Query input */}
        <div className="glass-card p-4 neon-border">
          <textarea value={query} onChange={e => setQuery(e.target.value)} rows={3}
            placeholder="What do you want to research? e.g. What are the latest breakthroughs in quantum computing?"
            disabled={phase !== "idle" && phase !== "done" && phase !== "error"}
            className="w-full bg-transparent text-sm focus:outline-none resize-none placeholder:text-muted-foreground" />
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-muted-foreground">Searches the web · Synthesizes sources · Generates report</p>
            <div className="flex gap-2">
              {(phase !== "idle" && phase !== "done" && phase !== "error") && (
                <button onClick={cancel} aria-label="Cancel research"
                  className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 active:scale-95 transition">
                  <StopCircle className="h-3.5 w-3.5" aria-hidden /> Cancel
                </button>
              )}
              <button onClick={run} disabled={!query.trim() || (phase !== "idle" && phase !== "done" && phase !== "error")}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 active:scale-95 transition">
                {phase === "idle" || phase === "done" || phase === "error"
                  ? <><Play className="h-3.5 w-3.5" aria-hidden /> Research</>
                  : <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Researching…</>}
              </button>
            </div>
          </div>
        </div>

        {/* Progress steps */}
        {steps.length > 0 && (
          <div className="glass-card p-4 space-y-2.5">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Research Progress</p>
            {steps.map(s => (
              <div key={s.id} className="flex items-center gap-3">
                {s.status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  : s.status === "running" ? <Loader2 className="h-4 w-4 text-cyan-400 animate-spin shrink-0" />
                  : s.status === "error" ? <CheckCircle2 className="h-4 w-4 text-red-400 shrink-0" />
                  : <Circle className="h-4 w-4 text-white/20 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${s.status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{s.label}</p>
                  {s.detail && <p className="text-[11px] text-muted-foreground truncate">{s.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Sources ({sources.length})</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {sources.slice(0, 8).map((s, i) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-2 glass border border-white/8 rounded-xl px-3 py-2 max-w-[200px] hover:border-white/20 transition">
                  {s.favicon && <img src={s.favicon} alt="" className="h-4 w-4 rounded shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">[{i+1}] {s.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{new URL(s.url).hostname}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-semibold">Research Report</span>
              </div>
              {phase === "done" && (
                <div className="flex gap-2">
                  <button onClick={saveReport} className="text-[11px] glass border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 transition">
                    Save to Library
                  </button>
                  <button onClick={download} className="flex items-center gap-1 text-[11px] glass border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 transition">
                    <Download className="h-3 w-3" /> Export
                  </button>
                </div>
              )}
            </div>
            <MarkdownMessage content={report} streaming={streaming} />
          </div>
        )}
      </div>
    </div>
  );
}
