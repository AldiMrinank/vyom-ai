import { useState, useRef, useEffect, memo } from "react";
import { X, Download, Copy, Check, Maximize2, Minimize2, ExternalLink, Code2, Eye } from "lucide-react";
import type { DetectedArtifact } from "./ArtifactDetector";
import MarkdownMessage from "@/components/MarkdownMessage";
import { haptic } from "@/lib/haptic";
import { toast } from "sonner";

interface Props {
  artifact: DetectedArtifact;
  onClose: () => void;
}

const ArtifactPanel = memo(({ artifact, onClose }: Props) => {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update iframe content live as artifact content changes (streaming)
  useEffect(() => {
    if (artifact.type === "html" && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(artifact.content);
        doc.close();
      }
    }
  }, [artifact.content, artifact.type]);

  const copy = () => {
    haptic(8);
    navigator.clipboard.writeText(artifact.content);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard");
  };

  const download = () => {
    haptic(8);
    const ext = {
      html: "html", react: "jsx", code: artifact.language || "txt",
      markdown: "md", svg: "svg", mermaid: "mmd",
    }[artifact.type!] || "txt";
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vyom-artifact.${ext}`;
    a.click();
    toast.success("Downloaded");
  };

  const openInNewTab = () => {
    if (artifact.type === "html") {
      const blob = new Blob([artifact.content], { type: "text/html" });
      window.open(URL.createObjectURL(blob), "_blank");
    }
  };

  return (
    <div className={`flex flex-col bg-[#090912] border-l border-white/8 ${fullscreen ? "fixed inset-0 z-50" : "h-full"}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">{artifact.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Preview / Code toggle */}
          {artifact.type !== "markdown" && (
            <div className="flex items-center bg-white/5 rounded-lg p-0.5 mr-1">
              <button onClick={() => setView("preview")}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition ${view === "preview" ? "bg-white/10 text-white" : "text-white/40"}`}>
                <Eye className="h-3 w-3" /> Preview
              </button>
              <button onClick={() => setView("code")}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition ${view === "code" ? "bg-white/10 text-white" : "text-white/40"}`}>
                <Code2 className="h-3 w-3" /> Code
              </button>
            </div>
          )}
          {artifact.type === "html" && (
            <button onClick={openInNewTab} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/8 text-white/50">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={copy} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/8 text-white/50">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button onClick={download} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/8 text-white/50">
            <Download className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setFullscreen(f => !f)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/8 text-white/50">
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/8 text-white/50">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {view === "code" ? (
          <pre className="h-full overflow-auto p-4 text-xs font-mono text-white/80 bg-transparent">
            <code>{artifact.content}</code>
          </pre>
        ) : (
          <>
            {artifact.type === "html" && (
              <iframe
                ref={iframeRef}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
                title="HTML Preview"
              />
            )}
            {artifact.type === "svg" && (
              <div className="flex items-center justify-center h-full p-6"
                dangerouslySetInnerHTML={{ __html: artifact.content }} />
            )}
            {artifact.type === "mermaid" && (
              <MermaidRenderer content={artifact.content} />
            )}
            {artifact.type === "markdown" && (
              <div className="h-full overflow-y-auto p-5">
                <MarkdownMessage content={artifact.content} />
              </div>
            )}
            {artifact.type === "code" && (
              <pre className="h-full overflow-auto p-4 text-xs font-mono text-white/80">
                <code>{artifact.content}</code>
              </pre>
            )}
            {artifact.type === "react" && (
              <div className="flex items-center justify-center h-full p-6 text-center">
                <div>
                  <Code2 className="h-10 w-10 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/60">React component preview coming soon</p>
                  <p className="text-xs text-white/30 mt-1">Use the Code view to copy and run locally</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

// Mermaid renderer — loads mermaid.js from CDN lazily
function MermaidRenderer({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    script.onload = () => {
      (window as any).mermaid?.initialize({ startOnLoad: false, theme: "dark" });
      (window as any).mermaid?.run({ nodes: [ref.current!] });
    };
    // Only add script if not already loaded
    if (!(window as any).mermaid) {
      document.head.appendChild(script);
    } else {
      (window as any).mermaid.run({ nodes: [ref.current!] });
    }
  }, [content]);

  return (
    <div className="flex items-center justify-center h-full p-6 overflow-auto">
      <div className="mermaid text-white" ref={ref}>{content}</div>
    </div>
  );
}

export default ArtifactPanel;
