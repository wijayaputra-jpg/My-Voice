import React, { useEffect, useState } from "react";
import { RotateCcw, Save, Sliders } from "lucide-react";
import { AcousticTuning, VoiceProfile } from "../types/voice";
import { WaveformPlayer } from "./WaveformPlayer";

interface AcousticTuningPanelProps {
  mainProfile: VoiceProfile | null;
  hasActiveTake: boolean;
  isRemastering: boolean;
  onUpdateProfile: (updated: VoiceProfile) => Promise<void>;
  onRemasterActiveTake: (tuning: AcousticTuning) => Promise<void>;
  onGoToEnroll: () => void;
}

export const AcousticTuningPanel: React.FC<AcousticTuningPanelProps> = ({
  mainProfile,
  hasActiveTake,
  isRemastering,
  onUpdateProfile,
  onRemasterActiveTake,
  onGoToEnroll,
}) => {
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [warmthDb, setWarmthDb] = useState(0);
  const [presenceDb, setPresenceDb] = useState(0.4);
  const [enableDspLock, setEnableDspLock] = useState(true);
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (mainProfile) {
      setPitchSemitones(mainProfile.tuning.pitchSemitones);
      setWarmthDb(mainProfile.tuning.warmthDb);
      setPresenceDb(mainProfile.tuning.presenceDb);
      setEnableDspLock(mainProfile.tuning.enableDspLock);
      setPersonaPrompt(mainProfile.personaPrompt);
    }
  }, [mainProfile]);

  if (!mainProfile) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <Sliders className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-slate-900">
          Enroll Your Voice First to Unlock Acoustic Calibration
        </h2>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
          Acoustic tuning aligns fundamental pitch (F0), chest warmth (225 Hz), and vocal presence
          (3.65 kHz) directly to your recorded voice profile.
        </p>
        <button
          type="button"
          onClick={onGoToEnroll}
          className="mt-5 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Capture My Voice Now
        </button>
      </div>
    );
  }

  const handleSaveCalibration = async () => {
    const nextTuning: AcousticTuning = {
      pitchSemitones,
      warmthDb,
      presenceDb,
      enableDspLock,
    };
    await onUpdateProfile({
      ...mainProfile,
      personaPrompt: personaPrompt.trim() || mainProfile.personaPrompt,
      tuning: nextTuning,
    });
    if (hasActiveTake) {
      await onRemasterActiveTake(nextTuning);
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const handleResetToMeasured = () => {
    const rawDelta = 12 * Math.log2(mainProfile.metrics.f0Hz / (mainProfile.anchorBaseHz || 148));
    const autoSemi =
      mainProfile.replicationMode === "replicated"
        ? 0
        : Math.round(Math.max(-2.2, Math.min(2.2, rawDelta)) * 10) / 10;
    setPitchSemitones(autoSemi);
    setWarmthDb(0.6);
    setPresenceDb(0.4);
    setEnableDspLock(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Acoustic Timbre & Harmonic Calibration
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Fine-tune how {mainProfile.name} matches your physical vocal tract resonance and
              fundamental frequency ({mainProfile.metrics.f0Hz} Hz).
            </p>
          </div>

          <button
            type="button"
            onClick={handleResetToMeasured}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Auto-Measured
          </button>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="pitch-trim-slider" className="font-medium text-slate-700">
                Pitch Trim (F0 Alignment)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {pitchSemitones > 0 ? `+${pitchSemitones.toFixed(1)}` : pitchSemitones.toFixed(1)}{" "}
                st
              </span>
            </div>
            <input
              id="pitch-trim-slider"
              type="range"
              min={-3.5}
              max={3.5}
              step={0.1}
              value={pitchSemitones}
              onChange={(e) => setPitchSemitones(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Shifts vocal pitch while keeping exact speech tempo unchanged.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="warmth-eq-slider" className="font-medium text-slate-700">
                Chest Warmth (225 Hz)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {warmthDb > 0 ? `+${warmthDb.toFixed(1)}` : warmthDb.toFixed(1)} dB
              </span>
            </div>
            <input
              id="warmth-eq-slider"
              type="range"
              min={-5}
              max={5}
              step={0.2}
              value={warmthDb}
              onChange={(e) => setWarmthDb(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Controls low-mid vocal body and close-mic fullness.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="presence-eq-slider" className="font-medium text-slate-700">
                Clarity & Presence (3.65 kHz)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {presenceDb > 0 ? `+${presenceDb.toFixed(1)}` : presenceDb.toFixed(1)} dB
              </span>
            </div>
            <input
              id="presence-eq-slider"
              type="range"
              min={-5}
              max={5}
              step={0.2}
              value={presenceDb}
              onChange={(e) => setPresenceDb(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1.5">
              Adjusts consonant articulation crispness and vocal air.
            </p>
          </div>
        </div>

        {/* Neural Persona Prompt */}
        <div className="pt-5 border-t border-slate-100">
          <label
            htmlFor="persona-blueprint-textarea"
            className="block text-xs font-medium text-slate-700 mb-2"
          >
            Extracted Vocal Persona Blueprint (Editable)
          </label>
          <textarea
            id="persona-blueprint-textarea"
            rows={3}
            value={personaPrompt}
            onChange={(e) => setPersonaPrompt(e.target.value)}
            className="w-full p-3.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 leading-relaxed focus:outline-none focus:bg-white focus:border-blue-600"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Automatically extracted from your voice sample to guide prosody, inflection, and breath
            character during synthesis.
          </p>
        </div>

        <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enableDspLock}
              onChange={(e) => setEnableDspLock(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span className="text-xs text-slate-700">
              Enable 24 kHz harmonic & EQ mastering lock on every generated take
            </span>
          </label>

          <div className="flex items-center gap-3">
            {savedNotice && (
              <span className="text-xs font-medium text-emerald-700">Calibration saved</span>
            )}
            <button
              type="button"
              onClick={handleSaveCalibration}
              disabled={isRemastering}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {isRemastering ? "Applying Calibration..." : "Save & Apply to Voice"}
            </button>
          </div>
        </div>
      </div>

      {/* Reference Voice Audition */}
      <WaveformPlayer
        wavBase64={mainProfile.referenceWavBase64}
        peaks={mainProfile.metrics.waveformPeaks}
        title={`Original Reference Recording — ${mainProfile.name}`}
        subtitle={`Measured F0 ${mainProfile.metrics.f0Hz} Hz · Spectral Centroid ${mainProfile.metrics.spectralCentroidHz} Hz · Natural ${mainProfile.metrics.measuredWpm} WPM`}
        downloadFilename="my-enrolled-voice-reference.wav"
      />
    </div>
  );
};
