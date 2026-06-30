import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, signOut as fbSignOut, onIdTokenChanged } from "firebase/auth";
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
    if (!auth) {
      console.error("Firebase Auth is not initialized — check VITE_FIREBASE_* env vars.");
      setLoading(false);
      return;
    }

    // onIdTokenChanged fires on login, logout, AND when Firebase silently
    // refreshes the ID token (every hour). This keeps our user object
    // current and prevents "session expired" errors from stale tokens.
    const unsub = onIdTokenChanged(
      auth,
      (u) => { setUser(u); setLoading(false); },
      (err) => { console.error("Auth token error:", err); setLoading(false); }
    );
    return unsub;
  }, []);

  return (
    <Ctx.Provider value={{
      user,
      loading,
      signOut: async () => {
        if (auth) await fbSignOut(auth);
      },
    }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
