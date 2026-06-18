interface WaveformProps {
  side: "left" | "right";
  amp: number;
  speed: number;
  color: string;
  bars?: number;
}

const Waveform = ({ side, amp, speed, color, bars = 7 }: WaveformProps) => {
  return (
    <div className="flex items-center gap-[3px] h-16" style={{ direction: side === "left" ? "rtl" : "ltr" }}>
      {Array.from({ length: bars }).map((_, i) => {
        const base = 6 + ((i % 4) * 5);
        const dur = (0.5 + (i % 3) * 0.15) / speed;
        return (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              background: color,
              height: `${base}px`,
              // Animating opacity is compositor-only (no repaint). Filters
              // like brightness() force a fresh raster pass per element per
              // frame, which gets expensive with this many bars animating
              // at once on mid-range mobile GPUs — opacity gives a similar
              // "brighter when louder" feel at a fraction of the cost.
              opacity: 0.45 + amp * 0.45,
              animation: `waveBar ${dur}s ease-in-out infinite`,
              animationDelay: `${i * 0.07}s`,
              transformOrigin: "center",
              boxShadow: `0 0 6px ${color}55`,
              // Promote to its own GPU layer up front so the browser composites
              // the transform/opacity animation instead of repainting on every tick.
              willChange: "transform, opacity",
              transform: "translateZ(0)",
            }}
          />
        );
      })}
    </div>
  );
};

export default Waveform;
