import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Settings, Camera, Monitor, Image as ImageIcon, PhoneOff,
  ChevronDown, Send, Check, Volume2, RefreshCw, Globe,
  Mic, MicOff, Eye, StopCircle, SwitchCamera, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceMode, QUICK_ACTIONS } from "@/hooks/useVoiceMode";
import { ORB_PHASES, type OrbPhase } from "@/voice/orbAnimations";
import { LANG_PROFILES } from "@/voice/languageDetector";
import { fileToDataUrl, compressImage } from "@/voice/cameraManager";
import { getVoices } from "@/voice/speechSynthesis";
import { cn } from "@/lib/utils";

/* ══════════════════════════════════════════════════════
   AUDIO-REACTIVE CANVAS ORB
══════════════════════════════════════════════════════ */
function VoiceOrb({ phase, amplitude, onTap }: {
  phase: OrbPhase; amplitude: number; onTap: () => void;
}) {
  const cfg       = ORB_PHASES[phase];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const ampRef    = useRef(amplitude);
  const cfgRef    = useRef(cfg);

  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const S = 300;
    canvas.width = S; canvas.height = S;
    const cx = S / 2, cy = S / 2, orbR = 95;

    let t = 0;
    const draw = () => {
      t += 0.025;
      const c   = cfgRef.current;
      const amp = ampRef.current * c.pulseIntensity;
      ctx.clearRect(0, 0, S, S);

      // ── Pulsing rings ──
      for (let i = 0; i < c.ringCount; i++) {
        const speed  = parseFloat(c.ringSpeed) * 1000;
        const prog   = (t * (1000 / speed) / (2 * Math.PI) + i / c.ringCount) % 1;
        const ringR  = orbR + 12 + prog * 62;
        const alpha  = (1 - prog) * 0.45;
        const hex    = Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = c.color1 + hex;
        ctx.lineWidth   = 2.5 - prog * 2;
        ctx.stroke();
      }

      // ── Audio-reactive waveform ring ──
      const BARS = 64;
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const wave  = amp * (10 + 9 * Math.sin(t * 4 + i * 0.4));
        const inner = orbR + 2;
        const outer = orbR + 6 + wave;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = i % 2 === 0 ? c.color1 + "cc" : c.color2 + "88";
        ctx.lineWidth   = 2;
        ctx.lineCap     = "round";
        ctx.stroke();
      }

      // ── Particles ──
      if (c.particleType === "orbit") {
        for (let i = 0; i < 5; i++) {
          const a = t * 0.7 + (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * 115, cy + Math.sin(a) * 115, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = c.color1 + "cc"; ctx.fill();
        }
      } else if (c.particleType === "energy") {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const r = 108 + 6 * Math.sin(t * 2.5 + i * 0.8);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = c.color2 + "bb"; ctx.fill();
        }
      } else if (c.particleType === "stars") {
        for (let i = 0; i < 7; i++) {
          const x = cx - 70 + (i % 4) * 46 + Math.sin(t * 0.9 + i) * 14;
          const y = cy - 80 + Math.floor(i / 4) * 160 + Math.cos(t * 0.7 + i) * 12;
          const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.font = `${10 + a * 6}px sans-serif`;
          ctx.fillText("✦", x, y);
        }
      } else if (c.particleType === "scan") {
        const scanY = cy - 78 + ((t * 0.4) % 1) * 156;
        const g = ctx.createLinearGradient(cx - 78, scanY, cx + 78, scanY);
        g.addColorStop(0, "transparent");
        g.addColorStop(0.5, c.color1 + "88");
        g.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.moveTo(cx - 78, scanY); ctx.lineTo(cx + 78, scanY);
        ctx.strokeStyle = g as any; ctx.lineWidth = 2; ctx.stroke();
      } else if (c.particleType === "grid") {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, 93, 0, Math.PI * 2); ctx.clip();
        const a = 0.08 + 0.06 * Math.sin(t);
        ctx.strokeStyle = c.color1 + Math.round(a * 255).toString(16).padStart(2, "0");
        ctx.lineWidth = 0.6;
        for (let gx = cx - 95; gx <= cx + 95; gx += 20) {
          ctx.beginPath(); ctx.moveTo(gx, cy - 95); ctx.lineTo(gx, cy + 95); ctx.stroke();
        }
        for (let gy = cy - 95; gy <= cy + 95; gy += 20) {
          ctx.beginPath(); ctx.moveTo(cx - 95, gy); ctx.lineTo(cx + 95, gy); ctx.stroke();
        }
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const scale = 1 + amplitude * cfgRef.current.pulseIntensity * 0.07;

  return (
    <div className="relative flex items-center justify-center select-none"
         style={{ width: 300, height: 300 }}>
      {/* Ambient glow behind orb */}
      <div className="absolute inset-0 rounded-full opacity-20 blur-3xl transition-all duration-700 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${cfg.color1}, ${cfg.color2}, transparent 70%)` }} />

      {/* Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none"
        style={{ width: 300, height: 300 }} />

      {/* Orb body */}
      <button onClick={onTap}
        className="relative rounded-full active:scale-95 transition-transform duration-100"
        style={{
          width: 200, height: 200,
          transform: `scale(${scale})`,
          background: `radial-gradient(circle at 36% 28%, ${cfg.color1}ee, ${cfg.color2}ff 58%, #080814 100%)`,
          boxShadow: `0 0 55px ${cfg.glowColor}, 0 0 100px ${cfg.color2}28, inset 0 0 40px rgba(255,255,255,0.08)`,
          transition: "background 0.8s ease, box-shadow 0.8s ease, transform 0.08s ease-out",
          willChange: "transform",
        }}>
        {/* Shine */}
        <div className="absolute inset-[3px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle at 38% 22%, rgba(255,255,255,0.28), transparent 52%)" }} />

        {/* Face */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <div className="flex items-center gap-5">
            {phase === "muted" && <><span className="w-3 h-3 rounded-full bg-white/35"/><span className="w-3 h-3 rounded-full bg-white/35"/></>}
            {phase === "error" && <><span className="text-lg font-bold text-white/80">✕</span><span className="text-lg font-bold text-white/80">✕</span></>}
            {phase === "vision" && <><Eye className="h-4 w-4 text-white" style={{filter:"drop-shadow(0 0 6px #34d399)"}}/><Eye className="h-4 w-4 text-white" style={{filter:"drop-shadow(0 0 6px #34d399)"}}/></>}
            {phase === "screenshare" && <><Monitor className="h-4 w-4 text-white" style={{filter:"drop-shadow(0 0 6px #22d3ee)"}}/><Monitor className="h-4 w-4 text-white" style={{filter:"drop-shadow(0 0 6px #22d3ee)"}}/></>}
            {!["muted","error","vision","screenshare"].includes(phase) && (
              <><span className="w-2.5 rounded-full bg-white" style={{height:11,boxShadow:"0 0 8px rgba(255,255,255,0.9)"}}/><span className="w-2.5 rounded-full bg-white" style={{height:11,boxShadow:"0 0 8px rgba(255,255,255,0.9)"}}/></>
            )}
          </div>
          {phase === "speaking"   && <div className="w-8 h-3 border-b-[3px] border-white rounded-full" style={{boxShadow:"0 2px 8px rgba(255,255,255,0.4)"}}/>}
          {phase === "listening"  && <div className="w-6 h-2 border-b-[2.5px] border-white/70 rounded-full"/>}
          {phase === "thinking"   && <div className="w-3.5 h-3.5 rounded-full border-2 border-white/70"/>}
          {phase === "processing" && <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-white animate-spin"/>}
          {(phase === "idle" || phase === "muted") && <div className="w-7 h-[2px] bg-white/50 rounded-full"/>}
          {phase === "vision"      && <span className="text-white/80 text-xs mt-0.5">👁</span>}
          {phase === "screenshare" && <span className="text-white/80 text-[10px] mt-0.5">🖥</span>}
          {phase === "error"       && <div className="w-5 h-2 border-b-2 border-white/60 rounded-full" style={{transform:"rotate(180deg)"}}/>}
        </div>
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   AUDIO-REACTIVE CANVAS WAVEFORM
══════════════════════════════════════════════════════ */
function AudioWaveform({ amplitude, active, color1, color2 }: {
  amplitude: number; active: boolean; color1: string; color2: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);
  const ampRef    = useRef(amplitude);
  const activeRef = useRef(active);

  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const BARS = 32;
    let t = 0;

    const draw = () => {
      t += 0.06;
      ctx.clearRect(0, 0, W, H);
      const amp = activeRef.current ? ampRef.current : 0;
      for (let i = 0; i < BARS; i++) {
        const x    = (i / (BARS - 1)) * W;
        const wave = amp * (0.4 + 0.6 * Math.abs(Math.sin(t + i * 0.45)));
        const base = activeRef.current ? Math.max(0.05, wave) : 0.06;
        const h    = Math.max(3, base * (H * 0.9));
        const a    = activeRef.current ? 0.4 + wave * 0.6 : 0.12;
        // Gradient: alternate between color1 and color2
        const col  = i % 2 === 0 ? color1 : color2;
        const hex  = Math.round(a * 255).toString(16).padStart(2, "0");
        ctx.fillStyle = col + hex;
        ctx.beginPath();
        (ctx as any).roundRect?.(x - 2, (H - h) / 2, 4, h, 2);
        if (!(ctx as any).roundRect) ctx.rect(x - 2, (H - h) / 2, 4, h);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [color1, color2]);

  return (
    <canvas ref={canvasRef} width={300} height={36}
      className="w-full max-w-xs" style={{ imageRendering: "pixelated" }} />
  );
}

/* ══════════════════════════════════════════════════════
   LIVE CAMERA VIEWFINDER (stays open, capture on demand)
══════════════════════════════════════════════════════ */
function LiveCameraView({ onCapture, onAsk, onClose, onSwitch }: {
  onCapture: () => void;
  onAsk: (text: string) => void;
  onClose: () => void;
  onSwitch: () => void;
}) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Attach camera session video element to the visible <video>
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(s => { setStream(s); if (videoRef.current) videoRef.current.srcObject = s; })
      .catch(() => onClose());
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const quickAsks = ["What is this?", "Explain this.", "Solve this.", "Read the text."];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-2 bg-black/80">
        <button onClick={onClose}
          className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10 active:scale-90 transition">
          <X className="h-5 w-5 text-white" />
        </button>
        <div className="flex items-center gap-1.5 text-white text-sm font-semibold">
          <span className="text-green-400">●</span> Live Camera
        </div>
        <button onClick={onSwitch}
          className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10 active:scale-90 transition">
          <SwitchCamera className="h-5 w-5 text-white/70" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {/* Scan overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(transparent 45%, rgba(139,92,246,0.04) 50%, transparent 55%)",
            animation: "scan 3s linear infinite",
          }} />
        <style>{`@keyframes scan { 0%{background-position:0 -100%} 100%{background-position:0 200%} }`}</style>

        {/* Corner brackets */}
        {[["top-4 left-4","border-t-2 border-l-2"],["top-4 right-4","border-t-2 border-r-2"],
          ["bottom-4 left-4","border-b-2 border-l-2"],["bottom-4 right-4","border-b-2 border-r-2"]].map(([pos,border],i) => (
          <div key={i} className={`absolute w-8 h-8 border-purple-400 ${pos} ${border}`} />
        ))}
      </div>

      {/* Quick ask chips */}
      <div className="px-4 py-3 bg-black/90 flex gap-2 overflow-x-auto scrollbar-hide">
        {quickAsks.map(q => (
          <button key={q} onClick={() => onAsk(q)}
            className="shrink-0 rounded-full border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-xs text-purple-300 font-medium active:scale-95 transition">
            {q}
          </button>
        ))}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center gap-8 px-8 py-5 bg-black border-t border-white/5">
        <div className="w-14" />
        <button onClick={onCapture}
          className="h-20 w-20 rounded-full border-4 border-white active:scale-90 transition shadow-[0_0_20px_rgba(139,92,246,0.4)]"
          style={{ background: "linear-gradient(135deg,#8B5CF6,#6D28D9)" }}>
          <Eye className="h-7 w-7 text-white mx-auto" />
        </button>
        <button onClick={onClose}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 active:scale-90 transition">
          <X className="h-5 w-5 text-white/70" />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   LANGUAGE MODAL
══════════════════════════════════════════════════════ */
function LangModal({ current, onSelect, onClose }: {
  current: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl border-t border-white/10 bg-[#0d0d1a]/96 backdrop-blur-2xl p-5 pb-8"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-purple-400" />
          <h3 className="font-semibold text-white text-sm">✦ Language</h3>
        </div>
        <div className="space-y-2">
          {LANG_PROFILES.map(l => (
            <button key={l.id} onClick={() => { onSelect(l.id); onClose(); }}
              className={cn("flex w-full items-center gap-3 rounded-2xl border px-4 py-3 transition active:scale-[0.99]",
                current === l.id ? "border-purple-500/40 bg-purple-500/10" : "border-white/8 bg-white/5")}>
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold",
                current === l.id ? "bg-purple-600 text-white" : "bg-white/10 text-white/55")}>
                {l.flag}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-white">{l.label}</p>
                {l.id === "auto" && <p className="text-[11px] text-white/35">Detect language automatically</p>}
              </div>
              {current === l.id && <Check className="h-4 w-4 text-purple-400 shrink-0" />}
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/25">
          Vyom AI replies in the same language or mixed style you use.
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SETTINGS MODAL
══════════════════════════════════════════════════════ */
function SettingsModal({ settings, onUpdate, onClose, voices }: {
  settings: ReturnType<typeof useVoiceMode>["settings"];
  onUpdate: (p: Partial<typeof settings>) => void;
  onClose: () => void;
  voices: SpeechSynthesisVoice[];
}) {
  const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
    <button onClick={onChange}
      className={cn("relative flex h-6 w-11 items-center rounded-full border-2 transition-all",
        on ? "bg-violet-600 border-violet-500" : "bg-white/10 border-white/20")}>
      <span className={cn("absolute h-4 w-4 rounded-full bg-white shadow transition-transform",
        on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl border-t border-white/10 bg-[#0d0d1a]/96 backdrop-blur-2xl p-5 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-purple-400" />
            <h3 className="font-semibold text-white text-sm">✦ Voice Settings</h3>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-white/40" /></button>
        </div>

        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">General</p>
        <div className="space-y-2 mb-5">
          {([
            { key: "autoSpeak",        label: "Auto Speak",             sub: "Vyom speaks the responses" },
            { key: "streamingTTS",     label: "Streaming Speech",       sub: "Speak as words arrive (lower latency)" },
            { key: "continuous",       label: "Continuous Mode",        sub: "Auto-listen after speaking (350ms pause)" },
            { key: "interruptOnSpeak", label: "Barge-in Support",       sub: "Speaking cancels AI immediately" },
            { key: "noiseReduction",   label: "Noise Reduction",        sub: "Filter background noise" },
          ] as const).map(({ key, label, sub }) => (
            <div key={key}
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-[11px] text-white/40">{sub}</p>
              </div>
              <Toggle on={(settings as any)[key]} onChange={() => onUpdate({ [key]: !(settings as any)[key] } as any)} />
            </div>
          ))}
        </div>

        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Voice</p>
        <div className="space-y-2 mb-5">
          {voices.length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <p className="text-[11px] text-white/40 mb-1.5">Voice</p>
              <select value={settings.voiceURI} onChange={e => onUpdate({ voiceURI: e.target.value })}
                className="w-full bg-transparent text-sm text-white focus:outline-none">
                <option value="">Default</option>
                {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
          )}
          {([
            { key: "rate",   label: "Speech Speed", min: 0.5, max: 2,  step: 0.05, fmt: (v: number) => `${v.toFixed(2)}×` },
            { key: "pitch",  label: "Pitch",        min: 0.5, max: 2,  step: 0.05, fmt: (v: number) => v.toFixed(2) },
            { key: "volume", label: "Volume",       min: 0,   max: 1,  step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
          ] as const).map(({ key, label, min, max, step, fmt }) => (
            <div key={key} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="flex justify-between mb-2">
                <p className="text-sm text-white">{label}</p>
                <p className="text-sm text-purple-300 font-medium">{fmt((settings as any)[key])}</p>
              </div>
              <input type="range" min={min} max={max} step={step} value={(settings as any)[key]}
                onChange={e => onUpdate({ [key]: parseFloat(e.target.value) } as any)}
                className="w-full accent-purple-500 h-1.5 cursor-pointer" />
            </div>
          ))}
        </div>

        <button onClick={onClose}
          className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 py-3 text-sm font-semibold text-white active:scale-[0.99] transition">
          Done
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   QUICK ACTIONS STRIP (contextual)
══════════════════════════════════════════════════════ */
function QuickActionsStrip({ onAction, hasVision }: {
  onAction: (id: string) => void;
  hasVision: boolean;
}) {
  const actions = hasVision
    ? QUICK_ACTIONS
    : QUICK_ACTIONS.filter(a => a.id !== "analyze");

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-5 pb-1 animate-fade-in">
      {actions.map(a => (
        <button key={a.id} onClick={() => onAction(a.id)}
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-[11px] font-medium text-purple-300 active:scale-95 transition hover:bg-purple-500/20 whitespace-nowrap">
          <span>{a.icon}</span>{a.label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN VOICE PAGE
══════════════════════════════════════════════════════ */
const Voice = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const getToken = useCallback(() => user!.getIdToken(true), [user]);
  const voice    = useVoiceMode(getToken);

  const [showLang,     setShowLang]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCamera,   setShowCamera]   = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);
  const [typeInput,    setTypeInput]    = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const cfg = ORB_PHASES[voice.phase];
  const mm  = String(Math.floor(voice.screenTime / 60)).padStart(2, "0");
  const ss  = String(voice.screenTime % 60).padStart(2, "0");

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voice.messages, voice.streamingText]);

  const handleOrbTap = () => {
    switch (voice.phase) {
      case "idle":
      case "error":     voice.start();     break;
      case "listening": voice.mute();      break;
      case "muted":     voice.unmute();    break;
      default:          voice.interrupt(); break;
    }
  };

  const handleEnd = () => { voice.stop(); voice.stopScreenShare(); navigate(-1); };

  const handleSend = () => {
    if (!typeInput.trim() && !pendingImage) return;
    voice.sendText(typeInput.trim() || "What is in this image?", pendingImage ?? undefined);
    setTypeInput(""); setPendingImage(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const raw = await fileToDataUrl(f);
    const compressed = await compressImage(raw, 1024, 0.85);
    setPendingImage(compressed);
    e.target.value = "";
  };

  const micBtnStyle = {
    background:
      voice.phase === "listening"  ? "linear-gradient(135deg,#8B5CF6,#06B6D4)" :
      voice.phase === "speaking"   ? "linear-gradient(135deg,#EC4899,#8B5CF6)" :
      voice.phase === "muted"      ? "linear-gradient(135deg,#374151,#1F2937)" :
      voice.phase === "error"      ? "linear-gradient(135deg,#EF4444,#7C2D12)" :
      voice.phase === "vision"     ? "linear-gradient(135deg,#10B981,#3B82F6)" :
      voice.phase === "screenshare"? "linear-gradient(135deg,#06B6D4,#7C3AED)" :
                                     "linear-gradient(135deg,#8B5CF6,#6D28D9)",
    boxShadow: (["listening","speaking","vision","screenshare"].includes(voice.phase))
      ? `0 0 28px ${cfg.glowColor}, 0 0 55px ${cfg.color2}30`
      : "0 4px 20px rgba(109,40,217,0.4)",
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#080810] overflow-hidden">
      {/* Ambient bg */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-[130px] transition-all duration-1000"
          style={{ background: `radial-gradient(circle, ${cfg.color1}, ${cfg.color2}, transparent 70%)` }} />
        <div className="absolute inset-0 opacity-[0.02]"
          style={{ backgroundImage: "linear-gradient(rgba(139,92,246,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,.5) 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5 pb-2">
        <button onClick={handleEnd}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition">
          <X className="h-4 w-4 text-white/80" />
        </button>
        <div className="text-center">
          <p className="text-[13px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">
            Vyom AI
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse transition-all duration-700"
              style={{ background: cfg.dotColor }} />
            <span className="text-[11px] text-white/35">Voice Mode</span>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition">
          <Settings className="h-4 w-4 text-white/80" />
        </button>
      </header>

      {/* ── Language strip ── */}
      <div className="relative z-10 mx-5 mb-2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-sm px-3 py-2 overflow-x-auto scrollbar-hide">
          <button onClick={() => setShowLang(true)}
            className="flex shrink-0 items-center gap-1 pr-2 border-r border-white/10 text-[11px] text-white/50 font-medium">
            <Globe className="h-3 w-3" />
            {LANG_PROFILES.find(l => l.id === voice.settings.lang)?.label ?? "Auto"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {LANG_PROFILES.filter(l => l.id !== "auto").map(l => (
            <button key={l.id} onClick={() => voice.updateSettings({ lang: l.id as any })}
              className={cn("shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition",
                voice.settings.lang === l.id ? "bg-purple-600 text-white" : "text-white/35 hover:text-white/60")}>
              {l.flag === "🌐" ? "AUTO" : l.flag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Screen share / vision banners ── */}
      {voice.screenActive && (
        <div className="relative z-10 mx-5 mb-2 flex items-center justify-between rounded-2xl border border-cyan-500/30 bg-cyan-500/8 px-4 py-2.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-cyan-300 font-medium">Sharing screen</span>
            <span className="font-mono text-xs text-cyan-400">{mm}:{ss}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => voice.captureAndAsk()}
              className="rounded-xl bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 text-[11px] text-cyan-300 font-medium active:scale-95 transition">
              Analyze
            </button>
            <button onClick={voice.stopScreenShare}
              className="rounded-xl bg-red-500/20 border border-red-500/30 px-2.5 py-1 text-[11px] text-red-400 font-medium active:scale-95 transition">
              Stop
            </button>
          </div>
        </div>
      )}
      {voice.cameraActive && !voice.screenActive && (
        <div className="relative z-10 mx-5 mb-2 flex items-center justify-between rounded-2xl border border-green-500/30 bg-green-500/8 px-4 py-2.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-300 font-medium">Live Camera Active</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => voice.captureFromCamera()}
              className="rounded-xl bg-green-500/20 border border-green-500/30 px-2.5 py-1 text-[11px] text-green-300 font-medium active:scale-95 transition">
              Capture
            </button>
            <button onClick={voice.stopCamera}
              className="rounded-xl bg-red-500/20 border border-red-500/30 px-2.5 py-1 text-[11px] text-red-400 font-medium active:scale-95 transition">
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Vision context memory indicator */}
      {voice.hasVisionContext && !voice.cameraActive && !voice.screenActive && (
        <div className="relative z-10 mx-5 mb-2 flex items-center justify-between rounded-2xl border border-violet-500/25 bg-violet-500/8 px-4 py-2">
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-violet-400" />
            <span className="text-[11px] text-violet-300">Visual context remembered</span>
          </div>
          <button onClick={voice.clearVisionContext}
            className="text-[11px] text-white/30 hover:text-white/60 transition">Clear</button>
        </div>
      )}

      {/* ── Orb ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2">
        <VoiceOrb phase={voice.phase} amplitude={voice.amplitude} onTap={handleOrbTap} />

        {/* Status */}
        <div className="flex flex-col items-center gap-1 -mt-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full animate-pulse transition-all duration-700"
              style={{ background: cfg.dotColor }} />
            <span className="text-[14px] font-semibold text-white">{cfg.label}</span>
          </div>
          <p className="text-[11px] text-white/30">{cfg.subLabel}</p>
          {voice.partialText && (
            <p className="mt-0.5 max-w-[260px] text-center text-xs text-white/40 italic animate-fade-in">
              "{voice.partialText}"
            </p>
          )}
          {voice.error && (
            <p className="mt-0.5 max-w-[260px] text-center text-xs text-red-400 animate-fade-in">
              {voice.error}
            </p>
          )}
        </div>

        {/* Waveform */}
        <div className="flex justify-center w-full px-10">
          <AudioWaveform
            amplitude={voice.amplitude}
            active={voice.phase === "listening"}
            color1={cfg.color1}
            color2={cfg.color2}
          />
        </div>

        {/* Streaming response */}
        {voice.streamingText && (
          <div className="mx-6 max-h-24 overflow-y-auto rounded-2xl border border-purple-500/20 bg-purple-500/8 px-4 py-3 text-sm text-white/80 text-center animate-fade-in">
            {voice.streamingText}
            <span className="inline-block w-0.5 h-3.5 bg-purple-400 ml-0.5 align-middle animate-pulse" />
          </div>
        )}

        {/* Pending image */}
        {pendingImage && (
          <div className="relative mx-5 animate-fade-in">
            <img src={pendingImage} alt="" className="h-20 w-32 rounded-2xl object-cover border border-white/20" />
            <button onClick={() => setPendingImage(null)}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shadow-lg">
              ✕
            </button>
          </div>
        )}

        {/* Quick actions */}
        {voice.showQuickActions && (
          <QuickActionsStrip
            onAction={id => voice.triggerQuickAction(id as any)}
            hasVision={voice.hasVisionContext}
          />
        )}
        {!voice.showQuickActions && (
          <div className="flex justify-center">
            <button onClick={() => voice.triggerQuickAction("summarize")}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/35 active:scale-95 transition">
              <Zap className="h-3 w-3" /> Quick Actions
            </button>
          </div>
        )}
      </div>

      {/* ── Type input ── */}
      <div className="relative z-10 mx-5 mb-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-3.5 py-2.5">
          <input
            value={typeInput}
            onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
            placeholder={
              voice.screenActive  ? "Ask about your screen..." :
              voice.cameraActive  ? "Ask about what you see..." :
              voice.hasVisionContext ? "Follow up on the image..." :
              "Type a message..."
            }
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none"
          />
          {(typeInput.trim() || pendingImage) && (
            <button onClick={handleSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 active:scale-90 transition shadow">
              <Send className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className="relative z-10 px-6 pb-8">
        <div className="flex items-end justify-around">

          {/* Camera */}
          <button
            onClick={() => voice.cameraActive ? voice.stopCamera() : setShowCamera(true)}
            className="flex flex-col items-center gap-1.5">
            <div className={cn(
              "flex h-14 w-14 items-center justify-center rounded-[18px] border backdrop-blur-sm active:scale-95 transition",
              voice.cameraActive ? "border-green-500/40 bg-green-500/15" : "border-white/10 bg-white/8"
            )}>
              <Camera className={cn("h-5 w-5", voice.cameraActive ? "text-green-400" : "text-white/65")} />
            </div>
            <span className={cn("text-[10px]", voice.cameraActive ? "text-green-400" : "text-white/35")}>
              {voice.cameraActive ? "Stop" : "Camera"}
            </span>
          </button>

          {/* Screen Share */}
          <button
            onClick={() => voice.screenActive ? voice.stopScreenShare() : voice.startScreenShareMode()}
            className="flex flex-col items-center gap-1.5">
            <div className={cn(
              "flex h-14 w-14 items-center justify-center rounded-[18px] border backdrop-blur-sm active:scale-95 transition",
              voice.screenActive ? "border-cyan-500/40 bg-cyan-500/15" : "border-white/10 bg-white/8"
            )}>
              {voice.screenActive
                ? <StopCircle className="h-5 w-5 text-cyan-400" />
                : <Monitor   className="h-5 w-5 text-white/65" />}
            </div>
            <span className={cn("text-[10px]", voice.screenActive ? "text-cyan-400" : "text-white/35")}>
              {voice.screenActive ? "Stop" : "Screen"}
            </span>
          </button>

          {/* Centre mic */}
          <button onClick={handleOrbTap} className="flex flex-col items-center gap-1.5">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full active:scale-95 transition"
              style={micBtnStyle}>
              {voice.phase === "muted"
                ? <MicOff    className="h-7 w-7 text-white" />
                : voice.phase === "speaking"
                ? <Volume2   className="h-7 w-7 text-white" />
                : (voice.phase === "thinking" || voice.phase === "processing")
                ? <RefreshCw className="h-6 w-6 text-white animate-spin" />
                : voice.phase === "error"
                ? <RefreshCw className="h-6 w-6 text-white" />
                : voice.phase === "vision"
                ? <Eye       className="h-7 w-7 text-white" />
                : <Mic       className="h-7 w-7 text-white" />}
            </div>
          </button>

          {/* Gallery */}
          <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/10 bg-white/8 backdrop-blur-sm active:scale-95 transition">
              <ImageIcon className="h-5 w-5 text-white/65" />
            </div>
            <span className="text-[10px] text-white/35">Gallery</span>
          </button>

          {/* End */}
          <button onClick={handleEnd} className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-red-500/25 bg-red-500/10 active:scale-95 transition">
              <PhoneOff className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-[10px] text-red-400/60">End</span>
          </button>
        </div>

        {/* History toggle */}
        {voice.messages.length > 0 && (
          <button onClick={() => setShowHistory(h => !h)}
            className="flex w-full items-center justify-center gap-1 mt-4 text-[11px] text-white/22 active:text-white/50 transition">
            <ChevronDown className={cn("h-3 w-3 transition-transform", showHistory && "rotate-180")} />
            {voice.messages.length} message{voice.messages.length !== 1 ? "s" : ""}
            <ChevronDown className={cn("h-3 w-3 transition-transform", showHistory && "rotate-180")} />
          </button>
        )}
      </div>

      {/* ── History drawer ── */}
      {showHistory && (
        <div className="relative z-10 mx-4 mb-4 max-h-64 overflow-y-auto rounded-3xl border border-white/8 bg-white/5 backdrop-blur-xl p-4 space-y-2.5 animate-fade-in">
          {voice.messages.map(m => (
            <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.image && (
                <img src={m.image} alt="" className="h-10 w-14 rounded-xl object-cover border border-white/10 shrink-0" />
              )}
              <div className={cn(
                "max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                m.role === "user"
                  ? "bg-purple-600/25 text-white/85 rounded-br-sm"
                  : "bg-white/8 text-white/65 rounded-bl-sm"
              )}>
                {m.text}
              </div>
            </div>
          ))}
          {voice.streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-white/8 px-3 py-2 text-xs text-white/65">
                {voice.streamingText}
                <span className="inline-block w-0.5 h-3 bg-white/40 ml-0.5 animate-pulse" />
              </div>
            </div>
          )}
          <div ref={historyEndRef} />
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {/* Live camera overlay */}
      {showCamera && (
        <LiveCameraView
          onCapture={() => { voice.captureFromCamera("What do you see in this image?"); setShowCamera(false); }}
          onAsk={(text) => { voice.captureFromCamera(text); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
          onSwitch={() => voice.switchCameraFacing()}
        />
      )}

      {/* Modals */}
      {showLang && (
        <LangModal
          current={voice.settings.lang}
          onSelect={id => voice.updateSettings({ lang: id as any })}
          onClose={() => setShowLang(false)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={voice.settings}
          onUpdate={voice.updateSettings}
          onClose={() => setShowSettings(false)}
          voices={voice.availableVoices}
        />
      )}
    </div>
  );
};

export default Voice;
