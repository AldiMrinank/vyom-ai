import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { haptic } from "@/lib/haptic";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallPrompt = () => {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("pwa-dismissed")) return;
    const handler = (e: Event) => { e.preventDefault(); setPrompt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;

  const install = async () => {
    haptic([10, 50, 10]);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
    else { setDismissed(true); localStorage.setItem("pwa-dismissed", "1"); }
  };

  const dismiss = () => { haptic(8); setDismissed(true); localStorage.setItem("pwa-dismissed", "1"); };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-slide-up">
      <div className="glass-card flex items-center gap-3 p-3 shadow-neon border border-cyan-500/30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Vyom AI</p>
          <p className="text-xs text-muted-foreground">Add to home screen for the best experience</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={install} className="rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white">Install</button>
          <button onClick={dismiss} className="text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
