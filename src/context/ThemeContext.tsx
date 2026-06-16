import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "dark" | "light";
type Accent = "cyan-purple" | "green-blue" | "orange-pink" | "gold-red";
interface ThemeCtx { theme: Theme; accent: Accent; setTheme: (t: Theme) => void; setAccent: (a: Accent) => void }
const Ctx = createContext<ThemeCtx>({ theme: "dark", accent: "cyan-purple", setTheme: () => {}, setAccent: () => {} });

export const ACCENTS = [
  { id: "cyan-purple" as Accent,  label: "Aurora",  from: "#06b6d4", to: "#7c3aed" },
  { id: "green-blue"  as Accent,  label: "Ocean",   from: "#10b981", to: "#3b82f6" },
  { id: "orange-pink" as Accent,  label: "Sunset",  from: "#f97316", to: "#ec4899" },
  { id: "gold-red"    as Accent,  label: "Fire",    from: "#eab308", to: "#ef4444" },
];

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");
  const [accent, setAccentState] = useState<Accent>(() => (localStorage.getItem("accent") as Accent) || "cyan-purple");

  const setTheme = (t: Theme) => { setThemeState(t); localStorage.setItem("theme", t); };
  const setAccent = (a: Accent) => { setAccentState(a); localStorage.setItem("accent", a); };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  useEffect(() => {
    const a = ACCENTS.find(x => x.id === accent)!;
    document.documentElement.style.setProperty("--accent-from", a.from);
    document.documentElement.style.setProperty("--accent-to", a.to);
  }, [accent]);

  return <Ctx.Provider value={{ theme, accent, setTheme, setAccent }}>{children}</Ctx.Provider>;
};

export const useTheme = () => useContext(Ctx);
