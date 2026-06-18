import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// EmotiveOrb — the expressive AI orb used on the Voice screen.
// Distinct from VyomOrb (the static logo orb used on Home/Auth) — this one
// morphs face, color, and particles based on the live conversation state.
// ---------------------------------------------------------------------------

export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "processing"
  | "responding"
  | "excited"
  | "surprised"
  | "completed"
  | "error";

export const ORB_STATES: Record<OrbState, {
  label: string;
  dot: string;
  glow: [string, string];
  waveAmp: number;
  waveSpeed: number;
}> = {
  idle:        { label: "Idle",          dot: "#a78bfa", glow: ["#7C3AED", "#3B82F6"], waveAmp: 0.25, waveSpeed: 1   },
  listening:   { label: "Listening",     dot: "#a78bfa", glow: ["#8B5CF6", "#3B82F6"], waveAmp: 1,    waveSpeed: 1.6 },
  thinking:    { label: "Thinking",      dot: "#60a5fa", glow: ["#3B82F6", "#1D4ED8"], waveAmp: 0.35, waveSpeed: 0.6 },
  processing:  { label: "Processing",    dot: "#22d3ee", glow: ["#22D3EE", "#3B82F6"], waveAmp: 0.6,  waveSpeed: 1.2 },
  responding:  { label: "Responding",    dot: "#c084fc", glow: ["#8B5CF6", "#22D3EE"], waveAmp: 0.85, waveSpeed: 1.4 },
  excited:     { label: "Excited",       dot: "#f472b6", glow: ["#EC4899", "#8B5CF6"], waveAmp: 0.7,  waveSpeed: 1.8 },
  surprised:   { label: "Surprised",     dot: "#60a5fa", glow: ["#3B82F6", "#8B5CF6"], waveAmp: 0.5,  waveSpeed: 2.2 },
  completed:   { label: "Completed",     dot: "#4ade80", glow: ["#22C55E", "#16A34A"], waveAmp: 0.2,  waveSpeed: 0.8 },
  error:       { label: "Error",         dot: "#f87171", glow: ["#EF4444", "#7C2D12"], waveAmp: 0.3,  waveSpeed: 0.9 },
};

function Particles({ state }: { state: OrbState }) {
  // Every particle animates transform/opacity only (cheap, compositor-only)
  // and is promoted to its own GPU layer via willChange, so the browser
  // doesn't repaint the whole orb on every animation tick. Text-shadow is
  // used instead of filter:drop-shadow() for the same reason — much cheaper
  // to animate, with a near-identical look at this size.
  if (state === "thinking") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-blue-300"
            style={{ boxShadow: "0 0 6px #60a5fa", animation: "orbit 4s linear infinite", animationDelay: `${i * -0.66}s`, transform: `rotate(${(i / 6) * 360}deg) translateX(95px)`, willChange: "transform" }} />
        ))}
      </div>
    );
  }
  if (state === "processing") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="absolute left-1/2 top-1/2 w-1 h-1 rounded-full bg-cyan-300"
            style={{ boxShadow: "0 0 6px #22D3EE", animation: "energyPulse 1.6s ease-in-out infinite", animationDelay: `${i * 0.12}s`, transform: `rotate(${i * 45}deg) translateX(85px)`, willChange: "opacity" }} />
        ))}
      </div>
    );
  }
  if (state === "excited") {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="absolute text-yellow-300"
            style={{ left: `${15 + (i * 9) % 75}%`, top: `${10 + ((i * 13) % 70)}%`, fontSize: 10 + (i % 3) * 4, animation: "floatStar 2.4s ease-in-out infinite", animationDelay: `${i * 0.2}s`, textShadow: "0 0 4px #facc15", willChange: "transform, opacity" }}>✦</span>
        ))}
      </div>
    );
  }
  if (state === "completed") {
    const colors = ["#facc15", "#f472b6", "#22D3EE", "#4ade80", "#8B5CF6"];
    return (
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="absolute w-1.5 h-2.5 rounded-sm"
            style={{ left: `${50 + Math.cos((i / 10) * Math.PI * 2) * 8}%`, top: `${50 + Math.sin((i / 10) * Math.PI * 2) * 8}%`, background: colors[i % colors.length], animation: "confettiBurst 1.8s ease-out infinite", animationDelay: `${i * 0.07}s`, transform: `rotate(${i * 25}deg)`, willChange: "transform, opacity" }} />
        ))}
      </div>
    );
  }
  return null;
}

function Mouth({ state }: { state: OrbState }) {
  if (state === "idle") return null;
  if (state === "error") {
    return <span className="block w-5 h-2.5 border-b-2 border-white/70 rounded-full" style={{ transform: "rotate(180deg) translateY(-2px)" }} />;
  }
  if (state === "thinking") return <span className="block w-3.5 h-3.5 rounded-full border-2 border-white/70" />;
  if (state === "surprised") return <span className="block w-3 h-4 rounded-full bg-white/80" />;
  return <span className="block w-7 h-3 border-b-[3px] border-white rounded-full" style={{ boxShadow: "0 2px 6px rgba(255,255,255,0.4)" }} />;
}

function HandGesture({ state }: { state: OrbState }) {
  const baseHand = (extra: React.CSSProperties = {}) => (
    <div className="absolute w-9 h-9 rounded-full bg-gradient-to-br from-indigo-300 to-blue-500 border border-white/30"
      style={{ boxShadow: "0 0 14px rgba(99,102,241,0.6)", ...extra }} />
  );
  if (state === "listening") return baseHand({ right: "8%", top: "38%", transform: "rotate(-15deg)" });
  if (state === "thinking") return baseHand({ left: "30%", bottom: "16%", transform: "rotate(10deg)" });
  if (state === "processing") return <>{baseHand({ left: "6%", bottom: "14%" })}{baseHand({ right: "6%", bottom: "14%" })}</>;
  if (state === "responding") return baseHand({ right: "4%", top: "20%", transform: "rotate(-25deg)" });
  if (state === "excited") return <>{baseHand({ left: "2%", top: "6%", transform: "rotate(20deg)" })}{baseHand({ right: "2%", top: "6%", transform: "rotate(-20deg)" })}</>;
  if (state === "surprised") return <>{baseHand({ left: "14%", top: "44%" })}{baseHand({ right: "14%", top: "44%" })}</>;
  if (state === "completed") return <>{baseHand({ left: "8%", bottom: "10%", transform: "rotate(-10deg)" })}{baseHand({ right: "8%", bottom: "10%", transform: "rotate(10deg)" })}</>;
  return null;
}

function OrbFace({ state, blink }: { state: OrbState; blink: boolean }) {
  const eyeH = state === "surprised" ? 13 : state === "excited" ? 0 : 11;
  const eyeShape = state === "excited" ? "star" : state === "completed" ? "happy" : state === "error" ? "sad" : "oval";

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="relative flex flex-col items-center gap-3 z-10">
        <div className="flex items-center gap-5">
          {eyeShape === "star" ? (
            <>
              <span className="text-white text-2xl leading-none" style={{ textShadow: "0 0 6px #fff" }}>✦</span>
              <span className="text-white text-2xl leading-none" style={{ textShadow: "0 0 6px #fff" }}>✦</span>
            </>
          ) : eyeShape === "happy" ? (
            <>
              <span className="block w-4 border-b-[3px] border-white rounded-full" style={{ height: 0, transform: "rotate(8deg)" }} />
              <span className="block w-4 border-b-[3px] border-white rounded-full" style={{ height: 0, transform: "rotate(-8deg)" }} />
            </>
          ) : eyeShape === "sad" ? (
            <>
              <span className="block w-2.5 h-2.5 rounded-full bg-white/80" />
              <span className="block w-2.5 h-2.5 rounded-full bg-white/80" />
            </>
          ) : (
            <>
              <span className="block w-2.5 rounded-full bg-white transition-transform duration-150"
                style={{ height: eyeH, boxShadow: "0 0 8px rgba(255,255,255,0.8)", transform: blink ? "scaleY(0.08)" : "scaleY(1)", transformOrigin: "center" }} />
              <span className="block w-2.5 rounded-full bg-white transition-transform duration-150"
                style={{ height: eyeH, boxShadow: "0 0 8px rgba(255,255,255,0.8)", transform: blink ? "scaleY(0.08)" : "scaleY(1)", transformOrigin: "center" }} />
            </>
          )}
        </div>
        <Mouth state={state} />
      </div>
      <HandGesture state={state} />
    </div>
  );
}

interface EmotiveOrbProps {
  state: OrbState;
  size?: number;
  onTap?: () => void;
}

const EmotiveOrb = ({ state, size = 220, onTap }: EmotiveOrbProps) => {
  const cfg = ORB_STATES[state];
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3400 + Math.random() * 1800);
    return () => clearInterval(id);
  }, []);

  const shake = state === "error";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size + 40, height: size + 40 }}>
      <Particles state={state} />
      <button
        onClick={onTap}
        type="button"
        className="relative rounded-full active:scale-[0.97] transition-transform duration-200"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, ${cfg.glow[0]}cc, ${cfg.glow[1]}ee 60%, #0a0a14 100%)`,
          boxShadow: `0 0 60px ${cfg.glow[0]}66, 0 0 120px ${cfg.glow[1]}44, inset 0 0 40px rgba(255,255,255,0.08)`,
          animation: shake ? "orbShake 0.5s ease-in-out" : "orbFloat 5s ease-in-out infinite",
          willChange: "transform",
        }}
      >
        <div className="absolute inset-[3px] rounded-full" style={{ background: "radial-gradient(circle at 40% 25%, rgba(255,255,255,0.25), transparent 55%)" }} />
        <OrbFace state={state} blink={blink} />
      </button>
    </div>
  );
};

export default EmotiveOrb;
