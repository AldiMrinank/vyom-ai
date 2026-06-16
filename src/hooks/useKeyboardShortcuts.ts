import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const useKeyboardShortcuts = () => {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") { e.preventDefault(); navigate("/chat"); }
      if (mod && e.key === "h") { e.preventDefault(); navigate("/history"); }
      if (mod && e.key === "/") { e.preventDefault(); navigate("/explore"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
};
