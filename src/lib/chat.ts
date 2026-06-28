import { loadSettings } from "./settings";
import { routePrompt } from "./modelRouter";
import { auth } from "@/integrations/firebase/config";

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}
export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) throw new Error("You're signed out. Please sign in again.");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function resolveModel(userMsg: string, hasImage = false): string {
  const { model } = loadSettings();
  if (model === "vyom-auto") return routePrompt(userMsg, hasImage).model;
  return model;
}

export async function streamChat({
  messages,
  onDelta,
  onDone,
  signal,
}: {
  messages: ChatMsg[];
  onDelta: (chunk: string) => void;
  onDone: () => void;
  signal?: AbortSignal;
}) {
  const { systemPrompt } = loadSettings();
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const promptText =
    typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : (lastUserMsg?.content as any[])?.[0]?.text ?? "";
  const hasImage =
    Array.isArray(lastUserMsg?.content) &&
    (lastUserMsg!.content as ContentPart[]).some((c) => c.type === "image_url");
  const model = resolveModel(promptText, hasImage);

  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.filter((m) => m.role !== "system"),
      ],
    }),
    signal,
  });

  if (!resp.ok || !resp.body) {
    let msg = "AI request failed";
    try {
      const j = await resp.json();
      msg = j.error?.message || msg;
    } catch {}
    if (resp.status === 429) msg = "Too many requests. Please slow down.";
    if (resp.status === 401) msg = "Session expired. Please sign in again.";
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

export async function generateTitle(userMsg: string, aiMsg: string): Promise<string> {
  const model = "google/gemini-2.0-flash-exp:free";
  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        model,
        max_tokens: 15,
        messages: [
          {
            role: "system",
            content:
              "Generate a 3-5 word title for this conversation. Reply with ONLY the title, no quotes, no punctuation at end.",
          },
          { role: "user", content: `User: ${userMsg}\nAI: ${aiMsg.slice(0, 150)}` },
        ],
      }),
    });
    if (!resp.ok) throw new Error();
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = "",
      title = "";
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
