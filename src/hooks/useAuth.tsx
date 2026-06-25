import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { auth } from "@/integrations/firebase/config";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, signOut: async () => {} });

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No timeout hack — we rely solely on Firebase's onAuthStateChanged.
    // Firebase always fires this callback (even when offline, using cached
    // credentials from IndexedDB), so it is safe to wait indefinitely.
    // The only case it wouldn't fire is if auth is completely undefined
    // (missing env vars), which we handle immediately below.
    if (!auth) {
      console.error("Firebase Auth is not initialized — check VITE_FIREBASE_* env vars.");
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(
      auth,
      (u) => { setUser(u); setLoading(false); },
      (err) => { console.error("Auth state error:", err); setLoading(false); }
    );
    return unsub;
  }, []);

  return (
    <Ctx.Provider value={{
      user,
      loading,
      signOut: async () => {
        if (auth) {
          await fbSignOut(auth);
        }
      },
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
