/**
 * Smart model router — picks the best free model for a given prompt.
 *
 * Routing priority:
 *  1. Vision prompts → Gemini Flash (only model with image support)
 *  2. Code / math / reasoning → Llama 3.3 or DeepSeek R1
 *  3. Short factual / conversational → Gemini Flash (fastest)
 *  4. Default → Gemini Flash
 */

const GEMINI_FLASH = "google/gemini-2.0-flash-exp:free";
const LLAMA        = "meta-llama/llama-3.3-70b-instruct:free";
const DEEPSEEK     = "deepseek/deepseek-r1:free";
const GEMMA        = "google/gemma-3-12b-it:free";

const CODE_RE = /\b(code|function|class|debug|fix|error|bug|implement|algorithm|script|program|sql|api|regex|typescript|javascript|python|react|html|css|bash|shell)\b/i;
const MATH_RE = /\b(math|calculus|algebra|geometry|equation|proof|integral|derivative|statistics|probability|solve|calculate|formula)\b/i;
const REASON_RE = /\b(explain|analyze|compare|evaluate|pros and cons|think step|reason|logic|argument|philosophy|essay|research|summarize)\b/i;
const CREATIVE_RE = /\b(write|story|poem|creative|fiction|blog|script|lyrics|imagine|draft|narrative)\b/i;

export interface RouteResult {
  model: string;
  reason: string;
}

export function routePrompt(prompt: string, hasImage = false): RouteResult {
  if (hasImage) return { model: GEMINI_FLASH, reason: "vision" };

  const lower = prompt.toLowerCase();

  if (CODE_RE.test(lower)) {
    // DeepSeek R1 for hard algorithmic/debugging prompts; Llama for normal code
    const hard = /\b(algorithm|optimize|debug|complexity|implement|dynamic programming)\b/i.test(lower);
    return hard
      ? { model: DEEPSEEK, reason: "complex code/algo" }
      : { model: LLAMA, reason: "code" };
  }

  if (MATH_RE.test(lower)) return { model: DEEPSEEK, reason: "math/reasoning" };

  if (REASON_RE.test(lower) && lower.length > 120) {
    return { model: LLAMA, reason: "long reasoning" };
  }

  if (CREATIVE_RE.test(lower)) return { model: GEMMA, reason: "creative writing" };

  // Short conversational → fastest
  return { model: GEMINI_FLASH, reason: "default/fast" };
}
