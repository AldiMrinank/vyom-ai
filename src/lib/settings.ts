const KEY = "vyom_settings";

export interface VyomSettings {
  model: string;
  systemPrompt: string;
  fontSize: "sm" | "md" | "lg" | "xl";
  autoClearDays: number; // 0 = never
  sendOnEnter: boolean;
  soundEnabled: boolean;
  compactMode: boolean;
}

const DEFAULTS: VyomSettings = {
  model: "google/gemini-2.0-flash-exp:free",
  systemPrompt:
    "You are Vyom AI, a helpful, friendly and intelligent AI assistant. Format responses with markdown when helpful — use **bold**, bullet lists, and code blocks. Be concise and clear.",
  fontSize: "md",
  autoClearDays: 0,
  sendOnEnter: true,
  soundEnabled: false,
  compactMode: false,
};

export const MODELS = [
  { id: "vyom-auto",                                label: "⚡ Smart Route",    desc: "Auto-picks best model for your task" },
  { id: "google/gemini-2.0-flash-exp:free",         label: "Gemini 2.0 Flash",  desc: "Fastest · Vision + text" },
  { id: "google/gemma-3-12b-it:free",               label: "Gemma 3",            desc: "Google · Fast & smart" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",   label: "Llama 3.3",          desc: "Meta · Strong at coding" },
  { id: "openrouter/auto",                           label: "Auto",               desc: "Picks a model for you (slower to start)" },
  { id: "deepseek/deepseek-r1:free",                label: "DeepSeek R1",        desc: "Reasoning · Deep thinking (slower)" },
  { id: "microsoft/phi-4-reasoning:free",           label: "Phi-4",              desc: "Microsoft · Reasoning (slower)" },
];

export const FONT_SIZES = [
  { id: "sm" as const, label: "Small",   cls: "text-xs"   },
  { id: "md" as const, label: "Normal",  cls: "text-sm"   },
  { id: "lg" as const, label: "Large",   cls: "text-base" },
  { id: "xl" as const, label: "X-Large", cls: "text-lg"   },
];

export function loadSettings(): VyomSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return DEFAULTS; }
}

export function saveSettings(s: Partial<VyomSettings>) {
  localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...s }));
}

export function applyFontSize(size: VyomSettings["fontSize"]) {
  const map = { sm: "13px", md: "15px", lg: "17px", xl: "19px" };
  document.documentElement.style.setProperty("--base-font-size", map[size]);
}
