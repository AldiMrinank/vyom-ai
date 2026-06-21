/**
 * Model Router — automatically picks the best model for a given prompt
 * based on content signals, without requiring the user to manually switch.
 * The user's manually selected model always overrides this.
 */

const ROUTER_TABLE: Array<{
  test: (prompt: string) => boolean;
  model: string;
  reason: string;
}> = [
  {
    // Coding tasks → Llama 3.3 is strong at code generation
    test: p => /```|\bcode\b|\bfunction\b|\bclass\b|\bdebug\b|\bfix.*(bug|error)\b|\bimport\b|\bconst\b|\bdef\b|\bpublic\b/i.test(p),
    model: "meta-llama/llama-3.3-70b-instruct:free",
    reason: "Code task",
  },
  {
    // Reasoning / math / logic → DeepSeek R1 thinks step by step
    test: p => /\bmath\b|\bsolve\b|\bequation\b|\bprove\b|\bstep.?by.?step\b|\breason\b|\blogic\b|\bcalcul/i.test(p),
    model: "deepseek/deepseek-r1:free",
    reason: "Reasoning task",
  },
  {
    // Image understanding — Gemini Flash supports vision
    test: p => /\bimage\b|\bphoto\b|\bpicture\b|\bscreenshot\b|\bwhat.*(see|show|this)\b/i.test(p),
    model: "google/gemini-2.0-flash-exp:free",
    reason: "Vision task",
  },
];

const DEFAULT_MODEL = "google/gemini-2.0-flash-exp:free";

export interface RoutingDecision {
  model: string;
  reason: string;
  wasRouted: boolean;
}

/**
 * Returns the best model for a given prompt.
 * If the user has set a specific (non-auto) model, that is respected and
 * this function is bypassed entirely in chat.ts.
 */
export function routePrompt(prompt: string): RoutingDecision {
  for (const rule of ROUTER_TABLE) {
    if (rule.test(prompt)) {
      return { model: rule.model, reason: rule.reason, wasRouted: true };
    }
  }
  return { model: DEFAULT_MODEL, reason: "Default", wasRouted: false };
}
