import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

const OfflineIndicator = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const on = () => { setOnline(true); setShowBack(true); setTimeout(() => setShowBack(false), 3000); };
    const off = () => { setOnline(false); setShowBack(false); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  if (online && !showBack) return null;

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold shadow-lg animate-slide-down ${online ? "bg-green-500 text-white" : "bg-red-500/90 text-white backdrop-blur-sm"}`}>
      {online ? <><Wifi className="h-3.5 w-3.5" /> Back online</> : <><WifiOff className="h-3.5 w-3.5" /> No internet connection</>}
    </div>
  );
};

export default OfflineIndicator;
