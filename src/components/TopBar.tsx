import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import vyomLogo from "@/assets/vyom-logo.png";

interface TopBarProps { title?: string; subtitle?: string }

const TopBar = ({ title = "Vyom AI", subtitle }: TopBarProps) => (
  <header className="flex items-center justify-between px-6 pt-8 pb-4">
    <Link to="/" className="flex items-center gap-2">
      <img src={vyomLogo} alt="Vyom AI" className="h-9 w-9 object-contain drop-shadow-[0_0_8px_rgba(139,92,246,0.7)]" />
      <div>
        <h1 className="font-display text-lg font-semibold leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </Link>
    <button className="glass flex h-10 w-10 items-center justify-center rounded-full">
      <Bell className="h-4 w-4 text-foreground" />
    </button>
  </header>
);

export default TopBar;
