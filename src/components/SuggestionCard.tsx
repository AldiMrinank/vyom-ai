import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SuggestionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient?: string;
  onClick?: () => void;
  className?: string;
}

const SuggestionCard = ({ icon: Icon, title, description, gradient, onClick, className }: SuggestionCardProps) => (
  <button
    onClick={onClick}
    className={cn(
      "glass-card group relative overflow-hidden p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-neon active:scale-[0.98]",
      className
    )}
  >
    <div
      className={cn(
        "absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70",
        gradient ?? "bg-gradient-aurora"
      )}
    />
    <div className="relative flex items-start justify-between">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
        <Icon className="h-5 w-5 text-primary-foreground" />
      </span>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-glow" />
    </div>
    <h3 className="relative mt-4 font-display text-base font-semibold">{title}</h3>
    <p className="relative mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
  </button>
);

export default SuggestionCard;
