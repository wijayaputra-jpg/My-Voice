export enum EmotionId {
  NATURAL = "natural",
  WARM = "warm",
  CONFIDENT = "confident",
  JOYFUL = "joyful",
  CALM = "calm",
  STORYTELLING = "storytelling",
  URGENT = "urgent",
  REFLECTIVE = "reflective",
}

export enum PauseStyle {
  TIGHT = "tight",
  NATURAL = "natural",
  SPACIOUS = "spacious",
  DRAMATIC = "dramatic",
}

export enum RhythmMode {
  STEADY = "steady",
  CONVERSATIONAL = "conversational",
  DYNAMIC = "dynamic",
}

export enum WorkspaceTab {
  STUDIO = "studio",
  VOICE_CLONE = "voice_clone",
  HISTORY = "history",
  TUNING = "tuning",
}

export interface EmotionPreset {
  id: EmotionId;
  label: string;
  shortDesc: string;
  stylePrompt: string;
  warmthBiasDb: number;
  presenceBiasDb: number;
  defaultPaceMultiplier: number;
}

export interface AcousticMetrics {
  f0Hz: number;
  f0MinHz: number;
  f0MaxHz: number;
  spectralCentroidHz: number;
  warmthRatio: number;
  measuredWpm: number;
  durationSec: number;
  waveformPeaks: number[];
}

export interface AcousticTuning {
  pitchSemitones: number;
  warmthDb: number;
  presenceDb: number;
  enableDspLock: boolean;
}

export interface VoiceProfile {
  id: string;
  name: string;
  isMain: boolean;
  createdAt: number;
  transcript: string;
  detectedLanguage: string;
  anchorVoice: string;
  anchorBaseHz: number;
  vocalSummary: string;
  personaPrompt: string;
  timbreTraits: string[];
  naturalPaceDescriptor: string;
  replicationMode: "replicated" | "prompted" | "persona_dsp";
  customVoiceRef: string | null;
  metrics: AcousticMetrics;
  tuning: AcousticTuning;
  referenceWavBase64: string;
}

export interface PacingSettings {
  speedMultiplier: number;
  pauseStyle: PauseStyle;
  pauseMs: number;
  rhythmMode: RhythmMode;
  lockExactTempoDsp: boolean;
}

export interface SynthesisTake {
  id: string;
  voiceProfileId: string;
  voiceProfileName: string;
  script: string;
  emotionId: EmotionId;
  emotionLabel: string;
  emotionIntensity: number;
  secondaryEmotionId: EmotionId | null;
  speedMultiplier: number;
  effectiveWpm: number;
  pauseStyle: PauseStyle;
  rhythmMode: RhythmMode;
  durationSec: number;
  createdAt: number;
  rawNeuralWavBase64: string;
  masteredWavBase64: string;
  waveformPeaks: number[];
}
