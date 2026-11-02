// Shared (client + server) definitions of writing styles and editing controls.

export const WRITING_STYLES = [
  { id: "natural", label: "Natural & Conversational", hint: "Relaxed, clear, sounds like a thoughtful person talking." },
  { id: "academic", label: "Academic & Professional", hint: "Precise, evidence-focused, measured claims." },
  { id: "simple", label: "Simple English", hint: "Short sentences and everyday words." },
  { id: "formal", label: "Formal Writing", hint: "Polished and respectful, no contractions or slang." },
  { id: "friendly", label: "Friendly & Engaging", hint: "Warm and lively without hype." },
  { id: "business", label: "Professional Business", hint: "Direct, action-oriented, concise." },
  { id: "student", label: "Student-Friendly", hint: "Clear explanations a student would write and understand." },
];

export const CONTROL_OPTIONS = {
  tone: ["neutral", "warm", "confident", "persuasive", "empathetic", "objective"],
  formality: ["casual", "balanced", "formal"],
  complexity: ["simple", "moderate", "complex"],
  vocabulary: ["basic", "standard", "advanced"],
  paragraphLength: ["keep", "short", "medium", "long"],
  length: ["maintain", "shorten", "expand"],
  englishLevel: ["beginner", "intermediate", "advanced"],
};

export const DEFAULT_CONTROLS = {
  style: "natural",
  tone: "neutral",
  formality: "balanced",
  complexity: "moderate",
  vocabulary: "standard",
  paragraphLength: "keep",
  length: "maintain",
  englishLevel: "intermediate",
  customInstructions: "",
};

export const CUSTOM_INSTRUCTIONS_MAX = 600;

/** Validates options, falling back to defaults for anything unknown. */
export function sanitizeControls(input = {}) {
  const out = { ...DEFAULT_CONTROLS };
  if (WRITING_STYLES.some((s) => s.id === input.style)) out.style = input.style;
  for (const [key, allowed] of Object.entries(CONTROL_OPTIONS)) {
    if (allowed.includes(input[key])) out[key] = input[key];
  }
  if (typeof input.customInstructions === "string") {
    out.customInstructions = input.customInstructions.slice(0, CUSTOM_INSTRUCTIONS_MAX).trim();
  }
  return out;
}
