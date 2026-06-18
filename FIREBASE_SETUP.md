# Firebase Setup Guide

## Step 1 — Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click **Add project** → name it "Vyom AI" → Continue
3. Disable Google Analytics (optional) → Create project

## Step 2 — Enable Authentication
1. Firebase Console → **Authentication** → Get started
2. **Sign-in method** tab → Enable **Email/Password**
3. Also enable **Google** (for Google sign-in)
   - Add your Cloudflare Pages URL to **Authorized domains**
   - e.g. `your-site.pages.dev`

## Step 3 — Create Firestore Database
1. Firebase Console → **Firestore Database** → Create database
2. Choose **Start in production mode** → select your region → Enable
3. Go to **Rules** tab → paste contents of `firestore.rules` → Publish
4. Go to **Indexes** tab → click the link in the error message OR use Firebase CLI

## Step 4 — Get Your Config
1. Firebase Console → Project Settings (gear icon) → Your apps → **Add app** → Web (`</>`)
2. Register app as "Vyom AI Web" → copy the `firebaseConfig` object
3. Create a `.env` file from `.env.example` and fill in the values

## Step 5 — Deploy Indexes (Firebase CLI)
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project
firebase deploy --only firestore
```

## Step 6 — Cloudflare Pages Environment Variables
In Cloudflare Pages → Settings → Environment variables, add:

| Variable | Value |
|----------|-------|
| `VITE_FIREBASE_API_KEY` | from Firebase config |
| `VITE_FIREBASE_AUTH_DOMAIN` | from Firebase config |
| `VITE_FIREBASE_PROJECT_ID` | from Firebase config |
| `VITE_FIREBASE_STORAGE_BUCKET` | from Firebase config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from Firebase config |
| `VITE_FIREBASE_APP_ID` | from Firebase config |
| `OPENROUTER_KEY` | your OpenRouter key (no VITE_ prefix!) |
| `FIREBASE_PROJECT_ID` | same value as `VITE_FIREBASE_PROJECT_ID`, but WITHOUT the `VITE_` prefix — used server-side to verify sign-in tokens |

> **Why both?** Variables prefixed `VITE_` are bundled into the client JS and are public. `FIREBASE_PROJECT_ID` (no prefix) is only readable by the Cloudflare Function and is used to verify that incoming requests carry a real, valid Firebase sign-in token for *this* project — this is what closes the "anyone can find the URL and burn your OpenRouter key" hole.

### Optional — per-user rate limiting
The chat function will also rate-limit to 20 requests/minute per signed-in user if you bind a KV namespace called `RATE_LIMIT_KV`:
```bash
npx wrangler kv namespace create vyom-rate-limit
# Then in Cloudflare Pages → Settings → Functions → KV namespace bindings:
# Variable name: RATE_LIMIT_KV  →  select the namespace you just created
```
If you skip this, sign-in verification still applies — you just won't have the extra rate limit layer.


## Step 7 — Build & Deploy
```bash
npm install
npm run build
# Upload dist/ to Cloudflare Pages
```

## Firestore Data Structure
```
/users/{uid}
  displayName, email, avatarUrl, bio, createdAt

/conversations/{convId}
  userId, title, starred, createdAt, updatedAt

/conversations/{convId}/messages/{msgId}
  role, content, userId, createdAt
```
