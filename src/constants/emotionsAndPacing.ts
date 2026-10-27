import { EmotionId, EmotionPreset, PauseStyle, RhythmMode } from "../types/voice";

export const EMOTION_PRESETS: EmotionPreset[] = [
  {
    id: EmotionId.NATURAL,
    label: "Natural & Conversational",
    shortDesc: "Your authentic everyday speaking voice, relaxed breathing, unforced cadence",
    stylePrompt:
      "Speak in a completely natural, unforced, everyday conversational tone with relaxed breathing, genuine warmth, and organic micro-pauses, sounding like a real person talking directly to a friend across a quiet table.",
    warmthBiasDb: 0,
    presenceBiasDb: 0,
    defaultPaceMultiplier: 1.0,
  },
  {
    id: EmotionId.WARM,
    label: "Warm & Empathetic",
    shortDesc: "Gentle chest resonance, softened consonant attacks, reassuring presence",
    stylePrompt:
      "Speak with genuine warmth, kindness, and deep empathy; soften consonant attacks slightly, maintain rich chest resonance, and let phrases settle gently and reassuringly.",
    warmthBiasDb: 1.2,
    presenceBiasDb: -0.4,
    defaultPaceMultiplier: 0.94,
  },
  {
    id: EmotionId.CONFIDENT,
    label: "Confident & Authoritative",
    shortDesc: "Grounded vocal core, crisp diction, poised downward phrase endings",
    stylePrompt:
      "Speak with calm, grounded authority and executive poise; project steady vocal support, crisp consonant articulation, and decisive downward inflection at sentence endings.",
    warmthBiasDb: 0.8,
    presenceBiasDb: 1.0,
    defaultPaceMultiplier: 0.98,
  },
  {
    id: EmotionId.JOYFUL,
    label: "Joyful & Enthusiastic",
    shortDesc: "Brightened vocal lift, audible smile in the timbre, buoyant energy",
    stylePrompt:
      "Speak with infectious, genuine joy and bright enthusiasm; keep a natural smile in the vocal tract, lively upward pitch inflections, and uplifting energy without sounding forced.",
    warmthBiasDb: -0.3,
    presenceBiasDb: 1.4,
    defaultPaceMultiplier: 1.08,
  },
  {
    id: EmotionId.CALM,
    label: "Calm & Meditative",
    shortDesc: "Serene breathy onset, low vocal tension, unhurried tranquil flow",
    stylePrompt:
      "Speak in a deeply calm, serene, grounding tone with low vocal cord tension, soft airy breath onsets, and tranquil, unhurried transitions between phrases.",
    warmthBiasDb: 1.5,
    presenceBiasDb: -0.8,
    defaultPaceMultiplier: 0.84,
  },
  {
    id: EmotionId.STORYTELLING,
    label: "Storytelling & Expressive",
    shortDesc: "Nuanced dynamic contrast, vivid imagery, engaging narrative arc",
    stylePrompt:
      "Deliver as an captivating, intimate human storyteller; vary pitch contour and dynamic intensity naturally to paint vivid scenes and draw the listener into every sentence.",
    warmthBiasDb: 0.6,
    presenceBiasDb: 0.8,
    defaultPaceMultiplier: 0.95,
  },
  {
    id: EmotionId.URGENT,
    label: "Urgent & Focused",
    shortDesc: "Heightened forward momentum, tight articulation, alert intensity",
    stylePrompt:
      "Speak with focused urgency, alert energy, and crisp forward momentum; keep diction sharp and purposeful as if sharing time-critical information.",
    warmthBiasDb: -0.5,
    presenceBiasDb: 1.6,
    defaultPaceMultiplier: 1.16,
  },
  {
    id: EmotionId.REFLECTIVE,
    label: "Reflective & Intimate",
    shortDesc: "Close-mic intimacy, thoughtful micro-hesitations, quiet sincerity",
    stylePrompt:
      "Speak in a quiet, thoughtful, close-mic intimate tone with sincere introspection, subtle contemplative pauses, and gentle, understated inflection.",
    warmthBiasDb: 1.4,
    presenceBiasDb: 0.3,
    defaultPaceMultiplier: 0.88,
  },
];

export const PACING_SPEED_PRESETS = [
  { label: "Deliberate", multiplier: 0.80 },
  { label: "Measured", multiplier: 0.92 },
  { label: "My Natural Pace", multiplier: 1.00 },
  { label: "Brisk", multiplier: 1.12 },
  { label: "Rapid", multiplier: 1.26 },
] as const;

export const PAUSE_STYLE_OPTIONS: {
  id: PauseStyle;
  label: string;
  ms: number;
  desc: string;
}[] = [
  { id: PauseStyle.TIGHT, label: "Tight", ms: 160, desc: "Minimal clause gaps" },
  { id: PauseStyle.NATURAL, label: "Natural", ms: 350, desc: "Organic breath spacing" },
  { id: PauseStyle.SPACIOUS, label: "Spacious", ms: 650, desc: "Unhurried room to breathe" },
  { id: PauseStyle.DRAMATIC, label: "Dramatic", ms: 1000, desc: "Lingering narrative beats" },
];

export const RHYTHM_MODE_OPTIONS: {
  id: RhythmMode;
  label: string;
  desc: string;
}[] = [
  {
    id: RhythmMode.CONVERSATIONAL,
    label: "Conversational Flow",
    desc: "Natural human micro-variations in syllable length",
  },
  {
    id: RhythmMode.STEADY,
    label: "Steady & Even",
    desc: "Consistent, measured cadence ideal for instructional clarity",
  },
  {
    id: RhythmMode.DYNAMIC,
    label: "Dynamic Emphasis",
    desc: "Heightened stress on key words and expressive phrase contours",
  },
];

export const VOCAL_CUES = [
  { tag: "<breath>", label: "Natural Breath", hint: "Inserts an organic human inhale" },
  { tag: "<laugh>", label: "Light Laugh", hint: "Adds a warm chuckle or laugh" },
  { tag: "<gasp>", label: "Subtle Gasp", hint: "Quick intake of surprise" },
  { tag: "[pause 0.5s]", label: "0.5s Pause", hint: "Exact half-second beat" },
  { tag: "[pause 1.0s]", label: "1.0s Pause", hint: "Full 1-second reflective pause" },
] as const;

export const CALIBRATION_SCRIPTS = [
  {
    id: "consent_full",
    title: "Voice Ownership + Natural Range (Recommended)",
    durationHint: "12–18 sec",
    text: "I authorize Voxforma to create a personal voice model from my recording. Every voice carries its own rhythm, warmth, and quiet pauses. Whether I am sharing an exciting discovery or explaining a calm idea, this is how I naturally sound.",
  },
  {
    id: "conversational",
    title: "Everyday Conversational Cadence",
    durationHint: "10–15 sec",
    text: "Hey there, thanks for taking a moment to listen. When I talk naturally, I don't rush every syllable—I let the important thoughts land clearly, take a comfortable breath, and keep things relaxed and genuine.",
  },
  {
    id: "storytelling",
    title: "Expressive Dynamic Contrast",
    durationHint: "12–16 sec",
    text: "Just before sunrise, the studio was completely still. Then—almost all at once—morning light poured across the desk, and we knew we had built something truly remarkable together!",
  },
] as const;

export const SAMPLE_SCRIPTS = [
  {
    title: "Personal Podcast Intro",
    emotion: EmotionId.WARM,
    pace: 1.0,
    script:
      "Welcome back to the show. <breath> Today I want to share something deeply personal about how small, quiet habits shape our creative work. [pause 0.5s] Let's dive right in.",
  },
  {
    title: "Keynote Product Launch",
    emotion: EmotionId.CONFIDENT,
    pace: 0.96,
    script:
      "For years, creators had to choose between studio quality and creative speed. [pause 0.5s] Starting today, that trade-off is over. Everything you hear is shaped around real human expression.",
  },
  {
    title: "Evening Guided Reflection",
    emotion: EmotionId.CALM,
    pace: 0.84,
    script:
      "Take a slow, comfortable breath in. <breath> Let your shoulders drop away from your ears. [pause 1.0s] Whatever happened earlier today can wait until tomorrow.",
  },
  {
    title: "Upbeat Milestone Update",
    emotion: EmotionId.JOYFUL,
    pace: 1.08,
    script:
      "We actually hit our goal two weeks ahead of schedule! <laugh> Honestly, seeing everyone's messages roll in this morning made every late night worth it.",
  },
] as const;
