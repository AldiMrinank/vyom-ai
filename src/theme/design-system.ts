/**
 * Design System
 * Centralized token definitions for consistent premium UI
 */

// 8px Grid System
export const SPACING = {
  xs: '4px',    // 0.5 * 8px
  sm: '8px',    // 1 * 8px
  md: '16px',   // 2 * 8px
  lg: '24px',   // 3 * 8px
  xl: '32px',   // 4 * 8px
  xxl: '48px',  // 6 * 8px
  xxxl: '64px', // 8 * 8px
} as const;

// Gap Sizes (consistent spacing between elements)
export const GAPS = {
  small: SPACING.sm,     // 8px
  medium: SPACING.md,    // 16px
  large: SPACING.lg,     // 24px
  section: SPACING.xl,   // 32px
} as const;

// Padding (for containers and cards)
export const PADDING = {
  compact: SPACING.md,   // 16px
  default: SPACING.lg,   // 24px
  generous: SPACING.xl,  // 32px
} as const;

// Typography Scale (using Tailwind text sizes)
export const TYPOGRAPHY = {
  hero: 'text-5xl font-bold',           // 3rem / 48px
  h1: 'text-4xl font-bold',             // 2.25rem / 36px
  h2: 'text-3xl font-bold',             // 1.875rem / 30px
  h3: 'text-2xl font-semibold',         // 1.5rem / 24px
  h4: 'text-xl font-semibold',          // 1.25rem / 20px
  h5: 'text-lg font-semibold',          // 1.125rem / 18px
  body: 'text-base',                    // 1rem / 16px
  bodySmall: 'text-sm',                 // 0.875rem / 14px
  caption: 'text-xs',                   // 0.75rem / 12px
  micro: 'text-[10px]',                 // 10px
} as const;

// Line Heights for readability
export const LINE_HEIGHT = {
  tight: '1.1',     // Headlines
  normal: '1.5',    // Body text
  relaxed: '1.75',  // Lists
} as const;

// Letter Spacing
export const LETTER_SPACING = {
  tight: '-0.02em',  // Headlines
  normal: '0',       // Body
  wide: '0.05em',    // Labels
} as const;

// Glassmorphism Tokens
export const GLASS = {
  background: {
    strong: 'rgba(255, 255, 255, 0.12)',   // Main cards
    medium: 'rgba(255, 255, 255, 0.08)',   // Secondary cards
    light: 'rgba(255, 255, 255, 0.04)',    // Subtle backgrounds
  },
  border: {
    strong: '1px solid rgba(255, 255, 255, 0.15)',
    medium: '1px solid rgba(255, 255, 255, 0.12)',
    light: '1px solid rgba(255, 255, 255, 0.08)',
  },
  blur: 'backdrop-blur-xl',
  saturation: 'saturate(140%)',
} as const;

// Shadow System (less = more premium)
export const SHADOWS = {
  none: 'none',
  sm: '0 2px 8px rgba(0, 0, 0, 0.12)',
  md: '0 4px 16px rgba(0, 0, 0, 0.15)',
  lg: '0 8px 32px rgba(0, 0, 0, 0.2)',
  glow: '0 0 40px hsl(270 95% 65% / 0.45), 0 0 80px hsl(220 90% 60% / 0.25)',
  inset: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
} as const;

// Color Tokens (accent colors - use sparingly)
export const COLORS = {
  primary: 'hsl(270 95% 65%)',     // Purple/Magenta
  secondary: 'hsl(220 90% 60%)',   // Blue
  accent: 'hsl(195 100% 60%)',     // Cyan
  success: 'hsl(142 72% 50%)',     // Green
  warning: 'hsl(38 92% 50%)',      // Orange
  error: 'hsl(0 84% 60%)',         // Red
} as const;

// Depth Layers (layered UI system)
export const DEPTH = {
  background: 'z-0',
  surface: 'z-10',
  elevated: 'z-20',
  floating: 'z-30',
  dropdown: 'z-40',
  modal: 'z-50',
} as const;

// Animation & Motion Tokens
export const MOTION = {
  // Durations
  duration: {
    instant: '0ms',
    fast: '150ms',
    base: '300ms',
    slow: '500ms',
    slower: '800ms',
  },
  // Timing functions
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Spring-like
  },
  // Spring configurations
  spring: {
    stiffness: {
      low: 100,
      medium: 300,
      high: 500,
    },
    damping: {
      low: 10,
      medium: 15,
      high: 25,
    },
  },
} as const;

// Responsive Breakpoints
export const BREAKPOINTS = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// Border Radius (maintain consistency)
export const RADIUS = {
  xs: '0.25rem',     // 4px
  sm: '0.5rem',      // 8px
  md: '0.75rem',     // 12px
  lg: '1rem',        // 16px
  xl: '1.5rem',      // 24px
  full: '9999px',    // Pills
} as const;

// Tap Target Sizes (mobile-friendly)
export const TAP_TARGET = {
  small: '32px',
  default: '44px',
  large: '56px',
} as const;

// Safe Area Padding (for mobile notches)
export const SAFE_AREA = {
  top: 'env(safe-area-inset-top)',
  right: 'env(safe-area-inset-right)',
  bottom: 'env(safe-area-inset-bottom)',
  left: 'env(safe-area-inset-left)',
} as const;

// Visual Noise Reduction
export const VISUAL_RESTRAINT = {
  glows: 1,        // Single primary glow
  gradients: 1,    // One accent color gradient
  shadows: 2,      // Max 2 shadow styles
} as const;

export default {
  SPACING,
  GAPS,
  PADDING,
  TYPOGRAPHY,
  LINE_HEIGHT,
  LETTER_SPACING,
  GLASS,
  SHADOWS,
  COLORS,
  DEPTH,
  MOTION,
  BREAKPOINTS,
  RADIUS,
  TAP_TARGET,
  SAFE_AREA,
  VISUAL_RESTRAINT,
};
