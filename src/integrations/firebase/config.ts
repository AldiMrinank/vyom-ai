import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: ReturnType<typeof initializeApp> | undefined;
let auth: ReturnType<typeof getAuth> | undefined;
let db: ReturnType<typeof getFirestore> | undefined;

if (firebaseConfig.apiKey) {
  try {
    app  = initializeApp(firebaseConfig);
    auth = getAuth(app);

    // persistentMultipleTabManager uses SharedWorker/BroadcastChannel — not
    // supported on iOS Safari or Android WebView. Fall back gracefully so
    // that `db` is always defined after a successful Firebase init, even on
    // mobile browsers that don't support multi-tab sync.
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      console.warn("Multi-tab Firestore persistence not supported — falling back to single-tab.");
      try {
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({ forceOwnership: true }),
          }),
        });
      } catch {
        // Last resort: no offline persistence, but fully functional online
        console.warn("Offline persistence unavailable — using online-only Firestore.");
        db = getFirestore(app);
      }
    }
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
} else {
  console.warn("Firebase API Key is missing. Check your VITE_FIREBASE_* environment variables.");
}

export { app, auth, db };
