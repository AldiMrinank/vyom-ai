// Cloudflare Pages Function — handles /api/search
// Requires a valid Firebase ID token. Calls Tavily (primary) then Brave (fallback).

import { importX509, jwtVerify, decodeProtectedHeader } from "jose";

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certsCache = null;
let certsCacheAt = 0;
const CERTS_CACHE_MS = 6 * 60 * 60 * 1000;

async function getGoogleCerts() {
  if (certsCache && Date.now() - certsCacheAt < CERTS_CACHE_MS) return certsCache;
  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) throw new Error("Failed to fetch Google public certs");
  certsCache = await resp.json();
  certsCacheAt = Date.now();
  return certsCache;
}

async function verifyFirebaseIdToken(idToken, projectId) {
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not configured");
  const { kid, alg } = decodeProtectedHeader(idToken);
  if (alg !== "RS256") throw new Error("Unexpected algorithm");
  if (!kid) throw new Error("Token missing kid");
  const certs = await getGoogleCerts();
  const certPem = certs[kid];
  if (!certPem) throw new Error("Unknown signing key");
  const publicKey = await importX509(certPem, "RS256");
  const { payload } = await jwtVerify(idToken, publicKey, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error("Token missing subject");
  return payload;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 200, headers: corsHeaders(request.headers.get("origin")) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("origin");
  const headers = { "Content-Type": "application/json", ...corsHeaders(origin) };

  // Auth check
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.match(/^Bearer (.+)$/)?.[1];
  if (token && env.FIREBASE_PROJECT_ID) {
    try {
      await verifyFirebaseIdToken(token, env.FIREBASE_PROJECT_ID);
    } catch {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }

  const query = (body.query || "").trim().slice(0, 300);
  const limit = Math.min(Number(body.limit) || 5, 10);
  if (!query) return new Response(JSON.stringify({ results: [], query }), { status: 200, headers });

  // Try Tavily
  if (env.TAVILY_API_KEY) {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: env.TAVILY_API_KEY, query, max_results: limit, search_depth: "basic" }),
      });
      if (r.ok) {
        const data = await r.json();
        const results = (data.results || []).map((x) => ({
          title: x.title || "",
          url: x.url || "",
          snippet: x.content || x.snippet || "",
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(x.url).hostname}&sz=32`,
        }));
        return new Response(JSON.stringify({ results, query }), { status: 200, headers });
      }
    } catch {}
  }

  // Fallback: Brave Search
  if (env.BRAVE_API_KEY) {
    try {
      const r = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
        { headers: { "Accept": "application/json", "X-Subscription-Token": env.BRAVE_API_KEY } }
      );
      if (r.ok) {
        const data = await r.json();
        const results = (data.web?.results || []).map((x) => ({
          title: x.title || "",
          url: x.url || "",
          snippet: x.description || "",
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(x.url).hostname}&sz=32`,
        }));
        return new Response(JSON.stringify({ results, query }), { status: 200, headers });
      }
    } catch {}
  }

  return new Response(JSON.stringify({ results: [], query }), { status: 200, headers });
}
