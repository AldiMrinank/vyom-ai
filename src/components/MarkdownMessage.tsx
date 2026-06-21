import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface Props { content: string; streaming?: boolean }

// Memoized separately so a code block doesn't re-render when unrelated state
// in the parent changes (e.g. another message streaming in).
const CodeBlock = memo(({ lang, code }: { lang: string; code: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    haptic(8); navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-2 rounded-xl overflow-hidden text-xs border border-white/10">
      <div className="flex items-center justify-between bg-white/8 px-3 py-1.5">
        <span className="text-white/40 font-mono text-[10px]">{lang || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1 text-white/40 hover:text-white/80 transition">
          {copied ? <><Check className="h-3 w-3 text-green-400"/><span className="text-[10px] text-green-400">Copied</span></>
                  : <><Copy className="h-3 w-3"/><span className="text-[10px]">Copy</span></>}
        </button>
      </div>
      <SyntaxHighlighter language={lang||"text"} style={oneDark}
        customStyle={{margin:0,borderRadius:0,background:"rgba(255,255,255,0.04)",fontSize:"11px"}} wrapLongLines>
        {code}
      </SyntaxHighlighter>
    </div>
  );
});

const MarkdownMessage = ({ content, streaming }: Props) => (
  <div className="text-sm leading-relaxed text-foreground/90 min-w-0 [font-size:var(--base-font-size,15px)]">
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
        em: ({ children }) => <em className="text-white/80 italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1 text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 text-white/90">{children}</h3>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-cyan-500 pl-3 my-2 text-white/55 italic text-xs">{children}</blockquote>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline underline-offset-2 break-all">{children}</a>,
        hr: () => <hr className="border-white/10 my-3" />,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th: ({ children }) => <th className="border border-white/10 px-2 py-1 bg-white/5 font-semibold text-left">{children}</th>,
        td: ({ children }) => <td className="border border-white/10 px-2 py-1">{children}</td>,
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          const lang = match?.[1] || "";
          const code = String(children).replace(/\n$/,"");
          if (className?.includes("language-")) return <CodeBlock lang={lang} code={code} />;
          return <code className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-cyan-300">{children}</code>;
        },
      }}>
      {content}
    </ReactMarkdown>
    {streaming && (
      <span className="inline-flex gap-0.5 ml-1 align-middle">
        {[0,1,2].map(i => <span key={i} className="w-1 h-1 rounded-full bg-cyan-400 animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>)}
      </span>
    )}
  </div>
);

// Memoize the whole component: only re-render when content or streaming flag
// actually changes. This prevents all previous messages from re-parsing their
// markdown/math/syntax-highlighting on every streaming token of a new reply.
export default memo(MarkdownMessage);
