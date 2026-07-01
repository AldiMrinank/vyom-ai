/**
 * orbAnimations.ts
 * Defines visual config for every orb state.
 * Used by VoiceOrb component for GPU-composited animations.
 */

export type OrbPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error"
  | "processing"
  | "vision"
  | "screenshare";

export interface OrbConfig {
  label: string;
  subLabel: string;
  color1: string;
  color2: string;
  glowColor: string;
  dotColor: string;
  ringCount: number;
  ringSpeed: string;    // CSS animation-duration
  pulseIntensity: number; // 0–1 multiplier for amplitude scaling
  particleType: "none" | "orbit" | "energy" | "stars" | "confetti" | "scan" | "grid";
}

export const ORB_PHASES: Record<OrbPhase, OrbConfig> = {
  idle: {
    label: "Tap to start",
    subLabel: "Speak now, I'm listening",
    color1: "#7C3AED", color2: "#3B82F6",
    glowColor: "#8B5CF655", dotColor: "#a78bfa",
    ringCount: 0, ringSpeed: "3s",
    pulseIntensity: 0,
    particleType: "none",
  },
  listening: {
    label: "Listening...",
    subLabel: "Speak now, I'm listening",
    color1: "#8B5CF6", color2: "#06B6D4",
    glowColor: "#22D3EE55", dotColor: "#22d3ee",
    ringCount: 3, ringSpeed: "2s",
    pulseIntensity: 0.5,
    particleType: "energy",
  },
  thinking: {
    label: "Thinking...",
    subLabel: "Let me think...",
    color1: "#3B82F6", color2: "#1D4ED8",
    glowColor: "#3B82F655", dotColor: "#60a5fa",
    ringCount: 1, ringSpeed: "4s",
    pulseIntensity: 0.1,
    particleType: "orbit",
  },
  speaking: {
    label: "Speaking",
    subLabel: "Here's what I found ✨",
    color1: "#EC4899", color2: "#8B5CF6",
    glowColor: "#EC489955", dotColor: "#f472b6",
    ringCount: 3, ringSpeed: "1.2s",
    pulseIntensity: 1.0,
    particleType: "stars",
  },
  muted: {
    label: "Muted",
    subLabel: "Tap to unmute",
    color1: "#374151", color2: "#1F2937",
    glowColor: "#37415133", dotColor: "#6B7280",
    ringCount: 0, ringSpeed: "3s",
    pulseIntensity: 0,
    particleType: "none",
  },
  error: {
    label: "Error",
    subLabel: "Tap to retry",
    color1: "#EF4444", color2: "#7C2D12",
    glowColor: "#EF444455", dotColor: "#f87171",
    ringCount: 0, ringSpeed: "3s",
    pulseIntensity: 0,
    particleType: "none",
  },
  processing: {
    label: "Processing...",
    subLabel: "Working on it ⚡",
    color1: "#22D3EE", color2: "#3B82F6",
    glowColor: "#22D3EE55", dotColor: "#22d3ee",
    ringCount: 2, ringSpeed: "1.8s",
    pulseIntensity: 0.3,
    particleType: "energy",
  },
  vision: {
    label: "Analyzing...",
    subLabel: "Looking at your image 👁",
    color1: "#10B981", color2: "#3B82F6",
    glowColor: "#10B98155", dotColor: "#34d399",
    ringCount: 2, ringSpeed: "2.5s",
    pulseIntensity: 0.2,
    particleType: "scan",
  },
  screenshare: {
    label: "Screen Sharing",
    subLabel: "Ask me about your screen 🖥",
    color1: "#06B6D4", color2: "#7C3AED",
    glowColor: "#06B6D455", dotColor: "#22d3ee",
    ringCount: 2, ringSpeed: "2s",
    pulseIntensity: 0.15,
    particleType: "grid",
  },
};
