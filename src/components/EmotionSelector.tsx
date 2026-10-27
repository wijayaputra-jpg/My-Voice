import React from "react";
import { EMOTION_PRESETS } from "../constants/emotionsAndPacing";
import { EmotionId } from "../types/voice";

interface EmotionSelectorProps {
  selectedEmotion: EmotionId;
  emotionIntensity: number;
  secondaryEmotion: EmotionId | null;
  onSelectEmotion: (id: EmotionId, suggestedPace: number) => void;
  onChangeIntensity: (intensity: number) => void;
  onChangeSecondaryEmotion: (id: EmotionId | null) => void;
}

export const EmotionSelector: React.FC<EmotionSelectorProps> = ({
  selectedEmotion,
  emotionIntensity,
  secondaryEmotion,
  onSelectEmotion,
  onChangeIntensity,
  onChangeSecondaryEmotion,
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Emotional Tone</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Shapes vocal inflection, breath onset, and harmonic warmth while preserving your main
            voice identity.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          Intensity {emotionIntensity}%
        </span>
      </div>

      <div
        role="radiogroup"
        aria-label="Emotional tone presets"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      >
        {EMOTION_PRESETS.map((preset) => {
          const active = selectedEmotion === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelectEmotion(preset.id, preset.defaultPaceMultiplier)}
              className={`text-left p-3.5 rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 ${
                active
                  ? "bg-blue-50/70 border-blue-600 text-slate-900"
                  : "bg-white border-slate-200 hover:border-slate-300 text-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{preset.label}</span>
                <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                  {preset.defaultPaceMultiplier.toFixed(2)}x
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                {preset.shortDesc}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5 pt-5 border-t border-slate-100">
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <label htmlFor="emotion-intensity-slider" className="font-medium text-slate-700">
              Emotional Expression Depth
            </label>
            <span className="font-mono tabular-nums text-slate-900 font-medium">
              {emotionIntensity}% ·{" "}
              {emotionIntensity <= 35
                ? "Subtle"
                : emotionIntensity <= 75
                  ? "Natural"
                  : "Expressive"}
            </span>
          </div>
          <input
            id="emotion-intensity-slider"
            type="range"
            min={20}
            max={100}
            step={5}
            value={emotionIntensity}
            onChange={(e) => onChangeIntensity(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>Understated</span>
            <span>Balanced</span>
            <span>Vivid</span>
          </div>
        </div>

        <div>
          <label
            htmlFor="secondary-undertone-select"
            className="block text-xs font-medium text-slate-700 mb-2"
          >
            Subtle Undertone Blend (Optional)
          </label>
          <select
            id="secondary-undertone-select"
            value={secondaryEmotion || ""}
            onChange={(e) =>
              onChangeSecondaryEmotion(e.target.value ? (e.target.value as EmotionId) : null)
            }
            className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-blue-600"
          >
            <option value="">None — Pure Primary Tone</option>
            {EMOTION_PRESETS.filter((p) => p.id !== selectedEmotion).map((p) => (
              <option key={p.id} value={p.id}>
                Blend with {p.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            Layers a secondary emotional nuance into vocal phrasing.
          </p>
        </div>
      </div>
    </div>
  );
};
