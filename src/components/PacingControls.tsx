import React from "react";
import { Sliders } from "lucide-react";
import {
  PACING_SPEED_PRESETS,
  PAUSE_STYLE_OPTIONS,
  RHYTHM_MODE_OPTIONS,
} from "../constants/emotionsAndPacing";
import { PacingSettings, PauseStyle, RhythmMode } from "../types/voice";

interface PacingControlsProps {
  pacing: PacingSettings;
  baselineWpm: number;
  hasActiveTake: boolean;
  isRemastering: boolean;
  onChangePacing: (next: PacingSettings) => void;
  onInstantRemasterPace?: () => void;
}

export const PacingControls: React.FC<PacingControlsProps> = ({
  pacing,
  baselineWpm,
  hasActiveTake,
  isRemastering,
  onChangePacing,
  onInstantRemasterPace,
}) => {
  const effectiveWpm = Math.round(baselineWpm * pacing.speedMultiplier);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Custom Speech Pacing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Anchored to your natural {baselineWpm} WPM cadence with pitch-preserving tempo control.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-900 font-semibold">
          {pacing.speedMultiplier.toFixed(2)}x · {effectiveWpm} WPM
        </div>
      </div>

      {/* Speed Multiplier Slider + Presets */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <label htmlFor="speech-speed-slider" className="text-xs font-medium text-slate-700">
            Speaking Rate Multiplier
          </label>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {PACING_SPEED_PRESETS.map((preset) => {
              const isSelected = Math.abs(pacing.speedMultiplier - preset.multiplier) < 0.02;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    onChangePacing({ ...pacing, speedMultiplier: preset.multiplier })
                  }
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <input
          id="speech-speed-slider"
          type="range"
          min={0.65}
          max={1.5}
          step={0.01}
          value={pacing.speedMultiplier}
          onChange={(e) =>
            onChangePacing({ ...pacing, speedMultiplier: Number(e.target.value) })
          }
          className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 mt-1">
          <span>0.65x ({Math.round(baselineWpm * 0.65)} WPM)</span>
          <span>1.00x ({baselineWpm} WPM)</span>
          <span>1.50x ({Math.round(baselineWpm * 1.5)} WPM)</span>
        </div>
      </div>

      {/* Sentence & Clause Pause Spacing */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between text-xs mb-2.5">
          <span className="font-medium text-slate-700">Clause & Sentence Breathing Room</span>
          <span className="font-mono tabular-nums text-slate-500">{pacing.pauseMs} ms beat</span>
        </div>
        <div
          role="radiogroup"
          aria-label="Sentence pause duration"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {PAUSE_STYLE_OPTIONS.map((opt) => {
            const active = pacing.pauseStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onChangePacing({
                    ...pacing,
                    pauseStyle: opt.id as PauseStyle,
                    pauseMs: opt.ms,
                  })
                }
                className={`p-2.5 text-left rounded-lg border transition-colors ${
                  active
                    ? "bg-blue-50/70 border-blue-600 text-slate-900"
                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>{opt.label}</span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-500">
                    {opt.ms}ms
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Syllabic Rhythm Mode */}
      <div className="pt-4 border-t border-slate-100">
        <span className="block text-xs font-medium text-slate-700 mb-2.5">
          Cadence & Prosodic Rhythm
        </span>
        <div
          role="radiogroup"
          aria-label="Prosodic rhythm mode"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {RHYTHM_MODE_OPTIONS.map((opt) => {
            const active = pacing.rhythmMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onChangePacing({ ...pacing, rhythmMode: opt.id as RhythmMode })
                }
                className={`p-3 text-left rounded-lg border transition-colors ${
                  active
                    ? "bg-blue-50/70 border-blue-600 text-slate-900"
                    : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="text-xs font-semibold">{opt.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Precision WSOLA Tempo Lock + Instant Re-pace */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={pacing.lockExactTempoDsp}
            onChange={(e) =>
              onChangePacing({ ...pacing, lockExactTempoDsp: e.target.checked })
            }
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-xs text-slate-700">
            Pitch-preserving WSOLA exact pace lock (zero pitch shift at fast or slow speeds)
          </span>
        </label>

        {hasActiveTake && onInstantRemasterPace && (
          <button
            type="button"
            onClick={onInstantRemasterPace}
            disabled={isRemastering}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Sliders className="w-3.5 h-3.5" />
            {isRemastering ? "Applying Pace..." : "Re-Pace Current Take Instantly"}
          </button>
        )}
      </div>
    </div>
  );
};
