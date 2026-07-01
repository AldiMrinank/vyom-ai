// Cloudflare Pages Function — handles /api/chat
// Streams OpenRouter responses directly to the client.
//
// Every request must carry a valid Firebase ID token (verified against
// Google's public certs via the `jose` library), so only signed-in users
// can spend the OPENROUTER_KEY. A basic per-user rate limit is applied
// when a KV namespace is bound.

import { importX509, jwtVerify, decodeProtectedHeader } from "jose";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const RATE_LIMIT_PER_MINUTE = 20;

// Mirrors the model IDs offered in src/lib/settings.ts. Kept as an explicit
// allowlist here (rather than trusting whatever string the client sends) so
// a signed-in user can't request an arbitrary OpenRouter model — including a
// paid one — that was never actually offered in the app's UI. If you add a
// model to settings.ts, add it here too.
const ALLOWED_MODELS = new Set([
  "google/gemini-2.0-flash-exp:free",
  "google/gemma-3-12b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "openrouter/auto",
  "deepseek/deepseek-r1:free",
  "microsoft/phi-4-reasoning:free",
]);

let certsCache = null;
let certsCacheAt = 0;
const CERTS_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours — Google rotates these rarely; longer cache means
                                            // far fewer cold-start requests pay the extra round trip
                                            // to fetch them before the actual AI call can even start.

async function getGoogleCerts() {
  if (certsCache && Date.now() - certsCacheAt < CERTS_CACHE_MS) return certsCache;
  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) throw new Error("Failed to fetch Google public certs");
  certsCache = await resp.json(); // { kid: "-----BEGIN CERTIFICATE-----...", ... }
  certsCacheAt = Date.now();
  return certsCache;
}

/**
 * Verifies a Firebase ID token against Google's public certs.
 * Returns the verified payload (payload.sub is the Firebase uid) or throws.
 */
async function verifyFirebaseIdToken(idToken, projectId) {
  // If this isn't configured, jose would skip issuer/audience verification
  // entirely and accept a validly-signed token from ANY Firebase project —
  // not just this one. Fail closed instead of silently weakening the check.
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

function extractIdToken(request) {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// Reflects the request's Origin back rather than a hardcoded domain, since
// this app can be reached via a *.pages.dev URL and/or a custom domain that
// isn't known at build time. This is safe here because auth uses a Bearer
// token (not a cookie), so a third-party site reading this response can't
// do anything with it unless it already had the user's token — at which
// point CORS isn't what's protecting you. Once your final production
// domain is fixed, consider replacing `origin || "*"` below with an
// allowlist check against that domain for defense in depth.
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
  const API_KEY = env.OPENROUTER_KEY;

  if (!API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: "OPENROUTER_KEY not set in Cloudflare environment variables." } }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // --- Auth check: reject any request without a valid Firebase ID token ---
  const idToken = extractIdToken(request);
  if (!idToken) {
    return new Response(
      JSON.stringify({ error: { message: "Missing Authorization header. Please sign in." } }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  let uid;
  try {
    const projectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) {
      console.error("[vyom] Missing FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID env vars");
      return new Response(
        JSON.stringify({ error: { message: "Server misconfiguration: Firebase project ID not set." } }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }
    const payload = await verifyFirebaseIdToken(idToken, projectId);
    uid = payload.sub;
  } catch (authErr) {
    console.error("[vyom] Token verification failed:", authErr?.message);
    return new Response(
      JSON.stringify({ error: { message: "Invalid or expired session. Please sign in again." } }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // Rate limit: skipped gracefully if RATE_LIMIT_KV isn't bound, so this
  // doesn't break deployments that haven't set up KV yet — the auth check
  // above still applies regardless. Note this is a soft limit: KV's
  // read-then-write isn't atomic, so a burst of near-simultaneous requests
  // from the same user could slip a few over the limit. That's an accepted
  // tradeoff here; a hard guarantee would need Durable Objects instead of KV.
  if (env.RATE_LIMIT_KV) {
    const bucketKey = `rl:${uid}:${Math.floor(Date.now() / 60000)}`;
    const current = parseInt((await env.RATE_LIMIT_KV.get(bucketKey)) || "0", 10);
    if (current >= RATE_LIMIT_PER_MINUTE) {
      return new Response(
        JSON.stringify({ error: { message: "Too many requests. Please slow down." } }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }
    await env.RATE_LIMIT_KV.put(bucketKey, String(current + 1), { expirationTtl: 90 });
  }

  // The 5MB image-size check in the UI is client-side only and doesn't stop
  // a signed-in user from posting an oversized body directly to this
  // endpoint. Reject early based on Content-Length before buffering/parsing
  // the body at all. 8MB gives headroom for a ~5MB image's base64 encoding
  // (roughly 4/3 the original size) plus the rest of the message payload.
  const MAX_BODY_BYTES = 8 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ error: { message: "Request is too large." } }),
      { status: 413, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response("Invalid JSON", { status: 400, headers: corsHeaders(origin) }); }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(
      JSON.stringify({ error: { message: "Request must include a non-empty messages array." } }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }

  // Auto-switch to vision model if image is attached
  const hasImage = body.messages.some(m =>
    Array.isArray(m.content) && m.content.some(c => c.type === "image_url")
  );
  const requestedModel = hasImage ? "google/gemini-2.0-flash-exp:free" : (body.model || "openrouter/auto");

  if (!ALLOWED_MODELS.has(requestedModel)) {
    return new Response(
      JSON.stringify({ error: { message: "Requested model is not available." } }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
    );
  }
  const model = requestedModel;

  // Only forward the specific fields the app sends, rather than spreading the
  // entire client-supplied body through to OpenRouter. Forwarding everything
  // verbatim would let a signed-in user smuggle arbitrary parameters (n,
  // max_tokens, etc.) — harmless on free-tier models today, but a real
  // billing risk the moment a paid model is ever added to the model list.
  const upstreamBody = {
    model,
    messages: body.messages,
    stream: true,
  };
  if (typeof body.max_tokens === "number" && body.max_tokens > 0 && body.max_tokens <= 2000) {
    upstreamBody.max_tokens = body.max_tokens;
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "HTTP-Referer": origin || "https://vyom.ai",
      "X-Title": "Vyom AI",
    },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(err, {
      status: upstream.status,
      headers: corsHeaders(origin),
    });
  }

  // Stream response back to client
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      ...corsHeaders(origin),
    },
  });
}
