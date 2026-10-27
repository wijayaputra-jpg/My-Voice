import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  History,
  Menu,
  Mic,
  Play,
  Sliders,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { AcousticTuningPanel } from "./components/AcousticTuningPanel";
import { EmotionSelector } from "./components/EmotionSelector";
import { PacingControls } from "./components/PacingControls";
import { TakeHistoryView } from "./components/TakeHistoryView";
import { VoiceCloneStudio } from "./components/VoiceCloneStudio";
import { WaveformPlayer } from "./components/WaveformPlayer";
import {
  EMOTION_PRESETS,
  SAMPLE_SCRIPTS,
  VOCAL_CUES,
} from "./constants/emotionsAndPacing";
import {
  AcousticTuning,
  EmotionId,
  PacingSettings,
  PauseStyle,
  RhythmMode,
  SynthesisTake,
  VoiceProfile,
  WorkspaceTab,
} from "./types/voice";
import { base64ToBlobUrl, masterVoiceAudio } from "./utils/audioEngine";
import {
  deleteSynthesisTake,
  deleteVoiceProfile,
  loadSynthesisTakes,
  loadVoiceProfiles,
  saveSynthesisTake,
  saveVoiceProfile,
} from "./utils/storage";

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(WorkspaceTab.STUDIO);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [takes, setTakes] = useState<SynthesisTake[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Studio synthesis state
  const [script, setScript] = useState<string>(SAMPLE_SCRIPTS[0].script);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionId>(EmotionId.NATURAL);
  const [emotionIntensity, setEmotionIntensity] = useState<number>(70);
  const [secondaryEmotion, setSecondaryEmotion] = useState<EmotionId | null>(null);
  const [autoSyncEmotionPace, setAutoSyncEmotionPace] = useState<boolean>(false);

  const [pacing, setPacing] = useState<PacingSettings>({
    speedMultiplier: 1.0,
    pauseStyle: PauseStyle.NATURAL,
    pauseMs: 350,
    rhythmMode: RhythmMode.CONVERSATIONAL,
    lockExactTempoDsp: true,
  });

  const [activeTake, setActiveTake] = useState<SynthesisTake | null>(null);
  const [synthesizedBaseSpeedRef, setSynthesizedBaseSpeedRef] = useState<number>(1.0);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [isRemastering, setIsRemastering] = useState<boolean>(false);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Sidebar reference voice preview
  const [isPlayingRefPreview, setIsPlayingRefPreview] = useState(false);
  const refAudioEl = useRef<HTMLAudioElement | null>(null);
  const refAudioUrl = useRef<string | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [loadedProfiles, loadedTakes] = await Promise.all([
        loadVoiceProfiles(),
        loadSynthesisTakes(),
      ]);
      if (!mounted) return;
      setProfiles(loadedProfiles);
      setTakes(loadedTakes);
      if (loadedTakes.length > 0) {
        setActiveTake(loadedTakes[0]);
        setSynthesizedBaseSpeedRef(loadedTakes[0].speedMultiplier || 1.0);
      }
      setIsInitialLoading(false);
    })();
    return () => {
      mounted = false;
      if (refAudioEl.current) refAudioEl.current.pause();
      if (refAudioUrl.current) URL.revokeObjectURL(refAudioUrl.current);
    };
  }, []);

  const mainProfile = useMemo<VoiceProfile | null>(() => {
    if (profiles.length === 0) return null;
    return profiles.find((p) => p.isMain) || profiles[0];
  }, [profiles]);

  const baselineWpm = mainProfile?.metrics.measuredWpm || 142;
  const effectiveWpm = Math.round(baselineWpm * pacing.speedMultiplier);

  const scriptWordCount = useMemo(() => {
    const cleaned = script
      .replace(/\[pause\s+[0-9.]+s?\]/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .trim();
    if (!cleaned) return 0;
    return cleaned.split(/\s+/).length;
  }, [script]);

  const estimatedDurationSec = useMemo(() => {
    if (scriptWordCount === 0) return 0;
    const explicitPauseMatches = [...script.matchAll(/\[pause\s+([0-9]*\.?[0-9]+)s?\]/gi)];
    const explicitPauseSec = explicitPauseMatches.reduce(
      (sum, m) => sum + (parseFloat(m[1]) || 0.5),
      0
    );
    const speechSec = (scriptWordCount / Math.max(60, effectiveWpm)) * 60;
    return Math.round((speechSec + explicitPauseSec) * 10) / 10;
  }, [script, scriptWordCount, effectiveWpm]);

  const handleSaveProfile = async (profile: VoiceProfile) => {
    await saveVoiceProfile(profile);
    const refreshed = await loadVoiceProfiles();
    setProfiles(refreshed);
  };

  const handleSelectMainProfile = async (profileId: string) => {
    const target = profiles.find((p) => p.id === profileId);
    if (!target) return;
    await saveVoiceProfile({ ...target, isMain: true });
    const refreshed = await loadVoiceProfiles();
    setProfiles(refreshed);
  };

  const handleDeleteProfile = async (profileId: string) => {
    await deleteVoiceProfile(profileId);
    let refreshed = await loadVoiceProfiles();
    if (refreshed.length > 0 && !refreshed.some((p) => p.isMain)) {
      await saveVoiceProfile({ ...refreshed[0], isMain: true });
      refreshed = await loadVoiceProfiles();
    }
    setProfiles(refreshed);
  };

  const handleDeleteTake = async (takeId: string) => {
    await deleteSynthesisTake(takeId);
    const refreshed = await loadSynthesisTakes();
    setTakes(refreshed);
    if (activeTake?.id === takeId) {
      setActiveTake(refreshed[0] || null);
    }
  };

  const handleInsertCueAtCursor = (cueTag: string) => {
    const el = scriptTextareaRef.current;
    if (!el) {
      setScript((prev) => `${prev.trimEnd()} ${cueTag} `);
      return;
    }
    const start = el.selectionStart ?? script.length;
    const end = el.selectionEnd ?? script.length;
    const before = script.slice(0, start);
    const after = script.slice(end);
    const padBefore = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const padAfter = after.length > 0 && !/^\s/.test(after) ? " " : " ";
    const inserted = `${padBefore}${cueTag}${padAfter}`;
    const nextScript = `${before}${inserted}${after}`;
    setScript(nextScript);

    requestAnimationFrame(() => {
      el.focus();
      const nextPos = before.length + inserted.length;
      el.setSelectionRange(nextPos, nextPos);
    });
  };

  const handleSelectEmotion = (id: EmotionId, suggestedPace: number) => {
    setSelectedEmotion(id);
    if (autoSyncEmotionPace) {
      setPacing((prev) => ({ ...prev, speedMultiplier: suggestedPace }));
    }
  };

  const handleToggleSidebarRefPlay = async () => {
    if (!mainProfile?.referenceWavBase64) return;
    if (isPlayingRefPreview && refAudioEl.current) {
      refAudioEl.current.pause();
      setIsPlayingRefPreview(false);
      return;
    }
    if (refAudioEl.current) refAudioEl.current.pause();
    if (refAudioUrl.current) URL.revokeObjectURL(refAudioUrl.current);

    const url = base64ToBlobUrl(mainProfile.referenceWavBase64, "audio/wav");
    refAudioUrl.current = url;
    const audio = new Audio(url);
    refAudioEl.current = audio;
    audio.onended = () => setIsPlayingRefPreview(false);
    await audio.play();
    setIsPlayingRefPreview(true);
  };

  const handleSynthesizeVoice = async () => {
    if (!script.trim()) {
      setStudioError("Please enter text in the script editor to generate speech.");
      return;
    }

    setStudioError(null);
    setIsSynthesizing(true);

    try {
      const primaryPreset =
        EMOTION_PRESETS.find((p) => p.id === selectedEmotion) || EMOTION_PRESETS[0];
      const secondaryPreset = secondaryEmotion
        ? EMOTION_PRESETS.find((p) => p.id === secondaryEmotion) || null
        : null;

      const response = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script,
          voiceProfile: mainProfile,
          emotion: {
            id: primaryPreset.id,
            label: primaryPreset.label,
            stylePrompt: primaryPreset.stylePrompt,
            intensity: emotionIntensity,
            secondaryToneLabel: secondaryPreset?.label,
            secondaryStylePrompt: secondaryPreset?.stylePrompt,
          },
          pacing: {
            speedMultiplier: pacing.speedMultiplier,
            targetWpm: effectiveWpm,
            pauseStyle: pacing.pauseStyle,
            pauseMs: pacing.pauseMs,
            rhythmMode: pacing.rhythmMode,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Voice synthesis failed.");
      }

      const tuning = mainProfile?.tuning || {
        pitchSemitones: 0,
        warmthDb: 0.4,
        presenceDb: 0.4,
        enableDspLock: true,
      };

      const emotionScale = emotionIntensity / 100;
      const totalWarmthDb = tuning.enableDspLock
        ? tuning.warmthDb + primaryPreset.warmthBiasDb * emotionScale * 0.6
        : 0;
      const totalPresenceDb = tuning.enableDspLock
        ? tuning.presenceDb + primaryPreset.presenceBiasDb * emotionScale * 0.6
        : 0;

      // Neural TTS already incorporates natural pacing; apply subtle residual WSOLA lock if extreme pace is requested
      const residualDspRatio = pacing.lockExactTempoDsp
        ? Math.max(0.72, Math.min(1.38, 1 + (pacing.speedMultiplier - 1) * 0.55))
        : 1.0;

      const mastered = await masterVoiceAudio({
        rawWavBase64: data.audioBase64,
        extraTempoRatio: residualDspRatio,
        pitchSemitones: tuning.enableDspLock ? tuning.pitchSemitones : 0,
        warmthDb: totalWarmthDb,
        presenceDb: totalPresenceDb,
      });

      const newTake: SynthesisTake = {
        id: `take_${Date.now()}`,
        voiceProfileId: mainProfile?.id || "default_baseline",
        voiceProfileName: mainProfile?.name || "Studio Baseline Voice",
        script: script.trim(),
        emotionId: primaryPreset.id,
        emotionLabel: primaryPreset.label,
        emotionIntensity,
        secondaryEmotionId: secondaryEmotion,
        speedMultiplier: pacing.speedMultiplier,
        effectiveWpm,
        pauseStyle: pacing.pauseStyle,
        rhythmMode: pacing.rhythmMode,
        durationSec: mastered.durationSec,
        createdAt: Date.now(),
        rawNeuralWavBase64: data.audioBase64,
        masteredWavBase64: mastered.masteredWavBase64,
        waveformPeaks: mastered.waveformPeaks,
      };

      await saveSynthesisTake(newTake);
      const updatedTakes = await loadSynthesisTakes();
      setTakes(updatedTakes);
      setActiveTake(newTake);
      setSynthesizedBaseSpeedRef(pacing.speedMultiplier);
    } catch (err: unknown) {
      setStudioError(
        err instanceof Error ? err.message : "An unexpected error occurred during synthesis."
      );
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleInstantRemasterPace = async () => {
    if (!activeTake) return;
    setIsRemastering(true);
    try {
      const primaryPreset =
        EMOTION_PRESETS.find((p) => p.id === activeTake.emotionId) || EMOTION_PRESETS[0];
      const tuning = mainProfile?.tuning || {
        pitchSemitones: 0,
        warmthDb: 0.4,
        presenceDb: 0.4,
        enableDspLock: true,
      };

      const relativeSpeedChange = pacing.speedMultiplier / (synthesizedBaseSpeedRef || 1.0);
      const baseResidual = 1 + ((synthesizedBaseSpeedRef || 1.0) - 1) * 0.55;
      const combinedTempo = Math.max(0.6, Math.min(1.75, baseResidual * relativeSpeedChange));

      const mastered = await masterVoiceAudio({
        rawWavBase64: activeTake.rawNeuralWavBase64,
        extraTempoRatio: combinedTempo,
        pitchSemitones: tuning.enableDspLock ? tuning.pitchSemitones : 0,
        warmthDb: tuning.enableDspLock ? tuning.warmthDb + primaryPreset.warmthBiasDb * 0.4 : 0,
        presenceDb: tuning.enableDspLock
          ? tuning.presenceDb + primaryPreset.presenceBiasDb * 0.4
          : 0,
      });

      const updatedTake: SynthesisTake = {
        ...activeTake,
        speedMultiplier: pacing.speedMultiplier,
        effectiveWpm,
        durationSec: mastered.durationSec,
        masteredWavBase64: mastered.masteredWavBase64,
        waveformPeaks: mastered.waveformPeaks,
      };

      await saveSynthesisTake(updatedTake);
      const refreshedTakes = await loadSynthesisTakes();
      setTakes(refreshedTakes);
      setActiveTake(updatedTake);
    } finally {
      setIsRemastering(false);
    }
  };

  const handleRemasterWithNewTuning = async (newTuning: AcousticTuning) => {
    if (!activeTake) return;
    setIsRemastering(true);
    try {
      const relativeSpeedChange = pacing.speedMultiplier / (synthesizedBaseSpeedRef || 1.0);
      const baseResidual = 1 + ((synthesizedBaseSpeedRef || 1.0) - 1) * 0.55;
      const combinedTempo = Math.max(0.6, Math.min(1.75, baseResidual * relativeSpeedChange));

      const mastered = await masterVoiceAudio({
        rawWavBase64: activeTake.rawNeuralWavBase64,
        extraTempoRatio: combinedTempo,
        pitchSemitones: newTuning.enableDspLock ? newTuning.pitchSemitones : 0,
        warmthDb: newTuning.enableDspLock ? newTuning.warmthDb : 0,
        presenceDb: newTuning.enableDspLock ? newTuning.presenceDb : 0,
      });

      const updatedTake: SynthesisTake = {
        ...activeTake,
        durationSec: mastered.durationSec,
        masteredWavBase64: mastered.masteredWavBase64,
        waveformPeaks: mastered.waveformPeaks,
      };

      await saveSynthesisTake(updatedTake);
      const refreshedTakes = await loadSynthesisTakes();
      setTakes(refreshedTakes);
      setActiveTake(updatedTake);
    } finally {
      setIsRemastering(false);
    }
  };

  const handleLoadTakeIntoStudio = (take: SynthesisTake) => {
    setScript(take.script);
    setSelectedEmotion(take.emotionId);
    setEmotionIntensity(take.emotionIntensity);
    setSecondaryEmotion(take.secondaryEmotionId);
    setPacing((prev) => ({
      ...prev,
      speedMultiplier: take.speedMultiplier,
      pauseStyle: take.pauseStyle,
      rhythmMode: take.rhythmMode,
    }));
    setActiveTake(take);
    setSynthesizedBaseSpeedRef(take.speedMultiplier || 1.0);
    setActiveTab(WorkspaceTab.STUDIO);
  };

  const navItems = [
    { id: WorkspaceTab.STUDIO, label: "Synthesis Studio", icon: AudioWaveform },
    { id: WorkspaceTab.VOICE_CLONE, label: "My Voice Clone", icon: Mic },
    { id: WorkspaceTab.HISTORY, label: "Generated Takes", icon: History },
    { id: WorkspaceTab.TUNING, label: "Acoustic Tuning", icon: Sliders },
  ];

  const activeBreadcrumbLabel =
    navItems.find((item) => item.id === activeTab)?.label || "Synthesis Studio";

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] text-[#0F172A]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}

      {/* Studio Sidebar (264px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div>
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
            <button
              type="button"
              onClick={() => {
                setActiveTab(WorkspaceTab.STUDIO);
                setMobileMenuOpen(false);
              }}
              className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
            >
              Voxforma
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav aria-label="Workspace navigation" className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === WorkspaceTab.HISTORY && takes.length > 0 && (
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        isActive ? "text-slate-300" : "text-slate-400"
                      }`}
                    >
                      {takes.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Active Main Voice Status Box */}
        <div className="p-4 border-t border-slate-200">
          {mainProfile ? (
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-blue-600">Main Studio Voice</div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {mainProfile.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSidebarRefPlay}
                  aria-label={
                    isPlayingRefPreview ? "Stop reference preview" : "Audition my original voice"
                  }
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-blue-600 transition-colors shrink-0"
                >
                  {isPlayingRefPreview ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </button>
              </div>

              <div className="text-xs font-mono tabular-nums text-slate-500">
                {mainProfile.metrics.f0Hz} Hz · {mainProfile.metrics.measuredWpm} WPM ·{" "}
                {mainProfile.detectedLanguage}
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveTab(WorkspaceTab.VOICE_CLONE);
                  setMobileMenuOpen(false);
                }}
                className="w-full py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
              >
                Manage / Re-Record Voice
              </button>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
              <div className="text-xs font-semibold text-slate-900">Your Voice Not Enrolled</div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Record or upload 10 seconds of speech to lock in your own voice as the main voice.
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTab(WorkspaceTab.VOICE_CLONE);
                  setMobileMenuOpen(false);
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Mic className="w-3.5 h-3.5" />
                Enroll My Voice
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="h-16 px-6 lg:px-8 bg-white border-b border-slate-200 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Voxforma</span>
              <span aria-hidden="true" className="text-slate-300 hidden sm:inline">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">{activeBreadcrumbLabel}</span>
              {mainProfile && (
                <>
                  <span aria-hidden="true" className="text-slate-300 hidden md:inline">
                    ·
                  </span>
                  <span className="text-xs text-slate-500 hidden md:inline truncate">
                    Main Voice: {mainProfile.name}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center shrink-0">
            {activeTab !== WorkspaceTab.VOICE_CLONE ? (
              <button
                type="button"
                onClick={() => setActiveTab(WorkspaceTab.VOICE_CLONE)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Mic className="w-3.5 h-3.5" />
                {mainProfile ? "Recalibrate My Voice" : "Enroll My Voice"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab(WorkspaceTab.STUDIO)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Open Synthesis Studio
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {isInitialLoading ? (
            <div className="space-y-4">
              <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
              <div className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : activeTab === WorkspaceTab.VOICE_CLONE ? (
            <VoiceCloneStudio
              profiles={profiles}
              mainProfile={mainProfile}
              onSaveProfile={handleSaveProfile}
              onSelectMainProfile={handleSelectMainProfile}
              onDeleteProfile={handleDeleteProfile}
              onCompleteRedirect={() => setActiveTab(WorkspaceTab.STUDIO)}
            />
          ) : activeTab === WorkspaceTab.HISTORY ? (
            <TakeHistoryView
              takes={takes}
              onLoadTakeIntoStudio={handleLoadTakeIntoStudio}
              onDeleteTake={handleDeleteTake}
              onGoToStudio={() => setActiveTab(WorkspaceTab.STUDIO)}
            />
          ) : activeTab === WorkspaceTab.TUNING ? (
            <AcousticTuningPanel
              mainProfile={mainProfile}
              hasActiveTake={Boolean(activeTake)}
              isRemastering={isRemastering}
              onUpdateProfile={handleSaveProfile}
              onRemasterActiveTake={handleRemasterWithNewTuning}
              onGoToEnroll={() => setActiveTab(WorkspaceTab.VOICE_CLONE)}
            />
          ) : (
            <div className="space-y-6">
              {/* Onboarding Banner when User hasn't recorded their Main Voice yet */}
              {!mainProfile && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-2xl">
                    <h1 className="text-base font-semibold text-slate-900">
                      Make Your Own Voice the Studio Main Voice
                    </h1>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Record a quick 10–15 second voice sample or upload an existing recording to
                      clone your vocal timbre, pitch (F0), and natural speaking pace. You can also
                      test emotional tones and speech pacing right below.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab(WorkspaceTab.VOICE_CLONE)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Mic className="w-4 h-4" />
                    Record or Upload My Voice
                  </button>
                </div>
              )}

              {/* 2-Column Synthesis Studio */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Left Column: Script Editor + Output Master Player */}
                <div className="xl:col-span-7 space-y-6">
                  <section className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">
                          Speech Script & Vocal Direction
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Active Voice:{" "}
                          <span className="font-medium text-slate-800">
                            {mainProfile ? mainProfile.name : "Default Studio Baseline"}
                          </span>{" "}
                          ·{" "}
                          <span className="font-mono tabular-nums">
                            {effectiveWpm} WPM target
                          </span>
                        </p>
                      </div>

                      {/* Quick Sample Scripts */}
                      <div className="flex items-center gap-1.5 overflow-x-auto">
                        {SAMPLE_SCRIPTS.map((sample) => (
                          <button
                            key={sample.title}
                            type="button"
                            onClick={() => {
                              setScript(sample.script);
                              setSelectedEmotion(sample.emotion);
                              setPacing((prev) => ({ ...prev, speedMultiplier: sample.pace }));
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            {sample.title.split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Natural Vocal Burst & Custom Pause Insertion Bar */}
                    <div className="flex flex-wrap items-center gap-1.5 py-3 border-b border-slate-100">
                      <span className="text-xs text-slate-500 mr-1 whitespace-nowrap">
                        Insert cue:
                      </span>
                      {VOCAL_CUES.map((cue) => (
                        <button
                          key={cue.tag}
                          type="button"
                          title={cue.hint}
                          onClick={() => handleInsertCueAtCursor(cue.tag)}
                          className="px-2.5 py-1 text-xs font-mono text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          {cue.label}
                        </button>
                      ))}
                    </div>

                    {/* Script Textarea */}
                    <div className="mt-4">
                      <label htmlFor="studio-script-editor" className="sr-only">
                        Speech synthesis script
                      </label>
                      <textarea
                        id="studio-script-editor"
                        ref={scriptTextareaRef}
                        rows={7}
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                        placeholder="Type or paste what you want your voice to say..."
                        className="w-full p-4 text-base bg-slate-50/60 border border-slate-200 rounded-xl text-slate-900 leading-relaxed focus:outline-none focus:bg-white focus:border-blue-600 resize-y"
                      />
                    </div>

                    {/* Editor Footer: Metrics + Primary Generate CTA */}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                        <span>{scriptWordCount} words</span>
                        <span aria-hidden="true">·</span>
                        <span>~{estimatedDurationSec.toFixed(1)}s est.</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {EMOTION_PRESETS.find((e) => e.id === selectedEmotion)?.label}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleSynthesizeVoice}
                        disabled={isSynthesizing || !script.trim()}
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        <Sparkles className="w-4 h-4" />
                        {isSynthesizing
                          ? "Generating Natural Speech..."
                          : mainProfile
                            ? `Generate with ${mainProfile.name}`
                            : "Generate Voice"}
                      </button>
                    </div>

                    {studioError && (
                      <p
                        role="alert"
                        className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
                      >
                        {studioError}
                      </p>
                    )}
                  </section>

                  {/* Master Waveform Output Section */}
                  {isSynthesizing ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">
                          Rendering 24 kHz Expressive Voice Master...
                        </span>
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          {pacing.speedMultiplier.toFixed(2)}x · {effectiveWpm} WPM
                        </span>
                      </div>
                      <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
                    </div>
                  ) : activeTake ? (
                    <WaveformPlayer
                      wavBase64={activeTake.masteredWavBase64}
                      peaks={activeTake.waveformPeaks}
                      title={`${activeTake.voiceProfileName} — ${activeTake.emotionLabel}`}
                      subtitle={`${activeTake.speedMultiplier.toFixed(2)}x Pace (${activeTake.effectiveWpm} WPM) · ${activeTake.emotionIntensity}% Emotion Depth · ${activeTake.durationSec.toFixed(1)}s`}
                      downloadFilename={`voxforma-${activeTake.emotionId}-${activeTake.speedMultiplier.toFixed(2)}x.wav`}
                      referenceWavBase64={mainProfile?.referenceWavBase64 || null}
                      referencePeaks={mainProfile?.metrics.waveformPeaks}
                    />
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                      <Volume2 className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-800">
                        Ready to synthesize your first voice take
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Choose an emotional tone and speech pace on the right, then click Generate.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Column: Emotional Tones + Custom Speech Pacing */}
                <div className="xl:col-span-5 space-y-6">
                  <EmotionSelector
                    selectedEmotion={selectedEmotion}
                    emotionIntensity={emotionIntensity}
                    secondaryEmotion={secondaryEmotion}
                    onSelectEmotion={handleSelectEmotion}
                    onChangeIntensity={setEmotionIntensity}
                    onChangeSecondaryEmotion={setSecondaryEmotion}
                  />

                  <div className="flex items-center justify-between px-1 -my-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoSyncEmotionPace}
                        onChange={(e) => setAutoSyncEmotionPace(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                      />
                      <span className="text-xs text-slate-500">
                        Auto-adopt suggested pace when switching emotion
                      </span>
                    </label>
                  </div>

                  <PacingControls
                    pacing={pacing}
                    baselineWpm={baselineWpm}
                    hasActiveTake={Boolean(activeTake)}
                    isRemastering={isRemastering}
                    onChangePacing={setPacing}
                    onInstantRemasterPace={handleInstantRemasterPace}
                  />
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
