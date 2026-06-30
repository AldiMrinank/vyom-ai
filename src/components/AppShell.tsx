import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Clock, User, BookMarked, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";

// VA gradient monogram — no 1.4MB PNG
const VyomLogo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="vaGradNav" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22D3EE" />
        <stop offset="50%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#EC4899" />
      </linearGradient>
    </defs>
    <path d="M4 8 L14 30 L20 16 L26 30 L36 8" stroke="url(#vaGradNav)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M17 19 L20 25 L23 19" stroke="url(#vaGradNav)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M20 13 L20.6 15 L22.5 15 L21 16.2 L21.5 18 L20 17 L18.5 18 L19 16.2 L17.5 15 L19.4 15 Z" fill="white" opacity="0.9" />
  </svg>
);

const AppShell = () => {
  const location = useLocation();
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#080810]">
      <main key={location.pathname} className="flex-1 animate-fade-in pb-28">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

const BottomNav = () => {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user || !db) return;
    const lastVisitKey = `last_visit_${user.uid}`;
    const last = localStorage.getItem(lastVisitKey) || new Date(0).toISOString();
    getDocs(query(
      collection(db, "conversations"),
      where("userId", "==", user.uid),
      where("updatedAt", ">", new Date(last)),
      limit(10)
    )).then(snap => setUnread(snap.size)).catch(() => {});
    return () => { localStorage.setItem(lastVisitKey, new Date().toISOString()); };
  }, [user]);

  const navItems = [
    { to: "/",        icon: Home,       label: "Home",    badge: 0 },
    { to: "/explore", icon: Compass,    label: "Explore", badge: 0 },
    { to: "/history", icon: Clock,      label: "History", badge: unread },
    { to: "/library", icon: BookMarked, label: "Library", badge: 0 },
    { to: "/profile", icon: User,       label: "Profile", badge: 0 },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-3"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Neon top rim */}
      <div className="h-px w-full mb-0"
        style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.6) 30%, rgba(34,211,238,0.5) 70%, transparent)" }} />

      <div
        className="flex items-center justify-around rounded-[28px] px-1 py-2 border border-white/[0.06]"
        style={{ backdropFilter: "blur(40px) saturate(180%)", background: "rgba(8,8,20,0.85)", boxShadow: "0 -4px 32px rgba(139,92,246,0.12), 0 8px 32px rgba(0,0,0,0.4)" }}
      >
        {navItems.map((item, idx) => {
          // Center slot = Vyom orb CTA
          if (idx === 2) {
            return (
              <NavLink key={item.to} to={item.to} end className="group relative -mt-8 flex flex-col items-center">
                {({ isActive }) => (
                  <>
                    {/* Outer glow ring */}
                    <span className={cn(
                      "absolute -inset-1 rounded-full opacity-0 transition-opacity duration-300",
                      isActive ? "opacity-60" : "group-hover:opacity-40"
                    )}
                      style={{ background: "radial-gradient(circle, rgba(139,92,246,0.6), transparent 70%)", filter: "blur(8px)" }}
                    />
                    <span
                      className={cn(
                        "relative flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 transition-all duration-300",
                        isActive
                          ? "border-purple-400/60 scale-105"
                          : "border-purple-500/30 group-hover:scale-105 group-active:scale-95",
                        "animate-[orb-pulse_3s_ease-in-out_infinite]"
                      )}
                      style={{
                        background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 50%, #3B82F6 100%)",
                        boxShadow: "0 0 24px rgba(139,92,246,0.6), 0 0 48px rgba(139,92,246,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                      }}
                    >
                      <VyomLogo size={24} />
                    </span>
                    <span className="mt-1.5 text-[9px] text-white/30 font-medium">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => {
                if (item.to === "/history") {
                  const key = `last_visit_${user?.uid ?? "anon"}`;
                  localStorage.setItem(key, new Date().toISOString());
                  setUnread(0);
                }
              }}
              className={({ isActive }) => cn(
                "group relative flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-all duration-200 min-w-[52px]",
                isActive && "text-primary-glow"
              )}
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <item.icon
                      className={cn(
                        "h-5 w-5 transition-all duration-200",
                        isActive ? "text-purple-400" : "text-white/30 group-hover:text-white/60"
                      )}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    {item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.7)]">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[9px] font-medium transition-all",
                    isActive ? "text-purple-400" : "text-white/25"
                  )}>
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default AppShell;
