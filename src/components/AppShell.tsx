import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Compass, Telescope, Clock, User, BookMarked } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { useAuth } from "@/hooks/useAuth";

const AppShell = () => {
  const location = useLocation();
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
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
    if (!user) return;
    const last = localStorage.getItem("last_visit") || new Date(0).toISOString();
    getDocs(query(
      collection(db, "conversations"),
      where("userId", "==", user.uid),
      where("updatedAt", ">", new Date(last)),
      limit(10)
    )).then(snap => setUnread(snap.size)).catch(() => {});
    return () => { localStorage.setItem("last_visit", new Date().toISOString()); };
  }, [user]);

  const navItems = [
    { to: "/",         icon: Home,      label: "Home"     },
    { to: "/explore",  icon: Compass,   label: "Explore"  },
    { to: "/research", icon: Telescope, label: "Research", center: true },
    { to: "/library",  icon: BookMarked,label: "Library"  },
    { to: "/profile",  icon: User,      label: "Profile"  },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
      <div className="glass-card flex items-center justify-around rounded-full px-2 py-2 shadow-neon">
        {navItems.map(item => (
          <NavLink
            key={item.to} to={item.to} end={item.to === "/"}
            onClick={() => {
              if (item.to === "/library") {
                localStorage.setItem("last_visit", new Date().toISOString());
                setUnread(0);
              }
            }}
            className={({ isActive }) => cn(
              "group relative flex flex-col items-center justify-center rounded-full transition-all duration-300",
              item.center ? "-mt-8 h-14 w-14" : "h-12 w-12",
              isActive && !item.center && "text-primary-glow"
            )}>
            {({ isActive }) =>
              item.center ? (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-aurora shadow-neon transition-transform group-hover:scale-110 group-active:scale-95" title="Deep Research">
                  <item.icon className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
                </span>
              ) : (
                <span className="relative flex flex-col items-center">
                  <item.icon className={cn("h-5 w-5 transition-all duration-300", isActive ? "text-primary-glow" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={isActive ? 2.5 : 2} />
                  {(item as any).badge > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {(item as any).badge > 9 ? "9+" : (item as any).badge}
                    </span>
                  )}
                  {isActive && <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-primary-glow shadow-[0_0_8px_hsl(var(--primary-glow))]" />}
                </span>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default AppShell;
