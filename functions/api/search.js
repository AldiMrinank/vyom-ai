// Cloudflare Pages Function — handles /api/search
// Uses Tavily API (generous free tier: 1000 searches/month) to return
// web search results. Requires TAVILY_API_KEY in Cloudflare env vars.
// Falls back to DuckDuckGo's unofficial instant answer API if not set.

import { importX509, jwtVerify, decodeProtectedHeader } from "jose";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certsCache = null;
let certsCacheAt = 0;

async function getGoogleCerts() {
  if (certsCache && Date.now() - certsCacheAt < 6 * 60 * 60 * 1000) return certsCache;
  const resp = await fetch(GOOGLE_CERTS_URL);
  certsCache = await resp.json();
  certsCacheAt = Date.now();
  return certsCache;
}

async function verifyToken(idToken, projectId) {
  const { kid, alg } = decodeProtectedHeader(idToken);
  const certs = await getGoogleCerts();
  const key = await importX509(certs[kid], "RS256");
  const { payload } = await jwtVerify(idToken, key, {
    issuer: projectId ? `https://securetoken.google.com/${projectId}` : undefined,
    audience: projectId || undefined,
  });
  if (!payload.sub) throw new Error("No subject");
  return payload;
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 200, headers: cors(request.headers.get("origin")) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");

  // Auth check
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...cors(origin) } });
  try { await verifyToken(token, env.FIREBASE_PROJECT_ID); } catch {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { "Content-Type": "application/json", ...cors(origin) } });
  }

  const { query, limit = 5 } = await request.json();
  if (!query?.trim()) return new Response(JSON.stringify({ results: [], query: "" }), { headers: { "Content-Type": "application/json", ...cors(origin) } });

  // Try Tavily first (best quality, free tier)
  if (env.TAVILY_API_KEY) {
    const resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query, max_results: limit, search_depth: "basic" }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const results = (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 300) || "",
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=32`,
      }));
      return new Response(JSON.stringify({ results, query }), { headers: { "Content-Type": "application/json", ...cors(origin) } });
    }
  }

  // Fallback: Brave Search (also has a free tier)
  if (env.BRAVE_API_KEY) {
    const resp = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
      headers: { "Accept": "application/json", "X-Subscription-Token": env.BRAVE_API_KEY },
    });
    if (resp.ok) {
      const data = await resp.json();
      const results = (data.web?.results || []).slice(0, limit).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.description || "",
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=32`,
      }));
      return new Response(JSON.stringify({ results, query }), { headers: { "Content-Type": "application/json", ...cors(origin) } });
    }
  }

  // No search key configured
  return new Response(JSON.stringify({ results: [], query, error: "No search API configured. Add TAVILY_API_KEY to Cloudflare env vars." }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}
