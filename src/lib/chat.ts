import { loadSettings } from "./settings";
import { routePrompt } from "./modelRouter";

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}
export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

function resolveModel(userMsg: string, hasImage = false): string {
  const { model } = loadSettings();
  if (model === "vyom-auto") return routePrompt(userMsg, hasImage).model;
  return model;
}

// Token getter is passed in from the React component where Firebase Auth
// is guaranteed to be ready (the user object came from onIdTokenChanged).
// This avoids the race where auth.currentUser is null during async init.
export async function streamChat({
  messages,
  getToken,
  onDelta,
  onDone,
  signal,
}: {
  messages: ChatMsg[];
  getToken: () => Promise<string>;      // caller provides this
  onDelta: (chunk: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}) {
  const { systemPrompt } = loadSettings();

  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const promptText =
    typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : (lastUserMsg?.content as ContentPart[])?.[0]?.text ?? "";
  const hasImage =
    Array.isArray(lastUserMsg?.content) &&
    (lastUserMsg!.content as ContentPart[]).some((c) => c.type === "image_url");

  const model = resolveModel(promptText, hasImage);

  // Get a fresh token from the caller — they hold the live Firebase User object
  let token: string;
  try {
    token = await getToken();
  } catch {
    throw new Error("Session expired. Please sign in again.");
  }

  let resp: Response;
  try {
    resp = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.filter((m) => m.role !== "system"),
        ],
      }),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    throw new Error("Network error — check your internet connection.");
  }

  if (!resp.ok || !resp.body) {
    let msg = `AI request failed (${resp.status})`;
    try {
      const j = await resp.clone().json();
      if (j?.error?.message) msg = j.error.message;
    } catch {}
    if (resp.status === 401) msg = "Session expired. Please sign in again.";
    if (resp.status === 429) msg = "Too many requests. Please slow down.";
    if (resp.status === 400) msg = "Bad request — the model may be unavailable. Try switching model in Settings.";
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") { onDone(); return; }
      try {
        const p = JSON.parse(data);
        const chunk = p.choices?.[0]?.delta?.content;
        if (chunk) onDelta(chunk);
      } catch {}
    }
  }
  onDone();
}

export async function generateTitle(
  userMsg: string,
  aiMsg: string,
  getToken: () => Promise<string>
): Promise<string> {
  try {
    const token = await getToken();
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-exp:free",
        max_tokens: 15,
        messages: [
          {
            role: "system",
            content:
              "Generate a 3-5 word title for this conversation. Reply with ONLY the title, no quotes, no punctuation at the end.",
          },
          { role: "user", content: `User: ${userMsg}\nAI: ${aiMsg.slice(0, 150)}` },
        ],
      }),
    });
    if (!resp.ok || !resp.body) throw new Error();

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "", title = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return title.trim().slice(0, 50) || userMsg.slice(0, 40);
        try {
          const p = JSON.parse(data);
          const c = p.choices?.[0]?.delta?.content;
          if (c) title += c;
        } catch {}
      }
    }
    return title.trim().slice(0, 50) || userMsg.slice(0, 40);
  } catch {
    return userMsg.slice(0, 50);
  }
}
