import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

const OfflineIndicator = () => {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const handleOffline = () => { setOffline(true); setShowBack(false); };
    const handleOnline  = () => { setOffline(false); setShowBack(true); setTimeout(() => setShowBack(false), 3000); };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!offline && !showBack) return null;

  return (
    <div className={`fixed top-4 left-1/2 z-[999] -translate-x-1/2 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300 ${
      offline
        ? "bg-red-950/90 border border-red-500/30 text-red-300"
        : "bg-green-950/90 border border-green-500/30 text-green-300"
    }`}
      style={{ backdropFilter: "blur(16px)" }}
    >
      {offline
        ? <><WifiOff className="h-4 w-4" /> No internet connection</>
        : <><Wifi className="h-4 w-4" /> Back online</>
      }
    </div>
  );
};

export default OfflineIndicator;
