// Cloudflare Pages Function — handles /api/chat
// Streams OpenRouter responses directly to the client

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function onRequestPost({ request, env }) {
  const API_KEY = env.OPENROUTER_KEY;

  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "OPENROUTER_KEY not set in Cloudflare environment variables." } }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400 }); }

  // Auto-switch to vision model if image is attached
  const hasImage = body.messages?.some(m =>
    Array.isArray(m.content) && m.content.some(c => c.type === "image_url")
  );
  const model = hasImage ? "google/gemini-2.0-flash-exp:free" : (body.model || "openrouter/auto");

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": request.headers.get("origin") || "https://vyom.ai",
      "X-Title": "Vyom AI",
    },
    body: JSON.stringify({ ...body, model, stream: true }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, {
      status: upstream.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Stream response back to client
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}
