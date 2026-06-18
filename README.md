# Vyom AI

A mobile-first AI chat application with markdown rendering, voice mode, PDF/document upload, image vision, and a PWA install flow.

## Stack
- React + TypeScript + Vite
- Firebase (Authentication + Firestore)
- Cloudflare Pages + Pages Functions
- OpenRouter (AI backend, via a serverless proxy)

## Getting started

```bash
npm install
npm run dev
```

See `FIREBASE_SETUP.md` for setting up Firebase Auth, Firestore, and the required environment variables before running locally or deploying.

## Scripts

- `npm run dev` — start the local dev server
- `npm run build` — production build
- `npm run test` — run the test suite (Vitest)
- `npm run lint` — lint the codebase

## Deployment

Deployed via Cloudflare Pages. The `/api/chat` function requires `OPENROUTER_KEY` and `FIREBASE_PROJECT_ID` to be set in the Cloudflare Pages environment variables — see `FIREBASE_SETUP.md` for details.
