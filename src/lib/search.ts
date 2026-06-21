export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}

/**
 * Web search via the /api/search Cloudflare function.
 * Falls back gracefully if the function isn't deployed yet.
 */
export async function webSearch(query: string, limit = 5): Promise<SearchResponse> {
  try {
    const resp = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!resp.ok) throw new Error("Search unavailable");
    return await resp.json();
  } catch {
    return { results: [], query };
  }
}

/**
 * Detect if a user message is a search query that would benefit
 * from live web results. Returns the cleaned search query or null.
 */
export function shouldSearch(userMsg: string): string | null {
  const lower = userMsg.toLowerCase().trim();
  // Explicit search signals
  if (/^search(\s+for)?:/i.test(lower)) return userMsg.replace(/^search(\s+for)?:\s*/i, "");
  if (/^(find|look up|what is|who is|when did|where is|latest|current|today|news|price|weather)/i.test(lower) && lower.length > 20) {
    return userMsg;
  }
  // Questions about recent events
  if (/202[4-9]|2030|latest|recent|current|now|today/i.test(lower) && lower.includes("?")) {
    return userMsg;
  }
  return null;
}

export function formatSourcesForPrompt(results: SearchResult[]): string {
  if (!results.length) return "";
  const formatted = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join("\n\n");
  return `\n\n## Live web search results for context:\n${formatted}\n\nUse these sources to ground your response. Cite sources using [1], [2] etc. where relevant.`;
}
