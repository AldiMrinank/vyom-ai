export type ArtifactType = "html" | "react" | "code" | "markdown" | "svg" | "mermaid" | null;

export interface DetectedArtifact {
  type: ArtifactType;
  content: string;
  language?: string;
  title?: string;
}

const FENCES_RE = /```(\w*)\n([\s\S]*?)```/g;

/**
 * Scans a message for renderable artifacts.
 * Priority: HTML > SVG > Mermaid > React JSX > other code blocks > rich markdown.
 */
export function detectArtifact(content: string): DetectedArtifact | null {
  const fences: Array<{lang: string; code: string}> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FENCES_RE.source, "g");
  while ((m = re.exec(content)) !== null) {
    fences.push({ lang: m[1].toLowerCase(), code: m[2] });
  }

  for (const { lang, code } of fences) {
    if (lang === "html" || (lang === "" && /<html|<!DOCTYPE/i.test(code))) {
      return { type: "html", content: code, title: "HTML Preview" };
    }
    if (lang === "svg" || /<svg/i.test(code)) {
      return { type: "svg", content: code, title: "SVG Graphic" };
    }
    if (lang === "mermaid") {
      return { type: "mermaid", content: code, title: "Diagram" };
    }
    if (lang === "jsx" || lang === "tsx") {
      return { type: "react", content: code, language: lang, title: "React Component" };
    }
    if (["python","js","javascript","typescript","ts","go","rust","java","cpp","c","bash","sh"].includes(lang) && code.length > 80) {
      return { type: "code", content: code, language: lang, title: `${lang.toUpperCase()} Code` };
    }
  }

  // Long markdown responses with headers are worth showing in canvas
  const headerCount = (content.match(/^#{1,3} /gm) || []).length;
  const wordCount = content.split(/\s+/).length;
  if (headerCount >= 2 && wordCount >= 150) {
    return { type: "markdown", content, title: "Document" };
  }

  return null;
}
