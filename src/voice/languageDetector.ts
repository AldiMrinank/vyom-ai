/**
 * languageDetector.ts
 * Lightweight heuristic language detection.
 * Detects English, Hindi, Telugu, Hinglish, Tenglish.
 * Returns a BCP-47 lang code and the recognition lang.
 */

export type VoiceLang = "auto" | "en-US" | "hi-IN" | "te-IN" | "hinglish" | "tenglish";

export interface LangProfile {
  id: VoiceLang;
  label: string;
  flag: string;
  bcp47: string;          // used for SpeechRecognition
  ttsLang: string;        // used for SpeechSynthesis
  systemNote: string;     // injected into system prompt
}

export const LANG_PROFILES: LangProfile[] = [
  {
    id: "auto",
    label: "Auto Detect",
    flag: "🌐",
    bcp47: "en-US",
    ttsLang: "en-US",
    systemNote: "Detect the user's language automatically. Reply in the SAME language or mixed style they use. If they write English → reply English. Hindi → reply Hindi. Telugu → reply Telugu. Mixed Hindi+English → reply Hinglish. Mixed Telugu+English → reply Tenglish. Never translate unless asked.",
  },
  {
    id: "en-US",
    label: "English",
    flag: "EN",
    bcp47: "en-US",
    ttsLang: "en-US",
    systemNote: "Respond only in English.",
  },
  {
    id: "hi-IN",
    label: "Hindi",
    flag: "HI",
    bcp47: "hi-IN",
    ttsLang: "hi-IN",
    systemNote: "Respond only in Hindi (Devanagari script).",
  },
  {
    id: "te-IN",
    label: "Telugu",
    flag: "TE",
    bcp47: "te-IN",
    ttsLang: "te-IN",
    systemNote: "Respond only in Telugu (Telugu script).",
  },
  {
    id: "hinglish",
    label: "Hinglish",
    flag: "HI",
    bcp47: "hi-IN",
    ttsLang: "hi-IN",
    systemNote: "Respond in Hinglish — a natural mix of Hindi and English as spoken by urban Indians. Use Hindi for emotion and English for technical terms. Write in Roman script.",
  },
  {
    id: "tenglish",
    label: "Tenglish",
    flag: "TE",
    bcp47: "te-IN",
    ttsLang: "te-IN",
    systemNote: "Respond in Tenglish — a natural mix of Telugu and English. Write in Roman script.",
  },
];

/** Simple heuristic detector. Returns best matched profile. */
export function detectLang(text: string): LangProfile {
  const TELUGU_RE = /[\u0C00-\u0C7F]/;
  const HINDI_RE  = /[\u0900-\u097F]/;

  if (TELUGU_RE.test(text)) return LANG_PROFILES.find(l => l.id === "te-IN")!;
  if (HINDI_RE.test(text))  return LANG_PROFILES.find(l => l.id === "hi-IN")!;

  // Check for mixed-language
  const englishWords = text.match(/\b[a-zA-Z]{2,}\b/g)?.length ?? 0;
  const totalWords   = text.split(/\s+/).length;
  if (englishWords > 0 && englishWords < totalWords * 0.8) {
    // Might be Hinglish — default to auto
    return LANG_PROFILES.find(l => l.id === "auto")!;
  }

  return LANG_PROFILES.find(l => l.id === "en-US")!;
}
