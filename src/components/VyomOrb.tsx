import { cn } from "@/lib/utils";
import vyomLogo from "@/assets/vyom-logo.png";

interface VyomOrbProps {
  size?: number;
  className?: string;
  active?: boolean;
}

const VyomOrb = ({ size = 220, className, active = true }: VyomOrbProps) => {
  return (
    <div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {/* Animated glow rings */}
      {active && (
        <>
          <span className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ring-expand" />
          <span
            className="absolute inset-0 rounded-full border border-purple-500/30 animate-ring-expand"
            style={{ animationDelay: "0.8s" }}
          />
          <span
            className="absolute inset-0 rounded-full border border-pink-500/20 animate-ring-expand"
            style={{ animationDelay: "1.6s" }}
          />
        </>
      )}

      {/* Ambient glow behind logo */}
      <div
        className="absolute rounded-full blur-3xl opacity-60"
        style={{
          width: size * 0.85,
          height: size * 0.85,
          background: "radial-gradient(circle, rgba(99,102,241,0.5) 0%, rgba(168,85,247,0.3) 50%, rgba(236,72,153,0.2) 100%)",
        }}
      />

      {/* Logo */}
      <img
        src={vyomLogo}
        alt="Vyom AI"
        className={cn("relative z-10 object-contain drop-shadow-[0_0_20px_rgba(139,92,246,0.8)]", active && "animate-orb-float")}
        style={{ width: size * 0.78, height: size * 0.78 }}
      />
    </div>
  );
};

export default VyomOrb;
