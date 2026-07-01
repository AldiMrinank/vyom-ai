import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Settings, Camera, Monitor, Image as ImageIcon, PhoneOff,
  ChevronDown, Send, Check, Volume2, RefreshCw, Globe,
  Mic, MicOff, Eye, StopCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceMode } from "@/hooks/useVoiceMode";
import { ORB_PHASES, type OrbPhase } from "@/voice/orbAnimations";
import { LANG_PROFILES } from "@/voice/languageDetector";
import { openCamera, captureFrame, stopStream, fileToDataUrl, compressImage } from "@/voice/cameraManager";
import { getVoices } from "@/voice/speechSynthesis";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════
   AUDIO-REACTIVE ORB
════════════════════════════════════════════════════ */
function VoiceOrb({ phase, amplitude, onTap }: {
  phase: OrbPhase; amplitude: number; onTap: () => void;
}) {
  const cfg = ORB_PHASES[phase];
  const rafRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);

  // Draw audio-reactive waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const SIZE = 260;
    canvas.width = SIZE; canvas.height = SIZE;
    const cx = SIZE / 2, cy = SIZE / 2, r = 90;

    const draw = (ts: number) => {
      timeRef.current = ts;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Outer glow rings
      const ringCount = cfg.ringCount;
      for (let i = 0; i < ringCount; i++) {
        const prog = ((ts / (parseFloat(cfg.ringSpeed) * 1000) + i / ringCount) % 1);
        const ringR = r + 10 + prog * 50;
        const alpha = (1 - prog) * 0.35;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `${cfg.color1}${Math.floor(alpha * 255).toString(16).padStart(2,"0")}`;
        ctx.lineWidth = 2 - prog * 1.5;
        ctx.stroke();
      }

      // Audio-reactive waveform ring
      const bars = 60;
      const amp = amplitude * cfg.pulseIntensity;
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const wave  = amp * (12 + 8 * Math.sin(ts / 150 + i * 0.4));
        const x1 = cx + Math.cos(angle) * r;
        const y1 = cy + Math.sin(angle) * r;
        const x2 = cx + Math.cos(angle) * (r + wave + 4);
        const y2 = cy + Math.sin(angle) * (r + wave + 4);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 2 === 0 ? cfg.color1 + "cc" : cfg.color2 + "99";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Particles
      drawParticles(ctx, cfg.particleType, cx, cy, ts, cfg.color1, cfg.color2);

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, amplitude, cfg]);

  function drawParticles(
    ctx: CanvasRenderingContext2D,
    type: OrbPhase extends never ? never : string,
    cx: number, cy: number, ts: number,
    c1: string, c2: string
  ) {
    if (type === "orbit") {
      for (let i = 0; i < 5; i++) {
        const angle = (ts / 3000 + i / 5) * Math.PI * 2;
        const x = cx + Math.cos(angle) * 108;
        const y = cy + Math.sin(angle) * 108;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = c1 + "cc";
        ctx.fill();
      }
    } else if (type === "energy") {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const pulse = 0.5 + 0.5 * Math.sin(ts / 400 + i * 0.9);
        const d = 100 + pulse * 10;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * d, cy + Math.sin(angle) * d, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = c2 + "bb";
        ctx.fill();
      }
    } else if (type === "stars") {
      for (let i = 0; i < 6; i++) {
        const x = cx - 60 + (i % 3) * 60 + Math.sin(ts / 800 + i) * 12;
        const y = cy - 80 + Math.floor(i / 3) * 160 + Math.cos(ts / 600 + i) * 10;
        const s = 0.5 + 0.5 * Math.sin(ts / 500 + i);
        ctx.fillStyle = `rgba(255,255,255,${s * 0.8})`;
        ctx.font = `${8 + s * 4}px sans-serif`;
        ctx.fillText("✦", x, y);
      }
    } else if (type === "scan") {
      // Horizontal scan line
      const scanY = cy - 80 + ((ts / 1500) % 1) * 160;
      const grad = ctx.createLinearGradient(cx - 80, scanY, cx + 80, scanY);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.5, c1 + "99");
      grad.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.moveTo(cx - 80, scanY);
      ctx.lineTo(cx + 80, scanY);
      ctx.strokeStyle = grad as any;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (type === "grid") {
      // Subtle grid inside orb
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 88, 0, Math.PI * 2);
      ctx.clip();
      const pulse = 0.5 + 0.5 * Math.sin(ts / 1000);
      ctx.strokeStyle = c1 + Math.floor(pulse * 40).toString(16).padStart(2, "0");
      ctx.lineWidth = 0.5;
      for (let gx = cx - 90; gx < cx + 90; gx += 18) {
        ctx.beginPath(); ctx.moveTo(gx, cy - 90); ctx.lineTo(gx, cy + 90); ctx.stroke();
      }
      for (let gy = cy - 90; gy < cy + 90; gy += 18) {
        ctx.beginPath(); ctx.moveTo(cx - 90, gy); ctx.lineTo(cx + 90, gy); ctx.stroke();
      }
      ctx.restore();
    }
  }

  const faceScale = 1 + amplitude * cfg.pulseIntensity * 0.08;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 300, height: 300 }}>
      {/* Outer blur glow */}
      <div className="absolute inset-0 rounded-full opacity-25 blur-3xl transition-all duration-700"
        style={{ background: `radial-gradient(circle, ${cfg.color1}, ${cfg.color2}, transparent 70%)` }} />

      {/* Canvas for rings/waveform/particles */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none"
        style={{ width: 300, height: 300 }} />

      {/* Orb body */}
      <button
        onClick={onTap}
        className="relative rounded-full active:scale-95 transition-transform duration-100"
        style={{
          width: 200, height: 200,
          transform: `scale(${faceScale})`,
          background: `radial-gradient(circle at 35% 30%, ${cfg.color1}dd, ${cfg.color2}ff 55%, #0a0a14 100%)`,
          boxShadow: `0 0 50px ${cfg.glowColor}, 0 0 90px ${cfg.color2}33, inset 0 0 35px rgba(255,255,255,0.09)`,
          transition: "background 0.8s ease, box-shadow 0.8s ease, transform 0.08s ease-out",
          willChange: "transform",
        }}>
        {/* Shine */}
        <div className="absolute inset-[3px] rounded-full"
          style={{ background: "radial-gradient(circle at 38% 22%, rgba(255,255,255,0.3), transparent 55%)" }} />

        {/* Face */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none">
          {/* Eyes */}
          <div className="flex items-center gap-5">
            {phase === "muted" && <>
              <span className="w-3 h-3 rounded-full bg-white/35" />
              <span className="w-3 h-3 rounded-full bg-white/35" />
            </>}
            {phase === "error" && <>
              <span className="text-white/80 text-lg font-bold">✕</span>
              <span className="text-white/80 text-lg font-bold">✕</span>
            </>}
            {phase === "vision" && <>
              <Eye className="h-4 w-4 text-white" style={{ filter: "drop-shadow(0 0 6px #34d399)" }} />
              <Eye className="h-4 w-4 text-white" style={{ filter: "drop-shadow(0 0 6px #34d399)" }} />
            </>}
            {phase === "screenshare" && <>
              <Monitor className="h-4 w-4 text-white" style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }} />
              <Monitor className="h-4 w-4 text-white" style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }} />
            </>}
            {!["muted","error","vision","screenshare"].includes(phase) && <>
              <span className="w-2.5 rounded-full bg-white transition-transform duration-150"
                style={{ height: 11, boxShadow: "0 0 8px rgba(255,255,255,0.9)" }} />
              <span className="w-2.5 rounded-full bg-white transition-transform duration-150"
                style={{ height: 11, boxShadow: "0 0 8px rgba(255,255,255,0.9)" }} />
            </>}
          </div>

          {/* Mouth */}
          {phase === "speaking" && <div className="w-8 h-3 border-b-[3px] border-white rounded-full" style={{ boxShadow: "0 2px 8px rgba(255,255,255,0.4)" }} />}
          {phase === "listening" && <div className="w-6 h-2 border-b-[2.5px] border-white/70 rounded-full" />}
          {phase === "thinking" && <div className="w-3.5 h-3.5 rounded-full border-2 border-white/70" />}
          {phase === "processing" && <div className="w-5 h-5 rounded-full border-2 border-t-transparent border-white animate-spin" />}
          {(phase === "idle" || phase === "muted") && <div className="w-7 h-[2px] bg-white/50 rounded-full" />}
          {phase === "vision" && <span className="text-white/80 text-xs">👁</span>}
          {phase === "screenshare" && <span className="text-white/80 text-[10px]">🖥</span>}
          {phase === "error" && <div className="w-5 h-2.5 border-b-2 border-white/70 rounded-full" style={{ transform: "rotate(180deg)" }} />}
        </div>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   BOTTOM WAVEFORM
════════════════════════════════════════════════════ */
function BottomWaveform({ amplitude, active, color }: { amplitude: number; active: boolean; color: string }) {
  const bars = 28;
  const frameRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let t = 0;
    const draw = () => {
      t += 0.05;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const W = canvas.width, H = canvas.height;
      for (let i = 0; i < bars; i++) {
        const x    = (i / (bars - 1)) * W;
        const wave = active ? amplitude * (0.5 + 0.5 * Math.sin(t + i * 0.5)) : 0.08;
        const h    = Math.max(3, wave * (H * 0.85));
        const alpha = active ? 0.5 + wave * 0.5 : 0.15;
        ctx.fillStyle = color + Math.floor(alpha * 255).toString(16).padStart(2,"0");
        ctx.beginPath();
        ctx.roundRect(x - 1.5, (H - h) / 2, 3, h, 2);
        ctx.fill();
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [amplitude, active, color, bars]);

  return <canvas ref={canvasRef} width={280} height={32} className="w-full max-w-xs" />;
}

/* ════════════════════════════════════════════════════
   CAMERA MODAL (Live Vision Mode)
════════════════════════════════════════════════════ */
function CameraModal({ onCapture, onClose }: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [stream, setStream]       = useState<MediaStream | null>(null);
  const [facing, setFacing]       = useState<"user" | "environment">("environment");
  const [preview, setPreview]     = useState<string | null>(null);
  const [liveMode, setLiveMode]   = useState(false);
  const liveIntervalRef           = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let s: MediaStream | null = null;
    openCamera(facing).then(st => {
      s = st; setStream(st);
      if (videoRef.current) videoRef.current.srcObject = st;
    }).catch(() => onClose());
    return () => { stopStream(s); if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, [facing]);

  const capture = () => {
    if (!videoRef.current) return;
    const { dataUrl } = captureFrame(videoRef.current);
    setPreview(dataUrl);
  };

  const confirm = async () => {
    if (!preview) return;
    const c = await compressImage(preview, 1024, 0.85);
    onCapture(c);
    onClose();
  };

  const toggleLive = () => {
    if (liveMode) {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
      setLiveMode(false);
    } else {
      setLiveMode(true);
      liveIntervalRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        const { dataUrl } = captureFrame(videoRef.current);
        const c = await compressImage(dataUrl, 800, 0.75);
        onCapture(c);
      }, 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <button onClick={onClose} className="h-10 w-10 flex items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5 text-white" /></button>
        <div className="flex items-center gap-1.5 text-white text-sm font-semibold"><span className="text-purple-400">✦</span> Camera</div>
        <button onClick={toggleLive}
          className={cn("h-10 px-3 rounded-full text-[11px] font-semibold transition", liveMode ? "bg-green-500/20 border border-green-500/40 text-green-400" : "bg-white/10 text-white/60")}>
          {liveMode ? "● Live" : "Live"}
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {liveMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-green-500/20 border border-green-500/40 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[11px] text-green-400 font-medium">Live Vision — sending to AI every 5s</span>
          </div>
        )}
        {preview && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-5">
            <img src={preview} alt="preview" className="max-h-[75%] max-w-full rounded-2xl object-contain border border-white/20" />
            <div className="flex gap-4">
              <button onClick={() => setPreview(null)} className="rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-white text-sm font-medium active:scale-95 transition">Retake</button>
              <button onClick={confirm} className="rounded-2xl bg-gradient-to-r from-purple-600 to-violet-700 px-6 py-3 text-white text-sm font-semibold active:scale-95 transition flex items-center gap-2">
                <span>Share with Vyom AI</span><span className="text-purple-200">✦</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-around px-8 py-5 bg-black border-t border-white/5">
        <button onClick={() => setFacing(f => f === "environment" ? "user" : "environment")}
          className="flex flex-col items-center gap-1">
          <div className="h-12 w-12 flex items-center justify-center rounded-full bg-white/10 active:scale-90 transition">
            <Camera className="h-5 w-5 text-white/70" />
          </div>
          <span className="text-[10px] text-white/40">Switch</span>
        </button>
        <button onClick={capture}
          className="h-20 w-20 rounded-full border-4 border-white bg-white active:scale-90 transition shadow-lg" />
        <button onClick={onClose}
          className="flex flex-col items-center gap-1">
          <div className="h-12 w-12 flex items-center justify-center rounded-full bg-white/10 active:scale-90 transition">
            <X className="h-5 w-5 text-white/70" />
          </div>
          <span className="text-[10px] text-white/40">Close</span>
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   LANGUAGE MODAL
════════════════════════════════════════════════════ */
function LangModal({ current, onSelect, onClose }: { current: string; onSelect: (id: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl border-t border-white/10 bg-[#0d0d1a]/95 backdrop-blur-2xl p-5 pb-8" onClick={e => e.stopPropagation()}>
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
                current === l.id ? "bg-purple-600 text-white" : "bg-white/10 text-white/60")}>
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
        <p className="mt-4 text-center text-[11px] text-white/25">Vyom AI will reply in the same language or mixed style you use.</p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════
   SETTINGS MODAL
════════════════════════════════════════════════════ */
function SettingsModal({ settings, onUpdate, onClose }: {
  settings: ReturnType<typeof useVoiceMode>["settings"];
  onUpdate: (p: Partial<typeof settings>) => void;
  onClose: () => void;
}) {
  const voices = getVoices();
  const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={cn("relative flex h-6 w-11 items-center rounded-full border-2 transition-all", on ? "bg-violet-600 border-violet-500" : "bg-white/10 border-white/20")}>
      <span className={cn("absolute h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md mx-auto rounded-t-3xl border-t border-white/10 bg-[#0d0d1a]/95 backdrop-blur-2xl p-5 pb-8 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
            { key: "autoSpeak",        label: "Auto Speak",              sub: "Vyom speaks the responses" },
            { key: "continuous",       label: "Continuous Conversation", sub: "Auto-listen after speaking (350ms pause)" },
            { key: "interruptOnSpeak", label: "Interrupt When I Speak",  sub: "Barge-in cancels AI speech" },
            { key: "noiseReduction",   label: "Noise Reduction",         sub: "Filter background noise" },
          ] as const).map(({ key, label, sub }) => (
            <div key={key} className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div><p className="text-sm font-medium text-white">{label}</p><p className="text-[11px] text-white/40">{sub}</p></div>
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
            { key: "rate",   label: "Speech Speed", min: 0.5, max: 2,   step: 0.05, fmt: (v: number) => `${v.toFixed(2)}x` },
            { key: "pitch",  label: "Pitch",        min: 0.5, max: 2,   step: 0.05, fmt: (v: number) => v.toFixed(2) },
            { key: "volume", label: "Volume",       min: 0,   max: 1,   step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
          ] as const).map(({ key, label, min, max, step, fmt }) => (
            <div key={key} className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
              <div className="flex justify-between mb-2">
                <p className="text-sm text-white">{label}</p>
                <p className="text-sm text-purple-300">{fmt((settings as any)[key])}</p>
              </div>
              <input type="range" min={min} max={max} step={step} value={(settings as any)[key]}
                onChange={e => onUpdate({ [key]: parseFloat(e.target.value) } as any)}
                className="w-full accent-purple-500 h-1.5 rounded-full" />
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

/* ════════════════════════════════════════════════════
   MAIN VOICE PAGE
════════════════════════════════════════════════════ */
const Voice = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const getToken  = useCallback(() => user!.getIdToken(true), [user]);
  const voice     = useVoiceMode(getToken);

  const [showLang,      setShowLang]      = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showCamera,    setShowCamera]    = useState(false);
  const [showHistory,   setShowHistory]   = useState(false);
  const [typeInput,     setTypeInput]     = useState("");
  const [pendingImage,  setPendingImage]  = useState<string | null>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const historyEndRef   = useRef<HTMLDivElement>(null);

  const cfg = ORB_PHASES[voice.phase];
  const mm  = String(Math.floor(voice.screenTime / 60)).padStart(2,"0");
  const ss  = String(voice.screenTime % 60).padStart(2,"0");

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voice.messages, voice.streamingText]);

  const handleOrbTap = () => {
    switch (voice.phase) {
      case "idle":
      case "error":
        voice.start(); break;
      case "listening":
        voice.mute(); break;
      case "muted":
        voice.unmute(); break;
      case "speaking":
      case "thinking":
      case "processing":
        voice.interrupt(); break;
      default: break;
    }
  };

  const handleEnd = () => {
    voice.stop();
    voice.stopScreenShare();
    navigate(-1);
  };

  const handleSend = () => {
    if (!typeInput.trim() && !pendingImage) return;
    voice.sendText(typeInput.trim() || "What is in this image?", pendingImage ?? undefined);
    setTypeInput("");
    setPendingImage(null);
  };

  const handleGallery = () => fileInputRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const raw = await fileToDataUrl(f);
    const c = await compressImage(raw, 1024, 0.85);
    setPendingImage(c);
    e.target.value = "";
  };

  const handleScreenShare = () => {
    if (voice.screenActive) {
      voice.stopScreenShare();
    } else {
      voice.startScreenShareMode();
    }
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#080810] overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[35%] h-[550px] w-[550px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-12 blur-[120px] transition-all duration-1000"
          style={{ background: `radial-gradient(circle, ${cfg.color1}, ${cfg.color2}, transparent 70%)` }} />
        <div className="absolute inset-0 opacity-[0.022]"
          style={{ backgroundImage: "linear-gradient(rgba(139,92,246,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(139,92,246,.5) 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-5 pb-2">
        <button onClick={handleEnd} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition">
          <X className="h-4 w-4 text-white/80" />
        </button>
        <div className="text-center">
          <p className="text-[13px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Vyom AI</p>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse transition-all duration-700" style={{ background: cfg.dotColor }} />
            <span className="text-[11px] text-white/35">Voice Mode</span>
          </div>
        </div>
        <button onClick={() => setShowSettings(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 backdrop-blur-sm active:scale-95 transition">
          <Settings className="h-4 w-4 text-white/80" />
        </button>
      </header>

      {/* ── Language strip ── */}
      <div className="relative z-10 mx-5 mb-2">
        <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/5 backdrop-blur-sm px-3 py-2 overflow-x-auto scrollbar-hide">
          <button onClick={() => setShowLang(true)} className="flex shrink-0 items-center gap-1 pr-2 border-r border-white/10 text-[11px] text-white/50 font-medium">
            <Globe className="h-3 w-3" />{LANG_PROFILES.find(l => l.id === voice.settings.lang)?.label ?? "Auto"}<ChevronDown className="h-3 w-3" />
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

      {/* ── Screen share banner ── */}
      {voice.screenActive && (
        <div className="relative z-10 mx-5 mb-2 flex items-center justify-between rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-cyan-300 font-medium">Sharing screen with Vyom AI</span>
            <span className="font-mono text-xs text-cyan-400">{mm}:{ss}</span>
          </div>
          <button onClick={voice.stopScreenShare}
            className="rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-1 text-[11px] text-red-400 font-semibold active:scale-95 transition">
            Stop Sharing
          </button>
        </div>
      )}

      {/* ── Orb ── */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3">
        <VoiceOrb phase={voice.phase} amplitude={voice.amplitude} onTap={handleOrbTap} />

        {/* Status text */}
        <div className="flex flex-col items-center gap-1 -mt-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full transition-all duration-700 animate-pulse" style={{ background: cfg.dotColor }} />
            <span className="text-[14px] font-semibold text-white">{cfg.label}</span>
          </div>
          <p className="text-[11px] text-white/35">{cfg.subLabel}</p>
          {voice.partialText && (
            <p className="mt-1 max-w-[260px] text-center text-xs text-white/40 italic animate-fade-in">"{voice.partialText}"</p>
          )}
          {voice.error && (
            <p className="mt-1 max-w-[260px] text-center text-xs text-red-400 animate-fade-in">{voice.error}</p>
          )}
        </div>

        {/* Waveform */}
        <div className="flex justify-center w-full px-8">
          <BottomWaveform amplitude={voice.amplitude} active={voice.phase === "listening"} color={cfg.color1} />
        </div>

        {/* Streaming response */}
        {voice.streamingText && (
          <div className="mx-5 max-h-28 overflow-y-auto rounded-2xl border border-purple-500/20 bg-purple-500/8 px-4 py-3 text-sm text-white/80 text-center animate-fade-in">
            {voice.streamingText}
            <span className="inline-block w-0.5 h-3.5 bg-purple-400 ml-0.5 align-middle animate-pulse" />
          </div>
        )}

        {/* Pending image */}
        {pendingImage && (
          <div className="relative mx-5 animate-fade-in">
            <img src={pendingImage} alt="" className="h-20 rounded-2xl object-cover border border-white/20" />
            <button onClick={() => setPendingImage(null)}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold shadow">✕</button>
          </div>
        )}
      </div>

      {/* ── Type Input ── */}
      <div className="relative z-10 mx-5 mb-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-3.5 py-2.5">
          <input value={typeInput} onChange={e => setTypeInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
            placeholder={voice.screenActive ? "Ask anything about what you're sharing..." : "Type a message..."}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none" />
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
          <button onClick={() => setShowCamera(true)} className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/10 bg-white/8 backdrop-blur-sm active:scale-95 transition">
              <Camera className="h-5 w-5 text-white/65" />
            </div>
            <span className="text-[10px] text-white/35">Camera</span>
          </button>

          {/* Screen Share */}
          <button onClick={handleScreenShare} className="flex flex-col items-center gap-1.5">
            <div className={cn("flex h-14 w-14 items-center justify-center rounded-[18px] border backdrop-blur-sm active:scale-95 transition",
              voice.screenActive ? "border-cyan-500/40 bg-cyan-500/15" : "border-white/10 bg-white/8")}>
              {voice.screenActive ? <StopCircle className="h-5 w-5 text-cyan-400" /> : <Monitor className="h-5 w-5 text-white/65" />}
            </div>
            <span className={cn("text-[10px]", voice.screenActive ? "text-cyan-400" : "text-white/35")}>
              {voice.screenActive ? "Stop" : "Screen"}
            </span>
          </button>

          {/* Centre mic */}
          <button onClick={handleOrbTap} className="flex flex-col items-center gap-1.5">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full active:scale-95 transition shadow-2xl"
              style={{
                background: voice.phase === "listening"  ? "linear-gradient(135deg,#8B5CF6,#06B6D4)" :
                            voice.phase === "speaking"   ? "linear-gradient(135deg,#EC4899,#8B5CF6)" :
                            voice.phase === "muted"      ? "linear-gradient(135deg,#374151,#1F2937)" :
                            voice.phase === "error"      ? "linear-gradient(135deg,#EF4444,#7C2D12)" :
                                                          "linear-gradient(135deg,#8B5CF6,#6D28D9)",
                boxShadow: (voice.phase === "listening" || voice.phase === "speaking")
                  ? `0 0 28px ${cfg.glowColor}, 0 0 55px ${cfg.color2}33`
                  : "0 4px 20px rgba(109,40,217,0.4)",
              }}>
              {voice.phase === "muted"      ? <MicOff className="h-7 w-7 text-white" /> :
               voice.phase === "speaking"   ? <Volume2 className="h-7 w-7 text-white" /> :
               voice.phase === "thinking" || voice.phase === "processing"
                                            ? <RefreshCw className="h-6 w-6 text-white animate-spin" /> :
               voice.phase === "error"      ? <RefreshCw className="h-6 w-6 text-white" /> :
                                              <Mic className="h-7 w-7 text-white" />}
            </div>
          </button>

          {/* Gallery */}
          <button onClick={handleGallery} className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/10 bg-white/8 backdrop-blur-sm active:scale-95 transition">
              <ImageIcon className="h-5 w-5 text-white/65" />
            </div>
            <span className="text-[10px] text-white/35">Gallery</span>
          </button>

          {/* End */}
          <button onClick={handleEnd} className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-red-500/25 bg-red-500/12 active:scale-95 transition">
              <PhoneOff className="h-5 w-5 text-red-400" />
            </div>
            <span className="text-[10px] text-red-400/60">End</span>
          </button>
        </div>

        {/* History toggle */}
        {voice.messages.length > 0 && (
          <button onClick={() => setShowHistory(h => !h)}
            className="flex w-full items-center justify-center gap-1 mt-4 text-[11px] text-white/25 active:text-white/50 transition">
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
              {m.image && <img src={m.image} alt="" className="h-10 w-14 rounded-xl object-cover border border-white/10 shrink-0" />}
              <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                m.role === "user" ? "bg-purple-600/25 text-white/85 rounded-br-sm" : "bg-white/8 text-white/65 rounded-bl-sm")}>
                {m.text}
              </div>
            </div>
          ))}
          {voice.streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[78%] rounded-2xl rounded-bl-sm bg-white/8 px-3 py-2 text-xs text-white/65">
                {voice.streamingText}<span className="inline-block w-0.5 h-3 bg-white/40 ml-0.5 animate-pulse" />
              </div>
            </div>
          )}
          <div ref={historyEndRef} />
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {showLang     && <LangModal     current={voice.settings.lang} onSelect={id => voice.updateSettings({ lang: id as any })} onClose={() => setShowLang(false)} />}
      {showSettings && <SettingsModal settings={voice.settings} onUpdate={voice.updateSettings} onClose={() => setShowSettings(false)} />}
      {showCamera   && <CameraModal   onCapture={url => setPendingImage(url)} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default Voice;
